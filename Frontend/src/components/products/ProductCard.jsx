import React, { useState } from 'react';
import { Package, DollarSign, Users, Calendar, Edit, Trash2, TrendingUp, AlertCircle, Plus, Minus } from 'lucide-react';

const ProductCard = ({ product, onEdit, onDelete, onUpdateStock }) => {
  const [showStockUpdate, setShowStockUpdate] = useState(false);
  const [stockChange, setStockChange] = useState('');
  const getStockColor = (stock) => {
    if (stock > 50) return 'text-green-600';
    if (stock > 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStockBgColor = (stock) => {
    if (stock > 50) return 'bg-green-50 border-green-200';
    if (stock > 20) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getStockStatus = (stock) => {
    if (stock > 50) return 'In Stock';
    if (stock > 20) return 'Low Stock';
    if (stock > 0) return 'Critical';
    return 'Out of Stock';
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Food': 'bg-orange-100 text-orange-700',
      'Clothing': 'bg-purple-100 text-purple-700',
      'Medicine': 'bg-red-100 text-red-700',
      'Education': 'bg-blue-100 text-blue-700',
      'Emergency': 'bg-pink-100 text-pink-700',
      'Other': 'bg-gray-100 text-gray-700'
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  const stock = product.availableStock !== undefined && product.availableStock !== null 
    ? product.availableStock 
    : (product.totalStock !== undefined && product.totalStock !== null ? product.totalStock : (product.stock || 0));
  const sold = product.distributedStock !== undefined && product.distributedStock !== null 
    ? product.distributedStock 
    : 0;
  const totalValue = stock * (product.unitPrice || product.price || 0);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-5 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start space-x-3 flex-1">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-3 rounded-xl shadow-md">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-1">{product.name}</h3>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getCategoryColor(product.category)}`}>
                {product.category}
              </span>
            </div>
          </div>
          
          <div className="flex space-x-1 ml-2">
            <button
              onClick={() => setShowStockUpdate(!showStockUpdate)}
              className="p-2.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
              title="Update Stock"
            >
              <Package className="h-5 w-5" />
            </button>
            <button
              onClick={() => onEdit(product)}
              className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              title="Edit Product"
            >
              <Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => onDelete(product._id || product.id)}
              className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Delete Product"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mt-2">
            {product.description}
          </p>
        )}
      </div>

      {/* Main Content */}
      <div className="p-5 space-y-4">
        {/* Price and Stock Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-green-100 p-2 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Unit Price</p>
              <p className="text-lg font-bold text-gray-900">৳{product.unitPrice || product.price}</p>
            </div>
          </div>
          
          <div className={`px-4 py-2 rounded-xl text-sm font-bold border-2 ${getStockBgColor(stock)} ${getStockColor(stock)}`}>
            {getStockStatus(stock)}
          </div>
        </div>

        {/* Quick Stock Update */}
        {showStockUpdate && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border-2 border-green-200">
            <p className="text-sm font-bold text-green-800 mb-3">📦 Update Stock</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const current = parseInt(stockChange) || 0;
                  setStockChange(Math.max(-stock, current - 10).toString());
                }}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                title="Decrease by 10"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                value={stockChange}
                onChange={(e) => setStockChange(e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-green-300 rounded-lg text-center font-bold text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="+10 or -5"
              />
              <button
                onClick={() => {
                  const current = parseInt(stockChange) || 0;
                  setStockChange((current + 10).toString());
                }}
                className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all"
                title="Increase by 10"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  const change = parseInt(stockChange) || 0;
                  if (onUpdateStock && change !== 0) {
                    onUpdateStock(product._id || product.id, change);
                    setStockChange('');
                    setShowStockUpdate(false);
                  }
                }}
                disabled={!stockChange || parseInt(stockChange) === 0}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-semibold transition-all disabled:cursor-not-allowed"
              >
                Apply ({(parseInt(stockChange) || 0) > 0 ? '+' : ''}{parseInt(stockChange) || 0})
              </button>
              <button
                onClick={() => {
                  setStockChange('');
                  setShowStockUpdate(false);
                }}
                className="px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Current: {stock} → New: {stock + (parseInt(stockChange) || 0)}
            </p>
          </div>
        )}

        {/* Stock Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Available Stock */}
          <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
            <div className="flex items-center space-x-2 mb-1">
              <Package className="h-4 w-4 text-blue-600" />
              <p className="text-xs text-blue-700 font-semibold">Available</p>
            </div>
            <p className="text-xl font-bold text-blue-900">
              {stock} <span className="text-sm font-medium">{product.unit || 'kg'}</span>
            </p>
          </div>

          {/* Sold Stock */}
          <div className="bg-purple-50 p-3 rounded-xl border border-purple-100">
            <div className="flex items-center space-x-2 mb-1">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <p className="text-xs text-purple-700 font-semibold">Sold</p>
            </div>
            <p className="text-xl font-bold text-purple-900">
              {sold} <span className="text-sm font-medium">{product.unit || 'kg'}</span>
            </p>
          </div>
        </div>

        {/* Total Value */}
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-3 rounded-xl border border-amber-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-700 font-semibold">Total Stock Value</p>
            </div>
            <p className="text-xl font-bold text-amber-900">৳{totalValue.toLocaleString()}</p>
          </div>
        </div>

        {/* Date Added */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center space-x-2 text-gray-500">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-medium">Added</span>
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {(() => {
              try {
                if (product.createdAt) {
                  const date = new Date(product.createdAt);
                  if (!isNaN(date.getTime())) {
                    return date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    });
                  }
                }
                return 'Recently';
              } catch (error) {
                return 'Recently';
              }
            })()}
          </span>
        </div>

        {/* Low Stock Warning */}
        {stock > 0 && stock <= 20 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-800">Low Stock Alert!</p>
              <p className="text-xs text-red-600 mt-0.5">Consider restocking soon to avoid shortages.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
