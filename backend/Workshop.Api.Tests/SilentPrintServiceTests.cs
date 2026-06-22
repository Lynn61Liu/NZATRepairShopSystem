using Microsoft.Extensions.Logging.Abstractions;
using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public class SilentPrintServiceTests
{
    [Fact]
    public void Dispatch_RejectsNonSilentPrintMode()
    {
        var service = new SilentPrintService(
            NullLogger<SilentPrintService>.Instance,
            new SilentPrintHtmlRenderer(),
            new SilentPrintCommandExecutor());

        var request = new SilentPrintJobRequest(
            "preview",
            "job-mech",
            "<html><head></head><body></body></html>",
            "http://localhost");

        var act = () => service.Dispatch(request);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*printMode=silent*");
    }
}
