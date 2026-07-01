namespace Workshop.Api.Features.JobLightBindings.Models;

public static class LightBindingStatus
{
    public const string PendingBind = "PendingBind";
    public const string Bound = "Bound";
    public const string BindFailed = "BindFailed";
    public const string PendingUnbind = "PendingUnbind";
    public const string Unbound = "Unbound";

    public static readonly string[] ActiveStatuses =
    [
        PendingBind,
        Bound,
    ];
}
