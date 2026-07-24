namespace Workshop.Api.Models;

public class WofCalendarRecord
{
    public long Id { get; set; }
    public string SourceFile { get; set; } = "";
    public int ExcelRowNo { get; set; }
    public long? JobId { get; set; }
    public DateTime OccurredAt { get; set; }
    public string Rego { get; set; } = "";
    public string? MakeModel { get; set; }
    public WofRecordState RecordState { get; set; }
    public DateTime ImportedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
