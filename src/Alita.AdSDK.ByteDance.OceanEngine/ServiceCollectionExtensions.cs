using Alita.AdSDK.ByteDance.OceanEngine.Api;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 注册巨量引擎客户端。
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// 注册 <see cref="OceanEngineClient"/>、Access Token 注入和业务错误处理。
    /// 若要自定义令牌来源，先注册 <see cref="IOceanEngineAccessTokenProvider"/>，再调用本方法。
    /// </summary>
    public static IServiceCollection AddOceanEngineClient(this IServiceCollection services, Action<OceanEngineOptions> configure)
    {
        ArgumentNullException.ThrowIfNull(configure);

        var options = new OceanEngineOptions();
        configure(options);
        services.TryAddSingleton(options);
        services.TryAddSingleton<IOceanEngineAccessTokenProvider, OptionsAccessTokenProvider>();
        services.AddTransient<AccessTokenHandler>();
        services.AddTransient<OceanEngineResponseHandler>();
        services.AddHttpClient(OceanEngineClientFactory.HttpClientName)
            .AddHttpMessageHandler<AccessTokenHandler>()
            .AddHttpMessageHandler<OceanEngineResponseHandler>();
        services.TryAddSingleton(static provider => OceanEngineClientFactory.Create(provider));
        return services;
    }
}
