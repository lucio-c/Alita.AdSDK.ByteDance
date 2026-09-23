namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 巨量引擎客户端配置。
/// </summary>
public sealed class OceanEngineOptions
{
    /// <summary>
    /// 接口根地址。正式环境为 https://api.oceanengine.com 。
    /// </summary>
    public Uri BaseAddress { get; set; } = new("https://api.oceanengine.com");

    /// <summary>
    /// 固定的 Access Token。未设置 <see cref="AccessTokenFactory"/> 时使用。
    /// </summary>
    public string? AccessToken { get; set; }

    /// <summary>
    /// 每次请求前获取 Access Token。设置后优先于 <see cref="AccessToken"/>。
    /// </summary>
    public Func<CancellationToken, ValueTask<string?>>? AccessTokenFactory { get; set; }
}
