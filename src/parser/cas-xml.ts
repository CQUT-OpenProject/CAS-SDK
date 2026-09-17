import { CasError } from "../errors/cas-error.js";
import { parseXml, type XmlElement } from "./xml.js";

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
}
function fail(message: string): never {
  throw new CasError("VALIDATION_FAILED", message);
}
function children(node: XmlElement, name: string): XmlElement[] {
  return node.children.filter((child) => child.namespace === CAS_NAMESPACE && child.name === name);
}
function single(node: XmlElement, name: string): XmlElement | undefined {
  const matches = children(node, name);
  if (matches.length > 1) fail(`CAS validation contains multiple ${name} elements`);
  return matches[0];
}
function value(node: XmlElement): string {
  if (node.children.length) fail("CAS scalar field contains nested elements");
  return node.text.trim();
}

export function parseCasValidationResponse(xml: string): CasValidationSuccess {
  if (!xml || typeof xml !== "string") fail("CAS validation response is empty or non-string");
  if (new TextEncoder().encode(xml).length > MAX_CAS_VALIDATION_RESPONSE_BYTES)
    fail("CAS validation response exceeds maximum allowed size (64KB)");
  const root = parseXml(xml);
  if (root.name !== "serviceResponse" || root.namespace !== CAS_NAMESPACE || root.text.trim())
    fail("Invalid CAS serviceResponse root");
  const results = root.children.filter(
    (child) =>
      child.namespace === CAS_NAMESPACE &&
      ["authenticationSuccess", "authenticationFailure"].includes(child.name),
  );
  if (results.length !== 1 || root.children.length !== 1)
    fail("CAS response must contain exactly one authentication result");
  const result = results[0]!;
  if (result.name === "authenticationFailure") fail("CAS ticket validation failed");
  if (result.text.trim()) fail("Invalid CAS authenticationSuccess content");
  const userNode = single(result, "user");
  const user = userNode ? value(userNode) : "";
  if (!user) fail("CAS validation response missing or empty user");
  const uidNode = single(result, "uid");
  const uid = uidNode ? value(uidNode) : undefined;
  if (uid !== undefined && uid !== user)
    fail("CAS validation response contains conflicting user and uid identifiers");
  const attributes: Record<string, string> = Object.create(null);
  const block = single(result, "attributes");
  if (block) {
    if (block.text.trim()) fail("Invalid CAS attributes content");
    for (const child of block.children) {
      if (child.namespace !== CAS_NAMESPACE) continue;
      if (Object.hasOwn(attributes, child.name))
        fail("CAS validation contains duplicate attributes");
      attributes[child.name] = value(child);
    }
  }
  const userCode = attributes["user_code"];
  if (userCode !== undefined && userCode !== user)
    fail("CAS validation response contains conflicting user and user_code identifiers");
  const token = single(result, "authServerToken");
  return {
    success: true,
    user,
    uid,
    userCode,
    userName: attributes["user_name"],
    userType: attributes["user_user_type"],
    authServerToken: token ? value(token) : undefined,
    attributes,
  };
}
