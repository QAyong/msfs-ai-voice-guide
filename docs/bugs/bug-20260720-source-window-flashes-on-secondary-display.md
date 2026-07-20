# Bug：扩展屏上打开来源浏览窗时出现闪跳

**日期：** 2026-07-20

**优先级：** 中

**状态：** 待修复

## 复现步骤

1. 将系统连接一块扩展屏（第二显示器）。
2. 把聊天面板拖到扩展屏上。
3. 触发 AI 回答中的来源入口，打开网页预览（来源浏览窗）。

## 实际结果

来源浏览窗首先出现在主屏幕中央，然后非常迅速地跳到聊天面板旁边的伴随位置。虽然最终位置正确，但这个从主屏到扩展屏的瞬间位移产生了明显的"闪"感，视觉体验不佳。

## 预期结果

来源浏览窗在首次显示时就直接出现在聊天面板旁的正确伴随位置，不产生可感知的位置跳动。

## 原因分析

`createSourceWindow()` 创建 `BrowserWindow` 时没有指定初始 `x`、`y` 坐标。Electron 默认把新窗口放在主显示器中央。窗口创建完成后，`source:open` / `source:open-preview` 的 IPC 处理程序才调用 `positionSourceNextToAssistant()` 将来源窗移到聊天面板旁。

当聊天面板位于扩展屏时，这两步之间存在一帧或几帧的时间差，窗口先渲染在主屏中央，再跳到扩展屏，造成可见的闪跳。

## 修复方案

1. 在 `createSourceWindow()` 中，创建 `BrowserWindow` 之前先调用 `placeCompanionWindow()` 计算出来源窗的初始伴随坐标，将 `x`、`y` 直接传入 `BrowserWindow` 构造参数。
2. 同时设置 `show: false`，等 `ready-to-show` 事件触发后再调用 `window.show()`，确保窗口在正确位置和内容都就绪后才显示。
3. 在 `source:open` 和 `source:open-preview` 的 IPC 处理程序中，`positionSourceNextToAssistant()` 仍然保留，用于窗口已存在时的位置校正，但首次创建不再依赖它。

## 影响范围

- `desktop/main/index.ts`：`createSourceWindow()` 函数和 `source:open` / `source:open-preview` IPC 处理程序。
- 多显示器场景（尤其是聊天面板不在主屏时）。

## 验收条件

- 聊天面板在扩展屏时，来源浏览窗首次出现即在聊天面板旁，无可感知的位置跳动。
- 聊天面板在主屏时，行为与之前一致，来源窗出现在聊天面板旁。
- 来源窗被关闭后重新打开，同样不出现闪跳。
