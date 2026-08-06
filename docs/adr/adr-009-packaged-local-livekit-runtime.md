# ADR-009：将 LiveKit 作为应用私有本地运行时随桌面端分发

**日期：** 2026-07-25
**状态：** 已接受并实施；Windows x64 候选安装包已通过安装态运行时校验

## 背景

项目早期曾以 Docker 启动本机 LiveKit Server，再由 Electron 主进程启动 Agent Worker。用户已明确选择本机官方 Windows Server 二进制作为唯一的开发与发行路径；Docker 不再是本项目的开发、测试或安装前置条件。

产品仍以单个 Windows 模拟飞行用户为目标。MSFS CLI、`msfsd.exe`、SimConnect 与 EFB route bridge 都必须在用户本机访问；第一版也不引入账号、云端 Token 服务或云端 Agent。用户要求 LiveKit 房间、Agent 和模拟器数据读取均以本地方式运行。

LiveKit 官方的[本地运行文档](https://docs.livekit.io/transport/self-hosting/local/)提供 Windows Server 二进制，并将 `livekit-server --dev` 明确定位为开发模式。官方的[自托管部署文档](https://docs.livekit.io/transport/self-hosting/deployment/)要求生产运行通过配置文件管理服务配置；其公网 TLS、域名、TURN 与 Redis 章节不适用于仅绑定回环地址的单机应用。

## 决策

正式 Windows 安装包将携带经版本和完整性校验的 `livekit-server.exe`，由 Electron 主进程以**应用私有子进程**管理。它不是 Docker 容器，不注册 Windows 服务，不加入系统 PATH，也不要求用户手动配置。

```text
Electron Main Process
        ↓ 启动、探活、停止
livekit-server.exe（127.0.0.1，仅本机）
        ↕ 本机 LiveKit Room
Electron Renderer  ↔  Agent Utility Process
                            ↓
                 MSFS CLI / msfsd.exe / SimConnect
```

本地运行时遵循以下约束：

- 安装包生成或携带显式的 LiveKit 配置文件；不得在发行版使用 `--dev`、`devkey` 或 `secret`。
- 开发态从受 Git 忽略的 `resources/livekit/livekit-server.exe` 启动官方二进制；Electron 默认与安装态一样生成私有回环配置并自动管理，仅保留 `pnpm livekit:dev` 作为显式手工调试入口。
- 每个应用数据目录首次初始化时生成独立的 LiveKit API Key 和 API Secret。主进程可使用 Secret 签发短期参与者 Token；Renderer 永远不能读取 Secret。
- Server 仅监听 `127.0.0.1`。不得使用 `0.0.0.0`、局域网发现、公网端口映射或远程参与者。
- 主进程先启动 Server，再执行本地健康检查；仅在 Server 可用后启动现有 Agent Utility Process 并签发 Room Token。
- Agent Worker 仍由 LiveKit 的显式 Agent dispatch 加入每次唯一的 Room；不采用官方标注为原型用途的自动 dispatch。见 [Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/)。
- 退出应用、更新、重启或启动失败时，主进程负责终止其拥有的 Server 与 Agent 子进程，不留下常驻后台服务。
- MSFS CLI 继续遵循 ADR-008，是唯一的模拟器读取边界；本 ADR 不改变其只读工具集合和 Community Package 规则。

本地 LiveKit API Secret 用于隔离 Electron Renderer 与可信主进程，不应被解释为抵御该 Windows 账户所有者的安全边界。第三方模型与搜索 Provider 的密钥仍不得进入 Renderer 或安装包源码；第一版发行的用户密钥配置与 OS 凭据存储方式另立实现任务。

## 原因

- 用户安装后不需要 Docker、命令行、端口配置或额外服务管理；开发者也只需启动同一官方 Windows Server 二进制。
- 保持现有 LiveKit Room、官方 React Session、Agent dispatch、打断与文字消息架构，不重写实时媒体管线。
- 本机 Agent 可继续直接使用受控的 MSFS CLI，而无需将飞行数据暴露为公网服务。
- 应用私有子进程的生命周期与桌面窗口一致，比 Windows 常驻服务更符合单用户、按需使用的产品边界。
- 官方 Agent Server 生命周期支持由服务端管理 Agent 的可用性与单 Job 隔离；本项目保留该运行模型，但只在本机单用户场景使用。见 [Server lifecycle](https://docs.livekit.io/agents/server/lifecycle/)。

## 影响

- 新增本地运行时管理模块，负责路径解析、配置生成、端口冲突处理、子进程启动、日志脱敏、探活、退出与异常清理。
- 安装包需要为 `livekit-server.exe`、其许可证和版本清单增加与 MSFS CLI 类似的暂存与完整性检查流程。
- 启动诊断需要区分“本地 Server 未能启动”“端口不可用”“Agent Worker 未注册”和“模型 Provider 未配置”，并保持现有脱敏错误约定。
- 开发态与发行态均使用本地 Windows Server 二进制，并默认由应用以私有配置自动启动和停止；只有显式调试命令使用 `--dev`。二者的选择逻辑、配置 Schema 和测试矩阵由 Spec-011 定义。
- 本地运行时不使 DeepSeek、豆包 STT/TTS 或网页搜索离线化；这些 Provider 仍按各自的网络与隐私条款工作。完全离线 AI 是单独的产品路线。

## 不在此决策范围内

- 不部署 LiveKit Cloud、云端 Agent、账号体系、云端 Token endpoint 或跨设备房间。
- 不把 LiveKit Server 实现为 Docker Desktop、Windows 服务、开机自启守护进程、系统共享服务或远程 LiveKit 服务。
- 不把 LLM、STT、TTS 切换为本地模型，也不在本 ADR 中选择用户密钥的付费、登录或安全存储方案。
- 不放宽来源网页、MSFS CLI 或 Electron Renderer 的既有安全边界。

## 相关文档

- [Spec-011：桌面安装包的本地 LiveKit 运行时](../specs/spec-011-packaged-local-livekit-runtime.md)
- [本地运行时架构](../architecture/local-livekit-runtime.md)
- [ADR-001：以 LiveKit Agents 作为实时语音边界](adr-001-livekit-agent-boundary.md)
- [ADR-003：Zod 边界校验与密钥管理](adr-003-zod-config-and-secrets.md)
- [ADR-008：原生 MSFS CLI 作为导游 Agent 的唯一模拟器边界](adr-008-native-msfs-cli-agent-boundary.md)
