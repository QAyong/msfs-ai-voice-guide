# Windows x64 打包方案 V2

**最后更新：** 2026-08-07

**状态：** 已实现；`1.0.1-rc.2` 安装包已生成，安装态自动校验通过

**目标平台：** Windows x64，无代码签名

## 结论

V2 废弃“先生成 `win-unpacked`，再向 `app.asar.unpacked` 复制完整 `node_modules`，最后二次打包”的旧流程。生产依赖必须在 ASAR 创建前准备完成，electron-builder 之后不得追加或替换任何依赖文件。

```text
源码与开发依赖
  ↓ electron-vite build
out/main + out/preload + out/renderer
  ↓ pnpm deploy --prod（独立生产锁文件）
release-v2/app（最小生产应用）
  ↓ 转换为物理 hoisted 依赖树并执行导入测试
electron-builder 26 → app.asar + 少量原生 unpack
  ↓ 安装态 utilityProcess、CLI、daemon、哈希验证
NSIS x64 Setup.exe
```

## 生产应用内容

`app.asar` 包含编译后的 Main、Preload、Renderer、Agent 和最小后台依赖。React、前端图标库和 `livekit-client` 已由 Vite 放入 Renderer，不再作为 Node 运行依赖重复收集。

`app.asar.unpacked` 只允许包含必须由操作系统直接加载的 `.node`、DLL 和被标记为 unpack 的少量主进程文件。验证器限制其依赖文件数量和体积，禁止重新出现完整外置 `node_modules`。

以下内容使用 `extraResources` 独立分发：

- `livekit/livekit-server.exe` 与许可证；
- `msfs/msfs.exe`、`msfsd.exe`、`SimConnect.dll`、CLI 组件清单和 Community Bridge；
- `msfs/geo-config.json`，由打包时的 Geo Cloud 配置生成；
- `tts/` 本地音色样例；
- `native/global-push-to-talk.node`；
- 应用图标、空凭据 `.env.example` 和总发布清单。

## MSFS CLI 配合

CLI、daemon、SimConnect DLL 和 Bridge 必须来自同一次暂存快照。`scripts/stage-msfs-cli.mjs --strict` 会拒绝缺少任一必需文件的候选构建，并生成 `out/msfs/component-manifest.json`：

- 每个文件的相对路径、大小和 SHA-256；
- 快照 fingerprint；
- Bridge `package_version`；
- CLI/Bridge 协议主版本。

安装版从 `process.resourcesPath/msfs/msfs.exe` 调用 CLI，不读取开发目录，不注册全局 PATH，也不安装 Windows 服务。`msfs.exe` 按需启动唯一 `msfsd.exe`；应用真正退出时执行 `daemon stop --json`，失败或超时后仅对本项目的单例 `msfsd.exe` 使用 Windows 兼容兜底。安装器覆盖旧版本前执行相同停止流程。

Bridge 仍由应用首次启动逻辑管理。普通用户写入标准 `Community2024/msfs-native-cli-route-bridge`；开发机保留“开发版本”和“应用版本”副本，但 MSFS 根目录只启用一个 Bridge。

### Geo Cloud 配置

`scripts/stage-geo-config.mjs` 在 `desktop:build` 期间从构建环境读取 `MSFS_GEO_CLOUD_BASE_URL` 和 `MSFS_GEO_API_KEY`，生成 `out/msfs/geo-config.json`。该文件随 `out/msfs` 进入安装包，主进程和 Agent Worker 启动时自动加载，最终用户不需要编辑 `.env` 或设置页。

这是当前测试候选包的明确例外：Geo Cloud Key 会存在于安装资源中，因此拿到安装包的人理论上可以提取它。DeepSeek、豆包 STT/TTS、搜索服务和 LiveKit 的用户凭据仍不写入安装包。

## 构建命令和产物

```powershell
pnpm desktop:package
```

候选发布物位于 `release-v2/artifacts/`：

```text
晓晓飞行导游-<version>-win-x64-setup.exe
SHA256SUMS.txt
release-report.json
win-unpacked/                         # 只供内部验证，不对外发布
```

构建只生成 NSIS x64 安装包，不生成 ZIP。安装包未签名，Windows SmartScreen 可能显示未知发布者警告。

给普通用户分发时只发送 `*-win-x64-setup.exe`。`SHA256SUMS.txt` 是可选的完整性校验文件；`.blockmap`、`latest.yml`、内部报告和 `win-unpacked/` 不属于人工分发内容。旧候选安装包可移入 `release-v2/artifacts/archive/<version>/` 保存，不能与当前候选 Setup 混在产物根目录。

## 安装态凭据显示约定

Provider App ID、API Key、Access Token 和 Secret 统一使用密码输入框：全新未配置时为空；存在有效值时默认显示密码圆点；点击眼睛后显示本机真实值。示例值、`your_*` 字符串和“已配置”不能作为输入框内容。凭据由主进程从进程环境、`safeStorage` 或本地 `.env` 按优先级合并，仅通过可信设置 Utility Window 的白名单 IPC 回显；主助手、远程来源页、日志和诊断包不得获得这些值。

## 自动验收门槛

生成安装包前必须全部通过：

1. `pnpm desktop:package` 自身执行桌面 TypeScript 类型检查；发布候选前另执行完整 Vitest 测试。
2. 干净生产目录不能存在指向项目或 pnpm Store 的外部链接。
3. 打包前后都能加载 LiveKit Agents、OpenAI 插件、RTC、Sharp、OpenTelemetry、协议包、WebSocket 和 Zod。
4. 安装态 Electron 必须能从 ASAR 逻辑路径启动真实 `utilityProcess`。
5. 打包后的 `msfs.exe status` 成功，并能执行 `daemon stop --json`。
6. MSFS 组件清单中的每个哈希都与安装目录一致。
7. 安装目录中的 `resources/msfs/geo-config.json` 存在，并包含 Geo Cloud 配置字段；验证日志不得输出 Key 值。
8. `app.asar.unpacked` 的原生依赖不得超过 5,000 个文件或 160 MiB；超限直接失败。
9. 对外只能有一个 `*-setup.exe`，同时生成 SHA-256。

报告写入：

- `release-v2/release-app-report.json`
- `release-v2/runtime-validation-report.json`
- `release-v2/artifacts/release-report.json`

## 升级与回退

每次候选包必须递增版本号，禁止使用同一版本号反复覆盖。升级前先真正退出应用；收起窗口或结束对话不等于退出。

回退到旧应用版本：

1. 完全退出晓晓飞行导游和 MSFS 2024。
2. 保留对应旧安装包和 `SHA256SUMS.txt`。
3. 先尝试直接运行旧安装包；如果安装器阻止降级，卸载当前应用，但不要删除 `%APPDATA%\msfs-ai-voice-guide`。
4. 安装旧版并启动一次，让旧版同步自己的应用 Bridge。
5. 若只想回到 CLI 开发版本，在项目目录执行 `pnpm msfs:use:dev`；恢复安装版执行 `pnpm msfs:use:app`。

回退前建议备份 `%APPDATA%\msfs-ai-voice-guide`。凭据文件由 Windows `safeStorage` 加密，不能复制给其他用户或其他 Windows 账户使用。

## 明确不做的事情

- 不把 DeepSeek、豆包 STT/TTS、搜索服务或 LiveKit 的开发者凭据、`.env` 或绝对路径写入安装包；MSFS Geo Cloud Key 仅作为当前测试候选包的明确内置配置例外。
- 不把完整项目源码、测试、TypeScript 工具链或前端依赖作为后台运行依赖分发。
- 不在用户第一次启动时解压完整 `node_modules`。
- 不自动安装 CMake、Visual Studio、MSFS SDK 或全局 Node.js。
- 当前候选版本不启用自动更新，也不承诺绕过未签名应用的 SmartScreen 警告。
