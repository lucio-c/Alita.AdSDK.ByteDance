namespace Alita.AdSDK.ByteDance.OceanEngine;

internal sealed class OptionsAccessTokenProvider : IOceanEngineAccessTokenProvider
{
    private readonly OceanEngineOptions _options;

    public OptionsAccessTokenProvider(OceanEngineOptions options)
    {
        _options = options;
    }

    public ValueTask<string?> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        if (_options.AccessTokenFactory is not null)
        {
            return _options.AccessTokenFactory(cancellationToken);
        }

        return ValueTask.FromResult(_options.AccessToken);
    }
}
