# Spec-027：Windows 系统托盘常驻

**状态：** 已实现，待 Windows 人工验收
**目标平台：** Windows x64
**目标：** 应用启动后创建系统托盘图标；桌面应用真正退出时，托盘图标随主进程一起退出。

## 1. 需求边界

本需求中的“托盘常驻”指：

- 应用启动完成后，系统通知区域始终显示晓晓飞行导游托盘图标；
- 托盘与 Electron 主进程同生命周期，不单独注册 Windows 服务；
- 桌面助手窗口仍按当前行为显示和关闭；
- 关闭桌面应用后，继续执行现有的 Agent、LiveKit、MSFS daemon 清理流程，清理完成后销毁托盘并退出进程。

本需求不改变以下行为：

- 关闭桌面窗口不改成“隐藏到托盘”；
- 不新增开机自启、启动后隐藏或 Windows 后台服务；
- 不增加来源窗口入口、语音开关或其他托盘菜单项；
- 助手标题栏中的“结束当前对话”仍只结束当前会话，不代表退出整个应用。

## 2. 托盘菜单

托盘右键菜单只包含以下四项，顺序固定：

```text
打开聊天面板
打开设置
游戏：已连接 / 游戏：未连接
----------------
退出应用
```

### 2.1 打开聊天面板

- 调用主进程现有的助手激活逻辑；
- 如果窗口最小化，先恢复窗口；
- 如果窗口被隐藏或失去焦点，显示并聚焦窗口；
- 保留当前窗口位置、收起状态、置顶状态和对话内容；
- 不创建新的应用实例；助手窗口仍由现有主进程生命周期管理。

托盘图标单击执行与“打开聊天面板”相同的动作。托盘图标右键显示菜单，不执行额外的隐藏行为。

### 2.2 打开设置

- 复用现有 `openUtilityWindow('settings')`；
- 设置窗口继续使用现有可信 Utility Window 和权限白名单；
- 不通过托盘向 Renderer 暴露服务凭据；
- 设置窗口关闭只关闭设置窗口，不退出应用和托盘。

### 2.3 游戏连接状态

- 菜单项为只读禁用项，不可点击；
- 使用主进程现有的 `latestMsfsConnectionStatus`；
- `publishMsfsConnectionStatus` 更新状态时同步刷新托盘菜单；
- 连接时显示“游戏：已连接”，断开时显示“游戏：未连接”；
- 第一版不区分“未连接”和“未启用”，游戏未连接时统一显示“游戏：未连接”。

### 2.4 退出应用

- 复用现有退出确认窗口；
- 用户确认后调用 `app.quit()`；
- 退出流程仍由现有 `before-quit` 负责停止 Agent、LiveKit、MSFS daemon 和全局按住说话模块；
- 托盘只在应用真正进入 `will-quit` 阶段时销毁，避免清理期间留下失效的托盘入口。

## 3. 生命周期设计

```text
app.whenReady()
   │
   ├─ createAssistantWindow()
   ├─ createTray()
   ├─ 启动 MSFS daemon 和连接监控
   └─ 启动 Agent / LiveKit

桌面窗口关闭或托盘确认退出
   │
   ├─ app.quit()
   ├─ before-quit：停止后台资源并持久化窗口状态
   ├─ will-quit：tray.destroy()
   └─ Electron 主进程退出
```

主进程需要持有一个模块级 `Tray` 引用：

- `createTray()` 只创建一次；
- `updateTrayMenu()` 根据当前语言和游戏连接状态重建菜单；
- `destroyTray()` 具备幂等性；
- 不在普通窗口关闭、设置窗口关闭或来源窗口关闭时销毁托盘。

当前助手窗口的 `close` 事件已经会进入 `app.quit()`，[`desktop/main/index.ts`](../../desktop/main/index.ts) 中的 `before-quit` 也已经负责后台资源清理，因此本需求只需接入托盘创建、菜单动作和最终销毁，不应把关闭事件改成 `hide()`。

## 4. 实现边界

### 4.1 Electron 主进程

主要修改 `desktop/main/index.ts`：

- 引入 Electron 内置的 `Tray`、`Menu`；
- 增加全局托盘引用和创建/更新/销毁函数；
- 在 `app.whenReady()` 创建助手窗口后创建托盘；
- 托盘菜单调用现有助手激活、设置窗口和退出确认逻辑；
- 在 `publishMsfsConnectionStatus()` 和语言保存成功后刷新菜单；
- 在 `will-quit` 中销毁托盘；
- 保留现有单实例锁和 `second-instance` 聚焦行为。

菜单模板已抽取到 `desktop/main/tray-menu.ts`，只负责生成菜单项和连接状态文案；托盘生命周期仍由 `desktop/main/index.ts` 管理。第一版不新增 npm 依赖。

### 4.2 Preload 与 Renderer

基础托盘功能不需要新增托盘 IPC：托盘菜单由主进程直接执行，现有 `openSettings`、`openQuitDialog` 等 Renderer IPC 保持不变。

只有在后续需要托盘直接控制语音状态时，才新增专用 IPC；本需求不包含该扩展。

### 4.3 打包资源

继续使用现有 `resources/app-icon.png` 作为托盘图标。当前 `electron-builder.yml` 已将 PNG 和 ICO 作为 `extraResources` 打包，因此不需要修改安装包资源清单。

## 5. 验收标准

- [x] 代码在 Windows 平台启动后创建一个托盘图标，并在应用真正退出的 `will-quit` 阶段销毁。
- [x] 打开设置不会销毁托盘；桌面窗口关闭仍走现有退出流程，不改成隐藏到托盘。
- [x] “打开聊天面板”调用现有助手激活逻辑。
- [x] “打开设置”调用现有设置窗口逻辑。
- [x] 菜单中的游戏状态由 `latestMsfsConnectionStatus` 驱动，并在状态变化时刷新。
- [x] 托盘菜单除分隔线外只有“打开聊天面板”“打开设置”“游戏连接状态”“退出应用”四项。
- [x] “退出应用”复用现有退出确认和后台资源清理流程。
- [x] 保留单实例逻辑，不因托盘功能创建第二个应用实例。
- [x] 中文和英文语言保存后，托盘菜单文案同步更新。
- [ ] 从 `win-unpacked` 和 NSIS 安装版分别启动并完成托盘图标、进程清理和重复启动的 Windows 人工验收。

## 6. 已完成实现与自动化验证

实现文件：

- `desktop/main/index.ts`：创建托盘、绑定菜单动作、同步连接状态和语言、在 `will-quit` 销毁托盘；
- `desktop/main/tray-menu.ts`：生成固定四项菜单和中英文文案；
- `tests/unit/tray-menu.test.ts`：覆盖菜单顺序、连接状态禁用项和点击回调。

已通过的检查：

- `pnpm desktop:typecheck`；
- `pnpm exec vitest run tests/unit/tray-menu.test.ts`；
- `pnpm lint`；
- `pnpm test`：64 个测试文件通过，246 个测试通过，8 个测试跳过；
- Prettier 格式检查和 `git diff --check`。

## 7. 测试计划

### 自动化测试

- 增加托盘菜单模板测试，锁定四项菜单、顺序、禁用状态和连接状态文案；
- 连接状态变化和托盘销毁由主进程生命周期接入，保留为 Windows 人工验证项；
- 保留现有窗口生命周期和退出清理测试。

### Windows 人工验证

1. 从 `win-unpacked` 和 NSIS 安装版分别启动应用；
2. 检查托盘图标、菜单项数量和菜单顺序；
3. 检查打开聊天面板、打开设置和连接状态显示；
4. 关闭桌面应用，确认托盘图标最终消失；
5. 检查退出后不存在项目拥有的后台进程；
6. 再次启动应用，确认不会产生重复托盘图标。

## 8. 相关文档

- [Spec-004：桌面悬浮语音面板与来源浏览窗](spec-004-web-frontend-and-source-preview.md)
- [Spec-012：桌面设置、本地化、全局按住说话与诊断](spec-012-desktop-settings-localization-global-ptt-and-diagnostics.md)
- [Spec-017：MSFS 桌面连接状态、配置检测与工具开关](spec-017-msfs-desktop-connection-and-tool-settings.md)
- [ADR-009：将 LiveKit 作为应用私有本地运行时随桌面端分发](../adr/adr-009-packaged-local-livekit-runtime.md)
- [Windows x64 打包方案 V2](../architecture/windows-packaging-v2.md)
