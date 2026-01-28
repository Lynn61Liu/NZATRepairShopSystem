using Microsoft.Playwright;

namespace CarjamImporter.Playwright;

public sealed class CarjamBrowser
{
    /// <summary>
    /// Fetches the HTML content of the Carjam report page for the given plate.
    /// </summary>
    public async Task<string> FetchHtmlAsync(string plate, CancellationToken ct)
    {
        var url = $"https://www.carjam.co.nz/car/?plate={Uri.EscapeDataString(plate)}";

        using var playwright = await Microsoft.Playwright.Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
        {
            Headless = true
        });

        var context = await browser.NewContextAsync(new BrowserNewContextOptions
        {
            ViewportSize = new ViewportSize { Width = 1280, Height = 720 },
            Locale = "en-NZ",
            UserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
        });

        var page = await context.NewPageAsync();

        await page.GotoAsync(url, new PageGotoOptions
        {
            WaitUntil = WaitUntilState.NetworkIdle,
            Timeout = 60000
        });

        await page.WaitForFunctionAsync(
            "() => window.report && window.report.idh && window.report.idh.vehicle && window.report.idh.vehicle.plate",
            null,
            new PageWaitForFunctionOptions { Timeout = 60000 }
        );

        return await page.ContentAsync();
    }
}
