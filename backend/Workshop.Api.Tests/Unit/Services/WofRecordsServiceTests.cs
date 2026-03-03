using Workshop.Api.Services;
using Xunit;

public class WofRecordsServiceTests
{
    [Theory]
    [InlineData("19/11/2026", 2026, 11, 19)]
    [InlineData("2026-11-19", 2026, 11, 19)]
    [InlineData("19/11/2026,", 2026, 11, 19)]
    public void ParseDateOnly_Should_Parse_Nz_And_Iso(string input, int y, int m, int d)
    {
        var result = WofRecordsService.ParseDateOnly(input);

        Assert.NotNull(result);
        Assert.Equal(new DateOnly(y, m, d), result);
    }
}
