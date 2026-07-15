# ADR-005：DeepSeek 作为当前 LLM 基线

**日期：** 2026-07-15  
**状态：** 已接受

## 背景

本地语音闭环已通过验证。现在需要将导游的 LLM（大语言模型）从火山方舟切换为 DeepSeek，同时保留已经验证可用的豆包 STT（语音转文字）和 TTS（文字转语音）。原 ADR-004 的“火山为唯一 Provider”结论不再符合当前需求。

## 决策

当前版本固定使用 DeepSeek OpenAI 兼容 Chat Completions API 作为唯一 LLM 实现；使用已安装的 LiveKit OpenAI 插件（`@livekit/agents-plugin-openai`）创建实例。豆包流式 STT/TTS 继续由火山适配器提供。

`src/providers/registry.ts`（Provider 工厂注册表）仍是唯一装配入口。此次是基线切换，不实现 `LLM_PROVIDER`（运行时 Provider 选择）、自动回退或并行双 Provider 路由。

## 原因

DeepSeek 官方提供 OpenAI 兼容接口，现有 LiveKit 插件已满足连接、流式响应和 SDK 集成需求，无需重复实现 HTTP 客户端。固定单一 LLM 让配置和故障面保持最小；未来再次需要多个可用 LLM 时，再根据第二个真实使用点设计选择策略。

## 影响

- `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_LLM_MODEL` 成为 LLM 必填配置；真实 Key（密钥）仅写入未跟踪的 `.env`（本机环境文件）。
- 默认地址为 `https://api.deepseek.com`，默认模型为 `deepseek-v4-flash`；均可由环境变量覆盖。
- 移除运行时对火山方舟 LLM 配置和工厂的依赖；火山配置仅保留 STT/TTS 所需字段。
- 配置解析、注册表及 Agent 装配测试必须改为验证 DeepSeek LLM；真实 API 连通性需在提供有效 DeepSeek Key 后单独验证。

## 不在此决策范围内

- DeepSeek Key 的申请、充值、权限开通或模型费用。
- LLM 多 Provider 运行时切换、自动回退和成本路由。
- 豆包 STT/TTS 的认证、资源 ID、音色和协议变更。
