import { useSyncExternalStore } from 'react';
import { isLocale, MESSAGES, type Locale, type Messages } from './i18n';

const STORAGE_KEY = 'studyplan-ai:locale';
const CHANGE_EVENT = 'studyplan-ai:locale';

/** Stored choice first, then the browser language (English only if the browser asks for it). */
function getSnapshot(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'pt';
}

function getServerSnapshot(): Locale {
  return 'pt';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not persisted, still applied for this session below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Current locale plus its message dictionary. */
export function useT(): { t: Messages; locale: Locale } {
  const locale = useLocale();
  return { t: MESSAGES[locale], locale };
}
