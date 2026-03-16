using System.ComponentModel.DataAnnotations;

namespace Workshop.Api.DTOs;

public sealed class CreateXeroInvoiceRequest
{
    public Guid? InvoiceId { get; set; }
    public string Type { get; set; } = "ACCREC";
    public string Status { get; set; } = "DRAFT";
    public string LineAmountTypes { get; set; } = "Exclusive";
    public DateOnly? Date { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateOnly? ExpectedPaymentDate { get; set; }
    public DateOnly? PlannedPaymentDate { get; set; }
    public string? InvoiceNumber { get; set; }
    public string? Reference { get; set; }
    public Guid? BrandingThemeId { get; set; }
    public string? CurrencyCode { get; set; }
    public decimal? CurrencyRate { get; set; }
    public bool? SentToContact { get; set; }
    public string? Url { get; set; }
    public XeroInvoiceContactInput Contact { get; set; } = new();

    [MinLength(1)]
    public List<XeroInvoiceLineItemInput> LineItems { get; set; } = new();
}

public sealed class XeroInvoiceContactInput : IValidatableObject
{
    public Guid? ContactId { get; set; }
    public string? Name { get; set; }
    public string? EmailAddress { get; set; }
    public string? ContactNumber { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (ContactId is null && string.IsNullOrWhiteSpace(Name))
        {
            yield return new ValidationResult(
                "Contact.contactId or Contact.name is required.",
                new[] { nameof(ContactId), nameof(Name) });
        }
    }
}

public sealed class XeroInvoiceLineItemInput : IValidatableObject
{
    [Required]
    public string Description { get; set; } = "";

    public decimal? Quantity { get; set; }
    public decimal? UnitAmount { get; set; }
    public decimal? LineAmount { get; set; }
    public string? ItemCode { get; set; }
    public string? AccountCode { get; set; }
    public string? TaxType { get; set; }
    public decimal? TaxAmount { get; set; }
    public decimal? DiscountRate { get; set; }
    public decimal? DiscountAmount { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrWhiteSpace(Description))
        {
            yield return new ValidationResult(
                "LineItems[].description is required.",
                new[] { nameof(Description) });
        }

        var hasQuantity = Quantity.HasValue;
        var hasUnitAmount = UnitAmount.HasValue;
        var hasLineAmount = LineAmount.HasValue;
        if ((hasQuantity ^ hasUnitAmount) && !hasLineAmount)
        {
            yield return new ValidationResult(
                "LineItems[] must provide quantity and unitAmount together, or provide lineAmount.",
                new[] { nameof(Quantity), nameof(UnitAmount), nameof(LineAmount) });
        }
    }
}
