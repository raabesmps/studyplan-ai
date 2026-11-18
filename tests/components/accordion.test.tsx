// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudyPlanDisplay from '@/components/StudyPlanDisplay';
import { addPlan, type SavedPlan } from '@/lib/plans-store';
import { usePlans } from '@/lib/use-plans';
import { makePlan } from '../fixtures';

function seed(id = 'plan-1', days = 4): SavedPlan {
  const saved: SavedPlan = {
    id,
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    hoursPerDay: 2,
    language: 'pt',
    plan: makePlan(days),
    completed: {},
  };
  addPlan(saved);
  return saved;
}

/** Like the page: the plan view is keyed by plan id, so a different plan starts fresh. */
function Harness({ id }: { id?: string }) {
  const { plans } = usePlans();
  const saved = plans.find((p) => p.id === id) ?? plans[0];
  return saved ? <StudyPlanDisplay key={saved.id} saved={saved} /> : null;
}

const toggle = (day: number) => screen.getByRole('button', { name: new RegExp(`^Dia ${day}:`) });
const panel = (day: number) => document.getElementById(`day-${day}-panel`) as HTMLElement;
const openDays = () =>
  [1, 2, 3, 4].filter((day) => toggle(day).getAttribute('aria-expanded') === 'true');

beforeEach(() => {
  localStorage.setItem('studyplan-ai:locale', 'pt');
});

describe('<StudyPlanDisplay>: days as an accordion', () => {
  it('opens only day 1 by default, with every day\'s title and "done" check showing', () => {
    seed();
    render(<Harness />);

    expect(openDays()).toEqual([1]);
    for (const day of [1, 2, 3, 4]) {
      expect(toggle(day)).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox', { name: 'Marcar dia como concluído' })).toHaveLength(4);
    }
    expect(panel(1)).not.toHaveAttribute('inert');
    for (const day of [2, 3, 4]) expect(panel(day)).toHaveAttribute('inert');
  });

  it('opening a day closes the one that was open', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    await user.click(toggle(3));
    expect(openDays()).toEqual([3]);
    expect(panel(3)).not.toHaveAttribute('inert');
    expect(panel(1)).toHaveAttribute('inert');

    await user.click(toggle(2));
    expect(openDays()).toEqual([2]);
  });

  it('clicking the open day closes it, leaving none open', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    await user.click(toggle(1));
    expect(openDays()).toEqual([]);
    await user.click(toggle(1));
    expect(openDays()).toEqual([1]);
  });

  it('wires each button to its panel for assistive technology', () => {
    seed();
    render(<Harness />);
    for (const day of [1, 2, 3, 4]) {
      expect(toggle(day)).toHaveAttribute('aria-controls', `day-${day}-panel`);
      expect(panel(day)).toBeInTheDocument();
    }
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    toggle(2).focus();
    await user.keyboard('{Enter}');
    expect(openDays()).toEqual([2]);
    await user.keyboard(' ');
    expect(openDays()).toEqual([]);
  });

  it('marking a day done does not open or close anything', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    await user.click(screen.getAllByRole('checkbox', { name: 'Marcar dia como concluído' })[2]);
    expect(openDays()).toEqual([1]);
    expect(screen.getAllByRole('checkbox', { name: 'Dia concluído' })).toHaveLength(1);
  });

  it('keeps the day\'s progress when it is closed and opened again', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    const first = panel(1).querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    await user.click(first);
    await user.click(toggle(1));
    await user.click(toggle(1));
    expect((panel(1).querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement).checked).toBe(true);
  });

  it('starts a different plan from day 1 again', async () => {
    const user = userEvent.setup();
    seed('plan-a');
    const view = render(<Harness id="plan-a" />);
    await user.click(toggle(3));
    expect(openDays()).toEqual([3]);

    seed('plan-b');
    view.rerender(<Harness id="plan-b" />);
    expect(openDays()).toEqual([1]);
  });

  it('shows every day\'s details when printed (the panels are always in the document)', () => {
    seed();
    render(<Harness />);
    for (const day of [1, 2, 3, 4]) {
      expect(panel(day).className).toContain('print:grid-rows-[1fr]');
      expect(panel(day).textContent).toContain('Tópicos');
    }
  });
});
