using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class JobInvoiceService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly XeroInvoiceService _xeroInvoiceService;

    public JobInvoiceService(AppDbContext db, XeroInvoiceService xeroInvoiceService)
    {
        _db = db;
        _xeroInvoiceService = xeroInvoiceService;
    }

    public async Task<JobInvoiceCreateResult> CreateDraftForJobAsync(long jobId, CancellationToken ct)
    {
        var existing = await _db.JobInvoices.AsNoTracking().FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (existing is not null)
        {
            return JobInvoiceCreateResult.Success(existing, alreadyExists: true);
        }

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
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var mechServices = await _db.JobMechServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);
        var partsServices = await _db.JobPartsServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);
        var paintService = await _db.JobPaintServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);
        var hasWofRecord = await _db.JobWofRecords.AsNoTracking()
            .AnyAsync(x => x.JobId == jobId, ct);

        CreateXeroInvoiceRequest request;
        try
        {
            request = await BuildCreateRequestAsync(row.Job, row.Customer, row.Vehicle, mechServices, partsServices, paintService, hasWofRecord, ct);
        }
        catch (InvalidOperationException ex)
        {
            return JobInvoiceCreateResult.Fail(400, ex.Message);
        }

        var createResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!createResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                createResult.StatusCode,
                createResult.Error ?? "Failed to create Xero draft invoice.",
                createResult.Payload,
                request,
                createResult.RefreshToken,
                createResult.RefreshTokenUpdated,
                createResult.Scope,
                createResult.ExpiresIn);
        }

        var jobInvoice = BuildJobInvoice(jobId, request, createResult.Payload, createResult.TenantId);
        _db.JobInvoices.Add(jobInvoice);
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: false,
            payload: createResult.Payload,
            requestBody: request,
            refreshToken: createResult.RefreshToken,
            refreshTokenUpdated: createResult.RefreshTokenUpdated,
            scope: createResult.Scope,
            expiresIn: createResult.ExpiresIn);
    }

    public async Task<JobInvoiceCreateResult> SyncDraftForJobAsync(long jobId, SyncJobInvoiceDraftRequest payload, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id for sync.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        if (payload.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        var request = new CreateXeroInvoiceRequest
        {
            InvoiceId = invoiceId,
            Type = "ACCREC",
            Status = string.IsNullOrWhiteSpace(payload.Status) ? (jobInvoice.ExternalStatus ?? "DRAFT") : payload.Status.Trim(),
            LineAmountTypes = string.IsNullOrWhiteSpace(payload.LineAmountTypes) ? "Inclusive" : payload.LineAmountTypes.Trim(),
            Date = payload.Date ?? jobInvoice.InvoiceDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = string.IsNullOrWhiteSpace(payload.Reference) ? jobInvoice.Reference : payload.Reference.Trim(),
            Contact = new XeroInvoiceContactInput
            {
                Name = string.IsNullOrWhiteSpace(payload.ContactName) ? jobInvoice.ContactName : payload.ContactName.Trim(),
            },
            LineItems = payload.LineItems
                .Where(item => !string.IsNullOrWhiteSpace(item.Description))
                .Select(item => new XeroInvoiceLineItemInput
                {
                    Description = item.Description.Trim(),
                    Quantity = item.Quantity,
                    UnitAmount = item.UnitAmount,
                    LineAmount = item.LineAmount,
                    ItemCode = item.ItemCode?.Trim(),
                    AccountCode = item.AccountCode?.Trim(),
                    TaxType = NormalizeXeroTaxType(item.TaxType),
                    TaxAmount = item.TaxAmount,
                    DiscountRate = item.DiscountRate,
                    DiscountAmount = item.DiscountAmount,
                })
                .ToList(),
        };

        if (request.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to sync Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        job.InvoiceReference = request.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: false,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceCreateResult> SaveDraftToDbAsync(long jobId, SaveJobInvoiceDraftRequest payload, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        if (payload.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        var request = new CreateXeroInvoiceRequest
        {
            InvoiceId = Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId) ? invoiceId : null,
            Type = "ACCREC",
            Status = jobInvoice.ExternalStatus ?? "DRAFT",
            LineAmountTypes = string.IsNullOrWhiteSpace(payload.LineAmountTypes) ? "Inclusive" : payload.LineAmountTypes.Trim(),
            Date = payload.Date ?? jobInvoice.InvoiceDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = string.IsNullOrWhiteSpace(payload.Reference) ? jobInvoice.Reference : payload.Reference.Trim(),
            Contact = new XeroInvoiceContactInput
            {
                Name = string.IsNullOrWhiteSpace(payload.ContactName) ? jobInvoice.ContactName : payload.ContactName.Trim(),
            },
            LineItems = payload.LineItems
                .Where(item => !string.IsNullOrWhiteSpace(item.Description))
                .Select(item => new XeroInvoiceLineItemInput
                {
                    Description = item.Description.Trim(),
                    Quantity = item.Quantity,
                    UnitAmount = item.UnitAmount,
                    LineAmount = item.LineAmount,
                    ItemCode = item.ItemCode?.Trim(),
                    AccountCode = item.AccountCode?.Trim(),
                    TaxType = NormalizeXeroTaxType(item.TaxType),
                    TaxAmount = item.TaxAmount,
                    DiscountRate = item.DiscountRate,
                    DiscountAmount = item.DiscountAmount,
                })
                .ToList(),
        };

        if (request.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        jobInvoice.Reference = request.Reference;
        jobInvoice.ContactName = request.Contact.Name;
        jobInvoice.InvoiceDate = request.Date;
        jobInvoice.LineAmountTypes = request.LineAmountTypes;
        jobInvoice.RequestPayloadJson = JsonSerializer.Serialize(request, JsonOptions);
        jobInvoice.UpdatedAt = DateTime.UtcNow;

        job.InvoiceReference = request.Reference;
        job.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, requestBody: request);
    }

    public async Task<JobInvoiceCreateResult> SyncFromXeroAsync(long jobId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        return await SyncFromXeroInvoiceIdAsync(invoiceId, ct);
    }

    public async Task<JobInvoiceCreateResult> SyncFromXeroInvoiceIdAsync(Guid invoiceId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.ExternalInvoiceId == invoiceId.ToString(), ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Linked job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobInvoice.JobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var xeroResult = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
        if (!xeroResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                xeroResult.StatusCode,
                xeroResult.Error ?? "Failed to fetch invoice from Xero.",
                xeroResult.Payload);
        }

        var request = BuildRequestFromPayload(xeroResult.Payload, jobInvoice);
        ApplyInvoiceUpdate(jobInvoice, request, xeroResult.Payload, xeroResult.TenantId);
        job.InvoiceReference = jobInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, payload: xeroResult.Payload, requestBody: request);
    }

    private async Task<CreateXeroInvoiceRequest> BuildCreateRequestAsync(
        Job job,
        Customer customer,
        Vehicle vehicle,
        IReadOnlyList<JobMechService> mechServices,
        IReadOnlyList<JobPartsService> partsServices,
        JobPaintService? paintService,
        bool hasWofRecord,
        CancellationToken ct)
    {
        var reference = BuildReference(customer);
        var contactName = BuildContactName(customer, vehicle);
        if (string.IsNullOrWhiteSpace(contactName))
            throw new InvalidOperationException("Unable to derive contact name for invoice.");

        var lineItems = new List<XeroInvoiceLineItemInput>();

        var wofItem = await BuildWofLineItemAsync(hasWofRecord, customer, ct);
        if (wofItem is not null)
            lineItems.Add(wofItem);

        var oilServiceItem = await BuildOilServiceLineItemAsync(customer, vehicle, mechServices, ct);
        if (oilServiceItem is not null)
            lineItems.Add(oilServiceItem);

        var brakeServiceItem = await BuildBrakeServiceLineItemAsync(mechServices, ct);
        if (brakeServiceItem is not null)
            lineItems.Add(brakeServiceItem);

        var batteryServiceItem = await BuildBatteryServiceLineItemAsync(mechServices, ct);
        if (batteryServiceItem is not null)
            lineItems.Add(batteryServiceItem);

        var tireServiceItem = await BuildTireServiceLineItemAsync(mechServices, ct);
        if (tireServiceItem is not null)
            lineItems.Add(tireServiceItem);

        var filterServiceItem = await BuildFilterServiceLineItemAsync(vehicle, mechServices, ct);
        if (filterServiceItem is not null)
            lineItems.Add(filterServiceItem);

        var otherServiceItem = await BuildOtherMechServiceLineItemAsync(mechServices, ct);
        if (otherServiceItem is not null)
            lineItems.Add(otherServiceItem);

        lineItems.AddRange(mechServices
            .Where(x => !string.IsNullOrWhiteSpace(x.Description) &&
                        !IsOilServiceDescription(x.Description) &&
                        !IsBrakeServiceDescription(x.Description) &&
                        !IsBatteryServiceDescription(x.Description) &&
                        !IsTireServiceDescription(x.Description) &&
                        !IsFilterServiceDescription(x.Description) &&
                        !IsOtherMechServiceDescription(x.Description))
            .Select(x => new XeroInvoiceLineItemInput
            {
                Description = x.Description.Trim(),
                Quantity = 1m,
                UnitAmount = x.Cost ?? 0m,
            }));

        lineItems.AddRange(partsServices
            .Where(x => !string.IsNullOrWhiteSpace(x.Description))
            .Select(x => new XeroInvoiceLineItemInput
            {
                Description = x.Description.Trim(),
                Quantity = 1m,
                UnitAmount = 0m,
            }));

        if (paintService is not null)
        {
            lineItems.Add(new XeroInvoiceLineItemInput
            {
                Description = paintService.Panels > 0
                    ? $"Paint service - {paintService.Panels} panel(s)"
                    : "Paint service",
                Quantity = 1m,
                UnitAmount = 0m,
            });
        }

        var jobNote = job.Notes?.Trim();
        if (!string.IsNullOrWhiteSpace(jobNote))
        {
            lineItems.Add(new XeroInvoiceLineItemInput
            {
                Description = jobNote,
                Quantity = 1m,
                UnitAmount = 0m,
            });
        }

        if (lineItems.Count == 0)
        {
            lineItems.Add(new XeroInvoiceLineItemInput
            {
                Description = "Job draft",
                Quantity = 1m,
                UnitAmount = 0m,
            });
        }

        return new CreateXeroInvoiceRequest
        {
            Type = "ACCREC",
            Status = "DRAFT",
            LineAmountTypes = "Exclusive",
            Date = DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = reference,
            Contact = new XeroInvoiceContactInput
            {
                Name = contactName,
            },
            LineItems = lineItems,
        };
    }

    private sealed record OilServiceRule(
        string? MakeContains,
        string ModelContains,
        string? FuelType,
        string ItemCode);

    private static readonly IReadOnlyList<OilServiceRule> ExplicitOilServiceRules =
    [
        new(null, "xtrail", null, "Xtrail-fasst-services"),
        new("ford", "ranger", "Diesel", "C3 Fasst 4L-4.9L Services"),
        new("mitsubishi", "outlander", "Diesel", "C3 Fasst 4L-4.9L Services"),
        new("kia", "stinger", "Petrol", "SN Fasst 5.6L-6L Services"),
        new("volkswagen", "golf", "Petrol", "SN Fasst 4.1L-4.3L Services"),
        new("audi", "q2", "Petrol", "SN Fasst 4L Services"),
        new("mitsubishi", "eclipse cross", "Petrol", "SN Fasst 4L Services"),
        new("suzuki", "swift", "Petrol", "SN Fasst 4L Services"),
    ];

    private async Task<XeroInvoiceLineItemInput?> BuildOilServiceLineItemAsync(
        Customer customer,
        Vehicle vehicle,
        IReadOnlyList<JobMechService> mechServices,
        CancellationToken ct)
    {
        if (!mechServices.Any(x => !string.IsNullOrWhiteSpace(x.Description) && IsOilServiceDescription(x.Description)))
            return null;

        var itemCode = ResolveOilServiceItemCode(customer, vehicle);
        if (string.IsNullOrWhiteSpace(itemCode))
            return null;

        var inventoryItem = await _db.InventoryItems.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ItemCode == itemCode, ct);

        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = inventoryItem.ItemCode,
                Description = string.IsNullOrWhiteSpace(inventoryItem.SalesDescription)
                    ? inventoryItem.ItemName
                    : inventoryItem.SalesDescription,
                Quantity = 1m,
                UnitAmount = inventoryItem.SalesUnitPrice ?? inventoryItem.PurchasesUnitPrice ?? 0m,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return new XeroInvoiceLineItemInput
        {
            ItemCode = itemCode,
            Description = "Services",
            Quantity = 1m,
        };
    }

    private async Task<XeroInvoiceLineItemInput?> BuildBrakeServiceLineItemAsync(
        IReadOnlyList<JobMechService> mechServices,
        CancellationToken ct)
    {
        if (!mechServices.Any(x => !string.IsNullOrWhiteSpace(x.Description) && IsBrakeServiceDescription(x.Description)))
            return null;

        const string itemCode = "BRAKE";
        var inventoryItem = await _db.InventoryItems.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ItemCode == itemCode, ct);

        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = inventoryItem.ItemCode,
                Description = string.IsNullOrWhiteSpace(inventoryItem.SalesDescription)
                    ? inventoryItem.ItemName
                    : inventoryItem.SalesDescription,
                Quantity = 1m,
                UnitAmount = inventoryItem.SalesUnitPrice ?? inventoryItem.PurchasesUnitPrice ?? 0m,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return new XeroInvoiceLineItemInput
        {
            ItemCode = itemCode,
            Description = "FRONT/REAR BRAKE PADS &REPLACEMENT",
            Quantity = 1m,
        };
    }

    private async Task<XeroInvoiceLineItemInput?> BuildBatteryServiceLineItemAsync(
        IReadOnlyList<JobMechService> mechServices,
        CancellationToken ct)
    {
        if (!mechServices.Any(x => !string.IsNullOrWhiteSpace(x.Description) && IsBatteryServiceDescription(x.Description)))
            return null;

        const string itemCode = "BATTERY CHANGE / WARNING LIGHT";
        var inventoryItem = await _db.InventoryItems.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ItemCode == itemCode, ct);

        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = inventoryItem.ItemCode,
                Description = string.IsNullOrWhiteSpace(inventoryItem.SalesDescription)
                    ? inventoryItem.ItemName
                    : inventoryItem.SalesDescription,
                Quantity = 1m,
                UnitAmount = inventoryItem.SalesUnitPrice ?? inventoryItem.PurchasesUnitPrice ?? 0m,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return new XeroInvoiceLineItemInput
        {
            ItemCode = itemCode,
            Description = "WARNING LIGHTS ON/ BATTERY REPLACEMENT",
            Quantity = 1m,
        };
    }

    private async Task<XeroInvoiceLineItemInput?> BuildTireServiceLineItemAsync(
        IReadOnlyList<JobMechService> mechServices,
        CancellationToken ct)
    {
        if (!mechServices.Any(x => !string.IsNullOrWhiteSpace(x.Description) && IsTireServiceDescription(x.Description)))
            return null;

        const string itemCode = "Swap Wheel";
        return await BuildInventoryBackedLineItemAsync(itemCode, "Swap all four wheels from another car", ct);
    }

    private async Task<XeroInvoiceLineItemInput?> BuildFilterServiceLineItemAsync(
        Vehicle vehicle,
        IReadOnlyList<JobMechService> mechServices,
        CancellationToken ct)
    {
        if (!mechServices.Any(x => !string.IsNullOrWhiteSpace(x.Description) && IsFilterServiceDescription(x.Description)))
            return null;

        var itemCode = ResolveFilterItemCode(vehicle);
        if (string.IsNullOrWhiteSpace(itemCode))
            return null;

        return await BuildInventoryBackedLineItemAsync(itemCode, "Air filter replacement", ct);
    }

    private async Task<XeroInvoiceLineItemInput?> BuildOtherMechServiceLineItemAsync(
        IReadOnlyList<JobMechService> mechServices,
        CancellationToken ct)
    {
        if (!mechServices.Any(x => !string.IsNullOrWhiteSpace(x.Description) && IsOtherMechServiceDescription(x.Description)))
            return null;

        const string itemCode = "999";
        return await BuildInventoryBackedLineItemAsync(itemCode, "Labour:", ct);
    }

    private async Task<XeroInvoiceLineItemInput?> BuildWofLineItemAsync(bool hasWofRecord, Customer customer, CancellationToken ct)
    {
        if (!hasWofRecord)
            return null;

        var itemCode = ResolveWofItemCode(customer);
        var inventoryItem = await _db.InventoryItems.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ItemCode == itemCode, ct);

        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = inventoryItem.ItemCode,
                Description = string.IsNullOrWhiteSpace(inventoryItem.SalesDescription)
                    ? inventoryItem.ItemName
                    : inventoryItem.SalesDescription,
                Quantity = 1m,
                UnitAmount = inventoryItem.SalesUnitPrice ?? inventoryItem.PurchasesUnitPrice ?? 0m,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return itemCode switch
        {
            "WOF" => new XeroInvoiceLineItemInput
            {
                ItemCode = "WOF",
                Description = "WOF Inspection",
                Quantity = 1m,
                UnitAmount = 60.00m,
                AccountCode = "208",
                TaxType = "OUTPUT2",
            },
            "WOF-FASST" => new XeroInvoiceLineItemInput
            {
                ItemCode = "WOF-FASST",
                Description = "WOF Inspection",
                Quantity = 1m,
                UnitAmount = 43.48m,
                AccountCode = "208",
                TaxType = "OUTPUT2",
            },
            _ => new XeroInvoiceLineItemInput
            {
                ItemCode = "WOF-DEALERSHIP",
                Description = "WOF Inspection",
                Quantity = 1m,
                UnitAmount = 43.48m,
                AccountCode = "208",
                TaxType = "OUTPUT2",
            },
        };
    }

    private async Task<XeroInvoiceLineItemInput?> BuildInventoryBackedLineItemAsync(
        string itemCode,
        string fallbackDescription,
        CancellationToken ct)
    {
        var inventoryItem = await _db.InventoryItems.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ItemCode == itemCode, ct);

        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = inventoryItem.ItemCode,
                Description = string.IsNullOrWhiteSpace(inventoryItem.SalesDescription)
                    ? inventoryItem.ItemName
                    : inventoryItem.SalesDescription,
                Quantity = 1m,
                UnitAmount = inventoryItem.SalesUnitPrice ?? inventoryItem.PurchasesUnitPrice ?? 0m,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return new XeroInvoiceLineItemInput
        {
            ItemCode = itemCode,
            Description = fallbackDescription,
            Quantity = 1m,
        };
    }

    private static bool IsOilServiceDescription(string description)
    {
        var normalized = description.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        return normalized.Contains("换机油", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("engine oil", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("oil service", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(normalized, "oil", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(normalized, "service", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsBrakeServiceDescription(string description)
    {
        var normalized = description.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        return normalized.Contains("刹车", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("brake", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("brake pad", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("pads", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsBatteryServiceDescription(string description)
    {
        var normalized = description.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        return normalized.Contains("电池", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("battery", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("warning light", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("warning lights", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsTireServiceDescription(string description)
    {
        var normalized = description.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        return normalized.Contains("补胎", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("tire", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("tyre", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("wheel", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsFilterServiceDescription(string description)
    {
        var normalized = description.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        return normalized.Contains("滤芯", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("filter", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsOtherMechServiceDescription(string description)
    {
        var normalized = description.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        return normalized.Contains("其他机修", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(normalized, "other", StringComparison.OrdinalIgnoreCase);
    }

    private static string? NormalizeXeroTaxType(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized switch
        {
            "15% GST on Income" => "OUTPUT2",
            "15% GST on Expenses" => "INPUT2",
            "No GST" => "NONE",
            _ when normalized.Contains(' ') || normalized.Contains('%') => null,
            _ => normalized,
        };
    }

    private static string? ResolveOilServiceItemCode(Customer customer, Vehicle vehicle)
    {
        var make = (vehicle.Make ?? "").Trim();
        var model = (vehicle.Model ?? "").Trim();
        var fuelType = vehicle.FuelType?.Trim();

        if (string.Equals(fuelType, "Electric", StringComparison.OrdinalIgnoreCase))
            return null;

        foreach (var rule in ExplicitOilServiceRules)
        {
            if (!string.IsNullOrWhiteSpace(rule.MakeContains) &&
                !make.Contains(rule.MakeContains, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!model.Contains(rule.ModelContains, StringComparison.OrdinalIgnoreCase))
                continue;

            if (!string.IsNullOrWhiteSpace(rule.FuelType) &&
                !string.Equals(fuelType, rule.FuelType, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return rule.ItemCode;
        }

        var businessCode = customer.BusinessCode?.Trim();
        if (!string.Equals(businessCode, "FAS", StringComparison.OrdinalIgnoreCase))
        {
            return "203-Services";
        }

        var isC3 = string.Equals(fuelType, "Diesel", StringComparison.OrdinalIgnoreCase);
        var cc = vehicle.CcRating ?? 0;

        if (cc <= 0)
            return isC3 ? "C3 Fasst 4L-4.9L Services" : "SN Fasst 4L Services";

        if (isC3)
        {
            return cc switch
            {
                > 5900 => "C3 Fasst 6L-6.9L Services",
                > 4900 => "C3 Fasst 5L-5.9L Services",
                _ => "C3 Fasst 4L-4.9L Services",
            };
        }

        return cc switch
        {
            <= 1800 => "SN Fasst 4L Services",
            <= 2200 => "SN Fasst 4.1L-4.3L Services",
            <= 2600 => "SN Fasst 4.5L Services",
            <= 3200 => "SN Fasst 5L-5.5L Services",
            <= 4000 => "SN Fasst 5.6L-6L Services",
            <= 5000 => "SN Fasst 6L-7L Services",
            _ => "SN Fasst 7L-8L Services",
        };
    }

    private static string? ResolveFilterItemCode(Vehicle vehicle)
    {
        var model = (vehicle.Model ?? "").Trim();
        if (model.Contains("xtrail", StringComparison.OrdinalIgnoreCase) ||
            model.Contains("x-trail", StringComparison.OrdinalIgnoreCase))
        {
            return "Xtrail-fasst-services";
        }

        if (model.Contains("note", StringComparison.OrdinalIgnoreCase))
            return "A1913";

        return null;
    }

    private static string ResolveWofItemCode(Customer customer)
    {
        if (string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return "WOF";

        return string.Equals(customer.BusinessCode?.Trim(), "FAS", StringComparison.OrdinalIgnoreCase)
            ? "WOF-FASST"
            : "WOF-DEALERSHIP";
    }

    private static string BuildReference(Customer customer)
    {
        if (string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
        {
            var parts = new[] { customer.Name, customer.Phone }
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x!.Trim());
            return string.Join(' ', parts);
        }

        return "等待PO confirm";
    }

    private static string BuildContactName(Customer customer, Vehicle vehicle)
    {
        if (!string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return customer.Name.Trim();

        var vehicleSummary = new[]
            {
                vehicle.Year > 0 ? vehicle.Year.ToString() : null,
                vehicle.Make,
                vehicle.Model,
            }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim().ToUpperInvariant())
            .ToList();

        var rego = vehicle.Plate?.Trim().ToUpperInvariant();
        if (!string.IsNullOrWhiteSpace(rego))
            vehicleSummary.Insert(0, rego);

        return vehicleSummary.Count > 0
            ? string.Join(' ', vehicleSummary)
            : customer.Name.Trim();
    }

    private static JobInvoice BuildJobInvoice(long jobId, CreateXeroInvoiceRequest request, object? payload, string? tenantId)
    {
        var now = DateTime.UtcNow;
        var jobInvoice = new JobInvoice
        {
            JobId = jobId,
            Provider = "xero",
            CreatedAt = now,
            UpdatedAt = now,
        };
        ApplyInvoiceUpdate(jobInvoice, request, payload, tenantId);
        return jobInvoice;
    }

    private static CreateXeroInvoiceRequest BuildRequestFromPayload(object? payload, JobInvoice existing)
    {
        var fallback = new CreateXeroInvoiceRequest
        {
            InvoiceId = Guid.TryParse(existing.ExternalInvoiceId, out var existingId) ? existingId : null,
            Status = existing.ExternalStatus ?? "DRAFT",
            Reference = existing.Reference,
            Date = existing.InvoiceDate,
            LineAmountTypes = existing.LineAmountTypes,
            Contact = new XeroInvoiceContactInput
            {
                Name = existing.ContactName,
            },
        };

        if (payload is null)
            return fallback;

        try
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(payload, JsonOptions));
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return fallback;

            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return fallback;

            var request = new CreateXeroInvoiceRequest
            {
                InvoiceId = invoice.TryGetProperty("InvoiceID", out var invoiceIdProp) &&
                            invoiceIdProp.ValueKind == JsonValueKind.String &&
                            Guid.TryParse(invoiceIdProp.GetString(), out var parsedInvoiceId)
                    ? parsedInvoiceId
                    : fallback.InvoiceId,
                Type = invoice.TryGetProperty("Type", out var typeProp) && typeProp.ValueKind == JsonValueKind.String
                    ? typeProp.GetString() ?? "ACCREC"
                    : "ACCREC",
                Status = invoice.TryGetProperty("Status", out var statusProp) && statusProp.ValueKind == JsonValueKind.String
                    ? statusProp.GetString() ?? fallback.Status
                    : fallback.Status,
                LineAmountTypes = invoice.TryGetProperty("LineAmountTypes", out var lineAmountProp) && lineAmountProp.ValueKind == JsonValueKind.String
                    ? lineAmountProp.GetString() ?? fallback.LineAmountTypes
                    : fallback.LineAmountTypes,
                Date = invoice.TryGetProperty("DateString", out var dateStringProp) &&
                       dateStringProp.ValueKind == JsonValueKind.String &&
                       DateOnly.TryParse(dateStringProp.GetString(), out var parsedDate)
                    ? parsedDate
                    : fallback.Date,
                Reference = invoice.TryGetProperty("Reference", out var referenceProp) && referenceProp.ValueKind == JsonValueKind.String
                    ? referenceProp.GetString() ?? fallback.Reference
                    : fallback.Reference,
                InvoiceNumber = invoice.TryGetProperty("InvoiceNumber", out var invoiceNumberProp) && invoiceNumberProp.ValueKind == JsonValueKind.String
                    ? invoiceNumberProp.GetString()
                    : null,
                Contact = new XeroInvoiceContactInput
                {
                    Name = invoice.TryGetProperty("Contact", out var contactProp) &&
                           contactProp.ValueKind == JsonValueKind.Object &&
                           contactProp.TryGetProperty("Name", out var contactNameProp) &&
                           contactNameProp.ValueKind == JsonValueKind.String
                        ? contactNameProp.GetString() ?? fallback.Contact.Name
                        : fallback.Contact.Name,
                },
            };

            if (invoice.TryGetProperty("LineItems", out var lineItemsProp) && lineItemsProp.ValueKind == JsonValueKind.Array)
            {
                request.LineItems = lineItemsProp.EnumerateArray()
                    .Select(item => new XeroInvoiceLineItemInput
                    {
                        Description = item.TryGetProperty("Description", out var descriptionProp) && descriptionProp.ValueKind == JsonValueKind.String
                            ? descriptionProp.GetString() ?? ""
                            : "",
                        Quantity = item.TryGetProperty("Quantity", out var quantityProp) && quantityProp.TryGetDecimal(out var quantity)
                            ? quantity
                            : 1m,
                        UnitAmount = item.TryGetProperty("UnitAmount", out var unitAmountProp) && unitAmountProp.TryGetDecimal(out var unitAmount)
                            ? unitAmount
                            : null,
                        LineAmount = item.TryGetProperty("LineAmount", out var lineAmountItemProp) && lineAmountItemProp.TryGetDecimal(out var lineAmount)
                            ? lineAmount
                            : null,
                        ItemCode = item.TryGetProperty("ItemCode", out var itemCodeProp) && itemCodeProp.ValueKind == JsonValueKind.String
                            ? itemCodeProp.GetString()
                            : null,
                        AccountCode = item.TryGetProperty("AccountCode", out var accountCodeProp) && accountCodeProp.ValueKind == JsonValueKind.String
                            ? accountCodeProp.GetString()
                            : null,
                        TaxType = item.TryGetProperty("TaxType", out var taxTypeProp) && taxTypeProp.ValueKind == JsonValueKind.String
                            ? taxTypeProp.GetString()
                            : null,
                        TaxAmount = item.TryGetProperty("TaxAmount", out var taxAmountProp) && taxAmountProp.TryGetDecimal(out var taxAmount)
                            ? taxAmount
                            : null,
                        DiscountRate = item.TryGetProperty("DiscountRate", out var discountRateProp) && discountRateProp.TryGetDecimal(out var discountRate)
                            ? discountRate
                            : null,
                        DiscountAmount = item.TryGetProperty("DiscountAmount", out var discountAmountProp) && discountAmountProp.TryGetDecimal(out var discountAmount)
                            ? discountAmount
                            : null,
                    })
                    .Where(x => !string.IsNullOrWhiteSpace(x.Description) || !string.IsNullOrWhiteSpace(x.ItemCode))
                    .ToList();
            }

            return request;
        }
        catch (JsonException)
        {
            return fallback;
        }
    }

    private static void ApplyInvoiceUpdate(JobInvoice jobInvoice, CreateXeroInvoiceRequest request, object? payload, string? tenantId)
    {
        var extracted = ExtractInvoiceSummary(payload);
        jobInvoice.ExternalInvoiceId = extracted.InvoiceId ?? request.InvoiceId?.ToString();
        jobInvoice.ExternalInvoiceNumber = extracted.InvoiceNumber;
        jobInvoice.ExternalStatus = extracted.Status ?? request.Status;
        jobInvoice.Reference = extracted.Reference ?? request.Reference;
        jobInvoice.ContactName = extracted.ContactName ?? request.Contact.Name;
        jobInvoice.InvoiceDate = extracted.Date ?? request.Date;
        jobInvoice.LineAmountTypes = request.LineAmountTypes;
        jobInvoice.TenantId = tenantId;
        jobInvoice.RequestPayloadJson = JsonSerializer.Serialize(request, JsonOptions);
        jobInvoice.ResponsePayloadJson = payload is null ? null : JsonSerializer.Serialize(payload, JsonOptions);
        jobInvoice.UpdatedAt = DateTime.UtcNow;
    }

    private static ExtractedInvoiceSummary ExtractInvoiceSummary(object? payload)
    {
        if (payload is null)
            return new ExtractedInvoiceSummary();

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        if (string.IsNullOrWhiteSpace(json))
            return new ExtractedInvoiceSummary();

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return new ExtractedInvoiceSummary();

            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return new ExtractedInvoiceSummary();

            var contactName = invoice.TryGetProperty("Contact", out var contact) && contact.ValueKind == JsonValueKind.Object &&
                              contact.TryGetProperty("Name", out var nameElement)
                ? nameElement.GetString()
                : null;

            DateOnly? date = null;
            if (invoice.TryGetProperty("DateString", out var dateStringElement) && dateStringElement.ValueKind == JsonValueKind.String &&
                DateOnly.TryParse(dateStringElement.GetString(), out var parsedDateString))
            {
                date = parsedDateString;
            }
            else if (invoice.TryGetProperty("Date", out var dateElement) && dateElement.ValueKind == JsonValueKind.String &&
                     DateTime.TryParse(dateElement.GetString(), out var parsedDateTime))
            {
                date = DateOnly.FromDateTime(parsedDateTime);
            }

            return new ExtractedInvoiceSummary
            {
                InvoiceId = TryGetString(invoice, "InvoiceID"),
                InvoiceNumber = TryGetString(invoice, "InvoiceNumber"),
                Status = TryGetString(invoice, "Status"),
                Reference = TryGetString(invoice, "Reference"),
                ContactName = contactName,
                Date = date,
            };
        }
        catch (JsonException)
        {
            return new ExtractedInvoiceSummary();
        }
    }

    private static string? TryGetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String)
            return null;

        return value.GetString();
    }

    private sealed class ExtractedInvoiceSummary
    {
        public string? InvoiceId { get; init; }
        public string? InvoiceNumber { get; init; }
        public string? Status { get; init; }
        public string? Reference { get; init; }
        public string? ContactName { get; init; }
        public DateOnly? Date { get; init; }
    }
}

public sealed class JobInvoiceCreateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public bool AlreadyExists { get; private init; }
    public JobInvoice? Invoice { get; private init; }
    public object? Payload { get; private init; }
    public CreateXeroInvoiceRequest? RequestBody { get; private init; }
    public string Scope { get; private init; } = "";
    public int AccessTokenExpiresIn { get; private init; }
    public string LatestRefreshToken { get; private init; } = "";
    public bool RefreshTokenUpdated { get; private init; }

    public static JobInvoiceCreateResult Success(
        JobInvoice invoice,
        bool alreadyExists,
        object? payload = null,
        CreateXeroInvoiceRequest? requestBody = null,
        string? refreshToken = null,
        bool refreshTokenUpdated = false,
        string? scope = null,
        int expiresIn = 0) =>
        new()
        {
            Ok = true,
            StatusCode = alreadyExists ? 200 : 201,
            AlreadyExists = alreadyExists,
            Invoice = invoice,
            Payload = payload,
            RequestBody = requestBody,
            LatestRefreshToken = refreshToken ?? "",
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope ?? "",
            AccessTokenExpiresIn = expiresIn,
        };

    public static JobInvoiceCreateResult Fail(
        int statusCode,
        string error,
        object? payload = null,
        CreateXeroInvoiceRequest? requestBody = null,
        string? refreshToken = null,
        bool refreshTokenUpdated = false,
        string? scope = null,
        int expiresIn = 0) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            RequestBody = requestBody,
            LatestRefreshToken = refreshToken ?? "",
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope ?? "",
            AccessTokenExpiresIn = expiresIn,
        };
}
