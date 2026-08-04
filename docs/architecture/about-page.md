# 关于页

## 功能范围

设置中心提供“通用”“服务配置”“关于”三个一级页面。“关于”页是只读页面：切换到该页不会创建偏好草稿、显示保存按钮或触发导游服务重连。

页面展示产品名、由 Electron 主进程 `app.getVersion()` 提供的软件版本，以及可选的公开外链。当前没有配置教程或推广外链，因此对应区块不会渲染空入口。

## 赞赏资源

赞赏资源随桌面应用本地打包，不从网页加载，也不携带可执行链接：

| 渠道   | 资源                                              |
| ------ | ------------------------------------------------- |
| 微信   | `desktop/renderer/src/assets/about/wechat-qr.png` |
| 支付宝 | `desktop/renderer/src/assets/about/alipay-qr.jpg` |

二维码以 `object-fit: contain` 等比显示，保留完整码区，避免裁切或拉伸影响扫码。宽窗口中两个渠道并列；内容区变窄时，布局自动切换为单列并提高单张图片的显示上限。

## 公开 IPC 契约

`shared/about-info.ts` 定义版本化的公开 DTO。主进程只向可信的设置 Utility Window 暴露 `about:get-info`；`about:open-link` 仅接收受控 `id`，主进程从静态白名单查找链接、再次校验 HTTPS 后才调用系统浏览器。

```ts
type AboutSupportChannel = {
  id: 'wechat' | 'alipay';
  label: string;
  qrAsset: 'wechat-qr' | 'alipay-qr';
};

type AboutInfo = {
  schemaVersion: 1;
  productName: string;
  version: string;
  supportChannels: readonly AboutSupportChannel[];
  links: readonly AboutLink[];
};
```

该契约只包含公开展示信息，不能包含偏好、服务配置、凭据、远程配置或统计标识。
