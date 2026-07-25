# Spec-001：本地实时语音导游 Agent 第一版

> 本文保留第一版纯语音基线的历史范围。后续已按 [Spec-003](spec-003-web-search-and-capability-modules.md) 增加网络搜索工具；其中“不包含工具调用”不代表当前版本仍无工具。

**日期：** 2026-07-15  
**状态：** 已完成

## 背景

用户在进行 Microsoft Flight Simulator 模拟飞行时，需要一位能实时语音交流的导游。第一版的重点是快速验证自然语音对话体验和本地开发闭环，而非模拟器状态感知或复杂业务自动化。

## 需求边界

**包含：**

- 使用 TypeScript 开发一个可运行的 LiveKit Agents Node.js 实时语音 Agent。
- 每位用户进入独立 LiveKit 房间，与该房间的导游 Agent 进行纯语音对话。
- 导游 Agent 能围绕模拟飞行提供简洁、友好的讲解与问答；默认使用“周晓晓”这一名称及其清爽、自然、直接的表达风格，并由 `conversation` 模块维护。
- 通过 pnpm 管理依赖，并把安装时的当前稳定版锁定在 `pnpm-lock.yaml`。
- 使用 Zod 校验运行时环境配置；未来的工具入参同样必须使用 Zod Schema。
- 当前版本使用 DeepSeek LLM、豆包流式 STT 与豆包双向流式 TTS，并通过 `src/providers/registry.ts`（Provider 工厂注册表）集中装配。
- 使用 Vitest 覆盖配置校验、导游策略构建和 Provider 选择等核心逻辑。
- 支持在本地启动与基本人工联调。

**不包含：**

- Microsoft Flight Simulator 的位置、航线、机场、仪表或任何遥测数据。
- 工具调用、外部数据查询、RAG（检索增强生成）或数据库。
- 多人共用房间、多个用户与一个 Agent 同时对话。
- Web、移动端、桌面端客户端的实现与发布。
- 云端部署、容器化、CI/CD、账号系统和用量计费。
- DeepSeek 与豆包语音以外的 Provider、运行时供应商切换、自动回退和成本路由。

## 验收标准

- [x] `pnpm install` 后可用项目脚本启动本地 Agent，且脚本名称、参数与当前 LiveKit 官方文档及已安装 SDK 类型一致。
- [x] 使用有效本地配置时，Agent 能加入用户的独立 LiveKit 房间并完成至少一轮“用户说话 → Agent 语音回复”。
- [x] 缺少 LiveKit 或选定 Provider 的必填环境变量时，启动在连接前以不含密钥的明确错误失败。
- [x] 周晓晓的人设提示词与导游事实边界不位于 Agent 进程入口文件中。
- [x] Agent 入口文件不直接解析 `process.env`，也不含 Provider 密钥或 Provider 特定初始化细节。
- [x] DeepSeek LLM、豆包 STT/TTS 均经 `registry.ts` 创建；LLM 优先复用已安装的 LiveKit OpenAI 兼容插件，STT/TTS 仅在官方插件缺失时使用隔离的最小适配器。
- [x] 配置支持 STT 的 Speech API Key 优先模式，以及 App ID + Access Token 后备模式；TTS 必须验证 App ID、Access Token、resource ID 和已授权 speaker。
- [x] `pnpm test` 运行 Vitest 核心测试并通过，默认不需要真实云端密钥。
- [x] 仓库不跟踪 `.env` 或任何真实密钥；存在 `.env.example` 说明必需变量。

## 场景描述

**正常流程：**

1. 开发者复制 `.env.example` 为本地 `.env`，填入 LiveKit、DeepSeek 和豆包语音凭据。
2. 开发者用 pnpm 脚本启动 Agent。
3. 用户客户端加入其独立 LiveKit 房间。
4. LiveKit 将 Agent 分派到该房间；用户说出模拟飞行相关问题。
5. Agent 以导游身份生成并播放语音回复。

**配置异常流程：**

1. 开发者缺失、拼错或填入无效的环境变量。
2. Zod 配置解析在启动阶段失败。
3. 程序输出变量名与修复说明，但不回显密钥，并以非零状态结束。

**Provider 异常流程：**

1. 用户已加入房间，但语音或语言 Provider 初始化/调用失败。
2. Agent 记录可诊断且已脱敏的错误上下文。
3. Agent 遵循 LiveKit 当前 SDK 的会话终止或重试能力处理，不假设未核验的重试 API；用户不会收到伪造的成功回复。

## 实施顺序

1. [x] 初始化 pnpm、TypeScript、Vitest、ESLint/格式化工具与 `.gitignore`；安装 LiveKit Agents 当前稳定版并核验 API。
2. [x] 实现 `config` 的 Zod Schema、`.env.example` 与单元测试。
3. [x] 实现 `conversation` 的周晓晓表达风格、导游事实边界和单元测试。
4. [x] 在 `providers` 中建立 LLM/STT/TTS 分类注册表；以 LiveKit OpenAI 兼容插件接入 DeepSeek LLM，并核对是否已有官方豆包语音插件。
5. [x] 在各自 Provider 子目录实现豆包 STT/TTS 的最小协议适配器与 mock 测试。
6. [x] 在 `agent` 中按官方当前 SDK 类型实现入口、worker/dispatcher 与语音会话。
7. [x] 使用本机 LiveKit Server 与真实火山凭据完成本地房间人工联调：用户确认“用户说话 → Agent 语音回复”无问题；保留不依赖真实密钥的集成测试、配置自检命令和[冒烟测试手册](../testing/local-agent-smoke.md)。
8. 只有在该流程稳定后，另立 Spec 实现工具调用和模拟器数据模块。

## 相关测试

- `tests/unit/config.test.ts`：环境变量校验、STT 凭据优先级与错误脱敏。
- `tests/unit/providers/registry.test.ts`：DeepSeek LLM 与豆包 STT/TTS 注册和工厂选择。
- `tests/unit/guide-prompt.test.ts`：周晓晓语言风格、导游事实边界与默认语言策略。
- `tests/integration/agent-composition.test.ts`：依赖装配边界，不连接真实服务。
- `tests/e2e/local-room.smoke.test.ts`：可选、显式启用的本地 LiveKit 冒烟测试。

## 相关 ADR

- [ADR-001：以 LiveKit Agents 为实时语音边界](../adr/adr-001-livekit-agent-boundary.md)
- [ADR-003：Zod 边界校验与密钥管理](../adr/adr-003-zod-config-and-secrets.md)
- [ADR-005：DeepSeek 作为当前 LLM 基线](../adr/adr-005-deepseek-llm-baseline.md)
