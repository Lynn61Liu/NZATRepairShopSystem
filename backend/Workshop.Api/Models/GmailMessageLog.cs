namespace Workshop.Api.Models;

public class GmailMessageLog
{
    public long Id { get; set; }
    public long? GmailAccountId { get; set; }
    public string? GmailAccountEmail { get; set; }
    public string GmailMessageId { get; set; } = "";
    public string? GmailThreadId { get; set; }
    public long? InternalDateMs { get; set; }
    public string Direction { get; set; } = "";
    public string CounterpartyEmail { get; set; } = "";
    public string? FromAddress { get; set; }
    public string? ToAddress { get; set; }
    public string? Subject { get; set; }
    public string? Body { get; set; }
    public string? Snippet { get; set; }
    public string? CorrelationId { get; set; }
    public string? RfcMessageId { get; set; }
    public string? ReferencesHeader { get; set; }
    public bool HasAttachments { get; set; }
    public string? AttachmentsJson { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public string? DetectedPoNumber { get; set; }
    public bool IsSystemInitiated { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
