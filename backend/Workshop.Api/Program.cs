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

var connString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connString))
    throw new InvalidOperationException("Missing connection string. Set ConnectionStrings:Default in appsettings.json.");

var dataSourceBuilder = new NpgsqlDataSourceBuilder(connString);
dataSourceBuilder.MapEnum<WofRecordState>("wof_record_state");
dataSourceBuilder.MapEnum<WofUiState>("wof_ui_state");
var dataSource = dataSourceBuilder.Build();

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(dataSource));

builder.Services.AddScoped<WofRecordsService>();

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

app.UseHttpsRedirection();
app.MapControllers();

app.Run();
