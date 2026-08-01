# 本地语音与文字 Agent 冒烟测试

**最近一次通过：** 2026-08-01，开发态 Electron 默认自动启动本地 LiveKit：动态端口 6932、Agent 健康检查 HTTP 200。2026-07-19 已在 Electron 中完成语音与文字两条真实链路：连续对话可自动检测轮次结束并经过豆包 STT、DeepSeek 与豆包 TTS；文字输入可通过 LiveKit `lk.chat` 进入同一 AgentSession，显示并播放回答，且回答中发送新文字可以触发打断。用户确认测试没有问题。2026-07-16 已另行验证 `searchWeb` 的真实搜索链路。

## 前置条件

- `resources/livekit/livekit-server.exe` 已准备好；开发态桌面应用会默认自动启动本地 LiveKit，外部模式才需要预先配置可访问的 Server。
- 已构建 Electron 桌面客户端；它会自动创建短期 Token、加入唯一房间、分派 Agent 并发布麦克风音频。
- DeepSeek LLM、豆包流式 ASR 和豆包双向流式 TTS 均已开通，且音色已授权。
- 如需验证外部信息工具，`.env` 中还需配置 `VOLCENGINE_SEARCH_API_KEY`。

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
