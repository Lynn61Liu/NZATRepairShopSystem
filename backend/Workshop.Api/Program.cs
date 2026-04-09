using Microsoft.EntityFrameworkCore;
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

// --- [融合新增] 引入库存模块命名空间 ---
using Workshop.Api.Procurement;
// ------------------------------------

var builder = WebApplication.CreateBuilder(args);

QuestPDF.Settings.License = LicenseType.Community;

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache();
var redisConfiguration =
    builder.Configuration.GetConnectionString("Redis")
    ?? builder.Configuration["Redis:Configuration"];
var redisInstanceName = builder.Configuration["Redis:InstanceName"] ?? "workshop-api:";
if (!string.IsNullOrWhiteSpace(redisConfiguration))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConfiguration;
        options.InstanceName = redisInstanceName;
    });
}
else
{
    builder.Services.AddDistributedMemoryCache();
}
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

builder.Services.AddSingleton<DbQueryCountingInterceptor>();

builder.Services.AddDbContext<AppDbContext>((sp, opt) =>
    opt.UseNpgsql(dataSource)
        .AddInterceptors(sp.GetRequiredService<DbQueryCountingInterceptor>()));

// --- [融合新增] 注册库存模块的 ProcurementDbContext ---
builder.Services.AddDbContext<ProcurementDbContext>((sp, opt) =>
    opt.UseNpgsql(dataSource)
        .AddInterceptors(sp.GetRequiredService<DbQueryCountingInterceptor>()));
// ---------------------------------------------------

builder.Services.AddScoped<WofRecordsService>();
builder.Services.AddScoped<WofPrintService>();
builder.Services.AddScoped<PartsServicesService>();
builder.Services.AddScoped<NztaExpiryLookupService>();
builder.Services.AddSingleton<IAppCache, DistributedAppCache>();
builder.Services.AddScoped<InventoryItemService>();
builder.Services.AddScoped<ServiceCatalogService>();
builder.Services.AddScoped<XeroTokenConfiguration>();
builder.Services.AddScoped<XeroTokenStore>();
builder.Services.AddScoped<XeroTokenService>();
builder.Services.AddScoped<XeroInvoiceService>();
builder.Services.AddScoped<XeroPaymentService>();
builder.Services.AddScoped<JobInvoiceService>();
builder.Services.AddScoped<InvoiceOutboxService>();
builder.Services.AddScoped<GmailAccountService>();
builder.Services.AddScoped<GmailTokenService>();
builder.Services.AddScoped<GmailMessageSenderService>();
builder.Services.AddScoped<GmailThreadSyncService>();
builder.Services.AddScoped<BusinessHoursService>();
builder.Services.AddScoped<JobPoStateService>();
builder.Services.AddScoped<GmailFollowUpSenderService>();
builder.Services.AddScoped<PoAutoFollowUpService>();
builder.Services.AddSingleton<AppleVisionImageOcrService>();
builder.Services.AddHostedService<PoStateSchemaInitializerService>();
builder.Services.AddHostedService<InvoiceOutboxBackgroundService>();
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
    db.Database.Migrate();
    
    // 注意：如果 Eric 的 ProcurementDbContext 也需要自动执行 Migration，
    // 可以在这里添加：
    // var procurementDb = scope.ServiceProvider.GetRequiredService<ProcurementDbContext>();
    // procurementDb.Database.Migrate();
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
