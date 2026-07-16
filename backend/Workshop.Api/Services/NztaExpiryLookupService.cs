using System.Globalization;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Playwright;
using Microsoft.Extensions.Options;
using System.Text.Json;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class NztaExpiryLookupService
{
    private static readonly SemaphoreSlim InteractiveBrowserLock = new(1, 1);
    private static readonly JsonSerializerOptions BrowserJsonOptions = new(JsonSerializerDefaults.Web);
    private const string CheckExpiryUrl = "https://transact.nzta.govt.nz/v2/check-expiry";
    private const string VehicleExpiryApiPath = "/v2/api/vehicles/expiry/details";
    private const float DefaultTimeoutMs = 25000;
    private static readonly CultureInfo NzCulture = CultureInfo.GetCultureInfo("en-NZ");
    private static readonly string[] DateFormats =
    [
        "d MMM yyyy",
        "dd MMM yyyy",
        "d MMMM yyyy",
        "dd MMMM yyyy",
        "d/M/yyyy",
        "dd/M/yyyy",
        "d/MM/yyyy",
        "dd/MM/yyyy",
        "yyyy-MM-dd",
    ];

    private static readonly Regex InspectionExpiryPattern = new(
        @"(?is)\b(?<type>wof|cof|warrant\s+of\s+fitness|certificate\s+of\s+fitness|wof/cof)\b.{0,220}?\b(?<date>\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2})\b",
        RegexOptions.Compiled);

    private readonly ILogger<NztaExpiryLookupService> _logger;
    private readonly NztaBrowserOptions _browserOptions;

    public NztaExpiryLookupService(
        ILogger<NztaExpiryLookupService> logger,
        IOptions<NztaBrowserOptions> browserOptions)
    {
        _logger = logger;
        _browserOptions = browserOptions.Value;
    }

    public async Task<NztaExpiryLookupResult> LookupInspectionExpiryAsync(string plate, CancellationToken ct)
    {
        var details = await LookupVehicleDetailsAsync(plate, ct);
        if (!details.Success || details.WofExpiry is null)
            return NztaExpiryLookupResult.Failed(details.Error ?? "NZTA lookup failed.", details.RawText);

        return NztaExpiryLookupResult.Found(details.WofExpiry.Value, "WOF", details.RawText);
    }

    public async Task<NztaVehicleDetailsLookupResult> LookupVehicleDetailsAsync(string plate, CancellationToken ct)
    {
        var normalizedPlate = NormalizePlate(plate);
        if (string.IsNullOrWhiteSpace(normalizedPlate))
            return NztaVehicleDetailsLookupResult.Failed("Plate is empty after normalization.");

        try
        {
            ct.ThrowIfCancellationRequested();
            using var playwright = await Playwright.CreateAsync();
            await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
            {
                Headless = true,
                Args = ["--disable-dev-shm-usage", "--no-sandbox"],
            });

            var context = await browser.NewContextAsync(new BrowserNewContextOptions
            {
                Locale = "en-NZ",
                ViewportSize = new ViewportSize { Width = 1280, Height = 900 },
                UserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143 Safari/537.36",
            });

            var page = await context.NewPageAsync();
            page.SetDefaultTimeout(DefaultTimeoutMs);

            await page.GotoAsync(CheckExpiryUrl, new PageGotoOptions
            {
                WaitUntil = WaitUntilState.DOMContentLoaded,
                Timeout = DefaultTimeoutMs,
            });

            ct.ThrowIfCancellationRequested();
            var input = page.Locator("#plate");
            await input.WaitForAsync(new LocatorWaitForOptions { Timeout = DefaultTimeoutMs });
            await input.FillAsync(normalizedPlate);

            var responseTask = page.WaitForResponseAsync(
                response => response.Url.Contains(VehicleExpiryApiPath, StringComparison.OrdinalIgnoreCase),
                new PageWaitForResponseOptions { Timeout = DefaultTimeoutMs });

            await ClickContinueAsync(page);
            var response = await responseTask;

            ct.ThrowIfCancellationRequested();
            var bodyText = await response.TextAsync();

            if (!response.Ok)
            {
                return NztaVehicleDetailsLookupResult.Failed(
                    $"NZTA API returned status {(int)response.Status}.",
                    Truncate(bodyText, 2000));
            }

            using var json = JsonDocument.Parse(bodyText);
            var resolved = ResolveVehicleDetails(json.RootElement);
            return NztaVehicleDetailsLookupResult.Found(
                resolved.WofExpiry,
                resolved.LicenceExpiry,
                resolved.RucLicenceNumber,
                resolved.RucEndDistance,
                Truncate(bodyText, 2000));
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NZTA WOF/COF expiry lookup failed for plate {Plate}", normalizedPlate);
            return NztaVehicleDetailsLookupResult.Failed(ex.Message);
        }
    }

    public async Task<NztaVehicleDetailsLookupResult> LookupVehicleDetailsInteractiveAsync(string plate, CancellationToken ct)
    {
        var normalizedPlate = NormalizePlate(plate);
        if (string.IsNullOrWhiteSpace(normalizedPlate))
            return NztaVehicleDetailsLookupResult.Failed("Plate is empty after normalization.");

        if (!await InteractiveBrowserLock.WaitAsync(0, ct))
            return NztaVehicleDetailsLookupResult.Failed("Another NZTA browser lookup is already running. Please wait and try again.");

        Process? process = null;
        try
        {
            var shellDirectory = FindShellDirectory();
            var scriptPath = Path.Combine(shellDirectory, "scripts", "nztaSingleLookup.mjs");
            var timeoutSeconds = Math.Max(60, _browserOptions.TimeoutSeconds);
            var payload = JsonSerializer.Serialize(new
            {
                plate = normalizedPlate,
                profilePath = ResolveProfilePath(_browserOptions.BrowserProfilePath),
                timeoutMs = timeoutSeconds * 1000,
            }, BrowserJsonOptions);

            var startInfo = new ProcessStartInfo("node")
            {
                WorkingDirectory = shellDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            startInfo.ArgumentList.Add(scriptPath);
            startInfo.ArgumentList.Add(payload);

            process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Failed to start the NZTA browser process.");

            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds + 15));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
            var stdoutTask = process.StandardOutput.ReadToEndAsync(linkedCts.Token);
            var stderrTask = process.StandardError.ReadToEndAsync(linkedCts.Token);

            try
            {
                await process.WaitForExitAsync(linkedCts.Token);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                TryKillProcess(process);
                return NztaVehicleDetailsLookupResult.Failed(
                    "NZTA browser lookup timed out. Please complete the verification in Chrome and try again.");
            }

            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0)
            {
                _logger.LogWarning("NZTA browser process exited {ExitCode}: {Error}", process.ExitCode, stderr);
                return NztaVehicleDetailsLookupResult.Failed("NZTA browser process failed.");
            }

            var response = JsonSerializer.Deserialize<NztaBrowserResponse>(stdout, BrowserJsonOptions);
            if (response is null)
            {
                _logger.LogWarning("NZTA browser returned an invalid response: {Response}", Truncate(stdout, 1000));
                return NztaVehicleDetailsLookupResult.Failed("NZTA browser returned an invalid response.");
            }

            if (!response.Success)
            {
                _logger.LogWarning(
                    "NZTA interactive lookup returned status {Status}: {Response}",
                    response.Status,
                    Truncate(response.Text ?? "", 1000));
                return NztaVehicleDetailsLookupResult.Failed(
                    response.Error ?? $"NZTA API returned status {response.Status}.",
                    Truncate(response.Text ?? "", 2000));
            }

            using var json = JsonDocument.Parse(response.Text ?? "{}");
            var resolved = ResolveVehicleDetails(json.RootElement);
            return NztaVehicleDetailsLookupResult.Found(
                resolved.WofExpiry,
                resolved.LicenceExpiry,
                resolved.RucLicenceNumber,
                resolved.RucEndDistance,
                Truncate(response.Text ?? "", 2000));
        }
        catch (OperationCanceledException)
        {
            if (process is not null)
                TryKillProcess(process);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NZTA interactive vehicle lookup failed for plate {Plate}", normalizedPlate);
            return NztaVehicleDetailsLookupResult.Failed(ex.Message);
        }
        finally
        {
            process?.Dispose();
            InteractiveBrowserLock.Release();
        }
    }

    private static void TryKillProcess(Process process)
    {
        try
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
        }
        catch
        {
            // Best effort cleanup when the request is cancelled or times out.
        }
    }

    private static string ResolveProfilePath(string path)
    {
        if (path.StartsWith("~/", StringComparison.Ordinal))
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), path[2..]);

        return Environment.ExpandEnvironmentVariables(path);
    }

    private static string FindShellDirectory()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "apps", "shell", "scripts", "nztaSingleLookup.mjs");
            if (File.Exists(candidate))
                return Path.Combine(current.FullName, "apps", "shell");

            current = current.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate the NZTA browser lookup script.");
    }

    private static async Task ClickContinueAsync(IPage page)
    {
        var continueButton = page.GetByText("Continue", new PageGetByTextOptions { Exact = true });
        if (await continueButton.CountAsync() > 0)
        {
            await continueButton.First.ClickAsync();
            return;
        }

        await page.Locator("button,input[type=submit]").First.ClickAsync();
    }

    private static (DateOnly ExpiryDate, string InspectionType)? TryParseInspectionExpiry(string bodyText)
    {
        foreach (Match match in InspectionExpiryPattern.Matches(bodyText))
        {
            var dateText = match.Groups["date"].Value.Trim();
            if (!DateOnly.TryParseExact(dateText, DateFormats, NzCulture, DateTimeStyles.None, out var expiryDate))
                continue;

            var typeText = match.Groups["type"].Value;
            var inspectionType = typeText.Trim().StartsWith("cof", StringComparison.OrdinalIgnoreCase) ||
                                 typeText.Contains("certificate", StringComparison.OrdinalIgnoreCase)
                ? "COF"
                : "WOF";

            return (expiryDate, inspectionType);
        }

        return null;
    }

    private static string NormalizePlate(string plate)
        => new(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private static ResolvedVehicleDetails ResolveVehicleDetails(JsonElement payload)
    {
        var wofExpiry = TryReadDateOnly(payload, "latestInspectionDetails", "expiryDate");
        var licenceExpiry = TryReadDateOnly(payload, "latestLicenceDetails", "expiryDate");
        var hasCurrentRuc = TryReadBoolean(payload, "latestRUCDetails", "hasCurrentRUCLicence");

        int? rucLicenceNumber = null;
        int? rucEndDistance = null;
        if (hasCurrentRuc == true)
        {
            rucLicenceNumber = TryReadInt(payload, "latestRUCDetails", "rucLicenceNumber");
            rucEndDistance = TryReadInt(payload, "latestRUCDetails", "endDistance");
        }

        return new ResolvedVehicleDetails(wofExpiry, licenceExpiry, rucLicenceNumber, rucEndDistance);
    }

    private static DateOnly? TryReadDateOnly(JsonElement root, string sectionName, string propertyName)
    {
        if (!TryReadString(root, sectionName, propertyName, out var value) || string.IsNullOrWhiteSpace(value))
            return null;

        var dateText = value.Trim();
        if (DateOnly.TryParseExact(dateText, DateFormats, NzCulture, DateTimeStyles.None, out var exactDate))
            return exactDate;

        if (DateTime.TryParse(dateText, NzCulture, DateTimeStyles.AssumeLocal, out var timestamp))
            return DateOnly.FromDateTime(timestamp);

        return null;
    }

    private static int? TryReadInt(JsonElement root, string sectionName, string propertyName)
    {
        if (!root.TryGetProperty(sectionName, out var section) || section.ValueKind != JsonValueKind.Object)
            return null;

        if (!section.TryGetProperty(propertyName, out var property))
            return null;

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var intValue))
            return intValue;

        if (property.ValueKind == JsonValueKind.String &&
            int.TryParse(property.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
            return parsed;

        return null;
    }

    private static bool? TryReadBoolean(JsonElement root, string sectionName, string propertyName)
    {
        if (!root.TryGetProperty(sectionName, out var section) || section.ValueKind != JsonValueKind.Object)
            return null;

        if (!section.TryGetProperty(propertyName, out var property))
            return null;

        if (property.ValueKind is JsonValueKind.True or JsonValueKind.False)
            return property.GetBoolean();

        if (property.ValueKind == JsonValueKind.String &&
            bool.TryParse(property.GetString(), out var parsed))
            return parsed;

        return null;
    }

    private static bool TryReadString(JsonElement root, string sectionName, string propertyName, out string? value)
    {
        value = null;
        if (!root.TryGetProperty(sectionName, out var section) || section.ValueKind != JsonValueKind.Object)
            return false;

        if (!section.TryGetProperty(propertyName, out var property))
            return false;

        if (property.ValueKind == JsonValueKind.String)
        {
            value = property.GetString();
            return true;
        }

        return false;
    }

    private static string Truncate(string value, int maxLength)
        => value.Length <= maxLength ? value : value[..maxLength];
}

sealed class NztaBrowserResponse
{
    public bool Success { get; set; }
    public int Status { get; set; }
    public string? Error { get; set; }
    public string? Text { get; set; }
}

public sealed record NztaVehicleDetailsLookupResult(
    bool Success,
    DateOnly? WofExpiry,
    DateOnly? LicenceExpiry,
    int? RucLicenceNumber,
    int? RucEndDistance,
    string? Error,
    string? RawText)
{
    public static NztaVehicleDetailsLookupResult Found(
        DateOnly? wofExpiry,
        DateOnly? licenceExpiry,
        int? rucLicenceNumber,
        int? rucEndDistance,
        string? rawText) =>
        new(true, wofExpiry, licenceExpiry, rucLicenceNumber, rucEndDistance, null, rawText);

    public static NztaVehicleDetailsLookupResult Failed(string error, string? rawText = null) =>
        new(false, null, null, null, null, error, rawText);
}

sealed record ResolvedVehicleDetails(
    DateOnly? WofExpiry,
    DateOnly? LicenceExpiry,
    int? RucLicenceNumber,
    int? RucEndDistance);

public sealed record NztaExpiryLookupResult(
    bool Success,
    DateOnly? ExpiryDate,
    string? InspectionType,
    string? Error,
    string? RawText)
{
    public static NztaExpiryLookupResult Found(DateOnly expiryDate, string inspectionType, string? rawText) =>
        new(true, expiryDate, inspectionType, null, rawText);

    public static NztaExpiryLookupResult Failed(string error, string? rawText = null) =>
        new(false, null, null, error, rawText);
}
