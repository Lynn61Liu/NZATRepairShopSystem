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
}
