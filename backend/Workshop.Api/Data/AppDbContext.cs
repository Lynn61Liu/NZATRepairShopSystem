using Microsoft.EntityFrameworkCore;
using Workshop.Api.Models;

namespace Workshop.Api.Data;

public class AppDbContext : DbContext
{
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<WofRecord> WofRecords => Set<WofRecord>();

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

        var c = modelBuilder.Entity<Customer>();
        c.ToTable("customers");
        c.HasKey(x => x.Id);
        c.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        c.Property(x => x.Type).HasColumnName("type").IsRequired();
        c.Property(x => x.Name).HasColumnName("name").IsRequired();
        c.Property(x => x.Phone).HasColumnName("phone");
        c.Property(x => x.Email).HasColumnName("email");
        c.Property(x => x.Address).HasColumnName("address");
        c.Property(x => x.BusinessCode).HasColumnName("business_code");
        c.Property(x => x.Notes).HasColumnName("notes");

        var j = modelBuilder.Entity<Job>();
        j.ToTable("jobs");
        j.HasKey(x => x.Id);
        j.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        j.Property(x => x.Status).HasColumnName("status").IsRequired();
        j.Property(x => x.IsUrgent).HasColumnName("is_urgent");
        j.Property(x => x.VehicleId).HasColumnName("vehicle_id");
        j.Property(x => x.CustomerId).HasColumnName("customer_id");
        j.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        j.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        var w = modelBuilder.Entity<WofRecord>();
        w.ToTable("wof");
        w.HasKey(x => x.Id);
        w.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        w.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        w.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        w.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");
    }
}
