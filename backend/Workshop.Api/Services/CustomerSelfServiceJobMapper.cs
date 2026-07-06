using Workshop.Api.DTOs;

namespace Workshop.Api.Services;

public static class CustomerSelfServiceJobMapper
{
    public static IReadOnlyList<string> Validate(CustomerSelfServiceJobRequest? req)
    {
        if (req is null)
            return ["Request body is required."];

        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(NormalizePlate(req.Plate)))
            errors.Add("Plate is required.");
        if (req.Name.Trim().Length < 2)
            errors.Add("Name must be at least 2 characters.");
        if (CountDigits(req.Phone) < 7)
            errors.Add("Phone must contain at least 7 digits.");

        if (req.HasWof && string.IsNullOrWhiteSpace(req.Address))
        {
            if (string.IsNullOrWhiteSpace(req.Street))
                errors.Add("Street is required for WOF jobs.");
            if (string.IsNullOrWhiteSpace(req.Suburb))
                errors.Add("Suburb is required for WOF jobs.");
            if (string.IsNullOrWhiteSpace(req.City))
                errors.Add("City is required for WOF jobs.");
        }

        return errors;
    }

    public static NewJobRequest MapToNewJobRequest(CustomerSelfServiceJobRequest req, long rootServiceCatalogItemId)
    {
        var address = BuildAddress(req);
        var notes = BuildNotes(req.Notes, req.HasWof);
        var serviceType = req.HasWof ? "wof" : "mech";

        return new NewJobRequest
        {
            Plate = NormalizePlate(req.Plate),
            CreateNewInvoice = true,
            UseServiceCatalogMapping = true,
            Services = [serviceType],
            RootServiceCatalogItemIds = [rootServiceCatalogItemId],
            Notes = notes,
            Customer = new NewJobRequest.CustomerInput
            {
                ExistingCustomerId = req.CustomerEdited ? null : req.ExistingCustomerId,
                Type = "Personal",
                Name = req.Name.Trim(),
                Phone = NullIfBlank(req.Phone),
                Email = NullIfBlank(req.QuoteEmail) ?? NullIfBlank(req.Email),
                Address = string.IsNullOrWhiteSpace(address) ? null : address,
                Notes = NormalizePlate(req.Plate),
            },
        };
    }

    public static string BuildAddress(CustomerSelfServiceJobRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.Address))
            return req.Address.Trim();

        return string.Join(
            ", ",
            new[] { req.Street, req.Suburb, req.City }
                .Select(x => x?.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x)));
    }

    private static string BuildNotes(string? customerNotes, bool hasWof)
    {
        var lines = new List<string>();
        if (hasWof)
        {
            lines.Add("WOF");
        }
        var trimmedNotes = customerNotes?.Trim();
        if (!string.IsNullOrWhiteSpace(trimmedNotes))
            lines.Add(trimmedNotes);
        return string.Join('\n', lines);
    }

    private static string NormalizePlate(string? plate)
        => new((plate ?? "").Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private static int CountDigits(string? value)
        => (value ?? "").Count(char.IsDigit);

    private static string? NullIfBlank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
