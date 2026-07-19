# Microsoft Flight Simulator AI 导游助手

这是一个使用 TypeScript 与 LiveKit Agents 构建的实时语音导游助手。第一版目标是尽快在本地跑通“一名用户进入一间房间，与导游 Agent 自然语音对话”的闭环。

第一版已在本机完成真实语音对话联调。当前使用 DeepSeek LLM（大语言模型）、豆包 STT（语音转文字）和豆包 TTS（文字转语音），并可选接入豆包搜索 Custom API，供模型查询天气、新闻、活动、规则、地点和知识资料等外部信息。尚未实现模拟器遥测数据接入。

桌面前端已完成 Electron + React 基础实现，包括可收起悬浮助手、多显示器边缘吸附、紧凑聊天面板、严格跟随的来源浏览窗，以及基于 LiveKit `LocalAudioTrack` 的按住说话和实时音量反馈。当前本地麦克风音轨尚未加入 LiveKit Room，也尚未完成 Token 获取、Agent 音频回放、`.exe` 安装包与发布流程。

## 文档入口

- [第一版规格](docs/specs/spec-001-voice-guide-v1.md)
- [网络搜索规格](docs/specs/spec-003-web-search-and-capability-modules.md)
- [桌面悬浮前端与来源浏览规格](docs/specs/spec-004-web-frontend-and-source-preview.md)
- [基于 Mem0 的持久化对话记忆规划](docs/specs/spec-005-persistent-conversation-memory.md)
- [前端 HTML 交互原型](prototypes/voice-chat-panel.html)
- [架构概览](docs/architecture/overview.md)
- [框架版本登记](docs/frameworks/registry.md)
- [火山引擎集成设计](docs/architecture/volcengine-integration.md)
- [架构决策](docs/adr/)
- [协作与编码约定](AGENT.md)

## 实施原则

使用 pnpm 锁定依赖；LiveKit Agents 的包名、版本和 API 必须以安装当日的官方文档与本地 TypeScript 类型定义为准。不要把未核验的示例或记忆中的 API 直接写入生产代码。

所有本地密钥通过环境变量注入。请复制 [`.env.example`](.env.example) 为本地 `.env` 并填写凭据；绝不提交真实 `.env` 文件。

## 当前开发命令

需要 Node.js 24 和 pnpm 11。安装依赖后，可运行以下工程检查：

```powershell
pnpm install
pnpm run verify
```

当前已完成工程工具链、LiveKit SDK 类型契约、火山 Provider 适配器、LiveKit 会话入口和 `searchWeb` 工具。

## 桌面前端

生产方向的桌面入口位于 [`desktop/`](desktop/)，HTML 原型 [`prototypes/voice-chat-panel.html`](prototypes/voice-chat-panel.html) 继续作为早期交互参考。当前 Electron 实现包括：

- 64×72px 收起窗口：顶部 36×14px 原生拖动把手与 48px 头像点击区明确分离。
- 拖动结束后根据光标所在显示器吸附到最近的左右工作区边缘，并支持负坐标扩展屏。
- 可移动、可收起、可从四边和四角拉伸的语音聊天面板。
- 居中的紧凑按住说话胶囊：首次按下申请麦克风权限，之后复用并静音/恢复同一条 LiveKit 本地音轨；激活时显示实时音量柱。
- AI 回答中的百科来源卡片和搜索结果入口。
- 独立伴随来源浏览窗，通过隔离的 `WebContentsView` 加载经过校验的 HTTPS 页面，并始终跟随聊天面板定位。

可使用以下命令验证并打开桌面实现：

```powershell
pnpm build
pnpm desktop:preview
```

HTML 原型中的百科和搜索结果仍是本地静态视觉数据；Electron 实现会加载真实 HTTPS 来源网页。桌面进程、安全隔离和后续打包要求见 [Spec-004](docs/specs/spec-004-web-frontend-and-source-preview.md)。

搜索 Key 配置完成后，可用以下命令独立验证搜索服务；`--json` 输出适合脚本处理。

```powershell
pnpm run search -- --query "北京当前天气" --json
pnpm search:smoke
```

`searchWeb` 查询的是公开网页，并不等同于专用天气 API 或模拟器传感器。回答天气、新闻等时效性问题时，Agent 会关注来源地点与更新时间；来源时间不明确时会提示时效性风险。

## 本地运行

1. 启动本机 LiveKit Server，并在 `.env` 中填写 `ws://127.0.0.1:7880`、`devkey`、`secret`、DeepSeek Key 与豆包语音凭据。
2. 使用 `pnpm agent:check` 检查配置（不会输出密钥，也不会发起远程请求）。
3. 启动本地 Agent Worker（工作进程）：`pnpm agent:dev`。
4. 用 LiveKit CLI（命令行工具）创建房间 Token（访问令牌）并分派 `msfs-voice-guide`，在 LiveKit Meet 中完成对话。

Agent Worker 依赖可访问的 LiveKit Server。仓库中的桌面端目前只完成本地麦克风音轨与音量反馈，尚未发布音轨到 Room；因此端到端 Agent 联调仍使用 LiveKit Meet。包含 Docker 启动、Token 生成和关闭命令的完整步骤见[本地冒烟测试](docs/testing/local-agent-smoke.md)。
