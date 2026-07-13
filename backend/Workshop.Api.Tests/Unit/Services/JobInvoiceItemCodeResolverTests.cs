using FluentAssertions;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Tests.Unit.Services;

public class JobInvoiceItemCodeResolverTests
{
    [Fact]
    public void Resolve_Should_Use_Customer_Override_When_Present()
    {
        var customer = new Customer { Type = "Business" };
        var catalogItem = new ServiceCatalogItem
        {
            Id = 10,
            PersonalLinkCode = "PERSONAL-CODE",
            DealershipLinkCode = "BUSINESS-CODE",
        };

        var result = JobInvoiceItemCodeResolver.Resolve(customer, catalogItem, "  OVERRIDE-CODE  ");

        result.Should().Be("OVERRIDE-CODE");
    }

    [Fact]
    public void Resolve_Should_Use_Personal_Default_Code_For_Personal_Customer()
    {
        var customer = new Customer { Type = "Personal" };
        var catalogItem = new ServiceCatalogItem
        {
            PersonalLinkCode = "  PERSONAL-CODE  ",
            DealershipLinkCode = "BUSINESS-CODE",
        };

        var result = JobInvoiceItemCodeResolver.Resolve(customer, catalogItem, null);

        result.Should().Be("PERSONAL-CODE");
    }

    [Fact]
    public void Resolve_Should_Use_Business_Default_Code_For_Business_Customer()
    {
        var customer = new Customer { Type = "Business" };
        var catalogItem = new ServiceCatalogItem
        {
            PersonalLinkCode = "PERSONAL-CODE",
            DealershipLinkCode = "  BUSINESS-CODE  ",
        };

        var result = JobInvoiceItemCodeResolver.Resolve(customer, catalogItem, null);

        result.Should().Be("BUSINESS-CODE");
    }

    [Fact]
    public void Resolve_Should_Return_Null_When_No_Override_And_No_Default_Code()
    {
        var customer = new Customer { Type = "Business" };
        var catalogItem = new ServiceCatalogItem
        {
            PersonalLinkCode = " ",
            DealershipLinkCode = null,
        };

        var result = JobInvoiceItemCodeResolver.Resolve(customer, catalogItem, " ");

        result.Should().BeNull();
    }
}
