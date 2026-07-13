using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class CarOnYardReportService
{
    private const int OverdueDays = 4;
    private const string DefaultRecipients = "info@nzautotech.co.nz";
    private const string DefaultSendTimes = "09:30,17:30";
    private const string DefaultSubject = "Car On Yard";
    private const string DefaultTimeZoneId = "Pacific/Auckland";

    private readonly AppDbContext _db;
    private readonly GmailMessageSenderService _gmailMessageSenderService;

    public CarOnYardReportService(AppDbContext db, GmailMessageSenderService gmailMessageSenderService)
    {
        _db = db;
        _gmailMessageSenderService = gmailMessageSenderService;
    }

    public async Task<CarOnYardReportSettingsDto> GetSettingsAsync(CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsEntityAsync(ct);
        return MapSettings(settings);
    }

    public async Task<CarOnYardReportSettingsDto> UpdateSettingsAsync(CarOnYardReportSettingsUpdateRequest request, CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsEntityAsync(ct);
        var recipients = NormalizeRecipients(request.Recipients);
        var sendTimes = NormalizeSendTimes(request.SendTimes);

        if (recipients.Length == 0)
            throw new InvalidOperationException("At least one recipient is required.");
        if (sendTimes.Length == 0)
            throw new InvalidOperationException("At least one send time is required.");

        settings.Enabled = request.Enabled;
        settings.Recipients = string.Join(",", recipients);
        settings.SendTimes = string.Join(",", sendTimes);
        settings.Subject = string.IsNullOrWhiteSpace(request.Subject) ? DefaultSubject : request.Subject.Trim();
        settings.TimeZoneId = string.IsNullOrWhiteSpace(request.TimeZoneId) ? DefaultTimeZoneId : request.TimeZoneId.Trim();
        settings.UpdatedAt = DateTime.UtcNow;
        settings.LastError = null;

        await _db.SaveChangesAsync(ct);
        return MapSettings(settings);
    }

    public async Task<CarOnYardReportSendResult> SendReportAsync(string slotKey, CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsEntityAsync(ct);
        if (!settings.Enabled)
            return new CarOnYardReportSendResult(false, "Report is disabled.");

        var recipients = NormalizeRecipients(settings.Recipients);
        if (recipients.Length == 0)
            return new CarOnYardReportSendResult(false, "No recipients configured.");

        if (string.Equals(settings.LastSentSlotKey, slotKey, StringComparison.OrdinalIgnoreCase))
            return new CarOnYardReportSendResult(false, "Report already sent for this slot.");

        var report = await BuildReportAsync(settings.TimeZoneId, ct);
        var html = BuildHtmlReport(report);
        var plain = BuildPlainTextReport(report);

        var sendResult = await _gmailMessageSenderService.SendAsync(
            new GmailMessageSendRequest(
                To: string.Join(", ", recipients),
                Subject: settings.Subject,
                Body: plain,
                CorrelationId: $"car-on-yard-report:{slotKey}",
                ThreadId: null,
                ReplyToRfcMessageId: null,
                ReferencesHeader: null,
                GmailAccountId: null,
                IsHtmlBody: true,
                HtmlBodyOverride: html),
            ct);

        if (!sendResult.Ok)
        {
            settings.LastError = sendResult.Error;
            settings.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            return new CarOnYardReportSendResult(false, sendResult.Error ?? "Failed to send report.");
        }

        settings.LastSentSlotKey = slotKey;
        settings.LastSentAtUtc = DateTime.UtcNow;
        settings.LastError = null;
        settings.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return new CarOnYardReportSendResult(true, null);
    }

    public async Task<CarOnYardReportData> BuildReportAsync(string? timeZoneId, CancellationToken ct)
    {
        var tz = ResolveTimeZone(timeZoneId);
        var generatedAtNz = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);

        var rows = await (
            from job in _db.Jobs.AsNoTracking()
            join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id
            join customer in _db.Customers.AsNoTracking() on job.CustomerId equals customer.Id
            where job.Status != null && !EF.Functions.ILike(job.Status, "Archived")
            select new CarOnYardReportJob(
                job.Id,
                job.CreatedAt,
                string.IsNullOrWhiteSpace(customer.BusinessCode) ? "WI" : customer.BusinessCode.ToUpper(),
                vehicle.Plate ?? "",
                BuildVehicleModel(vehicle.Make, vehicle.Model, vehicle.Year),
                job.Notes ?? ""
            ))
            .OrderBy(x => x.DealerCode)
            .ThenBy(x => x.CreatedAtUtc)
            .ToListAsync(ct);

        var jobs = rows
            .Select(row => row with
            {
                AgeDays = Math.Max(0, (int)Math.Floor((DateTime.UtcNow - row.CreatedAtUtc).TotalDays)),
            })
            .OrderByDescending(x => x.AgeDays)
            .ThenBy(x => x.DealerCode)
            .ToArray();

        var dealers = jobs
            .GroupBy(x => x.DealerCode)
            .Select(group => new CarOnYardDealerSummary(
                group.Key,
                group.Count(),
                group.Count(x => x.AgeDays > OverdueDays),
                group.Max(x => x.AgeDays)))
            .OrderByDescending(x => x.MaxAgeDays)
            .ThenByDescending(x => x.Count)
            .ThenBy(x => x.DealerCode)
            .ToArray();

        return new CarOnYardReportData(generatedAtNz, jobs.Length, jobs.Count(x => x.AgeDays > OverdueDays), dealers, jobs);
    }

    private async Task<CarOnYardReportSettings> GetOrCreateSettingsEntityAsync(CancellationToken ct)
    {
        var settings = await _db.CarOnYardReportSettings.OrderBy(x => x.Id).FirstOrDefaultAsync(ct);
        if (settings is not null)
            return settings;

        settings = new CarOnYardReportSettings
        {
            Enabled = true,
            Recipients = DefaultRecipients,
            SendTimes = DefaultSendTimes,
            Subject = DefaultSubject,
            TimeZoneId = DefaultTimeZoneId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.CarOnYardReportSettings.Add(settings);
        await _db.SaveChangesAsync(ct);
        return settings;
    }

    public static string[] NormalizeRecipients(string? value)
        => (value ?? "")
            .Split(new[] { ',', ';', '\n', '\r', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(x => x.Contains('@') && x.Contains('.'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    public static string[] NormalizeSendTimes(string? value)
        => (value ?? "")
            .Split(new[] { ',', ';', '\n', '\r', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizeTime)
            .Where(x => x is not null)
            .Select(x => x!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToArray();

    private static string? NormalizeTime(string value)
    {
        var trimmed = value.Trim();
        if (TimeSpan.TryParseExact(trimmed, "h\\:mm", CultureInfo.InvariantCulture, out var shortTime)
            || TimeSpan.TryParseExact(trimmed, "hh\\:mm", CultureInfo.InvariantCulture, out shortTime))
        {
            if (shortTime >= TimeSpan.Zero && shortTime < TimeSpan.FromDays(1))
                return $"{(int)shortTime.TotalHours:00}:{shortTime.Minutes:00}";
        }

        return null;
    }

    private static CarOnYardReportSettingsDto MapSettings(CarOnYardReportSettings settings)
        => new(
            settings.Enabled,
            NormalizeRecipients(settings.Recipients),
            NormalizeSendTimes(settings.SendTimes),
            settings.Subject,
            settings.TimeZoneId,
            settings.LastSentAtUtc,
            settings.LastError);

    private static string BuildVehicleModel(string? make, string? model, int? year)
        => string.Join(" ", new[] { make, model, year?.ToString(CultureInfo.InvariantCulture) }
            .Where(x => !string.IsNullOrWhiteSpace(x)));

    private static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(string.IsNullOrWhiteSpace(timeZoneId) ? DefaultTimeZoneId : timeZoneId);
        }
        catch
        {
            return TimeZoneInfo.FindSystemTimeZoneById(DefaultTimeZoneId);
        }
    }

    private static string BuildPlainTextReport(CarOnYardReportData report)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Car On Yard - {report.GeneratedAtNz:yyyy-MM-dd HH:mm} NZT");
        sb.AppendLine($"Open cars: {report.TotalOpenCars}, over 4 days: {report.TotalOverdueCars}");
        sb.AppendLine();
        foreach (var dealer in report.Dealers)
            sb.AppendLine($"{dealer.DealerCode}: {dealer.Count} cars, {dealer.OverdueCount} over 4d, oldest {dealer.MaxAgeDays}d");
        sb.AppendLine();
        foreach (var job in report.Jobs.Take(80))
            sb.AppendLine($"{job.DealerCode} | {job.Plate} | {job.VehicleModel} | {job.AgeDays}d | {job.Notes}");
        return sb.ToString();
    }

    private static string BuildHtmlReport(CarOnYardReportData report)
    {
        static string H(string? value) => WebUtility.HtmlEncode(value ?? "");

        var dealerRows = string.Join("", report.Dealers.Select(dealer =>
            $"<tr><td><strong>{H(dealer.DealerCode)}</strong></td><td>{dealer.Count}</td><td>{dealer.OverdueCount}</td><td>{dealer.MaxAgeDays}d</td></tr>"));

        var jobRows = string.Join("", report.Jobs.Take(100).Select(job =>
        {
            var tone = job.AgeDays >= 8 ? "#fee2e2" : job.AgeDays >= 5 ? "#ffedd5" : "#ffffff";
            return $"<tr style=\"background:{tone}\"><td>{H(job.DealerCode)}</td><td><strong>{H(job.Plate)}</strong></td><td>{H(job.VehicleModel)}</td><td>{job.AgeDays}d</td><td>{H(job.Notes)}</td></tr>";
        }));

        return $$"""
        <!doctype html>
        <html>
        <body style="margin:0;padding:0;background:#f6f7f9;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:760px;margin:0 auto;padding:20px 12px;">
            <h1 style="font-size:22px;margin:0 0 6px;">Car On Yard</h1>
            <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Generated {{report.GeneratedAtNz:yyyy-MM-dd HH:mm}} NZT</div>
            <div style="display:block;margin-bottom:16px;">
              <div style="display:inline-block;min-width:120px;margin:0 8px 8px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;">
                <div style="font-size:12px;color:#6b7280;">Open cars</div>
                <div style="font-size:28px;font-weight:700;">{{report.TotalOpenCars}}</div>
              </div>
              <div style="display:inline-block;min-width:120px;margin:0 8px 8px 0;padding:12px;border:1px solid #fecaca;border-radius:8px;background:#fff;">
                <div style="font-size:12px;color:#6b7280;">Over 4 days</div>
                <div style="font-size:28px;font-weight:700;color:#dc2626;">{{report.TotalOverdueCars}}</div>
              </div>
            </div>
            <h2 style="font-size:16px;margin:18px 0 8px;">Dealer Summary</h2>
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;font-size:13px;">
              <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:8px;">Code</th><th align="left" style="padding:8px;">Cars</th><th align="left" style="padding:8px;">Over 4d</th><th align="left" style="padding:8px;">Oldest</th></tr></thead>
              <tbody>{{dealerRows}}</tbody>
            </table>
            <h2 style="font-size:16px;margin:18px 0 8px;">Open Jobs</h2>
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;font-size:13px;">
              <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:8px;">Code</th><th align="left" style="padding:8px;">Plate</th><th align="left" style="padding:8px;">Vehicle</th><th align="left" style="padding:8px;">Age</th><th align="left" style="padding:8px;">Notes</th></tr></thead>
              <tbody>{{jobRows}}</tbody>
            </table>
          </div>
        </body>
        </html>
        """;
    }
}

public sealed record CarOnYardReportSettingsDto(
    bool Enabled,
    string[] Recipients,
    string[] SendTimes,
    string Subject,
    string TimeZoneId,
    DateTime? LastSentAtUtc,
    string? LastError);

public sealed record CarOnYardReportSettingsUpdateRequest(
    bool Enabled,
    string? Recipients,
    string? SendTimes,
    string? Subject,
    string? TimeZoneId);

public sealed record CarOnYardReportSendResult(bool Sent, string? Message);

public sealed record CarOnYardReportData(
    DateTime GeneratedAtNz,
    int TotalOpenCars,
    int TotalOverdueCars,
    IReadOnlyList<CarOnYardDealerSummary> Dealers,
    IReadOnlyList<CarOnYardReportJob> Jobs);

public sealed record CarOnYardDealerSummary(string DealerCode, int Count, int OverdueCount, int MaxAgeDays);

public sealed record CarOnYardReportJob(
    long JobId,
    DateTime CreatedAtUtc,
    string DealerCode,
    string Plate,
    string VehicleModel,
    string Notes)
{
    public int AgeDays { get; init; }
}
