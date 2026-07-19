# 框架登记表

**最后更新：** 2026-07-19

| 框架或核心库                    | 实际版本 | 版本证据                                                                      | 对应版本官方文档                                                            | 项目用途                                        |
| ------------------------------- | -------: | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `@livekit/agents`               |    1.5.2 | `node_modules/@livekit/agents/package.json`、`package.json`、`pnpm-lock.yaml` | [LiveKit Agents Node.js API](https://docs.livekit.io/reference/agents-js/)  | 实时语音 Agent 生命周期、会话历史与工具调用     |
| `@livekit/agents-plugin-openai` |    1.5.2 | `package.json`、`pnpm-lock.yaml`                                              | [LiveKit OpenAI-compatible LLM](https://docs.livekit.io/agents/models/llm/) | 通过 `withDeepSeek()` 创建 DeepSeek LLM         |
| Mem0                            |   未安装 | `package.json` 与 `pnpm-lock.yaml` 中不存在 Mem0 依赖                         | [Mem0 Node SDK](https://docs.mem0.ai/open-source/node-quickstart)           | Spec-005 的长期记忆候选实现，实施前必须固定版本 |

## 规划依赖说明

- Mem0 目前只是已接受的未来技术方向，不是当前运行时依赖。
- Mem0 官方 LiveKit 示例当前以 Python 为主；本项目是 TypeScript，因此实施时必须同时核对 Mem0 Node SDK 和已安装 LiveKit Agents 版本，不能直接复制 Python 示例。
- 在实际安装 Mem0、Embedding 或存储依赖后，必须用锁文件中的精确版本更新本表。

## 维护规则

- 以锁文件、已安装包元数据或运行结果为版本事实来源。
- 不得用最新版文档替代当前安装版本的类型定义和行为验证。
- 新增或升级核心框架时同步更新本表。
- 无法找到对应版本文档时，记录所检查的本地源码或 TypeScript 类型定义。
