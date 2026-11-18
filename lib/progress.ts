import type { Day, Plan } from './schema';

/** Completed exercise indexes per day, keyed by day number (as a string, for JSON). */
export type Completed = Record<string, number[]>;

function doneSet(completed: Completed, day: Day): Set<number> {
  return new Set(completed[String(day.day)] ?? []);
}

function withDay(completed: Completed, day: Day, indexes: number[]): Completed {
  const next = { ...completed };
  if (indexes.length === 0) {
    delete next[String(day.day)];
  } else {
    next[String(day.day)] = [...indexes].sort((a, b) => a - b);
  }
  return next;
}

export function isExerciseDone(completed: Completed, day: Day, index: number): boolean {
  return doneSet(completed, day).has(index);
}

/** A day is complete when every one of its exercises is checked. */
export function isDayComplete(completed: Completed, day: Day): boolean {
  const done = doneSet(completed, day);
  return day.exercises.length > 0 && day.exercises.every((_, i) => done.has(i));
}

export function toggleExercise(completed: Completed, day: Day, index: number): Completed {
  const done = doneSet(completed, day);
  if (done.has(index)) done.delete(index);
  else done.add(index);
  return withDay(completed, day, [...done]);
}

/** Checks every exercise of the day, or clears them all when the day is already complete. */
export function toggleDay(completed: Completed, day: Day): Completed {
  if (isDayComplete(completed, day)) return withDay(completed, day, []);
  return withDay(
    completed,
    day,
    day.exercises.map((_, i) => i)
  );
}

export function countCompletedDays(plan: Plan, completed: Completed): number {
  return plan.days.filter((d) => isDayComplete(completed, d)).length;
}

export function progressPercent(plan: Plan, completed: Completed): number {
  if (plan.days.length === 0) return 0;
  return Math.round((countCompletedDays(plan, completed) / plan.days.length) * 100);
}
