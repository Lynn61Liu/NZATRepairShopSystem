namespace Workshop.Api.Models
{
    public class InventoryMovement
    {
        public long Id { get; set; }

        public int MaterialId { get; set; }
        public WorkshopMaterial Material { get; set; } = null!;

        public int PreviousStock { get; set; }
        public int NewStock { get; set; }
        public int QuantityDelta { get; set; }

        public string MovementType { get; set; } = string.Empty;
        public string? Source { get; set; }
        public string? SourceFile { get; set; }
        public string? Note { get; set; }
        public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    }
}
