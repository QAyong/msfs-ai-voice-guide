# MSFS Native CLI

## 项目简介

`msfs`（Microsoft Flight Simulator 原生命令行）是供自动化程序与 LiveKit Agent 调用的 Windows CLI。它直接映射 Microsoft Flight Simulator 2024（MSFS 2024）官方 SDK 的 SimConnect 与 WASM API；LiveKit 只负责执行命令并解析 JSON，不持有模拟器连接，也不通过 MCP 调用。

## 模块结构

```text
src/
  cli/                 # msfs.exe：参数解析、JSON 输出、退出码
  daemon/              # msfsd.exe：命名管道、进程生命周期
  simconnect/          # 官方 SimConnect C++ API 映射与消息泵
  commbus/             # SimConnect 与 WASM 的 CommBus 协议
  catalog/             # 由官方文档生成的 SimVar / Event 本地索引
  external/            # 外部扩展：Geo Cloud 契约与可替换后端客户端
wasm-route-bridge/     # Community Package：EFB Planned Route API 桥接
docs/
  adr/                 # 不可逆架构决策
  specs/               # 功能边界与验收标准
  bugs/                # 待修复问题
  architecture/        # 架构与数据流
tests/
  unit/                # 纯函数与 JSON 编解码测试
  integration/         # daemon、CLI、命名管道交互测试
  e2e/                 # 需要运行中 MSFS 的端到端测试
```

## 文档索引

| 类型         | 路径                            | 说明                                                   |
| ------------ | ------------------------------- | ------------------------------------------------------ |
| 架构决策     | `docs/adr/`                     | 新会话在修改核心边界前必须阅读                         |
| 功能需求     | `docs/specs/`                   | 原生命令与 WASM 航路桥接的验收范围                     |
| 架构概览     | `docs/architecture/overview.md` | 组件、数据流与依赖关系                                 |
| CLI 功能参考 | `docs/cli-reference.md`         | 命令、JSON/NDJSON 契约与桌面应用集成方式               |
| 分发部署     | `docs/distribution.md`          | CLI 安装、Community Package 探测、升级、卸载与发布验收 |
| Bug 记录     | `docs/bugs/`                    | 按 Issue 化管理，不直接热修复                          |

## 代码组织原则

- 核心使用 C++20，并直接使用 SDK 的 `SimConnect.h` 与 WASM 头文件。
- `msfsd.exe`（常驻守护进程）是唯一允许持有 SimConnect 连接的进程。
- `msfs.exe`（CLI）只通过 Windows Named Pipe（Windows 命名管道）调用 `msfsd.exe`，标准输出只写 JSON 或 NDJSON。
- 命令名称、变量名、事件名、单位和数据类型保持 SDK 原名；CLI 只隐藏请求 ID、线程、回包和结构体编解码等实现细节。
- 原生 API 已提供的能力不得在核心层再造业务语义；非原生能力必须位于 `external` 或 `compat` 命名空间。
- LiveKit Agent 以子进程方式调用 CLI，不通过 MCP、HTTP 或直接 SimConnect 绑定。
- 外部地理功能只依赖 `Geo Cloud`（云端稳定接口）；具体地图供应商只能在 Geo Cloud 内部替换，不能进入 CLI 代码或配置。

## 测试策略

- `tests/unit/`：命令参数、JSON 协议、SDK catalog 与 route JSON 转换。
- `tests/integration/`：命名管道、请求 ID、超时、守护进程重连。
- `tests/e2e/`：在 MSFS 2024 与 Community Package 已加载时验证 SimVar、Input Event、Facilities、Camera 和 EFB 航路。
- 所有 ADR 中的不变量必须有自动化 Harness（测试护栏）覆盖。

## 当前已确认不做的事项

- 不将项目实现为 MCP Server，不修改或迁移旧 MCP 项目。
- 不在核心层接入地图、地名、真实天气、航图、NOTAM 或在线航班服务。
- 不使用 Legacy GPS Flight Plan SimVars 作为当前 EFB 飞行计划的核心来源。
- 不让 Agent 使用 CLI 执行高频手飞闭环控制。

## 约束来源

见 `docs/adr/`。所有实现会话必须先按需阅读相关 ADR 和 Spec。
