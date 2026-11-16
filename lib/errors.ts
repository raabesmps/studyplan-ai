export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'INVALID_RESPONSE'
  | 'CONFIG_ERROR'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Seconds the caller should wait before retrying (rate limiting). */
  readonly retryAfter?: number;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    options?: { cause?: unknown; retryAfter?: number }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryAfter = options?.retryAfter;
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; retryAfter?: number };
}

const INTERNAL_MESSAGE = 'Algo deu errado. Tente novamente.';

/** Converts any thrown value into a safe, public error body. Never leaks raw upstream messages. */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    const error: ErrorBody['error'] = { code: err.code, message: err.message };
    if (err.retryAfter !== undefined) error.retryAfter = err.retryAfter;
    return { status: err.status, body: { error } };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } },
  };
}
