# MSFS Native CLI

面向自动化程序和 LiveKit Agent 的 Microsoft Flight Simulator 2024 原生命令行接口。

项目由两个 Windows 可执行程序和一个游戏内 Community Package（社区扩展包）组成：

- `msfs.exe`：Agent 实际执行的 CLI；输出机器可读 JSON。
- `msfsd.exe`：常驻守护进程；独占 SimConnect 连接与 Windows 消息泵。
- `msfs-route-bridge.wasm`：从 MSFS 2024 EFB（Electronic Flight Bag，电子飞行包）读取当前飞行计划的 WASM 模块。

## 设计目标

- 对齐官方 SimConnect、WASM Planned Route、CommBus 文档，不再定义第二套飞行控制模型。
- 默认本地运行：CLI 与守护进程使用 Windows Named Pipe（命名管道），不开放 HTTP 端口。
- Agent 只执行 CLI 并消费 JSON；LiveKit 不是 CLI 的运行时依赖。
- 对会改变模拟器状态的命令要求 `--unsafe` 或 `--confirm`。

## 已实现的命令

```powershell
msfs status --json
msfs system state --name AircraftLoaded --json
msfs simvar get --name "PLANE ALTITUDE" --unit feet --json
msfs simvar get --name "GPS WP NEXT ID" --unit string --datatype string --json
msfs simvar batch --items "PLANE ALTITUDE|feet;PLANE LATITUDE|degrees" --json
msfs simvar watch --name "PLANE ALTITUDE" --unit feet --interval-ms 1000 --count 0 --json
msfs input list --json
msfs facilities nearest --type airport --radius-nm 50 --json
msfs camera status --json
msfs external geo context --from aircraft --detail auto --json
```

会改变模拟器状态的命令必须明确传入 `--unsafe`，例如：

```powershell
msfs simvar set --name "AUTOPILOT ALTITUDE LOCK VAR" --unit feet --value 5000 --unsafe --json
msfs key-event send --name AP_MASTER --data 1 --unsafe --json
msfs input set --hash 123456789 --value 1 --unsafe --json
msfs flight load --path C:\Flights\test.FLT --unsafe --json
msfs ai aircraft create-parked --title "Cessna 172 Skyhawk" --tail N123AB --airport RJNS --unsafe --json
msfs camera acquire --client-id msfs-cli --unsafe --json
```

`simvar watch` 与 `route watch` 输出 NDJSON；`--count 0` 表示持续观察。`simvar batch` 的 `--items` 格式为 `变量名|单位;变量名|单位`。

## 构建与运行（当前里程碑）

安装 MSFS 2024 SDK 后，将 `MSFS2024_SDK` 指向 SDK 根目录，例如 `C:\\MSFS 2024 SDK`。构建会自动把 SDK 中官方的 `SimConnect.dll` 复制到 `msfsd.exe` 同目录；它在实际读取 SimVar 时才会加载。

```powershell
cmake -S . -B build -G Ninja
cmake --build build
ctest --test-dir build --output-on-failure

.\build\msfs.exe status --json
.\build\msfs.exe catalog simvar search --query altitude --json
.\build\msfs.exe simvar get --name "PLANE ALTITUDE" --unit feet --json
.\build\msfs.exe simvar get --name "GROUND ALTITUDE" --unit feet --json
.\build\msfs.exe key-event send --name GEAR_TOGGLE --unsafe --json
.\build\msfs.exe external geo context --lat 31.2304 --lon 121.4737 --alt-m 10 --detail coarse --json
cmake --build build --target msfs_route_bridge
```

WASM bridge 必须通过 Visual Studio 2022 的官方 `MSFS2024` Platform Toolset（平台工具集）构建：`.\wasm-route-bridge\build.ps1`。它会编译 `wasm-route-bridge/msfs-route-bridge.vcxproj`，再由 SDK Package Tool 在指定输出目录中生成包含 `manifest.json`、`layout.json` 和 `modules/` 的完整 Community Package。将整个包目录安装到 MSFS 2024 专用的 `Community2024` 目录并重启游戏后，`route get --source efb` 才会经 CommBus 读取 EFB 当前航路；不要安装到兼容 MSFS 2020 的 `Community` 目录。

### 已验证状态（截至 2026-07-18）

| 项目                                 | 结果 | 含义                                                                                                 |
| ------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------- |
| 构建与自动测试                       | 通过 | `protocol_json_test`（JSON 协议）和 `named_pipe_test`（Windows 命名管道）均通过。                    |
| `SimConnect.dll`（微软连接组件）部署 | 通过 | CMake 在构建后自动将 SDK 中的官方 DLL 放在 `build/msfsd.exe`（守护进程）旁。                         |
| 守护进程启动                         | 通过 | 不再出现“找不到 SimConnect.dll”的 Windows 弹窗。                                                     |
| 未启动模拟器时的读取                 | 通过 | `simvar get` 返回结构化 `SIM_NOT_READY`，不会伪造数据。                                              |
| 已启动 MSFS 的真实基础数据读取       | 通过 | 2026-07-17 已读取真实高度、地面高度、经纬度与地面状态。                                              |
| 字符串 SimVar                        | 通过 | 2026-07-18 已实机读取 `TITLE`、`ATC ID` 与 `GPS WP NEXT ID`；字符串定义使用空 SimConnect UnitsName。 |
| EFB bridge 包                        | 通过 | 2026-07-23 已实机确认官方 Toolset 产物状态为 `Ready`，并成功读取真实 EFB 航路。                      |

当前实现覆盖 `status`、`system state`、`catalog`、`simvar get/set/batch/watch`、`key-event send`、`input list/set`、`facilities nearest`、`flight load`、停机 AI 创建、`camera acquire/release/status`、EFB `route get/status/watch`、Named Pipe daemon 自动拉起和 `external geo context`。外部地理功能只认 Geo Cloud 的稳定 HTTPS 接口；地图服务选择不在 CLI 中。

当前仍有明确边界：SimVar 的写入仅实现 `FLOAT64`；Input Event 写入仅实现数值值；AI 仅提供 parked ATC aircraft 创建；Camera 未暴露位置/镜头参数写入。完整 SDK catalog 仍需由官方文档生成器替换当前内置索引。

> 自动部署只针对从本源码构建的开发目录。当前候选桌面包为了本机运行验证携带 SDK 中的原生 `SimConnect.dll`；正式公开分发前仍需依据当前 MSFS 2024 SDK EULA 或微软书面说明，确认该具体二进制属于可再分发代码，并在发布清单中记录来源、版本、SHA-256 与许可结论。

## 文档

- [架构概览](docs/architecture/overview.md)
- [CLI 功能参考](docs/cli-reference.md)
- [分发、安装与升级](docs/distribution.md)
- [外部地理模块架构](docs/architecture/external-geo-module.md)
- [Geo Cloud 覆盖测试记录](docs/testing/geo-cloud-coverage.md)
- [原生优先架构决策](docs/adr/adr-001-native-first.md)
- [EFB 飞行计划桥接决策](docs/adr/adr-002-efb-planned-route-bridge.md)
- [外部 Geo Cloud 决策](docs/adr/adr-003-external-geo-cloud.md)
- [MSFS WASM 官方工具链决策](docs/adr/adr-004-msfs-wasm-official-toolchain.md)
- [CLI 核心规格](docs/specs/spec-001-native-cli.md)
- [飞行计划规格](docs/specs/spec-002-efb-flight-plan.md)
- [外部地理上下文规格](docs/specs/spec-003-external-geo-context.md)
