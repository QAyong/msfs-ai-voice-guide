# Feature-015：探索内容 Provider 技术 Spike

**日期：** 2026-07-30<br />
**状态：** 已执行，代码已接入；人工未验收。非官方发现路径在目标网络中需要限流与降级。

## 结论

- `youtubei.js` 17.2.0 能完成“Eiffel Tower Paris travel guide”搜索，并返回真实 YouTube 标题与 `https://www.youtube.com/watch?v=…` URL；最终 Spike 耗时约 2.8 秒。`pnpm desktop:build` 已通过，主进程 bundle 包含该依赖。
- TikTok oEmbed 是官方的 URL 到标题、作者与缩略图元数据增强接口；实现仅在 Discovery 已发现真实 `/video/<id>` URL 后调用，不产生或猜测 URL。
- `duck-duck-scrape` 2.2.7 能提供带 TypeScript 声明的免费网页发现能力，但在本次目标网络的串行试验中仍返回“请求异常/过快”错误，TikTok 发现因此降级为空结果。它不能作为无失败保证的服务。
- 百度百科与抖音百科改用固定站内搜索页 Provider：前者构造 `/search/word?pic=1&sug=1&word=<query>`，后者构造 `/search?keyword=<query>&activeTab=DOC_TAB`。实现不从后台请求或解析搜索/词条页面；抖音百科的“荆州”搜索 URL 已在目标网络返回 HTTP 200。具体词条由用户在应用内来源窗口的站内搜索结果中选择。
- 抖音视频改用固定精选搜索页 Provider：构造 `/jingxuan/search/<query>?type=general`，不保留页面附带的 `aid` 参数。纯后端“长沙”请求在目标网络返回 HTTP 200 和 HTML；实现不解析视频列表、Cookie 或签名。
- Wikimedia REST Search 在首次受限网络请求中返回 HTTP 429；增加描述性 User-Agent、每进程请求节流与安全的缩略图 URL 规范化后，最终 Spike 成功返回“艾菲爾鐵塔”卡片，耗时约 0.8 秒。调用方继续采用部分失败，不让百科失败阻塞主题和视频。

## 实施守卫

1. `DuckDuckGoDiscoveryProvider` 以 1.5 秒最小间隔串行化请求，并缓存 5 分钟；每个 Provider 都有域名 allowlist。
2. `WikipediaProvider` 以 1 秒最小间隔调用公开 REST API；429/网络错误向上游报告为 Provider 暂不可用。
3. `VideoService` 并行不同平台，但单个平台内部和底层 Discovery 保持节流；一个失败不影响其他平台。
4. 抖音与国内百科不使用账号、Cookie、验证码绕过、签名逆向或付费搜索 API；百科主题 URL 仅由固定模板和域名 allowlist 构造，第三方页面只在应用内隔离来源窗口中打开。

## 复现

```powershell
pnpm explore:spike
```

该命令只查询公开页面，输出 Provider 名称、耗时、标题与 URL，不读取本地密钥、Cookie 或 MSFS 数据。它是显式网络 Spike，不属于默认 Vitest 测试集。
