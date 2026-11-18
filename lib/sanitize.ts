import type { Plan } from './schema';

/**
 * Text from outside the app (the model, the visitor, the browser's storage) is cleaned before it is
 * shown, exported or sent to a model. React already escapes what it renders, so this is defense in
 * depth: it removes what has no business in a study plan and what other consumers (a Markdown viewer,
 * a calendar app, a later prompt) could misread.
 */

// Hidden characters that change how text looks or is read without being visible: zero-width spaces,
// bidirectional overrides ("Trojan Source"), invisible math operators, the BOM, and the Unicode
// "tag" block, which can smuggle invisible instructions into a prompt. ZWJ/ZWNJ (U+200C/D) stay:
// emoji sequences and several scripts need them.
const INVISIBLE =
  /[؜​‎‏‪-‮⁠-⁤⁦-⁯﻿︀-︍\u{E0000}-\u{E007F}]/gu;
// C0 and C1 control characters, including line breaks and tabs (every plan field is single-line).
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
// <script> and <style> blocks go with their content: it is code, not text.
const CODE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
// Something that looks like an HTML tag, comment or doctype, even if it is never closed.
const HTML_MARKUP = /<!--[\s\S]*?(?:-->|$)|<\/?[a-zA-Z!?][^>]*(?:>|$)/g;

/** Returns single-line plain text: no markup, no control or invisible characters, collapsed spaces. */
export function cleanText(value: string, maxLength?: number): string {
  let text = value.normalize('NFC').replace(CONTROL, ' ').replace(INVISIBLE, '');
  // Removing a tag can expose another one ("<<b>b>"), so repeat until nothing changes.
  for (let previous = ''; previous !== text; ) {
    previous = text;
    text = text.replace(CODE_BLOCK, ' ').replace(HTML_MARKUP, ' ');
  }
  text = text.replace(/\s+/g, ' ').trim();
  return maxLength === undefined ? text : Array.from(text).slice(0, maxLength).join('').trim();
}

/** Cleans every text of a plan. Numbers and structure are left as they are. */
export function sanitizePlan(plan: Plan): Plan {
  return {
    ...plan,
    subject: cleanText(plan.subject),
    days: plan.days.map((day) => ({
      ...day,
      title: cleanText(day.title),
      objective: cleanText(day.objective),
      topics: day.topics.map((topic) => cleanText(topic)),
      exercises: day.exercises.map((exercise) => cleanText(exercise)),
      resources: day.resources.map((resource) => ({ title: cleanText(resource.title), query: cleanText(resource.query) })),
    })),
  };
}
