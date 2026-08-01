# Feature-015：探索内容 Provider 技术 Spike

**日期：** 2026-07-30<br />
**最后更新：** 2026-08-01<br />
**状态：** 已执行，代码已接入；人工未验收。非官方发现路径在目标网络中需要限流与降级。

## 结论

- YouTube 不再使用 `youtubei.js` 或直接打开 YouTube 首页/视频页来发现内容，而是复用现有网页搜索服务并限制 `site=youtube.com`。识别到真实视频 URL 时展示规范化视频页；没有可验证视频 URL 时降级到 `https://www.youtube.com/results?search_query=...` 搜索页，避免把登录/机器人识别当作探索主路径。
- 哔哩哔哩使用固定站内搜索页 Provider，构造 `https://search.bilibili.com/all?keyword=<query>`，不解析私有接口、Cookie、签名或视频详情。它是中文环境默认视频来源。
- 百度百科使用固定站内搜索页 Provider；360 百科先请求 `https://baike.so.com/search/?q=<query>`，从公开 HTML 匹配与查询相符的 `/doc/<id>-<id>.html` 页面，无法确认时保留搜索页作为降级入口。
- 360 百科的直接词条解析和规范化 URL 去重已接入；当多个 AI 主题映射到同一页面时，服务会尝试备用查询且不会用重复页面填充结果。
- Wikimedia REST Search 在受限网络下可能返回 HTTP 429；调用方保留 Provider 部分失败语义，不让百科失败阻塞主题、视频和接续问题。
- 抖音百科、抖音视频和 TikTok 当前已从产品设置和活动 Provider 范围中移除，不在本版 Spike 的“已支持平台”结论中。

## 实施守卫

1. `WikipediaProvider`、360 百科解析器和 YouTube 网页搜索均把网络失败转换为 Provider 部分失败或安全搜索页降级；不把模型输出当作真实 URL。
2. `VideoService` 并行不同平台；一个平台失败不影响另一个平台、百科或接续问题。
3. YouTube 结果只接受允许域名上的 HTTPS 视频 URL，并按视频 ID 去重；不能识别真实视频时只返回 YouTube 搜索页。
4. 国内百科和哔哩哔哩不使用账号、Cookie、验证码绕过或签名逆向；百科直达页面只接受 `baike.so.com/doc/` 等允许路径，第三方页面只在应用内隔离来源窗口中打开。

## 复现

```powershell
pnpm explore:spike
```

该命令只查询公开页面，输出 Provider 名称、耗时、标题与 URL，不读取 Cookie 或 MSFS 数据；YouTube 探针需要配置的网页搜索 Key。它是显式网络 Spike，不属于默认 Vitest 测试集。当前代码、桌面构建和自动化测试已完成，但真实 Electron 来源窗口和目标网络仍需人工验收。
