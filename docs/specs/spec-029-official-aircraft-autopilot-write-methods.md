# Spec-029：官方飞机自动驾驶白名单与双写入方式

**日期：** 2026-09-10  
**状态：** 方案确定，运行时接入待完成

## 1. 这份文档负责什么

[Spec-028：官方飞机自动驾驶数据采集与验证](spec-028-official-aircraft-autopilot-data-acquisition.md) 负责回答：

> 我们怎样采集飞机资料，并证明某个自动驾驶操作确实有效？

本文件负责回答：

> 哪些飞机允许使用，以及这架飞机应该使用哪一种官方写入方式？

两份文档的关系是：

```text
028：采集和验证证据
        ↓
人工确认
        ↓
029：写入唯一官方白名单
        ↓
运行时按白名单选择写入方式
```

## 2. 总体原则

项目只维护一份官方飞机自动驾驶白名单：

```text
命中白名单 → 允许自动驾驶控制
未命中白名单 → 告诉用户当前飞机不适配，不发送写入命令
```

名单内的飞机都属于已适配飞机。每架飞机内部指定一种写入方式：

```text
key_event   → 使用官方标准 Key Event
input_event → 使用官方 SimConnect Input Event
```

这不是两份名单，也不是用户看到的两种支持等级。它只是告诉程序：

> 对这架飞机，应该走哪一条写入通道。

## 3. 哪些飞机可以进入白名单

飞机必须同时满足：

1. 属于 MSFS 2024 官方飞机范围；
2. 能够稳定识别；
3. 选择的写入方式使用官方接口；
4. 相关操作已经经过运行时写入和独立读回验证。

以下飞机不进入白名单：

- Community 或其他第三方飞机；
- 没有自动驾驶的飞机；
- 尚未验证或版本已经不匹配的飞机；
- 只能依赖未经确认的本机变量、专用插件或不受项目控制的接口的飞机。

需要 Input Event 不代表一定排除。只要它是官方 SimConnect Input Event，并且已经按当前飞机验证，就可以使用 `input_event` 方式进入白名单。

## 4. 白名单文件

正式白名单建议使用：

```text
docs/msfs/autopilot/autopilot-aircraft-roster.json
```

每一条记录至少包含：

- `packageName`：官方飞机包名；
- `aircraftTitle`：运行时飞机标题；
- `writeMethod`：`key_event` 或 `input_event`；
- `supportedOperations`：允许执行的操作；
- `evidence`：对应的检查记录和测试记录。

示例：

```json
{
  "schemaVersion": 2,
  "aircraft": [
    {
      "packageName": "fs24-asobo-aircraft-c172",
      "aircraftTitle": "C172SP G1000",
      "writeMethod": "key_event",
      "supportedOperations": [
        "enable_ap",
        "set_heading_mode",
        "set_altitude_mode",
        "set_vertical_speed",
        "set_heading_target",
        "set_altitude_target",
        "set_vertical_speed_target"
      ],
      "evidence": [
        "inspections/c172sp-g1000.json",
        "test-results/c172sp-g1000-key-event.json"
      ]
    },
    {
      "packageName": "fs24-asobo-aircraft-example",
      "aircraftTitle": "Example Aircraft",
      "writeMethod": "input_event",
      "supportedOperations": [
        "enable_ap",
        "set_heading_mode"
      ],
      "inputEventBindings": {
        "enable_ap": {
          "name": "AIRCRAFT_AP_MASTER",
          "type": "FLOAT64",
          "params": ";FLOAT64",
          "onValue": 1,
          "offValue": 0,
          "readback": "AUTOPILOT MASTER"
        }
      },
      "evidence": [
        "inspections/example-aircraft.json",
        "test-results/example-aircraft-input-event.json"
      ]
    }
  ]
}
```

`input_event` 的 Hash 不写入白名单作为永久值。Hash 必须在当前会话中通过 `input list` 按事件名称重新获取。

## 5. 写入方式一：Key Event

### 5.1 适用情况

飞机可以正常响应 MSFS 官方标准自动驾驶事件，并且写入后能通过官方 SimVar 读回确认。

### 5.2 当前支持的标准操作

| 操作 | 官方 Key Event | 数据参数 | 读回 SimVar |
| --- | --- | --- | --- |
| 打开 AP | `AUTOPILOT_ON` | 无 | `AUTOPILOT MASTER` |
| 关闭 AP | `AUTOPILOT_OFF` | 无 | `AUTOPILOT MASTER` |
| 打开/关闭 FD | `TOGGLE_FLIGHT_DIRECTOR` | 无 | `AUTOPILOT FLIGHT DIRECTOR ACTIVE` |
| 打开 HDG | `AP_PANEL_HEADING_ON` | 无 | `AUTOPILOT HEADING LOCK` |
| 关闭 HDG | `AP_PANEL_HEADING_OFF` | 无 | `AUTOPILOT HEADING LOCK` |
| 打开 NAV1 | `AP_NAV1_HOLD_ON` | 无 | `AUTOPILOT NAV1 LOCK` |
| 关闭 NAV1 | `AP_NAV1_HOLD_OFF` | 无 | `AUTOPILOT NAV1 LOCK` |
| 打开 ALT | `AP_PANEL_ALTITUDE_ON` | 无 | `AUTOPILOT ALTITUDE LOCK` |
| 关闭 ALT | `AP_PANEL_ALTITUDE_OFF` | 无 | `AUTOPILOT ALTITUDE LOCK` |
| 打开 VS | `AP_VS_ON` | 无 | `AUTOPILOT VERTICAL HOLD` |
| 关闭 VS | `AP_VS_OFF` | 无 | `AUTOPILOT VERTICAL HOLD` |
| 打开 FLC | `FLIGHT_LEVEL_CHANGE_ON` | 无 | `AUTOPILOT FLIGHT LEVEL CHANGE` |
| 关闭 FLC | `FLIGHT_LEVEL_CHANGE_OFF` | 无 | `AUTOPILOT FLIGHT LEVEL CHANGE` |
| 设置航向 | `HEADING_BUG_SET` | `[角度, 航向 slot/index]` | `AUTOPILOT HEADING LOCK DIR` |
| 设置高度 | `AP_ALT_VAR_SET_ENGLISH` | `[英尺, 高度 slot/index]` | `AUTOPILOT ALTITUDE LOCK VAR` |
| 设置速度 | `AP_SPD_VAR_SET` | `[节, 速度 slot/index]` | `AUTOPILOT AIRSPEED HOLD VAR` |
| 设置 VS | `AP_VS_VAR_SET_ENGLISH` | `[英尺/分钟, VS slot/index]` | `AUTOPILOT VERTICAL HOLD VAR` |

官方 Key Event 定义见：[Aircraft Autopilot/Flight Assist Events](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/Key_Events/Aircraft_Autopilot_Flight_Assist_Events.htm)。

对于明确的打开和关闭操作，优先使用 `ON` / `OFF` 事件，不使用 Toggle 事件。`AP_MASTER` 仍是官方事件，但它是 Toggle，第一版不作为 AP 开关的首选写法。

目标值事件的第二个参数不能写死为 `0`。执行前必须读取对应的 `AUTOPILOT ... SLOT INDEX`，把当前 slot/index 原样作为第二个数据字发送；读不到、不是整数或超出允许范围时，拒绝写入。按官方变量说明，航向/高度/VS 的普通槽位是 `1–3`，速度槽位是 `1–4`；slot `0` 是特殊槽位，可能覆盖其他目标，因此只有当前飞机实时读回明确给出 `0` 时才允许使用。

## 6. 写入方式二：Input Event

### 6.1 适用情况

飞机没有可靠响应某个标准 Key Event，但当前飞机提供了已经验证过的官方 Input Event。

Input Event 仍然走官方 SimConnect API，不是项目私有接口。

### 6.2 标准执行流程

```text
input list
      ↓
按白名单中的 name 找到当前 Hash
      ↓
确认 type 和 params
      ↓
按正确格式准备值
      ↓
input set
      ↓
读取独立 SimVar 确认操作结果
```

官方接口包括：

- `SimConnect_EnumerateInputEvents`：获取当前飞机的事件名称、Hash 和类型；
- `SimConnect_EnumerateInputEventParams`：获取事件参数；
- `SimConnect_GetInputEvent`：获取当前事件值；
- `SimConnect_SetInputEvent`：写入事件值。

参考：[Input Events](https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/inputevents/input-events/)。

### 6.3 白名单中必须记录什么

对于每个 Input Event 操作，至少记录：

- 事件名称；
- 事件类型；
- 参数格式；
- 打开、关闭或设置值的编码方式；
- 独立读回 SimVar；
- 验证记录。

不能只记录事件名称和 Hash，也不能默认所有事件都使用数值 `1`。

### 6.4 当前项目限制

Native CLI 当前的 `input set` 只接收数值 `double`。因此第一阶段只允许把以下 Input Event 放进白名单：

- 类型已经确认是 `FLOAT64`；
- 参数是单个数值或当前 CLI 已经支持的格式；
- 写入值和读回结果已经验证。

字符串或复杂多参数 Input Event 暂不进入白名单，直到 CLI 增加对应的类型编码支持。

## 7. 运行时执行流程

```text
读取当前飞机身份
      ↓
匹配唯一官方白名单
      ├─ 未命中 → 提示不适配，不发送写入
      ↓
读取名单中的 writeMethod
      ├─ key_event   → Key Event Adapter
      └─ input_event → Input Event Adapter
      ↓
检查 supportedOperations
      ↓
读取当前 AP 状态和前置条件
      ↓
发送一个操作
      ↓
读取独立状态确认
      ├─ 失败 → 停止后续操作
      └─ 成功 → 继续下一项操作
```

两种写入方式之间不自动切换。名单指定了哪一种方式，就只使用哪一种方式。

如果某架飞机同时验证了两种方式，第一版仍只选择一种作为 `writeMethod`，避免运行时行为不确定。

## 8. 以 Cessna 172 爬升为例

如果 C172 在白名单中指定：

```json
{
  "writeMethod": "key_event",
  "supportedOperations": [
    "enable_ap",
    "set_heading_mode",
    "set_altitude_mode",
    "set_vertical_speed",
    "set_heading_target",
    "set_altitude_target",
    "set_vertical_speed_target"
  ]
}
```

用户说：

```text
打开 AP，航向 090°，VS +500 ft/min，爬升到 5000 ft
```

项目只走 Key Event：

```text
AUTOPILOT_ON
  ↓
AP_PANEL_HEADING_ON
  ↓
AP_VS_ON
  ↓
HEADING_BUG_SET [90, HEADING_SLOT_INDEX]
  ↓
AP_ALT_VAR_SET_ENGLISH [5000, ALTITUDE_SLOT_INDEX]
  ↓
AP_VS_VAR_SET_ENGLISH [500, VS_SLOT_INDEX]
```

其中 `HEADING_SLOT_INDEX`、`ALTITUDE_SLOT_INDEX` 和 `VS_SLOT_INDEX` 不是常量，必须先从当前飞机的对应 SimVar 读取；示例中的占位符不能直接作为数字发送。

如果某架飞机在白名单中指定 `input_event`，同一个高层请求不改变，只有底层 Adapter 改为按该飞机的 Input Event 绑定执行。

## 9. 白名单加入和变更流程

```text
028 采集身份和候选控制
      ↓
028 进行运行时写入和读回测试
      ↓
人工确认使用 key_event 或 input_event
      ↓
写入 029 的唯一白名单
      ↓
运行时 Resolver 按 writeMethod 选择 Adapter
```

以下情况需要重新验证：

- MSFS 版本变化；
- 官方飞机包版本变化；
- 飞机变体变化；
- Input Event 名称、类型、参数或行为变化；
- 读回结果发生变化。

旧版本的 Hash 不直接继承到新会话或新版本。

## 10. 当前项目需要完成的代码改动

当前代码已经有两类底层能力：

- Key Event：`key-event send`；
- Input Event：`input list / params / get / set`。

当前已先完成 Key Event 第一阶段的关键修正：

1. `setAutopilot` 的 AP/FD/HDG/NAV/ALT/VS/FLC 主链路只发送官方 Key Event，不再因发现同名 Input Event 就切换通道；
2. AP 使用明确的 `AUTOPILOT_ON/OFF`，FD 仍使用官方 Toggle，但每次操作前后都依赖状态读回；
3. 目标航向、高度、速度和 VS 都读取对应 slot/index 后再发送两个数据字；
4. 负数 VS 按 SimConnect 的 DWORD 规则编码后交给 CLI；
5. 受控测试器默认只跑 Key Event，并把目标值测试单独列出，写入后必须独立读回并恢复。

后续仍需要：

1. 用当前用户飞机逐架完成 Key Event 实机证据，未确认的操作保持 unknown；
2. 增加白名单加载和当前飞机匹配；
3. 在 Key Event 确认失败的具体操作上，再实现并验证 `InputEventAdapter`；
4. 按白名单明确选择唯一写入通道，不自动跨通道兜底；
5. 保留每一步独立读回和失败停止机制。

相关实现：

- `src/msfs/guide-service.ts`：当前自动驾驶控制流程；
- `native/msfs-cli/src/simconnect/simconnect_client.cpp`：SimConnect Key Event 和 Input Event 封装；
- `scripts/inspect-msfs-current-aircraft.ts`：当前飞机检查；
- `scripts/probe-msfs-aircraft-autopilot.ts`：临时 AI 自动驾驶测试。

## 11. 验收标准

- [ ] 只有一份正式官方自动驾驶白名单；
- [ ] 每个白名单条目明确指定 `key_event` 或 `input_event`；
- [ ] 两种写入方式都使用官方 SimConnect API；
- [x] Key Event 主链路不因 Input Event 名称存在而自动切换；
- [x] 目标 Key Event 不再固定发送 slot/index `0`；
- [ ] 未命中白名单时不发送写入命令；
- [ ] 不自动在两种写入方式之间切换；
- [ ] Input Event 不写死 Hash；
- [ ] Input Event 写入前确认类型、参数和值；
- [ ] 只执行白名单中的 `supportedOperations`；
- [ ] 每个写入动作都有独立状态读回；
- [ ] 任一步失败，后续动作停止；
- [ ] 版本变化后重新验证相关白名单条目。
