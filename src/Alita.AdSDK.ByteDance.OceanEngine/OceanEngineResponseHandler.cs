using System.Net.Http.Headers;
using System.Text.Json;

namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 读取巨量返回体。code 不为 0 时抛出 <see cref="OceanEngineException"/>。
/// GET 遇到限流码 40100、40110、40130、51010 时，按 1 秒、2 秒的间隔最多重试 3 次。
/// 上传等非 GET 请求不把请求体复制进内存，文件可以按流发送。
/// </summary>
public sealed class OceanEngineResponseHandler : DelegatingHandler
{
    private static readonly long[] RetryCodes = [40100, 40110, 40130, 51010];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.Method != HttpMethod.Get)
        {
            var response = await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
            return await AcceptOrThrowAsync(response, cancellationToken).ConfigureAwait(false);
        }

        var body = await BufferContentAsync(request.Content, cancellationToken).ConfigureAwait(false);
        const int attempts = 3;
        for (var attempt = 1; ; attempt++)
        {
            using var outbound = Clone(request, body);
            var response = await base.SendAsync(outbound, cancellationToken).ConfigureAwait(false);
            var payload = await ReadBusinessPayloadAsync(response, cancellationToken).ConfigureAwait(false);
            if (payload is null || payload.Value.Code == 0)
            {
                return response;
            }

            if (attempt < attempts && RetryCodes.Contains(payload.Value.Code))
            {
                response.Dispose();
                await Task.Delay(TimeSpan.FromSeconds(attempt), cancellationToken).ConfigureAwait(false);
                continue;
            }

            response.Dispose();
            throw new OceanEngineException(payload.Value.Code, payload.Value.Message, payload.Value.RequestId);
        }
    }

    private static async Task<HttpResponseMessage> AcceptOrThrowAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var payload = await ReadBusinessPayloadAsync(response, cancellationToken).ConfigureAwait(false);
        if (payload is null || payload.Value.Code == 0)
        {
            return response;
        }

        response.Dispose();
        throw new OceanEngineException(payload.Value.Code, payload.Value.Message, payload.Value.RequestId);
    }

    private static async Task<BusinessPayload?> ReadBusinessPayloadAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.Content is null)
        {
            return null;
        }

        var mediaType = response.Content.Headers.ContentType?.MediaType;
        if (mediaType is not null && !mediaType.Contains("json", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
        var replacement = new ByteArrayContent(bytes);
        CopyHeaders(response.Content.Headers, replacement.Headers);
        response.Content = replacement;

        if (bytes.Length == 0 || bytes[0] != (byte)'{')
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(bytes);
            if (document.RootElement.ValueKind != JsonValueKind.Object ||
                !document.RootElement.TryGetProperty("code", out var codeProperty) ||
                codeProperty.ValueKind != JsonValueKind.Number)
            {
                return null;
            }

            var message = document.RootElement.TryGetProperty("message", out var messageProperty)
                ? messageProperty.GetString() ?? $"巨量接口返回 code {codeProperty.GetInt64()}。"
                : $"巨量接口返回 code {codeProperty.GetInt64()}。";
            var requestId = document.RootElement.TryGetProperty("request_id", out var requestIdProperty)
                ? requestIdProperty.GetString()
                : null;
            return new BusinessPayload(codeProperty.GetInt64(), message, requestId);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static async Task<BufferedContent?> BufferContentAsync(HttpContent? content, CancellationToken cancellationToken)
    {
        if (content is null)
        {
            return null;
        }

        var bytes = await content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
        return new BufferedContent(bytes, content.Headers);
    }

    private static HttpRequestMessage Clone(HttpRequestMessage request, BufferedContent? body)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri)
        {
            Version = request.Version,
        };
        foreach (var header in request.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        if (body is not null)
        {
            var content = new ByteArrayContent(body.Bytes);
            CopyHeaders(body.Headers, content.Headers);
            clone.Content = content;
        }

        return clone;
    }

    private static void CopyHeaders(HttpContentHeaders source, HttpContentHeaders destination)
    {
        foreach (var header in source)
        {
            destination.TryAddWithoutValidation(header.Key, header.Value);
        }
    }

    private readonly record struct BusinessPayload(long Code, string Message, string? RequestId);

    private sealed class BufferedContent
    {
        public BufferedContent(byte[] bytes, HttpContentHeaders headers)
        {
            Bytes = bytes;
            Headers = headers;
        }

        public byte[] Bytes { get; }

        public HttpContentHeaders Headers { get; }
    }
}
