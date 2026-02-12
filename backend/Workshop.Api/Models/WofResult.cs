namespace Workshop.Api.Models;

public class WofResult
{
    public long Id { get; set; }
    public long WofId { get; set; }
    public string Result { get; set; } = "";
    public DateOnly? RecheckExpiryDate { get; set; }
    public long? FailReasonId { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
}
