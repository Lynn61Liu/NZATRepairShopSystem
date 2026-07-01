namespace Workshop.Api.Features.JobLightBindings.DTOs;

public sealed record CreateJobLightBindingRequest(string TagId);

public sealed record JobLightBindingResponse(
    long Id,
    long JobId,
    string Plate,
    string StationId,
    string TagId,
    int GroupNo,
    string Status,
    string? FailureReason,
    DateTime? LastResultAt);

public sealed record DeviceLightBindingResponse(
    long Id,
    long JobId,
    string Plate,
    string StationId,
    string TagId,
    int GroupNo,
    string Status,
    int? BatteryPercent,
    string? CurrentColor,
    bool IsLightOn,
    DateTime? LastSeenAt,
    DateTime? LastResultAt,
    string? FailureReason);

public sealed record JobLightBindingOperationResult(
    bool Success,
    JobLightBindingResponse? Binding,
    string? ErrorMessage);
