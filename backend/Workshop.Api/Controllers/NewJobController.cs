using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/newJob")]
public class NewJobController : ControllerBase
{
    private readonly AppDbContext _db;

    public NewJobController(AppDbContext db)
    {
        _db = db;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] NewJobRequest req, CancellationToken ct)
    {
        if (req is null)
            return BadRequest(new { error = "Request body is required." });

        if (string.IsNullOrWhiteSpace(req.Plate))
            return BadRequest(new { error = "Plate is required." });

        // if (req.Customer is null || string.IsNullOrWhiteSpace(req.Customer.Name))
        //     return BadRequest(new { error = "Customer name is required." });

        if (string.IsNullOrWhiteSpace(req.Customer.Type))
            return BadRequest(new { error = "Customer type is required." });

        var normalizedCustomerType = NormalizeCustomerType(req.Customer.Type);
        if (!IsValidCustomerType(normalizedCustomerType))
            return BadRequest(new { error = "Customer type must be Personal or Business." });

        req.Customer.Type = normalizedCustomerType;
        var isBusiness = string.Equals(req.Customer.Type, "Business", StringComparison.Ordinal);

        using var tx = await _db.Database.BeginTransactionAsync(ct);

        Customer? customer = null;
        if (!isBusiness)
            customer = await UpsertCustomerAsync(req.Customer, ct);

        long? jobCustomerId = customer?.Id;
        if (isBusiness)
        {
            if (string.IsNullOrWhiteSpace(req.BusinessId) || !long.TryParse(req.BusinessId, out var businessCustomerId))
                return BadRequest(new { error = "Business customer id is required." });
            jobCustomerId = businessCustomerId;
        }
        var plate = NormalizePlate(req.Plate);
        var vehicle = await _db.Vehicles.FirstOrDefaultAsync(x => x.Plate == plate, ct);

        if (vehicle is null)
        {
            vehicle = new Vehicle
            {
                Plate = plate,
                CustomerId = customer?.Id,
                UpdatedAt = DateTime.UtcNow,
            };
            _db.Vehicles.Add(vehicle);
            await _db.SaveChangesAsync(ct);
        }

        var job = new Job
        {
            Status = "InProgress",
            IsUrgent = false,
            VehicleId = vehicle.Id,
            CustomerId = jobCustomerId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.Jobs.Add(job);
        await _db.SaveChangesAsync(ct);

        var wofCreated = req.Services?.Any(s => string.Equals(s, "wof", StringComparison.OrdinalIgnoreCase)) == true;
        var hasMech = req.Services?.Any(s => string.Equals(s, "mech", StringComparison.OrdinalIgnoreCase)) == true;

        if (hasMech && !string.IsNullOrWhiteSpace(req.PartsDescription))
        {
            var partsService = new JobPartsService
            {
                JobId = job.Id,
                Description = req.PartsDescription.Trim(),
                Status = PartsServiceStatus.PendingOrder,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            _db.JobPartsServices.Add(partsService);
            await _db.SaveChangesAsync(ct);
        }

        await tx.CommitAsync(ct);

        return Ok(new
        {
            jobId = job.Id,
            customerId = jobCustomerId,
            vehicleId = vehicle.Id,
            wofCreated,
        });
    }

    private async Task<Customer> UpsertCustomerAsync(NewJobRequest.CustomerInput input, CancellationToken ct)
    {
        // var isBusiness = string.Equals(input.Type, "Business", StringComparison.Ordinal);
        Customer? existing = null;
        if (!string.IsNullOrWhiteSpace(input.Phone))
        {
            existing = await _db.Customers.FirstOrDefaultAsync(x => x.Phone == input.Phone, ct);
            
        }

     
            existing = new Customer
            {
                Type = input.Type,
                Name = input.Name,
                Phone = input.Phone,
                Email = input.Email,
                Address = input.Address,
                BusinessCode = "WI",
                Notes = input.Notes,
            };
            Console.WriteLine("======Creating new person & saving to database");
            _db.Customers.Add(existing);
        

        await _db.SaveChangesAsync(ct);
        
        return existing;
    }

    private static string NormalizePlate(string plate)
        => new string(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private static string NormalizeCustomerType(string? type)
    {
        var trimmed = type?.Trim() ?? "";
        if (string.Equals(trimmed, "personal", StringComparison.OrdinalIgnoreCase))
            return "Personal";
        if (string.Equals(trimmed, "business", StringComparison.OrdinalIgnoreCase))
            return "Business";
        return trimmed;
    }

    private static bool IsValidCustomerType(string type)
        => string.Equals(type, "Personal", StringComparison.Ordinal) ||
           string.Equals(type, "Business", StringComparison.Ordinal);
}
