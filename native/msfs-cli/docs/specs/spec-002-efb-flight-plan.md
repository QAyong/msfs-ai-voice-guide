# Spec-002: 获取 MSFS 2024 EFB 当前飞行计划

**日期：** 2026-07-15
**状态：** 已验收（2026-07-23）

## 背景

Agent 需要读取玩家当前在 MSFS 2024 EFB 中看到的飞行计划。该能力必须忠实反映 EFB 航路，不能依赖 Legacy GPS Flight Plan SimVars 或猜测本地文件路径。

## 需求边界

**包含：**

- `msfs route get --source efb --json`。
- Community Package 中的 `msfs-route-bridge.wasm`。
- `fsPlannedRouteGetEfbRoute()` 到稳定 route JSON 的转换。
- SimConnect CommBus 请求/响应、请求 ID、超时和消息分片处理。
- departure、destination、跑道、SID、STAR、进近、transition、巡航高度、VFR/IFR、enroute legs 的输出。
- `msfs route status --json` 与 `msfs route watch --interval-sec N --json`。

**不包含：**

- 修改 EFB 飞行计划。
- 将航电航路同步回 EFB。
- 默认读取 `.PLN`、`.FLT` 或 Legacy GPS Flight Plan SimVars。

## 验收标准

- [x] `route get` 经 SimConnect CommBus 请求桥接，成功响应返回 `source: "efb"` 与结构化 route JSON。
- [x] 无航路时，WASM bridge 返回 `ROUTE_NOT_FOUND`，不返回伪造空机场或旧缓存。
- [x] 未安装或未加载 WASM bridge 时，调用在超时后返回 `ROUTE_TIMEOUT`；不能伪造任何航路。
- [x] route 请求带 CLI correlation ID，WASM 响应原样返回该 ID；daemon 会拒绝不匹配的响应。
- [x] 2026-07-23 实机验收：官方 Toolset 构建的模块状态为 `Ready`，`route get --source efb --json` 成功返回真实 EFB 航路。
- [x] `route watch` 输出 NDJSON，以轮询 `route get` 观察当前结果。
- [x] 已实现标准化 route hash 与只在航路变化时输出的去重策略。
- [x] `compat flightplan-file` 的结果始终标识 `source: "compat_file"`。

## 场景描述

**正常流程：**

1. 用户在 EFB 设置航路。
2. LiveKit Agent 执行 `msfs route get --source efb --json`。
3. daemon 经 CommBus 请求 WASM bridge。
4. WASM 调用 Planned Route API 并回传 route JSON。
5. Agent 获得机场、程序、航路与航点信息。

**异常流程：**

1. Community Package 未安装，或飞行尚未加载导致 WASM bridge 不可用。
2. daemon 在超时后返回 `ROUTE_BRIDGE_UNAVAILABLE` 或 `ROUTE_TIMEOUT`。
3. Agent 可提示用户安装/启用 bridge，而不是改读 Legacy GPS 变量。

## 相关测试

- 已实现：`wasm-route-bridge/build.ps1` 可使用本机 SDK 构建 WASM。
- 已验证（2026-07-22）：在未启动 MSFS 的环境中，`tests/integration/cli_contract_test.ps1` 覆盖 `route get --source efb` 的离线错误分支并通过；`SIM_NOT_READY`、`ROUTE_BRIDGE_UNAVAILABLE`、`ROUTE_TIMEOUT` 与 `ROUTE_NOT_FOUND` 均被视为明确的预期结果。
- EFB route、CommBus correlation、`route get` 和 `route watch` 回归已完成并通过。

上述离线验证不等同于 Community Package 已在游戏内加载，也不等同于真实 EFB 航路读取已验收。

## 部署前置条件

构建脚本通过官方 VS2022 `MSFS2024` Platform Toolset 编译 `wasm-route-bridge/msfs-route-bridge.vcxproj`，再通过 SDK Package Tool 生成完整包。必须将整个目录安装到 `Community2024`（不是 MSFS 2020 兼容的 `Community`）并重启 MSFS 2024。CLI 无法在进程外枚举游戏已加载的 WASM 模块，因此 `route status` 只报告 CommBus 协议，`route get` 是可用性的最终探测。

MSFS 2024 构建必须使用官方 Toolset；它会正确链接 `MSFS_WasmVersions.a` 并生成必要运行时导出。不要回退到手工 `wasm-ld` 链接或以“无未解析导入”作为可加载性的替代证明。官方 Toolset 的 `wasi_snapshot_preview1:commit_pages` 导入已在游戏中验证可加载。

替换候选包时，先退出游戏，再清理该包在 `WASM\MSFS2020` 和 `WASM\MSFS2024` 下的编译缓存。不得编辑 `Content.xml` 或以 Legacy GPS 数据降级伪造 EFB 航路。

## 相关 ADR

- [ADR-001](../adr/adr-001-native-first.md)
- [ADR-002](../adr/adr-002-efb-planned-route-bridge.md)
- [ADR-004](../adr/adr-004-msfs-wasm-official-toolchain.md)
