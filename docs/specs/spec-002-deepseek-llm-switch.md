# Spec-002：DeepSeek LLM 切换

**日期：** 2026-07-15  
**状态：** 已完成

## 目标

将导游 Agent 的 LLM（大语言模型）从火山方舟改为 DeepSeek，同时维持已通过验证的豆包 STT/TTS 和 LiveKit 会话边界不变。

## 实现范围

- `src/config/schema.ts`（Zod 配置 Schema）只接受 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_LLM_MODEL` 作为 LLM 配置。
- `src/providers/llm/deepseek.ts`（DeepSeek 工厂）使用已安装的 LiveKit OpenAI 插件的 `LLM.withDeepSeek()`（创建 DeepSeek LLM）。
- `src/providers/registry.ts`（Provider 工厂注册表）创建 DeepSeek LLM、豆包 STT 和豆包 TTS；不增加运行时 Provider 选择或回退。
- `.env.example`（环境变量模板）、健康检查、单元测试、架构文档和 V1 规格同步改为 DeepSeek 基线。

## 验收结果

- [x] 真实 DeepSeek `deepseek-v4-flash` 请求成功返回文本，未记录或输出 API Key。
- [x] Zod 缺失 Key 时会在启动前失败，配置自检显示 `llm: deepseek`。
- [x] 注册表和配置测试覆盖 DeepSeek 装配；`pnpm test` 默认不需要真实 Key。
- [x] 豆包 STT/TTS 适配器与 LiveKit 会话入口未改动。

## 不包含

- DeepSeek 与火山方舟之间的运行时切换或自动回退。
- 工具调用、模拟器遥测或客户端实现。
- 因 LLM 更换而重新设计语音房间协议。

## 相关 ADR

- [ADR-005：DeepSeek 作为当前 LLM 基线](../adr/adr-005-deepseek-llm-baseline.md)
