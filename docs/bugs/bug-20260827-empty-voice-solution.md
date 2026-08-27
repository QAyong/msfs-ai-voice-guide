# Bug-20260827：空语音轮次抑制回复方案（待审核）

**方案日期：** 2026-08-27  
**状态：** 待审核，尚未实施  
**适用版本：** 当前项目 `@livekit/agents@1.5.2`  
**关联缺陷记录：** [Bug-20260826：AI 导游诊断包功能模块缺陷总览](./bug-20260826-ai-guide-diagnostics-review.md) 的 `ASR-002`

## 1. 方案目标

只解决一种情况：用户按住 PTT（按住说话）后没有说出有效语音，松开按键时，系统不应把这次空轮次交给 LLM，也不应触发工具调用、TTS 或新的 AI 回复。

这里的“空语音”包括：

- 用户按下 PTT 后没有发声，直接松开；
- 只有静音或背景噪声，最终没有形成有效文字转写；
- 最终组装出的用户消息为空字符串或只有空白字符。

本方案明确不处理：

- 中间转写提前触发指令（已确认已有修复）；
- “敬意”“近义”等低质量或语义错误的非空转写；
- 用户按下 PTT 时主动停止当前 AI 回复的正常打断行为；
- TTS 卡顿、播放同步和连续对话中的其他音频竞态。

## 2. 当前表现与根因

### 2.1 用户场景

用户看到 AI 正在说话，或者准备提问时按住麦克风按钮，但临时没有说话就松开：

```text
按下 PTT
  → 当前 AI 回复按预期停止
保持静音
  → 松开 PTT
  → 系统提交了一次没有文字的用户轮次
  → Agent 仍可能生成一条新的 AI 回复
```

用户的直觉应当是“这次没有输入，所以什么也不发生”，而不是听到 AI 对空白内容进行回复。

### 2.2 代码链路

当前链路如下：

| 环节 | 现有行为 | 位置 |
|---|---|---|
| PTT 按下 | 切换到手动轮次、清理旧用户轮次、调用 `session.interrupt()`、打开音频输入 | `src/agent/guide-agent.ts:164-172` |
| PTT 松开 | 关闭音频输入后直接调用 `session.commitUserTurn()` | `src/agent/guide-agent.ts:174-177` |
| 空文本判断 | 没有应用层的非空判断 | 当前缺失 |
| Agent 创建 | 使用默认 `new voice.Agent(...)`，没有覆盖 `onUserTurnCompleted` | `src/agent/guide-agent.ts:28-33` |

需要区分两个容易混淆的点：

1. `startTurn` 中的 `session.interrupt()` 是 PTT 的正常语义。用户按下按钮时，当前 AI 回复应当停止；它不是本次要修复的错误。
2. LiveKit 对“收到一个空的最终 STT 事件”本身有保护，但这不能替代对“手动提交后形成的空用户轮次”进行拦截。当前问题发生在 `commitUserTurn()` 之后的轮次完成路径。

## 3. 推荐方案：使用 LiveKit 官方用户轮次完成钩子

### 3.1 官方框架依据

LiveKit Agents 官方 Turn 文档提供了“忽略空轮次”的做法：在 `on_user_turn_completed` 中检查新用户消息的文本，如果为空，则抛出 `StopResponse`，终止本次回复生成。

官方 Pipeline Nodes 文档说明，`on_user_turn_completed` 会在用户轮次结束、Agent 生成回复之前调用，适合做本轮输入的最后一道业务判断。

当前项目使用的 `@livekit/agents@1.5.2` 类型定义中已经提供：

- `voice.Agent.create(...)`；
- `onUserTurnCompleted` 回调；
- `voice.StopResponse`。

因此不需要新增依赖，也不需要自行监听底层 STT 事件或改写 LiveKit 的轮次状态机。

### 3.2 建议实现形态

在现有 `createGuideAgent` 中，把 Agent 创建改为官方工厂形式，并增加空文本门禁：

```ts
return voice.Agent.create({
  instructions: createGuideInstructions(locale),
  tools,
  onUserTurnCompleted(_ctx, _chatCtx, newMessage) {
    if (!newMessage.textContent?.trim()) {
      throw new voice.StopResponse();
    }
  },
});
```

判断规则使用 `trim()`，这样空字符串、全空格和仅有换行的消息都会被视为空轮次。

### 3.3 为什么门禁放在这里

不能只在 PTT 松开时判断，因为此时最终转写可能还没有完成，Renderer 也不拥有完整的 Agent 用户消息。`onUserTurnCompleted` 拿到的是 LiveKit 已经组装完成的 `newMessage`，判断时机更稳定：

```text
音频输入
  → STT / 用户轮次提交
  → LiveKit 组装 newMessage
  → onUserTurnCompleted 空文本门禁
      ├─ 空文本：StopResponse，结束本轮
      └─ 有效文本：继续默认 LLM → 工具 → TTS 流程
```

按照 LiveKit Agents 的处理逻辑，捕获到 `StopResponse` 后，本轮不会继续进入默认 `generateReply`，因此不会产生新的 LLM 回复链路。

## 4. 预期行为

| 使用场景 | 预期结果 |
|---|---|
| 按住 PTT，不说话，松开 | 当前正在播放的 AI 回复按既有语义停止；本次不生成新回复 |
| 按住 PTT，只有静音/背景噪声，松开 | 不调用 LLM、工具或 TTS；不出现空内容 AI 回复 |
| 按住 PTT，说出有效问题，松开 | 按现有流程正常生成回答；需要时正常调用工具 |
| 按住 PTT 期间按取消或指针取消 | 清理本轮，不生成回复；既有取消逻辑不变 |
| 连续模式形成空用户轮次 | 同样被统一空文本门禁忽略；有效语音不受影响 |
| 用户发送普通文字 | 不改变现有文字输入路径 |

## 5. 实施范围

### 必改文件

- `src/agent/guide-agent.ts`
  - 仅调整 `createGuideAgent` 的 Agent 创建方式；
  - 保留现有 `instructions` 和 `tools`；
  - 增加 `onUserTurnCompleted` 空文本门禁。

### 明确不改文件/逻辑

- 不修改 `startTurn` 中的 `session.interrupt()`；
- 不修改 `endTurn` 的麦克风关闭和轮次提交顺序；
- 不修改已完成的中间转写处理；
- 不增加 ASR 置信度阈值、语言模型语义判断或“低质量转写”策略；
- 不关闭全局 interruption，也不调整 PTT 的手动 turn detection；
- 不改 Renderer 的按钮、鼠标或空格键交互。

这样可以把改动限制在“最终用户消息为空时是否允许回复”的单一职责内。

## 6. 验收方案

### 6.1 自动化验证

新增或补充 Agent 相关测试，至少覆盖：

| 用例 | 验证点 |
|---|---|
| `undefined` 文本 | `onUserTurnCompleted` 抛出 `voice.StopResponse` |
| `''` 文本 | 抛出 `voice.StopResponse` |
| `'   '` 或换行文本 | 抛出 `voice.StopResponse` |
| `'打开自动驾驶'` 等正常文本 | 不抛出 `StopResponse`，允许继续生成 |
| 空文本路径 | 不进入默认回复/工具调用断言 |

### 6.2 桌面端人工验收

1. 启动 Agent 和桌面端，保持 PTT 模式。
2. 连续 10 次按住语音按钮后不说话并松开。
3. 确认没有新的 AI 语音回复、工具调用或空白助手消息。
4. 在 AI 正在回复时按下 PTT，然后不说话松开：确认当前回复停止，但不会紧接着产生新的空内容回复。
5. 说出一个真实的飞行问题：确认正常回答和现有工具调用能力没有变化。
6. 运行一次取消/指针取消路径：确认不会误触发回复。

### 6.3 通过标准

- 空文本用户轮次不会触发 `generateReply`；
- 空文本用户轮次不会触发 LLM、工具和 TTS；
- 有效转写的正常语音链路无回归；
- 已修复的中间转写提前触发问题不被重新引入；
- 不新增依赖，不改变 PTT 的正常打断体验。

## 7. 方案风险与回滚

### 风险

极短、过轻或识别失败的真实发言，如果最终没有形成文字，也会被当作空轮次忽略。这符合本方案“没有可交给 Agent 的有效文本就不回复”的目标；“低质量但非空转写”的识别质量问题不在本方案内。

### 回滚

如果验收发现误吞有效输入，只需移除 `onUserTurnCompleted` 门禁并恢复原来的 `new voice.Agent(...)` 创建方式即可，不涉及会话协议、Renderer 或工具实现的回滚。

## 8. 待审核决策

请重点确认以下产品行为：

1. 用户空按/静音松开后，是否接受“静默忽略，不显示提示”的体验；本方案默认接受。
2. 是否需要额外显示“未检测到语音，请重试”的 UI 提示；本方案暂不增加，避免把一次正常的空按操作变成错误提示。
3. 是否同意连续模式也复用同一空文本门禁；本方案默认同意，因为它只拦截最终文本为空的轮次。

## 9. 官方 LiveKit 文档

- [LiveKit Agents：Turn detection and interruptions](https://docs.livekit.io/agents/logic/turns/) —— 包含手动 turn、空轮次忽略、`on_user_turn_completed` 与 `StopResponse` 的 Node 示例。
- [LiveKit Agents：Pipeline nodes and hooks](https://docs.livekit.io/agents/logic/nodes/) —— 说明 `on_user_turn_completed` 的调用时机和用途。
- [LiveKit Agents：Turn-taking tuning](https://docs.livekit.io/agents/logic/turns/tuning/) —— 说明 interruption、VAD 和 false interruption 的配置边界；本方案不调整这些配置。
