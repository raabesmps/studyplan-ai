import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = readFileSync('public/.well-known/security.txt', 'utf8');
const expires = /^Expires: (.+)$/m.exec(text)?.[1];

describe('public/.well-known/security.txt', () => {
  it('has a contact and the fields the standard (RFC 9116) requires', () => {
    expect(text).toMatch(/^Contact: https:\/\/github\.com\/raabesmps\/studyplan-ai\/security\/advisories\/new$/m);
    expect(expires).toBeTruthy();
    expect(Number.isNaN(Date.parse(expires!))).toBe(false);
  });

  // A reminder with a deadline: security.txt must not be expired, and a stale one tells researchers
  // nobody is reading reports. This test starts failing 30 days before the date, which is the cue
  // to move "Expires" forward by a year (and check the contact still works).
  it('is not about to expire (renew "Expires" in public/.well-known/security.txt)', () => {
    const daysLeft = (Date.parse(expires!) - Date.now()) / 86_400_000;
    expect(daysLeft, `security.txt expires in ${Math.floor(daysLeft)} days: renew it`).toBeGreaterThan(30);
  });
});
