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

  constructor(code: ErrorCode, message: string, status: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

const INTERNAL_MESSAGE = 'Algo deu errado. Tente novamente.';

/** Converts any thrown value into a safe, public error body. Never leaks raw upstream messages. */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } },
  };
}
