using Microsoft.EntityFrameworkCore;
using Workshop.Api.Models;

namespace Workshop.Api.Data;

public class AppDbContext : DbContext
{
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var e = modelBuilder.Entity<Vehicle>();
        e.ToTable("vehicles");

        e.HasKey(x => x.Id);

        e.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        e.Property(x => x.Plate).HasColumnName("plate").IsRequired();
        e.HasIndex(x => x.Plate).IsUnique();

        e.Property(x => x.Make).HasColumnName("make");
        e.Property(x => x.Model).HasColumnName("model");
        e.Property(x => x.Year).HasColumnName("year");
        e.Property(x => x.Vin).HasColumnName("vin");
        e.Property(x => x.Engine).HasColumnName("engine");
        e.Property(x => x.RegoExpiry).HasColumnName("rego_expiry");
        e.Property(x => x.Colour).HasColumnName("colour");
        e.Property(x => x.BodyStyle).HasColumnName("body_style");
        e.Property(x => x.EngineNo).HasColumnName("engine_no");
        e.Property(x => x.Chassis).HasColumnName("chassis");
        e.Property(x => x.CcRating).HasColumnName("cc_rating");
        e.Property(x => x.FuelType).HasColumnName("fuel_type");
        e.Property(x => x.Seats).HasColumnName("seats");
        e.Property(x => x.CountryOfOrigin).HasColumnName("country_of_origin");
        e.Property(x => x.GrossVehicleMass).HasColumnName("gross_vehicle_mass");
        e.Property(x => x.Refrigerant).HasColumnName("refrigerant");
        e.Property(x => x.FuelTankCapacityLitres).HasColumnName("fuel_tank_capacity_litres");
        e.Property(x => x.FullCombinedRangeKm).HasColumnName("full_combined_range_km");
        e.Property(x => x.WofExpiry).HasColumnName("wof_expiry");
        e.Property(x => x.Odometer).HasColumnName("odometer");
        e.Property(x => x.NzFirstRegistration).HasColumnName("nz_first_registration");
        e.Property(x => x.CustomerId).HasColumnName("customer_id");

        // ✅ raw_json jsonb
        e.Property(x => x.RawJson).HasColumnName("raw_json").HasColumnType("jsonb");

        e.Property(x => x.UpdatedAt)
            .HasColumnName("updated_at")
            .HasDefaultValueSql("now()");
    }
}
