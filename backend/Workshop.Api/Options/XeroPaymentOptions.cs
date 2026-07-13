namespace Workshop.Api.Options;

public sealed class XeroPaymentOptions
{
    public const string SectionName = "XeroPayments";

    public string? DefaultAccountCode { get; set; }
    public string? CashAccountCode { get; set; }
    public string? EpostAccountCode { get; set; }
    public string? EpostAccountId { get; set; }
    public string? EpostAccountName { get; set; } = "Business Premium Call Account";
    public string? EpostBankAccountNumber { get; set; } = "01-0221-0944312-01";
    public string? BankTransferAccountCode { get; set; }
}
