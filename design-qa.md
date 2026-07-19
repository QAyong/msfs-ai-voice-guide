# 悬浮语音面板与来源浏览窗设计检查

**最后更新：** 2026-07-17

## 检查对象

- Electron 主进程：`desktop/main/index.ts`
- 窗口定位算法：`desktop/main/window-placement.ts`
- React 界面：`desktop/renderer/src/main.tsx`
- 界面样式：`desktop/renderer/src/style.css`
- 早期 HTML 参考：`prototypes/voice-chat-panel.html`

## 当前设计状态

- 收起状态使用 64×72px 透明窗口，上方为 36×14px 可见拖动把手，下方为完整 48px 头像点击区。
- 拖动把手使用 Electron 原生 `app-region: drag`，头像按钮使用 `app-region: no-drag`。两个区域没有重叠，不依赖手动鼠标追踪。
- 头像保留单一蓝色视觉语言，使用克制的渐变、内边框和蓝灰阴影；悬停与按压只改变亮度和位移。
- 展开状态为 320×360px 紧凑聊天面板，标题栏负责原生拖动，交互按钮均排除在拖动区外。
- 来源浏览窗默认 440×600px，始终定位在聊天面板靠屏幕中心的一侧，并在空间不足时自动换边。

## 多显示器行为

- 拖动结束后根据光标所在显示器吸附到最近的左右工作区边缘。
- 展开时从当前停靠边向显示器内部展开，不跳回主屏幕。
- 定位算法保留负坐标，兼容位于主屏左侧或上方的扩展屏。
- 来源浏览窗跟随聊天面板移动、拉伸和跨屏；独立移动结束后恢复伴随位置。
- 显示器新增、移除或工作区变化时重新约束两个窗口。

## 交互与无障碍

- 头像整个圆形区域均可点击展开，并提供明确的 `aria-label` 与提示文本。
- 拖动把手具有可见形态和抓取光标，避免透明外圈造成的操作猜测。
- 点击按钮具有悬停、按压和键盘焦点反馈。
- 头像动效遵循 `prefers-reduced-motion`，系统要求减少动态效果时关闭过渡。
- 远程来源页面位于独立沙箱化 `WebContentsView`，不获得应用 Preload、Node 或权限能力。

## 自动验证

- Prettier：通过。
- TypeScript：通过。
- ESLint：通过。
- Electron/Vite 生产构建：通过。
- 多显示器窗口定位单元测试：4 项通过。

## 人工验证重点

- 在不同缩放比例的两块屏幕之间拖动顶部把手，确认鼠标松开后吸附到当前屏幕边缘。
- 分别从左右边缘点击头像，确认聊天面板向屏幕内部展开。
- 打开来源网页后拖动聊天面板跨屏，确认来源窗始终贴近聊天面板且不越出工作区。
- 在飞行画面上确认把手可辨认，同时不会显著增加遮挡。

## 结论

当前悬浮球采用官方原生拖动区与点击区分离方案，代码构建和定位测试均已通过。最终验收仍需在真实双显示器与模拟飞行画面中完成上述人工检查。

---

# 紧凑语音胶囊设计检查

**最后更新：** 2026-07-17

## 对照证据

- Source visual truth：
  - 空闲态：`C:/Users/Lenovo/.codex/generated_images/019f7069-4f6a-75d1-a47c-fe65beb42947/exec-f40d5a25-a276-4c58-9cb7-29dd582d47ce.png`
  - 激活态：`C:/Users/Lenovo/.codex/generated_images/019f7069-4f6a-75d1-a47c-fe65beb42947/exec-936d74e7-5b1b-4c8e-b6c2-e76694e7baa9.png`
- Implementation screenshots：
  - 空闲态：`C:/Users/Lenovo/.codex/visualizations/2026/07/17/019f7069-4f6a-75d1-a47c-fe65beb42947/voice-capsule-idle.png`
  - 激活态：`C:/Users/Lenovo/.codex/visualizations/2026/07/17/019f7069-4f6a-75d1-a47c-fe65beb42947/voice-capsule-active.png`
- Viewport：589×698，浅色主题。
- Full-view comparison：`C:/Users/Lenovo/.codex/visualizations/2026/07/17/019f7069-4f6a-75d1-a47c-fe65beb42947/voice-capsule-comparison.png`
- Focused region comparison：`C:/Users/Lenovo/.codex/visualizations/2026/07/17/019f7069-4f6a-75d1-a47c-fe65beb42947/voice-capsule-focus-comparison.png`

## 检查结果

- 字体与排版：沿用现有系统字体栈，按钮字号、字重和单行布局与目标一致，无换行或截断。
- 间距与布局：底栏高度 52px；胶囊固定为 160×38px 并水平居中，空闲与激活状态无布局跳动。
- 颜色与视觉令牌：空闲态使用浅蓝填充和细蓝边框；激活态使用 `#2563eb`、白色图标与文字，符合目标层级。
- 图标与资源：麦克风使用项目现有 Phosphor 图标库，没有新增占位图、手绘 SVG 或低清资源。
- 文案与状态：空闲态为“按住说话”，激活态为“松开结束”；5 根音量柱使用同一条 LiveKit 本地音轨的实时分析值。
- 响应性与无障碍：按钮保留 38px 高度、键盘按住操作、焦点描边、`aria-label` 和 `aria-pressed`；窄窗口通过 `max-width` 避免溢出。
- 浏览器控制台：0 条错误。

## 对照迭代历史

1. 首轮发现 [P2] 胶囊宽度为 196px，明显大于目标视觉比例；收紧为 168px。
2. 聚焦对照后继续将宽度统一为 160px，以匹配激活态目标，同时避免空闲/激活切换时发生尺寸跳动。
3. 复查后没有剩余 P0/P1/P2 差异。两个生成目标的空闲态与激活态宽度略有冲突，最终以激活态 160px 为准，这是容纳实时音量柱且保持固定尺寸的有意取舍。

## 测试边界

- 内置浏览器没有可用的真实麦克风设备，真实设备权限和输入幅度需要在 Electron 桌面窗口中手动验收。
- 激活态截图使用临时本地测试状态核验视觉样式；测试状态已通过页面刷新清除，未写入产品代码。

final result: passed

---

# 来源网页布局切换设计检查

**最后更新：** 2026-07-20

本节取代上一节“来源网页设备切换设计检查”。控件只切换网页在现有竖版外框中的排版宽度，不再模拟 iPad、Safari、触控设备或设备像素比。

## 对照证据

- Source visual truth：`C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-a6109e66-2fa8-4047-8b17-458a63048af8.png`
- Implementation screenshots：
  - 竖版默认态：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-layout-portrait.png`
  - 电脑切换态：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-layout-desktop.png`
- 同图对照：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-layout-comparison.png`
- 运行数据：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-layout-runtime.json`
- Viewport：440×600，浅色主题，Electron 官方文档 HTTPS 页面。

## 检查结果

- 图标与顺序：继续使用项目既有 Phosphor `DesktopIcon` 与 `DeviceTabletIcon`，电脑在左、竖版在右；默认竖版为蓝色选中态，与参考图一致。
- 视觉系统：保留 25×26px 按钮、54px 紧凑切换组、白色选中底和轻量阴影，并沿用应用浅色标题栏；没有引入新的图标、颜色或布局体系。
- 文案与无障碍：按钮提示和无障碍名称改为“电脑布局”“竖版布局”，分组名称改为“网页预览布局”，避免让用户误认为是真实设备仿真。
- 竖版排版：默认页面 `window.innerWidth` 为 768，整体缩放进现有竖版伴随窗。
- 电脑排版：切换后同一页面 `window.innerWidth` 为 1280，外框尺寸和标题栏不变。
- 原生滚轮：真实 `mouseWheel` 输入使 `scrollY` 从 0 增至 751.71，说明网页视图直接接收鼠标滚轮，不再经过触控模拟。
- 状态连续性：竖版→电脑→竖版全程使用同一 `WebContentsView`（ID 3），URL、User-Agent 和 `scrollY` 均保持不变；没有页面重载或视图重建。
- 稳定性：实现只调用 Electron 官方 `webContents.setZoomFactor`，不附加调试器，不调用 CDP 设备指标接口，不改写 User-Agent，也不启用触控模拟。

## 自动验证

- ESLint、主工程 TypeScript、Electron TypeScript：通过。
- 布局预览专项测试：2 个测试文件、7 项测试通过。
- 全量回归：24 个测试文件通过、1 个跳过；68 项通过、8 项跳过。
- Electron/Vite 生产构建：主进程、Preload 和 Renderer 构建通过。

## 设计结论

参考图的双图标顺序、默认高亮和紧凑交互已保留；产品语义已从“iPad/电脑设备模拟”纠正为“竖版/电脑网页排版”。同图对照未发现 P0/P1/P2 视觉差异，真实运行验收未发现滚轮、状态保留或模式切换回归。

final result: passed

---

# 来源网页设备切换设计检查

**最后更新：** 2026-07-20

## 对照证据

- Source visual truth：`C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-a6109e66-2fa8-4047-8b17-458a63048af8.png`
- Implementation screenshots：
  - iPad 默认态：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-device-ipad.png`
  - 电脑切换态：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-device-desktop.png`
- Viewport：440×600，浅色主题，HTTPS 原网页加载状态。
- Full-view comparison：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-device-full-comparison.png`
- Focused region comparison：`C:/Users/Lenovo/.codex/visualizations/2026/07/19/019f7aad-a2fa-7020-a314-dc09d8568aed/source-device-focused-comparison.png`

## 检查结果

- 字体与文案：控件仅使用图标，分别提供“电脑预览”和“iPad 预览”的提示、无障碍名称及按下状态，没有额外占用标题栏的可见文字。
- 间距与布局：两个 25×26px 按钮组成 54px 宽紧凑切换组，与现有 48px 标题栏、外部打开和关闭按钮保持同一基线；窄窗下未发生裁切。
- 颜色与状态：默认 iPad 图标为蓝色选中态，电脑图标为中性灰；切换后选中态准确互换，并保留白色选中底和轻量阴影。
- 图标与资源：使用项目既有 Phosphor `DesktopIcon` 与 `DeviceTabletIcon`，没有新增手绘 SVG、字符图标或占位资源。
- 视觉一致性：参考图使用深色工具栏，当前产品使用浅色标题栏；保留参考图的设备顺序、图标语义与蓝色选中关系，并沿用产品现有视觉令牌。这是有意的主题适配，不是遗漏。
- 行为：新来源默认进入 iPad；真实点击可切换到电脑并返回 iPad。切换时保留当前 URL，平板使用 768px 视口、2× DPR、触控模拟和 iPad User-Agent，电脑恢复实际视口与桌面 User-Agent。
- 稳定性：Electron 43 的 `enableDeviceEmulation` 在 `WebContentsView` 上会触发原生退出，最终改用 Chromium `Emulation.setDeviceMetricsOverride`；真实窗口连续完成 iPad→电脑→iPad 切换，未再退出。
- 响应性与无障碍：窗口拉伸会重新计算 iPad 缩放和可见高度；按钮支持鼠标、键盘焦点、悬停提示和 `aria-pressed`。

## 对照迭代历史

1. 首轮实现完成图标顺序、默认态与标题栏布局。
2. 真实窗口验收发现 Electron 设备仿真 API 导致应用原生退出，列为 [P0]；替换为 Chromium 设备指标协议后消除。
3. 复查源图与实现的完整视图及聚焦区域，没有剩余 P0/P1/P2 差异。

## 自动验证

- ESLint、主工程 TypeScript、Electron TypeScript：通过。
- 设备预览专项测试：2 个测试文件、7 项测试通过。
- 全量回归：23 个测试文件通过、1 个跳过；65 项通过、8 项跳过。
- Electron/Vite 生产构建：主进程 25 个模块、Renderer 398 个模块构建通过。

final result: passed

---

# 来源网页布局切换最终复核

**最后更新：** 2026-07-20

“来源网页设备切换设计检查”仅保留为历史实现记录；当前有效结论以“来源网页布局切换设计检查”为准。最新实现默认使用 768px 竖版排版，可切换至 1280px 电脑排版；外框不变、网页不重载、视图不重建，原生滚轮和滚动位置均已通过真实 Electron 窗口验证。

final result: passed
