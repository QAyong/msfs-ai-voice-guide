# Spec-012：桌面服务设置、双语、全局按住说话与诊断导出

**日期：** 2026-08-27<br />
**状态：** 已完成并通过 Windows/MSFS 人工验收（2026-08-17）；键盘选择器交互修复已完成自动检查（2026-08-22）；服务真实检测已完成（2026-08-27）
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

### 豆包 TTS 音色选择

- 设置页只读取项目内 `resources/tts/confirmed-voices/` 的本地音频样例，不扫描用户目录或网络音色列表。
- 主进程根据文件名解析显示名称、speaker ID 和语言；Renderer 按当前项目语言过滤音色。中文默认使用 `zh_female_vv_uranus_bigtts`（Vivi），英文默认使用 `en_female_dacey_uranus_bigtts`（Dacey），英文 `Stokie` 保持可选。
- 每个本地音色都提供试听/停止试听按钮；试听只使用主进程返回的本地音频数据，不改变已保存配置。
- “自定义 speaker ID”始终保留，切换项目语言时不改写任意自定义值；只有已确认的内置音色会按语言切换。
- `en_male_tim_uranus_bigtts` 已从可选音色和资源目录移除。旧配置读取时，英文 Tim 迁移到 Dacey，中文 Tim 迁移到 Vivi，避免旧用户启动后继续使用已下线音色。
- 构建时 `scripts/stage-tts-voice-samples.mjs` 先清理 `out/tts` 再复制资源，防止已删除的旧音色残留在构建输出中。

语言下拉只提供“简体中文”和“English”。保存后，语言切换可信 UI 的所有本地化文案、无障碍标签、状态和错误提示；主助手、设置、菜单及来源窗口的可信工具栏均随之切换。既有对话记录、网页来源原文和用户输入不自动翻译，服务地址、模型名和音色名等技术值也不翻译。语言更改成功并重连后，新的 Agent 会话以同一语言回复。英文模式把 STT 默认值设为 `en`，要求联网检索使用英文并优先英文来源；来源网页请求以 `Accept-Language` 优先英文，切换后会重新加载当前网页。该请求头只表达语言偏好，不强制翻译原网页，未提供英文版的网站仍显示其原始内容。

## 全局按住说话

“通用”页的语音输入分组把“按住说话输入”作为键盘/鼠标侧键设置，而非语音交互模式选择。控件以可点选的键盘/鼠标设备图呈现八个全局预设，并提供自定义键盘录入：

| 预设         | 设备位置与说明                                  |
| ------------ | ----------------------------------------------- |
| `Left Alt`   | 默认；键盘左侧 `Alt`，按住时不会传给模拟器      |
| `F8`         | 键盘功能键                                      |
| `F9`         | 键盘功能键                                      |
| `Right Ctrl` | 键盘右侧 `Ctrl`                                 |
| `Caps Lock`  | 键盘大写锁定键；只观察按下/松开，不改变锁定状态 |
| `Space`      | 键盘空格键                                      |
| `Mouse X1`   | 鼠标左侧拇指位的后方侧键；常见“后退”键          |
| `Mouse X2`   | 鼠标左侧拇指位的前方侧键；常见“前进”键          |

键盘图中另外展示的 `Esc`、`F1`、`F2`、`F12`、`Q`、`W`、`E`、`R`、`T` 也必须是真实可点击按钮，分别映射到 `Escape`、`F1`、`F2`、`F12`、`KeyQ`、`KeyW`、`KeyE`、`KeyR`、`KeyT`。这些按键不是额外的全局预设，而是直接进入同一套自定义键位配置；选择后保留自定义键输入状态。界面不得用看起来可点击、实际没有动作的视觉占位键帽表示可选项。

自定义录入和键帽按钮选择均使用同一套单键校验。左侧 `Alt`（`AltLeft`）是唯一允许的修饰键；`AltRight`、`Ctrl`、`Shift`、`Win`、系统保留组合和不支持的扫描码必须拒绝，并显示可本地化错误。鼠标自定义只支持上述两个标准侧键，不记录鼠标移动、滚轮或其他鼠标按钮。首次升级时保留当前应用内 `Space` 偏好；全新设置默认 `AltLeft`。启用语音且 Room 就绪时，原生钩子必须消费匹配输入的 press/release，避免默认左 `Alt` 或已选侧键同时触发 MSFS 操作。

Windows 下的原生桥接必须只匹配已配置的单键或鼠标侧键并发出 press/release，不能作为按键记录器或鼠标监控器。主进程收到 press 后调用既有按住说话开始逻辑；收到 release 后提交当前轮次。语音可用期间必须消费匹配输入，未匹配的键盘与鼠标输入继续交给系统和 MSFS。重复 press、丢失 release、Room 断开、Agent 出错、切换语音模式、禁用语音和应用退出均不得让录音保持开启。

原生模块的生命周期必须与 Electron 环境绑定：模块初始化时注册 N-API environment cleanup hook；应用退出、语音模式切换或重新配置时，先停止并 join Windows hook 线程，再终止 ThreadSafeFunction，不得在 JavaScript 环境销毁后继续投递事件。所有 N-API 调用必须检查返回状态；收到 `napi_closing` 时立即停止投递并释放事件对象。hook 线程与主线程共享的配置、held 状态和停止信号必须使用原子变量或受 mutex 保护，停止请求必须在消息队列就绪后投递。

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

服务、语言或音色更改统一通过 `settings:save-settings` 进入主进程。主进程先校验请求并写入候选服务配置，再按新的语言和音色重启 Agent Worker；Worker 就绪后提交语言文件、通知 Renderer 刷新并重新连接。任一阶段失败时，主进程恢复上一份服务配置、凭据和语言，并重新启动上一份有效 Worker。Renderer 不把失败误报为成功，保存按钮保持可重试。

## 当前实现状态（2026-08-03）

已完成设置的双页纵向布局、通用偏好保存、受信任设置窗中的遮罩凭据显示/隐藏、`safeStorage` 加密保存、主助手、设置与来源窗口可信工具栏的中英文切换，以及语言切换后新 Agent 会话的回复语言、英文检索偏好、来源网页语言请求偏好和 STT 默认语言切换。

导游提示词现按 locale 完整隔离：英文会话使用全英文的角色、事实边界与语音转写规则，避免中文规则影响英文回答；例如用户以英文询问助手名称时会得到英文回答。两种语言的默认回答均面向 TTS：一到三句短句（中文约 80 字、英文最多 60 词），仅在用户明确要求细节时放宽；模型不得输出 Markdown 表格、标题、列表、项目符号或其他不适合直接朗读的排版。

已完成 Windows 全局按住说话：

- `native/global-ptt` 使用 Windows `WH_KEYBOARD_LL` / `WH_MOUSE_LL`，仅匹配已配置的单键或 `Mouse X1/X2`。匹配输入的 press/release 会被消费；未匹配输入不记录、不传给 Renderer，继续交由系统和 MSFS。
- 原生模块只把匹配输入的 `press` / `release` 转给主进程；主进程经白名单 IPC 将其交给现有 LiveKit 按住说话流程。重复 press 幂等；改键、断线、切换模式与退出会取消活跃轮次。
- 原生模块注册 N-API environment cleanup hook；退出、禁用和重配置时先停止并 join hook 线程，再终止 ThreadSafeFunction。N-API 返回状态、`napi_closing` 和共享 hook 状态均有保护，避免退出阶段向已销毁的 JavaScript 环境继续投递事件。
- 通用设置页使用真实按钮组成键盘/鼠标点选器：键盘可直接选择六个键盘预设，鼠标提供两个侧键预设，合计八个全局预设；还可直接点选 `Esc`、`F1`、`F2`、`F12`、`Q`、`W`、`E`、`R`、`T` 进入自定义键位。当前按键通过 `aria-pressed` 和选中样式反馈；鼠标图将两个侧键均放在右手鼠标左侧拇指位，并标注前进 `X2` 与后退 `X1`；自定义录入仅接受一个受支持的键盘键。
- `node-gyp` 在 Windows 构建 N-API `.node` 模块；桌面构建会将其暂存到 `out/main/native`。类型检查、完整 Vitest 套件、原生模块加载/启停烟测和桌面构建均已通过。

2026-08-22 修复键盘点选器的视觉与交互不一致：原先部分键帽是不可点击的 `<span>` 占位元素，现已统一为带 `aria-label`、`aria-pressed`、焦点轮廓、悬停和按下反馈的真实按钮。此次修改已通过 `desktop:typecheck`、Renderer ESLint、Prettier 和完整 Vitest 套件（60 个测试文件通过、1 个跳过；226 个测试通过、8 个跳过）。

2026-08-12 记录过一次 Electron native 崩溃问题：截图中的 Windows `0x80000003` 与本机历史 Application 事件中的 `global_push_to_talk.node` 崩溃证据并不具有相同异常码，但均指向 native 生命周期风险。修复后已完成 `pnpm native:build`、100 次 native `start/stop` 启停冒烟，以及 Windows/MSFS 前台长时间人工回归，未再发现问题。详见 [Bug-20260812](../bugs/bug-20260812-electron-global-ptt-native-crash-0x80000003.md)。

已完成统一服务设置保存、Agent Worker 重启、Room 重连与失败回滚链路：主进程先保存候选配置并等待新的 Worker 就绪，成功后通知 Renderer 刷新/重连；失败时恢复上一份有效配置、凭据和语言。经 Windows `safeStorage` 保存的凭据仅在主进程中注入实际 Agent 配置。每个服务都能在不保存草稿的前提下进行连通性检测；检测具有 10 秒超时、脱敏错误反馈与 2.5 秒限流。

豆包 TTS 本地音色选择已完成：音频样例来自 `resources/tts/confirmed-voices/`，列表按项目语言过滤，内置音色支持试听，英文默认音色为 Dacey，Stokie 可选，并支持自定义 speaker ID。保存按钮具有保存中、成功和失败状态；成功显示确认状态后恢复正常，失败保留错误状态并允许重试。旧 Tim 配置会在读取时迁移到当前语言的默认音色。

已完成诊断导出：主进程按日维护 main、Worker、对话及工具事件 NDJSON，保留最长 3 天、总量不超过 5 MiB。所有写入与归档前共用脱敏器；每条新写入日志自动包含 `applicationVersion`，其值来自 Electron `app.getVersion()`（根目录 `package.json` 的 `version`），关于页也使用同一来源。设置窗口通过系统保存对话框选择位置，使用流式 ZIP 写入临时文件后原子移动。导出按钮已启用，正常状态显示可点击光标和悬停反馈，只有归档进行中才显示等待状态。

键位校验、按住/松开状态机、诊断脱敏、日志保留和 ZIP 清单已有自动化测试。MSFS 前台 Windows 人工验收仍待在目标机器完成。

### 服务可用性检测

检测使用当前表单中的非敏感参数及本次输入的凭据更新，同时合并 Windows `safeStorage` 中已保存的凭据；它不会保存配置、变更 Agent 会话或向渲染进程返回密钥。检测会调用目标服务的真实功能请求，单元测试则使用 mock。

- DeepSeek：向 `chat/completions` 发送固定的最小对话请求，确认返回非空模型回复；V4 模型关闭 thinking 并限制 `max_tokens` 为 16。
- 火山 STT：使用当前流式 ASR 配置发送 2 秒内置语音样本，转换为 16 kHz 单声道 16-bit PCM，等待服务端最终识别包和非空转写。
- 火山 TTS：执行完整的 WebSocket 连接、会话、短文本合成和结束流程，确认服务端返回音频数据。
- 网页搜索：通过当前选中的搜索 Provider 发起真实搜索，并校验 Provider 返回的响应契约。

STT 检测与运行时使用同一流式资源；不使用需要独立 `volc.bigasr.auc_turbo` 资源的录音文件极速版接口替代验证。远程检测受服务商实际配额与计费规则约束，并共用 10 秒超时和 2.5 秒重复检测限流。

界面为每一项服务分别显示“检测中”、可用（含耗时）或不可用/限流状态。失败信息必须是可行动但不包含服务响应正文、URL 查询参数或任何凭据的提示。

## 诊断 ZIP

主进程维护主进程和 Worker 的 JSON Lines 日志，最长保留 3 天、总量不超过 5 MiB。日志和 ZIP 可以包含：

- 用户文字、用户语音转写和 Agent 回答；
- 会话状态、工具调用摘要、搜索查询与来源、MSFS 状态；
- Provider/Worker 错误、堆栈摘要、重试和重连时间线；
- 应用、Electron、Node、Windows 和依赖版本。

每条新写入的 NDJSON 记录都必须包含 `timestamp` 和 `applicationVersion`。`applicationVersion` 由主进程日志层从 `app.getVersion()` 注入，不由 Renderer 或业务事件传入；因此不同应用版本即使写入同一个按日文件，也能逐条区分。导出包中的 `manifest.json.applicationVersion` 仅表示导出时的当前应用版本，不能替代日志行自身的版本字段。已有的无版本历史日志无法可靠回填来源版本。

日志与 ZIP 必须排除或替换为 `[REDACTED]` 的内容：API Key、Access Token、API Secret、LiveKit JWT、认证 Header、Cookie、`.env` 原文、凭据加密 blob，以及 URL 查询参数中的认证内容。

导出由主进程打开系统保存对话框，流式写入临时 `.zip`，成功后原子移动到用户选定位置。Renderer 不接收文件系统路径的控制权、日志原文或 ZIP 内容。ZIP 固定包括：

- `manifest.json`：格式版本、应用/运行时版本、时间范围和脱敏计数；
- `logs/main.ndjson` 与 `logs/worker.ndjson`；
- `conversation.ndjson` 和 `tool-events.ndjson`；
- `readiness.json` 与 `configuration-summary.json`。

## 验收标准

- [x] 设置窗口仅有“通用”和“服务配置”两个左侧纵向一级导航；通用页包含语言、语音和诊断导出，且底部主按钮为“保存”。
- [x] 设置页可以配置固定的 DeepSeek、豆包 STT、豆包 TTS 与豆包网页搜索；密钥只显示配置状态，服务配置页的主按钮为“保存并重新连接”。
- [x] 豆包 TTS 音色列表只来自 `resources/tts/confirmed-voices/`，按项目语言过滤；中文默认 Vivi，英文默认 Dacey，英文 Stokie 可选，旧 Tim 配置按语言迁移。
- [x] 本地音色可试听和停止试听，并提供不受语言切换影响的自定义 speaker ID 输入。
- [x] 保存按钮在保存中、保存成功和保存失败时显示对应的图标、颜色和文案；失败状态允许重新提交。
- [x] Windows `safeStorage` 可用时凭据加密持久化；不可用时拒绝明文持久化，并保留 `.env`/环境变量兼容路径。
- [x] 保存 English 后，所有可信 UI（含主助手、设置、菜单、来源窗口工具栏、状态、错误和无障碍标签）显示英语；既有对话、网页原文、用户输入和技术配置值不被翻译，新的 Agent 会话以英语回复、使用英文检索并优先英文来源，STT 使用 `en`；来源网页以英文 `Accept-Language` 偏好重新加载，但不强制翻译未提供英文版的网页。
- [x] 默认 `AltLeft` 及 `F8`、`Mouse X1`、`Mouse X2` 可在 MSFS 前台按下/松开时分别开始/结束同一按住说话轮次，且匹配键或鼠标侧键不会同时传给 MSFS。
- [x] 设置页的八个全局预设均有直接可点选入口；键盘图中展示的 `Esc`、`F1`、`F2`、`F12`、`Q`、`W`、`E`、`R`、`T` 不再是无动作的视觉占位键帽，而是进入同一自定义键位校验的真实按钮。
- [x] 自定义单键可用，修饰键和系统保留键拒绝；连续对话模式、断线、钩子异常和应用退出不会留下活跃录音轮次。
- [x] 全局按住说话不记录未匹配按键，不将键流或窗口标题写入日志或发送给 Renderer。
- [x] 服务/语言切换失败保留旧有效会话；成功时无旧 Token、旧 Worker 或麦克风轨道泄漏。
- [x] 服务检测对 DeepSeek、豆包 STT、豆包 TTS 和当前网页搜索 Provider 发起真实功能请求；STT 使用 2 秒内置样本并等待最终转写，TTS 完成合成并校验音频返回。
- [x] ZIP 包含对话、转写、工具与服务诊断上下文，但不包含任一密钥、认证 Header、Cookie、JWT、`.env` 或凭据 blob。
- [x] 每条新写入的诊断 NDJSON 记录包含来自 `app.getVersion()` 的 `applicationVersion`，并与关于页使用同一版本来源。
- [x] ZIP 可由标准归档工具打开；取消、磁盘满、路径无权限或归档失败时不遗留部分目标文件。
- [x] 单元测试覆盖 Zod 边界、密钥 DTO、键位校验、press/release 状态机、脱敏器、日志保留和 ZIP 清单；Windows 人工验证覆盖 MSFS 前台的全局键位。

## 相关官方依据

- [Electron 安全教程](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Electron `globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Windows LowLevelKeyboardProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelkeyboardproc)
- [Windows LowLevelMouseProc](https://learn.microsoft.com/windows/win32/winmsg/lowlevelmouseproc)
- [Node-API](https://nodejs.org/api/n-api.html)
- [LiveKit Frontend Session management](https://docs.livekit.io/frontends/build/sessions/)
