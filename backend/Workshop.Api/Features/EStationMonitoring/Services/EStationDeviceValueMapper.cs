using Workshop.Api.Features.EStationMonitoring.DTOs;

namespace Workshop.Api.Features.EStationMonitoring.Services;

public static class EStationDeviceValueMapper
{
    public const int ButtonPressResultType = 253;
    public const int CommunicationResultType = 254;
    public const int LightHeartbeatResultType = 255;

    public static string ToColorName(RgbDto rgb)
    {
        if (rgb.R && rgb.G && rgb.B) return "White";
        if (rgb.R && rgb.G) return "Yellow";
        if (rgb.G && rgb.B) return "Cyan";
        if (rgb.R && rgb.B) return "Purple";
        if (rgb.R) return "Red";
        if (rgb.G) return "Green";
        if (rgb.B) return "Blue";
        return "Off";
    }

    public static decimal? ToVoltage(int battery)
    {
        if (battery <= 0) return null;
        return battery / 10.0m;
    }

    public static int? ToBatteryPercent(int battery)
    {
        if (battery <= 0) return null;

        var voltage = battery / 10.0m;
        if (voltage >= 3.0m) return 100;
        if (voltage >= 2.9m) return 90;
        if (voltage >= 2.8m) return 80;
        if (voltage >= 2.7m) return 60;
        if (voltage >= 2.6m) return 30;
        if (voltage >= 2.5m) return 10;
        return 0;
    }

    public static string ResultTypeLabel(int? resultType)
        => resultType switch
        {
            ButtonPressResultType => "Button Press",
            CommunicationResultType => "Communication Result",
            LightHeartbeatResultType => "Light Heartbeat",
            null => "Unknown",
            _ => "Unknown",
        };
}
