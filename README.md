# MSFS AI Voice Guide｜微软模拟飞行 AI 导游

[简体中文](README.md) · [English](README.en.md)
**飞着飞着，开始上地理课。**

Microsoft Flight Simulator 2024 不只是驾驶舱，也是一只可以飞去任何地方的“地球仪”。飞越陌生的山脉、海岸或小岛时，你是否也好奇：我现在在哪里？窗外这片地貌叫什么？这里的人文与自然有什么故事？

**MSFS AI Voice Guide** 是一个面向休闲飞行的开源 AI 导游助手。它把模拟器中的实时飞行信息与地理上下文交给 AI，让你可以边看风景边用语音或文字提问；无需每次重新描述位置，导游会结合当前飞行状态和最近对话继续交流。它不是飞行教练，也不替你操纵飞机，而是让飞行途中多一些发现与陪伴。

<p align="center">
  <img src="docs/assets/readme/chat-window.png" alt="AI 导游桌面聊天窗口" width="260" />
</p>
<p align="center"><em>在飞行途中，用语音或文字与 AI 导游交流。</em></p>

<table>
  <tr>
    <td align="center"><img src="docs/assets/readme/msfs-connection-check.png" alt="MSFS 连接与组件检测" width="360" /></td>
    <td align="center"><img src="docs/assets/readme/tool-toggles.png" alt="MSFS 导游工具开关" width="360" /></td>
  </tr>
  <tr>
    <td align="center"><em>检查模拟器连接与运行组件</em></td>
    <td align="center"><em>按需启用飞行上下文与探索工具</em></td>
  </tr>
</table>

## 飞行途中可以做什么

- **随时开口提问**：支持按住说话、连续语音对话和文字输入；可以追问当前位置、沿途风景、自然地理或当地人文，也可以打断正在播放的语音回答。
- **问问“我现在在哪里”**：从 MSFS 读取飞机实时坐标，并结合 Geo API 返回国家、行政区、城市、自然地貌及可用的周边兴趣点，让地图上的位置变成听得懂的讲解。
- **了解当前飞行情况**：查询只读飞行快照、游戏内天气与时间、EFB 航路、下一航点及附近航空设施；无需手动把驾驶舱信息逐项抄给 AI。
- **从眼前风景继续探索**：围绕当前地点和对话上下文发起探索，获取主题介绍、延伸问题与网页来源，继续了解眼前景色背后的地理和故事。
- **在桌面上轻量陪飞**：悬浮式 Windows 应用展示游戏连接状态，提供语音/文字聊天、服务配置、工具开关和来源浏览，尽量不打断飞行体验。

## 它如何工作

桌面应用连接本机 LiveKit 服务与 AI Agent；原生 MSFS CLI 通过 SimConnect 等模拟器接口读取飞行信息。需要解释坐标时，CLI 调用 Geo API 获取外部地理上下文；AI 再结合这些结果和对话生成回答。飞行数据与外部地理信息有明确来源边界：外部地名和地貌不会冒充为模拟器原生数据，Geo API 不可用时也不会编造位置或兴趣点。

项目当前可接入 DeepSeek、火山引擎语音服务以及豆包或博查网页搜索。部分能力需要用户自行配置服务账号与凭据；项目使用要求、运行环境和配置步骤见下方“本地运行”章节。Windows x64 安装包目前为候选版本，尚未实现代码签名和自动更新。

> **非官方声明：** 本项目是独立的第三方社区工具，与 Microsoft Corporation、Asobo Studio 无关联，未获其授权、赞助或背书。Microsoft Flight Simulator 是 Microsoft Corporation 的商标。

## 文档入口

- [第一版规格](docs/specs/spec-001-voice-guide-v1.md)
- [网络搜索规格](docs/specs/spec-003-web-search-and-capability-modules.md)
- [桌面悬浮前端与来源浏览规格](docs/specs/spec-004-web-frontend-and-source-preview.md)
- [桌面真实语音闭环与启动诊断](docs/specs/spec-006-desktop-live-voice-and-readiness.md)
- [桌面文字输入](docs/specs/spec-007-desktop-text-input.md)
- [用户触发的探索模式](docs/specs/spec-015-user-triggered-explore-mode.md)
- [来源预览面板轻量浏览器能力](docs/specs/spec-016-source-preview-lightweight-browser.md)
- [原生 MSFS CLI 导游工具接入](docs/specs/spec-008-native-msfs-cli-guide-tools.md)
- [MSFS 桌面连接状态、配置检测与工具开关](docs/specs/spec-017-msfs-desktop-connection-and-tool-settings.md)
- [Windows 系统托盘常驻方案](docs/specs/spec-027-system-tray-residency.md)
- [MSFS 运行时稳定性与桌面体验一致性](docs/specs/spec-018-msfs-runtime-stability-and-desktop-consistency.md)
- [单 SimConnect 会话的 Pipe 等待修复](docs/specs/spec-019-single-simconnect-pipe-wait.md)
- [双 MSFS daemon 会话隔离方案](docs/specs/spec-020-two-msfs-daemons.md)
- [游戏内 POI 读取](docs/specs/spec-022-game-poi-reading.md)
- [MSFS 探索与桌面窗口改动记录](docs/architecture/msfs-explore-desktop-lessons.md)
- [MSFS 运行时回归测试矩阵](docs/testing/msfs-runtime-regression-matrix.md)
- [桌面开发测试最小流程](docs/testing/desktop-development-test-workflow.md)
- [MSFS CLI 发布物集成](docs/architecture/msfs-cli-release-integration.md)
- [Windows x64 打包方案 V2](docs/architecture/windows-packaging-v2.md)
- [1.0.1-rc.2 候选发布说明](docs/releases/1.0.1-rc.2.md)
- [MSFS CLI 就绪误判与开发态资源路径 Bug](docs/bugs/bug-20260804-msfs-cli-readiness-and-dev-resource-path.md)
- [MSFS 对话后连接丢失与 EFB 调用超时 Bug](docs/bugs/bug-20260808-msfs-session-drop-and-efb-timeout.md)
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

开发态可以复制 `.env.example` 为本地 `.env`，也可以在可信设置页填写服务凭据；安装态由 Electron 主进程使用 Windows `safeStorage` 保存。绝不提交真实 `.env`、加密凭据文件或任何 API Key。

## 当前开发命令

需要 Node.js 24 和 pnpm 11。安装依赖后，可运行以下工程检查：

```powershell
pnpm install
pnpm run verify
```

项目在 `pnpm-workspace.yaml` 中固定使用 `nodeLinker: hoisted`。不要在同一个工作区交替使用 pnpm 的 `isolated` 和 `hoisted` 依赖树，否则可能出现依赖目录已存在但 TypeScript 无法解析的情况，例如 `@phosphor-icons/react/dist/csr/*` 图标模块找不到。

如果当前网络通过 Clash 访问依赖仓库，可只在当前 PowerShell 会话设置代理；代理不会写入项目，也不会成为应用运行时配置：

```powershell
$env:HTTP_PROXY = 'http://127.0.0.1:7897'
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'
pnpm install --frozen-lockfile
```

如果工作区之前已经用另一种 linker 安装过依赖，先强制重建一次：

```powershell
pnpm install --frozen-lockfile --force
pnpm desktop:typecheck
```

当前已完成工程工具链、LiveKit SDK 类型契约、火山 Provider 适配器、LiveKit 会话入口、`searchWeb`、7 个只读 MSFS 工具和游戏内 POI 标准化；桌面端还提供 MSFS 游戏连接状态、Community2024 配置检测和 8 个工具的独立开关。游戏内 POI 通过现有 `getLocationContext` 获取，并可复用于探索上下文。

CLI 源码位于本仓库的 `native/msfs-cli/`，后续原生功能均在此处维护。开发态可在 `.env` 中通过 `MSFS_CLI_PATH` 指向本地 `msfs.exe`；未配置时，Electron Worker 优先使用项目根目录受 Git 忽略的 `dev-runtime/msfs-cli/msfs.exe`，再回退到 `resources/msfs/msfs.exe`。执行 `pnpm msfs:native:build` 会先把当前原生 CLI 构建到 `dev-runtime/msfs-cli-build/`，随后 `pnpm msfs:stage:dev` 从该开发构建快照刷新 `dev-runtime/msfs-cli/`；如果开发快照不存在才回退到 `native/msfs-cli/build/`。`pnpm desktop:dev` 会自动执行这两步，并把开发版 bridge 切换为当前 MSFS 生效版本。安装态默认从应用私有资源目录解析。CLI 只连接真实的 MSFS 2024 SimConnect；游戏未启动或未加载飞行时，前端会显示不可读取状态而不会返回模拟数据。EFB 航路还要求在 MSFS 2024 的 `Community2024` 中安装配套 route bridge。正式打包必须使用 `MSFS_CLI_DISTRIBUTION_DIR` 指向经校验的同批发布快照；完整约定见 [MSFS CLI 发布物集成](docs/architecture/msfs-cli-release-integration.md)。开发态、EFB、探索上下文和桌面窗口的常见陷阱见 [MSFS 探索与桌面窗口改动记录](docs/architecture/msfs-explore-desktop-lessons.md)。

## Windows x64 打包与版本切换

打包命令会先固定当时的 CLI/bridge 文件，再生成候选发布物：

```powershell
pnpm desktop:package
```

产物位于 `release-v2/artifacts/`。给普通用户分发时只需要 `*-win-x64-setup.exe`；`SHA256SUMS.txt` 可同时提供给需要校验完整性的用户。不要分发 `.blockmap`、`latest.yml`、`release-report.json` 或 `win-unpacked/`，也不提供 ZIP 便携包。开发机安装候选包时，应用版本会写入 `Community2024\_晓晓飞行导游版本库\应用版本`；开发版本仍保留在 `开发版本` 中。普通用户没有版本库，安装包会直接更新自己的 `Community2024\msfs-native-cli-route-bridge`。

V2 不复制开发目录的 `node_modules`，也不在 `win-unpacked` 生成后追加依赖。构建先用独立的 `@xiaoxiao/desktop-runtime` 生成最小生产锁文件，再在 `release-v2/app` 中建立物理依赖树，最后一次性写入 `app.asar`。只有 RTC、Sharp 等原生二进制按需进入 `app.asar.unpacked`。打包过程会按指纹复用未变化的 global-ptt、MSFS CLI 快照、LiveKit、TTS 和生产依赖；PTT 复用前会校验二进制哈希，生产依赖缓存会校验 Node/平台环境；主进程、Preload、Renderer、Agent JavaScript 及最终安装器仍会重新生成。CLI/WASM 源码修改后必须先生成新的发布快照再打包。打包后会实际验证 LiveKit Agent、OpenAI 插件、RTC、Zod、WebSocket、Sharp、Electron `utilityProcess`、MSFS CLI status/daemon stop 和 Bridge 哈希，任何一步失败都不会生成候选安装包。

如果修改了 CLI C++，先执行 `pnpm msfs:native:build` 生成带源码提交、源码指纹和二进制哈希的 `build-metadata.json`，再执行 `pnpm msfs:release:snapshot release-inputs/<build-id>` 自动生成新的完整发布快照；只执行 `pnpm desktop:package` 不会编译或更新发布态 CLI。发布脚本会拒绝旧快照、缺少构建清单的快照和与当前 native 源码不匹配的快照。不要向 `release-v2` 手动复制依赖。安装包固定包含打包当时的 CLI、daemon、SimConnect DLL 和 Bridge 快照，并用 `component-manifest.json` 记录 SHA-256 与协议主版本。

当前候选包还会在打包时生成 `out/msfs/geo-config.json`，安装后由主进程和 Agent Worker 自动加载 Geo Cloud 配置，测试者不需要手动填写。该测试方案会把 Geo Cloud API Key 放入安装资源，拿到安装包的人理论上可以提取；其他模型、语音、搜索和 LiveKit 凭据不随包分发。

如果要回退或切换版本，不能只重新打开应用，必须先退出 MSFS 2024，再在项目根目录执行：

```powershell
# 回退到开发版本
pnpm msfs:use:dev

# 切回应用版本
pnpm msfs:use:app
```

切换完成后再启动 MSFS。若要回退到更早的应用发布物，先完全退出应用和 MSFS，再运行对应的旧安装包；如果 Windows 安装器不允许直接降级，先卸载当前版本但保留 `%APPDATA%\msfs-ai-voice-guide`，然后安装旧版。当前版本库不会自动保存所有历史应用版本，必须单独保留旧安装包与其 SHA-256。

应用退出时会自动关闭随应用启动的 `msfsd.exe`。安装新版本时，安装器也会先尝试关闭旧版本的 daemon；如果是很旧的版本，会自动使用兼容处理。正常情况下不需要手动结束 `msfsd.exe`。

## 桌面前端

生产方向的桌面入口位于 `desktop/`。当前 Electron 实现包括：

- 64×72px 收起窗口：顶部 36×14px 原生拖动把手与 48px 头像点击区明确分离。
- 展开标题栏左侧以指南针触发探索，中间仅显示带状态点的头像，右侧分别收起或结束当前对话；悬浮菜单中的电源按钮才退出整个应用。
- 拖动结束后根据光标所在显示器吸附到最近的左右工作区边缘，并支持负坐标扩展屏。
- 可移动、可收起、可从四边和四角拉伸的语音与文字聊天面板。
- 两种输入模式复用同一个 LiveKit Session（会话）与麦克风管线：鼠标或空格键按住说话，以及基于官方自动 Turn Detector（轮次检测器）的连续对话。
- 使用 `@livekit/components-react` 的 `useSession`、`useAgent`、`useSessionMessages`、`useTrackToggle` 和 `RoomAudioRenderer`，文字发送、语音转写与回答消息复用同一官方 Session，不在 Renderer 自行拼接转写或维护第二套通信管线。
- 单行控制台可切换文字、按住说话与连续对话；语音挂断会通过 LiveKit `AgentSession.interrupt()` 终止正在播放的 TTS，但保留 Room 和文字聊天。
- Agent 回答使用 `react-markdown` 与 `remark-gfm` 安全渲染；消息区在底部时自动跟随，用户上翻历史后以“新消息”按钮提示。
- 自动连接唯一 LiveKit Room、发布麦克风、播放 Agent 音频，并展示等待讲话、聆听、思考、回答、打断和重连等真实状态。
- 由主进程签发的短期最小权限 Token；LiveKit API Secret 永远不会进入 Renderer。Provider 凭据只允许可信设置 Utility Window 通过受限 IPC 读取，不会进入主助手、来源网页或远程预览。
- AI 回答中的真实搜索来源卡片和搜索结果入口。
- 自动启动/检查 Agent Worker、首次配置引导、脱敏故障提示、重试、音量/置顶/窗口状态保存。
- 设置中心支持中英文项目语言、DeepSeek/STT/TTS/搜索服务配置、按项目语言过滤的本地豆包 TTS 音色、音色试听和自定义 speaker ID；未配置的 App ID、API Key 和 Access Token 输入框保持空白，保存后默认显示密码圆点，点击眼睛才显示本机真实值。保存服务配置后会重启 Agent 并重新连接 LiveKit。
- 设置中心的服务检测会对当前配置的 LLM、STT、TTS 和网页搜索分别发起一次真实功能请求：LLM 执行最小对话，STT 使用 2 秒内置语音样本并等待最终转写，TTS 实际合成短文本并校验音频返回，搜索执行真实查询。
- 设置中心的 MSFS 页面可以检测 CLI 运行文件、SimConnect、`UserCfg.opt`、`Community2024\msfs-native-cli-route-bridge` 和 EFB Route Bridge；检测只读，不会安装或修改游戏文件。MSFS 7 个工具与 `searchWeb` 可分别关闭，关闭后对应工具不会注册到 Agent。
- 聊天标题栏在探索按钮右侧显示“游戏已连接/未连接”两种状态；MSFS 工具全部关闭时隐藏该标识，游戏启停后自动刷新。
- 关于页提供 QQ 群、使用教程和版本信息，并支持中英文文案；应用图标资源位于 `resources/app-icon.png` 与 `resources/app-icon.ico`，ICO 包含 Windows 常用多尺寸且为圆形透明边缘。
- TTS 本地样例来自 `resources/tts/confirmed-voices/`；中文默认 Vivi，英文默认 Dacey，Stokie 可选，旧 Tim 配置会自动迁移且不会出现在新列表中。
- 独立伴随来源浏览窗，通过隔离的 `WebContentsView` 加载经过校验的 HTTPS 页面，并始终跟随聊天面板定位。
- 探索结果在伴随窗中以“AI 导览介绍（失败时隐藏）→ 接续问题 → 话题分组 → 行式来源卡”呈现；导览介绍由独立 DeepSeek 角色根据最近对话与已生成主题主动推荐下方内容，控制在 100 字以内，并与百科查询、视频查询和接续问题角色并行生成。它与普通搜索来源共用站点、日期、摘要和可选缩略图的视觉层级，主题描述保留紧凑行式布局并使用浅色填充突出显示。Planner 面向宽泛主题生成 3～5 个具体且不重复的词条，百科来源按规范化 URL 去重并优先解析真实词条。
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

## 许可证

本项目自有代码按 [Apache License 2.0](LICENSE) 授权。第三方依赖、模拟器 SDK 衍生文件、音频样本及数据集仍受各自许可证或服务条款约束；Apache-2.0 不扩展这些第三方资产的授权范围。
