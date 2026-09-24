# @cqut-openproject/cas-sdk

<div align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-7+-3178c6.svg?style=flat" alt="TypeScript 7+"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22+-green.svg?style=flat" alt="Node.js 22+"></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-10+-orange.svg?style=flat" alt="pnpm 10+"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat" alt="License: MIT"></a>
</div>

> [!NOTE]
> `@cqut-openproject/cas-sdk` 是面向 TypeScript 与 JavaScript 跨运行时生态的重庆理工大学统一身份认证（UIS / CAS）客户端 SDK，提供跨运行时、零外部强依赖、强类型的认证流转、密码加密与票据验证能力。

> [!CAUTION]
> 本 SDK 在登录期间需使用学校账号与密码请求 UIS 服务端。凭据仅在客户端内存流转，请严格遵循密码学安全与隐私合规要求，切勿在不安全的日志中打印明文凭据。

## 主要特性

- **「跨运行时」**：完整认证已验证 Node.js (>= 22)；Edge、Bun 尚待验证，现代浏览器仅支持独立加密
- **「零外部依赖」**：纯 TypeScript 原生 `BigInt` 实现 RSA PKCS#1 v1.5 加密与 XML 验证解析
- **「网络层解耦」**：采用控制反转（IoC）架构，支持按需注入 Node `fetch`、`undici`、`axios` 或自定义代理实例
- **「双层 API」**：提供开箱即用的一站式 `login` / `safeLogin` 流转方法与精细化的分步原子 API
- **「协议校验」**：拒绝 DTD / 自定义实体，严格校验 CAS XML 结构，JSON / XML 流读取上限 64 KiB；仅初始化 GET 对网络错误或 5xx 重试一次

## 安装

### 方式一：通过 Git Release 分支 / Tag 安装（推荐，无需 Token / 免配置）

仓库内置 CI 会将 `master` 的编译产物（`dist/`）同步至 `release` 分支；源码标签 `release-X.Y.Z` 发版后生成不可变的产物标签 `vX.Y.Z`。下游项目无需配置任何 Token 或 `.npmrc`，可直接安装：

```bash
# 持续跟随最新稳定构建
pnpm add github:CQUT-OpenProject/CAS-SDK#release

# 或锁定具体版本 Tag（v2.0.0 发布后可用）
pnpm add github:CQUT-OpenProject/CAS-SDK#v2.0.0
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

const client = createCasClient();

using result = await client.login({
  account: "2021123456",
  password: "YourPasswordHere",
  serviceUrl: "https://example.cqut.edu.cn/auth/callback",
});

// 将 result.ticket 交给目标服务兑换，避免输出到日志。
```

如需验证身份，传入 `validate: true`，通过 `result.validation.user` 获取用户；该结果不再包含已用于验证的 Ticket。

登录结果持有会话，使用 `using` 或在 `finally` 中调用 `result.dispose()` 清理本地 Cookie；client 无需释放。默认登录总时限为 30 秒，可设置 `timeoutMs` 或传入 `signal`。

### 2. 函数式 Result 模式安全登录

```ts
import { createCasClient, isCasErrorOfKind } from "@cqut-openproject/cas-sdk";

const client = createCasClient();

const result = await client.safeLogin({
  account: "2021123456",
  password: "YourPasswordHere",
  serviceUrl: "https://example.cqut.edu.cn/auth/callback",
});

if (result.ok) {
  using session = result.data;
  // 使用 session.ticket；离开作用域时释放本地会话。
} else {
  if (isCasErrorOfKind(result.error, "AUTH_FAILED")) {
    console.error("账号或密码错误");
  } else {
    console.error("登录失败:", result.error.message);
  }
}
```

`safeLogin` 仅将已知 `CasError` 转为 Result，未知程序异常仍会抛出。高层登录支持 `verifyCode`、`universityId` 和 `loginType`；需要定制存储时使用每次返回独立实例的 `cookieJarFactory`。分步会话方法要求显式传入 `{ cookieJar }`，由调用者清理。

### 3. 注入自定义网络实现 (Fetcher)

Fetcher 必须支持 `signal`，只返回单次请求的响应，不自动跟随重定向，并保留独立的 Set-Cookie 值。

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
import { Readable } from "node:stream";

const client = new CasClient({
  fetcher: async (req) => {
    const res = await axios.request({
      url: req.url,
      method: req.method,
      headers: req.headers,
      data: req.body,
      signal: req.signal,
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: "stream",
    });

    return {
      status: res.status,
      headers: res.headers as Record<string, string | string[] | undefined>,
      url: req.url,
      body: Readable.toWeb(res.data) as ReadableStream<Uint8Array>,
    };
  },
});
```

### 4. 原子 API：密码加密

```ts
import { getSecretParam } from "@cqut-openproject/cas-sdk/crypto";

// 独立密码加密
const secretParam = getSecretParam("MyPassword123");
```

## 错误处理

SDK 的已知认证与运行时错误使用强类型 `CasError`，可通过 `isCasErrorOfKind` 或 `error.kind` 进行分类处理：

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
    console.error("网络连接或响应读取失败");
  } else if (isCasErrorOfKind(err, "TIMEOUT")) {
    console.error("认证超时");
  } else if (isCasErrorOfKind(err, "ABORTED")) {
    console.error("认证已取消");
  } else if (isCasErrorOfKind(err, "UPSTREAM_ERROR")) {
    console.error("UIS 服务端异常 (500/502/503)");
  } else if (isCasErrorOfKind(err, "VALIDATION_FAILED")) {
    console.error("Ticket 验证未通过");
  }
}
```

缺少安全随机源或配置无效时返回 `CONFIGURATION_ERROR`，密钥或加密输入无效时返回 `CRYPTO_ERROR`。

## 开发

本项目使用 [Vite+](https://viteplus.dev) 统一管理开发工具链，请勿使用其它工具进行管理。

仓库使用 Vite+ 统一管理 Node.js、pnpm、构建、测试、lint 和格式化。`.node-version` 固定日常开发使用的 Node.js 版本；`engines.node` 表示 SDK 对下游运行时的支持范围，两者用途不同。

```bash
vp env current       # 查看当前项目解析出的 Node.js 与 pnpm
vp env install       # 安装 .node-version 与 packageManager 声明的环境
vp install           # 按锁文件安装依赖
vp check             # Oxfmt、Oxlint 与 TypeScript 检查
vp test              # 运行全部 Vitest 测试
vp run build         # 生成 ESM、CommonJS 与类型声明
vp run check:package # 验证 tarball、分支和标签消费方式
```

运行单个测试文件可使用 `vp test src/crypto/crypto.test.ts`。提交前执行 `vp run verify`；首次 clone 后如需启用仓库自带的 staged 检查，运行 `vp hooks enable`。

构建输出位于 `dist/`，不得提交。Node.js 22 与 24 的兼容性由 CI 矩阵验证；升级开发版本时应修改 `.node-version` 并保持该矩阵通过。

## 许可证

本项目基于 [MIT](./LICENSE) 协议开源。
