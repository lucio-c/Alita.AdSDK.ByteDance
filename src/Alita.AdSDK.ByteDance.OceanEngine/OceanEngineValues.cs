using System.Globalization;
using System.Text.Json;
using Microsoft.Kiota.Abstractions.Serialization;

namespace Alita.AdSDK.ByteDance.OceanEngine;

/// <summary>
/// 读取规范里没有声明字段名的值。维度和指标是开放对象，Kiota 收成未类型化节点。
/// </summary>
public static class OceanEngineValues
{
    private static readonly string[] Wrapped = ["ValueStr", "valueStr", "Value", "value"];

    /// <summary>
    /// 按字段名取出文本。对象里优先用 ValueStr，没有再退回 Value。
    /// </summary>
    public static string Text(IDictionary<string, object>? data, params string[] names)
    {
        if (data == null) return "";
        foreach (var name in names)
        {
            if (!data.TryGetValue(name, out var value)) continue;
            var text = Text(value);
            if (text.Length > 0) return text;
        }

        return "";
    }

    /// <summary>
    /// 把一个未类型化节点、字符串或 JSON 元素收成文本。认不出的值留空，避免把类型名写进业务字段。
    /// </summary>
    public static string Text(object? value) => value switch
    {
        null => "",
        string text => text,
        JsonElement element => Element(element),
        UntypedString node => node.GetValue() ?? "",
        UntypedInteger node => Invariant(node.GetValue()),
        UntypedLong node => Invariant(node.GetValue()),
        UntypedDecimal node => Invariant(node.GetValue()),
        UntypedDouble node => Invariant(node.GetValue()),
        UntypedFloat node => Invariant(node.GetValue()),
        UntypedBoolean node => node.GetValue() ? "true" : "false",
        UntypedObject node => WrappedText(node.GetValue()),
        UntypedNull => "",
        IAdditionalDataHolder holder => Text(holder.AdditionalData, Wrapped),
        _ => "",
    };

    /// <summary>开放对象再包一层时，按 ValueStr、Value 的顺序取出。</summary>
    private static string WrappedText(IDictionary<string, UntypedNode> properties)
    {
        foreach (var name in Wrapped)
        {
            if (!properties.TryGetValue(name, out var node)) continue;
            var text = Text(node);
            if (text.Length > 0) return text;
        }

        return "";
    }

    /// <summary>数字按不变区域写成十进制文本。空值留空。</summary>
    private static string Invariant(object? number) =>
        number is IFormattable formattable ? formattable.ToString(null, CultureInfo.InvariantCulture) : "";

    private static string Element(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString() ?? "",
        JsonValueKind.Number => element.GetRawText(),
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        JsonValueKind.Object => WrappedElement(element),
        _ => "",
    };

    private static string WrappedElement(JsonElement element)
    {
        foreach (var name in Wrapped)
        {
            if (!element.TryGetProperty(name, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                continue;
            var text = Element(value);
            if (text.Length > 0) return text;
        }

        return "";
    }
}
