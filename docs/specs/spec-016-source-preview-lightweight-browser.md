# Spec-016：来源预览面板轻量浏览器能力

**日期：** 2026-08-01  
**状态：** 第一版代码已实现，待真实站点冒烟验证  
**关联规格：** [Spec-004](spec-004-web-frontend-and-source-preview.md)、[Spec-009](spec-009-source-window-responsive-layout.md)、[Spec-013](spec-013-about-transcript-resilience-and-source-preview-performance.md)、[Spec-014](spec-014-source-window-adaptive-reading-and-site-preferences.md)、[Spec-015](spec-015-user-triggered-explore-mode.md)

## 目标

将现有来源预览窗从“来源列表加单页网页预览”扩展为受控的轻量浏览器容器：用户可以在同一个来源窗口内继续浏览站内页面、使用网页自身的后退与前进历史，并在视频进入 HTML 全屏时自动将来源窗口调整为横向比例。

本规格不实现通用浏览器，不新增浏览器内核，不替换现有 Electron `WebContentsView`（网页内容视图），也不让第三方网页获得本地应用权限。来源窗口仍然服务于搜索来源和探索来源，不成为独立的账号、收藏或下载产品。

## 1. 架构决策

### 1.1 继续复用现有 Electron 边界

- 保留现有 `Source BrowserWindow`（来源窗口）和单一安全 `WebContentsView`（网页内容视图）。
- 本地标题栏、搜索结果列表、加载页和错误页继续由可信 Renderer 渲染。
- 远程网页继续由隔离的 `WebContentsView` 加载，保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、持久命名 session、权限默认拒绝和受控导航。
- 不使用 `<webview>` 替代现有 `WebContentsView`，不引入第三方浏览器壳、网页播放器或自建导航历史。
- 不向远程网页注入 CSS、脚本或 DOM，不读取或重写视频页面内容。

### 1.2 单窗口、单标题栏

轻量浏览能力全部存在于当前来源窗口内。普通网页、站内跳转、视频播放和视频全屏不创建默认浏览器窗口，也不新增用户可见的“视频模式”。

只有用户主动点击“在系统浏览器打开”时，应用才调用受校验的外部打开逻辑。网页通过 `window.open()` 或 `target="_blank"` 发起的安全 HTTP(S) 跳转由主进程统一处理，不得静默落到系统默认浏览器。

## 2. 标题栏交互

### 2.1 普通网页

所有控制都位于同一个标题栏，不增加第二行工具栏：

```text
[←来源] [‹] [›] [↻]  当前网页标题 / 域名  [M][D] [- 100% +] [⋯] [—] [×]
```

- **返回来源：**返回本次搜索或探索的来源列表，恢复列表滚动位置；不等同于网页后退。
- **网页后退：**使用当前 `WebContentsView` 的网页历史返回上一页。
- **网页前进：**使用当前 `WebContentsView` 的网页历史进入下一页。
- **刷新 / 停止：**页面加载时显示停止；其它时间显示刷新。
- **标题 / 域名：**显示当前页面标题和规范化域名；标题过长时省略，不显示完整路径。
- **`M` / `D`：**在同一标题栏切换“移动阅读”和“桌面网页”，沿用 Spec-014 的站点偏好。
- **`- 100% +`：**在同一标题栏调整当前站点网页缩放，沿用 Spec-014 的范围和持久化规则。
- **更多：**在窄窗口通过应用内浅色悬浮面板显示被收纳的阅读、缩放和系统浏览器打开操作；该面板随来源窗口创建时预热，标题栏 `⋯` 首次点击显示、再次点击隐藏，点击外部或 `Esc` 收起，并具有悬停反馈；不提供复制 URL、视频全屏退出或任意 URL 执行入口。
- **最小化：**调用 Electron `BrowserWindow.hide()` 隐藏来源窗口；视觉上与关闭相同，但不销毁网页、视频播放、导航历史或探索预览；再次打开同一缓存探索时恢复并聚焦。
- **关闭：**关闭来源窗口并销毁当前远程网页文档，持久 Chromium session 数据继续保留。

### 2.2 窄窗口

- 标题栏始终保持单行，不因宽度不足换成第二行。
- 默认约 440px 宽时，返回、网页后退、前进、刷新、阅读模式、缩放、最小化和关闭均优先可见。
- 接近最小宽度时，阅读模式、缩放和系统浏览器打开收进标题栏 `⋯` 的应用内浅色悬浮面板；面板不改变标题栏高度或网页工作区。
- 宽度足以显示原有按钮时，`⋯` 不显示，菜单不得重复标题栏中的操作。
- 返回来源、网页后退、刷新/停止、最小化和关闭属于核心操作，不得全部隐藏。
- 所有图标按钮具有本地化悬停提示、无障碍名称、键盘焦点和按下/禁用状态。

### 2.3 搜索来源列表

搜索或探索来源列表只显示来源列表标题、来源数量、返回/关闭等列表操作，不显示网页后退、前进、刷新、阅读模式或缩放控件。用户必须能明确区分“来源列表”和“正在浏览的原网页”。

## 3. 网页导航

### 3.1 Chromium 原生历史

- 主进程使用当前 `WebContents` 的官方 `navigationHistory` 管理网页历史，不在 Renderer 或共享层重复维护 URL 数组。
- 后退、前进按钮的可用状态来自 `navigationHistory.canGoBack()` 和 `navigationHistory.canGoForward()`。
- 执行导航使用 `navigationHistory.goBack()`、`navigationHistory.goForward()`；不得继续新增已被 Electron 标记为弃用的旧历史方法。
- `did-start-navigation`、`did-navigate`、`did-navigate-in-page`、`did-stop-loading` 和现有首屏状态事件共同更新标题、URL、加载中和错误状态。
- 锚点、`history.pushState()` 和站内单页应用路由使用 `did-navigate-in-page` 更新当前 URL，不重新创建 `WebContentsView`。

### 3.2 站内跳转和新窗口请求

- 顶层 HTTP(S) 导航继续在当前 `WebContentsView` 中进行，并通过现有安全 URL 校验、重定向校验和错误状态机处理。
- 远程页面触发 `window.open()` 或 `target="_blank"` 时，主进程先使用 Electron `setWindowOpenHandler()` 检查目标地址和请求上下文。
- 安全 HTTP(S) 页面默认转为当前来源窗口内的受控导航，不创建系统默认浏览器窗口。
- `mailto:`、`tel:`、下载协议、文件协议和其它不支持的协议不进入远程 `WebContentsView`；由明确的系统处理策略打开或拒绝，并保留错误上下文。
- 不允许网页通过新窗口请求改变来源 Renderer、Preload、Node、IPC、权限、session 或导航策略。
- “返回来源”始终返回本次来源列表；网页后退只操作网页自身历史。

### 3.3 页面标题和 URL

- 主进程读取 Electron 提供的当前页面标题和 URL，并通过白名单 IPC 发送给本地来源 Renderer。
- 默认只显示标题和域名；第一版不提供复制 URL 操作。
- 不在第一版加入任意地址栏和搜索框，避免来源预览窗口变成未定义范围的通用浏览器入口。

## 4. 视频和窗口内自动横屏

### 4.1 触发方式

- 监听当前 `WebContents` 的 `enter-html-full-screen` 和 `leave-html-full-screen` 事件。
- 在来源 session 的 Electron 权限检查与请求回调中，仅对当前来源 `WebContentsView` 内安全 HTTP(S) 文档及其播放器子框架放行 `fullscreen`，其它远程权限继续拒绝。
- 只有网页通过标准 HTML 全屏能力进入视频全屏时才触发窗口横向调整。
- 不通过执行网页 JavaScript、注入 CSS、查找 `<video>` 元素或逆向平台私有接口强制全屏。
- Bilibili 与其它来源页完全遵循用户当前的“移动阅读 / 桌面网页”选择；仅首次访问且不存在已保存偏好时，Bilibili 默认桌面网页，其它站点默认移动阅读；不在播放期间强制切换 UA。

### 4.2 自动横屏行为

进入视频全屏后：

1. 主进程保存来源窗口当前的位置、内容尺寸、跟随/自由移动状态和当前网页状态。
2. 使用 Electron 43 已有的 HTML 全屏事件和进入前的普通窗口边界快照，再通过 `BrowserWindow.setBounds()` 将来源窗口调整为横向视频比例；默认目标比例为 16:9。
   `WebContentsView` 使用 `disableHtmlFullscreenWindowResize` 禁止 Chromium 先把宿主窗口改成显示器级 HTML 全屏，窗口尺寸由主进程统一控制。
3. 调整后的窗口仍是当前来源窗口，位置不跳到主显示器中央，也不覆盖整个显示器。
4. `WebContentsView` 继续通过现有 resize 生命周期填充窗口网页工作区；网页不重载、不重建，播放状态由 Chromium 和站点自身保持。
5. 显示器工作区只用于限制窗口边界，防止自动横屏后窗口跑出当前显示器；它不是全屏目标尺寸。
6. 标题栏仍是同一标题栏，不新增“退出视频全屏”或“视频模式”按钮；退出由网站播放器或 `Esc` 完成。

退出视频全屏后：

- 监听 `leave-html-full-screen`，恢复进入前的窗口位置和内容尺寸。
- 恢复普通网页标题栏控件、跟随/自由移动状态和来源窗口网页工作区。
- 用户手动关闭来源窗、收起助手、网页渲染进程退出或加载失败时，清理全屏临时状态，不能把横屏尺寸写入普通来源窗口尺寸偏好。

### 4.3 视频失败与兼容性

- 视频网页加载失败仍使用现有错误恢复页，提供重试、返回来源、系统浏览器打开和关闭。
- 视频登录、验证、弹窗和外链不能绕过现有导航白名单、权限拒绝和远程网页隔离。
- 视频 Provider 只负责提供真实 HTTP(S) 页面 URL；播放、全屏、缓冲和站点控件由 Chromium 与原网站负责，不解析私有接口或页面 DOM。

## 5. 安全与生命周期

- 来源网页继续只使用现有 `persist:source-preview` session；不向应用业务代码暴露 Cookie、登录凭据、网页正文或完整浏览历史。
- 关闭来源窗、返回来源列表、切换来源、加载失败和网页渲染进程退出时，继续销毁旧 `WebContentsView`、计时器和过期回调。
- 当前网页导航不得绕过 HTTP(S) 校验、重定向检查、权限拒绝、沙箱、上下文隔离和 IPC 发送方验证。
- 所有新增导航、视频全屏和窗口尺寸控制 IPC 均由主进程实现；Preload 只暴露固定动作，不暴露任意 URL、脚本或 Electron 对象。

## 6. 非目标

- 多标签页、书签、完整浏览历史和扩展程序。
- 任意地址栏、搜索引擎切换、密码管理和自动填表。
- 下载管理、打印中心、通用 PDF 阅读器和站点专用播放器；这些能力另立规格。
- 将来源窗口改成助手内部侧栏；窗口布局仍遵循 Spec-009 和 Spec-014 的独立伴随窗边界。
- 系统级全屏、显示器级最大化、系统旋转或跨显示器视频播放。

## 7. 实现边界

| 主题                     | 主要位置                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| 网页导航、历史和全屏事件 | `desktop/main/index.ts`                                           |
| 标题栏和状态显示         | `desktop/renderer/src/main.tsx`、`desktop/renderer/src/style.css` |
| 白名单 IPC               | `desktop/preload/index.ts`、`desktop/renderer/src/global.d.ts`    |
| 加载与阅读状态契约       | `shared/source-preview.ts`                                        |
| 窗口横屏尺寸计算         | `desktop/main/source-window-fullscreen.ts`                        |
| 导航、全屏和恢复测试     | `tests/unit/`、`tests/integration/`                               |

不新增第三方浏览器、播放器或窗口管理依赖；所有 Electron API 先以当前安装版本 `electron@43.1.1` 的官方类型和文档为准。

## 8. 验收标准

- [ ] 普通网页的返回来源、网页后退、前进、刷新/停止、最小化和关闭均位于同一个标题栏。
- [ ] 最小化来源窗口不会销毁当前网页、视频播放或导航历史；同一缓存探索再次触发时恢复并聚焦该窗口。
- [ ] 默认来源窗口宽度下，标题、导航、阅读模式和缩放控件不换行；窄窗口时被隐藏的原有控件进入应用内浅色悬浮更多面板，不重复显示、不改变网页工作区。
- [ ] 网页内部 HTTP(S) 链接、锚点和 `pushState` 导航继续留在当前来源窗口。
- [ ] 网页通过 `target="_blank"` 或 `window.open()` 打开的安全 HTTP(S) 页面不再自动跳到系统默认浏览器。
- [ ] 网页后退/前进与返回来源列表是两套独立行为。
- [ ] 后退、前进按钮状态来自 Electron 官方 `navigationHistory`，不使用自定义 URL 历史数组。
- [ ] 视频触发标准 HTML 全屏后，当前来源窗口自动调整为横向比例，不创建第二个窗口、不调用系统级全屏、不占满显示器。
- [ ] 自动横屏后网页内容填充当前窗口工作区；播放、网页 session、URL 和页面状态继续保留。
- [ ] 退出视频全屏后来源窗口恢复进入前的位置和尺寸，普通标题栏恢复，临时横屏尺寸不写入普通窗口尺寸持久化状态。
- [ ] 视频网页失败、验证、弹窗、重定向和不安全协议继续遵守现有安全策略。
- [ ] 真实 YouTube 和哔哩哔哩场景完成站内跳转、网页后退/前进、视频全屏、退出恢复和默认浏览器不被意外打开的 Windows Electron 冒烟验证。
- [ ] 远程网页仍无 Node、Preload、IPC 和未授权权限；所有新增 IPC 均验证发送方和参数。

## 9. 相关文档

- [Spec-004：桌面悬浮语音面板与来源浏览窗](spec-004-web-frontend-and-source-preview.md)
- [Spec-009：来源浏览窗响应式网页布局与临时自由移动](spec-009-source-window-responsive-layout.md)
- [Spec-014：伴随来源浮窗的自适应阅读与站点偏好](spec-014-source-window-adaptive-reading-and-site-preferences.md)
- [Spec-015：用户触发的探索模式](spec-015-user-triggered-explore-mode.md)
- [Electron `WebContentsView`](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron `BrowserWindow`](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron `NavigationHistory`](https://www.electronjs.org/docs/latest/api/navigation-history)
- [Electron `setWindowOpenHandler`](https://www.electronjs.org/docs/latest/api/web-contents#contentsetwindowopenhandlerhandler)
- [Electron `WebContents` 全屏事件](https://www.electronjs.org/docs/latest/api/web-contents#event-enter-html-full-screen)
