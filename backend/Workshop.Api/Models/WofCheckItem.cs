namespace Workshop.Api.Models;

public class WofCheckItem
{
    public long Id { get; set; }
    public long WofId { get; set; }
    public string? Odo { get; set; }
    public string? AuthCode { get; set; }
    public string? CheckSheet { get; set; }
    public string? CsNo { get; set; }
    public string? WofLabel { get; set; }
    public string? LabelNo { get; set; }
    public string Source { get; set; } = "google_sheet";
    public string? SourceRow { get; set; }
    public DateTime UpdatedAt { get; set; }
}
