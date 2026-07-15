# 本地语音 Agent 冒烟测试

## 前置条件

- 已启动或已配置可访问的 LiveKit Server。
- 已具备一个可加入 LiveKit 房间、发布麦克风音频的客户端；本仓库不提供客户端。
- 火山方舟 LLM、豆包流式 ASR 和豆包双向流式 TTS 均已开通，且音色已授权。

## 步骤

1. 复制 `.env.example` 为 `.env`，填写真实凭据与已开通的模型/音色配置。
2. 执行 `pnpm agent:check`。它只校验本地配置并输出脱敏状态，成功时会显示所有能力为 `configured`。
3. 执行 `pnpm agent:dev` 启动 LiveKit Agent Worker（工作进程）。
4. 使用客户端为一个用户创建独立 LiveKit 房间，并按客户端侧既有机制把名为 `msfs-voice-guide` 的 Agent 分派到该房间。
5. 用户说出模拟飞行相关问题，确认收到中文语音回复。

## 通过标准

- Worker 成功连接 LiveKit，且日志不出现密钥值。
- 用户语音被火山 STT 识别，导游 Agent 生成回复，并由火山 TTS 播放。
- 中断或离开房间后，Worker 不保留该用户的会话状态。

## 常见配置问题

- `VOLCENGINE_TTS_SPEAKER` 必须是当前账户已开通的音色，不可直接使用示例值。
- `VOLCENGINE_LLM_MODEL` 必须是方舟账户可调用的 endpoint/model ID。
- `VOLCENGINE_SPEECH_API_KEY` 可供 STT 优先使用；TTS 仍需要 App ID 和 Access Token。
- `pnpm agent:check` 不会调用云端服务，因此只能验证配置完整性，不能替代上述真实语音联调。
