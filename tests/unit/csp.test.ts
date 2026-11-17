import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce } from '@/lib/csp';

const directive = (csp: string, name: string) => csp.split('; ').find((part) => part.startsWith(`${name} `));

describe('buildCsp (production)', () => {
  const csp = buildCsp('abc123', false);

  it('only runs scripts and styles that carry the nonce', () => {
    expect(directive(csp, 'script-src')).toBe(`script-src 'self' 'nonce-abc123' 'strict-dynamic'`);
    expect(directive(csp, 'style-src')).toBe(`style-src 'self' 'nonce-abc123'`);
  });

  it('never allows eval or inline scripts', () => {
    expect(csp).not.toContain('unsafe-eval');
    expect(directive(csp, 'script-src')).not.toContain('unsafe-inline');
  });

  it('keeps the browser on this origin and blocks framing and plugins', () => {
    expect(directive(csp, 'default-src')).toBe(`default-src 'self'`);
    expect(directive(csp, 'connect-src')).toBe(`connect-src 'self'`);
    expect(directive(csp, 'object-src')).toBe(`object-src 'none'`);
    expect(directive(csp, 'frame-ancestors')).toBe(`frame-ancestors 'none'`);
    expect(directive(csp, 'base-uri')).toBe(`base-uri 'self'`);
    expect(directive(csp, 'form-action')).toBe(`form-action 'self'`);
  });

  it('allows only style attributes inline, for the --i custom property', () => {
    expect(directive(csp, 'style-src-attr')).toBe(`style-src-attr 'unsafe-inline'`);
  });

  it('upgrades insecure requests', () => {
    expect(csp).toContain('upgrade-insecure-requests');
  });
});

describe('buildCsp (development)', () => {
  const csp = buildCsp('abc123', true);

  it('allows eval (React debugging) and inline styles (HMR), and does not force https', () => {
    expect(directive(csp, 'script-src')).toContain(`'unsafe-eval'`);
    expect(directive(csp, 'style-src')).toBe(`style-src 'self' 'unsafe-inline'`);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});

describe('createNonce', () => {
  it('is unique per call and safe to place in a CSP source', () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
