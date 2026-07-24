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
    public WofItemStatus E1 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E2 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E3 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E5 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E6 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E7 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E8 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E9 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E10 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E11 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E12 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E13 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E14 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E15 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E16 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E17 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E18 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E19 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus E20 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I1 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I2 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I3 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I4 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I5 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I6 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I7 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I8 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I9 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I10 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I11 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I12 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus I13 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C1 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C2 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C3 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C4 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C5 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C6 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C7 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C8 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C9 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C10 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C11 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus C12 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus R1 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus R2 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus R3 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus R4 { get; set; } = WofItemStatus.NA;
    public WofItemStatus R5 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus U1 { get; set; } = WofItemStatus.NA;
    public WofItemStatus U2 { get; set; } = WofItemStatus.NA;
    public WofItemStatus U3 { get; set; } = WofItemStatus.NA;
    public WofItemStatus U4 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus U5 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus U6 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus U7 { get; set; } = WofItemStatus.Pass;
    public WofItemStatus U8 { get; set; } = WofItemStatus.Pass;
    public decimal? Cfl { get; set; }
    public decimal? Cfr { get; set; }
    public decimal? Crl { get; set; }
    public decimal? Crr { get; set; }
    public decimal? Pbrl { get; set; }
    public decimal? Pbrr { get; set; }
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
