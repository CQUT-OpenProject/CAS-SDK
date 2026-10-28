import { CasError } from "../errors/cas-error.js";

export const MIN_SUBJECT_SECRET_BYTES = 32;

export interface SubjectOptions {
  /** At least 32 bytes. Rotating it changes every subject. */
  readonly secret: string | Uint8Array;
  /** Use a distinct namespace per application to prevent cross-application correlation. */
  readonly namespace?: string | undefined;
}

export type SubjectDeriver = (schoolUid: string) => Promise<string>;

/** Derives base64url(HMAC-SHA256(secret, JSON ["namespace", "cqut", schoolUid])). */
export function createSubjectDeriver(options: SubjectOptions): SubjectDeriver {
  const secret =
    typeof options.secret === "string" ? new TextEncoder().encode(options.secret) : options.secret;
  if (!(secret instanceof Uint8Array) || secret.byteLength < MIN_SUBJECT_SECRET_BYTES)
    throw new CasError(
      "CONFIGURATION_ERROR",
      `subject secret must be at least ${MIN_SUBJECT_SECRET_BYTES} bytes`,
    );
  const namespace = options.namespace ?? "default";
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new CasError("CONFIGURATION_ERROR", "WebCrypto is not available");
  // Copy so later mutation of the caller's buffer cannot change derived subjects.
  const key = subtle.importKey("raw", secret.slice(), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  // Surface import failures on first use rather than as an unhandled rejection.
  key.catch(() => {});
  return async (schoolUid) => {
    const message = new TextEncoder().encode(JSON.stringify([namespace, "cqut", schoolUid]));
    return base64Url(new Uint8Array(await subtle.sign("HMAC", await key, message)));
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
