using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class XeroInvoiceStatusBackgroundServiceTests
{
    [Fact]
    public void GetNextRunUtc_ReturnsNextSlotOnSameDay()
    {
        var now = new DateTime(2026, 7, 13, 11, 30, 0, DateTimeKind.Utc);
        var times = new[] { new TimeOnly(10, 0), new TimeOnly(14, 0), new TimeOnly(20, 0) };

        var result = XeroInvoiceStatusBackgroundService.GetNextRunUtc(now, TimeZoneInfo.Utc, times);

        result.Should().Be(new DateTime(2026, 7, 13, 14, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void GetNextRunUtc_RollsOverToFirstSlotTomorrow()
    {
        var now = new DateTime(2026, 7, 13, 21, 0, 0, DateTimeKind.Utc);
        var times = new[] { new TimeOnly(10, 0), new TimeOnly(14, 0), new TimeOnly(20, 0) };

        var result = XeroInvoiceStatusBackgroundService.GetNextRunUtc(now, TimeZoneInfo.Utc, times);

        result.Should().Be(new DateTime(2026, 7, 14, 10, 0, 0, DateTimeKind.Utc));
    }
}
