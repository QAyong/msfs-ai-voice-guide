# Spec-011：桌面安装包的本地 LiveKit 运行时

**日期：** 2026-07-25
**状态：** 开发态与 Windows x64 安装态已实现；本机安装验证通过，其他干净 Windows 机器验收待完成

## 1. 目标

Windows 最终用户安装桌面应用后，直接打开应用即可开始本地语音和文字导游；不得要求安装 Docker、Node.js、pnpm、LiveKit CLI、Windows 服务或手动执行命令。开发、测试和发行路径统一不使用 Docker。

“本地”在本规格中指 LiveKit Server、Agent Worker、MSFS CLI 与模拟器读取均在用户电脑运行。DeepSeek、豆包 STT/TTS 与网页搜索仍是可选的网络 Provider；本规格不将它们变为离线模型。

## 2. 官方依据

- [Running LiveKit locally](https://docs.livekit.io/transport/self-hosting/local/)：Windows 可使用 LiveKit Server 二进制；`--dev` 与固定开发凭据只用于本地开发。
- [Deploying LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/)：Server 可通过 `--config` 读取配置；公网部署才需要域名、受信任 TLS、TURN 等网络设施。
- [Endpoint token generation](https://docs.livekit.io/frontends/build/authentication/endpoint/)：参与者 Token 必须由可信端签发；客户端不应持有签发 Secret。第一版由 Electron 主进程承担同机可信端角色。
- [Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/)：显式 dispatch 是官方推荐模式；自动 dispatch 不适合多数应用。
- [Server lifecycle](https://docs.livekit.io/agents/server/lifecycle/)：Agent Server 注册、接收 Job 和会话结束具有明确生命周期。

实现前必须重新核验以上官方文档、所选 Server 版本的发布说明和本地 Node.js 类型定义；本规格不以网页示例替代版本化验证。

### 开发约定

开发者从官方 Windows 发布物取得经版本、哈希和许可证核验的 `livekit-server.exe`，放入受 Git 忽略的 `resources/livekit/`。开发态桌面应用默认自动启动并管理本机服务；只有在 `.env` 中明确设置 `MSFS_AUTO_START_LIVEKIT=false` 时才连接外部或手动启动的 LiveKit。自动启动路径使用动态回环端口和运行时生成的凭据，不使用固定的 `devkey` / `secret`。

`--dev` 只允许用于开发和测试，且只绑定回环地址；安装态必须按本规格生成私有配置和独立凭据。不得以 Docker、全局 LiveKit 安装或远程 LiveKit 服务替代该开发约定。

## 3. 运行时组成

```text
安装包资源目录
  livekit/
    livekit-server.exe
    LICENSES/...
    manifest.json
  msfs/
    msfs.exe、msfsd.exe、运行时文件

应用用户数据目录
  runtime/
    livekit.yaml
    runtime-state.json
    logs/

Electron Main Process
  ├─ LocalLiveKitRuntime：管理 Server
  ├─ AgentRuntime：管理 Utility Process
  └─ Session Token：签发最小权限、短期 Room Token
```

`livekit.yaml` 是运行时生成的私有配置，不提交 Git、不写入安装目录，也不包含 Provider 密钥。配置必须使 Server 仅监听 `127.0.0.1`；具体端口由运行时选择并记录到受校验状态中。若默认端口被占用，运行时应在受限候选范围内选择可用端口，而不是失败后改为对外绑定。

## 4. 启动与退出

1. 主进程确认发行资源存在、版本符合支持清单、文件哈希正确且当前平台架构匹配。
2. 主进程读取或首次初始化本地运行时配置，生成独立 API Key、API Secret 和回环 Server 地址。
3. 主进程以隐藏的子进程启动 `livekit-server.exe --config <generated-config>`，收集 stdout/stderr 到脱敏日志。
4. 主进程在有限时间内对本地地址进行健康检查；失败时停止子进程并显示可操作的本地诊断。
5. Server 就绪后启动既有 Agent Utility Process，并将**本地运行时连接配置**以受控方式传给 Worker。
6. Worker 注册完成后，主进程使用 API Secret 签发 15 分钟的单 Room、单用户、发布/订阅/数据权限 Token，并以现有白名单 IPC 交给 Renderer。
7. Renderer 使用官方 LiveKit SDK 加入唯一 Room；Token 中携带该 Room 的显式 Agent dispatch。
8. 应用退出、窗口崩溃恢复、升级或任一启动阶段失败时，主进程终止自己启动的 Worker 与 Server，并等待有限时间后确认退出。

首次启动、Server 启动、Worker 注册与 Room 连接各自需要独立超时与诊断码；不得把错误合并为“服务不可用”。

## 5. 配置、密钥与隐私

- 发行态不得要求或读取开发者的 `.env`；`.env` 仅保留开发态。
- LiveKit 本地 API Key/Secret 每个应用用户数据目录独立生成，永不进入 Renderer、日志、崩溃报告或分析事件。
- 主进程和 Agent Worker 只在运行期间获得必要配置；远程网页 `WebContentsView` 永远不能获得本地运行时配置。
- DeepSeek、豆包及搜索 Provider 的密钥不能随安装包硬编码或共享。用户在可信设置 Utility Window 中录入，主进程使用 Windows `safeStorage` 加密保存；默认遮罩，只有用户点击眼睛才显示真实值。主助手和远程网页不得读取这些凭据。
- MSFS 数据只在本机 CLI 边界内读取。模型 Provider 实际收到哪些工具结果仍由 Agent 工具调用和 Provider 协议决定，产品设置与隐私声明必须如实说明。

## 6. 故障处理

| 情形                                       | 应用行为                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Server 资源缺失、签名/哈希不符或架构不匹配 | 不启动子进程；显示“本地实时组件损坏”，提供修复/重装建议。              |
| 端口已占用                                 | 仅在本地候选端口中重试；全部失败则提示关闭冲突应用后重试。             |
| Server 在健康检查前退出                    | 清理子进程和临时状态；显示脱敏退出码与本地日志位置。                   |
| Worker 未注册或异常退出                    | 停止本次会话；保留 Server 供一次受控重试，不向 Renderer 暴露环境变量。 |
| Renderer Room 断连                         | 使用官方 SDK 重连；连续失败时结束本次会话并提供“重新连接”。            |
| MSFS 或 route bridge 不可用                | 保持文字、语音和搜索可用；沿用 Spec-008 的结构化不可用结果。           |

不得因为本地 LiveKit 故障而静默改连公网 LiveKit、公开监听端口或绕过 Token/Agent dispatch 约束。

## 7. 发布与升级

- 构建流程必须从明确版本的 LiveKit Server 发布物暂存，不得依赖开发者全局安装、Docker 镜像或远程服务。
- 资源清单至少记录 Server 版本、Windows 架构、上游发布来源、SHA-256、许可证文件与构建时间。
- 安装器升级时先停止当前应用私有子进程，再替换运行时二进制；不得覆盖用户的 MSFS Community Package 以外的目录。
- 不注册系统 PATH、Windows 服务、计划任务或开机启动项。
- 卸载只删除安装器拥有的二进制；应用数据中是否保留 Provider 配置或诊断日志必须经用户确认。

## 8. 验收标准

- [ ] 在无 Docker、无 Node.js、无 pnpm、无全局 LiveKit 安装的干净 Windows 用户环境中，可从安装包启动并完成文字与语音 Room 连接。
- [ ] 发行态不调用 `livekit-server --dev`，不使用 `devkey` / `secret`，并且每个新应用数据目录获得不同的 LiveKit 凭据。
- [ ] Server 只监听 `127.0.0.1`；局域网和公网地址不能加入本地 Room。
- [ ] 任何 Renderer 都无法读取 LiveKit API Secret；只有可信设置 Utility Window 能通过白名单 IPC 读取 Provider 凭据，主助手、来源网页、日志和诊断包均无法读取。
- [ ] 主进程只在 Server 健康检查和 Worker 注册成功后签发短期 Token；每次会话的 Room、用户 identity 和 Agent dispatch 均唯一。
- [ ] 正常关闭、崩溃恢复与升级均不会留下 `livekit-server.exe`、Agent Worker 或孤立监听端口。
- [ ] 端口占用、资源损坏、Server 退出、Worker 未注册、Room 断连均显示脱敏且可重试的诊断。
- [ ] 现有按住说话、连续对话、文字消息、打断、来源浏览和 7 个只读 MSFS 工具的自动回归测试继续通过。
- [ ] 在运行中的 MSFS 2024 内完成一次真实语音和文字端到端冒烟；模拟器未就绪时不编造数据。

## 9. 非目标

- 不实现 LiveKit Cloud、云端 Agent、用户账号、订阅、跨设备同步或公网多人房间。
- 不实现完全离线 LLM、STT、TTS 或网页搜索。
- 不实现 Windows 常驻服务、Docker Desktop 自动安装、Docker 开发流程、用户手动运行 LiveKit CLI 或远程 LiveKit 服务。
- 不改变 MSFS CLI 的只读范围、EFB route bridge 安装边界或来源网页隔离策略。

## 10. 相关文档

- [ADR-009：应用私有本地 LiveKit 运行时](../adr/adr-009-packaged-local-livekit-runtime.md)
- [本地运行时架构](../architecture/local-livekit-runtime.md)
- [Spec-006：桌面真实语音闭环与启动诊断](spec-006-desktop-live-voice-and-readiness.md)
- [Spec-008：原生 MSFS CLI 导游工具接入](spec-008-native-msfs-cli-guide-tools.md)
