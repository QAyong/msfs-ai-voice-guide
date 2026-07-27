# Spec-012：桌面服务设置、双语、全局按住说话与诊断导出

**日期：** 2026-07-25  
**状态：** 部分实现
**前置决策：** [ADR-010](../adr/adr-010-secure-desktop-settings-global-ptt-and-diagnostics.md)

## 目标

将现有偏好弹窗重构为桌面设置中心。用户可以配置现有 LLM、STT、TTS 和网页搜索服务，设置中英文体验，选择全局按住说话键，并在发生问题时导出包含对话上下文但不包含任何密钥或认证材料的诊断 ZIP。

## 设置界面

设置窗口是单个可信 Electron Utility Window。它在现有偏好设置视图中使用左侧**纵向**导航，只提供以下两个一级页面；右侧内容区独立滚动，底部操作栏固定：

| 页面     | 内容                                                                                                          | 生效方式                               |
| -------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 通用     | 应用语言、置顶、回答音量、来源打开方式、界面动效、当前语音模式、全局按住说话按键/鼠标侧键、就绪状态与诊断导出 | 点击“保存”；关闭或取消丢弃未保存的修改 |
| 服务配置 | DeepSeek LLM、豆包 STT、豆包 TTS、豆包网页搜索的固定配置                                                      | “保存并重新连接”                       |

“通用”页以语言为第一项，随后按飞行体验、来源浏览、语音输入和诊断与支持分组。诊断与支持只显示简洁的就绪状态和“导出诊断包”操作，不另设诊断页。通用页底部主按钮文案固定为“保存”；服务配置页固定为“保存并重新连接”。

服务页可从本机 `.env` 加载 DeepSeek、豆包和网页搜索的既有凭据，并在受信任的 Electron 设置窗中以遮罩字段显示；用户通过每个字段的显示/隐藏控件决定是否查看明文。该能力不授予来源网页或普通浏览器预览，凭据不得复制到剪贴板、日志或诊断包。留空代表保留已存值；清除凭据需要二次确认。

语言下拉只提供“简体中文”和“English”。保存后，语言切换可信 UI 的所有本地化文案、无障碍标签、状态和错误提示；主助手、设置、菜单及来源窗口的可信工具栏均随之切换。既有对话记录、网页来源原文和用户输入不自动翻译，服务地址、模型名和音色名等技术值也不翻译。语言更改成功并重连后，新的 Agent 会话以同一语言回复。英文模式把 STT 默认值设为 `en`，但不替换用户已配置的 TTS 音色。

## 全局按住说话

“通用”页的语音输入分组把“按住说话输入”作为键盘/鼠标侧键设置，而非语音交互模式选择。控件以可点选的键盘/鼠标设备图呈现四个常用预设，并提供自定义键盘录入：

| 预设       | 设备位置与说明                             |
| ---------- | ------------------------------------------ |
| `Left Alt` | 默认；键盘左侧 `Alt`，按住时不会传给模拟器 |
| `F8`       | 键盘功能键                                 |
| `Mouse X1` | 鼠标左侧拇指位的后方侧键；常见“后退”键     |
| `Mouse X2` | 鼠标左侧拇指位的前方侧键；常见“前进”键     |

自定义录入仅接受一个键。左侧 `Alt`（`AltLeft`）是唯一允许的修饰键；`AltRight`、`Ctrl`、`Shift`、`Win`、系统保留组合和不支持的扫描码必须拒绝，并显示可本地化错误。鼠标自定义只支持上述两个标准侧键，不记录鼠标移动、滚轮或其他鼠标按钮。首次升级时保留当前应用内 `Space` 偏好；全新设置默认 `AltLeft`。启用语音且 Room 就绪时，原生钩子必须消费匹配输入的 press/release，避免默认左 `Alt` 或已选侧键同时触发 MSFS 操作。

Windows 下的原生桥接必须只匹配已配置的单键或鼠标侧键并发出 press/release，不能作为按键记录器或鼠标监控器。主进程收到 press 后调用既有按住说话开始逻辑；收到 release 后提交当前轮次。语音可用期间必须消费匹配输入，未匹配的键盘与鼠标输入继续交给系统和 MSFS。重复 press、丢失 release、Room 断开、Agent 出错、切换语音模式、禁用语音和应用退出均不得让录音保持开启。

非 Windows 平台、桥接模块加载失败或无可用 Room 时，设置页将全局按住说话显示为不可用，不注册 Electron `globalShortcut` 作为不完整回退；窗口内的既有鼠标按住说话继续可用。

## 服务与配置模型

新增版本化公共设置 DTO，至少包含：

```ts
type SupportedLocale = 'zh-CN' | 'en-US';
type GlobalPushToTalkKey =
  'AltLeft' | 'F8' | 'F9' | 'ControlRight' | 'CapsLock' | 'Space' | 'MouseX1' | 'MouseX2' | string;

type PublicSettings = {
  schemaVersion: 1;
  locale: SupportedLocale;
  voice: { globalPushToTalkKey: GlobalPushToTalkKey };
  appearance: {
    alwaysOnTop: boolean;
    agentVolume: number;
    openSourcesInApp: boolean;
    interfaceMotion: boolean;
  };
  services: {
    llm: { baseUrl: string; model: string; apiKeyConfigured: boolean };
    stt: { endpoint: string; resourceId: string; model: string; apiKeyConfigured: boolean };
    tts: {
      endpoint: string;
      resourceId: string;
      speaker: string;
      sampleRate: number;
      credentialsConfigured: boolean;
    };
    search: { endpoint: string; timeoutMs: number; apiKeyConfigured: boolean };
  };
};
```

读取 DTO 与写入请求分离。写入请求可短暂含有用户刚输入的秘密值，读取 DTO 永远不得含秘密值。Preload、Renderer 表单和 `ipcMain.handle` 全部使用同一 Zod Schema 校验；端点仅接受规定的 `https:`/`wss:` 协议，超时和采样率遵守现有边界。

保存服务前执行无网络的结构和凭据组合校验；用户点击“测试服务”后才发起有超时、脱敏错误与速率限制的远程检查。网页搜索 Key 缺失不阻止其他设置保存，但 Agent 不注册 `searchWeb`。

## 重连与失败处理

服务或语言更改不得在现有 Agent 实例上静默修改。主进程先构造并校验候选配置，启动候选 Worker 并完成就绪检查，再让 Renderer 结束旧 Room、申请新 Token 并建立新 Room；仅成功后提交持久设置并停止旧 Worker。若任一阶段失败，保留旧 Worker、旧 Room 和最后一份有效设置，Renderer 显示稳定的、可本地化错误码。

## 当前实现状态（2026-07-27）

已完成设置的双页纵向布局、通用偏好保存、受信任设置窗中的遮罩凭据显示/隐藏、`safeStorage` 加密保存、主助手、设置与来源窗口可信工具栏的中英文切换，以及语言切换后新 Agent 会话的回复语言和 STT 默认语言切换。

已完成 Windows 全局按住说话：

- `native/global-ptt` 使用 Windows `WH_KEYBOARD_LL` / `WH_MOUSE_LL`，仅匹配已配置的单键或 `Mouse X1/X2`。匹配输入的 press/release 会被消费；未匹配输入不记录、不传给 Renderer，继续交由系统和 MSFS。
- 原生模块只把匹配输入的 `press` / `release` 转给主进程；主进程经白名单 IPC 将其交给现有 LiveKit 按住说话流程。重复 press 幂等；改键、断线、切换模式与退出会取消活跃轮次。
- 通用设置页使用键盘/鼠标点选器直接选择 `Left Alt`、`F8`、`Mouse X1` 或 `Mouse X2`。鼠标图将两个侧键均放在右手鼠标左侧拇指位，并标注前进 `X2` 与后退 `X1`；自定义录入仅接受一个受支持的键盘键。
- `node-gyp` 在 Windows 构建 N-API `.node` 模块；桌面构建会将其暂存到 `out/main/native`。类型检查、完整 Vitest 套件、原生模块加载/启停烟测和桌面构建均已通过。

以下验收项仍未完成，界面不得暗示其已经可用：

- 服务页已形成候选配置、隔离候选 Worker、Room 重连与失败回滚链路；候选会话连接成功后才提交设置并停止旧 Worker。经 Windows `safeStorage` 保存的凭据会仅在主进程中注入实际 Agent 配置。每个服务均可在不保存草稿的前提下进行连通性检测；检测具有 10 秒超时、脱敏错误反馈与 2.5 秒限流。
- 诊断 ZIP、日志保留、脱敏、系统保存对话框和原子归档写入均未实现；“导出诊断包”必须保持不可用。
- 键位校验与按住/松开状态机已有自动化测试；MSFS 前台 Windows 人工验收、诊断脱敏与 ZIP 清单测试仍待完成。

### 服务可用性检测

检测使用当前表单中的非敏感参数及本次输入的凭据更新，同时合并 Windows `safeStorage` 中已保存的凭据；它不会保存配置、变更 Agent 会话或向渲染进程返回密钥。

- DeepSeek：请求模型列表，并确认当前选择的模型在可用列表中。
- 火山 STT：建立带资源标识和鉴权头的 WebSocket 连接。
- 火山 TTS：建立 WebSocket 连接并等待 `ConnectionStarted` 协议事件。
- 网页搜索：发起一条最小化的搜索请求，并仅依据 HTTP 成功状态判断服务端可达。

界面为每一项服务分别显示“检测中”、可用（含耗时）或不可用/限流状态。失败信息必须是可行动但不包含服务响应正文、URL 查询参数或任何凭据的提示。

## 诊断 ZIP

主进程维护主进程和 Worker 的 JSON Lines 日志，最长保留 7 天、总量不超过 10 MiB。日志和 ZIP 可以包含：

- 用户文字、用户语音转写和 Agent 回答；
- 会话状态、工具调用摘要、搜索查询与来源、MSFS 状态；
- Provider/Worker 错误、堆栈摘要、重试和重连时间线；
- 应用、Electron、Node、Windows 和依赖版本。

日志与 ZIP 必须排除或替换为 `[REDACTED]` 的内容：API Key、Access Token、API Secret、LiveKit JWT、认证 Header、Cookie、`.env` 原文、凭据加密 blob，以及 URL 查询参数中的认证内容。

导出由主进程打开系统保存对话框，流式写入临时 `.zip`，成功后原子移动到用户选定位置。Renderer 不接收文件系统路径的控制权、日志原文或 ZIP 内容。ZIP 固定包括：

- `manifest.json`：格式版本、应用/运行时版本、时间范围和脱敏计数；
- `logs/main.ndjson` 与 `logs/worker.ndjson`；
- `conversation.ndjson` 和 `tool-events.ndjson`；
- `readiness.json` 与 `configuration-summary.json`。

## 验收标准

- [ ] 设置窗口仅有“通用”和“服务配置”两个左侧纵向一级导航；通用页包含语言、语音和诊断导出，且底部主按钮为“保存”。
- [ ] 设置页可以配置固定的 DeepSeek、豆包 STT、豆包 TTS 与豆包网页搜索；密钥只显示配置状态，服务配置页的主按钮为“保存并重新连接”。
- [ ] Windows `safeStorage` 可用时凭据加密持久化；不可用时拒绝明文持久化，并保留 `.env`/环境变量兼容路径。
- [ ] 保存 English 后，所有可信 UI（含主助手、设置、菜单、来源窗口工具栏、状态、错误和无障碍标签）显示英语；既有对话、网页原文、用户输入和技术配置值不被翻译，新的 Agent 会话以英语回复且 STT 使用 `en`。
- [ ] 默认 `AltLeft` 及 `F8`、`Mouse X1`、`Mouse X2` 可在 MSFS 前台按下/松开时分别开始/结束同一按住说话轮次，且匹配键或鼠标侧键不会同时传给 MSFS。
- [ ] 自定义单键可用，修饰键和系统保留键拒绝；连续对话模式、断线、钩子异常和应用退出不会留下活跃录音轮次。
- [ ] 全局按住说话不记录未匹配按键，不将键流或窗口标题写入日志或发送给 Renderer。
- [ ] 服务/语言切换失败保留旧有效会话；成功时无旧 Token、旧 Worker 或麦克风轨道泄漏。
- [ ] ZIP 包含对话、转写、工具与服务诊断上下文，但不包含任一密钥、认证 Header、Cookie、JWT、`.env` 或凭据 blob。
- [ ] ZIP 可由标准归档工具打开；取消、磁盘满、路径无权限或归档失败时不遗留部分目标文件。
- [ ] 单元测试覆盖 Zod 边界、密钥 DTO、键位校验、press/release 状态机、脱敏器、日志保留和 ZIP 清单；Windows 人工验证覆盖 MSFS 前台的全局键位。

## 相关官方依据

- [Electron 安全教程](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Electron `globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Windows LowLevelKeyboardProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelkeyboardproc)
- [Windows LowLevelMouseProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelmouseproc)
- [Node-API](https://nodejs.org/api/n-api.html)
- [LiveKit Frontend Session management](https://docs.livekit.io/frontends/build/sessions/)
