using Microsoft.EntityFrameworkCore;
using Npgsql;
using CarjamImporter;
using CarjamImporter.Infrastructure;
using CarjamImporter.Persistence;
using CarjamImporter.Playwright;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddControllers();

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
var dataSource = dataSourceBuilder.Build();

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(dataSource));

builder.Services.AddScoped<WofRecordsService>();
builder.Services.AddScoped<PartsServicesService>();

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

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AppCors");
app.UseHttpsRedirection();
app.MapControllers();

app.Run();
