import { isExerciseDone, type Completed } from './progress';
import type { Language, Plan } from './schema';

const LABELS = {
  pt: {
    day: 'Dia',
    objective: 'Objetivo',
    topics: 'Tópicos',
    exercises: 'Exercícios',
    search: 'Buscar',
    minutes: 'Duração',
    min: 'min',
  },
  en: {
    day: 'Day',
    objective: 'Objective',
    topics: 'Topics',
    exercises: 'Exercises',
    search: 'Search',
    minutes: 'Duration',
    min: 'min',
  },
} as const;

// --- Markdown ---

/**
 * Pure: turns a validated Plan into markdown. Exercises become a task list, checked when
 * `completed` says so. Does not escape HTML (renderers must).
 */
export function planToMarkdown(plan: Plan, language: Language = 'pt', completed: Completed = {}): string {
  const t = LABELS[language];

  const days = plan.days.map((d) => {
    const lines = [
      `## ${t.day} ${d.day}: ${d.title}`,
      '',
      `**${t.objective}:** ${d.objective}`,
      '',
      `**${t.topics}:**`,
      ...d.topics.map((x) => `- ${x}`),
      '',
      `**${t.exercises}:**`,
      ...d.exercises.map((x, i) => `- [${isExerciseDone(completed, d, i) ? 'x' : ' '}] ${x}`),
    ];
    if (d.resources.length > 0) {
      lines.push('', `**${t.search}:**`, ...d.resources.map((r) => `- ${r.title}: ${r.query}`));
    }
    lines.push('', `**${t.minutes}:** ${d.minutes} ${t.min}`);
    return lines.join('\n');
  });

  return [`# ${plan.subject}`, ...days].join('\n\n') + '\n';
}

// --- iCalendar (RFC 5545) ---

export interface IcsOptions {
  /** First day of the plan, `YYYY-MM-DD`. */
  startDate: string;
  /** Time of day for every event, `HH:mm`. */
  startTime: string;
  /** Stable seed for event UIDs (the saved plan id), so re-importing updates instead of duplicating. */
  uidSeed: string;
  language?: Language;
  /** Injectable clock for DTSTAMP, to keep output deterministic in tests. */
  now?: Date;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_LINE_OCTETS = 75;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `YYYYMMDDTHHMMSS` from the UTC fields of `date`. Used both for floating and (with Z) UTC times. */
function formatDateTime(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/**
 * Reads a wall-clock date and time into a Date whose UTC fields hold that wall-clock time.
 * Day arithmetic on it never crosses a DST boundary, and the output is written as a
 * "floating" time, so every calendar shows it at the same local time.
 */
function parseWallClock(date: string, time: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new RangeError('Invalid start date or time');

  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  const result = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const valid =
    result.getUTCFullYear() === year &&
    result.getUTCMonth() === month - 1 &&
    result.getUTCDate() === day &&
    hour < 24 &&
    minute < 60;
  if (!valid) throw new RangeError('Invalid start date or time');
  return result;
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets (UTF-8), never splitting a character. */
function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;

  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward the limit.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Pure: one all-day-agnostic timed event per plan day, as an .ics document (CRLF line endings). */
export function planToIcs(plan: Plan, options: IcsOptions): string {
  const { startDate, startTime, uidSeed, language = 'pt', now = new Date() } = options;
  const t = LABELS[language];
  const first = parseWallClock(startDate, startTime);
  const stamp = `${formatDateTime(now)}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyPlan AI//Study plan//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(plan.subject)}`,
  ];

  for (const day of plan.days) {
    const start = new Date(first.getTime() + (day.day - 1) * DAY_MS);
    const end = new Date(start.getTime() + day.minutes * MINUTE_MS);
    const description = [
      `${t.objective}: ${day.objective}`,
      '',
      `${t.exercises}:`,
      ...day.exercises.map((x) => `- ${x}`),
    ].join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidSeed}-day-${day.day}@studyplan-ai`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatDateTime(start)}`,
      `DTEND:${formatDateTime(end)}`,
      `SUMMARY:${escapeText(`${plan.subject} - ${t.day} ${day.day}/${plan.days.length}: ${day.title}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

// --- File names ---

/** `my-subject.ext`, safe on every OS: accents stripped, only [a-z0-9-]. */
export function exportFilename(subject: string, extension: string): string {
  const slug = subject
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return `${slug || 'study-plan'}.${extension}`;
}
