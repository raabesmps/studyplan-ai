// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusPage from '@/app/status/page';

const fetchMock = vi.fn<typeof fetch>();

const publicStatus = (overrides: Record<string, unknown> = {}) => ({
  checkedAt: '2026-03-10T12:00:00.000Z',
  site: { status: 'up' },
  services: [
    { id: 'claude', status: 'up', latencyMs: 120 },
    { id: 'gemini', status: 'degraded', latencyMs: 340 },
    { id: 'redis', status: 'down', latencyMs: null },
  ],
  dailyLimitReached: false,
  ...overrides,
});

const day = (date: string, overrides: Record<string, unknown> = {}) => ({
  date,
  requests: 0,
  plans: 0,
  plansClaude: 0,
  plansGemini: 0,
  samples: 0,
  rateLimited: 0,
  errors: 0,
  failovers: 0,
  tokens: { claude: { input: 0, output: 0 }, gemini: { input: 0, output: 0 } },
  costUsd: 0,
  ...overrides,
});

const usage = (overrides: Record<string, unknown> = {}) => ({
  generatedAt: '2026-03-10T12:00:00.000Z',
  retentionDays: 35,
  dailyLimit: 200,
  usedToday: 42,
  claudeModel: 'claude-haiku-5-5',
  priceKnown: true,
  days: [
    day('2026-03-10', { requests: 9, plans: 6, plansClaude: 5, plansGemini: 1, samples: 1, rateLimited: 2, errors: 1, failovers: 1, costUsd: 0.0123 }),
    day('2026-03-09', { requests: 3, plans: 3, plansClaude: 3, costUsd: 0.006 }),
  ],
  totals: { requests: 12, plans: 9, samples: 1, rateLimited: 2, errors: 1, costUsd: 0.0183 },
  ips: {
    date: '2026-03-10',
    rows: [
      { ip: '203.0.113.7', requests: 6, plans: 5 },
      { ip: '198.51.100.2', requests: 3, plans: 1 },
    ],
  },
  health: {
    claude: { lastFailure: { at: '2026-03-10T10:00:00.000Z', reason: 'billing' }, lastSuccess: '2026-03-10T11:00:00.000Z' },
    gemini: { lastFailure: null, lastSuccess: null },
  },
  checkedAt: '2026-03-10T12:00:00.000Z',
  services: [
    { id: 'claude', status: 'up', latencyMs: 120, reason: null },
    { id: 'gemini', status: 'degraded', latencyMs: 340, reason: 'rate_limit' },
    { id: 'redis', status: 'down', latencyMs: null, reason: 'auth' },
  ],
  ...overrides,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Routes calls to /api/status and /api/admin/usage; an owner answer can be a Response or a function of the URL. */
function route(owner: (url: URL, headers: Headers) => Response = () => json(usage()), status: () => Response = () => json(publicStatus())) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/status') return status();
    if (url.pathname === '/api/admin/usage') return owner(url, new Headers(init?.headers));
    throw new Error(`Unexpected ${url.pathname}`);
  });
}

beforeEach(() => {
  localStorage.setItem('studyplan-ai:locale', 'pt');
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  route();
});

const serviceRow = (id: string) => document.querySelector(`[data-service="${id}"]`) as HTMLElement;

describe('<StatusPage>: public status', () => {
  it('shows the site and each API with a text state and its round trip', async () => {
    render(<StatusPage />);
    expect(await screen.findByRole('heading', { name: 'Status do serviço' })).toBeInTheDocument();
    await waitFor(() => expect(serviceRow('claude')).toBeInTheDocument());

    expect(within(serviceRow('site')).getByText('Operacional')).toBeInTheDocument();
    expect(within(serviceRow('claude')).getByText('Operacional')).toBeInTheDocument();
    expect(within(serviceRow('claude')).getByText('120 ms')).toBeInTheDocument();
    expect(within(serviceRow('gemini')).getByText('Degradado')).toBeInTheDocument();
    expect(within(serviceRow('redis')).getByText('Fora do ar')).toBeInTheDocument();
  });

  it('marks a service that is not set up, without a round trip', async () => {
    route(undefined, () =>
      json(publicStatus({ services: [{ id: 'claude', status: 'up', latencyMs: 1 }, { id: 'gemini', status: 'not_configured', latencyMs: null }, { id: 'redis', status: 'up', latencyMs: 2 }] }))
    );
    render(<StatusPage />);
    await waitFor(() => expect(serviceRow('gemini')).toBeInTheDocument());
    expect(within(serviceRow('gemini')).getByText('Não configurado')).toBeInTheDocument();
    expect(within(serviceRow('gemini')).queryByText(/ms$/)).not.toBeInTheDocument();
  });

  it('says when visitors are getting sample plans because the daily budget is spent', async () => {
    route(undefined, () => json(publicStatus({ dailyLimitReached: true })));
    render(<StatusPage />);
    expect(await screen.findByText(/limite diário de planos por IA foi atingido/)).toBeInTheDocument();
  });

  it('shows a clear error when the status cannot be read, and recovers on refresh', async () => {
    const user = userEvent.setup();
    let healthy = false;
    route(undefined, () => (healthy ? json(publicStatus()) : new Response('boom', { status: 500 })));
    render(<StatusPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar o status agora');

    healthy = true;
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(serviceRow('claude')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('checks again each time the button is pressed', async () => {
    const user = userEvent.setup();
    render(<StatusPage />);
    await waitFor(() => expect(serviceRow('claude')).toBeInTheDocument());
    const before = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/status').length;
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/status').length).toBe(before + 1));
  });

  it('is available in English', async () => {
    localStorage.setItem('studyplan-ai:locale', 'en');
    render(<StatusPage />);
    expect(await screen.findByRole('heading', { name: 'Service status' })).toBeInTheDocument();
    await waitFor(() => expect(serviceRow('gemini')).toBeInTheDocument());
    expect(within(serviceRow('gemini')).getByText('Degraded')).toBeInTheDocument();
  });

  it('shows no owner data without the token', async () => {
    render(<StatusPage />);
    await waitFor(() => expect(serviceRow('claude')).toBeInTheDocument());
    expect(screen.getByLabelText('Token do dono')).toHaveAttribute('type', 'password');
    expect(screen.queryByTestId('owner-data')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/admin'))).toBe(false);
  });
});

describe('<StatusPage>: owner panel', () => {
  const signIn = async (user: ReturnType<typeof userEvent.setup>, token = 'the-owner-token-123') => {
    await user.type(screen.getByLabelText('Token do dono'), token);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
  };

  it('sends the token as a Bearer header, never in the URL, and clears the field', async () => {
    const user = userEvent.setup();
    const seen: { url: string; auth: string | null }[] = [];
    route((url, headers) => {
      seen.push({ url: url.toString(), auth: headers.get('authorization') });
      return json(usage());
    });
    render(<StatusPage />);
    await signIn(user);

    expect(await screen.findByTestId('owner-data')).toBeInTheDocument();
    expect(seen[0].auth).toBe('Bearer the-owner-token-123');
    expect(seen[0].url).not.toContain('the-owner-token');
    expect(screen.queryByLabelText('Token do dono')).not.toBeInTheDocument();
  });

  it.each([
    [401, 'Token inválido.'],
    [429, 'Muitas tentativas erradas. Tente de novo mais tarde.'],
    [404, 'O painel do dono não está ativado neste servidor.'],
    [500, 'Não foi possível carregar os dados. Tente de novo.'],
  ])('answering %s shows "%s" and reveals nothing', async (status, message) => {
    const user = userEvent.setup();
    route(() => json({ error: { code: 'X', message: 'detail' } }, status));
    render(<StatusPage />);
    await signIn(user, 'wrong-token-wrong-token');

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByTestId('owner-data')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('studyplan-ai:owner-token')).toBeNull();
  });

  it('shows today\'s numbers, the estimated spend and the daily budget', async () => {
    const user = userEvent.setup();
    render(<StatusPage />);
    await signIn(user);
    await screen.findByTestId('owner-data');

    expect(screen.getByTestId('spend-today')).toHaveTextContent('US$');
    expect(screen.getByTestId('spend-today')).toHaveTextContent('0,0123');
    expect(screen.getByText('42 de 200 planos do teto diário', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '42 de 200 planos do teto diário' })).toHaveAttribute('value', '42');
    expect(screen.getByText(/Estimativa com o preço de lista do claude-haiku-5-5/)).toBeInTheDocument();
  });

  it('lists the days in a table with totals', async () => {
    const user = userEvent.setup();
    render(<StatusPage />);
    await signIn(user);
    const table = await screen.findByRole('table', { name: 'Por dia' });

    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('2026-03-10');
    expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent('9');
    expect(within(table).getByRole('rowheader', { name: 'Total do período' })).toBeInTheDocument();
  });

  it('lists who asked on the chosen day, and loads another day on demand', async () => {
    const user = userEvent.setup();
    const asked: (string | null)[] = [];
    route((url) => {
      asked.push(url.searchParams.get('date'));
      return json(url.searchParams.get('date') === '2026-03-09' ? usage({ ips: { date: '2026-03-09', rows: [{ ip: '192.0.2.44', requests: 3, plans: 3 }] } }) : usage());
    });
    render(<StatusPage />);
    await signIn(user);

    const ips = await screen.findByTestId('ip-table');
    expect(within(ips).getByRole('rowheader', { name: '203.0.113.7' })).toBeInTheDocument();
    expect(within(ips).getByRole('rowheader', { name: '198.51.100.2' })).toBeInTheDocument();
    expect(screen.getByText(/Endereços IP são dados pessoais/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver IPs de 2026-03-09' }));
    expect(await within(await screen.findByTestId('ip-table')).findByRole('rowheader', { name: '192.0.2.44' })).toBeInTheDocument();
    expect(asked).toEqual([null, '2026-03-09']);
  });

  it('says so when nobody asked on that day', async () => {
    const user = userEvent.setup();
    route(() => json(usage({ ips: { date: '2026-03-10', rows: [] } })));
    render(<StatusPage />);
    await signIn(user);
    expect(await screen.findByText('Nenhum pedido neste dia.')).toBeInTheDocument();
  });

  it('shows why each provider last failed, and the service detail with reasons', async () => {
    const user = userEvent.setup();
    render(<StatusPage />);
    await signIn(user);
    await screen.findByTestId('owner-data');

    const claude = document.querySelector('[data-provider="claude"]') as HTMLElement;
    expect(claude).toHaveTextContent('saldo ou cobrança');
    const gemini = document.querySelector('[data-provider="gemini"]') as HTMLElement;
    expect(gemini).toHaveTextContent('nunca');

    expect(document.querySelector('[data-detail="redis"]')).toHaveTextContent('chave recusada');
    expect(document.querySelector('[data-detail="gemini"]')).toHaveTextContent('limite de uso do provedor');
  });

  it('warns when the model has no price, since the spend is then a guess', async () => {
    const user = userEvent.setup();
    route(() => json(usage({ priceKnown: false })));
    render(<StatusPage />);
    await signIn(user);
    expect(await screen.findByText(/não está na tabela de preços/)).toBeInTheDocument();
  });

  it('stays signed in for this tab after a reload, and signing out forgets the token', async () => {
    const user = userEvent.setup();
    const first = render(<StatusPage />);
    await signIn(user);
    await screen.findByTestId('owner-data');
    expect(sessionStorage.getItem('studyplan-ai:owner-token')).toBe('the-owner-token-123');
    first.unmount();

    render(<StatusPage />);
    expect(await screen.findByTestId('owner-data')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.queryByTestId('owner-data')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('studyplan-ai:owner-token')).toBeNull();
    expect(screen.getByLabelText('Token do dono')).toBeInTheDocument();
  });

  it('does not keep a stored token the server no longer accepts', async () => {
    sessionStorage.setItem('studyplan-ai:owner-token', 'stale-token-stale-token');
    route(() => json({ error: { code: 'X', message: 'no' } }, 401));
    render(<StatusPage />);
    expect(await screen.findByText('Token inválido.')).toBeInTheDocument();
    expect(sessionStorage.getItem('studyplan-ai:owner-token')).toBeNull();
  });

  it('renders every value as text, so a hostile IP or reason cannot inject markup', async () => {
    const user = userEvent.setup();
    route(() => json(usage({ ips: { date: '2026-03-10', rows: [{ ip: '<img src=x onerror="window.__xss=1">', requests: 1, plans: 0 }] } })));
    render(<StatusPage />);
    await signIn(user);
    await screen.findByTestId('owner-data');

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror="window.__xss=1">')).toBeInTheDocument();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});
