# MSFS 2024 当前飞机只读检查器

## 已整理的飞机总名单

[2026-09-07 飞机总名单](docs/msfs/autopilot/aircraft-inventory-20260907.md)将现有记录归并为 77 个官方机型条目，附配置标题、涂装、来源和待确认项；[结构化数据](docs/msfs/autopilot/aircraft-inventory-20260907.json)供后续资料整理使用。它不是自动驾驶执行白名单，原有临时 AI 探测结果未升级为玩家飞机验证结果。

## 当前推进入口

[C400 操作规则与采集卡](docs/msfs/autopilot/c400-control-rule-draft-20260907.md)已完成第 2 步离线草案；第 3 步已经完成通用执行逻辑修正和离线测试，下一步按[重新实施计划](docs/architecture/msfs-native-autopilot-restart-plan-20260907.md)进入 C400 短时玩家飞机验证。检查器现在保存 `AircraftLoaded` 原始路径，并用路径是否为空单独判断是否发现已加载飞机；这仍不等于航电已经就绪。

下文保留旧工具及历史统计说明，其中“执行白名单”“不可用”等旧名称不构成新的玩家飞机适配结论；临时 AI 对象结果的使用边界以重新实施计划为准。

## 检查器行为

检查器只读取当前已经加载的飞机，不发送 `simvar set`、Key Event 或 Input Event 写入。它还会调用官方
`SimConnect_EnumerateSimObjectsAndLiveries` 一次性读取当前模拟器可生成的飞机目录，不需要切换当前飞机。
目录返回的是“飞机标题 × 涂装”条目；检查结果同时保存条目列表和去重后的飞机标题数量。

## 使用

先启动 MSFS 2024 并进入一架飞机，然后在项目根目录执行：

```powershell
pnpm msfs:inspect
```

结果默认写入：

```text
docs/msfs/autopilot/inspections/<fingerprint>.json
```

也可以指定输出位置，或限制展开 Input Event 详情的数量：

```powershell
pnpm msfs:inspect -- --output docs/msfs/autopilot/inspections/c172.json
pnpm msfs:inspect -- --max-input-event-details 32
```

如果只需要一次性获取飞机目录，不需要采集当前飞机的自动驾驶信息，可直接调用：

```powershell
msfs aircraft list --type aircraft --json
```

这里的 `aircraft` 表示仅枚举飞机；官方接口还支持 `user`，它会把用户可选的飞机、直升机和热气球一起列出。

如果需要批量判断每个可生成飞机的自动驾驶可用性，可以在 MSFS 已进入飞行后执行：

```powershell
pnpm msfs:probe -- --limit 10
pnpm msfs:probe
```

该命令通过官方 `SimConnect_AICreateNonATCAircraft_EX1`（不可用时回退到旧接口）创建临时 AI 对象，读取 `AUTOPILOT AVAILABLE` 和相关状态 SimVar，再调用 `SimConnect_AIRemoveObject` 清理。它不会切换用户飞机；普通模式也不会发送 AP/FD 写入，但会改变临时 AI 对象集合，因此脚本会显式传递 `--unsafe`。原始结果写入 `docs/msfs/autopilot/runtime-probes/`，当前筛选白名单同步写入 `docs/msfs/autopilot/autopilot-supported-aircraft.json`；原始结果保留所有枚举标题，附带的 `filter` 则按“`status=supported` 且不是 `PassiveAircraft`”生成可用于后续 Profile/白名单的飞机集合。只有 `AUTOPILOT AVAILABLE=1` 才标记为 `supported`，读不到明确值则保留 `unknown`。

如果要验证 AP/FD/HDG/NAV/ALT/VS/FLC 的控制事件是否能在临时 AI 上产生独立读回，可执行：

```powershell
pnpm msfs:probe -- --modes --limit 5
pnpm msfs:probe:batch -- --batch-size 12
```

`--modes` 只探测非 `PassiveAircraft` 标题；每架临时 AI 都按“发送 ON/OFF（或 TOGGLE）事件 → 读取对应 SimVar → 最后关闭 AP → 删除对象”的顺序执行。NAV 没有自动伪造活动导航源，缺少 NAV1 前提时记录为 `unknown`，不会误判为不支持。模式测试原始记录仍在 `runtime-probes/`，汇总矩阵写入 `docs/msfs/autopilot/autopilot-mode-support-matrix.json`；只有 `AUTOPILOT AVAILABLE=1` 的飞机进入该矩阵。无论测试成功或失败，都必须检查结果中的 `cleanup.status`、`objects_created`、`objects_removed` 和 `unresolved_objects`。

全量模式测试推荐使用分批脚本：它通过 `--skip`/`--limit` 分段选择标题，每批单独保存原始记录，最后只有在所有批次数量、标题去重和清理状态一致时才更新正式白名单与模式矩阵。2026-09-03 本机实测覆盖 146 个非 PassiveAircraft 标题，其中 120 个 `AUTOPILOT AVAILABLE=1`、26 个明确不可用；120 个可用飞机的 7 项模式共 780 项读回支持、60 项 `unknown`，没有把模式读回失败降级成 `unsupported`。这份矩阵证明的是标准 SimConnect 事件在临时 AI 对象上的响应，不替代用户飞机的机型 Profile、Input Event/WASM 路径和导航前提验证。

## 2026-09-10 官方名单筛选结果

现在用于后续维护的是官方自研与官方合作方的交集筛选，不再直接把 146 个运行时标题当成维护名单。当前范围只保留固定翼飞机。筛选规则很简单：

1. 取官方自研包和官方合作方包；
2. 只保留其中按项目分类标记为“固定翼”的包；
3. 再与批量探测结果取交集；
4. 只保留运行时明确报告 `AUTOPILOT AVAILABLE=1` 的标题；
5. 普通 Community 第三方包、非固定翼和明确无自动驾驶的机型不进入候选清单。

执行筛选：

```powershell
pnpm msfs:filter:official -- --probe docs/msfs/autopilot/runtime-probes/20260910T143256315Z-aircraft-autopilot-modes-batched.json
```

结果写入：[官方及合作方固定翼自动驾驶候选清单](docs/msfs/autopilot/official-autopilot-candidate-filter.json)。本次范围包含 32 个官方自研固定翼包和 26 个官方合作方固定翼包，共 58 个包；其中 42 个包得到自动驾驶可用结果，形成 122 条包与运行时标题候选记录（去重后 117 个运行时标题）。另有 18 个运行时标题明确未通过。该文件仍是候选清单，不是最终执行白名单；最终仍只维护一份名单，并在每架用户飞机上补充 `key_event` 或 `input_event` 的写入验证后，才写入正式名册。

两种写入方式的当前玩家飞机验证流程见：[自动驾驶两种写入方式测试说明](docs/msfs/autopilot/autopilot-write-method-test.md)。脚本默认只读当前飞机；只有显式使用 `--write` 才会发送事件，而且只测试候选清单命中的飞机。

如果需要查看一个同时包含“可执行白名单、运行时排除项和 38 个官方合作方候选”的总名册，可执行：

```powershell
pnpm msfs:roster -- --probe docs/msfs/autopilot/runtime-probes/20260903T141231258Z-aircraft-autopilot-modes-batched.json
```

结果写入 `docs/msfs/autopilot/autopilot-aircraft-roster.json`。总名册按身份层级分开：120 个运行时自动驾驶可用标题进入执行白名单，26 个运行时不可用标题进入排除项，38 个合作方包进入 `unknown` 候选区，不会因为登记在名册中而获得执行权限。

官方 SDK 的标准自动驾驶候选接口索引见：

```text
docs/msfs/autopilot/autopilot-candidates.json
```

该文件只记录官方 SimVar、Key Event、ModelBehavior 来源和证据规则，不把任何标准事件直接视为所有飞机都支持。具体飞机仍需读取 `systems.cfg`/行为绑定，或在当前飞机上取得明确读回证据；资料不足时保持 `unknown`。

检查内容包括：

- 当前飞机的 `TITLE`、`ATC MODEL`、`ATC TYPE` 和 `ATC ID`；
- `AUTOPILOT AVAILABLE`、AP/FD、HDG/NAV、ALT/VS/FLC 相关 SimVar；
- 当前飞机的完整 Input Event 列表；
- 名称与自动驾驶相关的 Input Event 参数和值；
- 模拟器当前可生成的飞机标题和涂装目录；
- 每个读取项的成功、不可用状态和稳定错误码。

`AUTOPILOT AVAILABLE=1` 只表示模拟器报告自动驾驶可用，不等于所有模式或控制路径已经验证；该结果仍需进入对应机型 Profile 的后续审阅和受控测试。
可生成目录只说明飞机存在于当前模拟器目录中，不代表该飞机已经具备或验证了自动驾驶能力。
