using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class JobXeroDraftInvoiceService
{
    private readonly AppDbContext _db;
    private readonly XeroInvoiceService _xeroInvoiceService;
    private readonly XeroTokenService _xeroTokenService;
    private readonly XeroOptions _xeroOptions;

    public JobXeroDraftInvoiceService(
        AppDbContext db,
        XeroInvoiceService xeroInvoiceService,
        XeroTokenService xeroTokenService,
        IOptions<XeroOptions> xeroOptions)
    {
        _db = db;
        _xeroInvoiceService = xeroInvoiceService;
        _xeroTokenService = xeroTokenService;
        _xeroOptions = xeroOptions.Value;
    }

    public async Task<JobXeroDraftInvoiceResult> CreateForJobAsync(long jobId, CancellationToken ct)
    {
        var row = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                where j.Id == jobId
                select new
                {
                    Job = j,
                    Vehicle = v,
                    Customer = c,
                }
            )
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return JobXeroDraftInvoiceResult.Fail(404, "Job not found.");

        var mechServices = await _db.JobMechServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);

        var partsServices = await _db.JobPartsServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);

        var contactName = BuildContactName(row.Customer.Type, row.Customer.Name, row.Vehicle.Plate, row.Vehicle.Make, row.Vehicle.Model);
        if (string.IsNullOrWhiteSpace(contactName))
            return JobXeroDraftInvoiceResult.Fail(400, "Unable to derive a Xero contact name from this job.");

        var reference = BuildReference(row.Customer.Type, row.Customer.Name);
        var lineItems = BuildLineItems(mechServices, partsServices, _xeroOptions.LabourAccountCode, _xeroOptions.PartsAccountCode);

        var createResult = await _xeroInvoiceService.CreateDraftInvoiceAsync(
            new XeroDraftInvoiceCreateRequest
            {
                ContactName = contactName,
                Reference = reference,
                Date = DateOnly.FromDateTime(DateTime.UtcNow),
                DueDate = null,
                LineItems = lineItems,
            },
            ct);

        if (!createResult.Ok)
        {
            return JobXeroDraftInvoiceResult.Fail(
                createResult.StatusCode,
                createResult.Error ?? "Failed to create Xero draft invoice.",
                new JobXeroDraftInvoiceDetails
                {
                    JobId = jobId,
                    ContactName = contactName,
                    Reference = reference,
                    CustomerType = row.Customer.Type,
                    LineItemCount = lineItems.Count,
                    LatestRefreshToken = createResult.RefreshToken,
                    RefreshTokenUpdated = !string.IsNullOrWhiteSpace(createResult.RefreshToken) &&
                                          !string.Equals(createResult.RefreshToken, _xeroTokenService.GetConfiguredRefreshToken(), StringComparison.Ordinal),
                    LineItems = lineItems,
                });
        }

        return JobXeroDraftInvoiceResult.Success(new JobXeroDraftInvoiceDetails
        {
            JobId = jobId,
            ContactName = contactName,
            Reference = reference,
            CustomerType = row.Customer.Type,
            XeroInvoiceId = createResult.InvoiceId,
            InvoiceNumber = createResult.InvoiceNumber,
            Status = createResult.InvoiceStatus,
            Scope = createResult.Scope,
            AccessTokenExpiresIn = createResult.ExpiresIn,
            LineItemCount = lineItems.Count,
            LatestRefreshToken = createResult.RefreshToken,
            RefreshTokenUpdated = !string.IsNullOrWhiteSpace(createResult.RefreshToken) &&
                                  !string.Equals(createResult.RefreshToken, _xeroTokenService.GetConfiguredRefreshToken(), StringComparison.Ordinal),
            LineItems = lineItems,
        });
    }

    private static string BuildContactName(string customerType, string customerName, string plate, string? make, string? model)
    {
        if (string.Equals(customerType, "Personal", StringComparison.OrdinalIgnoreCase))
        {
            return string.Join(' ', new[] { plate, make, model }
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x!.Trim()));
        }

        return customerName.Trim();
    }

    private static string? BuildReference(string customerType, string customerName)
    {
        if (string.Equals(customerType, "Personal", StringComparison.OrdinalIgnoreCase))
            return string.IsNullOrWhiteSpace(customerName) ? null : customerName.Trim();

        return null;
    }

    private static IReadOnlyList<XeroDraftInvoiceLineItem> BuildLineItems(
        IReadOnlyList<Workshop.Api.Models.JobMechService> mechServices,
        IReadOnlyList<Workshop.Api.Models.JobPartsService> partsServices,
        string labourAccountCode,
        string partsAccountCode)
    {
        var lineItems = new List<XeroDraftInvoiceLineItem>();

        foreach (var mech in mechServices)
        {
            if (string.IsNullOrWhiteSpace(mech.Description))
                continue;

            lineItems.Add(new XeroDraftInvoiceLineItem
            {
                Description = mech.Description.Trim(),
                Quantity = 1m,
                UnitAmount = mech.Cost ?? 0m,
                AccountCode = string.IsNullOrWhiteSpace(labourAccountCode) ? null : labourAccountCode.Trim(),
            });
        }

        foreach (var part in partsServices)
        {
            if (string.IsNullOrWhiteSpace(part.Description))
                continue;

            lineItems.Add(new XeroDraftInvoiceLineItem
            {
                Description = $"Parts: {part.Description.Trim()}",
                Quantity = 1m,
                UnitAmount = 0m,
                AccountCode = string.IsNullOrWhiteSpace(partsAccountCode) ? null : partsAccountCode.Trim(),
            });
        }

        return lineItems;
    }
}

public sealed class JobXeroDraftInvoiceResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public JobXeroDraftInvoiceDetails? Details { get; private init; }

    public static JobXeroDraftInvoiceResult Success(JobXeroDraftInvoiceDetails details) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Details = details,
        };

    public static JobXeroDraftInvoiceResult Fail(int statusCode, string error, JobXeroDraftInvoiceDetails? details = null) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Details = details,
        };
}

public sealed class JobXeroDraftInvoiceDetails
{
    public long JobId { get; init; }
    public string ContactName { get; init; } = "";
    public string? Reference { get; init; }
    public string CustomerType { get; init; } = "";
    public string XeroInvoiceId { get; init; } = "";
    public string InvoiceNumber { get; init; } = "";
    public string Status { get; init; } = "";
    public string Scope { get; init; } = "";
    public int AccessTokenExpiresIn { get; init; }
    public int LineItemCount { get; init; }
    public string LatestRefreshToken { get; init; } = "";
    public bool RefreshTokenUpdated { get; init; }
    public IReadOnlyList<XeroDraftInvoiceLineItem> LineItems { get; init; } = [];
}
