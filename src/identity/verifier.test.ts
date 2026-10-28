import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { CasClient } from "../client/cas-client.js";
import { MemoryCookieJar } from "../cookie/cookie-jar.js";
import { CasError } from "../errors/cas-error.js";
import type { Fetcher, HttpRequest } from "../http/types.js";
import { describeCampusVerifyError, type CampusVerifyErrorCode } from "./errors.js";
import type { RateLimiter } from "./rate-limiter.js";
import {
  createCampusVerifier,
  DEFAULT_CAS_SERVICE_URL,
  type CampusVerifierOptions,
} from "./verifier.js";

const ACCOUNT = "Test-Account";
const PASSWORD = "test-password";
const SECRET = "synthetic-subject-secret-0123456789abcdef";

interface FlowOptions {
  user?: string;
  doLogin?: { code: number; msg?: string };
  validateStatus?: number;
  noTicket?: boolean;
  networkFailure?: boolean;
  hang?: boolean;
}

function flowFetcher(options: FlowOptions = {}, seen: HttpRequest[] = []): Fetcher {
  return async (req) => {
    seen.push(req);
    if (options.networkFailure) throw new TypeError("synthetic network failure");
    if (options.hang) return new Promise(() => {});
    const url = new URL(req.url);
    if (url.pathname.endsWith("/serviceValidate")) {
      const user = options.user ?? ACCOUNT.toLowerCase();
      return new Response(
        `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas"><cas:authenticationSuccess><cas:user>${user}</cas:user><cas:attributes><cas:user_name>Synthetic Name</cas:user_name></cas:attributes><cas:authServerToken>synthetic-token</cas:authServerToken></cas:authenticationSuccess></cas:serviceResponse>`,
        { status: options.validateStatus ?? 200 },
      );
    }
    if (url.pathname.endsWith("/doLogin"))
      return new Response(JSON.stringify(options.doLogin ?? { code: 200 }), {
        headers: { "Set-Cookie": "logged-in=synthetic; Path=/" },
      });
    if (req.headers?.Cookie?.includes("logged-in")) {
      const service = url.searchParams.get("service") ?? "";
      const location = options.noTicket ? service : `${service}&ticket=ST-synthetic`;
      return new Response(null, { status: 302, headers: { Location: location } });
    }
    return new Response("login form");
  };
}

class CountingJar extends MemoryCookieJar {
  static clears = 0;
  override clear(): void {
    CountingJar.clears++;
    super.clear();
  }
}

function verifierWith(flow: FlowOptions = {}, options: CampusVerifierOptions = {}) {
  const seen: HttpRequest[] = [];
  const verifier = createCampusVerifier({
    client: new CasClient({
      fetcher: flowFetcher(flow, seen),
      cookieJarFactory: () => new CountingJar(),
    }),
    ...options,
  });
  return { verifier, seen };
}

test("verifies credentials and returns a minimal normalized identity", async () => {
  const { verifier, seen } = verifierWith();
  const before = CountingJar.clears;
  const result = await verifier.verify({ account: `  ${ACCOUNT} `, password: PASSWORD });
  assert.deepEqual(result, {
    ok: true,
    data: { schoolUid: "test-account", school: "cqut", studentStatus: "active" },
  });
  assert.equal(CountingJar.clears, before + 1, "login session is disposed");
  const doLogin = seen.find((req) => req.url.endsWith("/doLogin"));
  assert.equal(JSON.parse(doLogin?.body ?? "{}").name, ACCOUNT, "submits trimmed account");
  assert.ok(seen[0]?.url.includes(encodeURIComponent(DEFAULT_CAS_SERVICE_URL)));
  assert.ok(!JSON.stringify(result).includes("Synthetic Name"));
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
});

test("rejects a validated identity that differs from the requested account", async () => {
  const { verifier } = verifierWith({ user: "someone-else" });
  const before = CountingJar.clears;
  const result = await verifier.verify({ account: ACCOUNT, password: PASSWORD });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "identity_mismatch");
  assert.equal(result.error?.retryable, false);
  assert.equal(CountingJar.clears, before + 1);
});

test("rejects missing or oversized input without contacting UIS", async () => {
  const { verifier, seen } = verifierWith();
  for (const input of [
    { account: "   ", password: PASSWORD },
    { account: ACCOUNT, password: "" },
    { account: "a".repeat(129), password: PASSWORD },
    { account: ACCOUNT, password: "p".repeat(257) },
    { account: 1 as unknown as string, password: PASSWORD },
  ]) {
    const result = await verifier.verify(input);
    assert.equal(result.error?.code, "invalid_input");
  }
  assert.equal(seen.length, 0);
});

const cases: Array<[string, FlowOptions, CampusVerifyErrorCode, boolean]> = [
  ["wrong password", { doLogin: { code: 401, msg: "密码错误" } }, "invalid_credentials", false],
  ["captcha", { doLogin: { code: 400, msg: "请输入验证码" } }, "captcha_required", false],
  ["network failure", { networkFailure: true }, "upstream_unavailable", true],
  ["missing ticket", { noTicket: true }, "protocol_error", true],
  ["validation failure", { validateStatus: 403 }, "protocol_error", true],
  ["upstream 5xx", { validateStatus: 502 }, "upstream_unavailable", true],
];

for (const [name, flow, code, retryable] of cases) {
  test(`maps ${name} to ${code}`, async () => {
    const { verifier } = verifierWith(flow);
    const result = await verifier.verify({ account: ACCOUNT, password: PASSWORD });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, code);
    assert.equal(result.error?.retryable, retryable);
    assert.ok(result.error?.cause instanceof CasError);
    assert.ok(!result.error?.message.includes(PASSWORD));
    assert.ok(describeCampusVerifyError(result.error!));
  });
}

test("distinguishes timeout from caller cancellation", async () => {
  const timed = verifierWith({ hang: true }, { timeoutMs: 20 });
  assert.equal(
    (await timed.verifier.verify({ account: ACCOUNT, password: PASSWORD })).error?.code,
    "upstream_unavailable",
  );
  const cancelled = verifierWith({ hang: true });
  const controller = new AbortController();
  const pending = cancelled.verifier.verify({
    account: ACCOUNT,
    password: PASSWORD,
    signal: controller.signal,
  });
  controller.abort();
  assert.equal((await pending).error?.code, "aborted");
});

test("configuration errors are thrown, not reported as verification failures", async () => {
  assert.throws(
    () => createCampusVerifier({ timeoutMs: 0 }),
    (error) => error instanceof CasError && error.kind === "CONFIGURATION_ERROR",
  );
  assert.throws(
    () => createCampusVerifier({ subject: { secret: "too-short" } }),
    (error) => error instanceof CasError && error.kind === "CONFIGURATION_ERROR",
  );
  const verifier = createCampusVerifier({
    client: { fetcher: flowFetcher(), publicKey: "invalid key" },
  });
  await assert.rejects(
    verifier.verify({ account: ACCOUNT, password: PASSWORD }),
    (error) => error instanceof CasError && error.kind === "CRYPTO_ERROR",
  );
});

test("rate limits per account before contacting UIS and resets on success", async () => {
  const { verifier, seen } = verifierWith(
    { doLogin: { code: 401 } },
    { rateLimiter: undefined }, // default MemoryRateLimiter: 5 per account
  );
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await verifier.verify({ account: ACCOUNT, password: PASSWORD })).error?.code,
      "invalid_credentials",
    );
  const requests = seen.length;
  const limited = await verifier.verify({
    account: ` ${ACCOUNT.toUpperCase()} `,
    password: PASSWORD,
  });
  assert.equal(limited.error?.code, "rate_limited");
  assert.equal(limited.error?.retryable, true);
  assert.ok((limited.error?.retryAfterMs ?? 0) > 0);
  assert.equal(seen.length, requests, "no UIS request when limited");

  const resets: string[] = [];
  const limiter: RateLimiter = {
    consume: async () => ({ allowed: true }),
    reset: async (scope, id) => void resets.push(`${scope}:${id}`),
  };
  const ok = verifierWith({}, { rateLimiter: limiter });
  assert.equal((await ok.verifier.verify({ account: ACCOUNT, password: PASSWORD })).ok, true);
  assert.deepEqual(resets, ["account:test-account"]);
});

test("rate limits per client key and fails closed when the limiter throws", async () => {
  const scopes: string[] = [];
  const limiter: RateLimiter = {
    consume: async (scope, id) => {
      scopes.push(`${scope}:${id}`);
      return scope === "client" ? { allowed: false, retryAfterMs: 1000 } : { allowed: true };
    },
  };
  const { verifier, seen } = verifierWith({}, { rateLimiter: limiter });
  const result = await verifier.verify({
    account: ACCOUNT,
    password: PASSWORD,
    clientKey: " 203.0.113.7 ",
  });
  assert.equal(result.error?.code, "rate_limited");
  assert.equal(result.error?.retryAfterMs, 1000);
  assert.deepEqual(scopes, ["account:test-account", "client:203.0.113.7"]);
  assert.equal(seen.length, 0);

  const broken = verifierWith(
    {},
    {
      rateLimiter: {
        consume: async () => {
          throw new Error("store down");
        },
      },
    },
  );
  await assert.rejects(
    broken.verifier.verify({ account: ACCOUNT, password: PASSWORD }),
    /store down/,
  );
  assert.equal(broken.seen.length, 0);
});

test("rateLimiter: false disables limiting", async () => {
  const { verifier } = verifierWith({ doLogin: { code: 401 } }, { rateLimiter: false });
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await verifier.verify({ account: ACCOUNT, password: PASSWORD })).error?.code,
      "invalid_credentials",
    );
});

test("returns a stable pseudonymous sub when configured", async () => {
  const a = verifierWith({}, { subject: { secret: SECRET, namespace: "app-a" } });
  const b = verifierWith({}, { subject: { secret: SECRET, namespace: "app-b" } });
  const first = await a.verifier.verify({ account: ACCOUNT, password: PASSWORD });
  const second = await a.verifier.verify({ account: ACCOUNT.toLowerCase(), password: PASSWORD });
  const other = await b.verifier.verify({ account: ACCOUNT, password: PASSWORD });
  assert.match(first.data?.sub ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.data?.sub, second.data?.sub);
  assert.notEqual(first.data?.sub, other.data?.sub);
});
