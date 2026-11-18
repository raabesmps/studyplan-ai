import { AppError } from './errors';

/** Largest request body accepted. A valid plan request is well under 300 bytes. */
export const MAX_BODY_BYTES = 4096;

/**
 * Reads a JSON body without ever holding more than `maxBytes` of it: the declared length is checked
 * first, then the real bytes are counted while streaming (the header can be missing or lie).
 */
export async function readJsonBody(request: Request, maxBytes: number = MAX_BODY_BYTES): Promise<unknown> {
  const tooLarge = () => new AppError('INVALID_REQUEST', 'Requisição grande demais.', 413);
  const invalid = () => new AppError('INVALID_REQUEST', 'Requisição inválida.', 400);

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) throw invalid();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw invalid();
  }
}
