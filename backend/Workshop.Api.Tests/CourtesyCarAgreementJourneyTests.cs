using System.Net;
using System.Net.Http;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using QuestPDF.Infrastructure;
using MsOptions = Microsoft.Extensions.Options.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class CourtesyCarAgreementJourneyTests
{
    static CourtesyCarAgreementJourneyTests()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    [Fact]
    public async Task FullJourney_WalksFromDraftToClosedWithMockVehicle()
    {
        await using var context = CreateDb();
        var root = TestRoot();
        SeedJourneyGraph(context);
        SeedGmailAccount(context);
        context.CourtesyCarVehicles.Add(new CourtesyCarVehicle
        {
            Id = 9001,
            Plate = "DEMO123",
            Make = "Toyota",
            Model = "Corolla",
            Color = "Silver",
            Year = 2021,
            Mileage = 48210,
            FuelLevel = "3/4 tank",
            AgreedVehicleValue = 22000,
            Status = "available",
            WofExpiry = new DateOnly(2026, 7, 10),
            RegoExpiry = new DateOnly(2026, 7, 6),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var service = CreateService(context, root);

        var created = await service.CreateDraftAsync(3001, 9001, CancellationToken.None);
        created.Success.Should().BeTrue();
        created.Data.Should().NotBeNull();

        var contactUpdate = await service.UpdateAgreementAsync(created.Data!.Id, new Workshop.Api.DTOs.UpdateCourtesyCarAgreementRequest
        {
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactEmail = "demo.driver@example.com",
            ContactAddress = "12 Queen Street, Auckland",
            CurrentStep = "vehicle",
        }, CancellationToken.None);
        contactUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, created.Data.Id, "license_front", "license-front.png");
        await UploadAttachmentAsync(service, created.Data.Id, "license_back", "license-back.png");

        var licenseUpdate = await service.UpdateAgreementAsync(created.Data.Id, new Workshop.Api.DTOs.UpdateCourtesyCarAgreementRequest
        {
            DriverLicenseNumber = "NZ1234567",
            DriverLicenseExpiry = new DateOnly(2029, 6, 1),
            EmergencyContactName = "Demo Emergency",
            EmergencyContactPhone = "021 999 0000",
            CurrentStep = "terms",
        }, CancellationToken.None);
        licenseUpdate.Success.Should().BeTrue();

        var termsUpdate = await service.UpdateAgreementAsync(created.Data.Id, new Workshop.Api.DTOs.UpdateCourtesyCarAgreementRequest
        {
            TermsConfirmed = true,
            CurrentStep = "signature",
        }, CancellationToken.None);
        termsUpdate.Success.Should().BeTrue();

        await UploadAttachmentAsync(service, created.Data.Id, "signature", "signature.png");

        var signatureUpdate = await service.UpdateAgreementAsync(created.Data.Id, new Workshop.Api.DTOs.UpdateCourtesyCarAgreementRequest
        {
            SignatureName = "Demo Driver",
            CurrentStep = "review",
        }, CancellationToken.None);
        signatureUpdate.Success.Should().BeTrue();

        var submitted = await service.SubmitAsync(created.Data.Id, CancellationToken.None);
        submitted.Success.Should().BeTrue();
        submitted.Data.Should().NotBeNull();
        submitted.Data!.Status.Should().Be("submitted");
        submitted.Data.PdfUrl.Should().Be($"/api/courtesy-cars/drafts/{created.Data.Id}/pdf");
        submitted.Data.EmailSentAt.Should().NotBeNull();
        submitted.Data.PdfGeneratedAt.Should().NotBeNull();
        submitted.Data.EmailTo.Should().Be("demo.driver@example.com");

        var vehicle = await context.CourtesyCarVehicles.FirstAsync(x => x.Id == 9001);
        vehicle.Status.Should().Be("on_loan");

        var agreement = await context.CourtesyCarAgreements.FirstAsync(x => x.Id == created.Data.Id);
        agreement.ContactName.Should().Be("Demo Driver");
        agreement.DriverLicenseNumber.Should().Be("NZ1234567");
        agreement.TermsConfirmed.Should().BeTrue();
        agreement.SignatureName.Should().Be("Demo Driver");
        agreement.Status.Should().Be("submitted");
        agreement.PdfGeneratedAt.Should().NotBeNull();
        agreement.EmailSentAt.Should().NotBeNull();
        agreement.EmailTo.Should().Be("demo.driver@example.com");
        agreement.PdfFilePath.Should().NotBeNullOrWhiteSpace();
        File.Exists(agreement.PdfFilePath!).Should().BeTrue();
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

    private static byte[] SamplePngBytes { get; } = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO4B0n8AAAAASUVORK5CYII=");

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new AppDbContext(options);
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

        var httpClientFactory = new JourneyHttpClientFactory();
        var tokenService = new GmailTokenService(httpClientFactory, gmailOptions, gmailAccountService);
        var businessHoursService = new BusinessHoursService(MsOptions.Create(new PoFollowUpOptions()));
        var jobPoStateService = new JobPoStateService(db, businessHoursService, MsOptions.Create(new PoFollowUpOptions()));
        var gmailSender = new GmailMessageSenderService(db, httpClientFactory, gmailOptions, tokenService, jobPoStateService);
        return new CourtesyCarAgreementService(db, storage, gmailAccountService, gmailSender);
    }

    private static void SeedJourneyGraph(AppDbContext db)
    {
        db.Customers.Add(new Customer
        {
            Id = 30001,
            Type = "Personal",
            Name = "Demo Driver",
            Phone = "021 555 8888",
            Email = "demo.driver@example.com",
            Address = "12 Queen Street, Auckland",
        });

        db.Vehicles.Add(new Vehicle
        {
            Id = 30002,
            Plate = "DEMO999",
            Make = "Mazda",
            Model = "Axela",
            CustomerId = 30001,
            UpdatedAt = DateTime.UtcNow,
        });

        db.Jobs.Add(new Job
        {
            Id = 3001,
            Status = "Draft",
            IsUrgent = false,
            CustomerId = 30001,
            VehicleId = 30002,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
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
    }

    private static string TestRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "courtesy-car-journey-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private sealed class JourneyHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name = "") => new(new JourneyHandler());
    }

    private sealed class JourneyHandler : HttpMessageHandler
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
                  "id": "msg-demo-1",
                  "threadId": "thread-demo-1",
                  "internalDate": "1710000000000"
                }
                """));
            }

            if (uri.Contains("/messages/msg-demo-1", StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult(JsonResponse(HttpStatusCode.OK, """
                {
                  "payload": {
                    "headers": [
                      { "name": "Message-Id", "value": "<msg-demo-1@example.com>" },
                      { "name": "References", "value": "<seed@example.com>" }
                    ]
                  }
                }
                """));
            }

            return Task.FromResult(JsonResponse(HttpStatusCode.NotFound, "{\"error\":\"unexpected request\"}"));
        }

        private static HttpResponseMessage JsonResponse(HttpStatusCode statusCode, string payload) =>
            new(statusCode)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
    }

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
