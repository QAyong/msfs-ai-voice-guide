# Bug-20260804：MSFS CLI 就绪误判与 Electron 开发态资源路径

**发现日期：** 2026-08-04
**状态：** 已修复并完成开发态实机验证
**影响范围：** MSFS CLI 就绪提示、Electron `desktop:dev`、Agent Worker 的 MSFS 工具调用

## 症状

MSFS 2024 已经进入飞行场景，命令行适配层可以读取 SimConnect 和飞行数据，但桌面端显示“MSFS CLI 暂时不可用”，导游无法读取当前飞机。

## 根因

本次问题由两个独立判断错误叠加造成：

1. `AircraftLoaded` 是 SimConnect 的字符串型系统状态，返回最近加载飞机的文件路径。`integer` 字段不是“是否加载飞机”的布尔标志，可能在飞机已加载时仍为 `0`。预热逻辑原先检查 `value.integer === 0`，因此将有效飞行误判为 `SIM_NOT_READY`。
2. Electron 开发态的 `process.resourcesPath` 指向 Electron 运行时资源目录，不等于项目根目录的 `resources/`。Worker 原先无条件将它拼成 `resourcesPath/msfs/msfs.exe`，导致 `desktop:dev` 找不到 CLI；同一时间，独立的 `pnpm msfs:smoke` 仍能从项目目录找到 CLI，造成两条启动路径表现不一致。

## 修复

- [`src/msfs/guide-service.ts`](../../src/msfs/guide-service.ts) 改为检查 `AircraftLoaded` 的非空字符串路径。
- [`desktop/agent-process.ts`](../../desktop/agent-process.ts) 仅在打包资源中的 CLI 文件真实存在时使用 `process.resourcesPath`，否则开发态回退到 `process.cwd()/resources/msfs/msfs.exe`。
- [`desktop/main/index.ts`](../../desktop/main/index.ts) 统一开发态和安装态的资源目录解析，桌面端探索上下文也复用正确路径。
- 回归测试覆盖“`integer=0` 但飞机路径有效”的情况。

## 验证

2026-08-04 在运行中的 MSFS 2024 和 C172SP G1000 场景中验证：

- `pnpm msfs:smoke` 返回 `status: "ready"`。
- Agent 能真实调用 `getFlightSnapshot`，返回位置、高度、地速、机型和机号。
- EFB 航路读取正常。
- `pnpm exec vitest run tests/unit/msfs-track-cache.test.ts tests/integration/msfs-cli-offline.test.ts`：4/4 通过。
- `pnpm typecheck`、`pnpm desktop:typecheck` 通过。
- `desktop:dev` 重启后窗口和 Agent Worker 正常，桌面端手动对话验证通过。

## 后续打包注意事项

- `desktop:dev` 不能只依赖 `process.resourcesPath`；开发态必须能解析项目根目录的 `resources/msfs/msfs.exe`。
- 正式构建前先执行 `pnpm msfs:stage`，或由 `pnpm desktop:build` 完成暂存，并检查 `resources/msfs/msfs.exe`、`msfsd.exe` 存在。
- CI、候选包和正式包必须设置 `MSFS_CLI_DISTRIBUTION_DIR` 指向经过验证的发布目录，不得依赖开发机绝对路径或相邻项目的未版本化 `build/`。
- 安装态必须从应用私有资源目录解析 CLI；不能把开发态回退路径写入安装器配置。
- `msfs-native-cli-route-bridge` 不由当前暂存脚本自动安装；正式安装包仍需单独处理 Community Package 的携带、版本校验、安装、升级和卸载。
