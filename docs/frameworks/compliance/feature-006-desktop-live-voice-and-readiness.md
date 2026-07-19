# 框架合规审核：桌面真实语音闭环与启动诊断

**日期：** 2026-07-19  
**结论：** 🟢 实现合规；真实连续语音闭环已由用户验收

## 实现前依据

- 涉及框架及实际版本：`@livekit/agents` 1.5.2、`@livekit/components-react` 2.9.21、`livekit-client` 2.20.1、`livekit-server-sdk` 2.17.0、Electron 43.1.1、React 19.2.7、Zod 4.4.3。
- 版本证据：`package.json`、`pnpm-lock.yaml`、各包 `node_modules/<package>/package.json`；`livekit-server-sdk` 2.17.0 已由 `@livekit/agents` 1.5.2 锁定并安装，功能实现会把它声明为直接依赖。
- 搜索到的项目内类似实现：`src/main.ts` 的 Worker 启动入口、`src/agent/guide-agent.ts` 的 `AgentSession`、`desktop/main/index.ts` 的可信 IPC 和来源安全边界。
- 准备复用的项目模块：`loadConfig()`（配置解析）、`checkProviderConfiguration()`（Provider 自检）、`createGuideAgent()`（Agent 装配）、窗口定位和来源浏览实现。
- 实际使用的官方前端能力：`useSession`、`SessionProvider`、`useAgent`、`useSessionMessages`、`useTrackToggle`、`useTrackVolume`、`useRpc`、`useDataChannel` 与 `RoomAudioRenderer`。
- 实际使用的官方 Agent 能力：`AgentSession.updateOptions()`、`manual` 手动轮次、`null` 自动轮次恢复、`commitUserTurn()`、`clearUserTurn()`、VAD interruption（语音活动打断）与参与者属性。
- 官方文档 URL 与具体章节：[Tokens & grants](https://docs.livekit.io/home/server/generating-tokens/)、[Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/)、[Text and transcriptions](https://docs.livekit.io/agents/multimodality/text/)、[Agent state](https://docs.livekit.io/frontends/build/agent-state/)、[Subscribing to tracks](https://docs.livekit.io/transport/media/subscribe/)、[Electron security](https://www.electronjs.org/docs/latest/tutorial/security)。
- 文档不匹配或不可用时检查的本地源码/类型定义：`@livekit/agents/src/worker.ts`、`@livekit/agents/src/voice/room_io/`、`livekit-client/src/room/Room.ts`、`livekit-client/src/room/data-stream/`、`livekit-server-sdk/src/AccessToken.ts`。
- 新增第三方依赖及理由：增加 `@livekit/components-react` 2.9.21，以官方 React Session、Agent、消息、媒体 Hook 取代 Renderer 自建语音会话状态；`livekit-server-sdk` 与 `@livekit/protocol` 继续负责官方 Token 与 Agent 分派。
- 自定义实现：仅增加产品特有的 IPC DTO（进程通信数据结构）、搜索来源消息、脱敏诊断映射和最小窗口状态存储；不实现框架已有的认证协议、重连、音频和转写基础设施。

## 自定义实现例外

- 官方能力为何不适用：LiveKit 不定义本产品的搜索来源卡片数据结构、Electron 本地配置引导和悬浮窗口恢复策略。
- 项目已有实现为何不能复用：现有来源卡片是静态数据，现有窗口定位没有跨重启存储，现有配置自检只有 CLI 输出。
- 成熟第三方方案为何不适用：这些逻辑规模小且属于应用领域数据；引入状态存储或 IPC 框架会扩大依赖和权限面。
- 维护风险：跨进程 DTO 演进、搜索来源和回答关联、窗口状态文件损坏。
- 防回归测试：Token、配置诊断、来源提取、窗口状态、官方语音状态、轮次模式映射和火山 final utterance 去重测试。
- 相关 ADR：无需新增；实现遵循 ADR-001、ADR-003 和 ADR-006。

## 实现后核对

- 实际复用的模块或官方组件：`loadConfig()`、窗口/来源安全边界；LiveKit 官方 Session、Agent state、session messages、track toggle、RPC、Data Channel、媒体渲染、Token、Agent dispatch、自动 Turn Detector、VAD 和自动重连；Electron `utilityProcess.fork()` 隔离 Worker。
- 已删除的自建基础设施：`useVoiceSession`、`useMicrophoneTrack`、Renderer 直接监听/拼接转写，以及自定义用户轮次 committed 数据主题。
- 保留的产品自定义边界：最小权限桌面 Token 服务、脱敏 Readiness DTO、Worker 生命周期、窗口状态、语音模式 RPC 名称、用户 speaking/listening 属性，以及 `msfs.guide.sources` 搜索来源数据包。
- Provider 例外：LiveKit 当前没有本项目所需的火山流式 ASR 适配器，因此 `src/providers/stt/volcengine.ts` 保留最小协议适配，并在 Provider 边界去重同一 ASR 请求的重复 final utterance；Renderer 不参与该去重。
- 偏离官方推荐方式：没有语音框架或协议层偏离。Electron Utility Process 仅承担 Worker 进程隔离。

## 验证证据

| 检查              | 命令                                       | 结果                                                                    |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| 类型检查          | `pnpm typecheck && pnpm desktop:typecheck` | 通过                                                                    |
| Lint              | `pnpm lint`                                | 通过                                                                    |
| 构建              | `pnpm build`                               | 通过，产出主进程、Worker、Agent、Preload 与 Renderer                    |
| 框架原生检查      | `pnpm agent:check`                         | 通过，输出仅包含 configured 状态                                        |
| 自动化测试        | `pnpm test`                                | 通过：47 passed，8 skipped                                              |
| Electron 启动诊断 | `pnpm desktop:preview`                     | Renderer、官方 Session 与 Worker 进程成功启动；Worker 健康检查 HTTP 200 |
| 真实连续语音冒烟  | 桌面连续对话                               | 用户确认“停止讲话 → 自动提交 → Agent 回答”闭环通过                      |
| 模式切换回归      | PTT ↔ 连续对话                             | 共用 Session、麦克风、STT 与消息管线；仅切换官方轮次控制策略            |
| 转写去重          | 火山累计 utterance                         | 同一请求重复 final 被 Provider 拦截；interim→final 保持                 |

## 给非程序员的结论

- 🟢 Renderer 的语音连接、状态、消息、麦克风和回答播放已经由 LiveKit 官方 React 能力统一管理。按住说话与连续对话共享同一条官方会话管线；真实连续语音已由用户验收，自动化检查与生产构建全部通过。
