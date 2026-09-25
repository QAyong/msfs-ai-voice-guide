# 自动驾驶两种写入方式测试说明

## 先说结论

这份测试用于对候选飞机做最终确认。它测试的是当前玩家飞机，不是批量脚本使用的临时 AI。

这次实现已经补上了几个容易造成 `unknown` 的问题：每个操作重新读取状态、检查地面和导航前置条件、写入后轮询读回，并确认恢复结果。

## 这份文档解决什么问题

批量脚本已经在临时 AI 飞机上验证了标准自动驾驶事件，但它没有验证当前玩家飞机的两种实际写入通道。

本测试用于回答：

1. 当前玩家飞机是否能响应官方标准 `Key Event`；
2. 目标航向、高度、速度和 VS 是否按官方参数及当前 slot/index 写入；
3. 当前玩家飞机是否提供可用的官方 `Input Event`；
4. 写入后能否用独立 SimVar 读回，并在测试结束后恢复原状态。

测试脚本只测试当前已经加载的玩家飞机，不自动切换飞机，也不测试全部运行时标题。

它证明的是“写入通道和模式开关是否可用”，不是“设置目标后飞机是否真的完成爬升”。目标值和实际飞行行为属于另一层测试。

### 历史 C400 实测结论（2026-09-10，修复前）

下面的结果来自修复前的历史报告，用于保留问题证据；完成本次 slot/index 修复后，必须重新在玩家飞机上采集，不能把旧报告当作修复后的通过结论。

当前玩家飞机识别为 `C400 Corvalis`，命中官方候选包 `fs24-microsoft-aircraft-c400-corvalis`，并确认飞机有自动驾驶能力。

- `Key Event` 已确认可用：AP、HDG、ALT、VS，共 4 项；
- FD 关闭测试返回 `failed_prepare_off`，原因是该飞机在 AP 接通时会联动 FD，不能把它直接当成“不支持”；
- NAV 因当前没有确认有效导航源而记为 `skipped_precondition`；
- FLC 在 3 秒内没有读回目标状态，记为 `readback_timeout`，仍不是明确“不支持”；
- 当前 C400 的 `Input Event` 名称可以枚举，`input.set` 命令也能提交，但候选的 `1/0` 值没有通过独立 SimVar 读回，因此 `Input Event` 暂不算支持。

所以这次结果只能作为 C400 的实测证据，暂时不能直接写入正式白名单。完整报告保存在：

```text
docs/msfs/autopilot/write-tests/20260910T173157143Z-autopilot-write-test.json
```

### 历史 C400 目标高度写入实测（修复前）

这部分是单独的目标值测试，不等同于打开 ALT 模式：

- 当前高度约 `1491` 英尺，原目标高度为 `5000` 英尺；
- 官方 `AP_ALT_VAR_SET_ENGLISH` 传入 `6000`，读回目标高度为 `6000` 英尺；
- 传入 `6000,1` 也能正确读回；
- 传入 `6000,0` 在 C400 上读回异常，并且曾联动打开 ALT，因此不能使用槽位 `0`；
- 当前 `AUTOPILOT ALTITUDE SLOT INDEX=1`，这解释了 C400 的特殊行为；
- `AS1000_ALTITUDE_OUTER_MFD` 和 `AS1000_ALTITUDE_INNER_MFD` 是旋钮增量事件，不是绝对值接口。本次传入 `+1` 或 `-1` 都出现目标下降 `1000` 英尺的结果，不能进入白名单；
- 直接 `simvar set` 可以准确写入目标高度，但目前只作为底层诊断和恢复手段，不作为已经批准的机型映射。

本次测试结束后，目标高度已恢复为 `5000` 英尺，ALT 已关闭，AP、FD 和飞机实际高度均恢复原状。官方 Key Event 对 `AP_ALT_VAR_SET_ENGLISH` 的定义是“以英尺设置高度参考值”，参数包含目标高度和槽位索引。[官方 Key Event 文档](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/Key_Events/Aircraft_Autopilot_Flight_Assist_Events.htm)

## 测试范围

测试脚本只接受下面文件中的候选飞机：

```text
docs/msfs/autopilot/official-autopilot-candidate-filter.json
```

当前候选文件的范围是：

- 官方自研固定翼飞机；
- 官方合作方固定翼飞机；
- 批量探测已报告 `AUTOPILOT AVAILABLE=1` 的飞机。

不在候选文件中的飞机，即使当前游戏可以加载，脚本也不会发送写入命令。

## 安全规则

默认命令只读，不会改变飞机状态：

```powershell
pnpm msfs:test:autopilot-write
```

只有明确加入 `--write` 才允许写入：

```powershell
pnpm msfs:test:autopilot-write -- --write --method key_event
```

开始写入测试前应满足：

- 已进入目标飞机的驾驶舱；
- 飞机处于安全的稳定空中状态，最好已经离地并保持平飞，不在起飞、着陆或紧急阶段；
- 用户知道测试会短暂打开和关闭 AP、FD 或自动驾驶模式；
- 测试期间不要手动切换飞机或退出飞行。

官方飞机配置可以设置 `min_feet_for_ap` 和 `min_flight_time_for_ap`。当前通用运行时接口不能直接读取这两个机型配置，因此最终白名单证据应在已经满足这些条件的稳定空中状态采集。[官方 systems.cfg 文档](https://docs.flightsimulator.com/msfs2024/html/5_Content_Configuration/CFG_Files/systems_cfg.htm?rhhlterm=autopilot)

默认情况下，脚本在检测到 `SIM ON GROUND=1` 时不会发送写入。如果只是排查地面状态下的事件行为，可以显式加入：

```powershell
pnpm msfs:test:autopilot-write -- --write --method key_event --allow-ground
```

`--allow-ground` 只用于诊断，地面测试结果不能单独作为正式白名单证据。

脚本每项操作都遵循：

```text
读取操作前状态
      ↓
读取当前飞行环境和导航前置条件
      ↓
发送一个写入事件
      ↓
等待并轮询独立 SimVar，最长 3 秒
      ↓
发送关闭/恢复事件
      ↓
再次读取，确认状态恢复
```

如果测试过程中无法恢复状态，应停止使用该飞机，并人工检查座舱状态。

### 全局恢复规则

AP、FD、HDG、ALT、VS、FLC 等模式可能互相影响。例如 C400 接通 AP 时会自动打开 FD，所以“每项操作恢复成功”不等于“整轮测试结束后状态一定恢复”。

写入测试全部结束后，脚本还会重新读取测试开始时的快照，统一恢复 AP、FD、HDG、NAV、ALT、VS、FLC，并再次读回确认。报告中的：

- `globalStateRestoration.status=restored`：整轮测试状态已恢复；
- `summary.globalStateRestored=true`：可以作为快速查看结果；
- 任何恢复失败或未确认，都不能把本次结果写入正式白名单。

## 测试命令

### 1. 只读发现

先执行只读命令，确认当前飞机身份、是否命中候选名单，以及当前自动驾驶状态和目标 slot/index：

```powershell
pnpm msfs:test:autopilot-write
```

结果默认写入：

```text
docs/msfs/autopilot/write-tests/<timestamp>-autopilot-write-test.json
```

默认 `key_event` 模式不会调用 `input list`，所以 `inputEventInventory` 为 `null`。只有明确请求 `--method input_event` 或 `--method both` 时，结果才会保存 Input Event 名称、当前会话 Hash、类型、参数和值。Hash 只用于本次会话，不能直接复制到白名单。

### 2. 只测试 Key Event

```powershell
pnpm msfs:test:autopilot-write -- --write --method key_event
```

也可以限制操作，例如只测试 AP、HDG 和 VS：

```powershell
pnpm msfs:test:autopilot-write -- --write --method key_event --operations ap,heading,vertical_speed
```

### 3. 单独测试目标值 Key Event

目标值测试不会把 slot/index 写死为 `0`。脚本先读取当前飞机的四个目标 slot/index，再按官方顺序发送 `[目标值, slotIndex]`，通过对应目标 SimVar 读回，并把原目标恢复。官方普通槽位范围是：航向/高度/VS 为 `1–3`，速度为 `1–4`；slot `0` 只有在实时读回就是 `0` 时才会被沿用，因为它可能覆盖其他目标：

```powershell
pnpm msfs:test:autopilot-write -- --write --method key_event --target-operations target_heading,target_altitude,target_speed,target_vertical_speed
```

VS 测试会覆盖一个负数目标；CLI 使用 SimConnect `DWORD` 的 32 位表示传输负数，因此报告里的 `data` 可能显示为无符号数。这不是把负数改成正数，而是底层数据字的表示方式。读不到有效 slot/index 时，脚本不会发送事件。

目标值测试只证明目标参数写入和读回，不证明飞机已经按目标实际转弯、爬升或下降。C400 已有实测证据显示高度 slot `1` 正常、固定 slot `0` 异常，因此不能再使用 `[目标值, 0]` 作为通用写法。

### 4. 测试 Input Event（Key Event 阶段完成后再做）

Input Event 的名称和值不能由脚本猜测。先通过只读结果确认当前飞机的事件，再准备一个当前飞机专用的映射文件，例如：

```json
{
  "ap": {
    "name": "AS1000_AUTOPILOT_AP_MFD",
    "onValue": 1,
    "offValue": 0
  },
  "fd": {
    "name": "AS1000_AUTOPILOT_FD_MFD",
    "onValue": 1,
    "offValue": 0
  },
  "heading": {
    "name": "AS1000_AUTOPILOT_HEADING_MFD",
    "onValue": 1,
    "offValue": 0
  },
  "navigation": {
    "name": "AS1000_AUTOPILOT_NAVIGATION_MFD",
    "onValue": 1,
    "offValue": 0
  },
  "altitude": {
    "name": "AS1000_AUTOPILOT_ALTITUDE_MFD",
    "onValue": 1,
    "offValue": 0
  },
  "vertical_speed": {
    "name": "AS1000_AUTOPILOT_VERTICALSPEED_MFD",
    "onValue": 1,
    "offValue": 0
  },
  "flight_level_change": {
    "name": "AS1000_AUTOPILOT_FLIGHTLEVELCHANGE_MFD",
    "onValue": 1,
    "offValue": 0
  }
}
```

上面的名称来自 C400 的只读检查记录，只是测试映射示例，不代表已经验证成功。每架飞机必须使用自己的事件名称和值。

只有完成当前飞机的 Key Event 测试，并明确知道哪些操作未通过后，才执行两种方式对比：

```powershell
pnpm msfs:test:autopilot-write -- --write --method both --input-map docs/msfs/autopilot/write-tests/c400-input-map.json --title "C400 Corvalis"
```

如果没有提供 `--input-map`，脚本仍会执行 Key Event 测试，但 Input Event 结果会记录为 `missing_binding`，不会自行猜测并写入。

如果使用 `--method both`，Key Event 测试完成后脚本会重新读取一次 Input Event 清单，避免使用已经过时的事件值来恢复状态。

官方 `SimConnect_SetInputEvent` 不产生写入回执，因此 Input Event 必须通过独立 SimVar 再确认；脚本不会把 `input set` 命令返回成功直接当成飞机支持。[官方 Input Event 文档](https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/inputevents/simconnect_setinputevent/)

## 当前测试的操作和读回

| 操作 | Key Event 开             | Key Event 关/恢复         | 独立读回 SimVar                    |
| ---- | ------------------------ | ------------------------- | ---------------------------------- |
| AP   | `AUTOPILOT_ON`           | `AUTOPILOT_OFF`           | `AUTOPILOT MASTER`                 |
| FD   | `TOGGLE_FLIGHT_DIRECTOR` | 再次 Toggle               | `AUTOPILOT FLIGHT DIRECTOR ACTIVE` |
| HDG  | `AP_PANEL_HEADING_ON`    | `AP_PANEL_HEADING_OFF`    | `AUTOPILOT HEADING LOCK`           |
| NAV  | `AP_NAV1_HOLD_ON`        | `AP_NAV1_HOLD_OFF`        | `AUTOPILOT NAV1 LOCK`              |
| ALT  | `AP_PANEL_ALTITUDE_ON`   | `AP_PANEL_ALTITUDE_OFF`   | `AUTOPILOT ALTITUDE LOCK`          |
| VS   | `AP_PANEL_VS_ON`         | `AP_PANEL_VS_OFF`         | `AUTOPILOT VERTICAL HOLD`          |
| FLC  | `FLIGHT_LEVEL_CHANGE_ON` | `FLIGHT_LEVEL_CHANGE_OFF` | `AUTOPILOT FLIGHT LEVEL CHANGE`    |

发送事件后不是只读一次，而是在等待窗口内反复读取目标 SimVar：默认先等待 300 毫秒，之后每 100 毫秒读取一次，最长等待 3 秒。

模式开关测试和目标值测试分开执行。目标值测试会明确记录目标事件的两个数据字、使用的 slot/index、读回值和恢复结果；它不会因为模式测试成功就默认目标值也正确。

因此，这份测试证明的是“Key Event 写入通道、模式开关或目标参数是否得到独立读回确认”，不是“飞机设置目标后是否真的完成爬升”。

脚本会记录 `SIM ON GROUND`、飞机高度、AP 默认俯仰/横滚模式，以及高度、航向、VS、空速目标值和四个目标 slot/index，方便判断为什么没有读回。

NAV 不再只看 `NAV AVAILABLE:1`。它还要求确认以下条件之一：

- GPS 正在驱动 NAV1，并且有活动航路；
- NAV1 已捕获有效台站，并且没有“无导航信号”标记。

没有有效导航源时记为 `skipped_precondition`，不把它误判成飞机不支持。官方 NAV 变量也区分 NAV 设备、台站状态和导航信号。[官方 Radio Navigation SimVar 文档](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimVars/Aircraft_SimVars/Aircraft_RadioNavigation_Variables.htm)

每个操作都会单独读取操作前状态。HDG、ALT、VS、FLC 等模式可能互相影响，不能用所有操作开始前的一份旧状态来判定。

## 如何判定结果

单项结果的含义：

- `supported`：写入成功、独立读回达到目标，并完成恢复；
- `readback_timeout`：命令已经发送，但最长 3 秒没有看到目标状态，属于未确认；
- `readback_mismatch`：命令提交后读回状态与预期不一致，仍需要人工复核；
- `failed`：命令发送失败或读回失败；
- `restore_failed`：测试结束后没有确认恢复成功；
- `restore_unconfirmed`：无法确认当前状态，不能安全决定恢复事件；
- `unsupported_target_slot`：没有读到有效目标 slot/index，未发送目标 Key Event；
- `invalid_test_value`：自动生成的测试值没有真正改变目标，未发送写入；
- `missing_binding`：没有提供该操作的 Input Event 映射；
- `missing_event`：映射的事件名称不在当前飞机的事件列表中；
- `unsupported_input_shape`：不是当前 CLI 支持的单个 `FLOAT64` 数值事件；
- `skipped_precondition`：缺少 NAV 等必要前提；
- `not_run_read_only`：没有传入 `--write`，只生成测试计划。

特别注意：

```text
unknown / readback_timeout ≠ 明确不支持
skipped_precondition ≠ 明确不支持
```

批量临时 AI 测试中的 `unknown`，应切换到对应的玩家飞机，在稳定空中状态下运行本测试重新确认。

方法选择规则：

```text
Key Event 成功，Input Event 失败
    → 内部记录 key_event

Input Event 成功，Key Event 失败
    → 内部记录 input_event

两种都成功
    → 按稳定性和覆盖操作人工选择一种

两种都失败
    → 不进入正式白名单
```

这里的“成功”必须是 `supported`。`readback_timeout`、`readback_mismatch`、`skipped_precondition`、`restore_failed` 和 `restore_unconfirmed` 都不能作为成功证据。

用户侧仍然只维护一份白名单；`key_event`、`input_event` 和每项操作结果只是内部记录。

## 和批量脚本的关系

两类测试不要混为一谈：

| 测试             | 测试对象     | 已回答的问题                                                   |
| ---------------- | ------------ | -------------------------------------------------------------- |
| 批量自动驾驶测试 | 临时 AI 飞机 | 运行时标题是否有 AP，以及标准事件能否改变临时 AI 的模式 SimVar |
| 本测试脚本       | 当前玩家飞机 | 当前具体飞机的 Key Event/Input Event 写入是否真实生效          |

批量结果可以作为本测试的候选名单来源，但不能替代当前玩家飞机的写入和恢复证据。

批量脚本使用的是临时 Non-ATC AI 对象；官方文档把它作为独立的 AI SimObject 创建，因此它只能做初筛，不能证明玩家飞机上的写入通道一定相同。[官方 AI 对象文档](https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/ai-object/simconnect_aicreatenonatcaircraft_ex1/)

## 进入正式白名单前的条件

只有同时满足以下条件，才可以人工把结果写入正式白名单：

1. 当前飞机命中官方或官方合作方固定翼候选名单；
2. `TITLE`、`AircraftLoaded` 路径和包身份已经记录；
3. 至少一种写入方式对所需操作返回 `supported`；
4. 每个允许操作都有独立 SimVar 读回；
5. 测试在稳定空中状态完成，不能只依赖 `--allow-ground`；
6. 测试结束后 AP、FD、模式和 Input Event 原值已恢复；
7. 测试结果文件作为 `evidence` 保存；
8. 人工选择唯一 `writeMethod`，不在运行时自动尝试另一种方式。

正式白名单仍使用：

```text
docs/msfs/autopilot/autopilot-aircraft-roster.json
```

本测试脚本不会自动修改正式白名单。
