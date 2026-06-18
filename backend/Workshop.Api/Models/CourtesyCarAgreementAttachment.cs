namespace Workshop.Api.Models;

public sealed class CourtesyCarAgreementAttachment
{
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Name { get; set; } = "";
    public string MimeType { get; set; } = "";
    public long Size { get; set; }
    public string StoragePath { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}
