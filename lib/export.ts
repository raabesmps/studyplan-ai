import type { Language, Plan } from './schema';

const LABELS = {
  pt: { day: 'Dia', objective: 'Objetivo', topics: 'Tópicos', exercises: 'Exercícios', search: 'Buscar', minutes: 'Duração', min: 'min' },
  en: { day: 'Day', objective: 'Objective', topics: 'Topics', exercises: 'Exercises', search: 'Search', minutes: 'Duration', min: 'min' },
} as const;

/** Pure: turns a validated Plan into markdown. Does not escape HTML (renderers must). */
export function planToMarkdown(plan: Plan, language: Language = 'pt'): string {
  const t = LABELS[language];

  return plan.days
    .map((d) => {
      const lines = [
        `## ${t.day} ${d.day}: ${d.title}`,
        '',
        `**${t.objective}:** ${d.objective}`,
        '',
        `**${t.topics}:**`,
        ...d.topics.map((x) => `- ${x}`),
        '',
        `**${t.exercises}:**`,
        ...d.exercises.map((x) => `- ${x}`),
      ];
      if (d.resources.length > 0) {
        lines.push('', `**${t.search}:**`, ...d.resources.map((r) => `- ${r.title}: ${r.query}`));
      }
      lines.push('', `**${t.minutes}:** ${d.minutes} ${t.min}`);
      return lines.join('\n');
    })
    .join('\n\n');
}
