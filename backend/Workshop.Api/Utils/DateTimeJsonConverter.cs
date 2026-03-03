using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Workshop.Api.Utils;

public sealed class DateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException("Expected string for DateTime.");

        var text = reader.GetString();
        if (string.IsNullOrWhiteSpace(text))
            return default;

        if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            return DateTimeHelper.NormalizeUtc(parsed);

        throw new JsonException($"Invalid DateTime: {text}");
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(DateTimeHelper.FormatUtc(value));
}

public sealed class NullableDateTimeJsonConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return null;

        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException("Expected string for DateTime.");

        var text = reader.GetString();
        if (string.IsNullOrWhiteSpace(text))
            return null;

        if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            return DateTimeHelper.NormalizeUtc(parsed);

        throw new JsonException($"Invalid DateTime: {text}");
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
            return;
        }

        writer.WriteStringValue(DateTimeHelper.FormatUtc(value.Value));
    }
}
