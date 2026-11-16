import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'studyplan-ai:theme';
const CHANGE_EVENT = 'studyplan-ai:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The explicit choice lives on <html data-theme>; without one, the OS preference decides. */
function getSnapshot(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function getServerSnapshot(): Theme {
  return 'light';
}

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    media.removeEventListener('change', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted, still applied for this session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
