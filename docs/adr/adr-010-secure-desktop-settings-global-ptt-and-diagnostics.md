# ADR-010：可信桌面设置、全局按住说话与可导出诊断

**日期：** 2026-07-25  
**状态：** 已采用

## 背景

现有桌面设置只保存无敏感偏好，LLM、STT、TTS 和网页搜索仍依赖用户手工编辑 `.env`；设置界面不能安全配置服务。应用也没有长期、结构化的诊断日志，开发人员无法获得用户现场的 Worker、服务调用和对话上下文。

用户要求设置“按住说话”的键盘按键或鼠标侧键，且该输入必须在 Microsoft Flight Simulator 位于前台时全局有效。现有按住说话只使用助手窗口内的键盘事件，不能满足此要求。Electron `globalShortcut` 只适合注册按下触发的全局快捷键，不能提供实现按住说话所必需的可靠按键松开事件。

## 决策

### 设置、配置和凭据

桌面设置由 Electron 主进程作为唯一读写入口，分成以下三个存储域：

| 存储域         | 内容                                                      | 位置与可见性                                                                       |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 用户偏好       | UI/对话语言、语音模式、全局按住说话按键、音量、置顶、动效 | `userData` 下版本化 JSON；Renderer 可通过受限 IPC 读写                             |
| 服务非秘密配置 | 固定 Provider 的端点、模型、资源 ID、音色、超时与配置状态 | 同一 JSON；Renderer 可通过受限 IPC 读写                                            |
| 服务凭据       | API Key、Access Token、Provider App ID 等                 | Electron `safeStorage` 加密的独立 blob；可信设置窗可读取当前有效值并以遮罩字段回显 |

服务范围固定为 DeepSeek LLM、豆包 STT、豆包 TTS 和豆包网页搜索。设置页只配置这些现有实现，不引入动态 Provider 安装、自动回退或运行时多 Provider 路由。最终配置仍必须由 `src/config/schema.ts` 的 Zod Schema 解析，Provider 仍仅由 `src/providers/registry.ts` 创建，搜索仍仅由 `src/search/` 提供。

`safeStorage.isEncryptionAvailable()` 不可用时，应用不得将密钥明文写进设置 JSON；应报告无法持久化凭据并允许继续使用既有 `.env` 或进程环境变量。配置优先级为：进程环境变量、受保护的桌面设置、本地 `.env`、安全默认值。旧 `.env` 仅在用户确认后迁移，绝不自动删除。

本地开发与单用户桌面配置允许设置页读取当前有效的服务凭据，包括进程环境、本机 `.env` 与 `safeStorage` 中已保存的值，并在受信任的 Electron Utility Window 中以密码字段回显。初始未配置时输入框必须为空；已配置时默认显示密码圆点；用户点击眼睛后才显示真实值。App ID、API Key、Access Token 和 Secret 采用同一显示规则。该 IPC 仅授予 Utility Window，不授予主助手、远程网页、来源窗口或普通浏览器预览，且凭据不得写入日志、诊断包或复制到剪贴板。

设置使用现有可信设置视图中的左侧纵向导航，仅提供“通用”和“服务配置”两个一级页面。“通用”收纳语言、飞行体验、来源浏览、语音输入（含全局按住说话）和诊断导出；“服务配置”收纳固定 Provider 配置和凭据状态。右侧内容独立滚动，底部操作栏固定。通用设置在用户点击“保存”后提交；服务配置仅通过“保存并重新连接”提交。关闭或取消设置不得提交草稿。

### 语言

设置页的“通用”页以“简体中文”和“English”作为统一语言项。保存后，该项同步决定可信 Renderer 文案和无障碍标签、Agent 提示词和回答语言、以及 STT 的默认语言（分别为 `zh` 与 `en`）。可信 UI 包括主助手、设置、菜单、来源窗口工具栏、状态和错误提示；既有对话记录、网页来源原文、用户输入和服务技术值不自动翻译。

内置 TTS 音色按项目语言对齐：中文默认使用 Vivi，英文默认使用 Dacey，Stokie 可选；自定义 speaker ID 不因语言切换被覆盖。已下线的 Tim 只作为旧配置迁移输入，英文迁移到 Dacey，中文迁移到 Vivi。音频试听样例只读取项目内 `resources/tts/confirmed-voices/`，不从远程音色目录或用户目录扫描。

服务、语言或音色修改保存后，统一通过主进程的 `settings:save-settings` 请求校验并保存候选配置，重启 Agent Worker，等待就绪后通知 Renderer 重连新 Room。任一步失败时恢复最后一次有效配置、凭据和语言，并返回脱敏错误信息；Renderer 的保存按钮显示保存中、成功或可重试的失败状态。

### 全局按住说话输入绑定

全局按住说话使用 Windows 低级键盘和鼠标钩子 `WH_KEYBOARD_LL` / `WH_MOUSE_LL`，通过一个受限的 N-API 原生桥接模块只向 Electron 主进程发送经过匹配的 `keydown` / `keyup` 或鼠标侧键 press/release 事件。不得把任意全局输入流、按键内容、鼠标轨迹或窗口标题传给 Renderer、日志或 Agent。主进程只在用户选择了按住说话模式且 Room 已就绪时安装/启用该钩子。

默认全局输入为左侧 `Alt`（`AltLeft`）；设置页提供 `Left Alt`、`F8`、`F9`、`Right Ctrl`、`Caps Lock`、`Space`、`Mouse X1`（后侧键）和 `Mouse X2`（前侧键）八个预设，以及一个单键自定义录入项。第一版不支持多键组合和任意鼠标按键录入，避免修饰键和游戏快捷键的歧义。`AltLeft` 是唯一允许作为单键绑定的修饰键；`AltRight`、`Win`、`Ctrl`、`Shift` 等其他单独修饰键，以及系统保留组合均不可保存。用户选择 `Caps Lock` 时，应用只观察按下/松开，不修改键盘锁定状态。

匹配输入按下时，主进程通过受控通道触发既有 `startTurn`；同一物理输入在未松开前重复事件必须幂等。语音可用期间，原生钩子消费匹配输入的按下与松开，避免 MSFS 同时响应绑定键或鼠标侧键，特别是默认的 `AltLeft`。匹配输入松开时调用 `endTurn`。在断线、切换为连续对话、禁用语音、切换设置、钩子错误、应用退出或焦点/会话失效时，应用必须调用 `cancelTurn` 并解除输入的 held 状态，确保不会留下悬挂录音回合。

按住说话仍复用一个 LiveKit Session、同一麦克风轨道、STT 实例、转写和会话消息管线；Agent 端继续使用 `manual`、`commitUserTurn()` 和现有 RPC。不得通过全局按键新建 Room、绕开 LiveKit RPC 或自行传输音频。

### 日志与 ZIP 导出

主进程写入结构化 JSON Lines 日志，并捕获 Agent Utility Process 的 stdout/stderr。日志及导出包可以保留对话记录：用户文字、用户转写、Agent 回复、工具调用摘要、搜索查询与来源、MSFS 就绪状态、服务调用时间线、错误码和堆栈摘要，以便开发人员复现问题。

唯一强制排除和脱敏的类别是密钥与认证材料：API Key、Access Token、API Secret、LiveKit JWT、Bearer/Authorization Header、Cookie、`.env` 原文、加密凭据 blob，以及任何 URL 查询参数中的上述值。写入、就绪诊断和导出前均须使用同一个脱敏器。

日志最多保留 3 天且总量不超过 5 MiB。导出动作由主进程打开系统保存对话框并流式创建 ZIP；Renderer 不提供路径、不读取日志目录和 ZIP 内容。ZIP 至少包含 `manifest.json`、脱敏后的主/Worker 日志、`readiness.json`、`configuration-summary.json` 和对话/工具事件记录。归档完成前写入临时文件，成功后原子替换目标；失败或取消不保留部分文件。

## 原因

- `safeStorage` 和最小化 IPC 将凭据限制在主进程与可信设置 Utility Window；主助手 Renderer、远程网页和来源预览不能读取凭据，同时终端用户仍可显式查看和修改自己的配置。
- Windows 低级键盘钩子是获取全局按下与松开的原生机制，适合按住说话；仅用 `globalShortcut` 会无法判断何时提交用户回合。
- 预设按键降低配置门槛，单键限制减少与模拟器及系统快捷键冲突。
- 诊断包保留对话与工具上下文能显著提升问题定位能力；统一脱敏器则将真正不能外泄的认证材料隔离出去。

## 影响

- 本 ADR 被接受后，应修订 ADR-003 和 `AGENT.md` 的“密钥只能来自环境变量”描述，将主进程受 OS 保护的凭据存储纳入受限来源；业务模块仍不得读取该存储。
- 新增共享 Settings、Diagnostics 和 Global PTT IPC 契约，所有请求和响应在主进程边界以 Zod 校验。
- 新增 Windows N-API 构建、签名、打包及版本兼容性验证；不可在 macOS/Linux 上伪造全局按住说话成功状态。
- 设置、键盘钩子、键位迁移、服务重启回滚、日志脱敏/保留和 ZIP 清单均需自动化测试与 Windows 人工验证。

## 不在此决策范围内

- 运行时多 Provider 切换、服务账号登录、云端密钥托管和自动故障转移。
- 多键组合、任意鼠标键/滚轮、游戏手柄、语音唤醒、录音保存、键位同步到 MSFS；第一版仅支持标准鼠标侧键 `Mouse X1` / `Mouse X2`。
- 对话记录、日志或 ZIP 的自动上传；用户必须显式选择导出位置并自行交付。

## 官方依据

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Electron `contextBridge`](https://www.electronjs.org/docs/latest/api/context-bridge) 与 [IPC 教程](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron `globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Windows LowLevelKeyboardProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelkeyboardproc) 与 [SetWindowsHookExW](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowhookexw)
- [Windows LowLevelMouseProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelmouseproc)
- [Node-API](https://nodejs.org/api/n-api.html)
- [LiveKit Session management](https://docs.livekit.io/frontends/build/sessions/)
