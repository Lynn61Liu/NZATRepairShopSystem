namespace Workshop.Api.Options;

public sealed class PoFollowUpOptions
{
    public const string SectionName = "PoFollowUp";

    public bool Enabled { get; set; } = true;
    public int CheckIntervalSeconds { get; set; } = 60;
    public int PollIntervalSeconds { get; set; } = 60;
    public int? FollowUpDelayMinutesOverride { get; set; }
    public int? IntervalMinutesOverride { get; set; }
    public int FollowUpDelayWorkingHours { get; set; } = 5;
    public int WorkingHoursPerFollowUp { get; set; } = 5;
    public int WorkingDayStartHour { get; set; } = 9;
    public int WorkingDayEndHour { get; set; } = 17;
    public int MaxFollowUps { get; set; } = 2;
    public string TimeZoneId { get; set; } = "Pacific/Auckland";

    public int EffectiveCheckIntervalSeconds =>
        Math.Max(30, CheckIntervalSeconds > 0 ? CheckIntervalSeconds : PollIntervalSeconds);

    public int? EffectiveFollowUpDelayMinutesOverride =>
        FollowUpDelayMinutesOverride.HasValue && FollowUpDelayMinutesOverride.Value > 0
            ? FollowUpDelayMinutesOverride.Value
            : IntervalMinutesOverride.HasValue && IntervalMinutesOverride.Value > 0
                ? IntervalMinutesOverride.Value
                : null;

    public int EffectiveFollowUpDelayWorkingHours =>
        Math.Max(1, FollowUpDelayWorkingHours > 0 ? FollowUpDelayWorkingHours : WorkingHoursPerFollowUp);
}
