# 框架合规审核：桌面文字输入

**日期：** 2026-07-19

**结论：** 通过

## 实现前依据

- 涉及框架及实际版本：`@livekit/agents` 1.5.2、`@livekit/components-react` 2.9.21、`livekit-client` 2.20.1。
- 版本证据：`package.json`、`pnpm-lock.yaml` 与对应 `node_modules` 包元数据。
- 复用的项目入口：现有 `useSession`、`SessionProvider`、`useSessionMessages`、`RoomAudioRenderer` 和单个 `AgentSession`。
- 官方文档：
  - [Session management：使用 Session Messages API 的 `send()`](https://docs.livekit.io/frontends/build/sessions/)
  - [Text and transcriptions：Agent 默认监听 `lk.chat`](https://docs.livekit.io/agents/multimodality/text/)
  - [useSessionMessages React API](https://docs.livekit.io/reference/components/react/hook/usesessionmessages/)
- 本地类型与源码核验：
  - `node_modules/@livekit/components-react/src/hooks/useSessionMessages.ts`：确认返回 `messages`、`send` 和 `isSending`。
  - `node_modules/@livekit/agents/src/voice/room_io/room_io.ts`：确认 `textEnabled` 默认开启，默认文字处理会调用 `interrupt()` 与 `generateReply({ userInput })`。
- 新增第三方依赖：`react-markdown` 10.1.0 与 `remark-gfm` 4.0.1，用成熟 React/remark 解析能力替代自建 Markdown 正则解析；版本由 `pnpm-lock.yaml` 固定。

## 实现后核对

- Renderer 仅调用 `useSessionMessages().send()`；没有直接实现 TextStream、Room 信令或消息回显协议。
- Agent 继续使用官方默认文字输入处理；没有新增 RPC、IPC、REST 或自定义数据主题。
- 用户文字、用户转写与 Agent 转写继续来自 `useSessionMessages().messages`，项目代码只负责产品气泡和来源卡片映射。
- Agent 文本交给 `react-markdown` 与 `remark-gfm` 渲染；用户文本保持纯文本。渲染器跳过原始 HTML，只允许 HTTPS 链接，并复用现有来源打开入口。
- 消息滚动使用 React 布局 Effect 与浏览器原生滚动位置，不引入第二套消息列表或滚动框架；用户离开底部后不会被流式更新拉回。
- 搜索来源保留在现有产品专属数据主题；它不承担文字聊天传输。
- 自定义实现仅包含输入框交互、消息展示映射、4000 字产品限制、滚动跟随策略、Markdown 安全边界和错误反馈。

## 偏离与风险

- 当前未直接采用 Agents UI 的 `AgentChatTranscript`，因为现有消息区还需要渲染项目专属搜索来源卡片；消息状态与传输仍复用官方 Hook。
- `useSessionMessages` 在当前官方文档中标记为持续开发能力，升级 `@livekit/components-react` 时需要重新核验消息联合类型和发送行为。
- 当前文字提问仍播放 TTS，这符合导游产品的现有输出模型；静音文字模式不在本功能范围内。

## 验证证据

| 检查       | 命令                     | 结果                 |
| ---------- | ------------------------ | -------------------- |
| 桌面类型   | `pnpm desktop:typecheck` | 通过                 |
| 自动化测试 | `pnpm test`              | 55 passed，8 skipped |
| 全量类型   | `pnpm typecheck`         | 通过                 |
| Lint       | `pnpm lint`              | 通过                 |
| 生产构建   | `pnpm build`             | 通过                 |
| 桌面冒烟   | Electron 真实文字输入    | 通过                 |

桌面冒烟已确认“文字输入 → 本地消息回显 → Agent 思考/回答 → Markdown 回答转写与 TTS”闭环、回答过程中发送新文字的官方默认 interruption 行为，以及智能滚动交互；用户确认没有问题。

## 给非程序员的结论

文字输入没有建设另一套聊天系统，而是接入现有 LiveKit 官方会话。自动化检查、生产构建和真实桌面闭环均已通过；语音与文字共享同一个导游、上下文、搜索能力、回答音频和错误边界。
