# Microsoft Flight Simulator AI 导游助手

这是一个使用 TypeScript 与 LiveKit Agents 构建的实时语音导游助手。第一版目标是尽快在本地跑通“一名用户进入一间房间，与导游 Agent 自然语音对话”的闭环。

当前尚处于设计阶段。第一版固定使用火山方舟 LLM（大语言模型）、豆包 STT（语音转文字）和豆包 TTS（文字转语音）；尚未实现模拟器数据接入或工具调用。

## 文档入口

- [第一版规格](docs/specs/spec-001-voice-guide-v1.md)
- [架构概览](docs/architecture/overview.md)
- [火山引擎集成设计](docs/architecture/volcengine-integration.md)
- [架构决策](docs/adr/)
- [协作与编码约定](AGENT.md)

## 实施原则

使用 pnpm 锁定依赖；LiveKit Agents 的包名、版本和 API 必须以安装当日的官方文档与本地 TypeScript 类型定义为准。不要把未核验的示例或记忆中的 API 直接写入生产代码。

所有本地密钥通过环境变量注入。请复制 [`.env.example`](.env.example) 为本地 `.env` 并填写凭据；绝不提交真实 `.env` 文件。

## 当前开发命令

需要 Node.js 24 和 pnpm 11。安装依赖后，可运行以下工程检查：

```powershell
pnpm install
pnpm run verify
```

当前已完成工程工具链、LiveKit SDK 类型契约、火山 Provider 适配器和 LiveKit 会话入口。

## 本地运行

1. 复制 `.env.example` 为 `.env`，填入 LiveKit、火山方舟和豆包语音凭据。
2. 使用 `pnpm agent:check` 检查配置（不会输出密钥，也不会发起远程请求）。
3. 启动本地 Agent Worker（工作进程）：`pnpm agent:dev`。

Agent Worker 依赖可访问的 LiveKit Server；客户端和房间 Token 由后续客户端项目负责。本仓库当前不提供客户端实现。

完整的真实语音联调步骤见[本地冒烟测试](docs/testing/local-agent-smoke.md)。
