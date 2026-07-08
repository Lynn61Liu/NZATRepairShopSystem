# PO TODO Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the formal sidebar PO TODO page with Gmail sent sync, PO detection prefill, PO confirmation progress, Gmail `invoiced` labeling, and Invoiced batch completion.

**Architecture:** Add focused backend services for PO TODO state/list actions, Gmail labeling, and Xero reference replacement, exposed through a new `PoController`. Reuse existing `JobPoState`, Gmail thread sync, draft generation behavior, and invoice services where possible; replace the frontend preview page with a compact operational table.

**Tech Stack:** ASP.NET Core 8, EF Core, Gmail API, Xero API, React 19, TypeScript, Vite, existing app UI components.

---

## File Map

Backend:

- Create `backend/Workshop.Api/Services/PoReferenceBuilder.cs`: pure helper for replacing `Pending/pending` in references.
- Create `backend/Workshop.Api/Services/GmailLabelService.cs`: resolves existing Gmail label id and applies it to Gmail thread/message.
- Create `backend/Workshop.Api/Services/PoTodoService.cs`: lists PO TODO rows, syncs active PO jobs, manual sent confirmation, confirm PO workflow, and batch complete.
- Create `backend/Workshop.Api/Controllers/PoController.cs`: API surface for the PO TODO page.
- Modify `backend/Workshop.Api/Models/JobPoStateStatus.cs`: add `Completed`.
- Modify `backend/Workshop.Api/Models/JobPoState.cs`: add manual sent/source fields if needed.
- Modify `backend/Workshop.Api/Models/GmailMessageLog.cs`: add manual/source field if needed.
- Modify `backend/Workshop.Api/Data/AppDbContext.cs`: map any new columns.
- Modify `backend/Workshop.Api/Services/PoStateSchemaInitializerService.cs`: ensure additive PO schema columns exist for non-migration startup environments.
- Modify `backend/Workshop.Api/Options/GmailOptions.cs`: include `gmail.modify`.
- Modify `backend/Workshop.Api/Program.cs`: register new services.
- Modify `backend/Workshop.Api/Services/JobInvoiceService.cs`: add a focused method to update the draft invoice reference by job id.

Backend tests:

- Create `backend/Workshop.Api.Tests/PoReferenceBuilderTests.cs`.
- Create `backend/Workshop.Api.Tests/PoTodoServiceTests.cs`.
- Create `backend/Workshop.Api.Tests/GmailLabelServiceTests.cs`.

Frontend:

- Create `apps/shell/src/features/poTodo/poTodo.types.ts`.
- Create `apps/shell/src/features/poTodo/poTodoApi.ts`.
- Create `apps/shell/src/features/poTodo/PoTodoPage.tsx`.
- Create `apps/shell/src/features/poTodo/PoTodoTable.tsx`.
- Create `apps/shell/src/features/poTodo/PoDraftPreviewDialog.tsx`.
- Create `apps/shell/src/features/poTodo/ManualSentConfirmDialog.tsx`.
- Create `apps/shell/src/features/poTodo/ConfirmPoProgressDialog.tsx`.
- Modify `apps/shell/src/App.tsx`: route `/po` to `PoTodoPage`, optionally keep preview redirect/alias.
- Modify `apps/shell/src/layout/Sidebar.tsx`: point PO item to `/po`.

Frontend tests/build:

- Use `pnpm --dir apps/shell build` for type/build verification.
- Add focused utility tests only if existing test tooling is present for frontend pure helpers; otherwise rely on TypeScript build and backend tests for logic.

---

### Task 1: Reference Replacement Helper

**Files:**
- Create: `backend/Workshop.Api/Services/PoReferenceBuilder.cs`
- Test: `backend/Workshop.Api.Tests/PoReferenceBuilderTests.cs`

- [ ] **Step 1: Write failing tests**

Create `backend/Workshop.Api.Tests/PoReferenceBuilderTests.cs`:

```csharp
using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class PoReferenceBuilderTests
{
    [Theory]
    [InlineData("PO Pending ABC123", "12345", "PO 12345 ABC123")]
    [InlineData("pending ABC123 repair", "12345", "12345 ABC123 repair")]
    [InlineData("PENDING ABC123", "PO-77", "PO-77 ABC123")]
    public void BuildReference_ReplacesPendingToken(string currentReference, string poNumber, string expected)
    {
        PoReferenceBuilder.BuildReference(currentReference, poNumber).Should().Be(expected);
    }

    [Fact]
    public void BuildReference_PrependsPo_WhenPendingTokenIsMissing()
    {
        PoReferenceBuilder.BuildReference("ABC123 repair", "12345").Should().Be("12345 ABC123 repair");
    }

    [Fact]
    public void BuildReference_ReturnsPo_WhenReferenceIsBlank()
    {
        PoReferenceBuilder.BuildReference("   ", "12345").Should().Be("12345");
    }

    [Fact]
    public void BuildReference_TrimsAndCollapsesWhitespace()
    {
        PoReferenceBuilder.BuildReference(" PO   Pending   ABC123 ", " 12345 ").Should().Be("PO 12345 ABC123");
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter PoReferenceBuilderTests
```

Expected: build fails because `PoReferenceBuilder` does not exist.

- [ ] **Step 3: Implement helper**

Create `backend/Workshop.Api/Services/PoReferenceBuilder.cs`:

```csharp
using System.Text.RegularExpressions;

namespace Workshop.Api.Services;

public static class PoReferenceBuilder
{
    private static readonly Regex PendingTokenRegex = new(@"\bpending\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex WhitespaceRegex = new(@"\s+", RegexOptions.Compiled);

    public static string BuildReference(string? currentReference, string? poNumber)
    {
        var normalizedPo = Collapse(poNumber);
        if (string.IsNullOrWhiteSpace(normalizedPo))
            return Collapse(currentReference);

        var normalizedReference = Collapse(currentReference);
        if (string.IsNullOrWhiteSpace(normalizedReference))
            return normalizedPo;

        if (PendingTokenRegex.IsMatch(normalizedReference))
            return Collapse(PendingTokenRegex.Replace(normalizedReference, normalizedPo, 1));

        return Collapse($"{normalizedPo} {normalizedReference}");
    }

    private static string Collapse(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? ""
            : WhitespaceRegex.Replace(value.Trim(), " ");
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter PoReferenceBuilderTests
```

Expected: all `PoReferenceBuilderTests` pass.

- [ ] **Step 5: Commit**

```bash
git add backend/Workshop.Api/Services/PoReferenceBuilder.cs backend/Workshop.Api.Tests/PoReferenceBuilderTests.cs
git commit -m "Add PO reference builder"
```

---

### Task 2: PO State Persistence Additions

**Files:**
- Modify: `backend/Workshop.Api/Models/JobPoStateStatus.cs`
- Modify: `backend/Workshop.Api/Models/JobPoState.cs`
- Modify: `backend/Workshop.Api/Models/GmailMessageLog.cs`
- Modify: `backend/Workshop.Api/Data/AppDbContext.cs`
- Modify: `backend/Workshop.Api/Services/PoStateSchemaInitializerService.cs`
- Test: `backend/Workshop.Api.Tests/JobPoStateServiceTests.cs`

- [ ] **Step 1: Write failing status test**

Append to `backend/Workshop.Api.Tests/JobPoStateServiceTests.cs`:

```csharp
[Fact]
public async Task SyncStateForJobAsync_DoesNotReopenCompletedPoJobs()
{
    await using var db = CreateDb();
    var now = DateTime.UtcNow;
    var correlationId = JobPoStateService.BuildCorrelationId(5100);

    db.Jobs.Add(new Job
    {
        Id = 5100,
        NeedsPo = true,
        CreatedAt = now,
        UpdatedAt = now,
    });
    db.JobPoStates.Add(new JobPoState
    {
        JobId = 5100,
        CorrelationId = correlationId,
        Status = JobPoStateStatus.Completed,
        CreatedAt = now,
        UpdatedAt = now,
    });
    await db.SaveChangesAsync();

    var service = CreateService(db, enabled: true);

    await service.SyncStateForJobAsync(5100, CancellationToken.None);

    var state = await db.JobPoStates.SingleAsync(x => x.JobId == 5100);
    state.Status.Should().Be(JobPoStateStatus.Completed);
}
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter SyncStateForJobAsync_DoesNotReopenCompletedPoJobs
```

Expected: build fails because `JobPoStateStatus.Completed` does not exist.

- [ ] **Step 3: Add model fields**

Modify `backend/Workshop.Api/Models/JobPoStateStatus.cs`:

```csharp
namespace Workshop.Api.Models;

public enum JobPoStateStatus
{
    Draft = 0,
    AwaitingReply = 1,
    PendingConfirmation = 2,
    PoConfirmed = 3,
    EscalationRequired = 4,
    Completed = 5,
    Cancelled = 6,
}
```

Modify `backend/Workshop.Api/Models/JobPoState.cs` by adding:

```csharp
public string? SentSource { get; set; }
public DateTime? ManuallyMarkedSentAt { get; set; }
public DateTime? CompletedAt { get; set; }
```

Modify `backend/Workshop.Api/Models/GmailMessageLog.cs` by adding:

```csharp
public string? Source { get; set; }
```

- [ ] **Step 4: Map fields**

In `backend/Workshop.Api/Data/AppDbContext.cs`, add mappings in the `GmailMessageLog` entity:

```csharp
gm.Property(x => x.Source).HasColumnName("source");
```

Add mappings in the `JobPoState` entity block, which currently uses the local variable `jp`:

```csharp
jp.Property(x => x.SentSource).HasColumnName("sent_source");
jp.Property(x => x.ManuallyMarkedSentAt).HasColumnName("manually_marked_sent_at");
jp.Property(x => x.CompletedAt).HasColumnName("completed_at");
```

- [ ] **Step 5: Ensure additive schema columns**

Modify `backend/Workshop.Api/Services/PoStateSchemaInitializerService.cs` after `EnsureStatesForNeedsPoJobsAsync`:

```csharp
var db = scope.ServiceProvider.GetRequiredService<Workshop.Api.Data.AppDbContext>();
await db.Database.ExecuteSqlRawAsync("""
    ALTER TABLE job_po_states ADD COLUMN IF NOT EXISTS sent_source TEXT;
    ALTER TABLE job_po_states ADD COLUMN IF NOT EXISTS manually_marked_sent_at TIMESTAMPTZ;
    ALTER TABLE job_po_states ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE gmail_message_logs ADD COLUMN IF NOT EXISTS source TEXT;
    """, cancellationToken);
```

Add the missing `using Microsoft.EntityFrameworkCore;`.

- [ ] **Step 6: Preserve completed state during sync**

At the start of `JobPoStateService.SyncStateForJobAsync`, after loading or creating the state and before recalculating from logs, add:

```csharp
if (state.Status == JobPoStateStatus.Completed)
{
    state.LastSyncedAt = DateTime.UtcNow;
    state.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync(ct);
    return;
}
```

Place this after the `state is null` creation block so existing completed rows short-circuit.

- [ ] **Step 7: Run test**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter SyncStateForJobAsync_DoesNotReopenCompletedPoJobs
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add backend/Workshop.Api/Models/JobPoStateStatus.cs backend/Workshop.Api/Models/JobPoState.cs backend/Workshop.Api/Models/GmailMessageLog.cs backend/Workshop.Api/Data/AppDbContext.cs backend/Workshop.Api/Services/PoStateSchemaInitializerService.cs backend/Workshop.Api/Services/JobPoStateService.cs backend/Workshop.Api.Tests/JobPoStateServiceTests.cs
git commit -m "Add PO completed state metadata"
```

---

### Task 3: Gmail Label Service

**Files:**
- Create: `backend/Workshop.Api/Services/GmailLabelService.cs`
- Modify: `backend/Workshop.Api/Options/GmailOptions.cs`
- Modify: `backend/Workshop.Api/Program.cs`
- Test: `backend/Workshop.Api.Tests/GmailLabelServiceTests.cs`

- [ ] **Step 1: Write tests with fake Gmail API**

Create `backend/Workshop.Api.Tests/GmailLabelServiceTests.cs` with an HTTP handler that returns labels and captures modify requests:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace Workshop.Api.Tests;

public sealed class GmailLabelServiceTests
{
    [Fact]
    public async Task AddInvoicedLabelAsync_LabelsThread_WhenThreadIdExists()
    {
        await using var db = CreateDb();
        db.GmailAccounts.Add(new GmailAccount
        {
            Id = 1,
            Email = "team@example.com",
            RefreshToken = "refresh",
            AccessToken = "access",
            AccessTokenExpiresAt = DateTime.UtcNow.AddHours(1),
            Scope = "https://www.googleapis.com/auth/gmail.modify",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var handler = new GmailLabelHandler();
        var service = CreateService(db, handler);

        var result = await service.AddInvoicedLabelAsync(1, "thread-1", "msg-1", CancellationToken.None);

        result.Ok.Should().BeTrue();
        handler.ModifyPath.Should().Be("/gmail/v1/users/me/threads/thread-1/modify");
        handler.ModifyBody.Should().Contain("Label_123");
    }

    [Fact]
    public async Task AddInvoicedLabelAsync_Fails_WhenModifyScopeMissing()
    {
        await using var db = CreateDb();
        db.GmailAccounts.Add(new GmailAccount
        {
            Id = 1,
            Email = "team@example.com",
            RefreshToken = "refresh",
            AccessToken = "access",
            AccessTokenExpiresAt = DateTime.UtcNow.AddHours(1),
            Scope = "https://www.googleapis.com/auth/gmail.readonly",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, new GmailLabelHandler());

        var result = await service.AddInvoicedLabelAsync(1, "thread-1", "msg-1", CancellationToken.None);

        result.Ok.Should().BeFalse();
        result.Error.Should().Contain("gmail.modify");
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new AppDbContext(options);
    }

    private static GmailLabelService CreateService(AppDbContext db, GmailLabelHandler handler)
    {
        var tokenService = new GmailTokenService(
            db,
            new StaticHttpClientFactory(new HttpClient(new TokenHandler())),
            MsOptions.Create(new GmailOptions { ClientId = "id", ClientSecret = "secret" }));

        return new GmailLabelService(db, new StaticHttpClientFactory(new HttpClient(handler)
        {
            BaseAddress = new Uri("https://gmail.googleapis.com")
        }), tokenService);
    }

    private sealed class StaticHttpClientFactory : IHttpClientFactory
    {
        private readonly HttpClient _client;
        public StaticHttpClientFactory(HttpClient client) => _client = client;
        public HttpClient CreateClient(string name = "") => _client;
    }

    private sealed class TokenHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { access_token = "access", expires_in = 3600, scope = "https://www.googleapis.com/auth/gmail.modify" })
            });
    }

    private sealed class GmailLabelHandler : HttpMessageHandler
    {
        public string ModifyPath { get; private set; } = "";
        public string ModifyBody { get; private set; } = "";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri?.AbsolutePath == "/gmail/v1/users/me/labels")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = JsonContent.Create(new { labels = new[] { new { id = "Label_123", name = "invoiced" } } })
                };
            }

            ModifyPath = request.RequestUri?.AbsolutePath ?? "";
            ModifyBody = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { id = "thread-1" })
            };
        }
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter GmailLabelServiceTests
```

Expected: build fails because `GmailLabelService` does not exist.

- [ ] **Step 3: Implement service**

Create `backend/Workshop.Api/Services/GmailLabelService.cs`:

```csharp
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed class GmailLabelService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string ModifyScope = "https://www.googleapis.com/auth/gmail.modify";
    private const string LabelName = "invoiced";

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GmailTokenService _gmailTokenService;

    public GmailLabelService(AppDbContext db, IHttpClientFactory httpClientFactory, GmailTokenService gmailTokenService)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _gmailTokenService = gmailTokenService;
    }

    public async Task<GmailLabelResult> AddInvoicedLabelAsync(long? gmailAccountId, string? gmailThreadId, string? gmailMessageId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(gmailThreadId) && string.IsNullOrWhiteSpace(gmailMessageId))
            return GmailLabelResult.Fail(400, "No Gmail thread or message id is available.");

        var accountScope = gmailAccountId.HasValue
            ? await _db.GmailAccounts.AsNoTracking().Where(x => x.Id == gmailAccountId.Value).Select(x => x.Scope).FirstOrDefaultAsync(ct)
            : await _db.GmailAccounts.AsNoTracking().Where(x => x.IsDefault || x.IsActive).OrderByDescending(x => x.IsDefault).Select(x => x.Scope).FirstOrDefaultAsync(ct);

        if (!HasScope(accountScope, ModifyScope))
            return GmailLabelResult.Fail(403, "Gmail reconnect is required with gmail.modify permission.");

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(gmailAccountId, ct);
        if (!tokenResult.Ok)
            return GmailLabelResult.Fail(tokenResult.StatusCode, tokenResult.Error ?? "Failed to refresh Gmail access token.");

        var client = _httpClientFactory.CreateClient();
        var labelId = await ResolveLabelIdAsync(client, tokenResult.AccessToken, ct);
        if (string.IsNullOrWhiteSpace(labelId))
            return GmailLabelResult.Fail(404, "Gmail label 'invoiced' was not found.");

        var targetIsThread = !string.IsNullOrWhiteSpace(gmailThreadId);
        var escapedId = Uri.EscapeDataString((targetIsThread ? gmailThreadId : gmailMessageId)!);
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://gmail.googleapis.com/gmail/v1/users/me/{(targetIsThread ? "threads" : "messages")}/{escapedId}/modify");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        request.Content = JsonContent.Create(new GmailModifyRequest([labelId]));

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return GmailLabelResult.Fail((int)response.StatusCode, string.IsNullOrWhiteSpace(payload) ? "Failed to add Gmail label." : payload);

        return GmailLabelResult.Success(labelId);
    }

    private async Task<string?> ResolveLabelIdAsync(HttpClient client, string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://gmail.googleapis.com/gmail/v1/users/me/labels");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return null;

        var labels = JsonSerializer.Deserialize<GmailLabelsResponse>(payload, JsonOptions)?.Labels ?? [];
        return labels.FirstOrDefault(x => string.Equals(x.Name, LabelName, StringComparison.OrdinalIgnoreCase))?.Id;
    }

    private static bool HasScope(string? scope, string expected) =>
        (scope ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(x => string.Equals(x, expected, StringComparison.OrdinalIgnoreCase));

    private sealed record GmailModifyRequest([property: JsonPropertyName("addLabelIds")] string[] AddLabelIds);
    private sealed record GmailLabelsResponse([property: JsonPropertyName("labels")] GmailLabel[]? Labels);
    private sealed record GmailLabel([property: JsonPropertyName("id")] string Id, [property: JsonPropertyName("name")] string Name);
}

public sealed record GmailLabelResult(bool Ok, int StatusCode, string? Error, string? LabelId)
{
    public static GmailLabelResult Success(string labelId) => new(true, 200, null, labelId);
    public static GmailLabelResult Fail(int statusCode, string error) => new(false, statusCode, error, null);
}
```

- [ ] **Step 4: Add Gmail modify scope**

Modify `backend/Workshop.Api/Options/GmailOptions.cs` default `Scopes` to include:

```text
https://www.googleapis.com/auth/gmail.modify
```

Keep existing scopes.

- [ ] **Step 5: Register service**

Modify `backend/Workshop.Api/Program.cs`:

```csharp
builder.Services.AddScoped<GmailLabelService>();
```

- [ ] **Step 6: Run tests**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter GmailLabelServiceTests
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add backend/Workshop.Api/Services/GmailLabelService.cs backend/Workshop.Api/Options/GmailOptions.cs backend/Workshop.Api/Program.cs backend/Workshop.Api.Tests/GmailLabelServiceTests.cs
git commit -m "Add Gmail invoiced label service"
```

---

### Task 4: Job Invoice Reference Update Service Method

**Files:**
- Modify: `backend/Workshop.Api/Services/JobInvoiceService.cs`
- Test: `backend/Workshop.Api.Tests/PoTodoServiceTests.cs`

- [ ] **Step 1: Add test seam through PoTodoService test skeleton**

Create `backend/Workshop.Api.Tests/PoTodoServiceTests.cs` with a first test for reference-only behavior:

```csharp
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class PoTodoServiceTests
{
    [Fact]
    public void BuildConfirmPoReference_ReplacesPendingWithInputNumber()
    {
        PoReferenceBuilder.BuildReference("PO Pending ABC123", "12345").Should().Be("PO 12345 ABC123");
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new AppDbContext(options);
    }
}
```

This test should already pass after Task 1 and keeps the test file in place for following tasks.

- [ ] **Step 2: Add service method**

In `backend/Workshop.Api/Services/JobInvoiceService.cs`, add a public method:

```csharp
public async Task<JobInvoiceCreateResult> UpdateDraftReferenceAsync(long jobId, string reference, CancellationToken ct)
{
    var invoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
    if (invoice is null)
        return JobInvoiceCreateResult.Fail(404, "Job invoice not found.", null, null);

    var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
    if (job is null)
        return JobInvoiceCreateResult.Fail(404, "Job not found.", null, null);

    if (string.IsNullOrWhiteSpace(invoice.ExternalInvoiceId) || !Guid.TryParse(invoice.ExternalInvoiceId, out _))
        return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.", null, null);

    if (!string.Equals(invoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
        return JobInvoiceCreateResult.Fail(400, "Only Xero draft invoices can have their reference updated from PO TODO.", null, null);

    var request = BuildSyncRequestFromExistingInvoice(invoice, reference.Trim());
    return await SyncDraftForJobAsync(jobId, request, ct);
}
```

Also add private helper near existing sync request builders:

```csharp
private static SyncJobInvoiceDraftRequest BuildSyncRequestFromExistingInvoice(JobInvoice invoice, string reference)
{
    var existing = JsonSerializer.Deserialize<SyncJobInvoiceDraftRequest>(invoice.RequestPayloadJson ?? "{}", JsonOptions)
        ?? new SyncJobInvoiceDraftRequest();
    existing.Reference = reference;
    return existing;
}
```

- [ ] **Step 3: Run build**

Run:

```bash
dotnet build backend/Workshop.Api/Workshop.Api.csproj
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add backend/Workshop.Api/Services/JobInvoiceService.cs backend/Workshop.Api.Tests/PoTodoServiceTests.cs
git commit -m "Add draft invoice reference update seam"
```

---

### Task 5: PO TODO Service Core

**Files:**
- Create: `backend/Workshop.Api/Services/PoTodoService.cs`
- Modify: `backend/Workshop.Api/Services/JobPoStateService.cs`
- Test: `backend/Workshop.Api.Tests/PoTodoServiceTests.cs`

- [ ] **Step 1: Add tests for manual sent and completion**

Append to `PoTodoServiceTests.cs`:

```csharp
[Fact]
public async Task ManualConfirmSentAsync_MovesDraftToAwaitingPoAndRecordsManualSource()
{
    await using var db = CreateDb();
    var now = DateTime.UtcNow;
    db.Jobs.Add(new Job { Id = 5200, NeedsPo = true, CreatedAt = now, UpdatedAt = now });
    db.JobPoStates.Add(new JobPoState
    {
        JobId = 5200,
        CorrelationId = JobPoStateService.BuildCorrelationId(5200),
        Status = JobPoStateStatus.Draft,
        CreatedAt = now,
        UpdatedAt = now,
    });
    await db.SaveChangesAsync();

    var service = CreateService(db);

    var result = await service.ManualConfirmSentAsync(5200, CancellationToken.None);

    result.Success.Should().BeTrue();
    var state = await db.JobPoStates.SingleAsync(x => x.JobId == 5200);
    state.Status.Should().Be(JobPoStateStatus.AwaitingReply);
    state.SentSource.Should().Be("manual");
    state.ManuallyMarkedSentAt.Should().NotBeNull();
}

[Fact]
public async Task CompleteAsync_OnlyCompletesPoConfirmedRows()
{
    await using var db = CreateDb();
    var now = DateTime.UtcNow;
    db.Jobs.AddRange(
        new Job { Id = 5201, NeedsPo = true, CreatedAt = now, UpdatedAt = now },
        new Job { Id = 5202, NeedsPo = true, CreatedAt = now, UpdatedAt = now });
    db.JobPoStates.AddRange(
        new JobPoState { JobId = 5201, CorrelationId = "PO-5201-X", Status = JobPoStateStatus.PoConfirmed, CreatedAt = now, UpdatedAt = now },
        new JobPoState { JobId = 5202, CorrelationId = "PO-5202-X", Status = JobPoStateStatus.AwaitingReply, CreatedAt = now, UpdatedAt = now });
    await db.SaveChangesAsync();

    var service = CreateService(db);

    var result = await service.CompleteAsync([5201, 5202], CancellationToken.None);

    result.Updated.Should().Be(1);
    (await db.JobPoStates.SingleAsync(x => x.JobId == 5201)).Status.Should().Be(JobPoStateStatus.Completed);
    (await db.JobPoStates.SingleAsync(x => x.JobId == 5202)).Status.Should().Be(JobPoStateStatus.AwaitingReply);
}
```

Add helper:

```csharp
private static PoTodoService CreateService(AppDbContext db)
{
    return new PoTodoService(db, null!, null!, null!, null!, null!);
}
```

This helper intentionally uses nulls for dependencies not needed by these first tests. Later steps will replace it with fakes for confirm/sync tests.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter PoTodoServiceTests
```

Expected: build fails because `PoTodoService` does not exist.

- [ ] **Step 3: Implement records and simple methods**

Create `backend/Workshop.Api/Services/PoTodoService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class PoTodoService
{
    private readonly AppDbContext _db;
    private readonly GmailThreadSyncService? _gmailThreadSyncService;
    private readonly JobPoStateService? _jobPoStateService;
    private readonly GmailLabelService? _gmailLabelService;
    private readonly JobInvoiceService? _jobInvoiceService;
    private readonly ILogger<PoTodoService>? _logger;

    public PoTodoService(
        AppDbContext db,
        GmailThreadSyncService? gmailThreadSyncService,
        JobPoStateService? jobPoStateService,
        GmailLabelService? gmailLabelService,
        JobInvoiceService? jobInvoiceService,
        ILogger<PoTodoService>? logger)
    {
        _db = db;
        _gmailThreadSyncService = gmailThreadSyncService;
        _jobPoStateService = jobPoStateService;
        _gmailLabelService = gmailLabelService;
        _jobInvoiceService = jobInvoiceService;
        _logger = logger;
    }

    public async Task<PoTodoActionResult> ManualConfirmSentAsync(long jobId, CancellationToken ct)
    {
        var state = await EnsureStateAsync(jobId, ct);
        if (state is null)
            return PoTodoActionResult.Fail("Job not found or does not need PO.");

        state.Status = JobPoStateStatus.AwaitingReply;
        state.SentSource = "manual";
        state.ManuallyMarkedSentAt = DateTime.UtcNow;
        state.LastRequestSentAt ??= DateTime.UtcNow;
        state.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return PoTodoActionResult.Ok();
    }

    public async Task<PoTodoCompleteResult> CompleteAsync(long[] jobIds, CancellationToken ct)
    {
        var distinctIds = jobIds.Distinct().ToArray();
        var states = await _db.JobPoStates.Where(x => distinctIds.Contains(x.JobId)).ToListAsync(ct);
        var updated = 0;
        foreach (var state in states.Where(x => x.Status == JobPoStateStatus.PoConfirmed))
        {
            state.Status = JobPoStateStatus.Completed;
            state.CompletedAt = DateTime.UtcNow;
            state.UpdatedAt = DateTime.UtcNow;
            updated++;
        }

        await _db.SaveChangesAsync(ct);
        return new PoTodoCompleteResult(updated, distinctIds.Length - updated);
    }

    private async Task<JobPoState?> EnsureStateAsync(long jobId, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId && x.NeedsPo, ct);
        if (job is null)
            return null;

        var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (state is not null)
            return state;

        state = new JobPoState
        {
            JobId = jobId,
            CorrelationId = JobPoStateService.BuildCorrelationId(jobId),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.JobPoStates.Add(state);
        return state;
    }
}

public sealed record PoTodoActionResult(bool Success, string? Error)
{
    public static PoTodoActionResult Ok() => new(true, null);
    public static PoTodoActionResult Fail(string error) => new(false, error);
}

public sealed record PoTodoCompleteResult(int Updated, int Skipped);
```

- [ ] **Step 4: Register service**

Modify `backend/Workshop.Api/Program.cs`:

```csharp
builder.Services.AddScoped<PoTodoService>();
```

- [ ] **Step 5: Run tests**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter PoTodoServiceTests
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add backend/Workshop.Api/Services/PoTodoService.cs backend/Workshop.Api/Program.cs backend/Workshop.Api.Tests/PoTodoServiceTests.cs
git commit -m "Add PO TODO service basics"
```

---

### Task 6: PO TODO List and Sync

**Files:**
- Modify: `backend/Workshop.Api/Services/PoTodoService.cs`
- Test: `backend/Workshop.Api.Tests/PoTodoServiceTests.cs`

- [ ] **Step 1: Add list test**

Append to `PoTodoServiceTests.cs`:

```csharp
[Fact]
public async Task GetTodoAsync_ExcludesCompletedRows()
{
    await using var db = CreateDb();
    var now = DateTime.UtcNow;
    db.Vehicles.Add(new Vehicle { Id = 1, Plate = "ABC123", Make = "Toyota", Model = "Aqua" });
    db.Jobs.AddRange(
        new Job { Id = 5300, VehicleId = 1, NeedsPo = true, CreatedAt = now, UpdatedAt = now },
        new Job { Id = 5301, VehicleId = 1, NeedsPo = true, CreatedAt = now, UpdatedAt = now });
    db.JobPoStates.AddRange(
        new JobPoState { JobId = 5300, CorrelationId = "PO-5300-X", Status = JobPoStateStatus.Draft, CreatedAt = now, UpdatedAt = now },
        new JobPoState { JobId = 5301, CorrelationId = "PO-5301-X", Status = JobPoStateStatus.Completed, CreatedAt = now, UpdatedAt = now });
    await db.SaveChangesAsync();

    var service = CreateService(db);

    var result = await service.GetTodoAsync("pendingSend", CancellationToken.None);

    result.Items.Should().ContainSingle(x => x.JobId == 5300);
    result.Items.Should().NotContain(x => x.JobId == 5301);
}
```

- [ ] **Step 2: Implement list DTOs**

Add to `PoTodoService.cs`:

```csharp
public async Task<PoTodoListResult> GetTodoAsync(string? status, CancellationToken ct)
{
    var normalized = NormalizeStatus(status);
    var query =
        from job in _db.Jobs.AsNoTracking()
        join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id into vehicles
        from vehicle in vehicles.DefaultIfEmpty()
        join customer in _db.Customers.AsNoTracking() on job.CustomerId equals customer.Id into customers
        from customer in customers.DefaultIfEmpty()
        join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId into states
        from state in states.DefaultIfEmpty()
        join invoice in _db.JobInvoices.AsNoTracking() on job.Id equals invoice.JobId into invoices
        from invoice in invoices.DefaultIfEmpty()
        where job.NeedsPo
        where job.Status == null || job.Status.ToLower() != "archived"
        select new { job, vehicle, customer, state, invoice };

    query = normalized switch
    {
        "pendingSend" => query.Where(x => x.state == null || x.state.Status == JobPoStateStatus.Draft),
        "awaitingPo" => query.Where(x => x.state != null && (x.state.Status == JobPoStateStatus.AwaitingReply || x.state.Status == JobPoStateStatus.PendingConfirmation || x.state.Status == JobPoStateStatus.EscalationRequired)),
        "invoiced" => query.Where(x => x.state != null && x.state.Status == JobPoStateStatus.PoConfirmed),
        _ => query.Where(x => x.state == null || x.state.Status != JobPoStateStatus.Completed),
    };

    var rows = await query
        .Where(x => x.state == null || x.state.Status != JobPoStateStatus.Completed)
        .OrderByDescending(x => x.job.CreatedAt)
        .Take(500)
        .ToListAsync(ct);

    var items = rows.Select(x => new PoTodoRow(
        x.job.Id,
        x.job.CreatedAt,
        x.customer?.BusinessCode ?? "",
        x.vehicle?.Plate ?? "",
        string.Join(" ", new[] { x.vehicle?.Year?.ToString(), x.vehicle?.Make, x.vehicle?.Model }.Where(v => !string.IsNullOrWhiteSpace(v))),
        x.job.Notes ?? "",
        x.job.InvoiceReference ?? x.invoice?.Reference ?? "",
        x.invoice?.ExternalInvoiceId,
        x.state?.Status.ToString() ?? JobPoStateStatus.Draft.ToString(),
        x.state?.SentSource,
        x.state?.DetectedPoNumber,
        x.state?.ConfirmedPoNumber,
        x.state?.GmailDraftId,
        x.state?.CorrelationId ?? JobPoStateService.BuildCorrelationId(x.job.Id)))
        .ToList();

    return new PoTodoListResult(items.Count, items);
}

private static string NormalizeStatus(string? status) =>
    string.IsNullOrWhiteSpace(status) ? "" : status.Trim();
```

Add records:

```csharp
public sealed record PoTodoListResult(int Total, IReadOnlyList<PoTodoRow> Items);

public sealed record PoTodoRow(
    long JobId,
    DateTime CreatedAt,
    string Code,
    string Plate,
    string Model,
    string Notes,
    string Reference,
    string? XeroInvoiceId,
    string Status,
    string? SentSource,
    string? DetectedPoNumber,
    string? ConfirmedPoNumber,
    string? GmailDraftId,
    string CorrelationId);
```

- [ ] **Step 3: Implement sync**

Add method to `PoTodoService.cs`:

```csharp
public async Task<PoTodoSyncResult> SyncActiveAsync(CancellationToken ct)
{
    if (_gmailThreadSyncService is null || _jobPoStateService is null)
        return new PoTodoSyncResult(0, 0, ["Gmail sync service is unavailable."]);

    await _jobPoStateService.EnsureStatesForNeedsPoJobsAsync(ct);

    var targets = await (
        from state in _db.JobPoStates
        join job in _db.Jobs on state.JobId equals job.Id
        where job.NeedsPo
        where job.Status == null || job.Status.ToLower() != "archived"
        where state.Status == JobPoStateStatus.Draft || state.Status == JobPoStateStatus.AwaitingReply || state.Status == JobPoStateStatus.PendingConfirmation || state.Status == JobPoStateStatus.EscalationRequired
        select new { state.JobId, state.CorrelationId, state.CounterpartyEmail }
    ).ToListAsync(ct);

    var syncedMessages = 0;
    var warnings = new List<string>();
    foreach (var target in targets)
    {
        var sync = await _gmailThreadSyncService.SyncThreadAsync(
            target.CounterpartyEmail,
            target.CorrelationId,
            20,
            null,
            ct);
        if (sync.Ok)
        {
            syncedMessages += sync.SyncedCount;
        }
        else if (!string.IsNullOrWhiteSpace(sync.Warning))
        {
            warnings.Add($"Job {target.JobId}: {sync.Warning}");
        }

        await _jobPoStateService.SyncStateForJobAsync(target.JobId, ct);
    }

    return new PoTodoSyncResult(targets.Count, syncedMessages, warnings);
}
```

Add record:

```csharp
public sealed record PoTodoSyncResult(int CheckedJobs, int SyncedMessages, IReadOnlyList<string> Warnings);
```

- [ ] **Step 4: Run tests/build**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter PoTodoServiceTests
dotnet build backend/Workshop.Api/Workshop.Api.csproj
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```bash
git add backend/Workshop.Api/Services/PoTodoService.cs backend/Workshop.Api.Tests/PoTodoServiceTests.cs
git commit -m "Add PO TODO list and sync"
```

---

### Task 7: Confirm PO Workflow

**Files:**
- Modify: `backend/Workshop.Api/Services/PoTodoService.cs`
- Test: `backend/Workshop.Api.Tests/PoTodoServiceTests.cs`

- [ ] **Step 1: Add step result model**

Add records to `PoTodoService.cs`:

```csharp
public sealed record PoTodoStepResult(string Status, string Message)
{
    public static PoTodoStepResult Pending(string message) => new("pending", message);
    public static PoTodoStepResult Running(string message) => new("running", message);
    public static PoTodoStepResult Success(string message) => new("success", message);
    public static PoTodoStepResult Failed(string message) => new("failed", message);
}

public sealed record ConfirmPoResult(
    bool Success,
    long JobId,
    string PoNumber,
    string InvoiceReference,
    Dictionary<string, PoTodoStepResult> Steps);
```

- [ ] **Step 2: Add unit test for missing PO**

Append to `PoTodoServiceTests.cs`:

```csharp
[Fact]
public async Task ConfirmPoAsync_FailsSaveStep_WhenPoNumberIsBlank()
{
    await using var db = CreateDb();
    var service = CreateService(db);

    var result = await service.ConfirmPoAsync(5400, " ", CancellationToken.None);

    result.Success.Should().BeFalse();
    result.Steps["savePo"].Status.Should().Be("failed");
}
```

- [ ] **Step 3: Implement ConfirmPoAsync skeleton**

Add to `PoTodoService.cs`:

```csharp
public async Task<ConfirmPoResult> ConfirmPoAsync(long jobId, string? poNumber, CancellationToken ct)
{
    var steps = new Dictionary<string, PoTodoStepResult>
    {
        ["savePo"] = PoTodoStepResult.Pending("Waiting to save PO."),
        ["xero"] = PoTodoStepResult.Pending("Waiting to update Xero reference."),
        ["gmail"] = PoTodoStepResult.Pending("Waiting to add Gmail label."),
        ["poState"] = PoTodoStepResult.Pending("Waiting to update PO state."),
    };

    var normalizedPo = poNumber?.Trim() ?? "";
    if (string.IsNullOrWhiteSpace(normalizedPo))
    {
        steps["savePo"] = PoTodoStepResult.Failed("PO number is required.");
        return new ConfirmPoResult(false, jobId, "", "", steps);
    }

    var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId && x.NeedsPo, ct);
    if (job is null)
    {
        steps["savePo"] = PoTodoStepResult.Failed("Job not found or does not need PO.");
        return new ConfirmPoResult(false, jobId, normalizedPo, "", steps);
    }

    var invoice = await _db.JobInvoices.AsNoTracking().FirstOrDefaultAsync(x => x.JobId == jobId, ct);
    var nextReference = PoReferenceBuilder.BuildReference(job.InvoiceReference ?? invoice?.Reference, normalizedPo);

    steps["savePo"] = PoTodoStepResult.Running("Saving PO number.");
    job.PoNumber = normalizedPo;
    job.InvoiceReference = nextReference;
    job.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync(ct);
    steps["savePo"] = PoTodoStepResult.Success("PO saved.");

    if (_jobInvoiceService is null)
    {
        steps["xero"] = PoTodoStepResult.Failed("Xero invoice service is unavailable.");
        return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
    }

    steps["xero"] = PoTodoStepResult.Running("Updating Xero reference.");
    var xero = await _jobInvoiceService.UpdateDraftReferenceAsync(jobId, nextReference, ct);
    if (!xero.Ok)
    {
        steps["xero"] = PoTodoStepResult.Failed(xero.Error ?? "Failed to update Xero reference.");
        return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
    }
    steps["xero"] = PoTodoStepResult.Success("Xero reference updated.");

    var latestLog = await _db.GmailMessageLogs.AsNoTracking()
        .Where(x => x.CorrelationId == JobPoStateService.BuildCorrelationId(jobId))
        .OrderByDescending(x => x.InternalDateMs ?? 0)
        .FirstOrDefaultAsync(ct);

    steps["gmail"] = PoTodoStepResult.Running("Adding Gmail label.");
    var gmail = _gmailLabelService is null
        ? GmailLabelResult.Fail(500, "Gmail label service is unavailable.")
        : await _gmailLabelService.AddInvoicedLabelAsync(latestLog?.GmailAccountId, latestLog?.GmailThreadId, latestLog?.GmailMessageId, ct);
    if (!gmail.Ok)
    {
        steps["gmail"] = PoTodoStepResult.Failed(gmail.Error ?? "Failed to add Gmail label.");
        return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
    }
    steps["gmail"] = PoTodoStepResult.Success("Gmail label added.");

    steps["poState"] = PoTodoStepResult.Running("Updating PO state.");
    var state = await EnsureStateAsync(jobId, ct);
    if (state is null)
    {
        steps["poState"] = PoTodoStepResult.Failed("PO state was not found.");
        return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
    }

    state.Status = JobPoStateStatus.PoConfirmed;
    state.ConfirmedPoNumber = normalizedPo;
    state.FollowUpEnabled = false;
    state.NextFollowUpDueAt = null;
    state.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync(ct);
    steps["poState"] = PoTodoStepResult.Success("PO state updated.");

    return new ConfirmPoResult(true, jobId, normalizedPo, nextReference, steps);
}
```

- [ ] **Step 4: Run tests/build**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj --filter ConfirmPoAsync_FailsSaveStep_WhenPoNumberIsBlank
dotnet build backend/Workshop.Api/Workshop.Api.csproj
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/Workshop.Api/Services/PoTodoService.cs backend/Workshop.Api.Tests/PoTodoServiceTests.cs
git commit -m "Add PO confirmation workflow"
```

---

### Task 8: PO Controller API

**Files:**
- Create: `backend/Workshop.Api/Controllers/PoController.cs`
- Test: build via `dotnet build`

- [ ] **Step 1: Create controller**

Create `backend/Workshop.Api/Controllers/PoController.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/po")]
public sealed class PoController : ControllerBase
{
    private readonly PoTodoService _poTodoService;

    public PoController(PoTodoService poTodoService)
    {
        _poTodoService = poTodoService;
    }

    [HttpGet("todo")]
    public async Task<IActionResult> GetTodo([FromQuery] string? status, CancellationToken ct)
    {
        var result = await _poTodoService.GetTodoAsync(status, ct);
        return Ok(result);
    }

    [HttpPost("todo/sync")]
    public async Task<IActionResult> Sync(CancellationToken ct)
    {
        var result = await _poTodoService.SyncActiveAsync(ct);
        return Ok(result);
    }

    [HttpPost("jobs/{jobId:long}/manual-confirm-sent")]
    public async Task<IActionResult> ManualConfirmSent(long jobId, CancellationToken ct)
    {
        var result = await _poTodoService.ManualConfirmSentAsync(jobId, ct);
        return result.Success ? Ok(result) : BadRequest(new { error = result.Error });
    }

    public sealed record ConfirmPoRequest(string? PoNumber);

    [HttpPost("jobs/{jobId:long}/confirm-po")]
    public async Task<IActionResult> ConfirmPo(long jobId, [FromBody] ConfirmPoRequest request, CancellationToken ct)
    {
        var result = await _poTodoService.ConfirmPoAsync(jobId, request.PoNumber, ct);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    public sealed record CompleteRequest(long[] JobIds);

    [HttpPost("jobs/complete")]
    public async Task<IActionResult> Complete([FromBody] CompleteRequest request, CancellationToken ct)
    {
        var result = await _poTodoService.CompleteAsync(request.JobIds ?? [], ct);
        return Ok(result);
    }
}
```

- [ ] **Step 2: Run build**

Run:

```bash
dotnet build backend/Workshop.Api/Workshop.Api.csproj
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add backend/Workshop.Api/Controllers/PoController.cs
git commit -m "Add PO TODO API controller"
```

---

### Task 9: Draft Preview API

**Files:**
- Modify: `backend/Workshop.Api/Services/PoTodoService.cs`
- Modify: `backend/Workshop.Api/Controllers/PoController.cs`
- Review: `apps/shell/src/features/invoice/components/poPanel/PoRequestPanel.tsx`

- [ ] **Step 1: Extract draft content builder**

Move the draft subject/body construction from `PoRequestPanel.tsx` into a backend-compatible shape in `PoTodoService.GetDraftPreviewAsync`. Match the visible Job Detail PO email content:

```csharp
public async Task<PoDraftPreviewResult?> GetDraftPreviewAsync(long jobId, CancellationToken ct)
{
    var row = await (
        from job in _db.Jobs.AsNoTracking()
        join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id into vehicles
        from vehicle in vehicles.DefaultIfEmpty()
        join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId into states
        from state in states.DefaultIfEmpty()
        where job.Id == jobId && job.NeedsPo
        select new { job, vehicle, state }
    ).FirstOrDefaultAsync(ct);

    if (row is null)
        return null;

    var correlationId = row.state?.CorrelationId ?? JobPoStateService.BuildCorrelationId(jobId);
    var vehicleLabel = string.Join(" ", new[] { row.vehicle?.Plate, row.vehicle?.Make, row.vehicle?.Model }.Where(x => !string.IsNullOrWhiteSpace(x)));
    var subject = $"PO Request for {vehicleLabel} [{correlationId}]";
    var body = $"""
        <div>Hi,</div>
        <div style="margin-top: 12px;">Could you please issue a PO number for the jobs on the vehicle below? Much appreciated.</div>
        <div style="margin-top: 12px;"><strong>Vehicle:</strong> {System.Net.WebUtility.HtmlEncode(vehicleLabel)}</div>
        <div><strong>Reference:</strong> {System.Net.WebUtility.HtmlEncode(correlationId)}</div>
        """;

    return new PoDraftPreviewResult(jobId, row.state?.CounterpartyEmail ?? "", subject, body, row.state?.GmailDraftId);
}
```

Add record:

```csharp
public sealed record PoDraftPreviewResult(long JobId, string To, string Subject, string HtmlBody, string? GmailDraftId);
```

- [ ] **Step 2: Add controller endpoint**

Add to `PoController.cs`:

```csharp
[HttpGet("jobs/{jobId:long}/draft-preview")]
public async Task<IActionResult> GetDraftPreview(long jobId, CancellationToken ct)
{
    var result = await _poTodoService.GetDraftPreviewAsync(jobId, ct);
    return result is null ? NotFound(new { error = "PO draft preview is not available." }) : Ok(result);
}
```

- [ ] **Step 3: Run build**

Run:

```bash
dotnet build backend/Workshop.Api/Workshop.Api.csproj
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add backend/Workshop.Api/Services/PoTodoService.cs backend/Workshop.Api/Controllers/PoController.cs
git commit -m "Add PO draft preview API"
```

---

### Task 10: Frontend API and Types

**Files:**
- Create: `apps/shell/src/features/poTodo/poTodo.types.ts`
- Create: `apps/shell/src/features/poTodo/poTodoApi.ts`

- [ ] **Step 1: Add types**

Create `apps/shell/src/features/poTodo/poTodo.types.ts`:

```ts
export type PoTodoTab = "pendingSend" | "awaitingPo" | "invoiced";

export type PoTodoRow = {
  jobId: number;
  createdAt: string;
  code: string;
  plate: string;
  model: string;
  notes: string;
  reference: string;
  xeroInvoiceId?: string | null;
  status: string;
  sentSource?: string | null;
  detectedPoNumber?: string | null;
  confirmedPoNumber?: string | null;
  gmailDraftId?: string | null;
  correlationId: string;
};

export type PoTodoListResponse = {
  total: number;
  items: PoTodoRow[];
};

export type PoTodoSyncResponse = {
  checkedJobs: number;
  syncedMessages: number;
  warnings: string[];
};

export type PoDraftPreview = {
  jobId: number;
  to: string;
  subject: string;
  htmlBody: string;
  gmailDraftId?: string | null;
};

export type PoStepStatus = "pending" | "running" | "success" | "failed";

export type PoStepResult = {
  status: PoStepStatus;
  message: string;
};

export type ConfirmPoResponse = {
  success: boolean;
  jobId: number;
  poNumber: string;
  invoiceReference: string;
  steps: Record<"savePo" | "xero" | "gmail" | "poState", PoStepResult>;
};
```

- [ ] **Step 2: Add API functions**

Create `apps/shell/src/features/poTodo/poTodoApi.ts`:

```ts
import { requestJson } from "@/utils/api";
import type { ConfirmPoResponse, PoDraftPreview, PoTodoListResponse, PoTodoSyncResponse, PoTodoTab } from "./poTodo.types";

export function fetchPoTodo(tab: PoTodoTab) {
  const query = new URLSearchParams({ status: tab });
  return requestJson<PoTodoListResponse>(`/api/po/todo?${query.toString()}`);
}

export function syncPoTodo() {
  return requestJson<PoTodoSyncResponse>("/api/po/todo/sync", { method: "POST" });
}

export function fetchPoDraftPreview(jobId: number) {
  return requestJson<PoDraftPreview>(`/api/po/jobs/${encodeURIComponent(String(jobId))}/draft-preview`);
}

export function manualConfirmPoSent(jobId: number) {
  return requestJson<{ success: boolean; error?: string | null }>(
    `/api/po/jobs/${encodeURIComponent(String(jobId))}/manual-confirm-sent`,
    { method: "POST" }
  );
}

export function confirmPo(jobId: number, poNumber: string) {
  return requestJson<ConfirmPoResponse>(`/api/po/jobs/${encodeURIComponent(String(jobId))}/confirm-po`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poNumber }),
  });
}

export function completePoJobs(jobIds: number[]) {
  return requestJson<{ updated: number; skipped: number }>("/api/po/jobs/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds }),
  });
}
```

- [ ] **Step 3: Run build**

Run:

```bash
pnpm --dir apps/shell build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/shell/src/features/poTodo/poTodo.types.ts apps/shell/src/features/poTodo/poTodoApi.ts
git commit -m "Add PO TODO frontend API"
```

---

### Task 11: Frontend Dialogs

**Files:**
- Create: `apps/shell/src/features/poTodo/PoDraftPreviewDialog.tsx`
- Create: `apps/shell/src/features/poTodo/ManualSentConfirmDialog.tsx`
- Create: `apps/shell/src/features/poTodo/ConfirmPoProgressDialog.tsx`

- [ ] **Step 1: Draft preview dialog**

Create `PoDraftPreviewDialog.tsx`:

```tsx
import { X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { PoDraftPreview } from "./poTodo.types";

type Props = {
  preview: PoDraftPreview | null;
  open: boolean;
  onClose: () => void;
};

export function PoDraftPreviewDialog({ preview, open, onClose }: Props) {
  if (!open || !preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <Card className="w-full max-w-3xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">PO 草稿预览</div>
            <div className="mt-1 text-sm text-slate-500">{preview.subject}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 text-sm">
          <div><span className="font-semibold text-slate-700">To:</span> {preview.to || "-"}</div>
          <div><span className="font-semibold text-slate-700">Subject:</span> {preview.subject}</div>
          <div className="rounded-lg border border-slate-200 bg-white p-4" dangerouslySetInnerHTML={{ __html: preview.htmlBody }} />
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>关闭</Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Manual sent confirm dialog**

Create `ManualSentConfirmDialog.tsx`:

```tsx
import { Button, Card } from "@/components/ui";
import type { PoTodoRow } from "./poTodo.types";

type Props = {
  row: PoTodoRow | null;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ManualSentConfirmDialog({ row, confirming, onCancel, onConfirm }: Props) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <Card className="w-full max-w-md p-5">
        <div className="text-lg font-semibold text-slate-900">确认手工标记已发送</div>
        <div className="mt-2 text-sm text-slate-600">
          Gmail 没有找到这封 PO 邮件，确认手工标记为已发送吗？
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {row.plate} · {row.model || row.jobId}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button variant="primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? "处理中..." : "已发送"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Confirm PO progress dialog**

Create `ConfirmPoProgressDialog.tsx`:

```tsx
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { ConfirmPoResponse, PoStepResult } from "./poTodo.types";

type Props = {
  open: boolean;
  result: ConfirmPoResponse | null;
  running: boolean;
  onClose: () => void;
};

const labels: Record<keyof ConfirmPoResponse["steps"], string> = {
  savePo: "保存 PO number",
  xero: "更新 Xero Reference",
  gmail: "添加 Gmail invoiced label",
  poState: "更新 PO 状态",
};

function StepIcon({ step }: { step?: PoStepResult }) {
  if (step?.status === "success") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (step?.status === "failed") return <XCircle className="h-5 w-5 text-red-600" />;
  if (step?.status === "running") return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
  return <span className="h-5 w-5 rounded-full border border-slate-300" />;
}

export function ConfirmPoProgressDialog({ open, result, running, onClose }: Props) {
  if (!open) return null;
  const steps = result?.steps;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <Card className="w-full max-w-lg p-5">
        <div className="text-lg font-semibold text-slate-900">确认 PO 进度</div>
        <div className="mt-4 space-y-3">
          {(Object.keys(labels) as Array<keyof ConfirmPoResponse["steps"]>).map((key) => (
            <div key={key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <StepIcon step={steps?.[key]} />
              <div>
                <div className="font-medium text-slate-800">{labels[key]}</div>
                <div className="mt-1 text-sm text-slate-500">{steps?.[key]?.message || "等待开始。"}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose} disabled={running}>
            {running ? "处理中..." : "关闭"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run build**

Run:

```bash
pnpm --dir apps/shell build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/features/poTodo/PoDraftPreviewDialog.tsx apps/shell/src/features/poTodo/ManualSentConfirmDialog.tsx apps/shell/src/features/poTodo/ConfirmPoProgressDialog.tsx
git commit -m "Add PO TODO dialogs"
```

---

### Task 12: PO TODO Table and Page

**Files:**
- Create: `apps/shell/src/features/poTodo/PoTodoTable.tsx`
- Create: `apps/shell/src/features/poTodo/PoTodoPage.tsx`

- [ ] **Step 1: Create table**

Create `PoTodoTable.tsx` with columns from the spec:

```tsx
import { Link } from "react-router-dom";
import { Button, Input } from "@/components/ui";
import type { PoTodoRow, PoTodoTab } from "./poTodo.types";

type Props = {
  tab: PoTodoTab;
  rows: PoTodoRow[];
  selectedIds: Set<number>;
  poInputs: Record<number, string>;
  onToggleSelected: (jobId: number) => void;
  onToggleAll: () => void;
  onPoInputChange: (jobId: number, value: string) => void;
  onPreviewDraft: (row: PoTodoRow) => void;
  onManualSent: (row: PoTodoRow) => void;
  onConfirmPo: (row: PoTodoRow) => void;
};

function xeroUrl(id?: string | null) {
  return id ? `https://go.xero.com/AccountsReceivable/View.aspx?invoiceID=${encodeURIComponent(id)}` : "";
}

export function PoTodoTable(props: Props) {
  const allSelected = props.rows.length > 0 && props.rows.every((row) => props.selectedIds.has(row.jobId));

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            {props.tab === "invoiced" ? (
              <th className="px-3 py-3">
                <input type="checkbox" checked={allSelected} onChange={props.onToggleAll} />
              </th>
            ) : null}
            <th className="px-3 py-3">创建时间</th>
            <th className="px-3 py-3">Code</th>
            <th className="px-3 py-3">车牌</th>
            <th className="px-3 py-3">型号</th>
            <th className="px-3 py-3">备注</th>
            <th className="px-3 py-3">Reference</th>
            <th className="px-3 py-3">Xero</th>
            <th className="px-3 py-3">PO 草稿</th>
            <th className="px-3 py-3">是否发送</th>
            <th className="px-3 py-3">PO</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const isSent = props.tab !== "pendingSend" || row.sentSource === "gmail";
            return (
              <tr key={row.jobId} className="border-t border-slate-100">
                {props.tab === "invoiced" ? (
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={props.selectedIds.has(row.jobId)} onChange={() => props.onToggleSelected(row.jobId)} />
                  </td>
                ) : null}
                <td className="px-3 py-3">{String(row.createdAt).slice(0, 10)}</td>
                <td className="px-3 py-3">{row.code || "-"}</td>
                <td className="px-3 py-3">
                  <Link className="font-semibold text-blue-700 hover:underline" to={`/jobs/${row.jobId}?tab=PO`}>
                    {row.plate || row.jobId}
                  </Link>
                </td>
                <td className="px-3 py-3">{row.model || "-"}</td>
                <td className="max-w-[220px] truncate px-3 py-3">{row.notes || "-"}</td>
                <td className="max-w-[220px] truncate px-3 py-3">{row.reference || "-"}</td>
                <td className="px-3 py-3">
                  {row.xeroInvoiceId ? <a className="text-blue-700 hover:underline" href={xeroUrl(row.xeroInvoiceId)} target="_blank" rel="noreferrer">Open</a> : "-"}
                </td>
                <td className="px-3 py-3">
                  {props.tab === "pendingSend" ? (
                    <Button className="h-9 px-3" onClick={() => props.onPreviewDraft(row)}>预览</Button>
                  ) : (
                    <span className="text-slate-400">已发送</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {isSent ? (
                    <span className="font-medium text-emerald-700">已发送</span>
                  ) : (
                    <Button className="h-9 px-3" onClick={() => props.onManualSent(row)}>已发送</Button>
                  )}
                </td>
                <td className="px-3 py-3">
                  {props.tab === "awaitingPo" ? (
                    <div className="flex items-center gap-2">
                      <Input className="h-9 w-28" value={props.poInputs[row.jobId] ?? row.detectedPoNumber ?? ""} onChange={(event) => props.onPoInputChange(row.jobId, event.target.value)} />
                      <Button className="h-9 px-3" onClick={() => props.onConfirmPo(row)}>确认</Button>
                    </div>
                  ) : (
                    <span>{row.confirmedPoNumber || row.detectedPoNumber || "-"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create page**

Create `PoTodoPage.tsx` using the API, dialogs, page load sync, and hourly sync. Include tab state, selected state, and PO input state.

Key effects:

```tsx
useEffect(() => {
  let cancelled = false;
  const run = async () => {
    await syncPoTodo();
    if (!cancelled) await loadRows(activeTab);
  };
  void run();
  const timer = window.setInterval(() => void run(), 60 * 60 * 1000);
  return () => {
    cancelled = true;
    window.clearInterval(timer);
  };
}, [activeTab]);
```

Use `fetchPoTodo(activeTab)` to load rows. When rows load, initialize PO inputs from `detectedPoNumber`.

Use `manualConfirmPoSent`, `confirmPo`, and `completePoJobs` for actions. After successful actions, reload the current tab.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm --dir apps/shell build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/shell/src/features/poTodo/PoTodoTable.tsx apps/shell/src/features/poTodo/PoTodoPage.tsx
git commit -m "Add PO TODO page"
```

---

### Task 13: Route and Sidebar Integration

**Files:**
- Modify: `apps/shell/src/App.tsx`
- Modify: `apps/shell/src/layout/Sidebar.tsx`

- [ ] **Step 1: Update route**

Modify `apps/shell/src/App.tsx`:

```tsx
import { PoTodoPage } from "./features/poTodo/PoTodoPage";
```

Replace or add route:

```tsx
{ path: "po", element: <PoTodoPage /> },
{ path: "po-dashboard-preview", element: <PoTodoPage /> },
```

- [ ] **Step 2: Update sidebar**

Modify `apps/shell/src/layout/Sidebar.tsx` PO item:

```tsx
{ to: "/po", label: "PO", icon: ReceiptText, badge: poUnreadSummary.totalUnreadReplies },
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
pnpm --dir apps/shell build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/shell/src/App.tsx apps/shell/src/layout/Sidebar.tsx
git commit -m "Route sidebar PO to TODO page"
```

---

### Task 14: Full Verification

**Files:**
- Review all changed files.

- [ ] **Step 1: Run backend tests**

Run:

```bash
dotnet test backend/Workshop.Api.Tests/Workshop.Api.Tests.csproj
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
pnpm --dir apps/shell build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Start app for manual QA**

Run backend/frontend using the repo's normal local dev flow. If only frontend is needed:

```bash
pnpm --dir apps/shell dev
```

Open the printed Vite URL and navigate to `/po`.

- [ ] **Step 4: Manual QA checklist**

Verify:

- `/po` opens from sidebar.
- Page load triggers sync and loads rows.
- Tabs show `待发邮件`, `等待 PO`, and `Invoiced`.
- `是否发送` shows read-only `已发送` when Gmail found sent mail.
- `是否发送` shows clickable `已发送` when Gmail did not find sent mail.
- Manual sent confirmation moves the row from `待发邮件` to `等待 PO`.
- Waiting PO input is prefilled from `detectedPoNumber` without a detection hint.
- Confirm PO opens progress dialog with four steps.
- Confirm PO replaces `Pending` in Xero reference with the entered number.
- Gmail modify permission error appears in the Gmail step when `gmail.modify` is missing.
- Invoiced rows support select all and batch complete.
- Completed rows disappear from PO TODO.

- [ ] **Step 5: Final commit if verification fixes were needed**

When Task 14 requires fixes, commit the exact changed files:

```bash
git add path/to/fixed-file-1 path/to/fixed-file-2
git commit -m "Polish PO TODO verification issues"
```

When Task 14 requires no fixes, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: all spec sections map to tasks. Backend state/API/Gmail/Xero work is covered by Tasks 1-9. Frontend page, tabs, dialogs, table behavior, and routing are covered by Tasks 10-13. Verification is Task 14.
- Scope: this plan intentionally does not create Gmail labels and does not change normal `jobs.status`.
- Risk: `JobInvoiceService.UpdateDraftReferenceAsync` must preserve all required fields from `SyncJobInvoiceDraftRequest` while changing only `Reference`; the current request type is mutable and has `LineItems`, so the plan uses JSON deserialization from the stored request body.
- Code source: `PoTodoService.GetTodoAsync` uses `Customer.BusinessCode`, matching the existing Jobs controller source for customer code.
