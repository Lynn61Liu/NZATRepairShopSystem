using NpgsqlTypes;

namespace Workshop.Api.Models;

public class JobWofRecordItem
{
    public long Id { get; set; }
    public long JobWofRecordId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public WofItemStatus Status { get; set; } = WofItemStatus.Pass;
    public long? FailReasonId { get; set; }
    public int SortOrder { get; set; }
    public string? InputValue { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public enum WofItemStatus
{
    [PgName("pass")] Pass,
    [PgName("fail")] Fail,
    [PgName("na")] NA
}
