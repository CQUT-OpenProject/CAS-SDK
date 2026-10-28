import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "vite-plus/test";
import { CasError } from "../errors/cas-error.js";
import { createSubjectDeriver } from "./subject.js";

const SECRET = "synthetic-subject-secret-0123456789abcdef";

test("matches HMAC-SHA256 over the namespaced identity", async () => {
  const derive = createSubjectDeriver({ secret: SECRET, namespace: "app" });
  const expected = createHmac("sha256", SECRET)
    .update(JSON.stringify(["app", "cqut", "uid"]))
    .digest("base64url");
  assert.equal(await derive("uid"), expected);
});

test("defaults the namespace and accepts byte secrets", async () => {
  const bytes = new TextEncoder().encode(SECRET);
  const fromBytes = createSubjectDeriver({ secret: bytes });
  const fromString = createSubjectDeriver({ secret: SECRET, namespace: "default" });
  const before = await fromBytes("uid");
  bytes.fill(0);
  assert.equal(await fromBytes("uid"), before, "caller mutation does not change subjects");
  assert.equal(before, await fromString("uid"));
});

test("namespace boundaries are unambiguous", async () => {
  const a = createSubjectDeriver({ secret: SECRET, namespace: "x" });
  const b = createSubjectDeriver({ secret: SECRET, namespace: "x:cqut" });
  assert.notEqual(await a("cqut:uid"), await b("uid"));
});

test("rejects short secrets", () => {
  assert.throws(
    () => createSubjectDeriver({ secret: new Uint8Array(31) }),
    (error) => error instanceof CasError && error.kind === "CONFIGURATION_ERROR",
  );
});
