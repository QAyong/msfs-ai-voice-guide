# ADR-003: 非原生地理信息通过 Geo Cloud 提供

**日期：** 2026-07-15
**状态：** 已接受

## 背景

MSFS 2024（Microsoft Flight Simulator 2024，微软模拟飞行）可原生提供飞机位置和机场/导航设施，但不保证提供“当前位置所属城市、行政区、道路地址、周边通用 POI（兴趣点）”等完整现实世界地理信息。

旧 MCP 项目的 `geo_context`（地理上下文解析器）依赖 Natural Earth、GeoNames、OurAirports 与 MSFS POI 等大量数据。将完整数据与空间索引放入每个 CLI 发布包会显著增加安装体积和首次启动成本。现有 `MSFS Geo Cloud`（云端地理服务）已在 `https://geo.qayong.site` 运行，并提供受 API Key（接口密钥）保护的 `POST /v1/location-context` 接口与 PostGIS（PostgreSQL 地理扩展）查询后端。

## 决策

1. 非原生地理上下文由 `msfs external geo`（外部地理命令）通过 MSFS Geo Cloud 获取；CLI 核心不携带全量地理数据，也不直接连接第三方地图服务。
2. Geo Cloud 是对 CLI 的稳定接口与密钥边界。首个可选地图 Provider 为 Nominatim（OpenStreetMap），仅在 Geo Cloud 内部为 `detail=full` 的坐标反查补充 `place` 字段；CLI 不硬编码、更不直接配置 Provider。行政区、城市、地址、通用 POI 与地名搜索仍由可替换解析器按各自稳定接口提供。
3. 为降低数据量，停止以 GeoNames 全量数据作为运行时依赖；机场 ICAO（四字代码）、跑道、导航台与附近机场改由 MSFS `facilities`（原生设施接口）提供，不再将 OurAirports 作为运行时数据源。
4. Geo Cloud 的 PostGIS 当前集中保留 GeoNames、15 个 Natural Earth 图层与 MSFS POI。它们只在云端运行，绝不随 CLI 发布包分发；每个响应字段都必须有来源标记。
5. MSFS 原生坐标、机场/导航设施、EFB 航路和游戏内 POI 不能被通用地图 Provider 替代。
6. 坐标系必须显式处理：MSFS 输入坐标一律标识为 `WGS84`；Geo Cloud 内部的 Provider 适配器负责必要的坐标转换；所有响应必须附带来源和坐标系元数据。任何非 WGS84 坐标结果不得未经转换写入 MSFS、EFB 航路或飞行控制命令。

## 原因

- 云端集中保存并更新大规模地理数据，用户安装包保持轻量。
- Geo Cloud 可统一缓存、限流、超时、Provider 选择和 API Key，避免把任何供应商密钥发放到每个客户端。Nominatim 公共实例的调用必须受 1 请求/秒限流与缓存保护，生产负载使用自托管或可达的托管端点。
- Provider 适配层可按实际覆盖范围和授权切换自有 PostGIS 数据或未来的其他 Provider，CLI 协议不随之改变。
- 全量 GeoNames 及其空间索引是旧 MCP 的最大数据与内存负担；它不会进入 CLI 发布包。是否在 Geo Cloud 以裁剪数据集运行，留给云端解析器模块决定。
- MSFS `facilities` 已是航空设施的权威来源，保留 OurAirports 会造成重复数据、更新负担与来源冲突。
- 原生飞行数据与外部现实世界信息保持可审计的来源边界，Agent 不会把地址/POI 误认为 SimConnect 真相。

## 影响

- CLI 的外部地理入口使用 `MSFS_GEO_BACKEND`、`MSFS_GEO_CLOUD_BASE_URL`、`MSFS_GEO_API_KEY` 与 `MSFS_GEO_TIMEOUT_SECONDS` 配置；`BACKEND` 当前只允许 `cloud`，密钥不可输出到 stdout、日志或 JSON 响应。
- 首个实现的云端能力是当前位置上下文：`POST /v1/location-context`。Nominatim 可在该接口的 `detail=full` 结果中补充坐标反查的 `place`；正向地名搜索、地址转坐标等能力须在 Geo Cloud 新增稳定 API 后再暴露给 CLI。
- Geo Cloud 的解析器响应须归一化为项目约定的 `administrative`、`natural`、`game_poi` 与 `_meta` 字段。
- Geo Cloud 不可用时返回 `EXTERNAL_GEO_UNAVAILABLE`；不回退下载或加载完整本地 GeoNames 数据。
- 针对飞行关键数据，优先顺序固定为：MSFS SimConnect/WASM 原生数据 > Geo Cloud 的游戏专属数据 > 通用地图 Provider 的补充信息。
- Natural Earth 当前导入 15 个图层：国家/省州、海洋、湖泊、河流、海岸线、城市、自然区域、陆地、小岛屿、冰川、冰架及珊瑚礁等。后续可在不改变 CLI 契约的前提下裁剪云端图层，但不能把它们重新打进 CLI。
- MSFS POI 保留为独立游戏数据源；GeoNames、OurAirports、Natural Earth 行政/城市图层不得进入 CLI 发布包。机场的飞行关键设施仍以 MSFS `facilities`（原生设施接口）为准。
- 数值地面海拔固定优先读取 MSFS `GROUND ALTITUDE`；Natural Earth 阴影地形栅格仅是制图资源，不导入为高度数据。保护区不在当前数据范围，未来接入必须另行确认授权、更新频率和字段许可。

## 不在此决策范围内

- Geo Cloud 内部的最终 Provider 选型、商业套餐和调用额度；当前不作决定。
- 用高德或其他地图 API 做汽车、步行、骑行路线规划。
- 把通用地图搜索结果自动写入 EFB 航路、传送飞机或操纵飞行器。
- 将 Geo Cloud 改为 MSFS 核心通信通道；核心仍只使用 Windows Named Pipe（Windows 命名管道）。
