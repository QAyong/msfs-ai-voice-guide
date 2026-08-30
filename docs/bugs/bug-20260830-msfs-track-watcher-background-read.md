# Bug-20260830：轨迹 watcher 被无条件启动并产生后台读取

**状态：** 待处理

**发现日期：** 2026-08-30

## 用户现象

用户反馈：打开助手后先显示“游戏已连接”，很快变为“未连接到游戏”。当 MobiFlight 和 Volanta 同时运行时更容易出现；关闭这两个插件后，暂时没有观察到相同现象。

## 当前确认的代码行为

应用中存在一个 `getTrackHistory` 工具，用于回答“刚才飞过哪里”，返回本次 Agent 会话内维护的飞行轨迹。

这个功能被实现为三个持续 watcher，分别读取：

- `PLANE LATITUDE`：纬度；
- `PLANE LONGITUDE`：经度；
- `PLANE ALTITUDE`：高度。

三个 watcher 不是三个业务功能，也不是三个独立的 SimConnect 客户端，而是同一个轨迹记录功能的三个底层读取循环。每个 watcher 都使用 `--count 0`，表示持续读取。

相关实现：

- [`src/msfs/guide-service.ts`](../../src/msfs/guide-service.ts)：轨迹 watcher、轨迹缓存和轨迹点采集；
- [`src/agent/guide-agent.ts`](../../src/agent/guide-agent.ts)：Agent 预热时启动 MSFS 服务；
- [`src/tools/msfs-guide.ts`](../../src/tools/msfs-guide.ts)：注册 `getTrackHistory` 工具；
- [`docs/specs/spec-008-native-msfs-cli-guide-tools.md`](../specs/spec-008-native-msfs-cli-guide-tools.md)：轨迹工具的原始设计。

## 设计初衷

设计文档中，轨迹工具的唯一明确用途是：用户询问“我刚才飞过哪里”时，返回本次会话内有限长度的轨迹摘要。

之所以需要后台低频记录，是因为用户提问时才开始读取已经太晚，只能得到当前点，无法还原此前经过的路线。因此原设计允许在当前 Agent 会话内低频维护一个有上限的内存缓存，并在会话结束时清理。

这个功能不是以下功能的必要组成部分：

- 游戏连接检测；
- 普通 AI 对话；
- 当前飞机位置查询；
- 探索当前位置和附近 POI。

## 目前的问题

设计上，轨迹记录应当是可选的附加能力；但当前实现中：

1. AI 服务预热成功后会调用 `ensureTrackWatch()`；
2. `getFlightSnapshot()` 也会触发 `ensureTrackWatch()`；
3. 这些路径不检查用户是否实际使用或启用了 `getTrackHistory`；
4. 设置页关闭 `getTrackHistory` 时，只是不再把工具注册给 Agent，不能保证后台 watcher 停止。

因此，一个低频、低使用率的附加功能变成了 AI 会话期间的常驻数据读取。

## 对当前断连问题的判断

后台轨迹 watcher 是当前断连问题的高概率诱因或放大器：它会额外增加 MSFS 数据读取请求；在 MobiFlight、Volanta 同时运行时，整体 SimConnect 活动量进一步增加，可能提高排队、超时或连接状态误判的概率。

目前还不能仅凭静态代码证明它是唯一根因。三个 watcher 共享 AI daemon 的 SimConnect 客户端，并不是直接各自抢占三个连接通道；连接检测使用的是 monitor 客户端。因此仍需通过关闭 watcher 后的对照测试完成最终确认。

## 待处理方案

### 方案 A：删除该功能（推荐，若产品不需要历史轨迹）

- 移除 `getTrackHistory` 工具；
- 移除轨迹缓存和三个后台 watcher；
- 保留连接检测、当前飞行快照、位置上下文和探索功能。

### 方案 B：保留但改为明确可选

- 新增“记录本次飞行轨迹”开关；
- 只有开关开启时才启动 watcher；
- 不在 `warmup()` 或普通 `getFlightSnapshot()` 中隐式启动；
- 关闭开关或会话结束时可靠停止全部 watcher。

### 若继续使用后台记录

- 将经纬度和高度合并为一次批量读取，避免三个独立轮询循环；
- 修复 watcher 部分启动失败后的句柄丢失；
- 修复 watcher 自然退出后仍保留旧句柄、导致无法恢复的问题；
- 验证缓存上限、停止清理和重复启动路径。

## 验证标准

在同时开启 MobiFlight 和 Volanta 的条件下，对比以下两组结果：

1. 保留当前代码，记录连接状态和断开时间；
2. 确认后台轨迹 watcher 完全不启动，重复相同飞行流程。

如果第二组不再出现“已连接后很快变为未连接”，则可确认轨迹 watcher 是本次问题的重要成因；如果仍然断开，则继续排查 monitor/AI daemon 生命周期、SimConnect 请求超时和外部插件兼容性。
