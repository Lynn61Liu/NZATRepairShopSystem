using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class PoTodoServiceTests
{
    [Fact]
    public async Task ManualConfirmSentAsync_MovesDraftToAwaitingPoAndRecordsManualSource()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        var staleSentAt = now.AddDays(-7);
        db.Jobs.Add(new Job { Id = 5200, NeedsPo = true, CreatedAt = now, UpdatedAt = now });
        db.JobPoStates.Add(new JobPoState
        {
            JobId = 5200,
            CorrelationId = JobPoStateService.BuildCorrelationId(5200),
            Status = JobPoStateStatus.Draft,
            LastRequestSentAt = staleSentAt,
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
        state.FirstRequestSentAt.Should().Be(state.ManuallyMarkedSentAt);
        state.LastRequestSentAt.Should().Be(state.ManuallyMarkedSentAt);
        state.LastRequestSentAt.Should().NotBe(staleSentAt);
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

    [Fact]
    public async Task GetTodoAsync_ExcludesCompletedRows()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        db.Jobs.AddRange(
            new Job { Id = 5301, NeedsPo = true, CreatedAt = now.AddMinutes(-1), UpdatedAt = now },
            new Job { Id = 5302, NeedsPo = true, CreatedAt = now, UpdatedAt = now });
        db.JobPoStates.AddRange(
            new JobPoState { JobId = 5301, CorrelationId = "PO-5301-X", Status = JobPoStateStatus.Completed, CreatedAt = now, UpdatedAt = now },
            new JobPoState { JobId = 5302, CorrelationId = "PO-5302-X", Status = JobPoStateStatus.Draft, CreatedAt = now, UpdatedAt = now });
        await db.SaveChangesAsync();

        var service = CreateService(db);

        var result = await service.GetTodoAsync(null, CancellationToken.None);

        result.Total.Should().Be(1);
        result.Items.Select(x => x.JobId).Should().Equal(5302);
    }

    [Theory]
    [InlineData("pendingSend", new long[] { 5312, 5311 })]
    [InlineData("PENDINGSEND", new long[] { 5312, 5311 })]
    [InlineData("awaitingPo", new long[] { 5315, 5314, 5313 })]
    [InlineData("invoiced", new long[] { 5316 })]
    [InlineData(null, new long[] { 5316, 5315, 5314, 5313, 5312, 5311 })]
    public async Task GetTodoAsync_MapsStatusTabs(string? status, long[] expectedJobIds)
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        db.Jobs.AddRange(
            new Job { Id = 5311, NeedsPo = true, CreatedAt = now.AddMinutes(1), UpdatedAt = now },
            new Job { Id = 5312, NeedsPo = true, CreatedAt = now.AddMinutes(2), UpdatedAt = now },
            new Job { Id = 5313, NeedsPo = true, CreatedAt = now.AddMinutes(3), UpdatedAt = now },
            new Job { Id = 5314, NeedsPo = true, CreatedAt = now.AddMinutes(4), UpdatedAt = now },
            new Job { Id = 5315, NeedsPo = true, CreatedAt = now.AddMinutes(5), UpdatedAt = now },
            new Job { Id = 5316, NeedsPo = true, CreatedAt = now.AddMinutes(6), UpdatedAt = now },
            new Job { Id = 5317, NeedsPo = true, CreatedAt = now.AddMinutes(7), UpdatedAt = now });
        db.JobPoStates.AddRange(
            new JobPoState { JobId = 5312, CorrelationId = "PO-5312-X", Status = JobPoStateStatus.Draft, CreatedAt = now, UpdatedAt = now },
            new JobPoState { JobId = 5313, CorrelationId = "PO-5313-X", Status = JobPoStateStatus.AwaitingReply, CreatedAt = now, UpdatedAt = now },
            new JobPoState { JobId = 5314, CorrelationId = "PO-5314-X", Status = JobPoStateStatus.PendingConfirmation, CreatedAt = now, UpdatedAt = now },
            new JobPoState { JobId = 5315, CorrelationId = "PO-5315-X", Status = JobPoStateStatus.EscalationRequired, CreatedAt = now, UpdatedAt = now },
            new JobPoState { JobId = 5316, CorrelationId = "PO-5316-X", Status = JobPoStateStatus.PoConfirmed, CreatedAt = now, UpdatedAt = now },
            new JobPoState { JobId = 5317, CorrelationId = "PO-5317-X", Status = JobPoStateStatus.Completed, CreatedAt = now, UpdatedAt = now });
        await db.SaveChangesAsync();

        var service = CreateService(db);

        var result = await service.GetTodoAsync(status, CancellationToken.None);

        result.Total.Should().Be(expectedJobIds.Length);
        result.Items.Select(x => x.JobId).Should().Equal(expectedJobIds);
    }

    [Fact]
    public async Task GetTodoAsync_UnknownStatus_ReturnsNoRows()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        db.Jobs.Add(new Job { Id = 5321, NeedsPo = true, CreatedAt = now, UpdatedAt = now });
        await db.SaveChangesAsync();

        var service = CreateService(db);

        var result = await service.GetTodoAsync("awaitingpo-typo", CancellationToken.None);

        result.Total.Should().Be(0);
        result.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTodoAsync_ReturnsCustomerBusinessCodeAndLatestInvoiceDetails()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        db.Customers.Add(new Customer { Id = 5401, Name = "Fleet Co", BusinessCode = "FLEET" });
        db.Vehicles.Add(new Vehicle { Id = 5402, Plate = "ABC123", Make = "Toyota", Model = "Hiace", Year = 2020, UpdatedAt = now });
        db.Jobs.Add(new Job
        {
            Id = 5403,
            NeedsPo = true,
            CustomerId = 5401,
            VehicleId = 5402,
            Notes = "PO required",
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.JobPoStates.Add(new JobPoState
        {
            JobId = 5403,
            CorrelationId = "PO-5403-X",
            Status = JobPoStateStatus.AwaitingReply,
            SentSource = "gmail",
            FirstRequestSentAt = now.AddHours(-2),
            LastRequestSentAt = now.AddHours(-1),
            DetectedPoNumber = "PO123",
            GmailDraftId = "draft-1",
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.JobInvoices.AddRange(
            new JobInvoice { JobId = 5403, ExternalInvoiceId = "old-inv", Reference = "old ref", CreatedAt = now.AddDays(-2), UpdatedAt = now.AddDays(-2) },
            new JobInvoice { JobId = 5403, ExternalInvoiceId = "new-inv", Reference = "new ref", CreatedAt = now.AddDays(-1), UpdatedAt = now.AddDays(-1) });
        db.GmailMessageLogs.Add(new GmailMessageLog
        {
            GmailMessageId = "msg-1",
            GmailThreadId = "thread-1",
            Direction = "sent",
            CounterpartyEmail = "supplier@example.test",
            CorrelationId = "PO-5403-X",
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.GmailMessageLogs.Add(new GmailMessageLog
        {
            GmailMessageId = "msg-old",
            GmailThreadId = "thread-old",
            Direction = "sent",
            CounterpartyEmail = "supplier@example.test",
            CorrelationId = "PO-5403-X",
            InternalDateMs = new DateTimeOffset(now.AddDays(-30)).ToUnixTimeMilliseconds(),
            CreatedAt = now.AddDays(-30),
            UpdatedAt = now.AddDays(-30),
        });
        await db.SaveChangesAsync();

        var service = CreateService(db);

        var result = await service.GetTodoAsync(null, CancellationToken.None);
        var row = result.Items.Should().ContainSingle().Subject;

        row.Code.Should().Be("FLEET");
        row.Plate.Should().Be("ABC123");
        row.Model.Should().Be("2020 Toyota Hiace");
        row.Notes.Should().Be("PO required");
        row.Reference.Should().Be("new ref");
        row.XeroInvoiceId.Should().Be("new-inv");
        row.Status.Should().Be("awaitingReply");
        row.SentSource.Should().Be("gmail");
        row.FirstRequestSentAt.Should().BeCloseTo(now.AddHours(-2), TimeSpan.FromMilliseconds(1));
        row.LastRequestSentAt.Should().BeCloseTo(now.AddHours(-1), TimeSpan.FromMilliseconds(1));
        row.DetectedPoNumber.Should().Be("PO123");
        row.GmailDraftId.Should().Be("draft-1");
        row.GmailThreadId.Should().Be("thread-1");
        row.CorrelationId.Should().Be("PO-5403-X");
    }

    [Fact]
    public async Task SyncActiveAsync_ReturnsWarning_WhenStateSyncServiceIsUnavailable()
    {
        await using var db = CreateDb();
        var service = CreateService(db);

        var result = await service.SyncActiveAsync(CancellationToken.None);

        result.CheckedJobs.Should().Be(0);
        result.SyncedMessages.Should().Be(0);
        result.Warnings.Should().ContainSingle("PO state sync service is unavailable.");
    }

    [Fact]
    public async Task ConfirmPoAsync_FailsSaveStep_WhenPoNumberIsBlank()
    {
        await using var db = CreateDb();
        var service = CreateService(db);

        var result = await service.ConfirmPoAsync(5500, " ", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.PoNumber.Should().Be("");
        result.InvoiceReference.Should().Be("");
        result.Steps["savePo"].Status.Should().Be("failed");
        result.Steps["xero"].Status.Should().Be("pending");
        result.Steps["gmail"].Status.Should().Be("pending");
        result.Steps["poState"].Status.Should().Be("pending");
    }

    [Fact]
    public async Task ConfirmPoAsync_DoesNotSavePo_WhenXeroFails()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        db.Jobs.Add(new Job
        {
            Id = 5501,
            NeedsPo = true,
            InvoiceReference = "PO Pending ABC123",
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        var service = CreateService(db);

        var result = await service.ConfirmPoAsync(5501, " 12345 ", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.PoNumber.Should().Be("12345");
        result.InvoiceReference.Should().Be("PO 12345 ABC123");
        result.Steps["savePo"].Status.Should().Be("pending");
        result.Steps["xero"].Status.Should().Be("failed");
        result.Steps["gmail"].Status.Should().Be("pending");
        result.Steps["poState"].Status.Should().Be("pending");

        var job = await db.Jobs.SingleAsync(x => x.Id == 5501);
        job.PoNumber.Should().BeNull();
        job.InvoiceReference.Should().Be("PO Pending ABC123");
    }

    [Fact]
    public async Task ConfirmPoAsync_UpdatesXeroGmailAndPoState_WhenAllStepsSucceed()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        string? xeroReference = null;
        long? gmailAccountId = null;
        string? gmailThreadId = null;
        string? gmailMessageId = null;

        db.Jobs.Add(new Job
        {
            Id = 5502,
            NeedsPo = true,
            InvoiceReference = "PO stale ABC123",
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.JobInvoices.Add(new JobInvoice
        {
            JobId = 5502,
            ExternalInvoiceId = Guid.NewGuid().ToString(),
            ExternalStatus = "DRAFT",
            Reference = "PO Pending ABC123",
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.GmailMessageLogs.Add(new GmailMessageLog
        {
            GmailAccountId = 7,
            GmailMessageId = "message-5502",
            GmailThreadId = "thread-5502",
            Direction = "reply",
            CounterpartyEmail = "supplier@example.test",
            CorrelationId = JobPoStateService.BuildCorrelationId(5502),
            InternalDateMs = new DateTimeOffset(now).ToUnixTimeMilliseconds(),
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.JobPoStates.Add(new JobPoState
        {
            JobId = 5502,
            CorrelationId = JobPoStateService.BuildCorrelationId(5502),
            Status = JobPoStateStatus.EscalationRequired,
            RequiresAdminAttention = true,
            AdminAttentionReason = "No reply",
            FollowUpCount = 3,
            LastFollowUpSentAt = now.AddDays(-1),
            NextFollowUpDueAt = now.AddHours(1),
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();

        var service = CreateService(
            db,
            updateDraftReferenceAsync: (jobId, reference, _) =>
            {
                jobId.Should().Be(5502);
                xeroReference = reference;
                return Task.FromResult(JobInvoiceCreateResult.Success(null, false));
            },
            addInvoicedLabelAsync: (accountId, threadId, messageId, _) =>
            {
                gmailAccountId = accountId;
                gmailThreadId = threadId;
                gmailMessageId = messageId;
                return Task.FromResult(GmailLabelResult.Success("label-invoiced"));
            });

        var result = await service.ConfirmPoAsync(5502, "12345", CancellationToken.None);

        result.Success.Should().BeTrue();
        result.PoNumber.Should().Be("12345");
        result.InvoiceReference.Should().Be("PO 12345 ABC123");
        result.Steps.Values.Select(x => x.Status).Should().OnlyContain(x => x == "success");
        xeroReference.Should().Be("PO 12345 ABC123");
        gmailAccountId.Should().Be(7);
        gmailThreadId.Should().Be("thread-5502");
        gmailMessageId.Should().Be("message-5502");

        var job = await db.Jobs.SingleAsync(x => x.Id == 5502);
        job.PoNumber.Should().Be("12345");
        job.InvoiceReference.Should().Be("PO 12345 ABC123");

        var state = await db.JobPoStates.SingleAsync(x => x.JobId == 5502);
        state.Status.Should().Be(JobPoStateStatus.PoConfirmed);
        state.ConfirmedPoNumber.Should().Be("12345");
        state.FollowUpEnabled.Should().BeFalse();
        state.NextFollowUpDueAt.Should().BeNull();
        state.RequiresAdminAttention.Should().BeFalse();
        state.AdminAttentionReason.Should().BeNull();
        state.FollowUpCount.Should().Be(0);
        state.LastFollowUpSentAt.Should().BeNull();
    }

    [Fact]
    public void BuildReference_ReplacesPoPendingReference()
    {
        PoReferenceBuilder.BuildReference("PO Pending ABC123", "12345").Should().Be("PO 12345 ABC123");
    }

    [Fact]
    public void BuildReferenceUpdateRequestFromExistingInvoice_ChangesOnlyReference()
    {
        var invoiceId = Guid.NewGuid();
        var contactId = Guid.NewGuid();
        var existingRequest = new CreateXeroInvoiceRequest
        {
            InvoiceId = invoiceId,
            Type = "ACCREC",
            Status = "DRAFT",
            LineAmountTypes = "Inclusive",
            Date = new DateOnly(2026, 1, 15),
            DueDate = new DateOnly(2026, 2, 15),
            InvoiceNumber = "INV-123",
            Reference = "PO Pending ABC123",
            CurrencyCode = "NZD",
            SentToContact = true,
            Contact = new XeroInvoiceContactInput
            {
                ContactId = contactId,
                Name = "Jane Customer",
                EmailAddress = "jane@example.test",
                ContactNumber = "C-123",
            },
            LineItems =
            [
                new XeroInvoiceLineItemInput
                {
                    Description = "Panel repair",
                    Quantity = 2,
                    UnitAmount = 125,
                    AccountCode = "200",
                    TaxType = "OUTPUT2",
                },
            ],
        };
        var invoice = new JobInvoice
        {
            ExternalInvoiceId = invoiceId.ToString(),
            ExternalStatus = "DRAFT",
            Reference = "PO Pending ABC123",
            ContactName = "Fallback Customer",
            InvoiceNote = "Keep this note",
            RequestPayloadJson = JsonSerializer.Serialize(existingRequest, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
        };

        var request = JobInvoiceService.BuildReferenceUpdateRequestFromExistingInvoice(invoice, invoiceId, " PO 12345 ABC123 ");

        request.Reference.Should().Be("PO 12345 ABC123");
        request.InvoiceId.Should().Be(invoiceId);
        request.Status.Should().Be(existingRequest.Status);
        request.LineAmountTypes.Should().Be(existingRequest.LineAmountTypes);
        request.Date.Should().Be(existingRequest.Date);
        request.DueDate.Should().Be(existingRequest.DueDate);
        request.InvoiceNumber.Should().Be(existingRequest.InvoiceNumber);
        request.CurrencyCode.Should().Be(existingRequest.CurrencyCode);
        request.SentToContact.Should().Be(existingRequest.SentToContact);
        request.Contact.ContactId.Should().Be(contactId);
        request.Contact.Name.Should().Be("Jane Customer");
        request.Contact.EmailAddress.Should().Be("jane@example.test");
        request.Contact.ContactNumber.Should().Be("C-123");
        request.LineItems.Should().ContainSingle();
        request.LineItems[0].Description.Should().Be("Panel repair");
        request.LineItems[0].Quantity.Should().Be(2);
        request.LineItems[0].UnitAmount.Should().Be(125);
        request.LineItems[0].AccountCode.Should().Be("200");
        request.LineItems[0].TaxType.Should().Be("OUTPUT2");
        invoice.InvoiceNote.Should().Be("Keep this note");
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static PoTodoService CreateService(
        AppDbContext db,
        Func<long, string, CancellationToken, Task<JobInvoiceCreateResult>>? updateDraftReferenceAsync = null,
        Func<long?, string?, string?, CancellationToken, Task<GmailLabelResult>>? addInvoicedLabelAsync = null)
    {
        return new PoTodoService(db, null!, null!, null!, null!, null!, updateDraftReferenceAsync, addInvoicedLabelAsync);
    }
}
