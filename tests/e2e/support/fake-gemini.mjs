// A tiny fake of Gemini's streaming API, for end-to-end tests. No network, no quota, no key.
//
// The scenario is chosen by the learner's subject: "SCENARIO:<name> ...". Supported scenarios:
//   ok               stream every day, one every 450 ms (default)
//   slow             like ok, but one day every 1.2 s (to cancel in the middle)
//   fallback         the primary model fails mid-stream, the fallback model answers
//   invalid-then-ok  the first answer is not valid JSON, the retry is fine
//   429              both models are over quota
//   500both          both models answer 500
//   midstream        both models fail in the middle of the stream
//
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
  if (scenario === '500both') {
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
