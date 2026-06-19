using System.Text;

namespace Workshop.Api.Services;

public sealed record GmailMessageAttachment(string FileName, string ContentType, byte[] ContentBytes);

public static class GmailMimeMessageBuilder
{
    public static string BuildRawMessage(
        string to,
        string subject,
        string body,
        bool isHtmlBody,
        string? htmlBodyOverride,
        string? replyToRfcMessageId,
        string? referencesHeader,
        IReadOnlyList<GmailMessageAttachment>? attachments = null)
        => BuildRawMessage(to, null, subject, body, isHtmlBody, htmlBodyOverride, replyToRfcMessageId, referencesHeader, attachments);

    public static string BuildRawMessage(
        string to,
        string? cc,
        string subject,
        string body,
        bool isHtmlBody,
        string? htmlBodyOverride,
        string? replyToRfcMessageId,
        string? referencesHeader,
        IReadOnlyList<GmailMessageAttachment>? attachments = null)
    {
        var normalizedBody = !string.IsNullOrWhiteSpace(htmlBodyOverride)
            ? htmlBodyOverride
            : isHtmlBody
                ? body
                : ConvertPlainTextToHtml(body);

        var hasAttachments = attachments is { Count: > 0 };
        var bodyHeaders = new List<string>
        {
            "Content-Type: text/html; charset=utf-8",
            "Content-Transfer-Encoding: 8bit",
        };

        var headers = new List<string>
        {
            $"To: {to}",
            $"Subject: {EncodeMimeHeader(subject)}",
            "MIME-Version: 1.0",
        };

        if (!string.IsNullOrWhiteSpace(cc))
            headers.Add($"Cc: {cc}");

        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            headers.Add($"In-Reply-To: {replyToRfcMessageId.Trim()}");

        var normalizedReferences = BuildReferencesHeader(referencesHeader, replyToRfcMessageId);
        if (!string.IsNullOrWhiteSpace(normalizedReferences))
            headers.Add($"References: {normalizedReferences}");

        if (!hasAttachments)
        {
            headers.AddRange(bodyHeaders);
            headers.Add("");
            headers.Add(normalizedBody);
            return EncodeRawMime(headers);
        }

        var boundary = $"mix-{Guid.NewGuid():N}";
        headers.Add($"Content-Type: multipart/mixed; boundary=\"{boundary}\"");
        headers.Add("");
        headers.Add($"--{boundary}");
        headers.AddRange(bodyHeaders);
        headers.Add("");
        headers.Add(normalizedBody);

        foreach (var attachment in attachments!)
        {
            headers.Add("");
            headers.Add($"--{boundary}");
            headers.Add($"Content-Type: {attachment.ContentType}; name=\"{EscapeHeaderValue(attachment.FileName)}\"");
            headers.Add($"Content-Disposition: attachment; filename=\"{EscapeHeaderValue(attachment.FileName)}\"");
            headers.Add("Content-Transfer-Encoding: base64");
            headers.Add("");
            headers.Add(EncodeBase64Mime(attachment.ContentBytes));
        }

        headers.Add("");
        headers.Add($"--{boundary}--");

        return EncodeRawMime(headers);
    }

    private static string EncodeRawMime(IEnumerable<string> lines)
    {
        var mime = string.Join("\r\n", lines);
        var bytes = Encoding.UTF8.GetBytes(mime);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string EncodeBase64Mime(byte[] contentBytes)
    {
        var base64 = Convert.ToBase64String(contentBytes, Base64FormattingOptions.InsertLineBreaks);
        return base64.Replace("\r\n", "\r\n");
    }

    private static string EscapeHeaderValue(string value) =>
        (value ?? "")
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");

    private static string EncodeMimeHeader(string value)
    {
        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
        return $"=?UTF-8?B?{base64}?=";
    }

    private static string? BuildReferencesHeader(string? referencesHeader, string? replyToRfcMessageId)
    {
        var values = new List<string>();
        if (!string.IsNullOrWhiteSpace(referencesHeader))
            values.AddRange(referencesHeader.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            values.Add(replyToRfcMessageId.Trim());

        var normalized = values
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return normalized.Length == 0 ? null : string.Join(" ", normalized);
    }

    private static string ConvertPlainTextToHtml(string value)
    {
        var normalized = (value ?? string.Empty).Replace("\r\n", "\n").Replace('\r', '\n');
        var blocks = normalized
            .Split("\n\n", StringSplitOptions.None)
            .Select(block => block.Trim('\n'))
            .Where(block => !string.IsNullOrWhiteSpace(block))
            .Select(block =>
            {
                var escaped = System.Net.WebUtility.HtmlEncode(block);
                var withLineBreaks = escaped.Replace("\n", "<br>");
                return $"<p style=\"margin:0 0 16px; line-height:1.6;\">{withLineBreaks}</p>";
            })
            .ToList();

        if (blocks.Count == 0)
            blocks.Add("<p style=\"margin:0; line-height:1.6;\"></p>");

        return $"""
<!doctype html>
<html>
  <body style="margin:0; font-family:Arial, sans-serif; font-size:14px; color:#222;">
    {string.Join("", blocks)}
  </body>
</html>
""";
    }
}
