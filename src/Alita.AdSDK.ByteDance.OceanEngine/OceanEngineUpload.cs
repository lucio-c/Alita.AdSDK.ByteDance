namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 用文件流上传，不把整个文件读进字节数组。走已注册的 HttpClient，因此仍会写入 Access-Token，并检查返回码。
/// </summary>
public static class OceanEngineUpload
{
    /// <summary>
    /// 以 multipart/form-data 提交一个文件。path 使用官方路径，例如 /open_api/2/file/video/ad/。
    /// 官方要求分片的接口，每次只传入当前这一段的流，不要把整个文件先读进内存再切开。
    /// </summary>
    public static async Task<string> PostAsync(
        IHttpClientFactory httpClientFactory,
        OceanEngineOptions options,
        string path,
        IReadOnlyDictionary<string, string>? fields,
        string fileFieldName,
        Stream file,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClientFactory);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileFieldName);
        ArgumentNullException.ThrowIfNull(file);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);

        using var content = new MultipartFormDataContent();
        if (fields is not null)
        {
            foreach (var field in fields)
            {
                content.Add(new StringContent(field.Value), field.Key);
            }
        }

        var fileContent = new StreamContent(file);
        content.Add(fileContent, fileFieldName, fileName);

        var address = path.StartsWith('/')
            ? new Uri(options.BaseAddress, path)
            : new Uri(options.BaseAddress, path);
        using var request = new HttpRequestMessage(HttpMethod.Post, address)
        {
            Content = content,
        };
        var client = httpClientFactory.CreateClient(OceanEngineClientFactory.HttpClientName);
        using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
        return await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
    }
}
