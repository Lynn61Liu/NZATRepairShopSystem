using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class PoTodoServiceTests
{
    [Fact]
    public void BuildReference_ReplacesPoPendingReference()
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
