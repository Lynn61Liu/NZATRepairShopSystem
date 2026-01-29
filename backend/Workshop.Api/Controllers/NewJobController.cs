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

        if (req.Customer is null || string.IsNullOrWhiteSpace(req.Customer.Name))
            return BadRequest(new { error = "Customer name is required." });

        if (string.IsNullOrWhiteSpace(req.Customer.Type))
            return BadRequest(new { error = "Customer type is required." });

        var normalizedCustomerType = NormalizeCustomerType(req.Customer.Type);
        if (!IsValidCustomerType(normalizedCustomerType))
            return BadRequest(new { error = "Customer type must be Personal or Business." });

        req.Customer.Type = normalizedCustomerType;

        var plate = NormalizePlate(req.Plate);
        var vehicle = await _db.Vehicles.FirstOrDefaultAsync(x => x.Plate == plate, ct);
      
      
        if (vehicle is null)
            return BadRequest(new { error = "Vehicle not found for plate." });

        using var tx = await _db.Database.BeginTransactionAsync(ct);

        var customer = await UpsertCustomerAsync(req.Customer, ct);

        var job = new Job
        {
            Status = "InProgress",
            IsUrgent = false,
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.Jobs.Add(job);
        await _db.SaveChangesAsync(ct);

        var wofCreated = false;
        Console.WriteLine("======Checking if WOF service is requested: {0}", string.Join(",", req.Services ?? new string[0]));
        if (req.Services?.Any(s => string.Equals(s, "wof", StringComparison.OrdinalIgnoreCase)) == true)
        {
            var wof = new WofService
            {
                JobId = job.Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            _db.WofServices.Add(wof);
            await _db.SaveChangesAsync(ct);
            wofCreated = true;
        }

        await tx.CommitAsync(ct);

        return Ok(new
        {
            jobId = job.Id,
            customerId = customer.Id,
            vehicleId = vehicle.Id,
            wofCreated,
        });
    }

    private async Task<Customer> UpsertCustomerAsync(NewJobRequest.CustomerInput input, CancellationToken ct)
    {
        Customer? existing = null;
        if (!string.IsNullOrWhiteSpace(input.Phone))
        {
            existing = await _db.Customers.FirstOrDefaultAsync(x => x.Phone == input.Phone, ct);
            Console.WriteLine($"======Looking up customer by phone '{input.Phone}': {(existing is null ? "not found" : "found")}");
            Console.WriteLine($"======Existing customer: {existing} ");
        }

        if (existing is null)
        {
            existing = new Customer
            {
                Type = input.Type,
                Name = input.Name,
                Phone = input.Phone,
                Email = input.Email,
                Address = input.Address,
                BusinessCode = input.BusinessCode,
                Notes = input.Notes,
            };
            Console.WriteLine("======Creating new customer & saving to database");
            _db.Customers.Add(existing);
        }
        else
        {
            existing.Type = input.Type;
            existing.Name = input.Name;
            existing.Email = input.Email;
            existing.Address = input.Address;
            existing.BusinessCode = input.BusinessCode;
            existing.Notes = input.Notes;
            existing.Id = existing.Id; // ensure id is set
            Console.WriteLine("======Updating existing customer");
        }

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
