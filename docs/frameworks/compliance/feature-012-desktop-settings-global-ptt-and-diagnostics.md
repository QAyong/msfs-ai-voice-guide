# Feature-012：设置、全局按住说话和诊断导出的框架合规记录

**状态：** 设计阶段，未实施  
**对应规格：** [Spec-012](../../specs/spec-012-desktop-settings-localization-global-ptt-and-diagnostics.md)  
**对应决策：** [ADR-010](../../adr/adr-010-secure-desktop-settings-global-ptt-and-diagnostics.md)

## 项目内复用边界

- `desktop/main/index.ts`、`desktop/preload/index.ts` 和 `desktop/renderer/src/main.tsx` 已提供可信 Utility Window、上下文隔离和白名单 IPC；服务设置不能退回 Renderer `localStorage`。
- `src/config/schema.ts` 是最终配置 Zod 边界；`src/providers/registry.ts` 仍是 LLM/STT/TTS 的唯一创建入口；`src/search/` 保持网页搜索边界。
- `shared/voice-control.ts` 与 `src/agent/guide-agent.ts` 已定义 `manual`、`startTurn`、`endTurn`、`cancelTurn` 和同一 LiveKit Session 的规则。全局键盘/鼠标侧键模块只能驱动这些既有动作。
- `desktop/main/agent-runtime.ts` 已拥有 Worker 生命周期和 stdout/stderr 接收点，适合接入结构化日志、脱敏和候选 Worker 切换。

## 官方能力与采用方式

| 能力                    | 官方依据                                                                                                                                                                                                                                                                                                                                                      | 采用方式                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Renderer 隔离和最小 IPC | [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[`contextBridge`](https://www.electronjs.org/docs/latest/api/context-bridge)                                                                                                                                                                                                   | Preload 只暴露设置 DTO、保存、全局键位状态和导出结果；主进程校验发送方与 Zod 输入。                        |
| OS 凭据保护             | [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)                                                                                                                                                                                                                                                                             | 仅主进程加解密服务凭据；读取 DTO 只返回配置状态。                                                          |
| 全局按下和松开事件      | [Windows LowLevelKeyboardProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelkeyboardproc)、[Windows LowLevelMouseProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelmouseproc)、[SetWindowsHookExW](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowhookexw)、[Node-API](https://nodejs.org/api/n-api.html) | Windows N-API 桥接安装 `WH_KEYBOARD_LL` / `WH_MOUSE_LL`，只把选中键或标准侧键的 press/release 转交主进程。 |
| 不采用的近似实现        | [Electron `globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut)                                                                                                                                                                                                                                                                       | 不用作按住说话主实现，因为该 API 不提供可靠 release 生命周期。                                             |
| Room/语音会话           | [LiveKit Session management](https://docs.livekit.io/frontends/build/sessions/)                                                                                                                                                                                                                                                                               | 主进程键盘状态只调用现有 RPC，始终复用当前 Session、麦克风、STT 和消息管线。                               |

## 实施前核验

1. 在 Electron 43.1.1 的 Windows 打包态验证 N-API ABI、签名、加载失败路径、`WH_KEYBOARD_LL` 按下/松开事件及资源释放。
2. 验证 `Left Alt`、`F8`、`F9`、`Right Ctrl`、`Caps Lock`、`Space`、`Mouse X1` 和 `Mouse X2` 在 MSFS 前台、助手窗口关闭、Room 断开和辅助功能键盘环境中的行为；仅在语音可用时消费匹配输入，不截获未匹配键盘或鼠标输入。
3. 在目标 Windows 版本验证 `safeStorage` 可用性、损坏 blob 和凭据迁移；确保任何失败不产生明文设置文件。
4. 选择 ZIP 归档实现后，记录其固定版本、许可证、流式写入、临时文件清理能力与安全更新策略到框架登记表。
5. 在当前安装的 LiveKit 类型定义中复验受控重连、`manual`、`commitUserTurn()`、`clearUserTurn()` 和断开清理顺序。

## 明确不采用

- 不使用 Renderer 浏览器存储、明文 JSON、日志或 ZIP 保存服务密钥。
- 不使用 `globalShortcut`、轮询键盘状态或自定义音频协议模拟按住/松开。
- 不记录未匹配按键、鼠标轨迹、滚轮、全局文本输入、活动窗口标题或系统剪贴板。
- 不自动上传包含对话记录的诊断包。
