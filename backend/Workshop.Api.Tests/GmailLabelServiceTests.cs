using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class GmailLabelServiceTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task AddInvoicedLabelAsync_LabelsThread_WhenThreadIdExists()
    {
        await using var db = CreateDb();
        db.GmailAccounts.Add(CreateAccount());
        await db.SaveChangesAsync();

        var handler = new GmailLabelHandler("https://www.googleapis.com/auth/gmail.modify");
        var service = CreateService(db, new TestHttpClientFactory(handler));

        var result = await service.AddInvoicedLabelAsync(1, "thread-123", "message-456", CancellationToken.None);

        result.Ok.Should().BeTrue();
        result.StatusCode.Should().Be(200);
        result.LabelId.Should().Be("Label_42");
        handler.ModifyRequestUri.Should().Be("https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-123/modify");
        handler.ModifyRequestBody.Should().Contain("\"addLabelIds\":[\"Label_42\"]");
        handler.ModifyRequestAuthorization.Should().Be("Bearer access-token");
    }

    [Fact]
    public async Task AddInvoicedLabelAsync_FailsClearly_WhenModifyScopeIsMissing()
    {
        await using var db = CreateDb();
        db.GmailAccounts.Add(CreateAccount());
        await db.SaveChangesAsync();

        var handler = new GmailLabelHandler("https://www.googleapis.com/auth/gmail.send");
        var service = CreateService(db, new TestHttpClientFactory(handler));

        var result = await service.AddInvoicedLabelAsync(1, "thread-123", null, CancellationToken.None);

        result.Ok.Should().BeFalse();
        result.StatusCode.Should().Be(403);
        result.Error.Should().Contain("https://www.googleapis.com/auth/gmail.modify");
        handler.LabelsRequested.Should().BeFalse();
        handler.ModifyRequested.Should().BeFalse();
    }

    [Fact]
    public async Task AddInvoicedLabelAsync_UsesStoredScope_WhenRefreshOmitsScope()
    {
        await using var db = CreateDb();
        db.GmailAccounts.Add(CreateAccount(scope: "https://www.googleapis.com/auth/gmail.modify"));
        await db.SaveChangesAsync();

        var handler = new GmailLabelHandler(scope: null);
        var service = CreateService(db, new TestHttpClientFactory(handler));

        var result = await service.AddInvoicedLabelAsync(1, "thread-123", null, CancellationToken.None);

        result.Ok.Should().BeTrue();
        result.LabelId.Should().Be("Label_42");
        handler.ModifyRequestUri.Should().Be("https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-123/modify");
    }

    [Fact]
    public async Task AddInvoicedLabelAsync_LabelsMessage_WhenThreadIdIsBlank()
    {
        await using var db = CreateDb();
        db.GmailAccounts.Add(CreateAccount());
        await db.SaveChangesAsync();

        var handler = new GmailLabelHandler("https://www.googleapis.com/auth/gmail.modify");
        var service = CreateService(db, new TestHttpClientFactory(handler));

        var result = await service.AddInvoicedLabelAsync(1, "   ", "message-456", CancellationToken.None);

        result.Ok.Should().BeTrue();
        result.LabelId.Should().Be("Label_42");
        handler.ModifyRequestUri.Should().Be("https://gmail.googleapis.com/gmail/v1/users/me/messages/message-456/modify");
        handler.ModifyRequestBody.Should().Contain("\"addLabelIds\":[\"Label_42\"]");
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static GmailLabelService CreateService(AppDbContext db, IHttpClientFactory httpClientFactory)
    {
        var gmailOptions = Microsoft.Extensions.Options.Options.Create(new GmailOptions
        {
            ClientId = "client-id",
            ClientSecret = "client-secret",
        });

        var accountService = new GmailAccountService(db);
        var tokenService = new GmailTokenService(httpClientFactory, gmailOptions, accountService);
        return new GmailLabelService(httpClientFactory, tokenService, accountService);
    }

    private static GmailAccount CreateAccount(string? scope = "https://www.googleapis.com/auth/gmail.modify") =>
        new()
        {
            Id = 1,
            Email = "team@example.com",
            RefreshToken = "refresh-token",
            Scope = scope,
            IsActive = true,
            IsDefault = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        private readonly HttpMessageHandler _handler;

        public TestHttpClientFactory(HttpMessageHandler handler)
        {
            _handler = handler;
        }

        public HttpClient CreateClient(string name = "") => new(_handler);
    }

    private sealed class GmailLabelHandler : HttpMessageHandler
    {
        private readonly string? _scope;

        public GmailLabelHandler(string? scope)
        {
            _scope = scope;
        }

        public bool LabelsRequested { get; private set; }
        public bool ModifyRequested { get; private set; }
        public string? ModifyRequestUri { get; private set; }
        public string? ModifyRequestBody { get; private set; }
        public string? ModifyRequestAuthorization { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri?.AbsoluteUri ?? "";

            if (request.Method == HttpMethod.Post && uri.Contains("oauth2.googleapis.com/token", StringComparison.OrdinalIgnoreCase))
            {
                var tokenResponse = new Dictionary<string, object?>
                {
                    ["access_token"] = "access-token",
                    ["expires_in"] = 3600,
                };
                if (_scope is not null)
                    tokenResponse["scope"] = _scope;

                var tokenPayload = JsonSerializer.Serialize(tokenResponse, JsonOptions);

                return JsonResponse(HttpStatusCode.OK, tokenPayload);
            }

            if (request.Method == HttpMethod.Get && uri == "https://gmail.googleapis.com/gmail/v1/users/me/labels")
            {
                LabelsRequested = true;
                ModifyRequestAuthorization = FormatAuthorization(request.Headers.Authorization);

                var labelsPayload = JsonSerializer.Serialize(new
                {
                    labels = new[]
                    {
                        new { id = "Label_42", name = "invoiced" },
                        new { id = "Label_99", name = "other" },
                    },
                }, JsonOptions);

                return JsonResponse(HttpStatusCode.OK, labelsPayload);
            }

            if (request.Method == HttpMethod.Post &&
                (uri == "https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-123/modify" ||
                 uri == "https://gmail.googleapis.com/gmail/v1/users/me/messages/message-456/modify"))
            {
                ModifyRequested = true;
                ModifyRequestUri = uri;
                ModifyRequestAuthorization = FormatAuthorization(request.Headers.Authorization);
                ModifyRequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);

                return JsonResponse(HttpStatusCode.OK, "{}");
            }

            return new HttpResponseMessage(HttpStatusCode.BadRequest)
            {
                Content = new StringContent($"Unexpected outbound request: {request.Method} {uri}", Encoding.UTF8, "text/plain"),
            };
        }

        private static HttpResponseMessage JsonResponse(HttpStatusCode statusCode, string payload) =>
            new(statusCode)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };

        private static string? FormatAuthorization(AuthenticationHeaderValue? header) =>
            header is null ? null : $"{header.Scheme} {header.Parameter}";
    }
}
