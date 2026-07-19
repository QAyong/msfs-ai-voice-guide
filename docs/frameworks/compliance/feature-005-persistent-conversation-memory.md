# 框架合规审核：基于 Mem0 的持久化对话记忆

**日期：** 2026-07-19

**结论：** 待验证（仅完成需求与架构文档，尚未实施）

## 实现前依据

- 涉及框架及实际版本：`@livekit/agents` 1.5.2；Mem0 尚未安装、无实际版本。
- 版本证据：`node_modules/@livekit/agents/package.json`、`package.json`、`pnpm-lock.yaml`。
- 搜索到的项目内类似实现：`src/search/` 已使用“共享业务服务 + LiveKit 工具/入口适配”的职责边界，可复用其依赖装配、配置和错误处理组织方式，但不复用搜索业务逻辑。
- 准备复用的项目模块：`src/config/` 的 Zod 配置边界、`src/agent/` 的 LiveKit 会话装配、现有脱敏错误处理与 Vitest 测试结构。
- 准备使用的官方能力：LiveKit `ChatContext`（聊天上下文）、`AgentSession.history`（会话历史）、Agent 构造时的初始上下文、用户回合完成钩子和会话事件；Mem0 Node SDK 的记忆新增、检索、更新和删除能力。
- 官方文档 URL 与具体章节：
  - [LiveKit Chat context：初始化、修改、裁剪和跨 Agent 传递上下文](https://docs.livekit.io/agents/logic/chat-context/)
  - [LiveKit External data and RAG：加载用户资料、回合前检索和外部存储](https://docs.livekit.io/agents/build/external-data/)
  - [Mem0 LiveKit integration：长期记忆的 LiveKit 集成模式](https://docs.mem0.ai/integrations/livekit)
  - [Mem0 Node SDK quickstart：TypeScript/JavaScript 新增与搜索记忆](https://docs.mem0.ai/open-source/node-quickstart)
- 文档不匹配或不可用时检查的本地源码/类型定义：`node_modules/@livekit/agents/src/voice/agent_session.ts`、`agent.ts` 和发布的 `dist/*.d.ts`；实施时再检查实际安装的 Mem0 包源码与类型。
- 新增第三方依赖及理由：计划新增 Mem0 Node SDK，用于长期记忆提取、持久化和语义召回，避免自建记忆算法和向量基础设施。
- 自定义实现：仅新增项目 `MemoryService` 边界、Mem0 适配器、保存策略、上下文预算和提示词注入防护。

## 已发现的证据缺口

- Mem0 尚未安装，不能确认最终版本、导出路径、配置 Schema 和运行时行为。
- Mem0 官方 LiveKit 专门示例以 Python 为主，不能当作本项目 Node.js API 的直接证据。
- Mem0 Node SDK 虽有官方 TypeScript 文档，但与 LiveKit Agents 1.5.2 的组合没有经过本项目验证。
- Mem0 OSS、Mem0 Platform、记忆提取 LLM、Embedding 和向量存储尚未选定。
- 在上述缺口关闭前，不得凭示例或记忆编写生产接入代码。

## 自定义实现例外

- 官方能力为何不适用：LiveKit 只维护当前 Session 的上下文，不提供项目所需的跨 Session 长期记忆存储；Mem0 也不负责 LiveKit 生命周期装配和项目隐私策略。
- 项目已有实现为何不能复用：`src/search/` 处理公开网页证据，不具备用户长期记忆语义，不能扩展为同一数据服务。
- 成熟第三方方案为何不适用：已经选择 Mem0 作为首选候选，不在第一阶段同时接入 Zep、Letta、LangGraph 或 LlamaIndex；若 Mem0 Node SDK 验证失败，再重新进行选型审核。
- 维护风险：SDK 版本不匹配、双重上下文、语音延迟、记忆污染、敏感数据保存和第三方云依赖。
- 防回归测试：见 `docs/specs/spec-005-persistent-conversation-memory.md` 第 9、10 节。
- 相关 ADR：`docs/adr/adr-007-mem0-memory-boundary.md`。

## 实现后核对

- 实际复用的模块或官方组件：待实施后填写。
- 新增的自定义基础设施：待实施后填写。
- 偏离官方推荐方式：待实施后填写。

## 验证证据

| 检查         | 命令               | 结果                   |
| ------------ | ------------------ | ---------------------- |
| 类型检查     | `pnpm typecheck`   | 未运行；本轮无代码实现 |
| Lint         | `pnpm lint`        | 未运行；本轮无代码实现 |
| 构建         | `pnpm build`       | 未运行；本轮无代码实现 |
| 框架原生检查 | `pnpm agent:check` | 未运行；Mem0 尚未安装  |
| 自动化测试   | `pnpm test`        | 未运行；测试尚未实现   |

## 给非程序员的结论

当前只确认了需求、边界和首选方向，还不能判定“框架接入通过”。正式开发必须先固定 Mem0 实际版本，验证 Node.js API，再用自动化测试证明跨会话召回、删除、隔离和故障降级均符合 Spec-005。
