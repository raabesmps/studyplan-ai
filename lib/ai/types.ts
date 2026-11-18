import type { ProviderName } from '../env';

export type { ProviderName };

export interface StreamRequest {
  prompt: string;
  /** Aborts the upstream request too (e.g. the visitor pressed Cancel). */
  signal?: AbortSignal;
  /** Time budget for this call, in milliseconds. */
  timeoutMs: number;
  /** Receives the text generated so far, every time it grows. */
  onText: (textSoFar: string) => void;
}

/**
 * One AI backend. `stream` resolves with the full generated text, or throws an AppError
 * (never a raw upstream error: those may carry messages that must not reach the visitor).
 */
export interface AiProvider {
  readonly name: ProviderName;
  stream(request: StreamRequest): Promise<string>;
}
