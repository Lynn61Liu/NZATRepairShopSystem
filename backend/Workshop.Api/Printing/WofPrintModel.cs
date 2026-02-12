namespace Workshop.Api.Printing;

public enum WofPrintState
{
    Passed,
    Recheck,
    Failed
}

public class WofPrintModel
{
    public long JobId { get; init; }
    public long RecordId { get; init; }
    public WofPrintState PrintState { get; init; }
    public string RecordStateLabel { get; init; } = "";

    public string Rego { get; init; } = "";
    public string MakeModel { get; init; } = "";
    public string OdoText { get; init; } = "";
    public string OrganisationName { get; init; } = "";

    public string CustomerName { get; init; } = "";
    public string CustomerPhone { get; init; } = "";
    public string CustomerEmail { get; init; } = "";
    public string CustomerAddress { get; init; } = "";

    public string InspectionDate { get; init; } = "";
    public string InspectionNumber { get; init; } = "";

    public string RecheckDate { get; init; } = "";
    public string RecheckNumber { get; init; } = "";

    public bool IsNewWof { get; init; }
    public string NewWofDate { get; init; } = "";

    public string AuthCode { get; init; } = "";
    public string CheckSheet { get; init; } = "";
    public string CsNo { get; init; } = "";
    public string WofLabel { get; init; } = "";
    public string LabelNo { get; init; } = "";
    public string MsNumber { get; init; } = "";

    public string FailReasons { get; init; } = "";
    public string PreviousExpiryDate { get; init; } = "";
    public string FailRecheckDate { get; init; } = "";
    public string Note { get; init; } = "";
}
