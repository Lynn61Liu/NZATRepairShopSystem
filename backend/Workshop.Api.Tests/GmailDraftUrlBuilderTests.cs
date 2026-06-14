using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public class GmailDraftUrlBuilderTests
{
    [Fact]
    public void BuildComposeUrl_UsesDraftIdAndAccountEmail()
    {
        var url = GmailDraftUrlBuilder.BuildComposeUrl("draft-123", "team@example.com");

        url.Should().Be("https://mail.google.com/mail/u/?authuser=team%40example.com#drafts?compose=draft-123");
    }

    [Fact]
    public void BuildComposeUrl_FallsBackToDefaultMailboxWhenEmailMissing()
    {
        var url = GmailDraftUrlBuilder.BuildComposeUrl("draft-123", null);

        url.Should().Be("https://mail.google.com/mail/u/0/#drafts?compose=draft-123");
    }

    [Fact]
    public void BuildSentMailboxUrl_UsesAccountEmailWhenPresent()
    {
        var url = GmailDraftUrlBuilder.BuildSentMailboxUrl("team@example.com");

        url.Should().Be("https://mail.google.com/mail/u/?authuser=team%40example.com#sent");
    }

    [Fact]
    public void BuildSentMailboxUrl_FallsBackToDefaultMailboxWhenEmailMissing()
    {
        var url = GmailDraftUrlBuilder.BuildSentMailboxUrl(null);

        url.Should().Be("https://mail.google.com/mail/u/0/#sent");
    }
}
