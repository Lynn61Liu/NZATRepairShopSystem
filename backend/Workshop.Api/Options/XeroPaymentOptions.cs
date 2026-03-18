namespace Workshop.Api.Options;

public sealed class XeroPaymentOptions
{
    public const string SectionName = "XeroPayments";

    public string? DefaultAccountCode { get; set; }
    public string? CashAccountCode { get; set; }
    public string? EpostAccountCode { get; set; }
    public string? BankTransferAccountCode { get; set; }
}
