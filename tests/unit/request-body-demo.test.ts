import { describe, expect, it } from 'vitest';
import { pickDemoPlan } from '@/lib/demo';
import { readJsonBody, MAX_BODY_BYTES } from '@/lib/request-body';
import { LANGUAGES, validatePlan } from '@/lib/schema';

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);

/** A body that streams `size` bytes in 1 KB chunks, so no Content-Length is known up front. */
const streamOf = (size: number) => {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) return controller.close();
      const chunk = Math.min(1024, size - sent);
      sent += chunk;
      controller.enqueue(new TextEncoder().encode('a'.repeat(chunk)));
    },
  });
};

describe('readJsonBody', () => {
  it('parses a normal JSON body', async () => {
    expect(await readJsonBody(post('{"subject":"SQL","days":3}'))).toEqual({ subject: 'SQL', days: 3 });
  });

  it('keeps multi-byte characters intact across chunks', async () => {
    expect(await readJsonBody(post(JSON.stringify({ subject: 'programação 🎯' })))).toEqual({ subject: 'programação 🎯' });
  });

  it('rejects a declared length over the limit before reading anything', async () => {
    const request = post('{}', { 'content-length': String(MAX_BODY_BYTES + 1) });
    await expect(readJsonBody(request)).rejects.toMatchObject({ code: 'INVALID_REQUEST', status: 413 });
  });

  it('rejects a body that is bigger than it claims, while streaming', async () => {
    const request = post(streamOf(MAX_BODY_BYTES * 3), { 'content-length': '10' });
    await expect(readJsonBody(request)).rejects.toMatchObject({ status: 413 });
  });

  it('rejects a streamed body with no length header once it passes the limit', async () => {
    await expect(readJsonBody(post(streamOf(MAX_BODY_BYTES + 1)))).rejects.toMatchObject({ status: 413 });
  });

  it('accepts a body exactly at the limit', async () => {
    const text = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES - 10) });
    expect(new TextEncoder().encode(text).length).toBe(MAX_BODY_BYTES);
    await expect(readJsonBody(post(text))).resolves.toBeTypeOf('object');
  });

  it('honors a custom limit', async () => {
    await expect(readJsonBody(post('{"a":"0123456789"}'), 8)).rejects.toMatchObject({ status: 413 });
  });

  it.each([
    ['malformed JSON', post('{nope')],
    ['an empty body', post('')],
    ['no body at all', post(null)],
  ])('rejects %s with 400', async (_name, request) => {
    await expect(readJsonBody(request)).rejects.toMatchObject({ code: 'INVALID_REQUEST', status: 400 });
  });
});

describe('pickDemoPlan', () => {
  it.each(LANGUAGES)('returns valid, sequential samples in %s', (language) => {
    for (const subject of ['JavaScript', 'violão']) {
      const plan = pickDemoPlan(subject, 5, language);
      expect(validatePlan(plan, 5)).toEqual({ ok: true, plan });
    }
  });

  it('picks the programming sample for code subjects and the general one otherwise', () => {
    expect(pickDemoPlan('React hooks', 5, 'en').subject).toMatch(/JavaScript/);
    expect(pickDemoPlan('Next.js', 3, 'pt').subject).toMatch(/JavaScript/);
    expect(pickDemoPlan('violão', 5, 'pt').subject).toBe('Como aprender qualquer assunto');
    expect(pickDemoPlan('cooking', 5, 'en').subject).toBe('How to learn anything');
  });

  it('does not mistake words that merely contain a keyword for programming', () => {
    expect(pickDemoPlan('Developing patience', 5, 'en').subject).toBe('How to learn anything');
    expect(pickDemoPlan('Programação em Python', 5, 'pt').subject).toMatch(/JavaScript/);
    expect(pickDemoPlan('tsunami science', 5, 'en').subject).toBe('How to learn anything');
  });

  it('shortens the plan to the requested days and never makes it longer', () => {
    expect(pickDemoPlan('x', 2, 'pt').days.map((d) => d.day)).toEqual([1, 2]);
    expect(pickDemoPlan('x', 30, 'pt').days).toHaveLength(5);
    expect(pickDemoPlan('x', 1, 'en').days).toHaveLength(1);
  });

  it('returns a fresh object that does not alter the shared sample', () => {
    const first = pickDemoPlan('x', 5, 'pt');
    first.days.pop();
    first.subject = 'changed';
    const second = pickDemoPlan('x', 5, 'pt');
    expect(second.days).toHaveLength(5);
    expect(second.subject).not.toBe('changed');
  });
});
