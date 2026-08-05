# Spec-017：MSFS 桌面连接状态、配置检测与工具开关

**状态：** 已实现并完成真实 Electron 验收

## 目标

让桌面用户能够直接判断 MSFS 2024 是否已连接、确认 CLI 与游戏侧 Community Package 是否配置完成，并按需关闭不希望暴露给 Agent 的工具。该功能面向需要把应用分发给其他用户的场景，检测只读，不负责安装或修改 MSFS 文件。

## 聊天标题栏状态

- 在聊天面板标题栏中，紧邻最小化按钮左侧显示状态。
- 只保留两种状态：`游戏已连接` 与 `游戏未连接`。
- 主进程每 5 秒轮询 CLI `status` 和 `system state --name AircraftLoaded`，游戏启动或关闭后自动推送状态到 Renderer。
- 只要 7 个 MSFS 工具至少有一个启用，就显示状态；7 个 MSFS 工具全部关闭时隐藏状态。
- 游戏未启动、SimConnect 不可用或 CLI 无法响应时显示“游戏未连接”，不伪造模拟数据。

## 设置页检测

设置页新增 MSFS 页面和“立即检测”操作。检测顺序如下：

1. 确认随应用提供的 `msfs.exe` 和 `msfsd.exe` 存在。
2. 调用 CLI `status`，并探测 `system state --name AircraftLoaded`。
3. 在已知位置读取 MSFS 2024 的 `UserCfg.opt`，解析 `InstalledPackagesPath`。
4. 将目标严格限制为 `<InstalledPackagesPath>\Community2024\msfs-native-cli-route-bridge`。
5. 检查 `manifest.json`、`layout.json` 和 `modules\msfs-route-bridge.wasm`。
6. 游戏已连接时调用 `route get --source efb` 验证 Bridge 响应；`ROUTE_NOT_FOUND` 也表示 Bridge 已加载，只是当前没有 EFB 航路。

检测结果分为：

- `ready`：CLI、游戏配置和 Bridge 均可用。
- `game_not_running`：静态配置完整，但游戏尚未启动，无法完成运行时验证。
- `needs_setup`：CLI、UserCfg、Community Package 或 Bridge 检查失败。

检测不会安装 CLI、复制 Community Package、修改 `UserCfg.opt` 或删除任何游戏文件。Bridge 的安装、升级和卸载属于独立发布/安装流程。

## 工具开关

设置页提供 8 个独立开关：

- `getFlightSnapshot`
- `getLocationContext`
- `getRouteBrief`
- `getNextWaypoint`
- `getNearbyFacilities`
- `getWeatherAndSimTime`
- `getTrackHistory`
- `searchWeb`

保存设置时复用现有“保存并重新连接”逻辑：设置持久化后重启 Agent，并在新会话中只注册启用的工具。旧版本没有工具设置时默认全部启用。

## 打包约定

`pnpm desktop:build` 会暂存 CLI 运行文件和 Community Package。开发构建可以从相邻 CLI 项目的已验证构建目录读取资源；候选发布和正式发布必须通过 `MSFS_CLI_DISTRIBUTION_DIR` 提供明确的发布目录。设置页只检测最终用户的实际 `Community2024` 目录，不把应用资源目录误认为游戏已安装。

## 验收

- MSFS 关闭时标题栏显示“游戏未连接”，启动并加载游戏后自动变为“游戏已连接”。
- 设置页能分别报告 CLI、UserCfg、Community Package、SimConnect 和 Route Bridge 状态。
- 关闭任意工具后，该工具不再出现在 Agent 工具列表中；关闭全部 MSFS 工具后标题栏状态隐藏。
- `pnpm test`、`pnpm typecheck`、`pnpm desktop:typecheck`、`pnpm lint` 和严格 Community Package 构建均通过。
