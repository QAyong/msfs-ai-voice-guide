# MSFS 社区 AI/语音项目自动驾驶能力调研

**日期：** 2026-08-30  
**状态：** 调研结论，供架构审阅  
**调研范围：** 公开 GitHub README、项目官网和公开功能说明  
**注意：** 下表反映项目公开声明或公开代码目录能确认的能力，不等于我们已经在本机对每种飞机完成实机验证。

## 一、先说结论

前面研究的项目大致分成四类：

1. **自己实现自动驾驶控制循环**：以 `are-we-flying`（JavaScript 自动驾驶教程和实现）为代表。
2. **开放大量 SimConnect 底层事件和变量**：以 `InvoTalk SimConnect MCP` 为代表。
3. **语音命令桥接**：以 `MSFSVoiceAttackPlugin`、`SimVoice Copilot` 和 `msfs2024copilot` 为代表。
4. **只读取自动驾驶状态**：以 `flightsim-mcp` 为代表。

从功能覆盖看：

- `InvoTalk` 公开的自动驾驶事件和变量最多，但更像底层控制仓库，不是已经完成所有飞机适配的高级控制器；
- `are-we-flying` 更接近真正的自动驾驶控制器，支持机翼水平、地形跟随、自动起飞和实验性自动降落；
- `VoiceAttackPlugin` 的优势是把目标高度、速度、垂直速度和航向设置做成语音可调用事件；
- `SimVoice Copilot` 的优势是飞机 Profile（机型档案）和飞行阶段 Profile；
- `flightsim-mcp` 的优势是自动驾驶状态和目标值读取；
- `msfs2024copilot` 目前是 MVP（最小可用版本），公开资料只确认了基础自动驾驶命令，没有列出完整模式清单。

这些项目都不能证明“所有飞机都支持相同的自动驾驶功能”。我们应该借鉴它们的功能分类和架构，而不是直接把所有底层事件复制给 AI。

## 二、各项目公开支持的自动驾驶功能

### 1. `are-we-flying`

项目定位是用 JavaScript 和 SimConnect 编写一个自己的 MSFS 自动驾驶控制器。

公开控制面板明确列出：

- `AP`：打开/关闭自动驾驶；
- `LVL`：打开/关闭机翼水平；
- `ALT`：打开/关闭高度保持，并设置目标高度；
- `ATT`：打开/关闭自动油门；
- `TER`：打开/关闭地形跟随；
- `HDG`：打开/关闭航向模式，并设置目标航向；
- `take off`：自动起飞；
- `land`：实验性自动降落，会寻找附近机场；
- 航路点地图：创建、移动、删除航路点，并按航路段飞行。

这里的航路点导航是项目自己的导航控制逻辑，不能简单等同于 MSFS 的 `NAV` 模式。项目 README 没有把 FLC、APR、LOC、GS 等标准模式逐项列出，因此不能据此推断它们全部支持。

参考：[are-we-flying 项目](https://github.com/Pomax/are-we-flying)

### 2. `MSFSVoiceAttackPlugin`

这是一个 MSFS 2020 的 VoiceAttack 语音插件。它的公开事件表明确列出以下自动驾驶操作：

- 设置目标高度；
- 选择 NAV1/NAV2；
- 设置目标空速；
- 设置目标垂直速度；
- 设置航向 bug。

对应的公开事件包括：

~~~text
AP_ALT_VAR_SET_ENGLISH
AP_NAV_SELECT_SET
AP_SPD_VAR_SET
AP_VS_VAR_SET_ENGLISH
HEADING_BUG_SET
~~~

它还可以读取很多自动驾驶状态：

- 自动驾驶总开关；
- 空速保持；
- 高度保持和目标高度；
- 进近保持；
- 姿态保持；
- 自动驾驶是否可用；
- 反航道保持；
- 航向保持；
- NAV1 保持；
- 垂直速度保持；
- 偏航阻尼。

它的一个重要经验是：发送事件后再次调用 `GETPLANESTATE`（读取飞机状态），确认目标状态真的变化，而不是只确认事件调用成功。

参考：[MSFSVoiceAttackPlugin](https://github.com/jamescl604/MSFSVoiceAttackPlugin)

### 3. `msfs2024copilot`

这是一个离线语音副驾驶 MVP，使用 Windows SAPI 和 SimConnect。

公开资料确认：

- 支持本地语音识别和语音合成；
- 支持基础命令语法；
- 命令范围包含起落架、襟翼、灯光和自动驾驶；
- 通过 SimConnect 发送事件。

但项目 README 没有公开 AP、HDG、ALT、VS、FLC、APR 等细分模式清单。因此它可以作为“语音命令入口很简单”的参考，但不适合当作自动驾驶能力目录。

参考：[msfs2024copilot](https://github.com/shreyanKhurana/msfs2024copilot)

### 4. `SimVoice Copilot`

这是一个商业化的语音副驾驶和 EFB（电子飞行包）项目。

公开资料说明它支持：

- 语音设置自动驾驶；
- SimConnect；
- 自定义事件；
- 键盘动作；
- 飞机专用处理；
- 飞机 Profile；
- 飞行阶段 Profile；
- 自定义语音映射。

它没有在公开产品页面上列出完整的 AP 模式事件表，并且明确说明具体能力会受到飞机和航电系统影响。因此它最值得借鉴的是：

~~~text
同一句语音命令
  → 根据当前飞机选择 Profile
  → 根据飞行阶段选择命令集
  → 调用对应的控制方式
~~~

参考：[SimVoice Copilot 功能页](https://simvoicecopilot.com/product)

### 5. `flightsim-mcp`

这个项目重点不是控制自动驾驶，而是把自动驾驶状态提供给 AI 查询。

它的 `get_autopilot_state`（读取自动驾驶状态）公开返回：

- AP 总开关；
- 航向保持；
- 高度保持；
- 垂直速度保持；
- 空速保持；
- NAV1 模式；
- 进近模式；
- 飞行指引；
- 所有自动驾驶目标值。

它没有公开提供对应的自动驾驶写入工具，因此属于“状态读取型”项目。

参考：[flightsim-mcp](https://github.com/eythan-decker/flightsim-mcp)

### 6. `InvoTalk SimConnect MCP`

这是目前公开功能覆盖最宽的项目。它通过 MCP（模型上下文协议）提供底层 SimConnect 控制。

公开资料列出：

- 328 个 SimConnect 事件；
- 242 个模拟变量；
- 49 个自动驾驶相关事件；
- 20 个自动驾驶相关变量。

自动驾驶事件覆盖：

- AP 总开关；
- 高度；
- 航向；
- 速度；
- 垂直速度；
- NAV；
- 进近；
- LNAV/VNAV；
- FLC；
- 飞行指引；
- 自动油门；
- 偏航阻尼；
- 反航道；
- ON/OFF/TOGGLE 等操作形式。

自动驾驶变量覆盖：

- AP 总开关；
- FD；
- 高度、航向、速度、VS 保持；
- 各类目标值；
- NAV；
- 进近；
- FLC；
- Mach；
- 偏航阻尼；
- 反航道；
- 自动油门。

它还提供 `list_events`（发现事件）、`list_variables`（发现变量）、`send_event`（发送事件）和 `set_variable`（写变量）等通用工具。

参考：[InvoTalk SimConnect MCP](https://github.com/flythebluesky/invotalk-simconnect-mcp)

## 三、功能覆盖对比

图例：

- ✓：公开资料明确支持；
- △：部分支持、依赖 Profile 或公开资料不完整；
- R：主要支持读取；
- —：没有公开证据，不应直接推断。

| 功能 | 我们当前项目 | are-we-flying | VoiceAttackPlugin | msfs2024copilot | SimVoice | flightsim-mcp | InvoTalk |
|---|---:|---:|---:|---:|---:|---:|---:|
| AP 总开关 | ✓ | ✓ | △ | △ | △ | R | ✓ |
| FD 飞行指引 | ✓ | — | — | △ | △ | R | ✓ |
| LVL 机翼水平 | — | ✓ | — | — | △ | — | — |
| HDG 航向 | ✓ | ✓ | ✓ | △ | △ | R | ✓ |
| NAV 导航 | ✓ | △ 自定义航路 | ✓ NAV 选择 | △ | △ | R | ✓ |
| ALT 高度保持 | ✓ | ✓ | ✓ | △ | △ | R | ✓ |
| VS 垂直速度 | ✓ | — | ✓ | △ | △ | R | ✓ |
| FLC 高度层改变 | ✓ | — | — | — | △ | — | ✓ |
| 目标高度 | ✓ | ✓ | ✓ | △ | △ | R | ✓ |
| 目标航向 | ✓ | ✓ | ✓ | △ | △ | R | ✓ |
| 目标速度 | ✓ | △ | ✓ | △ | △ | R | ✓ |
| Mach 模式 | — | — | — | — | △ | — | ✓ |
| APR/LOC/GS 进近 | — | — | R 进近状态 | — | △ | R | ✓ 进近类 |
| 自动油门 | — | ✓ | — | — | △ | — | ✓ |
| 偏航阻尼 | — | — | R 状态 | — | △ | — | ✓ |
| 反航道 | — | — | R 状态 | — | △ | — | ✓ |
| 航路点导航 | EFB/NAV | ✓ | — | — | — | — | ✓ GPS/航路工具 |
| 地形跟随 | — | ✓ | — | — | — | — | — |
| 自动起飞 | — | ✓ | — | — | — | — | — |
| 自动降落 | — | ✓ 实验功能 | — | — | — | — | — |

这张表有两个重要结论：

1. 社区项目的“功能多”不代表“飞机兼容性好”。`InvoTalk` 公开了很多通用事件，但没有因此自动解决第三方飞机的专用变量问题。
2. `are-we-flying` 的自动起飞、自动降落、地形跟随是自定义控制系统功能，不能因为它能运行就直接加入我们的语音工具。

## 四、我们应该分别借鉴什么

### 借鉴 `InvoTalk`：功能分类

把自动驾驶能力拆成清晰的功能组：

~~~text
基础：AP、FD
横向：HDG、NAV、LOC、LNAV
纵向：ALT、VS、FLC、VNAV
速度：IAS、Mach、SPD
进近：APR、LOC、GS
辅助：自动油门、偏航阻尼、反航道
~~~

但我们只向 AI 暴露高层语义，例如“设置高度”“使用航向模式”，不直接暴露 49 个原始事件。

### 借鉴 `flightsim-mcp`：状态模型

统一返回：

~~~text
当前活动模式
预位模式
目标值
导航源
能力状态
当前是否可执行
数据是否过期
~~~

这可以让 AI 清楚地区分：

~~~text
已发送事件
已经预位
已经捕获
已经稳定保持
~~~

### 借鉴 `SimVoice`：Profile 机制

Profile 至少按下面维度匹配：

~~~text
模拟器版本
+ 飞机厂商
+ 飞机型号
+ 具体变体
+ 航电系统
+ 飞行阶段
~~~

同一句“保持 5000 英尺”，在 C172 G1000、TBM930 G3000 和第三方客机上，底层实现可以不同。

### 借鉴 `VoiceAttackPlugin`：语音和回读

语音命令只负责表达目标：

~~~text
“航向改成 090”
“爬升到 8000 英尺”
“速度保持 120 节”
~~~

执行器负责：

~~~text
转换单位
发送事件
等待状态变化
重新读取
向用户报告实际结果
~~~

### 借鉴 `are-we-flying`：高层飞行阶段控制

可以借鉴它的航路点和飞行阶段思想，但先只做建议：

~~~text
当前正在爬升
→ 建议 VS 或 FLC
→ 接近目标高度
→ 提示等待 ALT 捕获
→ 进入巡航
→ 提示检查航向和导航源
~~~

不要直接复制自动起飞、自动降落或地形跟随。

## 五、对我们项目的功能扩展建议

### 第一阶段：低风险、高收益

优先增加：

1. IAS/Mach/选定速度模式；
2. GPS、NAV1、NAV2、LOC 导航源选择；
3. ALT 预位、捕获和稳定保持状态；
4. FLC 与目标速度的联动；
5. 更完整的 AP 状态报告。

### 第二阶段：进近辅助

按机型 Profile 逐步加入：

- APR 进近预位；
- LOC 航向道；
- GS/GP 下滑道；
- 进近捕获状态；
- 进近条件检查；
- 进近失败提示。

第一步建议只做“检查和建议”，确认 Profile 和实机覆盖后再开放写入。

### 第三阶段：自动油门

增加：

- 自动油门 ARM；
- 自动油门 ON/OFF；
- 速度保持；
- 推力模式读取；
- 超速/低速提醒。

自动油门必须按机型和航电适配，不能使用一个通用事件覆盖所有客机。

### 暂时不增加

暂时不加入：

- 自动起飞；
- 自动降落；
- 自动复飞；
- 地形跟随；
- 高频姿态控制；
- 高频油门控制；
- 让大模型每秒连续发送飞行控制命令。

## 六、推荐的最终架构

~~~mermaid
flowchart LR
    U[用户语音/文字] --> I[统一飞行意图]
    I --> R[能力解析器]
    P[飞机与航电 Profile] --> R
    S[实时状态] --> R
    G[飞行阶段与安全条件] --> R

    R --> Q{能力和条件满足?}
    Q -->|不支持| X[说明飞机不支持]
    Q -->|未知| Y[只读提示，不写入]
    Q -->|当前不可用| Z[说明条件不满足]
    Q -->|可以执行| A[机型适配器]

    A --> E[发送通用事件或专用事件]
    E --> M[MSFS]
    M --> V[读取活动/预位/目标状态]
    V --> R
    V --> O[中文结果说明]
~~~

核心原则：

~~~text
社区项目提供候选功能和映射
  → 我们转换成统一 Profile
  → 经过当前飞机实机验证
  → 才允许进入可信适配器
~~~

## 七、最终结论

最适合我们的组合是：

| 借鉴项目 | 主要借鉴内容 |
|---|---|
| `InvoTalk` | 自动驾驶功能分类和变量覆盖范围 |
| `flightsim-mcp` | 自动驾驶状态、目标值和数据新鲜度模型 |
| `SimVoice Copilot` | 飞机/航电/飞行阶段 Profile |
| `MSFSVoiceAttackPlugin` | 语音命令、目标设置和执行后回读 |
| `are-we-flying` | 航路点、飞行阶段和高层控制思路 |
| `msfs2024copilot` | 简单的离线语音命令入口 |

我们不应直接复制任何一个项目的全部控制能力，而应形成：

~~~text
小而稳定的高层自动驾驶工具
+ 可扩展的机型 Profile
+ 机型适配器
+ 执行后回读
+ 未知能力不写入
~~~

这能在保持当前安全边界的同时，逐步接近社区项目的功能覆盖。

## 相关项目文件

- [多机型自动驾驶适配方案](msfs-aircraft-adaptive-autopilot-proposal.md)
- [Spec-024：巡航阶段自动驾驶管理](../specs/spec-024-msfs-aircraft-actions.md)
- [自动驾驶服务 `guide-service.ts`](../../src/msfs/guide-service.ts)

## 参考资料

- [Microsoft 官方自动驾驶变量文档](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimVars/Aircraft_SimVars/Aircraft_AutopilotAssistant_Variables.htm)
- [Microsoft 官方自动驾驶事件文档](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/Key_Events/Aircraft_Autopilot_Flight_Assist_Events.htm)
- [Microsoft 官方 `systems.cfg` 文档](https://docs.flightsimulator.com/msfs2024/html/5_Content_Configuration/CFG_Files/systems_cfg.htm)
- [MobiFlight MSFS 2024 Input Events 指南](https://docs.mobiflight.com/guides/input-events-2024/)
- [HubHop MSFS 事件库](https://hubhop.mobiflight.com/)

