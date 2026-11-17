import { PROVIDERS, type ProviderName } from './env';
import type { ErrorBody } from './errors';

/** Events sent by POST /api/generate-plan, one JSON object per line (NDJSON). */
export type StreamEvent =
  | { type: 'progress'; day: number; total: number }
  | { type: 'retry' }
  | { type: 'switch'; from: ProviderName; to: ProviderName } // the first AI provider failed; another takes over
  | { type: 'plan'; plan: unknown } // validated by the consumer with Plan.safeParse
  | ({ type: 'error' } & ErrorBody);

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

export function encodeEvent(event: StreamEvent): string {
  return JSON.stringify(event) + '\n';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Pure. Returns null for blank, malformed or unknown lines instead of throwing. */
export function parseEventLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;

  switch (raw.type) {
    case 'progress':
      return typeof raw.day === 'number' && typeof raw.total === 'number'
        ? { type: 'progress', day: raw.day, total: raw.total }
        : null;
    case 'retry':
      return { type: 'retry' };
    case 'switch': {
      const known = (value: unknown): value is ProviderName => (PROVIDERS as readonly unknown[]).includes(value);
      return known(raw.from) && known(raw.to) ? { type: 'switch', from: raw.from, to: raw.to } : null;
    }
    case 'plan':
      return 'plan' in raw ? { type: 'plan', plan: raw.plan } : null;
    case 'error': {
      const error = raw.error;
      if (!isRecord(error) || typeof error.code !== 'string' || typeof error.message !== 'string') return null;
      const retryAfter = typeof error.retryAfter === 'number' ? error.retryAfter : undefined;
      return {
        type: 'error',
        error: { code: error.code as ErrorBody['error']['code'], message: error.message, retryAfter },
      };
    }
    default:
      return null;
  }
}

/** Reads an NDJSON response body, yielding events as soon as each line is complete. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const event = parseEventLine(line);
        if (event) yield event;
      }
    }
    const last = parseEventLine(buffer + decoder.decode());
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

// Matches a real `"day": <number>` key, not one inside a string (those are escaped as \").
const DAY_KEY = /(?<!\\)"day"\s*:\s*\d/g;

/** Pure. How many day objects the model has started writing in a partial JSON document. */
export function countDaysStarted(partialJson: string): number {
  return (partialJson.match(DAY_KEY) ?? []).length;
}
