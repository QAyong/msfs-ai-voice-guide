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
