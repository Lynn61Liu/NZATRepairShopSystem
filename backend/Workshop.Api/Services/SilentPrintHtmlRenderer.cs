using Microsoft.Playwright;

namespace Workshop.Api.Services;

public sealed class SilentPrintHtmlRenderer
{
    public async Task<byte[]> RenderPdfAsync(string html, string assetBaseUrl, string templateKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(html))
            throw new InvalidOperationException("HTML is required.");

        var normalizedHtml = EnsureBaseHref(html, assetBaseUrl);

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
        {
            Headless = true,
        });

        var page = await browser.NewPageAsync(new BrowserNewPageOptions
        {
            ViewportSize = templateKey == "pnp"
                ? new ViewportSize { Width = 1123, Height = 794 }
                : new ViewportSize { Width = 794, Height = 1123 },
        });

        await page.SetContentAsync(normalizedHtml, new PageSetContentOptions
        {
            WaitUntil = WaitUntilState.NetworkIdle,
        });

        return await page.PdfAsync(new PagePdfOptions
        {
            PrintBackground = true,
            PreferCSSPageSize = true,
            Format = "A4",
            Landscape = templateKey == "pnp",
        });
    }

    private static string EnsureBaseHref(string html, string assetBaseUrl)
    {
        var normalizedBaseUrl = (assetBaseUrl ?? string.Empty).Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(normalizedBaseUrl))
            return html;

        if (html.Contains("<base ", StringComparison.OrdinalIgnoreCase))
            return html;

        var baseTag = $"<base href=\"{EscapeAttribute(normalizedBaseUrl)}/\">";
        var headIndex = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        if (headIndex >= 0)
            return html.Insert(headIndex, baseTag);

        return baseTag + html;
    }

    private static string EscapeAttribute(string value) =>
        (value ?? string.Empty)
            .Replace("&", "&amp;")
            .Replace("\"", "&quot;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;");
}
