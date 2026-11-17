import type { Plan } from '@/lib/schema';

/** A small, valid plan shared by the tests. */
export function makePlan(days = 3, overrides: Partial<Plan> = {}): Plan {
  return {
    subject: 'SQL joins',
    level: 'intermediate',
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      title: `Dia ${i + 1}: junções`,
      objective: `Entender junções no dia ${i + 1}.`,
      topics: ['INNER JOIN', 'LEFT JOIN'],
      exercises: ['Liste pedidos com o cliente', 'Encontre clientes sem pedidos'],
      resources: [{ title: 'Guia de joins', query: 'sql joins explicados' }],
      minutes: 90,
    })),
    ...overrides,
  };
}

/** Gemini-style SSE body: one `data:` event per chunk of generated text. */
export function sseBody(textChunks: string[], extraEvents: unknown[] = []): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events = [
    ...textChunks.map((text) => ({ candidates: [{ content: { parts: [{ text }] } }] })),
    ...extraEvents,
  ];
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\r\n\r\n`));
      controller.close();
    },
  });
}

/**
 * A Claude Messages API streaming response (SSE with `event:` lines, as the SDK expects).
 * `errorAfter` appends an in-stream error event instead of finishing normally.
 */
export function claudeStream(
  textChunks: string[],
  options: { stopReason?: string; errorAfter?: { type: string; message: string } } = {}
): Response {
  const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  const parts = [
    event('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-haiku-5-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    }),
    event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ...textChunks.map((text) =>
      event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    ),
  ];
  if (options.errorAfter) {
    parts.push(event('error', { type: 'error', error: options.errorAfter }));
  } else {
    parts.push(
      event('content_block_stop', { type: 'content_block_stop', index: 0 }),
      event('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: options.stopReason ?? 'end_turn', stop_sequence: null },
        usage: { output_tokens: 50 },
      }),
      event('message_stop', { type: 'message_stop' })
    );
  }
  return new Response(parts.join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** An error response in the Claude API's shape. */
export function claudeError(status: number, type: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Splits a plan's JSON into per-day chunks, like the real stream does. */
export function planChunks(plan: Plan): string[] {
  const head = `{"subject":${JSON.stringify(plan.subject)},"level":"${plan.level}","days":[`;
  return [head, ...plan.days.map((d, i) => (i ? ',' : '') + JSON.stringify(d)), ']}'];
}
