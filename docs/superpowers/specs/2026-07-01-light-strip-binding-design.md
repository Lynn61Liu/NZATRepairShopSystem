# Light Strip Binding Design

## Goal

Add a persistent Job-to-light-strip binding feature.

The first version covers:

- Add a "绑定灯条" button on the existing Job detail header.
- Open a bind dialog with the current vehicle plate and a scanned light strip code input.
- Persist the binding relationship in the database.
- Publish the eStation MQTT bind command.
- Update binding status when the eStation result message is received.
- Show all binding relationships on the `device-communication` page.

This version does not implement "点亮灯条", unbind, New Job binding, or multi-strip binding per Job.

## User Flow

From an existing Job detail page:

1. User clicks "绑定灯条".
2. A dialog opens.
3. The dialog shows the Job vehicle plate as read-only text.
4. The light strip input is focused automatically.
5. User scans or enters the light strip barcode.
6. User clicks "确认" or presses Enter.
7. Frontend submits the binding request.
8. Backend creates a pending binding record and publishes MQTT `/bind`.
9. Dialog shows the pending result.
10. When the backend receives a matching eStation `/result`, the binding becomes `Bound`.
11. If validation fails or no matching result arrives in time, the UI shows the failure reason.

## Frontend Design

### Job Header

Add a `绑定灯条` button near the existing Job action buttons in `JobHeader.tsx`.

The existing `点亮灯条` behavior is explicitly out of scope and should not be implemented in this change.

### Bind Dialog

Fields:

- `车牌号`: read-only, populated from `vehiclePlate`.
- `灯条码`: text input, accepts barcode scanner input.

Actions:

- `取消`: closes the dialog when no request is in progress.
- `确认`: validates and submits.

Input behavior:

- Auto focus when dialog opens.
- Trim whitespace.
- Uppercase the code.
- Allow scanner Enter key to submit.
- Validate `TagId` format before sending.

Validation:

- `TagId` must match `^AD1[0-9A-F]{9}$`.
- Empty input shows an inline validation message.

Result display:

- On submit: show "绑定指令已发送，等待基站确认".
- On success: show plate, tag ID, station ID, group number, and `Bound`.
- On failure: show backend failure reason.

## Backend Data Model

Add table `job_light_bindings`.

Columns:

- `id`: primary key.
- `job_id`: required, references the Job.
- `plate`: required snapshot of the vehicle plate at bind time.
- `station_id`: required eStation ID.
- `tag_id`: required light strip ID.
- `group_no`: required integer, 1-254 for active bindings.
- `status`: required string.
- `failure_reason`: nullable string.
- `last_result_at`: nullable timestamp.
- `created_at`: required timestamp.
- `updated_at`: required timestamp.

Statuses implemented in the first version:

- `PendingBind`
- `Bound`
- `BindFailed`

Reserved future statuses:

- `PendingUnbind`
- `Unbound`

Constraints:

- One active light strip can only belong to one active Job.
- First version should allow at most one active binding per Job.
- Active statuses for this version are `PendingBind` and `Bound`.

Recommended indexes:

- Unique active index on `tag_id`.
- Unique active index on `job_id`.
- Index on `station_id`.
- Index on `status`.
- Index on `updated_at`.

## Backend API

### Create Binding

```http
POST /api/jobs/{jobId}/light-bindings
```

Request:

```json
{
  "tagId": "AD100006D9A0"
}
```

Response:

```json
{
  "id": 1,
  "jobId": 123,
  "plate": "ABC123",
  "stationId": "90A9F73014FC",
  "tagId": "AD100006D9A0",
  "groupNo": 128,
  "status": "PendingBind",
  "failureReason": null,
  "lastResultAt": null
}
```

Backend logic:

1. Load Job and vehicle plate.
2. Validate `TagId`.
3. Select the most recently active online station.
4. Allocate an available group number from 1 to 254.
5. Check that the Job has no active binding.
6. Check that the TagId has no active binding.
7. Save a `PendingBind` record.
8. Publish MQTT `/estation/{stationId}/bind`.
9. Return the pending binding.

### Get Job Bindings

```http
GET /api/jobs/{jobId}/light-bindings
```

Returns binding records for a Job.

### Get All Bindings For Device Communication

```http
GET /api/estation/light-bindings
```

Returns binding records joined with current light tag status.

Example:

```json
[
  {
    "id": 1,
    "jobId": 123,
    "plate": "ABC123",
    "stationId": "90A9F73014FC",
    "tagId": "AD100006D9A0",
    "groupNo": 128,
    "status": "Bound",
    "batteryPercent": 90,
    "currentColor": "Off",
    "isLightOn": false,
    "lastSeenAt": "2026-07-01T10:00:00Z",
    "lastResultAt": "2026-07-01T10:00:03Z",
    "failureReason": null
  }
]
```

## MQTT Publish Design

Topic:

```text
/estation/{stationId}/bind
```

Payload:

```json
{
  "Group": 128,
  "Items": [
    "AD100006D9A0"
  ]
}
```

The MQTT publisher should use the same configured broker settings as the existing eStation listener.

## Result Handling

The existing MQTT listener receives:

```text
/estation/{stationId}/result
```

When processing each result item:

1. Update `light_tags` as today.
2. Find a pending binding where:
   - `tag_id` equals result `TagID`.
   - `station_id` equals topic station ID.
   - `status` is `PendingBind`.
3. If result `Group` equals binding `group_no`, update:
   - `status = Bound`
   - `last_result_at = now`
   - `failure_reason = null`
4. If the tag appears with a different group, keep it pending until timeout or mark failed if the mismatch clearly represents the response to this bind.

Timeout behavior:

- First version can perform timeout evaluation when the binding is queried.
- If `PendingBind` is older than 30 seconds, return or persist `BindFailed`.
- Failure reason: `绑定指令已发送，但 30 秒内没有收到基站确认`.

## Device Communication Page

Add a "灯条绑定关系" section to `device-communication`.

Columns:

- 车牌号
- Job ID
- 灯条码
- 基站
- Group
- 绑定状态
- 电量
- 灯光状态
- 最近回执
- 失败原因

This page should read from:

```http
GET /api/estation/light-bindings
```

It should not infer business binding from raw MQTT logs alone.

## Error Handling

Return clear reasons for:

- Job does not exist.
- Job has no vehicle plate.
- TagId format is invalid.
- No online eStation is available.
- The Job already has an active binding.
- The TagId is already actively bound to another Job.
- MQTT publish fails.
- The eStation does not confirm within 30 seconds.

## Testing

Backend tests:

- Valid binding creates `PendingBind`.
- Invalid TagId returns validation error.
- Missing Job returns not found.
- No online station returns failure.
- Duplicate active Job binding is rejected.
- Duplicate active TagId binding is rejected.
- MQTT bind payload uses the expected topic and JSON shape.
- Result message updates `PendingBind` to `Bound`.
- Timed-out pending binding becomes or returns `BindFailed`.

Frontend tests/manual QA:

- Button opens dialog.
- Plate is displayed read-only.
- Scanner-style input uppercases and trims.
- Enter submits.
- Success and failure states render correctly.
- Device Communication page shows persisted binding rows.
