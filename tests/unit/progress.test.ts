import { describe, expect, it } from 'vitest';
import {
  countCompletedDays,
  isDayComplete,
  isExerciseDone,
  progressPercent,
  toggleDay,
  toggleExercise,
} from '@/lib/progress';
import { makePlan } from '../fixtures';

const plan = makePlan(4);
const [day1, day2] = plan.days;

describe('progress helpers', () => {
  it('starts with nothing done', () => {
    expect(isExerciseDone({}, day1, 0)).toBe(false);
    expect(isDayComplete({}, day1)).toBe(false);
    expect(progressPercent(plan, {})).toBe(0);
  });

  it('toggles a single exercise on and off', () => {
    const on = toggleExercise({}, day1, 1);
    expect(isExerciseDone(on, day1, 1)).toBe(true);
    expect(isExerciseDone(on, day1, 0)).toBe(false);
    expect(toggleExercise(on, day1, 1)).toEqual({});
  });

  it('completes a day only when every exercise is done', () => {
    const half = toggleExercise({}, day1, 0);
    expect(isDayComplete(half, day1)).toBe(false);
    expect(isDayComplete(toggleExercise(half, day1, 1), day1)).toBe(true);
  });

  it('toggleDay checks everything, then clears everything', () => {
    const all = toggleDay({}, day1);
    expect(all).toEqual({ '1': [0, 1] });
    expect(isDayComplete(all, day1)).toBe(true);
    expect(toggleDay(all, day1)).toEqual({});
  });

  it('toggleDay on a partially done day completes it', () => {
    const partial = toggleExercise({}, day1, 0);
    expect(toggleDay(partial, day1)).toEqual({ '1': [0, 1] });
  });

  it('keeps indexes sorted and days independent', () => {
    let state = toggleExercise({}, day2, 1);
    state = toggleExercise(state, day2, 0);
    state = toggleExercise(state, day1, 0);
    expect(state).toEqual({ '2': [0, 1], '1': [0] });
  });

  it('never mutates the state it receives', () => {
    const original = { '1': [0] };
    const snapshot = JSON.parse(JSON.stringify(original));
    toggleExercise(original, day1, 1);
    toggleDay(original, day1);
    expect(original).toEqual(snapshot);
  });

  it('counts completed days and rounds the percentage', () => {
    let state = toggleDay({}, day1);
    expect(countCompletedDays(plan, state)).toBe(1);
    expect(progressPercent(plan, state)).toBe(25);
    state = toggleDay(toggleDay(state, plan.days[1]), plan.days[2]);
    expect(progressPercent(plan, state)).toBe(75);
    expect(progressPercent(makePlan(3), toggleDay({}, makePlan(3).days[0]))).toBe(33);
  });

  it('handles an empty plan without dividing by zero', () => {
    expect(progressPercent(makePlan(0), {})).toBe(0);
  });
});
