import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { CasClient, createCasClient } from "./cas-client.js";
import { assertServiceTicket, isServiceTicket } from "./types.js";
import { CasError, isCasError, isCasErrorOfKind } from "../errors/cas-error.js";

const APP_CODE = "officeHallApplicationCode";
const TEST_ACCOUNT = "test-account-sdk";
const TEST_PASSWORD = "test-password-sdk";
const TEST_TICKET = "ST-test-ticket-sdk";

async function startMockServer(
  options: {
    loginFailures?: number;
    doLoginCode?: number;
    doLoginMsg?: string;
    issueTicket?: boolean;
  } = {},
) {
  let remainingLoginFailures = options.loginFailures ?? 0;
  const requests: Array<{
    method: string;
    url: string;
    headers: Record<string, unknown>;
  }> = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers,
    });

    if (url.pathname === `/center-auth-server/${APP_CODE}/cas/login` && req.method === "GET") {
      const loggedIn = req.headers.cookie?.includes("logged-in=yes") ?? false;
      if (!loggedIn && remainingLoginFailures > 0) {
        remainingLoginFailures--;
        res.statusCode = 503;
        res.end("server busy");
        return;
      }

      if (!loggedIn) {
        res.statusCode = 200;
        res.setHeader("Set-Cookie", "initial-session=sess123; Path=/");
        res.end("login form");
        return;
      }

      const service = url.searchParams.get("service");
      assert.ok(service);
      const redirect = new URL(service);
      if (options.issueTicket !== false) {
        redirect.searchParams.set("ticket", TEST_TICKET);
      }
      res.statusCode = 302;
      res.setHeader("Location", redirect.toString());
      res.end();
      return;
    }

    if (url.pathname === "/center-auth-server/sso/doLogin" && req.method === "POST") {
      res.setHeader("Set-Cookie", "logged-in=yes; Path=/; HttpOnly");
      res.setHeader("Content-Type", "application/json;charset=utf-8");
      const code = options.doLoginCode ?? 200;
      const msg = options.doLoginMsg ?? "success";
      res.end(JSON.stringify({ code, msg }));
      return;
    }

    if (url.pathname === "/center-auth-server/cas/serviceValidate" && req.method === "GET") {
      res.setHeader("Content-Type", "application/xml;charset=utf-8");
      res.end(
        `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
          <cas:authenticationSuccess>
            <cas:user>${TEST_ACCOUNT}</cas:user>
            <cas:uid>${TEST_ACCOUNT}</cas:uid>
            <cas:attributes>
              <cas:user_code>${TEST_ACCOUNT}</cas:user_code>
            </cas:attributes>
          </cas:authenticationSuccess>
        </cas:serviceResponse>`,
      );
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start mock server");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err?: Error | null) => (err ? reject(err) : resolve())),
      ),
  };
}

test("CasClient completes full login flow successfully", async () => {
  const mock = await startMockServer();
  const client = createCasClient({
    uisBaseUrl: mock.baseUrl,
    applicationCode: APP_CODE,
  });

  try {
    const result = await client.login({
      account: TEST_ACCOUNT,
      password: TEST_PASSWORD,
      serviceUrl: `${mock.baseUrl}/app/callback`,
      validate: true,
    });

    assert.equal(result.ticket, TEST_TICKET);
    assert.ok(isServiceTicket(result.ticket));
    assertServiceTicket(result.ticket);
    assert.equal(result.validation?.user, TEST_ACCOUNT);
    assert.ok(result.cookieJar.getCookieString(mock.baseUrl).includes("logged-in=yes"));
  } finally {
    await mock.close();
  }
});

test("CasClient safeLogin returns Result pattern object", async () => {
  const mock = await startMockServer();
  const client = createCasClient({
    uisBaseUrl: mock.baseUrl,
    applicationCode: APP_CODE,
  });

  try {
    const okResult = await client.safeLogin({
      account: TEST_ACCOUNT,
      password: TEST_PASSWORD,
      serviceUrl: `${mock.baseUrl}/app/callback`,
      validate: true,
    });

    assert.equal(okResult.ok, true);
    if (okResult.ok) {
      assert.equal(okResult.data.ticket, TEST_TICKET);
      assert.ok(isServiceTicket(okResult.data.ticket));
    }
  } finally {
    await mock.close();
  }
});

test("CasClient safeLogin handles rejection with typed Result error", async () => {
  const mock = await startMockServer({
    doLoginCode: 401,
    doLoginMsg: "账号或密码错误",
  });
  const client = createCasClient({
    uisBaseUrl: mock.baseUrl,
    applicationCode: APP_CODE,
  });

  try {
    const failResult = await client.safeLogin({
      account: TEST_ACCOUNT,
      password: "wrong-password",
      serviceUrl: `${mock.baseUrl}/app/callback`,
    });

    assert.equal(failResult.ok, false);
    if (!failResult.ok) {
      assert.ok(isCasError(failResult.error));
      assert.ok(isCasErrorOfKind(failResult.error, "AUTH_FAILED"));
      assert.equal(failResult.error.message, "账号或密码错误");
    }
  } finally {
    await mock.close();
  }
});

test("CasClient retries transient login failures", async () => {
  const mock = await startMockServer({ loginFailures: 1 });
  const client = new CasClient({
    uisBaseUrl: mock.baseUrl,
    applicationCode: APP_CODE,
  });

  try {
    const result = await client.login({
      account: TEST_ACCOUNT,
      password: TEST_PASSWORD,
      serviceUrl: `${mock.baseUrl}/app/callback`,
    });
    assert.equal(result.ticket, TEST_TICKET);
  } finally {
    await mock.close();
  }
});

test("CasClient throws AUTH_FAILED when credentials rejected", async () => {
  const mock = await startMockServer({
    doLoginCode: 401,
    doLoginMsg: "账号或密码错误",
  });
  const client = new CasClient({
    uisBaseUrl: mock.baseUrl,
    applicationCode: APP_CODE,
  });

  try {
    await assert.rejects(
      client.login({
        account: TEST_ACCOUNT,
        password: "wrong-password",
        serviceUrl: `${mock.baseUrl}/app/callback`,
      }),
      (err: unknown) => {
        if (!isCasErrorOfKind(err, "AUTH_FAILED")) return false;
        assert.equal(err.message, "账号或密码错误");
        return true;
      },
    );
  } finally {
    await mock.close();
  }
});

test("CasClient supports AsyncDisposable with [Symbol.asyncDispose]()", async () => {
  const mock = await startMockServer();
  let clientRef: CasClient;

  try {
    {
      await using client = createCasClient({
        uisBaseUrl: mock.baseUrl,
        applicationCode: APP_CODE,
      });
      clientRef = client;
      client.defaultCookieJar.setCookie("test=1; Path=/", mock.baseUrl);
      assert.equal(client.defaultCookieJar.getCookies(mock.baseUrl).length, 1);
    }
    // After exiting block scope, [Symbol.asyncDispose] clears defaultCookieJar
    assert.equal(clientRef.defaultCookieJar.getCookies(mock.baseUrl).length, 0);
  } finally {
    await mock.close();
  }
});
