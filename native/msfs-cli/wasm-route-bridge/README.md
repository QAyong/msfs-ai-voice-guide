# `msfs-route-bridge.wasm`

MSFS 2024 Community Package 内的最小 EFB Planned Route 桥接模块。它不读取 `.PLN`、`.FLT` 或 Legacy GPS Flight Plan SimVars，而是仅调用官方 `fsPlannedRouteGetEfbRoute()`。

## 协议

1. `msfsd.exe` 订阅 `msfs.route.response`，再通过 SimConnect CommBus 向 WASM 广播 `msfs.route.request`。
2. 请求载荷为 `{"requestId":"<CLI correlation id>"}`。
3. WASM 调用 `fsPlannedRouteGetEfbRoute()`，将 departure、destination、跑道、SID、STAR、approach、cruise altitude、VFR/IFR 与 enroute legs 转成 JSON。
4. WASM 向 SimConnect 广播 `msfs.route.response`，并原样返回 `requestId`，以免并发请求串线。
5. 没有 EFB 航路或返回超时时，CLI 分别返回 `ROUTE_NOT_FOUND` 或 `ROUTE_TIMEOUT`；Community Package 未被加载时也会以超时体现为 bridge 不可用。

## 构建

需要已安装 MSFS 2024 SDK、Visual Studio 2022 Community（安装“使用 C++ 的桌面开发”和 C++ Clang tools）以及 SDK 注册的 `MSFS2024` Platform Toolset（平台工具集）。设置 `MSFS2024_SDK` 后执行：

```powershell
.\wasm-route-bridge\build.ps1
# 或从顶层构建目录：
cmake --build build --target msfs_route_bridge
```

脚本调用官方模板等价的 `msfs-route-bridge.vcxproj` 和 `MSFS2024` Toolset；不要再用手工 `clang-cl.exe` / `wasm-ld.exe` 参数链接。随后脚本通过 SDK 的 `fspackagetool.exe` 生成可直接安装的包目录：

```text
wasm-route-bridge/build/package-tool/msfs-native-cli-route-bridge/
  manifest.json
  layout.json
  modules/msfs-route-bridge.wasm
```

Package Tool 目前不能稳定处理包含中文的项目路径。脚本会将 Project XML、Package Definition 和已编译的 WASM 暂存到 ASCII 临时路径中打包，再把 SDK 产物复制回上述输出目录。`manifest.json` 与 `layout.json` 均由 Package Tool 生成，不能手工维护。

### MSFS 2024 构建约束

必须使用 MSFS 2024 Platform Toolset 和 `MSFS 2024 WASM Standalone Module`（独立模块）模板等价项目。2026-07-23 已实机证明手工链接产物即使无业务 API 导入也会在游戏中 `Failed`，而官方 Toolset 产物会成为 `Ready`。

- 链接 `MSFS_WasmVersions.a`，并保留 `GetSimConnectVersion`、`GetExtensionVersionBuffer` 与 `GetExtensionVersion` 导出；否则游戏会将模块按 MSFS 2020 兼容模块处理。
- 官方 Toolset 还会生成 `wasi_snapshot_preview1:commit_pages` 运行时导入；这是已在游戏中验证可加载的官方产物组成部分。
- 仅静态检查通过并不等于模块已被游戏接受；最终以游戏内 WASM Debug 的 `READY` 状态为准。

如需恢复本机环境，项目忽略目录 `docs/local/sdk/MSFS2024_SDK_Core_Installer_1.6.9.zip` 保存了 SDK Core 安装包副本。该 ZIP 仅供本机安装/Repair，已由 `.gitignore` 排除，绝不能提交或打包发布。先安装 VS2022 的 C++ 工作负载和 Clang tools，再用该 MSI 清洁重装 SDK，使 Toolset 与模板注册到 Visual Studio。

## 安装与验证

将整个 `msfs-native-cli-route-bridge` 目录复制到 MSFS 2024 当前使用的 `Community2024` 目录并重启游戏。不要放入兼容 MSFS 2020 的 `Community` 目录。包加载后：

```powershell
.\build\msfs.exe route status --json
.\build\msfs.exe route get --source efb --json
.\build\msfs.exe route watch --interval-ms 1000 --count 0 --json
```

替换 WASM 后，应先完全退出游戏，再按包名删除对应的运行时缓存目录，让游戏重新将 WASM 转换为 DLL：Steam 安装通常位于 `%APPDATA%\Microsoft Flight Simulator 2024\WASM\MSFS2020\msfs-native-cli-route-bridge` 与 `MSFS2024\msfs-native-cli-route-bridge`。不要删除整个 `WASM` 目录或编辑 `Content.xml`；如未来模块在 `work` 下保存用户数据，应先保留该目录。

`route status` 只能报告本地 CommBus 协议配置；最终可用性由 `route get` 的实际请求确认。桥接响应最大 64 KiB；超出限制会返回明确错误，而不是截断航路 JSON。

### 游戏内验收与错误判定

在替换 bridge 后，必须从**与 MSFS 相同的 Windows 用户和交互会话**运行 CLI。自动化沙盒、Windows 服务或另一个用户会话创建的 daemon 可能无法连接游戏；此时先停止该项目 daemon，再由正确会话重新执行 `route get`：

```powershell
.\build\msfs.exe daemon stop --json
.\build\msfs.exe route get --source efb --json
```

`route status` 中 `simconnect.connected: false` 可能只是惰性连接尚未被实际请求触发，不能代替最终检查。以下结果必须按语义处理：

| 结果 | 结论 | 下一步 |
| --- | --- | --- |
| `ok: true` 且 `source: "efb"` | CommBus、bridge 与 Planned Route API 已工作 | 核对返回的航路内容；空 ICAO 但有自定义航点也是有效结果。 |
| `ROUTE_NOT_FOUND` | bridge 已响应，但 EFB 没有可读航路 | 在 EFB 创建或导入航路后重试。 |
| `ROUTE_TIMEOUT` | bridge 没有响应 | 查看 RunningSession 的 `[Wasm_Modules]`；若模块为 `Failed`，重新按官方 Toolset + Package Tool 构建，退出游戏后部署并清除本包缓存。 |
| `SIM_NOT_READY` | daemon 没有接入可用 SimConnect 会话 | 确认游戏已加载飞行，并确认 CLI/daemon 与游戏使用同一 Windows 会话。 |

最终验收必须同时满足 `route get` 成功和 `%APPDATA%\Microsoft Flight Simulator 2024\AsoboReport-RunningSession.txt` 中 `msfs-route-bridge.wasm` 的状态为 `Ready`。仅验证文件哈希、Package Tool 输出或 `route status` 都不够。
