# MSFS CLI 发布物集成

**最后更新：** 2026-08-07
**状态：** V2 x64 候选打包链路、CLI 快照清单、安装态依赖/子进程/daemon 校验和开发/应用 Bridge 隔离已实现；代码签名与自动更新未实现

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
- 当前候选包为了本机运行验证携带 SDK 中的原生 `SimConnect.dll`；正式公开分发前，CLI 仓库仍须依据当前 SDK EULA 或微软书面说明确认该具体二进制属于可再分发代码，并记录来源、版本、哈希和许可结论。

本仓库负责：

- 在 `src/msfs/` 中以受控进程接口调用 CLI；不得依赖 CLI 源码或自行建立 SimConnect 连接。
- 将一个已验证的 CLI 发布物暂存为 Electron 资源，并在安装态从应用资源目录解析 `msfs.exe`。
- 在正式安装器中携带 bridge Community Package，并自动安装或更新自己的 `Community2024\msfs-native-cli-route-bridge` 目录；开发机额外隔离开发版本和应用版本。
- 在打包前校验 CLI 发布物的版本、协议兼容性和文件完整性；不允许依赖开发机上的绝对路径。
- 作为同一桌面安装包的一部分，另按 [Spec-011](../specs/spec-011-packaged-local-livekit-runtime.md) 管理应用私有 LiveKit Server；它不属于 MSFS CLI 发布物，也不复用 CLI 的版本或安装目录。

## 开发态与发布态

| 场景                     | CLI 来源                                      | 允许的配置                                                             | 约束                                                                   |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 本地开发与调试           | 本机 CLI 构建目录                             | `MSFS_CLI_PATH` 可指向本机 `msfs.exe`                                  | 可使用本机路径，不得写入提交的配置或发布脚本。                         |
| 本地 Electron 构建       | 已验证的 CLI 发行目录或相邻 CLI 项目 `build/` | `MSFS_CLI_DISTRIBUTION_DIR` 优先；未设置时暂存脚本可使用开发用相邻目录 | 相邻目录回退仅是开发便利，不构成发布输入。                             |
| CI / 候选发布 / 正式发布 | 明确提供的、已验证的 CLI 发布目录             | 必须设置 `MSFS_CLI_DISTRIBUTION_DIR`                                   | 不得依赖 `D:\code\微软模拟飞行cli`、开发机 SDK 或未版本化的 `build/`。 |

`scripts/stage-msfs-cli.mjs` 把同一快照中的 CLI、daemon、SimConnect DLL 和 Community Package 暂存到 `out/msfs/`，并生成记录文件大小、SHA-256、Bridge 版本和协议主版本的 `component-manifest.json`。它不直接向用户的 MSFS 目录安装文件；打包后的应用首次启动时，会读取 `UserCfg.opt` 并自动处理 Community Package 的目标目录发现、安装和升级。

### 桌面端连接状态与配置检测

桌面主进程通过受控 CLI 调用提供两类状态：

- 聊天标题栏状态：每 5 秒探测 `status` 与 `system state --name AircraftLoaded`，只显示“游戏已连接/未连接”两种结果；所有 MSFS 工具关闭时隐藏。
- 设置页检测：只读检查 CLI 运行文件、SimConnect、`UserCfg.opt`、`Community2024\msfs-native-cli-route-bridge` 的 `manifest.json`/`layout.json`/WASM，以及已连接游戏中的 `route get --source efb`。

设置页不提供 CLI 路径选择，不执行安装、复制、删除或修改游戏配置。Bridge 是否已安装必须以用户实际 `InstalledPackagesPath\Community2024` 目录为准，应用资源目录仅作为随包发布输入。

### 开发专属 CLI 快照

为避免开发中的 CLI 修改直接混入发布输入，桌面端开发使用项目根目录下的 `dev-runtime/msfs-cli/`。该目录被 `.gitignore` 忽略，由 `pnpm msfs:stage:dev` 从当前开发用 CLI 构建目录更新，结构包含 `msfs.exe`、`msfsd.exe`、`SimConnect.dll` 和 bridge。`pnpm desktop:dev` 会自动刷新开发快照，并把开发版 bridge 设为当前 MSFS 启用版本。

在开发机的 `Community2024` 下，应用会维护 `_晓晓飞行导游版本库\开发版本` 和 `_晓晓飞行导游版本库\应用版本` 两份 bridge；MSFS 根目录只保留当前启用的 `msfs-native-cli-route-bridge`。可使用 `pnpm msfs:use:dev` 与 `pnpm msfs:use:app` 切换，避免两个同身份 package 同时被加载。

`pnpm desktop:package` 会先刷新开发快照，再以严格模式复制到 `out/msfs/` 并校验组件清单，因此安装包只固定包含打包当时的 CLI 版本。开发机安装候选包时，应用更新“应用版本”并启用它；普通用户没有版本库时，应用直接更新其标准 `Community2024\msfs-native-cli-route-bridge`。之后继续修改 CLI 不会改变已经发给其他用户的安装包；只有重新打包并发布新版本才会更新用户侧文件。

### 安装、应用测试与回退操作

开发机安装候选 EXE 后，应用会识别 `Community2024\_晓晓飞行导游版本库`：

- 将安装包内的 bridge 写入 `_晓晓飞行导游版本库\应用版本\msfs-native-cli-route-bridge`；
- 将“应用版本”同步到 `Community2024\msfs-native-cli-route-bridge`，使它成为当前唯一生效版本；
- 不修改 `_晓晓飞行导游版本库\开发版本\msfs-native-cli-route-bridge`。

普通用户没有这个版本库时，应用直接更新 `Community2024\msfs-native-cli-route-bridge`。只有目标内容的文件或哈希发生变化时才替换；替换本应用自己以前安装的目录前会先备份，遇到陌生目录、符号链接或目录冲突会停止，不覆盖其他 Community Package。

切换或回退版本时，必须执行以下动作：

1. 先完全退出 MSFS 2024；建议同时退出桌面应用，避免切换过程中仍有进程读取旧文件。
2. 在本项目根目录执行对应命令：

   ```powershell
   # 回退到开发版本，并让开发版本成为当前生效版本
   pnpm msfs:use:dev

   # 切回应用版本，并让应用版本成为当前生效版本
   pnpm msfs:use:app
   ```

3. 切换完成后再启动 MSFS 2024。

`pnpm desktop:dev` 已经包含“刷新开发 CLI + 切换到开发版本”，日常开发直接执行它即可。`pnpm msfs:use:app` 需要先安装并启动过一次候选应用，使“应用版本”已经创建。若要回退到更早的应用包，需要重新运行对应的旧 EXE；当前版本库只维护“开发版本”和“当前应用版本”，不会自动保存所有历史应用版本。

### Electron 开发态资源路径注意事项

Electron 的 `process.resourcesPath` 在开发态通常指向 Electron 自身的运行时资源目录，不等于本项目的 `resources/`。因此 Agent Worker 不得在开发态无条件把它拼成 `process.resourcesPath/msfs/msfs.exe`。

当前路径规则如下：

1. 用户显式配置的 `MSFS_CLI_PATH` 优先。
2. 安装态只有在 `process.resourcesPath/msfs/msfs.exe` 实际存在时才使用该路径。
3. 开发态优先使用项目工作目录下的 `dev-runtime/msfs-cli/msfs.exe`；该文件不存在时回退到 `resources/msfs/msfs.exe`。

这条规则必须在 `desktop:dev` 和正式打包后的 Worker 中保持一致。命令行冒烟测试能找到 CLI，不代表 Electron Worker 已找到同一个 CLI 文件；两条路径都必须单独验证。

开发构建前建议执行：

```powershell
pnpm desktop:dev
pnpm msfs:smoke
```

候选构建默认启用严格校验；手动构建时也可以显式启用：

```powershell
$env:MSFS_CLI_REQUIRE_COMMUNITY_PACKAGE = 'true'
pnpm build
```

严格构建必须在 `out/msfs/` 中同时包含 `msfs.exe`、`msfsd.exe`、`SimConnect.dll`、`component-manifest.json` 和完整的 `community/msfs-native-cli-route-bridge/`。清单中的哈希与任意文件不一致都会终止打包。

正式构建必须通过 `MSFS_CLI_DISTRIBUTION_DIR` 提供已验证的 CLI 发布目录，并由打包脚本校验必需文件；不能把本机 `D:\code\微软模拟飞行cli` 或未版本化的相邻 `build/` 作为发布输入。

## 发布物契约

CLI 项目应提供一个完整、可复制的发布目录，建议结构如下：

```text
release/
  release.json
  cli/
    msfs.exe
    msfsd.exe
    SimConnect.dll                 # 候选包当前包含；正式公开分发前需完成许可确认
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
- `SimConnect.dll` 是否包含，以及再分发许可审核状态（当前状态：候选包包含，公开分发许可待确认）。

打包前，本项目应拒绝缺少必需文件、哈希不匹配或协议主版本不兼容的发布物。版本不匹配不能仅依靠目录名或开发者口头约定。

[MSFS 2024 SDK EULA](https://docs.flightsimulator.com/msfs2024/flighting/html/1_Introduction/SDK_EULA.htm)允许分发被明确界定为 distributable code 的部分，但公开页面没有逐项列出原生 `SimConnect.dll`。SDK 目录中存在 DLL 或安装器只能证明技术来源，不能单独替代许可结论；取得明确依据前不得在文档中写成“已确认可公开分发”。

## 安装、升级与卸载

正式 Electron 安装包应将 CLI 文件作为应用私有资源，不注册全局 PATH，也不要求用户安装 CMake、Visual Studio 或 MSFS SDK。`msfsd.exe` 仍由 `msfs.exe` 按需拉起，不注册 Windows 服务。桌面应用退出时会自动发送 `msfs daemon stop --json` 并等待它结束，避免后台进程继续占用下一次安装或升级所需的文件。

安装器开始覆盖旧版本前也会先执行同一个停止命令；如果正在升级的旧版 CLI 还不支持该命令，安装器会使用针对本项目 `msfsd.exe` 的兼容兜底，然后再替换文件。因此首次从旧候选包升级时，不需要用户手动打开任务管理器结束进程。

EFB 航路功能还依赖 Community Package。安装器或首次启动引导应读取 MSFS 2024 的 `UserCfg.opt`，解析 `InstalledPackagesPath`，并只在其下的 `Community2024` 中创建、替换或删除 `msfs-native-cli-route-bridge`。自动发现失败时应请求用户选择 `UserCfg.opt`，而不是允许任意目录写入。

升级 bridge 前应验证 `manifest.json`、`layout.json` 与文件哈希；MSFS 正在运行时必须提示用户重启游戏。卸载只能删除本应用安装的 CLI 资源、自己的 Community Package 目录及其专属缓存，不能扫描或删除其他 Community Package。

## 当前范围

- 本约定不要求建立 monorepo、Git submodule 或 pnpm workspace。
- 若将来两个仓库需要同一提交、同一版本、同一 CI 流水线发布，可另行评估顶层发布仓库或 Git submodule；届时仍以 CLI 发布物契约作为桌面端集成边界。
- 本文不替代 CLI 仓库中的 SDK 许可、签名和 Community Package 分发规则；其具体要求以 CLI 仓库的 `docs/distribution.md` 为准。

## 相关文档

- [ADR-008：原生 MSFS CLI 作为导游 Agent 边界](../adr/adr-008-native-msfs-cli-agent-boundary.md)
- [Spec-008：原生 MSFS CLI 导游工具接入](../specs/spec-008-native-msfs-cli-guide-tools.md)
- [Spec-011：桌面安装包的本地 LiveKit 运行时](../specs/spec-011-packaged-local-livekit-runtime.md)
- [架构概览](overview.md)
