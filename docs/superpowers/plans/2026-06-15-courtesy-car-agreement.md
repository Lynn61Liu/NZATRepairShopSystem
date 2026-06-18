# Courtesy Car Agreement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent courtesy-car agreement flow that lets admins create draft agreements from a job, lets customers continue drafts from a shared list page, and records agreement history in the database.

**Architecture:** Use a dedicated agreement aggregate instead of storing workflow state on `jobs` or `vehicles`. The backend will own agreement state, event history, and attachment metadata; the frontend will keep the admin picker and a customer-facing draft list/continue flow in separate routes. Vehicle availability stays simple: `available`, `on_loan`, and `unavailable`.

**Tech Stack:** ASP.NET Core 8, Entity Framework Core, PostgreSQL, React 19, TypeScript, Vite, existing UI primitives in `apps/shell`.

---

### Task 1: Add courtesy-car agreement persistence

**Files:**
- Create: `backend/Workshop.Api/Models/CourtesyCarAgreement.cs`
- Create: `backend/Workshop.Api/Models/CourtesyCarAgreementEvent.cs`
- Create: `backend/Workshop.Api/Models/CourtesyCarAgreementAttachment.cs`
- Modify: `backend/Workshop.Api/Data/AppDbContext.cs`
- Modify: `db/init/001_schema.sql`
- Create: `backend/Workshop.Api/Migrations/20260615090000_AddCourtesyCarAgreements.cs`
- Modify: `backend/Workshop.Api/Migrations/AppDbContextModelSnapshot.cs`
- Test: `backend/Workshop.Api.Tests/CourtesyCarAgreementModelTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public void AgreementModels_MapExpectedColumnsAndDefaults()
{
    using var db = TestDbFactory.Create();
    db.Model.FindEntityType(typeof(CourtesyCarAgreement)).Should().NotBeNull();
    db.Model.FindEntityType(typeof(CourtesyCarAgreementEvent)).Should().NotBeNull();
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CourtesyCarAgreementModelTests -v normal`

- [ ] **Step 3: Write minimal implementation**

Add the three models, register them in `AppDbContext`, and create the migration/schema SQL with `draft`, `in_progress`, `submitted`, `closed`, and `cancelled` statuses.

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CourtesyCarAgreementModelTests -v normal`

- [ ] **Step 5: Commit**

```bash
git add backend/Workshop.Api/Models backend/Workshop.Api/Data/AppDbContext.cs db/init/001_schema.sql backend/Workshop.Api/Migrations backend/Workshop.Api.Tests/CourtesyCarAgreementModelTests.cs
git commit -m "feat: add courtesy car agreement persistence"
```

### Task 2: Add backend agreement APIs

**Files:**
- Create: `backend/Workshop.Api/DTOs/CreateCourtesyCarAgreementRequest.cs`
- Create: `backend/Workshop.Api/DTOs/UpdateCourtesyCarAgreementStepRequest.cs`
- Create: `backend/Workshop.Api/Services/CourtesyCarAgreementService.cs`
- Create: `backend/Workshop.Api/Controllers/CourtesyCarAgreementsController.cs`
- Modify: `backend/Workshop.Api/Program.cs`
- Test: `backend/Workshop.Api.Tests/CourtesyCarAgreementServiceTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public async Task CreateDraft_SelectsAvailableVehicle_AndReturnsDraft()
{
    // Arrange a job, customer, and available vehicle.
    // Act create draft agreement.
    // Assert agreement status is draft and vehicle remains available.
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CourtesyCarAgreementServiceTests -v normal`

- [ ] **Step 3: Write minimal implementation**

Implement draft creation, draft listing, draft detail loading, step updates, and a final submit endpoint that marks the vehicle `on_loan` and appends history events.

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CourtesyCarAgreementServiceTests -v normal`

- [ ] **Step 5: Commit**

```bash
git add backend/Workshop.Api/DTOs backend/Workshop.Api/Services/CourtesyCarAgreementService.cs backend/Workshop.Api/Controllers/CourtesyCarAgreementsController.cs backend/Workshop.Api/Program.cs backend/Workshop.Api.Tests/CourtesyCarAgreementServiceTests.cs
git commit -m "feat: add courtesy car agreement api"
```

### Task 3: Add admin job-detail entry point

**Files:**
- Modify: `apps/shell/src/features/jobDetail/components/SummaryCard.tsx`
- Create: `apps/shell/src/features/courtesyCars/admin/CourtesyCarAssignDialog.tsx`
- Create: `apps/shell/src/features/courtesyCars/api.ts`
- Create: `apps/shell/src/features/courtesyCars/types.ts`
- Modify: `apps/shell/src/App.tsx`
- Test: `apps/shell/src/features/courtesyCars/admin/CourtesyCarAssignDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test("shows available cars and creates a draft agreement", async () => {
  // render dialog with mocked API
  // select one available vehicle
  // expect draft creation request and success UI
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir apps/shell test -- CourtesyCarAssignDialog`

- [ ] **Step 3: Write minimal implementation**

Build the admin modal that opens from job detail, lists available vehicles, creates a draft agreement, and shows an “open customer page” action plus a close action.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir apps/shell test -- CourtesyCarAssignDialog`

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/features/jobDetail/components/SummaryCard.tsx apps/shell/src/features/courtesyCars/admin apps/shell/src/features/courtesyCars/api.ts apps/shell/src/features/courtesyCars/types.ts apps/shell/src/App.tsx
git commit -m "feat: add admin courtesy car draft flow"
```

### Task 4: Add customer draft list and agreement continuation page

**Files:**
- Create: `apps/shell/src/pages/courtesyCarAgreements/CourtesyCarAgreementsPage.tsx`
- Create: `apps/shell/src/pages/courtesyCarAgreements/CourtesyCarAgreementPage.tsx`
- Modify: `apps/shell/src/App.tsx`
- Modify: `apps/shell/src/layout/Sidebar.tsx`
- Test: `apps/shell/src/pages/courtesyCarAgreements/CourtesyCarAgreementsPage.test.tsx`
- Test: `apps/shell/src/pages/courtesyCarAgreements/CourtesyCarAgreementPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test("renders draft cards and opens the selected draft", async () => {
  // mock drafts
  // click one card
  // expect continuation page to load
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir apps/shell test -- CourtesyCarAgreementsPage`

- [ ] **Step 3: Write minimal implementation**

Render a shared list page for all drafts and a continuation page that walks the customer through contact, vehicle, license, terms, signature, review, and submit steps with autosave.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir apps/shell test -- CourtesyCarAgreementsPage`

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/courtesyCarAgreements apps/shell/src/App.tsx apps/shell/src/layout/Sidebar.tsx
git commit -m "feat: add customer courtesy car draft pages"
```

