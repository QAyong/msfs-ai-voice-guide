# 飞机总名单：官方机型与现有记录核对

整理日期：2026-09-07。使用 2026-09-03 的本地采集记录，对照本次查阅的官方资料。全程离线整理，未启动游戏。

## 先看数量

**这批资料可以整理为 77 个官方机型归并条目，对应 78 个飞机内容包。** 这里包含直升机、飞艇、热气球等类别。“官方”包括官方版本自带及官方发布的后续新增内容，也包括合作厂商制作的机型。

这个数字描述本批文件覆盖的机型，不是你的完整已购机库数量，也不是已经支持 AI 自动驾驶的数量。机型归并仅方便统计，不意味着操作规则相同。

| 来源分组                   | 本批数量 | 依据                                                                                                                                                       |
| -------------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 官方版本表可以直接对应     |       69 | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)，本批对应项均标为标准版包含     |
| 官方核心机型，版本表待补证 |        1 | DA62：[官方 MSFS 2024 更新记录：DA62](https://www.flightsimulator.com/release-notes-1-2-7-0-available-now-msfs-2024/)；本次 FAQ 未列它，销售版本不强行填写 |
| 后续官方新增               |        7 | 见下方新增机型表及逐项公告                                                                                                                                 |
| 合计                       |   **77** | 按本文机型归并口径                                                                                                                                         |

官方 FAQ 此次提取到 124 行，其中标准版 Yes 为 69 行；与[官方商店](https://www.flightsimulator.com/store/)宣传的 70/80/95/125 基准数量存在差异。本文保留这个资料缺口，不修改原始官方表，也不依靠相减推断用户购买的版本。

### 按航空器类别看

| 类别                | 机型归并条目数 |
| ------------------- | -------------: |
| 固定翼飞机          |             57 |
| 直升机              |              7 |
| 滑翔机 / 动力滑翔机 |              3 |
| 电动垂直起降航空器  |              4 |
| 飞艇                |              2 |
| 热气球              |              2 |
| 自转旋翼机          |              1 |
| 动力伞              |              1 |
| 合计                |         **77** |

类别用于阅读和安排工作，不用于推断自动驾驶能力，也不能直接替代 SimConnect 的对象类型。

### 原始记录为什么会更多

| 原始对象                     | 数量 | 本次处理                                                             |
| ---------------------------- | ---: | -------------------------------------------------------------------- |
| 扫描得到的飞机相关包         |  215 | 全部有去向，未丢弃原始记录                                           |
| 飞机内容包                   |   78 | Edge 540 的 V2/V3 两包归入一个机型，形成 77 项；两个包及各自标题保留 |
| PassiveAircraft 包           |  133 | 从玩家机型总数排除；其中 2 包仅有命名证据，角色路径待补证            |
| Common 公共资源候选包        |    4 | 未见独立玩家配置，不额外计机型；内容仍待确认                         |
| 枚举返回的标题和涂装组合记录 | 1855 | 不能当作机型数                                                       |
| 枚举的不同标题               |  404 | 258 个明确带 PassiveAircraft，剩余 146 个                            |
| 非 PassiveAircraft 标题      |  146 | 与批量探测标题集合完全一致；全部关联到 68 个机型候选                 |
| 未有对应运行标题的机型       |    9 | 本批为直升机和热气球，旧 AIRCRAFT 枚举未覆盖这些类别                 |

来源：[本地包扫描原始记录](docs/msfs/autopilot/official-aircraft-catalog.json)、[完整模拟对象与涂装枚举](docs/msfs/autopilot/inspections/dbf4b5b7e04d4d92fe432ca35baac5ae86feb0e972b81d725a436fbbfa83ddd2.json)、[临时 AI 探测原始记录](docs/msfs/autopilot/runtime-probes/20260903T141231258Z-aircraft-autopilot-modes-batched.json)。枚举类型的区别见[官方模拟对象枚举接口](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimConnect/API_Reference/Events_And_Data/SimConnect_EnumerateSimObjectsAndLiveries.htm)。

## 怎样读总表

- “运行标题数”是旧枚举中名称关联的候选数，其中可能混有设备、任务和涂装差别，不能当作已确认的配置数。
- “AI AP 读数”只记录临时 AI 对象的正读数/零读数，不等于玩家飞机的能力或功能验证。
- 所有条目的当前玩家配置能力、实际拥有和启用状态均待确认；历史玩家报告单独标注。
- 完整数据中保留包名、版本、配置路径线索、全部标题、643 条非空涂装名称记录、来源与待确认事项。

## 机型总表

|   # | 机型                                    | 类别               | 官方来源                                                                                                                   | 包数 | 运行标题数 | AI AP 读数（1 / 0） | 玩家验证及待确认               |
| --: | --------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---: | ---------: | ------------------- | ------------------------------ |
|   1 | Aero Vodochody L-39                     | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|   2 | AeroElvira Optica                       | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|   3 | Air Tractor AT-802                      | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 0 / 2               | 当前玩家能力待核对             |
|   4 | Airbus A310-300                         | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|   5 | Airbus A320neo V2                       | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|   6 | Airbus A321LR                           | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|   7 | Airbus A330-743L Beluga XL              | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|   8 | Airbus A330（200/300/P2F）              | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |         10 | 10 / 0              | 当前玩家能力待核对             |
|   9 | Airbus A400M Atlas                      | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  10 | Airbus H125                             | 直升机             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  11 | Airship Industries Skyship 600          | 飞艇               | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  12 | Archer Midnight                         | 电动垂直起降航空器 | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  13 | Aviat Pitts Special S1S                 | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  14 | Aviat Pitts Special S2S                 | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  15 | Beechcraft Bonanza G36                  | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  16 | Beechcraft King Air 350i                | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  17 | Bell 407                                | 直升机             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  18 | Bell UH-1H Huey                         | 直升机             | [官方周报：UH-1H 免费扩展](https://www.flightsimulator.com/december-11-2025-msfs-weekly-briefing/)                         |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  19 | Boeing 737 MAX 8                        | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  20 | Boeing 747-8（客运/货运）               | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  21 | Boeing F/A-18E Super Hornet             | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  22 | Boom XB-1                               | 固定翼             | [官方周报：XB-1 与 UH-1H](https://www.flightsimulator.com/december-11-2025-msfs-weekly-briefing/)                          |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  23 | CAP-4 Paulistinha                       | 固定翼             | [官方 Local Legend 20：CAP-4](https://www.flightsimulator.com/local-legend-20/)                                            |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  24 | Cessna 152                              | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 0 / 2               | 当前玩家能力待核对             |
|  25 | Cessna 172 Skyhawk G1000                | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          7 | 7 / 0               | 有历史玩家报告；当前版本未复测 |
|  26 | Cessna 185F Skywagon                    | 固定翼             | [官方 Famous Flyer 11：Cessna 185F](https://www.flightsimulator.com/famous-flyer-11/)                                      |    1 |          5 | 5 / 0               | 当前玩家能力待核对             |
|  27 | Cessna 208B Grand Caravan EX            | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          6 | 6 / 0               | 当前玩家能力待核对             |
|  28 | Cessna 400 Corvalis TT                  | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 优先：补玩家配置路径及故障记录 |
|  29 | Cessna Citation CJ4                     | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  30 | CGS Hawk Arrow II                       | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  31 | Cirrus Vision SF50                      | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          3 | 3 / 0               | 当前玩家能力待核对             |
|  32 | CubCrafters NXCub                       | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  33 | CubCrafters XCub                        | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          5 | 5 / 0               | 当前玩家能力待核对             |
|  34 | Curtiss JN-4 Jenny                      | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  35 | Daher TBM 930                           | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 有历史玩家报告；当前版本未复测 |
|  36 | De Havilland Canada CL-415              | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  37 | De Havilland Canada DHC-2 Beaver        | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |         12 | 12 / 0              | 当前玩家能力待核对             |
|  38 | De Havilland Canada DHC-6 Twin Otter    | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          3 | 3 / 0               | 当前玩家能力待核对             |
|  39 | DG Aviation DG-1001E                    | 滑翔机/动力滑翔机  | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  40 | DG Aviation LS8-18                      | 滑翔机/动力滑翔机  | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  41 | Diamond DA40 NG                         | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  42 | Diamond DA62                            | 固定翼             | [官方 MSFS 2024 更新记录：DA62](https://www.flightsimulator.com/release-notes-1-2-7-0-available-now-msfs-2024/)            |    1 |          2 | 2 / 0               | 所属销售版本待补证；AP 待核对  |
|  43 | Douglas DC-3                            | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |         11 | 11 / 0              | 当前玩家能力待核对             |
|  44 | Draco X                                 | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  45 | Erickson S-64F Aircrane                 | 直升机             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  46 | Eurocopter EC135                        | 直升机             | [官方 Local Legend 21：EC135](https://www.flightsimulator.com/local-legend-21/)                                            |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  47 | EXTRA 330LT                             | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  48 | Fairchild Republic A-10C Thunderbolt II | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  49 | Flight Design CTSL                      | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  50 | FlyDoo Hot Air Balloon                  | 热气球             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  51 | Goodyear Blimp                          | 飞艇               | [官方周报：Goodyear Blimp](https://www.flightsimulator.com/july-2nd-2026-msfs-weekly-briefing/)                            |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  52 | Grumman G-21A Goose                     | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  53 | Guimbal Cabri G2                        | 直升机             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  54 | Heart Aerospace ES-30                   | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  55 | Hot Air Balloon                         | 热气球             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  56 | Hughes H-4 Hercules                     | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  57 | ICON A5                                 | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  58 | Jetson One                              | 电动垂直起降航空器 | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  59 | JMB VL-3                                | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  60 | Joby S4                                 | 电动垂直起降航空器 | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  61 | Magni M24 系列（本地 Plus）             | 自转旋翼机         | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | Plus / Orion 子型号待核对      |
|  62 | MX Aircraft MXS-R                       | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  63 | North American P-51 Mustang             | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  64 | North American T-6 Texan                | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 有历史玩家报告；当前版本未复测 |
|  65 | Pilatus PC-12 NGX                       | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          4 | 4 / 0               | 当前玩家能力待核对             |
|  66 | Pilatus PC-6                            | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          4 | 4 / 0               | 当前玩家能力待核对             |
|  67 | Piper PA-28-236 Dakota                  | 固定翼             | [官方 Famous Flyer 12：Dakota](https://www.flightsimulator.com/famous-flyer-12/)                                           |    1 |          2 | 2 / 0               | 当前玩家能力待核对             |
|  68 | Powrachute Sky Rascal                   | 动力伞             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  69 | Robin CAP 10                            | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  70 | Robin DR400-100 Cadet                   | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  71 | Robinson R66                            | 直升机             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          0 | 未探测              | 本次枚举类别未覆盖；AP 待核对  |
|  72 | Ryan NYP Spirit of St. Louis            | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  73 | Stemme S12G                             | 滑翔机/动力滑翔机  | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 1 / 0               | 当前玩家能力待核对             |
|  74 | Volocopter VoloCity                     | 电动垂直起降航空器 | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  75 | Wright Flyer                            | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          1 | 0 / 1               | 当前玩家能力待核对             |
|  76 | Zivko Edge 540（V2/V3）                 | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    2 |          5 | 5 / 0               | 当前玩家能力待核对             |
|  77 | Zlin Aviation Savage Cub                | 固定翼             | [官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) |    1 |          3 | 3 / 0               | 当前玩家能力待核对             |

## 7 项后续官方新增

| 机型                   | 纳入依据                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bell UH-1H Huey        | [官方周报：UH-1H 免费扩展](https://www.flightsimulator.com/december-11-2025-msfs-weekly-briefing/)：官方发布的扩展内容；不能仅凭包目录认定本账户已领取或当前启用。                                   |
| Boom XB-1              | [官方周报：XB-1 与 UH-1H](https://www.flightsimulator.com/december-11-2025-msfs-weekly-briefing/)：XB-1 随 SU4 免费加入；UH-1H 属于免费 Stranger Things 扩展，可用于自由飞行；未核对本账户领取状态。 |
| CAP-4 Paulistinha      | [官方 Local Legend 20：CAP-4](https://www.flightsimulator.com/local-legend-20/)：2024 用户免费。                                                                                                     |
| Cessna 185F Skywagon   | [官方 Famous Flyer 11：Cessna 185F](https://www.flightsimulator.com/famous-flyer-11/)：2025-03-25 公告，2024 用户免费。                                                                              |
| Eurocopter EC135       | [官方 Local Legend 21：EC135](https://www.flightsimulator.com/local-legend-21/)：2024 用户免费。                                                                                                     |
| Goodyear Blimp         | [官方周报：Goodyear Blimp](https://www.flightsimulator.com/july-2nd-2026-msfs-weekly-briefing/)：2026-07-02 公告，免费基础内容。                                                                     |
| Piper PA-28-236 Dakota | [官方 Famous Flyer 12：Dakota](https://www.flightsimulator.com/famous-flyer-12/)：2025-06-27 公告，2024 用户免费。                                                                                   |

## 关键归并与保留的差异

| 对象                | 已整理的关系                                                                                                     | 仍不能据此下结论的部分                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| C172 G1000          | 1 个机型、1 个内容包、7 个运行标题；客运、货运、浮筒、滑雪板、拖曳等标签逐项保留                                 | 不能把 Cargo 的历史测试结果自动扩展到其余配置                    |
| C400                | 可飞内容包与 PassiveAircraft 包分开；完整枚举也分别列出 C400 Corvalis 与 Microsoft PassiveAircraft C400 Corvalis | 目前没有证据表明旧测试测错对象；仍缺运行时配置路径及玩家故障记录 |
| Edge 540            | V2/V3 两包归入同一机型条目，5 个运行标题全部保留                                                                 | 两个版本能否共用操作规则未确认                                   |
| A330                | 普通 A330 的发动机、客货及 VIP 标签留在同一机型下；Beluga XL 按官方表单列                                        | 不把家族归并当成控制系统等价证明                                 |
| DHC-2 Beaver / PC-6 | 分别保留 GPS、Radio + ADF、Radios，以及 G950、Gauge 等名称中的设备线索                                           | 航电配置不同可能影响能力与操作路径，后续必须核对                 |
| DC-3                | 保留 classic、modern 及各涂装相关标题                                                                            | 未把 11 个标题都称为独立的自动驾驶配置                           |
| Magni M24           | 归并至 M24 系列，本地 Plus 与官方表 Orion 的命名都保留                                                           | 子型号对应关系待确认                                             |

模块配置可能相互覆盖，归并依据及限制见[官方模块化配置合并规则](https://docs.flightsimulator.com/msfs2024/html/5_Content_Configuration/Modular_SimObjects/Modular_SimObject_Merging.htm)。

## 各机型的包与原始标题

以下名称关联用于整理资料。控制功能应另以当前玩家的有效配置路径、包和航电实现匹配，不能直接使用本表的名称规则。

### Aero Vodochody L-39

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本   | 已读取的路径线索 |
| ---------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-l39-reno | 0.0.17 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题  | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------- | -------------: | --------------- | -------------------------- |
| L-39 Albatros |              8 | 1               | 无本次采集之外的已关联报告 |

### AeroElvira Optica

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                         | 版本  | 已读取的路径线索 |
| ------------------------------ | ----- | ---------------- |
| fs24-microsoft-aircraft-optica | 0.1.2 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------------------- | -------------: | --------------- | -------------------------- |
| Optica: Passengers          |              6 | 1               | 无本次采集之外的已关联报告 |
| Optica: Scientific Research |              2 | 1               | 无本次采集之外的已关联报告 |

### Air Tractor AT-802

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                    | 版本  | 已读取的路径线索                 |
| ------------------------- | ----- | -------------------------------- |
| fs24-asobo-aircraft-at802 | 8.9.0 | simobjects/airplanes/asobo_at802 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                     | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------------------- | -------------: | --------------- | -------------------------- |
| AT802 Aerial Application Sprayer |              4 | 0               | 无本次采集之外的已关联报告 |
| AT802 Firefighting               |              5 | 0               | 无本次采集之外的已关联报告 |

### Airbus A310-300

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                           | 版本   | 已读取的路径线索              |
| -------------------------------- | ------ | ----------------------------- |
| fs24-microsoft-aircraft-a310-300 | 0.0.37 | simobjects/airplanes/a310-300 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| A310         |              6 | 1               | 无本次采集之外的已关联报告 |

### Airbus A320neo V2

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                          | 版本   | 已读取的路径线索                       |
| ------------------------------- | ------ | -------------------------------------- |
| fs24-microsoft-aircraft-a320neo | 0.0.45 | simobjects/airplanes/microsoft-a320neo |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题   | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------- | -------------: | --------------- | -------------------------- |
| A320neo V2     |             10 | 1               | 无本次采集之外的已关联报告 |
| A320neo V2 VIP |             10 | 1               | 无本次采集之外的已关联报告 |

### Airbus A321LR

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本   | 已读取的路径线索                    |
| ---------------------------- | ------ | ----------------------------------- |
| fs24-microsoft-aircraft-a321 | 0.0.44 | simobjects/airplanes/microsoft-a321 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| A321         |             12 | 1               | 无本次采集之外的已关联报告 |

### Airbus A330-743L Beluga XL

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                           | 版本   | 已读取的路径线索                        |
| -------------------------------- | ------ | --------------------------------------- |
| fs24-microsoft-aircraft-belugaxl | 0.0.50 | simobjects/airplanes/microsoft-belugaxl |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题  | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------- | -------------: | --------------- | -------------------------- |
| A330-BelugaXL |              8 | 1               | 无本次采集之外的已关联报告 |

### Airbus A330（200/300/P2F）

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本   | 已读取的路径线索                    |
| ---------------------------- | ------ | ----------------------------------- |
| fs24-microsoft-aircraft-a330 | 0.0.53 | simobjects/airplanes/microsoft-a330 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题      | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ----------------- | -------------: | --------------- | -------------------------- |
| A330-200 (GE)     |              3 | 1               | 无本次采集之外的已关联报告 |
| A330-200 (RR)     |              2 | 1               | 无本次采集之外的已关联报告 |
| A330-200 VIP (GE) |              3 | 1               | 无本次采集之外的已关联报告 |
| A330-200 VIP (RR) |              2 | 1               | 无本次采集之外的已关联报告 |
| A330-300 (GE)     |              7 | 1               | 无本次采集之外的已关联报告 |
| A330-300 (RR)     |              3 | 1               | 无本次采集之外的已关联报告 |
| A330-300 VIP (GE) |              7 | 1               | 无本次采集之外的已关联报告 |
| A330-300 VIP (RR) |              3 | 1               | 无本次采集之外的已关联报告 |
| A330-300P2F (GE)  |              2 | 1               | 无本次采集之外的已关联报告 |
| A330-300P2F (RR)  |              2 | 1               | 无本次采集之外的已关联报告 |

### Airbus A400M Atlas

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                        | 版本   | 已读取的路径线索           |
| ----------------------------- | ------ | -------------------------- |
| fs24-microsoft-aircraft-a400m | 0.0.42 | simobjects/airplanes/a400m |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| A400M Cargo  |              1 | 1               | 无本次采集之外的已关联报告 |

### Airbus H125

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                   | 版本  | 已读取的路径线索                |
| ------------------------ | ----- | ------------------------------- |
| fs24-asobo-aircraft-h125 | 8.9.0 | simobjects/airplanes/asobo_h125 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Airship Industries Skyship 600

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                         | 版本  | 已读取的路径线索                      |
| ------------------------------ | ----- | ------------------------------------- |
| fs24-asobo-aircraft-skyship600 | 8.2.0 | simobjects/airplanes/asobo_skyship600 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题         | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------- | -------------: | --------------- | -------------------------- |
| Skyship600 Passenger |              1 | 0               | 无本次采集之外的已关联报告 |

### Archer Midnight

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                         | 版本  | 已读取的路径线索 |
| ------------------------------ | ----- | ---------------- |
| fs24-microsoft-aircraft-archer | 1.6.9 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| Midnight     |              0 | 1               | 无本次采集之外的已关联报告 |

### Aviat Pitts Special S1S

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                            | 版本   | 已读取的路径线索 |
| --------------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-pitts-s1-reno | 0.0.13 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题   | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------- | -------------: | --------------- | -------------------------- |
| Aviat Pitts S1 |              7 | 0               | 无本次采集之外的已关联报告 |

### Aviat Pitts Special S2S

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                    | 版本   | 已读取的路径线索 |
| ------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-pitts | 0.0.13 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题   | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------- | -------------: | --------------- | -------------------------- |
| Aviat Pitts S2 |              4 | 0               | 无本次采集之外的已关联报告 |

### Beechcraft Bonanza G36

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                          | 版本   | 已读取的路径线索 |
| ------------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-bonanza-g36 | 0.0.17 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                       | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ---------------------------------- | -------------: | --------------- | -------------------------- |
| Beechcraft Bonanza                 |              3 | 1               | 无本次采集之外的已关联报告 |
| Beechcraft Bonanza Private Charter |              3 | 1               | 无本次采集之外的已关联报告 |

### Beechcraft King Air 350i

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                         | 版本   | 已读取的路径线索 |
| ------------------------------ | ------ | ---------------- |
| fs24-asobo-aircraft-kingair350 | 0.0.11 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题        | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------- | -------------: | --------------- | -------------------------- |
| Beechcraft King Air |              7 | 1               | 无本次采集之外的已关联报告 |

### Bell 407

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                          | 版本  | 已读取的路径线索 |
| ------------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-bell407 | 1.0.2 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Bell UH-1H Huey

官方依据：[官方周报：UH-1H 免费扩展](https://www.flightsimulator.com/december-11-2025-msfs-weekly-briefing/)。

| 内容包                       | 版本   | 已读取的路径线索 |
| ---------------------------- | ------ | ---------------- |
| fs24-microsoft-aircraft-uh1h | 0.11.0 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Boeing 737 MAX 8

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                      | 版本   | 已读取的路径线索                   |
| --------------------------- | ------ | ---------------------------------- |
| fs24-asobo-aircraft-b737max | 8.11.0 | simobjects/airplanes/asobo_b737max |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题         | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------- | -------------: | --------------- | -------------------------- |
| 737 Max 8 BBJ        |              4 | 1               | 无本次采集之外的已关联报告 |
| 737 Max 8 Passengers |             13 | 1               | 无本次采集之外的已关联报告 |

### Boeing 747-8（客运/货运）

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                     | 版本  | 已读取的路径线索                   |
| -------------------------- | ----- | ---------------------------------- |
| fs24-asobo-aircraft-b7478i | 2.1.7 | simobjects/airplanes/asobo_b747_8i |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| 747-8F       |              2 | 1               | 无本次采集之外的已关联报告 |
| 747-8i       |              3 | 1               | 无本次采集之外的已关联报告 |

### Boeing F/A-18E Super Hornet

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                    | 版本  | 已读取的路径线索                |
| ------------------------- | ----- | ------------------------------- |
| fs24-asobo-aircraft-fa18e | 8.9.0 | simobjects/airplanes/asobo_fa18 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题      | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ----------------- | -------------: | --------------- | -------------------------- |
| FA18E SuperHornet |              1 | 1               | 无本次采集之外的已关联报告 |

### Boom XB-1

官方依据：[官方周报：XB-1 与 UH-1H](https://www.flightsimulator.com/december-11-2025-msfs-weekly-briefing/)。

| 内容包                           | 版本  | 已读取的路径线索              |
| -------------------------------- | ----- | ----------------------------- |
| fs24-microsoft-aircraft-boom-xb1 | 1.2.4 | simobjects/airplanes/boom-xb1 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题               | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------------- | -------------: | --------------- | -------------------------- |
| Boom XB-1 [Preset Default] |              0 | 1               | 无本次采集之外的已关联报告 |

### CAP-4 Paulistinha

官方依据：[官方 Local Legend 20：CAP-4](https://www.flightsimulator.com/local-legend-20/)。

| 内容包                       | 版本   | 已读取的路径线索 |
| ---------------------------- | ------ | ---------------- |
| fs24-microsoft-aircraft-cap4 | 1.0.25 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| CAP-4        |              6 | 1               | 无本次采集之外的已关联报告 |

### Cessna 152

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                   | 版本   | 已读取的路径线索 |
| ------------------------ | ------ | ---------------- |
| fs24-asobo-aircraft-c152 | 0.0.15 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                   | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------------------ | -------------: | --------------- | -------------------------- |
| Cessna C152                    |              3 | 0               | 无本次采集之外的已关联报告 |
| Cessna C152 Aerial Advertising |              3 | 0               | 无本次采集之外的已关联报告 |

### Cessna 172 Skyhawk G1000

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                            | 版本  | 已读取的路径线索                        |
| --------------------------------- | ----- | --------------------------------------- |
| fs24-asobo-aircraft-c172sp-as1000 | 8.9.0 | simobjects/airplanes/asobo_c172sp_g1000 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                    | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告                                                                                                                 |
| ------------------------------- | -------------: | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C172SP G1000 Aerial Advertising |              2 | 1               | 无本次采集之外的已关联报告                                                                                                   |
| C172SP G1000 Cargo              |              7 | 1               | [Spec-024 历史玩家验证说明](docs/specs/spec-024-msfs-aircraft-actions.md)（未核对当前版本） |
| C172SP G1000 Passengers         |             16 | 1               | 无本次采集之外的已关联报告                                                                                                   |
| C172SP G1000 Passengers Floats  |             16 | 1               | 无本次采集之外的已关联报告                                                                                                   |
| C172SP G1000 Passengers Skis    |             16 | 1               | 无本次采集之外的已关联报告                                                                                                   |
| C172SP G1000 Skydive            |              2 | 1               | 无本次采集之外的已关联报告                                                                                                   |
| C172SP G1000 Tow                |              2 | 1               | 无本次采集之外的已关联报告                                                                                                   |

### Cessna 185F Skywagon

官方依据：[官方 Famous Flyer 11：Cessna 185F](https://www.flightsimulator.com/famous-flyer-11/)。

| 内容包                                 | 版本  | 已读取的路径线索                              |
| -------------------------------------- | ----- | --------------------------------------------- |
| fs24-microsoft-aircraft-c185f-skywagon | 1.0.7 | simobjects/airplanes/microsoft_c185f_skywagon |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题              | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------------- | -------------: | --------------- | -------------------------- |
| C185F Skywagon Amphibious |              5 | 1               | 无本次采集之外的已关联报告 |
| C185F Skywagon Fairing    |              9 | 1               | 无本次采集之外的已关联报告 |
| C185F Skywagon Ski        |              5 | 1               | 无本次采集之外的已关联报告 |
| C185F Skywagon Standard   |              9 | 1               | 无本次采集之外的已关联报告 |
| C185F Skywagon Tundra     |              5 | 1               | 无本次采集之外的已关联报告 |

### Cessna 208B Grand Caravan EX

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                                    | 版本  | 已读取的路径线索                 |
| ----------------------------------------- | ----- | -------------------------------- |
| fs24-asobo-aircraft-208b-grand-caravan-ex | 8.9.0 | simobjects/airplanes/asobo_c208b |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题            | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ----------------------- | -------------: | --------------- | -------------------------- |
| C208B Cargo             |              7 | 1               | 无本次采集之外的已关联报告 |
| C208B Floats Passengers |              1 | 1               | 无本次采集之外的已关联报告 |
| C208B Medic             |              4 | 1               | 无本次采集之外的已关联报告 |
| C208B Passengers        |              1 | 1               | 无本次采集之外的已关联报告 |
| C208B Scientific        |              2 | 1               | 无本次采集之外的已关联报告 |
| C208B Skydive           |              2 | 1               | 无本次采集之外的已关联报告 |

### Cessna 400 Corvalis TT

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                                | 版本   | 已读取的路径线索                             |
| ------------------------------------- | ------ | -------------------------------------------- |
| fs24-microsoft-aircraft-c400-corvalis | 1.0.10 | simobjects/airplanes/microsoft_c400_corvalis |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题  | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------- | -------------: | --------------- | -------------------------- |
| C400 Corvalis |              9 | 1               | 无本次采集之外的已关联报告 |

- 完整枚举另有 Microsoft PassiveAircraft C400 Corvalis；本条只关联不带 PassiveAircraft 的标题，仍需补运行时配置路径。

### Cessna Citation CJ4

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                  | 版本  | 已读取的路径线索               |
| ----------------------- | ----- | ------------------------------ |
| fs24-asobo-aircraft-cj4 | 2.1.9 | simobjects/airplanes/asobo_cj4 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题        | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------- | -------------: | --------------- | -------------------------- |
| Cessna Citation CJ4 |              1 | 1               | 无本次采集之外的已关联报告 |

### CGS Hawk Arrow II

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                                    | 版本  | 已读取的路径线索 |
| ----------------------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-cgs-hawk-arrow-ii | 1.1.5 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题      | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ----------------- | -------------: | --------------- | -------------------------- |
| CGS Hawk Arrow II |             14 | 0               | 无本次采集之外的已关联报告 |

### Cirrus Vision SF50

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本  | 已读取的路径线索                    |
| ---------------------------- | ----- | ----------------------------------- |
| fs24-microsoft-aircraft-sf50 | 0.7.1 | simobjects/airplanes/microsoft_sf50 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                           | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------------------------- | -------------: | --------------- | -------------------------- |
| Microsoft Vision Jet Complete Seating  |              4 | 1               | 无本次采集之外的已关联报告 |
| Microsoft Vision Jet Executive Seating |              4 | 1               | 无本次采集之外的已关联报告 |
| Microsoft Vision Jet Family Seating    |              4 | 1               | 无本次采集之外的已关联报告 |

### CubCrafters NXCub

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                    | 版本   | 已读取的路径线索 |
| ------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-nxcub | 0.0.13 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题             | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------------ | -------------: | --------------- | -------------------------- |
| NXCub                    |              1 | 1               | 无本次采集之外的已关联报告 |
| NXCub Aerial Advertising |              1 | 1               | 无本次采集之外的已关联报告 |

### CubCrafters XCub

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                   | 版本  | 已读取的路径线索                |
| ------------------------ | ----- | ------------------------------- |
| fs24-asobo-aircraft-xcub | 8.9.0 | simobjects/airplanes/asobo_xcub |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题               | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------------- | -------------: | --------------- | -------------------------- |
| XCub Aerial Advertising    |              3 | 1               | 无本次采集之外的已关联报告 |
| XCub Passengers            |             17 | 1               | 无本次采集之外的已关联报告 |
| XCub Passengers Big Wheels |             19 | 1               | 无本次采集之外的已关联报告 |
| XCub Passengers Floats     |             17 | 1               | 无本次采集之外的已关联报告 |
| XCub Passengers Skis       |             17 | 1               | 无本次采集之外的已关联报告 |

### Curtiss JN-4 Jenny

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                      | 版本   | 已读取的路径线索                     |
| --------------------------- | ------ | ------------------------------------ |
| fs24-microsoft-aircraft-jn4 | 0.0.16 | simobjects/airplanes/microsoft_jenny |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题       | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------ | -------------: | --------------- | -------------------------- |
| Curtiss JN-4 Jenny |              1 | 0               | 无本次采集之外的已关联报告 |

### Daher TBM 930

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                     | 版本  | 已读取的路径线索                  |
| -------------------------- | ----- | --------------------------------- |
| fs24-asobo-aircraft-tbm930 | 0.5.1 | simobjects/airplanes/asobo_tbm930 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题             | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告                                                                                                                 |
| ------------------------ | -------------: | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Asobo TBM 930 Passengers |              3 | 1               | [Spec-024 历史玩家验证说明](docs/specs/spec-024-msfs-aircraft-actions.md)（未核对当前版本） |

### De Havilland Canada CL-415

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                    | 版本  | 已读取的路径线索                 |
| ------------------------- | ----- | -------------------------------- |
| fs24-asobo-aircraft-cl415 | 8.9.0 | simobjects/airplanes/asobo_cl415 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题       | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------ | -------------: | --------------- | -------------------------- |
| CL415 Firefighting |              4 | 0               | 无本次采集之外的已关联报告 |

### De Havilland Canada DHC-2 Beaver

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本  | 已读取的路径线索 |
| ---------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-dhc2 | 1.0.5 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                                        | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------------------------------------------- | -------------: | --------------- | -------------------------- |
| DHC-2 Beaver Floats / Cargo / GPS                   |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Floats / Cargo / Radio + ADF           |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Floats / Cargo / Radios                |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Floats / Passenger Cabin / GPS         |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Floats / Passenger Cabin / Radio + ADF |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Floats / Passenger Cabin / Radios      |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Wheels / Cargo / GPS                   |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Wheels / Cargo / Radio + ADF           |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Wheels / Cargo / Radios                |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Wheels / Passenger Cabin / GPS         |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Wheels / Passenger Cabin / Radio + ADF |              8 | 1               | 无本次采集之外的已关联报告 |
| DHC-2 Beaver Wheels / Passenger Cabin / Radios      |              8 | 1               | 无本次采集之外的已关联报告 |

- 标题包含 GPS、Radios、Radio + ADF 等设备差异，必须分别保留；不能按同机型直接共用操作规则。

### De Havilland Canada DHC-6 Twin Otter

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本   | 已读取的路径线索                        |
| ---------------------------- | ------ | --------------------------------------- |
| fs24-microsoft-aircraft-dhc6 | 0.3.21 | simobjects/airplanes/microsoft-dhc6-300 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------------------- | -------------: | --------------- | -------------------------- |
| DHC-6-300 Twin Otter Floats |              3 | 1               | 无本次采集之外的已关联报告 |
| DHC-6-300 Twin Otter Skis   |              3 | 1               | 无本次采集之外的已关联报告 |
| DHC-6-300 Twin Otter Wheels |              3 | 1               | 无本次采集之外的已关联报告 |

### DG Aviation DG-1001E

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本  | 已读取的路径线索                  |
| ---------------------------- | ----- | --------------------------------- |
| fs24-asobo-aircraft-dg1001-e | 8.9.0 | simobjects/airplanes/asobo_dg1001 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题  | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------- | -------------: | --------------- | -------------------------- |
| DG-1001-E Neo |              1 | 0               | 无本次采集之外的已关联报告 |

### DG Aviation LS8-18

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                  | 版本   | 已读取的路径线索 |
| ----------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-ls8 | 0.0.11 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| DG LS8       |              0 | 0               | 无本次采集之外的已关联报告 |

### Diamond DA40 NG

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                      | 版本   | 已读取的路径线索 |
| --------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-da40-ng | 0.0.14 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                   | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------------------ | -------------: | --------------- | -------------------------- |
| Diamond DA40NG                 |              2 | 1               | 无本次采集之外的已关联报告 |
| Diamond DA40NG Private Charter |              2 | 1               | 无本次采集之外的已关联报告 |

### Diamond DA62

官方依据：[官方 MSFS 2024 更新记录：DA62](https://www.flightsimulator.com/release-notes-1-2-7-0-available-now-msfs-2024/)。

| 内容包                   | 版本   | 已读取的路径线索                |
| ------------------------ | ------ | ------------------------------- |
| fs24-asobo-aircraft-da62 | 8.11.0 | simobjects/airplanes/asobo_da62 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题             | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------------ | -------------: | --------------- | -------------------------- |
| DA62 Passengers          |              4 | 1               | 无本次采集之外的已关联报告 |
| DA62 Scientific Research |              1 | 1               | 无本次采集之外的已关联报告 |

- 官方 2024 FAQ 本次未列 DA62；用官方 2024 更新记录确认其官方身份，所属销售版本单独待核对。

### Douglas DC-3

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                      | 版本  | 已读取的路径线索 |
| --------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-dc3 | 1.3.4 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                      | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------------------------- | -------------: | --------------- | -------------------------- |
| Douglas DC-3 Aviators Club modern |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 Aviators XBOX Club   |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 BLUE STRIPE          |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 DCDIRECT             |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 DUSTY                |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 EMERALD HARBOR       |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 Metal - classic      |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 METAL LEFT           |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 RED YELLOW           |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 WHITE - classic      |              0 | 1               | 无本次采集之外的已关联报告 |
| Douglas DC-3 WORLD TRAVEL         |              0 | 1               | 无本次采集之外的已关联报告 |

- 多个标题含涂装或 classic/modern 字样，未将标题数当作独立配置数。

### Draco X

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                         | 版本  | 已读取的路径线索 |
| ------------------------------ | ----- | ---------------- |
| fs24-microsoft-aircraft-dracox | 0.0.9 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题        | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------- | -------------: | --------------- | -------------------------- |
| Draco X: Cargo      |              2 | 1               | 无本次采集之外的已关联报告 |
| Draco X: Passengers |              2 | 1               | 无本次采集之外的已关联报告 |

### Erickson S-64F Aircrane

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                           | 版本  | 已读取的路径线索 |
| -------------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-aircrane | 1.0.4 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Eurocopter EC135

官方依据：[官方 Local Legend 21：EC135](https://www.flightsimulator.com/local-legend-21/)。

| 内容包                        | 版本  | 已读取的路径线索 |
| ----------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-ec135 | 2.2.3 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### EXTRA 330LT

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                   | 版本  | 已读取的路径线索                     |
| ------------------------ | ----- | ------------------------------------ |
| fs24-asobo-aircraft-e330 | 8.9.0 | simobjects/airplanes/asobo_extra_330 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题         | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------- | -------------: | --------------- | -------------------------- |
| Extra 330 Passengers |              2 | 0               | 无本次采集之外的已关联报告 |

- 旧目录依据 2020 时代资料认定无 AP；本次保留旧依据，但未作为 2024 当前玩家能力结论。

### Fairchild Republic A-10C Thunderbolt II

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本  | 已读取的路径线索 |
| ---------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-a10c | 1.2.0 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题        | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------- | -------------: | --------------- | -------------------------- |
| A10C Thunderbolt II |              0 | 1               | 无本次采集之外的已关联报告 |

### Flight Design CTSL

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                             | 版本   | 已读取的路径线索 |
| ---------------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-flightdesignct | 0.0.13 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题     | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ---------------- | -------------: | --------------- | -------------------------- |
| Flight Design CT |              3 | 0               | 无本次采集之外的已关联报告 |

### FlyDoo Hot Air Balloon

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                     | 版本  | 已读取的路径线索                  |
| -------------------------- | ----- | --------------------------------- |
| fs24-asobo-aircraft-flydoo | 8.9.0 | simobjects/airplanes/asobo_flydoo |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Goodyear Blimp

官方依据：[官方周报：Goodyear Blimp](https://www.flightsimulator.com/july-2nd-2026-msfs-weekly-briefing/)。

| 内容包                        | 版本   | 已读取的路径线索 |
| ----------------------------- | ------ | ---------------- |
| fs24-microsoft-aircraft-blimp | 0.0.13 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题   | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------- | -------------: | --------------- | -------------------------- |
| Goodyear Blimp |              0 | 0               | 无本次采集之外的已关联报告 |

### Grumman G-21A Goose

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本   | 已读取的路径线索 |
| ---------------------------- | ------ | ---------------- |
| fs24-microsoft-aircraft-g-21 | 0.0.19 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题       | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------ | -------------: | --------------- | -------------------------- |
| Grumman Goose G21A |              1 | 1               | 无本次采集之外的已关联报告 |

### Guimbal Cabri G2

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本  | 已读取的路径线索                    |
| ---------------------------- | ----- | ----------------------------------- |
| fs24-asobo-aircraft-cabri-g2 | 8.7.0 | simobjects/airplanes/asobo_cabri_g2 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Heart Aerospace ES-30

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                   | 版本  | 已读取的路径线索                |
| ------------------------ | ----- | ------------------------------- |
| fs24-asobo-aircraft-es30 | 8.9.0 | simobjects/airplanes/asobo_es30 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题    | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------- | -------------: | --------------- | -------------------------- |
| ES30 Passengers |             10 | 1               | 无本次采集之外的已关联报告 |

### Hot Air Balloon

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                            | 版本  | 已读取的路径线索                         |
| --------------------------------- | ----- | ---------------------------------------- |
| fs24-asobo-aircraft-hotairballoon | 8.9.0 | simobjects/airplanes/asobo_hotairballoon |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Hughes H-4 Hercules

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                                     | 版本  | 已读取的路径线索                          |
| ------------------------------------------ | ----- | ----------------------------------------- |
| fs24-microsoft-aircraft-hughes-h4-hercules | 1.4.1 | simobjects/airplanes/bluemesh_hercules_h4 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| Hercules H-4 |              1 | 1               | 无本次采集之外的已关联报告 |

### ICON A5

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                   | 版本   | 已读取的路径线索 |
| ------------------------ | ------ | ---------------- |
| fs24-asobo-aircraft-icon | 0.0.13 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| Icon A5      |              3 | 0               | 无本次采集之外的已关联报告 |

### Jetson One

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                             | 版本  | 已读取的路径线索 |
| ---------------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-jetson-one | 1.3.0 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------------------- | -------------: | --------------- | -------------------------- |
| Jetson One [Preset Default] |              0 | 0               | 无本次采集之外的已关联报告 |

### JMB VL-3

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                  | 版本   | 已读取的路径线索 |
| ----------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-vl3 | 0.0.19 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题     | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ---------------- | -------------: | --------------- | -------------------------- |
| JMB Aviation VL3 |              3 | 0               | 无本次采集之外的已关联报告 |

- 旧目录依据 2020 时代资料认定无 AP；本次保留旧依据，但未作为 2024 当前玩家能力结论。

### Joby S4

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本  | 已读取的路径线索 |
| ---------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-joby | 1.6.6 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题          | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------------- | -------------: | --------------- | -------------------------- |
| Joby [Preset Default] |              0 | 1               | 无本次采集之外的已关联报告 |

### Magni M24 系列（本地 Plus）

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                            | 版本  | 已读取的路径线索                        |
| --------------------------------- | ----- | --------------------------------------- |
| fs24-microsoft-aircraft-magni-m24 | 1.2.1 | simobjects/airplanes/bluemesh_magni_m24 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题         | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------- | -------------: | --------------- | -------------------------- |
| Magni M24 Plus White |             13 | 0               | 无本次采集之外的已关联报告 |

- 官方 FAQ 写 M-24 Orion，本地包和运行标题写 M24 Plus；只确认到 M24 系列，具体子型号对照待核对。

### MX Aircraft MXS-R

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                      | 版本   | 已读取的路径线索 |
| --------------------------- | ------ | ---------------- |
| fs24-microsoft-aircraft-mxs | 6.0.11 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| MXS-R        |              0 | 1               | 无本次采集之外的已关联报告 |
| MXS-R Race   |              0 | 1               | 无本次采集之外的已关联报告 |

### North American P-51 Mustang

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                        | 版本   | 已读取的路径线索 |
| ----------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-p51d-reno | 0.1.22 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| P51 Mustang  |              7 | 0               | 无本次采集之外的已关联报告 |

### North American T-6 Texan

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                      | 版本   | 已读取的路径线索 |
| --------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-t6-reno | 0.1.31 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                  | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告                                                                                                                 |
| ----------------------------- | -------------: | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| North American T-6 Texan Reno |              8 | 0               | [Spec-024 历史玩家验证说明](docs/specs/spec-024-msfs-aircraft-actions.md)（未核对当前版本） |

### Pilatus PC-12 NGX

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                           | 版本  | 已读取的路径线索                        |
| -------------------------------- | ----- | --------------------------------------- |
| fs24-microsoft-aircraft-pc12-ngx | 1.1.4 | simobjects/airplanes/microsoft_pc12_ngx |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题            | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ----------------------- | -------------: | --------------- | -------------------------- |
| PC-12 NGX Air Ambulance |              2 | 1               | 无本次采集之外的已关联报告 |
| PC-12 NGX Passengers    |              3 | 1               | 无本次采集之外的已关联报告 |
| PC-12 NGX VIP           |              7 | 1               | 无本次采集之外的已关联报告 |
| PC-12NGX Cargo - Empty  |              3 | 1               | 无本次采集之外的已关联报告 |

### Pilatus PC-6

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                              | 版本   | 已读取的路径线索                           |
| ----------------------------------- | ------ | ------------------------------------------ |
| fs24-microsoft-aircraft-pilatus-pc6 | 0.3.18 | simobjects/airplanes/microsoft-pilatus-pc6 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题              | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------------- | -------------: | --------------- | -------------------------- |
| Pilatus PC-6 G950 Floats  |              1 | 1               | 无本次采集之外的已关联报告 |
| Pilatus PC-6 G950 Wheels  |              2 | 1               | 无本次采集之外的已关联报告 |
| Pilatus PC-6 Gauge Skis   |              1 | 1               | 无本次采集之外的已关联报告 |
| Pilatus PC-6 Gauge Wheels |              3 | 1               | 无本次采集之外的已关联报告 |

- 标题包含 G950 与 Gauge 等设备差异，控制配置待查。

### Piper PA-28-236 Dakota

官方依据：[官方 Famous Flyer 12：Dakota](https://www.flightsimulator.com/famous-flyer-12/)。

| 内容包                                  | 版本  | 已读取的路径线索                               |
| --------------------------------------- | ----- | ---------------------------------------------- |
| fs24-microsoft-aircraft-pa28-236-dakota | 1.0.6 | simobjects/airplanes/microsoft_pa28_236_dakota |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                     | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------------------- | -------------: | --------------- | -------------------------- |
| Piper PA28-236 Dakota - Fairings |              9 | 1               | 无本次采集之外的已关联报告 |
| Piper PA28-236 Dakota - Standard |              9 | 1               | 无本次采集之外的已关联报告 |

### Powrachute Sky Rascal

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                            | 版本  | 已读取的路径线索 |
| --------------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-skyrascal | 1.0.9 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题          | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| --------------------- | -------------: | --------------- | -------------------------- |
| Powrachute Sky Rascal |             11 | 0               | 无本次采集之外的已关联报告 |

### Robin CAP 10

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                     | 版本   | 已读取的路径线索 |
| -------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-cap10c | 0.0.13 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| Robin CAP10  |              1 | 0               | 无本次采集之外的已关联报告 |

### Robin DR400-100 Cadet

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                    | 版本   | 已读取的路径线索 |
| ------------------------- | ------ | ---------------- |
| fs24-asobo-aircraft-dr400 | 0.0.17 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| Robin DR400  |              3 | 0               | 无本次采集之外的已关联报告 |

### Robinson R66

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                      | 版本  | 已读取的路径线索                   |
| --------------------------- | ----- | ---------------------------------- |
| fs24-microsoft-aircraft-r66 | 1.1.0 | simobjects/airplanes/microsoft_r66 |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

旧 AIRCRAFT 枚举没有对应标题，保留在名单中。

- 旧探测仅枚举 AIRCRAFT，缺少本条运行记录不能解释为未拥有或不支持 AP。

### Ryan NYP Spirit of St. Louis

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                                     | 版本  | 已读取的路径线索 |
| ------------------------------------------ | ----- | ---------------- |
| fs24-microsoft-aircraft-spirit-of-st-louis | 1.0.5 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题       | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------ | -------------: | --------------- | -------------------------- |
| Spirit of St.Louis |              1 | 1               | 无本次采集之外的已关联报告 |

### Stemme S12G

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                       | 版本  | 已读取的路径线索 |
| ---------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-s12g | 0.0.9 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题      | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ----------------- | -------------: | --------------- | -------------------------- |
| S12-G: Passengers |              3 | 1               | 无本次采集之外的已关联报告 |

### Volocopter VoloCity

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                           | 版本   | 已读取的路径线索 |
| -------------------------------- | ------ | ---------------- |
| fs24-microsoft-aircraft-volocity | 0.1.30 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题       | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------ | -------------: | --------------- | -------------------------- |
| Volocity Microsoft |              4 | 0               | 无本次采集之外的已关联报告 |

### Wright Flyer

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                               | 版本   | 已读取的路径线索 |
| ------------------------------------ | ------ | ---------------- |
| fs24-microsoft-aircraft-wright-flyer | 1.1.29 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题 | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------ | -------------: | --------------- | -------------------------- |
| Wright Flyer |              0 | 0               | 无本次采集之外的已关联报告 |

### Zivko Edge 540（V2/V3）

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                            | 版本  | 已读取的路径线索 |
| --------------------------------- | ----- | ---------------- |
| fs24-microsoft-aircraft-edge540   | 6.0.5 | 尚无展开路径     |
| fs24-microsoft-aircraft-edge540v2 | 6.0.6 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题               | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| -------------------------- | -------------: | --------------- | -------------------------- |
| Edge540 v2                 |              1 | 1               | 无本次采集之外的已关联报告 |
| Edge540 v3 Bullet          |              1 | 1               | 无本次采集之外的已关联报告 |
| Edge540 v3 Kirby Chambliss |              1 | 1               | 无本次采集之外的已关联报告 |
| Edge540 v3 Martin Sonka    |              1 | 1               | 无本次采集之外的已关联报告 |
| Edge540 v3 Matt Hall       |              1 | 1               | 无本次采集之外的已关联报告 |

- V2/V3 仅在机型统计中合并，两个包和全部运行标题分别保留；未确认共用自动驾驶规则。

### Zlin Aviation Savage Cub

官方依据：[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ)。

| 内容包                         | 版本   | 已读取的路径线索 |
| ------------------------------ | ------ | ---------------- |
| fs24-asobo-aircraft-savage-cub | 0.0.11 | 尚无展开路径     |

有效配置文件：尚未展开读取。当前拥有、启用、航电/自动驾驶组合：待确认。

| 原始运行标题                                | 非空涂装名数量 | 临时 AI AP 读数 | 历史玩家报告               |
| ------------------------------------------- | -------------: | --------------- | -------------------------- |
| Zlin Aviation Savage Cub                    |              3 | 1               | 无本次采集之外的已关联报告 |
| Zlin Aviation Savage Cub Aerial Advertising |              3 | 1               | 无本次采集之外的已关联报告 |
| Zlin Aviation Savage Cub Rescue             |              3 | 1               | 无本次采集之外的已关联报告 |

## 未计为新增机型的公共资源候选

这 4 个包在旧代码中因 fs20 前缀被排除。本次改为记录实际疑点：名称标为 Common，布局仅列归档文件，未见独立可飞配置。具体内容未展开，公共资源角色仍属候选。

| 包名                                     | 原始标题        | 处理                                     |
| ---------------------------------------- | --------------- | ---------------------------------------- |
| fs20-asobo-aircraft-l39-reno-common      | L39 Common      | 保留记录，不额外增加机型计数；内容待确认 |
| fs20-asobo-aircraft-p51d-reno-common     | p51d-reno       | 保留记录，不额外增加机型计数；内容待确认 |
| fs20-asobo-aircraft-pitts-s1-reno-common | Pitts S1 Common | 保留记录，不额外增加机型计数；内容待确认 |
| fs20-asobo-aircraft-t6-reno-common       | T6 Common       | 保留记录，不额外增加机型计数；内容待确认 |

## 排除的 PassiveAircraft 包

这些记录保留在结构化总表中，避免今后被重复算回玩家机型。这里展示包角色证据，不以它们判断相应可飞飞机的 AP 能力。

| 包名                                          | 原始标题                | 角色依据                            |
| --------------------------------------------- | ----------------------- | ----------------------------------- |
| fs24-asobo-passiveaircraft-a220family         | A220-Family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-a310family         | A310-Family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-a320family         | A320Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-a330family         | A330Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-a340family         | A3400-Family            | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-a350family         | A350Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-a380               | A380                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-aa1                | AA1                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-aa5                | AA5                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-atrfamily          | ATRFamily               | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b190               | b190                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b717-200           | 717-200                 | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b737family         | 737Family               | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b747family         | 747-Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b757family         | 757-Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b767family         | 767-Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b777family         | B777Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-b787family         | 787-Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-baron58family      | Baron58Family           | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-18           | Model 18                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-23           | 23                      | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-390          | Model 390               | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-400          | Model 400               | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-45           | Model 45                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-50           | Model 50                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-60           | Model 60                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-70family     | Model 70 Family         | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-76           | Model 76                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-77           | Model 77                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-95           | Model 95                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-beech-99           | Model 99                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bell-204family     | B204 Family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bell-230family     | B230 Family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bell-412           | B412                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bell-427           | B427                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bell-429           | B429                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bell-505           | B505                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bl8                | BL8                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-bonanzafamily      | Bonanza Family          | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c140family         | C140                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c152family         | C152                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c162               | C162                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c170               | C170                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c172family         | C172                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c177               | C177                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c182family         | C182                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c206family         | C206 family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c208               | C208                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c208b              | C208B                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c210family         | C210 family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c303               | C303                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c320family         | C320 family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c337family         | C337 family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c340               | C340                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c402family         | C402 family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c411               | c411                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c421family         | C421 family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-c441               | C441                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-cj1family | Citation CJ1 Family     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-cj2family | Citation CJ2 Family     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-cj3       | Citation CJ3            | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-cj4       | Citation CJ4            | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-i         | Citation I              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-ii        | Citation II             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-iiifamily | Citation III            | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-latitude  | Citation Latitude       | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-longitude | Citation Longitude      | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-mustang   | Citation Mustang        | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-sovereign | Citation Sovereign      | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-v         | Citation V              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-x         | Citation X              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-citation-xls       | Citation XLS            | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-co1                | CO1                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-da20               | DA 20                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-da40family         | DA 40                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-da42               | DA 42                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-da62               | DA 62                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-dg1001             | DG1001                  | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-dhc8family         | DHC8                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-djet               | DJet                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-e2                 | E2                      | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-e330               | E330                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-eagle              | Eagle                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-ejet-190e2         | EJet-190E2              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-ejet-195e2         | EJet-195E2              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-ejet170family      | EJet170Family           | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-ejet190family      | EJet190Family           | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-erjfamily          | ERJFamily               | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-fa18               | FA18                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-generic-glider     | Generic Glider          | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-generic-hab        | Generic Hot Air Balloon | 仅 PassiveAircraft 包名，路径待补证 |
| fs24-asobo-passiveaircraft-generic-helicopter | Generic Helicopter      | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-husky              | Husky                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-kingairfamily      | KingAirFamily           | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-kodiak             | Kodiak                  | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-legacy500          | Legacy 500              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-m7family           | M7Family                | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-md10family         | MD10-Family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-md80family         | MD80-Family             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-p2002              | P2002                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-p2004              | P2004                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-p2006              | P2006                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-p2008              | P2008                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-p2010              | P2010                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-p2012              | P2012                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-p92                | P92                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-pc12               | PC12                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-pc24               | PC24                    | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-pc6                | PC6                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-phenom100          | Phenom 100              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-phenom300          | Phenom 300              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-praetor500         | Praetor 500             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-praetor600         | Praetor 600             | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-r22                | R22                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-r44                | R44                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-r66                | R66                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-s2000              | S2000                   | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-sf50               | SF50 Passive            | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-sr22family         | SR22Family              | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-t38                | T38                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-t50                | T50                     | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-t6family           | T6 Family               | PassiveAircraft 包名及布局路径      |
| fs24-asobo-passiveaircraft-tbm930             | TBM930                  | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-beech-17       | D17                     | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-c185           | Model 95                | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-c188           | C188 agtruck            | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-c195           | C195                    | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-c207           | C207                    | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-c400           | C400 Corvalis           | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-c404           | 404 Titan               | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-c408           | 408 SkyCourier          | 仅 PassiveAircraft 包名，路径待补证 |
| fs24-microsoft-passiveaircraft-c90            | C90GTX                  | PassiveAircraft 包名及布局路径      |
| fs24-microsoft-passiveaircraft-s340           | S340                    | PassiveAircraft 包名及布局路径      |

## 官方表中本批没有对应可飞内容包的条目

[官方版本机型表](https://flightsimulator.zendesk.com/hc/en-us/articles/12702272798364-Microsoft-Flight-Simulator-2024-FAQ) 中还有 55 个更高版本条目，本次没有找到相应可飞内容包；可能仍存在同名被动对象，不能据此认定已拥有或可驾驶。也不能反推用户一定只购买了标准版。

| 最低版本   | 官方表机型                  | 厂商                            |
| ---------- | --------------------------- | ------------------------------- |
| 豪华版     | Albatross G111/HU16         | Amphibian Aerospace             |
| 豪华版     | Baron G58                   | Beechcraft                      |
| 豪华版     | 152 Aerobat                 | Cessna                          |
| 豪华版     | 172 Skyhawk                 | Cessna                          |
| 豪华版     | 188 AGTruck                 | Cessna                          |
| 豪华版     | 404 Titan                   | Cessna                          |
| 豪华版     | 408 SkyCourier              | Cessna                          |
| 豪华版     | DA40 TDI                    | Diamond                         |
| 豪华版     | DV20                        | Diamond                         |
| 豪华版     | Seastar                     | Dornier                         |
| 高级豪华版 | H225                        | Airbus Helicopter               |
| 高级豪华版 | C90 GTX King Air            | Beechcraft                      |
| 高级豪华版 | 747-400 Global Super Tanker | The Boeing Company              |
| 高级豪华版 | 747-400 LCF Dreamlifter     | The Boeing Company              |
| 高级豪华版 | 787-10 Dreamliner           | The Boeing Company              |
| 高级豪华版 | C-17 Globemaster III        | The Boeing Company              |
| 高级豪华版 | CH47D Chinook               | The Boeing Company              |
| 高级豪华版 | Citation Longitude          | Cessna                          |
| 高级豪华版 | SR22                        | Cirrus Aircraft                 |
| 高级豪华版 | PC-24                       | Pilatus                         |
| 高级豪华版 | Taurus M                    | Pipistrel                       |
| 高级豪华版 | Virus SW121                 | Pipistrel                       |
| 高级豪华版 | 340B                        | Saab                            |
| 高级豪华版 | Savage Norden               | Zlin Aviation                   |
| 高级豪华版 | Shock Ultra                 | Zlin Aviation                   |
| 飞行家版   | Ae-45 / Ae-145              | Aero Vodochody                  |
| 飞行家版   | An-2                        | Antonov                         |
| 飞行家版   | An-225                      | Antonov                         |
| 飞行家版   | 42-600 / 72-600             | ATR                             |
| 飞行家版   | Bonanza V35                 | Beechcraft                      |
| 飞行家版   | Model 17 Staggerwing        | Beechcraft                      |
| 飞行家版   | Model 18 Twin Beech         | Beechcraft                      |
| 飞行家版   | 47J Ranger                  | Bell Helicopter                 |
| 飞行家版   | 307 Stratoliner             | The Boeing Company              |
| 飞行家版   | 707-320C                    | The Boeing Company              |
| 飞行家版   | 195 Businessliner           | Cessna                          |
| 飞行家版   | 207T                        | Cessna                          |
| 飞行家版   | C-46 Commando               | Curtiss                         |
| 飞行家版   | DHC-4 Caribou               | De Havilland Canada             |
| 飞行家版   | Do J Wal                    | Dornier                         |
| 飞行家版   | Do 31                       | Dornier                         |
| 飞行家版   | Do X                        | Dornier                         |
| 飞行家版   | C-47D Skytrain & CG-4A      | Douglas Aircraft Company & Waco |
| 飞行家版   | FW 200 Condor               | Focke-Wulff                     |
| 飞行家版   | F.VII                       | Fokker                          |
| 飞行家版   | 4AT Trimotor                | Ford                            |
| 飞行家版   | Gee Bee R2 / Z              | Granville                       |
| 飞行家版   | F13                         | Junkers                         |
| 飞行家版   | JU 52                       | Junkers                         |
| 飞行家版   | 631                         | Latécoère                       |
| 飞行家版   | MU-2                        | Mitsubishi Heavy Industries     |
| 飞行家版   | 17 B                        | Saab                            |
| 飞行家版   | S.55                        | Savoia-Marcketti                |
| 飞行家版   | SC.7 Skyvan                 | Short                           |
| 飞行家版   | Scout / Wasp                | Westland                        |

## 本轮尚未确认什么

- 确认用户游戏版本、实际拥有及启用状态；本地缓存不等于拥有。
- 78 个飞机内容包均未取得可读取的有效 aircraft.cfg；配置数量和航电/自动驾驶实现仍待确认。
- 146 个非 PassiveAircraft 标题已全部关联到机型候选，但玩家配置路径、模块附件和子型号身份未确认。
- Magni M24 Orion/Plus 的子型号差异和 DA62 所属销售版本待补证。
- 4 个 Common 资源候选及 2 个无展开路径的 PassiveAircraft 包角色待进一步内容验证。
- 历史 C172/TBM/T-6 报告保留；当前版本能力和每个动作的玩家验证仍需后续步骤。

本轮核对的 120 个 AP 正读数和 26 个零读数仍只属于临时 AI 对象。当前版本具有原生 AP 的机型数、有效配置数量、需要维护的规则套数均保持“未确认”。不填 0，也不把未知改成不支持。

下一步可进入操作规则资料整理，先处理 C400，并利用 C172 / TBM 的历史报告作参考；机库归属及配置路径缺口可在后续短时采集时补齐。

结构化完整数据：[aircraft-inventory-20260907.json](docs/msfs/autopilot/aircraft-inventory-20260907.json)。

返回计划：[分步实施计划](docs/architecture/msfs-native-autopilot-restart-plan-20260907.md)。
