# Bug: EFB 航路桥接模块被识别为 MSFS 2020 并加载失败

**日期：** 2026-07-19
**优先级：** 高
**状态：** 已修复并实机验收（2026-07-23）

## 复现步骤

1. 将 `msfs-native-cli-route-bridge`（EFB 航路桥接包）安装到 MSFS 2024 的 `Community2024` 目录。
2. 完全重启 MSFS 2024 并进入一次飞行。
3. 先执行以下命令确认 CLI 与 SimConnect（模拟器连接接口）正常：

   ```powershell
   .\build\msfs.exe simvar get --name TITLE --unit string --datatype string --json
   ```

4. 执行 EFB 航路读取：

   ```powershell
   .\build\msfs.exe route get --source efb --json
   ```

## 实际结果

- SimVar 读取成功，能够返回当前机型 `R66 Turbine Passenger`，说明 CLI、守护进程和 SimConnect 链路正常。
- EFB 航路读取返回：

  ```json
  {
    "ok": false,
    "error": {
      "code": "ROUTE_TIMEOUT",
      "message": "The EFB route bridge did not respond within three seconds."
    }
  }
  ```

- `AsoboReport-RunningSession.txt` 中 `msfs-route-bridge.wasm`（游戏内桥接模块）的状态为 `Failed`。
- `Content.xml` 将包登记为 `communityfs20-msfs-native-cli-route-bridge`，而不是 MSFS 2024 包。

## 预期结果

- `msfs-route-bridge.wasm` 状态应为 `Ready`。
- 当 EFB 中存在飞行计划时，CLI 应返回 `source: "efb"` 的结构化航路。
- 当 EFB 中没有飞行计划时，CLI 应返回明确的 `ROUTE_NOT_FOUND`，而不是超时。

## 影响范围

- 影响 `route get --source efb`（读取 EFB 航路）功能。
- 不影响已经验证通过的普通 SimVar 读取。
- 由于主设计明确要求使用官方 Planned Route API（计划航路接口），不能用旧 GPS 数据或解析本地文件作为主要降级方案。

## 初步判断

根因已高度疑似定位到 WASM 链接阶段，但尚未完成修复后的游戏内验收：

1. MSFS 2024 官方要求链接 `MSFS_WasmVersions.a`，用于识别模块目标 SDK 版本。
2. 原构建脚本虽然通过 `--whole-archive` 加入了该库，但 `wasm-ld`（WebAssembly 链接器）的垃圾回收仍删除了以下三个版本标记：
   - `GetSimConnectVersion`
   - `GetExtensionVersionBuffer`
   - `GetExtensionVersion`
3. 使用 `--print-gc-sections` 复核时，链接器明确报告上述三个 section（代码段）被删除。
4. 旧产物中不存在这些版本标记，同时游戏将包登记为 `communityfs20-*`。这与官方说明的“版本库未有效链接时按 MSFS 2020 模块处理”一致。
5. 模块随后导入 MSFS 2024 专用的 `fsPlannedRouteGetEfbRoute()`，因此在游戏将 WASM 转换为 DLL 的阶段失败，符合当前 `Failed` 状态。

注意：缺少 Visual Studio 2019 平台工具集本身不是已经证实的直接根因。它只是导致项目采用手写链接流程的环境背景；直接证据指向版本标记被链接器裁剪。

## 最终根因与修复

此前“版本导出被裁剪”是合理但不完整的候选判断。后续 smoke 验证表明：即使完全移除 CommBus、EFB API 和业务代码，手工 `clang-cl.exe + wasm-ld.exe` 产物仍会被游戏标记为 `Failed`。根因是手工链接输出未满足 MSFS 2024 Standalone WASM 的完整运行时 ABI（应用二进制接口），而非某一个业务 API 或单一导出符号。

修复措施：

1. 安装 VS2022、C++ Desktop workload（桌面 C++ 工作负载）与 C++ Clang tools。
2. 在 VS2022 已安装后清洁重装 SDK，使 `MSFS2024` Platform Toolset 和 `MSFS 2024 WASM Standalone Module` 模板完成注册。
3. 以 `msfs-route-bridge.vcxproj`（官方模板等价项目）重建，使用 `MSFS2024` Toolset；仍由 Package Tool 生成 Community Package。
4. 完全退出游戏后部署新包，并删除该包的 `WASM\\MSFS2020` 与 `WASM\\MSFS2024` 缓存目录。

实机结果：

- `AsoboReport-RunningSession.txt` 中模块状态从 `Failed` 变为 `Ready`。
- `route get --source efb --json` 成功返回当前 EFB 航路及 3 个 enroute legs（航路段）。
- 同时验证普通 SimVar 读取正常，说明 bridge 与 SimConnect 可并行工作。

## 历史候选修复

- 构建脚本已临时修改为显式导出三个版本标记，链接器复核显示它们已全部保留。
- 按官方 `fsPlannedRouteGetEfbRoute()` 文档补充了航路对象及其动态成员的内存释放。
- 第一版候选仅显式导出版本标记，但未完成实机验收。第二版额外移除了 WASI C 运行库引入的三个未解析导入：`wasi_snapshot_preview1:fd_close`、`fd_seek` 与 `fd_write`。官方调试文档说明未解析导入会导致游戏在 WASM 转 DLL 时产生 `ERR_VALIDATION_ERROR`。
- 第二版候选 WASM SHA-256：

  ```text
  D3B464402FA10A263B0D5FE6910C4EFF1EBBBCEAB5295B7EFACB77B9E845ED00
  ```

- 第二版候选包已部署到本机 `Community2024`，但尚未启动游戏验收。现有的 `WASM\MSFS2020\msfs-native-cli-route-bridge` 编译缓存应在游戏完全退出后清理，以避免复用旧的 DLL 转换结果。
- 官方推荐使用 MSFS 2024 Platform Toolset 和 Standalone Module 模板；当前机器尚未注册该 Toolset。静态构建通过不替代游戏内验证。
- 上述候选修复仍保留在工作区中，不应在实机验证通过前标记为正式修复。

## 后续处理步骤

1. 完全启动 MSFS 2024 并进入一次飞行。
2. 运行 SimVar 读取，验证守护进程自动重连。
3. 运行 `route get --source efb --json`。
4. 检查 `AsoboReport-RunningSession.txt`，确认模块由 `Failed` 变为 `Ready`。
5. 若仍为 `Failed`，启用 DevMode Console（开发者模式控制台）和 WASM Debug（WASM 调试窗口），记录精确的 `ERR_VALIDATION_ERROR` 或缺失导入符号，不再依据 `Failed` 状态猜测。
6. 实机通过后再将候选代码作为单独的 Bug 修复提交，并更新相关 Spec（功能规格）与测试记录。

## 官方参考

- [WebAssembly：MSFS 2024 版本库要求](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/WASM/WebAssembly.htm)
- [`fsPlannedRouteGetEfbRoute()`：读取 EFB 航路及内存释放要求](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/WASM/Planned_Route_API/fsPlannedRouteGetEfbRoute.htm)
- [WASM Debug：`Failed` 表示 WASM 转 DLL 编译失败](https://docs.flightsimulator.com/msfs2024/html/2_DevMode/Menus/Debug/WASM_Debug.htm)
- [Debugging WebAssembly Modules：导入无法解析时的验证错误](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/WASM/Debugging_WASM.htm)

## 处理方式

本记录采用 Issue-first（先记录问题）方式。后续在独立处理阶段完成：重新确认现状 → 实机验证候选修复 → 根据控制台证据继续诊断 → 补充测试和 Spec → 提交正式修复。
