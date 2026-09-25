# Microsoft Flight Simulator 2024 原生 CLI

## 项目概述

`msfs` 是面向自动化程序与 AI Agent 的 Microsoft Flight Simulator 2024 原生命令行接口。它直接使用官方 SimConnect 与 WASM API，并把结果统一输出为 JSON 或 NDJSON。

项目不作为 MCP Server 运行，不开放 HTTP 或 WebSocket 端口。对实时语音助手而言，CLI 应由上层 Agent Adapter 调用：Adapter 负责意图理解、状态缓存、口播结果和危险操作确认；CLI 负责执行受控的 MSFS 操作。

核心组成：

- `msfs.exe`：CLI 入口，负责参数校验、调用 daemon 和 JSON 输出。
- `msfsd.exe`：常驻守护进程，独占 SimConnect 连接。
- `msfs-route-bridge.wasm`：安装在 MSFS 2024 Community Package 中，用于读取 EFB 当前飞行计划。

## 系统架构

```text
AI Agent / 自动化程序
        ↓ 执行 CLI 命令
msfs.exe
        ↓ Windows Named Pipe（JSON-RPC）
msfsd.exe
        ↓ 官方 SimConnect API
Microsoft Flight Simulator 2024
        ↕ CommBus
msfs-route-bridge.wasm
        ↓
EFB 当前飞行计划
```

所有成功与失败结果均为 JSON；持续监听类命令输出 NDJSON。会改变模拟器状态的命令必须显式传入 `--unsafe`。

## 桌面安装包集成

桌面应用必须把 `msfs.exe`、`msfsd.exe`、运行所需的 `SimConnect.dll` 和 `msfs-native-cli-route-bridge` 固定为同一次构建快照，并记录文件哈希与协议主版本。安装态从应用私有资源目录调用 CLI，不注册全局 PATH，也不把 daemon 注册为 Windows 服务。

`msfs.exe` 在需要连接时按需启动唯一的 `msfsd.exe`。桌面应用真正退出或安装器覆盖旧版本前应执行 `msfs daemon stop --json`；该命令是幂等的，daemon 未运行时也返回成功，并且绝不会为了执行停止操作反向启动 daemon。只有旧版 CLI 不支持该命令时，安装器才可对本项目自己的 `msfsd.exe` 使用兼容兜底。

已经发给用户的安装包不会随开发目录中的 CLI 改动自动变化。修改 CLI、daemon 或 bridge 后，必须重新构建 CLI、生成新快照并递增桌面应用版本，再重新打包发布。

## CLI 接口定义

### 运行状态与系统信息

**职责：** 检查 CLI、daemon 与模拟器是否可用。

| 命令           | 功能                                              | 示例                                             |
| -------------- | ------------------------------------------------- | ------------------------------------------------ |
| `status`       | 查询 CLI 与 daemon 状态                           | `msfs status --json`                             |
| `daemon stop`  | 请求常驻 daemon 安全退出；daemon 未运行时幂等成功 | `msfs daemon stop --json`                        |
| `system state` | 查询模拟器系统状态                                | `msfs system state --name AircraftLoaded --json` |

典型用途是确认 MSFS 是否已启动、航班是否已加载。模拟器未就绪时，读取命令返回结构化 `SIM_NOT_READY`，不会伪造数据。

### SimVar 飞行数据

**职责：** 读取、批量读取、监听并在受限范围内写入 Microsoft Flight Simulator 的 SimVars。

| 命令           | 功能                  | 示例                                                                                            |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| `simvar get`   | 读取单个 SimVar       | `msfs simvar get --name "PLANE ALTITUDE" --unit feet --json`                                    |
| `simvar batch` | 一次读取多个 SimVar   | `msfs simvar batch --items "PLANE ALTITUDE\|feet;PLANE LATITUDE\|degrees" --json`               |
| `simvar watch` | 按间隔持续监听 SimVar | `msfs simvar watch --name "PLANE ALTITUDE" --unit feet --interval-ms 1000 --count 0 --json`     |
| `simvar set`   | 写入可写 SimVar       | `msfs simvar set --name "AUTOPILOT ALTITUDE LOCK VAR" --unit feet --value 5000 --unsafe --json` |

可读取的位置、速度、姿态、飞机信息、自动驾驶状态和环境数据取决于 MSFS SDK 对相应 SimVar 的支持。`watch` 输出 NDJSON，`--count 0` 表示持续监听。当前 SimVar 写入仅支持 `FLOAT64`。

### 事件与 Input Event 控制

**职责：** 向 MSFS 发送官方事件，或读写当前机型暴露的 Input Events。

| 命令             | 功能                          | 示例                                                            |
| ---------------- | ----------------------------- | --------------------------------------------------------------- |
| `key-event send` | 发送官方 Key Event            | `msfs key-event send --name AUTOPILOT_ON --unsafe --json`      |
| `input list`     | 列出当前飞机可用 Input Events | `msfs input list --json`                                        |
| `input set`      | 按 Hash 设置 Input Event 数值 | `msfs input set --hash 123456789 --value 1 --unsafe --json`     |

所有控制命令都要求 `--unsafe`。Input Event 写入当前仅支持数值值；上层 AI 不应将此能力用于高频手飞闭环控制。

### 航空设施与导航

**职责：** 查询 MSFS 原生机场、导航台、航点等设施数据。

| 命令                 | 功能             | 示例                                                           |
| -------------------- | ---------------- | -------------------------------------------------------------- |
| `facilities nearest` | 查询附近航空设施 | `msfs facilities nearest --type airport --radius-nm 50 --json` |

机场、跑道、导航台、航点与 ICAO 数据以 MSFS 原生设施接口为准。

### EFB 当前飞行计划

**职责：** 读取 MSFS 2024 EFB 中当前显示的飞行计划。

| 命令           | 功能                 | 示例                                   |
| -------------- | -------------------- | -------------------------------------- |
| `route get`    | 获取当前 EFB 航路    | `msfs route get --source efb --json`   |
| `route status` | 查询 bridge 配置状态 | `msfs route status --json`             |
| `route watch`  | 持续监听航路         | `msfs route watch --source efb --json` |

航路可包含出发与目的地机场、跑道、SID、STAR、进近、巡航高度、VFR/IFR 状态和航路点。该能力需要已安装 `msfs-native-cli-route-bridge` Community Package，并且游戏已加载。当前航路只通过官方 Planned Route API 获取，不以 Legacy GPS Flight Plan SimVars 作为核心来源。

### 航班、AI 与相机

**职责：** 调用官方 SimConnect 的航班、AI 与相机能力。

| 命令                        | 功能                   | 示例                                                                                                       |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `flight load`               | 加载 `.FLT` 航班文件   | `msfs flight load --path C:\Flights\test.FLT --unsafe --json`                                              |
| `ai aircraft create-parked` | 在机场创建停机 AI 飞机 | `msfs ai aircraft create-parked --title "Cessna 172 Skyhawk" --tail N123AB --airport RJNS --unsafe --json` |
| `camera acquire`            | 获取附加相机控制权     | `msfs camera acquire --client-id msfs-cli --unsafe --json`                                                 |
| `camera release`            | 释放相机控制权         | `msfs camera release --client-id msfs-cli --unsafe --json`                                                 |
| `camera status`             | 查询相机状态           | `msfs camera status --json`                                                                                |

AI 当前仅提供停机 ATC aircraft 创建。相机当前支持获取、释放与状态读取，尚未开放位置或镜头参数写入。

### 外部地理上下文

**职责：** 根据坐标或当前飞机位置获取地理上下文。

| 命令                                   | 功能                     | 示例                                                                                       |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `external geo context`                 | 查询指定坐标的地理上下文 | `msfs external geo context --lat 31.2304 --lon 121.4737 --alt-m 10 --detail coarse --json` |
| `external geo context --from aircraft` | 基于当前飞机位置查询     | `msfs external geo context --from aircraft --detail auto --json`                           |

该扩展可返回行政区、自然地貌和游戏内 POI 补充信息，并为不同字段标明来源。它只依赖 Geo Cloud 的稳定 HTTPS 接口，不直接绑定具体地图 Provider。

### SDK Catalog 查询

**职责：** 查询本地收录的 SimVar、事件和单位信息。

| 命令                    | 功能              | 示例                                                 |
| ----------------------- | ----------------- | ---------------------------------------------------- |
| `catalog simvar search` | 搜索已收录 SimVar | `msfs catalog simvar search --query altitude --json` |

Catalog 可辅助 Agent 在调用 `simvar get` 或 `simvar set` 前选择变量名、单位、数据类型和可写性。当前为种子索引，完整 SDK Catalog 生成仍待实现。

## 面向实时语音助手的使用规则

- 将 CLI 封装为高层语音助手工具，例如 `get_flight_snapshot`、`get_route_brief` 与 `get_nearby_airports`，不要把裸命令直接暴露给模型。
- 后台使用少量 `simvar watch` 维护低频状态快照；用户询问即时状态时优先读取缓存，而不是为每句话重新发起请求。
- 只读查询可由 Agent 自主调用。任何状态改变操作必须先向用户复述目标并获得明确确认，随后才传入 `--unsafe`。
- 碰到 `SIM_NOT_READY`、EFB bridge 未加载或航路不存在等错误时，应如实说明当前不可用原因，不能编造飞行数据。
- 不要将 CLI 用于高频、连续的飞机姿态或油门闭环控制。

## 相关文档

- [CLI 核心规格](specs/spec-001-native-cli.md)
- [EFB 航路规格](specs/spec-002-efb-flight-plan.md)
- [架构概览](architecture/overview.md)
- [分发、安装与升级](distribution.md)
