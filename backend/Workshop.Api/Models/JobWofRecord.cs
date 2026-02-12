using NpgsqlTypes;

namespace Workshop.Api.Models;

public class JobWofRecord
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public DateTime OccurredAt { get; set; }
    public string Rego { get; set; } = "";
    public string? MakeModel { get; set; }
    public string? Odo { get; set; }
    public WofRecordState RecordState { get; set; }
    public bool? IsNewWof { get; set; }
    public DateOnly? NewWofDate { get; set; }
    public string? AuthCode { get; set; }
    public string? CheckSheet { get; set; }
    public string? CsNo { get; set; }
    public string? WofLabel { get; set; }
    public string? LabelNo { get; set; }
    public string? FailReasons { get; set; }
    public DateOnly? PreviousExpiryDate { get; set; }
    public string OrganisationName { get; set; } = "";
    public int ExcelRowNo { get; set; }
    public string? SourceFile { get; set; }
    public string? Note { get; set; }
    public WofUiState WofUiState { get; set; }
    public DateTime ImportedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public enum WofRecordState
{
    [PgName("pass")] Pass,
    [PgName("fail")] Fail,
    [PgName("recheck")] Recheck
}

public enum WofUiState
{
    [PgName("pass")] Pass,
    [PgName("fail")] Fail,
    [PgName("recheck")] Recheck,
    [PgName("printed")] Printed
}
