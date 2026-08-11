# Feature-012：设置、全局按住说话和诊断导出的框架合规记录

**状态：** 已实施；待 Windows/MSFS 人工验收
**对应规格：** [Spec-012](../../specs/spec-012-desktop-settings-localization-global-ptt-and-diagnostics.md)  
**对应决策：** [ADR-010](../../adr/adr-010-secure-desktop-settings-global-ptt-and-diagnostics.md)

## 项目内复用边界

- `desktop/main/index.ts`、`desktop/preload/index.ts` 和 `desktop/renderer/src/main.tsx` 已提供可信 Utility Window、上下文隔离和白名单 IPC；服务设置不能退回 Renderer `localStorage`。
- `src/config/schema.ts` 是最终配置 Zod 边界；`src/providers/registry.ts` 仍是 LLM/STT/TTS 的唯一创建入口；`src/search/` 保持网页搜索边界。
- `shared/desktop-settings.ts` 统一维护支持语言、默认 TTS speaker、内置音色语言对齐和桌面设置保存 Schema；旧 Tim speaker 只作为兼容迁移输入，不作为可选音色。
- `resources/tts/confirmed-voices/` 是桌面试听样例的唯一资源目录；`desktop/main/index.ts` 通过白名单 IPC 返回本地音频数据，Renderer 只按项目语言过滤和播放。
- `scripts/stage-tts-voice-samples.mjs` 在构建时先清空 `out/tts` 再复制样例，确保删除或替换的音色不会从旧构建目录残留到安装资源。
- `shared/voice-control.ts` 与 `src/agent/guide-agent.ts` 已定义 `manual`、`startTurn`、`endTurn`、`cancelTurn` 和同一 LiveKit Session 的规则。全局键盘/鼠标侧键模块只能驱动这些既有动作。
- `desktop/main/agent-runtime.ts` 已拥有 Worker 生命周期和 stdout/stderr 接收点，适合接入结构化日志、脱敏、重启和失败回滚。

## 官方能力与采用方式

| 能力                    | 官方依据                                                                                                                                                                                                                                                                                                                                                      | 采用方式                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Renderer 隔离和最小 IPC | [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[`contextBridge`](https://www.electronjs.org/docs/latest/api/context-bridge)                                                                                                                                                                                                   | Preload 只暴露已校验的全局键位配置、可用状态及匹配后的 `press` / `release` / `cancel`；主进程校验发送方与 Zod 输入。                       |
| OS 凭据保护             | [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)                                                                                                                                                                                                                                                                             | 仅主进程加解密服务凭据；读取 DTO 只返回配置状态。                                                                                          |
| 全局按下和松开事件      | [Windows LowLevelKeyboardProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelkeyboardproc)、[Windows LowLevelMouseProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelmouseproc)、[SetWindowsHookExW](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowhookexw)、[Node-API](https://nodejs.org/api/n-api.html) | `native/global-ptt` 的 Windows N-API 桥接安装 `WH_KEYBOARD_LL` / `WH_MOUSE_LL`；仅匹配配置键或标准侧键，消费匹配输入并转交 press/release。 |
| 不采用的近似实现        | [Electron `globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut)                                                                                                                                                                                                                                                                       | 不用作按住说话主实现，因为该 API 不提供可靠 release 生命周期。                                                                             |
| Room/语音会话           | [LiveKit Session management](https://docs.livekit.io/frontends/build/sessions/)                                                                                                                                                                                                                                                                               | 主进程键盘状态只调用现有 RPC，始终复用当前 Session、麦克风、STT 和消息管线。                                                               |

## 已完成核验

1. 已用 `node-gyp` 编译 Windows x64 N-API 模块，并验证模块可加载、注册 `F8` 钩子及停止释放；`desktop:build` 会构建并暂存模块。
2. 已验证 Zod 键位边界及重复 press/release、禁用时取消活跃轮次的状态机单元测试。
3. 设置使用键盘/鼠标设备点选器：键盘提供 `Left Alt`、`F8` 和自定义录入；鼠标提供位于左侧拇指位的 `X1`（后退）及 `X2`（前进）。
4. 已验证设置页的 TTS 样例读取、按项目语言过滤、Dacey/Stokie 英文音色、自定义 speaker ID 和本地试听按钮；Tim 不再出现在样例目录或可选列表中。
5. 已验证统一 `settings:save-settings` 保存链路会重启 Agent Worker、通知 Renderer 重连，并在失败时恢复有效配置；保存按钮提供保存中、成功和失败可重试状态。
6. 已验证 `desktop:build` 会清理并重新暂存 `out/tts`，构建输出不会保留已删除的 Tim 样例。

## 桌面 TTS 音色配置

桌面设置的 TTS 音色不是独立 Provider 注册表。运行时仍由 `src/providers/tts/volcengine.ts` 使用 `speaker` 建立豆包双向流式 TTS；桌面层只负责安全编辑、语言对齐、本地试听和保存重连。

- 中文默认 `zh_female_vv_uranus_bigtts`（Vivi）。
- 英文默认 `en_female_dacey_uranus_bigtts`（Dacey），`en_female_stokie_uranus_bigtts`（Stokie）可选。
- 自定义 speaker ID 原样保留，不因语言切换被覆盖。
- 已下线的 `en_male_tim_uranus_bigtts` 只在读取旧配置时参与迁移：英文迁移到 Dacey，中文迁移到 Vivi。
- 音频样例只来自 `resources/tts/confirmed-voices/`；构建 staging 负责清理旧输出，避免资源目录与 `out/tts` 不一致。

## 待完成核验

1. 在 Electron 43.1.1 的 Windows 打包态验证 N-API ABI、签名及加载失败路径。
2. 验证 `Left Alt`、`F8`、`Mouse X1` 和 `Mouse X2` 在 MSFS 前台、助手窗口关闭、Room 断开和辅助功能键盘环境中的行为；仅在语音可用时消费匹配输入，不截获未匹配键盘或鼠标输入。
3. 在目标 Windows 版本验证 `safeStorage` 可用性、损坏 blob 和凭据迁移；确保任何失败不产生明文设置文件。
4. 验证 Windows 系统保存对话框取消、目标文件已存在、磁盘满与无写权限时，临时 ZIP 会清理且不会留下部分目标文件。
5. 在当前安装的 LiveKit 类型定义中复验受控重连、`manual`、`commitUserTurn()`、`clearUserTurn()` 和断开清理顺序。

## 已完成诊断实现

1. 使用固定版本 `archiver` 7.0.1（MIT）流式创建标准 ZIP，并在框架登记表记录版本和官方文档。
2. 主进程按日写入 main、Worker、conversation、tool-events JSON Lines，统一执行对象字段、Bearer Header 和 URL 敏感查询参数脱敏；日志保留 3 天且总量不超过 5 MiB。
3. 通过 Electron `dialog.showSaveDialog` 选择目标；归档先写同目录临时文件，完成后以 `rename` 原子移动，失败时清理临时文件。
4. 单元测试覆盖脱敏、保留上限和 ZIP 固定清单；Electron-Vite 主/Preload/Renderer 构建通过。

## 明确不采用

- 不使用 Renderer 浏览器存储、明文 JSON、日志或 ZIP 保存服务密钥。
- 不使用 `globalShortcut`、轮询键盘状态或自定义音频协议模拟按住/松开。
- 不记录未匹配按键、鼠标轨迹、滚轮、全局文本输入、活动窗口标题或系统剪贴板。
- 不自动上传包含对话记录的诊断包。
