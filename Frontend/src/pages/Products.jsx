import React, { useState, useEffect } from 'react';
import { Plus, Search, Package, RefreshCw, BarChart2, X, TrendingUp, ShoppingBag, PackagePlus, RotateCcw } from 'lucide-react';
import ProductCard from '../components/products/ProductCard';
import ProductForm from '../components/products/ProductForm';
import { productsAPI } from '../utils/api';
import toast from 'react-hot-toast';

// ─── Today's Report Modal ───────────────────────────────────────────────────
const TodayReportModal = ({ onClose }) => {
  const getTodayStr = () => {
    const now = new Date();
    now.setHours(now.getHours() + 6);
    return now.toISOString().split('T')[0];
  };
  const [selectedDate, setSelectedDate] = useState(getTodayStr);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async (date) => {
    setLoading(true);
    setReport(null);
    try {
      const res = await productsAPI.getTodayReport(date);
      if (res.success) setReport(res.data);
      else toast.error('Failed to load report');
    } catch {
      toast.error('Server connection error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(selectedDate); }, [selectedDate]);

  const fmt = (n) => (n || 0).toLocaleString('en-BD');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" style={{ animation: 'fadeScaleIn 0.3s ease' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2"><BarChart2 className="h-6 w-6" /></div>
            <div>
              <h2 className="text-xl font-bold">Product Report</h2>
              <p className="text-sm text-white/80">{report?.date || selectedDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Date Picker */}
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-white/20 border border-white/30 rounded-xl px-3 py-1.5 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
              style={{ colorScheme: 'dark' }}
            />
            <button onClick={onClose} className="bg-white/20 hover:bg-white/30 rounded-xl p-2 transition-all"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : !report ? (
            <p className="text-center text-gray-400 py-12">No data found</p>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'New Products', value: report.summary.newProductsCount, icon: <PackagePlus className="h-5 w-5" />, color: 'from-blue-500 to-blue-600' },
                  { label: 'Restocked', value: report.summary.restockedCount, icon: <RotateCcw className="h-5 w-5" />, color: 'from-violet-500 to-violet-600' },
                  { label: 'Total Sales', value: `৳${fmt(report.summary.totalSalesValue)}`, icon: <TrendingUp className="h-5 w-5" />, color: 'from-green-500 to-emerald-600' },
                  { label: 'New Stock Value', value: `৳${fmt(report.summary.totalNewStockValue)}`, icon: <ShoppingBag className="h-5 w-5" />, color: 'from-orange-500 to-red-500' },
                ].map((s, i) => (
                  <div key={i} className={`bg-gradient-to-br ${s.color} text-white rounded-2xl p-4 shadow-md`}>
                    <div className="flex items-center gap-2 mb-2 opacity-80">{s.icon}<span className="text-xs font-medium">{s.label}</span></div>
                    <p className="text-xl font-bold">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Products Added Today */}
              <section>
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-base">
                  <PackagePlus className="h-5 w-5 text-blue-500" /> Products Added Today ({report.productsAdded.length})
                </h3>
                {report.productsAdded.length === 0 ? (
                  <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No new products added today</p>
                ) : (
                  <div className="space-y-2">
                    {report.productsAdded.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.category} • Added by: {p.createdBy}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-blue-700">৳{fmt(p.unitPrice)}<span className="text-xs font-normal text-gray-400">/{p.unit}</span></p>
                          <p className="text-xs text-gray-500">Stock: {p.availableStock} {p.unit}</p>
                          <p className="text-xs font-semibold text-green-600">Value: ৳{fmt(p.stockValue)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Products Restocked Today */}
              {report.productsRestocked.length > 0 && (
                <section>
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-base">
                    <RotateCcw className="h-5 w-5 text-violet-500" /> Stock Updated Today ({report.productsRestocked.length})
                  </h3>
                  <div className="space-y-2">
                    {report.productsRestocked.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.category} • Updated by: {p.updatedBy}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-violet-700">৳{fmt(p.unitPrice)}/{p.unit}</p>
                          <p className="text-xs text-gray-500">Current: {p.availableStock} {p.unit}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Today's Sales */}
              <section>
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-green-500" /> Today's Sales ({report.sales.totalTransactions} transactions)
                </h3>
                {report.sales.totalTransactions === 0 ? (
                  <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No sales today</p>
                ) : (
                  <>
                    {/* By Product Summary */}
                    <div className="space-y-2 mb-3">
                      {report.sales.byProduct.map((p, i) => (
                        <div key={i} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                          <div>
                            <p className="font-semibold text-gray-800 text-sm">{p.productName}</p>
                            <p className="text-xs text-gray-500">{p.transactions} transactions • {p.totalQty} {p.unit}</p>
                          </div>
                          <p className="text-base font-bold text-green-700">৳{fmt(p.totalValue)}</p>
                        </div>
                      ))}
                    </div>

                    {/* Total */}
                    <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-lg">
                      <div>
                        <p className="text-green-100 text-sm">Total Sales Revenue (Today)</p>
                        <p className="text-xs text-green-200">{report.sales.totalQtySold} products sold</p>
                      </div>
                      <p className="text-2xl font-bold">৳{fmt(report.sales.totalSalesValue)}</p>
                    </div>

                    {/* Transaction Details */}
                    {report.sales.details.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-indigo-600 font-semibold hover:text-indigo-800 select-none">View detailed transactions ▼</summary>
                        <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                          {report.sales.details.map((s, i) => (
                            <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs">
                              <div>
                                <p className="font-semibold text-gray-700">{s.productName} × {s.quantity} {s.unit}</p>
                                <p className="text-gray-400">Member: {s.memberName} ({s.memberCode}) • {s.collectorName}</p>
                              </div>
                              <p className="font-bold text-gray-800">৳{fmt(s.subtotal)}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

// ─── Main Products Page ─────────────────────────────────────────────────────
const Products = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTodayReport, setShowTodayReport] = useState(false);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [globalStats, setGlobalStats] = useState({ totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0 });

  useEffect(() => { fetchProducts(); }, [currentPage]);
  useEffect(() => { setCurrentPage(1); fetchProducts(); }, [searchTerm]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchProducts(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const fetchProducts = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const params = { page: currentPage, limit: 50 };
      if (searchTerm) params.search = searchTerm;
      if (isRefresh) params._t = Date.now();

      const response = await productsAPI.getAll(params);
      if (response.success) {
        setProducts(response.data || []);
        if (response.pagination) setTotalPages(response.pagination.pages || 1);
        if (response.stats) setGlobalStats(response.stats);
        if (isRefresh) toast.success('Products refreshed!');
      } else {
        toast.error('Failed to fetch products');
        setProducts([]);
      }
    } catch {
      toast.error('Error connecting to server');
      setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAddProduct = async (productData) => {
    try {
      const response = await productsAPI.create(productData);
      if (response.success) { toast.success('Product added successfully!'); setShowAddForm(false); await fetchProducts(); }
      else toast.error(response.message || 'Failed to add product');
    } catch { toast.error('Error adding product. Please try again.'); }
  };

  const handleEditProduct = async (productData) => {
    try {
      const response = await productsAPI.update(editingProduct._id || editingProduct.id, productData);
      if (response.success) {
        toast.success('Product updated successfully! 🔄 Refreshing...');
        setEditingProduct(null);
        setRefreshing(true);
        setTimeout(async () => { await fetchProducts(true); }, 500);
      } else toast.error(response.message || 'Failed to update product');
    } catch { toast.error('Error updating product. Please try again.'); }
  };

  const handleDeleteProduct = async (productId) => {
    const product = products.find(p => (p._id || p.id) === productId);
    const productName = product ? product.name : 'this product';
    if (window.confirm(`Are you sure you want to delete "${productName}"?\n\nThis action cannot be undone.`)) {
      try {
        const response = await productsAPI.delete(productId);
        if (response.success) {
          toast.success(`Product "${productName}" deleted successfully!`);
          setRefreshing(true);
          setTimeout(async () => { await fetchProducts(true); }, 300);
        } else toast.error(response.message || 'Failed to delete product');
      } catch { toast.error('Error deleting product. Please try again.'); }
    }
  };

  const handleUpdateStock = async (productId, stockChange) => {
    try {
      const product = products.find(p => (p._id || p.id) === productId);
      if (!product) { toast.error('Product not found'); return; }
      const currentStock = product.availableStock || product.totalStock || 0;
      const newStock = currentStock + stockChange;
      if (newStock < 0) { toast.error('Stock cannot be negative!'); return; }
      const action = stockChange > 0 ? 'add' : 'remove';
      const quantity = Math.abs(stockChange);
      const response = await productsAPI.updateStock(productId, { action, quantity, reason: `Stock ${action === 'add' ? 'increased' : 'decreased'} by ${quantity}` });
      if (response.success) {
        toast.success(`Stock updated! ${currentStock} → ${newStock}`);
        setRefreshing(true);
        setTimeout(async () => { await fetchProducts(true); }, 300);
      } else toast.error(response.message || 'Failed to update stock');
    } catch { toast.error('Error updating stock. Please try again.'); }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-md mb-3">
            <Package className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Product Management</h1>
          <p className="text-gray-500 text-sm">Manage inventory and track stock levels</p>
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search products by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
              />
            </div>

            <div className="flex items-center space-x-3 flex-wrap gap-y-2">
              {/* TODAY REPORT BUTTON */}
              <button
                onClick={() => setShowTodayReport(true)}
                className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 text-white px-5 py-3.5 rounded-xl font-semibold transition-all flex items-center space-x-2 shadow-md hover:shadow-lg"
              >
                <BarChart2 className="h-5 w-5" />
                <span>Today's Report</span>
              </button>

              <button
                onClick={() => fetchProducts(true)}
                disabled={refreshing}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-400 text-white px-5 py-3.5 rounded-xl font-semibold transition-all flex items-center space-x-2 shadow-md hover:shadow-lg"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <button
                onClick={() => setShowAddForm(true)}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3.5 rounded-xl font-semibold transition-all flex items-center space-x-2 shadow-md hover:shadow-lg"
              >
                <Plus className="h-5 w-5" />
                <span>Add Product</span>
              </button>
            </div>
          </div>
        </div>

        {/* Today Report Modal */}
        {showTodayReport && <TodayReportModal onClose={() => setShowTodayReport(false)} />}

        {/* Add/Edit Product Form */}
        {(showAddForm || editingProduct) && (
          <div className="mb-8">
            <ProductForm
              product={editingProduct}
              onSave={editingProduct ? handleEditProduct : handleAddProduct}
              onCancel={() => { setShowAddForm(false); setEditingProduct(null); }}
            />
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-500 text-lg">Loading products...</p>
          </div>
        )}

        {!loading && products.length >= 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg">
              <p className="text-blue-100 text-sm font-medium mb-1">Total Products</p>
              <p className="text-3xl font-bold">{globalStats.totalProducts}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 text-white shadow-lg">
              <p className="text-green-100 text-sm font-medium mb-1">In Stock</p>
              <p className="text-3xl font-bold">{globalStats.inStock}</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl p-5 text-white shadow-lg">
              <p className="text-yellow-100 text-sm font-medium mb-1">Low Stock</p>
              <p className="text-3xl font-bold">{globalStats.lowStock}</p>
            </div>
            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-5 text-white shadow-lg">
              <p className="text-red-100 text-sm font-medium mb-1">Out of Stock</p>
              <p className="text-3xl font-bold">{globalStats.outOfStock}</p>
            </div>
          </div>
        )}

        {/* Products Grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product._id || product.id}
                product={product}
                onEdit={setEditingProduct}
                onDelete={handleDeleteProduct}
                onUpdateStock={handleUpdateStock}
              />
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && products.length > 0 && totalPages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-8 mb-4">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex space-x-1">
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                  return (
                    <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                      className={`w-10 h-10 rounded-lg font-medium transition-all ${currentPage === pageNum ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}>
                      {pageNum}
                    </button>
                  );
                } else if ((pageNum === currentPage - 2 && pageNum > 1) || (pageNum === currentPage + 2 && pageNum < totalPages)) {
                  return <span key={pageNum} className="px-1 text-gray-400 self-end mb-2">...</span>;
                }
                return null;
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* No Products Found */}
        {!loading && filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <div className="bg-gray-100 p-6 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <Package className="h-10 w-10 text-gray-400" />
            </div>
            <p className="text-gray-500 text-lg mb-2">
              {products.length === 0 ? 'No products available' : 'No products match your criteria'}
            </p>
            <p className="text-gray-400 mb-4">
              {products.length === 0 ? 'Add your first product to get started' : 'Try adjusting your search criteria'}
            </p>
            {products.length === 0 && (
              <button onClick={() => setShowAddForm(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-all flex items-center space-x-2 mx-auto">
                <Plus className="h-5 w-5" />
                <span>Add First Product</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Products;