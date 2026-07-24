using Microsoft.EntityFrameworkCore;
using Workshop.Api.Models;

namespace Workshop.Api.Procurement
{
    public class ProcurementDbContext : DbContext
    {
        public ProcurementDbContext(DbContextOptions<ProcurementDbContext> options) : base(options) {}

        public DbSet<Category> Categories { get; set; }
        public DbSet<Supplier> Suppliers { get; set; }
        
        // 👇 用 WorkshopMaterials 替代之前的 Products
        public DbSet<WorkshopMaterial> WorkshopMaterials { get; set; }
        
        public DbSet<StaffRequest> StaffRequests { get; set; }
        public DbSet<StaffRequestItem> StaffRequestItems { get; set; }
        public DbSet<RestockOrder> RestockOrders { get; set; }
        public DbSet<RestockOrderItem> RestockOrderItems { get; set; }
        public DbSet<InventoryMovement> InventoryMovements { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            
            modelBuilder.Entity<Category>().ToTable("categories");
            modelBuilder.Entity<Supplier>().ToTable("suppliers");
            modelBuilder.Entity<StaffRequest>().ToTable("staff_requests");
            modelBuilder.Entity<StaffRequestItem>().ToTable("staff_request_items");
            modelBuilder.Entity<RestockOrder>().ToTable("restock_orders");
            modelBuilder.Entity<RestockOrderItem>().ToTable("restock_order_items");
            modelBuilder.Entity<InventoryMovement>().ToTable("inventory_movements");
            
            // 👇 映射新的物料表
            modelBuilder.Entity<WorkshopMaterial>().ToTable("workshop_materials");

            modelBuilder.Entity<Category>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.Name).HasColumnName("name");
                e.Property(p => p.ParentId).HasColumnName("parent_id");
                e.Property(p => p.IsTool).HasColumnName("is_tool");
            });

            modelBuilder.Entity<Supplier>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.Name).HasColumnName("name");
                e.Property(p => p.ContactName).HasColumnName("contact_name");
                e.Property(p => p.ContactPhone).HasColumnName("contact_phone");
                e.Property(p => p.Notes).HasColumnName("notes");
            });

            // 👇 新的物料字段映射
            modelBuilder.Entity<WorkshopMaterial>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.Code).HasColumnName("code");
                e.Property(p => p.CategoryId).HasColumnName("category_id");
                e.Property(p => p.SupplierId).HasColumnName("supplier_id");
                e.Property(p => p.Name).HasColumnName("name");
                e.Property(p => p.ImageUrl).HasColumnName("image_url");
                e.Property(p => p.Specification).HasColumnName("specification");
                e.Property(p => p.Location).HasColumnName("location");
                e.Property(p => p.Unit).HasColumnName("unit");
                e.Property(p => p.PurchasePrice).HasColumnName("purchase_price");
                e.Property(p => p.CurrentStock).HasColumnName("current_stock").IsConcurrencyToken();
                e.Property(p => p.MinStockAlert).HasColumnName("min_stock_alert");
                e.Property(p => p.InTransitStock).HasColumnName("in_transit_stock").IsConcurrencyToken();
                e.Property(p => p.IsActive).HasColumnName("is_active");
                e.Property(p => p.CreatedAt).HasColumnName("created_at");
            });

            modelBuilder.Entity<StaffRequest>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.StaffName).HasColumnName("staff_name");
                e.Property(p => p.Notes).HasColumnName("notes");
                e.Property(p => p.Status).HasColumnName("status").IsConcurrencyToken();
                e.Property(p => p.CreatedAt).HasColumnName("created_at");
            });

            modelBuilder.Entity<StaffRequestItem>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.RequestId).HasColumnName("request_id");
                e.Property(p => p.MaterialId).HasColumnName("material_id"); // 关联修改
                e.Property(p => p.Quantity).HasColumnName("quantity");
            });

            modelBuilder.Entity<RestockOrder>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.OrderNumber).HasColumnName("order_number");
                e.Property(p => p.SupplierId).HasColumnName("supplier_id");
                e.Property(p => p.Status).HasColumnName("status");
                e.Property(p => p.CreatedAt).HasColumnName("created_at");
                e.Property(p => p.ExpectedDate).HasColumnName("expected_date");
            });

            modelBuilder.Entity<RestockOrderItem>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.RestockOrderId).HasColumnName("restock_order_id");
                e.Property(p => p.MaterialId).HasColumnName("material_id"); // 关联修改
                e.Property(p => p.Quantity).HasColumnName("quantity");
                e.Property(p => p.ReceivedQuantity).HasColumnName("received_quantity");
            });

            modelBuilder.Entity<InventoryMovement>(e => {
                e.Property(p => p.Id).HasColumnName("id");
                e.Property(p => p.MaterialId).HasColumnName("material_id");
                e.Property(p => p.PreviousStock).HasColumnName("previous_stock");
                e.Property(p => p.NewStock).HasColumnName("new_stock");
                e.Property(p => p.QuantityDelta).HasColumnName("quantity_delta");
                e.Property(p => p.MovementType).HasColumnName("movement_type").HasMaxLength(32);
                e.Property(p => p.Source).HasColumnName("source").HasMaxLength(64);
                e.Property(p => p.SourceFile).HasColumnName("source_file").HasMaxLength(255);
                e.Property(p => p.Note).HasColumnName("note").HasMaxLength(1000);
                e.Property(p => p.OccurredAt).HasColumnName("occurred_at");

                e.HasOne(p => p.Material)
                    .WithMany()
                    .HasForeignKey(p => p.MaterialId)
                    .OnDelete(DeleteBehavior.Restrict);

                e.HasIndex(p => new { p.MaterialId, p.OccurredAt, p.Id })
                    .IsDescending(false, true, true)
                    .HasDatabaseName("ix_inventory_movements_material_occurred_id");

                e.HasIndex(p => new { p.OccurredAt, p.MaterialId })
                    .IsDescending(true, false)
                    .HasFilter("movement_type = 'Stocktake' AND quantity_delta < 0")
                    .HasDatabaseName("ix_inventory_movements_stocktake_usage");
            });
        }
    }
}
