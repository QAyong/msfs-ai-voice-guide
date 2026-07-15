# 火山引擎 Provider 集成设计

**最后更新：** 2026-07-15  
**状态：** 已实现，等待真实凭据联调

## 目标与来源

第一版固定使用火山引擎：火山方舟提供 LLM（大语言模型），豆包语音提供 STT（语音转文字）和 TTS（文字转语音）。结构沿用参考项目 `[reference project]` 的有效边界：按 STT/LLM/TTS 分类、由集中注册表装配 Provider、集中配置和启动前自检；不复制其 Python/Pipecat 协议实现。

本项目仍遵循自身已确认的安全约束：真实密钥仅从 `.env` 或进程环境变量读取，不创建或写入带密钥的 `settings.json`。

## Provider 目录与注册方式

```text
src/providers/
  registry.ts             # 唯一装配入口，注册并创建各能力
  llm/volcengine.ts       # 火山方舟 LLM 工厂
  stt/volcengine.ts       # 豆包流式 ASR 适配器/工厂
  tts/volcengine.ts       # 豆包双向流式 TTS 适配器/工厂
  health.ts               # Provider 无副作用配置检查与可选连通性检查
```

`registry.ts`（Provider 工厂注册表）按能力类型导出 `createLLM`、`createSTT`、`createTTS`。第一版只注册 `volcengine`，但 Agent 入口只能调用这些工厂，不得直接初始化火山 SDK 或 WebSocket。新增供应商时新增同类适配器并在注册表登记，调用方不变。

这不是通用插件框架：不实现动态加载、远程注册或 Provider 自动故障切换。注册表仅解决已存在的三类 Provider 创建职责。

## 组件映射

| 能力 | 第一版实现                    | 复用优先级                                                                                                            | 关键配置                                                                    |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| LLM  | 火山方舟 OpenAI 兼容 Chat API | 首选当前 LiveKit OpenAI 插件的兼容端点能力；安装后核对其 `baseURL`、`apiKey` 和模型类型                               | `VOLCENGINE_ARK_API_KEY`、`VOLCENGINE_ARK_BASE_URL`、`VOLCENGINE_LLM_MODEL` |
| STT  | 豆包大模型流式 ASR            | 先检查当前 LiveKit 官方插件是否已原生支持；若没有，仅在 `src/providers/stt/volcengine.ts` 实现官方 WebSocket 协议适配 | `VOLCENGINE_SPEECH_API_KEY` 或 App ID + Access Token、endpoint、resource ID |
| TTS  | 豆包双向流式 TTS WebSocket    | 先检查当前 LiveKit 官方插件是否已原生支持；若没有，仅在 `src/providers/tts/volcengine.ts` 实现官方 WebSocket 协议适配 | App ID、Access Token、endpoint、resource ID、speaker                        |

截至本设计更新日，LiveKit Node.js 的官方插件目录提供了按 Provider 独立安装的插件，并明确支持使用 OpenAI 插件连接 OpenAI 兼容 LLM；火山方舟文档也说明其兼容 OpenAI SDK。因此，LLM 不应重新实现 HTTP 客户端。STT/TTS 是否已有官方火山插件必须在实际安装日再次核对；没有才写最小适配器。参考：[LiveKit 插件总览](https://docs.livekit.io/agents/integrations/plugins/)、[LiveKit OpenAI 兼容 LLM](https://docs.livekit.io/agents/models/llm/openai-compatible-llms/)、[火山方舟 OpenAI SDK 兼容说明](https://www.volcengine.com/docs/82379/1330626?lang=zh)。

## 环境配置

`.env.example`（环境变量模板）是唯一可提交的配置样例。`src/config/schema.ts` 使用 Zod 在启动时解析、校验和转换下列变量；业务模块不可直接读取 `process.env`。

| 配置组   | 必填变量                                                                                                                 | 规则                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| LiveKit  | `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`、`LIVEKIT_AGENT_NAME`                                             | URL 格式与非空字符串校验；日志不得输出 API Secret。                       |
| 方舟 LLM | `VOLCENGINE_ARK_API_KEY`、`VOLCENGINE_ARK_BASE_URL`、`VOLCENGINE_LLM_MODEL`                                              | 模型值使用已开通的 endpoint/model ID；不在文档中硬编码过期模型名。        |
| 豆包 STT | `VOLCENGINE_SPEECH_API_KEY`，或 `VOLCENGINE_SPEECH_APP_ID` + `VOLCENGINE_SPEECH_ACCESS_TOKEN`；另需 endpoint/resource ID | Speech API Key 存在时优先使用；否则要求 App ID 和 Access Token 成对存在。 |
| 豆包 TTS | `VOLCENGINE_SPEECH_APP_ID`、`VOLCENGINE_SPEECH_ACCESS_TOKEN`、endpoint、resource ID、speaker                             | `speaker` 必须是账户已开通的音色；采样率必须为正整数。                    |

TTS 采用火山文档推荐的 V3 双向流式 WebSocket，适合实时文本输入与流式音频输出；端点、资源 ID 和音色许可均以账户控制台及官方当日文档为准。[豆包语音双向流式 TTS 文档](https://www.volcengine.com/docs/6561/2532486?lang=zh)

## 实施与验证顺序

1. 以 pnpm 安装当前稳定的 `@livekit/agents` 与所需官方 LiveKit 插件，锁定 `pnpm-lock.yaml`；读取本地 `.d.ts` 确认 API。
2. 完成 Zod 配置 Schema，并为“STT 两种凭据模式”“TTS 必填配置”“错误脱敏”编写 Vitest 单元测试。
3. 实现 `registry.ts` 与火山方舟 LLM 工厂，优先复用 LiveKit OpenAI 兼容插件。
4. 核对 LiveKit 是否已有火山 STT/TTS 官方插件；若无，分别实现最小 WebSocket 适配器，协议代码不得泄漏到 `agent` 或 `conversation`。
5. 实现 `health.ts`：默认仅校验本地配置；使用显式命令或开关才进行远程连通性检查，且脱敏记录 request/log ID。
6. 将三个工厂产物传入 LiveKit 会话，进行本地独立房间人工语音冒烟测试。

## 测试边界

- 单元测试必须覆盖配置优先级、注册表映射、非法参数拒绝和脱敏错误；使用 mock，不用真实密钥。
- 适配器测试使用录制的脱敏协议帧或本地 mock WebSocket，不复刻整套火山服务。
- 远程 STT/TTS/LLM 自检单独运行，显式读取本地 `.env`，不作为 `pnpm test` 的默认前提。
- 所有测试仍只放在本项目的 `tests/`（唯一测试目录）下，按 `unit`、`integration`、`e2e` 分类；不要在业务模块旁重复创建测试根目录。
