using Microsoft.EntityFrameworkCore;
using Workshop.Api.Models;

namespace Workshop.Api.Data;

public class AppDbContext : DbContext
{
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<JobTag> JobTags => Set<JobTag>();

    //wof_service
    // public DbSet<WofService> WofServices => Set<WofService>();
    // public DbSet<WofCheckItem> WofCheckItems => Set<WofCheckItem>();
    public DbSet<WofResult> WofResults => Set<WofResult>();
    public DbSet<WofFailReason> WofFailReasons => Set<WofFailReason>();
    public DbSet<JobWofRecord> JobWofRecords => Set<JobWofRecord>();
    public DbSet<JobPartsService> JobPartsServices => Set<JobPartsService>();
    public DbSet<JobPartsNote> JobPartsNotes => Set<JobPartsNote>();
    public DbSet<JobPaintService> JobPaintServices => Set<JobPaintService>();
    

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresEnum<WofRecordState>("public", "wof_record_state");
        modelBuilder.HasPostgresEnum<WofUiState>("public", "wof_ui_state");
        modelBuilder.HasPostgresEnum<PartsServiceStatus>("public", "parts_service_status");

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
        j.Property(x => x.Notes).HasColumnName("notes");
        j.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        j.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        var t = modelBuilder.Entity<Tag>();
        t.ToTable("tags");
        t.HasKey(x => x.Id);
        t.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        t.Property(x => x.Name).HasColumnName("name").IsRequired();
        t.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        t.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        t.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        var jt = modelBuilder.Entity<JobTag>();
        jt.ToTable("job_tags");
        jt.HasKey(x => new { x.JobId, x.TagId });
        jt.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jt.Property(x => x.TagId).HasColumnName("tag_id").IsRequired();
        jt.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");

        var w = modelBuilder.Entity<WofService>();
        w.ToTable("wof_service");
        w.HasKey(x => x.Id);
        w.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        w.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        w.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        w.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        // var wci = modelBuilder.Entity<WofCheckItem>();
        // wci.ToTable("wof_check_items");
        // wci.HasKey(x => x.Id);
        // wci.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        // wci.Property(x => x.WofId).HasColumnName("wof_id").IsRequired();
        // wci.Property(x => x.Odo).HasColumnName("odo");
        // wci.Property(x => x.AuthCode).HasColumnName("auth_code");
        // wci.Property(x => x.CheckSheet).HasColumnName("check_sheet");
        // wci.Property(x => x.CsNo).HasColumnName("cs_no");
        // wci.Property(x => x.WofLabel).HasColumnName("wof_label");
        // wci.Property(x => x.LabelNo).HasColumnName("label_no");
        // wci.Property(x => x.Source).HasColumnName("source");
        // wci.Property(x => x.SourceRow).HasColumnName("source_row");
        // wci.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        // var wr = modelBuilder.Entity<WofResult>();
        // wr.ToTable("wof_results");
        // wr.HasKey(x => x.Id);
        // wr.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        // wr.Property(x => x.WofId).HasColumnName("wof_id").IsRequired();
        // wr.Property(x => x.Result).HasColumnName("result").IsRequired();
        // wr.Property(x => x.RecheckExpiryDate).HasColumnName("recheck_expiry_date");
        // wr.Property(x => x.FailReasonId).HasColumnName("fail_reason_id");
        // wr.Property(x => x.Note).HasColumnName("note");
        // wr.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");

        var wfr = modelBuilder.Entity<WofFailReason>();
        wfr.ToTable("wof_fail_reasons");
        wfr.HasKey(x => x.Id);
        wfr.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        wfr.Property(x => x.Label).HasColumnName("label").IsRequired();
        wfr.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        wfr.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        wfr.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        var jwr = modelBuilder.Entity<JobWofRecord>();
        jwr.ToTable("job_wof_records");
        jwr.HasKey(x => x.Id);
        jwr.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jwr.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jwr.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
        jwr.Property(x => x.Rego).HasColumnName("rego").IsRequired();
        jwr.Property(x => x.MakeModel).HasColumnName("make_model");
        jwr.Property(x => x.Odo).HasColumnName("odo");
        jwr.Property(x => x.RecordState).HasColumnName("record_state").HasColumnType("wof_record_state").IsRequired();
        jwr.Property(x => x.IsNewWof).HasColumnName("is_new_wof");
        jwr.Property(x => x.NewWofDate).HasColumnName("new_wof_date");
        jwr.Property(x => x.AuthCode).HasColumnName("auth_code");
        jwr.Property(x => x.CheckSheet).HasColumnName("check_sheet");
        jwr.Property(x => x.CsNo).HasColumnName("cs_no");
        jwr.Property(x => x.WofLabel).HasColumnName("wof_label");
        jwr.Property(x => x.LabelNo).HasColumnName("label_no");
        jwr.Property(x => x.FailReasons).HasColumnName("fail_reasons");
        jwr.Property(x => x.PreviousExpiryDate).HasColumnName("previous_expiry_date");
        jwr.Property(x => x.OrganisationName).HasColumnName("organisation_name").IsRequired();
        jwr.Property(x => x.ExcelRowNo).HasColumnName("excel_row_no").IsRequired();
        jwr.Property(x => x.SourceFile).HasColumnName("source_file");
        jwr.Property(x => x.Note).HasColumnName("note");
        jwr.Property(x => x.WofUiState).HasColumnName("wof_ui_state").HasColumnType("wof_ui_state").IsRequired();
        jwr.Property(x => x.ImportedAt).HasColumnName("imported_at").HasDefaultValueSql("now()");
        jwr.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        var jps = modelBuilder.Entity<JobPartsService>();
        jps.ToTable("job_parts_services");
        jps.HasKey(x => x.Id);
        jps.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jps.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jps.Property(x => x.Description).HasColumnName("description").IsRequired();
        jps.Property(x => x.Status).HasColumnName("status").HasColumnType("parts_service_status").IsRequired();
        jps.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        jps.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        var jpn = modelBuilder.Entity<JobPartsNote>();
        jpn.ToTable("job_parts_notes");
        jpn.HasKey(x => x.Id);
        jpn.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jpn.Property(x => x.PartsServiceId).HasColumnName("parts_service_id").IsRequired();
        jpn.Property(x => x.Note).HasColumnName("note").IsRequired();
        jpn.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        jpn.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");

        var jpt = modelBuilder.Entity<JobPaintService>();
        jpt.ToTable("job_paint_services");
        jpt.HasKey(x => x.Id);
        jpt.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jpt.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jpt.Property(x => x.Status).HasColumnName("status").IsRequired();
        jpt.Property(x => x.CurrentStage).HasColumnName("current_stage").HasDefaultValue(-1);
        jpt.Property(x => x.Panels).HasColumnName("panels").HasDefaultValue(1);
        jpt.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        jpt.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");
    }
}
