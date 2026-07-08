using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class PoReferenceBuilderTests
{
    [Theory]
    [InlineData("PO Pending ABC123", "12345", "PO 12345 ABC123")]
    [InlineData("pending ABC123 repair", "12345", "12345 ABC123 repair")]
    [InlineData("PENDING ABC123", "PO-77", "PO-77 ABC123")]
    public void BuildReference_ReplacesPendingToken(string currentReference, string poNumber, string expected)
    {
        PoReferenceBuilder.BuildReference(currentReference, poNumber).Should().Be(expected);
    }

    [Fact]
    public void BuildReference_PrependsPo_WhenPendingTokenIsMissing()
    {
        PoReferenceBuilder.BuildReference("ABC123 repair", "12345").Should().Be("12345 ABC123 repair");
    }

    [Fact]
    public void BuildReference_ReturnsPo_WhenReferenceIsBlank()
    {
        PoReferenceBuilder.BuildReference("   ", "12345").Should().Be("12345");
    }

    [Fact]
    public void BuildReference_ReturnsNormalizedReference_WhenPoIsBlank()
    {
        PoReferenceBuilder.BuildReference(" PO   Pending   ABC123 ", "   ").Should().Be("PO Pending ABC123");
    }

    [Fact]
    public void BuildReference_ReplacesOnlyFirstWholeWordPendingToken()
    {
        PoReferenceBuilder.BuildReference("pending ABC123 pending repair", "12345").Should().Be("12345 ABC123 pending repair");
    }

    [Fact]
    public void BuildReference_DoesNotReplacePendingInsideAnotherWord()
    {
        PoReferenceBuilder.BuildReference("pendingly ABC123 repair", "12345").Should().Be("12345 pendingly ABC123 repair");
    }

    [Fact]
    public void BuildReference_TrimsAndCollapsesWhitespace()
    {
        PoReferenceBuilder.BuildReference(" PO   Pending   ABC123 ", " 12345 ").Should().Be("PO 12345 ABC123");
    }
}
