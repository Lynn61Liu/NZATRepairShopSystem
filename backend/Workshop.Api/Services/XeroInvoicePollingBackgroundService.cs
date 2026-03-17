using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class XeroInvoicePollingBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<XeroInvoicePollingBackgroundService> _logger;
    private readonly XeroWebhookOptions _options;

    public XeroInvoicePollingBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<XeroWebhookOptions> options,
        ILogger<XeroInvoicePollingBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.PollingEnabled)
            return;

        var interval = TimeSpan.FromMinutes(Math.Clamp(_options.PollIntervalMinutes, 1, 120));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Xero invoice polling cycle failed.");
            }

            await Task.Delay(interval, stoppingToken);
        }
    }

    private async Task PollAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var jobInvoiceService = scope.ServiceProvider.GetRequiredService<JobInvoiceService>();

        var invoiceIds = await db.JobInvoices.AsNoTracking()
            .Where(x => x.Provider == "xero" && x.ExternalInvoiceId != null)
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => x.ExternalInvoiceId!)
            .Take(Math.Clamp(_options.MaxInvoicesPerCycle, 1, 200))
            .ToListAsync(ct);

        foreach (var externalInvoiceId in invoiceIds)
        {
            if (!Guid.TryParse(externalInvoiceId, out var invoiceId))
                continue;

            var result = await jobInvoiceService.SyncFromXeroInvoiceIdAsync(invoiceId, ct);
            if (!result.Ok && result.StatusCode != 404)
            {
                _logger.LogWarning("Polling sync failed for Xero invoice {InvoiceId}: {Error}", invoiceId, result.Error);
            }
        }
    }
}
