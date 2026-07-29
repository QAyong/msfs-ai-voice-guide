# Spec-014：伴随来源浮窗的自适应阅读与站点偏好

**日期：** 2026-07-29<br />
**状态：** 已确认，待开发<br />
**关联规格：** [Spec-004](spec-004-web-frontend-and-source-preview.md)、[Spec-009](spec-009-source-window-responsive-layout.md)、[Spec-010](spec-010-temporary-source-page-zoom.md)、[Spec-013](spec-013-about-transcript-resilience-and-source-preview-performance.md)

## 目标

保留现有独立、伴随聊天面板的 `Source BrowserWindow`（来源浏览窗），只改善其中原网页的阅读体验：网站能够在真实窄视口中优先采用移动版响应布局；用户可按站点切换桌面版，并让阅读缩放和布局偏好跨关闭与应用重启恢复。

本规格借鉴 Vivaldi Web Panel（网页面板）的用户行为：窄栏优先移动版、必要时切换桌面版、缩放可保留。但不复制 Vivaldi 或 Microsoft Edge 的产品 UI 源码；实现继续复用项目已有的 Electron `WebContentsView`（网页内容视图）、原生窗口拉伸能力和安全加载链路。

## 1. 需求边界

**包含：**

- 保留来源浮窗的默认伴随定位、手动移动后的本次会话自由移动、四边/四角拉伸、关闭和聊天面板收起时同步关闭。
- 保留 `WebContentsView` 与来源浮窗标题栏下真实可用区域等宽高；用户拉伸窗口时，网页继续获得真实 CSS 视口并自然响应式重排。
- 对每个原网页来源站点提供“移动阅读”和“桌面网页”两种 User-Agent（用户代理）模式：首次访问站点时默认“移动阅读”。
- 在原网页的 `loading`（加载中）、`ready`（已显示）和 `error`（加载失败）状态显示两种模式的切换控件；搜索结果列表不显示。
- 切换模式后以新的 User-Agent 受控重新加载当前安全 URL；不伪造触摸、设备像素比、屏幕尺寸或特定手机/平板设备。
- 以规范化 `origin`（协议、主机和端口）为键，跨来源浮窗关闭和应用重启保存阅读模式与网页缩放百分比。
- 保留现有 50% 至 200%、每次 10% 的缩放范围、重置 100% 操作及边界禁用状态；用户调整后立即更新当前站点偏好。
- 在重新打开同一站点时，于发起网络导航前恢复对应的 User-Agent 模式和缩放；新站点使用“移动阅读”和 100%。
- 保留现有来源加载首屏预热、HTTP(S) 校验、沙箱、权限拒绝、导航白名单、外部浏览器打开、超时、错误页和重试逻辑。

**不包含：**

- 不将来源浮窗改为助手窗口内部的侧栏、标签页或停靠面板。
- 不引入固定 768px/1280px 虚拟视口、整页缩小以塞入窗口，或设备仿真协议。
- 不向第三方网页注入 CSS、改写 DOM、抓取正文、删除广告或绕过站点对移动版/桌面版的限制。
- 不保存网页正文、登录凭据、表单内容、滚动位置、媒体播放状态或完整浏览历史。
- 不放宽远程网页的 Node、Preload、IPC、权限、导航或协议限制。
- 不将来源网页缩放作用于搜索结果列表、来源浮窗标题栏、聊天面板或 Chromium 全局缩放设置。

## 2. 用户体验与状态

### 2.1 真实视口优先

来源窗口默认约为 440×600px。无论当前为移动阅读还是桌面网页，`WebContentsView`（网页内容视图）始终匹配标题栏下方的真实内容区：

```text
用户拖动来源浮窗边框
        ↓
网页内容区同步改变
        ↓
当前 WebContentsView 获得新的真实 CSS 视口
        ↓
网页按自身响应式规则重新排版；不重载、不重建
```

窗口大小与 User-Agent 模式、网页缩放相互独立。拉伸窗口不能重置用户已选择的模式或缩放。

### 2.2 移动阅读与桌面网页

- “移动阅读”是新站点的默认模式。主进程在开始 `loadURL()`（加载 URL）前，为当前 `WebContentsView` 设置移动 User-Agent；网站可据此返回移动页面或启用窄屏布局。
- “桌面网页”使用 Chromium 默认桌面 User-Agent，供移动页面缺少内容、站点错误识别、或用户希望查看桌面导航/表格时选择。
- 用户点击模式切换后，界面明确告知正在重新加载。由于页面版本可能变化，不保证保留页面内表单输入、动态内容、媒体播放或滚动位置；来源 URL、站点会话和安全边界继续遵循现有逻辑。
- 控件须具有中文无障碍名称、选中态、悬停提示和键盘焦点。模式文案表达“移动阅读”“桌面网页”，不得暗示模拟特定品牌设备。

### 2.3 按站点缩放记忆

每个来源站点保存如下最小偏好：

```ts
type SourceReadingPreference = {
  mode: 'mobile' | 'desktop';
  zoomPercent: number; // 50、60、…、200
};
```

用户点击缩小、放大或重置缩放后，只更新当前原网页所属站点的 `zoomPercent`（缩放百分比）。用户切换阅读模式后，只更新该站点的 `mode`（阅读模式）。搜索结果预览既不读取也不改变这些偏好。

站点偏好写入既有用户数据目录中的本地状态文件，不上传、不进入诊断包；状态文件损坏、字段越界或未知模式时，安全回退为“移动阅读 + 100%”。

## 3. 加载与恢复流程

### 3.1 正常流程

1. 用户在搜索结果预览中选择 HTTP 或 HTTPS 来源。
2. 主进程先验证 URL，再按该 URL 的规范化 `origin` 读取 `SourceReadingPreference`（来源阅读偏好）。
3. 若不存在有效偏好，使用“移动阅读 + 100%”。
4. 主进程在导航前设置 User-Agent 和缩放，复用或创建现有安全配置的预热 `WebContentsView`。
5. 来源浮窗显示加载状态；首个可见文档出现后显示网页。
6. 用户可拉伸浮窗；网页只重排，不重新加载，也不重建 `WebContentsView`。
7. 用户可调整缩放，或切换移动/桌面模式；两项偏好均立即持久化。

### 3.2 异常流程

1. User-Agent 切换后的重载出现网络、HTTP、跳转阻止、渲染进程或超时错误。
2. 应用沿用现有错误页，提供重试、返回来源列表和在系统浏览器打开。
3. 重试沿用当前站点已保存的阅读模式与缩放；不得静默退回到另一模式。
4. 用户可从错误页再次切换模式后重试；任何不安全 URL 仍必须被阻止。

## 4. 实现约束

- 不新增来源窗口或另起网页进程模型；继续使用 `desktop/main/index.ts`（Electron 主进程）中已有的 `Source BrowserWindow` 与 `WebContentsView` 生命周期。
- 阅读模式是导航前的网页请求配置；缩放继续仅通过 `WebContentsView.webContents.setZoomFactor()`（设置网页缩放比例）影响当前远程网页。
- 来源浮窗尺寸继续使用现有 `StoredWindowState.source`（已保存来源窗口大小）；站点阅读偏好应作为独立、受校验的状态字段加入 `StoredWindowState` 或同等的本地状态契约。
- Renderer（界面进程）只通过白名单 IPC 请求模式切换与缩放；不得接收、拼接或执行任意 User-Agent、脚本或网页注入指令。
- 站点偏好键不得以完整 URL（含路径、查询参数、锚点）保存，以避免产生不必要的 URL 记录；仅保存规范化 `origin`。
- `WebContentsView` 在加载失败、返回来源列表、关闭来源浮窗或已销毁竞态中，必须继续遵守现有清理与引用存活检查。

## 5. 与既有规格的关系

本规格取代以下已验收规格中的局部要求，其余要求继续有效：

- 取代 [Spec-009](spec-009-source-window-responsive-layout.md) 第 2 节中“保留桌面 Chromium User-Agent”“不伪造手机 User-Agent”和“不维护布局模式状态”的限制，以及第 4、7 节中与之对应的兼容边界和验收项。
- 保留 Spec-009 的真实视口、窗口拉伸不重载、不重建视图、自由移动、伴随定位与安全要求。
- 取代 [Spec-010](spec-010-temporary-source-page-zoom.md) 第 3、6、7 节中“缩放仅限当前打开周期”“返回、重试、切换来源或关闭后重置为 100%”“不提供站点记忆”的要求。
- 保留 Spec-010 的缩放范围、步进、控件位置、局部缩放、真实视口和安全边界。
- [Spec-013](spec-013-about-transcript-resilience-and-source-preview-performance.md) 的预热、首个可见文档展示和资源清理要求不变。

## 6. 验收标准

- [ ] 来源浏览窗继续作为独立伴随浮窗存在；默认跟随、手动移动后本次会话自由移动、关闭和收起助手时的现有行为不变。
- [ ] 拉伸来源浮窗时，`WebContentsView` 使用标题栏下方的真实可用宽高；网页重排而不重载、不重建，并保持当前阅读模式和缩放。
- [ ] 新站点首次打开默认使用移动 User-Agent 和 100% 缩放，不启用触控、设备像素比、屏幕尺寸或特定设备模拟。
- [ ] 用户可在加载、就绪和错误状态切换“移动阅读 / 桌面网页”；切换以对应 User-Agent 受控重载当前安全 URL，搜索结果预览不显示该控件。
- [ ] 用户可在原网页状态下以 10% 步进在 50% 至 200% 缩放，点击百分比重置为 100%；缩放不改变应用 UI 或 Chromium 全局设置。
- [ ] 对同一 `origin`，移动/桌面模式和缩放值在返回来源列表、选择其他来源、关闭来源浮窗及应用重启后恢复。
- [ ] 不同 `origin` 的阅读偏好彼此隔离；新站点不会继承上一站点的模式或缩放。
- [ ] 无效、损坏或越界的本地偏好安全回退为“移动阅读 + 100%”，不阻止来源窗口打开。
- [ ] User-Agent 模式、缩放恢复、重试和模式切换均不放宽 HTTP(S) 校验、沙箱、权限拒绝、导航白名单、IPC 隔离或外部打开策略。
- [ ] 现有来源预览、响应式视口、缩放、窗口跟随/自由移动及预热加载测试继续通过；新增站点偏好单元测试和模式切换集成测试。

## 7. 相关文件与测试

- `desktop/main/index.ts`（来源窗口、导航前 User-Agent、缩放恢复和 IPC）
- `desktop/preload/index.ts`（受限 IPC 桥接）
- `desktop/renderer/src/main.tsx`（来源标题栏控件与状态呈现）
- `shared/source-preview.ts`（来源窗口状态契约，如需暴露阅读模式）
- `shared/desktop-contracts.ts`（本地持久化状态契约）
- `desktop/main/window-state.ts`（状态读取、校验和原子写入）
- `tests/unit/source-reading-preferences.test.ts`（新增：偏好校验、按 origin 隔离、回退）
- `tests/unit/source-preview.test.ts`（更新：状态与阅读模式）
- `tests/integration/source-window-reading.test.ts`（新增：UA 切换、缩放恢复、窗口拉伸不重载）

## 8. 技术参考

- [Electron `WebContentsView`](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Vivaldi Web Panels](https://help.vivaldi.com/desktop/panels/web-panels/)
- [Vivaldi Web Panels for Web Developers](https://help.vivaldi.com/developers/web/vivaldi-web-panels-for-web-developers/)
