# 运行时资源问题：代码原因与验证测试方案

**分析日期：** 2026-08-27  
**数据来源：** `msfs-ai-guide-diagnostics-2026-08-26 (2).zip` 及当前工作区源码  
**应用版本：** `1.0.1-rc.7`  
**状态：** 原因未最终确认；已补充复现型单测，等待运行时和真实环境验证  
**范围：** RUNTIME-001、RUNTIME-002、RUNTIME-003

> 本文将“日志现象”“代码路径”“待验证假设”分开记录。除明确标记为“已复现”的生命周期行为外，不把候选原因写成最终根因。

## 1. 当前结论

| Bug                             | 当前判断                                                            | 证据强度                       | 还缺什么                            |
| ------------------------------- | ------------------------------------------------------------------- | ------------------------------ | ----------------------------------- |
| RUNTIME-001 Worker 内存压力     | 只报警不终止是确定的；内存持续增长的根因未定                        | 配置路径已确认；泄漏候选待确认 | Heap/RSS 采样、堆快照、重复会话对照 |
| RUNTIME-002 `simvar.watch` 清理 | watcher 句柄存在两个可复现的生命周期缺陷                            | 已补充单测复现                 | 真实子进程 PID、退出和重启行为验证  |
| RUNTIME-003 `shell=true`        | 项目有明确构建脚本使用 `shell:true`，但尚未证明是 Worker 日志的来源 | 代码候选已确认；调用方未归因   | `--trace-deprecation` 调用栈        |

日志中的关键现象包括：

```text
job process memory usage is above the warning threshold
(advisory only, the process will not be terminated)

[msfs-cli] {"role":"ai","kind":"watch_start","operation":"simvar.watch","pid":...}
[msfs-cli] {"role":"ai","kind":"watch_exit","operation":"simvar.watch","pid":...,"exitCode":1}

[DEP0190] DeprecationWarning: Passing args to a child process with shell option true...
```

## 2. RUNTIME-001：Worker 内存压力

### 2.1 已确认的代码事实：内存阈值默认只报警

桌面 Worker 在 [`desktop/agent-process.ts`](desktop/agent-process.ts) 中创建 LiveKit `ServerOptions`，设置了 `numIdleProcesses: 0`，但没有覆盖 `jobMemoryWarnMB` 和 `jobMemoryLimitMB`。

LiveKit 依赖的默认值为：

```ts
jobMemoryWarnMB = 1000;
jobMemoryLimitMB = 0;
```

[`supervised_proc.ts`](node_modules/@livekit/agents/src/ipc/supervised_proc.ts) 在限制值为 `0` 时不会关闭超限 Job，只记录 advisory warning。因此日志中出现约 1.29–3.07 GB 的记录后，进程仍继续运行，这一部分不是推断。

### 2.2 需要验证的内存增长候选

1. `numIdleProcesses: 0` 会为每次任务创建新的 Job 子进程；Agent 同时加载 RTC、STT、LLM、TTS 和 3 个长驻 watcher，可能导致基础 RSS 很高。
2. [`src/providers/stt/volcengine.ts`](src/providers/stt/volcengine.ts) 每个 ASR session 都向长期存在的 `abortSignal` 注册监听器，但正常 session 完成时没有移除该监听器，可能保留 socket 闭包。该项是“代码上可疑”，不是仅凭日志确认的泄漏。
3. LiveKit `ProcPool` 在 `numIdleProcesses: 0` 分支中把 Executor 放入数组，但清理路径主要位于另一条进程池分支；可能造成父 Worker 对象保留。由于日志监控的是 Job 子进程 RSS，该项不能单独解释 Job 的 3 GB。
4. `MsfsTrackCache` 有最大点数限制，当前不作为 GB 级内存增长的首要候选。

## 3. RUNTIME-002：`simvar.watch` 生命周期

### 3.1 长驻设计

[`src/msfs/guide-service.ts`](src/msfs/guide-service.ts) 中的 `ensureTrackWatch()` 为纬度、经度和高度各启动一个 watcher，并传入：

```text
--count 0
```

原生 CLI 的 [`native/msfs-cli/src/cli/main.cpp`](native/msfs-cli/src/cli/main.cpp) 将 `count == 0` 解释为无限循环，所以退出完全依赖 `ProcessWatchHandle.stop()`。

### 3.2 已补充并可复现的两个行为

新增测试文件：

[`tests/unit/msfs-runtime-resource-reproduction.test.ts`](tests/unit/msfs-runtime-resource-reproduction.test.ts)

| 用例                | 注入场景                                 | 当前结果                                | 说明                                                                      |
| ------------------- | ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| RUNTIME-002-UNIT-01 | 前两个 watcher 启动成功，第三个启动抛错  | 两个已启动 handle 没有被 `close()` 停止 | `this.trackHandles = watched.map(...)` 未完成赋值，已启动 handle 失去引用 |
| RUNTIME-002-UNIT-02 | 三个 watcher 启动后立即退出，再次 warmup | 不会重新创建 watcher                    | `onClose` 只写诊断，`trackHandles.length > 0` 仍阻止重启                  |

这两个用例是 characterization/reproduction test：它们记录当前缺陷路径，后续真正修复生命周期后，应将断言改为“已启动 handle 全部停止”和“退出后自动恢复”。

### 3.3 其他相关代码风险

- watcher 的错误回调在 `MsfsGuideService` 中是空函数，失败不会触发清理或重试。
- `getFlightSnapshot()` 使用 `void this.ensureTrackWatch()`，启动异常没有显式捕获。
- `close()` 只能停止当前 `trackHandles` 数组中的句柄，无法停止异常 `map()` 过程中已经启动但没有写入数组的进程。

## 4. RUNTIME-003：`shell=true` 归因验证

当前运行时的 [`src/msfs/process-runner.ts`](src/msfs/process-runner.ts) 使用 `spawn(executable, args, options)`，没有设置 `shell: true`。因此不能仅根据 `DEP0190` 把问题归因到 MSFS 运行时 CLI 调用。

项目中明确存在的调用位于 [`scripts/build-global-ptt.mjs`](scripts/build-global-ptt.mjs)：

```ts
shell: process.platform === 'win32';
```

它是原生模块构建脚本。另有依赖包中的 `node-gyp-build` 使用 `shell:true`，但当前证据不足以证明它在诊断包对应的 Worker 运行期间被调用。

## 5. 补充测试计划

### 5.1 已执行的自动化复现测试

```powershell
pnpm exec vitest run tests/unit/msfs-runtime-resource-reproduction.test.ts
```

判定标准：

- RUNTIME-002-UNIT-01 能证明“部分启动成功后，已有 handle 未被 close”；
- RUNTIME-002-UNIT-02 能证明“watcher 退出后，服务仍把旧 handle 当成有效”；
- 测试本身不代表修复通过，而是确认当前源码中的可复现路径。

当前执行结果（2026-08-27）：

```text
Test Files  2 passed
Tests       4 passed
TypeScript  tsc --noEmit passed
ESLint      new test passed
Prettier    new files passed
```

### 5.2 RUNTIME-001：内存验证

| 用例               | 操作                                                | 需要记录                                            | 通过/确认标准                                           |
| ------------------ | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| RUNTIME-001-INT-01 | 启动 Worker，连续建立并结束 10、50、100 个会话      | 外层 Worker PID、Job PID、每 5 秒 RSS、Job 起止时间 | Job 结束后 PID 消失；外层 Worker RSS 不随会话数单调增长 |
| RUNTIME-001-INT-02 | 单个语音流内反复完成 100/500 次 ASR flush           | `heapUsed`、RSS、WebSocket 数量、SpeechStream 数量  | session 数增加后，旧 socket/监听器不被长期保留          |
| RUNTIME-001-INT-03 | 对照 `numIdleProcesses=0` 与可复用进程配置          | 每次任务的初始 RSS、峰值 RSS、结束 RSS              | 区分“单 Job 基线过高”和“多轮任务持续泄漏”               |
| RUNTIME-001-INT-04 | 开启临时 heap snapshot/对象计数，重复语音和工具调用 | Retainer path、Abort listener、Executor 数量        | 能定位增长对象的持有者；否则只能保留为候选原因          |

### 5.3 RUNTIME-002：进程生命周期验证

| 用例               | 操作                                                      | 通过标准                                             |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------- |
| RUNTIME-002-INT-01 | 真实 CLI 启动 3 个 `--count 0` watcher，逐个调用 `stop()` | 每个进程都有退出事件，且不存在残留 `msfs.exe` 子进程 |
| RUNTIME-002-INT-02 | 连续执行 warmup、断开模拟器、恢复模拟器、再次 warmup      | 退出 watcher 能被移除并重新创建，不出现重复 watcher  |
| RUNTIME-002-INT-03 | 在第三个 watcher 启动失败时关闭 Agent                     | 前两个已启动进程全部退出，错误可在诊断中看到         |
| RUNTIME-002-INT-04 | 重复关闭 Service 两次                                     | `stop()` 幂等，无重复错误，无残留句柄                |

### 5.4 RUNTIME-003：调用方定位与安全验证

1. 使用 `NODE_OPTIONS=--trace-deprecation` 分别执行构建脚本和 Worker 启动路径，保存完整调用栈，确认 `DEP0190` 的真实调用方。
2. 对运行时路径做静态检查：`src/msfs/process-runner.ts`、`desktop/main/agent-runtime.ts`、`desktop/main/local-livekit-runtime.ts` 不应新增 `shell: true`。
3. 对所有进入子进程的参数做边界值测试，包括空格、引号、`;`、`&`、`|` 和用户可控文本；预期参数作为单独 argv 传递，不被 shell 解释。
4. 如果调用栈只指向构建脚本或依赖安装脚本，则将 RUNTIME-003 从“运行时 Worker 问题”改为“构建链安全/兼容性问题”。

## 6. 测试结果记录表

后续每次补测按下表追加，不覆盖历史结果：

```text
测试编号：
测试时间：
应用版本/构建类型：
MSFS 版本与飞机：
Worker PID：
Job PID：
测试轮数/持续时间：
watcher 启动数：
watcher 退出数：
测试前 RSS/heapUsed：
测试后 RSS/heapUsed：
遗留进程或 socket：
诊断包时间范围：
结果：通过 / 复现 / 未复现 / 无法判断
结论：
```

## 7. 关闭条件

- **RUNTIME-001：** 需要堆快照或对照压力测试明确增长对象，不能仅凭 1 GB 警告关闭或定性为泄漏。
- **RUNTIME-002：** 必须同时通过异常启动、自然退出、恢复重启和 Agent 关闭四条路径。
- **RUNTIME-003：** 必须拿到 `--trace-deprecation` 调用栈后，才能确定是构建脚本、依赖包还是实际运行时路径。
