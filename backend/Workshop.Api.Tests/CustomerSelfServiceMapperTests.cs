using FluentAssertions;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public class CustomerSelfServiceMapperTests
{
    [Fact]
    public void MapToNewJobRequest_WithWof_UsesWofServiceAndKeepsAddressOutOfNotes()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = " abc123 ",
            HasWof = true,
            Name = "Jane Smith",
            Phone = "021 123 4567",
            Email = " jane@example.com ",
            Notes = "Please call first.",
            Street = "42 Queen Street",
            Suburb = "Auckland Central",
            City = "Auckland",
        };

        var mapped = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId: 10);

        mapped.Plate.Should().Be("ABC123");
        mapped.CreateNewInvoice.Should().BeTrue();
        mapped.UseServiceCatalogMapping.Should().BeTrue();
        mapped.Services.Should().BeEquivalentTo(["wof"]);
        mapped.RootServiceCatalogItemIds.Should().BeEquivalentTo([10]);
        mapped.Customer.Type.Should().Be("Personal");
        mapped.Customer.Name.Should().Be("Jane Smith");
        mapped.Customer.Phone.Should().Be("021 123 4567");
        mapped.Customer.Email.Should().Be("jane@example.com");
        mapped.Customer.Address.Should().Be("42 Queen Street, Auckland Central, Auckland");
        mapped.Notes.Should().Be("WOF\nPlease call first.");
    }

    [Fact]
    public void MapToNewJobRequest_WithWofAddress_UsesSingleAutocompleteAddress()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = "abc123",
            HasWof = true,
            Name = "Jane Smith",
            Phone = "021 123 4567",
            Address = "42 Queen Street, Auckland Central, Auckland 1010",
        };

        var mapped = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId: 10);

        mapped.Customer.Address.Should().Be("42 Queen Street, Auckland Central, Auckland 1010");
        mapped.Notes.Should().Be("WOF");
    }

    [Fact]
    public void MapToNewJobRequest_WithoutWof_UsesMechServiceAndCustomerSelfNote()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = "xyz789",
            HasWof = false,
            Name = "John Chen",
            Phone = "09 555 1234",
        };

        var mapped = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId: 20);

        mapped.Services.Should().BeEquivalentTo(["mech"]);
        mapped.RootServiceCatalogItemIds.Should().BeEquivalentTo([20]);
        mapped.Notes.Should().Be("");
        mapped.Customer.Address.Should().BeNull();
    }

    [Fact]
    public void MapToNewJobRequest_WithMatchedCustomerAndNoEdit_ReusesExistingCustomer()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = "abc123",
            HasWof = false,
            Name = "Jane Smith",
            Phone = "021 123 4567",
            ExistingCustomerId = 42,
            CustomerEdited = false,
        };

        var mapped = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId: 20);

        mapped.Customer.ExistingCustomerId.Should().Be(42);
    }

    [Fact]
    public void MapToNewJobRequest_WithMatchedCustomerAndEdit_CreatesNewCustomer()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = "abc123",
            HasWof = false,
            Name = "Jane Smith",
            Phone = "021 123 4567",
            ExistingCustomerId = 42,
            CustomerEdited = true,
        };

        var mapped = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId: 20);

        mapped.Customer.ExistingCustomerId.Should().BeNull();
    }

    [Fact]
    public void Validate_RequiresAddressWhenWofSelected()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = "ABC123",
            HasWof = true,
            Name = "Jane Smith",
            Phone = "021 123 4567",
            Street = "42 Queen Street",
            Suburb = "",
            City = "Auckland",
        };

        var errors = CustomerSelfServiceJobMapper.Validate(req);

        errors.Should().ContainSingle("Suburb is required for WOF jobs.");
    }

    [Fact]
    public void Validate_AcceptsSingleAutocompleteAddressForWof()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = "ABC123",
            HasWof = true,
            Name = "Jane Smith",
            Phone = "021 123 4567",
            Address = "42 Queen Street, Auckland Central, Auckland 1010",
        };

        var errors = CustomerSelfServiceJobMapper.Validate(req);

        errors.Should().BeEmpty();
    }

    [Fact]
    public void Validate_RequiresReachableCustomerDetails()
    {
        var req = new CustomerSelfServiceJobRequest
        {
            Plate = "",
            HasWof = false,
            Name = "J",
            Phone = "123",
        };

        var errors = CustomerSelfServiceJobMapper.Validate(req);

        errors.Should().Contain([
            "Plate is required.",
            "Name must be at least 2 characters.",
            "Phone must contain at least 7 digits.",
        ]);
    }
}
