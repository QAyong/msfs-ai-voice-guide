# Bug-20260808：MSFS 对话后连接丢失与 EFB 调用超时

**发现日期：** 2026-08-08  
**状态：** EFB bridge 根因已在 2026-08-09 确认并通过官方重建/部署恢复；Named Pipe 忙碌误判已修复并通过原生与实机双并发回归；无节制多进程高并发的单 SimConnect 容量问题已记录，架构方案待后续决定
**优先级：** P0  
**影响范围：** SimConnect/CLI 连接状态、Agent MSFS 工具、EFB 航路读取、桌面端连接提示

## 用户报告

项目已打包并交给他人和本人测试，当前出现以下现象：

1. SimConnect 会话在刚开始时正常，前端显示游戏已连接；进行对话后，可能莫名变成游戏未连接，后端 Agent 也无法继续正常调用。
2. EFB 部分出现超时，无法正常调用。该现象是在最近一次改动期间出现的。

## 影响

- 用户无法确认是游戏真的断开，还是某个 MSFS 工具请求失败。
- 一次异常可能影响后续对话和工具调用，降低打包版本的可用性。
- 如果没有精确的请求时间线，很难区分 SimConnect 断开、daemon 卡住、Bridge 未响应、请求队列阻塞和前端状态过期。

## 复现步骤（待现场填写）

### 场景 A：对话后 SimConnect 状态丢失

1. 启动 MSFS 2024，进入已经加载飞机的飞行场景。
2. 启动桌面应用，确认标题栏显示“游戏已连接”。
3. 进行一次普通语音或文字对话。
4. 进行一次会调用 MSFS 工具的提问，例如询问当前位置、飞行状态或下一航点。
5. 继续进行 3 至 10 次对话，观察标题栏状态、Agent 工具结果和后台进程。
6. 记录第一次出现“游戏未连接”或工具失败的准确时间。

### 场景 B：EFB 调用超时

1. 确认 MSFS 目标目录下存在 `Community2024\msfs-native-cli-route-bridge`。
2. 在 EFB 中设置一条可读取航路；另记录一次没有设置航路的结果。
3. 通过对话触发 `getRouteBrief` 或 `getNextWaypoint`。
4. 连续重复调用一次，观察第一次失败后第二次是否仍然超时。
5. 记录 CLI 进程、daemon 进程、Bridge 版本、请求耗时和最终错误码。

## 当前已知事实

- 桌面端通过 `MsfsCliClient`（CLI 客户端）调用随应用提供的 MSFS CLI，不由 Renderer 直接访问 SimConnect。
- `MsfsCliClient` 当前有并发门控和一次延迟重试；超时会返回公开的 `MSFS_CLI_TIMEOUT`，部分 Bridge 错误会映射为公开的 EFB 错误。
- `MsfsConnectionMonitor` 默认每 5 秒探测 `status` 和 `system state --name AircraftLoaded`。
- 现有诊断日志已经有 main、worker、conversation 和 tool-events 四类日志，但默认导出范围较大，不能快速聚焦本次 MSFS 故障。
- 最近一次提交 `49161ac` 修改了 `src/msfs/cli-client.ts`、`src/msfs/guide-service.ts`、桌面资源路径和打包暂存流程；这只是排查起点，不等于已经确认根因。

### 2026-08-09 实测证据

1. 从 Codex 沙盒账户直接调用时得到 `SIM_NOT_READY`，但该账户为 `CodexSandboxOffline`，并非运行游戏的 `Lenovo` 交互身份。该结果只说明测试 daemon 不在正确的 SimConnect 会话，不能用于判定 EFB。
2. 切到 `Lenovo` 会话并停止、重启本项目 daemon 后，`route get --source efb --json` 返回 `ROUTE_TIMEOUT`；此时已经排除“游戏未加载”与“没有航路”。
3. 同一时刻 `%APPDATA%\Microsoft Flight Simulator 2024\AsoboReport-RunningSession.txt` 显示旧 Community bridge（WASM SHA-256 `E211675AA2DCD8E1B01C4B84A9A19BCDDF30C8DDD4499D8EA54733F23099DC5E`）为 `Failed`。这解释了 CommBus 三秒内没有回包。
4. 使用修复后的 SDK 环境、VS2022 `MSFS2024` Platform Toolset 和 Package Tool 重建 bridge（WASM SHA-256 `3107C791D337CCCFAACF7BEAAA6AEDDA28D783BB4D240BE7A73002C3D4B5221C`），在游戏完全退出后覆盖 Community Package 并清除该包专属 `MSFS2024` WASM 缓存。
5. 重启游戏后，RunningSession 显示该模块为 `Ready`；同一 `Lenovo` 会话中 `route get --source efb --json` 返回 `ok: true`、`source: "efb"`，并成功读取 `CUSTD → CUSTA` 两个 EFB 航点。

因此，本次 EFB 不可用的直接根因是**旧安装版携带的 bridge 在游戏内加载失败**，而不是 EFB 没有航路。旧发布输入复用了缺少本次官方构建来源记录的历史 WASM；游戏日志没有提供更细的 ABI 错误码，不能把本次特定哈希断言为某个单一链接参数错误。历史问题已证明，未满足官方 MSFS2024 Standalone ABI 的 WASM 会出现相同 `Failed → ROUTE_TIMEOUT` 链路。

## 尚未确认的假设

以下内容必须通过日志或最小复现验证，不能直接当作根因：

- 对话后的工具调用与连接监控发生并发竞争，导致 daemon 或 Named Pipe（命名管道）状态异常。
- 一次 EFB 超时没有正确释放请求队列，后续请求被排队阻塞。
- Worker/Agent 重启或会话重连后，连接监控仍引用旧的 CLI 客户端、旧定时器或旧请求。
- EFB Bridge 版本、安装位置或 MSFS 运行状态发生变化，导致 EFB 专用请求失败，但 SimConnect 本身仍然可用。
- CLI 返回了异常输出或多行输出，导致 JSON/NDJSON 解析失败并被前端统一显示为未连接。

## 首轮定位要求

在修复前，至少收集下面的信息：

| 项目   | 内容                                                          |
| ------ | ------------------------------------------------------------- |
| 应用   | 安装包版本、是否开发态、启动时间                              |
| MSFS   | MSFS 版本、是否已进入飞行场景、飞机型号                       |
| CLI    | `msfs.exe`/`msfsd.exe` 版本或哈希、是否由应用私有资源启动     |
| Bridge | Community Package 实际路径、版本、WASM 哈希                   |
| 请求   | 首次失败的操作名、开始/结束时间、耗时、是否重试               |
| 进程   | `msfs.exe`、`msfsd.exe` 是否仍存在、退出码或超时状态          |
| 状态   | 连接监控最近一次成功探测、失败原因、前端状态变化时间          |
| 会话   | 故障发生前是否保存设置、重启 Worker、切换语言/音色或重连 Room |

禁止要求测试者上传包含 API Key、Token、JWT、Cookie、`.env` 或凭据 blob 的文件。诊断包应先经过应用脱敏，并优先导出故障时间窗口。

## 修复方向

1. 先建立 MSFS 请求和连接状态的结构化时间线。
2. 检查 CLI 请求队列、超时和重试是否会阻塞后续请求。
3. 检查连接监控、Agent 工具和探索流程是否共享同一有效客户端及其生命周期。
4. 分离 SimConnect 连接失败与 EFB Bridge 失败的错误分类和前端提示。
5. 增加“超时后继续调用”“Worker 重启后恢复”“MSFS 重启后恢复”的回归测试。

### 已完成：EFB bridge 恢复流程

1. 候选发布只接受同一份官方构建输入快照，禁止以 `dev-runtime`、相邻 `build/` 或旧安装器资源作为发布来源。
2. bridge 重新构建后必须在游戏退出时部署，并只清除该 bridge 的 MSFS2020/MSFS2024 缓存。
3. EFB 验收必须同时满足：`route get` 返回 `source: "efb"`，以及 RunningSession 中 `msfs-route-bridge.wasm` 为 `Ready`。
4. `SIM_NOT_READY` 的会话隔离场景必须先重启到游戏同一 Windows 用户会话的 daemon；不再把它当成 bridge 失败的证据。

### 已完成：Named Pipe 忙碌误判修复

`native/msfs-cli/src/common/win_pipe.cpp` 已移除 `WaitNamedPipeW(pipe_name, 500)` 的固定 500ms 失败窗口，改为 10 秒总截止时间。首次找不到 Pipe 时仍立即交给既有 daemon 启动逻辑；仅在已观察到 `ERROR_PIPE_BUSY` 后，客户端才会跨越 daemon 旧实例关闭和新实例创建之间的短暂 `ERROR_FILE_NOT_FOUND` 空档继续等待。`CreateFileW` 的 `ERROR_PIPE_BUSY` 竞争同样在同一截止时间内处理。

原生 `named_pipe_test` 已覆盖第一个请求占用 800ms、第二个请求等待并成功的场景；旧实现会因 500ms 超时而失败。2026-08-09 构建后的 `cli_contract_test` 通过，并确认没有残留 `msfsd.exe`。尚需在真实 MSFS 中完成连接监控与连续 10 次 AI 工具调用的前端压力回归，不能将自动化 Pipe 测试替代为实机验收。

### 已验证：实机纯后端压力结果（2026-08-09）

测试在同一 Windows 交互用户、MSFS 已进入驾驶舱的条件下，直接调用 `native/msfs-cli/build/msfs.exe`；没有启动 Electron 或前端。

| 场景 | 结果 | 结论 |
| --- | --- | --- |
| EFB 复测 | 174ms 成功，`source: "efb"`，返回 `CUSTD → CUSTA` | bridge、CommBus 和当前 EFB 数据正常。 |
| 正常产品模型：10 轮双并发 | 每轮 EFB + SimVar，共 20/20 成功；`DAEMON_UNAVAILABLE=0`、`SIM_NOT_READY=0`，最大 94ms | Pipe 忙碌修复在实际游戏会话中有效。 |
| 极端无节制并发：5 轮 × 24 个独立 CLI，共目标 120 次 | 100 次获得结果，其中 95 成功、5 次 `SIM_NOT_READY`；没有 `DAEMON_UNAVAILABLE`，且最后一轮有一组超过 30 秒 | Pipe 假断连未复发，但单 SimConnect 会话会在远超正常模型的多进程竞争下失效。 |

极端压力后，RunningSession 仍显示 bridge `Ready`；停止并重新启动 `msfsd.exe` 后，不重启游戏即可恢复：SimVar 191ms 成功、EFB 2.974s 成功。这将问题限定为 daemon/单 SimConnect 会话的容量与恢复策略，不是 EFB 包损坏。

该容量问题暂不在本次修复中引入多个 SimConnect 会话或新的队列网关。后续需要单独决定统一入口、并发上限、背压与 daemon 失效后的受控恢复方案。

## 完成条件

- [x] 已提供 EFB 的稳定复现、游戏日志和恢复后实机结果；Named Pipe 假断连仍需独立复现记录。
- [x] 已确认 EFB 根因，不能只以“增加重试”作为结论。
- [ ] SimConnect 在连续对话和工具调用后仍能恢复/保持正确状态（待真实 MSFS 前端压力回归）。
- [x] EFB bridge 已恢复，`ROUTE_TIMEOUT` 与 `ROUTE_NOT_FOUND` 的语义已通过实机结果区分；Named Pipe 忙碌误判已在实机双并发中验证修复。
- [ ] 自动化测试覆盖请求隔离、超时、重试、取消和连接状态恢复（Pipe 忙碌等待已覆盖，其余场景待补充）。
- [x] 当前 Community bridge 已完成 MSFS 实机回归；正式安装器的完整交互式验收仍应在每个候选版本执行。
- [ ] 完成 [Spec-018](../specs/spec-018-msfs-runtime-stability-and-desktop-consistency.md) 的 P0 验收项。
