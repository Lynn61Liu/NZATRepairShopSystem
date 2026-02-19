namespace Workshop.Api.DTOs;

public sealed class NewJobRequest
{
    public string Plate { get; set; } = "";
    public string[] Services { get; set; } = Array.Empty<string>();
    public string? Notes { get; set; }
    public string? PartsDescription { get; set; }
    public int? PaintPanels { get; set; }
    public string? BusinessId { get; set; }
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
