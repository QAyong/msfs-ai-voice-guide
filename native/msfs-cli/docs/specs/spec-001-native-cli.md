# Spec-001: 原生 SimConnect CLI 核心

**日期：** 2026-07-15
**状态：** 开发中

## 背景

LiveKit Agent 需要通过本地命令执行 MSFS 2024 官方开发 API。CLI 必须可发现、机器可读、可审计，并避免重新定义 SDK 已有能力。

## 需求边界

**包含：**

- C++20 的 `msfs.exe` 与 `msfsd.exe`。
- Windows Named Pipe JSON-RPC。
- `system`、`simvar`、`key-event`、`input`、`facilities`、`flight`、`ai`、`camera` 与 `catalog` 命令族。
- 单一 SimConnect 会话、自动重连、结构化错误和 `watch` 的 NDJSON 输出。
- 对所有会改变模拟器状态的命令实施 `--unsafe` 或 `--confirm` 守卫。

**不包含：**

- MCP Server、HTTP API、Web UI。
- 外部地理、航图、真实天气、NOTAM、在线航班服务。
- 自定义的“通用自动驾驶”或“通用飞机控制”语义。

## 验收标准

- [x] `msfs status --json` 可明确报告 daemon、SimConnect 和 route bridge 状态；MSFS 连接状态在首次 SDK 请求后报告。
- [x] `simvar get` 使用 SDK 原始变量名、单位和 `FLOAT64`（64 位浮点数）类型；已验证未启动模拟器时返回 `SIM_NOT_READY`。
- [x] 字符串 SimVar 使用 `STRING256` 且向 SimConnect 传入空 UnitsName；已实机读取 `TITLE`、`ATC ID` 与 `GPS WP NEXT ID`。
- [x] `simvar batch`、`simvar watch` 使用 SDK 原始变量名、单位和类型；watch 以 NDJSON 输出。
- [x] `key-event send`、`simvar set`、`input set`、`flight load`、`ai` 写操作无 `--unsafe` 时拒绝执行。
- [x] 已实现的 `key-event send` 在缺少 `--unsafe` 时返回 `UNSAFE_REQUIRED`；在未启动模拟器时返回 `SIM_NOT_READY`。
- [x] 当前已实现命令的 stdout 成功或失败结果均能解析为 JSON；诊断日志仅写 stderr。
- [ ] 多个 CLI 调用不会创建多个 SimConnect 会话，也不会复用请求 ID。
- [x] 当前 seed catalog（种子索引）可返回已收录变量/事件的原名、单位、索引和可写性信息；完整 SDK 索引生成仍待实现。

## 当前命令面

| 命令 | 状态 | 说明 |
|---|---|---|
| `system state --name` | 已实现 | 返回 SDK system state 的 integer、float 与 string 值。 |
| `simvar get/set/batch/watch` | 已实现 | 读取支持 `FLOAT64` 与 `STRING256`；写入目前仅 `FLOAT64`。batch 的条目格式为 `NAME|unit;NAME|unit`。 |
| `key-event send` | 已实现 | 支持最多五个无符号事件数据字。 |
| `input list/set` | 已实现 | list 枚举 SDK Input Event；set 当前接收数值值与 hash。 |
| `facilities nearest` | 已实现 | 返回 SDK 原生机场、航点、NDB 或 VOR 列表，并以飞机 WGS84 坐标作 `radius-nm` 本地距离裁剪。 |
| `flight load` | 已实现 | 仅加载 SDK 支持的 flight file，须 `--unsafe`。 |
| `ai aircraft create-parked` | 已实现 | 当前 AI 最小能力：创建 parked ATC aircraft。 |
| `camera acquire/release/status` | 已实现 | acquire/release 须 `--unsafe`；镜头位置/定义枚举尚未暴露。 |

## 场景描述

**正常流程：**

1. Agent 执行 `msfs simvar get --name "PLANE ALTITUDE" --unit feet --json`。
2. `msfs.exe` 将请求交给 `msfsd.exe`。
3. daemon 通过 SimConnect 获取数据并返回 JSON。
4. Agent 根据退出码和 JSON 的 `ok` 字段决定下一步。

**异常流程：**

1. Agent 在游戏未加载飞行时执行读取命令。
2. CLI 返回稳定的结构化 `SIM_NOT_READY` 错误和可操作提示。
3. CLI 不返回旧缓存值，也不将错误伪装为数值 `0`。

## 相关测试

- `tests/unit/protocol_json_test.cpp`
- `tests/integration/named_pipe_test.cpp`
- `tests/integration/cli_contract_test.ps1` 覆盖新写操作的 `--unsafe` 保护与离线结构化错误。
- 待新增：`tests/integration/request_id_test.cpp`、`tests/e2e/simvar_and_input_test.cpp`（需要运行中且已加载航班的 MSFS 2024）。

## 当前验证记录

- CMake 构建成功，并自动把 `SimConnect.dll` 部署至 `msfsd.exe` 同目录。
- `protocol_json_test` 与 `named_pipe_test` 通过。
- `status`、catalog 查询可运行。
- 在没有运行中 MSFS 时，`simvar get` 与带 `--unsafe` 的 `key-event send` 均返回 `SIM_NOT_READY`；这验证了 DLL 加载和错误分支，但不等于已验证真实游戏数据读写。
- 2026-07-17 已在加载航班的 MSFS 2024 中读取 `PLANE ALTITUDE`、`GROUND ALTITUDE`、`PLANE LATITUDE`、`PLANE LONGITUDE` 与 `SIM ON GROUND` 的真实值。
- 2026-07-18 已修复字符串 SimVar 的 UnitsName 与异常发送包关联，并在 DHC-2 航班中成功读取 `TITLE`、`ATC ID` 与 `GPS WP NEXT ID`。
- 2026-07-22 在未启动 MSFS 的环境中重新执行 `protocol_json_test`、`named_pipe_test`、`geo_context_test` 与 `cli_contract_test`，均通过。CLI 合约测试确认 `status`、catalog、JSON 信封、`--unsafe` 守卫以及离线 SimVar 错误分支保持可用。

## 相关 ADR

- [ADR-001](../adr/adr-001-native-first.md)
- [ADR-002](../adr/adr-002-efb-planned-route-bridge.md)
