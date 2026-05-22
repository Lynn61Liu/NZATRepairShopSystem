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
  
  // Search and sort status
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  useEffect(() => {
    // Get the real data from the backend (the backend will now have categoryName)
    fetch(procurementApi('/products'))
      .then(res => res.json())
      .then(data => {
        const formattedData = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          spec: p.specification || '',
          stock: p.currentStock || 0,
          categoryName: p.categoryName || 'Uncategorized', // receive category name
          isTool: false, 
          img: p.imageUrl || `https://via.placeholder.com/300x200?text=${encodeURIComponent(p.name)}`
        }));
        setProducts(formattedData);
      })
      .catch(err => console.error("Failed to load backend data:", err));
  }, []);

  // Dynamically extract the left category menu
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.categoryName));
    return ['All', ...Array.from(cats)];
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
      staffName: "Internal Test Technician", 
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
        alert('🎉 Submitted successfully! Your procurement request has been synced to the backend database.');
        setCart({}); 
        setOrderNote(''); 
        setIsModalOpen(false); 
      } else {
        alert('Submission failed. The backend returned an error.');
      }
    } catch (error) {
      console.error("Submission error:", error);
      alert('Network error. Submission failed.');
    }
  };

  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  // Core filtering logic: display only when "search terms" and "left classification" are met simultaneously
  const filteredProducts = products.filter(product => {
    const matchSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        product.spec.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = selectedCategory === 'All' || product.categoryName === selectedCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="shopfront-container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 m-0">Internal Supplies Request / Procurement</h1>
        
        {/*search box*/}
        <input 
          type="text" 
          placeholder="🔍 Search by item name or specification..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>
      
      <div className="flex gap-6 items-start">
        {/*=== Classification navigation tree on the left ===*/}
        <div className="w-48 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden sticky top-6 shrink-0">
          <div className="p-3 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 text-sm">
            Item Categories
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

        {/*=== Product grid on the right ===*/}
        <div className="flex-1">
          <div className="product-grid">
            {products.length === 0 ? (
              <p className="col-span-full p-8 text-center text-gray-500">Loading item data...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="col-span-full p-8 text-center text-gray-500">
                No matching items found in [{selectedCategory}] 🧐
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
            <span>Selected</span>
            <span className="cart-qty">{totalItems}</span>
            <span>items</span>
          </div>
          <button className="btn-checkout" onClick={() => setIsModalOpen(true)}>
            Review and Submit
          </button>
        </div>
      )}

      {/*The pop-up part remains unchanged*/}
      {isModalOpen && (
        <div className="cart-modal-overlay">
          <div className="cart-modal">
            <div className="modal-header">
              <span>Confirm Procurement Request</span>
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
                placeholder="Add any special requirements here (for example: urgent, preferred brand)..."
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
              />
            </div>

            <button className="btn-submit" onClick={handleSubmit}>
              Submit to Backend
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Shopfront;
