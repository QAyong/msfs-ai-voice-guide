# ADR-002: 当前 EFB 飞行计划通过 WASM Planned Route API 获取

**日期：** 2026-07-15
**状态：** 已接受

## 背景

需要读取 MSFS 2024 当前 EFB 飞行计划，包括机场、程序、跑道、航路、航点和巡航高度。进程外 SimConnect Flights API 提供飞行/航路文件加载和保存，但不提供读取当前 EFB 完整航路的等价接口。Legacy GPS Flight Plan SimVars 在 MSFS 2024 已被标记为不推荐使用。

## 决策

发布一个最小的 Community Package，其中包含 `msfs-route-bridge.wasm`。该模块使用 `fsPlannedRouteGetEfbRoute()` 获取 EFB 航路，以 CommBus JSON 响应 `msfsd.exe` 的请求。

## 原因

- Planned Route API 是官方推荐的现代 MSFS 2024 飞行计划接口。
- 返回的 `FsPlannedRoute` 包含 EFB 航路的完整结构，而非局部 GPS 变量快照。
- CommBus 是官方支持的 SimConnect、WASM 和 JavaScript 模块间异步通信机制，适合传输结构化 JSON。
- 该方案不依赖私有文件路径、文件格式猜测或外部程序。

## 影响

- `msfs route get --source efb` 依赖 Community Package 已安装且 WASM 模块已加载。
- route 响应必须携带 `source: "efb"`、WASM bridge 状态和请求时间。
- `route watch` 默认以轮询 `route get` 检测变化；EFB 的发送到航电广播仅作为额外信号，不能假定每次编辑都会触发。
- `compat flightplan-file` 可以读取 `.PLN/.FLT`，但结果必须标识为兼容来源，不能伪装为 EFB 真相。

## 不在此决策范围内

- 向 EFB 写入或同步 Agent 生成的航路。
- 从第三方航线规划器导入航路。
- 使用 Legacy GPS Flight Plan SimVars 写入飞行计划。
