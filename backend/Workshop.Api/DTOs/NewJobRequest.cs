using System.Text.Json.Serialization;

namespace Workshop.Api.DTOs;

public sealed class NewJobRequest
{
    public string Plate { get; set; } = "";
    public string[] Services { get; set; } = Array.Empty<string>();
    public bool CreateNewInvoice { get; set; } = true;
    public string? ExistingInvoiceNumber { get; set; }
    public bool UseServiceCatalogMapping { get; set; }
    public List<long> RootServiceCatalogItemIds { get; set; } = new();
    public List<long> WofServiceCatalogItemIds { get; set; } = new();
    public List<long> MechServiceCatalogItemIds { get; set; } = new();
    public List<long> PaintServiceCatalogItemIds { get; set; } = new();
    public string? Notes { get; set; }
    public string? PartsDescription { get; set; }
    public List<string> PartsDescriptions { get; set; } = new();
    public int? PaintPanels { get; set; }
    public string[] MechItems { get; set; } = Array.Empty<string>();
    public string? BusinessId { get; set; }
    public bool? NeedsPo { get; set; }
    [JsonPropertyName("needPO")]
    public bool? NeedPoLegacy
    {
        get => NeedsPo;
        set => NeedsPo = value;
    }
    public CustomerInput Customer { get; set; } = new();

    public sealed class CustomerInput
    {
        public string Type { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? Address { get; set; }
        public string? BusinessCode { get; set; }
        public string? Notes { get; set; }
    }
}
