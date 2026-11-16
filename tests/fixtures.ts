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

/** Splits a plan's JSON into per-day chunks, like the real stream does. */
export function planChunks(plan: Plan): string[] {
  const head = `{"subject":${JSON.stringify(plan.subject)},"level":"${plan.level}","days":[`;
  return [head, ...plan.days.map((d, i) => (i ? ',' : '') + JSON.stringify(d)), ']}'];
}
