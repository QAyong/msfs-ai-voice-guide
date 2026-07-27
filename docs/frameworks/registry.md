# 框架登记表

**最后更新：** 2026-07-28

| 框架或核心库                    | 实际版本 | 版本证据                                                                                                                                                                                          | 对应版本官方文档                                                                 | 项目用途                                             |
| ------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `@livekit/agents`               |    1.5.2 | `node_modules/@livekit/agents/package.json`、`package.json`、`pnpm-lock.yaml`                                                                                                                     | [LiveKit Agents Node.js API](https://docs.livekit.io/reference/agents-js/)       | 实时语音 Agent 生命周期、会话历史与工具调用          |
| `@livekit/agents-plugin-openai` |    1.5.2 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [LiveKit OpenAI-compatible LLM](https://docs.livekit.io/agents/models/llm/)      | 通过 `withDeepSeek()` 创建 DeepSeek LLM              |
| `livekit-client`                |   2.20.1 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [LiveKit JavaScript SDK](https://docs.livekit.io/reference/client-sdk-js/)       | 桌面 Room、媒体发布订阅、转写流和自动重连            |
| `@livekit/components-react`     |   2.9.21 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [LiveKit React components](https://docs.livekit.io/reference/components/react/)  | Renderer Session、Agent 状态、消息、麦克风和音频播放 |
| `livekit-server-sdk`            |   2.17.0 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [LiveKit server SDKs](https://docs.livekit.io/home/server/generating-tokens/)    | 短期 Token 与 Agent 分派                             |
| LiveKit Server（Windows）       |   1.13.4 | [官方 ZIP](https://github.com/livekit/livekit/releases/download/v1.13.4/livekit_1.13.4_windows_amd64.zip)；官方 SHA-256 `a326e025de516e93dfb3719bcd28e5a4ac16f21bcf1ef562499403ca98cc65fe` 已核验 | [Running LiveKit locally](https://docs.livekit.io/transport/self-hosting/local/) | 开发态与 Spec-011 的应用私有本地 Room 运行时         |
| Electron                        |   43.1.1 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [Electron API](https://www.electronjs.org/docs/latest/api/app)                   | 桌面主进程、Utility Process、窗口和安全 IPC          |
| `node-gyp`                      |   13.0.1 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [node-gyp](https://github.com/nodejs/node-gyp)                                   | 构建 Windows 全局按住说话的 N-API 原生模块           |
| React                           |   19.2.7 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [React reference](https://react.dev/reference/react)                             | 桌面可信 Renderer                                    |
| `react-markdown`                |   10.1.0 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [react-markdown](https://github.com/remarkjs/react-markdown)                     | 将 Agent Markdown 安全渲染为 React 元素              |
| `remark-gfm`                    |    4.0.1 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [remark-gfm](https://github.com/remarkjs/remark-gfm)                             | 表格、任务列表、删除线等 GFM 扩展                    |
| Zod                             |    4.4.3 | `package.json`、`pnpm-lock.yaml`                                                                                                                                                                  | [Zod documentation](https://zod.dev/)                                            | 配置、IPC 与来源消息边界校验                         |
| `archiver`                      |    7.0.1 | `package.json`、`pnpm-lock.yaml`、`node_modules/archiver/package.json`                                                                                                                            | [Archiver API](https://www.archiverjs.com/docs/archiver/)                        | 以流方式生成诊断 ZIP，避免手写归档格式               |
| Mem0                            |   未安装 | `package.json` 与 `pnpm-lock.yaml` 中不存在 Mem0 依赖                                                                                                                                             | [Mem0 Node SDK](https://docs.mem0.ai/open-source/node-quickstart)                | Spec-005 的长期记忆候选实现，实施前必须固定版本      |

## 规划依赖说明

- Mem0 目前只是已接受的未来技术方向，不是当前运行时依赖。
- Mem0 官方 LiveKit 示例当前以 Python 为主；本项目是 TypeScript，因此实施时必须同时核对 Mem0 Node SDK 和已安装 LiveKit Agents 版本，不能直接复制 Python 示例。
- 在实际安装 Mem0、Embedding 或存储依赖后，必须用锁文件中的精确版本更新本表。

## 维护规则

- 以锁文件、已安装包元数据或运行结果为版本事实来源。
- 不得用最新版文档替代当前安装版本的类型定义和行为验证。
- 新增或升级核心框架时同步更新本表。
- 无法找到对应版本文档时，记录所检查的本地源码或 TypeScript 类型定义。
- LiveKit Server 是独立二进制发布物，不由 pnpm 锁文件管理；将它纳入安装包时必须登记精确版本、上游下载地址、SHA-256 与许可证，不能使用无版本的全局安装或 Docker `latest` 标签。
