# Spec-006：桌面真实语音闭环与启动诊断

**日期：** 2026-07-19  
**状态：** 已验收

## 背景

现有 LiveKit Agent 已能通过 LiveKit Meet 完成真实语音对话，Electron 桌面端也已具备悬浮窗口、本地麦克风轨道和来源浏览窗，但两者尚未连接。用户仍需手工启动 Worker、生成 Token 并打开第三方客户端，桌面聊天内容也是静态示例。

本功能把现有后端和桌面端连成一个可直接使用的本地应用，并把配置、Worker 和房间连接故障转化为用户可理解、可重试的状态。

## 需求边界

**包含：**

- Electron 主进程作为可信本地边界签发短期 LiveKit 参与者 Token；Renderer（渲染进程）不接触 `LIVEKIT_API_SECRET`。
- 每次桌面会话使用唯一房间，并通过 Token 的 `RoomConfiguration`（房间配置）显式分派 `LIVEKIT_AGENT_NAME` 指定的 Agent。
- Renderer 以 `@livekit/components-react` 的 `useSession` 与 `SessionProvider` 作为唯一 Room（房间）会话边界，不自行创建第二套连接生命周期。
- `useTrackToggle` 管理同一条本地麦克风管线；支持鼠标/空格键按住说话，以及无需持续按键的连续对话。
- 按住说话使用 LiveKit `manual`（手动轮次）与官方 RPC；连续对话用 `turnDetection: null` 恢复官方自动 Turn Detector（轮次检测器），两种模式不得切换 STT 或创建不同 Session。
- `useSessionMessages` 显示官方用户/Agent transcription（转写），不在 Renderer 拼接文本片段；火山 Provider 只在同一 ASR 请求内去重重复 final utterance（最终话语）。
- `RoomAudioRenderer` 播放 Agent 远端音频，`useAgent` 提供官方 Agent 状态；产品自定义参与者属性只补充用户 speaking/listening 状态。
- 单行控制台的语音按钮支持逻辑挂断与恢复：挂断不结束 Room 或文字聊天，但必须立即静音、关闭麦克风、暂停 Agent 音频输出并终止当前 TTS；恢复后保留上次模式且不自动开启麦克风。
- 按住说话模式下，聊天主界面的空格键优先控制录音，即使焦点停在挂断等工具栏按钮上也不得触发按钮；输入框、菜单与弹窗仍保留正常键盘行为。
- 状态区区分等待讲话、真实聆听、思考、回答、正在打断、重连、断线和错误；麦克风持续开启不得等同于用户持续讲话。
- Agent 将真实 `searchWeb` 搜索来源通过可靠 Data Packet（数据包）发送给桌面端，并关联到下一条 Agent 回答。
- Electron 启动时自动启动内置 Agent Worker（工作进程），退出时释放 Worker、Room、麦克风和音频元素。
- 首次启动配置向导只展示脱敏后的缺失/无效配置项，并允许在系统编辑器中打开本地 `.env`；密钥不回传 Renderer。
- 保存置顶、来源打开方式、界面动效、回答音量和窗口位置/尺寸。

**不包含：**

- MSFS 遥测、经纬度、航向、机场和航线数据。
- Mem0 或其他跨会话长期记忆。
- 正式安装包、代码签名、自动更新和云端账号系统。
- 在 Renderer 中编辑、保存或显示 LiveKit、DeepSeek、豆包语音和搜索密钥。
- 自行实现 LiveKit 信令、Session、重连、音频传输、VAD（语音活动检测）、Turn Detector 或前端转写拼接。

## 验收标准

- [x] 配置有效且 LiveKit 可访问时，打开桌面应用会自动启动 Agent Worker 并连接唯一房间。
- [x] Renderer 只能通过白名单 IPC 请求短期 Token，IPC 响应不含 API Key、API Secret 或模型密钥。
- [x] 用户可用鼠标或空格键按住说话；松开后提交轮次并听到真实回答，再次按住不创建第二条采集链路。
- [x] 连续对话中用户说完并保持安静后，自动 Turn Detector 会提交轮次并触发 Agent 回答，无需点击结束。
- [x] Agent 回答过程中再次讲话可触发 VAD interruption（语音活动打断）。
- [x] Agent 正在播放 TTS 时点击挂断会立即停止声音和生成队列，同时保留当前 Room、文字聊天和上次语音模式。
- [x] 按钮获得焦点时按住空格仍执行按住说话，不会误触挂断；Enter 仍可激活按钮。
- [x] 同一个 final utterance 只显示一个用户气泡；interim→final 实时更新不拆成多个碎片气泡。
- [x] 聊天区使用真实用户转写、Agent 回答和搜索来源，不再显示静态“苏黎世湖”示例。
- [x] 连接中、聆听、思考、回答、重连、断线和错误状态具有明确界面反馈和重试入口。
- [x] `.env` 缺失或无效时显示首次配置向导；打开配置文件、保存后重新检测可恢复启动流程。
- [x] LiveKit Server 不可达、凭据错误或麦克风权限被拒绝时，不伪造成功状态并提供可重试错误。
- [x] 重连由 LiveKit 客户端官方机制处理；窗口卸载和应用退出会断开 Room、停止音轨并清理远端音频。
- [x] 置顶、来源打开方式、动效、回答音量和窗口位置/尺寸在应用重启后恢复。

## 场景描述

**正常流程：**

1. 用户打开桌面应用。
2. 主进程加载并校验配置，启动 Agent Worker；Renderer 请求一次短期会话凭据。
3. Renderer 连接唯一房间，Token 在房间创建时分派指定 Agent。
4. 用户选择按住说话或连续对话，两种模式复用同一个 Session、麦克风和 STT 管线；挂断只暂停该 Session 的音频输入输出。
5. 按住说话由松开动作显式提交；连续对话由 VAD 与官方 Turn Detector 在静音后自动提交。
6. Agent 发布用户转写、状态、回答音频和回答转写；如调用搜索，还发布真实来源列表。
7. 桌面端播放回答并更新气泡与来源卡片；回答时用户重新讲话可触发打断。

**异常流程：**

1. 配置无效时，应用停留在配置向导，不创建 Token 或启动外部连接。
2. Worker 或 Room 连接失败时，界面显示脱敏错误；用户可点击重新检测/重连。
3. 网络短暂中断时，界面显示重连状态；LiveKit 自动恢复成功后回到可聆听状态。
4. 无法自动恢复时，应用断开旧 Room，并在用户点击重试后申请新会话。

## 相关测试

- `tests/unit/desktop-session-token.test.ts`：Token 权限、有效期、唯一房间和 Agent 分派。
- `tests/unit/desktop-readiness.test.ts`：配置诊断的脱敏状态映射。
- `tests/unit/agent-search-sources.test.ts`：搜索工具结果到来源数据包的提取与过滤。
- `tests/unit/window-state.test.ts`：窗口状态读取、约束与持久化数据形状。
- `tests/unit/voice-control.test.ts`：官方 RPC 名称、语音暂停/恢复契约、输入模式、用户状态属性，以及 manual/automatic 轮次映射。
- `tests/unit/voice-ui-state.test.ts`：连续麦克风开启时不误报讲话，并校验聆听/思考/回答/打断优先级。
- `tests/unit/providers/volcengine-stt.test.ts`：火山 utterance 时间、稳定键和请求内重复 final 去重。
- `tests/unit/guide-events.test.ts`：产品特有搜索来源数据包校验；语音消息不使用自定义数据通道。

## 本次验证说明

- `pnpm typecheck`、`pnpm desktop:typecheck`、`pnpm lint` 与 `pnpm desktop:build` 均通过。
- `pnpm test` 通过：55 passed，8 skipped。
- Electron Preview 已验证 Renderer、官方 Session 和内置 Worker Utility Process 启动；Worker 健康检查返回 HTTP 200。
- 用户在真实 Electron 窗口完成连续对话复验，确认“停止讲话 → 自动提交 → Agent 回答”闭环与重复 final 转写修复。
- 用户在真实 Electron 窗口完成挂断 TTS、恢复语音和空格键按住说话复验，确认没有问题。
- 已删除自建 `useVoiceSession`、`useMicrophoneTrack` 与自定义用户转写数据通道；搜索来源仍使用产品专属数据主题。

## 相关 ADR

- [ADR-001：以 LiveKit Agents 作为实时语音边界](../adr/adr-001-livekit-agent-boundary.md)
- [ADR-003：Zod 边界校验与密钥管理](../adr/adr-003-zod-config-and-secrets.md)
- [ADR-006：以搜索 API 为核心、CLI 为入口包装，暂缓 MCP](../adr/adr-006-search-access-boundary.md)
