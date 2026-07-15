# Microsoft Flight Simulator AI 导游助手

## 项目简介

面向单个模拟飞行用户的实时语音导游助手。第一版只提供本地运行的 LiveKit 房间语音对话；它以自然、简洁的方式讲解模拟飞行相关内容，不读取模拟器遥测数据，也不调用业务工具。

## 开发前必读

1. 阅读 `docs/adr/`（架构决策记录）中所有已接受的 ADR。
2. 阅读当前功能对应的 `docs/specs/`（功能规格）。
3. 对 LiveKit Agents 的任何 API、导入路径、事件名或配置项，先核验官方文档和本地 `node_modules` 中当前安装版本的 TypeScript 类型定义；不得凭记忆编写。

## 模块结构

```text
src/
  agent/          # LiveKit Agent 入口与会话编排，只放 SDK 集成
  core/           # 启动、日志、Provider 自检等无业务编排
  conversation/   # 导游角色、提示词与会话策略
  config/         # Zod 配置 Schema 与环境变量加载
  providers/      # LLM、STT、TTS Provider 工厂注册表与火山适配器
    llm/           # DeepSeek LLM 工厂
    stt/           # 豆包流式 ASR 工厂/适配器
    tts/           # 豆包双向流式 TTS 工厂/适配器
  shared/         # 无业务归属的小型通用工具
```

后续按需增加 `tools/`（业务工具）与 `cli/`（命令行工具）。只有出现第二个真实使用点时才抽取共享抽象，避免为第一版预建设计。

## 文档索引

| 类型     | 路径                            | 说明                         |
| -------- | ------------------------------- | ---------------------------- |
| 架构决策 | `docs/adr/`                     | 长期有效、不可随意违背的约束 |
| 功能需求 | `docs/specs/`                   | 功能边界与可验证验收标准     |
| 架构概览 | `docs/architecture/overview.md` | 模块关系、数据流和外部依赖   |
| Bug 记录 | `docs/bugs/`                    | 非微小问题的 Issue 化记录    |

## 代码组织原则

- 使用 TypeScript、pnpm、Zod（运行时配置与工具参数校验）和 Vitest（核心测试）。
- `src/agent/` 仅负责 LiveKit 生命周期和依赖装配，不能承载提示词、环境变量解析或未来业务工具逻辑。
- Provider 的具体实现只能出现在 `src/providers/`；`registry.ts`（Provider 工厂注册表）是唯一创建入口，其他模块不得散落引用火山 SDK 或 WebSocket。
- 遵循参考项目 `D:\code\Pipecat-AI` 的“按 STT/LLM/TTS 分类 + 集中注册表 + 启动前自检”规范；只继承职责边界，不复制 Python/Pipecat 实现。
- 所有密钥均从环境变量读取；`.env`、`.env.local` 等含密钥文件永不提交。提供不含值的 `.env.example`。
- 优先使用 LiveKit SDK、Zod、Vitest 和 Provider 官方 SDK 已有能力，不重新实现协议、音频管线、校验器或测试运行器。
- 修改前先阅读关联 ADR；任何与 ADR 冲突的需求必须先新增或修订 ADR。

## 测试策略

- `tests/` 是本项目唯一测试目录；不在业务模块旁另建第二个测试根目录。
- `tests/unit/`：配置解析、提示词构建和无副作用的 Provider 选择逻辑。
- `tests/integration/`：在 mock 或官方测试替身下验证会话依赖装配和故障提示。
- `tests/e2e/`：可选的本地 LiveKit 连通性冒烟测试；不得依赖真实密钥才能运行默认测试集。
- 每个写入 ADR 的不变量都应有可自动执行的测试或静态检查。

## 当前已确认不做的事项

- Web、移动端或其他客户端实现。
- 多用户共用一个 Agent 房间、房间级群聊策略。
- Microsoft Flight Simulator 遥测、位置、高度、航向或航线数据接入。
- 业务工具调用、工具参数 Schema 的具体实现。
- 云端部署、Docker、持久化存储、账号体系和运营后台。
- DeepSeek 与豆包语音以外的 Provider，以及运行时 Provider 切换。

## 约束来源

见 `docs/adr/`。所有新会话开始时均应按需阅读。
