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
  announce: {
    generating: 'Gerando plano de estudos…',
    generated: (subject: string, days: number) => `Plano de ${subject} gerado com ${days} dias.`,
    failed: 'Não foi possível gerar o plano.',
  },
  footer: { poweredBy: 'Feito com a API do Google Gemini' },
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
  announce: {
    generating: 'Generating study plan…',
    generated: (subject: string, days: number) => `Plan for ${subject} generated with ${days} days.`,
    failed: 'Could not generate the plan.',
  },
  footer: { poweredBy: 'Built with the Google Gemini API' },
};

export const MESSAGES: Record<Locale, Messages> = { pt, en };

export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'medium' }).format(date);
}
