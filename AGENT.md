# Microsoft Flight Simulator AI 导游助手

## 项目简介

面向单个模拟飞行用户的实时语音导游助手。当前版本提供由 Electron 自动启动 Worker 的 LiveKit 房间语音对话，通过 `searchWeb` 查询公开网页，并通过原生 MSFS CLI 的 7 个只读高层工具读取飞行快照、地理上下文、EFB 航路、下一航点、附近航空设施、游戏内天气/时间和本次会话轨迹；桌面端已完成悬浮窗口、Room 连接、语音发布/播放、真实转写、来源浏览、启动诊断和非阻断模拟器就绪提示，正式安装包仍待完成。

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
  search/         # 共享搜索服务：API 请求、结果清洗与相关性保护
  msfs/           # 原生 MSFS CLI 适配：进程、JSON/NDJSON、领域模型、错误和轨迹缓存
  memory/         # 未来持久化记忆边界；Mem0 只能位于供应商适配层（Spec-005）
  tools/          # LiveKit 可调用的业务工具包装层
  cli/            # CLI 命令行入口，复用共享业务服务
  shared/         # 无业务归属的小型通用工具
desktop/          # Electron 主进程、Preload 与 React Renderer
```

`tools/` 与 `cli/` 已作为 `search/` 的两个真实入口存在。后续仍只在出现真实使用点时抽取新的共享抽象。

## 文档索引

| 类型     | 路径                            | 说明                         |
| -------- | ------------------------------- | ---------------------------- |
| 架构决策 | `docs/adr/`                     | 长期有效、不可随意违背的约束 |
| 功能需求 | `docs/specs/`                   | 功能边界与可验证验收标准     |
| 架构概览 | `docs/architecture/overview.md` | 模块关系、数据流和外部依赖   |
| Bug 记录 | `docs/bugs/`                    | 非微小问题的 Issue 化记录    |
| 框架登记 | `docs/frameworks/registry.md`   | 实际依赖版本与官方依据       |
| 框架合规 | `docs/frameworks/compliance/`   | 功能实施前后的复用与验证证据 |

## 代码组织原则

- 使用 TypeScript、pnpm、Zod（运行时配置与工具参数校验）和 Vitest（核心测试）。
- `src/agent/` 仅负责 LiveKit 生命周期和依赖装配，不能承载提示词、环境变量解析或未来业务工具逻辑。
- `src/search/` 是与 LiveKit 无关的共享搜索服务；Agent 工具和 CLI 必须复用它，不得各自实现搜索请求、清洗和相关性判断。
- Spec-005 实施后，`src/memory/` 是与 LiveKit 和 Mem0 SDK 解耦的长期记忆边界；Agent 只组合服务，Mem0 依赖只能出现在供应商适配器中。
- LiveKit `ChatContext` 负责当前 Session，长期记忆负责跨 Session 用户信息，`searchWeb` 负责公开网页事实；三者不得互相替代或混存。
- `src/tools/` 只负责将共享业务能力包装成 LiveKit Tool（工具）；`src/cli/` 只负责命令行参数、输出和退出码。
- `searchWeb` 是模型获取公开网页外部信息的通用入口，可用于天气、新闻、活动、规则和知识查询；时效性结果必须保留并关注来源时间。
- Agent 不得通过 `child_process` 启动 CLI 执行搜索；CLI 是共享服务的入口，不是实时 Agent 的运行时依赖。
- 桌面前端需求以 Spec-004 与 Spec-006 为准；`desktop/` 是生产实现入口，不得被描述为 `.exe` 安装包。
- 未来加载第三方网页时，必须放入独立、无 Node 权限的 `WebContentsView`（隔离网页视图）；远程网页不得获得 Preload、IPC、文件系统或 Agent 密钥。
- Provider 的具体实现只能出现在 `src/providers/`；`registry.ts`（Provider 工厂注册表）是唯一创建入口，其他模块不得散落引用火山 SDK 或 WebSocket。
- 遵循参考项目 `[reference project]` 的“按 STT/LLM/TTS 分类 + 集中注册表 + 启动前自检”规范；只继承职责边界，不复制 Python/Pipecat 实现。
- 所有密钥均从环境变量读取；`.env`、`.env.local` 等含密钥文件永不提交。提供不含值的 `.env.example`。
- LiveKit 开发与安装态均使用官方 Windows `livekit-server.exe` 的本地运行方式；Docker 不属于本项目的开发、测试或发行路径。开发者从受忽略的 `resources/livekit/livekit-server.exe` 以 `--dev` 启动回环服务，安装态由 Electron 以私有配置启动随包二进制，详见 ADR-009 与 Spec-011。
- 优先使用 LiveKit SDK、Zod、Vitest 和 Provider 官方 SDK 已有能力，不重新实现协议、音频管线、校验器或测试运行器。
- 修改前先阅读关联 ADR；任何与 ADR 冲突的需求必须先新增或修订 ADR。

## 测试策略

- `tests/` 是本项目唯一测试目录；不在业务模块旁另建第二个测试根目录。
- `tests/unit/`：配置解析、提示词构建和无副作用的 Provider 选择逻辑。
- `tests/integration/`：在 mock 或官方测试替身下验证会话依赖装配和故障提示。
- `tests/e2e/`：显式运行的真实搜索或本地 LiveKit 冒烟测试；默认测试集在没有真实密钥时必须安全跳过。
- 每个写入 ADR 的不变量都应有可自动执行的测试或静态检查。

## 当前已确认不做的事项

- Web 与移动端客户端；Windows Electron 客户端已进入实现阶段，但正式安装包、自动更新和代码签名不在当前范围内。
- 多用户共用一个 Agent 房间、房间级群聊策略。
- 任何会改变模拟器状态的 MSFS 写操作，包括自动驾驶、航班加载、AI 飞机、相机和 Input Event 控制。
- 专用天气 API、新闻 API 或其他独立业务数据 Provider；通用网页查询统一走现有 `searchWeb`。
- 当前版本不实现云端部署、账号体系和运营后台；持久化记忆作为 Spec-005 的未来需求，实施前不得默认启用第三方云端上传。
- DeepSeek 与豆包语音以外的 Provider，以及运行时 Provider 切换。

## 约束来源

见 `docs/adr/`。所有新会话开始时均应按需阅读。
