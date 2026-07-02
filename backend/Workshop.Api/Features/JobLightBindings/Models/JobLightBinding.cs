namespace Workshop.Api.Features.JobLightBindings.Models;

public sealed class JobLightBinding
{
    public long Id { get; set; }
    public long? JobId { get; set; }
    public string Plate { get; set; } = string.Empty;
    public string StationId { get; set; } = string.Empty;
    public string TagId { get; set; } = string.Empty;
    public int GroupNo { get; set; }
    public string Status { get; set; } = LightBindingStatus.PendingBind;
    public string? FailureReason { get; set; }
    public DateTime? LastResultAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
