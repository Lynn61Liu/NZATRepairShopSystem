using NpgsqlTypes;

namespace Workshop.Api.Models;

public class JobPartsService
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public string Description { get; set; } = "";
    public PartsServiceStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class JobPartsNote
{
    public long Id { get; set; }
    public long PartsServiceId { get; set; }
    public string Note { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public enum PartsServiceStatus
{
    [PgName("pending_order")] PendingOrder,
    [PgName("needs_pt")] NeedsPt,
    [PgName("parts_trader")] PartsTrader,
    [PgName("pickup_or_transit")] PickupOrTransit
}
