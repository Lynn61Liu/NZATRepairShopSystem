namespace Workshop.Api.Models;

public class CourtesyCarAgreementEvent
{
    public long Id { get; set; }
    public long CourtesyCarAgreementId { get; set; }
    public CourtesyCarAgreement? CourtesyCarAgreement { get; set; }
    public string EventType { get; set; } = "";
    public string? ActorType { get; set; }
    public string? ActorName { get; set; }
    public string? PayloadJson { get; set; }
    public DateTime CreatedAt { get; set; }
}
