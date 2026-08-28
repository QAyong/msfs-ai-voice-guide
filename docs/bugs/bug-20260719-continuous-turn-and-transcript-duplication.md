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

## 2026-08-28 复核：火山 ASR 过早分句与相邻用户气泡

### 新发现

之前的修复解决了“同一个 final utterance 被适配器重复发布”的问题，但没有覆盖另一种情况：火山 ASR 会在同一段连续讲话中把多个分句分别标记为 `definite=true`。这里的 `definite` 表示分句已经定稿，不表示用户这一整轮讲话已经结束。流式 ASR 按句返回结果也是服务本身的正常行为，详见[火山引擎流式语音识别文档](https://docs.volcengine.com/docs/6561/1354871?lang=zh)。

LiveKit 收到每个 final transcript 后会继续累计用户输入，但桌面端的 `useSessionMessages` 会把不同的转写消息 ID 直接显示成不同气泡。因此，相邻分句可能被误认为重复气泡。不能把所有 final transcript 一直缓存到 `FLUSH_SENTINEL` 才发送，因为按住说话结束和连续模式的轮次提交并不依赖这个 ASR 流刷新信号；这样会把完整用户输入提交给模型的时机推迟甚至丢失。

### 本次处理

- 在 `src/agent/guide-agent.ts` 显式设置 endpointing（轮次结束等待）为 `minDelay: 900ms`、`maxDelay: 4000ms`，给火山分句和短暂停顿留出更宽的收敛时间。
- 在 `desktop/renderer/src/session-messages.ts` 增加相邻用户转写合并：只有同一本地用户、连续 `userTranscript`、时间差不超过 2 秒且没有其他消息插入时才合并；保留第一条消息 ID，避免气泡跳动和重复滚动。
- 合并文本时处理完全重复、前缀重复和中英文连接；不同轮次、其他参与者、Assistant 消息或较长间隔不会合并。
- 保留火山适配器现有的“同一请求内 final key 去重”，并明确继续把不同的 final 分句交给 LiveKit 累计，避免为了修复展示问题而破坏模型输入。

### 本次验证结果

- `pnpm test`：63 个测试文件通过（1 个跳过），244 个测试通过（8 个跳过）。
- `pnpm typecheck`、`pnpm desktop:typecheck`、`pnpm lint`、改动文件 Prettier 检查全部通过。
- `git diff --check` 通过；本次未执行真实火山账号下的现场语音回归。
