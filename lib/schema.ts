import { z } from 'zod';

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const LANGUAGES = ['pt', 'en'] as const;

export const Level = z.enum(LEVELS);
export const Language = z.enum(LANGUAGES);

/** A learning resource. `query` is a search term, never a URL (models invent URLs). */
export const Resource = z.object({
  title: z.string().min(1),
  query: z.string().min(1),
});

export const Day = z.object({
  day: z.number().int().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1),
  exercises: z.array(z.string().min(1)).min(1),
  resources: z.array(Resource).max(3),
  minutes: z.number().int().min(15),
});

export const Plan = z.object({
  subject: z.string().min(1),
  level: Level,
  days: z.array(Day).min(1),
});

export type Level = z.infer<typeof Level>;
export type Language = z.infer<typeof Language>;
export type Resource = z.infer<typeof Resource>;
export type Day = z.infer<typeof Day>;
export type Plan = z.infer<typeof Plan>;

export const SUBJECT_MAX_LENGTH = 100;

/** Body accepted by POST /api/generate-plan. Messages are user-facing (pt-BR). */
export const PlanRequest = z.object({
  subject: z
    .string({ error: 'Informe o assunto.' })
    .trim()
    .min(1, 'Informe o assunto.')
    .max(SUBJECT_MAX_LENGTH, `O assunto deve ter no máximo ${SUBJECT_MAX_LENGTH} caracteres.`),
  hoursPerDay: z
    .number({ error: 'Informe as horas por dia.' })
    .min(1, 'Horas por dia deve ser entre 1 e 24.')
    .max(24, 'Horas por dia deve ser entre 1 e 24.'),
  days: z
    .number({ error: 'Número de dias inválido.' })
    .int('Número de dias inválido.')
    .min(1, 'Número de dias deve ser entre 1 e 30.')
    .max(30, 'Número de dias deve ser entre 1 e 30.')
    .default(7),
  level: z.enum(LEVELS, { error: 'Nível inválido.' }).default('beginner'),
  language: z.enum(LANGUAGES, { error: 'Idioma inválido.' }).default('pt'),
});

export type PlanRequest = z.infer<typeof PlanRequest>;

export type PlanValidation = { ok: true; plan: Plan } | { ok: false; error: string };

const MAX_ERROR_LENGTH = 1000;

/**
 * Validates untrusted model output: shape (Zod), day count and sequential numbering.
 * Pure, so it is easy to unit test.
 */
export function validatePlan(raw: unknown, expectedDays: number): PlanValidation {
  const parsed = Plan.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error).slice(0, MAX_ERROR_LENGTH) };
  }

  const { days } = parsed.data;
  if (days.length !== expectedDays) {
    return { ok: false, error: `Expected exactly ${expectedDays} days but got ${days.length}.` };
  }
  const outOfOrder = days.findIndex((d, i) => d.day !== i + 1);
  if (outOfOrder !== -1) {
    return { ok: false, error: `Day numbers must be sequential from 1; item ${outOfOrder + 1} has day ${days[outOfOrder].day}.` };
  }

  return { ok: true, plan: parsed.data };
}
