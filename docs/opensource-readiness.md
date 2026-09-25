# 开源准备清单

> 评估日期：2026-09-25
> 评估对象：`msfs-ai-voice-guide`（本地目录 `�� `github.com/QAyong/msfs-ai-voice-guide`）
> 结论：**代码本身已经具备开源质量**（362 个跟踪文件、30 份 Spec、10 份 ADR、70 个测试文件、pnpm 锁文件齐全、无明文密钥、无内网地址、`.env` 未被提交）。真正的阻断项全部在**法律资产**、**个人痕迹**和**一个已随安装包外流的服务器密钥**上，不在代码上。

## 0. 一句话判断

可以开源，但**不能直接 `git push --public`**。必须先解决四类问题：许可证缺失、个人资产已入库、第三方再分发权未确认、本机路径与邮箱痕迹。

---

## P0 — 阻断项（不处理不能公开）

### P0-1 项目没有任何许可证

现状：

- 仓库根目录无 `LICENSE`；`package.json:4` 是 `"private": true`，且**没有** `license` / `description` / `repository` / `author` / `engines` 字段。
- 法律上「无许可证 = 保留全部权利」，别人 fork、改、用都不算被授权。

动作：

1. 选一个许可证（见文末决策项 A）。
2. 根目录加 `LICENSE`，补 `package.json` 元数据：

```json
{
  "private": false,
  "license": "Apache-2.0",
  "description": "MSFS 2024 实时语音导游助手：LiveKit Agents + DeepSeek + 火山引擎语音 + 原生 SimConnect CLI",
  "repository": { "type": "git", "url": "https://github.com/QAyong/msfs-ai-voice-guide.git" },
  "engines": { "node": ">=24", "pnpm": ">=11" }
}
```

3. README 末尾加「许可证」章节。

### P0-2 商标与免责声明缺失

现状：`README.md:1`、`AGENT.md:1`、`electron-builder.yml:2`（`appId: com.msfs.ai.voice.guide`、`productName: 晓晓飞行导游`）大量使用 *Microsoft Flight Simulator* / MSFS 名称。已确认仓库内**没有** MSFS logo、Asobo 图形素材或第三方地景文件（全仓 grep 零命中），这是好事——纯文本指名使用符合「指示性合理使用」，但必须显式声明非官方。

动作：README 顶部 + `docs/` 首页加一段：

> 本项目是非官方第三方工具，与 Microsoft Corporation、Asobo Studio 无任何关联，未获其授权、赞助或背书。Microsoft Flight Simulator 是 Microsoft Corporation 的商标。本项目仅读取游戏公开的 SimConnect 接口。

另外建议把本地目录名里的错字「微软模模拟飞行AI导游助手」改掉（含微软商标且拼写有误），GitHub 仓库名 `msfs-ai-voice-guide` 本身是中性缩写，可保留。

### P0-3 个人资产已被 git 跟踪

| 文件 | 风险 | 是否进安装包 |
| --- | --- | --- |
| `desktop/renderer/src/assets/about/alipay-qr.jpg` | 真实支付宝收款码 | **是**（`main.tsx:132-133,633-634` import，Vite 打包进 `out/renderer`） |
| `desktop/renderer/src/assets/about/wechat-qr.png` | 真实微信收款码 | **是** |
| `feishu-auth-qr.png` / `-2` / `-3` / `feishu-auth-qrcode.png` / `lark-auth-qrcode.png` / `lark-config-qrcode.png` | 飞书/Lark 登录授权二维码 | 否（代码零引用） |
| `design-qa.md` | 15 处 `[local-user-path]/.codex/...` 本机路径 | 否 |
| `english-msfs-guide.xml`、`reddit-msfs-ai-guide.xml` | 含飞书文档链接、QQ 群号、赞赏码 | 否 |

动作（保留本地文件、只脱离版本控制）：

```powershell
git rm --cached design-qa.md english-msfs-guide.xml reddit-msfs-ai-guide.xml `
  feishu-auth-qr.png feishu-auth-qr-2.png feishu-auth-qr-3.png `
  feishu-auth-qrcode.png lark-auth-qrcode.png lark-config-qrcode.png
git commit -m "chore: 从版本控制移除本地草稿与授权二维码"
```

收款码要额外处理：**它不是脱离 git 就够的**，必须从 `desktop/renderer/src/assets/about/` 换掉或删除，并清掉历史（见 P0-4 的历史重写）。若确实想保留「支持作者」入口，改成公共捐赠渠道或不放图。

### P0-4 历史中的个人痕迹

1. **邮箱**：95 个 commit 使用 `131734913+QAyong@users.noreply.github.com`（另 1 个用 GitHub noreply）。邮箱一旦公开就永久可爬。
2. **本机绝对路径**散布在已跟踪文件中：
   - `docs/bugs/bug-20260827-runtime-resource-cause-validation.md:35,44,49,57,63,69,86,88` — `...`
   - `AGENT.md:63`、`docs/adr/adr-008-native-msfs-cli-agent-boundary.md:10,52,64`、`docs/architecture/volcengine-integration.md:9,116` — 暴露另一个私有项目 `[reference project]`
   - `design-qa.md:67-157` — `[local-user-path]/...`
   - 未跟踪但即将入库：`docs/msfs/autopilot/README.md` 等一批 `D:/code/...` 绝对链接

动作：

```powershell
# 1) 全局把绝对路径改成相对路径（先 dry-run 确认命中）
git grep -n "D:/code/\|D:\\\\code\\\\\|[local-user-path]

# 2) 重写历史邮箱（需要 git-filter-repo）
pip install git-filter-repo
git filter-repo --email-callback "return email.replace(b'131734913+QAyong@users.noreply.github.com', b'131734913+QAyong@users.noreply.github.com')" --force
```

> 若你不在意邮箱公开（它是你 GitHub 账号的公开联系邮箱），可以跳过重写——但要注意：**重写历史后必须 force push**，且所有克隆副本都会失效。**在决定公开之前做这件事的成本最低。**

---

## P1 — 工程卫生（公开后很快会被挑出来的问题）

### P1-1 仓库体积：本地 `.git` 有 572 MB

已核实（`git verify-pack` 全量解析 5826 个对象）：

| 类别 | 体积 | 说明 |
| --- | --- | --- |
| 可达 blob（1146 个） | 19.9 MB | 真正在版本历史里的内容 |
| dangling blob（2475 个） | 786.4 MB | **不在任何 commit 里**（`git add` 后 reset 的孤儿构建产物：electron.exe 225 MB、两个 NSIS 安装包 195/182 MB、livekit-server.exe 53.8 MB、dxcompiler.dll 25.6 MB） |
| `.git/objects/**/tmp_obj_*` 垃圾 | 159.7 MB | 中断写入残留 |
| 分支/标签 | 只有 `master` | 无实验分支需要清理 |

好消息：**不需要 `filter-repo` 就能瘦身**，因为这些大对象不可达。

```powershell
# 先备份 .git 目录到工作区外（例如 D:\backup）
git reflog expire --expire=now --all
git gc --prune=now
git count-objects -vH      # 复查：size-pack 应降到 ~20 MB
```

若 `tmp_obj_*` 仍残留，确认没有 git 进程占用后手动删除。这会让首次 `git clone` 从 500 MB 级降到 20 MB 级——直接影响别人愿不愿意试。

### P1-2 Geo Cloud：真实服务器密钥 + 服务器域名（⚠️ 实际优先级等同 P0）

**本轮已核实的事实链**（用密钥实体值而非变量名做全历史 `git log -S` pickaxe + 全工作区反查）：

| 事实 | 结论 |
| --- | --- |
| `native/msfs-cli/src/external/geo_context.cpp:96,161-162` | C++ 源码**只从环境变量读取**密钥，放在 `X-MSFS-Geo-Key` 请求头里，**无硬编码** |
| `scripts/stage-geo-config.mjs:8-31` | 构建时从 `.env` 或**构建环境变量**读取，写入 `out/msfs/geo-config.json`（真实 64 位 hex 密钥） |
| 密钥实际来源 | Windows **用户级环境变量** `MSFS_GEO_API_KEY`（64 字符）与 `MSFS_GEO_CLOUD_BASE_URL`；`.env` 里没有任何 `MSFS_GEO_*` |
| 密钥实体出现位置 | 仅 `out/msfs/geo-config.json:4` 与 `release-v2/artifacts/win-unpacked/resources/msfs/geo-config.json:4`（均未跟踪，被 `.gitignore:6,8` 覆盖） |
| `git log --all -S"<key>"` | **零命中**——该密钥从未进入任何 commit ✅ |
| `git log --all --diff-filter=A -- '*geo-config.json'` | 零命中 ✅ |

**两个真实风险都不在 git 里，而在「已经分发」和「即将分发」上**：

1. **密钥随安装包外流**。`release-v2/artifacts/win-unpacked/resources/msfs/geo-config.json` 就是安装包解包后的内容，而 `README.md:86` 说明你已经在给普通用户分发 `*-win-x64-setup.exe`。**只要发过一个，这个密钥已经在别人机器上了**；开源后若把安装包放到 GitHub Release，等于向全世界公开。
2. **服务器域名已进入被跟踪文件**，共 4 处：`native/msfs-cli/docs/adr/adr-003-external-geo-cloud.md:10`、`native/msfs-cli/docs/specs/spec-003-external-geo-context.md:36`、`native/msfs-cli/docs/testing/geo-cloud-coverage.md:5,13`。开源后 `https://geo.qayong.site` 即为公开信息，会直接面对扫描器与滥用流量。

**所以这一步的动作不是「清理仓库」，而是「轮换密钥」**：

- 在 Geo Cloud 服务端**作废当前密钥并换新**，新值只放在部署环境与本地构建环境里；
- 开源版把 `MSFS_GEO_BACKEND` 默认改为 `local`，cloud 模式要求用户自填 key（或服务端一并开源、改成用户态鉴权）；
- `scripts/stage-geo-config.mjs` 保留，但只在发布构建时注入；**不要**把带内置 key 的安装包发到公开 Release，并把这条写进文档。


#### Geo Cloud 到底承担什么（开源决策用）

**一句话：把「飞机坐标」翻译成「人话地理上下文」，是导游讲解里"现实世界常识"的唯一来源。**

它**不**提供飞行数据。飞机坐标、高度、地面海拔来自 SimConnect（`msfsd.exe` 本地读取）；Geo Cloud 只回答"这个坐标在现实世界是哪里、附近有什么"。

接口：`POST /v1/location-context`，请求体 `{lat, lon, alt_m, detail, locale}`，鉴权头 `X-MSFS-Geo-Key`；返回四类字段（`external-geo-module.md:46-54`）：

| 字段 | 内容 | 数据来源 |
| --- | --- | --- |
| `administrative` | 国家、省/州（admin1）、城市 | GeoNames（PostGIS） |
| `natural` | 所在海洋、附近山脉/湖泊/河流/海岸线/珊瑚礁/冰川/沙漠/半岛/岛屿 | Natural Earth 15 图层（PostGIS） |
| `game_poi` | 游戏内机场、直升机坪、聚落、地标 | MSFS POI 数据 |
| `place` | 街道、地址、地标补充（仅 `detail=full`） | Nominatim / OSM，带 1 req/s 限流与缓存 |

服务器内部还负责：鉴权、结果缓存、超时、Nominatim 软降级，以及 `_meta.source_map` 字段来源标记（让 Agent 能说清"这是 GeoNames 说的"而不是"SimConnect 说的"）。

**它为什么必须在服务器上**（ADR-003 的理由）：Natural Earth + GeoNames + OurAirports + MSFS POI 的完整数据集与空间索引，装进每个 CLI 发布包会显著增加体积和首次启动成本。**不是因为这些数据不能公开，而是因为体积与更新成本。** 其中 Natural Earth 属公有领域、GeoNames 是 CC-BY、OSM 是 ODbL，都可以自由再分发。

**它在链路中的位置（三条硬边界）**：

1. 飞机坐标来自 MSFS 原生接口，Geo Cloud 只能解释坐标，不能反过来提供或修正飞机位置（`external-geo-module.md:111`）。
2. 失败时只是"失去地理解释能力"，不影响原生飞行功能；`EXTERNAL_GEO_UNAVAILABLE` 可稍后重试。
3. **`MSFS_GEO_BACKEND` 目前硬性只接受 `cloud`**（`geo_context.cpp:168-171` 直接报错返回），所以"改成本地模式"必须改代码，不是切换配置项。

**它也是整个项目里唯一依赖你自己基础设施的部分**：其余外部依赖（DeepSeek、火山、博查）都是用户自备账号，与你无关。开源时只有三条路：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| A. 服务端闭源 | 开源版不带内置 key，用户需自填；你负责发 key | 你要运维、要防滥用，且得设计发 key 流程 |
| B. 服务端一并开源（推荐） | 把 PostGIS + 数据导入脚本作为独立仓库或 `server/` 目录开源，社区自建；你的线上实例只服务你自己发布的包 | 一次性整理成本 |
| C. 砍掉 cloud 模式 | 开源版只保留 SimConnect 原生信息 + `searchWeb` | 导游体验明显下降（说不出"飞越阿尔卑斯山"），但零运维 |
### P1-3 `.gitignore` 补漏（已在本轮完成）

本轮已追加：`.blocker-journal/`、`blocker-journal-cn-updated/`（含 zip）、6 个飞书/Lark 二维码、两个 xml 草稿、`design-qa.md`。这些文件之前**不在忽略列表里**，一次 `git add -A` 就会入库。

本项目已有 `/release*/`、`resources/msfs/`、`resources/livekit/`、`out/`、`dev-runtime/`、`.env`、`.ua/`，这部分是好的。

### P1-4 打包会剔除第三方许可证文本

`electron-builder.yml:19-21` 有 `!node_modules/**/*.md`，会把以 `.md` 形式分发的许可证一起剔掉（例如采用 `LICENSE.md` 的包）。动作：在 `files` 中显式放行：

```yaml
- '!node_modules/**/*.md'
- 'node_modules/**/LICENSE*'
- 'node_modules/**/NOTICE*'
```

### P1-5 第三方再分发权：三个需要确认的资产

| 资产 | 现状 | 判断 |
| --- | --- | --- |
| `SimConnect.dll`（85,504 B，来自 `%MSFS2024_SDK%/SimConnect SDK/lib/`） | 随安装包分发（`CMakeLists.txt:27-28,56-62` 复制）；**未跟踪进仓库** | MSFS SDK EULA 对再分发权的表述需要你自己确认。项目文档已标注过这点（`docs/architecture/msfs-cli-release-integration.md:27,219`）。若不许可，改为安装时从用户本地 SDK 复制 |
| `msfs-route-bridge.wasm` | 用官方 WASM 工具链构建（`PlatformToolset=MSFS2024`） | 同上，受 SDK EULA 约束 |
| `resources/tts/confirmed-voices/*.wav`（6 个，约 3 MB，**已跟踪**） | 用你自己账号合成、属火山引擎音色的样本音频 | 音色是字节的资产。建议改为「首次运行时由用户自己的账号合成」或直接从仓库移除 |
| LiveKit 依赖 | `@livekit/agents` 等全为 Apache-2.0 | ✅ 无问题 |
| `@livekit/local-inference` 0.2.6 | 许可证字段是 `Apache-2.0 AND LicenseRef-LiveKit-Model`，含模型权重条款；68.7 MB 平台二进制进包 | 需复核该自定义条款是否允许随包分发 |
| `msfs.exe` / `msfsd.exe` | 自研，`native/msfs-cli` 无 vendored 三方源码、CMake 无 FetchContent | ✅ 无问题 |

结论：**全仓无 GPL/AGPL**，没有传染性许可风险。

### P1-6 无 CI、无社区文件

不存在 `.github/`。建议首发时一起加：

- `.github/workflows/verify.yml`：`windows-latest` + Node 24 + pnpm 11，跑 `pnpm lint`、`pnpm typecheck`、`pnpm desktop:typecheck`、`pnpm test`、`pnpm format:check`。**不要**把原生构建（需要 MSFS SDK）放进 CI。
- `CONTRIBUTING.md`：最少说明 pnpm 11 + `nodeLinker: hoisted`、`pnpm verify`、以及「不要提交 `.env`」。
- `SECURITY.md`：凭据泄露的私下报告渠道（你的现有邮箱或 QQ 群）。
- Issue 模板：Bug / Feature 两个即可。

---

## P2 — 首发体验

1. **README 重构**。现在 168 行、以「当前已完成……」的开发日志语气写成，适合作者不适合访客。建议首屏顺序：一句话简介 → 截图/GIF（应用是悬浮小球 + 语音对话，视觉冲击力是最大卖点，目前一张图都没有）→ 功能列表 → 5 分钟快速开始 → 依赖的账号与 Key（DeepSeek / 火山引擎 / LiveKit）→ 架构图 → 文档索引 → 非官方声明 → 许可证。把现有的细节内容下沉到 `docs/`。
2. **`docs/msfs/` 是否入库**。55 个文件 / 6.7 MB，由 `scripts/collect-msfs-official-aircraft.ts` 等脚本从本机官方飞机包提取（含 `Asobo PassiveAircraft *` 机型配置）。这是官方游戏数据，入库有版权风险，且体积不小。建议：不入库，保留脚本让贡献者自行生成。若坚持入库，先确认这部分数据的再分发范围。
3. **首发版本与 tag**。本地领先远端 9 个 commit、22 项未跟踪、9 个已修改文件。建议先把当前工作收尾成一个干净状态，再打 `v1.0.1` tag，附一份 CHANGELOG（`docs/releases/` 已有 rc 系列说明可复用）。
4. **语言策略**。README 只有中文。MSFS 社区以英文为主，建议至少加英文 README（或 `README.en.md`），否则曝光面会小一个量级。

---

## 需要你决策的事

| 编号 | 决策 | 选项 | 影响 |
| --- | --- | --- | --- |
| A | 许可证 | **已定（2026-09-25）：Apache-2.0**（备选 MIT / AGPL-3.0） | 决定别人能用它做什么 |
| B | 收款码 | **已定（2026-09-25）：保留不动**——我不建议这样：它是永久有效的真实支付信息，且会进安装包，解包即可见 | 保留 = 真实收款码永久公开 |
| C | 历史重写 | **待定**，分析见下节 | 公开后重写成本高得多 |
| D | Geo Cloud | 开源版改本地模式 / 服务端一并开源 / 明确接受 key 可被提取 | 影响服务端成本与滥用风险 |
| E | TTS 音色样本 | 从仓库移除，改运行时合成 / 保留并标注来源 | 版权与仓库体积 |
| F | `docs/msfs/` 官方机型数据 | 不入库（推荐） / 入库 | 版权与 6.7 MB 体积 |

## 历史重写是否有必要？（决策项 C 的分析）

结论：**只有支付宝/微信收款码这一项值得处理，而且不用重写历史——从 HEAD 移除即可。**

判断依据：`git filter-repo` 的代价是**所有 commit hash 变化 + 必须 force push + 所有现有克隆失效**。只有存在「不可逆的真实损失」才划算。

| 痕迹 | 实际暴露什么 | 是否值得为此重写历史 |
| --- | --- | --- |
| `131734913+QAyong@users.noreply.github.com` × 95 commit | 一个邮箱地址。你的 GitHub 用户名就是 `QAyong`，关于页、QQ 群、公开教程链接本来就在主动散发联系方式 | ❌ 不值得。收益接近零，代价是全部 hash 变化 |
| 6 个飞书/Lark 授权二维码 | 已失效的授权二维码，代码零引用、不进安装包 | ❌ 历史里那几份价值极低；先做 `git rm --cached` 从 HEAD 移除 |
| `[reference project]`（`AGENT.md:63`、`adr-008`、`volcengine-integration.md`） | 暴露另一个私有项目的名字，不暴露其代码 | ❌ 改当前文件的文本即可，历史不必动 |
| `[local-user-path]/...`（`design-qa.md`） | 本机用户名 + `.codex` 内部目录结构 | ❌ 从 HEAD 移除该文件即可 |
| **支付宝/微信收款码**（`desktop/renderer/src/assets/about/`） | 真实、长期有效的支付信息，且随安装包分发 | ⚠️ 值得处理，但方式是**改代码 + 换图**，而不是重写历史 |

两个例外情况，出现任何一个才建议一次性重写，**且必须在公开之前做**：

1. 这个仓库以后要承接商业身份（简历、公司背书、付费支持）——干净的作者身份有价值。
2. 你特别介意 `[reference project]` 这个名字出现在公开仓库。

仓库一旦公开，GitHub 仍可能通过 API 长期保留旧 commit，届时需要联系 GitHub Support 才能清理。所以：**要么现在做，要么就当它不存在。**

## 建议执行顺序

1. 决策 A/B/C/D → 处理 P0-1 ~ P0-4（许可证、非官方声明、移除个人资产、重写历史）
2. `git gc` 瘦身（P1-1）→ 肉眼可感的 clone 速度提升
3. 补 `.github/`、`CONTRIBUTING.md`、`SECURITY.md`（P1-6）
4. 处理 P1-2、P1-4、P1-5 的资产与打包配置
5. 重写 README 首屏 + 英文版（P2-1、P2-4）
6. 收尾工作树 → 打 tag → 公开仓库

7. （若决定重写历史）`git filter-repo` + force push —— 放在打 tag 之前、公开之前
