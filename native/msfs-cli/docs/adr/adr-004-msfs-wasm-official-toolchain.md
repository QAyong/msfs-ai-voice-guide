# ADR-004: 独立 WASM 必须使用官方 MSFS2024 Platform Toolset 构建

**日期：** 2026-07-23
**状态：** 已接受

## 背景

手工 `clang-cl.exe` 与 `wasm-ld.exe` 链接的 bridge 即使改为零 API 导入的 smoke 模块，游戏仍将其标为 `Failed`。相同源码使用官方 `MSFS2024` Platform Toolset 后，游戏将模块标为 `Ready`，并成功返回 EFB 航路。

## 决策

所有 `msfs-route-bridge.wasm` 产物必须通过 VS2022 的 `MSFS2024` Platform Toolset 和 Standalone Module 模板等价项目 `wasm-route-bridge/msfs-route-bridge.vcxproj` 构建；Package Tool 继续负责生成最终 Community Package。

## 原因

- 官方 Toolset 会组合 MSFS 运行时 ABI（应用二进制接口）、标准 C/C++ 运行时、版本库和必需导出。
- 手工链接难以完整复刻这些隐含约束，静态检查成功也不能保证游戏 AOT 转换为 DLL 时可加载。
- 已完成的游戏内验收提供了直接证据：官方产物为 `Ready`，`route get --source efb --json` 返回真实航路。

## 影响

- 构建机必须保留 VS2022、C++ Desktop workload（桌面 C++ 工作负载）、C++ Clang tools 和 MSFS 2024 SDK。
- `MSFS2024_SDK` 必须指向 SDK 根目录；SDK 安装/Repair 必须发生在 VS2022 已安装之后。
- `docs/local/sdk/MSFS2024_SDK_Core_Installer_1.6.9.zip` 是本机恢复安装包，受 `.gitignore` 保护，严禁提交。

## 不在此决策范围内

- VS2026 的兼容性支持。
- SDK 安装包的分发、再发布或许可证解释。
