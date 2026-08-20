# Spec-019：单 SimConnect 会话的 Pipe 等待修复

**日期：** 2026-08-08  
**状态：** 已实施并通过真实 MSFS 前端回归（2026-08-17）
**优先级：** P0

## 背景

桌面应用目前保留一个 `msfsd.exe`（原生常驻进程）和一个
`SimConnectClient`（SimConnect 客户端）。AI 工具、探索功能和前端游戏连接
检测都会通过 `msfs.exe`（命令行程序）访问这个 daemon。

当前 Native Pipe（Windows 命名管道）在 daemon 正处理请求时，只等待约 500ms。
因此，AI 请求占用 daemon 的短暂期间，前端下一轮连接检测可能把“Pipe 暂时忙”
错误解释为“游戏未连接”。这不是已确认的 SimConnect 会话断开。

本规格只处理这个 Pipe 忙碌误判，不扩展为新的多会话、通用网关、实时订阅或 EFB
修复项目。

## 决策

继续使用：

```text
一个 msfsd.exe
一个 SimConnectClient
现有 CLI 命令协议
```

当 daemon 正在完成当前请求时，后续 CLI 请求必须等待可用的 Pipe 实例；不得因为
500ms 内暂时不可用就返回 `DAEMON_UNAVAILABLE`（daemon 不可用）。

## 需求边界

**包含：**

- 修改原生 CLI 的 Pipe 等待行为，使正在处理的请求不被误判为 daemon 不可用。
- 保持一个 SimConnect 会话和现有按请求串行执行的行为。
- 验证前端连接检测在 AI 请求期间会等待真实结果，而不是错误显示“游戏未连接”。
- 保留现有 `status` 与 `system state --name AircraftLoaded` 连接检测协议。

**不包含：**

- 新增多个 SimConnect 会话或多个 `msfsd.exe`。
- 新增请求队列、Gateway（网关）、优先级系统或新的 `health` 命令。
- 改造 `simvar batch`、轨迹 `watch`（监听）、实时经纬度或 EFB Bridge（桥接模块）。
- 调整 EFB 超时的原因、重试或安装诊断。

## 实施要求

修改 `native/msfs-cli/src/common/win_pipe.cpp` 中客户端等待 Pipe 的逻辑：

1. daemon 存在且正在处理前一个请求时，继续等待；
2. daemon 不存在、Pipe 真正不可用或等待达到现有 CLI 调用的可接受时限时，才返回失败；
3. 不改变 `msfs.exe` 命令格式、JSON 响应格式和当前单会话 daemon 拓扑；
4. 不以增加重试次数代替等待行为修复。

## 验收标准

- [x] 一个慢的 AI MSFS 请求执行期间，前端连接检测不再因为 500ms Pipe 忙碌而显示“游戏未连接”。
- [x] 真实退出 MSFS 或无法打开 SimConnect 时，前端仍会在下一次检测中显示“游戏未连接”。
- [x] 连续完成至少 10 次会调用 MSFS 工具的 AI 对话，前端连接状态不会因 Pipe 忙碌而错误变化。
- [x] `msfs.exe`、`msfsd.exe` 没有残留进程，所有 CLI 调用都有结束结果。
- [x] 原生 Named Pipe 集成测试覆盖“前一个请求尚未完成时，后一个请求等待并获得结果”的场景。
- [x] 开发态和安装态均完成一次真实 MSFS 2024 回归。

## 实施记录（2026-08-09）

`native/msfs-cli/src/common/win_pipe.cpp` 已将忙碌 Pipe 的总等待窗口设为 10 秒，低于桌面端 15 秒的 CLI 调用预算。客户端首次直接打开 Pipe 时若收到 `ERROR_FILE_NOT_FOUND`，仍会立即走既有的 daemon 启动路径；只有已经确认 `ERROR_PIPE_BUSY` 后，才会在 daemon 关闭旧实例、创建新实例的短暂 `ERROR_FILE_NOT_FOUND` 空档内继续等待至截止时间。`CreateFileW` 与 `WaitNamedPipeW` 的竞争同样受该截止时间保护。

`named_pipe_test` 现在让第一个请求占用 Pipe 800ms，并验证第二个请求等待后获得响应；旧的 500ms 实现会在该测试中失败。2026-08-09 的新目录 CTest 已通过该测试、CLI 契约测试和其余原生测试。

同日的 MSFS 驾驶舱纯后端验证中，EFB 读取返回 `source: "efb"` 与 `CUSTD → CUSTA`。随后连续 10 轮、每轮并发一个 EFB 读取和一个 SimVar 读取，共 20/20 成功，未出现 `DAEMON_UNAVAILABLE` 或 `SIM_NOT_READY`；该验证没有启动前端。极端 120 路独立 CLI 并发会使单 SimConnect 会话出现 `SIM_NOT_READY`，但没有重现本规格处理的 Pipe 假断连，重启 daemon 后无需重启游戏即可恢复。该容量问题留待后续架构决策，不在本规格中引入多 SimConnect 会话或新网关。

真实 MSFS 前端压力回归仍按上面的未勾选项执行。

## 场景描述

**正常流程：**

1. 用户进入已加载飞机的 MSFS 2024 飞行场景。
2. 应用显示“游戏已连接”。
3. 用户发起会读取 MSFS 数据的 AI 对话。
4. 前端连接检测在请求期间触发。
5. 检测等待当前请求完成后获得真实结果，仍显示“游戏已连接”。

**异常流程：**

1. 用户关闭 MSFS，或 SimConnect 无法建立会话。
2. 下一次连接检测返回实际失败。
3. 前端显示“游戏未连接”，AI 工具返回现有的不可用错误。

## 后续触发条件

如果完成本规格后仍稳定复现“对话后前端和 AI 都无法调用 MSFS”，必须先记录首次
失败请求、daemon 是否仍在运行和原生错误码，再新建后续修复规格。不得在本规格中
直接引入多 SimConnect 会话或其他架构改造。

## 相关文档

- [Spec-018：MSFS 运行时稳定性与桌面体验一致性](spec-018-msfs-runtime-stability-and-desktop-consistency.md)
- [Bug-20260808：MSFS 对话后连接丢失与 EFB 调用超时](../bugs/bug-20260808-msfs-session-drop-and-efb-timeout.md)
- [MSFS 运行时回归测试矩阵](../testing/msfs-runtime-regression-matrix.md)
