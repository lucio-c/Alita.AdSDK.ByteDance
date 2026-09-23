namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 提供请求头 Access-Token。在调用 <c>AddOceanEngineClient</c> 之前注册自己的实现，即可替换默认的配置读取。
/// </summary>
public interface IOceanEngineAccessTokenProvider
{
    /// <summary>
    /// 取得当前请求要携带的 Access Token。返回空字符串或 null 时不写该请求头。
    /// </summary>
    ValueTask<string?> GetAccessTokenAsync(CancellationToken cancellationToken);
}
