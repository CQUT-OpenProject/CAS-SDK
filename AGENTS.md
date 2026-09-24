# CAS-SDK 协作说明

CAS-SDK（`@cqut-openproject/cas-sdk`）是用于 CQUT UIS / CAS 认证的 TypeScript 客户端，提供 ESM 与 CommonJS 构建。生产代码零外部依赖；认证流程已在 Node.js 22 和 24 验证。浏览器支持仅覆盖独立加密模块，Edge 与 Bun 的完整认证尚未验证。

## 开发环境与命令

- 本项目使用 [Vite+](https://viteplus.dev) 统一管理开发工具链，请勿使用其它工具进行管理。
- 使用 `.node-version` 固定的 Node.js 24.21.0、Vite+（`vp`）与项目锁定的 pnpm 10；用 `vp env current` 检查实际解析结果。TypeScript 配置要求 strict、`verbatimModuleSyntax` 与 `erasableSyntaxOnly`。
- `vp install` 安装依赖；`vp run dev` 以 watch 模式构建。
- `vp test` 运行单元测试；运行单个文件：`vp test src/crypto/crypto.test.ts`。
- `vp lint` 执行 Oxlint、类型感知 lint 与 TypeScript 类型检查；`vp run build` 生成 ESM / CJS 与类型声明。
- 发布包检查使用 `vp run check:package`；格式检查使用 `vp fmt --check`。

## 按任务查阅

- 客户端与端点：`src/client/`；Cookie：`src/cookie/`；RSA 与密码加密：`src/crypto/`；错误：`src/errors/`；HTTP：`src/http/`；CAS XML：`src/parser/`。
- 改动认证、Cookie、加密或 XML 行为时，先查看对应实现和相邻测试，并补充覆盖新行为的回归测试。
- 发布流程与标签约定见 `.github/workflows/publish.yml` 及相关 `scripts/`；仅在处理发布时查阅。

## 实现约束

- 运行时实现只使用 ECMAScript / TypeScript 标准能力，不增加生产依赖。
- 遵循 TypeScript 的 `erasableSyntaxOnly`：不用 `enum`、参数属性或运行时 `namespace`；缩进使用两个空格。
- 认证提交与 ticket 操作不得重试；HTTP 适配器保持单跳并流式返回响应。
- 登录结果拥有各自的会话 Cookie jar，并实现 `Disposable`；客户端只保存配置。清理只释放本地引用，不代表远端会话失效或内存已被可靠擦除。
- 测试数据只能使用合成重建的 fixture；不得在源码或 CI 中保存真实凭据、Cookie 或 ticket。
- 不提交 `dist/` 构建产物。

## 验证与发布

根据改动选择验证：通常运行 `vp check` 与相关测试；构建或包内容变更时，再运行 `vp run build` 或 `vp run check:package`。报告实际运行的命令及未运行的检查。

- 发布源标签格式为 `release-X.Y.Z`，安装产物使用不可变标签 `vX.Y.Z`。
- 不覆盖已有版本标签，也不隐藏发布失败。

## 提交信息

使用 Gitmoji 加简洁中文描述，例如：`✨ 新增 Result 模式安全登录`、`🐛 修复 XML 标签解析边界`。
