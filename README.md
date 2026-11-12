# Haven Studio

[中文](README.md) · [English](README.en.md)

面向结构化模型的可视化编辑工程，围绕文档会话、编辑命令、候选审阅与 Haven API 协作。当前可用范围是编辑与审阅内核；完整可视化工作台仍在设计阶段。

## 功能

- 文档编辑：文档作用域、节点创建、编辑命令与错误处理。
- 会话状态：文档会话与 JSON 编辑缓冲，衔接界面编辑过程。
- 候选审阅：候选上下文、校验结果和命令提交接口。
- 共享契约：依赖 Haven Kit 的 Schema、Runtime 和 UI 包。
- 服务集成：模型 API、候选 API 与本地代理配置。
- 开发验证：Angular 类型检查、内核单元测试与构建脚本。

## 快速开始

Node.js `>=26.13.0 <27`、pnpm `12.18.0`，以及匹配版本的 Haven Kit 包。

```sh
# Build and publish the matching Haven Kit packages first.
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

## 配置

| 配置项 | 说明 |
| --- | --- |
| `proxy.conf.json` | 本地 Haven API 代理目标。 |
| `src/app/document/` | 文档编辑与会话。 |
| `src/app/candidates/` | 候选 API、状态与审阅。 |
| `@haven registry` | 匹配 Schema/Runtime/UI 包的仓库。 |

## 使用

`pnpm start` 启动开发壳。开发编辑功能时，在 `src/app/document/` 与 `src/app/candidates/` 中组织内核逻辑，并通过共享契约连接 API。当前入口不是可直接部署给终端用户的完整编辑器。

## 项目结构

- `src/app/document/` — 文档内核
- `src/app/candidates/` — 候选审阅内核
- `src/app/core/` — API 与公共能力

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)。原创部分与第三方组件的适用范围见 [LICENSE_SCOPE.md](LICENSE_SCOPE.md)；各第三方版权和许可见相应声明文件。
