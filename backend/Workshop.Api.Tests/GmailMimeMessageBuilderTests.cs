using System.Text;
using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public class GmailMimeMessageBuilderTests
{
    [Fact]
    public void BuildRawMessage_WithAttachment_ProducesMultipartMime()
    {
        var raw = GmailMimeMessageBuilder.BuildRawMessage(
            to: "226mvvq6539qkr@hpprint.com",
            subject: "Test subject",
            body: "<p>Hello</p>",
            isHtmlBody: true,
            htmlBodyOverride: null,
            replyToRfcMessageId: null,
            referencesHeader: null,
            attachments: [
                new GmailMessageAttachment("job-sheet.pdf", "application/pdf", Encoding.UTF8.GetBytes("%PDF-1.4 fake pdf"))
            ]);

        var mime = DecodeBase64Url(raw);

        mime.Should().Contain("multipart/mixed");
        mime.Should().Contain("Content-Disposition: attachment; filename=\"job-sheet.pdf\"");
        mime.Should().Contain("Content-Type: application/pdf; name=\"job-sheet.pdf\"");
        mime.Should().Contain("<p>Hello</p>");
    }

    private static string DecodeBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Encoding.UTF8.GetString(Convert.FromBase64String(padded));
    }
}
