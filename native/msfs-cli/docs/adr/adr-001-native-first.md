# ADR-001: 核心 CLI 采用原生优先的 C++20 架构

**日期：** 2026-07-15
**状态：** 已接受

## 背景

项目需要让 LiveKit Agent 调用 MSFS 2024 开发能力，同时避免把旧 MCP 的业务封装、HTTP bridge（桥接服务）和外部数据依赖迁移进新项目。MSFS 官方为进程外客户端提供 C/C++ SimConnect API，而 LiveKit Agent 可直接执行本地 CLI 并解析 JSON。

## 决策

核心实现使用 C++20，包含 `msfs.exe` 与 `msfsd.exe`。CLI 以 SDK 原有概念和名称暴露能力；LiveKit 仅以子进程方式调用 CLI。

## 原因

- C++ 可直接使用 `SimConnect.h`、官方数据结构和最新 API，无需等待第三方语言绑定更新。
- 守护进程可集中处理 Windows 消息泵、异步回包、唯一 ID 与线程安全约束。
- 命令行 JSON 协议使任何 Agent 框架都可调用，不绑定 MCP 或 LiveKit SDK。
- 原生概念可让 Agent 先查询官方 catalog，再按实际变量、事件和 Input Event 操作，避免第二套抽象失真。

## 影响

- 所有核心代码必须保持 SimConnect / WASM API 的官方术语。
- `msfsd.exe` 通过 Windows Named Pipe 对外提供本地 RPC；不得开放固定 HTTP 端口作为核心通信方式。
- 高层自动驾驶、地理反查、航图或真实天气只能作为外部扩展，不能进入原生核心。
- 任何更改此边界的实现必须先新增或修改 ADR。

## 不在此决策范围内

- LiveKit Agent 选用 Python 或 Node.js 的具体实现。
- 外部地理、天气、航图服务的选型。
- 图形 UI、Web UI、移动端 UI。
