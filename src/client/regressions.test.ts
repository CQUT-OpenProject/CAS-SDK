import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CasClient } from "./cas-client.js";
import { MemoryCookieJar } from "../cookie/cookie-jar.js";
import type { Fetcher, HttpRequest } from "../http/types.js";
import { UIS_COOKIES, UIS_VALIDATION } from "./fixtures/uis.js";

const credentials = {
  account: "test-account",
  password: "test-password",
  serviceUrl: "https://service.test/callback",
};
const base = "https://uis.cqut.edu.cn";
const options = () => ({ cookieJar: new MemoryCookieJar() });

function flowFetcher(onRequest?: (req: HttpRequest) => void): Fetcher {
  return async (req) => {
    onRequest?.(req);
    const url = new URL(req.url);
    if (url.pathname.endsWith("/serviceValidate")) return new Response(UIS_VALIDATION);
    if (url.pathname.endsWith("/doLogin")) {
      const headers = new Headers();
      for (const name of UIS_COOKIES.slice(1))
        headers.append("Set-Cookie", `${name}=synthetic; Path=/`);
      return new Response('{"code":200}', { headers });
    }
    if (req.headers?.Cookie?.includes(UIS_COOKIES[1]))
      return new Response(null, {
        status: 302,
        headers: { Location: credentials.serviceUrl + "?ticket=ST-synthetic" },
      });
    return new Response("login", {
      headers: { "Set-Cookie": `${UIS_COOKIES[0]}=synthetic; Path=/` },
    });
  };
}

test("initial redirects retain cookies and strip explicit cross-origin credentials", async () => {
  const seen: HttpRequest[] = [];
  const jar = new MemoryCookieJar();
  const client = new CasClient({
    fetcher: async (req) => {
      seen.push(req);
      if (seen.length === 1)
        return new Response(null, {
          status: 302,
          headers: { Location: "/form", "Set-Cookie": "sid=first; Path=/" },
        });
      if (seen.length === 2)
        return new Response(null, {
          status: 303,
          headers: { Location: "https://other.test/form" },
        });
      return new Response("form");
    },
  });
  await client.fetchLoginPage(credentials.serviceUrl, {
    cookieJar: jar,
    headers: { authorization: "synthetic", cookie: "explicit=synthetic" },
  });
  assert.equal(seen[1]?.headers?.Cookie, "sid=first");
  assert.equal(seen[2]?.headers?.authorization, undefined);
  assert.equal(seen[2]?.headers?.cookie, undefined);
  assert.equal(seen[2]?.headers?.Cookie, undefined);
  assert.ok(seen.every((req) => req.redirect === "manual"));
});

test("uses response URL as cookie origin and handles mixed-case Set-Cookie arrays", async () => {
  const jar = new MemoryCookieJar();
  const client = new CasClient({
    fetcher: async () => ({
      status: 200,
      url: "https://actual.test/dir/form",
      headers: { "sEt-CoOkIe": ["a=1", "b=2"] },
      body: null,
    }),
  });
  await client.fetchLoginPage(credentials.serviceUrl, { cookieJar: jar });
  assert.equal(jar.getCookieString("https://actual.test/dir/next"), "a=1; b=2");
  assert.equal(jar.getCookieString(base), "");
});

test("initial redirects stop after five hops and cancel unused bodies", async () => {
  let requests = 0,
    cancelled = 0;
  const client = new CasClient({
    fetcher: async () => {
      requests++;
      return {
        status: 302,
        headers: { location: "/again" },
        body: new ReadableStream({
          cancel() {
            cancelled++;
          },
        }),
      };
    },
  });
  await assert.rejects(client.fetchLoginPage(credentials.serviceUrl, options()), {
    kind: "PROTOCOL_ERROR",
  });
  assert.equal(requests, 6);
  assert.equal(cancelled, 6);
});

test("initial retry count remains two when a 503 is followed by network failure", async () => {
  let requests = 0;
  const client = new CasClient({
    fetcher: async () => {
      if (++requests === 1) return new Response(null, { status: 503 });
      throw new Error("connection lost");
    },
  });
  await assert.rejects(client.fetchLoginPage(credentials.serviceUrl, options()), {
    kind: "NETWORK_ERROR",
  });
  assert.equal(requests, 2);
});

for (const stage of ["doLogin", "acquireServiceTicket", "validateServiceTicket"] as const) {
  test(`${stage} is never retried`, async () => {
    let requests = 0;
    const client = new CasClient({
      fetcher: async () => {
        requests++;
        return new Response(null, { status: 503 });
      },
    });
    const promise =
      stage === "doLogin"
        ? client.doLogin(credentials, base, options())
        : stage === "acquireServiceTicket"
          ? client.acquireServiceTicket(
              base + "/cas/login",
              credentials.serviceUrl,
              base,
              options(),
            )
          : client.validateServiceTicket("ST-synthetic", credentials.serviceUrl);
    await assert.rejects(promise, { kind: "UPSTREAM_ERROR" });
    assert.equal(requests, 1);
  });
}

test("signing a ticket does not visit the service callback", async () => {
  const seen: HttpRequest[] = [];
  const client = new CasClient({ fetcher: flowFetcher((req) => seen.push(req)) });
  using result = await client.login(credentials);
  assert.equal(result.kind, "ticket");
  assert.equal(result.ticket, "ST-synthetic");
  assert.equal(seen.length, 3);
  assert.ok(seen.every((req) => new URL(req.url).origin === base));
});

test("validated results expose identity rather than a consumed ticket; credentials pass through", async () => {
  let payload: Record<string, unknown> = {};
  const client = new CasClient({
    fetcher: flowFetcher((req) => {
      if (req.body) payload = JSON.parse(req.body);
    }),
  });
  using result = await client.login({
    ...credentials,
    validate: true,
    verifyCode: "1234",
    universityId: "custom",
    loginType: "custom",
  });
  assert.equal(result.kind, "validated");
  assert.equal("ticket" in result, false);
  assert.equal(result.validation.user, "TestUser");
  assert.equal(payload.verifyCode, "1234");
  assert.equal(payload.universityId, "custom");
  assert.equal(payload.loginType, "custom");
  assert.notEqual(payload.pwd, credentials.password);
});

test("concurrent sessions are independent, result disposal is idempotent", async () => {
  const jars: MemoryCookieJar[] = [];
  const client = new CasClient({
    fetcher: flowFetcher(),
    cookieJarFactory: () => {
      const jar = new MemoryCookieJar();
      jars.push(jar);
      return jar;
    },
  });
  const [a, b] = await Promise.all([client.login(credentials), client.login(credentials)]);
  assert.notEqual(a.cookieJar, b.cookieJar);
  a.dispose();
  a[Symbol.dispose]();
  assert.equal(jars[0]?.getCookies(base).length, 0);
  assert.ok(jars[1]?.getCookies(base).length);
  b.dispose();
});

test("failure clears the login jar and safeLogin does not swallow programming errors", async () => {
  const jar = new MemoryCookieJar();
  const client = new CasClient({
    cookieJarFactory: () => jar,
    fetcher: async (req) =>
      req.method === "POST"
        ? new Response('{"code":401,"msg":"captcha synthetic-sensitive"}')
        : new Response("", { headers: { "Set-Cookie": "session=synthetic; Path=/" } }),
  });
  const result = await client.safeLogin(credentials);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "CAPTCHA_REQUIRED");
    assert.ok(!result.error.message.includes("synthetic-sensitive"));
    assert.equal("rawResponse" in result.error, false);
  }
  assert.equal(jar.getCookies(base).length, 0);
  const bug = new Error("programming bug");
  const broken = new CasClient({
    cookieJarFactory: () => {
      throw bug;
    },
  });
  await assert.rejects(broken.safeLogin(credentials), (error) => error === bug);
});

for (const validate of [false, true])
  test(`stream limit cancels ${validate ? "XML" : "JSON"} response`, async () => {
    let cancelled = false;
    const client = new CasClient({
      fetcher: async () => ({
        status: 200,
        headers: {},
        body: new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(65536));
            c.enqueue(new Uint8Array(1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      }),
    });
    const promise = validate
      ? client.validateServiceTicket("ST-synthetic", credentials.serviceUrl)
      : client.doLogin(credentials, base, options());
    await assert.rejects(promise, { kind: validate ? "VALIDATION_FAILED" : "PROTOCOL_ERROR" });
    assert.equal(cancelled, true);
  });

test("body errors are network errors; invalid JSON is a protocol error", async () => {
  const client = new CasClient({
    fetcher: async () => ({
      status: 200,
      headers: {},
      body: new ReadableStream({
        start(c) {
          c.error(new Error("lost"));
        },
      }),
    }),
  });
  await assert.rejects(client.validateServiceTicket("ST-synthetic", credentials.serviceUrl), {
    kind: "NETWORK_ERROR",
  });
  const bad = new CasClient({ fetcher: async () => new Response("not JSON") });
  await assert.rejects(bad.doLogin(credentials, base, options()), { kind: "PROTOCOL_ERROR" });
});

test("already cancelled calls send no requests", async () => {
  let calls = 0;
  const client = new CasClient({
    fetcher: async () => {
      calls++;
      return new Response();
    },
  });
  await assert.rejects(client.login({ ...credentials, signal: AbortSignal.abort() }), {
    kind: "ABORTED",
  });
  assert.equal(calls, 0);
});

test("abort interrupts retry delay without retrying", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = new CasClient({
    fetcher: async () => {
      calls++;
      setTimeout(() => controller.abort(), 10);
      return new Response(null, { status: 503 });
    },
  });
  await assert.rejects(
    client.fetchLoginPage(credentials.serviceUrl, { ...options(), signal: controller.signal }),
    { kind: "ABORTED" },
  );
  assert.equal(calls, 1);
});

test("timeout includes stalled body reading and cancels the reader", async () => {
  let cancelled = false;
  const keepAlive = setTimeout(() => {}, 200);
  try {
    const client = new CasClient({
      fetcher: async () => ({
        status: 200,
        headers: {},
        body: new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      }),
    });
    await assert.rejects(
      client.validateServiceTicket("ST-synthetic", credentials.serviceUrl, { timeoutMs: 10 }),
      { kind: "TIMEOUT" },
    );
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("whole login shares a deadline across stages", async () => {
  let calls = 0;
  const fetcher = flowFetcher();
  const client = new CasClient({
    fetcher: async (req) => {
      calls++;
      await delay(25, undefined, { signal: req.signal });
      return fetcher(req);
    },
  });
  await assert.rejects(client.login({ ...credentials, timeoutMs: 40 }), { kind: "TIMEOUT" });
  assert.equal(calls, 2);
});

test("network errors omit URL and ticket from message", async () => {
  const client = new CasClient({
    fetcher: async (req) => {
      throw new Error(req.url);
    },
  });
  await assert.rejects(
    client.validateServiceTicket("ST-private", credentials.serviceUrl),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("ST-private"));
      assert.ok(!error.message.includes("?"));
      return true;
    },
  );
});
