using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Workshop.Api.Printing;

public sealed record CourtesyCarAgreementPrintAttachment(
    string Kind,
    string Name,
    string MimeType,
    byte[]? Bytes);

public sealed record CourtesyCarAgreementPrintModel(
    long AgreementId,
    long JobId,
    string? JobVehiclePlate,
    string? JobCustomerName,
    string? JobCustomerPhone,
    string? JobCustomerEmail,
    string? JobCustomerAddress,
    string Status,
    string CurrentStep,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? ContactAddress,
    string? DriverLicenseNumber,
    DateOnly? DriverLicenseExpiry,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    bool TermsConfirmed,
    string? SignatureName,
    string? VehiclePlate,
    string? VehicleMake,
    string? VehicleModel,
    string? VehicleColor,
    int? VehicleYear,
    int? VehicleMileage,
    string? VehicleFuelLevel,
    decimal AgreedVehicleValue,
    DateOnly? VehicleWofExpiry,
    DateOnly? VehicleRegoExpiry,
    IReadOnlyList<CourtesyCarAgreementPrintAttachment> Attachments,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? SubmittedAt,
    DateTime? ClosedAt,
    DateTime? CancelledAt);

public sealed class CourtesyCarAgreementDocument : IDocument
{
    private static readonly CultureInfo NzCulture = CultureInfo.GetCultureInfo("en-NZ");
    private readonly CourtesyCarAgreementPrintModel _model;

    public CourtesyCarAgreementDocument(CourtesyCarAgreementPrintModel model)
    {
        _model = model;
    }

    public DocumentMetadata GetMetadata() => DocumentMetadata.Default;

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(24);
            page.DefaultTextStyle(TextStyle.Default.FontSize(10).FontColor(Colors.Grey.Darken4));

            page.Content().Column(column =>
            {
                column.Spacing(14);
                column.Item().Element(RenderHeader);
                column.Item().Element(RenderSummarySection);
                column.Item().Element(RenderBorrowerSection);
                column.Item().Element(RenderVehicleSection);
                column.Item().Element(RenderTermsSection);
                column.Item().Element(RenderSignatureSection);
                column.Item().Element(RenderAppendixSection);
            });
        });
    }

    private void RenderHeader(IContainer container)
    {
        container.Column(column =>
        {
            column.Spacing(4);
            column.Item().AlignCenter().Text("NZ AUTO TECH").FontSize(22).SemiBold();
            column.Item().AlignCenter().Text("Courtesy Vehicle Loan Agreement").FontSize(15).Bold();
            column.Item().AlignCenter().Text("English version only").FontSize(9).FontColor(Colors.Grey.Darken1);
            column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten3);
        });
    }

    private void RenderSummarySection(IContainer container)
    {
        Section(container, "Agreement Summary", content =>
        {
            RenderFactGrid(content, new[]
            {
                ("Agreement Date", FormatDateTime(_model.CreatedAt)),
                ("Agreement Number", $"AG-{_model.AgreementId}"),
                ("Job Number", $"JOB-{_model.JobId}"),
                ("Job Plate", ValueOrDash(_model.JobVehiclePlate)),
                ("Courtesy Vehicle", BuildVehicleLabel()),
                ("Agreed Vehicle Value", FormatMoney(_model.AgreedVehicleValue)),
                ("WOF Expiry", FormatDate(_model.VehicleWofExpiry)),
                ("Rego Expiry", FormatDate(_model.VehicleRegoExpiry)),
                ("Mileage", _model.VehicleMileage is { } mileage ? $"{mileage.ToString("N0", NzCulture)} km" : "—"),
                ("Fuel Level", ValueOrDash(_model.VehicleFuelLevel)),
            });
        });
    }

    private void RenderBorrowerSection(IContainer container)
    {
        Section(container, "Borrower Details", content =>
        {
            RenderFactGrid(content, new[]
            {
                ("Full Name", ValueOrDash(_model.ContactName ?? _model.JobCustomerName)),
                ("Phone", ValueOrDash(_model.ContactPhone ?? _model.JobCustomerPhone)),
                ("Email", ValueOrDash(_model.ContactEmail ?? _model.JobCustomerEmail)),
                ("Address", ValueOrDash(_model.ContactAddress ?? _model.JobCustomerAddress)),
                ("Driver Licence Number", ValueOrDash(_model.DriverLicenseNumber)),
                ("Driver Licence Expiry", FormatDate(_model.DriverLicenseExpiry)),
                ("Emergency Contact", ValueOrDash(_model.EmergencyContactName)),
                ("Emergency Phone", ValueOrDash(_model.EmergencyContactPhone)),
                ("Terms Confirmed", _model.TermsConfirmed ? "Yes" : "No"),
                ("Signature Name", ValueOrDash(_model.SignatureName)),
            });
        });
    }

    private void RenderVehicleSection(IContainer container)
    {
        Section(container, "Vehicle Details", content =>
        {
            RenderFactGrid(content, new[]
            {
                ("Plate", ValueOrDash(_model.VehiclePlate)),
                ("Make / Model", BuildVehicleLabel()),
                ("Colour", ValueOrDash(_model.VehicleColor)),
                ("Year", _model.VehicleYear is { } year ? year.ToString(NzCulture) : "—"),
                ("Mileage", _model.VehicleMileage is { } mileage ? $"{mileage.ToString("N0", NzCulture)} km" : "—"),
                ("Fuel Level", ValueOrDash(_model.VehicleFuelLevel)),
                ("Submitted At", _model.SubmittedAt is null ? "—" : FormatDateTime(_model.SubmittedAt.Value)),
                ("Closed At", _model.ClosedAt is null ? "—" : FormatDateTime(_model.ClosedAt.Value)),
                ("Cancelled At", _model.CancelledAt is null ? "—" : FormatDateTime(_model.CancelledAt.Value)),
            });
        });
    }

    private void RenderTermsSection(IContainer container)
    {
        Section(container, "Agreed Terms", content =>
        {
            content.Column(column =>
            {
                column.Spacing(7);
                column.Item().Text("The borrower acknowledges and agrees to the following mandatory terms:").FontSize(9.5f).FontColor(Colors.Grey.Darken2);
                foreach (var term in MandatoryTerms)
                {
                    column.Item().Row(row =>
                    {
                        row.ConstantItem(14).Text("✓").FontSize(11f).SemiBold().FontColor(Colors.Green.Medium);
                        row.RelativeItem().Text(term).FontSize(9.5f).LineHeight(1.35f);
                    });
                }
            });
        });
    }

    private void RenderSignatureSection(IContainer container)
    {
        Section(container, "Borrower Signature", content =>
        {
            var signatureAttachment = FindAttachment("signature");
            content.Column(column =>
            {
                column.Spacing(10);
                column.Item().Text($"{ValueOrDash(_model.SignatureName ?? _model.ContactName ?? _model.JobCustomerName)} confirms that they have read and agree to all terms for vehicle {ValueOrDash(_model.VehiclePlate)}.")
                    .FontSize(10.5f)
                    .SemiBold();
                column.Item().Text("By signing, the borrower accepts this courtesy vehicle loan agreement in full.")
                    .FontSize(9.5f)
                    .FontColor(Colors.Grey.Darken2);

                column.Item().Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten5).Padding(12).Column(signatureBox =>
                {
                    if (signatureAttachment is { Bytes: { Length: > 0 } })
                    {
                        signatureBox.Item().Height(95).Image(signatureAttachment.Bytes).FitArea();
                    }
                    else
                    {
                        signatureBox.Item().Height(95).AlignMiddle().AlignCenter().Text("Signature preview not available").FontColor(Colors.Grey.Medium);
                    }
                });

                column.Item().Element(inner =>
                {
                    RenderFactGrid(inner, new[]
                    {
                        ("Signed By", ValueOrDash(_model.SignatureName ?? _model.ContactName ?? _model.JobCustomerName)),
                        ("Signed At", _model.UpdatedAt == default ? "—" : FormatDateTime(_model.UpdatedAt)),
                    });
                });
            });
        });
    }

    private void RenderAppendixSection(IContainer container)
    {
        var imageAttachments = _model.Attachments
            .Where(x => x.Bytes is { Length: > 0 } &&
                        x.MimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(x.Kind, "signature", StringComparison.OrdinalIgnoreCase))
            .Take(4)
            .ToList();

        if (imageAttachments.Count == 0)
            return;

        Section(container, "Supporting Documents", content =>
        {
            content.Column(column =>
            {
                column.Spacing(8);
                column.Item().Text("Uploaded documents are retained with the agreement record.").FontSize(9.5f).FontColor(Colors.Grey.Darken2);
                column.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn();
                        columns.RelativeColumn();
                    });

                    for (var index = 0; index < imageAttachments.Count; index += 2)
                    {
                        var left = imageAttachments[index];
                        var right = index + 1 < imageAttachments.Count ? imageAttachments[index + 1] : null;

                        table.Cell().Border(1).BorderColor(Colors.Grey.Lighten2).Padding(8).Column(cell =>
                        {
                            cell.Spacing(4);
                            cell.Item().Text(left.Name).SemiBold().FontSize(9.5f);
                            cell.Item().Text(left.Kind).FontSize(8.5f).FontColor(Colors.Grey.Darken1);
                            cell.Item().Height(92).Image(left.Bytes!).FitArea();
                        });

                        if (right is not null)
                        {
                            table.Cell().Border(1).BorderColor(Colors.Grey.Lighten2).Padding(8).Column(cell =>
                            {
                                cell.Spacing(4);
                                cell.Item().Text(right.Name).SemiBold().FontSize(9.5f);
                                cell.Item().Text(right.Kind).FontSize(8.5f).FontColor(Colors.Grey.Darken1);
                                cell.Item().Height(92).Image(right.Bytes!).FitArea();
                            });
                        }
                        else
                        {
                            table.Cell().Border(1).BorderColor(Colors.Grey.Lighten2).Padding(8).Text(" ");
                        }
                    }
                });
            });
        });
    }

    private static void Section(IContainer container, string title, Action<IContainer> content)
    {
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Padding(10).Column(column =>
        {
            column.Item().Text(title).FontSize(12f).SemiBold();
            column.Item().LineHorizontal(1).LineColor(Colors.Grey.Lighten3);
            column.Item().PaddingTop(8).Element(content);
        });
    }

    private static void RenderFactGrid(IContainer container, IReadOnlyList<(string Label, string Value)> items)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn();
                columns.RelativeColumn();
            });

            for (var index = 0; index < items.Count; index += 2)
            {
                var left = items[index];
                var right = index + 1 < items.Count ? items[index + 1] : default;

                table.Cell().PaddingVertical(3).Element(cell => RenderFact(cell, left.Label, left.Value));

                if (index + 1 < items.Count)
                    table.Cell().PaddingVertical(3).Element(cell => RenderFact(cell, right.Label, right.Value));
                else
                    table.Cell().PaddingVertical(3).Text(" ");
            }
        });
    }

    private static void RenderFact(IContainer container, string label, string value)
    {
        container.Column(column =>
        {
            column.Spacing(1);
            column.Item().Text(label).FontSize(8.5f).FontColor(Colors.Grey.Darken1).SemiBold();
            column.Item().Text(value).FontSize(10.5f).SemiBold();
        });
    }

    private CourtesyCarAgreementPrintAttachment? FindAttachment(string kind) =>
        _model.Attachments.FirstOrDefault(x => string.Equals(x.Kind, kind, StringComparison.OrdinalIgnoreCase));

    private string BuildVehicleLabel()
    {
        var vehicleBits = new[]
        {
            _model.VehiclePlate,
            string.Join(" ", new[] { _model.VehicleYear?.ToString(NzCulture), _model.VehicleMake, _model.VehicleModel }.Where(x => !string.IsNullOrWhiteSpace(x))),
        }.Where(x => !string.IsNullOrWhiteSpace(x));

        var label = string.Join(" · ", vehicleBits);
        return string.IsNullOrWhiteSpace(label) ? "—" : label;
    }

    private static string FormatDate(DateOnly? value) =>
        value is null ? "—" : value.Value.ToString("dd MMM yyyy", NzCulture);

    private static string FormatDateTime(DateTime value)
    {
        var nzTime = ConvertToAucklandTime(value);
        return nzTime.ToString("dd MMM yyyy, HH:mm", NzCulture);
    }

    private static DateTime ConvertToAucklandTime(DateTime value)
    {
        var utcValue = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };

        try
        {
            return TimeZoneInfo.ConvertTimeFromUtc(utcValue, GetAucklandTimeZone());
        }
        catch
        {
            return utcValue.ToLocalTime();
        }
    }

    private static TimeZoneInfo GetAucklandTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("New Zealand Standard Time");
            }
            catch
            {
                return TimeZoneInfo.Local;
            }
        }
    }

    private static string FormatMoney(decimal value) =>
        $"NZ${value.ToString("N0", NzCulture)}";

    private static string ValueOrDash(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "—" : value.Trim();

    private static readonly string[] MandatoryTerms =
    {
        "I confirm that I am the authorised driver named in this agreement and that I hold a current and valid driver licence for the courtesy vehicle.",
        "I confirm that I have checked the courtesy vehicle details, including the rego, WOF expiry, registration expiry, odometer, fuel level, keys released, and Agreed Vehicle Value of NZ$[Agreed Vehicle Value].",
        "I understand that NZ AUTO TECH does not provide insurance cover for my benefit.",
        "I understand that I may arrange my own insurance before using the courtesy vehicle.",
        "I accept responsibility for damage, accident, theft, loss, fines, tolls, third-party claims, insurance recovery action, legal consequences, and costs arising while the courtesy vehicle is in my possession or control, except where NZ AUTO TECH is legally responsible and that responsibility cannot be excluded.",
        "I understand that if the courtesy vehicle is stolen, lost, written off, seized, impounded, or damaged beyond economical repair while in my possession or control, I may be required to pay NZ AUTO TECH the reasonable market value of the vehicle, up to the Agreed Vehicle Value stated in this agreement.",
        "I understand that, as between me and NZ AUTO TECH, I am responsible for third-party property damage, claims, insurance recovery action, fines, tolls, legal liability, and costs arising from my possession, control, driving, parking, storage, or use of the courtesy vehicle, except where NZ AUTO TECH is legally responsible and that responsibility cannot be excluded.",
        "I understand that the courtesy vehicle must not be taken outside the Auckland Region without NZ AUTO TECH’s prior written approval.",
        "I understand that NZ AUTO TECH’s roadside assistance, towing, recovery support, and repair arrangement for the courtesy vehicle are limited to the Auckland Region.",
        "I understand that the courtesy vehicle is provided without a daily usage charge only if my vehicle repair, service, or assessment proceeds with NZ AUTO TECH.",
        "If I cancel, decline the quote, remove my vehicle, or do not proceed with the repair, service, or assessment through NZ AUTO TECH, I agree to pay NZ$20.00 including GST per calendar day or part day from Date Out until the courtesy vehicle is returned to and accepted by NZ AUTO TECH.",
        "I understand that driver licence photos are collected for identity verification, driver confirmation, fines, tolls, accident, insurance, debt recovery, and legal compliance purposes only.",
        "I agree that NZ AUTO TECH may email the signed agreement and return confirmation to the email address I have provided.",
        "I confirm that I have read and understood the English version of this agreement. I understand the Chinese translation is provided for convenience only and the English version will prevail if there is any inconsistency.",
    };
}
