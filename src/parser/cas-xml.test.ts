import assert from "node:assert/strict";
import test from "node:test";
import { CasError } from "../errors/cas-error.js";
import { parseCasValidationResponse } from "./cas-xml.js";

test("parseCasValidationResponse parses valid CAS 2.0 success response", () => {
  const xml = `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
    <cas:authenticationSuccess>
      <cas:user>2021123456</cas:user>
      <cas:uid>2021123456</cas:uid>
      <cas:authServerToken>token-abc-123</cas:authServerToken>
      <cas:attributes>
        <cas:user_code>2021123456</cas:user_code>
        <cas:user_name>测试用户</cas:user_name>
        <cas:user_user_type>3</cas:user_user_type>
      </cas:attributes>
    </cas:authenticationSuccess>
  </cas:serviceResponse>`;

  const result = parseCasValidationResponse(xml);
  assert.equal(result.success, true);
  assert.equal(result.user, "2021123456");
  assert.equal(result.uid, "2021123456");
  assert.equal(result.userCode, "2021123456");
  assert.equal(result.userName, "测试用户");
  assert.equal(result.userType, "3");
  assert.equal(result.authServerToken, "token-abc-123");
});

test("parseCasValidationResponse throws on authenticationFailure", () => {
  const xml = `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
    <cas:authenticationFailure code="INVALID_TICKET">
      Ticket ST-999 not recognized
    </cas:authenticationFailure>
  </cas:serviceResponse>`;

  assert.throws(
    () => parseCasValidationResponse(xml),
    (err: unknown) => {
      if (!(err instanceof CasError)) return false;
      assert.equal(err.kind, "VALIDATION_FAILED");
      assert.ok(err.message.includes("INVALID_TICKET"));
      return true;
    },
  );
});

test("parseCasValidationResponse rejects doctype", () => {
  const xml = `<!DOCTYPE serviceResponse><cas:serviceResponse><cas:authenticationSuccess><cas:user>admin</cas:user></cas:authenticationSuccess></cas:serviceResponse>`;
  assert.throws(
    () => parseCasValidationResponse(xml),
    (err: unknown) => {
      if (!(err instanceof CasError)) return false;
      assert.equal(err.kind, "VALIDATION_FAILED");
      assert.ok(err.message.includes("doctype"));
      return true;
    },
  );
});

test("parseCasValidationResponse rejects oversized XML", () => {
  const xml = `<cas:serviceResponse>${"x".repeat(65 * 1024)}</cas:serviceResponse>`;
  assert.throws(
    () => parseCasValidationResponse(xml),
    (err: unknown) => {
      if (!(err instanceof CasError)) return false;
      assert.equal(err.kind, "VALIDATION_FAILED");
      assert.ok(err.message.includes("maximum allowed size"));
      return true;
    },
  );
});

test("parseCasValidationResponse rejects conflicting identifiers", () => {
  const xml = `<cas:serviceResponse>
    <cas:authenticationSuccess>
      <cas:user>user_a</cas:user>
      <cas:uid>user_b</cas:uid>
    </cas:authenticationSuccess>
  </cas:serviceResponse>`;

  assert.throws(
    () => parseCasValidationResponse(xml),
    (err: unknown) => {
      if (!(err instanceof CasError)) return false;
      assert.equal(err.kind, "VALIDATION_FAILED");
      assert.ok(err.message.includes("conflicting"));
      return true;
    },
  );
});
