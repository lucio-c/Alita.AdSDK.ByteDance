using System.Text;
using Microsoft.Kiota.Abstractions.Serialization;
using Microsoft.Kiota.Serialization.Json;

namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 把模型序列化成巨量查询参数要求的 JSON 字符串。对象和数组不能拆成 filtering.xxx= 的形式。
/// </summary>
public static class OceanEngineJson
{
    /// <summary>
    /// 序列化一个对象，例如 filtering。
    /// </summary>
    public static string Serialize(IParsable value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var writer = new JsonSerializationWriter();
        writer.WriteObjectValue<IParsable>(null, value);
        return Read(writer);
    }

    /// <summary>
    /// 序列化对象数组。元素需要是生成的模型。
    /// </summary>
    public static string SerializeAll<T>(IEnumerable<T> values) where T : IParsable
    {
        ArgumentNullException.ThrowIfNull(values);
        var writer = new JsonSerializationWriter();
        writer.WriteCollectionOfObjectValues<T>(null, values);
        return Read(writer);
    }

    /// <summary>
    /// 序列化数字、字符串等简单类型的数组，例如 advertiser_ids。
    /// </summary>
    public static string SerializeValues<T>(IEnumerable<T> values)
    {
        ArgumentNullException.ThrowIfNull(values);
        return System.Text.Json.JsonSerializer.Serialize(values);
    }

    private static string Read(JsonSerializationWriter writer)
    {
        using var stream = writer.GetSerializedContent();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
