using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public class SilentPrintCommandExecutorTests
{
    [Fact]
    public void TryResolvePrinterQueueNameFromLpstatOutput_ResolvesPrinterNameSubstring()
    {
        const string lpstatOutput = """
printer HP_Color_LaserJet_MFP_M477fdw__792DC0_ is idle. enabled since Wed Jun 10 09:59:35 2026
printer EPSON_LQ-730KII is idle. enabled since Tue Jun  9 13:51:22 2026
printer Brother_QL-810W is idle. enabled since Tue Jun  9 13:51:22 2026
system default destination: HP_Color_LaserJet_MFP_M477fdw__792DC0_
""";

        SilentPrintCommandExecutor.TryResolvePrinterQueueNameFromLpstatOutput("HP", lpstatOutput)
            .Should().Be("HP_Color_LaserJet_MFP_M477fdw__792DC0_");

        SilentPrintCommandExecutor.TryResolvePrinterQueueNameFromLpstatOutput("EPSON LQ-730KII", lpstatOutput)
            .Should().Be("EPSON_LQ-730KII");

        SilentPrintCommandExecutor.TryResolvePrinterQueueNameFromLpstatOutput("Brother QL-810W", lpstatOutput)
            .Should().Be("Brother_QL-810W");
    }

    [Fact]
    public void TryResolvePrinterQueueNameFromLpstatOutput_UsesDefaultPrinterForHpAndNullOtherwise()
    {
        const string lpstatOutput = """
printer Office_Printer is idle. enabled since Wed Jun 10 09:59:35 2026
system default destination: Office_Printer
""";

        SilentPrintCommandExecutor.TryResolvePrinterQueueNameFromLpstatOutput("HP", lpstatOutput)
            .Should().Be("Office_Printer");

        SilentPrintCommandExecutor.TryResolvePrinterQueueNameFromLpstatOutput("Laser", lpstatOutput)
            .Should().BeNull();
    }
}
