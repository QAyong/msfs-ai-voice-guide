# Microsoft Flight Simulator AI 导游助手

这是一个使用 TypeScript 与 LiveKit Agents 构建的实时语音导游助手。第一版目标是尽快在本地跑通“一名用户进入一间房间，与导游 Agent 自然语音对话”的闭环。

当前尚处于设计阶段，尚未选择 LLM（大语言模型）、STT（语音转文字）和 TTS（文字转语音）供应商，也未实现模拟器数据接入或工具调用。

## 文档入口

- [第一版规格](docs/specs/spec-001-voice-guide-v1.md)
- [架构概览](docs/architecture/overview.md)
- [架构决策](docs/adr/)
- [协作与编码约定](AGENT.md)

## 实施原则

使用 pnpm 锁定依赖；LiveKit Agents 的包名、版本和 API 必须以安装当日的官方文档与本地 TypeScript 类型定义为准。不要把未核验的示例或记忆中的 API 直接写入生产代码。

所有本地密钥通过环境变量注入。实施阶段会提供 `.env.example`，但绝不提交真实 `.env` 文件。
