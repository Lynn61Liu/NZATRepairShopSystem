namespace Workshop.Api.Models;

public enum JobPoStateStatus
{
    Draft = 0,
    AwaitingReply = 1,
    PendingConfirmation = 2,
    PoConfirmed = 3,
    EscalationRequired = 4,
    Completed = 5,
    Cancelled = 6,
}
