# @cqut-openproject/cas-sdk

<div align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18+-green.svg?style=flat" alt="Node.js 18+"></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-10+-orange.svg?style=flat" alt="pnpm 10+"></a>
</div>

> [!NOTE]
> `@cqut-openproject/cas-sdk` 是重庆理工大学统一身份认证（UIS / CAS）的独立客户端 SDK，提供跨运行时、零外部强依赖、强类型的认证流转、密码加密与票据验证能力。

> [!CAUTION]
> 本 SDK 在登录期间需使用学校账号与密码请求 UIS 服务端。凭据仅在客户端内存流转，请严格遵循密码学安全与隐私合规要求，切勿在不安全的日志中打印明文凭据。

## 主要特性

- **「跨运行时」**：原生兼容 Node.js (>= 18)、Cloudflare Workers (Edge)、AWS Lambda / Vercel (Serverless)、Bun 与现代浏览器环境
- **「零外部依赖」**：纯 TypeScript 原生 `BigInt` 实现 RSA PKCS#1 v1.5 加密与 XML 验证解析，产物体积极小（< 10 KB）
- **「网络层解耦」**：采用控制反转（IoC）架构，支持按需注入 Node `fetch`、`undici`、`axios` 或自定义代理实例
- **「双层 API」**：提供开箱即用的一站式 `login` / `safeLogin` 流转方法与精细化的分步原子 API
- **「生产级防御」**：内置防 XXE、防 Doctype 实体注入、64KB 响应体积上限防御与网络瞬态自动重试
- **「现代 TypeScript 7+」**：支持 `using` / `await using` 显式资源管理（Disposable）、名义品牌类型（Branded `ServiceTicket`）与 Result 模式

## 安装

### 方式一：通过 Git Release 分支安装（推荐，无需 Token / 免配置）

仓库内置 CI 会在发版与更新时自动将包含编译产物（`dist/`）的版本同步至 `release` 分支。下游项目无需配置任何 Token 或 `.npmrc`，可直接安装：

```bash
pnpm add github:CQUT-OpenProject/CAS-SDK#release
# 或使用 npm / yarn
npm install github:CQUT-OpenProject/CAS-SDK#release
```

### 方式二：通过 GitHub Packages 安装

如需通过 npm 官方包名格式引入，请在项目根目录或全局 `~/.npmrc` 中配置：

```ini
@cqut-openproject:registry=https://npm.pkg.github.com
```

然后执行安装：

```bash
pnpm add @cqut-openproject/cas-sdk
# 或使用 npm / yarn
npm install @cqut-openproject/cas-sdk
```

## 快速使用

### 1. 一键登录并获取 Ticket

```ts
import { createCasClient } from "@cqut-openproject/cas-sdk";

await using client = createCasClient();

const result = await client.login({
  account: "2021123456",
  password: "YourPasswordHere",
  serviceUrl: "https://example.cqut.edu.cn/auth/callback",
  validate: true, // 可选：获取 Ticket 后自动完成服务端验证
});

console.log("Service Ticket:", result.ticket);
console.log("Verified User:", result.validation?.user);
```

### 2. 函数式 Result 模式安全登录

```ts
import { createCasClient, isCasErrorOfKind } from "@cqut-openproject/cas-sdk";

await using client = createCasClient();

const result = await client.safeLogin({
  account: "2021123456",
  password: "YourPasswordHere",
  serviceUrl: "https://example.cqut.edu.cn/auth/callback",
});

if (result.ok) {
  console.log("Service Ticket:", result.data.ticket);
} else {
  if (isCasErrorOfKind(result.error, "AUTH_FAILED")) {
    console.error("账号或密码错误");
  } else {
    console.error("登录失败:", result.error.message);
  }
}
```

### 3. 注入自定义网络实现 (Fetcher)

#### Node.js / Undici（绑定 Dispatcher 强制 IPv4）

```ts
import { CasClient } from "@cqut-openproject/cas-sdk";
import { fetch as undiciFetch, Agent } from "undici";
import dns from "node:dns";

const ipv4Dispatcher = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { family: 4, all: false }, callback);
    },
  },
});

const client = new CasClient({
  fetcher: async (req) => {
    return undiciFetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      redirect: req.redirect,
      signal: req.signal,
      dispatcher: ipv4Dispatcher,
    });
  },
});
```

#### Axios 适配器

```ts
import { CasClient } from "@cqut-openproject/cas-sdk";
import axios from "axios";

const client = new CasClient({
  fetcher: async (req) => {
    const res = await axios.request({
      url: req.url,
      method: req.method,
      headers: req.headers,
      data: req.body,
      maxRedirects: req.redirect === "manual" ? 0 : 5,
      validateStatus: () => true,
      responseType: "text",
    });

    return {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers as Record<string, string | string[]>,
      text: async () => (typeof res.data === "string" ? res.data : JSON.stringify(res.data)),
      json: async () => (typeof res.data === "string" ? JSON.parse(res.data) : res.data),
    };
  },
});
```

### 4. 原子 API：密码加密

```ts
import { CasClient, getSecretParam } from "@cqut-openproject/cas-sdk";

// 独立密码加密
const secretParam = CasClient.encryptPassword("MyPassword123");
// 或直接调用函数
const encoded = getSecretParam("MyPassword123");
```

## 错误处理

SDK 统一抛出强类型 `CasError`，可通过 `isCasErrorOfKind` 或 `error.kind` 进行分类处理：

```ts
import { CasClient, CasError, isCasErrorOfKind } from "@cqut-openproject/cas-sdk";

try {
  await client.login({ ... });
} catch (err) {
  if (isCasErrorOfKind(err, "AUTH_FAILED")) {
    console.error("账号或密码错误");
  } else if (isCasErrorOfKind(err, "CAPTCHA_REQUIRED")) {
    console.error("触发验证码校验");
  } else if (isCasErrorOfKind(err, "NETWORK_ERROR")) {
    console.error("网络瞬态错误或连接超时");
  } else if (isCasErrorOfKind(err, "UPSTREAM_ERROR")) {
    console.error("UIS 服务端异常 (500/502/503)");
  } else if (isCasErrorOfKind(err, "VALIDATION_FAILED")) {
    console.error("Ticket 验证未通过");
  }
}
```

## 许可证

本项目基于 [MIT](./LICENSE) 协议开源。
