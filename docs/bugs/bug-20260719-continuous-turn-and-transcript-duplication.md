# Bug：连续对话不提交轮次与最终转写重复

**日期：** 2026-07-19

**优先级：** 高

**状态：** 已修复

## 复现步骤

1. 打开 Electron 桌面应用并进入“连续对话”。
2. 点击“开始连续对话”，说出一句完整问题后保持安静。
3. 观察标题回到“等待你说话”，聊天区出现转写，但 Agent 不回答；部分话语会出现两个内容相同的用户气泡。

## 实际结果

- VAD（语音活动检测）可以识别讲话结束并把用户状态恢复为 listening（等待中）。
- 用户轮次没有提交到 LLM（大语言模型），Agent 不生成回答。
- 火山 ASR 在一个请求的多次响应中重复携带已 definite（最终确认）的 utterance，适配器重复发布 final transcript（最终转写）。

## 预期结果

- 连续模式在用户停止讲话后，由 LiveKit 官方自动 Turn Detector（轮次检测器）提交用户轮次并触发回答。
- 同一 ASR 请求中的同一个 final utterance 只发布一次；interim→final（临时转写到最终转写）仍可正常更新。

## 影响范围

- `src/agent/guide-agent.ts` 的手动/自动轮次切换。
- `src/providers/stt/volcengine.ts` 的火山流式 ASR 事件映射。
- 使用 `useSessionMessages`（官方会话消息 Hook）的桌面消息展示。

## 根因

1. 连续模式把构造时保存的 `InferenceTurnDetector` 对象重新传入运行时 `updateOptions()`。当前 SDK 会把对象保留为运行时 mode，VAD 虽然发出结束事件，但不会进入 VAD/STT 的 EOU（话语结束）提交分支。
2. 火山 STT 适配器逐次遍历服务端返回的累计 utterance，没有记录同一请求内已经发布的 final key。

## 处理方式

- 连续模式使用 `turnDetection: null`，遵循 LiveKit `AgentSession.updateOptions()` 的官方语义，清除 manual 并恢复自动选择。
- 按住说话保持 `turnDetection: 'manual'`，两种模式只切换轮次策略，不创建第二套 Session、STT 或麦克风管线。
- 火山 STT 以 Provider utterance ID；或“起始时间＋结束时间＋文本”作为请求内稳定键，只对 final transcript 去重。
- `tests/unit/voice-control.test.ts` 固化 automatic/manual 模式映射。
- `tests/unit/providers/volcengine-stt.test.ts` 固化时间解析、稳定键和重复 final 拦截。

## 验证结果

- 用户在真实 Electron 连续对话中确认：停止讲话后可自动提交并收到 Agent 回答。
- `pnpm test`：47 passed，8 skipped。
- `pnpm typecheck`、`pnpm desktop:typecheck`、`pnpm lint`、`pnpm desktop:build` 全部通过。
- 内置 Agent Worker 健康检查返回 HTTP 200。
