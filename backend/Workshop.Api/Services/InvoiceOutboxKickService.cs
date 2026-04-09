using System.Diagnostics;

namespace Workshop.Api.Services;

public sealed class InvoiceOutboxKickService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<InvoiceOutboxKickService> _logger;

    public InvoiceOutboxKickService(
        IServiceScopeFactory scopeFactory,
        ILogger<InvoiceOutboxKickService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void Dispatch(long messageId, long jobId, string segmentName, bool alreadyStarted = false)
    {
        _ = Task.Run(async () =>
        {
            var stopwatch = Stopwatch.StartNew();
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var outboxService = scope.ServiceProvider.GetRequiredService<InvoiceOutboxService>();
                var processed = alreadyStarted
                    ? await outboxService.TryProcessClaimedMessageNowAsync(messageId, CancellationToken.None)
                    : await outboxService.TryProcessMessageNowAsync(messageId, CancellationToken.None);
                stopwatch.Stop();
                _logger.LogInformation(
                    "New job segment {Segment} completed in {ElapsedMs} ms for job {JobId} (messageId: {MessageId}, processedInline: {ProcessedInline})",
                    segmentName,
                    stopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    messageId,
                    processed);
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                _logger.LogWarning(
                    ex,
                    "Async invoice outbox kick failed for segment {Segment}, job {JobId}, message {MessageId} after {ElapsedMs} ms",
                    segmentName,
                    jobId,
                    messageId,
                    stopwatch.Elapsed.TotalMilliseconds);
            }
        });
    }
}
