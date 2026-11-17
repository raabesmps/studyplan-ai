// A tiny fake of the Gemini and Claude streaming APIs, for end-to-end tests. No network, no quota, no key.
//
// The scenario is chosen by the learner's subject: "SCENARIO:<name> ...". Supported scenarios:
//   ok               stream every day, one every 450 ms (default)
//   slow             like ok, but one day every 1.2 s (to cancel in the middle)
//   fallback         (Gemini) the primary model fails mid-stream, the fallback model answers
//   invalid-then-ok  the first answer is not valid JSON, the retry is fine
//   429              (Gemini) both models are over quota
//   500both          (Gemini) both models answer 500
//   midstream        (Gemini) both models fail in the middle of the stream
//   claude-529       (Claude) overloaded; Gemini answers normally
//   claude-429       (Claude) rate limited with Retry-After; Gemini answers normally
//   claude-credit    (Claude) "credit balance is too low" (HTTP 400); Gemini answers normally
//   claude-401       (Claude) invalid key; Gemini answers normally
//   claude-midstream (Claude) fails in the middle of the stream; Gemini answers normally
//   bothdown         Claude answers 529 and both Gemini models answer 500
//
// Claude is served at POST /v1/messages and Gemini at POST /<anything>/models/<model>:streamGenerateContent.
// Inspect or reset what the app sent with GET /__log and POST /__reset.
import http from 'node:http';

const PORT = Number(process.argv[2] ?? 4010);
const log = [];
const callsBySubject = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sse = (res, payload) => res.write(`data: ${JSON.stringify(payload)}\r\n\r\n`);
const chunk = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });

function buildPlan(days, subject) {
  return {
    subject,
    level: 'intermediate',
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      title: `Dia ${i + 1}: tema de estudo ${i + 1}`,
      objective: `Objetivo do dia ${i + 1}.`,
      topics: ['Tópico A', 'Tópico B'],
      exercises: ['Exercício um', 'Exercício dois'],
      resources: [{ title: 'Guia de estudo', query: 'busca de exemplo' }],
      minutes: 90,
    })),
  };
}

/** The JSON split into a header and one piece per day, so the app can see progress as days start. */
function pieces(plan) {
  const head = `{"subject":${JSON.stringify(plan.subject)},"level":"${plan.level}","days":[`;
  return [head, ...plan.days.map((day, i) => (i ? ',' : '') + JSON.stringify(day)), ']}'];
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

const claudeEvent = (res, name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

async function handleClaude(req, res) {
  const body = JSON.parse(await readBody(req));
  const prompt = body.messages[0].content;
  const subject = /<subject>([^<]*)<\/subject>/.exec(prompt)?.[1] ?? '';
  const days = Number(/exactly (\d+) days/.exec(prompt)?.[1] ?? 3);
  const scenario = /^SCENARIO:(\S+)/.exec(subject)?.[1] ?? 'ok';
  const isRetry = prompt.includes('previous answer was rejected');
  const entry = {
    provider: 'claude',
    subject,
    model: body.model,
    scenario,
    days,
    isRetry,
    // How the app authenticated and what it asked for, so tests can assert on it.
    authorized: Boolean(req.headers.authorization || req.headers['x-api-key']),
    effort: body.output_config?.effort ?? null,
    structured: body.output_config?.format?.type ?? null,
    closedEarly: false,
  };
  log.push(entry);

  let finished = false;
  res.on('close', () => {
    if (!finished) entry.closedEarly = true; // the app aborted the upstream call
  });
  const fail = (status, type, message, headers = {}) => {
    finished = true;
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify({ type: 'error', error: { type, message } }));
  };

  if (scenario === 'claude-529' || scenario === 'bothdown') return fail(529, 'overloaded_error', 'Overloaded');
  if (scenario === 'claude-429') return fail(429, 'rate_limit_error', 'Rate limited', { 'retry-after': '30' });
  if (scenario === 'claude-401') return fail(401, 'authentication_error', 'invalid x-api-key');
  if (scenario === 'claude-credit') {
    return fail(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.');
  }

  const plan = buildPlan(days, subject);
  const parts = pieces(plan);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  claudeEvent(res, 'message_start', {
    type: 'message_start',
    message: {
      id: 'msg_fake', type: 'message', role: 'assistant', content: [], model: body.model,
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 },
    },
  });
  claudeEvent(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  const text = (value) => claudeEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: value } });

  if (scenario === 'invalid-then-ok' && !isRetry) {
    text(parts[0] + parts[1]);
    await sleep(150);
    text('{"broken": ');
  } else if (scenario === 'claude-midstream') {
    text(parts[0] + parts[1]);
    await sleep(200);
    claudeEvent(res, 'error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    finished = true;
    return res.end();
  } else {
    const delay = scenario === 'slow' ? 1200 : 450;
    await sleep(250);
    text(parts[0] + parts[1]);
    for (let i = 2; i < parts.length; i++) {
      await sleep(delay);
      if (res.destroyed) return;
      text(parts[i]);
    }
  }
  claudeEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
  claudeEvent(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 50 } });
  claudeEvent(res, 'message_stop', { type: 'message_stop' });
  finished = true;
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/__log') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(log));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/__reset') {
    log.length = 0;
    callsBySubject.clear();
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/messages') {
    await handleClaude(req, res);
    return;
  }

  const route = /\/models\/([^:]+):streamGenerateContent/.exec(url.pathname);
  if (req.method !== 'POST' || !route) {
    res.writeHead(404).end();
    return;
  }

  const model = decodeURIComponent(route[1]);
  const body = JSON.parse(await readBody(req));
  const prompt = body.contents[0].parts[0].text;
  // The instructions mention "<subject>" literally, so only accept a pair with no '<' inside.
  const subject = /<subject>([^<]*)<\/subject>/.exec(prompt)?.[1] ?? '';
  const days = Number(/exactly (\d+) days/.exec(prompt)?.[1] ?? 3);
  const scenario = /^SCENARIO:(\S+)/.exec(subject)?.[1] ?? 'ok';
  const isRetry = prompt.includes('previous answer was rejected');
  const entry = {
    provider: 'gemini',
    subject,
    model,
    scenario,
    days,
    isRetry,
    keyInHeader: Boolean(req.headers['x-goog-api-key']),
    keyInUrl: url.search.includes('key='),
    thinking: body.generationConfig?.thinkingConfig ?? null,
    closedEarly: false,
  };
  log.push(entry);
  callsBySubject.set(subject, (callsBySubject.get(subject) ?? 0) + 1);

  let finished = false;
  res.on('close', () => {
    if (!finished) entry.closedEarly = true; // the app aborted the upstream call
  });

  const isPrimary = model === 'gemini-3-flash-preview';
  const plan = buildPlan(days, subject);
  const parts = pieces(plan);
  const finish = () => {
    finished = true;
    res.end();
  };

  if (scenario === '429') {
    finished = true;
    res.writeHead(429, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 429, message: 'quota' } }));
    return;
  }
  if (scenario === '500both' || scenario === 'bothdown') {
    finished = true;
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 500, message: 'boom' } }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream' });

  if (scenario === 'invalid-then-ok' && !isRetry) {
    sse(res, chunk(parts[0] + parts[1]));
    await sleep(150);
    sse(res, chunk('{"broken": '));
    return finish();
  }
  if ((scenario === 'fallback' && isPrimary) || scenario === 'midstream') {
    sse(res, chunk(parts[0] + parts[1]));
    await sleep(200);
    sse(res, { error: { code: 503, message: 'This model is currently experiencing high demand.' } });
    return finish();
  }

  const delay = scenario === 'slow' ? 1200 : 450;
  const first = parts[0] + parts[1];
  const middle = Math.floor(first.length / 2); // split mid-JSON to exercise chunk reassembly
  await sleep(250);
  sse(res, chunk(first.slice(0, middle)));
  await sleep(40);
  sse(res, chunk(first.slice(middle)));
  for (let i = 2; i < parts.length; i++) {
    await sleep(delay);
    if (res.destroyed) return;
    sse(res, chunk(parts[i]));
  }
  finish();
});

server.listen(PORT, () => console.log(`fake gemini listening on ${PORT}`));
