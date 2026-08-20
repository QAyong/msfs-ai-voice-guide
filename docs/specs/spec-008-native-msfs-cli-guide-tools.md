# Spec-008：原生 MSFS CLI 导游工具接入

**日期：** 2026-07-24  
**状态：** 已实现并完成当前版本验收；跨机器安装包回归不纳入当前版本范围

## 背景

AI 导游需要基于真实飞行位置、航路、周边航空设施、天气和模拟器时间进行讲解。当前项目已具备 LiveKit Agent、语音、文字和 `searchWeb`（公开网页搜索）工具，但没有模拟器数据边界。

新 CLI `msfs.exe`（命令行入口）与 `msfsd.exe`（守护进程）已提供 JSON/NDJSON 输出、Named Pipe（命名管道）守护进程、官方 SimConnect 和 EFB Planned Route（EFB 航路）能力。本功能将其包装成当前项目的静态 LiveKit 函数工具，不启动旧 Pipecat MCP。

CLI 只连接真实的 MSFS 2024 SimConnect。本地未启动游戏或飞行未加载时，适配层必须返回结构化不可用状态；不得提供或伪造模拟飞行数据。

## 需求边界

**包含：**

- 新增 `src/msfs/`（MSFS 适配层），负责 CLI 路径解析、进程调用、JSON 解析、NDJSON watch（持续监听）和错误标准化。
- 将 CLI 打包为 Electron 资源；开发态可使用配置的本地 CLI 路径，安装态使用应用资源目录中的副本。
- 启动 Agent 会话时执行内部 MSFS 状态预热，并向桌面端暴露脱敏的就绪结果。
- 静态注册下表的 7 个只读 LiveKit `llm.tool()`（模型函数工具）。
- 对工具输入、CLI 响应和错误 DTO（数据传输对象）使用 Zod 校验。
- 对 EFB route bridge（航路桥接模块）未安装、模拟器未就绪、Geo Cloud（外部地理服务）失败等情况返回明确、可讲解的状态。

**不包含：**

- 旧 `mfsf2024-mcp` 的 Python/C# MCP 进程、stdio JSON-RPC 或其本地地理数据。
- LiveKit 工具动态切换、Skill 管理或 MCP 协议。
- 原始 CLI 命令、原始 SimVar 名称、SDK Catalog、Key Event 或 Input Event 直接暴露给模型。
- 写操作：自动驾驶目标设置/模式切换、`flight load`（载入航班）、`ai aircraft create-parked`（创建停机 AI 飞机）、相机控制和 Input Event 写入。
- 连续控制飞机姿态、油门或高频飞行控制闭环。

## 工具目录与 CLI 映射

所有工具由 `src/tools/`（LiveKit 工具包装层）创建，并在 `src/agent/guide-agent.ts`（导游 Agent）启动时一次性传入 `createGuideAgent(tools)`。第一版不在会话中动态增加或删除工具。

| LiveKit 工具           | 目的                                         | 新 CLI 映射                                          | 备注                                                                                |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `getFlightSnapshot`    | 获取导游所需的飞行快照                       | `simvar batch`，必要时补充字符串 `simvar get`        | 合并位置、海拔、地面海拔、速度、姿态、航向、地面状态和飞机标识；不暴露原始 SimVar。 |
| `getLocationContext`   | 解释当前所处国家、城市、自然地貌和游戏内 POI | `external geo context --from aircraft --detail auto` | 返回字段级来源；地理结果不表述为 SimConnect 原生数据。                              |
| `getRouteBrief`        | 获取 EFB 当前航路概览                        | `route get --source efb`                             | 包含出发/目的地、程序、巡航高度、航段与航路点；以 EFB 为权威来源。                  |
| `getNextWaypoint`      | 获取下一航点和相对进度                       | `route get --source efb` + `simvar get`              | 使用 EFB 航路与 `GPS WP NEXT ID` 等受控读取组合；无航路时返回明确状态。             |
| `getNearbyFacilities`  | 查询附近机场、VOR、NDB 或航点                | `facilities nearest --type … --radius-nm …`          | 参数限制设施类型与半径范围，结果以 MSFS 原生设施数据为准。                          |
| `getWeatherAndSimTime` | 获取游戏内环境与时间                         | `simvar batch`                                       | 读取固定、经验证的天气和时间 SimVar 集；不替代网页天气或真实世界气象。              |
| `getTrackHistory`      | 获取本次 Agent 会话内的飞行轨迹摘要          | 后台 `simvar watch`                                  | 由适配层低频维护有界内存缓存；不为每次工具调用重新启动 watch。                      |

现有 `searchWeb` 继续注册。第一版导游共可见 8 个工具：上述 7 个 MSFS 工具与 1 个网页搜索工具。

### 内部预热，不暴露为工具

会话创建后，适配层执行与 `msfs status --json` 等价的连通性检查，必要时触发 CLI/daemon 启动。该步骤替代旧 MCP 的 `warmup_msfs`，仅用于缩短首次真实查询的等待时间。

预热不成功时：

- Agent 仍可完成不依赖模拟器的普通对话和 `searchWeb` 查询。
- 相关 MSFS 工具返回结构化不可用结果。
- 导游回答应说明“模拟器尚未进入可读取的飞行状态”或“航路桥接模块尚未可用”，不得猜测数据。

## 数据与错误约定

### CLI 调用约定

- 每个一次性命令都显式传入 `--json`，只从 stdout 解析一个 JSON 信封；stderr 仅用于诊断日志。
- `simvar watch` 与 `route watch` 的 NDJSON 只能由 `src/msfs/` 消费；必须按行解析、支持取消、进程退出和最大缓存上限。
- 适配层必须设置超时、限制并发，并将 CLI 非零退出码转换为稳定错误，而不是将原始 stderr 直接发送给模型或 Renderer。
- 多个 CLI 调用共享 `msfsd.exe` 的单一 SimConnect 会话；本项目不得自行建立第二条 SimConnect 连接。

### 需要保留的不可用状态

工具结果必须可区分至少以下情形：

| 情形              | CLI/来源示例                                           | 导游处理                                                  |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| 模拟器未就绪      | `SIM_NOT_READY`                                        | 说明尚未进入已加载飞行的座舱。                            |
| EFB bridge 不可用 | `ROUTE_BRIDGE_UNAVAILABLE`、`ROUTE_TIMEOUT`            | 说明当前无法读取 EFB 航路，并提示检查 Community Package。 |
| EFB 没有航路      | `ROUTE_NOT_FOUND`                                      | 说明尚未在 EFB 中设置航路。                               |
| 外部地理失败      | `EXTERNAL_GEO_UNAVAILABLE`、`EXTERNAL_GEO_AUTH_FAILED` | 保留原生飞行数据，不编造地名或 POI。                      |
| CLI 协议/进程故障 | 非零退出码、非法 JSON、超时                            | 返回“MSFS CLI 暂时不可用”的脱敏错误，并记录诊断信息。     |

## 场景描述

### 正常导游流程

1. 用户进入已加载航班的 MSFS 2024 座舱，Electron 启动 Agent Worker。
2. Worker 内的 MSFS 适配层预热 CLI/daemon，并读取可用性状态。
3. 用户问“我们现在飞到哪里了，附近有什么值得介绍？”
4. LiveKit Agent 调用 `getFlightSnapshot` 和 `getLocationContext`；必要时调用 `getRouteBrief` 与现有 `searchWeb`。
5. Agent 基于结构化结果生成讲解；位置、航路、设施和网页来源必须按其真实来源表述。

### 航路不可用流程

1. 用户问“下一站是什么？”
2. Agent 调用 `getNextWaypoint`。
3. CLI 返回 `ROUTE_BRIDGE_UNAVAILABLE` 或 `ROUTE_NOT_FOUND`。
4. Agent 说明无法读取 EFB 航路的具体原因，不以 Legacy GPS 或旧缓存伪造替代结果。

### 轨迹查询流程

1. 会话期间适配层以受控低频率维护位置 watch。
2. 用户问“刚才飞过哪里？”
3. Agent 调用 `getTrackHistory`。
4. 工具返回本会话、有限长度和带时间戳的轨迹摘要；不会访问上一会话或未授权的历史数据。

## 后续候选能力

以下能力不属于第一版工具集合，只有明确产品需求、交互确认和测试覆盖后才评估加入：

- `getAutopilotStatus`：读取 AP（自动驾驶）状态。
- `calculateCourseCorrection`：基于航路与偏航数据给出建议航向；仅建议，不控制飞机。
- `setAutopilotTarget`、`toggleAutopilotMode`：通过受控 SimVar/Key Event 写入实现，必须先获得用户明确确认，并由适配层附加 `--unsafe`。
- `flight load`、AI 飞机、相机和 Input Event 能力：作为独立功能规格，不与导游数据读取同时引入。
- 地名/目的地导航搜索：等待 Geo Cloud 提供稳定的正向地名搜索接口后另立规格；当前不迁移旧 MCP 的 `navigate_to`。

## 验收标准

- [x] Agent 启动时能在开发态与安装态解析 CLI 资源路径，并产生可读的就绪结果。
- [x] 所有 7 个工具均为 Zod 校验的 `llm.tool()`，不接受原始 CLI 参数、原始 SimVar 名称或 `--unsafe`。
- [x] `getFlightSnapshot` 使用受控批量读取，返回一致单位、来源和时间戳。
- [x] `getLocationContext` 能正确透传 Geo Cloud 的字段来源，外部地理失败时不影响基础飞行快照。
- [ ] `getRouteBrief` 与 `getNextWaypoint` 在 EFB route bridge 就绪时读取真实航路；不可用时返回可区分的结构化状态。
- [x] `getNearbyFacilities` 仅返回 CLI 原生设施结果，并校验半径和设施类型。
- [x] `getWeatherAndSimTime` 只描述游戏内环境和时间，不将其混同为实时网络天气。
- [x] `getTrackHistory` 能启动、取消并清理 NDJSON watch，缓存有大小和生命周期上限。
- [x] CLI 非零退出、stdout 非法 JSON、超时和 `SIM_NOT_READY` 不会使 Agent Worker 崩溃，也不会泄漏原始堆栈或密钥。
- [x] 默认注册集合只包含 7 个 MSFS 工具与现有 `searchWeb`；不注册任何写操作。
- [x] 覆盖单元、集成和模拟器未就绪场景的自动化测试。

2026-08-04 验证：修复 `AircraftLoaded` 字符串状态判断和 Electron 开发态 CLI 资源路径后，运行中的 MSFS 2024 已通过 `pnpm msfs:smoke`，返回 `ready` 并读取真实飞行快照；桌面 Agent 实际调用 `getFlightSnapshot` 和 EFB 航路正常。2026-08-05 进一步完成 Electron 标题栏连接状态、设置页配置检测、Community Package 暂存和工具开关的真实验收。2026-08-07 已完成候选安装包中的 Community Package 自动安装/升级、开发版本与应用版本隔离、CLI/Bridge 哈希校验和 daemon 退出。跨机器安装包回归不属于当前版本验收范围。

## 相关测试

- `tests/unit/msfs-cli-client.test.ts`：JSON 信封、错误和超时标准化。
- `tests/unit/msfs-tool-schemas.test.ts`：7 个工具的 Zod 参数与输出边界。
- `tests/unit/msfs-track-cache.test.ts`：NDJSON 解析、缓存上限和取消清理。
- `tests/integration/agent-msfs-tool-composition.test.ts`：默认 Agent 工具注册集合。
- `tests/integration/msfs-cli-offline.test.ts`：`SIM_NOT_READY`、route bridge 与外部地理不可用结果。
- 需要已启动 MSFS 的手动冒烟：飞行快照、EFB 航路、附近设施与轨迹 watch。

## 相关 ADR

- [ADR-008：原生 MSFS CLI 作为导游 Agent 边界](../adr/adr-008-native-msfs-cli-agent-boundary.md)
- [ADR-006：搜索访问边界](../adr/adr-006-search-access-boundary.md)
