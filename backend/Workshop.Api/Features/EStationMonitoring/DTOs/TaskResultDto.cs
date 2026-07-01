namespace Workshop.Api.Features.EStationMonitoring.DTOs;

public sealed class TaskResultDto
{
    public string ID { get; set; } = string.Empty;
    public int TotalCount { get; set; }
    public int SendCount { get; set; }
    public List<TaskItemResultDto> Results { get; set; } = [];
}

public sealed class TaskItemResultDto
{
    public string TagID { get; set; } = string.Empty;
    public string? Version { get; set; }
    public int ResultType { get; set; }
    public int RfPowerSend { get; set; }
    public int RfPowerRecv { get; set; }
    public int Battery { get; set; }
    public List<RgbDto> Colors { get; set; } = [];
    public int Group { get; set; }
}

public sealed class RgbDto
{
    public bool R { get; set; }
    public bool G { get; set; }
    public bool B { get; set; }
}
