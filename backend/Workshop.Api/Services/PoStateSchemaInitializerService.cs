using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed class PoStateSchemaInitializerService : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PoStateSchemaInitializerService> _logger;

    public PoStateSchemaInitializerService(
        IServiceScopeFactory scopeFactory,
        ILogger<PoStateSchemaInitializerService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var inventoryItemService = scope.ServiceProvider.GetRequiredService<InventoryItemService>();
        var serviceCatalogService = scope.ServiceProvider.GetRequiredService<ServiceCatalogService>();
        var poStateService = scope.ServiceProvider.GetRequiredService<JobPoStateService>();

        try
        {
            await inventoryItemService.EnsureSeededAsync(cancellationToken);
            await serviceCatalogService.EnsureSeededAsync(cancellationToken);
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE job_po_state ADD COLUMN IF NOT EXISTS sent_source TEXT;
                ALTER TABLE job_po_state ADD COLUMN IF NOT EXISTS manually_marked_sent_at TIMESTAMPTZ;
                ALTER TABLE job_po_state ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
                ALTER TABLE gmail_message_logs ADD COLUMN IF NOT EXISTS source TEXT;
                """, cancellationToken);

            await poStateService.EnsureStatesForNeedsPoJobsAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize PO state schema.");
            throw;
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
