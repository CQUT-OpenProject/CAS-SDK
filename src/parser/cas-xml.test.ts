import assert from "node:assert/strict";
import { test } from "vite-plus/test";
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
      assert.ok(!err.message.includes("ST-999"));
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
  const xml = `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
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

for (const xml of [
  "<!-- <authenticationSuccess><user>admin</user></authenticationSuccess> -->",
  "<authenticationSuccess><user>admin</user>",
  "<authenticationSuccess></authenticationSuccess><user>admin</user>",
]) {
  test(`rejects malformed or misplaced success: ${xml}`, () => {
    assert.throws(() => parseCasValidationResponse(xml), CasError);
  });
}

const wrap = (body: string) =>
  `<serviceResponse xmlns="http://www.yale.edu/tp/cas"><authenticationSuccess>${body}</authenticationSuccess></serviceResponse>`;
for (const body of [
  "<user>A</user><user>A</user>",
  "<user><nested>A</nested></user>",
  "<uid>A</uid>",
  "<user>A</user><attributes><user_code>A</user_code><user_code>A</user_code></attributes>",
  "<user>A</user><uid>a</uid>",
  "<user>&unknown;</user>",
  "<user>&#0;</user>",
  "<user>&#xD800;</user>",
  '<user a="1" a="2">A</user>',
  "<user>A</other>",
])
  test(`strict CAS structure rejects ${body}`, () =>
    assert.throws(() => parseCasValidationResponse(wrap(body)), { kind: "VALIDATION_FAILED" }));

test("supports declarations, comments, CDATA, entities and default namespace", () => {
  const xml = `<?xml version='1.0' encoding="UTF-8"?><!-- ignored -->${wrap("<user>A&amp;B</user><uid><![CDATA[A&B]]></uid><attributes><user_code>A&#38;B</user_code><user_name>&#x4E2D;&lt;&gt;&quot;&apos;</user_name></attributes>")}`;
  const result = parseCasValidationResponse(xml);
  assert.equal(result.user, "A&B");
  assert.equal(result.userName, "中<>\"'");
  assert.equal("rawXml" in result, false);
});
for (const xml of [
  '<serviceResponse xmlns="wrong"><authenticationSuccess><user>A</user></authenticationSuccess></serviceResponse>',
  wrap("<user>A</user>") + wrap("<user>B</user>"),
  '<serviceResponse xmlns="http://www.yale.edu/tp/cas"><authenticationSuccess><user>A</user></authenticationSuccess><authenticationFailure/></serviceResponse>',
  "<!DOCTYPE x>" + wrap("<user>A</user>"),
  wrap("<user>A</user>").replace("<user>", "<x:user>"),
])
  test("rejects invalid envelope " + xml.slice(0, 45), () =>
    assert.throws(() => parseCasValidationResponse(xml), { kind: "VALIDATION_FAILED" }),
  );

test("empty comments are valid; XML declaration names remain case-sensitive", () => {
  assert.equal(parseCasValidationResponse("<!---->" + wrap("<user>A</user>")).user, "A");
  assert.throws(
    () => parseCasValidationResponse('<?xml VERSION="1.0"?>' + wrap("<user>A</user>")),
    { kind: "VALIDATION_FAILED" },
  );
});
