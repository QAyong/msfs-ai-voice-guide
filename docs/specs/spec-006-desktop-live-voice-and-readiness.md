# Spec-006：桌面真实语音闭环与启动诊断

**日期：** 2026-07-19  
**状态：** 已实现；真实语音冒烟测试等待本机 LiveKit Server 恢复后复验

## 背景

现有 LiveKit Agent 已能通过 LiveKit Meet 完成真实语音对话，Electron 桌面端也已具备悬浮窗口、本地麦克风轨道和来源浏览窗，但两者尚未连接。用户仍需手工启动 Worker、生成 Token 并打开第三方客户端，桌面聊天内容也是静态示例。

本功能把现有后端和桌面端连成一个可直接使用的本地应用，并把配置、Worker 和房间连接故障转化为用户可理解、可重试的状态。

## 需求边界

**包含：**

- Electron 主进程作为可信本地边界签发短期 LiveKit 参与者 Token；Renderer（渲染进程）不接触 `LIVEKIT_API_SECRET`。
- 每次桌面会话使用唯一房间，并通过 Token 的 `RoomConfiguration`（房间配置）显式分派 `LIVEKIT_AGENT_NAME` 指定的 Agent。
- 桌面端自动连接 LiveKit Room（房间），发布现有 `LocalAudioTrack`（本地麦克风音轨），并通过静音/恢复实现按住说话。
- 订阅并播放 Agent 远端音频；接收 `lk.transcription`（LiveKit 转写文本流）并显示真实用户转写与 Agent 回答。
- 根据连接事件和 Agent 参与者的 `lk.agent.state` 属性显示连接、聆听、思考、回答、重连、断线和错误状态。
- Agent 将真实 `searchWeb` 搜索来源通过可靠 Data Packet（数据包）发送给桌面端，并关联到下一条 Agent 回答。
- Electron 启动时自动启动内置 Agent Worker（工作进程），退出时释放 Worker、Room、麦克风和音频元素。
- 首次启动配置向导只展示脱敏后的缺失/无效配置项，并允许在系统编辑器中打开本地 `.env`；密钥不回传 Renderer。
- 保存置顶、来源打开方式、界面动效、回答音量和窗口位置/尺寸。

**不包含：**

- MSFS 遥测、经纬度、航向、机场和航线数据。
- Mem0 或其他跨会话长期记忆。
- 正式安装包、代码签名、自动更新和云端账号系统。
- 在 Renderer 中编辑、保存或显示 LiveKit、DeepSeek、豆包语音和搜索密钥。
- 自行实现 LiveKit 信令、重连、音频传输、VAD（语音活动检测）或转写协议。

## 验收标准

- [ ] 配置有效且 LiveKit 可访问时，打开桌面应用会自动启动 Agent Worker 并连接唯一房间。（实现完成，待真实 Server 复验）
- [x] Renderer 只能通过白名单 IPC 请求短期 Token，IPC 响应不含 API Key、API Secret 或模型密钥。
- [x] 用户按住按钮后发布/恢复同一麦克风音轨，松开后立即静音；再次按住不重复创建采集链路。
- [ ] 用户松开后能够听到 Agent 的真实语音回答，不需要打开终端或 LiveKit Meet。
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
4. 用户按住说话，已连接的麦克风音轨恢复发送；松开后音轨静音。
5. Agent 发布用户转写、状态、回答音频和回答转写；如调用搜索，还发布真实来源列表。
6. 桌面端播放回答并更新气泡与来源卡片。

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

## 本次验证说明

- TypeScript、Lint、构建、配置检查和 35 个自动化测试均通过。
- Electron Preview 已验证 Renderer 加载、内置 Worker Utility Process 自动启动，以及 LiveKit 未运行时的脱敏错误路径。
- 本机 `.env` 指向 `127.0.0.1:7880`；验证时 Docker Desktop 自身无法启动，系统也未安装独立 `livekit-server`，因此“真实语音回答”两项保留为未勾选，不能用静态或伪造数据代替验收。

## 相关 ADR

- [ADR-001：以 LiveKit Agents 作为实时语音边界](../adr/adr-001-livekit-agent-boundary.md)
- [ADR-003：Zod 边界校验与密钥管理](../adr/adr-003-zod-config-and-secrets.md)
- [ADR-006：以搜索 API 为核心、CLI 为入口包装，暂缓 MCP](../adr/adr-006-search-access-boundary.md)
