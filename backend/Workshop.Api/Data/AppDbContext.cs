using Microsoft.EntityFrameworkCore;
using Workshop.Api.Features.EStationMonitoring.Models;
using Workshop.Api.Features.JobLightBindings.Models;
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
    public DbSet<PaymarkTransaction> PaymarkTransactions => Set<PaymarkTransaction>();
    public DbSet<PaymarkQuickJobOption> PaymarkQuickJobOptions => Set<PaymarkQuickJobOption>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<XeroTokenRecord> XeroTokenRecords => Set<XeroTokenRecord>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
    public DbSet<ServiceCatalogItem> ServiceCatalogItems => Set<ServiceCatalogItem>();
    public DbSet<SystemSyncState> SystemSyncStates => Set<SystemSyncState>();
    public DbSet<CarOnYardReportSettings> CarOnYardReportSettings => Set<CarOnYardReportSettings>();
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
    public DbSet<JobWofRecordItem> JobWofRecordItems => Set<JobWofRecordItem>();
    public DbSet<WofCalendarRecord> WofCalendarRecords => Set<WofCalendarRecord>();
    public DbSet<JobPartsService> JobPartsServices => Set<JobPartsService>();
    public DbSet<JobPartsNote> JobPartsNotes => Set<JobPartsNote>();
    public DbSet<JobMechService> JobMechServices => Set<JobMechService>();
    public DbSet<JobMechWorkflow> JobMechWorkflows => Set<JobMechWorkflow>();
    public DbSet<JobPaintService> JobPaintServices => Set<JobPaintService>();
    public DbSet<JobServiceSelection> JobServiceSelections => Set<JobServiceSelection>();
    public DbSet<Staff> Staff => Set<Staff>();
    public DbSet<WorklogEntry> WorklogEntries => Set<WorklogEntry>();
    public DbSet<CourtesyCarVehicle> CourtesyCarVehicles => Set<CourtesyCarVehicle>();
    public DbSet<CourtesyCarAgreement> CourtesyCarAgreements => Set<CourtesyCarAgreement>();
    public DbSet<CourtesyCarAgreementEvent> CourtesyCarAgreementEvents => Set<CourtesyCarAgreementEvent>();
    public DbSet<LightStation> LightStations => Set<LightStation>();
    public DbSet<LightTag> LightTags => Set<LightTag>();
    public DbSet<MqttMessageLog> MqttMessageLogs => Set<MqttMessageLog>();
    public DbSet<JobLightBinding> JobLightBindings => Set<JobLightBinding>();
    

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
        modelBuilder.HasPostgresEnum<WofItemStatus>("public", "wof_item_status");
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
        e.Property(x => x.LicenceExpiry).HasColumnName("licence_expiry");
        e.Property(x => x.RucLicenceNumber).HasColumnName("ruc_licence_number");
        e.Property(x => x.RucEndDistance).HasColumnName("ruc_end_distance");
        e.Property(x => x.Odometer).HasColumnName("odometer");
        e.Property(x => x.NzFirstRegistration).HasColumnName("nz_first_registration");
        e.Property(x => x.CustomerId).HasColumnName("customer_id");
        e.HasOne(x => x.Customer)
            .WithMany()
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.SetNull);

        if (Database.ProviderName?.Contains("InMemory", StringComparison.OrdinalIgnoreCase) == true)
        {
            e.Ignore(x => x.RawJson);
        }
        else
        {
            // ✅ raw_json jsonb
            e.Property(x => x.RawJson).HasColumnName("raw_json").HasColumnType("jsonb");
        }

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
        gm.Property(x => x.Source).HasColumnName("source");
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
        j.Property(x => x.IsOnYardOverride).HasColumnName("is_on_yard_override");
        j.Property(x => x.UseServiceCatalogMapping).HasColumnName("use_service_catalog_mapping").HasDefaultValue(false);
        j.Property(x => x.PoNumber).HasColumnName("po_number");
        j.Property(x => x.InvoiceReference).HasColumnName("invoice_reference");
        j.Property(x => x.VehicleId).HasColumnName("vehicle_id");
        j.Property(x => x.CustomerId).HasColumnName("customer_id");
        j.Property(x => x.Notes).HasColumnName("notes");
        j.Property(x => x.PrivateNotes).HasColumnName("private_notes");
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
        ji.Property(x => x.PdfContent).HasColumnName("pdf_content").HasColumnType("bytea");
        ji.Property(x => x.PdfPreviewContent).HasColumnName("pdf_preview_content").HasColumnType("bytea");
        ji.Property(x => x.PdfFilePath).HasColumnName("pdf_file_path");
        ji.Property(x => x.PdfPreviewPath).HasColumnName("pdf_preview_path");
        ji.Property(x => x.PdfDownloadedAt).HasColumnName("pdf_downloaded_at");
        ji.Property(x => x.PdfPreviewGeneratedAt).HasColumnName("pdf_preview_generated_at");
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

        var paymark = modelBuilder.Entity<PaymarkTransaction>();
        paymark.ToTable("paymark_transactions");
        paymark.HasKey(x => x.Id);
        paymark.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        paymark.Property(x => x.TransactionKey).HasColumnName("transaction_key").IsRequired();
        paymark.Property(x => x.CardAcceptorIdCode).HasColumnName("card_acceptor_id_code").IsRequired();
        paymark.Property(x => x.TerminalId).HasColumnName("terminal_id").IsRequired();
        paymark.Property(x => x.RetrievalRef).HasColumnName("retrieval_ref");
        paymark.Property(x => x.TransactionNumber).HasColumnName("transaction_number");
        paymark.Property(x => x.TransactionTimeUtc).HasColumnName("transaction_time_utc");
        paymark.Property(x => x.SettlementDate).HasColumnName("settlement_date");
        paymark.Property(x => x.CardLogo).HasColumnName("card_logo");
        paymark.Property(x => x.Suffix).HasColumnName("suffix");
        paymark.Property(x => x.TranType).HasColumnName("tran_type");
        paymark.Property(x => x.TransactionAmount).HasColumnName("transaction_amount");
        paymark.Property(x => x.PurchaseAmount).HasColumnName("purchase_amount");
        paymark.Property(x => x.CashoutAmount).HasColumnName("cashout_amount");
        paymark.Property(x => x.Status).HasColumnName("status");
        paymark.Property(x => x.ActionCode).HasColumnName("action_code");
        paymark.Property(x => x.Bin).HasColumnName("bin");
        paymark.Property(x => x.MatchedJobId).HasColumnName("matched_job_id");
        paymark.Property(x => x.LocalNote).HasColumnName("local_note");
        paymark.Property(x => x.RawPayloadJson).HasColumnName("raw_payload_json").HasColumnType("jsonb");
        paymark.Property(x => x.ImportedAt).HasColumnName("imported_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        paymark.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        paymark.HasIndex(x => x.TransactionKey).IsUnique().HasDatabaseName("ux_paymark_transactions_transaction_key");
        paymark.HasIndex(x => x.TransactionTimeUtc).HasDatabaseName("ix_paymark_transactions_transaction_time_utc");
        paymark.HasIndex(x => x.MatchedJobId).HasDatabaseName("ix_paymark_transactions_matched_job_id");
        paymark.HasOne<Job>().WithMany().HasForeignKey(x => x.MatchedJobId).OnDelete(DeleteBehavior.SetNull);

        var paymarkQuickJob = modelBuilder.Entity<PaymarkQuickJobOption>();
        paymarkQuickJob.ToTable("paymark_quick_job_options");
        paymarkQuickJob.HasKey(x => x.Id);
        paymarkQuickJob.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        paymarkQuickJob.Property(x => x.Code).HasColumnName("code").IsRequired();
        paymarkQuickJob.Property(x => x.Label).HasColumnName("label").IsRequired();
        paymarkQuickJob.Property(x => x.ServiceType).HasColumnName("service_type").IsRequired();
        paymarkQuickJob.Property(x => x.Description).HasColumnName("description").IsRequired();
        paymarkQuickJob.Property(x => x.XeroItemCode).HasColumnName("xero_item_code");
        paymarkQuickJob.Property(x => x.AccountCode).HasColumnName("account_code");
        paymarkQuickJob.Property(x => x.TaxType).HasColumnName("tax_type");
        paymarkQuickJob.Property(x => x.DefaultAmountInclGst).HasColumnName("default_amount_incl_gst");
        paymarkQuickJob.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        paymarkQuickJob.Property(x => x.SortOrder).HasColumnName("sort_order").HasDefaultValue(0);
        paymarkQuickJob.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        paymarkQuickJob.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        paymarkQuickJob.HasIndex(x => x.Code).IsUnique().HasDatabaseName("ux_paymark_quick_job_options_code");
        paymarkQuickJob.HasIndex(x => x.SortOrder).HasDatabaseName("ix_paymark_quick_job_options_sort_order");

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

        var coyrs = modelBuilder.Entity<CarOnYardReportSettings>();
        coyrs.ToTable("car_on_yard_report_settings");
        coyrs.HasKey(x => x.Id);
        coyrs.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        coyrs.Property(x => x.Enabled).HasColumnName("enabled").HasDefaultValue(true);
        coyrs.Property(x => x.Recipients).HasColumnName("recipients").IsRequired();
        coyrs.Property(x => x.SendTimes).HasColumnName("send_times").IsRequired();
        coyrs.Property(x => x.Subject).HasColumnName("subject").IsRequired();
        coyrs.Property(x => x.TimeZoneId).HasColumnName("time_zone_id").IsRequired();
        coyrs.Property(x => x.LastSentSlotKey).HasColumnName("last_sent_slot_key");
        coyrs.Property(x => x.LastSentAtUtc).HasColumnName("last_sent_at_utc");
        coyrs.Property(x => x.LastError).HasColumnName("last_error");
        coyrs.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        coyrs.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var jp = modelBuilder.Entity<JobPoState>();
        jp.ToTable("job_po_state");
        jp.HasKey(x => x.Id);
        jp.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jp.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jp.Property(x => x.CorrelationId).HasColumnName("correlation_id").IsRequired();
        jp.Property(x => x.CounterpartyEmail).HasColumnName("counterparty_email");
        jp.Property(x => x.GmailDraftId).HasColumnName("gmail_draft_id");
        jp.Property(x => x.GmailDraftUpdatedAt).HasColumnName("gmail_draft_updated_at");
        jp.Property(x => x.Status).HasColumnName("status").HasConversion<string>().IsRequired();
        jp.Property(x => x.RequiresAdminAttention).HasColumnName("requires_admin_attention").HasDefaultValue(false);
        jp.Property(x => x.AdminAttentionReason).HasColumnName("admin_attention_reason");
        jp.Property(x => x.ConfirmedPoNumber).HasColumnName("confirmed_po_number");
        jp.Property(x => x.DetectedPoNumber).HasColumnName("detected_po_number");
        jp.Property(x => x.PendingPoNumber).HasColumnName("pending_po_number");
        jp.Property(x => x.ConfirmationStatus).HasColumnName("confirmation_status");
        jp.Property(x => x.ConfirmationNote).HasColumnName("confirmation_note");
        jp.Property(x => x.ConfirmationLastAttemptAt).HasColumnName("confirmation_last_attempt_at");
        jp.Property(x => x.XeroEmailSentAt).HasColumnName("xero_email_sent_at");
        jp.Property(x => x.SentSource).HasColumnName("sent_source");
        jp.Property(x => x.ManuallyMarkedSentAt).HasColumnName("manually_marked_sent_at");
        jp.Property(x => x.CompletedAt).HasColumnName("completed_at");
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
        s.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true);
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
        jwr.Property(x => x.E1).HasColumnName("e1").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E2).HasColumnName("e2").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E3).HasColumnName("e3").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E5).HasColumnName("e5").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E6).HasColumnName("e6").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E7).HasColumnName("e7").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E8).HasColumnName("e8").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E9).HasColumnName("e9").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E10).HasColumnName("e10").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E11).HasColumnName("e11").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E12).HasColumnName("e12").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E13).HasColumnName("e13").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E14).HasColumnName("e14").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E15).HasColumnName("e15").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E16).HasColumnName("e16").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E17).HasColumnName("e17").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E18).HasColumnName("e18").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E19).HasColumnName("e19").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.E20).HasColumnName("e20").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I1).HasColumnName("i1").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I2).HasColumnName("i2").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I3).HasColumnName("i3").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I4).HasColumnName("i4").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I5).HasColumnName("i5").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I6).HasColumnName("i6").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I7).HasColumnName("i7").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I8).HasColumnName("i8").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I9).HasColumnName("i9").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I10).HasColumnName("i10").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I11).HasColumnName("i11").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I12).HasColumnName("i12").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.I13).HasColumnName("i13").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C1).HasColumnName("c1").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C2).HasColumnName("c2").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C3).HasColumnName("c3").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C4).HasColumnName("c4").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C5).HasColumnName("c5").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C6).HasColumnName("c6").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C7).HasColumnName("c7").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C8).HasColumnName("c8").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C9).HasColumnName("c9").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C10).HasColumnName("c10").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C11).HasColumnName("c11").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.C12).HasColumnName("c12").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.R1).HasColumnName("r1").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.R2).HasColumnName("r2").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.R3).HasColumnName("r3").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.R4).HasColumnName("r4").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.NA).IsRequired();
        jwr.Property(x => x.R5).HasColumnName("r5").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.U1).HasColumnName("u1").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.NA).IsRequired();
        jwr.Property(x => x.U2).HasColumnName("u2").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.NA).IsRequired();
        jwr.Property(x => x.U3).HasColumnName("u3").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.NA).IsRequired();
        jwr.Property(x => x.U4).HasColumnName("u4").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.U5).HasColumnName("u5").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.U6).HasColumnName("u6").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.U7).HasColumnName("u7").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.U8).HasColumnName("u8").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwr.Property(x => x.Cfl).HasColumnName("cfl").HasColumnType("numeric");
        jwr.Property(x => x.Cfr).HasColumnName("cfr").HasColumnType("numeric");
        jwr.Property(x => x.Crl).HasColumnName("crl").HasColumnType("numeric");
        jwr.Property(x => x.Crr).HasColumnName("crr").HasColumnType("numeric");
        jwr.Property(x => x.Pbrl).HasColumnName("pbrl").HasColumnType("numeric");
        jwr.Property(x => x.Pbrr).HasColumnName("pbrr").HasColumnType("numeric");

        var jwri = modelBuilder.Entity<JobWofRecordItem>();
        jwri.ToTable("job_wof_record_items");
        jwri.HasKey(x => x.Id);
        jwri.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jwri.Property(x => x.JobWofRecordId).HasColumnName("job_wof_record_id").IsRequired();
        jwri.Property(x => x.Code).HasColumnName("code").IsRequired();
        jwri.Property(x => x.Label).HasColumnName("label").IsRequired();
        jwri.Property(x => x.Status).HasColumnName("status").HasColumnType("wof_item_status").HasDefaultValue(WofItemStatus.Pass).IsRequired();
        jwri.Property(x => x.FailReasonId).HasColumnName("fail_reason_id");
        jwri.Property(x => x.SortOrder).HasColumnName("sort_order");
        jwri.Property(x => x.InputValue).HasColumnName("input_value");
        jwri.Property(x => x.Note).HasColumnName("note");
        jwri.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jwri.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jwri.HasIndex(x => x.JobWofRecordId).HasDatabaseName("ix_job_wof_record_items_record_id");
        jwri.HasIndex(x => x.FailReasonId).HasDatabaseName("ix_job_wof_record_items_fail_reason_id");
        jwri.HasIndex(x => new { x.JobWofRecordId, x.Code }).IsUnique().HasDatabaseName("ux_job_wof_record_items_record_code");
        jwri.HasOne<JobWofRecord>().WithMany().HasForeignKey(x => x.JobWofRecordId).OnDelete(DeleteBehavior.Cascade);
        jwri.HasOne<WofFailReason>().WithMany().HasForeignKey(x => x.FailReasonId).OnDelete(DeleteBehavior.SetNull);

        var wcr = modelBuilder.Entity<WofCalendarRecord>();
        wcr.ToTable("wof_calendar_records");
        wcr.HasKey(x => x.Id);
        wcr.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        wcr.Property(x => x.SourceFile).HasColumnName("source_file").IsRequired();
        wcr.Property(x => x.ExcelRowNo).HasColumnName("excel_row_no").IsRequired();
        wcr.Property(x => x.JobId).HasColumnName("job_id");
        wcr.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
        wcr.Property(x => x.Rego).HasColumnName("rego").IsRequired();
        wcr.Property(x => x.MakeModel).HasColumnName("make_model");
        wcr.Property(x => x.RecordState).HasColumnName("record_state").HasColumnType("wof_record_state").IsRequired();
        wcr.Property(x => x.ImportedAt).HasColumnName("imported_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        wcr.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        wcr.HasIndex(x => new { x.SourceFile, x.ExcelRowNo }).IsUnique();
        wcr.HasIndex(x => x.OccurredAt);

        var jps = modelBuilder.Entity<JobPartsService>();
        jps.ToTable("job_parts_services");
        jps.HasKey(x => x.Id);
        jps.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jps.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jps.Property(x => x.Description).HasColumnName("description").IsRequired();
        jps.Property(x => x.Status).HasColumnName("status").HasColumnType("parts_service_status").IsRequired();
        jps.Property(x => x.CompletedAt).HasColumnName("completed_at");
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

        var jmw = modelBuilder.Entity<JobMechWorkflow>();
        jmw.ToTable("job_mech_workflows");
        jmw.HasKey(x => x.Id);
        jmw.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jmw.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        jmw.Property(x => x.Status).HasColumnName("status").IsRequired();
        jmw.Property(x => x.PartsArrivedAt).HasColumnName("parts_arrived_at");
        jmw.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jmw.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jmw.HasIndex(x => x.JobId).IsUnique().HasDatabaseName("ux_job_mech_workflows_job_id");
        jmw.HasOne<Job>().WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);

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

        var ccv = modelBuilder.Entity<CourtesyCarVehicle>();
        ccv.ToTable("courtesy_cars");
        ccv.HasKey(x => x.Id);
        ccv.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        ccv.Property(x => x.Plate).HasColumnName("plate").IsRequired();
        ccv.HasIndex(x => x.Plate).IsUnique().HasDatabaseName("ux_courtesy_cars_plate");
        ccv.Property(x => x.Make).HasColumnName("make");
        ccv.Property(x => x.Model).HasColumnName("model");
        ccv.Property(x => x.Color).HasColumnName("color");
        ccv.Property(x => x.Year).HasColumnName("year");
        ccv.Property(x => x.Mileage).HasColumnName("mileage");
        ccv.Property(x => x.FuelLevel).HasColumnName("fuel_level");
        ccv.Property(x => x.AgreedVehicleValue).HasColumnName("agreed_vehicle_value").HasColumnType("numeric").HasDefaultValue(0m);
        ccv.Property(x => x.Status).HasColumnName("status").HasDefaultValue("available");
        ccv.Property(x => x.Note).HasColumnName("note");
        ccv.Property(x => x.WofExpiry).HasColumnName("wof_expiry");
        ccv.Property(x => x.RegoExpiry).HasColumnName("rego_expiry");
        ccv.Property(x => x.LoanedAt).HasColumnName("loaned_at");
        ccv.Property(x => x.BorrowerName).HasColumnName("borrower_name");
        ccv.Property(x => x.BorrowerPhone).HasColumnName("borrower_phone");
        ccv.Property(x => x.AttachmentsJson).HasColumnName("attachments_json").HasColumnType("jsonb");
        ccv.Property(x => x.ReturnedAt).HasColumnName("returned_at");
        ccv.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ccv.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");

        var cca = modelBuilder.Entity<CourtesyCarAgreement>();
        cca.ToTable("courtesy_car_agreements");
        cca.HasKey(x => x.Id);
        cca.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        cca.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
        cca.Property(x => x.VehicleId).HasColumnName("vehicle_id").IsRequired(false);
        cca.Property(x => x.CustomerId).HasColumnName("customer_id");
        cca.Property(x => x.Status).HasColumnName("status").HasDefaultValue("draft");
        cca.Property(x => x.CurrentStep).HasColumnName("current_step").HasDefaultValue("contact");
        cca.Property(x => x.JobVehiclePlate).HasColumnName("job_vehicle_plate");
        cca.Property(x => x.JobCustomerName).HasColumnName("job_customer_name");
        cca.Property(x => x.JobCustomerPhone).HasColumnName("job_customer_phone");
        cca.Property(x => x.JobCustomerEmail).HasColumnName("job_customer_email");
        cca.Property(x => x.JobCustomerAddress).HasColumnName("job_customer_address");
        cca.Property(x => x.ContactName).HasColumnName("contact_name");
        cca.Property(x => x.ContactPhone).HasColumnName("contact_phone");
        cca.Property(x => x.ContactEmail).HasColumnName("contact_email");
        cca.Property(x => x.ContactAddress).HasColumnName("contact_address");
        cca.Property(x => x.DriverLicenseNumber).HasColumnName("driver_license_number");
        cca.Property(x => x.DriverLicenseExpiry).HasColumnName("driver_license_expiry");
        cca.Property(x => x.EmergencyContactName).HasColumnName("emergency_contact_name");
        cca.Property(x => x.EmergencyContactPhone).HasColumnName("emergency_contact_phone");
        cca.Property(x => x.TermsConfirmed).HasColumnName("terms_confirmed").HasDefaultValue(false);
        cca.Property(x => x.SignatureName).HasColumnName("signature_name");
        cca.Property(x => x.VehiclePlate).HasColumnName("vehicle_plate");
        cca.Property(x => x.VehicleMake).HasColumnName("vehicle_make");
        cca.Property(x => x.VehicleModel).HasColumnName("vehicle_model");
        cca.Property(x => x.VehicleColor).HasColumnName("vehicle_color");
        cca.Property(x => x.VehicleYear).HasColumnName("vehicle_year");
        cca.Property(x => x.VehicleMileage).HasColumnName("vehicle_mileage");
        cca.Property(x => x.VehicleFuelLevel).HasColumnName("vehicle_fuel_level");
        cca.Property(x => x.AgreedVehicleValue).HasColumnName("agreed_vehicle_value").HasColumnType("numeric").HasDefaultValue(0m);
        cca.Property(x => x.VehicleWofExpiry).HasColumnName("vehicle_wof_expiry");
        cca.Property(x => x.VehicleRegoExpiry).HasColumnName("vehicle_rego_expiry");
        cca.Property(x => x.AttachmentsJson).HasColumnName("attachments_json").HasColumnType("jsonb");
        cca.Property(x => x.PdfFilePath).HasColumnName("pdf_file_path");
        cca.Property(x => x.PdfGeneratedAt).HasColumnName("pdf_generated_at");
        cca.Property(x => x.EmailSentAt).HasColumnName("email_sent_at");
        cca.Property(x => x.EmailTo).HasColumnName("email_to");
        cca.Property(x => x.EmailMessageId).HasColumnName("email_message_id");
        cca.Property(x => x.SubmittedAt).HasColumnName("submitted_at");
        cca.Property(x => x.ClosedAt).HasColumnName("closed_at");
        cca.Property(x => x.CancelledAt).HasColumnName("cancelled_at");
        cca.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        cca.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        cca.HasOne(x => x.Job)
            .WithMany()
            .HasForeignKey(x => x.JobId)
            .OnDelete(DeleteBehavior.Cascade);
        cca.HasOne(x => x.Vehicle)
            .WithMany()
            .HasForeignKey(x => x.VehicleId)
            .OnDelete(DeleteBehavior.SetNull);
        cca.HasOne(x => x.Customer)
            .WithMany()
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.SetNull);
        cca.HasIndex(x => x.JobId).HasDatabaseName("ix_courtesy_car_agreements_job_id");
        cca.HasIndex(x => x.VehicleId).HasDatabaseName("ix_courtesy_car_agreements_vehicle_id");
        cca.HasIndex(x => x.Status).HasDatabaseName("ix_courtesy_car_agreements_status");

        var ccae = modelBuilder.Entity<CourtesyCarAgreementEvent>();
        ccae.ToTable("courtesy_car_agreement_events");
        ccae.HasKey(x => x.Id);
        ccae.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        ccae.Property(x => x.CourtesyCarAgreementId).HasColumnName("courtesy_car_agreement_id").IsRequired();
        ccae.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
        ccae.Property(x => x.ActorType).HasColumnName("actor_type");
        ccae.Property(x => x.ActorName).HasColumnName("actor_name");
        ccae.Property(x => x.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb");
        ccae.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        ccae.HasIndex(x => x.CourtesyCarAgreementId).HasDatabaseName("ix_courtesy_car_agreement_events_agreement_id");
        ccae.HasOne(x => x.CourtesyCarAgreement)
            .WithMany(x => x.Events)
            .HasForeignKey(x => x.CourtesyCarAgreementId)
            .OnDelete(DeleteBehavior.Cascade);

        var lightStation = modelBuilder.Entity<LightStation>();
        lightStation.ToTable("light_stations");
        lightStation.HasKey(x => x.Id);
        lightStation.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        lightStation.Property(x => x.StationId).HasColumnName("station_id").HasMaxLength(32).IsRequired();
        lightStation.Property(x => x.Mac).HasColumnName("mac").HasMaxLength(64);
        lightStation.Property(x => x.Alias).HasColumnName("alias").HasMaxLength(160);
        lightStation.Property(x => x.IsOnline).HasColumnName("is_online").HasDefaultValue(false);
        lightStation.Property(x => x.LastHeartbeatAt).HasColumnName("last_heartbeat_at");
        lightStation.Property(x => x.ServerAddress).HasColumnName("server_address").HasMaxLength(255);
        lightStation.Property(x => x.FirmwareVersion).HasColumnName("firmware_version").HasMaxLength(80);
        lightStation.Property(x => x.TotalCount).HasColumnName("total_count");
        lightStation.Property(x => x.SendCount).HasColumnName("send_count");
        lightStation.Property(x => x.LastPayloadStatus).HasColumnName("last_payload_status").HasMaxLength(40).HasDefaultValue(EStationProcessingStatus.Processed);
        lightStation.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        lightStation.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        lightStation.HasIndex(x => x.StationId).IsUnique().HasDatabaseName("ux_light_stations_station_id");
        lightStation.HasIndex(x => x.LastHeartbeatAt).HasDatabaseName("ix_light_stations_last_heartbeat_at");

        var lightTag = modelBuilder.Entity<LightTag>();
        lightTag.ToTable("light_tags");
        lightTag.HasKey(x => x.Id);
        lightTag.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        lightTag.Property(x => x.TagId).HasColumnName("tag_id").HasMaxLength(32).IsRequired();
        lightTag.Property(x => x.StationId).HasColumnName("station_id").HasMaxLength(32);
        lightTag.Property(x => x.CurrentGroup).HasColumnName("current_group");
        lightTag.Property(x => x.CurrentColor).HasColumnName("current_color").HasMaxLength(40);
        lightTag.Property(x => x.IsLightOn).HasColumnName("is_light_on").HasDefaultValue(false);
        lightTag.Property(x => x.IsFlashing).HasColumnName("is_flashing");
        lightTag.Property(x => x.BatteryRaw).HasColumnName("battery_raw");
        lightTag.Property(x => x.BatteryVoltage).HasColumnName("battery_voltage").HasColumnType("numeric(4,1)");
        lightTag.Property(x => x.BatteryPercent).HasColumnName("battery_percent");
        lightTag.Property(x => x.RfPowerSend).HasColumnName("rf_power_send");
        lightTag.Property(x => x.RfPowerRecv).HasColumnName("rf_power_recv");
        lightTag.Property(x => x.FirmwareVersion).HasColumnName("firmware_version").HasMaxLength(80);
        lightTag.Property(x => x.LastResultType).HasColumnName("last_result_type");
        lightTag.Property(x => x.LastSeenAt).HasColumnName("last_seen_at");
        lightTag.Property(x => x.LastPayloadStatus).HasColumnName("last_payload_status").HasMaxLength(40).HasDefaultValue(EStationProcessingStatus.Processed);
        lightTag.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        lightTag.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        lightTag.HasIndex(x => x.TagId).IsUnique().HasDatabaseName("ux_light_tags_tag_id");
        lightTag.HasIndex(x => x.StationId).HasDatabaseName("ix_light_tags_station_id");
        lightTag.HasIndex(x => x.CurrentGroup).HasDatabaseName("ix_light_tags_current_group");
        lightTag.HasIndex(x => x.LastSeenAt).HasDatabaseName("ix_light_tags_last_seen_at");

        var mqttMessageLog = modelBuilder.Entity<MqttMessageLog>();
        mqttMessageLog.ToTable("mqtt_message_logs");
        mqttMessageLog.HasKey(x => x.Id);
        mqttMessageLog.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        mqttMessageLog.Property(x => x.Topic).HasColumnName("topic").HasMaxLength(512).IsRequired();
        mqttMessageLog.Property(x => x.Payload).HasColumnName("payload").HasColumnType("text").IsRequired();
        mqttMessageLog.Property(x => x.MessageType).HasColumnName("message_type").HasMaxLength(40).IsRequired();
        mqttMessageLog.Property(x => x.StationId).HasColumnName("station_id").HasMaxLength(32);
        mqttMessageLog.Property(x => x.TagId).HasColumnName("tag_id").HasMaxLength(32);
        mqttMessageLog.Property(x => x.ReceivedAt).HasColumnName("received_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        mqttMessageLog.Property(x => x.ProcessingStatus).HasColumnName("processing_status").HasMaxLength(40).IsRequired();
        mqttMessageLog.Property(x => x.ErrorMessage).HasColumnName("error_message");
        mqttMessageLog.HasIndex(x => x.ReceivedAt).HasDatabaseName("ix_mqtt_message_logs_received_at");
        mqttMessageLog.HasIndex(x => new { x.StationId, x.ReceivedAt }).HasDatabaseName("ix_mqtt_message_logs_station_received_at");
        mqttMessageLog.HasIndex(x => new { x.MessageType, x.ReceivedAt }).HasDatabaseName("ix_mqtt_message_logs_type_received_at");
        mqttMessageLog.HasIndex(x => new { x.ProcessingStatus, x.ReceivedAt }).HasDatabaseName("ix_mqtt_message_logs_status_received_at");

        var jobLightBinding = modelBuilder.Entity<JobLightBinding>();
        jobLightBinding.ToTable("job_light_bindings");
        jobLightBinding.HasKey(x => x.Id);
        jobLightBinding.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        jobLightBinding.Property(x => x.JobId).HasColumnName("job_id");
        jobLightBinding.Property(x => x.Plate).HasColumnName("plate").HasMaxLength(128).IsRequired();
        jobLightBinding.Property(x => x.StationId).HasColumnName("station_id").HasMaxLength(32).IsRequired();
        jobLightBinding.Property(x => x.TagId).HasColumnName("tag_id").HasMaxLength(32).IsRequired();
        jobLightBinding.Property(x => x.GroupNo).HasColumnName("group_no").IsRequired();
        jobLightBinding.Property(x => x.Status).HasColumnName("status").HasMaxLength(40).HasDefaultValue(LightBindingStatus.PendingBind).IsRequired();
        jobLightBinding.Property(x => x.FailureReason).HasColumnName("failure_reason");
        jobLightBinding.Property(x => x.LastResultAt).HasColumnName("last_result_at");
        jobLightBinding.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jobLightBinding.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("date_trunc('milliseconds', now())");
        jobLightBinding.HasIndex(x => x.JobId)
            .IsUnique()
            .HasFilter("status IN ('PendingBind', 'Bound')")
            .HasDatabaseName("ux_job_light_bindings_active_job_id");
        jobLightBinding.HasIndex(x => x.TagId)
            .IsUnique()
            .HasFilter("status IN ('PendingBind', 'Bound')")
            .HasDatabaseName("ux_job_light_bindings_active_tag_id");
        jobLightBinding.HasIndex(x => x.StationId).HasDatabaseName("ix_job_light_bindings_station_id");
        jobLightBinding.HasIndex(x => x.Status).HasDatabaseName("ix_job_light_bindings_status");
        jobLightBinding.HasIndex(x => x.UpdatedAt).HasDatabaseName("ix_job_light_bindings_updated_at");
        jobLightBinding.HasOne<Job>().WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);
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
