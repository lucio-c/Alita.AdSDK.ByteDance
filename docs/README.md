# 巨量引擎 Marketing API SDK

这个 SDK 给广告投放平台调用巨量引擎开放平台用。当前对齐官方 Go SDK [v1.1.97](https://github.com/oceanengine/ad_open_sdk_go/tree/v1.1.97)，覆盖其中的 Marketing API，包含巨量千川、巨量广告以及账户、素材、报表、资金、OAuth 等接口。业务程序引用 `Alita.AdSDK.ByteDance.OceanEngine`，通过依赖注入拿到强类型客户端，按 URL 路径调用接口。

## 解决什么问题

巨量接口数量多，查询参数里的对象和数组要整段放进 JSON 字符串，成功响应的 HTTP 状态码也经常是 200，真正的成败看返回体里的 `code`。SDK 把这些约定收进客户端：

- 按接口路径生成调用方法和请求、响应模型。
- 自动在请求头写入 `Access-Token`。
- `code` 不为 0 时抛出 `OceanEngineException`，带上错误码和 `request_id`。
- GET 遇到限流时自动重试。
- 把 `filtering` 这类对象序列化成巨量要求的 JSON 查询参数。

SDK 不负责投放策略、账户体系和令牌存储。换取、刷新 Access Token 可以调用其中的 OAuth 接口，令牌的保存和到期刷新由业务程序自己做。

## 项目

| 项目 | 作用 |
| --- | --- |
| `src/Alita.AdSDK.ByteDance.OceanEngine` | 注册、令牌、错误处理和 JSON 查询参数。业务项目引用这一个。 |
| `src/Alita.AdSDK.ByteDance.OceanEngine.Api` | 由 OpenAPI 生成的接口和模型。不要手改，更新时重新生成。 |
| `openapi/oceanengine.json` | 生成用的 OpenAPI 规范，由官方 Go SDK 转换而来。 |

目标框架是 `net8.0`。调用方式见 [使用说明](使用说明.md)。
