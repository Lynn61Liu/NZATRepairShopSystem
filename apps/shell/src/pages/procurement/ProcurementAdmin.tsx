import React, { useEffect, useState, useRef, useMemo } from 'react';
import { withApiBase } from '@/utils/api';

const procurementApi = (path: string) => withApiBase(`/api/procurement${path}`);

const formatDateForFile = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isBlankCell = (value: unknown) => value === null || value === undefined || String(value).trim() === '';

const parseNonNegativeInteger = (value: unknown) => {
  if (isBlankCell(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const movementTypeLabels: Record<string, string> = {
  InitialStock: '初始库存',
  ManualEdit: '手工修改',
  ProductEdit: '手工修改',
  ProductImport: '物料导入',
  BulkImport: '物料导入',
  RestockReceipt: '采购收货',
  Stocktake: '库存盘点',
};

interface ProductRecord {
  id: number;
  code?: string | null;
  name: string;
  specification?: string | null;
  unit?: string | null;
  currentStock: number;
  minStockAlert: number;
  inTransitStock: number;
  imageUrl?: string | null;
  purchasePrice: number;
  categoryName?: string | null;
  supplierId?: number | null;
  supplierName?: string | null;
  location?: string | null;
}

interface SupplierRecord {
  id: number;
  name: string;
}

interface RequestItemRecord {
  productName: string;
  specification?: string | null;
  quantity: number;
}

interface ProcurementRequestRecord {
  id: number;
  staffName: string;
  status: string;
  createdAt: string;
  items: RequestItemRecord[];
}

interface RestockOrderItemRecord {
  id: number;
  quantity: number;
  receivedQuantity: number;
  product?: Pick<ProductRecord, 'name' | 'specification'> | null;
}

interface RestockOrderRecord {
  id: number;
  orderNumber: string;
  supplierName: string;
  status: string;
  createdAt: string;
  items: RestockOrderItemRecord[];
}

interface SmartRestockRecord {
  productId: number;
  name: string;
  supplierName: string;
  currentStock: number;
  inTransitStock: number;
  minStockAlert: number;
  suggestedQuantity: number;
}

interface StockMovementRecord {
  id: number;
  movementType: string;
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  source?: string | null;
  note?: string | null;
  sourceFile?: string | null;
  occurredAt: string;
}

interface MovementLogState {
  items: StockMovementRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface UsageRankingRecord {
  productId: number;
  name: string;
  code?: string | null;
  location?: string | null;
  unit?: string | null;
  consumedQuantity: number;
  usageCount: number;
  avgMonthlyConsumption: number;
  currentStock: number;
}

interface StocktakeConflict {
  name: string;
  expectedStock: number;
  currentStock: number;
}

interface StocktakeResponse {
  message?: string;
  updatedCount?: number;
  unchangedCount?: number;
  conflicts?: StocktakeConflict[];
  errors?: Array<string | { message?: string }>;
}

export function ProcurementAdmin() {
  const [activeTab, setActiveTab] = useState<'requests' | 'inventory' | 'restock' | 'stocktake'>('requests');
  
  const [requests, setRequests] = useState<ProcurementRequestRecord[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  
  const [restockOrders, setRestockOrders] = useState<RestockOrderRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stocktakeFileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  
  const [productTypeFilter, setProductTypeFilter] = useState<'all' | 'consumable' | 'tool'>('all');
  
  const [receiveInputs, setReceiveInputs] = useState<Record<number, number>>({});
  const [stocktakeInputs, setStocktakeInputs] = useState<Record<number, number>>({});
  const [stocktakeExpectedStocks, setStocktakeExpectedStocks] = useState<Record<number, number>>({});
  const [stocktakeNotes, setStocktakeNotes] = useState<Record<number, string>>({});
  const [stocktakeSourceFile, setStocktakeSourceFile] = useState('');
  const [isStocktakeImporting, setIsStocktakeImporting] = useState(false);
  const [isStocktakeSubmitting, setIsStocktakeSubmitting] = useState(false);

  const [movementProduct, setMovementProduct] = useState<ProductRecord | null>(null);
  const [movementLog, setMovementLog] = useState<MovementLogState>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [loadingMovements, setLoadingMovements] = useState(false);

  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const [usageDays, setUsageDays] = useState(90);
  const [usageItems, setUsageItems] = useState<UsageRankingRecord[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
  const [smartRestockItems, setSmartRestockItems] = useState<SmartRestockRecord[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: '', code: '', 
    // 👇 [新增代码融合]: 引入 specification (规格) 和 imageUrl (图片)
    specification: '',
    location: '',
    imageUrl: '', 
    // 👆 [新增代码融合结束]
    unit: '个', 
    categoryName: '', 
    currentStock: 0, minStockAlert: 0, purchasePrice: 0, 
    supplierId: ''
  });

  const loadRequests = () => {
    setLoadingRequests(true);
    fetch(procurementApi('/requests'))
      .then(res => res.json())
      .then(data => { setRequests(data); setLoadingRequests(false); })
      .catch(err => { console.error(err); setLoadingRequests(false); });
  };

  const loadProducts = () => {
    setLoadingProducts(true);
    fetch(procurementApi('/products'))
      .then(res => res.json())
      .then(data => { setProducts(data); setLoadingProducts(false); })
      .catch(err => { console.error(err); setLoadingProducts(false); });
  };

  const loadSuppliers = () => fetch(procurementApi('/suppliers')).then(res => res.json()).then(setSuppliers);
  const loadRestockOrders = () => fetch(procurementApi('/restock-orders')).then(res => res.json()).then(setRestockOrders);

  useEffect(() => {
    if (activeTab === 'requests') loadRequests();
    if (activeTab === 'inventory' || activeTab === 'stocktake') { loadProducts(); loadSuppliers(); }
    if (activeTab === 'restock') loadRestockOrders();
  }, [activeTab]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.categoryName || '未分类'));
    return ['全部', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = products.filter(p => {
    const isTool = (p.categoryName || '').includes('工具');
    
    if (productTypeFilter === 'consumable' && isTool) return false;
    if (productTypeFilter === 'tool' && !isTool) return false;

    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (p.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (p.specification || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (p.location || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = selectedCategory === '全部' || p.categoryName === selectedCategory;
    return matchSearch && matchCategory;
  });

  const handleProcessRequest = async (id: number, action: 'approve' | 'reject') => {
    const confirmMsg = action === 'approve' ? "确定批准？系统将自动按供应商为您拆分采购单！" : "确定要彻底删除该单据吗？";
    if (!window.confirm(confirmMsg)) return;

    try {
      const response = await fetch(procurementApi(`/requests/${id}/process?action=${action}`), { method: 'POST' });
      const result = await response.json();
      if (response.ok) {
        alert(result.message);
        loadRequests(); 
      }
    } catch (error) { console.error("操作失败", error); }
  };

  const handleReceiveInputChange = (itemId: number, value: string) => {
    const val = parseInt(value, 10);
    setReceiveInputs(prev => ({ ...prev, [itemId]: isNaN(val) ? 0 : val }));
  };

  const handleReceivePartial = async (orderId: number, items: RestockOrderItemRecord[]) => {
    const payload = items.map(i => ({
      itemId: i.id,
      quantity: receiveInputs[i.id] !== undefined ? receiveInputs[i.id] : 0
    })).filter(p => p.quantity > 0); 

    if (payload.length === 0) return alert("⚠️ 请先在输入框中填写本次收到的数量！");
    if (!window.confirm("📦 确定按照填写的数量收货并更新库存吗？")) return;

    try {
      const response = await fetch(procurementApi(`/restock-orders/${orderId}/receive`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (response.ok) {
        alert("🎉 收货成功！实际库存已增加，在途库存已扣除。");
        setReceiveInputs({}); 
        loadRestockOrders();
      } else {
        const text = await response.text(); alert("收货失败: " + text);
      }
    } catch { alert("网络错误"); }
  };

  const handleDeleteRestockOrder = async (id: number) => {
    if (!window.confirm("⚠️ 危险操作：确定要彻底删除这张补货单吗？\n（未收货的在途库存将会被自动回退！）")) return;
    try {
      const response = await fetch(procurementApi(`/restock-orders/${id}`), { method: 'DELETE' });
      if (response.ok) { alert("🗑️ 删除成功，账目已平！"); loadRestockOrders(); } 
      else { alert("已完成的单据不可删除！"); }
    } catch { alert("网络错误"); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { alert("请上传 .csv 格式的文件！"); return; }
    
    const fd = new FormData(); 
    fd.append('file', file);
    
    try {
      const response = await fetch(procurementApi('/upload-products'), { method: 'POST', body: fd });
      const result = await response.json().catch(() => ({ message: "未知错误" }));
      
      if (response.ok) { 
        alert(result.message); 
        loadProducts(); 
      } else { 
        alert(`❌ 导入失败：\n${result.message || response.statusText}`); 
      }
    } catch {
      alert('❌ 网络错误，上传失败。请检查后端是否在运行。'); 
    } finally { 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!window.confirm("确定要删除这条物料吗？")) return;
    try {
      const response = await fetch(procurementApi(`/products/${id}`), { method: 'DELETE' });
      if (response.ok) { alert("删除成功！"); loadProducts(); } else { alert("删除失败，商品可能正被单据使用中。"); }
    } catch { alert("网络错误"); }
  };

  const handleOpenAdd = (type: 'consumable' | 'tool') => {
    setEditingId(null);
    setFormData({ 
      name: '', code: '', 
      // 👇 [新增代码融合]: 初始化新增的字段
      specification: '', location: '', imageUrl: '',
      // 👆 [新增代码融合结束]
      unit: type === 'tool' ? '把' : '个', 
      categoryName: type === 'tool' ? '车间工具' : '', 
      currentStock: 0, minStockAlert: 0, purchasePrice: 0, supplierId: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: ProductRecord) => {
    setEditingId(p.id);
    setFormData({
      name: p.name, code: p.code || '', 
      // 👇 [新增代码融合]: 编辑时带入规格和图片链接
      specification: p.specification || '', 
      location: p.location || '',
      imageUrl: p.imageUrl || '',
      // 👆 [新增代码融合结束]
      unit: p.unit || '个',
      categoryName: p.categoryName || '', 
      currentStock: p.currentStock || 0, minStockAlert: p.minStockAlert || 0, 
      purchasePrice: p.purchasePrice || 0, supplierId: p.supplierId ? p.supplierId.toString() : ''
    });
    setIsModalOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!formData.name) return alert("物料名称不能为空！");
    const url = editingId ? procurementApi(`/products/${editingId}`) : procurementApi('/products');
    const payload = { ...formData, supplierId: formData.supplierId ? parseInt(formData.supplierId) : null };
    try {
      const response = await fetch(url, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.ok) { setIsModalOpen(false); loadProducts(); } else { alert("保存失败！"); }
    } catch (error) { console.error(error); }
  };

  const handleSmartScan = async () => {
    try {
      const res = await fetch(procurementApi('/smart-restock'));
      if (res.ok) {
        const data = await res.json();
        setSmartRestockItems(data);
        setIsSmartModalOpen(true);
      } else {
        alert("❌ 无法连接到智能补货引擎！请确认后端是否已经更新了该功能。");
      }
    } catch { alert("❌ 网络连接失败，请检查后端服务是否启动。"); }
  };

  const handleApplySmartRestock = async () => {
    const payload = smartRestockItems.map(i => ({ productId: i.productId, quantity: i.suggestedQuantity }));
    try {
      const res = await fetch(procurementApi('/smart-restock/apply'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("🎉 智能补货申请已成功生成！请前往【待办审核】查看并同意。");
        setIsSmartModalOpen(false);
      }
    } catch { alert("提交失败"); }
  };

  const exportToExcel = (order: RestockOrderRecord) => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    
    csvContent += `采购订单 (PO) 编号,${order.orderNumber}\n`;
    csvContent += `供应商,${order.supplierName}\n`;
    csvContent += `下单日期,${new Date(order.createdAt).toLocaleDateString()}\n`;
    csvContent += `\n`; 
    
    csvContent += `商品名称,规格,单位,需采购数量\n`;
    order.items.forEach(item => {
      const pName = item.product?.name ? `"${item.product.name}"` : '未知'; 
      const spec = item.product?.specification ? `"${item.product.specification}"` : '';
      const unit = '件'; 
      csvContent += `${pName},${spec},${unit},${item.quantity}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${order.orderNumber}_订单详情.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const writeWorkbook = async (
    rows: Array<Record<string, string | number>>,
    sheetName: string,
    fileName: string,
    columnWidths: number[],
  ) => {
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = columnWidths.map(width => ({ wch: width }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName, { compression: true });
  };

  const handleExportAllProducts = async () => {
    if (products.length === 0) return alert('当前没有可导出的物料。');

    try {
      const rows = products.map(p => ({
        物料ID: p.id,
        货号: p.code || '',
        名称: p.name,
        分类: p.categoryName || '未分类',
        规格: p.specification || '',
        单位: p.unit || '',
        货位: p.location || '',
        当前库存: p.currentStock,
        在途库存: p.inTransitStock || 0,
        警戒库存: p.minStockAlert,
        进货价: p.purchasePrice || 0,
        供应商: p.supplierName || '',
        图片链接: p.imageUrl || '',
      }));
      await writeWorkbook(
        rows,
        '物料与工具库',
        `物料与工具库_${formatDateForFile()}.xlsx`,
        [10, 16, 24, 16, 20, 10, 14, 12, 12, 12, 12, 20, 35],
      );
    } catch (error) {
      console.error(error);
      alert('导出失败，请刷新页面后重试。');
    }
  };

  const handleExportStocktake = async () => {
    if (products.length === 0) return alert('当前没有可盘点的物料。');

    try {
      const rows = products.map(p => ({
        物料ID: p.id,
        货号: p.code || '',
        名称: p.name,
        规格: p.specification || '',
        分类: p.categoryName || '未分类',
        单位: p.unit || '',
        货位: p.location || '',
        账面库存: p.currentStock,
        在途库存: p.inTransitStock || 0,
        盘点数量: '',
        备注: '',
      }));
      await writeWorkbook(
        rows,
        '库存盘点',
        `库存盘点_${formatDateForFile()}.xlsx`,
        [10, 16, 24, 20, 16, 10, 14, 12, 12, 14, 28],
      );
    } catch (error) {
      console.error(error);
      alert('盘点表导出失败，请刷新页面后重试。');
    }
  };

  const handleStocktakeFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'xlsx' && extension !== 'xls') {
      alert('请上传 .xlsx 或 .xls 格式的 Excel 盘点表。');
      event.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('盘点文件不能超过 10MB。');
      event.target.value = '';
      return;
    }

    setIsStocktakeImporting(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
      if (!worksheet) throw new Error('Excel 文件中没有工作表');

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null, raw: true });
      const nextInputs: Record<number, number> = {};
      const nextExpectedStocks: Record<number, number> = {};
      const nextNotes: Record<number, string> = {};
      const seenIds = new Set<number>();
      const errors: string[] = [];
      let skipped = 0;

      rows.forEach((row, index) => {
        const excelRow = index + 2;
        const countedCell = row['盘点数量'] ?? row['实盘库存'] ?? row['实盘数量'];
        if (isBlankCell(countedCell)) {
          skipped += 1;
          return;
        }

        const productId = parseNonNegativeInteger(row['物料ID']);
        const countedStock = parseNonNegativeInteger(countedCell);
        const expectedStock = parseNonNegativeInteger(row['账面库存']);

        if (productId === null || productId === 0) {
          errors.push(`第 ${excelRow} 行：物料ID无效`);
          return;
        }
        if (seenIds.has(productId)) {
          errors.push(`第 ${excelRow} 行：物料ID ${productId} 重复`);
          return;
        }
        seenIds.add(productId);

        const product = products.find(p => p.id === productId);
        if (!product) {
          errors.push(`第 ${excelRow} 行：找不到物料ID ${productId}`);
          return;
        }
        if (countedStock === null) {
          errors.push(`第 ${excelRow} 行：盘点数量必须是大于或等于 0 的整数`);
          return;
        }
        if (expectedStock === null) {
          errors.push(`第 ${excelRow} 行：账面库存无效，请使用系统导出的盘点表`);
          return;
        }
        if (expectedStock !== product.currentStock) {
          errors.push(`第 ${excelRow} 行：${product.name} 的账面库存已从 ${expectedStock} 变为 ${product.currentStock}，请重新导出盘点表`);
          return;
        }

        nextInputs[productId] = countedStock;
        nextExpectedStocks[productId] = expectedStock;
        if (!isBlankCell(row['备注'])) nextNotes[productId] = String(row['备注']).trim();
      });

      if (errors.length > 0) {
        const visibleErrors = errors.slice(0, 15).join('\n');
        const remaining = errors.length > 15 ? `\n……另有 ${errors.length - 15} 条错误` : '';
        alert(`Excel 盘点表有 ${errors.length} 个问题，请修正后重新上传：\n\n${visibleErrors}${remaining}`);
        return;
      }
      if (Object.keys(nextInputs).length === 0) {
        alert('没有读取到盘点数量。请在“盘点数量”列填写后再上传。');
        return;
      }

      setStocktakeInputs(nextInputs);
      setStocktakeExpectedStocks(nextExpectedStocks);
      setStocktakeNotes(nextNotes);
      setStocktakeSourceFile(file.name);
      alert(`已读取 ${Object.keys(nextInputs).length} 条盘点数量${skipped > 0 ? `，跳过 ${skipped} 条未填写记录` : ''}。\n请在页面核对差异后，点击“提交盘点”。`);
    } catch (error) {
      console.error(error);
      alert('无法读取这个 Excel 文件，请确认文件未损坏，并使用系统导出的盘点表。');
    } finally {
      setIsStocktakeImporting(false);
      if (stocktakeFileInputRef.current) stocktakeFileInputRef.current.value = '';
    }
  };

  const handleStocktakeInputChange = (product: ProductRecord, rawValue: string) => {
    if (rawValue === '') {
      setStocktakeInputs(previous => {
        const next = { ...previous };
        delete next[product.id];
        return next;
      });
      setStocktakeExpectedStocks(previous => {
        const next = { ...previous };
        delete next[product.id];
        return next;
      });
      return;
    }

    const nextValue = Number(rawValue);
    setStocktakeInputs(previous => ({ ...previous, [product.id]: nextValue }));
    setStocktakeExpectedStocks(previous => (
      previous[product.id] === undefined
        ? { ...previous, [product.id]: product.currentStock }
        : previous
    ));
  };

  const resetStocktakeDraft = () => {
    setStocktakeInputs({});
    setStocktakeExpectedStocks({});
    setStocktakeNotes({});
    setStocktakeSourceFile('');
  };

  const handleBulkUpdateStock = async () => {
    const entries = Object.entries(stocktakeInputs);
    if (entries.length === 0) return alert('请先手工填写盘点数量，或上传 Excel 盘点表。');

    const invalidEntry = entries.find(([, value]) => !Number.isInteger(value) || value < 0);
    if (invalidEntry) {
      const product = products.find(p => p.id === Number(invalidEntry[0]));
      return alert(`${product?.name || '盘点数量'} 必须是大于或等于 0 的整数。`);
    }
    if (!window.confirm(`确定提交 ${entries.length} 条盘点记录并更新真实库存吗？\n系统会先检查盘点期间是否有新的收货或库存修改。`)) return;

    const items = entries.map(([id, countedStock]) => {
      const productId = Number(id);
      const product = products.find(p => p.id === productId);
      return {
        productId,
        expectedStock: stocktakeExpectedStocks[productId] ?? product?.currentStock ?? 0,
        countedStock,
        note: stocktakeNotes[productId] || null,
      };
    });

    setIsStocktakeSubmitting(true);
    try {
      const response = await fetch(procurementApi('/stocktake'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: stocktakeSourceFile ? 'Excel' : 'Manual',
          sourceFile: stocktakeSourceFile || null,
          items,
        }),
      });
      const responseText = await response.text();
      let result: StocktakeResponse = {};
      try { result = responseText ? JSON.parse(responseText) as StocktakeResponse : {}; } catch { result = { message: responseText }; }

      if (response.ok) {
        alert(`盘点完成！更新 ${result.updatedCount || 0} 条，库存未变化 ${result.unchangedCount || 0} 条。`);
        resetStocktakeDraft();
        loadProducts();
        return;
      }

      if (response.status === 409 && Array.isArray(result.conflicts)) {
        const conflicts = result.conflicts
          .slice(0, 10)
          .map(conflict => `${conflict.name}：盘点表 ${conflict.expectedStock}，当前 ${conflict.currentStock}`)
          .join('\n');
        alert(`盘点没有提交，因为以下库存已发生变化：\n\n${conflicts}\n\n请重新导出最新盘点表后再操作。`);
        loadProducts();
        return;
      }

      const validationErrors = Array.isArray(result.errors)
        ? `\n${result.errors.map(error => typeof error === 'string' ? error : error.message || '盘点数据无效').join('\n')}`
        : '';
      alert(`盘点提交失败：${result.message || response.statusText}${validationErrors}`);
    } catch (error) {
      console.error(error);
      alert('网络错误，盘点没有提交。');
    } finally {
      setIsStocktakeSubmitting(false);
    }
  };

  const loadMovementLog = async (product: ProductRecord, page: number) => {
    setLoadingMovements(true);
    try {
      const response = await fetch(procurementApi(`/products/${product.id}/stock-movements?page=${page}&pageSize=50`));
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json() as Partial<MovementLogState>;
      setMovementLog({
        items: data.items || [],
        total: data.total || 0,
        page: data.page || page,
        pageSize: data.pageSize || 50,
      });
    } catch (error) {
      console.error(error);
      setMovementLog({ items: [], total: 0, page, pageSize: 50 });
      alert('库存日志加载失败。');
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleOpenMovementLog = (product: ProductRecord) => {
    setMovementProduct(product);
    setMovementLog({ items: [], total: 0, page: 1, pageSize: 50 });
    void loadMovementLog(product, 1);
  };

  const loadUsageRanking = async (days: number) => {
    setLoadingUsage(true);
    try {
      const response = await fetch(procurementApi(`/products/usage-ranking?days=${days}&limit=50`));
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json() as UsageRankingRecord[] | { items?: UsageRankingRecord[] };
      setUsageItems(Array.isArray(data) ? data : data.items || []);
    } catch (error) {
      console.error(error);
      setUsageItems([]);
      alert('消耗排行加载失败。');
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleOpenUsageRanking = () => {
    setIsUsageModalOpen(true);
    setUsageDays(90);
    void loadUsageRanking(90);
  };

  return (
    <div className="p-6 max-w-6xl w-full relative mx-auto">
      <div className="mb-6 flex justify-between items-end border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">采购与物料中心</h1>
          <p className="text-sm text-gray-500 mt-1">管理采购申请、物料主数据与库存</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('requests')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'requests' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>📋 待办审核</button>
          <button onClick={() => setActiveTab('inventory')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'inventory' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>📦 物料与工具库</button>
          <button onClick={() => setActiveTab('restock')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'restock' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>🚚 采购单据 (PO)</button>
          <button onClick={() => setActiveTab('stocktake')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'stocktake' ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600' : 'text-gray-500 hover:bg-gray-100'}`}>📊 月度盘点</button>
        </div>
      </div>

      {/* ================= Tab 1: 待办审核 ================= */}
      {activeTab === 'requests' && (
        <div>
          {loadingRequests ? <p className="text-gray-500 text-center py-10">正在加载数据...</p> : requests.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow border border-gray-100 text-center"><p className="text-gray-500">当前没有待处理的采购申请 🎉</p></div>
          ) : (
            <div className="flex flex-col gap-6">
              {requests.map(req => (
                <div key={req.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-4">
                    <div>
                      <span className="font-bold text-lg text-gray-800">申请人: {req.staffName}</span>
                      <span className="text-sm text-gray-400 ml-4">{new Date(req.createdAt).toLocaleString()}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${req.status === 'Pending' ? 'bg-amber-100 text-amber-700' : req.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {req.status === 'Pending' ? '待处理 (Pending)' : req.status === 'Approved' ? '已批准 (Approved)' : '已驳回 (Rejected)'}
                    </span>
                  </div>
                  <div className="mb-4">
                    <ul className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                      {req.items.map((item, idx) => (
                        <li key={idx} className="flex justify-between py-1.5 text-gray-700">
                          <span>{item.productName} <span className="text-gray-400 text-sm">{item.specification && `(${item.specification})`}</span></span>
                          <span className="font-bold text-blue-600">x {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {req.status === 'Pending' ? (
                    <div className="flex justify-end gap-3 pt-2">
                       <button onClick={() => handleProcessRequest(req.id, 'reject')} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">驳回 / 删除</button>
                       <button onClick={() => handleProcessRequest(req.id, 'approve')} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm">✅ 同意并自动拆单 (PO)</button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3 pt-2">
                       <button onClick={() => handleProcessRequest(req.id, 'reject')} className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition flex items-center gap-1">🗑️ 彻底删除此记录</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= Tab 2: 物料库 ================= */}
      {activeTab === 'inventory' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 mb-2">
            <button onClick={() => setProductTypeFilter('all')} className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${productTypeFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>全部资产</button>
            <button onClick={() => setProductTypeFilter('consumable')} className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${productTypeFilter === 'consumable' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>📦 消耗品 (日常耗材)</button>
            <button onClick={() => setProductTypeFilter('tool')} className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${productTypeFilter === 'tool' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>🔧 车间工具 (资产清单)</button>
          </div>

          <div className="flex gap-6 h-[65vh]">
            <div className="w-48 bg-gray-50 border border-gray-200 rounded-xl flex flex-col overflow-hidden shadow-sm shrink-0">
              <div className="p-3 bg-gray-100 border-b border-gray-200 font-bold text-gray-700 text-sm">物料分类</div>
              <div className="overflow-y-auto p-2 flex flex-col gap-1">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition ${selectedCategory === cat ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}>{cat}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-3">
                  <input type="text" placeholder="🔍 搜索名称、货号、规格或货位..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-64" />
                  <button onClick={handleSmartScan} className="px-3 py-1.5 text-sm font-bold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition shadow-sm border border-amber-200 flex items-center gap-1">🤖 智能补货扫描</button>
                  <button onClick={handleOpenUsageRanking} className="px-3 py-1.5 text-sm font-bold text-teal-700 bg-teal-100 rounded-lg hover:bg-teal-200 transition shadow-sm border border-teal-200">📈 消耗排行</button>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={() => handleOpenAdd('consumable')} className="px-3 py-1.5 text-sm font-bold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition shadow-sm border border-blue-200">➕ 新建耗材</button>
                  <button onClick={() => handleOpenAdd('tool')} className="px-3 py-1.5 text-sm font-bold text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition shadow-sm border border-purple-200">🔧 新建工具</button>
                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm font-bold text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition shadow-sm border border-green-200">📥 批量导入</button>
                  <button onClick={handleExportAllProducts} className="px-3 py-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition shadow-sm border border-emerald-200">📤 导出全部</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-0">
                {loadingProducts ? <p className="text-gray-500 text-center py-10">正在加载数据...</p> : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase sticky top-0 z-10">
                        <th className="p-3 font-semibold">名称 / 货号</th>
                        <th className="p-3 font-semibold">分类 / 供应商</th>
                        <th className="p-3 font-semibold text-right">进货价</th>
                        <th className="p-3 font-semibold text-right">当前状态/库存</th>
                        <th className="p-3 font-semibold text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredProducts.map(p => {
                        const isTool = (p.categoryName || '').includes('工具');
                        return (
                          <tr key={p.id} className="hover:bg-gray-50 transition">
                            {/* 👇 [新增代码融合]: 结合了你的图片显示和规格显示，同时保留了原来的排版 */}
                            <td className="p-3 flex items-center gap-3">
                              {p.imageUrl && <img src={p.imageUrl} alt="img" className="w-8 h-8 rounded object-cover shadow-sm border border-gray-200" />}
                              <div>
                                <div className="font-medium text-gray-800 flex items-center gap-1">
                                  {isTool && <span title="工具">🔧</span>} {p.name}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {p.code || '-'} {p.specification && `| ${p.specification}`}
                                </div>
                                {p.location && <div className="text-xs text-teal-600 mt-0.5">📍 货位：{p.location}</div>}
                              </div>
                            </td>
                            {/* 👆 [新增代码融合结束] */}
                            <td className="p-3 text-xs">
                              <span className={`${isTool ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'} px-2 py-0.5 rounded mr-1`}>{p.categoryName}</span>
                              <div className="text-gray-500 mt-1">{p.supplierName}</div>
                            </td>
                            <td className="p-3 text-right font-mono text-gray-600">${p.purchasePrice?.toFixed(2)}</td>
                            <td className="p-3 text-right">
                              <span className="font-bold text-gray-700">{p.currentStock}</span>
                              {!isTool && <span className="text-xs text-gray-400 font-normal ml-1">/ 警戒 {p.minStockAlert}</span>}
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => handleOpenMovementLog(p)} className="text-teal-600 hover:text-teal-800 font-medium text-sm px-2 py-1">库存日志</button>
                              <button onClick={() => handleOpenEdit(p)} className="text-blue-500 hover:text-blue-700 font-medium text-sm px-2 py-1">编辑</button>
                              <button onClick={() => handleDeleteProduct(p.id)} className="text-red-500 hover:text-red-700 font-medium text-sm px-2 py-1">删除</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= Tab 3: 采购单据 ================= */}
      {activeTab === 'restock' && (
        <div className="flex flex-col gap-6">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="font-bold text-blue-800">智能采购引擎</h3>
              <p className="text-sm text-blue-600 mt-1">审核通过的单据已按供应商拆分为独立的 PO。货到后请填写数量进行入库。</p>
            </div>
          </div>

          {restockOrders.length === 0 ? (
             <div className="bg-white p-8 rounded-lg shadow border border-gray-100 text-center"><p className="text-gray-500">目前没有在途的补货单 🚚</p></div>
          ) : (
            restockOrders.map(order => (
              <div key={order.id} className={`bg-white p-6 rounded-xl shadow-sm border ${order.status === 'Completed' ? 'border-green-300 opacity-80' : 'border-gray-200'}`}>
                <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`font-bold text-xl font-mono ${order.status === 'Completed' ? 'text-green-700' : 'text-blue-800'}`}>{order.orderNumber}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200 shadow-sm">供应商: {order.supplierName}</span>
                    </div>
                    <span className="text-sm text-gray-400">{new Date(order.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${order.status === 'Completed' ? 'bg-green-100 text-green-700' : order.status === 'Partially Received' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {order.status === 'Completed' ? '✅ 已入库完结' : order.status === 'Partially Received' ? '⏳ 部分到货' : '🚚 发往供应商 (Sent)'}
                    </span>
                    {order.status !== 'Completed' && (
                      <div className="flex items-center gap-3 mt-1">
                         <button onClick={() => exportToExcel(order)} className="text-xs text-green-600 hover:text-green-800 font-bold border border-green-200 bg-green-50 px-2 py-1 rounded">📋 导出Excel(发供应商)</button>
                         <button onClick={() => handleDeleteRestockOrder(order.id)} className="text-xs text-red-500 hover:text-red-700 underline font-medium cursor-pointer">🗑️ 废弃此单</button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mb-4">
                  <table className="w-full text-left text-sm border border-gray-200 rounded overflow-hidden">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="p-2 border-b">商品名称</th>
                        <th className="p-2 border-b text-center">需订购量</th>
                        <th className="p-2 border-b text-center">已收数量</th>
                        <th className="p-2 border-b text-right w-40">本次到货输入</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {order.items.map((i, idx) => {
                        const remaining = i.quantity - i.receivedQuantity;
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className={`p-2 font-medium ${order.status === 'Completed' ? 'text-gray-500' : 'text-gray-800'}`}>
                              {i.product?.name}
                              {/* 👇 [新增代码融合]: 单据商品列表中加上规格展示 */}
                              {i.product?.specification && <span className="text-xs text-gray-400 ml-1">({i.product.specification})</span>}
                              {/* 👆 [新增代码融合结束] */}
                            </td>
                            <td className="p-2 text-center font-bold text-blue-600 bg-blue-50/50 border-l border-r">{i.quantity}</td>
                            <td className={`p-2 text-center font-bold bg-green-50/50 border-r ${i.quantity === i.receivedQuantity ? 'text-green-600' : 'text-gray-500'}`}>
                              {i.quantity === i.receivedQuantity ? '✅ ' : ''}{i.receivedQuantity}
                            </td>
                            <td className="p-2 text-right">
                              {remaining > 0 ? (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-gray-400">还差 {remaining}</span>
                                  <input 
                                    type="number" 
                                    min="0" max={remaining}
                                    placeholder="输入数量"
                                    value={receiveInputs[i.id] !== undefined ? receiveInputs[i.id] : ''}
                                    onChange={(e) => handleReceiveInputChange(i.id, e.target.value)}
                                    className="w-20 border border-gray-300 rounded p-1 text-center text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs italic">已齐</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                   <button 
                     onClick={() => handleReceivePartial(order.id, order.items)}
                     disabled={order.status === 'Completed'}
                     className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition shadow flex items-center gap-2 ${order.status === 'Completed' ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                   >
                     {order.status === 'Completed' ? '📦 此单已成功入库' : '📥 确认本次到货数量并入库'}
                   </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ================= Tab 4: 月度盘点系统 ================= */}
      {activeTab === 'stocktake' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[75vh]">
          <div className="p-4 border-b border-gray-100 bg-purple-50 flex justify-between items-center gap-4">
            <div>
              <h3 className="font-bold text-purple-800 text-lg">🕵️ 月末库存盘点</h3>
              <p className="text-xs text-purple-600 mt-1">可导出 Excel、填写“盘点数量”后整表上传，也可保留手工填写。确认差异后一次提交平账。</p>
              {stocktakeSourceFile && (
                <p className="text-xs text-green-700 mt-1 font-semibold">✅ 已载入：{stocktakeSourceFile}（{Object.keys(stocktakeInputs).length} 条）</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 shrink-0">
              <button onClick={handleExportStocktake} className="px-3 py-2 text-sm font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition shadow-sm">📤 导出当前全部库存</button>
              <input type="file" accept=".xlsx,.xls" ref={stocktakeFileInputRef} onChange={handleStocktakeFileUpload} className="hidden" />
              <button disabled={isStocktakeImporting} onClick={() => stocktakeFileInputRef.current?.click()} className="px-3 py-2 text-sm font-bold text-green-700 bg-green-100 border border-green-200 rounded-lg hover:bg-green-200 transition shadow-sm disabled:opacity-50">{isStocktakeImporting ? '正在读取…' : '📥 上传 Excel 盘点'}</button>
              {Object.keys(stocktakeInputs).length > 0 && (
                <button onClick={resetStocktakeDraft} className="px-3 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">清空</button>
              )}
              <button disabled={isStocktakeSubmitting || Object.keys(stocktakeInputs).length === 0} onClick={handleBulkUpdateStock} className="px-5 py-2 text-sm font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition shadow disabled:bg-gray-400 disabled:cursor-not-allowed">{isStocktakeSubmitting ? '正在提交…' : '💾 提交盘点'}</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase sticky top-0 z-10">
                  <th className="p-3 font-semibold">物料名称</th>
                  <th className="p-3 font-semibold text-center">月初/入库后账面</th>
                  <th className="p-3 font-semibold text-center w-48">月底货架实剩</th>
                  <th className="p-3 font-semibold text-center">本月实际消耗</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {products.map(p => {
                  const actualVal = stocktakeInputs[p.id];
                  const hasInput = actualVal !== undefined && !isNaN(actualVal);
                  
                  const consumed = hasInput ? p.currentStock - actualVal : 0;
                  
                  return (
                    <tr key={p.id} className="hover:bg-purple-50/30 transition">
                      <td className="p-3 font-medium text-gray-800">
                        {p.name} <span className="text-xs text-gray-400">{p.code}</span>
                        {p.location && <div className="text-xs text-teal-600 font-normal mt-0.5">📍 {p.location}</div>}
                      </td>
                      <td className="p-3 text-center text-gray-500 text-lg font-mono">{p.currentStock}</td>
                      <td className="p-3 text-center">
                        <input 
                          type="number" min="0" placeholder="填入剩余量"
                          value={hasInput ? actualVal : ''}
                          onChange={(e) => handleStocktakeInputChange(p, e.target.value)}
                          className="w-24 border-2 border-purple-200 rounded-lg p-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                        />
                      </td>
                      <td className="p-3 text-center">
                        {!hasInput ? <span className="text-gray-300">-</span> : 
                         consumed === 0 ? <span className="text-gray-400 font-bold">➖ 无消耗</span> : 
                         consumed > 0 ? <span className="text-blue-600 font-bold">⬇️ 用掉 {consumed}</span> :
                         <span className="text-red-600 font-bold">⚠️ 异常: 多出 {Math.abs(consumed)}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= 库存变动日志弹窗 ================= */}
      {movementProduct && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-teal-100 bg-teal-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-teal-900">📋 库存变动日志 · {movementProduct.name}</h3>
                <p className="text-xs text-teal-700 mt-1">
                  {movementProduct.code || '无货号'} · 当前库存 {movementProduct.currentStock} {movementProduct.unit || ''}
                  {movementProduct.location ? ` · 货位 ${movementProduct.location}` : ''}
                </p>
              </div>
              <button onClick={() => setMovementProduct(null)} className="text-teal-800 hover:text-teal-950 text-2xl font-bold">&times;</button>
            </div>

            <div className="overflow-auto flex-1">
              {loadingMovements ? (
                <p className="text-gray-500 text-center py-12">正在加载库存日志…</p>
              ) : movementLog.items.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <p className="text-gray-500">暂无库存变动日志</p>
                  <p className="text-xs text-gray-400 mt-2">新功能启用后的收货、库存修改和盘点记录会显示在这里。</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="p-3">时间</th>
                      <th className="p-3">类型</th>
                      <th className="p-3 text-center">变动</th>
                      <th className="p-3 text-center">变动前 → 变动后</th>
                      <th className="p-3">来源 / 备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {movementLog.items.map(movement => (
                      <tr key={movement.id} className="hover:bg-gray-50">
                        <td className="p-3 whitespace-nowrap text-gray-500">{new Date(movement.occurredAt).toLocaleString()}</td>
                        <td className="p-3 font-medium text-gray-700">{movementTypeLabels[movement.movementType] || movement.movementType}</td>
                        <td className={`p-3 text-center font-bold font-mono ${movement.quantityDelta > 0 ? 'text-green-600' : movement.quantityDelta < 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}
                        </td>
                        <td className="p-3 text-center font-mono text-gray-600">{movement.previousStock} → {movement.newStock}</td>
                        <td className="p-3 text-gray-600 max-w-sm">
                          <div>{movement.note || movement.sourceFile || '-'}</div>
                          {movement.source && <div className="text-xs text-gray-400 mt-1">来源：{movement.source}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <span className="text-xs text-gray-500">共 {movementLog.total} 条 · 第 {movementLog.page} 页</span>
              <div className="flex gap-2">
                <button disabled={movementLog.page <= 1 || loadingMovements} onClick={() => void loadMovementLog(movementProduct, movementLog.page - 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white disabled:opacity-40">上一页</button>
                <button disabled={movementLog.page * movementLog.pageSize >= movementLog.total || loadingMovements} onClick={() => void loadMovementLog(movementProduct, movementLog.page + 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white disabled:opacity-40">下一页</button>
                <button onClick={() => setMovementProduct(null)} className="px-4 py-1.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700">关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 商品消耗排行弹窗 ================= */}
      {isUsageModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-teal-100 bg-teal-50 flex justify-between items-center gap-4">
              <div>
                <h3 className="font-bold text-lg text-teal-900">📈 商品消耗排行</h3>
                <p className="text-xs text-teal-700 mt-1">按盘点时发现的库存减少量统计，可用来判断哪些耗材需要多备货。</p>
              </div>
              <div className="flex items-center gap-2">
                {[30, 90, 180, 365].map(days => (
                  <button disabled={loadingUsage} key={days} onClick={() => { setUsageDays(days); void loadUsageRanking(days); }} className={`px-3 py-1.5 text-sm font-bold rounded-lg border disabled:opacity-50 ${usageDays === days ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-teal-700 border-teal-200 hover:bg-teal-100'}`}>{days} 天</button>
                ))}
                <button onClick={() => setIsUsageModalOpen(false)} className="text-teal-800 hover:text-teal-950 text-2xl font-bold ml-2">&times;</button>
              </div>
            </div>

            <div className="overflow-auto flex-1">
              {loadingUsage ? (
                <p className="text-gray-500 text-center py-12">正在统计消耗情况…</p>
              ) : usageItems.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <p className="text-gray-500">所选时间内还没有可统计的消耗记录</p>
                  <p className="text-xs text-gray-400 mt-2">完成月度盘点后，库存减少的商品会自动进入这里；只在打开本页时才计算。</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="p-3 text-center w-16">排名</th>
                      <th className="p-3">商品</th>
                      <th className="p-3">货位</th>
                      <th className="p-3 text-right">总消耗</th>
                      <th className="p-3 text-right">有消耗的盘点次数</th>
                      <th className="p-3 text-right">月均消耗</th>
                      <th className="p-3 text-right">当前库存</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {usageItems.map((item, index) => (
                      <tr key={item.productId} className="hover:bg-teal-50/40">
                        <td className="p-3 text-center font-bold text-teal-700">#{index + 1}</td>
                        <td className="p-3">
                          <div className="font-semibold text-gray-800">{item.name}</div>
                          <div className="text-xs text-gray-400">{item.code || '无货号'}</div>
                        </td>
                        <td className="p-3 text-gray-600">{item.location || '-'}</td>
                        <td className="p-3 text-right font-bold text-blue-700">{item.consumedQuantity} {item.unit || ''}</td>
                        <td className="p-3 text-right text-gray-600">{item.usageCount}</td>
                        <td className="p-3 text-right font-mono text-gray-700">{Number(item.avgMonthlyConsumption || 0).toFixed(1)}</td>
                        <td className="p-3 text-right font-mono font-bold text-gray-800">{item.currentStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <span className="text-xs text-gray-500">统计从库存日志功能启用后开始，不会追溯猜测以前的数据。</span>
              <button onClick={() => setIsUsageModalOpen(false)} className="px-4 py-1.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 智能补货弹窗 ================= */}
      {isSmartModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-amber-900 flex items-center gap-2">🤖 智能补货雷达</h3>
                <p className="text-xs text-amber-700 mt-1">系统已扫描所有（当前库存 + 在途库存 &lt; 警戒线）的快断货商品</p>
              </div>
              <button onClick={() => setIsSmartModalOpen(false)} className="text-amber-800 hover:text-amber-900 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="overflow-auto p-6 flex-1 bg-gray-50">
              {smartRestockItems.length === 0 ? (
                <div className="text-center py-10"><p className="text-gray-500">🎉 太棒了！目前没有任何商品低于警戒库存，无需补货！</p></div>
              ) : (
                <div className="grid gap-3">
                  {smartRestockItems.map((item, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 p-4 rounded-lg flex items-center justify-between shadow-sm">
                      <div>
                        <div className="font-bold text-gray-800 text-lg">{item.name} <span className="text-sm font-normal text-gray-500">({item.supplierName})</span></div>
                        <div className="text-sm text-gray-500 mt-1">当前存货: <strong className="text-red-500">{item.currentStock}</strong> | 在途: <strong>{item.inTransitStock}</strong> | 警戒线: <strong>{item.minStockAlert}</strong></div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-600">建议补货量:</span>
                        <input 
                          type="number" 
                          value={item.suggestedQuantity} 
                          onChange={(e) => {
                            const newItems = [...smartRestockItems];
                            newItems[idx].suggestedQuantity = parseInt(e.target.value) || 0;
                            setSmartRestockItems(newItems);
                          }}
                          className="w-20 border-2 border-amber-300 rounded-lg p-1.5 text-center font-bold text-amber-700 outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-white">
              <button onClick={() => setIsSmartModalOpen(false)} className="px-4 py-2 font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">暂不处理</button>
              {smartRestockItems.length > 0 && (
                <button onClick={handleApplySmartRestock} className="px-6 py-2 font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition shadow-lg">🚀 一键生成采购申请单</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= 表单弹窗 (已包含完整的新字段) ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="font-bold text-lg text-gray-800">
                {formData.categoryName.includes('工具') ? '🔧 编辑/新建工具' : '📦 编辑/新建耗材'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            
            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">名称 <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">货号 (Code)</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                </div>
                
                {/* 👇 [新增代码融合]: 规格输入框 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">规格 (Specification)</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.specification} onChange={e => setFormData({...formData, specification: e.target.value})} />
                </div>
                {/* 👆 [新增代码融合结束] */}

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">货位</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="例如：A区-03架-2层" />
                </div>

                {/* 👇 [新增代码融合]: 图片链接输入框 */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">图片链接 (Image URL)</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="https://..." />
                </div>
                {/* 👆 [新增代码融合结束] */}

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">所属分类 (含"工具"字眼即识别为工具)</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 focus:border-blue-500 outline-none" value={formData.categoryName} onChange={e => setFormData({...formData, categoryName: e.target.value})} placeholder="例如: 消耗品, 车间工具" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">绑定主供应商</label>
                  <select className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.supplierId} onChange={e => setFormData({...formData, supplierId: e.target.value})}>
                    <option value="">-- 请选择供应商 (可选) --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t pt-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">进货价 ($)</label>
                  <input type="number" step="0.01" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none font-mono" value={formData.purchasePrice} onChange={e => setFormData({...formData, purchasePrice: parseFloat(e.target.value) || 0})} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">当前库存</label>
                  <input type="number" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.currentStock} onChange={e => setFormData({...formData, currentStock: parseInt(e.target.value) || 0})} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">单位</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
                </div>
                
                {!formData.categoryName.includes('工具') ? (
                  <div className="col-span-3">
                    <label className="block text-sm font-semibold text-red-600 mb-1">警戒库存</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.minStockAlert} onChange={e => setFormData({...formData, minStockAlert: parseInt(e.target.value) || 0})} />
                  </div>
                ) : (
                  <div className="col-span-3 flex items-center text-sm text-gray-400">工具类无需设置警戒</div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">取消</button>
              <button onClick={handleSaveProduct} className="px-5 py-2 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow">💾 保存档案</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
