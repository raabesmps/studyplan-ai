// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { addPlan, getSnapshot } from '@/lib/plans-store';
import { NDJSON_CONTENT_TYPE, encodeEvent, type StreamEvent } from '@/lib/stream';
import { makePlan } from '../fixtures';

const fetchMock = vi.fn<typeof fetch>();
const encoder = new TextEncoder();

// --- helpers -------------------------------------------------------------------------------

const ndjson = (events: StreamEvent[]) =>
  new Response(events.map(encodeEvent).join(''), { status: 200, headers: { 'Content-Type': NDJSON_CONTENT_TYPE } });

const jsonError = (status: number, error: Record<string, unknown>) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });

const planOk = (days = 3) => ndjson([{ type: 'progress', day: days, total: days }, { type: 'plan', plan: makePlan(days) }]);

/** A stream the test feeds by hand, to observe the UI between events. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': NDJSON_CONTENT_TYPE } }),
    push: (event: StreamEvent) => controller.enqueue(encoder.encode(encodeEvent(event))),
    close: () => controller.close(),
  };
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, subject = 'SQL joins') {
  const input = screen.getByLabelText('O que você quer aprender?');
  await user.clear(input);
  await user.type(input, subject);
  await user.click(screen.getByRole('button', { name: 'Gerar plano' }));
}

const alertBox = () => screen.queryByRole('alert');

beforeEach(() => {
  localStorage.setItem('studyplan-ai:locale', 'pt');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

// --- generating ----------------------------------------------------------------------------

describe('<Home>: generating a plan', () => {
  it('starts with an empty state that invites the first plan', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Seu roteiro aparece aqui' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('posts the form values, then shows and saves the plan', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(planOk(3));
    render(<Home />);
    await user.clear(screen.getByLabelText('Duração (dias)'));
    await user.type(screen.getByLabelText('Duração (dias)'), '3');
    await user.selectOptions(screen.getByLabelText('Seu nível'), 'advanced');
    await fillAndSubmit(user, '  Docker  ');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/generate-plan');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(String(init!.body))).toEqual({
      subject: 'Docker',
      hoursPerDay: 1,
      days: 3,
      level: 'advanced',
      language: 'pt',
    });

    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('heading', { name: 'Seu roteiro aparece aqui' })).not.toBeInTheDocument();
    expect(getSnapshot().plans).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Plano de SQL joins gerado com 3 dias.');
  });

  it('shows real progress while the plan streams in, then the plan', async () => {
    const user = userEvent.setup();
    const stream = controlledStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    render(<Home />);
    await fillAndSubmit(user);

    expect(await screen.findByText('Preparando o roteiro…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerando plano…' })).toBeDisabled();

    stream.push({ type: 'progress', day: 1, total: 7 });
    expect(await screen.findByText('Escrevendo o dia 1 de 7…')).toBeInTheDocument();
    stream.push({ type: 'progress', day: 2, total: 7 });
    expect(await screen.findByText('Escrevendo o dia 2 de 7…')).toBeInTheDocument();

    stream.push({ type: 'retry' });
    expect(await screen.findByText('Ajustando o formato do plano…')).toBeInTheDocument();

    stream.push({ type: 'plan', plan: makePlan(3) });
    stream.close();
    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('defaults the plan language to the interface language until the learner picks one', async () => {
    localStorage.setItem('studyplan-ai:locale', 'en');
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(planOk());
    render(<Home />);
    await user.type(screen.getByLabelText('What do you want to learn?'), 'Go');
    await user.click(screen.getByRole('button', { name: 'Generate plan' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body)).language).toBe('en');
  });

  it('rejects a response whose plan is not valid instead of showing it', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(ndjson([{ type: 'plan', plan: { subject: 'x', days: [] } }]));
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('A IA devolveu um plano fora do formato esperado.');
    expect(getSnapshot().plans).toHaveLength(0);
  });
});

// --- AI provider failover ------------------------------------------------------------------

describe('<Home>: when the AI provider switches', () => {
  it('says which provider took over while generating, then keeps a note next to the plan', async () => {
    const user = userEvent.setup();
    const stream = controlledStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    render(<Home />);
    await fillAndSubmit(user);

    stream.push({ type: 'switch', from: 'claude', to: 'gemini' });
    expect(await screen.findByText('O Claude não respondeu. Gerando com o Gemini…')).toBeInTheDocument();

    stream.push({ type: 'progress', day: 2, total: 7 });
    expect(await screen.findByText('Escrevendo o dia 2 de 7…')).toBeInTheDocument();
    // The switch stays visible while days are written, so it is not lost.
    expect(screen.getByText('O Claude não respondeu. Gerando com o Gemini…')).toBeInTheDocument();

    stream.push({ type: 'plan', plan: makePlan(3) });
    stream.close();
    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(
      screen.getByText('Este plano foi gerado com o Gemini, porque o Claude estava indisponível no momento.')
    ).toBeInTheDocument();
  });

  it('resets the day counter on a switch so progress never looks stale', async () => {
    const user = userEvent.setup();
    const stream = controlledStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    render(<Home />);
    await fillAndSubmit(user);

    stream.push({ type: 'progress', day: 3, total: 7 });
    await screen.findByText('Escrevendo o dia 3 de 7…');
    stream.push({ type: 'switch', from: 'claude', to: 'gemini' });
    await waitFor(() => expect(screen.queryByText('Escrevendo o dia 3 de 7…')).not.toBeInTheDocument());
    stream.push({ type: 'plan', plan: makePlan(3) });
    stream.close();
    await screen.findAllByRole('article');
  });

  it('follows the interface language', async () => {
    localStorage.setItem('studyplan-ai:locale', 'en');
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      ndjson([{ type: 'switch', from: 'gemini', to: 'claude' }, { type: 'plan', plan: makePlan(3) }])
    );
    render(<Home />);
    await user.type(screen.getByLabelText('What do you want to learn?'), 'Go');
    await user.click(screen.getByRole('button', { name: 'Generate plan' }));
    expect(
      await screen.findByText('This plan was generated with Claude because Gemini was unavailable at the moment.')
    ).toBeInTheDocument();
  });

  it('clears the note when the next generation starts', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(ndjson([{ type: 'switch', from: 'claude', to: 'gemini' }, { type: 'plan', plan: makePlan(3) }]))
      .mockResolvedValueOnce(planOk(3));
    render(<Home />);
    await fillAndSubmit(user);
    await screen.findByText(/foi gerado com o Gemini/);

    await user.click(screen.getByRole('button', { name: 'Gerar plano' }));
    await waitFor(() => expect(screen.queryByText(/foi gerado com o Gemini/)).not.toBeInTheDocument());
  });

  it('does not show the note when every provider failed: only the error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      ndjson([
        { type: 'switch', from: 'claude', to: 'gemini' },
        { type: 'error', error: { code: 'UPSTREAM_FAILED', message: 'raw' } },
      ])
    );
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('O serviço de IA não respondeu');
    expect(screen.queryByText(/foi gerado com o Gemini/)).not.toBeInTheDocument();
  });

  it('shows no note when nothing switched', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(planOk(3));
    render(<Home />);
    await fillAndSubmit(user);
    await screen.findAllByRole('article');
    expect(screen.queryByText(/estava indisponível/)).not.toBeInTheDocument();
  });
});

// --- errors --------------------------------------------------------------------------------

describe('<Home>: errors', () => {
  it('shows a localized message and a retry button for an HTTP error, and keeps the form usable', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonError(502, { code: 'UPSTREAM_FAILED', message: 'raw upstream text' }));
    render(<Home />);
    await fillAndSubmit(user, 'Rust');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O serviço de IA não respondeu. Tente de novo em instantes.');
    expect(alert).not.toHaveTextContent('raw upstream text');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar plano' })).toBeEnabled();
    expect(screen.getByLabelText('O que você quer aprender?')).toHaveValue('Rust');
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível gerar o plano.');
  });

  it('"Tentar de novo" repeats the same request and clears the error on success', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonError(502, { code: 'UPSTREAM_FAILED', message: 'x' }))
      .mockResolvedValueOnce(planOk(3));
    render(<Home />);
    await fillAndSubmit(user, 'Rust');
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(alertBox()).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]!.body).toBe(fetchMock.mock.calls[0][1]!.body);
  });

  it.each([
    ['UPSTREAM_FAILED', 'O serviço de IA não respondeu'],
    ['RATE_LIMITED', 'Muitas tentativas em pouco tempo'],
    ['INVALID_RESPONSE', 'fora do formato esperado'],
    ['CONFIG_ERROR', 'não está configurado'],
    ['INVALID_REQUEST', 'Confira os campos'],
    ['INTERNAL', 'Algo deu errado'],
  ])('maps an error event with code %s to its own message', async (code, expected) => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(ndjson([{ type: 'error', error: { code: code as never, message: 'raw' } }]));
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  });

  it('falls back to a generic message for an unknown error code', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonError(500, { code: 'SOMETHING_NEW', message: 'x' }));
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gerar o plano.');
  });

  it('tells the visitor when to try again if the server says so (Retry-After)', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonError(429, { code: 'RATE_LIMITED', message: 'x', retryAfter: 120 }));
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tente de novo em 2 min.');
  });

  it('rounds a short wait up to one minute', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonError(429, { code: 'RATE_LIMITED', message: 'x', retryAfter: 5 }));
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tente de novo em 1 min.');
  });

  it('reports a network failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
  });

  it('treats a stream that ends without a plan as a failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(ndjson([{ type: 'progress', day: 1, total: 3 }]));
    render(<Home />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('O serviço de IA não respondeu');
  });

  it('the error message follows the interface language', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonError(502, { code: 'UPSTREAM_FAILED', message: 'x' }));
    render(<Home />);
    await fillAndSubmit(user);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: /English/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('The AI service did not respond.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

// --- cancelling ----------------------------------------------------------------------------

describe('<Home>: cancelling', () => {
  /** A fetch that never answers, and rejects like the real one when its signal aborts. */
  const hangingFetch = () => {
    let signal: AbortSignal | undefined | null;
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init!.signal;
          signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );
    return () => signal;
  };

  it('aborts the request, shows a neutral note (not an error) and keeps what was typed', async () => {
    const user = userEvent.setup();
    const getSignal = hangingFetch();
    render(<Home />);
    await fillAndSubmit(user, 'Kubernetes');
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(getSignal()!.aborted).toBe(true);
    expect(await screen.findByText('Geração cancelada. O que você digitou foi mantido.')).toBeInTheDocument();
    expect(alertBox()).not.toBeInTheDocument();
    expect(screen.getByLabelText('O que você quer aprender?')).toHaveValue('Kubernetes');
    expect(screen.getByRole('button', { name: 'Gerar plano' })).toBeEnabled();
    expect(getSnapshot().plans).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Geração cancelada.');
  });

  it('can generate again after cancelling, and the note goes away', async () => {
    const user = userEvent.setup();
    hangingFetch();
    fetchMock.mockResolvedValueOnce(planOk(3));
    render(<Home />);
    await fillAndSubmit(user);
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await screen.findByText('Geração cancelada. O que você digitou foi mantido.');

    await user.click(screen.getByRole('button', { name: 'Gerar plano' }));
    expect(await screen.findAllByRole('article')).toHaveLength(3);
    expect(screen.queryByText('Geração cancelada. O que você digitou foi mantido.')).not.toBeInTheDocument();
  });

  it('aborts the request when the page is left (unmount)', async () => {
    const user = userEvent.setup();
    const getSignal = hangingFetch();
    const { unmount } = render(<Home />);
    await fillAndSubmit(user);
    await screen.findByRole('button', { name: 'Cancelar' });
    unmount();
    expect(getSignal()!.aborted).toBe(true);
  });
});

// --- saved plans, legacy plans -------------------------------------------------------------

describe('<Home>: saved plans', () => {
  const saved = (id: string, subject: string, updatedAt: string, completed = {}) => ({
    id,
    createdAt: updatedAt,
    updatedAt,
    hoursPerDay: 2,
    language: 'pt' as const,
    plan: makePlan(3, { subject }),
    completed,
  });

  it('reopens the most recently used plan with its progress', () => {
    addPlan(saved('old', 'Python', '2026-11-01T10:00:00.000Z'));
    addPlan(saved('new', 'Rust', '2026-11-10T10:00:00.000Z', { '1': [0, 1] }));
    render(<Home />);
    expect(screen.getByRole('heading', { level: 2, name: 'Rust' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(screen.queryByRole('heading', { name: 'Seu roteiro aparece aqui' })).not.toBeInTheDocument();
  });

  it('lists plans with their progress and lets the learner switch between them', async () => {
    const user = userEvent.setup();
    addPlan(saved('a', 'Python', '2026-11-01T10:00:00.000Z'));
    addPlan(saved('b', 'Rust', '2026-11-10T10:00:00.000Z', { '1': [0, 1] }));
    render(<Home />);
    const list = within(screen.getByRole('region', { name: 'Meus planos' }));
    expect(list.getByText(/1 de 3 dias/)).toBeInTheDocument();

    await user.click(list.getByRole('button', { name: /^Python/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Python' })).toBeInTheDocument();
    expect(list.getByRole('button', { name: /^Python/ })).toHaveAttribute('aria-current', 'true');
  });

  it('closes a plan without deleting it', async () => {
    const user = userEvent.setup();
    addPlan(saved('a', 'Python', '2026-11-01T10:00:00.000Z'));
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'Fechar plano' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(getSnapshot().plans).toHaveLength(1);
  });

  it('deletes a plan after confirmation, and not when the learner declines', async () => {
    const user = userEvent.setup();
    addPlan(saved('a', 'Python', '2026-11-01T10:00:00.000Z'));
    render(<Home />);

    vi.stubGlobal('confirm', vi.fn(() => false));
    await user.click(screen.getByRole('button', { name: 'Excluir plano Python' }));
    expect(getSnapshot().plans).toHaveLength(1);

    vi.stubGlobal('confirm', vi.fn(() => true));
    await user.click(screen.getByRole('button', { name: 'Excluir plano Python' }));
    expect(getSnapshot().plans).toHaveLength(0);
    expect(await screen.findByRole('heading', { name: 'Seu roteiro aparece aqui' })).toBeInTheDocument();
  });

  it('shows plans from the old version as read-only, with no checklist', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'studyplan-ai-plans',
      JSON.stringify([
        { id: 'o1', subject: 'Plano antigo', hoursPerDay: 1, days: 7, createdAt: '2025-01-02T10:00:00.000Z', plan: '# Dia 1\n- item **forte**\n<script>window.__x=1</script>' },
        { id: 'bad', subject: 5 },
      ])
    );
    const { container } = render(<Home />);
    const list = within(screen.getByRole('region', { name: 'Meus planos' }));
    expect(list.getAllByText('Legado, somente leitura')).toHaveLength(1);

    await user.click(list.getByRole('button', { name: /^Plano antigo/ }));
    const view = within(screen.getByRole('region', { name: 'Plano antigo' }));
    expect(view.queryAllByRole('checkbox')).toHaveLength(0);
    expect(view.getByText('forte')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>/)).toBeInTheDocument();
  });

  it('keeps working when the stored data is corrupted', () => {
    localStorage.setItem('studyplan-ai:v2', '{corrupted');
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Seu roteiro aparece aqui' })).toBeInTheDocument();
  });
});

// --- language and theme --------------------------------------------------------------------

describe('<Home>: language and theme', () => {
  it('switches the interface language, remembers it, and updates <html lang>', async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Planos de estudo que você pode marcar como feitos');
    expect(screen.getByRole('button', { name: /Português/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /English/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Study plans you can check off');
    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('studyplan-ai:locale')).toBe('en');
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));

    await user.click(screen.getByRole('button', { name: /Português/ }));
    await waitFor(() => expect(document.documentElement.lang).toBe('pt-BR'));
  });

  it('picks the language from the browser when nothing is stored', () => {
    localStorage.clear();
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Study plans you can check off');
  });

  it('falls back to Portuguese for other browser languages', () => {
    localStorage.clear();
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Planos de estudo');
  });

  it('toggles the theme, remembers it, and labels the button for the next action', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'Mudar para o tema escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('studyplan-ai:theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Mudar para o tema claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('studyplan-ai:theme')).toBe('light');
  });

  it('follows the OS preference when the learner has not chosen', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    render(<Home />);
    expect(screen.getByRole('button', { name: 'Mudar para o tema claro' })).toBeInTheDocument();
  });

  it('exposes a skip link and a main landmark', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Ir para o conteúdo' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});
