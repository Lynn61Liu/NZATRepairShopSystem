# 自建 Broker 与 eStation 通信验证开发文档

本文档单独定义第一阶段链路：

```text
自建 MQTT Broker -> eStation 基站接入 -> Heartbeat 页面 -> Result 页面
```

第一阶段只解决通信验证和设备状态管理。不要在本阶段混入 Job Detail、New Job、工单绑定灯条、业务派工等 Job 业务逻辑。

## 目标

本阶段完成后，系统应该能够证明：

1. eStation 基站可以连接到我们自建的 MQTT Broker。
2. .NET 后台可以稳定收到基站 heartbeat。
3. .NET 后台可以稳定收到灯条 result。
4. 后台可以把基站和灯条状态落库，并能从 API 查询。
5. React 管理端可以显示基站在线状态和灯条最新状态。
6. 调试人员可以通过原始 MQTT 日志追踪通信问题。

本阶段不要求实现：

1. Job Detail 绑定灯条。
2. New Job 绑定灯条。
3. 工单状态驱动灯条状态。
4. 灯条与具体维修流程的业务关联。

## 架构边界

```text
eStation 基站
    |
    | MQTT connect / publish
    v
自建 MQTT Broker
    |
    | subscribe
    v
.NET BackgroundService
    |
    | parse / validate / upsert / log
    v
PostgreSQL
    |
    | REST API
    v
React Admin UI
```

核心原则：

1. Broker 只负责通信入口，不承担业务状态。
2. 后台先保存原始消息，再更新设备状态。
3. Heartbeat 管基站状态，Result 管灯条状态。
4. 状态页面只展示设备通信事实，不展示 Job 业务含义。
5. 所有离线、低电量、异常 payload 都应该可从日志追溯。

## Broker 选择与部署

第一版建议使用 EMQX。它带 Dashboard，适合验证基站是否连上 Broker、Topic 是否有消息、客户端是否频繁断线。

`docker-compose.yml` 示例：

```yaml
services:
  emqx:
    image: emqx/emqx:latest
    container_name: nzat-emqx
    restart: unless-stopped
    ports:
      - "1883:1883"
      - "8083:8083"
      - "18083:18083"
    environment:
      EMQX_DASHBOARD__DEFAULT_USERNAME: "${EMQX_DASHBOARD_USERNAME:-admin}"
      EMQX_DASHBOARD__DEFAULT_PASSWORD: "${EMQX_DASHBOARD_PASSWORD:-change-me}"
```

本地访问：

```text
http://localhost:18083
```

生产或现场网络不要使用默认密码。基站接入前，先确认后台服务器、Broker、基站处在可互通网络内，并确认 `1883` 端口可访问。

## 基站接入配置

在 eStation 配置中设置 MQTT Broker：

```text
Broker Host: <broker-ip-or-dns>
Broker Port: 1883
Username: <mqtt-username>
Password: <mqtt-password>
TLS: false
```

接入成功后，EMQX Dashboard 应看到基站 client 在线。基站通常会按配置周期发送 heartbeat，常见周期约为 20 秒。

基站 ID 格式建议校验：

```regex
^90A9F[0-9A-F]{7}$
```

灯条 ID 格式建议校验：

```regex
^AD1[0-9A-F]{9}$
```

校验失败时不要丢弃原始消息。应保存到 `MqttMessageLog`，并把处理状态标为 `InvalidPayload` 或 `InvalidIdentifier`，方便现场排查。

## MQTT Topic 约定

第一阶段只订阅两个输入 Topic：

```text
/estation/+/heartbeat
/estation/+/result
```

实际消息 Topic：

```text
/estation/{StationId}/heartbeat
/estation/{StationId}/result
```

暂不在本阶段依赖这些输出 Topic：

```text
/estation/{StationId}/task
/estation/{StationId}/bind
/estation/{StationId}/group
```

如果需要验证灯条返回，可以使用独立 Test Control 页面或临时工具发送测试指令，但不要把它接进 Job 流程。

## 后台配置

建议新增配置节：

```json
{
  "EStationMqtt": {
    "BrokerHost": "<broker-ip-or-dns>",
    "BrokerPort": 1883,
    "Username": "<mqtt-username>",
    "Password": "<mqtt-password>",
    "ClientIdPrefix": "nzat-api",
    "UseTls": false,
    "HeartbeatWarningSeconds": 40,
    "HeartbeatOfflineSeconds": 60,
    "MqttLogRetentionDays": 30
  }
}
```

建议新增 `EStationMqttOptions`，并在 `Program.cs` 中注册：

```csharp
builder.Services.Configure<EStationMqttOptions>(
    builder.Configuration.GetSection(EStationMqttOptions.SectionName));
builder.Services.AddHostedService<EStationMqttListenerBackgroundService>();
builder.Services.AddScoped<StationStatusService>();
builder.Services.AddScoped<LightTagStatusService>();
```

项目当前后端是 .NET 8 API，数据库使用 PostgreSQL 和 EF Core migration。第一阶段新增表建议走 EF Core migration，保持与现有数据结构一致。

## 后端模块结构

建议在 `Workshop.Api` 下新增独立模块目录：

```text
Features/
  EStationMonitoring/
    BackgroundServices/
      EStationMqttListenerBackgroundService.cs
    Controllers/
      EStationStationsController.cs
      EStationLightTagsController.cs
      EStationMqttLogsController.cs
    DTOs/
      EStationHeartbeatDto.cs
      TaskResultDto.cs
      TaskItemResultDto.cs
      RgbDto.cs
      StationStatusResponse.cs
      LightTagStatusResponse.cs
      MqttMessageLogResponse.cs
    Entities/
      LightStation.cs
      LightTag.cs
      MqttMessageLog.cs
    Options/
      EStationMqttOptions.cs
    Services/
      EStationMqttTopicRouter.cs
      StationStatusService.cs
      LightTagStatusService.cs
      MqttMessageLogService.cs
```

如果项目继续采用现有 `Models/Controllers/Services` 扁平结构，也可以把这些文件放入现有目录，但类名仍建议保留 `EStation` 前缀，避免与现有 `Tag`、`JobTag` 混淆。

## 数据模型

### LightStation

保存基站当前通信状态。

| 字段 | 类型 | 说明 |
|---|---|---|
| Id | long | 主键 |
| StationId | string | 基站 SN，唯一 |
| Mac | string? | 基站 MAC |
| Alias | string? | 设备别名 |
| IsOnline | bool | 当前是否在线 |
| LastHeartbeatAt | DateTime? | 最近 heartbeat 接收时间 |
| ServerAddress | string? | 基站回传的 server address |
| FirmwareVersion | string? | 基站固件版本 |
| TotalCount | int | 基站缓存任务数量 |
| SendCount | int | 射频模块待发送数量 |
| LastPayloadStatus | string | 最近一次 payload 处理状态 |
| CreatedAt | DateTime | 创建时间 |
| UpdatedAt | DateTime | 更新时间 |

约束：

```text
StationId unique
StationId required
StationId max length 32
```

### LightTag

保存灯条最后一次可见状态。

| 字段 | 类型 | 说明 |
|---|---|---|
| Id | long | 主键 |
| TagId | string | 灯条 ID，唯一 |
| StationId | string? | 最近上报它的基站 |
| CurrentGroup | int? | 当前组号 |
| CurrentColor | string? | Red / Green / Blue / Yellow / Purple / Cyan / White / Off |
| IsLightOn | bool | 当前是否点亮 |
| IsFlashing | bool? | 是否闪烁，若 payload 无法判断则为空 |
| BatteryRaw | int? | 原始电池值 |
| BatteryVoltage | decimal? | 换算电压 |
| BatteryPercent | int? | 粗略电量百分比 |
| RfPowerSend | int? | 发送功率 |
| RfPowerRecv | int? | 接收功率 |
| FirmwareVersion | string? | 灯条固件版本 |
| LastResultType | int? | 最近 ResultType |
| LastSeenAt | DateTime? | 最近 result 接收时间 |
| LastPayloadStatus | string | 最近一次 payload 处理状态 |
| CreatedAt | DateTime | 创建时间 |
| UpdatedAt | DateTime | 更新时间 |

约束：

```text
TagId unique
TagId required
TagId max length 32
StationId indexed
CurrentGroup indexed
```

### MqttMessageLog

保存原始 MQTT 消息。调试阶段强烈建议保留。

| 字段 | 类型 | 说明 |
|---|---|---|
| Id | long | 主键 |
| Topic | string | MQTT Topic |
| Payload | text | 原始 payload |
| MessageType | string | Heartbeat / Result / Unknown |
| StationId | string? | 从 Topic 或 payload 提取的基站 ID |
| TagId | string? | Result 中可提取的灯条 ID，多个灯条时可为空 |
| ReceivedAt | DateTime | 后台接收时间 |
| ProcessingStatus | string | Received / Processed / InvalidPayload / Failed |
| ErrorMessage | string? | 异常信息 |

索引建议：

```text
ReceivedAt desc
StationId, ReceivedAt desc
MessageType, ReceivedAt desc
ProcessingStatus, ReceivedAt desc
```

## Heartbeat 消息处理

Topic：

```text
/estation/{StationId}/heartbeat
```

DTO：

```csharp
public sealed class EStationHeartbeatDto
{
    public string ID { get; set; } = string.Empty;
    public string? MAC { get; set; }
    public string? Alias { get; set; }
    public int ClientType { get; set; }
    public string? ServerAddress { get; set; }
    public List<string>? Parameters { get; set; }
    public string? LocalIP { get; set; }
    public string? SubnetMask { get; set; }
    public string? Gateway { get; set; }
    public int Heartbeat { get; set; }
    public string? AppVersion { get; set; }
    public int TotalCount { get; set; }
    public int SendCount { get; set; }
}
```

处理流程：

```text
收到 MQTT message
-> 保存 MqttMessageLog(status = Received)
-> 从 Topic 提取 StationId
-> JSON 反序列化为 EStationHeartbeatDto
-> 校验 Topic StationId 与 payload ID 是否一致
-> Upsert LightStation
-> 设置 LastHeartbeatAt = now
-> 更新 IsOnline = true
-> 更新 MAC / Alias / ServerAddress / FirmwareVersion / TotalCount / SendCount
-> 更新 MqttMessageLog(status = Processed)
```

异常处理：

1. Topic 无法解析：日志标为 `InvalidTopic`。
2. JSON 无法解析：日志标为 `InvalidPayload`。
3. Topic StationId 与 payload ID 不一致：日志标为 `StationMismatch`，状态页可显示 warning。
4. 数据库写入失败：日志标为 `Failed`，保留异常信息。

在线状态计算：

| 状态 | 条件 |
|---|---|
| Online | `now - LastHeartbeatAt <= 40s` |
| Warning | `40s < now - LastHeartbeatAt <= 60s` |
| Offline | `now - LastHeartbeatAt > 60s` |
| NeverSeen | 没有收到过 heartbeat |

建议 API 实时根据 `LastHeartbeatAt` 计算状态，不只依赖表里的 `IsOnline`。`IsOnline` 可以作为缓存字段，但页面显示应以时间差为准。

## Result 消息处理

Topic：

```text
/estation/{StationId}/result
```

DTO：

```csharp
public sealed class TaskResultDto
{
    public string ID { get; set; } = string.Empty;
    public int TotalCount { get; set; }
    public int SendCount { get; set; }
    public List<TaskItemResultDto> Results { get; set; } = new();
}

public sealed class TaskItemResultDto
{
    public string TagID { get; set; } = string.Empty;
    public string? Version { get; set; }
    public int ResultType { get; set; }
    public int RfPowerSend { get; set; }
    public int RfPowerRecv { get; set; }
    public int Battery { get; set; }
    public List<RgbDto> Colors { get; set; } = new();
    public int Group { get; set; }
}

public sealed class RgbDto
{
    public bool R { get; set; }
    public bool G { get; set; }
    public bool B { get; set; }
}
```

处理流程：

```text
收到 MQTT message
-> 保存 MqttMessageLog(status = Received)
-> 从 Topic 提取 StationId
-> JSON 反序列化为 TaskResultDto
-> 校验 Topic StationId 与 payload ID 是否一致
-> 遍历 Results
-> 校验 TagID
-> Upsert LightTag
-> 更新 Group / Color / Battery / RF Power / Version / LastResultType / LastSeenAt
-> 同步更新 LightStation 的 TotalCount / SendCount
-> 更新 MqttMessageLog(status = Processed)
```

ResultType 显示规则：

| ResultType | 十六进制 | Label | 用途 |
|---:|---|---|---|
| 253 | 0xFD | Button Press | 员工按灭灯条 |
| 254 | 0xFE | Communication Result | 绑定、点灯、灭灯等通信结果 |
| 255 | 0xFF | Light Heartbeat | 灯条心跳 |

颜色转换：

```csharp
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
```

如果 `Colors` 为空，保存为 `Unknown`，不要默认写成 `Off`。只有明确收到 `R=false, G=false, B=false` 时才显示 `Off`。

电池换算：

```csharp
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
```

## REST API

### Base stations

```http
GET /api/estation/stations
GET /api/estation/stations/{stationId}
```

列表响应：

```json
[
  {
    "stationId": "90A9F73001B7",
    "alias": "Workshop Station",
    "status": "Online",
    "isOnline": true,
    "lastHeartbeatAt": "2026-06-29T11:20:30+12:00",
    "secondsSinceLastHeartbeat": 12,
    "firmwareVersion": "1.6.7.0",
    "serverAddress": "192.168.1.50:1883",
    "totalCount": 0,
    "sendCount": 0,
    "lastPayloadStatus": "Processed"
  }
]
```

### Light tags

```http
GET /api/estation/light-tags
GET /api/estation/light-tags/{tagId}
```

建议支持 query：

```http
GET /api/estation/light-tags?stationId=90A9F73001B7&group=128&status=online&battery=low
```

列表响应：

```json
[
  {
    "tagId": "AD100006D9A0",
    "stationId": "90A9F73001B7",
    "currentGroup": 128,
    "currentColor": "Red",
    "isLightOn": true,
    "batteryVoltage": 3.0,
    "batteryPercent": 100,
    "rfPowerSend": -39,
    "rfPowerRecv": -83,
    "lastResultType": 254,
    "lastResultTypeLabel": "Communication Result",
    "lastSeenAt": "2026-06-29T11:23:12+12:00",
    "lastPayloadStatus": "Processed"
  }
]
```

### MQTT logs

```http
GET /api/estation/mqtt-logs
GET /api/estation/mqtt-logs?stationId=90A9F73001B7&messageType=Heartbeat&limit=100
GET /api/estation/mqtt-logs?processingStatus=InvalidPayload&limit=100
```

日志响应应包含 `topic`、`payload`、`messageType`、`processingStatus`、`errorMessage`、`receivedAt`。这是通信验证阶段最重要的排障入口之一。

## 页面设计

### Heartbeat 页面

页面名称：

```text
Device Communication / Base Stations
```

页面目标：让开发和现场人员确认哪些基站已经接入 Broker、最后一次 heartbeat 是什么时候、当前是否掉线。

表格字段：

| 字段 | 显示 |
|---|---|
| Status | Online / Warning / Offline / NeverSeen |
| Station ID | `90A9F73001B7` |
| Alias | 设备别名 |
| Firmware | 固件版本 |
| Last Heartbeat | 本地时间和相对时间 |
| Total Count | 基站缓存任务数量 |
| Send Count | 射频模块待发送数量 |
| Server Address | 基站回传地址 |
| Payload Status | Processed / InvalidPayload / Failed |

交互要求：

1. 默认每 5-10 秒刷新一次。
2. 支持手动刷新。
3. 支持按 Status 筛选。
4. 点击基站可查看最近 100 条 heartbeat/result 原始日志。
5. Warning 使用橙色，Offline 使用红色，Online 使用绿色。

### Result 页面

页面名称：

```text
Device Communication / Light Tags
```

页面目标：显示灯条最后一次通信状态，确认灯条是否能通过基站回传 result。

表格字段：

| 字段 | 显示 |
|---|---|
| Tag ID | `AD100006D9A0` |
| Station ID | 最近上报基站 |
| Group | 当前组号 |
| Color | Red / Green / Blue / Off / Unknown |
| Battery | `3.0V / 100%` |
| Result Type | Communication Result / Light Heartbeat / Button Press |
| RF Send | 发送功率 |
| RF Recv | 接收功率 |
| Last Seen | 本地时间和相对时间 |
| Payload Status | Processed / InvalidPayload / Failed |

交互要求：

1. 默认每 5-10 秒刷新一次。
2. 支持按 Station ID、Group、低电量筛选。
3. 点击灯条可查看最近相关 MQTT 原始日志。
4. 电量低于 30% 显示 warning。
5. `LastSeenAt` 超过现场约定阈值时显示 stale 状态，但不要把它直接等同于 Job 异常。

## 通信验证流程

### Step 1: 启动 Broker

1. 启动 EMQX。
2. 打开 Dashboard。
3. 创建或配置 MQTT 用户。
4. 确认 `1883` 端口从基站网络可访问。

验收：

```text
Dashboard 正常打开，Broker listener 正常，1883 端口可达。
```

### Step 2: 配置基站

1. 将基站 MQTT Server 改为 Broker 地址。
2. 填入 MQTT 用户名和密码。
3. 保存并重启基站或重连网络。
4. 在 Dashboard 查看 client 是否在线。

验收：

```text
EMQX Dashboard 可以看到 eStation client 在线。
```

### Step 3: 后台连接 Broker

1. 后端安装 MQTT 客户端库，例如 MQTTnet。
2. 添加 `EStationMqtt` 配置。
3. 注册 `EStationMqttListenerBackgroundService`。
4. 连接 Broker。
5. 订阅 `/estation/+/heartbeat` 和 `/estation/+/result`。

验收：

```text
后台日志显示 MQTT connected，并成功 subscribe 两个 Topic。
```

### Step 4: 验证 Heartbeat

1. 等待基站发送 heartbeat。
2. 检查 `MqttMessageLog` 是否写入 Heartbeat。
3. 检查 `LightStation` 是否 upsert。
4. 打开 Base Stations 页面。

验收：

```text
每 20 秒左右收到 heartbeat。
Base Stations 页面显示 Online。
停止基站或断网超过 60 秒后显示 Offline。
```

### Step 5: 验证 Result

1. 触发灯条通信结果或等待灯条 heartbeat。
2. 检查 `MqttMessageLog` 是否写入 Result。
3. 检查 `LightTag` 是否 upsert。
4. 打开 Light Tags 页面。

验收：

```text
Light Tags 页面可以看到 Tag ID、Station ID、Group、Color、Battery、RF Power、Last Seen。
```

## 后端测试建议

第一阶段至少覆盖以下单元测试：

1. Topic router 可以识别 heartbeat topic。
2. Topic router 可以识别 result topic。
3. 非法 topic 会写入 InvalidTopic。
4. Heartbeat payload 可以 upsert `LightStation`。
5. Result payload 可以 upsert 一个或多个 `LightTag`。
6. Topic StationId 与 payload ID 不一致会标记 `StationMismatch`。
7. 电池 raw value 可以正确换算电压和百分比。
8. RGB flags 可以正确转换颜色名称。
9. Online / Warning / Offline 阈值计算正确。
10. JSON parse failure 会保存原始 payload 和错误信息。

集成测试建议：

1. 使用测试 broker 或 mock MQTT client 发布 heartbeat。
2. 验证 API 返回 station online。
3. 发布 result。
4. 验证 API 返回 light tag 状态。
5. 发布 malformed payload。
6. 验证 logs API 能查到失败记录。

## 排障清单

### Dashboard 看不到基站

检查：

1. 基站 Broker Host 是否写成了后台 API 地址，而不是 Broker 地址。
2. 基站网络是否能访问 Broker 的 `1883`。
3. Broker username/password 是否正确。
4. 防火墙或路由器是否拦截 TCP 1883。
5. 基站是否需要保存配置后重启。

### Dashboard 有基站，但后台没有消息

检查：

1. 后台连接的是同一个 Broker。
2. 后台 MQTT 用户是否有 subscribe 权限。
3. 后台是否订阅 `/estation/+/heartbeat` 和 `/estation/+/result`。
4. Topic 是否以 `/estation/` 开头，是否有前导 slash。
5. 后台日志是否有 reconnect 或 authentication failed。

### 后台有日志，但页面不显示

检查：

1. `MqttMessageLog.ProcessingStatus` 是否为 `Processed`。
2. 是否因为 StationId 或 TagId 校验失败没有 upsert 状态表。
3. EF migration 是否已执行。
4. API 是否按时间阈值把 station 计算为 Offline。
5. 前端是否调用了正确 API base URL。

### Result 页面颜色不对

检查：

1. `Colors` 是否为空。
2. `R/G/B` bool 是否被正确反序列化。
3. 多个颜色组合是否按 `White/Yellow/Cyan/Purple` 规则转换。
4. `Off` 是否只在 RGB 全 false 时显示。

### 电池显示异常

检查：

1. 原始 `Battery` 是否小于等于 0。
2. 是否按 `battery / 10.0` 换算电压。
3. 低电量 warning 阈值是否与现场设备实际电压范围一致。

## 阶段完成标准

本阶段完成需要满足：

1. 基站能稳定连接自建 Broker。
2. Heartbeat 至少连续 10 分钟稳定进入系统。
3. Base Stations 页面能正确显示 Online、Warning、Offline。
4. Result 消息可以进入系统并更新 Light Tags 页面。
5. 原始 MQTT 日志可查，失败 payload 有错误原因。
6. 后台重启后可以自动重连 Broker 并重新订阅 Topic。
7. 本阶段代码没有引用 Job、JobTag、Job Detail、New Job 业务流程。

完成以上标准后，再进入下一阶段：

```text
Job Detail -> Bind Light Strip
New Job -> Bind Light Strip
```

