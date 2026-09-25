# MSFS 2024 原生自动驾驶适配复核与减负方案

日期：2026-09-07。状态：调研建议，尚未实施；不替代现有执行策略。

用户确认的目标：先支持游戏自带飞机，后续扩展第三方飞机；操作飞机原生 AP、航向、高度、导航和进近，不开发另一套接管舵面的自动驾驶。

## 结论

不需要把“人工逐架寻找所有变量、逐项试按钮”作为支持上百架飞机的前提。建议改成：**按自动驾驶与航电的共同实现复用规则，按飞机记录差异，执行时检查实际模式。** 测试工作仍存在，但主要变为共享实现的代表机测试、自动一致性检查和异常机型复现。

本次核查没有找到能自动返回任意飞机全部自动驾驶能力、操作语义和验证条件的官方统一接口。不能承诺零实机验证、所有自带飞机一次适配完成，或用一个通用事件覆盖复杂客机和直升机。

旧方案的高层工具、适配配置和读回方向正确。主要需要调整的是证据与放行规则、适配复用粒度，以及当前代码将“尚未开启”混同“无法使用”的判断。不是必须推翻项目。

## 本次实际检查了什么

- 项目 Spec-024、Spec-028、两份既有自动驾驶调研，以及 `src/msfs/guide-service.ts`、原生 SimConnect 实现、检查器和批量探测资料。
- 本机 `C:\MSFS 2024 SDK`，`version.txt` 为 **1.6.9**；实际读取 `SimConnect.h`、Asobo/Asobo_EX1 自动驾驶模板与 Working Title G3000 模板。
- 微软官方 MSFS 2024 文档，包括 Input Events、自动驾驶变量、无线电导航变量、系统状态、SimConnect 本地变量访问。
- 微软航电源码镜像，核查提交 `366be5056166c639a2189e09e5af7143174fd910` 的 MSFS 2024 源码。
- MobiFlight Connector，核查提交 `953d6962d8db0c5b0434971a80422f81babaf79c` 的预设格式、下载入口和 WASM 通信代码。
- 从 Connector 源码登记的公开 HubHop 接口实际下载 **32,621 条预设**。其中 `Microsoft / G1000 (2024)` 为 75 条，`Working Title / G1000 NXi` 为 45 条；计数含非自动驾驶功能。前者的 Autopilot 分类为 22 条。按 aircraft、label、path 搜索 C400/Corvalis，匹配为 0；这不证明社区其他地方没有资料。
- 运行现有自动驾驶操作与可用性两个单元测试文件：**15 项通过**。没有运行游戏内写入测试；检查时未检测到 `FlightSimulator2024` 或 `msfsd` 进程。

公开源码与预设只下载到系统临时目录，没有导入生产运行时。HubHop 下载文件 SHA-256：`D9786252B8C1277456E48B64B586F34E756F4D638860F1BEE230992843C235B0`。

## 项目中需要优先处理的事实

### 1. FD/FLC 存在首次启用的逻辑障碍

`src/msfs/guide-service.ts:491` 和 `:501` 使用 FD/FLC 当前是否激活作为支持证据；`:781` 起又拒绝所有 `unknown` 能力。

因此新会话中可能出现：功能关闭 → 能力未知 → 不允许开启。即便这是一架已经具备 FD/FLC 的飞机，只要没有匹配的外部能力证据，该指令仍可能在发送给游戏之前被拒绝。现有测试 `tests/unit/msfs-autopilot-actions.test.ts:375` 明确覆盖了拒绝 FLC 的行为。

这不是 C400 故障原因已确认，而是代码中可以直接确认的通用限制。应让匹配的可信共享配置提供“已安装这个功能”的证据，实时变量只回答“现在是否开启”。不要简单把全部 unknown 改为 supported。

### 2. NAV AVAILABLE 不是自动驾驶导航能力

当前 `guide-service.ts:493` 起用 `NAV AVAILABLE:1` 决定导航模式是否支持。官方定义是“是否装备第 1 套导航无线电”，并不是 GPS/FMS 航路是否有效，也不是飞机自动驾驶能否导航。[官方变量定义](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimVars/Aircraft_SimVars/Aircraft_RadioNavigation_Variables.htm)

应该分别判断：自动驾驶是否具备导航模式、当前导航源是什么、该源是否具有有效引导、模式已预位还是已捕获。EFB 中存在航路不能替代机载 FMS 的活动航路。

### 3. 文档中的逐步验证比实际实现更严格

当前循环确实在每次发送后读取状态，但 `guide-service.ts:965` 起只检查“读取是否成功”。只要能读到状态，即使 AP 或模式没有变为预期值，也会继续下一步；具体状态是否符合请求主要在循环结束后检查。

应在每一步设置对应的完成条件，给予有上限的等待；确认后再继续。没有变化时停止，区分发送失败、等待超时、前提不满足和状态被其他输入改变。重复尝试 TOGGLE 会反向切换，不能盲重试。

### 4. AP/FD 的专用事件并没有真正绑定已验证机型

代码注释称 Input Event 为已验证 AP/FD 的兜底，但 `guide-service.ts:928` 起只按事件名称是否存在决定路径；存在即优先发送，未匹配机型/航电版本，也不是先执行标准事件失败再兜底。固定发送值为 1。

本机 Asobo_EX1 模板中的 AP 操作同时存在设置状态与切换状态的不同表达式。不能仅凭名字判断 1 代表“按一下”还是“设置为开”，尤其当前输入既用于打开也用于关闭。

应由匹配配置明确选择控制路径与参数语义；不要对任意飞机套用名称相同的按钮。也不要在结果未知时连续换多种路径试探，以免重复切换。

### 5. 批量探测资料不能升级成玩家飞机的执行保证

已有资料记录 146 个非 PassiveAircraft 标题，其中 120 个临时 AI 对象报告 AP 可用。C400 的临时 AI 测试七项均读回成功，但它并非当前玩家驾驶舱。

源码显示，Working Title 的自动驾驶会进入航电管理模式并拦截标准事件，再由其自身逻辑决定模式变化。临时 AI 对象上的状态切换没有验证玩家机这一完整路径。[官方 APStateManager 源码](https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/sdk/autopilot/managers/APStateManager.ts)

保留现有结果作为“临时 AI 标准事件响应证据”，可用于选择测试候选。不要将它等同于每架玩家机支持全部模式。`scripts/build-msfs-autopilot-aircraft-roster.ts` 中的 `executionAllowlist` 命名会造成过强暗示；本次搜索没有发现 `src/`、`desktop/` 读取这些名册文件的引用，所以继续扩充 JSON 本身也不会修复当前服务的能力判断。

### 6. 高度目标与飞行模式的语义也需要修正

“把高度旋钮设到 5000 英尺”“保持当前高度”“爬升到 5000 英尺”是三个不同操作。原方案中 `ALT + targetAltitudeFeet` 的组合不能普遍代表爬升。

例如官方 `APAltDirector` 使用已捕获的高度进行保持，而 `AltitudeSelectManager` 管理预选高度且具有独立槽位配置。对相应实现，改变预选高度不等于飞机会离开 ALT 模式开始爬升。[高度保持源码](https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/sdk/autopilot/directors/APAltDirector.ts)、[高度选择源码](https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/sdk/autopilot/managers/AltitudeSelectManager.ts)

爬升/下降必须组合预选高度、适合当前飞机的 VS/FLC 等模式和必要参数，并报告“设置已生效”，不能提前报告“已到达高度”。FLC 调俯仰保持速度，也不自动证明存在自动油门。

另一个采集错误：`src/msfs/aircraft-inspector.ts:276` 将 `AircraftLoaded` 的整数域等于 1 当作加载成功。官方该系统状态返回的是最近加载飞机的路径；应读取字符串并另行判断当前游戏状态。已有 TBM 检查记录因此同时出现飞机数据正常与 `loaded=false`。[官方 RequestSystemState](https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/general/simconnect_requestsystemstate/)

## 官方与开源资料怎样实际减少适配工作

### 共享实现提供规则，而不是仅提供事件名称

微软公开源码包含 MSFS 2024 的 G1000 NXi、GNS、G3000/G5000、G3X、WT21、Epic 2 等。实际源码中 `G1000Autopilot` 与 `G3000Autopilot` 都继承 `GarminAutopilot`。[仓库说明](https://github.com/microsoft/msfs-avionics-mirror)

`GarminAPStateManager` 明确处理以下标准事件：

| 意图             | 已在源码中核实的事件例子     |
| ---------------- | ---------------------------- |
| 开启航向模式     | `AP_PANEL_HEADING_ON`        |
| 开启导航模式     | `AP_NAV1_HOLD_ON`            |
| 开启垂直速度模式 | `AP_VS_ON`、`AP_PANEL_VS_ON` |
| 开启 FLC         | `FLIGHT_LEVEL_CHANGE_ON`     |
| 开启进近模式     | `AP_APR_HOLD_ON`             |

这证明这些共享实现有可以复用的命令处理逻辑，不是每个机型都必须采用完全不同的变量；仍需确认飞机实际装配的是该实现和哪些功能。[事件处理源码](https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/garminsdk/autopilot/GarminAPStateManager.ts)

分组必须是“航电 + 自动驾驶控制器 + 版本/配置”。同样的 G1000 显示屏不必然意味着同样的 AP：官方 G1000 源码会检测外置 KAP140 并改变处理。不能把所有 G1000 飞机直接全功能放行。[G1000 外置控制器处理](https://github.com/microsoft/msfs-avionics-mirror/blob/366be5056166c639a2189e09e5af7143174fd910/src/workingtitle-instruments-g1000/html_ui/Shared/Autopilot/G1000Autopilot.ts)

这些源码运行在游戏航电环境中，不能直接在 Electron 安装一个包就遥控所有飞机；其价值是抽取命令语义、状态、前提和差异。

### Input Events 能发现当前按钮，不能解释所有按钮

官方 `SimConnect_EnumerateInputEvents` 返回当前飞机的事件列表。本机头文件中的描述项是 Name、UINT64 Hash、eType；参数接口提供调用参数类型。没有通用的“这是 FLC、写 1 是开启、需要什么前提、读什么才算完成”的语义描述。

因此当前检查器有价值，应自动采集并匹配已知配置；不能让 AI 仅凭事件名称猜写值。Hash 在当前会话重新解析，以字符串/64 位值保存；B 事件的 `_TOGGLE`、`_PUSH`、`_Inc` 等绑定也不能自动等同于可枚举的 Set 接口。[官方枚举接口](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimConnect/API_Reference/InputEvents/SimConnect_EnumerateInputEvents.htm)、[MobiFlight 2024 绑定说明](https://docs.mobiflight.com/guides/input-events-2024/)

### HubHop 可以复用查资料的劳动

本次下载源来自 Connector 的 `WasmModuleUpdater.cs`。实际数据包含 `G1000 (2024)` 的 AP、HDG、NAV、APP、VS、FLC、FD、ALT 等 B 事件按钮预设，说明社区已经在按航电共享映射。

例如预设 `136436bd-5e9e-472e-a188-03f28818c158` 使用 `AS1000_AUTOPILOT_AP_PFD_TOGGLE`；不是当前项目固定的 `AUTOPILOT_AP_MASTER` 名称。这是候选映射差异的实证，不是 C400 必须使用该名称的证据。

预设同时包含老版 NXi 条目、2024 条目、输入、输出及复合脚本，有些状态仅为 Submitted。应选取所需条目并记录来源/版本、理解参数与读回条件；不要整库自动执行或把“有预设”写成“本项目已验证”。[Connector 下载来源](https://github.com/MobiFlight/MobiFlight-Connector/blob/953d6962d8db0c5b0434971a80422f81babaf79c/src/MobiFlightConnector/SimConnectMSFS/WasmModuleUpdater.cs)、[HubHop](https://hubhop.mobiflight.com/)

### 优先复用现有 SimConnect，缺口明确后再加桥接

官方 SimConnect 已支持通过 `AddToDataDefinition` 访问 L 变量；当前文档还说明了 L:1/Z、I/O 的作用域和加载限制。不能继续假设“只要 LVar 就必须新增 WASM”。本机 CLI 的字符串变量名可传递到官方接口，但具体命名空间在本机版本上的使用仍需验证。[官方本地变量访问说明](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimConnect/API_Reference/Events_And_Data/SimConnect_AddToDataDefinition.htm)

只有确认需要原生 Input Event 无法表达的 B/H 绑定或复合仪表脚本时，再评估复用 MobiFlight WASM 模块。它公开了外部客户端注册与命令通信协议，能够节省底层桥接工作；仍需完成本项目的 2024 集成验证。现有 EFB bridge 只读航路，不会自动具备这些写能力。[MobiFlight WASM 协议](https://github.com/MobiFlight/MobiFlight-WASM-Module)

WASM 解决“怎么调用”，不会自动解决“该调用哪个”。高层 AI 仍只提交明确动作和参数，具体代码来自维护过的配置。

## 建议采用的最小方案

保留 `setAutopilot`、CLI、状态读取。先新增一个小型共享配置模块，在现有服务中完成配置匹配与逐步验证，不另建通用脚本平台。

```text
用户意图
  → 识别当前飞机及其自动驾驶实现
  → 选择共享配置，应用必要的机型差异
  → 检查这次操作的前提
  → 执行配置明确规定的一个步骤
  → 在期限内确认对应状态
  → 继续下一步，或准确说明停在哪一步
```

| 配置/状态    | 最少记录什么                                             | 如何减少工作             |
| ------------ | -------------------------------------------------------- | ------------------------ |
| 共享配置     | 实现版本、模式能力、指令、参数语义、槽位、前提、完成条件 | 同一控制器复用           |
| 飞机差异     | 包/变体身份、外置 AP、禁用功能、按钮覆盖                 | 只记录真正不同的部分     |
| 会话事实     | 电源、初始化、AP/FD、模式预位/激活、导航源、目标值       | 自动读取，避免人工检查   |
| 本次执行结果 | 未发送/已发送、预位/激活、目标确认、失败原因             | 自动保存，避免靠回忆排查 |

“可信共享配置 + 当前装配匹配”可以证明能力，不要求用户先手动把 FD/FLC 打开。模式关闭本身不降低已知支持性。真正不明的实现仍保留 unknown；也不把一次短暂超时永久记成不支持。

配置按版本和装配证据匹配；飞机切换、航电重新加载后重新解析事件，取消旧请求并清除会话状态。单个 LVar 为 0、单个按钮名字匹配、飞机标题相似都不足以识别一个家族。

NAV/APP 的完成条件必须区分“已预位，等待捕获”和“正在引导”。先做 HDG/ALT/VS/FLC 与目标设置，再补导航源、LNAV/VOR、LOC/GS/GP 等状态。进近模式接通不等于自动着陆；不同机型是否有自动油门也是独立能力。

## 测试怎样从逐架人工试验变成可维护流程

1. **共享实现深测**：每种明确不同的 AP/航电组合选择代表机，使用同一套自动测试步骤验证模式、目标、开关语义、初始化等待和异常停止。不能只选外观相似的飞机。
2. **同族自动检查**：其他飞机加载时读取包/航电/控制器特征，核对共享配置要求；在用户实际要求的操作中自动验证结果和记录差异。无需为所有飞机重新手写一套事件表。
3. **异常机型补丁**：出现外置 AP、私有绑定、缺少模式或版本差异时，才增加覆盖与专项复现。
4. **升级回归**：共享逻辑更新先跑代表机；受影响的已发布支持范围做相应检查。未实测机型只能标明匹配共享配置，不能宣传为逐机认证。

该做法减少手工发现和重复试验，但不消除发布前对承诺支持机型的验证。具体能压缩到多少个家族，需完成自带飞机实际装配分组后才能给出；不能现在就承诺“测几架覆盖全部”。

自带范围应按用户实际游戏内容和版本确定，纳入游戏自带的合作厂商飞机；不要把“发布者不是 Asobo/Microsoft”直接等同于用户额外购买的第三方飞机。复杂客机与直升机可能仍需独立实现。

## C400：已知与未知，以及下一次只需做什么

已知：

- 项目目录记录包 `fs24-microsoft-aircraft-c400-corvalis`，采集时版本 `1.0.10`。
- `docs/msfs/autopilot/runtime-probes/20260903T141101759Z-aircraft-autopilot-modes-batch-006.json:909` 记录 C400 临时 AI 的 AP/FD/HDG/NAV/ALT/VS/FLC 全部读回成功。
- 本次查看本机 C400 包只有 manifest/layout 与 `minimal.fsarchive` 等文件，没有直接可读的 aircraft.cfg、panel 配置或行为 XML。
- 本次搜索到的 C400 项目记录是目录和临时 AI 探测；未找到对应的玩家驾驶舱失败前后快照。唯一现有 inspection 的主体是 TBM930，不是 C400。

未知：当时具体指令、当前 C400 实际 AP/航电装配、是否在服务层被拒绝、按钮是否收到事件、写入后是否被航电覆盖。因此不能断言“C400 换成某个变量就好了”，也不能因为临时 AI 全通过而认为玩家机已经适配成功。

下一次复现无需再测试上百架飞机，只需要 C400 这一例：

1. 在已加载、航电初始化完成的 C400 上采集身份、自动驾驶管理状态、输入事件、目标槽位、AP/FD 和导航源。先修正检查器的 AircraftLoaded 解释。
2. 记录一条明确失败指令的高层参数，以及“是否在能力判断阶段拒绝”。若没发事件，优先修服务层证据逻辑，不换底层 API。
3. 若已发事件，记录事件/参数、多个时间点的模式和目标值；与手动按同一驾驶舱按钮的结果对照。
4. 根据确认的装配绑定共享配置；只有确有差异才为 C400 添加覆盖。

若读取不到可靠的模式预位/激活状态，则先解决观察路径，不用“目标数字变了”充当整次成功。

## 建议的实施顺序与验收

| 顺序 | 工作                                                              | 可以验收的结果                                        |
| ---- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| 1    | 拆开功能支持、当前状态和前提；修正 FD/FLC、NAV 判断与逐步等待     | 已匹配配置的 FD/FLC 关闭时可开启；失败步骤后不再继续  |
| 2    | 从官方源码建立首个 Garmin 共享配置，核对外置控制器差异；复现 C400 | 至少一个真实共享路径成立，C400 的失败停在哪层可被确定 |
| 3    | 提取少量所需 HubHop 映射，明确 B/H/Set 参数语义和状态读取         | 所需特殊按钮有可追溯的调用方式，不引入整库执行        |
| 4    | 对照自带飞机装配扩展家族；优先同族共享，再做特殊客机              | 新增同族飞机通常只需身份/差异记录，无需复制流程       |
| 5    | 扩展 NAV/APP 的前提、预位与捕获语义                               | 正确报告等待捕获；不把进近接通报告成自动着陆          |

本次仅新增这份复核文档；未修改生产代码、现有方案或采集成果，未提交代码。已有 15 项单元测试通过只证明当前实现符合现有测试，不表示新方案或 C400 已通过实机验证。
