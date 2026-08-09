# Spec-003: Geo Cloud 外部地理上下文

**日期：** 2026-07-15
**状态：** 开发中

## 背景

Agent 需要把 MSFS 的原生位置解释为用户可理解的地理上下文，例如国家、城市、行政区、水域与附近 POI（兴趣点）。该信息不是 SimConnect 的原生真相，且不应让每个客户端随包携带全量 GeoNames 或 Natural Earth 数据。

## 需求边界

**包含：**

- `msfs external geo context --from aircraft --detail auto --json`：从 MSFS 读取飞机 `WGS84`（全球大地坐标系）位置，再查询 Geo Cloud。
- `msfs external geo context --lat N --lon N --alt-m N --detail auto --json`：不读取模拟器，直接查询指定位置。
- 调用 `POST ${MSFS_GEO_CLOUD_BASE_URL}/v1/location-context`，以 `X-MSFS-Geo-Key`（接口密钥请求头）传递密钥。
- `auto`、`full`、`coarse` 三种 detail（细节等级），与既有 Geo Cloud API 对齐。
- 成功响应在 CLI 的 `data.context`（地理上下文）中保留 Geo Cloud 的 `administrative`、`natural`、`game_poi`、`_meta`；`data.origin` 固定为 `external_geo_cloud`。
- 当 `detail=full` 且 Geo Cloud 内部的 Nominatim Provider 可用时，成功响应可额外返回 `place`（地点显示名、地址、类别和 OSM 标识）。`place` 仅补充现实世界地点信息，不能覆盖 `administrative`、MSFS 原生设施、游戏 POI 或 EFB 航路。
- Geo Cloud 响应输出字段级 `source_map`（来源映射）、输入/输出坐标系、缓存状态（如可用）和降级状态；具体 Provider 名称由云端决定。
- 超时、鉴权失败、服务不可用、无效坐标等结构化错误。

**不包含：**

- 在 CLI 发布包中下载、打包或预热全量 GeoNames、OurAirports 或 Natural Earth。
- CLI 直接调用高德或其他第三方地图 API。
- 正向地址/地名搜索与地址转坐标；等待 Geo Cloud 发布独立稳定接口后另立 Spec。当前只包含由坐标反查补充 `place`。
- 用地图 POI 代替 MSFS `facilities`（设施）、EFB 航路、ICAO（机场四字代码）或 MSFS POI。
- 将地图坐标直接写回模拟器。

## 配置

| 环境变量 | 必填 | 默认值 | 说明 |
|---|---:|---|---|
| `MSFS_GEO_BACKEND` | 否 | `cloud` | CLI 的稳定后端；当前仅支持 `cloud`，不是地图 Provider。 |
| `MSFS_GEO_CLOUD_BASE_URL` | 是 | 无 | Geo Cloud HTTPS 基址；当前部署为 `https://geo.qayong.site`。 |
| `MSFS_GEO_API_KEY` | 是 | 无 | Geo Cloud API Key（接口密钥），仅进请求头。 |
| `MSFS_GEO_TIMEOUT_SECONDS` | 否 | `2` | 请求超时秒数，范围 1–10。 |

## 验收标准

- [x] `--from aircraft` 只通过 SimConnect 读取 `PLANE LATITUDE`、`PLANE LONGITUDE`、`PLANE ALTITUDE`（米），再请求 Geo Cloud。
- [x] 直接坐标模式不启动或连接 `msfsd.exe`。
- [x] 请求使用 HTTPS、`POST /v1/location-context` 和 `X-MSFS-Geo-Key`；API Key 不出现在 stdout、stderr 或响应中。
- [ ] 输入 MSFS 坐标总是以 `WGS84` 标识；Provider 转换发生在 Geo Cloud 内部，响应不得含未标识坐标系的坐标值。
- [x] CLI 在成功响应添加 `origin: "external_geo_cloud"`，不会宣称地理结果来自 SimConnect；Geo Cloud 的 `_meta` 透传在 `context` 中。
- [ ] `detail=full` 且 Nominatim Provider 可用时，`place` 返回 WGS84 坐标、显示名、来源和 ODbL 署名；Provider 不可用时保留现有上下文并在 `_meta.degraded` 标识降级。
- [ ] 响应的 `_meta.source_map` 必须标明 `administrative`、`natural`、`game_poi` 等字段域的实际来源；不得覆盖 MSFS 原生字段来源。
- [x] Geo Cloud 返回 401 时 CLI 返回 `EXTERNAL_GEO_AUTH_FAILED`；网络错误、5xx 或超时返回 `EXTERNAL_GEO_UNAVAILABLE`。
- [x] 地图 Provider 的具体选择与范围只在 Geo Cloud 内部发生；CLI 对 Provider 保持无感。
- [x] 不可用时不下载大数据包，不回退到旧 MCP 的全量本地地理解析器。
- [x] Geo Cloud 当前通过 GeoNames 提供城市和细粒度地名；地址、通用 POI 与地名搜索 API 尚未发布。不得在 CLI 运行时加载全量 GeoNames。
- [ ] 机场 ICAO、跑道、导航台与附近机场通过 MSFS `facilities` 获取；不得调用或分发 OurAirports 作为运行时兜底。
- [x] Geo Cloud 已导入 15 个 Natural Earth 图层与 MSFS POI；它们只存在于云端数据卷，CLI 发布包不包含任何图层数据。自然图层含冰川、冰架、珊瑚礁、陆地和小岛屿。
- [x] 精确地面海拔不使用 Natural Earth 栅格图；CLI 通过 MSFS 原生 `GROUND ALTITUDE`（地面海拔）读取。保护区不在当前范围。

## 场景描述

**正常流程：**

1. Agent 执行 `msfs external geo context --from aircraft --detail auto --json`。
2. CLI 通过 daemon（守护进程）读取飞机经纬度与高度。
3. CLI 将 WGS84 坐标和米制高度发送给 Geo Cloud。
4. Geo Cloud 使用 PostGIS 与已配置的 Provider 解析地理上下文。
5. CLI 输出 `origin: external_geo_cloud` 与云端返回的地理上下文 JSON。

**异常流程：**

1. Geo Cloud 超时、不可达或拒绝请求。
2. CLI 返回结构化错误，说明外部地理信息不可用。
3. CLI 不伪造城市/POI，不自动下载全量数据，也不影响原生 SimConnect 命令。

## 相关测试

- 已实现：`tests/unit/geo_context_test.cpp`（请求范围与 Geo Cloud 后端配置）。
- 已验证（2026-07-22）：未启动 MSFS 时，`geo_context_test`、`cli_contract_test` 与 `tests/e2e/geo_coverage_test.ps1` 均通过。后者使用直接坐标模式调用 Geo Cloud，覆盖 7 个全球代表性坐标；传输、WGS84/来源元数据和预期字段覆盖率均为 100%。API Key 仅由部署者预先配置到环境变量，未写入输出或测试报告。
- 已部署（2026-07-22）：Geo Cloud 已加入 Nominatim 的 `place` 补充适配器、1 请求/秒限流、24 小时坐标缓存和 Provider 软降级。服务端冒烟测试通过；当前腾讯云主机无法连接公共 Nominatim 端点，因此 Provider 保持关闭，待配置可达的 HTTPS 端点或自托管实例后再完成线上验收。
- 计划：`tests/unit/geo_response_normalization_test.cpp`
- 计划：`tests/integration/geo_cloud_client_test.cpp`
- 计划：`tests/e2e/geo_context_from_aircraft_test.cpp`

## 相关 ADR

- [ADR-001](../adr/adr-001-native-first.md)
- [ADR-003](../adr/adr-003-external-geo-cloud.md)
