import { LEVELS } from './schema';

/**
 * Hand-written `responseSchema` for Gemini (an OpenAPI subset, not full JSON Schema).
 * It only guides the model; `Plan.safeParse` in lib/schema.ts stays the source of truth.
 */
export const geminiPlanSchema = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    level: { type: 'string', enum: [...LEVELS] },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          title: { type: 'string' },
          objective: { type: 'string' },
          topics: { type: 'array', items: { type: 'string' } },
          exercises: { type: 'array', items: { type: 'string' } },
          resources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                query: { type: 'string' },
              },
              required: ['title', 'query'],
            },
          },
          minutes: { type: 'integer' },
        },
        required: ['day', 'title', 'objective', 'topics', 'exercises', 'resources', 'minutes'],
      },
    },
  },
  required: ['subject', 'level', 'days'],
} as const;
