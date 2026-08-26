# Bug-20260826：发布快照陈旧与自动驾驶能力提示失真

**发现日期：** 2026-08-26
**状态：** 发布问题已修复；FD/FLC 能力误判补丁已完成源码验证，待下一版打包
**影响范围：** MSFS CLI 发布物、安装态自动驾驶写入、AI 对机型能力的解释

这次对话确认了两个相互关联但根因不同的问题。以后排查时必须先区分“安装包携带的原生运行时是否正确”和“当前飞机是否真的支持请求的自动驾驶能力”，不能把两者都归结为普通的写入失败。

## 问题 A：安装版读取正常，但写入使用了过期的 CLI

### 症状

- 开发版测试正常，安装版用户可以读取自动驾驶状态，但设置 AP、FD 或其他模式后状态没有变化。
- `1.0.1-rc.6` 的表现与当前源码修复不一致，容易误判为安装器、权限或 SimConnect 连接问题。

### 根因

1. `desktop:build:release` 之前只构建 Global PTT；它不会编译 `native/msfs-cli`，而是直接复制 `MSFS_CLI_DISTRIBUTION_DIR` 指向的外部快照。
2. 原来的 `native:build` 名称容易让人以为它会构建 MSFS CLI，AI 和打包维护者因此遗漏了真正的 `msfs:native:build` 步骤。
3. 旧的 `release-inputs/msfs-cli-official-20260809` 没有源码提交、源码指纹和原生二进制哈希门禁。即使当前源码已经修复，打包仍可能悄悄带入旧的 `msfs.exe`、`msfsd.exe`、`SimConnect.dll` 和 Bridge。
4. 仅检查目录名、`manifest.json` 或文件是否存在，无法证明安装包使用的是本次源码构建的完整发布物。

### 修复

- 新增 `scripts/msfs-cli-build-metadata.mjs`，生成并校验 schema v2 的 `build-metadata.json`，记录源码提交、源码指纹、构建输入文件数以及 CLI、daemon、SimConnect 和 Bridge 的 SHA-256。
- `scripts/stage-msfs-cli.mjs`、`scripts/validate-release-inputs.mjs` 和 `scripts/validate-packaged-runtime-dependencies.mjs` 在发布模式下强制校验构建清单、源码一致性和二进制哈希；缺少清单或使用旧快照必须失败。
- 新增 `pnpm msfs:release:snapshot <目录>`，从一次经过验证的原生构建生成不可混用的发布快照，禁止手工拼装或覆盖既有快照。
- 将脚本名称明确分为 `global-ptt:build` 与 `msfs:native:build`，并让开发态自动刷新开发快照，避免把开发构建和发布快照混用。
- 发布版本统一更新为 `1.0.1-rc.7`，重新生成了 `release-inputs/msfs-cli-20260826-rc7`。

### 防复发规则

修改 `native/msfs-cli` 的 C++、SimConnect 或 Bridge 后，候选发布必须按以下顺序执行：

```powershell
pnpm msfs:native:build
pnpm msfs:release:snapshot release-inputs/<build-id>
$env:MSFS_CLI_DISTRIBUTION_DIR = 'D:\release-inputs\<build-id>'
pnpm desktop:package
```

发布前不得使用以下目录作为候选安装包输入：

- `dev-runtime/msfs-cli/`
- `native/msfs-cli/build/`
- 上一次安装器解压出来的资源
- 未带 `build-metadata.json` 的外部目录

如果发布脚本发现构建输入脏、源码提交或指纹不匹配、文件数量不匹配、任意二进制哈希变化，必须停止打包，而不是自动回退到旧版本。

## 问题 B：飞机不支持 FD/某个 AP 模式时，AI 误报为“功能失效”

### 症状

- 某些飞机没有飞行指引，或只实现了部分自动驾驶模式，但 AI 回复类似“飞行指引不起作用”。
- 这会把“飞机没有该能力”误导成“程序写入失败”，也可能诱导 AI 重试同一个不支持的事件。

### 根因

1. `AUTOPILOT AVAILABLE` 只能说明飞机是否提供自动驾驶能力，不能证明 FD、FLC、NAV、VS 等每个具体功能都存在或可用。
2. 发送 Input Event 成功只代表事件被接受，不能代表目标状态发生了变化；事件确认和状态读回必须分开判断。
3. 之前的失败消息没有携带具体能力语义，AI 无法区分“未提供/未确认支持”和“支持但执行失败”。
4. MSFS 官方文档也说明自动驾驶 SimVar/事件的适用范围依机型而异，不能把一架飞机的事件行为推广给所有飞机。参考：[Aircraft Autopilot Assistant Variables](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/SimVars/Aircraft_SimVars/Aircraft_AutopilotAssistant_Variables.htm)、[Aircraft Autopilot Flight Assist Events](https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/Key_Events/Aircraft_Autopilot_Flight_Assist_Events.htm)。

### 修复

- 在 `setAutopilot` 的每个写动作上标记对应能力：AP、FD、HDG、NAV、ALT、VS、FLC。
- AP 可用但 FD/FLC 当前关闭时，能力返回 `unknown`，不再把 `AUTOPILOT AVAILABLE=1` 当作具体模式支持证据。
- 如果事件发送失败，或事件被接受但状态读回没有变化，返回“目前无法确认该功能”的结果，并停止后续设置；只有明确证实不具备自动驾驶时才返回 `unsupported`。
- 已确认的 FD/FLC 能力按飞机标题和注册号暂存；换飞机时清除，避免 Optica、C208B 和 737 之间互相继承能力结论。
- 工具描述明确要求 AI 只有在状态为 `supported` 时才能说“支持”；`unknown` 必须说“目前无法确认”，不得称为通用写入故障，也不得盲目重试。
- 增加 FD、FLC 初始未知、状态不变和换飞机清除缓存的回归测试。

### 当前补丁的边界

本次是现有设计上的最小补丁：它根据当前请求和实际状态读回结果区分 `supported`、`unsupported` 与 `unknown`，并只在当前飞机会话内保留经过验证的能力结论；不新增完整的机型能力数据库，也不把一次失败永久写入飞机档案。后续若要提高覆盖率，应按机型补充经过实机验证的能力资料；在资料缺失或与运行时不一致时，必须保持 `unknown`，按不可执行处理。

## 验证记录

- 原生 CLI 测试：`ctest` 6/6 通过。
- 自动驾驶、工具 schema 和 Agent 工具组合测试：21/21 通过。
- `pnpm desktop:typecheck` 通过。
- `pnpm lint` 通过。
- 本次能力判定补丁尚未重新生成安装包；`1.0.1-rc.7` 仍只包含上一版的发布快照门禁和失败后提示修复。
- `pnpm desktop:package` 通过，最终候选安装包为 `1.0.1-rc.7`，SHA-256：`0c28636d1b45d8ac54a697ec4b50568104bf7d2c4a241506502cc2d7e19c2833`。
- 安装包运行时校验通过：116 个 loose files、13 个原生依赖文件；发布输入、应用资源和安装包中的 CLI/daemon/SimConnect/Bridge 哈希一致。

## 复盘结论

以后遇到“开发版正常、安装版异常”，第一步必须核对安装包中的 `build-metadata.json` 和 `component-manifest.json`，确认它们来自当前原生源码构建；遇到“某个自动驾驶功能不起作用”，第一步必须读取具体能力和实际状态，向用户明确说明“飞机不支持/尚未确认”还是“支持但执行失败”。这两条判断不能省略，也不能由 AI 根据泛化经验猜测。
