export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'INVALID_RESPONSE'
  | 'CONFIG_ERROR'
  | 'INTERNAL';

/**
 * Why an AI provider failed, for operators only (the status page). Never sent to visitors, because
 * some of these ("billing") describe the account behind the app.
 */
export type FailureReason = 'billing' | 'auth' | 'rate_limit' | 'overloaded' | 'timeout' | 'invalid_response' | 'unknown';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Seconds the caller should wait before retrying (rate limiting). */
  readonly retryAfter?: number;
  /** Operator-facing cause of an upstream failure; not part of the public error body. */
  readonly reason?: FailureReason;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    options?: { cause?: unknown; retryAfter?: number; reason?: FailureReason }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryAfter = options?.retryAfter;
    this.reason = options?.reason;
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

/** The operator-facing reason of any failure, with a sensible default per error code. */
export function failureReason(error: unknown): FailureReason {
  if (error instanceof AppError) {
    if (error.reason) return error.reason;
    if (error.code === 'RATE_LIMITED') return 'rate_limit';
    if (error.code === 'INVALID_RESPONSE') return 'invalid_response';
  }
  return 'unknown';
}
