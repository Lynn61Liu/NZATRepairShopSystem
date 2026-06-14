using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class GmailDraftServiceTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task GetPoRequestDraftStatusAsync_ReturnsNone_WhenNoDraftHasBeenCreated()
    {
        await using var db = CreateDb();
        db.Jobs.Add(CreateJob(1070, needsPo: true));
        await db.SaveChangesAsync();

        var service = CreateService(db, new ThrowingHttpClientFactory());

        var result = await service.GetPoRequestDraftStatusAsync("PO-1070-ABC", null, CancellationToken.None);

        result.Ok.Should().BeTrue();
        result.DraftState.Should().Be("none");
        result.DraftId.Should().BeEmpty();
        result.ComposeUrl.Should().BeEmpty();
        result.SentMailboxUrl.Should().BeEmpty();
        result.Message.Should().Contain("No Gmail draft");
    }

    [Fact]
    public async Task GetPoRequestDraftStatusAsync_ReturnsMissing_WhenStoredDraftNoLongerExists()
    {
        await using var db = CreateDb();
        db.Jobs.Add(CreateJob(1070, needsPo: true));
        db.GmailAccounts.Add(new GmailAccount
        {
            Id = 1,
            Email = "team@example.com",
            RefreshToken = "refresh-token",
            IsActive = true,
            IsDefault = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        db.JobPoStates.Add(new JobPoState
        {
            JobId = 1070,
            CorrelationId = "PO-1070-ABC",
            GmailDraftId = "draft-123",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, new GmailDraftStatusHttpClientFactory());

        var result = await service.GetPoRequestDraftStatusAsync("PO-1070-ABC", null, CancellationToken.None);

        result.Ok.Should().BeTrue();
        result.DraftState.Should().Be("missing");
        result.DraftId.Should().Be("draft-123");
        result.ComposeUrl.Should().BeEmpty();
        result.SentMailboxUrl.Should().Be("https://mail.google.com/mail/u/?authuser=team%40example.com#sent");
        result.Message.Should().Contain("找不到");
    }

    [Fact]
    public async Task UpsertPoRequestDraftAsync_ReturnsConflict_WhenDraftAlreadyExistsAndForceCreateIsFalse()
    {
        await using var db = CreateDb();
        db.Jobs.Add(CreateJob(1070, needsPo: true));
        db.JobPoStates.Add(new JobPoState
        {
            JobId = 1070,
            CorrelationId = "PO-1070-ABC",
            GmailDraftId = "draft-123",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, new ThrowingHttpClientFactory());
        var request = new GmailPoDraftRequest(
            "team@example.com",
            "PO Request",
            "<p>Hello</p>",
            true,
            null,
            null,
            null,
            null,
            "PO-1070-ABC");

        var result = await service.UpsertPoRequestDraftAsync(request, CancellationToken.None);

        result.Ok.Should().BeFalse();
        result.StatusCode.Should().Be(409);
        result.Error.Should().Contain("already exists");
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static GmailDraftService CreateService(AppDbContext db, IHttpClientFactory httpClientFactory)
    {
        var gmailOptions = Microsoft.Extensions.Options.Options.Create(new GmailOptions
        {
            ClientId = "client-id",
            ClientSecret = "client-secret",
            Scopes = "https://www.googleapis.com/auth/gmail.send",
        });

        var accountService = new GmailAccountService(db);
        var tokenService = new GmailTokenService(httpClientFactory, gmailOptions, accountService);
        return new GmailDraftService(db, httpClientFactory, gmailOptions, tokenService);
    }

    private static Job CreateJob(long id, bool needsPo) =>
        new()
        {
            Id = id,
            NeedsPo = needsPo,
            Status = "Draft",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

    private sealed class ThrowingHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name = "") => new(new ThrowingHandler());
    }

    private sealed class GmailDraftStatusHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name = "") => new(new GmailDraftStatusHandler());
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromException<HttpResponseMessage>(new InvalidOperationException($"Unexpected outbound request: {request.Method} {request.RequestUri}"));
    }

    private sealed class GmailDraftStatusHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri?.AbsoluteUri ?? "";

            if (request.Method == HttpMethod.Post && uri.Contains("oauth2.googleapis.com/token", StringComparison.OrdinalIgnoreCase))
            {
                var tokenPayload = JsonSerializer.Serialize(new
                {
                    access_token = "access-token",
                    expires_in = 3600,
                    scope = "https://www.googleapis.com/auth/gmail.send",
                }, JsonOptions);

                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(tokenPayload, Encoding.UTF8, "application/json"),
                });
            }

            if (request.Method == HttpMethod.Get && uri.Contains("/gmail/v1/users/me/drafts/", StringComparison.OrdinalIgnoreCase))
            {
                var payload = JsonSerializer.Serialize(new
                {
                    error = new
                    {
                        code = 404,
                        message = "Requested draft was not found.",
                        status = "NOT_FOUND",
                    },
                }, JsonOptions);

                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json"),
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadRequest)
            {
                Content = new StringContent($"Unexpected outbound request: {request.Method} {uri}", Encoding.UTF8, "text/plain"),
            });
        }
    }
}
