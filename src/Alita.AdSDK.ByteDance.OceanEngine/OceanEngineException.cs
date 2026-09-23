namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 巨量接口业务错误。HTTP 状态码通常仍是 200，以返回体中的 code 为准，code 不为 0 时抛出。
/// </summary>
public sealed class OceanEngineException : Exception
{
    /// <summary>
    /// 使用巨量返回的错误码、文案和请求日志 ID 创建异常。
    /// </summary>
    public OceanEngineException(long code, string message, string? requestId)
        : base(message)
    {
        Code = code;
        RequestId = requestId;
    }

    /// <summary>
    /// 业务错误码。0 表示成功，不会用 0 构造此异常。
    /// </summary>
    public long Code { get; }

    /// <summary>
    /// 请求日志 ID，对应返回体中的 request_id。
    /// </summary>
    public string? RequestId { get; }
}
