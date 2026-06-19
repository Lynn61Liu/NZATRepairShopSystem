using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using QuestPDF.Infrastructure;
using MsOptions = Microsoft.Extensions.Options.Options;
using Workshop.Api.DTOs;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class CourtesyCarAgreementServiceTests
{
    static CourtesyCarAgreementServiceTests()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    [Fact]
    public void CourtesyCarAgreementAttachmentsJson_IsMappedAsJsonb()
    {
        using var context = CreateModelInspectionDb();

        var agreementProperty = context.Model
            .FindEntityType(typeof(CourtesyCarAgreement))
            ?.FindProperty(nameof(CourtesyCarAgreement.AttachmentsJson));
        var eventProperty = context.Model
            .FindEntityType(typeof(CourtesyCarAgreementEvent))
            ?.FindProperty(nameof(CourtesyCarAgreementEvent.PayloadJson));

        agreementProperty.Should().NotBeNull();
        agreementProperty!.GetColumnType().Should().Be("jsonb");

        eventProperty.Should().NotBeNull();
        eventProperty!.GetColumnType().Should().Be("jsonb");
    }

    [Fact]
    public async Task CreateDraftAsync_ReservesVehicle_AndCopiesJobSnapshot()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 11,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateServiceWithWorkingGmail(context, root);

        var result = await service.CreateDraftAsync(1001, 11, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.JobId.Should().Be(1001);
        result.Data.VehicleId.Should().Be(11);
        result.Data.JobVehiclePlate.Should().Be("ABC123");
        result.Data.JobCustomerName.Should().Be("Jane Smith");

        var vehicle = await context.CourtesyCarVehicles.FirstAsync(x => x.Id == 11);
        vehicle.Status.Should().Be("on_loan");
        vehicle.LoanedAt.Should().NotBeNull();
        vehicle.BorrowerName.Should().Be("Jane Smith");
        vehicle.BorrowerPhone.Should().Be("021 123 4567");

        var agreement = await context.CourtesyCarAgreements.FirstAsync();
        agreement.Status.Should().Be("draft");
        agreement.VehiclePlate.Should().Be("LCZ123");
    }

    [Fact]
    public async Task CreateDraftAsync_RejectsSecondAgreementForSameJob()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.AddRange(
            new CourtesyCarVehicle
            {
                Id = 11,
                Plate = "LCZ123",
                Make = "Toyota",
                Model = "Corolla",
                Status = "available",
                AgreedVehicleValue = 22000,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            },
            new CourtesyCarVehicle
            {
                Id = 12,
                Plate = "LCZ124",
                Make = "Toyota",
                Model = "Corolla",
                Status = "available",
                AgreedVehicleValue = 22000,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        context.CourtesyCarAgreements.Add(new CourtesyCarAgreement
        {
            Id = 6001,
            JobId = 1001,
            VehicleId = 11,
            CustomerId = 55,
            Status = "closed",
            CurrentStep = "closed",
            JobVehiclePlate = "ABC123",
            JobCustomerName = "Jane Smith",
            JobCustomerPhone = "021 123 4567",
            VehiclePlate = "LCZ123",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateServiceWithWorkingGmail(context, root);

        var result = await service.CreateDraftAsync(1001, 12, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.StatusCode.Should().Be(409);
        result.Error.Should().Be("This job already has a courtesy car agreement.");

        var vehicle = await context.CourtesyCarVehicles.FirstAsync(x => x.Id == 12);
        vehicle.Status.Should().Be("available");

        (await context.CourtesyCarAgreements.CountAsync(x => x.JobId == 1001)).Should().Be(1);
    }

    [Fact]
    public async Task UpdateAgreementAsync_Cancelled_ReleasesVehicle()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 11,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);
        var create = await service.CreateDraftAsync(1001, 11, CancellationToken.None);
        create.Success.Should().BeTrue();

        var update = await service.UpdateAgreementAsync(create.Data!.Id, new UpdateCourtesyCarAgreementRequest
        {
            Status = "cancelled",
        }, CancellationToken.None);

        update.Success.Should().BeTrue();

        var vehicle = await context.CourtesyCarVehicles.FirstAsync(x => x.Id == 11);
        vehicle.Status.Should().Be("available");
        vehicle.ReturnedAt.Should().NotBeNull();
        vehicle.LoanedAt.Should().BeNull();
        vehicle.BorrowerName.Should().BeNull();
        vehicle.BorrowerPhone.Should().BeNull();
    }

    [Fact]
    public async Task UploadAttachmentAsync_PersistsAttachmentAndReturnsDownloadUrl()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 11,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);
        var create = await service.CreateDraftAsync(1001, 11, CancellationToken.None);

        await using var stream = new MemoryStream([1, 2, 3, 4]);
        var file = new FormFile(stream, 0, stream.Length, "file", "license-front.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png",
        };

        var result = await service.UploadAttachmentAsync(create.Data!.Id, "license_front", file, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Data!.DownloadUrl.Should().Be($"/api/courtesy-cars/drafts/{create.Data.Id}/attachments/{result.Data.Id}");

        var agreement = await context.CourtesyCarAgreements.FirstAsync();
        agreement.AttachmentsJson.Should().Contain("license_front");
        Directory.GetFiles(Path.Combine(root, "App_Data", "courtesy-car-agreements", agreement.Id.ToString()))
            .Should().NotBeEmpty();
    }

    [Fact]
    public async Task DeleteAgreementAsync_RemovesDatabaseRowsFilesAndReleasesVehicle()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 11,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);
        var create = await service.CreateDraftAsync(1001, 11, CancellationToken.None);
        create.Success.Should().BeTrue();

        await using (var stream = new MemoryStream([1, 2, 3, 4]))
        {
            var file = new FormFile(stream, 0, stream.Length, "file", "license-front.png")
            {
                Headers = new HeaderDictionary(),
                ContentType = "image/png",
            };

            var upload = await service.UploadAttachmentAsync(create.Data!.Id, "license_front", file, CancellationToken.None);
            upload.Success.Should().BeTrue();
        }

        var agreement = await context.CourtesyCarAgreements.FirstAsync(x => x.Id == create.Data!.Id);
        var agreementDir = Path.Combine(root, "App_Data", "courtesy-car-agreements", agreement.Id.ToString());
        var pdfDir = Path.Combine(agreementDir, "pdf");
        Directory.CreateDirectory(pdfDir);
        var pdfPath = Path.Combine(pdfDir, "agreement.pdf");
        await File.WriteAllBytesAsync(pdfPath, [1, 2, 3, 4]);
        agreement.PdfFilePath = pdfPath;
        await context.SaveChangesAsync();

        var delete = await service.DeleteAgreementAsync(agreement.Id, CancellationToken.None);

        delete.Success.Should().BeTrue();
        (await context.CourtesyCarAgreements.CountAsync()).Should().Be(0);
        (await context.CourtesyCarAgreementEvents.CountAsync()).Should().Be(0);

        var vehicle = await context.CourtesyCarVehicles.FirstAsync(x => x.Id == 11);
        vehicle.Status.Should().Be("available");
        vehicle.ReturnedAt.Should().NotBeNull();
        vehicle.LoanedAt.Should().BeNull();
        vehicle.BorrowerName.Should().BeNull();
        vehicle.BorrowerPhone.Should().BeNull();

        var availableVehicles = await service.GetAvailableVehiclesAsync(CancellationToken.None);
        availableVehicles.Select(x => x.Plate).Should().Contain("LCZ123");

        Directory.Exists(agreementDir).Should().BeFalse();
    }

    [Fact]
    public async Task ReturnAgreementAsync_ClosesAgreement_AndReleasesVehicle()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 11,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);
        var create = await service.CreateDraftAsync(1001, 11, CancellationToken.None);
        create.Success.Should().BeTrue();

        var agreement = await context.CourtesyCarAgreements.FirstAsync(x => x.Id == create.Data!.Id);
        agreement.Status = "submitted";
        agreement.CurrentStep = "review";
        agreement.SubmittedAt = DateTime.UtcNow;
        agreement.EmailSentAt = DateTime.UtcNow;
        agreement.EmailTo = "demo.driver@example.com";
        await context.SaveChangesAsync();

        var returned = await service.ReturnAgreementAsync(agreement.Id, CancellationToken.None);

        returned.Success.Should().BeTrue();
        returned.Data.Should().NotBeNull();
        returned.Data!.Status.Should().Be("closed");
        returned.Data.ClosedAt.Should().NotBeNull();

        var vehicle = await context.CourtesyCarVehicles.FirstAsync(x => x.Id == 11);
        vehicle.Status.Should().Be("available");
        vehicle.ReturnedAt.Should().NotBeNull();
        vehicle.LoanedAt.Should().BeNull();
        vehicle.BorrowerName.Should().BeNull();
        vehicle.BorrowerPhone.Should().BeNull();

        var agreementAfterReturn = await context.CourtesyCarAgreements.FirstAsync(x => x.Id == create.Data!.Id);
        agreementAfterReturn.Status.Should().Be("closed");
        agreementAfterReturn.ClosedAt.Should().NotBeNull();

        var availableVehicles = await service.GetAvailableVehiclesAsync(CancellationToken.None);
        availableVehicles.Select(x => x.Plate).Should().Contain("LCZ123");
    }

    [Fact]
    public async Task SubmitAsync_WhenGmailAccountIsMissing_LeavesAgreementActiveForRetry()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 11,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);
        var create = await service.CreateDraftAsync(1001, 11, CancellationToken.None);
        create.Success.Should().BeTrue();

        var contactUpdate = await service.UpdateAgreementAsync(create.Data!.Id, new UpdateCourtesyCarAgreementRequest
        {
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactEmail = "demo.driver@example.com",
            ContactAddress = "12 Queen Street, Auckland",
            CurrentStep = "vehicle",
        }, CancellationToken.None);
        contactUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "license_front", "license-front.png");
        await UploadAttachmentAsync(service, create.Data.Id, "license_back", "license-back.png");

        var licenseUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            DriverLicenseNumber = "NZ1234567",
            DriverLicenseExpiry = new DateOnly(2029, 6, 1),
            EmergencyContactName = "Demo Emergency",
            EmergencyContactPhone = "021 999 0000",
            CurrentStep = "terms",
        }, CancellationToken.None);
        licenseUpdate.Success.Should().BeTrue();

        var termsUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            TermsConfirmed = true,
            CurrentStep = "signature",
        }, CancellationToken.None);
        termsUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "signature", "signature.png");

        var signatureUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            SignatureName = "Demo Driver",
            CurrentStep = "review",
        }, CancellationToken.None);
        signatureUpdate.Success.Should().BeTrue();

        var submitted = await service.SubmitAsync(create.Data.Id, CancellationToken.None);
        submitted.Success.Should().BeFalse();
        submitted.StatusCode.Should().Be(500);

        var agreement = await context.CourtesyCarAgreements.FirstAsync(x => x.Id == create.Data.Id);
        agreement.Status.Should().Be("active");
        agreement.CurrentStep.Should().Be("review");
        agreement.EmailSentAt.Should().BeNull();
        agreement.EmailTo.Should().BeNull();
        agreement.PdfFilePath.Should().NotBeNullOrWhiteSpace();
        agreement.PdfGeneratedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task SubmitAsync_DoesNotRequireDriverLicenseNumberOrExpiry_WhenPhotosArePresent()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 11,
            Plate = "LCZ123",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateServiceWithWorkingGmail(context, root);
        var create = await service.CreateDraftAsync(1001, 11, CancellationToken.None);
        create.Success.Should().BeTrue();

        var contactUpdate = await service.UpdateAgreementAsync(create.Data!.Id, new UpdateCourtesyCarAgreementRequest
        {
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactEmail = "demo.driver@example.com",
            ContactAddress = "12 Queen Street, Auckland",
            CurrentStep = "vehicle",
        }, CancellationToken.None);
        contactUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "license_front", "license-front.png");
        await UploadAttachmentAsync(service, create.Data.Id, "license_back", "license-back.png");

        var termsUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            TermsConfirmed = true,
            CurrentStep = "signature",
            EmergencyContactName = "Demo Emergency",
            EmergencyContactPhone = "021 999 0000",
        }, CancellationToken.None);
        termsUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "signature", "signature.png");

        var submitted = await service.SubmitAsync(create.Data.Id, CancellationToken.None);
        submitted.Success.Should().BeTrue();
        submitted.Data.Should().NotBeNull();
        submitted.Data!.Status.Should().Be("submitted");

        var agreement = await context.CourtesyCarAgreements.FirstAsync(x => x.Id == create.Data.Id);
        agreement.Status.Should().Be("submitted");
        agreement.DriverLicenseNumber.Should().BeNull();
        agreement.DriverLicenseExpiry.Should().BeNull();
        agreement.SignatureName.Should().Be("Demo Driver");
    }

    [Fact]
    public async Task SubmitAsync_FallsBackToJobCustomerEmail_WhenContactEmailIsBlank()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 12,
            Plate = "LCZ124",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateServiceWithWorkingGmail(context, root);
        var create = await service.CreateDraftAsync(1001, 12, CancellationToken.None);
        create.Success.Should().BeTrue();

        var contactUpdate = await service.UpdateAgreementAsync(create.Data!.Id, new UpdateCourtesyCarAgreementRequest
        {
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactAddress = "12 Queen Street, Auckland",
            CurrentStep = "vehicle",
        }, CancellationToken.None);
        contactUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "license_front", "license-front.png");
        await UploadAttachmentAsync(service, create.Data.Id, "license_back", "license-back.png");

        var termsUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            TermsConfirmed = true,
            CurrentStep = "signature",
            EmergencyContactName = "Demo Emergency",
            EmergencyContactPhone = "021 999 0000",
        }, CancellationToken.None);
        termsUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "signature", "signature.png");

        var signatureUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            SignatureName = "Demo Driver",
            CurrentStep = "review",
        }, CancellationToken.None);
        signatureUpdate.Success.Should().BeTrue();

        var submitted = await service.SubmitAsync(create.Data.Id, CancellationToken.None);
        submitted.Success.Should().BeTrue();
        submitted.Data.Should().NotBeNull();
        submitted.Data!.EmailTo.Should().Be("jane@example.com");
    }

    [Fact]
    public async Task SubmitAndReturnAsync_CcCompanyEmailOnBothMessages()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 15,
            Plate = "LCZ127",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var handler = new RecordingHandler();
        var service = CreateServiceWithRecordingGmail(context, root, handler);
        var create = await service.CreateDraftAsync(1001, 15, CancellationToken.None);
        create.Success.Should().BeTrue();

        var contactUpdate = await service.UpdateAgreementAsync(create.Data!.Id, new UpdateCourtesyCarAgreementRequest
        {
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactEmail = "demo.driver@example.com",
            ContactAddress = "12 Queen Street, Auckland",
            CurrentStep = "vehicle",
        }, CancellationToken.None);
        contactUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "license_front", "license-front.png");
        await UploadAttachmentAsync(service, create.Data.Id, "license_back", "license-back.png");
        await UploadAttachmentAsync(service, create.Data.Id, "signature", "signature.png");

        var termsUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            TermsConfirmed = true,
            CurrentStep = "review",
            EmergencyContactName = "Demo Emergency",
            EmergencyContactPhone = "021 999 0000",
        }, CancellationToken.None);
        termsUpdate.Success.Should().BeTrue();

        var submitted = await service.SubmitAsync(create.Data.Id, CancellationToken.None);
        submitted.Success.Should().BeTrue();

        var returned = await service.ReturnAgreementAsync(create.Data.Id, CancellationToken.None);
        returned.Success.Should().BeTrue();

        handler.SentMimeMessages.Should().HaveCount(2);
        handler.SentMimeMessages[0].Should().Contain("To: demo.driver@example.com");
        handler.SentMimeMessages[0].Should().Contain("Cc: info@nzautotech.co.nz");
        handler.SentMimeMessages[1].Should().Contain("To: demo.driver@example.com");
        handler.SentMimeMessages[1].Should().Contain("Cc: info@nzautotech.co.nz");
        handler.SentMimeMessages[1].Should().Contain("Hello Demo Driver");
    }

    [Fact]
    public async Task ValidatePreviewAsync_ReturnsErrorWhenSignatureAttachmentIsMissing()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 13,
            Plate = "LCZ125",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);
        var create = await service.CreateDraftAsync(1001, 13, CancellationToken.None);
        create.Success.Should().BeTrue();

        var contactUpdate = await service.UpdateAgreementAsync(create.Data!.Id, new UpdateCourtesyCarAgreementRequest
        {
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactEmail = "demo.driver@example.com",
            ContactAddress = "12 Queen Street, Auckland",
            CurrentStep = "vehicle",
        }, CancellationToken.None);
        contactUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "license_front", "license-front.png");
        await UploadAttachmentAsync(service, create.Data.Id, "license_back", "license-back.png");

        var termsUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            TermsConfirmed = true,
            CurrentStep = "review",
            EmergencyContactName = "Demo Emergency",
            EmergencyContactPhone = "021 999 0000",
        }, CancellationToken.None);
        termsUpdate.Success.Should().BeTrue();

        var statusBeforeValidation = (await context.CourtesyCarAgreements.FirstAsync(x => x.Id == create.Data.Id)).Status;
        var validation = await service.ValidatePreviewAsync(create.Data.Id, CancellationToken.None);
        validation.Should().NotBeNull();
        validation!.IsValid.Should().BeFalse();
        validation.Message.Should().Be("Signature image is required.");

        var agreement = await context.CourtesyCarAgreements.FirstAsync(x => x.Id == create.Data.Id);
        agreement.Status.Should().Be(statusBeforeValidation);
        agreement.PdfFilePath.Should().BeNull();
        agreement.EmailSentAt.Should().BeNull();
    }

    [Fact]
    public async Task ValidatePreviewAsync_ReturnsValidWhenAgreementIsReadyForSubmit()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJobGraph(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 14,
            Plate = "LCZ126",
            Make = "Toyota",
            Model = "Corolla",
            Status = "available",
            AgreedVehicleValue = 22000,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);
        var create = await service.CreateDraftAsync(1001, 14, CancellationToken.None);
        create.Success.Should().BeTrue();

        var contactUpdate = await service.UpdateAgreementAsync(create.Data!.Id, new UpdateCourtesyCarAgreementRequest
        {
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactEmail = "demo.driver@example.com",
            ContactAddress = "12 Queen Street, Auckland",
            CurrentStep = "vehicle",
        }, CancellationToken.None);
        contactUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, create.Data.Id, "license_front", "license-front.png");
        await UploadAttachmentAsync(service, create.Data.Id, "license_back", "license-back.png");
        await UploadAttachmentAsync(service, create.Data.Id, "signature", "signature.png");

        var termsUpdate = await service.UpdateAgreementAsync(create.Data.Id, new UpdateCourtesyCarAgreementRequest
        {
            TermsConfirmed = true,
            CurrentStep = "review",
            EmergencyContactName = "Demo Emergency",
            EmergencyContactPhone = "021 999 0000",
        }, CancellationToken.None);
        termsUpdate.Success.Should().BeTrue();

        var validation = await service.ValidatePreviewAsync(create.Data.Id, CancellationToken.None);
        validation.Should().NotBeNull();
        validation!.IsValid.Should().BeTrue();
        validation.Message.Should().BeNull();
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new AppDbContext(options);
    }

    private static AppDbContext CreateModelInspectionDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=workshop;Username=postgres;Password=unused")
            .Options;
        return new AppDbContext(options);
    }

    private static async Task UploadAttachmentAsync(CourtesyCarAgreementService service, long agreementId, string kind, string fileName)
    {
        await using var stream = new MemoryStream(SamplePngBytes);
        var file = new FormFile(stream, 0, stream.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png",
        };

        var result = await service.UploadAttachmentAsync(agreementId, kind, file, CancellationToken.None);
        result.Success.Should().BeTrue();
    }

    private static CourtesyCarAgreementService CreateService(AppDbContext db, string root)
    {
        var env = new TestWebHostEnvironment(root);
        var storage = new CourtesyCarAgreementStorageService(env);
        var gmailAccountService = new GmailAccountService(db);

        var gmailOptions = MsOptions.Create(new GmailOptions
        {
            ClientId = "client-id",
            ClientSecret = "client-secret",
            Scopes = "https://www.googleapis.com/auth/gmail.send",
        });

        var httpClientFactory = new ThrowingHttpClientFactory();
        var tokenService = new GmailTokenService(httpClientFactory, gmailOptions, gmailAccountService);
        var businessHoursService = new BusinessHoursService(MsOptions.Create(new PoFollowUpOptions()));
        var jobPoStateService = new JobPoStateService(db, businessHoursService, MsOptions.Create(new PoFollowUpOptions()));
        var gmailSender = new GmailMessageSenderService(db, httpClientFactory, gmailOptions, tokenService, jobPoStateService);
        return new CourtesyCarAgreementService(db, storage, gmailAccountService, gmailSender);
    }

    private static CourtesyCarAgreementService CreateServiceWithWorkingGmail(AppDbContext db, string root)
    {
        var env = new TestWebHostEnvironment(root);
        var storage = new CourtesyCarAgreementStorageService(env);
        SeedGmailAccount(db);
        var gmailAccountService = new GmailAccountService(db);

        var gmailOptions = MsOptions.Create(new GmailOptions
        {
            ClientId = "client-id",
            ClientSecret = "client-secret",
            Scopes = "https://www.googleapis.com/auth/gmail.send",
        });

        var httpClientFactory = new SuccessfulHttpClientFactory();
        var tokenService = new GmailTokenService(httpClientFactory, gmailOptions, gmailAccountService);
        var businessHoursService = new BusinessHoursService(MsOptions.Create(new PoFollowUpOptions()));
        var jobPoStateService = new JobPoStateService(db, businessHoursService, MsOptions.Create(new PoFollowUpOptions()));
        var gmailSender = new GmailMessageSenderService(db, httpClientFactory, gmailOptions, tokenService, jobPoStateService);
        return new CourtesyCarAgreementService(db, storage, gmailAccountService, gmailSender);
    }

    private static CourtesyCarAgreementService CreateServiceWithRecordingGmail(AppDbContext db, string root, RecordingHandler handler)
    {
        var env = new TestWebHostEnvironment(root);
        var storage = new CourtesyCarAgreementStorageService(env);
        SeedGmailAccount(db);
        var gmailAccountService = new GmailAccountService(db);

        var gmailOptions = MsOptions.Create(new GmailOptions
        {
            ClientId = "client-id",
            ClientSecret = "client-secret",
            Scopes = "https://www.googleapis.com/auth/gmail.send",
        });

        var httpClientFactory = new RecordingHttpClientFactory(handler);
        var tokenService = new GmailTokenService(httpClientFactory, gmailOptions, gmailAccountService);
        var businessHoursService = new BusinessHoursService(MsOptions.Create(new PoFollowUpOptions()));
        var jobPoStateService = new JobPoStateService(db, businessHoursService, MsOptions.Create(new PoFollowUpOptions()));
        var gmailSender = new GmailMessageSenderService(db, httpClientFactory, gmailOptions, tokenService, jobPoStateService);
        return new CourtesyCarAgreementService(db, storage, gmailAccountService, gmailSender);
    }

    private static void SeedGmailAccount(AppDbContext db)
    {
        db.GmailAccounts.Add(new GmailAccount
        {
            Id = 90001,
            Email = "workshop-demo@example.com",
            RefreshToken = "refresh-token-demo",
            AccessToken = null,
            IsActive = true,
            IsDefault = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();
    }

    private static byte[] SamplePngBytes { get; } = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO4B0n8AAAAASUVORK5CYII=");

    private static void SeedJobGraph(AppDbContext db)
    {
        db.Customers.Add(new Customer
        {
            Id = 55,
            Type = "Personal",
            Name = "Jane Smith",
            Phone = "021 123 4567",
            Email = "jane@example.com",
            Address = "42 Queen Street, Auckland",
        });
        db.Vehicles.Add(new Vehicle
        {
            Id = 77,
            Plate = "ABC123",
            Make = "Mazda",
            Model = "Axela",
            CustomerId = 55,
            UpdatedAt = DateTime.UtcNow,
        });
        db.Jobs.Add(new Job
        {
            Id = 1001,
            Status = "Draft",
            IsUrgent = false,
            CustomerId = 55,
            VehicleId = 77,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
    }

    private static string TestRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "courtesy-car-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private sealed class ThrowingHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name = "") => new(new ThrowingHandler());
    }

    private sealed class SuccessfulHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name = "") => new(new SuccessfulHandler());
    }

    private sealed class RecordingHttpClientFactory : IHttpClientFactory
    {
        private readonly RecordingHandler _handler;

        public RecordingHttpClientFactory(RecordingHandler handler)
        {
            _handler = handler;
        }

        public HttpClient CreateClient(string name = "") => new(_handler);
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromException<HttpResponseMessage>(new InvalidOperationException($"Unexpected outbound request: {request.Method} {request.RequestUri}"));
    }

    private sealed class SuccessfulHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri?.ToString() ?? "";
            if (uri.Contains("oauth2.googleapis.com/token", StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult(JsonResponse(HttpStatusCode.OK, """
                {
                  "access_token": "access-token-demo",
                  "expires_in": 3600,
                  "scope": "https://www.googleapis.com/auth/gmail.send"
                }
                """));
            }

            if (uri.Contains("/messages/send", StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult(JsonResponse(HttpStatusCode.OK, """
                {
                  "id": "sent-message-1",
                  "threadId": "thread-1",
                  "internalDate": "1718510400000"
                }
                """));
            }

            if (uri.Contains("/messages/sent-message-1", StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult(JsonResponse(HttpStatusCode.OK, """
                {
                  "payload": {
                    "headers": [
                      { "name": "Message-Id", "value": "<sent-message-1@example.com>" },
                      { "name": "References", "value": "<thread-1@example.com>" }
                    ]
                  }
                }
                """));
            }

            throw new InvalidOperationException($"Unexpected outbound request: {request.Method} {request.RequestUri}");
        }
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public List<string> SentMimeMessages { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri?.ToString() ?? "";
            if (uri.Contains("oauth2.googleapis.com/token", StringComparison.OrdinalIgnoreCase))
            {
                return JsonResponse(HttpStatusCode.OK, """
                {
                  "access_token": "access-token-demo",
                  "expires_in": 3600,
                  "scope": "https://www.googleapis.com/auth/gmail.send"
                }
                """);
            }

            if (uri.Contains("/messages/send", StringComparison.OrdinalIgnoreCase))
            {
                var payload = await request.Content!.ReadAsStringAsync(cancellationToken);
                using var doc = JsonDocument.Parse(payload);
                var raw = doc.RootElement.GetProperty("raw").GetString() ?? "";
                SentMimeMessages.Add(DecodeBase64Url(raw));
                return JsonResponse(HttpStatusCode.OK, """
                {
                  "id": "sent-message-1",
                  "threadId": "thread-1",
                  "internalDate": "1718510400000"
                }
                """);
            }

            if (uri.Contains("/messages/sent-message-1", StringComparison.OrdinalIgnoreCase))
            {
                return JsonResponse(HttpStatusCode.OK, """
                {
                  "payload": {
                    "headers": [
                      { "name": "Message-Id", "value": "<sent-message-1@example.com>" },
                      { "name": "References", "value": "<thread-1@example.com>" }
                    ]
                  }
                }
                """);
            }

            throw new InvalidOperationException($"Unexpected outbound request: {request.Method} {request.RequestUri}");
        }

        private static string DecodeBase64Url(string raw)
        {
            var normalized = raw.Replace('-', '+').Replace('_', '/');
            var padding = normalized.Length % 4;
            if (padding == 2)
                normalized += "==";
            else if (padding == 3)
                normalized += "=";

            return Encoding.UTF8.GetString(Convert.FromBase64String(normalized));
        }
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode statusCode, string content) =>
        new(statusCode)
        {
            Content = new StringContent(content, System.Text.Encoding.UTF8, "application/json"),
        };

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public TestWebHostEnvironment(string contentRootPath)
        {
            ContentRootPath = contentRootPath;
            ContentRootFileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(contentRootPath);
        }

        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Workshop.Api.Tests";
        public string WebRootPath { get; set; } = string.Empty;
        public Microsoft.Extensions.FileProviders.IFileProvider WebRootFileProvider { get; set; } = null!;
        public string ContentRootPath { get; set; }
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; }
    }
}
