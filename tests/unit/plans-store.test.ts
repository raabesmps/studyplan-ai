// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addPlan,
  getServerSnapshot,
  getSnapshot,
  parseLegacyPlans,
  parseStoredPlans,
  removeLegacyPlan,
  removePlan,
  subscribe,
  updateProgress,
  type LegacyPlan,
  type SavedPlan,
} from '@/lib/plans-store';
import { makePlan } from '../fixtures';

const V2_KEY = 'studyplan-ai:v2';
const LEGACY_KEY = 'studyplan-ai-plans';

function saved(id: string, overrides: Partial<SavedPlan> = {}): SavedPlan {
  return {
    id,
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    hoursPerDay: 2,
    language: 'pt',
    plan: makePlan(2),
    completed: {},
    ...overrides,
  };
}

const legacy = (id: string): LegacyPlan => ({
  id,
  subject: 'Plano antigo',
  hoursPerDay: 1,
  days: 7,
  plan: '# Dia 1\n- item',
  createdAt: '2025-01-02T10:00:00.000Z',
});

beforeEach(() => {
  localStorage.clear();
});

describe('parseStoredPlans (pure)', () => {
  const doc = (plans: unknown[]) => JSON.stringify({ version: 2, plans });

  it('reads valid plans', () => {
    expect(parseStoredPlans(doc([saved('a'), saved('b')])).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['invalid JSON', '{corrupted'],
    ['JSON that is not an object', '[1,2,3]'],
    ['an unknown version', JSON.stringify({ version: 3, plans: [saved('a')] })],
    ['a missing version', JSON.stringify({ plans: [saved('a')] })],
    ['plans that are not an array', JSON.stringify({ version: 2, plans: 'x' })],
  ])('discards corrupted data: %s', (_name, raw) => {
    expect(parseStoredPlans(raw)).toEqual([]);
  });

  it('drops only the invalid entries and keeps the good ones', () => {
    const broken = { ...saved('bad'), plan: { subject: 'x' } };
    const wrongProgress = { ...saved('bad2'), completed: { '1': ['x'] } };
    const result = parseStoredPlans(doc([saved('good'), broken, null, 'text', wrongProgress]));
    expect(result.map((p) => p.id)).toEqual(['good']);
  });
});

describe('parseLegacyPlans (pure)', () => {
  it('reads the v1 array format', () => {
    expect(parseLegacyPlans(JSON.stringify([legacy('x')]))).toEqual([legacy('x')]);
  });

  it('migrates by keeping valid v1 entries and dropping the rest', () => {
    const raw = JSON.stringify([legacy('ok'), { id: 'bad', subject: 5 }, null, 'x']);
    expect(parseLegacyPlans(raw).map((p) => p.id)).toEqual(['ok']);
  });

  it.each([null, '', '{bad', '{"a":1}', '"text"'])('returns [] for unusable input %j', (raw) => {
    expect(parseLegacyPlans(raw)).toEqual([]);
  });
});

describe('browser store', () => {
  it('saves a plan and reads it back', () => {
    addPlan(saved('a'));
    const { plans } = getSnapshot();
    expect(plans).toHaveLength(1);
    expect(plans[0].plan.subject).toBe('SQL joins');
    expect(JSON.parse(localStorage.getItem(V2_KEY)!).version).toBe(2);
  });

  it('puts the newest plan first', () => {
    addPlan(saved('old'));
    addPlan(saved('new'));
    expect(getSnapshot().plans.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('persists progress and bumps updatedAt', () => {
    addPlan(saved('a'));
    updateProgress('a', { '1': [0, 1] });
    const [plan] = getSnapshot().plans;
    expect(plan.completed).toEqual({ '1': [0, 1] });
    expect(plan.updatedAt > '2026-11-16T10:00:00.000Z').toBe(true);
  });

  it('only touches the plan it was asked to update', () => {
    addPlan(saved('a'));
    addPlan(saved('b'));
    updateProgress('a', { '2': [0] });
    const byId = Object.fromEntries(getSnapshot().plans.map((p) => [p.id, p.completed]));
    expect(byId).toEqual({ a: { '2': [0] }, b: {} });
  });

  it('removes a plan', () => {
    addPlan(saved('a'));
    addPlan(saved('b'));
    removePlan('a');
    expect(getSnapshot().plans.map((p) => p.id)).toEqual(['b']);
  });

  it('shows legacy plans alongside v2 plans, read-only, and can delete them', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([legacy('old1'), legacy('old2')]));
    addPlan(saved('new'));
    const snapshot = getSnapshot();
    expect(snapshot.plans.map((p) => p.id)).toEqual(['new']);
    expect(snapshot.legacy.map((p) => p.id)).toEqual(['old1', 'old2']);

    removeLegacyPlan('old1');
    expect(getSnapshot().legacy.map((p) => p.id)).toEqual(['old2']);
    removeLegacyPlan('old2');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(V2_KEY, '{corrupted');
    localStorage.setItem(LEGACY_KEY, 'also bad');
    expect(getSnapshot()).toEqual({ plans: [], legacy: [] });
    addPlan(saved('fresh'));
    expect(getSnapshot().plans.map((p) => p.id)).toEqual(['fresh']);
  });

  it('returns the same snapshot object while nothing changed (required by useSyncExternalStore)', () => {
    addPlan(saved('a'));
    expect(getSnapshot()).toBe(getSnapshot());
    const before = getSnapshot();
    updateProgress('a', { '1': [0] });
    expect(getSnapshot()).not.toBe(before);
  });

  it('serves an empty, stable snapshot on the server', () => {
    expect(getServerSnapshot()).toEqual({ plans: [], legacy: [] });
    expect(getServerSnapshot()).toBe(getServerSnapshot());
  });

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    addPlan(saved('a'));
    updateProgress('a', { '1': [0] });
    removePlan('a');
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    addPlan(saved('b'));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('keeps working when localStorage throws (blocked storage, quota)', () => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    expect(getSnapshot()).toEqual({ plans: [], legacy: [] });
    expect(() => addPlan(saved('a'))).not.toThrow();
  });
});
