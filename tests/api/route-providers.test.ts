import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate-plan/route';
import { readEvents, type StreamEvent } from '@/lib/stream';
import { claudeError, claudeStream, makePlan, planChunks, sseBody } from '../fixtures';

const CLAUDE_KEY = 'sk-ant-test-claude-key-123';
const GEMINI_KEY = 'test-gemini-key-456';
const valid = { subject: 'SQL joins', hoursPerDay: 2, days: 3, level: 'intermediate', language: 'pt' };

type Answer = Response | ((init?: RequestInit) => Response | Promise<Response>);
const queues: { claude: Answer[]; gemini: Answer[] } = { claude: [], gemini: [] };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('AI_PROVIDER', '');
  vi.stubEnv('ANTHROPIC_API_KEY', CLAUDE_KEY);
  vi.stubEnv('ANTHROPIC_MODEL', '');
  vi.stubEnv('ANTHROPIC_EFFORT', '');
  vi.stubEnv('ANTHROPIC_BASE_URL', '');
  vi.stubEnv('GEMINI_API_KEY', GEMINI_KEY);
  vi.stubEnv('GEMINI_MODEL', '');
  vi.stubEnv('GEMINI_FALLBACK_MODEL', '');
  vi.stubEnv('GEMINI_API_BASE_URL', '');
  queues.claude = [];
  queues.gemini = [];
  fetchMock.mockReset();
  // Routes each call to the right provider's queue, and fails loudly on an unexpected extra call.
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    // Works for the default URLs and for overridden base URLs alike.
    const provider = url.includes(':streamGenerateContent') ? 'gemini' : url.endsWith('/v1/messages') ? 'claude' : null;
    if (!provider) throw new Error(`Unexpected URL ${url}`);
    const next = queues[provider].shift();
    if (!next) throw new Error(`Unexpected extra ${provider} call`);
    return typeof next === 'function' ? next(init) : next;
  });
  vi.stubGlobal('fetch', fetchMock);
});

// --- helpers -------------------------------------------------------------------------------

const request = (body: unknown, signal?: AbortSignal) =>
  new NextRequest('http://localhost/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

async function generate(body: unknown = valid) {
  const response = await POST(request(body));
  const events: StreamEvent[] = [];
  if (response.headers.get('content-type')?.includes('ndjson')) {
    for await (const event of readEvents(response.body!)) events.push(event);
  }
  return { response, events };
}

const claudeOk = () => claudeStream(planChunks(makePlan(3)));
const geminiOk = () => new Response(sseBody(planChunks(makePlan(3))), { status: 200 });
const geminiStatus = (status: number) =>
  new Response(JSON.stringify({ error: { code: status, message: 'gemini says no' } }), { status });

const callsTo = (provider: 'claude' | 'gemini') =>
  fetchMock.mock.calls.filter(([url]) =>
    provider === 'claude' ? String(url).endsWith('/v1/messages') : String(url).includes(':streamGenerateContent')
  );
const types = (events: StreamEvent[]) => events.map((e) => e.type);
const planOf = (events: StreamEvent[]) => events.find((e) => e.type === 'plan');
const errorOf = (events: StreamEvent[]) => events.find((e) => e.type === 'error') as Extract<StreamEvent, { type: 'error' }> | undefined;
const switchOf = (events: StreamEvent[]) => events.find((e) => e.type === 'switch');
const claudeBody = () => JSON.parse(String(callsTo('claude')[0][1]!.body));
const headerOf = (call: Parameters<typeof fetch>, name: string) => new Headers(call[1]!.headers).get(name);

// --- Claude as the primary provider ------------------------------------------------------

describe('Claude is the default provider', () => {
  it('streams progress per day and the validated plan, without touching Gemini', async () => {
    queues.claude.push(claudeOk());
    const { response, events } = await generate();

    expect(response.status).toBe(200);
    expect(events.filter((e) => e.type === 'progress')).toEqual([
      { type: 'progress', day: 1, total: 3 },
      { type: 'progress', day: 2, total: 3 },
      { type: 'progress', day: 3, total: 3 },
    ]);
    expect(planOf(events)).toBeDefined();
    expect(switchOf(events)).toBeUndefined();
    expect(callsTo('claude')).toHaveLength(1);
    expect(callsTo('gemini')).toHaveLength(0);
  });

  it('calls the Claude API with a cheap model, low effort and structured output', async () => {
    queues.claude.push(claudeOk());
    await generate();

    const call = callsTo('claude')[0];
    expect(String(call[0])).toBe('https://api.anthropic.com/v1/messages');
    expect(call[1]!.method).toBe('POST');
    const body = claudeBody();
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('<subject>SQL joins</subject>');
  });

  it('derives the output schema from the Zod schema, so they cannot drift', async () => {
    queues.claude.push(claudeOk());
    await generate();
    const schema = JSON.stringify(claudeBody().output_config.format.schema);
    for (const key of ['subject', 'level', 'days', 'day', 'title', 'objective', 'topics', 'exercises', 'resources', 'minutes', 'query']) {
      expect(schema).toContain(`"${key}"`);
    }
    for (const level of ['beginner', 'intermediate', 'advanced']) expect(schema).toContain(`"${level}"`);
    expect(schema).toContain('"additionalProperties":false');
  });

  it('sends the key only in the Authorization header, never in the URL, the body or the events', async () => {
    queues.claude.push(claudeOk());
    const { events } = await generate();
    const call = callsTo('claude')[0];
    expect(headerOf(call, 'authorization')).toBe(`Bearer ${CLAUDE_KEY}`);
    expect(String(call[0])).not.toContain(CLAUDE_KEY);
    expect(String(call[1]!.body)).not.toContain(CLAUDE_KEY);
    expect(JSON.stringify(events)).not.toContain(CLAUDE_KEY);
  });

  it('honors model, effort and base URL overrides', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-sonnet-5-5');
    vi.stubEnv('ANTHROPIC_EFFORT', 'medium');
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://localhost:4010');
    queues.claude.push(claudeOk());
    await generate();
    expect(String(callsTo('claude')[0][0])).toBe('http://localhost:4010/v1/messages');
    expect(claudeBody()).toMatchObject({ model: 'claude-sonnet-5-5', output_config: { effort: 'medium' } });
  });

  it('does not trust the model to echo the learner inputs', async () => {
    queues.claude.push(claudeStream(planChunks({ ...makePlan(3), subject: 'Other', level: 'advanced' })));
    const { events } = await generate();
    expect((planOf(events) as { plan: { subject: string; level: string } }).plan).toMatchObject({
      subject: 'SQL joins',
      level: 'intermediate',
    });
  });

  it('makes a single request per attempt: the SDK own retries are off (failover decides)', async () => {
    queues.claude.push(claudeError(529, 'overloaded_error', 'Overloaded'));
    queues.gemini.push(geminiOk());
    await generate();
    expect(callsTo('claude')).toHaveLength(1);
  });
});

// --- invalid answers stay with the same provider first -------------------------------------

describe('invalid answers', () => {
  it('retries once on Claude with the validation error, without switching provider', async () => {
    queues.claude.push(claudeStream(['{"broken": ']), claudeOk());
    const { events } = await generate();

    expect(types(events)).toContain('retry');
    expect(switchOf(events)).toBeUndefined();
    expect(planOf(events)).toBeDefined();
    expect(callsTo('claude')).toHaveLength(2);
    expect(callsTo('gemini')).toHaveLength(0);
    const retryPrompt: string = JSON.parse(String(callsTo('claude')[1][1]!.body)).messages[0].content;
    expect(retryPrompt).toContain('previous answer was rejected');
  });

  it('switches to Gemini when Claude is invalid twice', async () => {
    queues.claude.push(claudeStream(['{"a": 1}']), claudeStream(['{"b": 2}']));
    queues.gemini.push(geminiOk());
    const { events } = await generate();

    expect(types(events).filter((t) => t === 'retry')).toHaveLength(1);
    expect(switchOf(events)).toEqual({ type: 'switch', from: 'claude', to: 'gemini' });
    expect(planOf(events)).toBeDefined();
    expect(callsTo('claude')).toHaveLength(2);
    expect(callsTo('gemini')).toHaveLength(1);
  });
});

// --- failover ------------------------------------------------------------------------------

describe('failover from Claude to Gemini', () => {
  const failures: [string, () => Answer][] = [
    ['429 rate limited', () => claudeError(429, 'rate_limit_error', 'Rate limited', { 'retry-after': '30' })],
    ['500 server error', () => claudeError(500, 'api_error', 'Internal error')],
    ['529 overloaded', () => claudeError(529, 'overloaded_error', 'Overloaded')],
    ['401 invalid key', () => claudeError(401, 'authentication_error', 'invalid x-api-key')],
    ['403 permission denied', () => claudeError(403, 'permission_error', 'not allowed')],
    ['402 billing error', () => claudeError(402, 'billing_error', 'Billing problem')],
    [
      '400 credit balance too low',
      () => claudeError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
    ],
    ['network failure', () => () => Promise.reject(new TypeError('fetch failed'))],
    ['timeout', () => () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    [
      'error in the middle of the stream',
      () => claudeStream(planChunks(makePlan(3)).slice(0, 2), { errorAfter: { type: 'overloaded_error', message: 'Overloaded' } }),
    ],
    ['an empty answer', () => claudeStream([])],
    ['a refusal', () => claudeStream(['{}'], { stopReason: 'refusal' })],
  ];

  it.each(failures)('switches to Gemini on %s, and tells the client', async (_name, make) => {
    queues.claude.push(make());
    queues.gemini.push(geminiOk());
    const { events } = await generate();

    expect(switchOf(events)).toEqual({ type: 'switch', from: 'claude', to: 'gemini' });
    expect(planOf(events)).toBeDefined();
    expect(errorOf(events)).toBeUndefined();
    expect(callsTo('claude')).toHaveLength(1);
    expect(callsTo('gemini')).toHaveLength(1);
    expect(types(events).indexOf('switch')).toBeLessThan(types(events).indexOf('plan'));
  });

  it('never exposes what the Claude API said, or the key', async () => {
    queues.claude.push(
      claudeError(400, 'invalid_request_error', `Your credit balance is too low. Key ${CLAUDE_KEY}. request req_secret_999`)
    );
    queues.gemini.push(geminiOk());
    const { events } = await generate();
    const text = JSON.stringify(events);
    expect(text).not.toMatch(/credit balance|req_secret|Anthropic API/i);
    expect(text).not.toContain(CLAUDE_KEY);
  });

  it('sends the Gemini request with its own key in a header', async () => {
    queues.claude.push(claudeError(529, 'overloaded_error', 'Overloaded'));
    queues.gemini.push(geminiOk());
    await generate();
    const call = callsTo('gemini')[0];
    expect(headerOf(call, 'x-goog-api-key')).toBe(GEMINI_KEY);
    expect(String(call[0])).not.toContain(GEMINI_KEY);
  });

  it('still uses the Gemini model fallback after switching', async () => {
    queues.claude.push(claudeError(529, 'overloaded_error', 'Overloaded'));
    queues.gemini.push(geminiStatus(429), geminiOk());
    const { events } = await generate();
    expect(planOf(events)).toBeDefined();
    expect(callsTo('gemini')).toHaveLength(2);
    expect(callsTo('gemini').map(([url]) => /models\/([^:]+):/.exec(String(url))![1])).toEqual([
      'gemini-3-flash-preview',
      'gemini-3.5-flash',
    ]);
  });

  it('reports the last error when both providers fail, with no raw text', async () => {
    queues.claude.push(claudeError(400, 'invalid_request_error', 'Your credit balance is too low'));
    queues.gemini.push(geminiStatus(429), geminiStatus(429));
    const { events } = await generate();

    expect(switchOf(events)).toBeDefined();
    expect(planOf(events)).toBeUndefined();
    expect(errorOf(events)?.error.code).toBe('RATE_LIMITED');
    expect(JSON.stringify(events)).not.toMatch(/credit balance|gemini says no/i);
  });

  it('reports UPSTREAM_FAILED when both providers are down', async () => {
    queues.claude.push(claudeError(529, 'overloaded_error', 'Overloaded'));
    queues.gemini.push(geminiStatus(500), geminiStatus(500));
    const { events } = await generate();
    expect(errorOf(events)?.error.code).toBe('UPSTREAM_FAILED');
  });

  it('keeps progress honest across the switch: day counting restarts for the new provider', async () => {
    const partial = planChunks(makePlan(3)).slice(0, 3); // 2 days started, then the stream ends in an error
    queues.claude.push(claudeStream(partial, { errorAfter: { type: 'overloaded_error', message: 'x' } }));
    queues.gemini.push(geminiOk());
    const { events } = await generate();

    const kinds = events.map((e) => (e.type === 'progress' ? `day${e.day}` : e.type));
    expect(kinds).toEqual(['day1', 'day2', 'switch', 'day1', 'day2', 'day3', 'plan']);
  });
});

// --- provider selection ---------------------------------------------------------------------

describe('provider selection', () => {
  it('AI_PROVIDER=gemini puts Gemini first and Claude as the failover', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    queues.gemini.push(geminiStatus(500), geminiStatus(500));
    queues.claude.push(claudeOk());
    const { events } = await generate();

    expect(switchOf(events)).toEqual({ type: 'switch', from: 'gemini', to: 'claude' });
    expect(planOf(events)).toBeDefined();
  });

  it('AI_PROVIDER=gemini does not touch Claude while Gemini works', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    queues.gemini.push(geminiOk());
    const { events } = await generate();
    expect(planOf(events)).toBeDefined();
    expect(callsTo('claude')).toHaveLength(0);
  });

  it('uses Gemini alone, silently, when there is no Anthropic key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    queues.gemini.push(geminiOk());
    const { events } = await generate();
    expect(planOf(events)).toBeDefined();
    expect(switchOf(events)).toBeUndefined();
    expect(callsTo('claude')).toHaveLength(0);
  });

  it('uses Claude alone when there is no Gemini key, and has nothing to fail over to', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    queues.claude.push(claudeError(529, 'overloaded_error', 'Overloaded'));
    const { events } = await generate();
    expect(switchOf(events)).toBeUndefined();
    expect(errorOf(events)?.error.code).toBe('UPSTREAM_FAILED');
    expect(callsTo('gemini')).toHaveLength(0);
  });

  it('fails fast with 500 CONFIG_ERROR when no provider has a key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    const { response } = await generate();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('CONFIG_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown AI_PROVIDER as a configuration error', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    const { response } = await generate();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('CONFIG_ERROR');
  });
});

// --- cancellation never triggers a failover ------------------------------------------------

describe('cancellation', () => {
  it('stops the Claude call and does not fail over to Gemini', async () => {
    let upstream: AbortSignal | null | undefined;
    queues.claude.push(async (init) => {
      upstream = init?.signal;
      const encoder = new TextEncoder();
      const first = planChunks(makePlan(3)).slice(0, 2).join('');
      const head = claudeStream([first]);
      // Replace the finishing events with a hang that ends when the request is aborted.
      const text = (await head.text()).split('event: content_block_stop')[0];
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(text));
          upstream!.addEventListener('abort', () => controller.error(upstream!.reason));
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    });

    const client = new AbortController();
    const response = await POST(request(valid, client.signal));
    const events: StreamEvent[] = [];
    for await (const event of readEvents(response.body!)) {
      events.push(event);
      if (event.type === 'progress') client.abort();
    }

    expect(upstream!.aborted).toBe(true);
    expect(types(events).every((t) => t === 'progress')).toBe(true);
    expect(callsTo('gemini')).toHaveLength(0);
    expect(callsTo('claude')).toHaveLength(1);
  });
});
