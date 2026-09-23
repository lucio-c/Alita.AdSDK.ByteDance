namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 在请求头尚未包含 Access-Token 时写入令牌。令牌为空则不写，授权接口因此不会带上业务令牌。
/// </summary>
public sealed class AccessTokenHandler : DelegatingHandler
{
    private readonly IOceanEngineAccessTokenProvider _tokens;

    /// <summary>
    /// 使用给定的令牌提供程序创建处理器。
    /// </summary>
    public AccessTokenHandler(IOceanEngineAccessTokenProvider tokens)
    {
        _tokens = tokens;
    }

    /// <inheritdoc />
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (!request.Headers.Contains("Access-Token"))
        {
            var token = await _tokens.GetAccessTokenAsync(cancellationToken).ConfigureAwait(false);
            if (!string.IsNullOrEmpty(token))
            {
                request.Headers.TryAddWithoutValidation("Access-Token", token);
            }
        }

        return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
    }
}
