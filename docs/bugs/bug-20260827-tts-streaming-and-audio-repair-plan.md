# Bug-20260827：TTS 流式播放与音频同步修复方案（待审核）

**方案日期：** 2026-08-27  
**状态：** 待审核，尚未实施  
**适用版本：** 当前项目 `@livekit/agents@1.5.2`  
**关联缺陷：** [Bug-20260826：AI 导游诊断包功能模块缺陷总览](./bug-20260826-ai-guide-diagnostics-review.md) 中的 `AUDIO-001`、`AUDIO-002`  
**关联设计：** [DeepSeek LLM 与火山语音 Provider 集成设计](../architecture/volcengine-integration.md)

## 1. 方案结论

建议将火山 TTS 从“非流式 Provider + LiveKit 句子适配器”改为真正的双向流式 TTS：文本持续进入同一个 TTS 会话，音频帧在收到后立即进入 LiveKit 播放链路。

该改造预计可以显著降低 `AUDIO-001` 的首字节延迟和句子间空档，但不能单独解决 `AUDIO-002` 的播放同步竞态。AUDIO-002 还需要针对语音打断、片段轮转和延迟播放回调进行专项处理。

本方案只描述修复设计和验收范围，不直接修改业务代码。

## 2. 当前代码状态

当前文档中已经把 TTS 描述为“豆包双向流式 TTS”，但实现与文档不一致：

| 位置 | 当前实现 | 影响 |
|---|---|---|
| `src/providers/tts/volcengine.ts:12` | `streaming: false` | LiveKit 将该 Provider 视为非流式 TTS |
| `src/providers/tts/volcengine.ts:32` | `stream()` 直接抛出“不支持文本流式输入” | 没有真正的 `SynthesizeStream` |
| `src/providers/tts/volcengine.ts:24-30` | 只实现 `synthesize()` | 每次按句触发一次 TTS 合成 |
| `src/providers/volcengine/tts-session.ts:75-80` | 一次发送一个 `TaskRequest`，随后立即发送 `FinishSession` | 当前会话是“一次性文本请求”，不是持续输入文本 |
| `src/providers/volcengine/tts-session.ts:82-106` | 等待服务端返回音频和 `SessionFinished` | 服务端或网络停顿时，本地读取可能长时间等待 |
| `src/providers/tts/volcengine.ts:56-105` | 音频分片经过 `AudioByteStream` 后再推送 | 音频数据不足一个完整帧或等待下一分片时，LiveKit 暂时收不到帧 |

需要明确区分：当前 WebSocket 可能已经分片返回音频，但这只是“单次合成请求内的音频分片”。它不等于 LiveKit 意义上的文本输入流式 TTS。

## 3. 问题与代码原因

### 3.1 AUDIO-001：TTS 流卡住

当前链路大致是：

```text
LLM 生成句子
  → LiveKit StreamAdapter 按句调用 synthesize()
  → 每句创建一次火山 WebSocket
  → StartConnection / StartSession
  → TaskRequest(完整句子)
  → FinishSession
  → 等待音频和 SessionFinished
```

LiveKit 对 TTS 读取和音频转发默认使用 10 秒空闲 watchdog。应用没有显式覆盖该配置，因此当两帧音频之间超过 10 秒时，会触发：

```text
TTS stream stalled after producing audio, forcing close
```

从代码上可以确认：

1. 当前 TTS 没有实现文本输入流；
2. 每个句子都可能重新建连和创建会话；
3. provider 层的 WebSocket 读取没有独立的连接、首帧和帧间超时；
4. LiveKit 最终只能通过通用 10 秒 watchdog 强制取消请求。

仅凭现有日志，不能进一步确认空档究竟来自火山服务、网络、WebSocket，还是本地音频帧缓冲。因此修复方案必须同时补齐流式链路和可观测性，不能只调大 LiveKit 的超时时间。

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

## 4. 修复目标与非目标

### 4.1 修复目标

- 文本尚未完全生成时即可开始 TTS；
- 音频帧到达后立即进入 LiveKit 播放队列；
- 同一轮流式 TTS 尽量复用一个 provider 会话，减少重复建连；
- provider 停顿、服务端错误和 WebSocket 异常能够被明确分类和记录；
- 中断时立即取消 provider 读取和音频转发，不残留旧声音；
- 每个 TTS 流、provider 会话和音频片段都可通过 ID 关联；
- 通过测试区分正常用户抢话与真正的音频竞态。

### 4.2 非目标

- 不关闭全局 interruption；
- 不把所有空播放都当成 provider 空音频；
- 不通过无限增大 `ttsReadIdleTimeout` 隐藏服务端或网络停顿；
- 不修改 ASR 最终态门禁、MSFS 工具调用或自动驾驶业务逻辑；
- 不在没有核实火山协议的情况下伪造“文本流式”能力；
- 不直接修改 `node_modules` 中的 LiveKit 源码作为长期方案。

## 5. 推荐实现方案

### 5.1 Provider 能力改造

在 `VolcengineTTS` 中实现真正的 LiveKit `SynthesizeStream`：

```text
VolcengineTTS
  ├─ streaming: true
  ├─ synthesize()：保留一次性合成兼容路径
  └─ stream()：返回 VolcengineSynthesizeStream
```

`VolcengineSynthesizeStream` 应使用 LiveKit 的输入和输出约定：

- `pushText()`：接收 LLM 产生的文本片段；
- `flush()`：按 provider 协议提交当前文本边界；
- `endInput()`：表示整段文本输入结束；
- `next()`：持续返回 `SynthesizedAudio`；
- `close()` 或 `AbortSignal`：取消当前 TTS 流并关闭 WebSocket。

不能只把 `streaming: false` 改成 `true`。如果保留当前 `stream()` 的异常实现，运行时会从“使用非流式适配器”变成“调用流式接口后直接失败”。

### 5.2 Provider 会话生命周期

推荐将当前 `runVolcengineTtsSession()` 的一次性函数重构为可持续交互的会话对象或等价的内部状态机：

```text
创建流
  → 建立 WebSocket
  → StartConnection
  → StartSession
  → 启动发送文本任务和接收音频任务
  → 持续接收 AudioOnlyServer 并推送 AudioFrame
  → endInput 后发送 FinishSession
  → 等待 SessionFinished
  → FinishConnection
  → 关闭 WebSocket
```

关键约束：

1. `FinishSession` 不能在第一段文本发送后立即发出，必须等 `endInput()` 或 provider 所需的最终文本边界；
2. 发送文本和读取音频必须并行，不能等完整文本或 `SessionFinished` 后才统一输出音频；
3. 如果火山协议要求每个句子一个 `TaskRequest`，应在同一连接/会话内按协议发送多个请求，并为每个请求维护独立的 `segmentId`；
4. 如果协议不支持增量 `TaskRequest`，则只能实现“单连接的句子级流式适配”，不能对外宣称完整文本流式能力；
5. 建连、开始连接、开始会话、首帧音频和帧间等待都必须有可配置超时；
6. 中断时必须同时取消读取任务、关闭输入队列和关闭 WebSocket，避免旧会话继续向播放队列写入数据。

实施前必须依据当前火山官方协议确认：多个 `TaskRequest` 的语义、文本结束信号、音频帧顺序、`SessionFinished` 的触发条件以及是否允许同一会话内持续追加文本。

### 5.3 音频帧输出和结束标志

音频处理应保持 PCM 参数与配置一致，并在收到数据后尽快转换成 `AudioFrame`：

```text
provider 音频包
  → 解压/解析
  → AudioByteStream.write()
  → 完整 AudioFrame
  → queue.put({ requestId, segmentId, frame, final: false })
```

结束时再执行 `flush()`，只将最后一帧标记为 `final: true`。可以保留“缓存最后一帧以便标记 final”的做法，但不能缓存整段回复，也不能等 `SessionFinished` 后才开始推送前面的帧。

每个输出事件至少应包含：

- `requestId`：provider 请求或可关联的外部请求 ID；
- `segmentId`：同一 TTS 流中的单调递增片段 ID；
- `final`：该片段是否完成；
- 音频帧的采样率、声道和样本数。

当前代码把 provider `sessionId` 同时作为 `requestId` 和 `segmentId`。实现持续流之后，不能用同一个 session ID 代替多个文本片段的 segment ID。

### 5.4 取消、超时和错误分类

建议建立以下错误阶段，避免所有故障最后都表现为 LiveKit 的通用 stall：

| 阶段 | 建议错误类型 | 必须记录的信息 |
|---|---|---|
| WebSocket 建连 | `TTS_CONNECT_TIMEOUT` / `TTS_CONNECT_ERROR` | stream ID、endpoint（脱敏）、耗时 |
| StartConnection | `TTS_CONNECTION_START_TIMEOUT` | connect ID、耗时 |
| StartSession | `TTS_SESSION_START_TIMEOUT` | session ID、耗时 |
| 首帧音频 | `TTS_FIRST_AUDIO_TIMEOUT` | 文本片段长度、session ID、耗时 |
| 帧间停顿 | `TTS_FRAME_IDLE_TIMEOUT` | 上一帧时间、当前等待时长、segment ID |
| provider 错误 | `TTS_PROVIDER_ERROR` | error code、session ID、阶段 |
| 用户打断 | `TTS_CANCELLED_BY_INTERRUPT` | turn ID、speech ID、已输出帧数 |
| 正常完成 | `TTS_COMPLETED` | 总帧数、音频时长、总耗时 |

`TTS_FRAME_IDLE_TIMEOUT` 仍然需要保留。流式实现的目标是更快、更连续地输出，而不是让异常会话无限等待。默认值先与 LiveKit 10 秒读取保护保持一致，后续根据真实 provider 指标调整；不建议在没有数据的情况下直接放宽到很大的值。

### 5.5 播放同步和 interruption 专项

流式 TTS 完成后，仍需单独处理 AUDIO-002：

1. 保留用户主动抢话能力；
2. 为每次 Agent 回复记录 `speechId` 或等价的回合 ID；
3. 为每个 TTS 文本片段生成唯一 `segmentId`，并贯穿 provider 输出和 LiveKit 音频事件；
4. 中断时记录“是否已经产生第一帧音频”，将“取消前未播放”与“播放中途截断”分开统计；
5. 对延迟到达的 `playbackStarted`、`playbackFinished` 回调进行片段归属检查；
6. 优先核对当前 LiveKit 版本是否已有对应竞态修复，再决定升级依赖或提交最小上游修复；
7. 不通过吞掉同步警告或关闭播放同步来掩盖状态错配。

如果当前 LiveKit API 无法把 `playbackStarted` 直接绑定到 `segmentId`，应先通过可重复测试确认警告是否造成实际听感错误，再选择依赖升级、上游修复或在应用层减少不安全的片段轮转。不能仅凭一条警告就断言 provider 音频内容为空。

## 6. 建议修改范围

### 6.1 必改代码

| 文件 | 改造内容 |
|---|---|
| `src/providers/tts/volcengine.ts` | 声明真实 streaming capability；实现 `stream()`；管理活动中的 TTS 流；保留或明确一次性 `synthesize()` 的兼容边界 |
| `src/providers/volcengine/tts-session.ts` | 从一次性函数改为支持持续输入、并行收包、结束和取消的会话实现 |
| `src/providers/volcengine/websocket.ts` | 增加可取消、可超时、不会丢事件的消息读取/队列能力；保证关闭时移除监听器 |
| `src/providers/volcengine/protocol.ts` | 仅在官方协议需要时增加增量文本请求或结束事件的编码辅助函数 |

### 6.2 可能修改代码

| 文件 | 使用条件 |
|---|---|
| `src/agent/guide-agent.ts` | 只有在需要显式设置 TTS timeout、回合 ID 或诊断回调时修改；不改变现有 interruption 语义 |
| `src/providers/registry.ts` | 只有当 Provider 能力声明或工厂类型需要同步调整时修改 |
| `src/config/schema.ts` | 增加经过确认的 TTS timeout/heartbeat 配置时修改，默认值必须可审计 |

### 6.3 测试和文档

- 新增 `tests/unit/providers/volcengine-tts.test.ts`；
- 新增使用 mock WebSocket 的 TTS 会话集成测试；
- 在 `tests/integration/livekit-sdk-contract.test.ts` 中验证当前 LiveKit 版本的流式 TTS 契约；
- 更新 [volcengine-integration.md](../architecture/volcengine-integration.md)，使“设计为流式”和“代码已实现”状态一致；
- 在 Bug 总览中记录 AUDIO-001、AUDIO-002 的修复结果，不删除原始日志证据。

## 7. 测试与验收方案

### 7.1 Provider 单元测试

至少覆盖以下行为：

1. `stream()` 返回可用的 `SynthesizeStream`，不再抛出“不支持文本流式输入”；
2. 多次 `pushText()` 不会提前发送 `FinishSession`；
3. `flush()` 只结束当前文本边界，`endInput()` 才结束整个输入；
4. provider 音频包到达时，音频帧在 `SessionFinished` 之前已经可以被读取；
5. 小于一个完整帧的音频数据不会被误标记为完整输出；
6. 最后一帧只标记一次 `final: true`；
7. provider 错误、WebSocket close、AbortSignal 和 timeout 都能结束输出队列；
8. 中断后不会继续向队列写入旧会话音频；
9. `requestId`、`segmentId` 和帧序号稳定且不会跨流复用。

### 7.2 延迟和卡顿集成测试

使用 mock WebSocket 构造以下时序：

```text
StartSession
  → 返回第一段音频
  → 延迟后返回第二段音频
  → 返回 SessionFinished
```

验收重点：

- 第一段音频必须在 `SessionFinished` 前进入 `SynthesizeStream`；
- 第二段音频延迟时，能记录上一帧和下一帧的时间；
- 超过帧间 timeout 时，输出明确的 `TTS_FRAME_IDLE_TIMEOUT`，并释放 WebSocket；
- 不应出现“请求仍在等待但没有任何可关联信息”的黑盒状态。

### 7.3 播放和抢话人工验收

1. 正常提问，确认第一句话尚未完整生成时已经开始播放；
2. 连续生成较长回答，确认句子之间没有由重复建连造成的明显空档；
3. AI 尚未产生第一帧音频时用户抢话，确认旧回复停止且不会产生重复声音；
4. AI 播放中途用户抢话，确认只保留用户最新回合，不继续播放旧回合尾部；
5. 连续执行至少 10 次抢话/取消，观察是否出现旧音频、无声、重复播放或同步警告；
6. provider 延迟、断开和返回错误时，确认用户不会一直等待无反馈；
7. 会话结束后确认没有残留 WebSocket、后台读取任务或未关闭的输出队列。

### 7.4 建议指标

| 指标 | 目的 |
|---|---|
| `ttsFirstAudioMs` | 判断流式输出是否真正降低首段等待 |
| `ttsMaxInterFrameMs` | 识别播放中途的最大空档 |
| `ttsAudioFrameCount` | 判断是否出现空输出或帧丢失 |
| `ttsCancelledBeforeFirstFrame` | 区分正常空播放与真正的 TTS 空响应 |
| `ttsProviderSessionDurationMs` | 观察连接和会话是否异常拉长 |
| `ttsOpenSocketCount` | 验证中断和完成后的资源清理 |
| `playbackStartedLateCount` | 跟踪片段同步竞态是否消失 |

## 8. 预期修复效果

| 缺陷 | 流式 TTS 的作用 | 是否需要额外修复 |
|---|---|---|
| `AUDIO-001` TTS 卡住 | 减少按句建连和句子间等待，降低卡顿概率；能更早暴露 provider 停顿 | 需要 provider timeout、错误分类和指标 |
| `AUDIO-002` 空播放 | 可能降低因等待首帧造成的空播放，但不能消除用户抢话 | 需要区分正常取消和异常空响应 |
| `AUDIO-002` 播放同步竞态 | 流式本身不修复回调归属问题 | 需要 segment/speech 关联、依赖核对或专项修复 |
| `speech interrupted` | 保持为正常 interruption 能力 | 不应通过关闭 interruption 止血 |
| `SegmentSynchronizerImpl...` 警告 | 只能通过更好的片段边界和事件关联降低误配 | 需要复现后专项确认 |

## 9. 风险与回滚

### 风险

- 火山协议可能不支持在同一会话内按当前 LiveKit 语义追加文本；需要在实施前核实；
- 长连接会话可能受到 provider 并发数、会话时长或配额限制；
- 流式输出更早进入播放链路，可能暴露原有 interruption 和同步竞态；
- 如果只修改 capability 标志而未完成 `stream()`，会把问题从“卡顿”变成“流式接口直接失败”；
- 过度放宽 timeout 会掩盖服务端异常并增加用户等待时间。

### 回滚

采用分阶段提交：

1. 先补测试、日志和 provider 会话抽象；
2. 再切换 `streaming` capability 和 Agent 运行路径；
3. 保留 `synthesize()` 一次性路径作为短期回退；
4. 若真实联调失败，可恢复 Provider 注册时的非流式路径，不回滚诊断字段和 mock 测试。

回滚不应通过修改 `node_modules` 或删除所有 TTS 错误日志实现。

## 10. 待审核决策

请重点确认以下事项：

1. 是否同意将目标定义为“真正双向流式 TTS”，而不是仅优化当前按句的一次性合成；
2. 是否允许在实施前以火山官方协议为准，必要时调整“同一会话持续追加文本”的设计；
3. provider 首帧、帧间和会话结束 timeout 是否先与 LiveKit 默认 10 秒保持一致；
4. 是否接受保留 `synthesize()` 作为短期回退路径；
5. AUDIO-002 是否单独作为第二阶段处理，不因流式 TTS 完成就关闭该 Bug；
6. 验收时是否把“流式首帧已播放”与“整段语音顺利结束”分别统计。

## 11. 参考代码与文档

- [当前 TTS Provider](../../src/providers/tts/volcengine.ts)
- [当前火山 TTS 会话实现](../../src/providers/volcengine/tts-session.ts)
- [当前火山 WebSocket 读取实现](../../src/providers/volcengine/websocket.ts)
- [当前 Guide Agent 会话和 interruption 配置](../../src/agent/guide-agent.ts)
- [LiveKit TTS 抽象](../../node_modules/@livekit/agents/src/tts/tts.ts)
- [LiveKit 非流式 TTS 的 StreamAdapter](../../node_modules/@livekit/agents/src/tts/stream_adapter.ts)
- [LiveKit 音频同步实现](../../node_modules/@livekit/agents/src/voice/transcription/synchronizer.ts)
- [豆包 TTS 集成设计](../architecture/volcengine-integration.md)
