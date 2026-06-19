using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Controllers;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Tests;

public sealed class CourtesyCarsControllerTests
{
    [Fact]
    public async Task GetAll_ReturnsVehiclesFromCourtesyCarsTable()
    {
        await using var context = CreateDb();
        context.CourtesyCarVehicles.AddRange(
            new CourtesyCarVehicle
            {
                Id = 1,
                Plate = "LCZ123",
                Make = "Toyota",
                Model = "Corolla",
                Color = "Silver",
                Status = "available",
                AgreedVehicleValue = 22000,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            },
            new CourtesyCarVehicle
            {
                Id = 2,
                Plate = "MKP456",
                Make = "Honda",
                Model = "Civic",
                Color = "White",
                Status = "on_loan",
                AgreedVehicleValue = 19500,
                LoanedAt = DateTime.UtcNow.AddDays(-2),
                BorrowerName = "Alex Chen",
                BorrowerPhone = "021 555 0101",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        await context.SaveChangesAsync();

        var controller = new CourtesyCarVehiclesController(context, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext(),
            },
        };

        var result = await controller.GetAll(CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var json = JsonSerializer.Serialize(ok.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        json.Should().Contain("\"plate\":\"LCZ123\"");
        json.Should().Contain("\"plate\":\"MKP456\"");
        json.Should().Contain("\"borrowerName\":\"Alex Chen\"");
        json.Should().Contain("\"loanedAt\"");
    }

    [Fact]
    public async Task GetAll_IncludesCurrentAgreementSummaryForOnLoanVehicles()
    {
        await using var context = CreateDb();
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 2,
            Plate = "MKP456",
            Make = "Honda",
            Model = "Civic",
            Color = "White",
            Status = "on_loan",
            AgreedVehicleValue = 19500,
            LoanedAt = DateTime.UtcNow.AddDays(-2),
            BorrowerName = "Alex Chen",
            BorrowerPhone = "021 555 0101",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        context.CourtesyCarAgreements.Add(new CourtesyCarAgreement
        {
            Id = 7001,
            JobId = 1001,
            VehicleId = 2,
            CustomerId = 55,
            Status = "draft",
            CurrentStep = "contact",
            JobVehiclePlate = "ABC123",
            JobCustomerName = "Jane Smith",
            JobCustomerPhone = "021 123 4567",
            ContactName = "Jane Smith",
            ContactPhone = "021 123 4567",
            VehiclePlate = "MKP456",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var controller = new CourtesyCarVehiclesController(context, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext(),
            },
        };

        var result = await controller.GetAll(CancellationToken.None);

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        var json = JsonSerializer.Serialize(ok.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        json.Should().Contain("\"currentAgreement\"");
        json.Should().Contain("\"agreementId\":7001");
        json.Should().Contain("\"jobCustomerName\":\"Jane Smith\"");
        json.Should().Contain("\"contactPhone\":\"021 123 4567\"");
    }

    [Fact]
    public async Task Delete_AllowsVehicleWithOnlyClosedAgreementHistory()
    {
        await using var context = CreateDb();
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 1,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Color = "Silver",
            Status = "available",
            AgreedVehicleValue = 22000,
            ReturnedAt = new DateTime(2026, 6, 18, 23, 25, 2, DateTimeKind.Utc),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        context.CourtesyCarAgreements.Add(new CourtesyCarAgreement
        {
            Id = 9,
            JobId = 1119,
            VehicleId = 1,
            CustomerId = 55,
            Status = "closed",
            CurrentStep = "closed",
            JobVehiclePlate = "QGF703",
            JobCustomerName = "Okay Motors",
            JobCustomerPhone = "021377778",
            VehiclePlate = "LCZ123",
            ClosedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow.AddHours(-1),
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var controller = new CourtesyCarVehiclesController(context, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext(),
            },
        };

        var result = await controller.Delete(1, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
        (await context.CourtesyCarVehicles.AnyAsync(x => x.Id == 1)).Should().BeFalse();
        (await context.CourtesyCarAgreements.AnyAsync(x => x.Id == 9)).Should().BeTrue();
    }

    [Fact]
    public async Task Delete_RejectsVehicleWithActiveAgreement()
    {
        await using var context = CreateDb();
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 2,
            Plate = "MKP456",
            Make = "Honda",
            Model = "Civic",
            Color = "White",
            Status = "on_loan",
            AgreedVehicleValue = 19500,
            LoanedAt = DateTime.UtcNow.AddDays(-2),
            BorrowerName = "Alex Chen",
            BorrowerPhone = "021 555 0101",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        context.CourtesyCarAgreements.Add(new CourtesyCarAgreement
        {
            Id = 7001,
            JobId = 1001,
            VehicleId = 2,
            CustomerId = 55,
            Status = "draft",
            CurrentStep = "contact",
            JobVehiclePlate = "ABC123",
            JobCustomerName = "Jane Smith",
            JobCustomerPhone = "021 123 4567",
            ContactName = "Jane Smith",
            ContactPhone = "021 123 4567",
            VehiclePlate = "MKP456",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var controller = new CourtesyCarVehiclesController(context, null!)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext(),
            },
        };

        var result = await controller.Delete(2, CancellationToken.None);

        var conflict = result.Should().BeOfType<ConflictObjectResult>().Subject;
        conflict.Value.Should().NotBeNull();
        var json = JsonSerializer.Serialize(conflict.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        json.Should().Contain("Vehicle is linked to a courtesy car agreement.");
        (await context.CourtesyCarVehicles.AnyAsync(x => x.Id == 2)).Should().BeTrue();
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
