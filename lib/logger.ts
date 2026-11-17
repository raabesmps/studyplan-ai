const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  info: (...args: unknown[]): void => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (isDev) console.error(...args);
  },
  /** Always logged (also in production), for operators: e.g. the limiter is down. Never pass secrets. */
  alert: (message: string, cause?: unknown): void => {
    console.error(`[studyplan] ${message}`, cause instanceof Error ? cause.message : '');
  },
};
