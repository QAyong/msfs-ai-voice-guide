# MSFS CLI 发布物集成

**最后更新：** 2026-07-25
**状态：** 当前发布约定；Electron 安装包实现待完成

## 目的

`D:\code\微软模拟飞行cli` 是本项目的独立原生依赖。它提供 Windows CLI、守护进程和读取 EFB 航路所需的 Community Package。本项目消费其已经构建并验证的发布物；不在运行时调用其源码，也不将两个仓库合并为 pnpm workspace。

pnpm workspace 只管理本仓库的 Node.js 依赖，不能替代 CLI 所需的 CMake、MSFS SDK、WASM 官方工具链和 Community Package 安装流程。

## 依赖边界

```text
微软模拟飞行cli（独立构建、测试和发布）
        ↓ 已验证发布物
AI 导游助手（暂存、校验、Electron 打包和安装）
        ↓
最终用户的 Windows 应用与 MSFS 2024 Community2024
```

CLI 仓库负责：

- 构建、测试并发布 `msfs.exe`、`msfsd.exe` 和其必要运行时文件。
- 构建 `msfs-native-cli-route-bridge` Community Package。
- 保证 CLI、daemon 与 bridge 的协议主版本兼容。
- 在将 `SimConnect.dll` 纳入可分发发布物前完成 Microsoft SDK 许可审核。

本仓库负责：

- 在 `src/msfs/` 中以受控进程接口调用 CLI；不得依赖 CLI 源码或自行建立 SimConnect 连接。
- 将一个已验证的 CLI 发布物暂存为 Electron 资源，并在安装态从应用资源目录解析 `msfs.exe`。
- 在正式安装器中携带 bridge Community Package，并只安装或更新自己的 `Community2024\msfs-native-cli-route-bridge` 目录。
- 在打包前校验 CLI 发布物的版本、协议兼容性和文件完整性；不允许依赖开发机上的绝对路径。

## 开发态与发布态

| 场景                     | CLI 来源                                      | 允许的配置                                                             | 约束                                                                   |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 本地开发与调试           | 本机 CLI 构建目录                             | `MSFS_CLI_PATH` 可指向本机 `msfs.exe`                                  | 可使用本机路径，不得写入提交的配置或发布脚本。                         |
| 本地 Electron 构建       | 已验证的 CLI 发行目录或相邻 CLI 项目 `build/` | `MSFS_CLI_DISTRIBUTION_DIR` 优先；未设置时暂存脚本可使用开发用相邻目录 | 相邻目录回退仅是开发便利，不构成发布输入。                             |
| CI / 候选发布 / 正式发布 | 明确提供的、已验证的 CLI 发布目录             | 必须设置 `MSFS_CLI_DISTRIBUTION_DIR`                                   | 不得依赖 `D:\code\微软模拟飞行cli`、开发机 SDK 或未版本化的 `build/`。 |

现有 `scripts/stage-msfs-cli.mjs` 负责将 CLI 运行时文件暂存到 `resources/msfs/` 与构建输出目录。它只解决 CLI/daemon 的资源复制；正式安装器还必须处理 Community Package 的携带、目标目录发现、升级与卸载。

## 发布物契约

CLI 项目应提供一个完整、可复制的发布目录，建议结构如下：

```text
release/
  release.json
  cli/
    msfs.exe
    msfsd.exe
    SimConnect.dll                 # 仅在许可确认后包含
  community/
    msfs-native-cli-route-bridge/
      manifest.json
      layout.json
      modules/
        msfs-route-bridge.wasm
```

`release.json` 至少应包含：

- CLI、daemon、bridge 和协议版本；
- 每个随包文件的 SHA-256；
- 构建平台与架构；
- `SimConnect.dll` 是否包含，以及再分发许可审核状态。

打包前，本项目应拒绝缺少必需文件、哈希不匹配或协议主版本不兼容的发布物。版本不匹配不能仅依靠目录名或开发者口头约定。

## 安装、升级与卸载

正式 Electron 安装包应将 CLI 文件作为应用私有资源，不注册全局 PATH，也不要求用户安装 CMake、Visual Studio 或 MSFS SDK。`msfsd.exe` 仍由 `msfs.exe` 按需拉起，不注册 Windows 服务。

EFB 航路功能还依赖 Community Package。安装器或首次启动引导应读取 MSFS 2024 的 `UserCfg.opt`，解析 `InstalledPackagesPath`，并只在其下的 `Community2024` 中创建、替换或删除 `msfs-native-cli-route-bridge`。自动发现失败时应请求用户选择 `UserCfg.opt`，而不是允许任意目录写入。

升级 bridge 前应验证 `manifest.json`、`layout.json` 与文件哈希；MSFS 正在运行时必须提示用户重启游戏。卸载只能删除本应用安装的 CLI 资源、自己的 Community Package 目录及其专属缓存，不能扫描或删除其他 Community Package。

## 当前范围

- 本约定不要求建立 monorepo、Git submodule 或 pnpm workspace。
- 若将来两个仓库需要同一提交、同一版本、同一 CI 流水线发布，可另行评估顶层发布仓库或 Git submodule；届时仍以 CLI 发布物契约作为桌面端集成边界。
- 本文不替代 CLI 仓库中的 SDK 许可、签名和 Community Package 分发规则；其具体要求以 CLI 仓库的 `docs/distribution.md` 为准。

## 相关文档

- [ADR-008：原生 MSFS CLI 作为导游 Agent 边界](../adr/adr-008-native-msfs-cli-agent-boundary.md)
- [Spec-008：原生 MSFS CLI 导游工具接入](../specs/spec-008-native-msfs-cli-guide-tools.md)
- [架构概览](overview.md)
