// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { NDJSON_CONTENT_TYPE, encodeEvent, type StreamEvent } from '@/lib/stream';
import { makePlan } from '../fixtures';

const fetchMock = vi.fn<typeof fetch>();

const ndjson = (events: StreamEvent[]) =>
  new Response(events.map(encodeEvent).join(''), { status: 200, headers: { 'Content-Type': NDJSON_CONTENT_TYPE } });

async function generate(user: ReturnType<typeof userEvent.setup>, button: string, label: string) {
  await user.type(screen.getByLabelText(label), 'cooking');
  await user.click(screen.getByRole('button', { name: button }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('<Home>: sample plans', () => {
  it.each([
    ['demo-mode', 'Modo demonstração: este é um plano de exemplo'],
    ['daily-limit', 'O limite diário de planos gerados por IA foi atingido'],
  ] as const)('explains why the plan is a sample (%s)', async (reason, text) => {
    localStorage.setItem('studyplan-ai:locale', 'pt');
    fetchMock.mockResolvedValueOnce(ndjson([{ type: 'demo', reason }, { type: 'plan', plan: makePlan(2) }]));
    render(<Home />);
    await generate(userEvent.setup(), 'Gerar plano', 'O que você quer aprender?');

    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
  });

  it('says so in English too', async () => {
    localStorage.setItem('studyplan-ai:locale', 'en');
    fetchMock.mockResolvedValueOnce(ndjson([{ type: 'demo', reason: 'daily-limit' }, { type: 'plan', plan: makePlan(2) }]));
    render(<Home />);
    await generate(userEvent.setup(), 'Generate plan', 'What do you want to learn?');

    expect(await screen.findByText(/Today's limit of AI-generated plans has been reached/)).toBeInTheDocument();
  });

  it('shows no sample notice for a plan that was generated', async () => {
    localStorage.setItem('studyplan-ai:locale', 'pt');
    fetchMock.mockResolvedValueOnce(ndjson([{ type: 'plan', plan: makePlan(2) }]));
    render(<Home />);
    await generate(userEvent.setup(), 'Gerar plano', 'O que você quer aprender?');

    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText(/plano de exemplo/)).not.toBeInTheDocument();
  });

  it('clears the notice when the next plan is generated for real', async () => {
    localStorage.setItem('studyplan-ai:locale', 'pt');
    fetchMock
      .mockResolvedValueOnce(ndjson([{ type: 'demo', reason: 'daily-limit' }, { type: 'plan', plan: makePlan(2) }]))
      .mockResolvedValueOnce(ndjson([{ type: 'plan', plan: makePlan(3) }]));
    render(<Home />);
    const user = userEvent.setup();
    await generate(user, 'Gerar plano', 'O que você quer aprender?');
    expect(await screen.findByText(/limite diário/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Gerar plano' }));
    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(screen.queryByText(/limite diário/)).not.toBeInTheDocument();
  });
});
