using System.Reflection;
using FluentAssertions;
using Workshop.Api.Models;
using Workshop.Api.Services;

public class JobInvoiceServiceCodeTraceTests
{
    [Fact]
    public void ResolveCatalogItemCodeTrace_ForMechRootBusinessCustomer_ReportsDealershipLinkCode()
    {
        var method = typeof(JobInvoiceService).GetMethod(
            "ResolveCatalogItemCodeTrace",
            BindingFlags.NonPublic | BindingFlags.Static);

        method.Should().NotBeNull();

        var customer = new Customer { Type = "Business" };
        var catalogItem = new ServiceCatalogItem
        {
            ServiceType = "mech",
            Category = "root",
            Name = "机修",
            PersonalLinkCode = "666WORSHOP Labour Fee",
            DealershipLinkCode = "666WORSHOP Labour Fee",
            IsActive = true,
            SortOrder = 1,
        };

        var trace = method!.Invoke(null, new object[] { customer, catalogItem, null! })!;
        trace.GetType().GetProperty("ResolvedCode")!.GetValue(trace).Should().Be("666WORSHOP Labour Fee");
        trace.GetType().GetProperty("Source")!.GetValue(trace).Should().Be("catalog.dealership_link_code");
    }

    [Fact]
    public void ResolveCatalogItemCodeTrace_ForMechRootPersonalCustomer_UsesPersonalFallbackWhenCodesMissing()
    {
        var method = typeof(JobInvoiceService).GetMethod(
            "ResolveCatalogItemCodeTrace",
            BindingFlags.NonPublic | BindingFlags.Static);

        method.Should().NotBeNull();

        var customer = new Customer { Type = "Personal" };
        var catalogItem = new ServiceCatalogItem
        {
            ServiceType = "mech",
            Category = "root",
            Name = "机修",
            PersonalLinkCode = null,
            DealershipLinkCode = null,
            IsActive = true,
            SortOrder = 1,
        };

        var trace = method!.Invoke(null, new object[] { customer, catalogItem, null! })!;
        trace.GetType().GetProperty("ResolvedCode")!.GetValue(trace).Should().Be("666WORSHOP Labour Fee");
        trace.GetType().GetProperty("Source")!.GetValue(trace).Should().Be("catalog.root_personal_fallback_code");
    }
}
