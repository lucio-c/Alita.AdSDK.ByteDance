using Alita.AdSDK.ByteDance.OceanEngine.Api;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Kiota.Abstractions.Authentication;
using Microsoft.Kiota.Http.HttpClientLibrary;

namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 创建带有根地址和消息处理管道的 <see cref="OceanEngineClient"/>。
/// </summary>
public static class OceanEngineClientFactory
{
    /// <summary>
    /// <see cref="IHttpClientFactory"/> 中的客户端名称。
    /// </summary>
    public const string HttpClientName = "OceanEngine";

    /// <summary>
    /// 从依赖注入容器创建客户端。调用方通常使用 <c>AddOceanEngineClient</c>，而不是直接调用本方法。
    /// </summary>
    public static OceanEngineClient Create(IServiceProvider services)
    {
        var options = services.GetRequiredService<OceanEngineOptions>();
        var httpClient = services.GetRequiredService<IHttpClientFactory>().CreateClient(HttpClientName);
        var adapter = new HttpClientRequestAdapter(new AnonymousAuthenticationProvider(), httpClient: httpClient)
        {
            BaseUrl = options.BaseAddress.ToString().TrimEnd('/'),
        };
        return new OceanEngineClient(adapter);
    }
}
