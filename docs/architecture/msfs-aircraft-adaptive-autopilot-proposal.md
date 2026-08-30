# MSFS 多机型自动驾驶适配方案（审阅稿）

**日期：** 2026-08-30  
**状态：** 待审阅  
**文档目的：** 在保留当前安全边界的前提下，让 AI 能识别不同飞机支持哪些自动驾驶能力，并使用正确的控制方式。

## 一、先说结论

MSFS 里的自动驾驶不能被当成一套所有飞机都一样的按钮。

不同飞机可能出现以下情况：

- 有的飞机完全没有自动驾驶；
- 有的飞机只有 AP、HDG、ALT，不能使用 FLC、APP 或自动油门；
- 有的飞机虽然有自动驾驶，但事件名称、参数和模式逻辑与默认飞机不同；
- 同一机型的不同航电版本，例如 G1000、G3000，也可能需要不同映射；
- 变量能读取，不代表对应功能一定能写入或已经真正生效。

因此建议把自动驾驶控制改成：

~~~text
用户说“爬升到 5000 英尺”
  → AI 转成统一意图
  → 识别当前飞机和航电版本
  → 查询这架飞机支持什么
  → 选择这架飞机对应的控制方法
  → 执行
  → 重新读取并确认真的生效
~~~

最终目标不是做一个“万能自动驾驶脚本”，而是做一个“统一的语义入口 + 多个机型适配器”。

## 二、当前方案是什么

当前项目已经完成了一套安全的第一版控制流程，主要定义在 [Spec-024：巡航阶段自动驾驶管理](../specs/spec-024-msfs-aircraft-actions.md) 中。

### 当前已有能力

1. Agent（AI 会话）只调用高层 `setAutopilot`（设置自动驾驶）工具，不直接调用底层 SimVar、Key Event 或 Input Event。
2. `setAutopilot` 只接受白名单参数，例如 AP、FD、HDG、NAV、ALT、VS、FLC 和目标高度。
3. 执行前读取当前自动驾驶状态和部分能力证据。
4. 官方 Key Event 是主要控制路径。
5. 已验证的机型专用 Input Event 只作为 AP/FD 的兜底路径。
6. 每一步执行后都读取状态；读回没有变化就停止，不把“事件发送成功”说成“功能已经生效”。
7. 对 `supported`（已确认支持）、`unsupported`（已确认不支持）、`unknown`（无法确认）进行区分。

当前已经验证过：

| 飞机 | 当前验证结果 |
|---|---|
| `C172SP G1000 Cargo` | AP、FD、HDG、ALT、VS、FLC、NAV 及组合设置通过 |
| `Asobo TBM 930 Passengers` | 上述自动驾驶设置通过 |
| `North American T-6 Texan Reno` | `AUTOPILOT AVAILABLE=0`，正确拒绝写入 |

当前的核心流程如下：

~~~mermaid
flowchart LR
    U[用户明确提出操作] --> T[AI 调用 setAutopilot]
    T --> S[读取自动驾驶状态]
    S --> C{能力是否支持}
    C -->|不支持或未知| R[拒绝写入并说明原因]
    C -->|支持| M[使用固定白名单映射]
    M --> E[发送 Key Event 或已验证 Input Event]
    E --> V[读取实际状态]
    V --> O{状态是否生效}
    O -->|是| OK[返回成功]
    O -->|否| F[标记未知或部分成功并停止]
~~~

### 当前方案的优点

- 已经限制了 AI 的权限，没有把任意底层写入能力暴露给模型；
- 已经考虑到飞机可能不支持自动驾驶；
- 已经有执行后回读，避免“假成功”；
- 已经避免把一架飞机的 Input Event 直接当成所有飞机的通用规则；
- 目前适合低频、明确、单次的巡航设置，不适合高频闭环操纵。

### 当前方案的主要不足

当前的“机型记忆”主要是运行时能力记忆，不是一个独立、可维护的飞机适配档案。现在的身份键主要由 `TITLE`（飞机标题）和 `ATC ID`（尾号）组成；尾号更像当前飞机实例标识，不适合单独作为控制逻辑的依据。

另外，主要映射仍集中在服务代码中：例如 HDG、NAV、ALT、VS、FLC 使用固定的通用事件，Input Event 只覆盖少量已经验证的 AP/FD 操作。这对默认飞机有效，但随着第三方飞机增多，代码会逐渐出现大量 `if/else`。

## 三、搜索结果说明了什么

### 1. 官方通用变量不是“所有飞机都支持的完整协议”

微软官方的 SimVar（模拟变量）和 Key Event（按键事件）提供了通用基础，但官方文档明确提醒：不少自动驾驶变量和事件不适用于直升机，或者不能保证在所有飞机上正常工作。[官方自动驾驶变量文档](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimVars/Aircraft_SimVars/Aircraft_AutopilotAssistant_Variables.htm)、[官方自动驾驶事件文档](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/Key_Events/Aircraft_Autopilot_Flight_Assist_Events.htm)

所以：

~~~text
“变量存在” ≠ “这架飞机支持这个能力”
“事件能发送” ≠ “这架飞机已经执行这个动作”
~~~

### 2. systems.cfg 可以提供线索，但不能取代运行时验证

官方配置中可以描述自动驾驶、飞行指引、自动油门、默认横向/纵向模式、最低高度和模式限制等信息。[官方 systems.cfg 文档](https://docs.flightsimulator.com/msfs2024/html/5_Content_Configuration/CFG_Files/systems_cfg.htm)

但配置文件只适合作为“预先知道的能力资料”。实际运行时仍可能受到当前飞行阶段、航电实现、第三方飞机逻辑和模拟器状态影响。甚至某些配置字段已经废弃，例如 `autoland_available` 不能作为可靠的自动着陆判断依据。

### 3. 社区普遍采用“按飞机/航电分配置”的做法

MobiFlight 的 Input Events 指南说明，MSFS 2024 的 BVar（行为变量）通常与具体飞机相关，一个飞机可能有数百个 Input Event；HubHop 也按飞机维护事件和变量映射。[MobiFlight Input Events 指南](https://docs.mobiflight.com/guides/input-events-2024/)、[HubHop 事件库](https://hubhop.mobiflight.com/)

MobiFlight 社区还讨论过 C172 G1000、TBM930、G1000/G3000 和不同客机航电需要独立配置的问题。[MobiFlight 机型配置讨论](https://github.com/MobiFlight/MobiFlight-Connector/discussions/419)

这说明机型识别至少要考虑：

~~~text
飞机型号 + 具体变体 + 航电系统
~~~

而不能只按“这是一架小飞机”或“这是一架客机”来判断。

### 4. 现成内容可以复用，但不能整套直接信任

文档中的 `AircraftProfile`（机型档案）格式可以直接作为我们项目的内部格式，但示例里的具体能力值和映射不是通用答案。现成资料更适合作为候选数据来源，再转换成我们的格式并完成实机验证。

| 现成内容 | 使用方式 |
|---|---|
| 微软官方通用 SimVar、Key Event | 可以直接作为基础映射，但仍要做运行时回读 |
| MobiFlight/HubHop 的飞机专用 Input Event | 可以参考或导入后转换，不能默认适用于所有变体 |
| 社区项目的完整机型档案 | 通常只能参考架构和字段，需检查格式、参数和控制逻辑 |
| `supported`、参数限制、回读条件 | 必须结合本项目的 SimConnect 接口和实机测试确认 |

最省事的复用流程是：

~~~text
现成社区映射
  → 转换成我们的 Profile 格式
  → 补充能力、参数限制和回读变量
  → 用目标飞机实机验证
  → 保存为可信的内置机型档案
~~~

不能把社区数据直接当作可信控制规则，主要原因是：

- 同一型号可能有不同变体和航电；
- 有的资料只验证了按钮事件能发送，没有验证模式真的生效；
- 事件参数、单位、目标值索引可能不同；
- 社区项目的配置格式不一定与本项目的 SimConnect 接口兼容。

因此，Profile 的“格式”可以直接采用，社区的“映射数据”可以复用，但最终的支持能力、参数转换和回读规则必须由本项目确认。没有完成确认的内容应标记为 `unknown`，不能直接写入模拟器。

## 四、建议的目标架构

~~~mermaid
flowchart LR
    U[用户语音或文字] --> N[意图解析<br/>例如：设置高度 5000 英尺]
    N --> R[能力解析器<br/>Capability Resolver]

    P[机型档案库<br/>Aircraft Profile Registry] --> R
    S[实时状态<br/>SimConnect / SimVars] --> R
    G[安全规则与飞行阶段] --> R

    R --> Q{当前飞机支持吗?}
    Q -->|支持| A[机型适配器<br/>Aircraft Adapter]
    Q -->|不支持| X[解释原因并拒绝]
    Q -->|未知| Y[只读提示<br/>不自动写入]

    A --> C[生成执行计划<br/>条件检查 → 发送控制]
    C --> M[MSFS]
    M --> V[回读状态与目标值]
    V --> S
    V --> R
~~~

### 四个新增概念

#### 1. 统一意图

AI 只理解用户想做什么，不理解底层事件名。

~~~json
{
  "action": "set_altitude",
  "targetAltitudeFeet": 5000
}
~~~

模型不需要知道 `AP_ALT_VAR_SET_ENGLISH`、`B:xxx_Set` 或某个 Input Event Hash。

#### 2. 能力解析器

`CapabilityResolver`（能力解析器）负责回答两个问题：

~~~text
这架飞机有没有这个功能？
这个功能现在是否满足执行条件？
~~~

两者要分开：

| 判断 | 示例 |
|---|---|
| 能力 | 这架飞机支持 FLC 吗？ |
| 当前可用性 | 飞机虽然支持 FLC，但现在是否允许接通？ |

能力状态建议为：`supported`、`unsupported`、`unknown`。

当前可用性建议为：`ready`（可执行）、`blocked`（条件不满足）、`active`（已生效）、`failed`（执行后未生效）。

#### 3. 机型档案

`AircraftProfile`（机型档案）记录某一类飞机具体支持什么，以及应该怎么控制。

机型档案的识别键建议为：

~~~text
模拟器版本
+ 厂商/飞机包
+ 飞机型号
+ 具体变体
+ 航电系统
+ 用户自定义覆盖
~~~

`ATC ID` 只作为当前飞机实例或尾号信息，不作为唯一的控制逻辑依据。

#### 4. 机型适配器

`AircraftAdapter`（机型适配器）把统一动作转换成具体操作。底层可以使用：

- 通用 Key Event；
- 通用 SimVar；
- 飞机专用 Input Event/BVar；
- 已有桥接能够访问时的 LVar/HVar 或其他专用接口。

上层不需要知道具体用了哪一种方法。

## 五、机型档案应该长什么样

下面是示意，不是要求一次性把所有飞机都写完：

~~~yaml
aircraftKey:
  simulator: MSFS2024
  vendor: Asobo
  model: C172
  variant: C172SP
  avionics: G1000

capabilities:
  ap_master: supported
  flight_director: supported
  heading_hold: supported
  navigation_hold: supported
  altitude_hold: supported
  vertical_speed: supported
  flight_level_change: unknown
  approach: unsupported
  autothrottle: unsupported

mappings:
  set_altitude:
    method: generic_key_event
    event: AP_ALT_VAR_SET_ENGLISH
    verify: AUTOPILOT_ALTITUDE_LOCK_VAR

  enable_altitude:
    method: generic_key_event
    event: AP_PANEL_ALTITUDE_ON
    verify: AUTOPILOT_ALTITUDE_LOCK

constraints:
  altitudeUnit: feet
  speedUnit: knots
  altitudeStep: 100
  maxVerticalSpeedFpm: 2000

verification:
  requireReadback: true
  timeoutMs: 3000

metadata:
  source: built_in_verified
  lastVerified: 2026-08-30
  profileVersion: 1
~~~

这里最重要的是：

- `capabilities` 描述“能不能做”；
- `mappings` 描述“怎么做”；
- `constraints` 描述“参数有什么限制”；
- `verification` 描述“怎样确认真的做到了”；
- `metadata` 记录资料来源和验证时间。

## 六、执行一个动作时的具体流程

以用户说“打开自动驾驶，保持航向 090 度，爬升到 5000 英尺”为例：

~~~mermaid
sequenceDiagram
    participant User as 用户
    participant Agent as AI Agent
    participant Resolver as 能力解析器
    participant Profile as 机型档案
    participant Adapter as 机型适配器
    participant MSFS as MSFS / SimConnect

    User->>Agent: 打开 AP，HDG 090，ALT 5000
    Agent->>Resolver: 传入统一意图
    Resolver->>Profile: 查找当前飞机和航电版本
    Profile-->>Resolver: AP、HDG、ALT 支持及对应映射
    Resolver->>MSFS: 读取当前状态和飞行阶段
    MSFS-->>Resolver: 当前状态、限制、目标值
    Resolver-->>Adapter: 生成本机执行计划
    Adapter->>MSFS: 按顺序发送 AP、HDG、ALT、目标值
    MSFS-->>Adapter: 返回执行结果
    Adapter->>MSFS: 回读活动模式和目标高度
    MSFS-->>Adapter: 返回实际状态
    Adapter-->>Agent: 成功、部分成功或拒绝
    Agent-->>User: 用中文说明实际生效情况
~~~

执行顺序仍然保留当前方案的经验：

~~~text
先满足前置条件
  → 再打开 AP/FD
  → 再切换横向/纵向模式
  → 最后设置目标值
  → 每一步回读验证
~~~

某些飞机切换 VS 或 FLC 时会重置目标值，所以不能假设所有飞机都能使用同一个固定顺序。

## 七、未识别或部分支持时，用户应该看到什么

### 全部支持

~~~text
已识别当前飞机为 C172 G1000。
已打开自动驾驶，HDG 设为 090 度，ALT 目标设为 5000 英尺。
回读确认：AP、HDG、ALT 均已生效。
~~~

### 部分支持

~~~text
当前飞机支持 AP、HDG 和 ALT，但不支持自动油门。
我已完成 AP、HDG、ALT 设置，没有修改油门。
~~~

对于一次同时包含多个动作的请求，建议沿用当前规格：如果部分能力不支持，先列出可执行和不可执行部分，再决定是否执行，不要静默删掉用户的要求。

### 能力未知

~~~text
当前飞机的 FLC 能力尚未确认。
为了避免向错误的飞机发送控制事件，我没有执行 FLC 设置。
你仍然可以让我读取当前飞行状态，或为这架飞机添加适配配置。
~~~

### 当前条件不允许

~~~text
这架飞机支持自动驾驶，但当前处于不允许接通的飞行阶段。
本次没有修改模拟器状态。
~~~

## 八、当前方案与建议方案对比

| 对比项 | 当前方案 | 建议方案 |
|---|---|---|
| AI 接口 | 高层 `setAutopilot` | 保留高层接口，继续不暴露底层事件 |
| 能力判断 | 运行时 SimVar 证据 + 会话内记忆 | 机型档案 + 运行时状态 + 执行后验证 |
| 映射位置 | 主要集中在服务代码 | 独立 Profile Registry（档案库） |
| 机型识别 | `TITLE` + `ATC ID` 为主 | 型号、变体、航电、模拟器版本组合 |
| 通用事件 | 作为主要路径 | 仅在档案允许且已验证时使用 |
| Input Event | 少量 AP/FD 兜底 | 由机型适配器按飞机管理 |
| 部分自动驾驶 | 能拒绝，但可用能力展示不够细 | 动态生成支持/不支持/未知能力清单 |
| 变量差异 | 通过固定代码处理 | 统一语义字段，底层变量由适配器转换 |
| 未知机型 | 不写入，返回未知 | 不写入，并支持只读模式和用户配置 |
| 新增飞机 | 需要继续改服务逻辑 | 主要新增档案和实机验证 |
| 失败处理 | 已有逐步回读 | 保留逐步回读，并增加映射来源、版本和诊断信息 |
| 适用范围 | 已验证默认飞机和少量机型 | 可逐步扩展第三方飞机及不同航电 |
| 改造规模 | 当前实现已存在 | 增加解析器、档案库、适配器接口，保留现有工具和 SimConnect 边界 |

## 九、建议的落地顺序

### P0：先解决结构问题

1. 保留现有 `setAutopilot` 工具和安全规则。
2. 定义统一的 10 个左右自动驾驶能力：AP、FD、HDG、NAV、ALT、VS、FLC、速度、APP、自动油门。
3. 把当前写在 `guide-service.ts` 中的动作映射整理成内部 Profile 数据结构。
4. 新增 `AircraftProfileRegistry`（机型档案注册表）。
5. 新增 `CapabilityResolver`，区分静态能力和当前可用性。
6. 没有档案且无法验证的动作保持“只读、不写入”。

### P1：补充真实机型覆盖

按用户实际使用频率，优先验证三类飞机：

1. 一架默认通航飞机；
2. 一架带 G1000/G3000 的复杂通航飞机；
3. 一架常用第三方客机或复杂飞机。

每架飞机至少测试：

~~~text
AP 开关、FD、HDG、NAV、ALT、VS/FLC、目标值设置、失败回读
~~~

### P2：改善使用体验

- UI（用户界面）根据当前 Profile 动态显示可用按钮；
- AI 回答中显示“已识别机型”和“当前支持能力”；
- 支持用户导入或修改机型覆盖配置；
- 记录 Profile 的来源、版本、验证日期和失败案例；
- 允许社区映射作为候选资料，但首次使用仍需验证，不能直接当作可信控制规则。

### P3：再考虑更复杂的飞行阶段管理

自动起飞、自动进近、持续航路控制和高频姿态控制不应与本次机型适配一起混入。它们需要单独的状态机、实时控制周期和更严格的安全测试。

## 十、验收标准

方案实施后，至少应满足：

- [ ] 新增飞机主要通过新增 Profile 完成，不需要在 Agent 提示词中写机型逻辑。
- [ ] 同一型号的不同航电版本可以使用不同 Profile。
- [ ] AI 能分别说明“飞机不支持”“当前条件不允许”“能力未知”。
- [ ] 任何没有经过档案或运行时验证的写操作都不会发送。
- [ ] 同一次请求中，支持和不支持的动作不会被静默混合执行。
- [ ] 每个写动作仍然需要执行后回读。
- [ ] 回读没有变化时，系统不会返回成功。
- [ ] Profile 可以记录底层映射来源、版本和验证日期。
- [ ] 不影响现有只读工具、EFB 航路读取、连接监控和语音会话。
- [ ] 已验证的 C172、TBM930 和无自动驾驶飞机回归测试继续通过。
- [ ] 至少增加一架部分支持自动驾驶的飞机完成实机验证。

## 十一、明确不包含的内容

本方案暂不包含：

- 自动起飞、自动降落或全自动航线飞行；
- 高频姿态、油门和方向舵闭环控制；
- 把数千个原始变量直接暴露给大模型；
- 自动下载并信任未经验证的社区控制脚本；
- 为所有第三方飞机一次性建立完整映射；
- 改造现有 LiveKit、Electron、EFB 或搜索架构。

## 十二、建议审阅结论

建议批准本方案的方向，但不建议立即大规模重写。当前最合理的改造是：

~~~text
保留现有 setAutopilot、安全白名单、能力预检和回读验证
  → 把机型映射从服务代码中抽成 Profile
  → 增加能力解析器和机型适配器
  → 先覆盖实际常用的少数飞机
  → 通过实机测试逐步扩展
~~~

这样既能解决“不同飞机支持能力不一样、变量不一样”的问题，也不会破坏当前已经验证过的安全边界。

## 相关项目文件

- [当前架构概览](overview.md)
- [Spec-024：巡航阶段自动驾驶管理](../specs/spec-024-msfs-aircraft-actions.md)
- [自动驾驶工具 `msfs-guide.ts`](../../src/tools/msfs-guide.ts)
- [自动驾驶服务 `guide-service.ts`](../../src/msfs/guide-service.ts)
- [Spec-020：两个 MSFS daemon](../specs/spec-020-two-msfs-daemons.md)
