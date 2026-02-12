using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/customers")]
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;

    public CustomersController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var rows = await _db.Customers.AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                type = x.Type,
                name = x.Name,
                phone = x.Phone ?? "",
                email = x.Email ?? "",
                address = x.Address ?? "",
                businessCode = x.BusinessCode ?? "",
                notes = x.Notes ?? ""
            })
            .ToListAsync(ct);

        return Ok(rows);
    }

    public record CustomerUpsertRequest(
        string Type,
        string Name,
        string? Phone,
        string? Email,
        string? Address,
        string? BusinessCode,
        string? Notes
    );

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CustomerUpsertRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required." });
        if (string.IsNullOrWhiteSpace(req.Type))
            return BadRequest(new { error = "Type is required." });

        var normalizedType = NormalizeCustomerType(req.Type);
        if (!IsValidCustomerType(normalizedType))
            return BadRequest(new { error = "Customer type must be Personal or Business." });

        var customer = new Customer
        {
            Type = normalizedType,
            Name = req.Name.Trim(),
            Phone = req.Phone?.Trim(),
            Email = req.Email?.Trim(),
            Address = req.Address?.Trim(),
            BusinessCode = req.BusinessCode?.Trim(),
            Notes = req.Notes?.Trim()
        };

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = customer.Id.ToString(CultureInfo.InvariantCulture),
            type = customer.Type,
            name = customer.Name,
            phone = customer.Phone ?? "",
            email = customer.Email ?? "",
            address = customer.Address ?? "",
            businessCode = customer.BusinessCode ?? "",
            notes = customer.Notes ?? ""
        });
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] CustomerUpsertRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required." });
        if (string.IsNullOrWhiteSpace(req.Type))
            return BadRequest(new { error = "Type is required." });

        var normalizedType = NormalizeCustomerType(req.Type);
        if (!IsValidCustomerType(normalizedType))
            return BadRequest(new { error = "Customer type must be Personal or Business." });

        var customer = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (customer is null)
            return NotFound(new { error = "Customer not found." });

        customer.Type = normalizedType;
        customer.Name = req.Name.Trim();
        customer.Phone = req.Phone?.Trim();
        customer.Email = req.Email?.Trim();
        customer.Address = req.Address?.Trim();
        customer.BusinessCode = req.BusinessCode?.Trim();
        customer.Notes = req.Notes?.Trim();

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = customer.Id.ToString(CultureInfo.InvariantCulture),
            type = customer.Type,
            name = customer.Name,
            phone = customer.Phone ?? "",
            email = customer.Email ?? "",
            address = customer.Address ?? "",
            businessCode = customer.BusinessCode ?? "",
            notes = customer.Notes ?? ""
        });
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        var customer = await _db.Customers.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (customer is null)
            return NotFound(new { error = "Customer not found." });

        var inUse = await _db.Jobs.AsNoTracking().AnyAsync(x => x.CustomerId == id, ct);
        if (inUse)
            return BadRequest(new { error = "Customer is used by jobs and cannot be deleted." });

        _db.Customers.Remove(customer);
        await _db.SaveChangesAsync(ct);
        return Ok(new { success = true });
    }

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
