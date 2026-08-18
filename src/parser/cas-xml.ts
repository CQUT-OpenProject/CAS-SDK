import { CasError } from "../errors/cas-error.js";

export const CAS_NAMESPACE = "http://www.yale.edu/tp/cas";
export const MAX_CAS_VALIDATION_RESPONSE_BYTES = 64 * 1024;

export interface CasValidationSuccess {
  success: true;
  user: string;
  uid?: string | undefined;
  userCode?: string | undefined;
  userName?: string | undefined;
  userType?: string | undefined;
  authServerToken?: string | undefined;
  attributes: Record<string, string>;
  rawXml: string;
}

/**
 * Parses and validates CAS 2.0 XML service validation responses safely.
 * Features:
 * - Zero external dependencies (pure TypeScript)
 * - Strict XXE / Doctype rejection
 * - 64KB response size safety limit
 * - Strict single-result and identifier consistency verification
 */
export function parseCasValidationResponse(xml: string): CasValidationSuccess {
  if (!xml || typeof xml !== "string") {
    throw new CasError("VALIDATION_FAILED", "CAS validation response is empty or non-string");
  }

  const byteLength = new TextEncoder().encode(xml).length;
  if (byteLength > MAX_CAS_VALIDATION_RESPONSE_BYTES) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response exceeds maximum allowed size (64KB)",
    );
  }

  if (/<!DOCTYPE/i.test(xml)) {
    throw new CasError("VALIDATION_FAILED", "CAS validation response must not contain a doctype");
  }

  // Check for authenticationFailure
  const failureMatch = xml.match(
    /<(?:[a-zA-Z0-9_]+:)?authenticationFailure(?:\s+code="([^"]*)")?[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?authenticationFailure>/i,
  );
  if (failureMatch) {
    const code = failureMatch[1]?.trim();
    const msg = failureMatch[2]?.trim() || "Authentication failure";
    throw new CasError(
      "VALIDATION_FAILED",
      `CAS ticket validation failed: ${code ?? "UNKNOWN"} - ${msg}`,
      {
        rawResponse: xml,
      },
    );
  }

  // Check for authenticationSuccess
  const successMatches = xml.match(/<(?:[a-zA-Z0-9_]+:)?authenticationSuccess[\s>]/gi);
  if (!successMatches || successMatches.length !== 1) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response does not contain a unique authenticationSuccess block",
      { rawResponse: xml },
    );
  }

  // Extract <cas:user>
  const userMatches = [
    ...xml.matchAll(/<(?:[a-zA-Z0-9_]+:)?user[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?user>/gi),
  ];
  if (userMatches.length !== 1 || !userMatches[0]?.[1]?.trim()) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response missing or multiple <user> elements",
      { rawResponse: xml },
    );
  }
  const user = normalizeCasIdentifier(userMatches[0][1]);

  // Extract optional <cas:uid>
  const uidMatches = [
    ...xml.matchAll(/<(?:[a-zA-Z0-9_]+:)?uid[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?uid>/gi),
  ];
  if (uidMatches.length > 1) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response contains multiple <uid> elements",
    );
  }
  let uid: string | undefined;
  if (uidMatches.length === 1 && uidMatches[0]?.[1]?.trim()) {
    uid = normalizeCasIdentifier(uidMatches[0][1]);
    if (uid !== user) {
      throw new CasError(
        "VALIDATION_FAILED",
        "CAS validation response contains conflicting user and uid identifiers",
      );
    }
  }

  // Extract attributes block
  const attributes: Record<string, string> = {};
  const attrBlockMatch = xml.match(
    /<(?:[a-zA-Z0-9_]+:)?attributes[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?attributes>/i,
  );
  if (attrBlockMatch?.[1]) {
    const attrInner = attrBlockMatch[1];
    const tagRegex =
      /<(?:[a-zA-Z0-9_]+:)?([a-zA-Z0-9_-]+)[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?\1>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(attrInner)) !== null) {
      const key = match[1];
      const val = match[2]?.trim() ?? "";
      if (key) {
        attributes[key] = val;
      }
    }
  }

  // Check user_code in attributes if present
  const userCode = attributes["user_code"];
  if (userCode) {
    const normalizedUserCode = normalizeCasIdentifier(userCode);
    if (normalizedUserCode !== user) {
      throw new CasError(
        "VALIDATION_FAILED",
        "CAS validation response contains conflicting user and user_code identifiers",
      );
    }
  }

  // Extract optional <cas:authServerToken>
  const tokenMatch = xml.match(
    /<(?:[a-zA-Z0-9_]+:)?authServerToken[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?authServerToken>/i,
  );
  const authServerToken = tokenMatch?.[1]?.trim();

  return {
    success: true,
    user,
    uid,
    userCode,
    userName: attributes["user_name"],
    userType: attributes["user_user_type"],
    authServerToken,
    attributes,
    rawXml: xml,
  };
}

function normalizeCasIdentifier(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    throw new CasError("VALIDATION_FAILED", "CAS validation response contains an empty identifier");
  }
  return normalized;
}
