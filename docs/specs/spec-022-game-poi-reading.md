# Spec-022：游戏内 POI 读取

**状态：** 已实现并完成真实 Geo Cloud 验证（2026-08-17）
**建议优先级：** P0，第一个完成
**目标周期：** 一周内完成最小版本

## 目标

用户询问“附近有什么地标/景观/POI”时，游戏助手能够读取当前位置附近的游戏内 POI，并用清晰的中文或英文回答。

## 当前基础

- 项目已有 `getLocationContext` 工具。
- 该工具通过当前飞机位置调用 Geo Cloud，返回行政区、自然地貌和 `game_poi` 上下文。
- 该结果已经有来源边界，不能把 Geo Cloud 返回的地名说成 SimConnect 原生字段。
- `getNearbyFacilities` 继续负责机场、航点、NDB、VOR 等航空设施，两者不混用。

## 当前实现

- 继续复用现有 `getLocationContext`，不新增 Agent 工具、Native CLI 命令或设置项。
- 从 Geo Cloud 的 `context.game_poi.nearby` 读取 POI 集合。
- 在 `src/msfs/guide-service.ts` 中标准化为 `gamePois`，保留原始 `context` 以兼容现有探索逻辑。
- 标准化结果按距离升序排列、按名称去重，最多保留 5 个结果；距离缺失时不自行估算。
- `MsfsExploreContextProvider` 将同一批 `gamePois` 传给探索 Planner，探索不重复查询 POI。
- 当前需求只支持当前位置附近 POI，不查询历史轨迹 POI。

相关代码：

- `src/tools/msfs-guide.ts`
- `src/msfs/guide-service.ts`
- `native/msfs-cli/src/external/geo_context.cpp`

## 第一版需求

用户可以询问：

- “附近有什么游戏内 POI？”
- “我现在附近有什么地标？”

助手返回：

- POI 名称；
- POI 类型或简短说明；
- 距离（数据有提供时）；
- 数据来源或来源状态。

建议最多返回距离最近的 5 个结果，避免一次回答过长。

## 失败行为

- MSFS 未连接：说明无法读取当前飞机位置。
- Geo Cloud 不可用：说明暂时无法获取 POI，不编造地名。
- 附近没有结果：明确回答“当前范围内没有找到游戏内 POI”。
- 不能用普通网页搜索结果冒充游戏内 POI。

## 不包含

- 直接解析 MSFS 所有场景包或内部 Landmark 数据；
- 修改官方 EFB 地图；
- 在地图上绘制 POI；
- 自动播报；自动播报见 [Spec-023](spec-023-auto-tour-mode.md)。
- 基于历史轨迹查询“刚才飞过的景点”。

## 验收标准

- 用户主动询问附近 POI 时，助手能返回有限数量的真实结果或明确的无结果状态。
- 返回结果保留现有来源信息。
- Geo Cloud 失败时不编造 POI。
- 航空设施和普通游戏 POI 的来源、名称和回答不混淆。
- 不影响现有只读飞行工具和手动探索。

## 实际验证

- 伦敦市中心 `51.5074, -0.1278`：Geo Cloud 请求成功，返回 `game_poi.nearby: []`，标准化结果为空。
- 上海陆家嘴 `31.2397, 121.4998`：返回 2 个 POI：Shanghai Tower（0.48 km）和 Oriental Pearl Tower（0.50 km），均标记为 `geo_cloud_postgis:msfs_poi` 来源。
- 自动化验证覆盖 POI 标准化、排序、去重、数量上限、空结果、探索上下文复用和 Geo Cloud 不可用状态。

## 已确认

1. POI 继续来自 Geo Cloud 的 `game_poi` 数据，不直接解析 MSFS 场景文件。
2. 第一版最多返回 5 个 POI。
