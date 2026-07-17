# 本地语音 Agent 冒烟测试

**最近一次通过：** 2026-07-16，本机 LiveKit Server 中完成“用户语音 → 豆包 STT → DeepSeek 主动调用 `searchWeb` → DeepSeek 组织答案 → 豆包 TTS 播放”的真实链路。搜索后端返回经过过滤的公开网页来源。

## 前置条件

- 已启动或已配置可访问的 LiveKit Server（实时音视频房间服务）。
- 已具备一个可加入 LiveKit 房间、发布麦克风音频的客户端。仓库桌面端目前只实现本地麦克风轨道和音量反馈，尚未连接 Room；端到端联调继续使用 LiveKit Meet（官方测试页面）。
- DeepSeek LLM、豆包流式 ASR 和豆包双向流式 TTS 均已开通，且音色已授权。
- 如需验证外部信息工具，`.env` 中还需配置 `VOLCENGINE_SEARCH_API_KEY`。

## 启动本机 LiveKit Server

本项目不容器化 Agent；下列 Docker 命令（容器运行命令）只用于临时启动本机 LiveKit Server。它仅绑定 `127.0.0.1`（本机回环地址），关闭终端或执行停止命令后不会保留服务。

```powershell
docker run -d --rm --name msfs-livekit-dev `
  -p 127.0.0.1:7880:7880/tcp `
  -p 127.0.0.1:7881:7881/tcp `
  -p 127.0.0.1:50000-50100:50000-50100/udp `
  livekit/livekit-server:v1.13.3 --dev --bind 0.0.0.0 --udp-port 50000-50100
```

在本地 `.env`（环境变量文件）中使用 LiveKit 开发模式默认值：

```env
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

## 步骤

1. 复制 `.env.example` 为 `.env`，填写真实凭据与已开通的模型/音色配置。
2. 执行 `pnpm agent:check`。它只校验本地配置并输出脱敏状态，成功时会显示所有能力为 `configured`。
3. 执行 `pnpm agent:dev` 启动 LiveKit Agent Worker（工作进程）。
4. 使用 LiveKit CLI（命令行工具）生成一次性测试参与者 Token（访问令牌）并同时分派 Agent：

   ```powershell
   lk token create --dev --join --room msfs-local-test --identity local-pilot --name "本地测试飞行员" --agent msfs-voice-guide --valid-for 24h --open meet
   ```

   `--open meet` 会打开 LiveKit Meet。允许麦克风后加入房间，再说出需要外部信息的问题，例如“北京现在天气怎么样”或“给我讲讲喜马拉雅山的形成故事”。

5. 确认收到中文语音回复，并在 Worker 日志中看到 `Executing LLM tool call`、`function: "searchWeb"` 和成功状态。

## 通过标准

- Worker 成功连接 LiveKit，且日志不出现密钥值。
- 用户语音被火山 STT 识别，导游 Agent 生成回复，并由火山 TTS 播放。
- DeepSeek 对需要外部信息的问题主动调用 `searchWeb`，搜索服务返回 `ok` 或可解释的低置信度/错误状态。
- 天气、新闻等时效性回答说明来源地点和时间；来源时间不明确时不声称为实时信息。

## 桌面麦克风与音量反馈

该检查只验证桌面 Renderer 的本地音轨，不代表已经接通 Agent：

1. 执行 `pnpm desktop:build`，再执行 `pnpm desktop:preview` 打开 Electron 桌面窗口。
2. 按住居中的“按住说话”胶囊；首次使用时允许本地应用访问麦克风。
3. 确认连接完成后胶囊原位变蓝，文案变为“松开结束”，5 根音量柱随说话音量变化。
4. 松开后确认界面立即恢复空闲状态，麦克风轨道被静音；再次按住时不重复弹出权限请求。
5. 拒绝权限时确认界面显示“麦克风不可用”，再次按住可以重试。

浏览器预览适合检查布局，但内置浏览器可能没有可用麦克风设备；真实麦克风验收以 Electron 窗口为准。当前音轨不会发送给 Agent，直到短期 Token、Room 连接和发布逻辑完成。

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

- 在 Agent 终端按 `Ctrl+C` 停止 Worker。
- 执行 `docker stop msfs-livekit-dev` 停止本机 LiveKit Server。
