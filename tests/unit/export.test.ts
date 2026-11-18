import { describe, expect, it } from 'vitest';
import { exportFilename, planToIcs, planToMarkdown } from '@/lib/export';
import { makePlan } from '../fixtures';

const NOW = new Date('2026-11-16T12:00:00Z');
const ICS_BASE = { startDate: '2026-12-01', startTime: '08:15', uidSeed: 'plan-123', now: NOW };

/** Undoes RFC 5545 line folding so assertions can match whole content lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const contentLines = (ics: string) => unfold(ics).split('\r\n').filter(Boolean);

describe('planToMarkdown', () => {
  it('matches the snapshot (pt, nothing done)', () => {
    expect(planToMarkdown(makePlan(2))).toMatchSnapshot();
  });

  it('matches the snapshot (en, with progress)', () => {
    expect(planToMarkdown(makePlan(2), 'en', { '1': [0, 1], '2': [1] })).toMatchSnapshot();
  });

  it('exports exercises as a task list that mirrors the progress', () => {
    const md = planToMarkdown(makePlan(2), 'pt', { '1': [0], '2': [0, 1] });
    expect(md).toContain('- [x] Liste pedidos com o cliente');
    expect(md).toContain('- [ ] Encontre clientes sem pedidos');
    expect(md.match(/- \[x\]/g)).toHaveLength(3);
    expect(md.match(/- \[ \]/g)).toHaveLength(1);
  });

  it('starts with the subject as a title and ends with a newline', () => {
    const md = planToMarkdown(makePlan(1));
    expect(md.startsWith('# SQL joins\n')).toBe(true);
    expect(md.endsWith('\n')).toBe(true);
  });

  it('lists search terms, never URLs', () => {
    const md = planToMarkdown(makePlan(1));
    expect(md).toContain('- Guia de joins: sql joins explicados');
    expect(md).not.toMatch(/https?:\/\//);
  });

  it('omits the resources block when a day has none', () => {
    const plan = makePlan(1);
    plan.days[0].resources = [];
    expect(planToMarkdown(plan)).not.toContain('**Buscar:**');
  });
});

describe('planToIcs', () => {
  it('matches the snapshot', () => {
    expect(planToIcs(makePlan(2), ICS_BASE)).toMatchSnapshot();
  });

  it('is a well-formed calendar with CRLF line endings and one event per day', () => {
    const ics = planToIcs(makePlan(4), ICS_BASE);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(/(^|[^\r])\n/.test(ics)).toBe(false);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(4);
  });

  it('puts each day on consecutive dates at the chosen time, using floating times', () => {
    const lines = contentLines(planToIcs(makePlan(3), ICS_BASE));
    expect(lines.filter((l) => l.startsWith('DTSTART'))).toEqual([
      'DTSTART:20261201T081500',
      'DTSTART:20261202T081500',
      'DTSTART:20261203T081500',
    ]);
    expect(lines.filter((l) => l.startsWith('DTEND'))[0]).toBe('DTEND:20261201T094500');
    expect(lines.some((l) => /TZID|DTSTART;/.test(l))).toBe(false);
  });

  it('keeps the same wall-clock time across a DST change', () => {
    const lines = contentLines(planToIcs(makePlan(3), { ...ICS_BASE, startDate: '2026-03-07', startTime: '09:30' }));
    const starts = lines.filter((l) => l.startsWith('DTSTART')).map((l) => l.slice(-6));
    expect(starts).toEqual(['093000', '093000', '093000']);
  });

  it('rolls an event that crosses midnight into the next day', () => {
    const plan = makePlan(1);
    plan.days[0].minutes = 180;
    const lines = contentLines(planToIcs(plan, { ...ICS_BASE, startDate: '2026-12-31', startTime: '23:00' }));
    expect(lines).toContain('DTEND:20270101T020000');
  });

  it('gives every event a stable, unique UID so re-importing updates instead of duplicating', () => {
    const lines = contentLines(planToIcs(makePlan(3), ICS_BASE));
    const uids = lines.filter((l) => l.startsWith('UID:'));
    expect(uids).toEqual([
      'UID:plan-123-day-1@studyplan-ai',
      'UID:plan-123-day-2@studyplan-ai',
      'UID:plan-123-day-3@studyplan-ai',
    ]);
  });

  it('stamps events in UTC from the injected clock', () => {
    expect(contentLines(planToIcs(makePlan(1), ICS_BASE))).toContain('DTSTAMP:20261116T120000Z');
  });

  it('escapes backslashes, semicolons, commas and newlines in text', () => {
    const plan = makePlan(1);
    plan.days[0].title = 'a, b; c \\ d';
    plan.days[0].objective = 'linha um\nlinha dois';
    const lines = contentLines(planToIcs(plan, ICS_BASE));
    const summary = lines.find((l) => l.startsWith('SUMMARY:'))!;
    const description = lines.find((l) => l.startsWith('DESCRIPTION:'))!;
    expect(summary).toContain('a\\, b\\; c \\\\ d');
    expect(description).toContain('linha um\\nlinha dois');
    expect(description).not.toContain('\n');
  });

  it('folds long lines at 75 octets without splitting a multi-byte character', () => {
    const plan = makePlan(1);
    plan.days[0].title = 'Introdução à programação com acentuação, ç, ã, é e emoji ✓ '.repeat(6);
    const ics = planToIcs(plan, ICS_BASE);
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).not.toContain('�');
    expect(unfold(ics)).toContain('Introdução à programação com acentuação');
  });

  it('localizes the labels', () => {
    const en = unfold(planToIcs(makePlan(2), { ...ICS_BASE, language: 'en' }));
    expect(en).toContain('Day 1/2');
    expect(en).toContain('Objective:');
    expect(en).toContain('Exercises:');
    expect(unfold(planToIcs(makePlan(2), ICS_BASE))).toContain('Dia 1/2');
  });

  it.each([
    ['2026-02-30', '09:00'],
    ['2026-13-01', '09:00'],
    ['2026-1-1', '09:00'],
    ['not-a-date', '09:00'],
    ['2026-01-01', '25:00'],
    ['2026-01-01', '09:60'],
    ['2026-01-01', '9:00'],
    ['', ''],
  ])('rejects the invalid start %s %s', (startDate, startTime) => {
    expect(() => planToIcs(makePlan(1), { ...ICS_BASE, startDate, startTime })).toThrow(RangeError);
  });
});

describe('exportFilename', () => {
  it.each([
    ['SQL joins', 'md', 'sql-joins.md'],
    ['SQL & Bancos de Dados — Avançado', 'ics', 'sql-bancos-de-dados-avancado.ics'],
    ['  Next.js 16!  ', 'md', 'next-js-16.md'],
    ['???', 'md', 'study-plan.md'],
    ['', 'ics', 'study-plan.ics'],
  ])('turns %j into a safe name', (subject, extension, expected) => {
    expect(exportFilename(subject, extension)).toBe(expected);
  });

  it('caps the length and never ends the slug with a dash', () => {
    const name = exportFilename('a'.repeat(200), 'md');
    expect(name).toBe(`${'a'.repeat(50)}.md`);
    expect(exportFilename(`${'a'.repeat(49)} bbb`, 'md')).toBe(`${'a'.repeat(49)}.md`);
  });
});
