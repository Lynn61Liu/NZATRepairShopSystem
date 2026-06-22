using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public class SilentPrintRouteResolverTests
{
    [Theory]
    [InlineData("job-mech", "hp", "HP", "mech")]
    [InlineData("job-wof", "hp", "HP", "mech")]
    [InlineData("job-pnp", "hp", "HP", "pnp")]
    [InlineData("wof-record", "epson", "EPSON LQ-730KII", "wof-record")]
    [InlineData("small-tag", "brother", "Brother QL-810W", "small-tag")]
    public void Resolve_ReturnsExpectedRoute(string routeKey, string printerFamily, string printerName, string templateKey)
    {
        var route = SilentPrintRouteResolver.Resolve(routeKey);

        route.RouteKey.Should().Be(routeKey);
        route.PrinterFamily.Should().Be(printerFamily);
        route.PrinterName.Should().Be(printerName);
        route.TemplateKey.Should().Be(templateKey);
    }

    [Fact]
    public void Resolve_UnknownRoute_Throws()
    {
        var act = () => SilentPrintRouteResolver.Resolve("unknown");

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*unknown*");
    }
}
