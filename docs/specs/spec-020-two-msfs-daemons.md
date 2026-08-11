# Spec-020：双 MSFS daemon 会话隔离方案（草案）

**日期：** 2026-08-10  
**状态：** 已确认、实现并完成验收（2026-08-11）
**优先级：** P0

## 一句话方案

使用同一份 `msfsd.exe` 程序启动两个独立 daemon 进程：

```text
msfsd.exe --role monitor  → 连接监控专用 SimConnect 会话
msfsd.exe --role ai       → AI 请求专用 SimConnect 会话
```

两个进程使用不同的 Named Pipe（命名管道），一个进程或会话失败时不拖垮另一个。

## 运行时文件与进程结构

两个 daemon 使用同一份发布文件，但以不同角色启动。应用不会复制两套 `msfs.exe`、
`msfsd.exe` 或 `SimConnect.dll`；区别只在启动参数、互斥体、Pipe 和各自持有的
SimConnect 会话。

```text
Electron 主进程
│
├─ 应用私有 MSFS 运行时目录
│  ├─ msfs.exe                 # CLI；每次请求由主进程或 Agent Worker 按需启动
│  ├─ msfsd.exe                # daemon；同一文件启动两次
│  ├─ SimConnect.dll           # 两个 daemon 各自加载同一份 DLL
│  ├─ component-manifest.json  # CLI、daemon、DLL 和 Bridge 的版本与哈希清单
│  └─ community/
│     └─ msfs-native-cli-route-bridge/
│        ├─ manifest.json
│        ├─ layout.json
│        └─ modules/msfs-route-bridge.wasm
│
├─ 启动 msfsd.exe --role monitor
│  ├─ 互斥体：msfs-native-cli-daemon-monitor-v1
│  ├─ Pipe：\\.\pipe\msfs-native-cli-monitor-v1
│  ├─ 加载 SimConnect.dll
│  └─ 持有 monitor 专用 SimConnect 会话
│
└─ 启动 msfsd.exe --role ai
   ├─ 互斥体：msfs-native-cli-daemon-ai-v1
   ├─ Pipe：\\.\pipe\msfs-native-cli-ai-v1
   ├─ 加载 SimConnect.dll
   └─ 持有 ai 专用 SimConnect 会话
```

`msfs.exe` 仍然是唯一的 CLI 入口，但不直接连接 SimConnect。连接监控调用
`monitor` Pipe；Agent 工具、EFB 和探索调用 `ai` Pipe。`community/` 下的 Bridge
不是 daemon 的子进程，它最终需要被安装到 MSFS 实际生效的
`<InstalledPackagesPath>\\Community2024\\msfs-native-cli-route-bridge`，由游戏加载。

开发态对应目录为 `dev-runtime/msfs-cli/`，安装态对应应用私有资源目录；两种目录都
应包含同样的 `msfs.exe`、`msfsd.exe`、`SimConnect.dll` 和 Bridge 发布结构。

### `msfs.exe` 的请求生命周期与卡住边界

`msfs.exe` 是一次性 CLI 入口，不是常驻服务。普通请求的路径是：启动 `msfs.exe`，
把请求转发到对应角色的 Pipe，读取 JSON 结果并退出；真正常驻的是两个
`msfsd.exe`。因此，`msfs.exe` 退出而 `msfsd.exe` 继续运行是正常现象，不是进程泄漏。

普通请求有多层时间边界：

- 桌面端默认给单次 CLI 尝试 15 秒；超时后主动结束 `msfs.exe`，返回
  `MSFS_CLI_TIMEOUT`，不会让请求无限等待。
- 对 CLI 不可用或超时，客户端最多再等待 1 秒后重试一次；两次都达到上限时，
  用户看到的总时间约为 31 秒，另加请求进入客户端并发队列的等待时间。
- Named Pipe 忙碌等待最多 10 秒；单次 SimConnect 读取等待约 3 秒。

`simvar watch`、`route watch` 属于持续订阅命令，会在收到 `stop` 或 Worker 退出前保持
运行；这是有意设计的长连接，不能按普通请求判断为卡住。除这类 `watch` 外，普通
`msfs.exe` 请求必须在成功、明确错误或超时后退出。

## 背景

当前只有一个 `msfsd.exe` 和一个 SimConnect 会话。连接监控、AI 工具、EFB 航路和探索
功能共享同一条原生执行路径。Pipe 等待修复可以避免“暂时繁忙”被误判为断开，但不能
消除单个 daemon 进程成为共同故障点的问题。

本方案只解决进程和 SimConnect 会话的隔离，不扩展为新的网关、第三条会话或多用户架构。

## 架构决定

### 1. 两个 daemon 进程

两个进程来自同一份原生代码和同一个发布物，只通过角色参数区分职责：

| 角色 | 负责内容 | Pipe |
| --- | --- | --- |
| `monitor` | `status`、`system.state --name AircraftLoaded`、连接状态探测和探索所需的只读 MSFS 数据 | `msfs-native-cli-monitor-v1` |
| `ai` | 普通 AI 飞行数据和 EFB 航路 | `msfs-native-cli-ai-v1` |

每个 daemon 只创建一个 `SimConnectClient`。两个 daemon 不共享 SimConnect 句柄、请求
状态、超时状态或进程内锁。

### 2. AI、EFB 和探索仍属于 AI daemon

不新增 EFB daemon，也不新增探索 daemon：

- 普通 AI 飞行数据走 `ai` daemon；
- EFB 航路属于 AI 请求的一种，也走 `ai` daemon；
- 探索读取 MSFS 数据时改走 `monitor` daemon，避免用户对话中的 AI 请求与探索请求互相排队；
- 探索的网页查询不占用 SimConnect 会话。

EFB 超时只返回 EFB 自身的错误，并释放本次请求。后续飞行快照、天气和其他 AI 请求
仍必须可以继续执行。探索读取属于只读、可降级的上下文请求；探索请求失败或超时不能把
`monitor` daemon 标记为“游戏未连接”，也不能影响连接监控的下一轮探测。

### 3. 保持现有业务协议

保持现有 CLI 命令格式、JSON/NDJSON 响应格式和高层工具名称不变。只增加内部的 daemon
角色与 Pipe 选择，不把两个 daemon 的细节暴露给模型或普通用户。

## 进程生命周期

1. Electron 主进程启动 `monitor` daemon 和 `ai` daemon。
2. 两个 daemon 分别完成自己的 SimConnect 连接。
3. 连接监控只调用 `monitor` Pipe。
4. Agent 工具和 EFB 只调用 `ai` Pipe；探索上下文调用 `monitor` Pipe。
5. 应用退出时分别停止两个 daemon，并确认没有残留进程。
6. 某个 daemon 启动失败时，另一个 daemon 不应被自动判定为失败；诊断中分别记录角色和状态。

两个 daemon 必须使用不同的互斥体名称、Pipe 名称和进程诊断标识，不能因为现有单 daemon
互斥体而阻止第二个角色启动。

## 故障行为

| 故障 | 监控 daemon | AI daemon | 对用户的结果 |
| --- | --- | --- | --- |
| EFB 超时 | 不受影响 | 继续处理后续请求 | 仅提示 EFB 暂时不可用 |
| AI 请求失败 | 不受影响 | 返回当前请求错误 | 连接状态仍由监控 daemon 判断 |
| 探索请求失败或超时 | 继续下一轮连接探测 | 不受影响 | 探索内容降级，不显示为游戏断开 |
| 监控 daemon 失败 | 暂时无法刷新连接状态 | 仍可尝试 AI 请求 | 不把监控失败直接当作 AI 失败 |
| AI daemon 退出 | 继续检测连接 | AI 工具暂时不可用 | 允许单独重启 AI daemon |
| MSFS 真正退出 | 两者都无法读取有效数据 | 两者都无法读取有效数据 | 显示游戏未连接 |
| 两个 daemon 都退出 | 均不可用 | 均不可用 | 应用显示可重试的脱敏错误 |

## 必要实施范围

- 原生 daemon 支持 `monitor` 和 `ai` 两种角色；保持一份实现代码。
- 原生 Pipe 支持按角色使用不同名称，并保留 Spec-019 的等待截止时间修复。
- 原生 daemon 的单例互斥体改为角色级互斥体。
- CLI 客户端增加内部 endpoint（端点）选择，但不改变业务命令和响应协议。
- Electron 主进程负责启动、停止和重启两个 daemon。
- 连接监控和探索上下文固定连接 `monitor` endpoint；Agent 工具和 EFB 固定连接 `ai` endpoint。
- EFB 超时后，`ai` daemon 必须能处理下一次普通 AI 请求。
- 探索请求不能阻止 `monitor` daemon 的下一轮健康探测，且失败时不改变连接状态。
- 增加最小的双 daemon 集成测试和真实 MSFS 回归测试。

## 不包含

- 不启动第三个 daemon 或单独的 EFB daemon。
- 不引入 Gateway、优先级调度系统或新的公共服务层。
- 不改变 MSFS 写操作边界。
- 不改变 AI 工具、EFB 工具和探索功能的业务协议。
- 不在本方案中改造前端 UI、搜索 Provider 或 LiveKit 会话。

## 验收标准

- [x] 应用可以同时启动 `monitor` 和 `ai` 两个 daemon，且没有互斥体或 Pipe 冲突。
- [x] 连接监控、探索和 AI 请求可以同时执行，互不因 Pipe 忙碌而误报对方失败。
- [x] 用户进行 AI 对话时启动探索，普通 AI 请求不会因为探索而长时间排队。
- [x] 探索请求失败或超时后，监控仍能继续探测，AI 对话仍能继续。
- [x] EFB 超时后，下一次普通飞行数据请求仍能在限定时间内完成。
- [x] 停止或重启 AI daemon 时，监控 daemon 仍能正常检测 MSFS。
- [x] 停止或重启监控 daemon 时，AI daemon 不被自动关闭。
- [x] 真实退出 MSFS 时，两个 daemon 都返回真实的不可用结果，前端显示未连接。
- [x] 应用退出后没有残留 `msfsd.exe`、CLI 进程或占用的 Pipe。
- [x] 开发态和安装态各完成一次真实 MSFS 2024 回归。

## 与现有规格的关系

本方案扩展并替代 `Spec-019` 中“一个 daemon、一个 SimConnect 会话”的拓扑决定。
Spec-019 中关于 Pipe 等待、现有 CLI 协议和错误响应的要求继续保留。

本方案已完成验收；后续 MSFS 运行时改动继续沿用本方案和 `Spec-019` 的已验证边界。
