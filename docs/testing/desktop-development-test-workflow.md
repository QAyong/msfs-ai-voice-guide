# 桌面开发测试最小流程

## 目的

本文件规定 Electron 桌面应用的开发态测试方式。它用于直接打开类似正式软件的桌面窗口，但不生成安装包，也不重复编译没有发生变化的原生组件。

当用户要求“启动开发测试”“打开桌面应用验证功能”或“跑一下桌面交互”时，AI 必须先按本文判断改动范围，再选择最小启动命令。

## 默认规则

默认不执行以下完整命令：

```powershell
pnpm desktop:dev
```

该命令会依次刷新 MSFS CLI、暂存开发快照、切换开发 bridge、编译 `global-ptt` 原生模块，然后才启动 Electron。只有满足本文的完整流程条件时才执行它。

开发资源已经准备好后，普通桌面开发测试使用：

```powershell
.\node_modules\.bin\electron-vite.cmd dev
```

该命令会直接打开 Electron 开发窗口，并支持主进程、preload 和 renderer 的开发态更新。终端必须保持运行，停止测试时按 `Ctrl+C`。

开发态桌面应用会自动启动和管理本地 LiveKit，不需要另开 `pnpm livekit:dev`。前提是 `resources/livekit/livekit-server.exe`、本地 `.env` 和所需语音/模型凭据已经准备好。

## 按改动范围选择流程

| 本次改动                                                                                                              | 必须执行                                                              | 不需要执行                       | 最后启动                             |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- | ------------------------------------ |
| `desktop/`、`src/agent/`、`src/conversation/`、`src/explore/`、`src/msfs/`、`src/tools/`、`shared/`、提示词或普通测试 | 无原生准备步骤                                                        | 不编译 CLI、WASM、`global-ptt`   | `electron-vite dev`                  |
| `native/msfs-cli/src/` 中的 CLI/daemon/SimConnect C++                                                                 | `pnpm msfs:native:build`；`pnpm msfs:stage:dev`                       | 不编译 WASM；不编译 `global-ptt` | `electron-vite dev`                  |
| `native/msfs-cli/wasm-route-bridge/`、`msfs-route-bridge.wasm` 或 bridge 构建配置                                     | 按 MSFS CLI/bridge 流程重新构建并暂存；必要时执行 `pnpm msfs:use:dev` | 不把旧 bridge 当作新代码验证结果 | `electron-vite dev`                  |
| `native/global-ptt/` 或其原生构建配置                                                                                 | `pnpm native:build`                                                   | 不刷新 MSFS CLI/WASM             | `electron-vite dev`                  |
| 首次开发、开发快照缺失、开发资源损坏、Node/Electron 原生依赖变化                                                      | `pnpm desktop:dev`                                                    | 不跳过资源准备                   | `electron-vite dev` 已由完整命令启动 |
| 明确要求安装包、候选包或发布运行时验证                                                                                | 走 `pnpm desktop:package` 或对应发布流程                              | 不用开发态命令代替打包验收       | 按发布流程执行                       |

其中，`pnpm msfs:stage:dev` 是快照暂存，不等于重新编译 WASM。若本次只改了 CLI C++，它可能会复制一份没有变化的 bridge 文件，但不会重建 WASM。

## CLI-only 改动的最小流程

这是修改 MSFS CLI C++、但没有修改 WASM bridge 时的标准流程：

```powershell
# 如果需要切换 Community 中当前生效的开发 bridge，先退出 MSFS 2024
pnpm msfs:native:build
pnpm msfs:stage:dev

# 只有当前生效的是应用版本 bridge 时才执行；切换前必须退出 MSFS
pnpm msfs:use:dev

.\node_modules\.bin\electron-vite.cmd dev
```

如果已经确认 Community 中当前就是开发 bridge，可以跳过 `pnpm msfs:use:dev`。如果只是验证桌面 Agent、提示词或探索逻辑，也可以不刷新 CLI，直接启动开发窗口。

## 运行自动介绍功能的手动验收

针对“探索 → 开启介绍”功能，开发窗口启动后按以下顺序验证：

1. 等待 Agent 加入会话并连接语音。
2. 点击聊天标题栏的探索按钮。
3. 确认菜单包含“打开百科”和“开启介绍”。
4. 选择“开启介绍”，确认聊天区只显示“开启介绍”，不显示内部英文提示词、上下文 JSON 或 context ID。
5. 确认 Agent 直接以导游口吻进行介绍，不调用百科、搜索或 MSFS Agent 工具。
6. 介绍进行中确认普通文字输入和语音输入被阻止；从菜单选择“停止介绍”后确认播放停止。
7. 分别验证只有最近对话、只有 MSFS 上下文、两者同时存在和两者都不存在的情况。
8. 在位置移动超过 10 km、路线变化或游戏内 POI 变化后重新开启介绍，确认不会复用旧上下文。

## 自动化检查与桌面运行的关系

桌面开发窗口测试不能替代自动化检查。完成代码修改后，按风险执行：

```powershell
# 纯逻辑或提示词修改
pnpm test

# TypeScript/桌面类型检查
pnpm typecheck
pnpm desktop:typecheck

# 最终集成构建或准备发布物时才执行
pnpm build
```

`pnpm desktop:preview` 用于打开已经生成的 `out/` 构建产物，不支持当前源码的热更新；它不是日常快速开发测试命令。

## AI 执行检查清单

AI 在启动桌面开发测试前必须：

1. 检查本次改动文件和最近相关提交，判断是否触及 CLI、WASM bridge、`global-ptt` 或原生依赖。
2. 未触及原生组件时，直接使用 `electron-vite dev`，不得默认执行 `pnpm desktop:dev`。
3. 只改 CLI C++ 时，仅刷新 CLI 构建和开发快照；不得因为 CLI 改动而默认重编译 WASM 或 `global-ptt`。
4. 执行 `pnpm msfs:use:dev` 前确认 MSFS 2024 已完全退出，避免替换正在使用的 bridge。
5. 只有用户明确要求打包、安装包或发布运行时验证时，才进入打包流程。
6. 启动失败时先报告具体缺失的资源、配置或原生构建步骤，不用无条件重复完整构建。
