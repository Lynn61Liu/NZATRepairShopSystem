import { useState, useEffect, useMemo } from 'react';
import { withApiBase } from '@/utils/api';
import ProductCard from './ProductCard';
import './Shopfront.css';

const procurementApi = (path: string) => withApiBase(`/api/procurement${path}`);

const Shopfront = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<{ [key: number]: number }>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  
  // 搜索和分类状态
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  useEffect(() => {
    // 获取后端真实数据（现在后端会带上 categoryName 了）
    fetch(procurementApi('/products'))
      .then(res => res.json())
      .then(data => {
        const formattedData = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          spec: p.specification || '',
          stock: p.currentStock || 0,
          categoryName: p.categoryName || '未分类', // 接收分类名称
          isTool: false, 
          img: p.imageUrl || `https://via.placeholder.com/300x200?text=${encodeURIComponent(p.name)}`
        }));
        setProducts(formattedData);
      })
      .catch(err => console.error("获取后端数据失败:", err));
  }, []);

  // 动态提取左侧分类菜单
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.categoryName));
    return ['全部', ...Array.from(cats)];
  }, [products]);

  const handleAdd = (product: any) => {
    setCart((prev) => {
      const currentQty = prev[product.id] || 0;
      return { ...prev, [product.id]: currentQty + 1 };
    });
  };

  const handleMinus = (product: any) => {
    setCart((prev) => {
      const currentQty = prev[product.id] || 0;
      if (currentQty <= 1) {
        const newCart = { ...prev };
        delete newCart[product.id];
        return newCart;
      }
      return { ...prev, [product.id]: currentQty - 1 };
    });
  };

  const handleSubmit = async () => {
    const requestBody = {
      staffName: "内部测试师傅", 
      notes: orderNote,
      items: Object.keys(cart).map(productId => ({
        productId: parseInt(productId),
        quantity: cart[parseInt(productId)]
      }))
    };

    try {
      const response = await fetch(procurementApi('/requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        alert('🎉 提交成功！你的采购需求已同步至后台数据库。');
        setCart({}); 
        setOrderNote(''); 
        setIsModalOpen(false); 
      } else {
        alert('提交失败，后端返回了错误。');
      }
    } catch (error) {
      console.error("提交出错:", error);
      alert('网络错误，提交失败。');
    }
  };

  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  // 核心过滤逻辑：同时满足“搜索词”和“左侧分类”才显示
  const filteredProducts = products.filter(product => {
    const matchSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        product.spec.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = selectedCategory === '全部' || product.categoryName === selectedCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="shopfront-container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 m-0">内部物料申领 / 采购</h1>
        
        {/* 搜索框 */}
        <input 
          type="text" 
          placeholder="🔍 搜索物料名称或规格..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>
      
      <div className="flex gap-6 items-start">
        {/* === 左侧分类导航树 === */}
        <div className="w-48 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden sticky top-6 shrink-0">
          <div className="p-3 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 text-sm">
            物料分类
          </div>
          <div className="p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* === 右侧商品网格 === */}
        <div className="flex-1">
          <div className="product-grid">
            {products.length === 0 ? (
              <p className="col-span-full p-8 text-center text-gray-500">正在加载物料数据...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="col-span-full p-8 text-center text-gray-500">
                没有在【{selectedCategory}】中找到匹配的物料 🧐
              </p>
            ) : (
              filteredProducts.map((product) => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  cartQty={cart[product.id] || 0} 
                  onAdd={handleAdd} 
                  onMinus={handleMinus} 
                />
              ))
            )}
          </div>
        </div>
      </div>

      {totalItems > 0 && (
        <div className="cart-bar">
          <div className="cart-info">
            <span>已选</span>
            <span className="cart-qty">{totalItems}</span>
            <span>件物料</span>
          </div>
          <button className="btn-checkout" onClick={() => setIsModalOpen(true)}>
            查看并提交
          </button>
        </div>
      )}

      {/* 弹窗部分保持不变 */}
      {isModalOpen && (
        <div className="cart-modal-overlay">
          <div className="cart-modal">
            <div className="modal-header">
              <span>确认采购需求</span>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              {products.filter(p => cart[p.id]).map(product => (
                <div key={product.id} className="cart-item-row">
                  <span>{product.name} <span className="text-gray-400 text-sm">({product.spec})</span></span>
                  <strong>x {cart[product.id]}</strong>
                </div>
              ))}
              
              <textarea 
                className="note-input mt-4"
                rows={3} 
                placeholder="有啥特殊要求写这里 (比如：急用、要什么牌子)..."
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
              />
            </div>

            <button className="btn-submit" onClick={handleSubmit}>
              正式提交给后台
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Shopfront;
