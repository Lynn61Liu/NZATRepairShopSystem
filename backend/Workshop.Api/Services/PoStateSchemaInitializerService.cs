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

                CREATE OR REPLACE FUNCTION enforce_manual_po_sent_state()
                RETURNS TRIGGER
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    IF NEW.sent_source = 'manual'
                       AND NEW.manually_marked_sent_at IS NOT NULL
                       AND COALESCE(BTRIM(NEW.confirmed_po_number), '') = ''
                       AND COALESCE(BTRIM(NEW.detected_po_number), '') = ''
                       AND (NEW.first_request_sent_at IS NULL OR NEW.last_request_sent_at IS NULL)
                    THEN
                        NEW.status := 'AwaitingReply';
                        NEW.first_request_sent_at :=
                            COALESCE(NEW.first_request_sent_at, NEW.manually_marked_sent_at);
                        NEW.last_request_sent_at :=
                            COALESCE(NEW.last_request_sent_at, NEW.manually_marked_sent_at);
                    END IF;

                    RETURN NEW;
                END;
                $$;

                DROP TRIGGER IF EXISTS trg_enforce_manual_po_sent_state ON job_po_state;
                CREATE TRIGGER trg_enforce_manual_po_sent_state
                BEFORE INSERT OR UPDATE ON job_po_state
                FOR EACH ROW
                EXECUTE FUNCTION enforce_manual_po_sent_state();

                UPDATE job_po_state
                SET status = 'AwaitingReply',
                    first_request_sent_at = COALESCE(first_request_sent_at, manually_marked_sent_at),
                    last_request_sent_at = COALESCE(last_request_sent_at, manually_marked_sent_at),
                    updated_at = NOW()
                WHERE sent_source = 'manual'
                  AND manually_marked_sent_at IS NOT NULL
                  AND COALESCE(BTRIM(confirmed_po_number), '') = ''
                  AND COALESCE(BTRIM(detected_po_number), '') = ''
                  AND (first_request_sent_at IS NULL OR last_request_sent_at IS NULL);
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
