# Spec-007：桌面文字输入

**日期：** 2026-07-19
**状态：** 已验收

## 背景

桌面端已经通过 LiveKit 官方 Session 完成按住说话、连续对话、回答转写和搜索来源展示。用户还需要在不方便使用麦克风、地点名称难以准确读出或需要粘贴内容时，通过键盘向同一个导游 Agent 提问。

LiveKit Agents 与前端 Session 已原生支持 `lk.chat` 文本流。该功能应复用现有 Room、Agent、LLM、工具、TTS 和会话消息管线，不建立第二套聊天后端。

## 需求边界

**包含：**

- Renderer 使用现有 `useSessionMessages()` 返回的 `send()`、`isSending` 和 `messages`。
- 在助手窗口增加文字输入框；Enter 发送，Shift+Enter 换行，并兼容中文输入法组合输入。
- 空消息不可发送；单条消息最多 4000 个字符；连接或 Agent 尚未就绪时禁用输入。
- 发送失败时保留草稿并显示错误；成功后清空输入框。
- `chatMessage`、用户语音转写和 Agent 回答转写按同一列表显示；本地 `chatMessage` 显示为用户气泡。
- 文字提问继续使用现有 DeepSeek、`searchWeb`、TTS、回答转写和来源卡片。
- 文字提问遵循 LiveKit 默认 interruption 行为，可打断正在生成或播放的回答。
- Agent 回答使用成熟 Markdown 渲染器显示标题、强调、列表、引用、代码和 GFM 表格；用户消息保持纯文本。
- Markdown 禁止原始 HTML、非 HTTPS 链接和远程图片；HTTPS 链接复用现有来源打开安全边界。
- 用户位于消息底部时自动跟随新消息和流式回答；用户主动上翻后停止抢夺滚动位置，并显示“新消息”返回按钮。
- 展开窗口的最小高度保证文字与语音输入控件不会互相遮挡。

**不包含：**

- 新增 REST、IPC、RPC 或自定义 Data Packet 文字聊天协议。
- 独立于 LiveKit `AgentSession` 的第二份聊天历史。
- 富文本编辑、文件附件、图片消息或用户 Markdown 输入。
- 文字模式专用 LLM、关闭 TTS 的静音回答模式或跨 Session 消息持久化。

## 验收标准

- [x] Renderer 通过 `useSessionMessages().send()` 发送文字，不直接维护 `lk.chat` 文本流。
- [x] 发送后的用户文字只显示一个气泡，并与语音转写、Agent 回答共享最近消息列表。
- [x] 空白内容不可发送，超过 4000 字不能继续输入。
- [x] Enter 发送，Shift+Enter 换行；输入法正在组词时 Enter 不会误发送。
- [x] 发送失败不会清空草稿，并显示可读错误。
- [x] 用户文字不会错误关联搜索来源；来源只附加到 Agent 回答。
- [x] Agent Markdown 回答以紧凑样式渲染，原始 HTML 与不安全 URL 不会进入可点击内容。
- [x] 新消息默认自动跟随；用户上翻历史时保持当前位置并获得可操作的新消息提示。
- [x] 前端和 Agent 类型检查、单元测试、Lint 与生产构建通过。
- [x] 在真实 Electron 窗口验证“输入文字 → Agent 思考 → 显示并播放回答”。
- [x] 在 Agent 回答过程中发送文字，验证官方默认打断行为。

## 正常流程

1. Renderer 已通过 `useSession` 连接唯一 LiveKit Room，Agent 进入可用状态。
2. 用户输入文字并发送。
3. `useSessionMessages().send()` 通过官方 `lk.chat` 文本流发布消息，并在会话消息列表中进行本地回显。
4. Agent 默认文本输入处理器中断当前回答，并通过同一 `AgentSession` 为文字输入生成回复。
5. 现有 LLM 和工具生成回答；TTS、回答转写和搜索来源继续按已有管线发布。
6. Renderer 在同一消息区用 Markdown 渲染 Agent 回答，并继续显示用户文字与来源卡片。
7. 消息列表根据用户当前滚动位置决定自动跟随或显示“新消息”按钮。

## 异常流程

1. Room 或 Agent 未就绪时，文字输入与发送按钮保持禁用。
2. 发送请求失败时，输入内容保留，界面显示错误，用户可再次发送。
3. 输入只有空白字符时不执行发送。

## 相关测试

- `tests/unit/session-messages.test.ts`：文字消息角色、语音转写合并、空消息过滤、最近消息窗口和来源归属。
- `tests/unit/message-markdown.test.ts`：只允许 HTTPS Markdown 链接，拒绝 HTTP、JavaScript、Data URL 与相对地址。
- `pnpm desktop:typecheck`：`useSessionMessages` 当前安装版本的 `send()` 与消息联合类型契约。
- 桌面人工冒烟：文字发送、回答音频、搜索来源、回答中打断和中英文输入法。

## 本次验证说明

- 2026-07-19 在真实 Electron Preview 中启动本机 LiveKit Server 与内置 Agent Worker，窗口状态成功进入“在线”。
- 已验证文字输入框正常渲染并可用 Enter 提交，用户消息在会话区显示且不会重复。
- 已验证 Agent 接收文字后进入思考/回答状态，并通过现有回答转写与 TTS 管线返回结果。
- 已验证 Agent 回答过程中发送新文字可以沿用 LiveKit 默认 interruption 行为完成打断和新一轮回答。
- 已验证 Markdown 紧凑渲染、底部自动跟随、上翻后新消息提示与返回底部交互；用户确认没有问题。
- 本次桌面验收由用户确认没有问题。

## 相关依据

- [LiveKit Session management：Session Messages](https://docs.livekit.io/frontends/build/sessions/)
- [LiveKit Text and transcriptions：Text input](https://docs.livekit.io/agents/multimodality/text/)
- [ADR-001：以 LiveKit Agents 作为实时语音边界](../adr/adr-001-livekit-agent-boundary.md)
- [Spec-006：桌面真实语音闭环与启动诊断](spec-006-desktop-live-voice-and-readiness.md)
