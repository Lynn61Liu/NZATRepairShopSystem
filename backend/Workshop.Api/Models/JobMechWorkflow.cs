namespace Workshop.Api.Models;

public static class MechWorkflowStatus
{
    public const string OnHold = "on_hold";
    public const string WaitingParts = "waiting_parts";
    public const string PartsTransit = "parts_transit";
    public const string WaitingRepair = "waiting_repair";
    public const string RepairCompleted = "repair_completed";
    public const string WofQueue = "wof_queue";
    public const string ReadyPickup = "ready_pickup";
    public const string Delivered = "delivered";

    public static readonly string[] All =
    [
        OnHold,
        WaitingParts,
        PartsTransit,
        WaitingRepair,
        RepairCompleted,
        WofQueue,
        ReadyPickup,
        Delivered,
    ];
}

public sealed class JobMechWorkflow
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public string Status { get; set; } = MechWorkflowStatus.WaitingRepair;
    public DateTime? PartsArrivedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
