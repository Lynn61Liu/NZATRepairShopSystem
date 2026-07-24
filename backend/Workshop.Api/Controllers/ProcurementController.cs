using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Procurement;
using Workshop.Api.Models;
using System.Globalization; 
using CsvHelper;
using CsvHelper.Configuration;
using System.Text;

namespace Workshop.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProcurementController : ControllerBase
    {
        private readonly ProcurementDbContext _context;

        public ProcurementController(ProcurementDbContext context)
        {
            _context = context;
        }

        // 技能1：获取所有可用商品列表 (给师傅看)
        [HttpGet("products")]
        public async Task<IActionResult> GetProducts()
        {
            var materials = await _context.WorkshopMaterials
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .Where(p => p.IsActive)
                .OrderBy(p => p.Id) 
                .Select(p => new {
                    p.Id,
                    p.Code,
                    p.Name,
                    p.Specification,
                    p.Location,
                    p.Unit,
                    p.CurrentStock,
                    p.InTransitStock,
                    p.MinStockAlert,
                    p.ImageUrl,
                    p.PurchasePrice,
                    CategoryId = p.CategoryId,
                    CategoryName = p.Category != null ? p.Category.Name : "未分类",
                    SupplierId = p.SupplierId,
                    SupplierName = p.Supplier != null ? p.Supplier.Name : "未指定供应商"
                })
                .ToListAsync();

            return Ok(materials);
        }

        // 技能1.5：获取供应商列表 (给下拉框用)
        [HttpGet("suppliers")]
        public async Task<IActionResult> GetSuppliers()
        {
            var suppliers = await _context.Suppliers.ToListAsync();
            return Ok(suppliers);
        }

        // 技能6：手动新建单个物料 (✅ 修复：支持保存分类)
        [HttpPost("products")]
        public async Task<IActionResult> CreateProduct([FromBody] ProductEditDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("物料名称不能为空");

            // 👇 [引入新代码功能]：自动处理分类（如果是前端传来的"工具"，自动建一个工具分类）
            int? categoryId = null;
            if (!string.IsNullOrWhiteSpace(dto.CategoryName))
            {
                var category = await _context.Categories.FirstOrDefaultAsync(c => c.Name == dto.CategoryName);
                if (category == null)
                {
                    category = new Category { Name = dto.CategoryName, IsTool = dto.CategoryName.Contains("工具") };
                    _context.Categories.Add(category);
                    await _context.SaveChangesAsync();
                }
                categoryId = category.Id;
            }
            // 👆 [引入新代码功能结束]

            var newMaterial = new WorkshopMaterial
            {
                Code = dto.Code,
                Name = dto.Name,
                CategoryId = categoryId, // 👈 [引入新代码功能]：✅ 绑定分类
                Specification = dto.Specification,
                Location = dto.Location,
                Unit = string.IsNullOrWhiteSpace(dto.Unit) ? "个" : dto.Unit,
                CurrentStock = dto.CurrentStock,
                MinStockAlert = dto.MinStockAlert,
                ImageUrl = dto.ImageUrl,
                PurchasePrice = dto.PurchasePrice,
                SupplierId = dto.SupplierId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            _context.WorkshopMaterials.Add(newMaterial);
            RecordInventoryMovement(
                newMaterial,
                0,
                newMaterial.CurrentStock,
                InventoryMovementType.InitialStock,
                source: "product-create",
                note: "新建商品初始库存");
            await _context.SaveChangesAsync();

            return Ok(new { Message = "添加成功", Product = newMaterial });
        }

        // 技能7：修改已有的物料信息 (✅ 修复：支持修改分类)
        [HttpPut("products/{id}")]
        public async Task<IActionResult> UpdateProduct(int id, [FromBody] ProductEditDto dto)
        {
            var material = await _context.WorkshopMaterials.FindAsync(id);
            if (material == null || !material.IsActive) return NotFound("找不到该物料");

            var previousStock = material.CurrentStock;

            // 👇 [引入新代码功能]：自动处理并更新分类
            int? categoryId = material.CategoryId;
            if (!string.IsNullOrWhiteSpace(dto.CategoryName))
            {
                var category = await _context.Categories.FirstOrDefaultAsync(c => c.Name == dto.CategoryName);
                if (category == null)
                {
                    category = new Category { Name = dto.CategoryName, IsTool = dto.CategoryName.Contains("工具") };
                    _context.Categories.Add(category);
                    await _context.SaveChangesAsync();
                }
                categoryId = category.Id;
            }
            // 👆 [引入新代码功能结束]

            material.Code = dto.Code;
            material.Name = dto.Name;
            material.CategoryId = categoryId; // 👈 [引入新代码功能]：✅ 更新分类
            material.Specification = dto.Specification;
            material.Location = dto.Location;
            material.Unit = string.IsNullOrWhiteSpace(dto.Unit) ? "个" : dto.Unit;
            material.CurrentStock = dto.CurrentStock;
            material.MinStockAlert = dto.MinStockAlert;
            material.ImageUrl = dto.ImageUrl;
            material.PurchasePrice = dto.PurchasePrice;
            material.SupplierId = dto.SupplierId;

            RecordInventoryMovement(
                material,
                previousStock,
                material.CurrentStock,
                InventoryMovementType.ProductEdit,
                source: "product-edit",
                note: "商品编辑调整库存");

            await _context.SaveChangesAsync();

            return Ok(new { Message = "修改成功", Product = material });
        }

        // 技能2：接收师傅提交的采购需求单
        [HttpPost("requests")]
        public async Task<IActionResult> SubmitRequest([FromBody] SubmitRequestDto requestDto)
        {
            if (requestDto.Items == null || !requestDto.Items.Any()) return BadRequest("采购车是空的！");

            var newRequest = new StaffRequest
            {
                StaffName = requestDto.StaffName ?? "Workshop 师傅",
                Notes = requestDto.Notes,
                Status = "Pending", 
                CreatedAt = DateTime.UtcNow
            };

            foreach (var item in requestDto.Items)
            {
                newRequest.Items.Add(new StaffRequestItem
                {
                    MaterialId = item.ProductId, 
                    Quantity = item.Quantity
                });
            }

            _context.StaffRequests.Add(newRequest);
            await _context.SaveChangesAsync();

            return Ok(new { Message = "提交成功！", RequestId = newRequest.Id });
        }

        // 技能3：获取所有的采购申请单 (给后台看板用)
        [HttpGet("requests")]
        public async Task<IActionResult> GetRequests()
        {
            var requests = await _context.StaffRequests
                .Include(r => r.Items)
                    .ThenInclude(i => i.Material)
                .OrderByDescending(r => r.CreatedAt) 
                .Select(r => new {
                    r.Id,
                    r.StaffName,
                    r.Notes,
                    r.Status,
                    r.CreatedAt,
                    Items = r.Items.Select(i => new {
                        ProductName = i.Material != null ? i.Material.Name : "未知商品",
                        Specification = i.Material != null ? i.Material.Specification : "",
                        Quantity = i.Quantity
                    })
                })
                .ToListAsync();

            return Ok(requests);
        }

        // 🚀 [核心升级] 技能8：处理单据 (同意并【按供应商自动拆分】补货单 / 驳回彻底删除)
        [HttpPost("requests/{id}/process")]
        public async Task<IActionResult> ProcessRequest(int id, [FromQuery] string action)
        {
            var request = await _context.StaffRequests
                .Include(r => r.Items)
                .ThenInclude(i => i.Material)
                .FirstOrDefaultAsync(r => r.Id == id);
                
            if (request == null) return NotFound("单据不存在");

            if (action != "approve" && action != "reject")
                return BadRequest("未知的操作");

            if (!string.Equals(request.Status, "Pending", StringComparison.OrdinalIgnoreCase))
                return Conflict(new { Message = "该申请已处理，请勿重复操作。" });

            if (action == "reject") 
            {
                _context.StaffRequests.Remove(request); 
                try
                {
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateConcurrencyException)
                {
                    return Conflict(new { Message = "该申请已被其他操作处理，请刷新后查看。" });
                }
                return Ok(new { Message = "单据已彻底删除" });
            }
            else if (action == "approve") 
            {
                request.Status = "Approved"; 

                // 🏗️ 智能拆单逻辑：按商品的供应商(SupplierId)对明细进行分组
                var itemsGroupedBySupplier = request.Items.GroupBy(i => i.Material?.SupplierId);

                int orderCount = 0;
                foreach (var group in itemsGroupedBySupplier)
                {
                    var newOrder = new RestockOrder 
                    {
                        OrderNumber = $"PO-{DateTime.Now:yyyyMMdd}-{new Random().Next(1000, 9999)}", // 换成标准的 PO (Purchase Order)
                        SupplierId = group.Key, // 绑定拆出来的供应商
                        CreatedAt = DateTime.UtcNow,
                        Status = "Sent" 
                    };

                    foreach (var item in group) 
                    {
                        newOrder.Items.Add(new RestockOrderItem 
                        {
                            MaterialId = item.MaterialId,
                            Quantity = item.Quantity,
                            ReceivedQuantity = 0
                        });
                        
                        // 增加在途库存
                        if (item.Material != null) item.Material.InTransitStock += item.Quantity;
                    }

                    _context.RestockOrders.Add(newOrder);
                    orderCount++;
                }

                try
                {
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateConcurrencyException)
                {
                    return Conflict(new { Message = "该申请或相关商品已被其他操作更新，本次审批未生效，请刷新后重试。" });
                }
                return Ok(new { Message = $"已批准！系统已自动拆分为 {orderCount} 张独立的采购单！" });
            }

            return BadRequest("未知的操作");
        }

        // 🚀 [核心升级] 技能9：获取所有的补货单 (附带供应商名称)
        [HttpGet("restock-orders")]
        public async Task<IActionResult> GetRestockOrders()
        {
            var orders = await _context.RestockOrders
                .Include(o => o.Items)
                    .ThenInclude(i => i.Material)
                .Include(o => o.Supplier) // 关联查出供应商
                .OrderByDescending(o => o.CreatedAt)
                .Select(o => new {
                    o.Id,
                    o.OrderNumber,
                    o.Status,
                    o.CreatedAt,
                    o.ExpectedDate,
                    SupplierName = o.Supplier != null ? o.Supplier.Name : "未指定供应商", // 传给前端
                    Items = o.Items.Select(i => new {
                        Id = i.Id,
                        Quantity = i.Quantity,
                        ReceivedQuantity = i.ReceivedQuantity,
                        Product = new { 
                            Name = i.Material != null ? i.Material.Name : "未知商品" 
                        }
                    })
                })
                .ToListAsync();
                
            return Ok(orders);
        }

        // 🚀 [新增] 技能10：分批/精准收货 (支持部分到货)
        [HttpPost("restock-orders/{id}/receive")]
        public async Task<IActionResult> ReceiveRestockOrder(int id, [FromBody] List<ReceiveItemDto> receivedItems)
        {
            var order = await _context.RestockOrders
                .Include(o => o.Items)
                .ThenInclude(i => i.Material)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (order == null) return NotFound("找不到该补货单");
            if (order.Status == "Completed") return BadRequest("该订单已全部入库，请勿重复操作");

            foreach (var dto in receivedItems)
            {
                var item = order.Items.FirstOrDefault(i => i.Id == dto.ItemId);
                if (item != null && dto.Quantity > 0)
                {
                    // 确保不会超量收货（最多收剩下的数量）
                    int remainingQuantity = Math.Max(0, item.Quantity - item.ReceivedQuantity);
                    int actualReceive = Math.Min(dto.Quantity, remainingQuantity);
                    if (actualReceive == 0) continue;
                    
                    item.ReceivedQuantity += actualReceive;
                    
                    if (item.Material != null)
                    {
                        var previousStock = item.Material.CurrentStock;
                        item.Material.CurrentStock += actualReceive; // 增加实际库存
                        item.Material.InTransitStock = Math.Max(0, item.Material.InTransitStock - actualReceive); // 扣除在途
                        RecordInventoryMovement(
                            item.Material,
                            previousStock,
                            item.Material.CurrentStock,
                            InventoryMovementType.RestockReceipt,
                            source: order.OrderNumber,
                            note: "采购单收货入库");
                    }
                }
            }

            // 检查是否所有商品都已经收齐了
            if (order.Items.All(i => i.ReceivedQuantity >= i.Quantity))
            {
                order.Status = "Completed";
            }
            else
            {
                order.Status = "Partially Received"; // 更新为部分收货状态
            }

            await _context.SaveChangesAsync();
            return Ok(new { Message = "收货成功！库存已精准更新。" });
        }

        // 🚀 [新增] 技能11：删除单据 (防死账，退还在途库存)
        [HttpDelete("restock-orders/{id}")]
        public async Task<IActionResult> DeleteRestockOrder(int id)
        {
            var order = await _context.RestockOrders
                .Include(o => o.Items)
                .ThenInclude(i => i.Material)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (order == null) return NotFound("找不到该单据");
            if (order.Status == "Completed") return BadRequest("已入库完结的单据无法删除！");

            // 撤销在途库存
            foreach (var item in order.Items)
            {
                if (item.Material != null)
                {
                    // 减去剩余未收的在途数量
                    item.Material.InTransitStock = Math.Max(0, item.Material.InTransitStock - (item.Quantity - item.ReceivedQuantity));
                }
            }

            _context.RestockOrders.Remove(order);
            await _context.SaveChangesAsync();

            return Ok(new { Message = "补货单已删除，在途库存已成功回退！" });
        }

        // 🚀 [终极升级] 技能4：智能 CSV 导入 (支持更新价格、供应商、避免重复)
        [HttpPost("upload-products")]
        public async Task<IActionResult> UploadProducts(IFormFile file)
        {
            if (file == null || file.Length == 0) return BadRequest("没有检测到文件，请上传 CSV 文件。");

            using var reader = new StreamReader(file.OpenReadStream(), true);
            var csvConfig = new CsvConfiguration(CultureInfo.InvariantCulture) 
            { 
                HasHeaderRecord = true, TrimOptions = TrimOptions.Trim, 
                MissingFieldFound = null, HeaderValidated = null 
            };
            using var csv = new CsvReader(reader, csvConfig);

            var records = csv.GetRecords<ProductCsvRecord>().ToList();
            if (!records.Any()) return BadRequest("CSV 文件里没有读到任何数据。");

            int updatedCount = 0; 
            int addedCount = 0; 
            var sourceFile = Path.GetFileName(file.FileName);
            var existingCategories = await _context.Categories.ToDictionaryAsync(c => c.Name);
            var existingSuppliers = await _context.Suppliers.ToDictionaryAsync(s => s.Name); 

            foreach (var record in records) 
            {
                if (string.IsNullOrWhiteSpace(record.Name)) continue; 
                
                Category? category = null;
                if (!string.IsNullOrWhiteSpace(record.CategoryName)) 
                {
                    if (!existingCategories.TryGetValue(record.CategoryName, out category)) 
                    {
                        // 👇 [引入新代码功能]：动态判断是否包含“工具”字样
                        category = new Category { Name = record.CategoryName, IsTool = record.CategoryName.Contains("工具") };
                        // 👆 [引入新代码功能结束]
                        _context.Categories.Add(category); 
                        await _context.SaveChangesAsync(); 
                        existingCategories[record.CategoryName] = category; 
                    }
                }

                Supplier? supplier = null;
                if (!string.IsNullOrWhiteSpace(record.SupplierName))
                {
                    if (!existingSuppliers.TryGetValue(record.SupplierName, out supplier))
                    {
                        supplier = new Supplier { Name = record.SupplierName };
                        _context.Suppliers.Add(supplier); 
                        await _context.SaveChangesAsync();
                        existingSuppliers[record.SupplierName] = supplier;
                    }
                }
                
                var existingMaterial = await _context.WorkshopMaterials
                    .FirstOrDefaultAsync(m => 
                        (!string.IsNullOrEmpty(record.Code) && m.Code == record.Code) || 
                        (m.Name == record.Name));

                if (existingMaterial != null)
                {
                    var previousStock = existingMaterial.CurrentStock;
                    existingMaterial.Code = string.IsNullOrWhiteSpace(record.Code) ? existingMaterial.Code : record.Code;
                    if (category != null) existingMaterial.CategoryId = category.Id;
                    if (supplier != null) existingMaterial.SupplierId = supplier.Id;
                    existingMaterial.Specification = string.IsNullOrWhiteSpace(record.Specification) ? existingMaterial.Specification : record.Specification;
                    if (!string.IsNullOrWhiteSpace(record.Location)) existingMaterial.Location = record.Location;
                    if (record.PurchasePrice.HasValue) existingMaterial.PurchasePrice = record.PurchasePrice.Value;
                    if (!string.IsNullOrWhiteSpace(record.Unit)) existingMaterial.Unit = record.Unit;
                    if (record.CurrentStock.HasValue) existingMaterial.CurrentStock = record.CurrentStock.Value;
                    if (record.MinStockAlert.HasValue) existingMaterial.MinStockAlert = record.MinStockAlert.Value;

                    RecordInventoryMovement(
                        existingMaterial,
                        previousStock,
                        existingMaterial.CurrentStock,
                        InventoryMovementType.BulkImport,
                        source: "product-csv-import",
                        sourceFile: sourceFile,
                        note: "批量导入调整库存");
                    
                    updatedCount++;
                }
                else
                {
                    var newMaterial = new WorkshopMaterial 
                    {
                        Name = record.Name, 
                        Code = record.Code,
                        CategoryId = category?.Id, 
                        SupplierId = supplier?.Id,
                        Specification = record.Specification,
                        Location = record.Location,
                        PurchasePrice = record.PurchasePrice ?? 0,
                        Unit = string.IsNullOrWhiteSpace(record.Unit) ? "个" : record.Unit, 
                        CurrentStock = record.CurrentStock ?? 0,
                        MinStockAlert = record.MinStockAlert ?? 0, 
                        IsActive = true, 
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.WorkshopMaterials.Add(newMaterial); 
                    RecordInventoryMovement(
                        newMaterial,
                        0,
                        newMaterial.CurrentStock,
                        InventoryMovementType.InitialStock,
                        source: "product-csv-import",
                        sourceFile: sourceFile,
                        note: "批量导入创建商品的初始库存");
                    addedCount++;
                }
            }
            
            await _context.SaveChangesAsync();
            return Ok(new { Message = $"导入完毕！\n新增了 {addedCount} 条物料\n更新了 {updatedCount} 条现有物料！" });
        }

        // 技能5：删除指定的物料
        [HttpDelete("products/{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            var material = await _context.WorkshopMaterials.FindAsync(id);
            if (material == null || !material.IsActive) return NotFound("找不到该物料");
            
            material.IsActive = false;
            await _context.SaveChangesAsync();
            
            return Ok(new { Message = "删除成功！历史库存流水已保留。" });
        }

        // ==========================================
        // 🔥 王炸功能 1：智能推荐采购 (Smart Restock)
        // ==========================================
        
        // 技能12：扫描并获取所有快断货的商品建议
        [HttpGet("smart-restock")]
        public async Task<IActionResult> GetSmartRestockRecommendations()
        {
            // 👇 [引入新代码功能]：引入Category，且工具不参与低库存报警计算
            var shortages = await _context.WorkshopMaterials
                .Include(m => m.Supplier)
                .Include(m => m.Category)
                .Where(m => m.IsActive 
                         && (m.Category == null || !m.Category.Name.Contains("工具")) 
                         && (m.CurrentStock + m.InTransitStock < m.MinStockAlert))
            // 👆 [引入新代码功能结束]
                .Select(m => new {
                    ProductId = m.Id,
                    m.Name,
                    m.Specification,
                    m.CurrentStock,
                    m.InTransitStock,
                    m.MinStockAlert,
                    SupplierName = m.Supplier != null ? m.Supplier.Name : "未指定供应商",
                    // 默认建议补货量：补齐到警戒线，外加一小部分余量（可根据实际情况调整算法）
                    SuggestedQuantity = (m.MinStockAlert - (m.CurrentStock + m.InTransitStock)) > 0 
                        ? (m.MinStockAlert - (m.CurrentStock + m.InTransitStock)) + 5 
                        : 0
                })
                .ToListAsync();

            return Ok(shortages);
        }

        // 技能13：一键将智能推荐转化为待办申请单
        [HttpPost("smart-restock/apply")]
        public async Task<IActionResult> ApplySmartRestock([FromBody] List<SubmitRequestItemDto> items)
        {
            if (items == null || !items.Any()) return BadRequest("没有传入需要补货的商品");

            var newRequest = new StaffRequest
            {
                StaffName = "🤖 智能助手 (Smart Restock)",
                Notes = "系统自动扫描低库存生成的补货申请，请老板审批生成 PO 单",
                Status = "Pending", 
                CreatedAt = DateTime.UtcNow
            };

            foreach (var item in items)
            {
                newRequest.Items.Add(new StaffRequestItem
                {
                    MaterialId = item.ProductId, 
                    Quantity = item.Quantity
                });
            }

            _context.StaffRequests.Add(newRequest);
            await _context.SaveChangesAsync();

            return Ok(new { Message = "一键智能采购申请已生成！快去看板点击同意吧！", RequestId = newRequest.Id });
        }

        // 批量盘点：先验证整批数据，再在同一事务内更新库存与流水。
        [HttpPost("stocktake")]
        public async Task<IActionResult> ApplyStocktake(
            [FromBody] StocktakeRequest request,
            CancellationToken cancellationToken)
        {
            if (request.Items == null || request.Items.Count == 0)
                return BadRequest(new { Message = "盘点数据不能为空。" });

            if (request.Items.Count > 10_000)
                return BadRequest(new { Message = "单次盘点最多支持 10000 条数据。" });

            if (string.IsNullOrWhiteSpace(request.Source))
                return BadRequest(new { Message = "请提供盘点来源 source。" });

            if (request.Source.Trim().Length > 64)
                return BadRequest(new { Message = "盘点来源 source 不能超过 64 个字符。" });

            if (!string.IsNullOrWhiteSpace(request.SourceFile) && request.SourceFile.Trim().Length > 255)
                return BadRequest(new { Message = "盘点文件名不能超过 255 个字符。" });

            var duplicateProductIds = request.Items
                .GroupBy(item => item.ProductId)
                .Where(group => group.Count() > 1)
                .Select(group => group.Key)
                .OrderBy(id => id)
                .ToArray();

            if (duplicateProductIds.Length > 0)
            {
                return BadRequest(new
                {
                    Message = "盘点数据包含重复商品。",
                    DuplicateProductIds = duplicateProductIds
                });
            }

            var invalidItems = request.Items
                .Where(item => item.ProductId <= 0
                    || item.ExpectedStock < 0
                    || item.CountedStock < 0
                    || (item.Note?.Length ?? 0) > 1000)
                .Select(item => new
                {
                    item.ProductId,
                    item.ExpectedStock,
                    item.CountedStock,
                    Message = item.ProductId <= 0
                        ? "商品 ID 无效。"
                        : item.ExpectedStock < 0
                            ? "账面库存不能为负数。"
                            : item.CountedStock < 0
                                ? "盘点数量不能为负数。"
                                : "备注不能超过 1000 个字符。"
                })
                .ToArray();

            if (invalidItems.Length > 0)
                return BadRequest(new { Message = "盘点数据格式有误。", Errors = invalidItems });

            await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

            var productIds = request.Items.Select(item => item.ProductId).ToArray();
            var materials = await _context.WorkshopMaterials
                .FromSqlInterpolated($@"
                    SELECT *
                    FROM workshop_materials
                    WHERE id = ANY ({productIds})
                    ORDER BY id
                    FOR UPDATE")
                .ToDictionaryAsync(material => material.Id, cancellationToken);

            var missingProductIds = productIds
                .Where(productId => !materials.ContainsKey(productId))
                .OrderBy(productId => productId)
                .ToArray();
            var inactiveProducts = materials.Values
                .Where(material => !material.IsActive)
                .Select(material => new { material.Id, material.Name })
                .OrderBy(material => material.Id)
                .ToArray();

            if (missingProductIds.Length > 0 || inactiveProducts.Length > 0)
            {
                return BadRequest(new
                {
                    Message = "盘点数据包含不存在或已删除的商品。",
                    MissingProductIds = missingProductIds,
                    InactiveProducts = inactiveProducts
                });
            }

            var conflicts = request.Items
                .Where(item => materials[item.ProductId].CurrentStock != item.ExpectedStock)
                .Select(item => new
                {
                    item.ProductId,
                    materials[item.ProductId].Name,
                    item.ExpectedStock,
                    CurrentStock = materials[item.ProductId].CurrentStock
                })
                .ToArray();

            if (conflicts.Length > 0)
            {
                return Conflict(new
                {
                    Message = "部分商品在导出后库存已发生变化，本次盘点未写入。请重新导出后再试。",
                    Conflicts = conflicts
                });
            }

            var source = request.Source.Trim();
            var sourceFile = string.IsNullOrWhiteSpace(request.SourceFile)
                ? null
                : Path.GetFileName(request.SourceFile.Trim());
            var updatedCount = 0;

            foreach (var item in request.Items)
            {
                var material = materials[item.ProductId];
                if (material.CurrentStock == item.CountedStock)
                    continue;

                var previousStock = material.CurrentStock;
                material.CurrentStock = item.CountedStock;
                RecordInventoryMovement(
                    material,
                    previousStock,
                    item.CountedStock,
                    InventoryMovementType.Stocktake,
                    source,
                    sourceFile,
                    item.Note);
                updatedCount++;
            }

            try
            {
                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                await transaction.RollbackAsync(cancellationToken);
                _context.ChangeTracker.Clear();

                var latestStocks = await _context.WorkshopMaterials
                    .AsNoTracking()
                    .Where(material => productIds.Contains(material.Id))
                    .Select(material => new { material.Id, material.Name, material.CurrentStock })
                    .ToDictionaryAsync(material => material.Id, cancellationToken);
                var latestConflicts = request.Items
                    .Where(item => latestStocks.TryGetValue(item.ProductId, out var material)
                        && material.CurrentStock != item.ExpectedStock)
                    .Select(item => new
                    {
                        item.ProductId,
                        latestStocks[item.ProductId].Name,
                        item.ExpectedStock,
                        CurrentStock = latestStocks[item.ProductId].CurrentStock
                    })
                    .ToArray();

                return Conflict(new
                {
                    Message = "盘点提交时库存发生了变化，本次盘点已全部回滚。请刷新后再试。",
                    Conflicts = latestConflicts
                });
            }

            return Ok(new
            {
                Message = "盘点完成。",
                TotalCount = request.Items.Count,
                UpdatedCount = updatedCount,
                UnchangedCount = request.Items.Count - updatedCount
            });
        }

        [HttpGet("products/{id:int}/stock-movements")]
        public async Task<IActionResult> GetStockMovements(
            int id,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50,
            CancellationToken cancellationToken = default)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            var product = await _context.WorkshopMaterials
                .AsNoTracking()
                .Where(material => material.Id == id)
                .Select(material => new
                {
                    material.Id,
                    material.Code,
                    material.Name,
                    material.Location,
                    material.Unit,
                    material.CurrentStock,
                    material.InTransitStock,
                    material.IsActive
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (product == null)
                return NotFound(new { Message = "找不到该物料。" });

            var query = _context.InventoryMovements
                .AsNoTracking()
                .Where(movement => movement.MaterialId == id);
            var total = await query.CountAsync(cancellationToken);
            var items = await query
                .OrderByDescending(movement => movement.OccurredAt)
                .ThenByDescending(movement => movement.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(movement => new
                {
                    movement.Id,
                    movement.PreviousStock,
                    movement.NewStock,
                    movement.QuantityDelta,
                    movement.MovementType,
                    movement.Source,
                    movement.SourceFile,
                    movement.Note,
                    movement.OccurredAt
                })
                .ToListAsync(cancellationToken);

            return Ok(new { Product = product, Total = total, Page = page, PageSize = pageSize, Items = items });
        }

        [HttpGet("products/usage-ranking")]
        public async Task<IActionResult> GetUsageRanking(
            [FromQuery] int days = 90,
            [FromQuery] int limit = 20,
            CancellationToken cancellationToken = default)
        {
            days = Math.Clamp(days, 1, 3650);
            limit = Math.Clamp(limit, 1, 100);
            var periodStart = DateTime.UtcNow.AddDays(-days);

            var rows = await _context.InventoryMovements
                .AsNoTracking()
                .Where(movement => movement.MovementType == InventoryMovementType.Stocktake
                    && movement.QuantityDelta < 0
                    && movement.OccurredAt >= periodStart
                    && movement.Material.IsActive)
                .GroupBy(movement => new
                {
                    movement.MaterialId,
                    movement.Material.Code,
                    movement.Material.Name,
                    movement.Material.Location,
                    movement.Material.Unit,
                    movement.Material.CurrentStock,
                    movement.Material.InTransitStock,
                    CategoryName = movement.Material.Category != null
                        ? movement.Material.Category.Name
                        : "未分类"
                })
                .Select(group => new
                {
                    ProductId = group.Key.MaterialId,
                    group.Key.Code,
                    group.Key.Name,
                    group.Key.Location,
                    group.Key.Unit,
                    group.Key.CurrentStock,
                    group.Key.InTransitStock,
                    group.Key.CategoryName,
                    ConsumedQuantity = -group.Sum(movement => movement.QuantityDelta),
                    UsageCount = group.Count()
                })
                .OrderByDescending(row => row.ConsumedQuantity)
                .ThenBy(row => row.Name)
                .Take(limit)
                .ToListAsync(cancellationToken);

            var monthlyFactor = 365.25d / 12d / days;
            var result = rows.Select(row => new
            {
                row.ProductId,
                row.Code,
                row.Name,
                row.Location,
                row.Unit,
                row.CurrentStock,
                row.InTransitStock,
                row.CategoryName,
                row.ConsumedQuantity,
                row.UsageCount,
                AvgMonthlyConsumption = Math.Round(row.ConsumedQuantity * monthlyFactor, 2)
            });

            return Ok(new { Days = days, PeriodStart = periodStart, Items = result });
        }

        // ==========================================
        // 🔥 王炸功能 2：采购单微信一键分享 (后端支持)
        // ==========================================

        // 技能14：把 PO 单排版成漂亮的纯文本，供前端“一键复制”发给供应商
        [HttpGet("restock-orders/{id}/wechat-format")]
        public async Task<IActionResult> GetWeChatShareText(int id)
        {
            var order = await _context.RestockOrders
                .Include(o => o.Items).ThenInclude(i => i.Material)
                .Include(o => o.Supplier)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (order == null) return NotFound("找不到该订单");

            var sb = new StringBuilder();
            sb.AppendLine($"📦 【采购订单】 {order.OrderNumber}");
            sb.AppendLine($"🏢 供应商: {(order.Supplier != null ? order.Supplier.Name : "暂未指定")}");
            sb.AppendLine($"📅 日期: {order.CreatedAt:yyyy-MM-dd}");
            sb.AppendLine(new string('-', 20)); // 分割线
            
            foreach (var item in order.Items)
            {
                var materialName = item.Material != null ? item.Material.Name : "未知商品";
                var spec = item.Material != null && !string.IsNullOrWhiteSpace(item.Material.Specification) 
                    ? $" ({item.Material.Specification})" 
                    : "";
                var unit = item.Material != null && !string.IsNullOrWhiteSpace(item.Material.Unit) 
                    ? item.Material.Unit 
                    : "件";

                sb.AppendLine($"▪ {materialName}{spec} x {item.Quantity} {unit}");
            }
            
            sb.AppendLine(new string('-', 20));
            sb.AppendLine("老板好，以上是最新订单，麻烦确认一下排期发货，谢谢！");

            // 返回格式化好的文本，前端直接调 Clipboard API 复制
            return Ok(new { Text = sb.ToString() });
        }

        private void RecordInventoryMovement(
            WorkshopMaterial material,
            int previousStock,
            int newStock,
            string movementType,
            string? source = null,
            string? sourceFile = null,
            string? note = null)
        {
            if (previousStock == newStock)
                return;

            _context.InventoryMovements.Add(new InventoryMovement
            {
                Material = material,
                PreviousStock = previousStock,
                NewStock = newStock,
                QuantityDelta = newStock - previousStock,
                MovementType = movementType,
                Source = TrimToLength(source, 64),
                SourceFile = TrimToLength(sourceFile, 255),
                Note = TrimToLength(note, 1000),
                OccurredAt = DateTime.UtcNow
            });
        }

        private static string? TrimToLength(string? value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            var trimmed = value.Trim();
            return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
        }
    }

    // ================= DTOs (数据传输对象) =================

    public class SubmitRequestDto 
    { 
        public string? StaffName { get; set; } 
        public string? Notes { get; set; } 
        public List<SubmitRequestItemDto> Items { get; set; } = new List<SubmitRequestItemDto>(); 
    }

    public class SubmitRequestItemDto 
    { 
        public int ProductId { get; set; } 
        public int Quantity { get; set; } 
    }

    public class ReceiveItemDto
    {
        public int ItemId { get; set; } 
        public int Quantity { get; set; } 
    }

    public class StocktakeRequest
    {
        public string Source { get; set; } = string.Empty;
        public string? SourceFile { get; set; }
        public List<StocktakeItemDto> Items { get; set; } = new();
    }

    public class StocktakeItemDto
    {
        public int ProductId { get; set; }
        public int ExpectedStock { get; set; }
        public int CountedStock { get; set; }
        public string? Note { get; set; }
    }

    public class ProductCsvRecord 
    { 
        public string Name { get; set; } = string.Empty; 
        public string? Code { get; set; } 
        public string? CategoryName { get; set; } 
        public string? Specification { get; set; } 
        public string? Location { get; set; }
        public string? SupplierName { get; set; } 
        public decimal? PurchasePrice { get; set; } 
        public string? Unit { get; set; } 
        public int? CurrentStock { get; set; } 
        public int? MinStockAlert { get; set; } 
    }

    public class ProductEditDto 
    { 
        public string? Code { get; set; } 
        public string Name { get; set; } = ""; 
        public string? CategoryName { get; set; } // 👈 [引入新代码功能]：✅ 修复：必须有这个字段，否则后端不知道是工具还是耗材
        public string? Specification { get; set; } 
        public string? Location { get; set; }
        public string? Unit { get; set; } 
        public int CurrentStock { get; set; } 
        public int MinStockAlert { get; set; } 
        public string? ImageUrl { get; set; } 
        public decimal PurchasePrice { get; set; } 
        public int? SupplierId { get; set; } 
    }

    internal static class InventoryMovementType
    {
        public const string InitialStock = "InitialStock";
        public const string ProductEdit = "ProductEdit";
        public const string BulkImport = "BulkImport";
        public const string RestockReceipt = "RestockReceipt";
        public const string Stocktake = "Stocktake";
    }
}
