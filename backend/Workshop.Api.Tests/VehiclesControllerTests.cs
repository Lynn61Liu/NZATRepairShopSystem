using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Controllers;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Tests;

public sealed class VehiclesControllerTests
{
    [Fact]
    public async Task GetByPlate_IncludesBothWofAndRegoExpiry()
    {
        await using var context = CreateDb();
        context.Vehicles.Add(new Vehicle
        {
            Id = 1,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Colour = "Silver",
            WofExpiry = new DateOnly(2026, 8, 1),
            RegoExpiry = new DateOnly(2026, 9, 11),
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var controller = new VehiclesController(context);
        var result = await controller.GetByPlate("LCZ123", CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var json = JsonSerializer.Serialize(ok.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        json.Should().Contain("\"wofExpiry\":\"2026-08-01\"");
        json.Should().Contain("\"regoExpiry\":\"2026-09-11\"");
        json.Should().Contain("\"colour\":\"Silver\"");
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
