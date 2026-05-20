using CarjamImporter.Playwright;
using FluentAssertions;

namespace Workshop.Api.Tests;

public class CarjamBrowserTests
{
    [Fact]
    public void VehicleReadyScript_ShouldAcceptPlateOrVin()
    {
        CarjamBrowser.VehicleReadyScript.Should().Be(
            "() => window.report && window.report.idh && window.report.idh.vehicle && (window.report.idh.vehicle.plate || window.report.idh.vehicle.vin)");
    }
}
