using System.Globalization;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Printing;

namespace Workshop.Api.Services;

public class WofPrintService
{
    private readonly AppDbContext _db;

    public WofPrintService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<WofPrintPdfResult> BuildPrintPdf(long jobId, long recordId, CancellationToken ct)
    {
        var data = await (
                from w in _db.JobWofRecords.AsNoTracking()
                join j in _db.Jobs.AsNoTracking() on w.JobId equals j.Id
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id into vj
                from v in vj.DefaultIfEmpty()
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id into cj
                from c in cj.DefaultIfEmpty()
                where w.Id == recordId && j.Id == jobId
                select new { w, j, v, c }
            )
            .FirstOrDefaultAsync(ct);

        if (data is null)
            return WofPrintPdfResult.NotFound("WOF record not found.");

        var model = BuildModel(data.w, data.j, data.v, data.c);
        var document = new WofPrintDocument(model);
        var pdfBytes = document.GeneratePdf();
        var fileName = $"wof-{recordId}.pdf";

        return WofPrintPdfResult.Ok(pdfBytes, fileName);
    }

    private static WofPrintModel BuildModel(JobWofRecord record, Job job, Vehicle? vehicle, Customer? customer)
    {
        var makeModel = record.MakeModel;
        if (string.IsNullOrWhiteSpace(makeModel))
        {
            var make = vehicle?.Make?.Trim();
            var model = vehicle?.Model?.Trim();
            makeModel = string.Join(" ", new[] { make, model }.Where(x => !string.IsNullOrWhiteSpace(x)));
        }

        var odo = record.Odo;
        if (string.IsNullOrWhiteSpace(odo) && vehicle?.Odometer is not null)
            odo = vehicle.Odometer.Value.ToString(CultureInfo.InvariantCulture);

        var modelValue = new WofPrintModel
        {
            JobId = job.Id,
            RecordId = record.Id,
            PrintState = MapPrintState(record.RecordState),
            RecordStateLabel = ToRecordStateLabel(record.RecordState),
            Rego = record.Rego ?? "",
            MakeModel = makeModel ?? "",
            OdoText = odo ?? "",
            OrganisationName = record.OrganisationName ?? "",
            CustomerName = customer?.Name ?? "",
            CustomerPhone = customer?.Phone ?? "",
            CustomerEmail = customer?.Email ?? "",
            CustomerAddress = customer?.Address ?? "",
            InspectionDate = FormatDate(record.OccurredAt),
            InspectionNumber = record.Id.ToString(CultureInfo.InvariantCulture),
            RecheckDate = FormatDate(record.PreviousExpiryDate),
            RecheckNumber = record.Id.ToString(CultureInfo.InvariantCulture),
            IsNewWof = record.IsNewWof ?? false,
            NewWofDate = FormatDate(record.NewWofDate),
            AuthCode = record.AuthCode ?? "",
            CheckSheet = record.CheckSheet ?? "",
            CsNo = record.CsNo ?? "",
            WofLabel = record.WofLabel ?? "",
            LabelNo = record.LabelNo ?? "",
            MsNumber = "",
            FailReasons = record.FailReasons ?? "",
            PreviousExpiryDate = FormatDate(record.PreviousExpiryDate),
            FailRecheckDate = FormatDate(record.PreviousExpiryDate),
            Note = record.Note ?? ""
        };

        return modelValue;
    }

    private static WofPrintState MapPrintState(WofRecordState state) => state switch
    {
        WofRecordState.Fail => WofPrintState.Failed,
        WofRecordState.Recheck => WofPrintState.Recheck,
        _ => WofPrintState.Passed
    };

    private static string ToRecordStateLabel(WofRecordState state) => state switch
    {
        WofRecordState.Fail => "Fail",
        WofRecordState.Recheck => "Recheck",
        _ => "Pass"
    };

    private static string FormatDate(DateOnly? date)
        => date.HasValue ? date.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "";

    private static string FormatDate(DateTime dateTime)
        => dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}

public record WofPrintPdfResult(int StatusCode, byte[]? PdfBytes, string? FileName, string? Error)
{
    public static WofPrintPdfResult Ok(byte[] pdfBytes, string fileName) => new(200, pdfBytes, fileName, null);
    public static WofPrintPdfResult NotFound(string error) => new(404, null, null, error);
}
