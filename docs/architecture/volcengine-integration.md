# DeepSeek LLM 与火山语音 Provider 集成设计

**最后更新：** 2026-08-27

**状态：** 语音 Provider、搜索 API 与桌面真实服务检测均已实现；`searchWeb` 已完成真实接口和语音端到端验证

## 目标与来源

当前版本固定使用 DeepSeek 提供 LLM（大语言模型），豆包语音提供 STT（语音转文字）和 TTS（文字转语音）。结构沿用参考项目 `[reference project]` 的有效边界：按 STT/LLM/TTS 分类、由集中注册表装配 Provider、集中配置和启动前自检；不复制其 Python/Pipecat 协议实现。

本项目仍遵循自身已确认的安全约束：真实密钥仅从 `.env` 或进程环境变量读取，不创建或写入带密钥的 `settings.json`。

## 搜索 API 边界

豆包搜索 Custom API 与博查 Web Search API 是业务数据源，不属于 LLM、STT 或 TTS Provider，因此不进入 `src/providers/registry.ts`。它们由 `src/search/` 的统一服务和 Provider 适配器封装，再由 LiveKit Tool（工具）和 CLI（命令行工具）复用。

- API 地址：`https://open.feedcoopapi.com/search_api/web_search`
- 博查地址：`https://api.bochaai.com/v1/web-search`
- 认证方式：`Authorization: Bearer <API_KEY>`
- 结果使用：豆包优先使用 `Summary`（摘要）或 `Content`（正文）；博查使用 `summary` 或 `snippet`，统一转换为项目来源契约；保留来源 URL 和站点信息。
- `searchWeb` 是模型获取公开网页外部信息的通用入口，可查询天气、新闻、活动、规则、地点及知识资料；时效性回答需要核对来源地点和时间。
- 当前独立测试脚本：`scripts/test-volcengine-search.mjs` 继续评测豆包；博查通过 `SEARCH_PROVIDER=bocha` 和 `BOCHA_SEARCH_API_KEY` 复用 CLI/冒烟链路验证。
- 搜索结果必须经过实体相关性、来源策略、去重和无结果保护，API 返回的权威等级不能直接等同于项目可信度。

详细范围与验收条件见 [Spec-003：网络搜索与可扩展能力模块](../specs/spec-003-web-search-and-capability-modules.md) 和 [ADR-006：搜索访问边界](../adr/adr-006-search-access-boundary.md)。

## 桌面设置服务检测

设置页的 `settings:test-service`（服务检测 IPC）验证的是当前服务的真实功能，不再把模型列表、WebSocket 建连或 HTTP 状态码当作最终成功条件。检测使用当前表单中的非敏感配置和本次输入的凭据更新，不保存草稿、不修改 Agent 会话，也不会把凭据返回 Renderer。

| 服务 | 真实检测请求 | 成功条件 |
| ---- | ------------ | -------- |
| DeepSeek LLM | 向 `DEEPSEEK_BASE_URL/chat/completions` 发送固定的最小对话请求；V4 模型关闭 thinking，限制 `max_tokens` 为 16 | HTTP 成功且返回非空 `choices[0].message.content` |
| 豆包 STT | 连接 `sauc/bigmodel` WebSocket，读取按项目语言选择的内置 WAV 样本，截取 2 秒并转换为 16 kHz、单声道、16-bit PCM；发送完整 ASR 请求、音频包和最终包 | 收到服务端最终识别包并得到非空转写 |
| 豆包 TTS | 使用 V3 双向流式 WebSocket 完成连接、会话、固定短文本合成、结束会话和结束连接 | 收到至少一个音频包 |
| 网页搜索 | 通过当前选中的豆包 Custom API 或博查 Provider 发起真实搜索 | Provider 返回符合搜索响应契约的结果 |

STT 当前运行时使用的是流式资源，因此设置检测也必须走同一条流式链路；火山另有一次请求直接返回结果的录音文件极速版，但它要求独立的 `volc.bigasr.auc_turbo` 资源，不能代替当前流式资源的验证。[大模型流式识别文档](https://www.volcengine.com/docs/6561/1354871?lang=zh)、[录音文件极速版识别文档](https://www.volcengine.com/docs/6561/1631584?lang=zh)

所有远程检测共用 10 秒超时和同一目标 2.5 秒重复检测限流。由于检测是真实服务请求，服务商的调用次数、字符数、语音时长和配额规则仍然适用；单元测试继续使用 mock，不读取真实密钥。[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[豆包双向流式 TTS](https://www.volcengine.com/docs/6561/2228192?lang=zh)

## Provider 目录与注册方式

```text
src/providers/
  registry.ts             # 唯一装配入口，注册并创建各能力
  llm/deepseek.ts         # DeepSeek LLM 工厂
  stt/volcengine.ts       # 豆包流式 ASR 适配器/工厂
  tts/volcengine.ts       # 豆包双向流式 TTS 适配器/工厂
  health.ts               # Provider 无副作用配置检查与可选连通性检查
desktop/main/service-checks.ts # 设置页真实服务检测
```

`registry.ts`（Provider 工厂注册表）按能力类型创建 DeepSeek LLM、豆包 STT 和豆包 TTS。Agent 入口只能调用这些工厂，不得直接初始化 DeepSeek 客户端、火山 SDK 或 WebSocket。新增供应商时新增同类适配器并在注册表登记，调用方不变。

这不是通用插件框架：不实现动态加载、远程注册或 Provider 自动故障切换。注册表仅解决已存在的三类 Provider 创建职责。

## 组件映射

| 能力 | 第一版实现                    | 复用优先级                                                                                                            | 关键配置                                                                    |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| LLM  | DeepSeek OpenAI 兼容 Chat API | 使用当前 LiveKit OpenAI 插件的 `withDeepSeek()`（创建 DeepSeek LLM）能力；安装后核对其 `baseURL`、`apiKey` 和模型类型 | `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_LLM_MODEL`               |
| STT  | 豆包大模型流式 ASR            | 先检查当前 LiveKit 官方插件是否已原生支持；若没有，仅在 `src/providers/stt/volcengine.ts` 实现官方 WebSocket 协议适配 | `VOLCENGINE_SPEECH_API_KEY` 或 App ID + Access Token、endpoint、resource ID |
| TTS  | 豆包双向流式 TTS WebSocket    | 先检查当前 LiveKit 官方插件是否已原生支持；若没有，仅在 `src/providers/tts/volcengine.ts` 实现官方 WebSocket 协议适配 | App ID、Access Token、endpoint、resource ID、speaker                        |
| 搜索 | 豆包 Custom / 博查 Web Search HTTP API | 由 `src/search/` 封装并被 LiveKit Tool 与 CLI 复用，不进入语音 Provider 注册表                              | `SEARCH_PROVIDER` 与对应 API Key                                            |

截至本设计更新日，已安装 LiveKit OpenAI 插件的类型定义提供 `LLM.withDeepSeek()`；DeepSeek 官方也确认其 Chat Completions API 与 OpenAI API 兼容。因此，LLM 不应重新实现 HTTP 客户端。STT/TTS 是否已有官方豆包插件必须在实际安装日再次核对；没有才写最小适配器。参考：[LiveKit 插件总览](https://docs.livekit.io/agents/integrations/plugins/)、[DeepSeek API 快速开始](https://api-docs.deepseek.com/)。

## 环境配置

`.env.example`（环境变量模板）是唯一可提交的配置样例。`src/config/schema.ts` 使用 Zod 在启动时解析、校验和转换下列变量；业务模块不可直接读取 `process.env`。

| 配置组       | 必填变量                                                                                                                 | 规则                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| LiveKit      | `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`、`LIVEKIT_AGENT_NAME`                                             | URL 格式与非空字符串校验；日志不得输出 API Secret。                                                 |
| DeepSeek LLM | `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_LLM_MODEL`                                                            | 默认地址为官方兼容地址，默认模型为 `deepseek-v4-flash`。                                            |
| 豆包 STT     | `VOLCENGINE_SPEECH_API_KEY`，或 `VOLCENGINE_SPEECH_APP_ID` + `VOLCENGINE_SPEECH_ACCESS_TOKEN`；另需 endpoint/resource ID | Speech API Key 存在时优先使用；否则要求 App ID 和 Access Token 成对存在。                           |
| 豆包 TTS     | `VOLCENGINE_SPEECH_APP_ID`、`VOLCENGINE_SPEECH_ACCESS_TOKEN`、endpoint、resource ID、speaker                             | `speaker` 必须是账户已开通的音色；采样率必须为正整数。                                              |
| 网络搜索     | `SEARCH_PROVIDER`、`VOLCENGINE_SEARCH_API_KEY` 或 `BOCHA_SEARCH_API_KEY`                                                  | Agent 未配置当前服务商 Key 时不注册工具；搜索 CLI 必须配置对应 Key。不得写入 CLI 参数、日志、测试快照或提交文件。 |

TTS 采用火山文档推荐的 V3 双向流式 WebSocket，适合实时文本输入与流式音频输出；端点、资源 ID 和音色许可均以账户控制台及官方当日文档为准。[豆包语音双向流式 TTS 文档](https://www.volcengine.com/docs/6561/2532486?lang=zh)

### 桌面音色目录与语言适配

桌面设置不会维护一份远程或硬编码的完整音色目录。主进程只从项目内 `resources/tts/confirmed-voices/` 读取本地音频样例，通过白名单 IPC 返回样例数据；Renderer 根据当前项目语言过滤列表，并提供试听/停止试听按钮。试听只读取本地样例，不会修改服务配置。

- 中文默认 speaker 为 `zh_female_vv_uranus_bigtts`（Vivi）。
- 英文默认 speaker 为 `en_female_dacey_uranus_bigtts`（Dacey）；`en_female_stokie_uranus_bigtts`（Stokie）可选。
- 自定义 speaker ID 不参与内置音色语言对齐，切换项目语言时原样保留。
- `en_male_tim_uranus_bigtts` 已退出可选目录；读取旧配置时，英文迁移到 Dacey，中文迁移到 Vivi。
- `scripts/stage-tts-voice-samples.mjs` 在 `desktop:build` 时先清理目标目录，再复制本地样例，确保删除的音色不会残留在 `out/tts`。

### 当前可提交模板的参考基线

为与 `[reference project]` 已完成的本地配置保持一致，`.env.example`（环境变量模板）预填了下列非敏感默认值：方舟模型 `doubao-seed-2-0-mini-260215`、STT `bigmodel` / `volc.bigasr.sauc.duration`，以及 TTS `seed-tts-2.0` / `zh_female_vv_uranus_bigtts`。真实凭据仍只允许写入未跟踪的 `.env`（本机环境文件）或进程环境变量；LiveKit 的 URL、API Key 和 API Secret 必须由实际房间服务提供，不能从该参考项目推断。

## 已完成的实施与验证顺序

1. 以 pnpm 安装当前稳定的 `@livekit/agents` 与所需官方 LiveKit 插件，锁定 `pnpm-lock.yaml`；读取本地 `.d.ts` 确认 API。
2. 完成 Zod 配置 Schema，并为“STT 两种凭据模式”“TTS 必填配置”“错误脱敏”编写 Vitest 单元测试。
3. 实现 `registry.ts` 与 DeepSeek LLM 工厂，复用 LiveKit OpenAI 插件的 `withDeepSeek()`。
4. 核对 LiveKit 是否已有火山 STT/TTS 官方插件；若无，分别实现最小 WebSocket 适配器，协议代码不得泄漏到 `agent` 或 `conversation`。
5. 实现 `health.ts` 的 Provider 配置检查，以及桌面 `service-checks.ts` 的真实功能检测；所有错误脱敏，不记录凭据或响应正文。
6. 将三个工厂产物传入 LiveKit 会话，进行本地独立房间人工语音冒烟测试。
7. 实现 `src/search/` 共享搜索服务，完成结果标准化、相关性和来源保护；再分别接入 LiveKit Tool 与 CLI。
8. 使用 8 组真实查询验证有效召回与低置信度保护，并在 LiveKit 房间确认“STT → DeepSeek → `searchWeb` → DeepSeek → TTS”链路。

## 测试边界

- 单元测试必须覆盖配置优先级、注册表映射、非法参数拒绝和脱敏错误；使用 mock，不用真实密钥。
- 适配器测试使用录制的脱敏协议帧或本地 mock WebSocket，不复刻整套火山服务。
- 远程 STT/TTS/LLM 自检单独运行，显式读取本地 `.env`，不作为 `pnpm test` 的默认前提；桌面设置检测走同一套真实请求逻辑。
- `pnpm search:smoke` 运行经过项目保护层的 8 组真实查询；`pnpm search:test` 评测原始 API 候选结果。两者均不作为默认 `pnpm test` 的前提。
- 所有测试仍只放在本项目的 `tests/`（唯一测试目录）下，按 `unit`、`integration`、`e2e` 分类；不要在业务模块旁重复创建测试根目录。

2026-08-27 使用本机凭据完成一次真实服务检测：DeepSeek LLM、豆包 STT、豆包 TTS 和当前网页搜索 Provider 均返回可用；STT 使用 2 秒内置样本，最终检测耗时约 1.3 秒。凭据值未写入仓库、日志或文档。
