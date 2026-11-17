import { describe, expect, it } from 'vitest';
import {
  NDJSON_CONTENT_TYPE,
  countDaysStarted,
  encodeEvent,
  parseEventLine,
  readEvents,
  type StreamEvent,
} from '@/lib/stream';

function bodyFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of readEvents(body)) events.push(event);
  return events;
}

describe('encodeEvent / parseEventLine', () => {
  it('round-trips every event type', () => {
    const events: StreamEvent[] = [
      { type: 'progress', day: 2, total: 7 },
      { type: 'retry' },
      { type: 'switch', from: 'claude', to: 'gemini' },
      { type: 'plan', plan: { subject: 'x' } },
      { type: 'error', error: { code: 'RATE_LIMITED', message: 'Devagar', retryAfter: 60 } },
    ];
    for (const event of events) {
      const line = encodeEvent(event);
      expect(line.endsWith('\n')).toBe(true);
      expect(parseEventLine(line)).toEqual(event);
    }
  });

  it.each([
    ['blank', '   '],
    ['not json', '{oops'],
    ['not an object', '42'],
    ['unknown type', '{"type":"mystery"}'],
    ['progress without numbers', '{"type":"progress","day":"2"}'],
    ['a switch to an unknown provider', '{"type":"switch","from":"claude","to":"openai"}'],
    ['a switch without a target', '{"type":"switch","from":"claude"}'],
    ['error without a code', '{"type":"error","error":{"message":"x"}}'],
    ['plan event without a plan', '{"type":"plan"}'],
  ])('ignores a malformed line (%s)', (_name, line) => {
    expect(parseEventLine(line)).toBeNull();
  });

  it('exposes the NDJSON content type used by the route', () => {
    expect(NDJSON_CONTENT_TYPE).toBe('application/x-ndjson');
  });
});

describe('readEvents', () => {
  const encoder = new TextEncoder();

  it('yields events as soon as each line is complete', async () => {
    const lines = [
      encodeEvent({ type: 'progress', day: 1, total: 2 }),
      encodeEvent({ type: 'progress', day: 2, total: 2 }),
    ];
    const events = await collect(bodyFrom(lines.map((l) => encoder.encode(l))));
    expect(events.map((e) => e.type)).toEqual(['progress', 'progress']);
  });

  it('reassembles a line split across chunks', async () => {
    const line = encodeEvent({ type: 'progress', day: 3, total: 9 });
    const bytes = encoder.encode(line);
    const events = await collect(bodyFrom([bytes.slice(0, 7), bytes.slice(7, 20), bytes.slice(20)]));
    expect(events).toEqual([{ type: 'progress', day: 3, total: 9 }]);
  });

  it('does not corrupt a multi-byte character split between chunks', async () => {
    const bytes = encoder.encode(encodeEvent({ type: 'plan', plan: { title: 'Introdução à programação ✓' } }));
    const cut = bytes.indexOf(0xc3) + 1; // splits the first "ç" (2 bytes) in the middle
    const events = await collect(bodyFrom([bytes.slice(0, cut), bytes.slice(cut)]));
    expect(events).toEqual([{ type: 'plan', plan: { title: 'Introdução à programação ✓' } }]);
  });

  it('delivers a last event that has no trailing newline', async () => {
    const events = await collect(bodyFrom([encoder.encode('{"type":"retry"}')]));
    expect(events).toEqual([{ type: 'retry' }]);
  });

  it('skips garbage lines between valid events', async () => {
    const text = `${encodeEvent({ type: 'retry' })}garbage\n\n${encodeEvent({ type: 'progress', day: 1, total: 1 })}`;
    const events = await collect(bodyFrom([encoder.encode(text)]));
    expect(events.map((e) => e.type)).toEqual(['retry', 'progress']);
  });
});

describe('countDaysStarted', () => {
  it('counts the day objects the model has begun writing', () => {
    expect(countDaysStarted('')).toBe(0);
    expect(countDaysStarted('{"subject":"x","level":"beginner","days":[')).toBe(0);
    expect(countDaysStarted('{"days":[{"day":1,"title":"a"')).toBe(1);
    expect(countDaysStarted('{"days":[{"day":1},{"day": 2},{"day"  :3')).toBe(3);
  });

  it('is not fooled by "day": inside a string value', () => {
    const partial = String.raw`{"days":[{"day":1,"title":"fala do \"day\": 5 aqui"},{"day":2`;
    expect(countDaysStarted(partial)).toBe(2);
  });

  it('does not count other keys that merely contain the word', () => {
    expect(countDaysStarted('{"days":[],"birthday":3,"workday": 5}')).toBe(0);
  });
});
