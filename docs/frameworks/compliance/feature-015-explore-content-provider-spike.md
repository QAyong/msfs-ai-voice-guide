# Feature-015：探索内容 Provider 技术 Spike

**日期：** 2026-07-30<br />
**最后更新：** 2026-08-01<br />
**状态：** 已执行并完成验收（2026-08-11）。非官方发现路径的限流与降级已完成验证。

## 结论

- YouTube 不再使用 `youtubei.js`、YouTube Data API 或后端网页搜索服务发现内容，而是构造 `https://www.youtube.com/results?search_query=...` 公开搜索页。探索只展示搜索页卡片，由用户在隔离来源窗口中选择视频。
- 哔哩哔哩使用固定站内搜索页 Provider，构造 `https://search.bilibili.com/all?keyword=<query>`，不解析私有接口、Cookie、签名或视频详情。它是中文环境默认视频来源。
- 百度百科使用固定站内搜索页 Provider，并通过规范化 URL 去重避免多个主题返回同一页面。
- Wikimedia REST Search 在受限网络下可能返回 HTTP 429；调用方保留 Provider 部分失败语义，不让百科失败阻塞主题、视频和接续问题。
- 抖音百科、抖音视频和 TikTok 当前已从产品设置和活动 Provider 范围中移除，不在本版 Spike 的“已支持平台”结论中。

## 实施守卫

1. Wikipedia 和百度百科 Provider 把网络失败转换为 Provider 部分失败或安全搜索页降级；YouTube 和哔哩哔哩只生成各自白名单内的 HTTPS 搜索页，不把模型输出当作真实 URL。
2. `VideoService` 并行不同平台；一个平台失败不影响另一个平台、百科或接续问题。
3. YouTube 只接受 `www.youtube.com` 上的 HTTPS 搜索页 URL；不抓取视频列表，也不生成或猜测视频详情 URL。
4. 国内百科和哔哩哔哩不使用账号、Cookie、验证码绕过或签名逆向；第三方页面只在应用内隔离来源窗口中打开。

## 复现

```powershell
pnpm explore:spike
```

该命令只查询公开页面，输出 Provider 名称、耗时、标题与 URL，不读取 Cookie、搜索 API Key 或 MSFS 数据。它是显式网络 Spike，不属于默认 Vitest 测试集。当前代码、桌面构建、自动化测试、真实 Electron 来源窗口和目标网络人工验收均已完成。
