import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { assertSameOriginJson } from '@/lib/request-guard';

const request = (headers: Record<string, string>) =>
  new Request('https://studyplan.example.test/api/generate-plan', { method: 'POST', headers, body: '{}' });

const statusOf = (headers: Record<string, string>): number | null => {
  try {
    assertSameOriginJson(request(headers));
    return null;
  } catch (error) {
    return error instanceof AppError ? error.status : -1;
  }
};

const json = { 'content-type': 'application/json' };
const host = { host: 'studyplan.example.test' };

describe('assertSameOriginJson: content type', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON', 'application/json ;charset=UTF-8'])(
    'accepts %s',
    (contentType) => {
      expect(statusOf({ 'content-type': contentType })).toBeNull();
    }
  );

  it.each([
    ['text/plain', 'a cross-site "simple" request'],
    ['application/x-www-form-urlencoded', 'a form post'],
    ['multipart/form-data; boundary=x', 'a multipart post'],
    ['application/jsonp', 'a lookalike'],
    ['application/json-patch+json', 'a different JSON type'],
    ['', 'an empty value'],
  ])('refuses %s with 415 (%s)', (contentType) => {
    expect(statusOf({ 'content-type': contentType })).toBe(415);
  });

  it('refuses a request with no content type', () => {
    expect(statusOf({})).toBe(415);
  });
});

describe('assertSameOriginJson: where the request comes from', () => {
  it('lets non-browser clients through: they send neither header', () => {
    expect(statusOf({ ...json, ...host })).toBeNull();
  });

  it.each(['same-origin', 'none'])('accepts Sec-Fetch-Site: %s', (site) => {
    expect(statusOf({ ...json, ...host, 'sec-fetch-site': site })).toBeNull();
  });

  it.each(['cross-site', 'same-site'])('refuses Sec-Fetch-Site: %s with 403', (site) => {
    expect(statusOf({ ...json, ...host, 'sec-fetch-site': site })).toBe(403);
  });

  it('accepts an Origin that matches the host', () => {
    expect(statusOf({ ...json, ...host, origin: 'https://studyplan.example.test' })).toBeNull();
  });

  it.each([
    ['another site', 'https://evil.test'],
    ['a lookalike host', 'https://studyplan.example.test.evil.test'],
    ['a different port', 'https://studyplan.example.test:8443'],
    ['"null" (sandboxed frame)', 'null'],
    ['garbage', 'not a url'],
  ])('refuses an Origin from %s with 403', (_name, origin) => {
    expect(statusOf({ ...json, ...host, origin })).toBe(403);
  });

  it('trusts the forwarded host a proxy sets over the Host header', () => {
    const headers = { ...json, host: 'internal.vercel.test', 'x-forwarded-host': 'studyplan.example.test' };
    expect(statusOf({ ...headers, origin: 'https://studyplan.example.test' })).toBeNull();
    expect(statusOf({ ...headers, origin: 'https://internal.vercel.test' })).toBe(403);
  });

  it('refuses an Origin when the host is unknown', () => {
    expect(statusOf({ ...json, origin: 'https://studyplan.example.test' })).toBe(403);
  });
});
