using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public class SilentPrintRouteResolverTests
{
    [Theory]
    [InlineData("job-mech", "hp", "mech")]
    [InlineData("job-wof", "hp", "mech")]
    [InlineData("job-pnp", "hp", "pnp")]
    [InlineData("wof-record", "epson", "wof-record")]
    public void Resolve_ReturnsExpectedRoute(string routeKey, string printerFamily, string templateKey)
    {
        var route = SilentPrintRouteResolver.Resolve(routeKey);

        route.RouteKey.Should().Be(routeKey);
        route.PrinterFamily.Should().Be(printerFamily);
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
