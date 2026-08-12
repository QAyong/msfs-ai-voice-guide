# Bug-20260812：Electron 全局 PTT native 模块异常退出

**发现日期：** 2026-08-12
**状态：** 已修复 native 生命周期问题，已完成构建与启停冒烟；待桌面端长时间运行验收
**影响范围：** Electron 主进程、全局键盘/鼠标侧键 Push-to-Talk

## 症状

Windows 弹出：

> electron.exe - 应用程序错误
> 应用程序发生异常 unknown software exception (0x80000003)

`0x80000003` 是 Windows 的断点/断言类异常，表示进程执行到了 native 代码中的异常断点；它不是普通的 JavaScript 异常，所以无法依靠 renderer 层的 `try/catch` 兜底。

## 证据

截图中的异常码与历史事件不完全相同，但本机“应用程序错误”事件记录显示，Electron 过去两次是被同一个全局 PTT native 模块击中的：

- 2026-08-04 13:34:38：`electron.exe`，故障模块 `global_push_to_talk.node`，异常 `0xc0000409`。
- 2026-08-05 20:47:37：同一模块、同一异常和同一偏移重复出现。
- 故障模块路径为项目的 `native/global-ptt/build/Release/global_push_to_talk.node`。

因此当前结论是：截图的 0x80000003 不能仅凭截图证明一定来自 PTT，但 `global_push_to_talk.node` 是已有本机崩溃证据支持的最高优先级嫌疑点。

## 根因

原实现有几个 native 生命周期风险叠加：

1. 全局 hook 线程通过 N-API ThreadSafeFunction 向 Electron 主线程投递事件，但没有注册 `napi_add_env_cleanup_hook`。Electron/Node 环境开始退出后，hook 线程仍可能尝试投递事件。
2. `napi_call_threadsafe_function`、`napi_get_global`、`napi_create_object` 等调用结果没有检查。环境正在关闭时，继续使用无效的 N-API handle 可能把问题升级成 native 崩溃。
3. hook 回调线程与配置/停止线程共享普通的 `bool`、按键和鼠标配置，存在数据竞争。
4. 停止逻辑读取线程 ID 时没有等待 hook 线程完成消息队列初始化，快速启停可能出现停止请求丢失。

这与官方约束一致：N-API ThreadSafeFunction 在环境关闭后会进入 `napi_closing` 状态，addon 必须停止继续投递；低级键盘/鼠标 hook 也要求回调线程保持快速、可控并及时退出。

## 修复

修改 [`native/global-ptt/src/global_push_to_talk.cc`](../../native/global-ptt/src/global_push_to_talk.cc)：

- 注册 N-API environment cleanup hook，在 Electron 环境销毁前先停止并 join 全局 hook 线程。
- hook 线程退出前停止发送事件，再用 `napi_tsfn_abort` 终止 ThreadSafeFunction。
- 检查 N-API 返回状态；遇到 `napi_closing` 时停止继续消费 hook 事件并退出线程。
- 对事件对象、JS global/object/type 创建过程做失败保护。
- 将 hook 状态、按键配置、鼠标配置和 held 状态改为原子变量。
- 增加线程 ID 就绪同步，确保停止请求能够投递到已创建消息队列的线程。
- 非匹配的键盘/鼠标事件使用空 hook handle 调用 `CallNextHookEx`，不再依赖可能已失效的全局 hook handle。

## 验证

- `pnpm native:build`：通过，生成 `native/global-ptt/build/Release/global_push_to_talk.node`。
- 直接加载生成的 native 模块，执行 100 次 `start('Space', callback)` / `stop()`：通过。
- 使用项目原有参数对修改后的 C++ 源文件进行编译检查：通过。
- 没有执行 `desktop:package`、`electron-builder` 或安装包构建。

## 桌面端验收

仍建议在开发态做一次人工回归：

1. `pnpm desktop:dev` 启动应用。
2. 开启全局 PTT，反复切换语音模式、关闭窗口、重新打开窗口，至少 20 次。
3. 退出应用再启动，确认 Windows 事件查看器的 Application 日志没有新增 `electron.exe` / `global_push_to_talk.node` 错误。
4. 在 PTT 关闭状态下重复上述操作，确认应用仍能正常退出。

## 参考

- [Microsoft：Specific Exceptions（STATUS_BREAKPOINT / 0x80000003）](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/specific-exceptions)
- [Node.js：N-API Thread-safe functions 与环境清理](https://nodejs.org/api/n-api.html)
- [Microsoft：LowLevelKeyboardProc 生命周期约束](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc)
