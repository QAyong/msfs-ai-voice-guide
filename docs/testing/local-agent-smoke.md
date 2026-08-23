# 本地语音与文字 Agent 冒烟测试

**最近一次自动化通过：** 2026-08-07，`1.0.1-rc.2` 的 V2 x64 打包目录已通过 ASAR 提取后的 LiveKit/RTC/Sharp/OpenTelemetry 导入、真实 Electron `utilityProcess`、MSFS CLI status/daemon stop、Bridge 哈希和松散文件数量校验。`rc.1` 已在当前开发机完成人工安装与主流程验证；`rc.2` 只增加凭据回显规则并已完成构建校验，仍需按本文做一次设置页视觉确认。其他 Windows 机器上的干净环境回归不纳入当前版本范围。

## 前置条件

- `resources/livekit/livekit-server.exe` 已准备好；开发态桌面应用会默认自动启动本地 LiveKit，外部模式才需要预先配置可访问的 Server。
- 已构建 Electron 桌面客户端；它会自动创建短期 Token、加入唯一房间、分派 Agent 并发布麦克风音频。
- DeepSeek LLM、豆包流式 ASR 和豆包双向流式 TTS 均已开通，且音色已授权。
- 如需验证外部信息工具，`.env` 中配置 `SEARCH_PROVIDER=volcengine` + `VOLCENGINE_SEARCH_API_KEY`，或配置 `SEARCH_PROVIDER=bocha` + `BOCHA_SEARCH_API_KEY`。

## 本机 LiveKit Server（不使用 Docker）

本项目的开发、测试和发行路径均不使用 Docker。开发者从 [LiveKit 官方 Windows 发布页](https://github.com/livekit/livekit/releases/latest)获取明确版本的 `livekit-server.exe`，核验上游版本、哈希与许可证后放入受 Git 忽略的 `resources/livekit/`。开发态桌面应用默认自动启动并管理本地 Server。

```powershell
pnpm desktop:preview
```

应用会从 `resources/livekit/livekit-server.exe` 启动回环 Server，自动分配端口和本地凭据，并在退出时清理由自己启动的 Server。若需连接外部或手动启动的服务，必须在 `.env` 中明确设置 `MSFS_AUTO_START_LIVEKIT=false`，再填写对应的 LiveKit 连接配置。

如需显式保留自动启动行为，可在本地 `.env`（环境变量文件）中写入：

```env
MSFS_AUTO_START_LIVEKIT=true
```

## 步骤

1. 复制 `.env.example` 为 `.env`，填写真实凭据与已开通的模型/音色配置。
2. 执行 `pnpm agent:check`。它只校验本地配置并输出脱敏状态，成功时会显示所有能力为 `configured`。
3. 执行 `pnpm build`，再执行 `pnpm desktop:preview`。桌面主进程会自动启动隔离的 Agent Worker。
4. 等待标题状态从“连接中”切换为“在线”或“等待导游”。首次使用时允许桌面应用访问麦克风。
5. 先用按住说话模式询问“北京现在天气怎么样”，松开后确认出现真实转写并听到中文回答。
6. 切换连续对话并点击开始；讲话结束后不操作按钮，确认状态从“聆听中”进入“思考中/回答中”，且同一句 final 转写只出现一个气泡。
7. 在 Agent 回答时继续讲话，确认 VAD 打断生效；如触发 `searchWeb`，回答下方应出现真实 HTTPS 来源卡片。

## 通过标准

- Worker 成功连接 LiveKit，且日志不出现密钥值。
- 用户语音被火山 STT 识别，导游 Agent 生成回复，并由火山 TTS 播放。
- DeepSeek 对需要外部信息的问题主动调用 `searchWeb`，搜索服务返回 `ok` 或可解释的低置信度/错误状态。
- 天气、新闻等时效性回答说明来源地点和时间；来源时间不明确时不声称为实时信息。

## 桌面设置与 TTS 音色闭环

1. 执行 `pnpm desktop:build`，再执行 `pnpm desktop:preview` 打开 Electron 桌面窗口。
2. 打开设置的“服务配置”页，确认音色样例只来自项目内 `resources/tts/confirmed-voices/`。
3. 在中文项目语言下确认列表显示中文样例并默认 Vivi；切换到 English 后确认默认 Dacey、Stokie 可选，列表中不出现 Tim。
4. 选择一个本地音色，点击“试听”，确认音频播放；再次点击后停止试听。试听不会自动保存服务配置。
5. 选择“自定义 speaker ID”，填写自定义值并切换项目语言，确认自定义值保持不变；切换回内置音色后才恢复语言对齐。
6. 点击“保存并重新连接”，确认按钮依次显示保存中、成功图标/成功文案并恢复正常；保存失败时显示失败状态，按钮仍可再次点击重试。
7. 使用旧的 `en_male_tim_uranus_bigtts` 服务配置启动设置页，确认英文项目迁移到 Dacey，中文项目迁移到 Vivi，且 Worker 使用迁移后的 speaker 重启。
8. 构建完成后检查 `out/tts/confirmed-voices/` 与 `resources/tts/confirmed-voices/` 内容一致，确认已删除的 Tim 样例不会残留在 `out/tts`。

通过标准：音色列表没有目录外或旧构建残留音色；语言过滤、试听、保存重连和旧配置迁移均符合预期，失败状态不会误报保存成功。

## 前端消息与设置选择器回归

这部分用于验证 2026-08-08 完成的聊天气泡和统一下拉选择器改动，不需要真实 API 请求即可执行。

1. 将 Electron 窗口调整为较窄尺寸，发送普通中文、普通英文和包含 Markdown 的消息，确认助手气泡充分使用面板宽度，普通文本不会在句子中间提前换行。
2. 将窗口放大后重复上一步，再发送长 URL、连续英文和代码样式文本，确认内容不溢出；只有确实无法断开的内容才在安全位置换行。
3. 在设置页分别打开项目语言、百科、搜索服务和 TTS 音色下拉框，确认四者的触发器高度、箭头、菜单、选中态和关闭行为一致。
4. 对每个下拉框分别测试点击外部关闭、Escape 关闭、方向键/Home/End 移动、Enter/Space 选择和 Tab 离开，确认焦点不会丢失，保存后原有配置和重连流程正常。

通过标准：聊天内容可读、没有异常提前换行；四个下拉框交互一致；设置保存、持久化和重新连接行为不受影响。

## MSFS 连接与配置检测

1. 确认 MSFS 2024 的 `Community2024\msfs-native-cli-route-bridge` 已安装，并包含 `manifest.json`、`layout.json` 和 `modules\msfs-route-bridge.wasm`。开发机还应确认版本副本位于 `Community2024\_晓晓飞行导游版本库\开发版本` 或 `应用版本`，但 MSFS 根目录只保留一个当前生效的 bridge。
2. 执行 `pnpm desktop:build`，再执行 `pnpm desktop:preview` 打开 Electron 桌面窗口。
3. MSFS 未启动时确认聊天标题栏显示“游戏未连接”。
4. 启动 MSFS 2024 并加载飞行，确认标题栏自动变为“游戏已连接”。
5. 打开设置 → MSFS，点击“立即检测”，确认 CLI 运行文件、UserCfg、Community Package 和 Route Bridge 均能得到对应结果。
6. 关闭一个 MSFS 工具并保存，确认 Agent 重启后该工具不再注册；关闭全部 MSFS 工具时，标题栏连接状态隐藏。

通过标准：检测只读、不安装或修改游戏文件；游戏关闭时不误报已连接；`ROUTE_NOT_FOUND` 被识别为 Bridge 已响应但没有当前航路；工具开关和保存重连状态一致。

## V2 安装包回归

1. 执行 `pnpm desktop:package`，确认只生成一个 `*-win-x64-setup.exe`。
2. 检查 `release-v2/runtime-validation-report.json`，确认安装态依赖、`utilityProcess`、CLI 和 daemon 校验成功。
3. 完全退出旧应用，运行 Setup；若出现“应用无法关闭”，先确认系统托盘或后台没有主应用进程，而不只是关闭聊天窗口。
4. 全新用户数据目录首次启动时，确认 App ID、API Key 和 Access Token 输入框为空，不出现开发者密钥、示例值、`your_deepseek_api_key` 或“已配置”。
5. 在服务未配置的聊天面板中，确认显示“未配置服务，请配置服务”；点击“打开设置”后确认打开应用内设置面板，不调用系统默认程序打开 `.env`。
6. 保存服务配置并重启应用，确认所有凭据字段默认显示密码圆点；点击每个字段的小眼睛能够显示本机真实值，再次点击恢复遮罩。App ID 与 API Key、Access Token 使用相同规则。
7. 打开探索页：只有 DeepSeek 未配置时才显示探索规划配置提示；STT/TTS 或 MSFS 不可用不应被误报为探索规划未配置。
8. 启动 MSFS 后检测 CLI 与 Bridge，退出应用后确认 `msfsd.exe`、Agent 和本地 LiveKit 都已停止。
9. 覆盖安装更高版本并重复第 4～8 步；随后按“开发版本与应用版本切换回归”验证 Bridge。

通过标准：安装目录没有完整外置 `node_modules`；设置保存、Agent 启动、探索降级、CLI 状态、Bridge 更新和进程退出均正常；安装耗时需单独记录，超过 2 分钟不得作为候选发布版。

### 开发版本与应用版本切换回归

切换前必须先完全退出 MSFS 2024；建议同时退出桌面应用。切换完成后再启动 MSFS。

```powershell
# 回退/切换到开发版本
pnpm msfs:use:dev

# 切回应用版本（应用版本已由候选安装包创建后才可执行）
pnpm msfs:use:app
```

验证以下结果：

1. `Community2024\msfs-native-cli-route-bridge` 始终只有一个当前生效目录。
2. 开发版本和应用版本的文件内容互不覆盖；切换后当前生效目录与目标版本的 `manifest.json`、`layout.json` 和 WASM 哈希一致。
3. 运行 `pnpm desktop:dev` 会刷新开发 CLI 快照并自动切换到开发版本。
4. 在已有开发版本库的机器上启动候选应用，会更新并启用应用版本，不会修改开发版本。

## 桌面语音闭环

1. 执行 `pnpm desktop:build`，再执行 `pnpm desktop:preview` 打开 Electron 桌面窗口。
2. 确认应用自动启动 Worker，并在 LiveKit 不可用时显示脱敏、可重试的错误，而不是停留在伪在线状态。
3. 按住居中的“按住说话”胶囊；首次使用时允许本地应用访问麦克风。
4. 确认胶囊原位变蓝，文案变为“松开结束”，5 根音量柱随说话音量变化，用户转写随后出现在聊天区。
5. 松开后确认麦克风被静音，状态依次进入思考/回答并播放 Agent 音频；再次按住时不重复创建采集链路。
6. 拒绝权限时确认界面显示“麦克风不可用”，再次按住可以重试。
7. 让 Agent 开始播放较长回答并点击挂断，确认声音立即停止且旧回答不会在恢复语音后继续播放；文字聊天应保持可用。
8. 恢复语音后确认上次模式仍被选中，但麦克风不会自动开启。
9. 使用 Tab 将焦点移动到挂断按钮，在按住说话模式按住空格，确认开始录音而不是触发挂断；Enter 仍可操作按钮。

## 工具调用前中间话术模拟

该检查用于验证通用提示词对所有工具调用的约束，不绑定 `searchWeb` 的实现。它会使用当前 `.env` 的 DeepSeek 和搜索配置，分别模拟中文/英文联网问题与普通问题：

```powershell
pnpm guide:preamble:smoke
```

联网问题必须触发工具调用；首轮允许出现一句简短、自然的核实提示，但模型可以选择不说，因此提示话术不是每次都保证出现。普通问题不应调用工具。模拟结果会输出首轮文本、工具调用、搜索状态、来源数量和最终回答；当前验证同时覆盖中文与英文分支。

## 桌面文字闭环

1. 确认标题状态为“在线”，文字输入框和发送按钮处于可用状态。
2. 输入一个问题并按 Enter，确认输入框清空且用户文字只显示一个气泡；Shift+Enter 应保留为换行。
3. 确认状态进入“思考中/回答中”，随后在同一消息区显示回答并播放 TTS 音频。
4. 对需要联网的问题确认现有 `searchWeb` 来源卡片仍附加在 Agent 回答下，不会附加到用户文字。
5. 在 Agent 回答过程中发送新文字，确认当前回答被打断并开始处理新的文字轮次。
6. 发送失败时确认草稿不会清空；断开 Room 时输入框和发送按钮保持禁用。
7. 要求 Agent 返回标题、粗体、列表、代码和表格，确认 Markdown 被渲染且不会显示原始标记；原始 HTML、HTTP 链接和远程图片不得变成可执行内容。
8. 停留在消息底部时确认回答自动跟随；主动上翻后确认页面保持原位并出现“新消息”按钮，点击后回到底部。

2026-07-19 已完成上述真实 Electron 文字闭环、回答中打断、Markdown、智能滚动、语音挂断与空格键回归验收，用户确认没有问题。

### 连续对话回归检查

1. 切换“连续对话”并点击“开始连续对话”，确认标题显示“等待你说话”。
2. 说完一句完整问题后保持安静，不点击结束按钮。
3. 确认 VAD 先把用户状态从 speaking（讲话中）切回 listening（等待中），随后官方 Turn Detector 自动提交轮次并触发 Agent 回答。
4. 同一 final utterance（最终话语）只能产生一个用户气泡；火山 ASR 在同一请求中重复返回累计 utterance 时，Provider 适配层必须去重。
5. 从连续对话切回按住说话，再切回连续对话，确认始终复用同一个 Session 和麦克风管线。

浏览器预览适合检查布局，但内置浏览器可能没有可用麦克风设备；真实麦克风和回答播放验收以 Electron 窗口为准。

- 中断或离开房间后，Worker 不保留该用户的会话状态。

## 常见配置问题

- `VOLCENGINE_TTS_SPEAKER` 必须是当前账户已开通的音色，不可直接使用示例值。
- 本地试听样例必须放在 `resources/tts/confirmed-voices/`，文件名需要包含可解析的语言和性别标记；删除样例后重新执行 `pnpm desktop:build`，staging 会清理 `out/tts` 中的旧文件。
- `VOLCENGINE_LLM_MODEL` 必须是方舟账户可调用的 endpoint/model ID。
- `VOLCENGINE_SPEECH_API_KEY` 可供 STT 优先使用；TTS 仍需要 App ID 和 Access Token。
- `pnpm agent:check` 不会调用云端服务，因此只能验证配置完整性，不能替代上述真实语音联调。
- `searchWeb` 是公开网页搜索，不等同于专用天气 API，也不能读取模拟器中的位置、天气或其他遥测数据。
- 搜索结果可能包含较长正文；语音回答应保持两到四句话。若出现长时间播报，应优化工具结果总长度或提示词，而不是取消搜索。
- 部分 Windows 环境的个人 PowerShell Profile（启动配置脚本）会被系统执行策略阻止，进而影响 LiveKit 的进程监控依赖。若 `pnpm agent:dev` 出现该错误，仅在当前终端执行以下两行后重试；不会修改系统执行策略或用户的永久环境变量：

  ```powershell
  $env:USERPROFILE = Join-Path $env:TEMP 'msfs-livekit-agent-profile'
  pnpm agent:dev
  ```

## 停止本地测试

- 退出桌面应用会自动停止 Agent Worker 并释放 Room、麦克风与回答音频。
- 在运行 `livekit-server.exe --dev` 的 PowerShell 窗口按 `Ctrl+C` 停止本机 LiveKit Server。
