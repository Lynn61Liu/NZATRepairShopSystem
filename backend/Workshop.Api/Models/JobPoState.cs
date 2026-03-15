namespace Workshop.Api.Models;

public class JobPoState
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public string CorrelationId { get; set; } = "";
    public string? CounterpartyEmail { get; set; }
    public JobPoStateStatus Status { get; set; } = JobPoStateStatus.Draft;
    public bool RequiresAdminAttention { get; set; }
    public string? AdminAttentionReason { get; set; }
    public string? ConfirmedPoNumber { get; set; }
    public string? DetectedPoNumber { get; set; }
    public DateTime? FirstRequestSentAt { get; set; }
    public DateTime? LastRequestSentAt { get; set; }
    public DateTime? LastFollowUpSentAt { get; set; }
    public DateTime? LastSupplierReplyAt { get; set; }
    public string? LastSupplierReplyMessageId { get; set; }
    public int FollowUpCount { get; set; }
    public bool FollowUpEnabled { get; set; } = true;
    public DateTime? NextFollowUpDueAt { get; set; }
    public DateTime? LastSyncedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
