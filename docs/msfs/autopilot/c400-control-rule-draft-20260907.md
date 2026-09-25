# C400 自动驾驶：第一批操作规则与采集卡

日期：2026-09-07。对应重新实施计划的第 2 步。状态：**离线规则草案完成；第 3 步通用执行逻辑与离线测试已完成，C400 实际绑定与玩家验证待补。本文不包含 C400 特殊绑定，不授予执行权限。**

## 先看这部分

这一步已经把“该找什么”缩小到三个动作：打开或关闭 AP、选择 HDG 航向模式、设置目标航向。每个动作都有官方接口依据，也列出了如何判断它是否生效。现在缺的是：你实际驾驶的 C400，是否接了这些接口，以及座舱按钮是否走另一条路径。

可以把它理解为：**通用按钮说明已经找到，还要核对 C400 的接线。** 相同接线的飞机才可以共用操作规则；飞机名单继续记录各自身份与验证结果。

本次还找到一个值得优先检查的历史问题：2025 年 3 月 7 日，一名用户报告 C400 使用自动驾驶总开关按键无法保持接通，点击座舱 AP 按钮却可以。3 月 20 日官方人员表示已建立内部反馈单，帖子标记为 `feedback-logged`。本次读取的帖子没有给出已修复结论。**这是历史用户报告及官方受理记录，不能直接认定为你当前故障的原因。** [原始报告][S1]

第 3 步已经离线修正程序的等待和判断逻辑；下一步安排一次只围绕 C400 的短时采集。当前不需要为了整理规则逐架启动 77 个官方机型。

## 1. 已经查到什么，还缺什么

| 项目         | 已有证据                                                                                                                                                         | 尚不能得出的结论                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| C400 身份    | 旧目录的可飞内容包为 `fs24-microsoft-aircraft-c400-corvalis`，版本 `1.0.10`，布局路径为 `simobjects/airplanes/microsoft_c400_corvalis`；枚举另列 PassiveAircraft | 旧缓存版本不等于当前实际加载版本；包路径不等于模块合并后的完整有效配置  |
| 座舱与控制器 | 历史故障报告提到 G1000 座舱 AP 按钮；微软公开 G1000/Garmin 控制源码可供对照                                                                                      | 未确认本机 C400 的航电版本、控制器及按钮绑定；不能只凭 G1000 外观套规则 |
| 标准命令     | SDK 文档明确区分 AP 开、关、翻转，以及 HDG 模式与航向数值设置                                                                                                    | 接口有定义，不表示 C400 一定按预期响应                                  |
| 航向槽位     | 官方变量文档区分航向槽位；微软 Garmin 源码有写槽位 1 的实现                                                                                                      | 不能直接把当前项目的槽位 0 全部改成 1                                   |
| 社区按钮资料 | HubHop 本次快照找到 G1000 (2024) 的 AP、HDG 按钮候选                                                                                                             | 尚未匹配 C400；这些条目状态为 Submitted，不是本项目实测                 |
| 本地配置     | 目前可检查的 C400 缓存只有目录元数据和归档，未取得可读的有效配置与行为文件                                                                                       | 不能离线补造控制器、供电条件、最低接通高度或输入参数                    |

本地身份依据见 [飞机名单中的 C400 条目](docs/msfs/autopilot/aircraft-inventory-20260907.md)。微软 G1000 源码包含外置 KAP140 检测分支，进一步说明“都是 G1000”不足以确认相同自动驾驶组合。[微软 G1000 源码][S2]

## 2. 三条最小规则

下面的输入是**待匹配、待验证的候选**，不是让 AI 现在执行的命令表。适用范围先限定为使用相应标准或 Garmin 控制实现的固定翼；C400 是否属于该范围仍待核对。

### R1：把 AP 设置为指定状态

| 字段           | 草案                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| 用户目标       | AP 开，或 AP 关                                                                                           |
| 首选候选       | 开：`AUTOPILOT_ON`；关：`AUTOPILOT_OFF`；均无业务参数                                                     |
| 前提           | 玩家身份保持一致；航电就绪；AP 能力与输入路径已确认；接通还需符合该机的供电、接通限制等条件，具体值待采集 |
| 操作前读取     | `AUTOPILOT MASTER`，单位 Bool；已达目标则不发送，记录“原本已处于该状态”                                   |
| 独立反馈       | 再读 `AUTOPILOT MASTER` 是否达到并短时保持目标；玩家测试时与座舱 AP 指示对照                              |
| 翻转入口的边界 | `AP_MASTER` 是翻转，不是“设为开”。仅在绑定已证实、状态新鲜且确实不同于目标时发一次；响应不明时不盲目补发  |
| 失败处理       | 未变化、接通后又断开、读回失败分别记录；停止后续动作，保留时间序列。不能把命令提交成功记成接通成功        |
| 当前结论       | 标准接口语义已确认；C400 路径未验证，历史绑定报告需要对照                                                 |

接口依据：[官方事件文档][S3]、[反馈变量文档][S4]。历史报告仅涉及其描述的总开关绑定，不证明 `AUTOPILOT_ON/OFF` 在当前 C400 上必然失败或必然成功。

### R2：选择 HDG 航向模式

| 字段       | 草案                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 用户目标   | 选择 HDG，跟随预设的目标航向                                                                     |
| 输入候选   | `AP_PANEL_HEADING_ON`，无业务参数；该命令不会把目标航向重新取为当前机头航向                      |
| 前提       | 身份、控制器与航向模式能力已确认；航电与所需航向数据有效；模式选择与 AP 伺服接通分开判断         |
| 操作前读取 | 当前 HDG 状态、AP 状态、目标航向及使用槽位；HDG 已开则不重复发送                                 |
| 独立反馈   | `AUTOPILOT HEADING LOCK`，单位 Bool；玩家测试与座舱 HDG 模式指示对照，并确认原有目标没有意外变化 |
| 验证边界   | HDG 选中不等于 AP 已接管；AP 接通、目标正确、飞机按模式转向需要分别确认                          |
| 当前结论   | 官方语义与微软 Garmin 源码存在对应关系；C400 是否使用这份实现待确认                              |

微软 Garmin 的事件处理明确将 `AP_PANEL_HEADING_ON` 送入 HEADING 模式的开启路径；它与翻转事件分开处理。[事件文档][S3]、[GarminAPStateManager 源码][S5]

### R3：设置目标航向

| 字段     | 草案                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 用户目标 | 例如把航向旋钮设为 090°；此动作本身不承诺飞机立即转到 090°                                                     |
| 输入候选 | `HEADING_BUG_SET`，参数依次为整数角度、已确认的槽位索引                                                        |
| 数值处理 | 本项目草案采用 0–359 的整数表示，360 归为 0；角度参考需与该配置座舱读数一致，不能混用真航向与磁航向            |
| 槽位处理 | 不再假定固定索引；执行前读取当前 C400 的对应 slot/index。已有目标高度实测读回为 `AUTOPILOT ALTITUDE SLOT INDEX=1` |
| 前提     | 当前配置及槽位映射已确认；允许只设置目标而不接通 AP。组合操作中应在开启 HDG 前准备并确认目标，避免先跟随旧目标 |
| 独立反馈 | 读取相同槽位的 `AUTOPILOT HEADING LOCK DIR:<索引>`，单位 degrees；同时核对使用中的槽位与座舱目标               |
| 比较方式 | 使用圆周角差，避免把 359° 与 0° 误认为相差 359°；首轮拟采用误差不超过 1°，这是工程验收建议                     |
| 当前结论 | 输入的单位和索引已查明；C400 的槽位与显示对应关系未确认                                                        |

官方规定 `HEADING_BUG_SET` 接受整数角度及索引。[事件文档][S3] 航向槽位文档说明向槽位 0 写入会覆盖其他槽位；当前代码已经改为先读取当前飞机的 slot/index，再发送 `[角度, slotIndex]`，不再固定使用 `0`。C400 目标高度的实测也确认 `[6000, 1]` 正常而 `[6000, 0]` 异常；这证明固定 `0` 存在真实风险，但仍不能把高度现象直接推断成所有目标事件的唯一故障原因。[变量文档][S4] 微软源码中的明确例子是 `[heading, 1]`。[GarminHeadingSyncManager 源码][S6]

**共同的等待建议：** 第 3 步先用离线测试验证“每次动作最多等待 3 秒、约每 250 毫秒读取、目标连续保持至少 500 毫秒”的处理逻辑。它们是初始工程参数，不是 SDK 保证，也不能证明长时间飞行稳定。读取延迟计入总时限；失败或超时即停止，不自动换入口再试一遍。实际玩家记录决定是否调整。

这些规则分别定义单个动作。组合请求还需在第 3 步明确排序、并发互斥与切机中止；不能将 R1、R2、R3 的编号直接当执行顺序。

## 3. 另一条路径：座舱按钮候选

HubHop 的 G1000 (2024) 条目提供下列线索。它们是 RPN 中的 B 绑定，**不能把名称直接当成 SimConnect 的 Input Event Hash，也不能一律向对应名字填数字 1**。

| 动作     | 候选绑定                                       | HubHop 条目 ID                         |
| -------- | ---------------------------------------------- | -------------------------------------- |
| AP 翻转  | `AS1000_AUTOPILOT_AP_PFD_TOGGLE`               | `136436bd-5e9e-472e-a188-03f28818c158` |
| HDG 翻转 | `AS1000_AUTOPILOT_HEADING_PFD_TOGGLE`          | `924377a3-643a-40f1-b9a4-f49a58df20a4` |
| 航向减小 | `AS1000_HEADING_PFD_Dec`，条目中的步进输入为 1 | `c61b3434-b6c2-40fc-9fb1-0d0eed37f763` |
| 航向增大 | `AS1000_HEADING_PFD_Inc`，条目中的步进输入为 1 | `a7d9c58c-0612-4dbc-a427-f7330499dc24` |

来源为 [HubHop 数据接口][S7]，读取日期 2026-09-07；以上条目版本均为 1、状态 Submitted。留存快照 SHA-256：`D9786252B8C1277456E48B64B586F34E756F4D638860F1BEE230992843C235B0`。该快照未找到直接以 C400 标注的条目；这不能证明社区没有其他资料。

实际使用前要确认：当前 C400 枚举出的输入、座舱按钮 Bindings、参数类型与含义，以及项目能否调用该入口。`input params` 可补充接口参数资料，仍不能代替按钮语义证据。官方 `SetInputEvent` 只是设置指定输入值，不会返回模式已经生效的反馈事件。[参数枚举][S8]、[设置输入文档][S9]

因此，本轮不新增 WASM 桥，也不把 B 绑定塞进现有 `input set`。如果短时采集证实标准路径不可用、座舱绑定可用，再根据明确缺口决定是否需要桥接。

## 4. C400 短时只读采集卡

**用途：** 留到第 4 步使用；第 3 步已完成离线保存和判断逻辑，下面的命令仍未执行，也没有启动游戏。首次只完成身份和输入资料即可，加载耗时过长就保存退出，之后续采。

| 批次        | 要带回来的资料                                                                                  | 用来回答什么                                                        |
| ----------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A：身份     | 采集时间、游戏版本、当前 C400 包版本、CLI 构建/哈希、TITLE、AircraftLoaded 原始字符串、Sim 状态 | 测的是哪一个玩家对象？版本是否与旧记录一致？                        |
| A：有效配置 | 可取得的基础飞机、预设/附件及航电包身份；取不到则原样标明缺失                                   | 是否能把公共源码与这架飞机关联？Loaded 路径本身并不证明完整模块组合 |
| B：状态     | AP 可用读数、AP/HDG 状态、目标航向、槽位索引、槽位 0–3 的航向；必要时补航向数据与接通条件       | 反馈读的是哪个目标？当前模式与能力有无混淆？                        |
| B：输入     | 当前完整输入列表；AP、HDG、航向旋钮相关条目的名称、Hash、类型、参数和值                         | 候选入口是否存在，参数是否明确？                                    |
| C：按钮定位 | 在 Behaviors 中只查看 AP 按钮、HDG 按钮与航向旋钮的 InputEvents/Bindings                        | 手动座舱按钮究竟经过哪条路径？                                      |

可复用的只读命令如下。命令语法已按当前 CLI 源码核对；进入游戏后的返回尚未验证。这里采用项目已有的开发运行目录，若后续构建位置变化，由采集工具解析实际路径。

```powershell
$c400Cli = 'dev-runtime\msfs-cli\msfs.exe'
& $c400Cli status --role monitor --json
& $c400Cli system state --name AircraftLoaded --role monitor --json
& $c400Cli system state --name Sim --role monitor --json
& $c400Cli simvar get --name TITLE --unit string --datatype string --role monitor --json
& $c400Cli input list --role monitor --json
& $c400Cli simvar batch --items 'AUTOPILOT AVAILABLE|Bool;AUTOPILOT MASTER|Bool;AUTOPILOT HEADING LOCK|Bool;AUTOPILOT HEADING SLOT INDEX|number;AUTOPILOT HEADING LOCK DIR:0|degrees;AUTOPILOT HEADING LOCK DIR:1|degrees;AUTOPILOT HEADING LOCK DIR:2|degrees;AUTOPILOT HEADING LOCK DIR:3|degrees' --role monitor --json
```

对已枚举的相关条目，再使用 `input params --hash <实际Hash>` 和 `input get --hash <实际Hash>`，同样附 `--role monitor --json`。Hash 保留原始精度，不使用旧飞机 Hash。原始 JSON 连同时间和错误一并保存；某条读不到只记录缺失，不填 0。游戏版本、包版本、有效配置资料如未从命令返回，需从游戏/开发者包信息另行记录，不以 SDK 版本代替。

`AircraftLoaded` 的官方含义是返回上次加载的飞机文件路径，不是整数加载标志；`Sim=1` 表示用户在控制飞机，也不单独证明航电就绪。[系统状态文档][S10] 当前检查器已经保存原始路径，并由路径是否为空单独生成加载状态；不能仅用这个派生字段判断 C400 航电是否就绪。

按钮定位参考 [MobiFlight 2024 指南][S11]：启用开发者模式，打开 Tools → Behaviors，鼠标指向按钮后按 Ctrl+G，展开对应 InputEvents 和 Bindings。此采集卡只要求查看和记录；指南后面的 Execute 操作属于写入测试，留到单独的玩家操作批次。看不到绑定时保存缺失原因即可，不反复试按钮。

**采集后的判断顺序：** 先离线核对身份、输入与槽位；再在另一个短时操作批次中逐项对比标准事件和座舱按钮。一次只变一个因素，并保存动作前后 AP、HDG、目标与座舱指示。两条路径表现不同，才有依据继续定位绑定或控制器；两条都不能接通，则先核对就绪和接通条件。

## 5. 交付状态与下一步

- [x] 三个试点动作具备输入候选、前提、反馈和失败处理草案。
- [x] 区分标准事件、座舱 B 绑定与当前 Input Event 接口；固定公开源码版本。
- [x] 留下 C400 历史故障线索及精确的只读采集卡。
- [ ] C400 当前有效配置、输入绑定、槽位和接通条件匹配。
- [x] 第 3 步程序修改与离线测试。
- [ ] 第 4 步 C400 玩家操作验证。

下一步优先使用检查器采集 C400 的有效身份、输入绑定、槽位和接通条件，并让玩家操作结果与标准事件逐项对照；禁止只凭 Input Event 名称自动猜值。槽位 0 的适用性需要显式处理，不能无证据全局替换为 1。具体实现前同步当前功能规格，并保留成功、超时、状态变化和切换飞机等证据。

本轮只新增本文、更新计划和文档入口；没有改生产代码，没有运行玩家或临时 AI 对象测试。飞机总名单仍为 77 个官方机型归并条目，各机型实际自动驾驶支持范围继续保持原证据状态。

## 来源

网页核对日期：2026-09-07。微软源码固定提交 `366be5056166c639a2189e09e5af7143174fd910`；该提交不是 C400 已安装航电版本的证明。

[S1]: https://forums.flightsimulator.com/t/sim-update-1-retail-build-cessna-corvallis-c400-autopilot-binding-regression/709533
[S2]: https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/workingtitle-instruments-g1000/html_ui/Shared/Autopilot/G1000Autopilot.ts
[S3]: https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/Key_Events/Aircraft_Autopilot_Flight_Assist_Events.htm
[S4]: https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimVars/Aircraft_SimVars/Aircraft_AutopilotAssistant_Variables.htm
[S5]: https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/garminsdk/autopilot/GarminAPStateManager.ts
[S6]: https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/garminsdk/autopilot/GarminHeadingSyncManager.ts
[S7]: https://hubhop-api-mgtm.azure-api.net/api/v1/msfs2020/presets?type=json
[S8]: https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimConnect/API_Reference/InputEvents/SimConnect_EnumerateInputEventParams.htm
[S9]: https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimConnect/API_Reference/InputEvents/SimConnect_SetInputEvent.htm
[S10]: https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/general/simconnect_requestsystemstate/
[S11]: https://docs.mobiflight.com/guides/input-events-2024/
