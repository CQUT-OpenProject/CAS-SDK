import { CasError, type CasErrorKind } from "../errors/cas-error.js";
import type { HttpResponse } from "./types.js";

export const MAX_RESPONSE_BYTES = 64 * 1024;

export function abortError(signal: AbortSignal, step: string): CasError {
  return new CasError(
    signal.reason?.name === "TimeoutError" ? "TIMEOUT" : "ABORTED",
    `${step}: request cancelled`,
    { step, cause: signal.reason },
  );
}

export function deadline(signal?: AbortSignal, timeoutMs = 30_000): AbortSignal {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new CasError("CONFIGURATION_ERROR", "timeoutMs must be a positive 32-bit integer");
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Also bounds custom adapters that cannot promptly cancel their own work. */
export async function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal,
  step: string,
): Promise<T> {
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError(signal, step));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function discard(response: HttpResponse): void {
  void response.body?.cancel().catch(() => {});
}

export async function readResponse(
  response: HttpResponse,
  signal: AbortSignal,
  step: string,
  kind: CasErrorKind,
): Promise<string> {
  if (signal.aborted) {
    discard(response);
    throw abortError(signal, step);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal, step);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new CasError(kind, `${step}: response exceeds 64 KiB`, {
          step,
          status: response.status,
        });
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(bytes);
  } catch (cause) {
    void reader.cancel().catch(() => {});
    if (cause instanceof CasError) throw cause;
    throw new CasError("NETWORK_ERROR", `${step}: response read failed`, { step, cause });
  } finally {
    reader.releaseLock();
  }
}

export async function retryDelay(signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await abortable(
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 250);
      }),
      signal,
      "fetchLoginPage",
    );
  } finally {
    clearTimeout(timer);
  }
}
