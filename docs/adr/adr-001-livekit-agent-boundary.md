# ADR-001：以 LiveKit Agents 作为实时语音边界

**日期：** 2026-07-15  
**状态：** 已接受

## 背景

第一版需要尽快实现可靠的实时语音 Agent，同时后续可能加入客户端、工具调用和多种语音/语言模型。自行实现实时音频、信令、房间调度或打断机制成本高且会偏离产品目标。

## 决策

使用当前稳定版本的 LiveKit Agents Node.js SDK 负责实时语音 Agent 生命周期与房间会话；只在专门的 Agent 集成层调用其 API。

## 原因

LiveKit 已提供面向实时房间和 Agent 的成熟能力，能让第一版聚焦导游体验。把 SDK 调用集中在边界层，使 SDK 升级、客户端增加或会话策略调整不会扩散到提示词、配置和未来工具模块。

## 影响

- 安装或升级依赖前后，必须核验 LiveKit 官方文档、发布说明与本地 TypeScript 类型定义。
- 不得根据旧示例、博客或记忆臆造 SDK API；不确定时先写最小验证代码或查阅当前类型。
- 不自行重造音频传输、房间管理、VAD、WebSocket 信令或 Agent 调度。
- `src/agent/` 可以依赖 LiveKit；`src/conversation/`、`src/config/` 和未来 `src/tools/` 不可直接依赖它。

## 不在此决策范围内

- 使用 LiveKit Cloud 还是自建服务。
- 火山引擎之外的 LLM、STT、TTS 供应商选择（第一版火山基线见 ADR-004）。
- 客户端 Token 签发和房间命名规则。
