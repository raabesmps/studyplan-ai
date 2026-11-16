import { z } from 'zod';
import { Language, Plan } from './schema';

const STORAGE_KEY = 'studyplan-ai:v2';
const LEGACY_KEY = 'studyplan-ai-plans';
const CHANGE_EVENT = 'studyplan-ai:change';
export const STORAGE_VERSION = 2;

export const SavedPlan = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  hoursPerDay: z.number(),
  language: Language,
  plan: Plan,
  completed: z.record(z.string(), z.array(z.number().int().min(0))),
});
export type SavedPlan = z.infer<typeof SavedPlan>;

/** v1 plans: a markdown string with no structure. Shown read-only. */
export const LegacyPlan = z.object({
  id: z.string().min(1),
  subject: z.string(),
  hoursPerDay: z.number(),
  days: z.number(),
  plan: z.string(),
  createdAt: z.string(),
});
export type LegacyPlan = z.infer<typeof LegacyPlan>;

export interface StoreSnapshot {
  plans: SavedPlan[];
  legacy: LegacyPlan[];
}

const StoredV2 = z.object({ version: z.literal(STORAGE_VERSION), plans: z.array(z.unknown()) });

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Pure. Invalid or corrupted entries are dropped instead of breaking the app. */
export function parseStoredPlans(raw: string | null): SavedPlan[] {
  const doc = StoredV2.safeParse(parseJson(raw));
  if (!doc.success) return [];
  return doc.data.plans.flatMap((item) => {
    const parsed = SavedPlan.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Pure. Reads the old (v1) array format. */
export function parseLegacyPlans(raw: string | null): LegacyPlan[] {
  const data = parseJson(raw);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const parsed = LegacyPlan.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

// --- Browser storage access (every call is guarded: storage can be blocked or throw) ---

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full: the app keeps working without persistence.
  }
}

function notify(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function writePlans(plans: SavedPlan[]): void {
  safeSet(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, plans }));
  notify();
}

// --- External store (for useSyncExternalStore) ---

export const EMPTY_SNAPSHOT: StoreSnapshot = { plans: [], legacy: [] };

let cached: { key: string; value: StoreSnapshot } | null = null;

/** Returns a referentially stable snapshot as long as the stored data is unchanged. */
export function getSnapshot(): StoreSnapshot {
  const v2 = safeGet(STORAGE_KEY);
  const legacy = safeGet(LEGACY_KEY);
  const key = `${v2}\u0000${legacy}`;
  if (cached?.key === key) return cached.value;
  cached = { key, value: { plans: parseStoredPlans(v2), legacy: parseLegacyPlans(legacy) } };
  return cached.value;
}

export function getServerSnapshot(): StoreSnapshot {
  return EMPTY_SNAPSHOT;
}

export function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

// --- Mutations ---

export function addPlan(plan: SavedPlan): void {
  writePlans([plan, ...getSnapshot().plans]);
}

export function updateProgress(id: string, completed: SavedPlan['completed']): void {
  const updatedAt = new Date().toISOString();
  writePlans(getSnapshot().plans.map((p) => (p.id === id ? { ...p, completed, updatedAt } : p)));
}

export function removePlan(id: string): void {
  writePlans(getSnapshot().plans.filter((p) => p.id !== id));
}

export function removeLegacyPlan(id: string): void {
  const remaining = getSnapshot().legacy.filter((p) => p.id !== id);
  safeSet(LEGACY_KEY, remaining.length > 0 ? JSON.stringify(remaining) : null);
  notify();
}
