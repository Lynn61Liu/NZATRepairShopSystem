using System.ComponentModel.DataAnnotations.Schema;

namespace Workshop.Api.Models
{
    // 专门用于内部采购的物料表，彻底脱离原有的 Product
    public class WorkshopMaterial
    {
        public int Id { get; set; }
        public string? Code { get; set; } 
        public string Name { get; set; } = string.Empty;
        
        public int? CategoryId { get; set; }
        public Category? Category { get; set; }
        
        public int? SupplierId { get; set; }
        public Supplier? Supplier { get; set; }

        public string? ImageUrl { get; set; }
        public string? Specification { get; set; }
        public string? Location { get; set; }
        public string Unit { get; set; } = "个";

        [Column(TypeName = "decimal(18,2)")]
        public decimal PurchasePrice { get; set; } = 0; 

        public int CurrentStock { get; set; }
        public int MinStockAlert { get; set; }
        public int InTransitStock { get; set; }

        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
