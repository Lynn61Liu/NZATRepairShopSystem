using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Npgsql;
using CarjamImporter;
using CarjamImporter.Infrastructure;
using CarjamImporter.Persistence;
using CarjamImporter.Playwright;
using QuestPDF.Infrastructure;
using Workshop.Api.Data;
using Workshop.Api.Middleware;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;
using Workshop.Api.Utils;

var builder = WebApplication.CreateBuilder(args);

QuestPDF.Settings.License = LicenseType.Community;

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient();
builder.Services.Configure<XeroOptions>(builder.Configuration.GetSection(XeroOptions.SectionName));
builder.Services.Configure<GmailOptions>(builder.Configuration.GetSection(GmailOptions.SectionName));
builder.Services.Configure<GmailSyncOptions>(builder.Configuration.GetSection(GmailSyncOptions.SectionName));
builder.Services.Configure<ImageOcrOptions>(builder.Configuration.GetSection(ImageOcrOptions.SectionName));
builder.Services.Configure<InventoryItemOptions>(builder.Configuration.GetSection(InventoryItemOptions.SectionName));
builder.Services.Configure<PoFollowUpOptions>(builder.Configuration.GetSection(PoFollowUpOptions.SectionName));
builder.Services.Configure<XeroPaymentOptions>(builder.Configuration.GetSection(XeroPaymentOptions.SectionName));
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new DateTimeJsonConverter());
        options.JsonSerializerOptions.Converters.Add(new NullableDateTimeJsonConverter());
    });

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>();
var corsOriginsEnv = builder.Configuration["CORS_ORIGINS"];
if (!string.IsNullOrWhiteSpace(corsOriginsEnv))
    corsOrigins = corsOriginsEnv
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var fallbackCorsOrigins = new[]
{
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://nzat-jan2026-1.onrender.com"
};

builder.Services.AddCors(options =>
{
    options.AddPolicy("AppCors", policy =>
    {
        if (corsOrigins is { Length: > 0 })
        {
            policy.WithOrigins(corsOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
        else if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
        else
        {
            policy.WithOrigins(fallbackCorsOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

var connString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connString))
    throw new InvalidOperationException("Missing connection string. Set ConnectionStrings:Default in appsettings.json.");

var dataSourceBuilder = new NpgsqlDataSourceBuilder(connString);
dataSourceBuilder.MapEnum<WofRecordState>("wof_record_state");
dataSourceBuilder.MapEnum<WofUiState>("wof_ui_state");
dataSourceBuilder.MapEnum<PartsServiceStatus>("parts_service_status");
dataSourceBuilder.MapEnum<WorklogServiceType>("worklog_service_type");
var dataSource = dataSourceBuilder.Build();

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(dataSource));

builder.Services.AddScoped<WofRecordsService>();
builder.Services.AddScoped<WofPrintService>();
builder.Services.AddScoped<PartsServicesService>();
builder.Services.AddScoped<InventoryItemService>();
builder.Services.AddScoped<ServiceCatalogService>();
builder.Services.AddScoped<XeroTokenConfiguration>();
builder.Services.AddScoped<XeroTokenStore>();
builder.Services.AddScoped<XeroTokenService>();
builder.Services.AddScoped<XeroInvoiceService>();
builder.Services.AddScoped<XeroPaymentService>();
builder.Services.AddScoped<JobInvoiceService>();
builder.Services.AddScoped<GmailAccountService>();
builder.Services.AddScoped<GmailTokenService>();
builder.Services.AddScoped<GmailThreadSyncService>();
builder.Services.AddScoped<BusinessHoursService>();
builder.Services.AddScoped<JobPoStateService>();
builder.Services.AddScoped<GmailFollowUpSenderService>();
builder.Services.AddScoped<PoAutoFollowUpService>();
builder.Services.AddSingleton<AppleVisionImageOcrService>();
builder.Services.AddHostedService<PoStateSchemaInitializerService>();
builder.Services.AddHostedService<GmailBackgroundSyncService>();
builder.Services.AddHostedService<PoAutoFollowUpBackgroundService>();

// ========= Carjam Importer DI =========

// 1) Connection string (prefer "Carjam", fallback to "Default")
var carjamConnStr =
    builder.Configuration.GetConnectionString("Carjam")
    ?? connString;

if (string.IsNullOrWhiteSpace(carjamConnStr))
    throw new InvalidOperationException("Missing connection string. Set ConnectionStrings:Carjam (or Default) in appsettings.json.");

// 2) Register infrastructure/repo dependencies
builder.Services.AddSingleton(new DbConnectionFactory(carjamConnStr));
builder.Services.AddScoped<VehicleRepository>();

// 3) Register browser + import service
builder.Services.AddScoped<CarjamBrowser>();
builder.Services.AddScoped<CarjamImportService>();

// (Optional) If you still use your own scraper in Workshop.Api
builder.Services.AddScoped<CarjamScraper>();

// ========= Build pipeline =========
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
            "MigrationId" character varying(150) NOT NULL,
            "ProductVersion" character varying(32) NOT NULL,
            CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
        );
        """);
    db.Database.ExecuteSqlRaw("""
        INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
        SELECT '20260316221824_AddXeroTokenStore', '8.0.12'
        WHERE to_regclass('public.xero_tokens') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM "__EFMigrationsHistory"
              WHERE "MigrationId" = '20260316221824_AddXeroTokenStore'
          );
        """);
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS service_catalog_items (
            id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            service_type text NOT NULL,
            category text NOT NULL,
            name text NOT NULL,
            personal_link_code text NULL,
            dealership_link_code text NULL,
            is_active boolean NOT NULL DEFAULT true,
            sort_order integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
            updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now())
        );
        ALTER TABLE service_catalog_items ADD COLUMN IF NOT EXISTS personal_link_code text NULL;
        ALTER TABLE service_catalog_items ADD COLUMN IF NOT EXISTS dealership_link_code text NULL;
        CREATE INDEX IF NOT EXISTS ix_service_catalog_items_type_category
            ON service_catalog_items(service_type, category);
        """);
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS customer_service_prices (
            id bigint GENERATED BY DEFAULT AS IDENTITY,
            customer_id bigint NOT NULL,
            service_catalog_item_id bigint NOT NULL,
            xero_item_code text NOT NULL,
            is_active boolean NOT NULL DEFAULT TRUE,
            created_at timestamp with time zone NOT NULL DEFAULT (date_trunc('milliseconds', now())),
            updated_at timestamp with time zone NOT NULL DEFAULT (date_trunc('milliseconds', now())),
            CONSTRAINT "PK_customer_service_prices" PRIMARY KEY (id),
            CONSTRAINT "FK_customer_service_prices_customers_customer_id"
                FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
            CONSTRAINT "FK_customer_service_prices_service_catalog_items_service_catalog_item_id"
                FOREIGN KEY (service_catalog_item_id) REFERENCES service_catalog_items (id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS ix_customer_service_prices_customer_id
            ON customer_service_prices (customer_id);
        CREATE INDEX IF NOT EXISTS ix_customer_service_prices_service_catalog_item_id
            ON customer_service_prices (service_catalog_item_id);
        """);
    db.Database.ExecuteSqlRaw("""
        INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
        SELECT '20260324093000_AddCustomerServicePrices', '8.0.12'
        WHERE to_regclass('public.customer_service_prices') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM "__EFMigrationsHistory"
              WHERE "MigrationId" = '20260324093000_AddCustomerServicePrices'
          );
        """);
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AppCors");
app.UseHttpsRedirection();
app.UseMiddleware<RequestTimingMiddleware>();
app.MapControllers();

app.Run();
