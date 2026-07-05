# Repair Quote Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Repair-only quote step that stores optional customer email and applies the `报价` job tag through `job_tags`.

**Architecture:** Keep the Repair quote behavior in the customer self-service boundary. Frontend state and payload gain `requiresQuote` and `quoteEmail`; backend request/mapper carry the email into the customer, and the customer self-service controller writes the job tag after successful job creation.

**Tech Stack:** React/TypeScript/Vite frontend, ASP.NET Core controller/service layer, Entity Framework Core, xUnit/FluentAssertions.

---

## Files

- Modify: `apps/shell/src/pages/customerSelfService/CustomerSelfServiceNewJobPage.tsx`
- Create: `apps/shell/src/pages/customerSelfService/customerSelfServiceNewJobPage.utils.ts`
- Create: `apps/shell/src/pages/customerSelfService/customerSelfServiceNewJobPage.utils.test.ts`
- Modify: `backend/Workshop.Api/DTOs/CustomerSelfServiceJobRequest.cs`
- Modify: `backend/Workshop.Api/Services/CustomerSelfServiceJobMapper.cs`
- Modify: `backend/Workshop.Api/Controllers/CustomerSelfServiceJobsController.cs`
- Modify: `backend/Workshop.Api.Tests/CustomerSelfServiceMapperTests.cs`
- Create: `backend/Workshop.Api.Tests/CustomerSelfServiceQuoteTagTests.cs`

### Task 1: Frontend Step And Payload Helpers

- [ ] **Step 1: Write failing frontend helper tests**

Create `apps/shell/src/pages/customerSelfService/customerSelfServiceNewJobPage.utils.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildSelfServiceJobPayload, getCustomerSelfServiceSteps } from "./customerSelfServiceNewJobPage.utils";

describe("getCustomerSelfServiceSteps", () => {
  test("adds quote between contact and review for repair jobs", () => {
    expect(getCustomerSelfServiceSteps({ hasWof: false })).toEqual([
      { id: "plate", label: "Plate" },
      { id: "contact", label: "Contact" },
      { id: "quote", label: "Quote" },
      { id: "review", label: "Review" },
    ]);
  });
});

describe("buildSelfServiceJobPayload", () => {
  test("includes repair quote choice and optional email", () => {
    expect(
      buildSelfServiceJobPayload({
        form: {
          plate: "ABC123",
          hasWof: false,
          name: "Jane Smith",
          phone: "021 123 4567",
          email: "",
          quoteEmail: " quote@example.com ",
          notes: "",
          address: "",
          requiresQuote: true,
        },
        matchedCustomerId: "",
        customerEdited: false,
      })
    ).toMatchObject({
      requiresQuote: true,
      quoteEmail: " quote@example.com ",
      email: " quote@example.com ",
    });
  });
});
```

- [ ] **Step 2: Run frontend helper tests and verify RED**

Run: `pnpm --dir apps/shell test -- customerSelfServiceNewJobPage.utils.test.ts`

Expected: FAIL because `customerSelfServiceNewJobPage.utils` does not exist.

- [ ] **Step 3: Implement frontend helper module**

Create `apps/shell/src/pages/customerSelfService/customerSelfServiceNewJobPage.utils.ts`:

```ts
export type CustomerSelfServiceStep = "plate" | "contact" | "quote" | "address" | "review" | "success";

export type CustomerSelfServiceFormState = {
  plate: string;
  hasWof: boolean;
  name: string;
  phone: string;
  email: string;
  quoteEmail: string;
  notes: string;
  address: string;
  requiresQuote: boolean;
};

export function getCustomerSelfServiceSteps({ hasWof }: { hasWof: boolean }) {
  if (hasWof) {
    return [
      { id: "plate", label: "Plate" },
      { id: "contact", label: "Contact" },
      { id: "address", label: "Address" },
      { id: "review", label: "Review" },
    ];
  }

  return [
    { id: "plate", label: "Plate" },
    { id: "contact", label: "Contact" },
    { id: "quote", label: "Quote" },
    { id: "review", label: "Review" },
  ];
}

export function buildSelfServiceJobPayload({
  form,
  matchedCustomerId,
  customerEdited,
}: {
  form: CustomerSelfServiceFormState;
  matchedCustomerId: string;
  customerEdited: boolean;
}) {
  const repairQuoteEmail = form.hasWof ? "" : form.quoteEmail;
  return {
    plate: form.plate,
    hasWof: form.hasWof,
    name: form.name,
    phone: form.phone,
    email: repairQuoteEmail || form.email,
    quoteEmail: repairQuoteEmail || undefined,
    requiresQuote: !form.hasWof && form.requiresQuote,
    existingCustomerId: matchedCustomerId && !customerEdited ? Number(matchedCustomerId) : undefined,
    customerEdited,
    notes: form.notes,
    address: form.address || undefined,
  };
}
```

- [ ] **Step 4: Run frontend helper tests and verify GREEN**

Run: `pnpm --dir apps/shell test -- customerSelfServiceNewJobPage.utils.test.ts`

Expected: PASS.

### Task 2: Backend Mapper Quote Email

- [ ] **Step 1: Write failing mapper test**

Append to `backend/Workshop.Api.Tests/CustomerSelfServiceMapperTests.cs`:

```csharp
[Fact]
public void MapToNewJobRequest_WithRepairQuoteEmail_StoresQuoteEmailOnCustomer()
{
    var req = new CustomerSelfServiceJobRequest
    {
        Plate = "abc123",
        HasWof = false,
        Name = "Jane Smith",
        Phone = "021 123 4567",
        Email = "old@example.com",
        RequiresQuote = true,
        QuoteEmail = " quote@example.com ",
    };

    var mapped = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId: 20);

    mapped.Customer.Email.Should().Be("quote@example.com");
}
```

- [ ] **Step 2: Run mapper test and verify RED**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CustomerSelfServiceMapperTests`

Expected: FAIL because `RequiresQuote` and `QuoteEmail` are missing or ignored.

- [ ] **Step 3: Add request fields and mapper precedence**

Modify `backend/Workshop.Api/DTOs/CustomerSelfServiceJobRequest.cs`:

```csharp
public bool RequiresQuote { get; set; }
public string? QuoteEmail { get; set; }
```

Modify `backend/Workshop.Api/Services/CustomerSelfServiceJobMapper.cs` customer email assignment:

```csharp
Email = NullIfBlank(req.QuoteEmail) ?? NullIfBlank(req.Email),
```

- [ ] **Step 4: Run mapper test and verify GREEN**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CustomerSelfServiceMapperTests`

Expected: PASS.

### Task 3: Backend Quote Tag Persistence

- [ ] **Step 1: Write failing service/controller-level test**

Create `backend/Workshop.Api.Tests/CustomerSelfServiceQuoteTagTests.cs` with an EF Core in-memory test that calls the tag helper or controller-created persistence path and verifies:

```csharp
tag.Name.Should().Be("报价");
await db.JobTags.Should().ContainAsync(x => x.JobId == jobId && x.TagId == tag.Id);
```

- [ ] **Step 2: Run quote tag test and verify RED**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CustomerSelfServiceQuoteTagTests`

Expected: FAIL because quote tag persistence is not implemented.

- [ ] **Step 3: Implement quote tag persistence**

Modify `backend/Workshop.Api/Controllers/CustomerSelfServiceJobsController.cs`:

```csharp
private const string QuoteTagName = "报价";
```

After `CreateAsync` succeeds:

```csharp
if (!req.HasWof && req.RequiresQuote)
{
    await EnsureQuoteTagAsync(result.JobId, ct);
}
```

Add a private helper that:

1. Finds an active tag named `报价`, case-insensitive.
2. Creates it if missing.
3. Adds `JobTag` when the relationship does not already exist.
4. Saves changes.

- [ ] **Step 4: Run quote tag test and verify GREEN**

Run: `dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter CustomerSelfServiceQuoteTagTests`

Expected: PASS.

### Task 4: Wire The Frontend Page

- [ ] **Step 1: Import helpers and expand types**

In `CustomerSelfServiceNewJobPage.tsx`, import `buildSelfServiceJobPayload`, `getCustomerSelfServiceSteps`, and helper types. Extend `FormState` with `quoteEmail` and `requiresQuote`; extend `Step` with `quote`.

- [ ] **Step 2: Replace inline step and payload logic**

Use `getCustomerSelfServiceSteps({ hasWof: form.hasWof })` in the `steps` memo.

Use `buildSelfServiceJobPayload({ form, matchedCustomerId, customerEdited })` for the POST body.

- [ ] **Step 3: Add QuoteStep component**

Render `QuoteStep` when `selectedPath && step === "quote"`. The step contains a checkbox and optional email input, with back to contact and next to review.

- [ ] **Step 4: Update navigation**

Back from review goes to `address` for WOF and `quote` for Repair. Back from quote goes to contact. Contact next goes to address for WOF and quote for Repair.

- [ ] **Step 5: Update review display**

For Repair jobs, show `报价` as `是` or `否`, and show `Email` when the quote email has a value.

- [ ] **Step 6: Run frontend tests and typecheck**

Run:

```bash
pnpm --dir apps/shell test -- customerSelfServiceNewJobPage.utils.test.ts
pnpm --dir apps/shell build
```

Expected: PASS.

### Task 5: Full Verification

- [ ] **Step 1: Run backend tests**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter "CustomerSelfServiceMapperTests|CustomerSelfServiceQuoteTagTests"
```

Expected: PASS.

- [ ] **Step 2: Check changed files**

Run: `git diff --stat`

Expected: only the planned frontend, backend, test, and docs files changed by this work.

## Self-Review

- Spec coverage: Repair-only quote step, optional quote email, customer email storage, and `tags`/`job_tags` persistence are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: frontend fields use `requiresQuote` and `quoteEmail`; backend uses `RequiresQuote` and `QuoteEmail`, matching JSON model binding conventions.
