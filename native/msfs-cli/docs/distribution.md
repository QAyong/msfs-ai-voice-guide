# 分发、安装与升级

## 目标

面向最终用户的发布物由两个必须保持协议兼容的组件组成：

- Windows 原生 CLI：`msfs.exe` 与 `msfsd.exe`。
- MSFS 2024 Community Package：`msfs-native-cli-route-bridge`，负责在游戏内读取 EFB Planned Route 并通过 CommBus 响应 daemon。

最终用户不需要安装 MSFS SDK、CMake、clang 或 Visual Studio。发布流水线必须预先编译 Windows 可执行文件和 WASM，并把它们打包进安装器。

## 发布物结构

建议发布一个带版本号的安装器，并保留 ZIP 作为便携/人工安装备用方案：

```text
msfs-native-cli-setup.exe
  cli/
    msfs.exe
    msfsd.exe
    SimConnect.dll          # 候选包当前包含；正式公开分发前需完成许可确认
  community/
    msfs-native-cli-route-bridge/
      manifest.json
      layout.json
      modules/
        msfs-route-bridge.wasm
```

安装器不能把桥接包写入 `FlightSimulator2024.exe` 所在的游戏程序目录。它只安装到 MSFS 配置指定的 `Community2024` 目录。

## Community2024 目录发现

安装器按下列顺序寻找 `UserCfg.opt`：

1. Steam：`%APPDATA%\Microsoft Flight Simulator 2024\UserCfg.opt`。
2. Microsoft Store：在对应应用包的 `LocalCache\UserCfg.opt` 中寻找。
3. 如果自动探测失败，允许用户手动选择 `UserCfg.opt`，而不是直接选择任意写入目录。

读取配置中的：

```text
InstalledPackagesPath "<packages-root>"
```

目标路径固定解析为：

```text
<packages-root>\Community2024\msfs-native-cli-route-bridge
```

写入前必须规范化绝对路径，并验证最终目标位于解析出的 `Community2024` 目录之下。安装器只能创建、升级或删除自己的 `msfs-native-cli-route-bridge` 目录。`Community` 是 MSFS 2020 兼容目录；将 2024 专用 WASM 放入其中会使游戏按旧包分类并可能加载失败。

## Windows CLI 安装

建议按当前用户安装到：

```text
%LOCALAPPDATA%\MSFS Native CLI\
```

默认不要求管理员权限。安装器可以把该目录加入当前用户的 `PATH`，也可以安装一个稳定的启动器入口。`msfsd.exe` 仍由 `msfs.exe` 按需自动拉起，不注册系统服务，不开放 HTTP 端口。

如果游戏正在运行，安装器可以完成文件复制，但必须提示用户重启 MSFS；Standalone WASM 只有在 Community Package 被 VFS 挂载后才会加载。

## 构建与打包

发布构建需要：

```powershell
cmake -S . -B build -G Ninja
cmake --build build
cmake --build build --target msfs_route_bridge
ctest --test-dir build --output-on-failure
```

WASM 构建必须链接 SDK 中的 `MSFS_WasmVersions.a`。`wasm-route-bridge/build.ps1` 同时生成独立 WASM，并通过 SDK `fspackagetool.exe` 生成可安装包目录：

```text
wasm-route-bridge/build/package-tool/msfs-native-cli-route-bridge
```

### 候选发布输入快照（强制）

候选或正式发布不得从开发目录、上一次安装器、未版本化的 `build/`，或桌面项目的 `dev-runtime` 直接取件。每次发布必须先使用同一构建批次的 Release CLI 输出和官方 WASM 输出创建一个独立快照：

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

快照必须包含由当前仓库 `pnpm msfs:native:build` 自动生成的 `build-metadata.json`，其中记录原生源码提交、源码指纹、构建时间和 CLI/daemon 文件哈希；发布记录还必须记录 SDK 版本、VS2022 `MSFS2024` Toolset、Package Tool 版本。桌面安装器只允许从这个快照暂存；若 CLI、daemon 和 Community Package 不是同一批输入，源码提交或指纹不匹配，或任何哈希不匹配，候选包必须失败而不能静默回退到开发构建。

`pnpm desktop:package` 不会替代 MSFS CLI 编译，也不会把当前 `native/msfs-cli/build/` 自动变成发布快照。发布前必须先完成原生 CLI/WASM 构建和测试，再执行 `pnpm msfs:release:snapshot release-inputs/<build-id>`，由脚本把同一批产物（包括 `build-metadata.json`）一次性复制到新的快照目录；目标目录已存在或旧快照缺少该清单时会被拒绝。

构建机同时装有 VS2026 时，Node 原生附加模块的构建应固定到已验证的 VS2022；但 bridge 仍必须由 `wasm-route-bridge/build.ps1` 调用 VS2022 `MSFS2024` Toolset，不能使用 Node 的工具链替代。

`manifest.json` 与 `layout.json` 由 Package Tool 生成，不得手工创建或修改。`layout.json` 不列出自身或 `manifest.json`，但必须列出包内的 `modules/msfs-route-bridge.wasm`，并包含匹配的文件大小和时间戳。

官方推荐使用 MSFS 2024 Platform Toolset 和 Standalone Module 模板构建 WASM。若使用本仓库的 SDK 编译脚本，发布前必须确认产物仅包含被 MSFS 运行时解析的官方 API 导入；`wasi_snapshot_preview1:*` 等未解析导入会在游戏将 WASM 转换为 DLL 时导致 `ERR_VALIDATION_ERROR`。构建脚本应将这类导入视为错误，而不能仅依赖链接成功。

## 版本与兼容性

CLI、daemon 与 bridge 必须共享协议主版本。发布前至少校验：

- `manifest.json` 的 `package_version` 与发布版本一致。
- CLI 能报告自身版本、bridge 协议版本和 bridge 构建版本。
- 协议主版本不兼容时返回明确的 `ROUTE_BRIDGE_VERSION_MISMATCH`，不能退化成 `ROUTE_TIMEOUT`。

当前 `route status` 仍只能报告 CommBus 配置。后续应增加轻量 ping/pong，让安装器或 `msfs doctor` 能区分“未安装”“未加载”“版本不兼容”和“已就绪”。

## 升级、修复与卸载

升级采用按目录替换：

1. 在临时目录验证新包的 `manifest.json`、`layout.json` 和文件哈希。
2. 通过 `msfs daemon stop --json` 停止本项目的 `msfsd.exe`；安装器更新旧版本时会使用旧版兼容的强制停止兜底。
3. 替换 CLI 文件和自己的 Community Package 目录。
4. 在游戏完全退出后，删除仅属于该包的 WASM 编译缓存，例如 `<packages-root>\..\WASM\MSFS2020\msfs-native-cli-route-bridge` 和 `MSFS2024\msfs-native-cli-route-bridge`；保留 `work` 中的用户数据（如有）。
5. 游戏运行中时提示重启，不尝试热替换已加载的 WASM，也不编辑 `Content.xml`。

若 `route get --source efb --json` 返回 `ROUTE_TIMEOUT`，且 RunningSession 的 `[Wasm_Modules]` 将 `msfs-route-bridge.wasm` 标为 `Failed`，上述 1–4 步是唯一允许的恢复路径：重新使用官方 Toolset 和 Package Tool 构建、核对 WASM 哈希、游戏退出后替换包并删除该包专属缓存。不得通过手改 `manifest.json`、`layout.json`、`Content.xml` 或回退到 Legacy GPS 数据伪造成功。

卸载只删除：

- `%LOCALAPPDATA%\MSFS Native CLI`。
- `<Community2024>\msfs-native-cli-route-bridge`。
- 安装器创建的当前用户 `PATH` 条目。

不得扫描或清理其他 Community Package。

## 发布前验证

自动测试之外，发布候选版本必须在 Steam 与 Microsoft Store 两种安装来源上至少各验证一次：

1. 全新安装后 `msfs status --json` 返回 daemon ready。
2. 加载航班后，数值与字符串 SimVar 均能读取。
3. 从与运行 MSFS 相同的 Windows 用户和交互会话启动 `msfs.exe`/`msfsd.exe`。服务账户、自动化沙盒或其他用户启动的 daemon 可能返回 `SIM_NOT_READY`，该结果不能用于判断 bridge 是否已加载。
4. 未建立 EFB 航路时，`route get` 返回 `ROUTE_NOT_FOUND`，证明 bridge 已加载；`ROUTE_TIMEOUT` 不等价于没有航路。
5. 建立 EFB 航路后，`route get --source efb --json` 返回 `source: "efb"` 和结构化航路。自定义航点航路可没有 departure/destination ICAO，但响应仍应包含真实航段。
6. 在 `%APPDATA%\Microsoft Flight Simulator 2024\AsoboReport-RunningSession.txt` 的 `[Wasm_Modules]` 中确认 `msfs-route-bridge.wasm` 为 `Ready`，并被识别为 MSFS 2024 Community Package。
7. 保存脱敏后的 `route get` JSON、WASM 状态行、输入快照 WASM 哈希和安装态 WASM 哈希；四者缺任一项，候选验收不完整。
8. 升级后协议版本一致，卸载后其他 Community Package 不受影响。

## 安全与许可

- 对安装器、`msfs.exe` 和 `msfsd.exe` 进行代码签名，并发布 SHA-256 校验值。
- 安装过程不下载或执行动态脚本；更新只接受签名发布物。
- 当前候选包为了本机运行验证包含 SDK 中的原生 `SimConnect.dll`。正式公开分发前必须按当前 [MSFS 2024 SDK EULA](https://docs.flightsimulator.com/msfs2024/flighting/html/1_Introduction/SDK_EULA.htm)或微软书面说明确认该具体二进制属于可再分发代码；公开 EULA 没有逐项列出该 DLL，SDK 目录中存在文件或安装器不能单独视为许可结论。发布清单必须记录依据、来源、版本和 SHA-256。
- Community Package 仅包含预编译 WASM、manifest 与 layout，不包含 SDK 头文件、工具链或许可受限的开发文件。
