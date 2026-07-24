# ADR-008：以原生 MSFS CLI 作为导游 Agent 的唯一模拟器边界

**日期：** 2026-07-24  
**状态：** 已接受

## 背景

项目当前以 LiveKit Agents Node.js SDK（实时语音 Agent 框架）编排 AI 导游，并由 Electron 的 Utility Process（工具进程）托管 Agent Worker。需要让导游读取 Microsoft Flight Simulator 2024 的实时状态、EFB（Electronic Flight Bag，电子飞行包）航路和地理上下文。

旧项目 `D:\code\Pipecat-AI` 中的 Python MCP（Model Context Protocol，模型上下文协议）Server 已验证过相应产品能力，但其运行时依赖 Python、FastMCP、C# HTTP bridge 和本地地理数据。新项目将采用 `D:\code\微软模拟飞行cli` 中的 `msfs.exe`（命令行入口）与 `msfsd.exe`（常驻守护进程）；两者通过 Windows Named Pipe（命名管道）与官方 SimConnect 通信，并输出 JSON/NDJSON（逐行 JSON）。

需要固定本项目的集成边界，避免导游 Agent 直接暴露原始命令、复用旧 MCP 运行时，或将 SimConnect 细节散落到 Agent 会话代码中。

## 决策

以随 Electron 安装包携带的原生 MSFS CLI 作为 AI 导游访问模拟器的唯一运行时边界。

```text
LiveKit Agent 工具（llm.tool）
        ↓
src/msfs/ 适配层（进程、JSON、缓存、领域模型）
        ↓
msfs.exe → msfsd.exe → SimConnect / EFB route bridge
        ↓
MSFS 2024
```

- `guide-agent.ts`（导游 Agent 组合入口）只注册高层 LiveKit 函数工具，不得拼接 CLI 参数或解析 CLI stdout。
- `src/msfs/`（MSFS 领域适配层）是唯一允许启动 `msfs.exe`、消费 NDJSON、解析 CLI JSON 信封并将错误转换为领域结果的模块。
- 第一版静态注册 7 个只读 MSFS 工具，并保留现有 `searchWeb`（公开网页搜索）工具；不引入 Skill 管理、动态工具切换、MCP Client 或 MCP Server。
- `warmup_msfs` 的等价动作由 Agent 会话启动时的内部预热完成，不作为模型可调用工具暴露。
- 会改变模拟器状态的 CLI 命令必须经单独的控制功能设计、用户确认和 `--unsafe`（显式危险操作确认）守卫后才能注册；本 ADR 的第一版不注册任何写操作。

## 原因

- 原生 CLI 已为 LiveKit Agent 设计，使用机器可读 JSON，并由 `msfsd.exe` 独占 SimConnect 会话；无需在 Electron 应用内重建 SimConnect、MCP 或本地 HTTP bridge。
- CLI 的 EFB 航路来自官方 Planned Route API，附近设施来自 MSFS 原生设施接口；这些来源比旧 MCP 的 Legacy GPS/本地机场兜底路径更贴近当前产品目标。
- 高层工具将多个底层 SimVar（模拟器变量）读取组合成导游可理解的结果，避免模型选择或拼接任意 SimVar、Key Event（键盘事件）和 `--unsafe` 参数。
- 将进程生命周期、超时和错误处理集中到 `src/msfs/`，符合现有 `src/search/`（共享业务服务）→ `src/tools/`（LiveKit 工具包装）→ `src/agent/`（会话编排）的依赖方向。

## 影响

- Electron 打包需携带与架构匹配的 `msfs.exe`、`msfsd.exe` 及其运行时文件；EFB 航路仍要求用户安装对应的 Community Package（社区扩展包）。
- Agent Worker 启动时执行低成本状态预热；预热失败不得阻止文字或语音导游启动，但必须记录可显示的就绪状态。
- 所有工具输入均使用 Zod（运行时 Schema 校验库）验证；CLI 成功、失败和 NDJSON 事件都必须由 `src/msfs/` 转为稳定 TypeScript 类型。
- 模拟器未就绪、EFB bridge 未加载、外部地理服务不可用时，导游必须如实说明原因，不得回退到旧数据或编造飞行信息。
- 旧 Pipecat MCP 的 15 个工具仅作为迁移能力清单和测试经验参考，不作为本应用的进程依赖、协议依赖或发布物。

## 不在此决策范围内

- 不将 `D:\code\Pipecat-AI` 的 Python MCP Server、C# HTTP bridge、FastMCP 或其全量本地地理数据打包进本应用。
- 不实现 MCP 对外服务，也不消费远程 MCP Server。
- 不实施动态 Skill、工具热切换或多 Agent handoff（Agent 交接）。
- 不定义通用的 `executeCli`、`simvarGet`、`keyEventSend` 等原始模型工具。
- 不在第一版实现自动驾驶写入、航班加载、AI 飞机创建、相机控制或 Input Event 写入。

## 相关文档

- [Spec-008：原生 MSFS CLI 导游工具接入](../specs/spec-008-native-msfs-cli-guide-tools.md)
- [ADR-006：搜索访问边界](adr-006-search-access-boundary.md)
- `D:\code\微软模拟飞行cli\docs\cli-reference.md`（原生 CLI 功能参考）
- `D:\code\Pipecat-AI\mcp\mfsf2024-mcp\ARCHITECTURE.md`（旧 MCP 能力参考）
