# 本地语音 Agent 冒烟测试

**最近一次通过：** 2026-07-15，本机 LiveKit Server + 火山方舟 LLM + 豆包 STT/TTS；人工语音对话正常。

## 前置条件

- 已启动或已配置可访问的 LiveKit Server（实时音视频房间服务）。
- 已具备一个可加入 LiveKit 房间、发布麦克风音频的客户端；本仓库不提供客户端实现。可使用 LiveKit Meet（官方测试页面）。
- 火山方舟 LLM、豆包流式 ASR 和豆包双向流式 TTS 均已开通，且音色已授权。

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

   `--open meet` 会打开 LiveKit Meet。允许麦克风后加入房间，再说出模拟飞行相关问题。

5. 确认收到中文语音回复。

## 通过标准

- Worker 成功连接 LiveKit，且日志不出现密钥值。
- 用户语音被火山 STT 识别，导游 Agent 生成回复，并由火山 TTS 播放。
- 中断或离开房间后，Worker 不保留该用户的会话状态。

## 常见配置问题

- `VOLCENGINE_TTS_SPEAKER` 必须是当前账户已开通的音色，不可直接使用示例值。
- `VOLCENGINE_LLM_MODEL` 必须是方舟账户可调用的 endpoint/model ID。
- `VOLCENGINE_SPEECH_API_KEY` 可供 STT 优先使用；TTS 仍需要 App ID 和 Access Token。
- `pnpm agent:check` 不会调用云端服务，因此只能验证配置完整性，不能替代上述真实语音联调。
- 部分 Windows 环境的个人 PowerShell Profile（启动配置脚本）会被系统执行策略阻止，进而影响 LiveKit 的进程监控依赖。若 `pnpm agent:dev` 出现该错误，仅在当前终端执行以下两行后重试；不会修改系统执行策略或用户的永久环境变量：

  ```powershell
  $env:USERPROFILE = Join-Path $env:TEMP 'msfs-livekit-agent-profile'
  pnpm agent:dev
  ```

## 停止本地测试

- 在 Agent 终端按 `Ctrl+C` 停止 Worker。
- 执行 `docker stop msfs-livekit-dev` 停止本机 LiveKit Server。
