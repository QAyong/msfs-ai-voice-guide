# Spec-012：桌面服务设置、双语、全局按住说话与诊断导出

**日期：** 2026-07-25  
**状态：** 提议  
**前置决策：** [ADR-010](../adr/adr-010-secure-desktop-settings-global-ptt-and-diagnostics.md)

## 目标

将现有偏好弹窗重构为桌面设置中心。用户可以配置现有 LLM、STT、TTS 和网页搜索服务，设置中英文体验，选择全局按住说话键，并在发生问题时导出包含对话上下文但不包含任何密钥或认证材料的诊断 ZIP。

## 设置界面

设置窗口是单个可信 Electron Utility Window，提供以下一级页面：

| 页面 | 内容                                                     | 生效方式                                 |
| ---- | -------------------------------------------------------- | ---------------------------------------- |
| 常规 | 应用语言、置顶、回答音量、来源打开方式、界面动效         | 保存即生效                               |
| 语音 | 当前语音模式、全局按住说话按键/鼠标侧键                  | 绑定保存即注册；模式沿用现有 Session/RPC |
| 服务 | DeepSeek LLM、豆包 STT、豆包 TTS、豆包网页搜索的固定配置 | “保存并重新连接”                         |
| 诊断 | 就绪状态、导出诊断 ZIP                                   | 单次操作                                 |

服务页的密钥字段只显示“未配置”或“已配置”，始终不回显、不复制、不自动填充。留空代表保留已存值；清除凭据需要二次确认。设置窗口关闭、取消或保存完成后清空 Renderer 内存中出现过的秘密值。

语言下拉只提供“简体中文”和“English”。选择后即时切换可信 UI 文案；服务设置成功并重连后，Agent 以同一语言回复。英文模式把 STT 默认值设为 `en`，但不替换用户已配置的 TTS 音色。

## 全局按住说话

语音页把“按住说话输入”作为键盘/鼠标侧键设置，而非语音交互模式选择。控件包含常用预设和自定义键盘录入：

| 预设         | 说明                                       |
| ------------ | ------------------------------------------ |
| `Left Alt`   | 默认；按住时不会把该键传给模拟器           |
| `F8`         | 常用功能键；较少和文字输入冲突             |
| `F9`         | 第二常用功能键                             |
| `Right Ctrl` | 适合右手操作外设的用户                     |
| `Caps Lock`  | 可按住使用，但仍会保留系统锁定键的原有行为 |
| `Space`      | 适合不与模拟器键位冲突的用户               |
| `Mouse X1`   | 鼠标后侧键；常见浏览器“后退”键             |
| `Mouse X2`   | 鼠标前侧键；常见浏览器“前进”键             |

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

- [ ] 设置页可以配置固定的 DeepSeek、豆包 STT、豆包 TTS 与豆包网页搜索；密钥只显示配置状态。
- [ ] Windows `safeStorage` 可用时凭据加密持久化；不可用时拒绝明文持久化，并保留 `.env`/环境变量兼容路径。
- [ ] 语言切为 English 后，助手与设置 UI 显示英语，新的 Agent 会话以英语回复且 STT 使用 `en`。
- [ ] 默认 `AltLeft` 和全部八个预设可保存并在 MSFS 前台按下/松开时分别开始/结束同一按住说话轮次，且匹配键或鼠标侧键不会同时传给 MSFS。
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
