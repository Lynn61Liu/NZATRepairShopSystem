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

    private static PoTodoService CreateService(AppDbContext db)
    {
        return new PoTodoService(db, null!, null!, null!, null!, null!);
    }
}
