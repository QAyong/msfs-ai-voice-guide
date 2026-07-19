# 框架合规审核：桌面真实语音闭环与启动诊断

**日期：** 2026-07-19  
**结论：** 🟡 实现合规；真实 LiveKit 语音冒烟受本机 Server 环境阻塞

## 实现前依据

- 涉及框架及实际版本：`@livekit/agents` 1.5.2、`livekit-client` 2.20.1、`livekit-server-sdk` 2.17.0、Electron 43.1.1、React 19.2.7、Zod 4.4.3。
- 版本证据：`package.json`、`pnpm-lock.yaml`、各包 `node_modules/<package>/package.json`；`livekit-server-sdk` 2.17.0 已由 `@livekit/agents` 1.5.2 锁定并安装，功能实现会把它声明为直接依赖。
- 搜索到的项目内类似实现：`src/main.ts` 的 Worker 启动入口、`src/agent/guide-agent.ts` 的 `AgentSession`、`desktop/renderer/src/useMicrophoneTrack.ts` 的可复用 `LocalAudioTrack`、`desktop/main/index.ts` 的可信 IPC 和来源安全边界。
- 准备复用的项目模块：`loadConfig()`（配置解析）、`checkProviderConfiguration()`（Provider 自检）、`createGuideAgent()`（Agent 装配）、现有麦克风 Hook、窗口定位和来源浏览实现。
- 准备使用的官方能力：`AgentServer`、`AccessToken`、`RoomConfiguration`、`RoomAgentDispatch`、`Room.connect()`、`LocalParticipant.publishTrack()`、`RoomEvent.TrackSubscribed`、Text Stream `lk.transcription`、参与者属性 `lk.agent.state`、官方自动重连和 `RemoteAudioTrack.attach()`。
- 官方文档 URL 与具体章节：[Tokens & grants](https://docs.livekit.io/home/server/generating-tokens/)、[Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/)、[Text and transcriptions](https://docs.livekit.io/agents/multimodality/text/)、[Agent state](https://docs.livekit.io/frontends/build/agent-state/)、[Subscribing to tracks](https://docs.livekit.io/transport/media/subscribe/)、[Electron security](https://www.electronjs.org/docs/latest/tutorial/security)。
- 文档不匹配或不可用时检查的本地源码/类型定义：`@livekit/agents/src/worker.ts`、`@livekit/agents/src/voice/room_io/`、`livekit-client/src/room/Room.ts`、`livekit-client/src/room/data-stream/`、`livekit-server-sdk/src/AccessToken.ts`。
- 新增第三方依赖及理由：把已由 LiveKit Agents 锁定的 `livekit-server-sdk` 2.17.0 与匹配的 `@livekit/protocol` 1.49.0 声明为直接依赖，用官方 Token 与房间 Agent 分派能力代替自写 JWT。
- 自定义实现：仅增加产品特有的 IPC DTO（进程通信数据结构）、搜索来源消息、脱敏诊断映射和最小窗口状态存储；不实现框架已有的认证协议、重连、音频和转写基础设施。

## 自定义实现例外

- 官方能力为何不适用：LiveKit 不定义本产品的搜索来源卡片数据结构、Electron 本地配置引导和悬浮窗口恢复策略。
- 项目已有实现为何不能复用：现有来源卡片是静态数据，现有窗口定位没有跨重启存储，现有配置自检只有 CLI 输出。
- 成熟第三方方案为何不适用：这些逻辑规模小且属于应用领域数据；引入状态存储或 IPC 框架会扩大依赖和权限面。
- 维护风险：跨进程 DTO 演进、搜索来源和回答关联、窗口状态文件损坏。
- 防回归测试：Token、配置诊断、来源提取、窗口状态和 Room 事件映射的单元/集成测试。
- 相关 ADR：无需新增；实现遵循 ADR-001、ADR-003 和 ADR-006。

## 实现后核对

- 实际复用的模块或官方组件：`loadConfig()`、现有 `LocalAudioTrack` Hook、窗口/来源安全边界；LiveKit `AccessToken`、Agent dispatch、`Room`、官方媒体轨道、Text Stream、参与者状态属性和自动重连；Electron `utilityProcess.fork()` 隔离 Worker。
- 新增的自定义基础设施：最小权限桌面 Token 服务、脱敏 Readiness DTO、Worker 生命周期包装、窗口状态 JSON 存储，以及 `msfs.guide.sources` 搜索来源数据包。
- 偏离官方推荐方式：没有协议层偏离。桌面主进程不直接运行 `AgentServer`，而通过 Electron Utility Process 承载，并为 Agents SDK 的下级执行进程设置 Electron Node 模式；这是 Electron 进程模型所需的运行时隔离。

## 验证证据

| 检查              | 命令                                       | 结果                                                                           |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| 类型检查          | `pnpm typecheck && pnpm desktop:typecheck` | 通过                                                                           |
| Lint              | `pnpm lint`                                | 通过                                                                           |
| 构建              | `pnpm build`                               | 通过，产出主进程、Worker、Agent、Preload 与 Renderer                           |
| 框架原生检查      | `pnpm agent:check`                         | 通过，输出仅包含 configured 状态                                               |
| 自动化测试        | `pnpm test`                                | 通过：35 passed，8 skipped                                                     |
| Electron 启动诊断 | `pnpm desktop:preview`                     | Renderer 与 Worker 进程成功启动；LiveKit `127.0.0.1:7880` 未运行时正确返回错误 |
| 真实语音冒烟      | 本地 LiveKit Server + 桌面 PTT             | 未完成：Docker Desktop 无法启动，不能伪造通过                                  |

## 给非程序员的结论

- 🟡 代码使用了当前安装版本的官方 Token、Room、媒体、转写和 Electron 进程能力，自动化检查通过。唯一未闭合证据是真实本地 LiveKit Server 不可用，因此仍需在服务恢复后做一次“按住说话 → 听到回答”的人工冒烟复验。
