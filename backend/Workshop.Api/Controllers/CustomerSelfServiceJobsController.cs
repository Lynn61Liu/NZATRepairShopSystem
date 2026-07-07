using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/customer-self-service/jobs")]
public sealed class CustomerSelfServiceJobsController : ControllerBase
{
    private const string QuoteTagName = "报价";
    private const string PartsFlowCacheKey = "parts-flow:v1";

    private readonly NewJobCreationService _newJobCreationService;
    private readonly ServiceCatalogService _serviceCatalogService;
    private readonly AppDbContext _db;
    private readonly CarjamAsyncImportService _carjamAsyncImportService;
    private readonly IAppCache _cache;

    public CustomerSelfServiceJobsController(
        NewJobCreationService newJobCreationService,
        ServiceCatalogService serviceCatalogService,
        AppDbContext db,
        CarjamAsyncImportService carjamAsyncImportService,
        IAppCache cache)
    {
        _newJobCreationService = newJobCreationService;
        _serviceCatalogService = serviceCatalogService;
        _db = db;
        _carjamAsyncImportService = carjamAsyncImportService;
        _cache = cache;
    }

    [HttpGet("plate-lookup")]
    public async Task<IActionResult> LookupPlate([FromQuery] string? plate, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(plate))
            return BadRequest(new { error = "Plate is required." });

        var normalized = NormalizePlate(plate);
        if (string.IsNullOrWhiteSpace(normalized))
            return BadRequest(new { error = "Plate is required." });

        var latestJob = await _db.Jobs
            .AsNoTracking()
            .Include(x => x.Vehicle)
            .Include(x => x.Customer)
            .Where(x => x.Vehicle != null && x.Vehicle.Plate == normalized)
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .FirstOrDefaultAsync(ct);

        if (latestJob is not null)
        {
            return Ok(new
            {
                matchedJob = true,
                importQueued = false,
                vehicle = ToVehicleResponse(latestJob.Vehicle),
                linkedCustomer = latestJob.Customer is null
                    ? null
                    : new
                    {
                        source = "job",
                        jobId = latestJob.Id,
                        customer = ToCustomerResponse(latestJob.Customer),
                    },
            });
        }

        var existingVehicle = await _db.Vehicles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Plate == normalized, ct);

        _carjamAsyncImportService.Dispatch(normalized);

        return Ok(new
        {
            matchedJob = false,
            importQueued = true,
            vehicle = ToVehicleResponse(existingVehicle),
            linkedCustomer = (object?)null,
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CustomerSelfServiceJobRequest req, CancellationToken ct)
    {
        var errors = CustomerSelfServiceJobMapper.Validate(req);
        if (errors.Count > 0)
            return BadRequest(new { error = errors[0], errors });

        try
        {
            await _serviceCatalogService.EnsureSeededAsync(ct);
            if (!req.CustomerEdited && req.ExistingCustomerId.HasValue)
            {
                var canReuseCustomer = await HistoricalJobExistsForCustomerAsync(req.Plate, req.ExistingCustomerId.Value, ct);
                if (!canReuseCustomer)
                    return BadRequest(new { error = "Selected customer does not match this vehicle." });
            }

            var serviceType = req.HasWof ? "wof" : "mech";
            var preferredRootCode = req.HasWof ? "208-WOF" : "666WORSHOP Labour Fee";
            var rootServiceCatalogItemId = await _serviceCatalogService.ResolveActiveRootServiceIdAsync(
                serviceType,
                preferredRootCode,
                ct);
            var newJobRequest = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId);
            var result = await _newJobCreationService.CreateAsync(newJobRequest, ct);
            if (!req.HasWof)
            {
                await ApplyQuoteEmailAsync(_db, result.CustomerId, req.QuoteEmail, ct);
            }
            if (!req.HasWof && req.RequiresQuote)
            {
                await EnsureQuoteTagAsync(_db, result.JobId, ct, req.QuotePartsContent);
                await _cache.RemoveAsync(PartsFlowCacheKey, ct);
            }

            return Ok(new
            {
                jobId = result.JobId,
                customerId = result.CustomerId,
                vehicleId = result.VehicleId,
                wofCreated = result.WofCreated,
                invoiceQueued = result.InvoiceQueued,
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    internal static async Task EnsureQuoteTagAsync(AppDbContext db, long jobId, CancellationToken ct, string? quotePartsContent = null)
    {
        var tag = await db.Tags
            .FirstOrDefaultAsync(x => x.IsActive && x.Name.ToLower() == QuoteTagName.ToLower(), ct);
        var now = DateTime.UtcNow;
        var partsDescription = string.IsNullOrWhiteSpace(quotePartsContent)
            ? QuoteTagName
            : quotePartsContent.Trim();

        if (tag is null)
        {
            tag = new Tag
            {
                Name = QuoteTagName,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.Tags.Add(tag);
            await db.SaveChangesAsync(ct);
        }

        var exists = await db.JobTags
            .AnyAsync(x => x.JobId == jobId && x.TagId == tag.Id, ct);

        if (!exists)
        {
            db.JobTags.Add(new JobTag
            {
                JobId = jobId,
                TagId = tag.Id,
                CreatedAt = now,
            });
        }

        if (!await db.JobPartsServices.AnyAsync(x => x.JobId == jobId, ct))
        {
            db.JobPartsServices.Add(new JobPartsService
            {
                JobId = jobId,
                Description = partsDescription,
                Status = PartsServiceStatus.Quote,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }
        await db.SaveChangesAsync(ct);
    }

    internal static async Task ApplyQuoteEmailAsync(AppDbContext db, long? customerId, string? quoteEmail, CancellationToken ct)
    {
        var trimmedEmail = quoteEmail?.Trim();
        if (!customerId.HasValue || string.IsNullOrWhiteSpace(trimmedEmail))
            return;

        var customer = await db.Customers.FirstOrDefaultAsync(x => x.Id == customerId.Value, ct);
        if (customer is null)
            return;

        customer.Email = trimmedEmail;
        await db.SaveChangesAsync(ct);
    }

    private static object? ToVehicleResponse(Vehicle? vehicle)
    {
        if (vehicle is null)
            return null;

        return new
        {
            vehicle.Plate,
            vehicle.Make,
            vehicle.Model,
            vehicle.Year,
            vehicle.Vin,
            vehicle.FuelType,
            vehicle.BodyStyle,
            vehicle.NzFirstRegistration,
            vehicle.WofExpiry,
            vehicle.Odometer,
            vehicle.UpdatedAt,
        };
    }

    private static object ToCustomerResponse(Customer customer) => new
    {
        customer.Id,
        customer.Type,
        customer.Name,
        customer.Phone,
        customer.Email,
        customer.Address,
        customer.BusinessCode,
        customer.Notes,
    };

    private async Task<bool> HistoricalJobExistsForCustomerAsync(string plate, long customerId, CancellationToken ct)
    {
        var normalized = NormalizePlate(plate);
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        return await _db.Jobs
            .AsNoTracking()
            .AnyAsync(x =>
                x.CustomerId == customerId &&
                x.Vehicle != null &&
                x.Vehicle.Plate == normalized,
                ct);
    }

    private static string NormalizePlate(string plate)
        => new(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
}
