# Microsoft Flight Simulator AI 导游助手

这是一个使用 TypeScript 与 LiveKit Agents 构建的实时语音与文字导游助手。第一版目标是尽快在本地跑通“一名用户进入一间房间，与导游 Agent 自然对话”的闭环。

第一版已在本机完成真实语音对话联调。当前使用 DeepSeek LLM（大语言模型）、豆包 STT（语音转文字）和豆包 TTS（文字转语音），并可选接入豆包搜索 Custom API 或博查 Web Search API。Agent 已通过随应用分发的原生 MSFS CLI 接入只读飞行快照、地理上下文、EFB 航路、下一航点、附近航空设施、游戏内天气/时间和本次会话轨迹；真实模拟器场景仍需在运行中的 MSFS 2024 内完成冒烟验收。

桌面前端已接通真实 LiveKit Room：应用自动校验配置并启动隔离的 Agent Worker，主进程签发短期 Token；Renderer 使用 LiveKit 官方 React Session 组件管理房间、麦克风、消息和回答音频，同时支持鼠标/空格键按住说话与连续自然对话。开发与安装态均使用官方 Windows `livekit-server.exe` 的本地运行方式，不使用 Docker；正式 `.exe` 安装包与自动运行时管理仍待实现，见 [Spec-011](docs/specs/spec-011-packaged-local-livekit-runtime.md)。

## 文档入口

- [第一版规格](docs/specs/spec-001-voice-guide-v1.md)
- [网络搜索规格](docs/specs/spec-003-web-search-and-capability-modules.md)
- [桌面悬浮前端与来源浏览规格](docs/specs/spec-004-web-frontend-and-source-preview.md)
- [桌面真实语音闭环与启动诊断](docs/specs/spec-006-desktop-live-voice-and-readiness.md)
- [桌面文字输入](docs/specs/spec-007-desktop-text-input.md)
- [用户触发的探索模式](docs/specs/spec-015-user-triggered-explore-mode.md)
- [来源预览面板轻量浏览器能力](docs/specs/spec-016-source-preview-lightweight-browser.md)
- [原生 MSFS CLI 导游工具接入](docs/specs/spec-008-native-msfs-cli-guide-tools.md)
- [MSFS CLI 发布物集成](docs/architecture/msfs-cli-release-integration.md)
- [桌面安装包的本地 LiveKit 运行时](docs/specs/spec-011-packaged-local-livekit-runtime.md)
- [本地 LiveKit 运行时架构](docs/architecture/local-livekit-runtime.md)
- [基于 Mem0 的持久化对话记忆规划](docs/specs/spec-005-persistent-conversation-memory.md)
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

当前已完成工程工具链、LiveKit SDK 类型契约、火山 Provider 适配器、LiveKit 会话入口、`searchWeb` 和 7 个只读 MSFS 工具。

开发态可在 `.env` 中通过 `MSFS_CLI_PATH` 指向本地 `msfs.exe`；执行 `pnpm msfs:stage` 会将 `msfs.exe`、`msfsd.exe` 和本机可用的运行时文件暂存到 Electron 资源目录。安装态默认从 `resources/msfs/msfs.exe` 解析。CLI 只连接真实的 MSFS 2024 SimConnect；游戏未启动或未加载飞行时，前端会显示不可读取状态而不会返回模拟数据。EFB 航路还要求在 MSFS 2024 的 `Community2024` 中安装配套 route bridge。CLI 是独立发布依赖：正式打包必须使用经校验的发布目录，不得依赖开发机上的 `D:\code\微软模拟飞行cli`；完整约定见 [MSFS CLI 发布物集成](docs/architecture/msfs-cli-release-integration.md)。

## 桌面前端

生产方向的桌面入口位于 [`desktop/`](desktop/)。当前 Electron 实现包括：

- 64×72px 收起窗口：顶部 36×14px 原生拖动把手与 48px 头像点击区明确分离。
- 展开标题栏左侧以指南针触发探索，中间仅显示带状态点的头像，右侧分别收起或结束当前对话；悬浮菜单中的电源按钮才退出整个应用。
- 拖动结束后根据光标所在显示器吸附到最近的左右工作区边缘，并支持负坐标扩展屏。
- 可移动、可收起、可从四边和四角拉伸的语音与文字聊天面板。
- 两种输入模式复用同一个 LiveKit Session（会话）与麦克风管线：鼠标或空格键按住说话，以及基于官方自动 Turn Detector（轮次检测器）的连续对话。
- 使用 `@livekit/components-react` 的 `useSession`、`useAgent`、`useSessionMessages`、`useTrackToggle` 和 `RoomAudioRenderer`，文字发送、语音转写与回答消息复用同一官方 Session，不在 Renderer 自行拼接转写或维护第二套通信管线。
- 单行控制台可切换文字、按住说话与连续对话；语音挂断会通过 LiveKit `AgentSession.interrupt()` 终止正在播放的 TTS，但保留 Room 和文字聊天。
- Agent 回答使用 `react-markdown` 与 `remark-gfm` 安全渲染；消息区在底部时自动跟随，用户上翻历史后以“新消息”按钮提示。
- 自动连接唯一 LiveKit Room、发布麦克风、播放 Agent 音频，并展示等待讲话、聆听、思考、回答、打断和重连等真实状态。
- 由主进程签发的短期最小权限 Token；API Secret 和模型密钥不会进入 Renderer。
- AI 回答中的真实搜索来源卡片和搜索结果入口。
- 自动启动/检查 Agent Worker、首次配置引导、脱敏故障提示、重试、音量/置顶/窗口状态保存。
- 设置中心支持中英文项目语言、DeepSeek/STT/TTS/搜索服务配置、按项目语言过滤的本地豆包 TTS 音色、音色试听和自定义 speaker ID；保存服务配置后会重启 Agent 并重新连接 LiveKit。
- TTS 本地样例来自 `resources/tts/confirmed-voices/`；中文默认 Vivi，英文默认 Dacey，Stokie 可选，旧 Tim 配置会自动迁移且不会出现在新列表中。
- 独立伴随来源浏览窗，通过隔离的 `WebContentsView` 加载经过校验的 HTTPS 页面，并始终跟随聊天面板定位。
- 探索结果在伴随窗中以“浏览建议 → 接续问题 → 话题分组 → 行式来源卡”呈现；它与普通搜索来源共用站点、日期、摘要和可选缩略图的视觉层级，主题描述保留紧凑行式布局并使用浅色填充突出显示。Planner 面向宽泛主题生成 3～5 个具体且不重复的词条，百科来源按规范化 URL 去重并优先解析真实词条。
- 来源窗当前沿用隔离的网页预览与阅读容器；下一阶段按 [Spec-016](docs/specs/spec-016-source-preview-lightweight-browser.md) 扩展为单窗口、单标题栏的受控轻量浏览器，支持站内 HTTP(S) 跳转、网页历史和窗口内视频自动横屏，不引入多标签页或第三方播放器。

可使用以下命令验证并打开桌面实现：

```powershell
pnpm build
pnpm desktop:preview
```

Electron 实现使用真实 Agent 转写和来源，并加载经过校验的 HTTPS 来源网页。桌面进程、安全隔离和后续打包要求见 [Spec-004](docs/specs/spec-004-web-frontend-and-source-preview.md)。

搜索 Key 配置完成后，可用以下命令独立验证搜索服务；`--json` 输出适合脚本处理。

```powershell
pnpm run search -- --query "北京当前天气" --json
pnpm search:smoke
# 模拟中英文工具调用前的偶尔中间话术
pnpm guide:preamble:smoke
```

`searchWeb` 查询的是公开网页，并不等同于专用天气 API 或模拟器传感器。回答天气、新闻等时效性问题时，Agent 会关注来源地点与更新时间；来源时间不明确时会提示时效性风险。

`guide:preamble:smoke` 使用当前 `.env` 中的 DeepSeek 与搜索服务配置，模拟中文/英文联网问题和普通问题。联网问题应触发工具调用，工具调用前允许模型偶尔输出一句自然的核实提示；普通问题不应调用工具。该话术由 `src/conversation/guide-instructions.ts` 的通用提示词控制，不保证每次调用都出现。

## 本地运行

1. 从 [LiveKit 官方 Windows 发布页](https://github.com/livekit/livekit/releases/latest)下载并验证 `livekit-server.exe`，放入受 Git 忽略的 `resources/livekit/`。开发态不使用 Docker。
2. 开发态启动桌面应用后，Electron 默认自动启动并管理本地 LiveKit；它会使用回环地址、动态端口和本地运行时凭据，不需要单独运行 `pnpm livekit:dev`。
3. 如需明确改用外部或手动启动的 LiveKit，才在 `.env` 中设置 `MSFS_AUTO_START_LIVEKIT=false`，并填写对应的 `LIVEKIT_URL`、`LIVEKIT_API_KEY` 和 `LIVEKIT_API_SECRET`。保留 `true` 或省略该开关则自动启动本地 LiveKit。
4. 在 `.env` 中填写 DeepSeek Key 与豆包语音凭据。
5. 使用 `pnpm agent:check` 检查配置（不会输出密钥，也不会发起远程请求）。
6. 执行 `pnpm build`，再执行 `pnpm desktop:preview`。桌面应用会自动启动 LiveKit 和 Agent Worker、创建独立房间并分派 `msfs-voice-guide`。
7. 在桌面窗口按住说话并松开，或切换“连续对话”后直接讲话；系统会在轮次结束后自动回答，无需另外启动 Worker、生成 Token 或打开 LiveKit Meet。

`pnpm desktop:build` 也会构建 Windows 全局按住说话原生模块，并暂存 `out/tts`、`out/livekit` 和 `out/msfs` 资源；其中 TTS staging 会先清理 `out/tts`，删除本地 TTS 样例后应重新构建，避免旧音色继续留在输出目录。

Agent Worker 仍依赖可访问的本机 LiveKit Server；服务未启动、凭据错误或麦克风被拒绝时，桌面应用会显示可重试的脱敏提示。完整步骤见[本地冒烟测试](docs/testing/local-agent-smoke.md)。
