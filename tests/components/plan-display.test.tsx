// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudyPlanDisplay from '@/components/StudyPlanDisplay';
import { addPlan, getSnapshot, type SavedPlan } from '@/lib/plans-store';
import { usePlans } from '@/lib/use-plans';
import { makePlan } from '../fixtures';

const downloadTextFile = vi.fn();
vi.mock('@/lib/download', () => ({ downloadTextFile: (...args: unknown[]) => downloadTextFile(...args) }));

function seed(overrides: Partial<SavedPlan> = {}): SavedPlan {
  const saved: SavedPlan = {
    id: 'plan-1',
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    hoursPerDay: 2,
    language: 'pt',
    plan: makePlan(3),
    completed: {},
    ...overrides,
  };
  addPlan(saved);
  return saved;
}

/** Mirrors how the page feeds the component: the plan always comes from the store. */
function Harness() {
  const { plans } = usePlans();
  return plans[0] ? <StudyPlanDisplay saved={plans[0]} /> : null;
}

const progress = () => screen.getByRole('progressbar');
const exercisesOf = (day: number) => within(screen.getByRole('region', { name: `Exercícios do dia ${day}` }));

beforeEach(() => {
  localStorage.setItem('studyplan-ai:locale', 'pt');
  downloadTextFile.mockReset();
});

describe('<StudyPlanDisplay>: progress', () => {
  it('starts at 0% with one segment per day', () => {
    seed();
    render(<Harness />);
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
    expect(progress()).toHaveAttribute('aria-valuetext', '0 de 3 dias concluídos');
    expect(progress().children).toHaveLength(3);
  });

  it('checking an exercise does not finish the day; checking all of them does, and the bar follows', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    const [first, second] = exercisesOf(1).getAllByRole('checkbox');
    await user.click(first);
    expect(progress()).toHaveAttribute('aria-valuenow', '0');

    await user.click(second);
    expect(progress()).toHaveAttribute('aria-valuenow', '33');
    expect(progress()).toHaveAttribute('aria-valuetext', '1 de 3 dias concluídos');
    expect(screen.getByRole('checkbox', { name: 'Dia concluído' })).toBeChecked();
  });

  it('the day checkbox checks every exercise and unchecks them all again', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    await user.click(screen.getAllByRole('checkbox', { name: 'Marcar dia como concluído' })[1]);
    expect(exercisesOf(2).getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(progress()).toHaveAttribute('aria-valuenow', '33');

    await user.click(screen.getByRole('checkbox', { name: 'Dia concluído' }));
    expect(exercisesOf(2).getAllByRole('checkbox').some((box) => (box as HTMLInputElement).checked)).toBe(false);
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
  });

  it('unchecking one exercise of a finished day reopens the day', async () => {
    const user = userEvent.setup();
    seed({ completed: { '1': [0, 1] } });
    render(<Harness />);
    expect(progress()).toHaveAttribute('aria-valuenow', '33');

    await user.click(exercisesOf(1).getAllByRole('checkbox')[0]);
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByRole('checkbox', { name: 'Dia concluído' })).not.toBeInTheDocument();
  });

  it('persists progress to the store, and a fresh render restores it', async () => {
    const user = userEvent.setup();
    seed();
    const { unmount } = render(<Harness />);
    await user.click(screen.getAllByRole('checkbox', { name: 'Marcar dia como concluído' })[0]);
    await user.click(exercisesOf(3).getAllByRole('checkbox')[1]);
    expect(getSnapshot().plans[0].completed).toEqual({ '1': [0, 1], '3': [1] });
    unmount();

    render(<Harness />);
    expect(progress()).toHaveAttribute('aria-valuenow', '33');
    expect(exercisesOf(3).getAllByRole('checkbox')[1]).toBeChecked();
    expect(exercisesOf(3).getAllByRole('checkbox')[0]).not.toBeChecked();
  });

  it('can be driven with the keyboard alone', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);
    const box = exercisesOf(1).getAllByRole('checkbox')[0];
    box.focus();
    await user.keyboard(' ');
    expect(box).toBeChecked();
  });
});

describe('<StudyPlanDisplay>: content safety and structure', () => {
  it('renders plan text as text, never as HTML', () => {
    const plan = makePlan(1);
    plan.days[0].title = '<img src=x onerror="window.__xss = 1"> Joins';
    plan.days[0].exercises = ['<script>window.__xss = 2</script> exercício'];
    seed({ plan });
    const { container } = render(<Harness />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('turns resources into safe, encoded search links that open in a new tab', () => {
    const plan = makePlan(1);
    plan.days[0].resources = [{ title: 'Guia', query: 'sql & joins "avançado"' }];
    seed({ plan });
    render(<Harness />);
    const link = screen.getByRole('link', { name: /Guia/ });
    expect(link).toHaveAttribute('href', 'https://www.google.com/search?q=sql%20%26%20joins%20%22avan%C3%A7ado%22');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('labels every region so screen readers can navigate by day', () => {
    seed();
    render(<Harness />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    for (const day of [1, 2, 3]) {
      expect(screen.getByRole('region', { name: `Tópicos do dia ${day}` })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: `Exercícios do dia ${day}` })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { level: 2, name: 'SQL joins' })).toBeInTheDocument();
  });
});

describe('<StudyPlanDisplay>: export', () => {
  it('copies the markdown, including the progress, and confirms', async () => {
    const user = userEvent.setup();
    seed({ completed: { '1': [0] } });
    render(<Harness />);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');

    await user.click(screen.getByRole('button', { name: 'Copiar como Markdown' }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('# SQL joins');
    expect(writeText.mock.calls[0][0]).toContain('- [x] Liste pedidos com o cliente');
    expect(await screen.findByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
  });

  it('survives a blocked clipboard without crashing', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copiar como Markdown' }));
    expect(screen.getByRole('button', { name: 'Copiar como Markdown' })).toBeInTheDocument();
  });

  it('downloads the markdown with a safe file name', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Baixar .md' }));
    expect(downloadTextFile).toHaveBeenCalledOnce();
    const [filename, content, mime] = downloadTextFile.mock.calls[0];
    expect(filename).toBe('sql-joins.md');
    expect(mime).toBe('text/markdown');
    expect(content).toContain('## Dia 1:');
  });

  it('opens the calendar panel, and downloads an .ics for the chosen date and time', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);

    const toggle = screen.getByRole('button', { name: 'Adicionar ao calendário' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(screen.getByLabelText('Primeiro dia'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '08:15' } });
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo .ics' }));

    expect(downloadTextFile).toHaveBeenCalledOnce();
    const [filename, content, mime] = downloadTextFile.mock.calls[0];
    expect(filename).toBe('sql-joins.ics');
    expect(mime).toBe('text/calendar');
    expect(content).toContain('DTSTART:20261201T081500');
    expect(content).toContain('DTSTART:20261203T081500');
    expect(content).toContain('UID:plan-1-day-1@studyplan-ai');
  });

  it('does not offer the download while the date or time is empty', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Adicionar ao calendário' }));
    fireEvent.change(screen.getByLabelText('Primeiro dia'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Baixar arquivo .ics' })).toBeDisabled();
  });

  it('prints with the plan title as the document title, then restores it', async () => {
    const user = userEvent.setup();
    seed();
    render(<Harness />);
    document.title = 'StudyPlan AI';
    let titleDuringPrint = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      titleDuringPrint = document.title;
    });

    await user.click(screen.getByRole('button', { name: 'Salvar como PDF' }));
    expect(print).toHaveBeenCalledOnce();
    expect(titleDuringPrint).toBe('SQL joins');
    expect(document.title).toBe('StudyPlan AI');
  });

  it('localizes the export panel', async () => {
    localStorage.setItem('studyplan-ai:locale', 'en');
    seed();
    render(<Harness />);
    for (const name of ['Copy as Markdown', 'Download .md', 'Save as PDF', 'Add to calendar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});
