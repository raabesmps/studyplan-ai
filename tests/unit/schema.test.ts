import { describe, expect, it } from 'vitest';
import { Plan, PlanRequest, SUBJECT_MAX_LENGTH, validatePlan } from '@/lib/schema';
import { makePlan } from '../fixtures';

describe('Plan schema', () => {
  it('accepts a valid plan', () => {
    expect(Plan.safeParse(makePlan()).success).toBe(true);
  });

  it('rejects a day that is missing a field', () => {
    const plan = makePlan(2);
    // @ts-expect-error simulating a model that dropped a required field
    delete plan.days[1].title;
    expect(Plan.safeParse(plan).success).toBe(false);
  });

  it('rejects days without topics or exercises', () => {
    const noTopics = makePlan(1);
    noTopics.days[0].topics = [];
    const noExercises = makePlan(1);
    noExercises.days[0].exercises = [];
    expect(Plan.safeParse(noTopics).success).toBe(false);
    expect(Plan.safeParse(noExercises).success).toBe(false);
  });

  it('rejects more than 3 resources', () => {
    const plan = makePlan(1);
    plan.days[0].resources = Array.from({ length: 4 }, (_, i) => ({ title: `r${i}`, query: `q${i}` }));
    expect(Plan.safeParse(plan).success).toBe(false);
  });

  it.each([14, 0, -5, 90.5])('rejects invalid minutes (%s)', (minutes) => {
    const plan = makePlan(1);
    plan.days[0].minutes = minutes;
    expect(Plan.safeParse(plan).success).toBe(false);
  });

  it('rejects an unknown level', () => {
    expect(Plan.safeParse({ ...makePlan(), level: 'expert' }).success).toBe(false);
  });

  it('rejects a plan with no days', () => {
    expect(Plan.safeParse(makePlan(0)).success).toBe(false);
  });
});

describe('validatePlan', () => {
  it('returns the plan when it is valid and has the expected number of days', () => {
    const result = validatePlan(makePlan(3), 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.days).toHaveLength(3);
  });

  it('rejects a plan with the wrong number of days', () => {
    const result = validatePlan(makePlan(2), 3);
    expect(result).toEqual({ ok: false, error: 'Expected exactly 3 days but got 2.' });
  });

  it('rejects day numbers that are not sequential', () => {
    const plan = makePlan(3);
    plan.days[1].day = 5;
    const result = validatePlan(plan, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('item 2 has day 5');
  });

  it('reports a readable error for something that is not a plan at all', () => {
    for (const garbage of [null, 'text', 42, [], {}]) {
      const result = validatePlan(garbage, 3);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('caps the error text so it can be appended to a retry prompt', () => {
    const huge = { ...makePlan(1), days: Array.from({ length: 200 }, () => ({ day: 'x' })) };
    const result = validatePlan(huge, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeLessThanOrEqual(1000);
  });
});

describe('PlanRequest', () => {
  const valid = { subject: 'Next.js', hoursPerDay: 2 };

  it('fills in defaults for days, level and language', () => {
    expect(PlanRequest.parse(valid)).toEqual({
      subject: 'Next.js',
      hoursPerDay: 2,
      days: 7,
      level: 'beginner',
      language: 'pt',
    });
  });

  it('trims the subject', () => {
    expect(PlanRequest.parse({ ...valid, subject: '  Next.js  ' }).subject).toBe('Next.js');
  });

  it('accepts a subject of exactly the maximum length and rejects one more', () => {
    expect(PlanRequest.safeParse({ ...valid, subject: 'a'.repeat(SUBJECT_MAX_LENGTH) }).success).toBe(true);
    const tooLong = PlanRequest.safeParse({ ...valid, subject: 'a'.repeat(SUBJECT_MAX_LENGTH + 1) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.error.issues[0].message).toContain('100');
  });

  it.each(['', '   '])('rejects an empty subject (%j)', (subject) => {
    expect(PlanRequest.safeParse({ ...valid, subject }).success).toBe(false);
  });

  it.each([0, 0.5, 25, -1])('rejects hours per day out of range (%s)', (hoursPerDay) => {
    expect(PlanRequest.safeParse({ ...valid, hoursPerDay }).success).toBe(false);
  });

  it.each([0, 31, 2.5, -3])('rejects an invalid number of days (%s)', (days) => {
    expect(PlanRequest.safeParse({ ...valid, days }).success).toBe(false);
  });

  it('accepts the boundaries 1 and 30 days', () => {
    expect(PlanRequest.safeParse({ ...valid, days: 1 }).success).toBe(true);
    expect(PlanRequest.safeParse({ ...valid, days: 30 }).success).toBe(true);
  });

  it('rejects an unknown level or language with a friendly message', () => {
    const level = PlanRequest.safeParse({ ...valid, level: 'expert' });
    const language = PlanRequest.safeParse({ ...valid, language: 'fr' });
    expect(level.success || level.error.issues[0].message).toBe('Nível inválido.');
    expect(language.success || language.error.issues[0].message).toBe('Idioma inválido.');
  });

  it('rejects values of the wrong type instead of coercing them', () => {
    expect(PlanRequest.safeParse({ ...valid, hoursPerDay: '2' }).success).toBe(false);
    expect(PlanRequest.safeParse({ ...valid, subject: 123 }).success).toBe(false);
    expect(PlanRequest.safeParse(null).success).toBe(false);
  });
});
