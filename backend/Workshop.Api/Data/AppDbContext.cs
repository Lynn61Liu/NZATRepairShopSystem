using Microsoft.EntityFrameworkCore;
using Workshop.Api.Models;
using Workshop.Api.Utils;

namespace Workshop.Api.Data;

public class AppDbContext : DbContext
{
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerStaff> CustomerStaffMembers => Set<CustomerStaff>();
    public DbSet<CustomerServicePrice> CustomerServicePrices => Set<CustomerServicePrice>();
    public DbSet<GmailAccount> GmailAccounts => Set<GmailAccount>();
    public DbSet<GmailMessageLog> GmailMessageLogs => Set<GmailMessageLog>();
    public DbSet<InactiveGmailCorrelation> InactiveGmailCorrelations => Set<InactiveGmailCorrelation>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobInvoice> JobInvoices => Set<JobInvoice>();
    public DbSet<JobPayment> JobPayments => Set<JobPayment>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<XeroTokenRecord> XeroTokenRecords => Set<XeroTokenRecord>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
    public DbSet<ServiceCatalogItem> ServiceCatalogItems => Set<ServiceCatalogItem>();
    public DbSet<SystemSyncState> SystemSyncStates => Set<SystemSyncState>();
    public DbSet<JobPoState> JobPoStates => Set<JobPoState>();
    public DbSet<JobWofState> JobWofStates => Set<JobWofState>();
    public DbSet<JobWofScheduleEntry> JobWofScheduleEntries => Set<JobWofScheduleEntry>();
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
    public DbSet<JobMechService> JobMechServices => Set<JobMechService>();
    public DbSet<JobPaintService> JobPaintServices => Set<JobPaintService>();
    public DbSet<JobServiceSelection> JobServiceSelections => Set<JobServiceSelection>();
    public DbSet<Staff> Staff => Set<Staff>();
    public DbSet<WorklogEntry> WorklogEntries => Set<WorklogEntry>();
    

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public override int SaveChanges()
    {
        NormalizeDateTimes();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        NormalizeDateTimes();
        return base.SaveChangesAsync(cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresEnum<WofRecordState>("public", "wof_record_state");
        modelBuilder.HasPostgresEnum<WofUiState>("public", "wof_ui_state");
        modelBuilder.HasPostgresEnum<PartsServiceStatus>("public", "parts_service_status");
        modelBuilder.HasPostgresEnum<WorklogServiceType>("public", "worklog_service_type");

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
        e.HasOne(x => x.Customer)
            .WithMany()
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.SetNull);

        // ✅ raw_json jsonb
        e.Property(x => x.RawJson).HasColumnName("raw_json").HasColumnType("jsonb");

        e.Property(x => x.UpdatedAt)
            .HasColumnName("updated_at")
            .HasDefaultValueSql("date_trunc('milliseconds', now())");

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
        c.HasMany(x => x.StaffMembers)
            .WithOne(x => x.Customer)
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.Cascade);
        c.HasMany(x => x.ServicePrices)
            .WithOne(x => x.Customer)
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.Cascade);

        var cs = modelBuilder.Entity<CustomerStaff>();
        cs.ToTable("customer_staff");
        cs.HasKey(x => x.Id);
        cs.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        cs.Property(x => x.CustomerId).HasColumnName("customer_id").IsRequired();
        cs.Property(x => x.Name).HasColumnName("name").IsRequired();
        cs.Property(x => x.Title).HasColumnName("title");
        cs.Property(x => x.Email).HasColumnName("email");
        cs.HasIndex(x => x.CustomerId).HasDatabaseName("ix_customer_staff_customer_id");

        var csp = modelBuilder.Entity<CustomerServicePrice>();
        csp.ToTable("customer_service_prices");
        csp.HasKey(x => x.Id);
        csp.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        csp.Property(x => x.CustomerId).HasColumnName("customer_id").IsRequired();
        csp.Property(x => x.ServiceCatalogItemId).HasColumnName("service_catalog_item_id").IsRequired();
        csp.Property(x => x.XeroItemCode).HasColumnName("xero_item_code").IsRequired();
        csp.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        csp.Property(x => x.CreatedAt)
            .HasColumnName("created_at")
            .HasDefaultValueSql("date_trunc('milliseconds', now())");
        csp.Property(x => x.UpdatedAt)
            .HasColumnName("updated_at")
            .HasDefaultValueSql("date_trunc('milliseconds', now())");
        csp.HasIndex(x => x.CustomerId).HasDatabaseName("ix_customer_service_prices_customer_id");
        csp.HasIndex(x => x.ServiceCatalogItemId).HasDatabaseName("ix_customer_service_prices_service_catalog_item_id");
        csp.HasOne(x => x.ServiceCatalogItem)
            .WithMany()
            .HasForeignKey(x => x.ServiceCatalogItemId)
            .OnDelete(DeleteBehavior.Restrict);

        var ga = modelBuilder.Entity<GmailAccount>();
        ga.ToTable("gmail_accounts");
        ga.HasKey(x => x.Id);
        ga.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        ga.Property(x => x.Email).HasColumnName("email").IsRequired();
        ga.Property(x => x.RefreshToken).HasColumnName("refresh_token").IsRequired();
        ga.Property(x => x.AccessToken).HasColumnName("access_token");
        ga.Property(x => x.AccessTokenExpiresAt).HasColumnName("access_token_expires_at");
        ga.Property(x => x.Scope).HasColumnName("scope");
        ga.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        ga.Property(x => x.IsDefault).HasColumnName("is_default").HasDefaultValue(false);
        ga.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ga.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ga.HasIndex(x => x.Email).IsUnique().HasDatabaseName("ux_gmail_accounts_email");
        ga.HasIndex(x => x.IsDefault).HasDatabaseName("ix_gmail_accounts_is_default");

        var gm = modelBuilder.Entity<GmailMessageLog>();
        gm.ToTable("gmail_message_logs");
        gm.HasKey(x => x.Id);
        gm.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        gm.Property(x => x.GmailAccountId).HasColumnName("gmail_account_id");
        gm.Property(x => x.GmailAccountEmail).HasColumnName("gmail_account_email");
        gm.Property(x => x.GmailMessageId).HasColumnName("gmail_message_id").IsRequired();
        gm.Property(x => x.GmailThreadId).HasColumnName("gmail_thread_id");
        gm.Property(x => x.InternalDateMs).HasColumnName("internal_date_ms");
        gm.Property(x => x.Direction).HasColumnName("direction").IsRequired();
        gm.Property(x => x.CounterpartyEmail).HasColumnName("counterparty_email").IsRequired();
        gm.Property(x => x.FromAddress).HasColumnName("from_address");
        gm.Property(x => x.ToAddress).HasColumnName("to_address");
        gm.Property(x => x.Subject).HasColumnName("subject");
        gm.Property(x => x.Body).HasColumnName("body");
        gm.Property(x => x.Snippet).HasColumnName("snippet");
        gm.Property(x => x.CorrelationId).HasColumnName("correlation_id");
        gm.Property(x => x.RfcMessageId).HasColumnName("rfc_message_id");
        gm.Property(x => x.ReferencesHeader).HasColumnName("references_header");
        gm.Property(x => x.HasAttachments).HasColumnName("has_attachments").HasDefaultValue(false);
        gm.Property(x => x.AttachmentsJson).HasColumnName("attachments_json");
        gm.Property(x => x.IsRead).HasColumnName("is_read").HasDefaultValue(false);
        gm.Property(x => x.ReadAt).HasColumnName("read_at");
        gm.Property(x => x.DetectedPoNumber).HasColumnName("detected_po_number");
        gm.Property(x => x.IsSystemInitiated).HasColumnName("is_system_initiated").HasDefaultValue(false);
        gm.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        gm.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        gm.HasIndex(x => new { x.GmailAccountId, x.GmailMessageId }).IsUnique().HasDatabaseName("ux_gmail_message_logs_account_message_id");
        gm.HasIndex(x => x.GmailThreadId).HasDatabaseName("ix_gmail_message_logs_thread_id");
        gm.HasIndex(x => x.CorrelationId).HasDatabaseName("ix_gmail_message_logs_correlation_id");
        gm.HasIndex(x => x.GmailAccountId).HasDatabaseName("ix_gmail_message_logs_account_id");

        var igc = modelBuilder.Entity<InactiveGmailCorrelation>();
        igc.ToTable("inactive_gmail_correlations");
        igc.HasKey(x => x.Id);
        igc.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        igc.Property(x => x.CorrelationId).HasColumnName("correlation_id").IsRequired();
        igc.Property(x => x.Reason).HasColumnName("reason");
        igc.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        igc.HasIndex(x => x.CorrelationId).IsUnique().HasDatabaseName("ux_inactive_gmail_correlations_correlation_id");

        var j = modelBuilder.Entity<Job>();
        j.ToTable("jobs");
        j.HasKey(x => x.Id);
        j.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        j.Property(x => x.Status).HasColumnName("status").IsRequired();
        j.Property(x => x.IsUrgent).HasColumnName("is_urgent");
        j.Property(x => x.NeedsPo).HasColumnName("needs_po");
        j.Property(x => x.UseServiceCatalogMapping).HasColumnName("use_service_catalog_mapping").HasDefaultValue(false);
        j.Property(x => x.PoNumber).HasColumnName("po_number");
        j.Property(x => x.InvoiceReference).HasColumnName("invoice_reference");
        j.Property(x => x.VehicleId).HasColumnName("vehicle_id");
        j.Property(x => x.CustomerId).HasColumnName("customer_id");
        j.Property(x => x.Notes).HasColumnName("notes");
        j.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        j.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        j.HasOne(x => x.Vehicle)
            .WithMany()
            .HasForeignKey(x => x.VehicleId)
            .OnDelete(DeleteBehavior.SetNull);
        j.HasOne(x => x.Customer)
            .WithMany()
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.SetNull);

        var jws = modelBuilder.Entity<JobWofState>();
        jws.ToTable("job_wof_state");
        jws.HasKey(x => x.Id);
        jws.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jws.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jws.Property(x => x.ManualStatus).HasColumnName("manual_status");
        jws.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jws.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jws.HasIndex(x => x.JobId).IsUnique().HasDatabaseName("ux_job_wof_state_job_id");
        jws.HasOne<Job>().WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);

        var jwse = modelBuilder.Entity<JobWofScheduleEntry>();
        jwse.ToTable("job_wof_schedule_entries");
        jwse.HasKey(x => x.Id);
        jwse.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jwse.Property(x => x.JobId).HasColumnName("job_id");
        jwse.Property(x => x.EntryType).HasColumnName("entry_type").IsRequired();
        jwse.Property(x => x.PlaceholderKey).HasColumnName("placeholder_key");
        jwse.Property(x => x.ScheduledDate).HasColumnName("scheduled_date");
        jwse.Property(x => x.ScheduledHour).HasColumnName("scheduled_hour");
        jwse.Property(x => x.Rego).HasColumnName("rego");
        jwse.Property(x => x.Contact).HasColumnName("contact");
        jwse.Property(x => x.Notes).HasColumnName("notes");
        jwse.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jwse.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jwse.HasIndex(x => x.JobId).IsUnique().HasFilter("job_id IS NOT NULL").HasDatabaseName("ux_job_wof_schedule_entries_job_id");
        jwse.HasIndex(x => x.PlaceholderKey).IsUnique().HasFilter("placeholder_key IS NOT NULL").HasDatabaseName("ux_job_wof_schedule_entries_placeholder_key");
        jwse.HasIndex(x => new { x.ScheduledDate, x.ScheduledHour }).HasDatabaseName("ix_job_wof_schedule_entries_slot");
        jwse.HasOne<Job>().WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);

        var ji = modelBuilder.Entity<JobInvoice>();
        ji.ToTable("job_invoices");
        ji.HasKey(x => x.Id);
        ji.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        ji.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        ji.Property(x => x.Provider).HasColumnName("provider").IsRequired();
        ji.Property(x => x.ExternalInvoiceId).HasColumnName("external_invoice_id");
        ji.Property(x => x.ExternalInvoiceNumber).HasColumnName("external_invoice_number");
        ji.Property(x => x.ExternalStatus).HasColumnName("external_status");
        ji.Property(x => x.Reference).HasColumnName("reference");
        ji.Property(x => x.ContactName).HasColumnName("contact_name");
        ji.Property(x => x.InvoiceNote).HasColumnName("invoice_note");
        ji.Property(x => x.InvoiceDate).HasColumnName("invoice_date");
        ji.Property(x => x.LineAmountTypes).HasColumnName("line_amount_types").IsRequired();
        ji.Property(x => x.TenantId).HasColumnName("tenant_id");
        ji.Property(x => x.RequestPayloadJson).HasColumnName("request_payload_json");
        ji.Property(x => x.ResponsePayloadJson).HasColumnName("response_payload_json");
        ji.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ji.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ji.HasIndex(x => x.JobId).IsUnique().HasDatabaseName("ux_job_invoices_job_id");
        ji.HasOne<Job>().WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);

        var jpay = modelBuilder.Entity<JobPayment>();
        jpay.ToTable("job_payments");
        jpay.HasKey(x => x.Id);
        jpay.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jpay.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jpay.Property(x => x.JobInvoiceId).HasColumnName("job_invoice_id").IsRequired();
        jpay.Property(x => x.Provider).HasColumnName("provider").IsRequired();
        jpay.Property(x => x.ExternalPaymentId).HasColumnName("external_payment_id");
        jpay.Property(x => x.ExternalInvoiceId).HasColumnName("external_invoice_id");
        jpay.Property(x => x.Method).HasColumnName("method").IsRequired();
        jpay.Property(x => x.Amount).HasColumnName("amount");
        jpay.Property(x => x.PaymentDate).HasColumnName("payment_date");
        jpay.Property(x => x.Reference).HasColumnName("reference");
        jpay.Property(x => x.AccountCode).HasColumnName("account_code");
        jpay.Property(x => x.AccountName).HasColumnName("account_name");
        jpay.Property(x => x.ExternalStatus).HasColumnName("external_status");
        jpay.Property(x => x.RequestPayloadJson).HasColumnName("request_payload_json");
        jpay.Property(x => x.ResponsePayloadJson).HasColumnName("response_payload_json");
        jpay.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jpay.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jpay.HasIndex(x => x.JobId).HasDatabaseName("ix_job_payments_job_id");
        jpay.HasIndex(x => x.JobInvoiceId).IsUnique().HasDatabaseName("ux_job_payments_job_invoice_id");
        jpay.HasOne<Job>().WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);
        jpay.HasOne<JobInvoice>().WithMany().HasForeignKey(x => x.JobInvoiceId).OnDelete(DeleteBehavior.Cascade);

        var om = modelBuilder.Entity<OutboxMessage>();
        om.ToTable("outbox_messages");
        om.HasKey(x => x.Id);
        om.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        om.Property(x => x.MessageType).HasColumnName("message_type").IsRequired();
        om.Property(x => x.AggregateType).HasColumnName("aggregate_type").IsRequired();
        om.Property(x => x.AggregateId).HasColumnName("aggregate_id").IsRequired();
        om.Property(x => x.PayloadJson).HasColumnName("payload_json").IsRequired();
        om.Property(x => x.Status).HasColumnName("status").IsRequired();
        om.Property(x => x.AttemptCount).HasColumnName("attempt_count").HasDefaultValue(0);
        om.Property(x => x.AvailableAt).HasColumnName("available_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        om.Property(x => x.LockedAt).HasColumnName("locked_at");
        om.Property(x => x.ProcessedAt).HasColumnName("processed_at");
        om.Property(x => x.LastError).HasColumnName("last_error");
        om.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        om.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        om.HasIndex(x => new { x.Status, x.AvailableAt }).HasDatabaseName("ix_outbox_messages_status_available_at");
        om.HasIndex(x => new { x.AggregateType, x.AggregateId, x.MessageType }).HasDatabaseName("ix_outbox_messages_aggregate_message_type");

        var xt = modelBuilder.Entity<XeroTokenRecord>();
        xt.ToTable("xero_tokens");
        xt.HasKey(x => x.Id);
        xt.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        xt.Property(x => x.Provider).HasColumnName("provider").IsRequired();
        xt.Property(x => x.RefreshToken).HasColumnName("refresh_token").IsRequired();
        xt.Property(x => x.AccessToken).HasColumnName("access_token");
        xt.Property(x => x.AccessTokenExpiresAt).HasColumnName("access_token_expires_at");
        xt.Property(x => x.Scope).HasColumnName("scope");
        xt.Property(x => x.TenantId).HasColumnName("tenant_id");
        xt.Property(x => x.TenantName).HasColumnName("tenant_name");
        xt.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        xt.Property(x => x.IsDefault).HasColumnName("is_default").HasDefaultValue(false);
        xt.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        xt.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        xt.HasIndex(x => new { x.Provider, x.TenantId }).IsUnique().HasDatabaseName("ux_xero_tokens_provider_tenant_id");
        xt.HasIndex(x => x.IsDefault).HasDatabaseName("ix_xero_tokens_is_default");

        var ii = modelBuilder.Entity<InventoryItem>();
        ii.ToTable("inventory_items");
        ii.HasKey(x => x.Id);
        ii.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        ii.Property(x => x.ItemCode).HasColumnName("item_code").IsRequired();
        ii.Property(x => x.ItemName).HasColumnName("item_name").IsRequired();
        ii.Property(x => x.Quantity).HasColumnName("quantity");
        ii.Property(x => x.PurchasesDescription).HasColumnName("purchases_description");
        ii.Property(x => x.PurchasesUnitPrice).HasColumnName("purchases_unit_price");
        ii.Property(x => x.PurchasesAccount).HasColumnName("purchases_account");
        ii.Property(x => x.PurchasesTaxRate).HasColumnName("purchases_tax_rate");
        ii.Property(x => x.SalesDescription).HasColumnName("sales_description");
        ii.Property(x => x.SalesUnitPrice).HasColumnName("sales_unit_price");
        ii.Property(x => x.SalesAccount).HasColumnName("sales_account");
        ii.Property(x => x.SalesTaxRate).HasColumnName("sales_tax_rate");
        ii.Property(x => x.InventoryAssetAccount).HasColumnName("inventory_asset_account");
        ii.Property(x => x.CostOfGoodsSoldAccount).HasColumnName("cost_of_goods_sold_account");
        ii.Property(x => x.Status).HasColumnName("status").IsRequired();
        ii.Property(x => x.InventoryType).HasColumnName("inventory_type");
        ii.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ii.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ii.HasIndex(x => x.ItemCode).IsUnique().HasDatabaseName("ux_inventory_items_item_code");
        ii.HasIndex(x => x.ItemName).HasDatabaseName("ix_inventory_items_item_name");

        var sci = modelBuilder.Entity<ServiceCatalogItem>();
        sci.ToTable("service_catalog_items");
        sci.HasKey(x => x.Id);
        sci.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        sci.Property(x => x.ServiceType).HasColumnName("service_type").IsRequired();
        sci.Property(x => x.Category).HasColumnName("category").IsRequired();
        sci.Property(x => x.Name).HasColumnName("name").IsRequired();
        sci.Property(x => x.PersonalLinkCode).HasColumnName("personal_link_code");
        sci.Property(x => x.DealershipLinkCode).HasColumnName("dealership_link_code");
        sci.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        sci.Property(x => x.SortOrder).HasColumnName("sort_order").HasDefaultValue(0);
        sci.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        sci.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        sci.HasIndex(x => new { x.ServiceType, x.Category }).HasDatabaseName("ix_service_catalog_items_type_category");

        var sss = modelBuilder.Entity<SystemSyncState>();
        sss.ToTable("system_sync_state");
        sss.HasKey(x => x.Id);
        sss.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        sss.Property(x => x.SyncKey).HasColumnName("sync_key").IsRequired();
        sss.Property(x => x.LastSyncedAt).HasColumnName("last_synced_at");
        sss.Property(x => x.LastResult).HasColumnName("last_result");
        sss.Property(x => x.LastError).HasColumnName("last_error");
        sss.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        sss.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        sss.HasIndex(x => x.SyncKey).IsUnique().HasDatabaseName("ux_system_sync_state_sync_key");

        var jp = modelBuilder.Entity<JobPoState>();
        jp.ToTable("job_po_state");
        jp.HasKey(x => x.Id);
        jp.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jp.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jp.Property(x => x.CorrelationId).HasColumnName("correlation_id").IsRequired();
        jp.Property(x => x.CounterpartyEmail).HasColumnName("counterparty_email");
        jp.Property(x => x.Status).HasColumnName("status").HasConversion<string>().IsRequired();
        jp.Property(x => x.RequiresAdminAttention).HasColumnName("requires_admin_attention").HasDefaultValue(false);
        jp.Property(x => x.AdminAttentionReason).HasColumnName("admin_attention_reason");
        jp.Property(x => x.ConfirmedPoNumber).HasColumnName("confirmed_po_number");
        jp.Property(x => x.DetectedPoNumber).HasColumnName("detected_po_number");
        jp.Property(x => x.FirstRequestSentAt).HasColumnName("first_request_sent_at");
        jp.Property(x => x.LastRequestSentAt).HasColumnName("last_request_sent_at");
        jp.Property(x => x.LastFollowUpSentAt).HasColumnName("last_follow_up_sent_at");
        jp.Property(x => x.LastSupplierReplyAt).HasColumnName("last_supplier_reply_at");
        jp.Property(x => x.LastSupplierReplyMessageId).HasColumnName("last_supplier_reply_message_id");
        jp.Property(x => x.FollowUpCount).HasColumnName("follow_up_count").HasDefaultValue(0);
        jp.Property(x => x.FollowUpEnabled).HasColumnName("follow_up_enabled").HasDefaultValue(true);
        jp.Property(x => x.NextFollowUpDueAt).HasColumnName("next_follow_up_due_at");
        jp.Property(x => x.LastSyncedAt).HasColumnName("last_synced_at");
        jp.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jp.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jp.HasIndex(x => x.JobId).IsUnique().HasDatabaseName("ux_job_po_state_job_id");
        jp.HasIndex(x => x.Status).HasDatabaseName("ix_job_po_state_status");
        jp.HasIndex(x => x.CorrelationId).HasDatabaseName("ix_job_po_state_correlation_id");
        jp.HasIndex(x => x.NextFollowUpDueAt).HasDatabaseName("ix_job_po_state_next_follow_up_due_at");

        var s = modelBuilder.Entity<Staff>();
        s.ToTable("staff");
        s.HasKey(x => x.Id);
        s.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        s.Property(x => x.Name).HasColumnName("name").IsRequired();
        s.Property(x => x.CostRate).HasColumnName("cost_rate").IsRequired();
        s.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        s.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var wl = modelBuilder.Entity<WorklogEntry>();
        wl.ToTable("worklogs");
        wl.HasKey(x => x.Id);
        wl.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        wl.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        wl.Property(x => x.StaffId).HasColumnName("staff_id").IsRequired();
        wl.Property(x => x.ServiceType)
            .HasColumnName("service_type")
            .HasColumnType("worklog_service_type")
            .IsRequired();
        wl.Property(x => x.WorkDate).HasColumnName("work_date").IsRequired();
        wl.Property(x => x.StartTime).HasColumnName("start_time").IsRequired();
        wl.Property(x => x.EndTime).HasColumnName("end_time").IsRequired();
        wl.Property(x => x.AdminNote).HasColumnName("admin_note");
        wl.Property(x => x.Source).HasColumnName("source").IsRequired();
        wl.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        wl.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        wl.HasOne(x => x.Staff).WithMany().HasForeignKey(x => x.StaffId).OnDelete(DeleteBehavior.Restrict);
        wl.HasOne(x => x.Job).WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);

        var t = modelBuilder.Entity<Tag>();
        t.ToTable("tags");
        t.HasKey(x => x.Id);
        t.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        t.Property(x => x.Name).HasColumnName("name").IsRequired();
        t.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        t.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        t.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var jt = modelBuilder.Entity<JobTag>();
        jt.ToTable("job_tags");
        jt.HasKey(x => new { x.JobId, x.TagId });
        jt.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jt.Property(x => x.TagId).HasColumnName("tag_id").IsRequired();
        jt.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var w = modelBuilder.Entity<WofService>();
        w.ToTable("wof_service");
        w.HasKey(x => x.Id);
        w.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        w.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        w.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        w.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

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
        // wci.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        // var wr = modelBuilder.Entity<WofResult>();
        // wr.ToTable("wof_results");
        // wr.HasKey(x => x.Id);
        // wr.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        // wr.Property(x => x.WofId).HasColumnName("wof_id").IsRequired();
        // wr.Property(x => x.Result).HasColumnName("result").IsRequired();
        // wr.Property(x => x.RecheckExpiryDate).HasColumnName("recheck_expiry_date");
        // wr.Property(x => x.FailReasonId).HasColumnName("fail_reason_id");
        // wr.Property(x => x.Note).HasColumnName("note");
        // wr.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var wfr = modelBuilder.Entity<WofFailReason>();
        wfr.ToTable("wof_fail_reasons");
        wfr.HasKey(x => x.Id);
        wfr.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        wfr.Property(x => x.Code).HasColumnName("code");
        wfr.Property(x => x.Label).HasColumnName("label").IsRequired();
        wfr.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        wfr.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        wfr.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

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
        jwr.Property(x => x.ImportedAt).HasColumnName("imported_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jwr.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var jps = modelBuilder.Entity<JobPartsService>();
        jps.ToTable("job_parts_services");
        jps.HasKey(x => x.Id);
        jps.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jps.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jps.Property(x => x.Description).HasColumnName("description").IsRequired();
        jps.Property(x => x.Status).HasColumnName("status").HasColumnType("parts_service_status").IsRequired();
        jps.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jps.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var jpn = modelBuilder.Entity<JobPartsNote>();
        jpn.ToTable("job_parts_notes");
        jpn.HasKey(x => x.Id);
        jpn.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jpn.Property(x => x.PartsServiceId).HasColumnName("parts_service_id").IsRequired();
        jpn.Property(x => x.Note).HasColumnName("note").IsRequired();
        jpn.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jpn.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var jms = modelBuilder.Entity<JobMechService>();
        jms.ToTable("job_mech_services");
        jms.HasKey(x => x.Id);
        jms.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jms.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jms.Property(x => x.Description).HasColumnName("description").IsRequired();
        jms.Property(x => x.Cost).HasColumnName("cost").HasColumnType("numeric");
        jms.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jms.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var jpt = modelBuilder.Entity<JobPaintService>();
        jpt.ToTable("job_paint_services");
        jpt.HasKey(x => x.Id);
        jpt.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jpt.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jpt.Property(x => x.Status).HasColumnName("status").IsRequired();
        jpt.Property(x => x.CurrentStage).HasColumnName("current_stage").HasDefaultValue(-1);
        jpt.Property(x => x.Panels).HasColumnName("panels").HasDefaultValue(1);
        jpt.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jpt.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var jss = modelBuilder.Entity<JobServiceSelection>();
        jss.ToTable("job_service_selections");
        jss.HasKey(x => x.Id);
        jss.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jss.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jss.Property(x => x.ServiceCatalogItemId).HasColumnName("service_catalog_item_id").IsRequired();
        jss.Property(x => x.ServiceNameSnapshot).HasColumnName("service_name_snapshot").IsRequired();
        jss.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jss.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jss.HasIndex(x => x.JobId).HasDatabaseName("ix_job_service_selections_job_id");
        jss.HasIndex(x => x.ServiceCatalogItemId).HasDatabaseName("ix_job_service_selections_service_catalog_item_id");
        jss.HasOne(x => x.Job)
            .WithMany()
            .HasForeignKey(x => x.JobId)
            .OnDelete(DeleteBehavior.Cascade);
        jss.HasOne(x => x.ServiceCatalogItem)
            .WithMany()
            .HasForeignKey(x => x.ServiceCatalogItemId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private void NormalizeDateTimes()
    {
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified))
                continue;

            foreach (var prop in entry.Properties)
            {
                if (prop.Metadata.ClrType == typeof(DateTime))
                {
                    var dt = (DateTime)prop.CurrentValue!;
                    if (dt == default && !string.IsNullOrWhiteSpace(prop.Metadata.GetDefaultValueSql()))
                        continue;

                    prop.CurrentValue = DateTimeHelper.NormalizeUtc(dt);
                }
                else if (prop.Metadata.ClrType == typeof(DateTime?))
                {
                    if (prop.CurrentValue is not DateTime dt)
                        continue;

                    if (dt == default && !string.IsNullOrWhiteSpace(prop.Metadata.GetDefaultValueSql()))
                        continue;

                    prop.CurrentValue = DateTimeHelper.NormalizeUtc(dt);
                }
            }
        }
    }
}
