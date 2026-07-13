namespace Workshop.Api.Models;

public class PaymarkQuickJobOption
{
    public long Id { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public string ServiceType { get; set; } = "mech";
    public string Description { get; set; } = "";
    public string? XeroItemCode { get; set; }
    public string? AccountCode { get; set; }
    public string? TaxType { get; set; }
    public decimal DefaultAmountInclGst { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
