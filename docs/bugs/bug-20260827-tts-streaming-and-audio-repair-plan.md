# Bug-20260827：TTS 流式播放与音频同步修复记录

**方案日期：** 2026-08-27；首次实施记录：2026-08-28
**状态：** 第一阶段已实施；`AUDIO-001` 已完成代码侧修复，仍需真实运行确认；`AUDIO-002` 待专项处理
**适用版本：** 当前项目 `@livekit/agents@1.5.2`  
**关联缺陷：** [Bug-20260826：AI 导游诊断包功能模块缺陷总览](./bug-20260826-ai-guide-diagnostics-review.md) 中的 `AUDIO-001`、`AUDIO-002`  
**关联设计：** [DeepSeek LLM 与火山语音 Provider 集成设计](../architecture/volcengine-integration.md)

## 1. 方案结论

本次已将火山 TTS 从“非流式 Provider + LiveKit 句子适配器”改为真正的双向流式 TTS：文本持续进入同一个 TTS 会话，音频帧在收到后立即进入 LiveKit 播放链路。

同时增加了 provider 连接/握手/音频读取保护、实时音频节奏控制、5 秒播放队列上限和 TTS 指标日志。这些改动用于降低 `AUDIO-001` 的卡顿概率并把停顿原因显式记录出来，但不能单独解决 `AUDIO-002` 的播放同步竞态。

本文件现在同时记录已落地的第一阶段实现、验证结果和未完成范围；原始诊断日志证据仍保留在关联 Bug 总览中。

## 2. 当前代码状态

第一阶段实现后，代码和架构文档中的“豆包双向流式 TTS”描述已经一致：

| 位置 | 当前实现 | 影响 |
|---|---|---|
| `src/providers/tts/volcengine.ts` | 声明 `streaming: true`，实现 `SynthesizeStream`；保留 `synthesize()` 兼容路径 | LLM 文本可以持续进入同一条 TTS 流，音频帧可以在会话结束前输出 |
| `src/providers/volcengine/tts-session.ts` | 一条流只建立一个 WebSocket/会话；支持多个 `TaskRequest`，发送文本和接收音频并行；`FinishSession` 只在输入结束后发送 | 减少逐句重复建连和句子之间的等待 |
| `src/providers/volcengine/websocket.ts` | 建连、握手事件和音频消息读取均有 10 秒超时，并清理监听器 | 连接卡住、首帧未到或帧间停顿可以结束并分类记录 |
| `src/agent/guide-agent.ts` | 设置 5,000 ms TTS 输出队列上限，记录 TTS metrics/error 事件 | 避免 provider 突发数据无限堆积，并能观察首帧延迟、最大帧间隔等指标 |
| `tests/unit/providers/volcengine-tts-session.test.ts` | 使用 mock WebSocket 验证多段文本、音频输出和结束事件 | 防止流式会话退回“一段文本立即结束”的实现 |

仍需明确区分：本次实现验证的是 LiveKit 文本输入流和火山同一会话内的多次 `TaskRequest`；它不代表已经完成真实网络环境下的长时稳定性验收。

## 3. 问题与代码原因

### 3.1 AUDIO-001：TTS 流卡住

诊断包对应的旧链路大致是：

```text
LLM 生成句子
  → LiveKit StreamAdapter 按句调用 synthesize()
  → 每句创建一次火山 WebSocket
  → StartConnection / StartSession
  → TaskRequest(完整句子)
  → FinishSession
  → 等待音频和 SessionFinished
```

旧链路中，LiveKit 对 TTS 读取和音频转发使用 10 秒空闲 watchdog。当两帧音频之间超过 10 秒时，会触发：

```text
TTS stream stalled after producing audio, forcing close
```

旧代码可以确认：

1. 旧 TTS 没有实现文本输入流；
2. 旧实现中每个句子都可能重新建连和创建会话；
3. 旧 provider 层的 WebSocket 读取没有独立的连接、首帧和帧间超时；
4. 旧 LiveKit 链路最终只能通过通用 10 秒 watchdog 强制取消请求。

第一阶段已经补齐了流式链路、provider 超时和基础可观测性，且没有简单地把 LiveKit watchdog 调大。现在仍需要通过真实房间和延迟/断网场景确认空档究竟来自火山服务、网络、WebSocket，还是本地播放链路。

### 3.2 AUDIO-002：打断、空播放和同步竞态

当前应用主动开启了 VAD 打断，并且文本输入路径会显式调用 `session.interrupt()`：

```ts
turnHandling: {
  interruption: {
    enabled: true,
    mode: 'vad',
  },
}
```

因此以下日志本身可能属于正常的抢话行为：

```text
speech interrupted, new user turn detected
playout completed with interrupt
```

当打断发生在第一帧 TTS 音频到达之前，LiveKit 的片段状态仍为 `played: 'skipped'`，最终日志中的 `message` 可能为空。这更可能表示“回复尚未开始播放就被取消”，不等于 provider 返回空音频。

同步警告的风险来自共享音频输出和片段轮转：新片段可能已经通过第一帧音频设置了开始状态，而旧片段延迟到达的 `playbackStarted` 回调随后又进入同一个同步对象，导致：

```text
SegmentSynchronizerImpl.onPlaybackStarted called after startFuture is set
```

因此，真正的修复目标不是关闭所有 interruption，而是让 TTS、播放回调和片段状态具备明确的语音回合/片段关联。

本次第一阶段没有修改 `turnHandling.interruption`、VAD 判定或 `session.interrupt()` 语义；AUDIO-002 仍保持“现象已确认、根因待专项验证”的状态。

## 4. 修复目标与非目标

### 4.1 第一阶段已完成

- 文本尚未完全生成时即可进入 `SynthesizeStream`；
- 音频包在 `SessionFinished` 前就经过 `AudioByteStream` 转成 LiveKit 音频帧；
- 同一条流复用一个 provider WebSocket/会话，并支持多个 `TaskRequest`；
- 建连、握手和音频读取有独立的 10 秒超时；
- provider 音频输出增加实时节奏控制，并将 LiveKit TTS 输出队列限制为 5,000 ms；
- 记录首帧延迟、最大 provider 帧间隔、音频包/帧数、字节数和总耗时；
- 流关闭时取消读取任务并关闭 WebSocket；`synthesize()` 保留为一次性兼容路径。

### 4.2 未完成范围与非目标

- 不关闭全局 interruption，也不修改 VAD 判定或 `session.interrupt()` 语义；
- 不把所有空播放都当成 provider 空音频；
- 不通过无限增大 LiveKit watchdog 隐藏服务端或网络停顿；
- 不修改 ASR 最终态门禁、MSFS 工具调用或自动驾驶业务逻辑；
- 尚未为每个文本片段建立独立的 `segmentId`，也尚未完成播放回调归属校验；
- 尚未完成真实房间下的长时、延迟、断网和连续抢话验收；
- 不直接修改 `node_modules` 中的 LiveKit 源码作为长期方案。

## 5. 已实施方案

### 5.1 Provider 能力与流式输出

`VolcengineTTS` 现在声明 `streaming: true`，`stream()` 返回真正的 LiveKit
`SynthesizeStream`；原有 `synthesize()` 仍保留，作为一次性合成兼容路径。流式输入由
LiveKit 的异步输入队列驱动，收到文本片段后立即发送到 provider。

音频处理路径为：

```text
火山 AudioOnlyServer 音频包
  → AudioByteStream.write()
  → 完整 AudioFrame
  → 实时节奏控制
  → queue.put({ requestId, segmentId, frame, final })
```

输出不会等整段文本或 `SessionFinished` 才开始。实现会暂存最后一帧，在输入结束并
`flush()` 后将其标记为 `final: true`，随后发送 `END_OF_STREAM`。

### 5.2 Provider 会话生命周期

当前一条流的生命周期为：

```text
创建 SynthesizeStream
  → 建立一个 WebSocket
  → StartConnection / StartSession
  → 启动音频接收循环
  → 持续发送多个 TaskRequest
  → 输入结束后发送 FinishSession
  → 接收 SessionFinished
  → FinishConnection
  → 关闭 WebSocket
```

发送文本和接收音频是并行的；`FinishSession` 不会在第一段文本后立即发送。provider
会话对象也保留给一次性 `synthesize()` 路径使用，因此旧调用方仍有兼容边界。

### 5.3 音频节奏、取消和超时

- `AudioFrame` 按采样时长进行实时节奏控制，避免 provider 突发返回时快速填满本地
  播放队列；Agent 的 TTS 输出队列上限设置为 5,000 ms。
- WebSocket 建连、`StartConnection`、`StartSession` 事件等待和音频消息读取均使用
  10 秒超时。
- 首个音频包超时记录 `TTS_FIRST_AUDIO_TIMEOUT`；已有音频后继续等待超时记录
  `TTS_FRAME_IDLE_TIMEOUT`。
- abort/关闭路径会停止音频读取、关闭当前 WebSocket，并释放活动中的流；不会把已
  取消会话的后续音频继续写入输出队列。

### 5.4 可观测性

TTS 日志现在记录 `metrics`、`error`、`completed`/`stream_completed` 事件，包含
`requestId`、`streamId`、文本块数量、音频字节数、音频包/帧数、首帧延迟、provider
最大帧间隔和总耗时。`maxInterAudioGapMs` 是 provider 收到音频包之间的观测值，不
等同于最终远端扬声器的实际播放间隔。

### 5.5 尚未处理的播放同步专项

流式 TTS 已完成，但 `AUDIO-002` 仍需单独处理：VAD/用户打断判定、语音回合与
`segmentId` 的细粒度关联、延迟 `playbackStarted`/`playbackFinished` 回调归属，以及
空播放和同步警告的可重复复现。本次没有通过关闭 interruption 或吞掉警告来规避这些
问题。

## 6. 实际修改范围

### 6.1 代码

| 文件 | 已完成内容 |
|---|---|
| `src/providers/tts/volcengine.ts` | 声明 streaming capability；实现 `SynthesizeStream`；管理活动流；保留 `synthesize()`；增加实时音频节奏控制和完成指标 |
| `src/providers/volcengine/tts-session.ts` | 支持单会话多次 `TaskRequest`、并行收包、结束和取消；增加首帧/帧间指标 |
| `src/providers/volcengine/websocket.ts` | 增加建连和消息读取超时；关闭时清理监听器和定时器 |
| `src/agent/guide-agent.ts` | 设置 5,000 ms TTS 输出队列上限；记录 TTS metrics/error 事件 |
| `tests/unit/providers/volcengine-tts-session.test.ts` | 使用 mock WebSocket 验证持续文本、音频输出、结束事件和最终帧 |

### 6.2 本次明确没有修改

- `turnHandling.interruption`、VAD 判定和 `session.interrupt()` 语义；
- ASR 最终态门禁、MSFS 工具调用和自动驾驶业务逻辑；
- LiveKit `node_modules` 源码、全局依赖版本和无关格式问题。

### 6.3 文档同步

- 更新 [volcengine-integration.md](../architecture/volcengine-integration.md)，补充当前 TTS 运行时实现和观测字段；
- 更新 [Bug 总览](./bug-20260826-ai-guide-diagnostics-review.md)，记录 `AUDIO-001` 的第一阶段代码侧处理和 `AUDIO-002` 的保留状态；
- 本文件由“待审核方案”更新为实施记录，保留后续专项范围。

## 7. 验证结果（2026-08-28）

### 7.1 自动化验证

- `pnpm lint`：通过；
- `pnpm typecheck`：通过；
- `pnpm desktop:typecheck`：通过；
- `pnpm test`：63 个测试文件通过、1 个跳过；241 个测试通过、8 个跳过；
- `git diff --check`：通过。

`pnpm verify` 的 lint、类型检查和测试阶段均通过；最后的全仓库
`prettier --check .` 仍受仓库中 151 个既有格式问题影响。本次没有对无关文件做批量
格式化，避免把提交范围扩大。

### 7.2 尚需真实运行验收

1. 在真实 LiveKit 房间验证长回答的首帧延迟、句间空档和最终播放完整性；
2. 注入 provider 延迟、断开和错误，确认 timeout 日志与资源释放；
3. 连续进行用户抢话/取消，确认旧音频、空播放和同步警告的实际表现；
4. 继续为播放回调和语音回合补充可关联 ID，再决定是否升级 LiveKit 或处理同步竞态。

## 8. 当前修复效果

| 缺陷 | 当前结论 | 后续工作 |
|---|---|---|
| `AUDIO-001` TTS 卡住 | 已完成流式链路、超时、节奏控制和指标的代码侧修复；不能仅凭单元测试宣布线上根治 | 真实房间和故障注入验收 |
| `AUDIO-002` 空播放 | 本次未修改，仍需区分“首帧前被取消”和 provider 空音频 | 记录取消阶段与首帧状态 |
| `AUDIO-002` 播放同步竞态 | 本次未修改 | 处理 speech/segment 与播放回调的归属 |
| `speech interrupted` | 保持现有用户抢话能力 | 单独验证 VAD 误判和旧音频清理 |
| `SegmentSynchronizerImpl...` 警告 | 本次未吞掉或掩盖 | 复现后核对 LiveKit 版本和片段轮转 |

## 9. 风险与回滚

### 风险

- 长连接会话会受到 provider 并发数、会话时长和配额限制；
- provider 数据突发、网络抖动或远端播放时序仍可能造成听感问题；
- 5,000 ms 队列上限和实时节奏控制是当前初始参数，需依据真实指标调整；
- 本次没有解决 VAD/打断和播放同步竞态，不能把 `AUDIO-002` 视为已关闭。

### 回滚

`synthesize()` 一次性路径仍保留给显式兼容调用。若真实联调证明流式路径存在阻断，整体
回退应回滚本次代码提交；不应修改 `node_modules` 或删除 TTS 错误日志来规避问题。

## 10. 后续处理清单

1. 用真实房间采集 `firstAudioDelayMs`、`maxInterAudioGapMs`、音频帧数和错误阶段；
2. 根据采集结果确认 10 秒 timeout 和 5 秒输出队列是否需要配置化；
3. 单独处理 `AUDIO-002` 的 VAD/打断、空播放、片段轮转和播放回调竞态；
4. 为语音回合、文本片段和播放事件补齐稳定的关联 ID；
5. 真实验收通过后，再把 Bug 总览中 `AUDIO-001` 的状态从“代码侧修复”更新为最终结论。

## 11. 参考代码与文档

- [当前 TTS Provider](../../src/providers/tts/volcengine.ts)
- [当前火山 TTS 会话实现](../../src/providers/volcengine/tts-session.ts)
- [当前火山 WebSocket 读取实现](../../src/providers/volcengine/websocket.ts)
- [当前 Guide Agent 会话和 interruption 配置](../../src/agent/guide-agent.ts)
- [LiveKit TTS 抽象](../../node_modules/@livekit/agents/src/tts/tts.ts)
- [LiveKit 非流式 TTS 的 StreamAdapter](../../node_modules/@livekit/agents/src/tts/stream_adapter.ts)
- [LiveKit 音频同步实现](../../node_modules/@livekit/agents/src/voice/transcription/synchronizer.ts)
- [豆包 TTS 集成设计](../architecture/volcengine-integration.md)
