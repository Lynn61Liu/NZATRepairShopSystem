namespace Workshop.Api.Models;

public class PaymarkTransaction
{
    public long Id { get; set; }
    public string TransactionKey { get; set; } = "";
    public string CardAcceptorIdCode { get; set; } = "";
    public string TerminalId { get; set; } = "";
    public string RetrievalRef { get; set; } = "";
    public long TransactionNumber { get; set; }
    public DateTime TransactionTimeUtc { get; set; }
    public DateOnly? SettlementDate { get; set; }
    public string CardLogo { get; set; } = "";
    public string Suffix { get; set; } = "";
    public int? TranType { get; set; }
    public decimal TransactionAmount { get; set; }
    public decimal PurchaseAmount { get; set; }
    public decimal CashoutAmount { get; set; }
    public string Status { get; set; } = "";
    public string ActionCode { get; set; } = "";
    public string Bin { get; set; } = "";
    public long? MatchedJobId { get; set; }
    public string? LocalNote { get; set; }
    public string? RawPayloadJson { get; set; }
    public DateTime ImportedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
