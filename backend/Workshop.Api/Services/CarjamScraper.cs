using Microsoft.Playwright;

namespace Workshop.Api.Services;

public class CarjamScraper
{
    public async Task<string> GetVehicleJsonByPlateAsync(string plate, CancellationToken ct)
    {
        plate = NormalizePlate(plate);
        var url = $"https://www.carjam.co.nz/car/?plate={Uri.EscapeDataString(plate)}";

        using var playwright = await Playwright.CreateAsync();

        await using var browser = await playwright.Chromium.LaunchAsync(
            new BrowserTypeLaunchOptions
            {
                Headless = false // 先调试，稳定后可改 true
            });

        var page = await browser.NewPageAsync();
        page.SetDefaultTimeout(120000);

        // 忽略 analytics 噪音（不影响业务）
        page.RequestFailed += (_, req) =>
        {
            var u = req.Url;
            if (u.Contains("google-analytics") ||
                u.Contains("analytics.google") ||
                u.Contains("googletagmanager") ||
                u.Contains("google.com/ccm"))
                return;

            Console.WriteLine($"[CARJAM request failed] {req.Url} {req.Failure}");
        };

        await page.GotoAsync(url, new PageGotoOptions
        {
            WaitUntil = WaitUntilState.DOMContentLoaded,
            Timeout = 120000
        });

        // 等网络基本稳定
        await page.WaitForLoadStateAsync(
            LoadState.NetworkIdle,
            new PageWaitForLoadStateOptions { Timeout = 120000 }
        );

        // 打印可能的数据根（只用于调试观察）
        var candidateKeys = await page.EvaluateAsync<string>(@"
() => JSON.stringify(
  Object.keys(window).filter(k => {
    const x = k.toLowerCase();
    return x.includes('report') ||
           x.includes('nuxt') ||
           x.includes('next') ||
           x.includes('state') ||
           x.includes('preloaded') ||
           x.includes('apollo');
  })
)
");
        Console.WriteLine($"[CARJAM] candidate window keys====================: {candidateKeys}");

        // 🔑 核心：从常见根对象中，自动找到“包含 plate 的 JSON”
        var json = await page.EvaluateAsync<string>(@"
(plate) => {
  const roots = [
    window.report,
    window.__NUXT__,
    window.__NEXT_DATA__,
    window.__INITIAL_STATE__,
    window.__PRELOADED_STATE__,
    window.__APOLLO_STATE__
  ].filter(Boolean);

  const seen = new Set();

  function safeStringify(obj) {
    try { return JSON.stringify(obj); } catch { return null; }
  }

  function walk(obj, depth) {
    if (!obj || depth > 6) return null;
    if (typeof obj !== 'object') return null;
    if (seen.has(obj)) return null;
    seen.add(obj);

    const s = safeStringify(obj);
    if (s && s.includes(plate)) return s;

    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const hit = walk(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  for (const r of roots) {
    const hit = walk(r, 0);
    if (hit) return hit;
  }

  return null;
}
", plate);

        if (string.IsNullOrWhiteSpace(json) || json == "null")
        {
            // 保存现场，方便你肉眼确认
            await page.ScreenshotAsync(new PageScreenshotOptions
            {
                Path = $"carjam_{plate}.png",
                FullPage = true
            });

            var html = await page.ContentAsync();
            await File.WriteAllTextAsync($"carjam_{plate}.html", html, ct);

            throw new TimeoutException(
                "Report page loaded, but vehicle JSON could not be located in window roots.");
        }

        return json;
    }

    private static string NormalizePlate(string plate)
        => new string(plate.Trim().ToUpperInvariant()
            .Where(char.IsLetterOrDigit)
            .ToArray());
}
