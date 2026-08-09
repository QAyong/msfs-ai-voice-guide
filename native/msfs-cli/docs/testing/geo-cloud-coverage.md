# Geo Cloud 覆盖测试记录

**最近执行：** 2026-07-22

**服务：** `https://geo.qayong.site/v1/location-context`
**测试：** `tests/e2e/geo_coverage_test.ps1`

## 安全配置

客户端需要 `MSFS_GEO_CLOUD_BASE_URL` 与 `MSFS_GEO_API_KEY`。地址可以记录在配置文档中；API Key 是部署凭据，**不得**提交到 Git、写入 Markdown、测试报告、stdout 或 stderr。

```powershell
$env:MSFS_GEO_CLOUD_BASE_URL = "https://geo.qayong.site"
$env:MSFS_GEO_API_KEY = "<由部署者安全提供的密钥>"
```

## 测试范围与结果

测试使用 `detail: "full"` 和 WGS84 坐标，检查：

- 请求是否成功；
- `_meta.input_coordinate_system` 是否为 `WGS84`；
- `_meta.source_map` 是否存在；
- 预期的具体字段（如 `administrative.country`、`administrative.admin1` 或 `natural`）是否包含真实值，而不是仅有空字段或 `null`。

| 场景 | 预期 | 实际 | 结论 |
|---|---|---|---|
| 上海城市 | 国家、省州、城市 | 中国、上海市、Huangpu | 通过 |
| 中太平洋 | 自然地貌 | 海洋、附近自然要素 | 通过 |
| 喜马拉雅 | 自然地貌 | 附近自然要素 | 通过 |
| 大堡礁 | 自然地貌 | 附近自然要素 | 通过 |
| 南极冰盖 | 自然地貌 | 附近自然要素 | 通过 |
| 撒哈拉沙漠 | 国家、省州、自然地貌 | 尼日尔、阿加德兹大区、自然地貌 | 通过 |
| 图瓦卢小岛 | 国家、省州、自然地貌 | 图瓦卢、图瓦卢、自然地貌 | 通过 |

本轮优化后的结果：传输成功率 **7/7**，元数据有效率 **7/7**，预期字段覆盖率 **7/7（100%）**。

2026-07-22 在未启动 MSFS 的环境中重新执行该测试，结果仍为传输成功率 **7/7**、元数据有效率 **7/7**、预期字段覆盖率 **7/7（100%）**。该测试使用直接坐标模式，因此不依赖 `msfsd.exe` 或运行中的模拟器；API Key 由已配置的环境变量提供，未被读取、打印或写入报告。

这是一组跨地貌的代表性回归样本，不等同于对地球每一个坐标的穷尽证明。任何新增数据集、查询策略或云端部署变更都必须重新执行该测试。

## 已修复的覆盖缺口

初始实现的 `administrative` 只取 GeoNames 的最近城市。远离城市的区域没有城市候选时会返回空值，即使该坐标实际位于某个国家或省州内；Natural Earth 导入也没有正确读取大写的 GeoJSON 属性名，导致国家名称退化成泛化值。

云端已完成以下优化：

1. 对 Natural Earth 国家与省州多边形执行 `ST_Covers`（包含边界）查询，返回 `administrative.country` 与 `administrative.admin1`；最近城市仍作为 `administrative.city` 的补充。
2. 对海岸和小岛使用最多 5 km 的最近行政区回退，不把远洋位置归属给行政区。
3. Natural Earth 导入改为大小写无关读取属性名，保留真实的国家/行政区名称。
4. `source_map.administrative` 在城市与行政多边形同时参与时返回 `mixed`，明确提示 Agent 不应将它们混为单一来源。

## 执行方式

```powershell
ctest --test-dir build -R geo_coverage_e2e_test --output-on-failure
```

成功或失败都会写入 `build/geo_coverage_report.json`。报告不包含 API Key，只记录坐标、覆盖判断与错误码。

## 可选 Provider 状态

2026-07-22 已在 Geo Cloud 部署 Nominatim `place` 补充适配器，但生产配置保持 `MSFS_GEO_NOMINATIM_ENABLED=false`。腾讯云主机直连公共 Nominatim 超时；关闭该 Provider 后，本记录中的 7 个现有 Geo Cloud 覆盖样本仍全部通过。适配器待配置可达的 HTTPS 端点或自托管实例后再启用。
