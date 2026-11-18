import type { ErrorCode } from './errors';

export const LOCALES = ['pt', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

const pt = {
  skipToContent: 'Ir para o conteúdo',
  header: {
    language: 'Idioma da interface',
    themeToLight: 'Mudar para o tema claro',
    themeToDark: 'Mudar para o tema escuro',
  },
  hero: {
    title: 'Planos de estudo que você pode marcar como feitos',
    text: 'Diga o que quer aprender e em quantos dias. A IA monta o roteiro; você acompanha o progresso.',
  },
  form: {
    title: 'Novo plano',
    subject: 'O que você quer aprender?',
    subjectPlaceholder: 'Ex.: SQL, violão, Next.js',
    hours: 'Horas por dia',
    days: 'Duração (dias)',
    level: 'Seu nível',
    planLanguage: 'Idioma do plano',
    submit: 'Gerar plano',
    submitting: 'Gerando plano…',
  },
  levels: { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' },
  languages: { pt: 'Português', en: 'English' },
  plan: {
    hoursPerDay: (h: number) => `${h}h por dia`,
    daysCount: (n: number) => (n === 1 ? '1 dia' : `${n} dias`),
    copy: 'Copiar como Markdown',
    copied: 'Copiado!',
    autosaved: 'Salvo automaticamente neste navegador.',
    close: 'Fechar plano',
  },
  export: {
    markdown: 'Baixar .md',
    print: 'Salvar como PDF',
    calendar: 'Adicionar ao calendário',
    startDate: 'Primeiro dia',
    startTime: 'Horário',
    download: 'Baixar arquivo .ics',
    help: 'Cria um evento por dia, no horário escolhido, com a duração estimada. Importe o arquivo no Google Agenda ou no app Calendário da Apple.',
  },
  progress: {
    label: 'Progresso do plano',
    summary: (done: number, total: number) =>
      `${done} de ${total} ${total === 1 ? 'dia concluído' : 'dias concluídos'}`,
  },
  day: {
    label: (n: number) => `Dia ${n}`,
    markDone: 'Marcar dia como concluído',
    done: 'Dia concluído',
    topics: 'Tópicos',
    exercises: 'Exercícios',
    search: 'Onde buscar',
    opensSearch: '(abre uma busca em nova aba)',
    duration: (min: number) => `Duração estimada: ${min} min`,
    topicsOf: (n: number) => `Tópicos do dia ${n}`,
    exercisesOf: (n: number) => `Exercícios do dia ${n}`,
    searchOf: (n: number) => `Onde buscar no dia ${n}`,
  },
  saved: {
    title: 'Meus planos',
    progress: (done: number, total: number) => `${done} de ${total} dias`,
    delete: (subject: string) => `Excluir plano ${subject}`,
    deleteLegacy: (subject: string) => `Excluir plano legado ${subject}`,
    confirmDelete: 'Excluir este plano? Essa ação não pode ser desfeita.',
    legacyBadge: 'Legado, somente leitura',
  },
  legacy: {
    note: 'Este plano foi criado numa versão anterior e não tem checklist de progresso. Gere um novo plano para acompanhar seus estudos.',
  },
  empty: {
    title: 'Seu roteiro aparece aqui',
    text: 'Preencha o formulário e gere o primeiro plano. Cada dia vira um passo que você pode marcar como concluído.',
  },
  errors: {
    INVALID_REQUEST: 'Confira os campos do formulário e tente de novo.',
    RATE_LIMITED: 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.',
    UPSTREAM_FAILED: 'O serviço de IA não respondeu. Tente de novo em instantes.',
    INVALID_RESPONSE: 'A IA devolveu um plano fora do formato esperado. Gere de novo.',
    CONFIG_ERROR: 'O serviço não está configurado. Avise quem mantém o app.',
    INTERNAL: 'Algo deu errado. Tente de novo.',
    network: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
    generic: 'Não foi possível gerar o plano. Tente de novo.',
  } satisfies Record<ErrorCode | 'network' | 'generic', string>,
  retry: 'Tentar de novo',
  retryIn: (minutes: number) => `Tente de novo em ${minutes} min.`,
  providers: { claude: 'Claude', gemini: 'Gemini' },
  notice: {
    switched: (from: string, to: string) =>
      `Este plano foi gerado com o ${to}, porque o ${from} estava indisponível no momento.`,
    demo: {
      'demo-mode':
        'Modo demonstração: este é um plano de exemplo, não foi gerado para o seu assunto. Ele tem no máximo 5 dias.',
      'daily-limit':
        'O limite diário de planos gerados por IA foi atingido, então este é um plano de exemplo (no máximo 5 dias). Volte amanhã para gerar o seu.',
    },
  },
  generating: {
    title: (subject: string) => `Montando o plano de ${subject}`,
    switching: (from: string, to: string) => `O ${from} não respondeu. Gerando com o ${to}…`,
    preparing: 'Preparando o roteiro…',
    writing: (day: number, total: number) => `Escrevendo o dia ${day} de ${total}…`,
    adjusting: 'Ajustando o formato do plano…',
    cancel: 'Cancelar',
    cancelled: 'Geração cancelada. O que você digitou foi mantido.',
  },
  announce: {
    generating: 'Gerando plano de estudos…',
    generated: (subject: string, days: number) => `Plano de ${subject} gerado com ${days} dias.`,
    failed: 'Não foi possível gerar o plano.',
    cancelled: 'Geração cancelada.',
  },
  status: {
    title: 'Status do serviço',
    intro: 'Se esta página abriu, o site está no ar. Abaixo, as APIs de que ele depende.',
    back: 'Voltar ao app',
    refresh: 'Atualizar',
    checking: 'Verificando…',
    checkedAt: (time: string) => `Verificado às ${time}`,
    services: 'Serviços',
    names: {
      site: 'Site',
      claude: 'Claude (Anthropic)',
      gemini: 'Gemini (Google)',
      redis: 'Upstash Redis (limites e uso)',
    },
    states: { up: 'Operacional', degraded: 'Degradado', down: 'Fora do ar', not_configured: 'Não configurado' },
    ms: (value: number) => `${value} ms`,
    budgetSpent:
      'O limite diário de planos por IA foi atingido: até a meia-noite (UTC) os visitantes recebem planos de exemplo.',
    loadFailed: 'Não foi possível consultar o status agora. Tente de novo em instantes.',
    owner: {
      title: 'Painel do dono',
      intro: 'Uso por dia, gasto estimado e saúde dos provedores. Só abre com o token do dono.',
      token: 'Token do dono',
      unlock: 'Entrar',
      lock: 'Sair',
      working: 'Entrando…',
      denied: 'Token inválido.',
      lockedOut: 'Muitas tentativas erradas. Tente de novo mais tarde.',
      unavailable: 'O painel do dono não está ativado neste servidor.',
      failed: 'Não foi possível carregar os dados. Tente de novo.',
      today: 'Hoje (UTC)',
      requests: 'Requisições',
      plans: 'Planos por IA',
      samples: 'Planos de exemplo',
      blocked: 'Bloqueadas pelo limite',
      errors: 'Erros',
      failovers: 'Trocas de provedor',
      spend: 'Gasto estimado',
      budget: (used: number, limit: number) => `${used} de ${limit} planos do teto diário`,
      daily: 'Por dia',
      day: 'Dia',
      tokens: 'Tokens (entrada / saída)',
      claudePlans: 'Claude',
      geminiPlans: 'Gemini',
      totalRow: 'Total do período',
      providers: 'Provedores de IA: última falha e último plano entregue',
      lastFailure: 'Última falha',
      lastSuccess: 'Último plano',
      never: 'nunca',
      estimateNote: (model: string) =>
        `Estimativa com o preço de lista do ${model}. O Gemini é contado como gratuito. A cobrança real está no console da Anthropic.`,
      unknownPrice: 'O modelo não está na tabela de preços: o valor usa o preço do Haiku e é só um palpite.',
      serviceDetail: 'Detalhe dos serviços (só o dono vê o motivo)',
    },
    reasons: {
      billing: 'saldo ou cobrança',
      auth: 'chave recusada',
      rate_limit: 'limite de uso do provedor',
      overloaded: 'provedor sobrecarregado',
      timeout: 'tempo esgotado',
      invalid_response: 'resposta fora do formato',
      unknown: 'motivo desconhecido',
      unreachable: 'sem conexão',
    },
  },
  footer: {
    // {claude} and {gemini} are replaced by links to each provider.
    madeWith: 'Feito com a API do {claude} e a API do {gemini}',
    privacy:
      'Para limitar abusos, seu IP é guardado só como um código embaralhado (hash), por no máximo 1 hora. Seus planos ficam apenas no seu navegador. A Vercel conta as visitas de forma anônima, sem cookies.',
    status: 'Status do serviço',
  },
};

export type Messages = typeof pt;

const en: Messages = {
  skipToContent: 'Skip to content',
  header: {
    language: 'Interface language',
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
  },
  hero: {
    title: 'Study plans you can check off',
    text: 'Say what you want to learn and how many days you have. The AI lays out the route; you track the progress.',
  },
  form: {
    title: 'New plan',
    subject: 'What do you want to learn?',
    subjectPlaceholder: 'e.g. SQL, guitar, Next.js',
    hours: 'Hours per day',
    days: 'Length (days)',
    level: 'Your level',
    planLanguage: 'Plan language',
    submit: 'Generate plan',
    submitting: 'Generating plan…',
  },
  levels: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
  languages: { pt: 'Português', en: 'English' },
  plan: {
    hoursPerDay: (h: number) => `${h}h per day`,
    daysCount: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    copy: 'Copy as Markdown',
    copied: 'Copied!',
    autosaved: 'Saved automatically in this browser.',
    close: 'Close plan',
  },
  export: {
    markdown: 'Download .md',
    print: 'Save as PDF',
    calendar: 'Add to calendar',
    startDate: 'First day',
    startTime: 'Time',
    download: 'Download .ics file',
    help: 'Creates one event per day at the chosen time, using the estimated duration. Import the file into Google Calendar or the Apple Calendar app.',
  },
  progress: {
    label: 'Plan progress',
    summary: (done: number, total: number) => `${done} of ${total} ${total === 1 ? 'day' : 'days'} done`,
  },
  day: {
    label: (n: number) => `Day ${n}`,
    markDone: 'Mark day as done',
    done: 'Day done',
    topics: 'Topics',
    exercises: 'Exercises',
    search: 'Where to look',
    opensSearch: '(opens a search in a new tab)',
    duration: (min: number) => `Estimated time: ${min} min`,
    topicsOf: (n: number) => `Topics for day ${n}`,
    exercisesOf: (n: number) => `Exercises for day ${n}`,
    searchOf: (n: number) => `Where to look on day ${n}`,
  },
  saved: {
    title: 'My plans',
    progress: (done: number, total: number) => `${done} of ${total} days`,
    delete: (subject: string) => `Delete plan ${subject}`,
    deleteLegacy: (subject: string) => `Delete legacy plan ${subject}`,
    confirmDelete: 'Delete this plan? This cannot be undone.',
    legacyBadge: 'Legacy, read only',
  },
  legacy: {
    note: 'This plan was created in an earlier version and has no progress checklist. Generate a new plan to track your studies.',
  },
  empty: {
    title: 'Your route shows up here',
    text: 'Fill in the form and generate your first plan. Each day becomes a step you can mark as done.',
  },
  errors: {
    INVALID_REQUEST: 'Check the form fields and try again.',
    RATE_LIMITED: 'Too many attempts in a short time. Wait a moment and try again.',
    UPSTREAM_FAILED: 'The AI service did not respond. Try again in a moment.',
    INVALID_RESPONSE: 'The AI returned a plan in an unexpected format. Generate it again.',
    CONFIG_ERROR: 'The service is not configured. Let whoever runs the app know.',
    INTERNAL: 'Something went wrong. Try again.',
    network: 'Cannot reach the server. Check your connection and try again.',
    generic: 'Could not generate the plan. Try again.',
  },
  retry: 'Try again',
  retryIn: (minutes: number) => `Try again in ${minutes} min.`,
  providers: { claude: 'Claude', gemini: 'Gemini' },
  notice: {
    switched: (from: string, to: string) =>
      `This plan was generated with ${to} because ${from} was unavailable at the moment.`,
    demo: {
      'demo-mode': 'Demo mode: this is a sample plan, not one generated for your subject. It has at most 5 days.',
      'daily-limit':
        "Today's limit of AI-generated plans has been reached, so this is a sample plan (at most 5 days). Come back tomorrow to generate yours.",
    },
  },
  generating: {
    title: (subject: string) => `Building the plan for ${subject}`,
    switching: (from: string, to: string) => `${from} did not respond. Generating with ${to}…`,
    preparing: 'Preparing the route…',
    writing: (day: number, total: number) => `Writing day ${day} of ${total}…`,
    adjusting: 'Adjusting the plan format…',
    cancel: 'Cancel',
    cancelled: 'Generation cancelled. What you typed was kept.',
  },
  announce: {
    generating: 'Generating study plan…',
    generated: (subject: string, days: number) => `Plan for ${subject} generated with ${days} days.`,
    failed: 'Could not generate the plan.',
    cancelled: 'Generation cancelled.',
  },
  status: {
    title: 'Service status',
    intro: 'If this page opened, the site is up. Below are the APIs it depends on.',
    back: 'Back to the app',
    refresh: 'Refresh',
    checking: 'Checking…',
    checkedAt: (time: string) => `Checked at ${time}`,
    services: 'Services',
    names: {
      site: 'Site',
      claude: 'Claude (Anthropic)',
      gemini: 'Gemini (Google)',
      redis: 'Upstash Redis (limits and usage)',
    },
    states: { up: 'Operational', degraded: 'Degraded', down: 'Down', not_configured: 'Not configured' },
    ms: (value: number) => `${value} ms`,
    budgetSpent:
      "Today's limit of AI-generated plans has been reached: until midnight (UTC) visitors get sample plans.",
    loadFailed: 'Could not read the status right now. Try again in a moment.',
    owner: {
      title: 'Owner panel',
      intro: "Usage per day, estimated spend and provider health. It opens only with the owner's token.",
      token: 'Owner token',
      unlock: 'Sign in',
      lock: 'Sign out',
      working: 'Signing in…',
      denied: 'Invalid token.',
      lockedOut: 'Too many wrong attempts. Try again later.',
      unavailable: 'The owner panel is not enabled on this server.',
      failed: 'Could not load the data. Try again.',
      today: 'Today (UTC)',
      requests: 'Requests',
      plans: 'AI plans',
      samples: 'Sample plans',
      blocked: 'Blocked by the limit',
      errors: 'Errors',
      failovers: 'Provider switches',
      spend: 'Estimated spend',
      budget: (used: number, limit: number) => `${used} of ${limit} plans of the daily cap`,
      daily: 'By day',
      day: 'Day',
      tokens: 'Tokens (in / out)',
      claudePlans: 'Claude',
      geminiPlans: 'Gemini',
      totalRow: 'Period total',
      providers: 'AI providers: last failure and last plan delivered',
      lastFailure: 'Last failure',
      lastSuccess: 'Last plan',
      never: 'never',
      estimateNote: (model: string) =>
        `Estimate using the list price of ${model}. Gemini is counted as free. The real bill is in the Anthropic console.`,
      unknownPrice: 'The model is not in the price table: the figure uses the Haiku price and is only a guess.',
      serviceDetail: 'Service detail (only the owner sees the reason)',
    },
    reasons: {
      billing: 'balance or billing',
      auth: 'key rejected',
      rate_limit: 'provider usage limit',
      overloaded: 'provider overloaded',
      timeout: 'timed out',
      invalid_response: 'answer in the wrong format',
      unknown: 'unknown reason',
      unreachable: 'no connection',
    },
  },
  footer: {
    // {claude} and {gemini} are replaced by links to each provider.
    madeWith: 'Built with the {claude} API and the {gemini} API',
    privacy:
      'To limit abuse, your IP is kept only as a scrambled code (a hash), for at most 1 hour. Your plans stay only in your browser. Vercel counts visits anonymously, without cookies.',
    status: 'Service status',
  },
};

export const MESSAGES: Record<Locale, Messages> = { pt, en };

export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'medium' }).format(date);
}
