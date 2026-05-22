import React, { useEffect, useState, useRef, useMemo } from 'react';
import { withApiBase } from '@/utils/api';

const procurementApi = (path: string) => withApiBase(`/api/procurement${path}`);

export function ProcurementAdmin() {
  const [activeTab, setActiveTab] = useState<'requests' | 'inventory' | 'restock' | 'stocktake'>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [restockOrders, setRestockOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [productTypeFilter, setProductTypeFilter] = useState<'all' | 'consumable' | 'tool'>('all');
  const [receiveInputs, setReceiveInputs] = useState<Record<number, number>>({});
  const [stocktakeInputs, setStocktakeInputs] = useState<Record<number, number>>({});
  const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
  const [smartRestockItems, setSmartRestockItems] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    specification: '',
    imageUrl: '',
    unit: 'pcs',
    categoryName: '',
    currentStock: 0,
    minStockAlert: 0,
    purchasePrice: 0,
    supplierId: '',
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
    const cats = new Set(products.map(p => p.categoryName || 'Uncategorized'));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = products.filter(p => {
    const isTool = /tool/i.test(p.categoryName || '');
    if (productTypeFilter === 'consumable' && isTool) return false;
    if (productTypeFilter === 'tool' && !isTool) return false;
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.specification || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = selectedCategory === 'All' || p.categoryName === selectedCategory;
    return matchSearch && matchCategory;
  });

  const handleProcessRequest = async (id: number, action: 'approve' | 'reject') => {
    const confirmMsg =
      action === 'approve'
        ? "Approve this request? The system will automatically split purchase orders by supplier."
        : "Permanently delete this request?";
    if (!window.confirm(confirmMsg)) return;

    try {
      const response = await fetch(procurementApi(`/requests/${id}/process?action=${action}`), { method: 'POST' });
      const result = await response.json();
      if (response.ok) {
        alert(result.message);
        loadRequests(); 
      }
    } catch (error) { console.error("Action failed", error); }
  };

  const handleReceiveInputChange = (itemId: number, value: string) => {
    const val = parseInt(value, 10);
    setReceiveInputs(prev => ({ ...prev, [itemId]: isNaN(val) ? 0 : val }));
  };

  const handleReceivePartial = async (orderId: number, items: any[]) => {
    const payload = items.map(i => ({
      itemId: i.id,
      quantity: receiveInputs[i.id] !== undefined ? receiveInputs[i.id] : 0
    })).filter(p => p.quantity > 0); 

    if (payload.length === 0) return alert("⚠️ Please enter the quantities received this time first.");
    if (!window.confirm("📦 Confirm receiving the entered quantities and updating stock?")) return;

    try {
      const response = await fetch(procurementApi(`/restock-orders/${orderId}/receive`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (response.ok) {
        alert("🎉 Goods received successfully! On-hand stock increased and in-transit stock reduced.");
        setReceiveInputs({}); 
        loadRestockOrders();
      } else {
        const text = await response.text(); alert("Receiving failed: " + text);
      }
    } catch (error) { alert("Network error"); }
  };

  const handleDeleteRestockOrder = async (id: number) => {
    if (!window.confirm("⚠️ Dangerous action: permanently delete this restock order?\n(Unreceived in-transit stock will be rolled back automatically.)")) return;
    try {
      const response = await fetch(procurementApi(`/restock-orders/${id}`), { method: 'DELETE' });
      if (response.ok) { alert("🗑️ Deleted successfully. Records are now balanced."); loadRestockOrders(); } 
      else { alert("Completed orders cannot be deleted."); }
    } catch (error) { alert("Network error"); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { alert("Please upload a .csv file."); return; }
    
    const fd = new FormData(); 
    fd.append('file', file);
    
    try {
      const response = await fetch(procurementApi('/upload-products'), { method: 'POST', body: fd });
      const result = await response.json().catch(() => ({ message: "Unknown error" }));
      
      if (response.ok) { 
        alert(result.message); 
        loadProducts(); 
      } else { 
        alert(`❌ Import failed:\n${result.message || response.statusText}`); 
      }
    } catch (error) { 
      alert('❌ Network error. Upload failed. Please check whether the backend is running.'); 
    } finally { 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const response = await fetch(procurementApi(`/products/${id}`), { method: 'DELETE' });
      if (response.ok) { alert("Deleted successfully."); loadProducts(); } else { alert("Delete failed. The item may still be used by an order."); }
    } catch (error) { alert("Network error"); }
  };

  const handleOpenAdd = (type: 'consumable' | 'tool') => {
    setEditingId(null);
    setFormData({ 
      name: '', code: '', 
      // 👇 [New code fusion]: Initialize new fields
      specification: '', imageUrl: '',
      // 👆 [New code fusion completed]
      unit: type === 'tool' ? 'set' : 'pcs', 
      categoryName: type === 'tool' ? 'Workshop Tools' : '', 
      currentStock: 0, minStockAlert: 0, purchasePrice: 0, supplierId: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingId(p.id);
    setFormData({
      name: p.name, code: p.code || '', 
      // 👇 [New code fusion]: Bring in specifications and image links when editing
      specification: p.specification || '', 
      imageUrl: p.imageUrl || '',
      // 👆 [New code fusion completed]
      unit: p.unit || 'pcs',
      categoryName: p.categoryName || '', 
      currentStock: p.currentStock || 0, minStockAlert: p.minStockAlert || 0, 
      purchasePrice: p.purchasePrice || 0, supplierId: p.supplierId ? p.supplierId.toString() : ''
    });
    setIsModalOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!formData.name) return alert("Item name cannot be empty.");
    const url = editingId ? procurementApi(`/products/${editingId}`) : procurementApi('/products');
    const payload = { ...formData, supplierId: formData.supplierId ? parseInt(formData.supplierId) : null };
    try {
      const response = await fetch(url, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.ok) { setIsModalOpen(false); loadProducts(); } else { alert("Save failed."); }
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
        alert("❌ Unable to connect to the smart restocking engine. Please confirm the backend has been updated for this feature.");
      }
    } catch (err) { alert("❌ Network connection failed. Please check whether the backend service is running."); }
  };

  const handleApplySmartRestock = async () => {
    const payload = smartRestockItems.map(i => ({ productId: i.productId, quantity: i.suggestedQuantity }));
    try {
      const res = await fetch(procurementApi('/smart-restock/apply'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("🎉 Smart restock requests were created successfully! Please review and approve them in [Pending Review].");
        setIsSmartModalOpen(false);
      }
    } catch (err) { alert("Submission failed"); }
  };

  const exportToExcel = (order: any) => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    
    csvContent += `Purchase Order (PO) Number,${order.orderNumber}\n`;
    csvContent += `Supplier,${order.supplierName}\n`;
    csvContent += `Order Date,${new Date(order.createdAt).toLocaleDateString()}\n`;
    csvContent += `\n`; 
    
    csvContent += `Item Name,Specification,Unit,Required Quantity\n`;
    order.items.forEach((item: any) => {
      const pName = item.product?.name ? `"${item.product.name}"` : 'Unknown'; 
      const spec = item.product?.specification ? `"${item.product.specification}"` : '';
      const unit = 'pcs'; 
      csvContent += `${pName},${spec},${unit},${item.quantity}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${order.orderNumber}_order-details.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpdateStock = async () => {
    if (!window.confirm("Overwrite current stock using the stocktake data? Any blank values will remain unchanged.")) return;
    
    let updated = 0;
    for (const [id, newStock] of Object.entries(stocktakeInputs)) {
      const p = products.find(prod => prod.id === Number(id));
      if (p && newStock !== p.currentStock) {
        const payload = { ...p, currentStock: newStock };
        await fetch(procurementApi(`/products/${id}`), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        updated++;
      }
    }
    alert(`Stocktake complete! Successfully adjusted stock for ${updated} items.`);
    setStocktakeInputs({});
    loadProducts();
  };

  return (
    <div className="p-6 max-w-6xl w-full relative mx-auto">
      <div className="mb-6 flex justify-between items-end border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Procurement & Materials Center</h1>
          <p className="text-sm text-gray-500 mt-1">Manage procurement requests, item master data, and stock</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('requests')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'requests' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>📋 Pending Review</button>
          <button onClick={() => setActiveTab('inventory')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'inventory' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>📦 Materials & Tools</button>
          <button onClick={() => setActiveTab('restock')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'restock' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>🚚 Purchase Orders (PO)</button>
          <button onClick={() => setActiveTab('stocktake')} className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${activeTab === 'stocktake' ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600' : 'text-gray-500 hover:bg-gray-100'}`}>📊 Monthly Stocktake</button>
        </div>
      </div>

      {/*================= Tab 1: Pending review =================*/}
      {activeTab === 'requests' && (
        <div>
          {loadingRequests ? <p className="text-gray-500 text-center py-10">Loading data...</p> : requests.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow border border-gray-100 text-center"><p className="text-gray-500">There are currently no pending procurement requests 🎉</p></div>
          ) : (
            <div className="flex flex-col gap-6">
              {requests.map(req => (
                <div key={req.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-4">
                    <div>
                      <span className="font-bold text-lg text-gray-800">Requester: {req.staffName}</span>
                      <span className="text-sm text-gray-400 ml-4">{new Date(req.createdAt).toLocaleString()}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${req.status === 'Pending' ? 'bg-amber-100 text-amber-700' : req.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {req.status === 'Pending' ? 'Pending' : req.status === 'Approved' ? 'Approved' : 'Rejected'}
                    </span>
                  </div>
                  <div className="mb-4">
                    <ul className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                      {req.items.map((item: any, idx: number) => (
                        <li key={idx} className="flex justify-between py-1.5 text-gray-700">
                          <span>{item.productName} <span className="text-gray-400 text-sm">{item.specification && `(${item.specification})`}</span></span>
                          <span className="font-bold text-blue-600">x {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {req.status === 'Pending' ? (
                    <div className="flex justify-end gap-3 pt-2">
                       <button onClick={() => handleProcessRequest(req.id, 'reject')} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">Reject / Delete</button>
                       <button onClick={() => handleProcessRequest(req.id, 'approve')} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm">✅ Approve and auto-split into POs</button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3 pt-2">
                       <button onClick={() => handleProcessRequest(req.id, 'reject')} className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition flex items-center gap-1">🗑️ Permanently delete this record</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*================= Tab 2: Material Library =================*/}
      {activeTab === 'inventory' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 mb-2">
            <button onClick={() => setProductTypeFilter('all')} className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${productTypeFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>All Assets</button>
            <button onClick={() => setProductTypeFilter('consumable')} className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${productTypeFilter === 'consumable' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>📦 Consumables</button>
            <button onClick={() => setProductTypeFilter('tool')} className={`px-4 py-1.5 rounded-full text-sm font-bold border transition ${productTypeFilter === 'tool' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>🔧 Workshop Tools</button>
          </div>

          <div className="flex gap-6 h-[65vh]">
            <div className="w-48 bg-gray-50 border border-gray-200 rounded-xl flex flex-col overflow-hidden shadow-sm shrink-0">
              <div className="p-3 bg-gray-100 border-b border-gray-200 font-bold text-gray-700 text-sm">Item Categories</div>
              <div className="overflow-y-auto p-2 flex flex-col gap-1">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition ${selectedCategory === cat ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}>{cat}</button> ))} </div> </div> <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"> <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50"> <div className="flex items-center gap-3"> <input type="text" placeholder="🔍 Search by name, code, or specification..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-64" /> <button onClick={handleSmartScan} className="px-3 py-1.5 text-sm font-bold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition shadow-sm border border-amber-200 flex items-center gap-1">🤖 Smart Restock Scan</button> </div> <div className="flex gap-2"> <button onClick={() => handleOpenAdd('consumable')} className="px-3 py-1.5 text-sm font-bold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition shadow-sm border border-blue-200">➕ New Consumable</button> <button onClick={() => handleOpenAdd('tool')} className="px-3 py-1.5 text-sm font-bold text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition shadow-sm border border-purple-200">🔧 New Tool</button> <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" /> <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm font-bold text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition shadow-sm border border-green-200">📥 Bulk Import</button> </div> </div> <div className="flex-1 overflow-auto p-0"> {loadingProducts ? <p className="text-gray-500 text-center py-10">Loading data...</p> : ( <table className="w-full text-left border-collapse"> <thead> <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase sticky top-0 z-10"> <th className="p-3 font-semibold">Name / Code</th> <th className="p-3 font-semibold">Category / Supplier</th> <th className="p-3 font-semibold text-right">Purchase Price</th> <th className="p-3 font-semibold text-right">Current Status / Stock</th> <th className="p-3 font-semibold text-center">Actions</th> </tr> </thead> <tbody className="divide-y divide-gray-100 text-sm"> {filteredProducts.map(p => { const isTool = /tool|tool/i.test(p.categoryName || ''); return ( <tr key={p.id} className="hover:bg-gray-50 transition"> {/*👇[New code fusion]: Combines your picture display and specification display while retaining the original layout*/} <td className="p-3 flex items-center gap-3"> {p.imageUrl && <img src={p.imageUrl} alt="img" className="w-8 h-8 rounded object-cover shadow-sm border border-gray-200" />} <div> <div className="font-medium text-gray-800 flex items-center gap-1"> {isTool && <span title="Tool">🔧</span>} {p.name} </div> <div className="text-xs text-gray-400"> {p.code || '-'} {p.specification &&`| ${p.specification}`}
                                </div>
                              </div>
                            </td>
                            {/*👆 [New code fusion completed]*/}
                            <td className="p-3 text-xs">
                              <span className={`${isTool ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'} px-2 py-0.5 rounded mr-1`}>{p.categoryName}</span>
                              <div className="text-gray-500 mt-1">{p.supplierName}</div>
                            </td>
                            <td className="p-3 text-right font-mono text-gray-600">${p.purchasePrice?.toFixed(2)}</td>
                            <td className="p-3 text-right">
                              <span className="font-bold text-gray-700">{p.currentStock}</span>
                              {!isTool && <span className="text-xs text-gray-400 font-normal ml-1">/ Alert {p.minStockAlert}</span>}
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => handleOpenEdit(p)} className="text-blue-500 hover:text-blue-700 font-medium text-sm px-2 py-1">Edit</button>
                              <button onClick={() => handleDeleteProduct(p.id)} className="text-red-500 hover:text-red-700 font-medium text-sm px-2 py-1">Delete</button>
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

      {/*================= Tab 3: Purchase Documents =================*/}
      {activeTab === 'restock' && (
        <div className="flex flex-col gap-6">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="font-bold text-blue-800">Smart Procurement Engine</h3>
              <p className="text-sm text-blue-600 mt-1">Approved requests have been split into separate POs by supplier. Enter received quantities when goods arrive to book them into stock.</p>
            </div>
          </div>

          {restockOrders.length === 0 ? (
             <div className="bg-white p-8 rounded-lg shadow border border-gray-100 text-center"><p className="text-gray-500">There are currently no restock orders in transit 🚚</p></div>
          ) : (
            restockOrders.map(order => (
              <div key={order.id} className={`bg-white p-6 rounded-xl shadow-sm border ${order.status === 'Completed' ? 'border-green-300 opacity-80' : 'border-gray-200'}`}>
                <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`font-bold text-xl font-mono ${order.status === 'Completed' ? 'text-green-700' : 'text-blue-800'}`}>{order.orderNumber}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200 shadow-sm">Supplier: {order.supplierName}</span>
                    </div>
                    <span className="text-sm text-gray-400">{new Date(order.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${order.status === 'Completed' ? 'bg-green-100 text-green-700' : order.status === 'Partially Received' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {order.status === 'Completed' ? '✅ Completed' : order.status === 'Partially Received' ? '⏳ Partially Received' : '🚚 Sent to Supplier'}
                    </span>
                    {order.status !== 'Completed' && (
                      <div className="flex items-center gap-3 mt-1">
                         <button onClick={() => exportToExcel(order)} className="text-xs text-green-600 hover:text-green-800 font-bold border border-green-200 bg-green-50 px-2 py-1 rounded">📋 Export CSV for Supplier</button>
                         <button onClick={() => handleDeleteRestockOrder(order.id)} className="text-xs text-red-500 hover:text-red-700 underline font-medium cursor-pointer">🗑️ Discard this order</button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mb-4">
                  <table className="w-full text-left text-sm border border-gray-200 rounded overflow-hidden">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="p-2 border-b">Item Name</th>
                        <th className="p-2 border-b text-center">Ordered Qty</th>
                        <th className="p-2 border-b text-center">Received Qty</th>
                        <th className="p-2 border-b text-right w-40">Received This Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {order.items.map((i: any, idx: number) => {
                        const remaining = i.quantity - i.receivedQuantity;
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className={`p-2 font-medium ${order.status === 'Completed' ? 'text-gray-500' : 'text-gray-800'}`}>
                              {i.product?.name}
                              {/*👇 [New code fusion]: Add specification display to the document product list*/}
                              {i.product?.specification && <span className="text-xs text-gray-400 ml-1">({i.product.specification})</span>}
                              {/*👆 [New code fusion completed]*/}
                            </td>
                            <td className="p-2 text-center font-bold text-blue-600 bg-blue-50/50 border-l border-r">{i.quantity}</td>
                            <td className={`p-2 text-center font-bold bg-green-50/50 border-r ${i.quantity === i.receivedQuantity ? 'text-green-600' : 'text-gray-500'}`}>
                              {i.quantity === i.receivedQuantity ? '✅ ' : ''}{i.receivedQuantity}
                            </td>
                            <td className="p-2 text-right">
                              {remaining > 0 ? (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-gray-400">{remaining} remaining</span>
                                  <input 
                                    type="number" 
                                    min="0" max={remaining}
                                    placeholder="Enter qty"
                                    value={receiveInputs[i.id] !== undefined ? receiveInputs[i.id] : ''}
                                    onChange={(e) => handleReceiveInputChange(i.id, e.target.value)}
                                    className="w-20 border border-gray-300 rounded p-1 text-center text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs italic">Complete</span>
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
                     {order.status === 'Completed' ? '📦 Stock received' : '📥 Confirm received quantity and book into stock'}
                   </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/*================= Tab 4: Monthly Inventory System =================*/}
      {activeTab === 'stocktake' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[75vh]">
          <div className="p-4 border-b border-gray-100 bg-purple-50 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-purple-800 text-lg">🕵️ End-of-Month Stocktake</h3>
              <p className="text-xs text-purple-600 mt-1">Enter the actual quantities on the shelves. The system will calculate items used this month automatically. Submit once everything is confirmed.</p>
            </div>
            <button onClick={handleBulkUpdateStock} className="px-5 py-2 text-sm font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition shadow">💾 Submit stocktake and overwrite actual stock</button>
          </div>
          
          <div className="flex-1 overflow-auto p-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase sticky top-0 z-10">
                  <th className="p-3 font-semibold">Item Name</th>
                  <th className="p-3 font-semibold text-center">Book Stock</th>
                  <th className="p-3 font-semibold text-center w-48">Actual Shelf Stock</th>
                  <th className="p-3 font-semibold text-center">Actual Monthly Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {products.map(p => {
                  const actualVal = stocktakeInputs[p.id];
                  const hasInput = actualVal !== undefined && !isNaN(actualVal);
                  
                  const consumed = hasInput ? p.currentStock - actualVal : 0;
                  
                  return (
                    <tr key={p.id} className="hover:bg-purple-50/30 transition">
                      <td className="p-3 font-medium text-gray-800">{p.name} <span className="text-xs text-gray-400">{p.code}</span></td>
                      <td className="p-3 text-center text-gray-500 text-lg font-mono">{p.currentStock}</td>
                      <td className="p-3 text-center">
                        <input 
                          type="number" min="0" placeholder="Enter remaining qty"
                          value={hasInput ? actualVal : ''} onChange={(e) => setStocktakeInputs(prev => ({ ...prev, [p.id]: parseInt(e.target.value) }))} className="w-24 border-2 border-purple-200 rounded-lg p-1.5 text-center font-bold outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition" /> </td> <td className="p-3 text-center"> {!hasInput ? <span className="text-gray-300">-</span> : consumed === 0 ? <span className="text-gray-400 font-bold">➖ No usage</span> : consumed > 0 ? <span className="text-blue-600 font-bold">⬇️ Used {consumed}</span> : <span className="text-red-600 font-bold">⚠️ Exception: {Math.abs(consumed)} extra</span> } </td> </tr> ); })} </tbody> </table> </div> </div> )} {/*================= Smart replenishment pop-up window =================*/} {isSmartModalOpen && ( <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm"> <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]"> <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 flex justify-between items-center"> <div> <h3 className="font-bold text-lg text-amber-900 flex items-center gap-2">🤖 Smart Restock Radar</h3> <p className="text-xs text-amber-700 mt-1">The system scanned all items where current stock + in-transit stock is below the alert threshold</p> </div> <button onClick={() => setIsSmartModalOpen(false)} className="text-amber-800 hover:text-amber-900 text-2xl font-bold">×</button> </div> <div className="overflow-auto p-6 flex-1 bg-gray-50"> {smartRestockItems.length === 0 ? ( <div className="text-center py-10"><p className="text-gray-500">🎉 Great news! No items are currently below their alert stock level, so no restocking is needed.</p></div> ) : ( <div className="grid gap-3"> {smartRestockItems.map((item: any, idx: number) => ( <div key={idx} className="bg-white border border-gray-200 p-4 rounded-lg flex items-center justify-between shadow-sm"> <div> <div className="font-bold text-gray-800 text-lg">{item.name} <span className="text-sm font-normal text-gray-500">({item.supplierName})</span></div> <div className="text-sm text-gray-500 mt-1">Current stock: <strong className="text-red-500">{item.currentStock}</strong> | In transit: <strong>{item.inTransitStock}</strong> | Alert level: <strong>{item.minStockAlert}</strong></div> </div> <div className="flex items-center gap-3"> <span className="text-sm font-semibold text-gray-600">Suggested restock qty:</span> <input type="number" value={item.suggestedQuantity} onChange={(e) => { const newItems = [...smartRestockItems]; newItems[idx].suggestedQuantity = parseInt(e.target.value) || 0; setSmartRestockItems(newItems); }} className="w-20 border-2 border-amber-300 rounded-lg p-1.5 text-center font-bold text-amber-700 outline-none focus:border-amber-500" /> </div> </div> ))} </div> )} </div> <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-white"> <button onClick={() => setIsSmartModalOpen(false)} className="px-4 py-2 font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Not now</button> {smartRestockItems.length > 0 && ( <button onClick={handleApplySmartRestock} className="px-6 py-2 font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition shadow-lg">🚀 Generate procurement requests</button> )} </div> </div> </div> )} {/*================= Form popup (complete with new fields) =================*/} {isModalOpen && ( <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center backdrop-blur-sm"> <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"> <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0"> <h3 className="font-bold text-lg text-gray-800"> {/tool|tool/i.test(formData.categoryName)?'🔧 Edit / Create Tool' : '📦 Edit / Create Consumable'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>
            
            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Code</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                </div>
                
                {/*👇[New code fusion]: Specification input box*/}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Specification</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.specification} onChange={e => setFormData({...formData, specification: e.target.value})} />
                </div>
                {/*👆 [New code fusion completed]*/}

                {/*👇 [New code fusion]: Image link input box*/}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Image URL</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="https://..." />
                </div>
                {/*👆 [New code fusion completed]*/}

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Category (contains "tool" to be treated as a tool)</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 focus:border-blue-500 outline-none" value={formData.categoryName} onChange={e => setFormData({...formData, categoryName: e.target.value})} placeholder="For example: Consumables, Workshop Tools" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Default Supplier</label>
                  <select className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.supplierId} onChange={e => setFormData({...formData, supplierId: e.target.value})}>
                    <option value="">-- Please select a supplier (optional) --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t pt-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Purchase Price ($)</label>
                  <input type="number" step="0.01" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none font-mono" value={formData.purchasePrice} onChange={e => setFormData({...formData, purchasePrice: parseFloat(e.target.value) || 0})} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Current Stock</label>
                  <input type="number" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.currentStock} onChange={e => setFormData({...formData, currentStock: parseInt(e.target.value) || 0})} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none"value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} /> </div> {!/tool|tool/i.test(formData.categoryName) ? ( <div className="col-span-3">
                    <label className="block text-sm font-semibold text-red-600 mb-1">Alert Stock</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg p-2 focus:border-blue-500 outline-none" value={formData.minStockAlert} onChange={e => setFormData({...formData, minStockAlert: parseInt(e.target.value) || 0})} />
                  </div>
                ) : (
                  <div className="col-span-3 flex items-center text-sm text-gray-400">Tool items do not require an alert stock level</div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancel</button>
              <button onClick={handleSaveProduct} className="px-5 py-2 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow">💾 Save Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
