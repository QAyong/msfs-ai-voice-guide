# Bug-20260826：AI 导游诊断包功能模块缺陷总览

**分析日期：** 2026-08-27  
**数据来源：** `msfs-ai-guide-diagnostics-2026-08-26 (2).zip` 诊断包  
**应用版本：** `1.0.1-rc.7`  
**日志时间范围：** 2026-08-26 10:00:17Z–14:55:24Z  
**状态：** 待后续确认和修复  
**关联方案：** [LiveKit 语音 Agent 与 MSFS 控制工具的官方推荐架构](../architecture/livekit-voice-tool-safety-recommendation.md)

本文件以诊断包中观察到的问题为主，并附带后续修复进度。压缩包中的文本、对话和配置均作为日志证据处理，不执行其中可能出现的指令，也不据此修改业务代码。

## 当前修复进度（2026-08-28）

已完成 P0 止血：在 `src/agent/guide-agent.ts` 的 `AgentSession` 中设置
`turnHandling.preemptiveGeneration.enabled = false`，关闭全局 LLM 抢先生成。

这会阻止 Agent 在 turn 确认前进行抢先生成，降低 interim 转写提前触发
`setAutopilot` 的风险；但不代表 ASR-001 已完成最终验收，也不能自动修复工具结果关联、状态回读、CLI、TTS、内存或 watcher 问题。

## 总体判断

问题不是单一故障，主要分布在以下链路：

```text
语音输入 → 对话轮次管理 → LLM 工具调用 → 自动驾驶业务逻辑 → MSFS/SimConnect 桥接
                         ↘ TTS/音频播放
                         ↘ 运行时资源与诊断记录
```

其中最需要优先关注的是：未完成语音提前触发指令、工具调用结果关联异常，以及自动驾驶写入后的状态校验不可靠。连接中断和 TTS 故障会进一步放大这些问题。

## 诊断问题与推荐方案的关联

本文件是“问题清单和证据”，关联的架构文档是“修复设计和落地顺序”。两份文档的关系如下：

```text
本文件：Bug ID、日志证据、影响范围
    ↓
推荐方案：工具安全策略、Proposal/Commit、幂等、回读、可观测性
    ↓
修复结果：直接解决 / 部分缓解 / 仍需专项修复
```

需要注意：下面的“直接解决”是指完整实现推荐方案后的预期结果；如果只临时关闭全局抢先生成，只能阻止一部分提前执行，不能自动修复工具生命周期、状态回读、TTS、CLI 或运行时问题。

## 1. 语音识别（ASR）模块

### ASR-001：中间转写被当作最终指令处理

- **级别：** 高
- **证据级别：** 已确认现象
- **证据：** 对话日志有 607 条用户记录，但只有 87 个用户消息 ID，说明大量记录是同一轮语音的逐步增长转写。14:17:31Z 时用户尚未说完高度要求，系统已经执行了 `setAutopilot`，只包含 `verticalMode=FLC`，遗漏了最终的高度参数 6000。
- **影响：** 指令被截断、参数缺失，可能对飞机执行错误操作。

### ASR-002：空语音和低质量转写缺少拦截

- **级别：** 中高
- **证据级别：** 已确认现象
- **证据：** 有 33 条明确的“空消息/未收到语音”兜底回复；同时出现“敬意”“近义”“高度改道”等疑似错误转写。
- **影响：** 系统可能在用户没有发出有效指令时继续回复或调用工具。

## 2. 对话轮次与会话管理模块

### TURN-001：语音轮次结束判定过早

- **级别：** 高
- **证据级别：** 已确认风险
- **证据：** 同一用户消息 ID 对应多次递增转写；部分助手回复发生在最终转写到达之前。
- **影响：** 上游 ASR 尚未完成时，下游 LLM 和工具链已经开始工作，直接造成 ASR-001 和 TOOL-002。

### TURN-002：打断、播放和新一轮输入之间存在竞态

- **级别：** 中高
- **证据级别：** 现象已确认，根因待确认
- **证据：** 23 次 `speech interrupted, new user turn detected`；播放记录有 96 次中断，其中 23 次中断时实际消息为空。
- **影响：** 可能出现重复回复、旧轮次继续执行、音频截断或工具调用没有被取消。用户主动插话本身是正常功能，因此需要进一步区分正常 barge-in 和异常竞态。

## 3. LLM 与工具调用编排模块

### TOOL-001：工具调用结果缺失或无法关联

- **级别：** 高
- **证据级别：** 已确认
- **证据：** `worker.ndjson` 出现 246 次 `function call missing the corresponding function output, ignoring`，全部涉及 `setAutopilot`。
- **影响：** 模型无法获得可靠执行结果，可能继续重试、错误总结状态，或让后续对话继承错误上下文。

### TOOL-002：旧调用 ID 未清理并发生重复调用

- **级别：** 高
- **证据级别：** 已确认现象
- **证据：** 同一 `callId` 在多个后续时间段持续出现，单个调用 ID 最多重复 78 次；同一语音轮次中多次重复执行 `setAutopilot`。
- **影响：** 重复写入自动驾驶参数，造成工具步骤耗尽和状态反馈混乱。

### TOOL-003：工具调用链无法及时收敛

- **级别：** 高
- **证据级别：** 已确认
- **证据：** 两次出现 `maximum number of function calls steps reached`；相关轮次的 `setAutopilot` 被重复调用四次。
- **影响：** 一轮请求无法正常完成，最终回复可能是超限后的兜底结果，而不是实际执行结果。

## 4. 自动驾驶业务逻辑模块

### AP-001：自动驾驶指令参数丢失或解析不完整

- **级别：** 高
- **证据级别：** 已确认现象
- **证据：** 用户要求“FLC + 高度 6000”时，工具调用只记录了 `verticalMode=FLC`，没有带 `targetAltitudeFeet=6000`。
- **影响：** 飞机只执行部分指令，用户以为高度也已经设置。

### AP-002：目标高度与状态回读不一致

- **级别：** 高
- **证据级别：** 已确认现象，具体根因待确认
- **证据：** 用户设置 6000、7500、8000 英尺后，对话中多次回报 6700、6900、7700、7900 等不一致数值。
- **可能原因：** 读取了当前高度而非目标高度；写入被解释为增量事件；或工具写入和状态读取不在同一时刻完成。
- **影响：** 用户无法判断指令是否真正生效，模型可能据此重复设置。

### AP-003：飞机能力判断与执行结果描述不一致

- **级别：** 高
- **证据级别：** 已确认对话矛盾，根因待确认
- **证据：** 同一段会话中，系统先多次表示 `Savage Norden` 不支持自动驾驶，之后又报告 AP、HDG、ALT、FLC 已确认开启。
- **说明：** 日志没有同时提供完整的飞机切换和状态快照，暂不能断言一定是缓存错误；但能力判定、工具执行和自然语言回复之间存在一致性缺陷。

### AP-004：写入成功与状态生效未严格区分

- **级别：** 高
- **证据级别：** 已确认风险
- **证据：** `key-event.send` 记录均为成功，但自动驾驶状态仍出现不一致；工具事件日志也全部标记 `isError=false`。
- **影响：** “事件已发送”可能被错误表述成“目标状态已生效”。

## 5. MSFS、SimConnect 与 CLI 桥接模块

### MSFS-001：模拟器连接和服务可用性不稳定

- **级别：** 中高
- **证据级别：** 已确认
- **证据：** 日志出现多个连接中断区间：10:00–10:04、10:39–11:36、11:41–11:50、11:53–13:01（日志时间为 UTC）。
- **影响：** 状态读取、自动驾驶工具及其他 MSFS 工具在断连期间失败。

### MSFS-002：Daemon/CLI 不可用、请求超时和协议错误

- **级别：** 中高
- **证据级别：** 已确认
- **证据：** 出现 `DAEMON_UNAVAILABLE`、`MSFS_CLI_UNAVAILABLE`、15 秒级别的 `MSFS_CLI_TIMEOUT`，以及 `simvar.batch`、`external.geo`、`route.get` 的协议错误。
- **说明：** 初始 `SIM_NOT_READY` 可能属于模拟器启动阶段；长时间断连和恢复期间的连续失败则不是正常启动现象。仅凭本诊断包还不能确定具体是 SimConnect、daemon、命名管道还是请求并发导致。

## 6. TTS 与音频播放模块

### AUDIO-001：TTS 流卡住后被强制关闭

- **级别：** 中高
- **证据级别：** 已确认
- **证据：** 17 次 `TTS stream stalled after producing audio, forcing close`。
- **影响：** 回复声音可能中途停止、延迟结束或只播放一部分。

### AUDIO-002：播放同步竞态和空播放

- **级别：** 中高
- **证据级别：** 已确认现象
- **证据：** 5 次 `SegmentSynchronizerImpl.onPlaybackStarted called after startFuture is set`；96 次播放被中断，其中 23 次播放内容为空。
- **影响：** 用户可能听到无声、截断或重复播放；也可能与新一轮语音输入互相误判。

## 7. 运行时、子进程与资源管理模块

### RUNTIME-001：Worker 进程内存压力过高

- **级别：** 中高
- **证据级别：** 已确认压力，是否内存泄漏待确认
- **证据：** 104 次内存警告；警戒线为 1 GB，记录值约为 1.29–3.07 GB，平均约 2.64 GB。
- **影响：** 长时间运行可能造成卡顿、TTS/工具超时或进程被系统回收。

### RUNTIME-002：`simvar.watch` 子进程或订阅资源清理疑似不完整

- **级别：** 中
- **证据级别：** 疑似
- **证据：** `simvar.watch` 启动 33 次，但只记录到 11 次退出；部分 watcher 只有启动记录，没有对应退出记录。
- **影响：** 可能造成句柄、进程、事件订阅或内存持续累积。需要结合进程生命周期和正常长驻 watcher 设计进一步确认。

### RUNTIME-003：子进程调用使用 `shell=true`

- **级别：** 中
- **证据级别：** 已确认安全/兼容性风险
- **证据：** 11 次 Node `DEP0190`：子进程使用 `shell=true`，参数未进行安全转义。
- **影响：** 如果命令参数包含外部输入，存在命令注入风险；同时会带来后续 Node 版本兼容性问题。

## 8. 日志、诊断与可观测性模块

### DIAG-001：工具事件错误状态记录失真

- **级别：** 中
- **证据级别：** 已确认
- **证据：** `tool-events.ndjson` 中 82 个工具事件全部为 `isError=false`，但 worker 和内嵌 CLI 日志中实际存在 CLI 不可用、超时和协议错误。
- **影响：** 仅查看工具事件日志会得出“所有工具成功”的错误结论。

### DIAG-002：对话日志没有明确区分 interim/final

- **级别：** 中
- **证据级别：** 已确认
- **证据：** 用户和助手消息以多条记录保存，但缺少明确的 `isFinal`、`interim` 或轮次完成标志。
- **影响：** 无法仅凭对话导出判断哪一条是最终语音，也不利于定位提前执行和重复回复。

### DIAG-003：跨模块调用链关联信息不足

- **级别：** 中
- **证据级别：** 已确认风险
- **说明：** 语音轮次、工具 `callId`、MSFS 请求、状态回读和 TTS 播放之间缺少稳定的统一关联关系，导致同一问题只能依靠时间戳拼接分析。

## 8.1 诊断日志补充规范

本节是后续修复 DIAG-001～003 时必须遵守的日志契约。目标不是记录更多无关联的文本，而是能够从一次用户语音回合还原完整链路：

```text
STT transcript → turn decision → LLM generation → tool lifecycle
              → MSFS/CLI request → state readback → TTS playback
```

### 8.1.1 统一关联 ID

每条跨模块日志都必须携带以下字段；没有对应对象时使用 `null`，不能省略导致调用链断裂。

| 字段 | 作用 | 生命周期 |
|---|---|---|
| `sessionId` | Agent/LiveKit 会话标识 | 一次 Agent 会话 |
| `turnId` | 一次用户发言回合标识 | 从第一条 STT 到该回合结束 |
| `transcriptId` | 一次转写流标识 | 同一轮的 interim/final 共享 |
| `generationId` | 一次 LLM 生成标识 | 抢先生成或最终生成各自唯一 |
| `toolCallId` | Provider/LLM 的工具调用标识 | 一次 function call |
| `operationId` | 应用层实际操作标识 | 一次业务操作；写工具必须有 |
| `msfsRequestId` | 一次 CLI/daemon 请求标识 | 从请求开始到传输终态 |
| `playbackId` | 一次 TTS 播放标识 | 从合成开始到播放终态 |

关联规则：

1. `turnId` 必须由应用生成，不能直接把可重复的用户消息 ID 当作轮次 ID。
2. 一个 `turnId` 可以有多个 `transcript`、`generation` 和只读工具调用，但同一个外部写操作只能有一个有效 `operationId`。
3. `toolCallId` 用于关联模型调用和 function output；`operationId` 用于防止外部写入重复执行，二者不能混用。
4. `msfsRequestId` 和 `playbackId` 必须回挂到产生它们的 `operationId` 或 `generationId`。
5. 需要跨进程传递时，至少传递 `sessionId`、`turnId`、`operationId` 和对应的请求 ID，不能只依赖时间戳。

### 8.1.2 统一日志事件外壳

日志可以继续使用 NDJSON，但每条记录应具备统一的外壳。字段名可以按现有实现调整，语义不能改变：

```json
{
  "ts": "2026-08-26T14:17:31.245Z",
  "level": "info",
  "module": "tool",
  "event": "tool.call.ended",
  "sessionId": "session-...",
  "turnId": "turn-...",
  "generationId": "generation-...",
  "toolCallId": "call-...",
  "operationId": "operation-...",
  "phase": "commit",
  "status": "succeeded",
  "durationMs": 842,
  "errorCode": null,
  "data": {}
}
```

必需字段：`ts`、`level`、`module`、`event`、`status`。  
有跨模块关系时必需带对应 ID；有耗时的事件必需带 `durationMs`；失败、取消、超时和未知结果必需带稳定的 `errorCode`。

日志中的用户文本、工具参数和错误信息必须经过脱敏。禁止记录 API Key、Token、JWT、Cookie、完整 `.env` 内容或未经授权的原始音频。为了分析 ASR，可以记录脱敏后的最终文本、短文本预览、文本哈希、置信度和序号。

### 8.1.3 各模块必须记录的事件

#### A. STT 与 turn

每个 `transcript` 事件至少记录：

```text
transcriptId, turnId, sequence, isFinal, textPreview/textHash,
confidence, receivedAt, source
```

每个 turn 至少记录以下终态之一：

```text
FINALIZED / INTERRUPTED / CANCELLED / EMPTY / TIMEOUT / FAILED
```

要求：

- `interim` 和 `final` 必须明确标记，不能只通过多条文本记录推断。
- 记录 `turn.finalized` 时，要记录最终文本版本和最终参数版本。
- 如果写工具在 `isFinal=false` 时被请求，必须记录 `tool.call.rejected` 或 `proposal.created`，并带 `errorCode=NON_FINAL_TURN`；不能静默丢弃。
- 空文本、低置信度文本和最终文本替换旧文本时，都要记录原因。

#### B. LLM 与工具编排

一次工具调用至少需要形成以下事件序列：

```text
tool.call.requested
  → tool.call.accepted / tool.call.rejected
  → tool.execution.started
  → tool.execution.ended
  → tool.function_output.emitted
```

取消、超时和异常可以提前结束，但必须产生唯一的终态：

```text
SUCCEEDED / FAILED / CANCELLED / TIMED_OUT / REJECTED / UNKNOWN
```

要求：

- `toolCallId` 没有对应 output，或 output 找不到 start 时，必须产生 `TOOL_OUTPUT_MISSING`、`TOOL_CALL_ORPHAN` 等明确错误事件。
- 同一个 `operationId` 重复到达时记录 `DUPLICATE_OPERATION`，并返回已有结果或拒绝执行，不得再次写入 MSFS。
- 记录 `preemptive=true/false`、`isFinalTurn=true/false`、`toolSafety=read-only/external-write`，便于查询抢先阶段是否越过写操作门禁。
- 达到最大工具步骤时必须记录 `TOOL_STEPS_EXCEEDED`，并关联本轮所有工具调用，而不是只输出一条无 ID 的普通 warning。

#### C. MSFS/CLI 与状态回读

MSFS 日志必须将传输层结果和业务层结果分开：

| 字段 | 说明 |
|---|---|
| `transportStatus` | CLI、daemon、命名管道、SimConnect 请求是否完成 |
| `transportErrorCode` | `MSFS_CLI_UNAVAILABLE`、`MSFS_CLI_TIMEOUT`、`MSFS_CLI_PROTOCOL_ERROR` 等 |
| `commandStatus` | 外部命令是否被发送或接受 |
| `readbackStatus` | 目标状态是否实际从 MSFS 读回并匹配 |
| `businessStatus` | `SUCCEEDED`、`FAILED`、`UNKNOWN`、`UNSUPPORTED` |

至少记录：

```text
msfs.request.started
msfs.request.ended
msfs.command.sent
msfs.readback.started
msfs.readback.ended
msfs.operation.ended
```

`key-event.send` 成功只能表示事件发送成功，不能直接把 `businessStatus` 记为 `SUCCEEDED`。只有命令发送成功且回读状态符合目标，才允许记录业务成功。

#### D. TTS 与播放

每个 `playbackId` 至少记录：

```text
tts.started → tts.first_audio → playback.started
           → playback.interrupted / playback.stalled / playback.completed
```

终态必须包含：播放字节数或音频片段数、首包耗时、总耗时、是否为空播放、打断原因和关联的 `turnId`/`generationId`。`TTS stream stalled` 不能只记录 warning，还要落入该播放的终态和错误码。

### 8.1.4 错误状态映射

`tool-events.ndjson` 不得默认把所有事件写成 `isError=false`。建议同时保留机器可查询的状态和错误码：

| 场景 | `status` | `errorCode` | `isError` |
|---|---|---|---:|
| 工具执行并回读成功 | `SUCCEEDED` | `null` | `false` |
| 参数不完整或非最终回合 | `REJECTED` | `INVALID_ARGUMENT` / `NON_FINAL_TURN` | `true` |
| MSFS 未就绪 | `FAILED` | `SIM_NOT_READY` | `true` |
| CLI/daemon 不可用 | `FAILED` | `MSFS_CLI_UNAVAILABLE` / `DAEMON_UNAVAILABLE` | `true` |
| 请求超时 | `TIMED_OUT` | `MSFS_CLI_TIMEOUT` | `true` |
| 协议解析失败 | `FAILED` | `MSFS_CLI_PROTOCOL_ERROR` | `true` |
| 用户打断且外部写入未开始 | `CANCELLED` | `ABORTED` | `false` |
| 命令已发送但状态未确认 | `UNKNOWN` | `READBACK_MISMATCH` | `true` |
| 工具结果缺失 | `FAILED` | `TOOL_OUTPUT_MISSING` | `true` |

`isError` 只作为兼容字段，最终判断应以 `status` 和 `errorCode` 为准。取消不一定是错误，但必须有终态；`UNKNOWN` 不能被包装成成功。

### 8.1.5 诊断导出要求

每份诊断包的 `manifest` 至少应包含：

- 日志 schema 版本；
- 应用、Worker、CLI/daemon 和 Bridge 版本或哈希；
- 统一时间基准（统一使用 UTC，另附本地显示时区）；
- 导出起止时间和日志文件覆盖范围；
- 各模块事件总数、成功数、失败数、超时数、取消数；
- `redactionCount` 和脱敏规则版本；
- 丢失、损坏或无法解析的记录数量。

导出摘要必须能发现以下不一致，而不是只列文件大小：

```text
tool.call.started != tool.function_output.emitted
tool.call.started 没有对应终态
非最终 turn 触发 external-write
同一 operationId 多次 external write
命令成功但 readback 失败/缺失
tool-events 与 worker/CLI 的终态数量不一致
```

### 8.1.6 DIAG-001～003 的验收标准

后续关闭本组 Bug 前，至少完成以下验证：

- [ ] 一次包含多条 interim 和一条 final 的语音，所有记录都能通过 `turnId` 关联，且只有 final 回合可以提交写工具。
- [ ] 一次成功的 `setAutopilot` 可以从 STT、LLM、工具、CLI、状态回读追踪到 TTS，链路中不存在孤立事件。
- [ ] 分别模拟参数错误、非最终回合、CLI 不可用、超时、协议错误、用户取消和回读不一致；每种场景都有唯一终态和正确 `errorCode`。
- [ ] 重复发送同一 `operationId` 时，日志能明确显示重复请求，MSFS 外部写入次数仍为一次。
- [ ] 故意丢弃 function output 时，诊断摘要能报告 `TOOL_OUTPUT_MISSING`，而不是把工具事件统计为成功。
- [ ] `tool-events.ndjson`、`worker.ndjson` 和内嵌 CLI 日志的终态数量及错误类型可以相互核对。
- [ ] 诊断导出通过脱敏检查，不包含 API Key、Token、JWT、Cookie、`.env` 或原始音频。

在上述验收完成前，DIAG-001～003 的状态保持“未解决”，不能仅因为增加了几条日志或 `readiness` 显示 `ready` 就关闭。

## 9. 采用推荐方案后的修复映射

### 9.1 总体结果

| 结果类别 | Bug 数量 | 含义 |
|---|---:|---|
| 直接解决或基本解决 | 9 | 完整实现最终 turn 门禁、Proposal/Commit、幂等、回读和生命周期日志后，问题的主要触发路径被关闭 |
| 明显缓解但仍需专项修复 | 8 | 推荐方案能保护关键链路或把错误显式暴露出来，但不能修复底层 ASR、turn detector、CLI、音频或内存问题 |
| 不在本方案范围内 | 4 | 需要独立的基础设施、音频、子进程或安全改造 |

### 9.2 直接解决或基本解决的 Bug

| Bug ID | 方案中的对应措施 | 修复后的预期行为 |
|---|---|---|
| ASR-001 | `setAutopilot` 只能在最终 turn 执行；中间文本只能形成草稿 | 用户补充高度前不会修改 MSFS |
| TOOL-001 | 工具调用生命周期、终态结果、统一 `toolCallId`/`operationId` | 每次调用都有明确的成功、失败、取消或超时结果，不再留下悬空调用 |
| TOOL-002 | 过期 Proposal 丢弃、按操作幂等、重复调用拒绝或合并 | 同一语音回合不会反复写入自动驾驶状态 |
| TOOL-003 | 一个最终回合只允许一个有效 Commit；失败路径必须收敛 | 不再因为重复调用耗尽 function-call steps |
| AP-001 | 最终文本重新解析；参数完整性和 schema 校验 | “FLC + 6000 英尺”不会被拆成只有 FLC 的半条指令直接执行 |
| AP-004 | 把“命令发送成功”和“状态已生效”分开；执行后回读 | 只有实际状态符合目标时才报告成功 |
| DIAG-001 | 工具事件使用真实执行终态，不再默认 `isError=false` | CLI 超时、协议错误和回读失败会反映到工具事件中 |
| DIAG-002 | 记录 `isFinal`、`turnId`、阶段和 transcript 类型 | 可以区分 interim、final、Proposal 和 Commit |
| DIAG-003 | 统一关联 `conversationTurnId`、`toolCallId`、`operationId` 和 MSFS 请求 ID | 可以从一次语音追踪到工具、模拟器和 TTS 结果 |

### 9.3 只能部分解决的 Bug

| Bug ID | 推荐方案能做什么 | 仍需补充的工作 |
|---|---|---|
| ASR-002 | 最终参数校验可以拦截部分空指令和不完整指令 | 空文本过滤、ASR 置信度阈值、低质量转写拒绝 |
| TURN-001 | 最终 turn 门禁能阻止过早的外部写入 | 继续调优 VAD、turn detector 和静音确认窗口 |
| TURN-002 | 提交阶段不可中断，并用 `abortSignal` 管理可取消阶段 | 修复旧回合清理、TTS 播放和新输入之间的竞态 |
| AP-002 | 回读能发现目标高度与实际状态不一致，并避免虚报成功 | 检查目标高度、当前高度和增量事件的业务映射 |
| AP-003 | 回复以能力校验和实际回读为依据，减少自相矛盾 | 修复机型能力缓存、飞机上下文和状态快照一致性 |
| MSFS-002 | 超时、不可用和协议错误会形成明确终态，避免无限重试 | 继续处理 daemon、SimConnect、CLI 的连接和协议根因 |
| AUDIO-002 | 写操作提交阶段不会因普通插话而产生半执行 | 仍需修复播放同步、空播放和音频队列竞态 |
| RUNTIME-001 | 减少重复工具调用，可能降低内存增长速度 | 继续做 Worker 内存 profiling 和对象生命周期排查 |

### 9.4 推荐方案本身不能解决的 Bug

| Bug ID | 原因 | 独立修复方向 |
|---|---|---|
| MSFS-001 | 模拟器或桥接服务连接不稳定不是工具安全策略造成的 | 健康检查、重连、熔断和服务状态机 |
| AUDIO-001 | TTS 流卡住属于语音输出链路问题 | TTS watchdog、超时、背压和 provider 稳定性处理 |
| RUNTIME-002 | watcher/订阅资源的生命周期与工具安全策略不同 | 明确 watcher 所有权、退出条件和资源回收 |
| RUNTIME-003 | `shell=true` 是子进程调用方式的安全与兼容性问题 | 改用参数数组调用，避免 shell 解释和未转义参数 |

### 9.5 分阶段闭环关系

| 阶段 | 主要动作 | 直接关联的 Bug |
|---|---|---|
| P0 止血 | 已关闭全局 LLM 抢先生成 | 先降低 ASR-001、TURN-001、AP-001、TOOL-002、TOOL-003 的触发概率 |
| P1 策略层 | 区分只读工具和外部写工具；增加最终 turn gate | ASR-001、TURN-001、TOOL-002、AP-001 |
| P2 提交执行器 | Proposal/Commit、不可中断提交、幂等和串行化 | TOOL-001、TOOL-002、TOOL-003、AP-004 |
| P3 状态确认 | MSFS 写入后回读并区分成功/失败/未知 | AP-002、AP-003、AP-004、MSFS-002 |
| P4 诊断完善 | 统一 ID、interim/final、工具终态和跨模块事件 | TOOL-001、DIAG-001、DIAG-002、DIAG-003 |
| 并行专项 | CLI/SimConnect、TTS、watcher、内存和子进程安全 | MSFS-001、MSFS-002、AUDIO-001、AUDIO-002、RUNTIME-001/002/003 |

### 9.6 修复完成的判定标准

不能仅以“日志里没有再次出现错误字符串”作为关闭 Bug 的依据。建议按以下条件关闭：

1. `setAutopilot` 在 interim 文本阶段不会触发 MSFS 写入；
2. 同一个 `operationId` 重复到达时只产生一次外部写入；
3. 每次工具调用都有唯一终态和对应 function output；
4. 参数不完整、最终文本改变参数时，不会提交旧 Proposal；
5. 提交后回读状态与目标一致，失败或未知状态不会被说成成功；
6. 日志可以通过 `conversationTurnId` 追踪到 STT、LLM、工具、MSFS 和 TTS；
7. TTS、CLI、内存、watcher 和 `shell=true` 相关问题分别通过各自的专项测试。

## 暂不归类为程序 Bug 的现象

- `readiness.json` 的 `ready` 只是导出时的当前快照，不能证明整个运行期间没有历史故障。
- `participant_disconnected` 多数为 `CLIENT_INITIATED`，更像用户或会话主动断开，不能直接认定为程序崩溃。
- 社区包安装记录没有发现安装失败；本诊断包也没有发现明确的 API 认证失败记录。
- 语音识别本身出现错词不一定都是应用 Bug，需要结合 ASR 置信度、原始音频和最终转写确认；但未过滤低置信度结果并继续执行属于应用侧问题。

## 后续讨论时的建议优先级

1. **P0/P1：** ASR 最终态判定、工具调用结果关联与清理、自动驾驶参数及状态回读。
2. **P1：** MSFS/SimConnect/CLI 的断连恢复、TTS 流和播放竞态。
3. **P2：** watcher/子进程生命周期、内存压力、`shell=true` 安全风险。
4. **配套：** 补齐诊断日志的最终转写标志、错误状态和跨模块 correlation ID。
