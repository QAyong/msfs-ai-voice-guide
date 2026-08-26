# MSFS CLI 发布物集成

**最后更新：** 2026-08-09
**状态：** V2 x64 候选打包链路、CLI 快照清单、安装态依赖/子进程/daemon 校验和开发/应用 Bridge 隔离已实现；候选发布已增加“官方构建输入快照 + 游戏内 EFB 验收”门禁；代码签名与自动更新未实现

## 目的

`native/msfs-cli/` 是本仓库内受统一版本控制的原生子项目。它提供 Windows CLI、守护进程和读取 EFB 航路所需的 Community Package。Electron 不在运行时调用其源码，而是携带其同一构建批次、经验证的发布物。旧独立目录仅保留为迁移备份，不再作为构建或修改来源。

pnpm workspace 只管理本仓库的 Node.js 依赖，不能替代 CLI 所需的 CMake、MSFS SDK、WASM 官方工具链和 Community Package 安装流程。

## 依赖边界

```text
native/msfs-cli（同仓库构建、测试和发布）
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
| 本地 Electron 构建       | `native/msfs-cli/build/` 或已验证的开发快照 | `MSFS_CLI_DISTRIBUTION_DIR` 优先；未设置时暂存脚本使用同仓库的本地构建 | 本地构建只用于开发调试，不构成发布输入。 |
| CI / 候选发布 / 正式发布 | 明确提供的、已验证的 CLI 发布快照             | 必须设置 `MSFS_CLI_DISTRIBUTION_DIR`；`desktop:package*` 会强制检查    | 不得回退到 `dev-runtime/`、旧备份目录、开发机 SDK 或未版本化的 `build/`。 |

`scripts/stage-msfs-cli.mjs` 把同一快照中的 CLI、daemon、SimConnect DLL 和 Community Package 暂存到 `out/msfs/`，并生成记录文件大小、SHA-256、Bridge 版本和协议主版本的 `component-manifest.json`。它不直接向用户的 MSFS 目录安装文件；打包后的应用首次启动时，会读取 `UserCfg.opt` 并自动处理 Community Package 的目标目录发现、安装和升级。

### 候选发布的构建输入门禁

`dev-runtime/msfs-cli/`、`native/msfs-cli/build/` 和上一次安装器遗留的资源都只能用于开发调试，**不能**直接作为候选或正式安装器的来源。每次候选发布必须先从同一次官方构建产物创建一个不可混用的输入快照，至少包含：

```text
release-inputs/<build-id>/
  msfs.exe
  msfsd.exe
  SimConnect.dll
  build-metadata.json
  community/msfs-native-cli-route-bridge/
    manifest.json
    layout.json
    modules/msfs-route-bridge.wasm
```

快照中的 CLI、daemon 和 bridge 必须分别来自：

1. 使用 MSFS SDK 的 SimConnect 配置构建出的原生 Release 输出；
2. VS2022 `MSFS2024` Platform Toolset 编译、再由 SDK `fspackagetool.exe` 生成的 Community Package；
3. 同一次构建后记录的 `build-metadata.json` 和 SHA-256。`manifest.json` 或目录名不能替代源码提交、源码指纹、WASM 哈希和构建来源记录。

构建完成后使用 `pnpm msfs:release:snapshot release-inputs/<build-id>` 创建快照。该命令要求 `native/msfs-cli` 工作区干净、构建清单与当前源码一致、CLI 文件齐全，并拒绝覆盖已有目录；不要手动拼装快照。

本次“开发版正常、安装版使用旧 CLI”问题的根因和防复发规则记录在 [Bug-20260826：发布快照陈旧与自动驾驶能力提示失真](../bugs/bug-20260826-msfs-release-snapshot-and-autopilot-capability-reporting.md)。发布流程或构建脚本变更后，必须同步检查这份复盘中的门禁要求。

候选打包前设置明确输入；不得依赖脚本的开发回退路径：

```powershell
$env:MSFS_CLI_DISTRIBUTION_DIR = 'D:\release-inputs\<build-id>'
# 若构建机同时安装 VS2026，node-gyp 必须固定使用已验证的 VS2022。
$env:npm_config_msvs_version = '2022'
$env:GYP_MSVS_VERSION = '2022'
pnpm desktop:package:dir
```

打包完成后，`build-metadata.json`、`out/msfs/component-manifest.json`、安装态 `resources/msfs/component-manifest.json` 和输入快照必须逐文件校验大小与 SHA-256。缺少构建来源、源码提交/指纹不匹配、未使用官方 Toolset，或三个位置任一哈希不一致，候选包不得发布。

### 桌面端连接状态与配置检测

桌面主进程通过受控 CLI 调用提供两类状态：

- 聊天标题栏状态：每 5 秒探测 `status` 与 `system state --name AircraftLoaded`，只显示“游戏已连接/未连接”两种结果；所有 MSFS 工具关闭时隐藏。
- 设置页检测：只读检查 CLI 运行文件、SimConnect、`UserCfg.opt`、`Community2024\msfs-native-cli-route-bridge` 的 `manifest.json`/`layout.json`/WASM，以及已连接游戏中的 `route get --source efb`。

设置页不提供 CLI 路径选择，不执行安装、复制、删除或修改游戏配置。Bridge 是否已安装必须以用户实际 `InstalledPackagesPath\Community2024` 目录为准，应用资源目录仅作为随包发布输入。

### MSFS 请求排队与故障恢复

主进程的连接监控和探索上下文共用一个 `MsfsCliClient`，默认并发数为 `1`。同一客户端内的 MSFS CLI 请求按顺序执行；`getFlightSnapshot` 的批量变量、机型和机号读取也按顺序执行，避免多个 `msfs.exe` 同时竞争同一个 `msfsd.exe` Named Pipe。

遇到 CLI 超时或 `DAEMON_UNAVAILABLE` 时，适配层等待约 1 秒后自动重试一次；认证、协议和业务错误不盲目重试。Agent Worker 也使用单通道配置。该方案优先解决单机用户的偶发竞争和启动时序问题，不引入新的 MSFS 服务或远程代理。

### Geo Cloud 随包配置

Geo Cloud 配置由 `scripts/stage-geo-config.mjs` 在打包时生成到 `out/msfs/geo-config.json`，安装后位于应用资源目录的 `msfs/geo-config.json`。主进程和 Agent Worker 启动时自动读取，供原生 CLI 使用；测试者不需要填写 Geo 地址或 Key。当前测试候选包内置 Geo Key，具有可被安装包持有者提取的安全风险。

### 开发专属 CLI 快照

为避免开发中的 CLI 修改直接混入发布输入，桌面端开发使用项目根目录下的 `dev-runtime/msfs-cli/`。该目录被 `.gitignore` 忽略，由 `pnpm msfs:stage:dev` 从当前开发用 CLI 构建目录更新，结构包含 `msfs.exe`、`msfsd.exe`、`SimConnect.dll` 和 bridge。`pnpm desktop:dev` 会自动刷新开发快照，并把开发版 bridge 设为当前 MSFS 启用版本。

在开发机的 `Community2024` 下，应用会维护 `_晓晓飞行导游版本库\开发版本` 和 `_晓晓飞行导游版本库\应用版本` 两份 bridge；MSFS 根目录只保留当前启用的 `msfs-native-cli-route-bridge`。可使用 `pnpm msfs:use:dev` 与 `pnpm msfs:use:app` 切换，避免两个同身份 package 同时被加载。

`pnpm desktop:package` 不会刷新或编译发布态 MSFS CLI；它只会在严格模式下复制 `MSFS_CLI_DISTRIBUTION_DIR` 指定的快照。快照缺少 `build-metadata.json`、不是当前 native 源码构建、或文件哈希不一致时，打包必须失败。开发机安装候选包时，应用更新“应用版本”并启用它；普通用户没有版本库时，应用直接更新其标准 `Community2024\msfs-native-cli-route-bridge`。之后继续修改 CLI 不会改变已经发给其他用户的安装包；只有重新打包并发布新版本才会更新用户侧文件。

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

### Community bridge 部署与 EFB 实机验收（发布阻断项）

静态包结构、`route status` 和 `msfs status` 都不能证明游戏已加载 bridge。升级或手动恢复 bridge 时，必须按下面顺序执行：

1. 完全退出 MSFS 2024；只关闭窗口但仍有 `FlightSimulator*.exe` / `KittyHawk*.exe` 进程时不得替换 WASM。
2. 仅替换 `<InstalledPackagesPath>\Community2024\msfs-native-cli-route-bridge` 中的 `manifest.json`、`layout.json` 和 `modules/msfs-route-bridge.wasm`；复制后比较源、目标 WASM 的 SHA-256。
3. 只删除该包对应的缓存：`<packages-root>\..\WASM\MSFS2020\msfs-native-cli-route-bridge` 和 `MSFS2024\msfs-native-cli-route-bridge`。不得删除整个 `WASM` 目录，也不得编辑 `Content.xml`。
4. 重新启动 MSFS，进入已经加载的飞行，并在 EFB 中设置或导入航路。
5. 从**与运行 MSFS 相同的 Windows 用户和交互会话**启动 CLI/daemon 后，执行：

   ```powershell
   .\msfs.exe daemon stop --json  # 仅在曾由其他会话启动过 daemon 时执行一次
   .\msfs.exe route get --source efb --json
   ```

   自动化沙盒、Windows 服务账户、远程会话或其他用户启动的 daemon 可能无法访问游戏的 SimConnect 会话；此时的 `SIM_NOT_READY` 不能作为 bridge 是否损坏的结论。`status` 中的 `connected: false` 也可能只是惰性连接尚未被实际请求触发，最终以 `route get` 为准。
6. 检查 `%APPDATA%\Microsoft Flight Simulator 2024\AsoboReport-RunningSession.txt`：`msfs-route-bridge.wasm` 必须显示 `Ready`。发布记录同时保存该行、Community WASM 哈希和 `route get` 的脱敏 JSON 结果。

| `route get --source efb --json` 结果 | 含义与处理 |
| --- | --- |
| `ok: true` 且 `source: "efb"` | bridge、CommBus 和 Planned Route API 已连通；空机场字段或自定义航点仍是有效 EFB 响应，应由测试者确认当前航路内容。 |
| `ROUTE_NOT_FOUND` | bridge 已响应，但 EFB 没有可读航路；在 EFB 中创建/导入航路后重试。 |
| `ROUTE_TIMEOUT` | bridge 没有响应；立即检查 RunningSession 中 WASM 是否 `Failed`、包哈希和专属缓存，不能误报为“没有航路”。 |
| `SIM_NOT_READY` | 先确认 CLI/daemon 与 MSFS 同一 Windows 会话，再确认已加载飞行；不要只依据 `status.connected` 判断。 |
| `DAEMON_UNAVAILABLE` / `MSFS_CLI_TIMEOUT` | 属于 CLI/Named Pipe/进程生命周期问题，与 EFB API 是否存在航路分开排查。 |

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

正式构建必须通过 `MSFS_CLI_DISTRIBUTION_DIR` 提供已验证的 CLI 发布快照；`desktop:package*` 会在变量缺失时直接失败。不能把 `native/msfs-cli/build/`、旧备份目录或未版本化的本地构建目录作为发布输入。

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
