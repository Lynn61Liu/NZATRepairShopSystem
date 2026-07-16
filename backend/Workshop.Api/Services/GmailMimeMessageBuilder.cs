using System.Text;

namespace Workshop.Api.Services;

public sealed record GmailMessageAttachment(
    string FileName,
    string ContentType,
    byte[] ContentBytes,
    string? ContentId = null);

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
        => BuildRawMessage(to, null, subject, body, isHtmlBody, htmlBodyOverride, replyToRfcMessageId, referencesHeader, attachments, null);

    public static string BuildRawMessage(
        string to,
        string? cc,
        string subject,
        string body,
        bool isHtmlBody,
        string? htmlBodyOverride,
        string? replyToRfcMessageId,
        string? referencesHeader,
        IReadOnlyList<GmailMessageAttachment>? attachments = null,
        string? bcc = null)
    {
        var normalizedBody = !string.IsNullOrWhiteSpace(htmlBodyOverride)
            ? htmlBodyOverride
            : isHtmlBody
                ? body
                : ConvertPlainTextToHtml(body);

        var preparedAttachments = attachments?
            .Select(attachment => new PreparedMimeAttachment(attachment, NormalizeContentId(attachment.ContentId)))
            .ToArray() ?? [];
        var inlineAttachments = preparedAttachments
            .Where(item => !string.IsNullOrWhiteSpace(item.ContentId))
            .ToArray();
        var regularAttachments = preparedAttachments
            .Where(item => string.IsNullOrWhiteSpace(item.ContentId))
            .Select(item => item.Attachment)
            .ToArray();
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

        if (!string.IsNullOrWhiteSpace(bcc))
            headers.Add($"Bcc: {bcc}");

        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            headers.Add($"In-Reply-To: {replyToRfcMessageId.Trim()}");

        var normalizedReferences = BuildReferencesHeader(referencesHeader, replyToRfcMessageId);
        if (!string.IsNullOrWhiteSpace(normalizedReferences))
            headers.Add($"References: {normalizedReferences}");

        if (inlineAttachments.Length == 0 && regularAttachments.Length == 0)
        {
            headers.AddRange(bodyHeaders);
            headers.Add("");
            headers.Add(normalizedBody);
            return EncodeRawMime(headers);
        }

        if (regularAttachments.Length == 0)
        {
            var relatedBoundary = $"rel-{Guid.NewGuid():N}";
            headers.Add($"Content-Type: multipart/related; boundary=\"{relatedBoundary}\"");
            headers.Add("");
            AppendHtmlPart(headers, relatedBoundary, bodyHeaders, normalizedBody);
            foreach (var inlineAttachment in inlineAttachments)
                AppendInlinePart(headers, relatedBoundary, inlineAttachment);

            headers.Add("");
            headers.Add($"--{relatedBoundary}--");
            return EncodeRawMime(headers);
        }

        var mixedBoundary = $"mix-{Guid.NewGuid():N}";
        headers.Add($"Content-Type: multipart/mixed; boundary=\"{mixedBoundary}\"");
        headers.Add("");
        headers.Add($"--{mixedBoundary}");

        if (inlineAttachments.Length > 0)
        {
            var relatedBoundary = $"rel-{Guid.NewGuid():N}";
            headers.Add($"Content-Type: multipart/related; boundary=\"{relatedBoundary}\"");
            headers.Add("");
            AppendHtmlPart(headers, relatedBoundary, bodyHeaders, normalizedBody);
            foreach (var inlineAttachment in inlineAttachments)
                AppendInlinePart(headers, relatedBoundary, inlineAttachment);

            headers.Add("");
            headers.Add($"--{relatedBoundary}--");
        }
        else
        {
            headers.AddRange(bodyHeaders);
            headers.Add("");
            headers.Add(normalizedBody);
        }

        foreach (var attachment in regularAttachments)
            AppendRegularAttachmentPart(headers, mixedBoundary, attachment);

        headers.Add("");
        headers.Add($"--{mixedBoundary}--");

        return EncodeRawMime(headers);
    }

    private static void AppendHtmlPart(
        List<string> lines,
        string boundary,
        IReadOnlyCollection<string> bodyHeaders,
        string normalizedBody)
    {
        lines.Add($"--{boundary}");
        lines.AddRange(bodyHeaders);
        lines.Add("");
        lines.Add(normalizedBody);
    }

    private static void AppendInlinePart(
        List<string> lines,
        string boundary,
        PreparedMimeAttachment inlineAttachment)
    {
        var attachment = inlineAttachment.Attachment;
        var fileName = EscapeHeaderValue(attachment.FileName);
        var contentId = inlineAttachment.ContentId!;

        lines.Add("");
        lines.Add($"--{boundary}");
        lines.Add($"Content-Type: {NormalizeContentType(attachment.ContentType)}; name=\"{fileName}\"");
        lines.Add($"Content-Disposition: inline; filename=\"{fileName}\"");
        lines.Add($"Content-ID: <{contentId}>");
        lines.Add($"X-Attachment-Id: {contentId}");
        lines.Add("Content-Transfer-Encoding: base64");
        lines.Add("");
        lines.Add(EncodeBase64Mime(attachment.ContentBytes));
    }

    private static void AppendRegularAttachmentPart(
        List<string> lines,
        string boundary,
        GmailMessageAttachment attachment)
    {
        var fileName = EscapeHeaderValue(attachment.FileName);

        lines.Add("");
        lines.Add($"--{boundary}");
        lines.Add($"Content-Type: {NormalizeContentType(attachment.ContentType)}; name=\"{fileName}\"");
        lines.Add($"Content-Disposition: attachment; filename=\"{fileName}\"");
        lines.Add("Content-Transfer-Encoding: base64");
        lines.Add("");
        lines.Add(EncodeBase64Mime(attachment.ContentBytes));
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
        RemoveHeaderLineBreaks(value)
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");

    private static string NormalizeContentType(string? value)
    {
        var normalized = RemoveHeaderLineBreaks(value).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? "application/octet-stream" : normalized;
    }

    private static string? NormalizeContentId(string? value)
    {
        var normalized = RemoveHeaderLineBreaks(value).Trim().Trim('<', '>');
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        var sanitized = new string(normalized
            .Where(character =>
                character is >= 'a' and <= 'z' or
                    >= 'A' and <= 'Z' or
                    >= '0' and <= '9' or
                    '.' or '_' or '-' or '+' or '@')
            .ToArray());
        return string.IsNullOrWhiteSpace(sanitized) ? null : sanitized;
    }

    private static string RemoveHeaderLineBreaks(string? value) =>
        (value ?? "").Replace("\r", "").Replace("\n", "");

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

    private sealed record PreparedMimeAttachment(GmailMessageAttachment Attachment, string? ContentId);
}
