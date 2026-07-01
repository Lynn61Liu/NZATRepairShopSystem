# Light Strip Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent Job-to-light-strip binding, publish MQTT `/bind`, update binding status from eStation result, and show bindings on `device-communication`.

**Architecture:** Add a focused `JobLightBindings` feature under the API with a model, DTOs, MQTT command publisher, service, and controller. Persist relationships in `job_light_bindings`, update them from the existing eStation result pipeline, and expose a joined read API for the frontend. Add a small JobHeader dialog and a binding table on the existing Device Communication page.

**Tech Stack:** ASP.NET Core, EF Core, PostgreSQL migrations, MQTTnet, React, TypeScript, existing `requestJson` API helper.

---

### Task 1: Backend Binding Model And DB Mapping

**Files:**
- Create: `backend/Workshop.Api/Features/JobLightBindings/Models/JobLightBinding.cs`
- Create: `backend/Workshop.Api/Features/JobLightBindings/Models/LightBindingStatus.cs`
- Modify: `backend/Workshop.Api/Data/AppDbContext.cs`
- Create: `backend/Workshop.Api/Migrations/20260701090000_AddJobLightBindings.cs`

- [ ] **Step 1: Write model and DbContext tests first**

Add backend tests that create active binding rows and verify one active binding per Job and per Tag through EF model indexes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `/usr/local/share/dotnet/dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --no-build --filter JobLightBinding`

- [ ] **Step 3: Implement model, DbSet, mapping, and migration**

Use table `job_light_bindings`, active statuses `PendingBind` and `Bound`, and partial unique indexes for active `job_id` and `tag_id`.

- [ ] **Step 4: Run backend tests**

Run: `/usr/local/share/dotnet/dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter JobLightBinding`

### Task 2: MQTT Bind Publisher

**Files:**
- Create: `backend/Workshop.Api/Features/JobLightBindings/Services/EStationMqttCommandPublisher.cs`
- Modify: `backend/Workshop.Api/Program.cs`
- Test: `backend/Workshop.Api.Tests/JobLightBindingTests.cs`

- [ ] **Step 1: Write a failing payload-shape test**

Verify publish request topic is `/estation/{stationId}/bind` and payload is `{"Group":128,"Items":["AD100006D9A0"]}`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `/usr/local/share/dotnet/dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter PublishBind`

- [ ] **Step 3: Implement publisher**

Use configured `EStationMqttOptions`; expose a payload builder for deterministic tests and a publish method for runtime MQTT.

- [ ] **Step 4: Run publisher tests**

Run: `/usr/local/share/dotnet/dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter PublishBind`

### Task 3: Binding Service, APIs, And Result Updates

**Files:**
- Create: `backend/Workshop.Api/Features/JobLightBindings/DTOs/JobLightBindingDtos.cs`
- Create: `backend/Workshop.Api/Features/JobLightBindings/Controllers/JobLightBindingsController.cs`
- Create: `backend/Workshop.Api/Features/JobLightBindings/Controllers/EStationLightBindingsController.cs`
- Create: `backend/Workshop.Api/Features/JobLightBindings/Services/JobLightBindingService.cs`
- Modify: `backend/Workshop.Api/Features/EStationMonitoring/Services/EStationMqttMessageProcessor.cs`
- Modify: `backend/Workshop.Api/Program.cs`
- Test: `backend/Workshop.Api.Tests/JobLightBindingTests.cs`

- [ ] **Step 1: Write failing service tests**

Cover valid binding, invalid tag ID, missing Job, no online station, duplicate active Job binding, duplicate active Tag binding, and result update to `Bound`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `/usr/local/share/dotnet/dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter JobLightBinding`

- [ ] **Step 3: Implement service and controllers**

Select the most recent online station, allocate a group from 1-254, persist `PendingBind`, publish MQTT, expose Job and device communication queries.

- [ ] **Step 4: Wire result handling**

After `LightTagStatusService.HandleResultAsync`, update matching pending bindings to `Bound`.

- [ ] **Step 5: Run backend tests**

Run: `/usr/local/share/dotnet/dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter JobLightBinding`

### Task 4: JobHeader Bind Dialog

**Files:**
- Modify: `apps/shell/src/features/jobDetail/api/jobDetailApi.ts`
- Modify: `apps/shell/src/features/jobDetail/components/JobHeader.tsx`

- [ ] **Step 1: Add API helper**

Add `createJobLightBinding(jobId, tagId)`.

- [ ] **Step 2: Add dialog state and submit flow**

Add button, read-only plate display, scanner-friendly input, Enter submit, loading state, success/failure display.

- [ ] **Step 3: Run frontend build**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --dir apps/shell build`

### Task 5: Device Communication Binding Table

**Files:**
- Modify: `apps/shell/src/pages/deviceCommunication/DeviceCommunicationPage.tsx`

- [ ] **Step 1: Add response type and API call**

Fetch `GET /api/estation/light-bindings` alongside stations, tags, logs, and health.

- [ ] **Step 2: Render "灯条绑定关系" table**

Show plate, Job ID, tag ID, station ID, group, status, battery, light state, last result, and failure reason.

- [ ] **Step 3: Run frontend build**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --dir apps/shell build`

### Task 6: Full Verification

**Files:**
- All touched backend/frontend files.

- [ ] **Step 1: Build API**

Run: `/usr/local/share/dotnet/dotnet build backend/Workshop.Api/Workshop.Api.csproj --no-restore`

- [ ] **Step 2: Run backend tests**

Run: `/usr/local/share/dotnet/dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --no-build`

- [ ] **Step 3: Run frontend build**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --dir apps/shell build`

- [ ] **Step 4: Inspect git diff**

Run: `git diff --check && git status --short`
