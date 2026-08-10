# MSFS 探索与桌面窗口改动记录

**记录日期：** 2026-08-11
**状态：** 已实现并完成开发态验证
**适用范围：** MSFS 双 daemon、EFB 航路、探索上下文、Electron 悬浮球/聊天/探索窗口

这份文档不是普通的功能说明，而是本轮改动的故障复盘和后续 AI 修改约束。以后修改
相关代码前，必须先读本文件、[Spec-015](../specs/spec-015-user-triggered-explore-mode.md)、
[Spec-020](../specs/spec-020-two-msfs-daemons.md) 和当前工作区的 `git status`。本轮最容易
重复发生的错误，都是“看起来只是改一个条件或路径”，实际破坏了跨进程 ABI、运行时版本
或上下文降级语义。

## 一、当前不变量：后续 AI 不得擅自改变

### 1. MSFS 运行时必须区分两个角色

应用启动同一份 `msfsd.exe` 两次，但每个进程拥有独立的角色、Named Pipe 和 SimConnect
会话：

```text
msfsd.exe --role monitor  -> 连接监控、探索上下文
msfsd.exe --role ai       ->  Agent 工具、EFB 航路
```

EFB 不是第三个 daemon，探索也不是第三个 daemon。连接监控显示的“游戏已连接”来自
`monitor` 角色；EFB 请求走 `ai` 角色。一次 EFB 超时不能直接把前端状态改成“游戏未连接”。

### 2. 探索的启动条件是“对话或游戏上下文”

对话和游戏上下文是两个独立的可选输入：

| 对话 | MSFS 上下文 | 结果                                         |
| ---- | ----------- | -------------------------------------------- |
| 有   | 有          | 两者都传给 Planner                           |
| 有   | 无          | 只传有效的 `recentConversation`，不传 `msfs` |
| 无   | 有          | 只传 MSFS 上下文，允许 MSFS-only 探索        |
| 无   | 无          | Main Controller 才返回 `no_context`          |

`src/msfs/explore-context.ts` 只负责报告游戏上下文是否可用，不负责决定整个探索是否
可启动。不能因为 EFB 航路为空、地理服务失败或某个字段缺失，就丢弃仍然有效的位置、
对话或其它上下文。

### 3. “并行”必须按层次描述

当前保持的并行边界是：

- `MsfsExploreContextProvider` 用 `Promise.all` 同时读取飞行快照、地理上下文和航路摘要；
- `ExploreService` 在 Planner 规划完成后，用 `Promise.all` 并行获取百科和视频来源；
- 主题规划、来源 Provider 和导览介绍的既有编排边界不因本次窗口修复改变。

但当前 `desktop/main/explore-controller.ts` 会先等待 MSFS 上下文 Promise，再调用 Planner；
因此“Provider 内部并行”和“百科/视频并行”仍成立，端到端的对话与 MSFS 读取并不是完全
并行。以后如果要恢复对话先行、MSFS 后台刷新，必须单独设计缓存和取消语义，并同步更新
测试与本文档，不能只把 `await` 移走。

### 4. 开发态必须使用当前构建的 CLI 快照

当前开发链路是：

```text
pnpm msfs:native:build
  -> dev-runtime/msfs-cli-build/
pnpm msfs:stage:dev
  -> dev-runtime/msfs-cli/
pnpm msfs:use:dev
  -> Community2024 开发版 bridge
pnpm desktop:dev
```

`scripts/build-msfs-cli.mjs` 默认把原生构建输出放到 `dev-runtime/msfs-cli-build`；
`scripts/stage-msfs-cli.mjs` 在开发态优先从这里暂存，避免继续使用旧的
`native/msfs-cli/build` 或旧 `dev-runtime/msfs-cli` 快照。正式打包仍必须使用同一批经校验的
发布快照，并设置 `MSFS_CLI_DISTRIBUTION_DIR`。

## 二、本轮实际改动

### 1. 修复双 daemon 的角色 ABI 问题

修改：

- `native/msfs-cli/CMakeLists.txt`
- `native/msfs-cli/tests/integration/dual_daemon_test.cpp`

`SimConnectClient` 的类布局受 `MSFS_CLI_HAS_SIMCONNECT` 条件编译影响。原来宏只通过
`PRIVATE` 定义给 `msfs_core` 静态库，使用该公共头文件实例化类的 daemon/测试目标没有
得到同一个宏。结果是库和调用方对同一个 C++ 对象的布局理解不同，表现为启动参数是
`--role ai`，实际运行时却可能读成 `monitor`，进而让 EFB 或 AI 请求走错角色。

修复是把宏改成 `PUBLIC`，让所有使用该头文件的目标共享同一 ABI；同时增加角色契约测试，
验证 `monitor`/`ai` 的解析、角色名称、Pipe 名称和并行启动契约。

**以后不要做：** 只在静态库里打开/关闭影响公共类布局的宏。凡是改变头文件类布局、枚举
或调用约定的编译宏，都必须传播给所有消费者，并增加跨目标的契约测试。

### 2. 修复开发版构建、暂存和权限问题

本轮遇到过三个容易混淆的问题：

1. 开发脚本没有先构建当前原生 CLI，Electron 可能继续启动旧的 `msfsd.exe`。
2. 原生构建目录和运行时目录曾被不同权限/用户创建，Node 在替换 `msfsd.exe` 时出现
   `EPERM`。
3. 只结束启动命令的父进程不一定会结束脱离父树的 `msfsd.exe`，旧进程仍锁住文件，导致
   下一次 staging 继续失败。

当前处理方式：

- `package.json` 的 `desktop:dev` 先执行原生 MSFS 构建，再暂存开发运行时；
- 权限只修复项目内明确的 `native/msfs-cli/build`、`native/global-ptt/build` 和
  `dev-runtime`，不对整个磁盘或用户目录开放权限；
- 重启开发版前，先按完整路径确认属于本项目的 `msfsd.exe`，再结束准确 PID，之后重新
  staging；
- 不能因为一次 `status` 成功就认为 EFB、AI 和连接监控都使用了同一个有效实例，必须分别
  检查 `--role monitor` 和 `--role ai`。

### 3. EFB “后端连接但调用失败”的真实坑

EFB 曾经在原有项目中测试正常，但开发态失败。根因不是简单的“前端权限不够”，而是
开发版实际加载的 Community bridge 和已验证版本不一致；旧 bridge 在 MSFS RunningSession
中为 `Failed` 时，EFB 会表现为超时，即使 SimConnect 状态或其它飞行数据仍然可读。

EFB 验收必须同时看三件事：

1. 当前 MSFS 用户会话是实际运行游戏的 Windows 用户，不是另一个服务/沙盒用户；
2. `route get --source efb --json` 返回 `ok: true` 且 `source: "efb"`；
3. `AsoboReport-RunningSession.txt` 中当前 `msfs-route-bridge.wasm` 为 `Ready`。

如果重新构建或切换 bridge，必须在 MSFS 完全退出时部署，按项目文档清理该 bridge 的
专属缓存，然后重启游戏。不能只重启 Electron，也不能把 `ROUTE_TIMEOUT` 直接解释成
“没有航路”或“游戏未连接”。

### 4. 修复探索上下文的部分失败语义

修改：

- `src/msfs/explore-context.ts`
- `desktop/main/explore-controller.ts`
- `tests/unit/explore-controller.test.ts`
- `tests/unit/msfs-explore-context.test.ts`

具体规则：

- 位置是游戏上下文的核心字段；位置成功时必须保留；
- 地理信息失败只丢弃 `place`；
- EFB 起点和终点为空时只丢弃 `route`，不能让整个 context schema 失败；
- `admin1` 等行政区字段可以映射到 `region`；
- 只有位置、地理信息、航路三类都没有有效字段时，Provider 才返回 `undefined`；
- Provider 返回 `undefined` 只表示“游戏上下文不可用”，最终是否允许探索由上层 Controller
  根据“对话或 MSFS”判定；
- 没有对话时，payload 不包含空的 `recentConversation`；有对话且有 MSFS 时，两者都传。

测试必须覆盖“位置成功但 VFR 航路为空”“只有地理信息”“只有部分航路”“所有游戏数据
都失败”以及“对话-only/MSFS-only/两者都没有”这几种组合。

**以后不要做：** 把四个字段写成 AND 条件，或在底层 Provider 直接返回 `no_context`。
这里是两层 OR：字段保留是部分成功的 OR；探索启动是对话和 MSFS 的 OR。

### 5. 修复首次打开探索面板闪烁

涉及：

- `desktop/main/index.ts`
- `desktop/preload/index.ts`
- `desktop/renderer/src/global.d.ts`
- `desktop/renderer/src/main.tsx`

悬浮球和聊天面板属于 Assistant BrowserWindow；探索面板是另一个隐藏后显示的
Source BrowserWindow。旧实现有两个叠加问题：

1. Assistant 在 Windows 使用 `screen-saver` 级别，Source 使用 `floating` 级别，首次
   `show()`/`focus()` 时会触发 z-order 重新计算；
2. Source Renderer 初始 `state` 为 `null`，窗口显示后才通过 IPC 获取探索状态，因此会先绘制
   “来源网页”空壳，再切换到“探索”内容。

当前修复：

- Source 和 Source 更多菜单使用与 Assistant 相同的 Windows 置顶级别；
- Source Renderer 先注册状态监听，再读取初始状态；
- Renderer 在状态已提交到布局后通过 `source:renderer-ready` 通知 Main；
- Main 等待这个握手完成后才 `show()`/`focus()` Source Window。

这样修复的是显示时序和窗口层级，不改变 Planner、百科/视频 Provider 或 LiveKit 对话。

## 三、验证记录

本轮已通过：

```text
pnpm typecheck
pnpm desktop:typecheck
pnpm exec eslint desktop/main/index.ts desktop/preload/index.ts desktop/renderer/src/main.tsx desktop/renderer/src/global.d.ts
pnpm exec prettier --check desktop/main/index.ts desktop/preload/index.ts desktop/renderer/src/main.tsx desktop/renderer/src/global.d.ts
pnpm test
```

最后一次全量测试结果：`53` 个测试文件通过、`1` 个跳过；`187` 个测试通过、`8` 个跳过。
开发版已用当前代码重新启动，两个 `msfsd.exe` 角色均可启动，真实 MSFS 运行时仍需按下
面的人工清单测试。

### 人工回归清单

- MSFS 全屏运行时，悬浮球保持可见并可点击；
- 首次点击“探索”时，Source Window 不出现空壳闪烁；
- 关闭探索面板后再次打开，状态和位置仍正常；
- 有对话、无游戏上下文时仍可探索；
- 无对话、有游戏位置时可进行 MSFS-only 探索；
- 两者都没有时才显示“暂无可探索内容”；
- EFB 有航路时读取成功；VFR/无航路时位置仍能作为探索上下文；
- 分别验证 `monitor` 和 `ai` 角色，不把 EFB 失败误判为游戏断开；
- 重启 Electron 后确认没有残留本项目 `msfsd.exe` 锁住开发文件。

## 四、给后续 AI 的最短检查顺序

1. 先读本文档和相关 Spec，再执行 `git status -sb`；不要覆盖用户已有改动。
2. 先确认当前生效版本：开发/应用 bridge、CLI staging 目录、Windows 用户会话和两个 daemon
   角色。
3. 修改探索时先写出四种输入组合（对话/MSFS 有无），再修改条件和测试。
4. 修改 MSFS C++ 头文件或编译宏时，检查库和所有消费者的 ABI 是否一致。
5. 修改 BrowserWindow 时同时检查 `parent`、`alwaysOnTop` level、`show/focus` 顺序和
   Renderer 初始状态，不要只改 CSS 或只改一个窗口。
6. 验证时先跑类型检查、定向测试，再跑 `pnpm test`；开发版 staging 失败时先查项目内
   `msfsd.exe` 是否仍在运行，再查权限和路径，不要直接扩大权限或杀掉所有同名进程。
