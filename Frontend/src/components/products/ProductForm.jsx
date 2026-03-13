import React, { useState } from 'react';
import { X, Package, DollarSign, Hash } from 'lucide-react';

const ProductForm = ({ product, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    unit: product?.unit || 'piece',
    unitPrice: product?.unitPrice || product?.price || '',
    totalStock: product?.totalStock || product?.availableStock || product?.stock || '',
    minimumStock: product?.minimumStock || 10,
    description: product?.description || '',
    expiryDate: product?.expiryDate || '',
    supplier: {
      name: product?.supplier?.name || '',
      contact: product?.supplier?.contact || ''
    }
  });

  console.log('📝 ProductForm initialized with product:', product);
  console.log('📊 Form data initialized:', formData);

  const [errors, setErrors] = useState({});

  const units = ['piece', 'kg', 'liter', 'box', 'bag', 'bosta', 'bottle', 'packet', 'dozen'];

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    if (!formData.unit) newErrors.unit = 'Unit is required';
    if (!formData.unitPrice || formData.unitPrice <= 0) newErrors.unitPrice = 'Valid unit price is required';
    // Only validate stock for new products
    if (formData.totalStock === '' || isNaN(formData.totalStock) || parseInt(formData.totalStock) < 0) {
      newErrors.totalStock = 'Total stock must be a valid positive number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const payload = {
        name: formData.name.trim(),
        unit: formData.unit,
        unitPrice: parseFloat(formData.unitPrice),
        minimumStock: parseInt(formData.minimumStock),
        description: formData.description.trim(),
        expiryDate: formData.expiryDate || null,
        supplier: {
          name: formData.supplier.name.trim() || null,
          contact: formData.supplier.contact.trim() || null
        }
      };

      // Only include stock fields for new products
      if (!product) {
        payload.totalStock = parseInt(formData.totalStock);
        payload.availableStock = parseInt(formData.totalStock);
        payload.stock = parseInt(formData.totalStock);
      }

      console.log('📤 Sending product payload:', payload);
      onSave(payload);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border max-w-2xl w-full mx-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Package className="h-4 w-4 inline mr-1" />
                Product Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter product name"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>


            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Package className="h-4 w-4 inline mr-1" />
                Unit *
              </label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.unit ? 'border-red-300' : 'border-gray-300'
                  }`}
              >
                <option value="">Select Unit</option>
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              {errors.unit && <p className="text-red-500 text-xs mt-1">{errors.unit}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="h-4 w-4 inline mr-1" />
                Price per {formData.unit || 'unit'} (৳) *
              </label>
              <input
                type="number"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.unitPrice ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter price per unit"
                min="0"
                step="0.01"
              />
              {errors.unitPrice && <p className="text-red-500 text-xs mt-1">{errors.unitPrice}</p>}
            </div>

            {!product && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Hash className="h-4 w-4 inline mr-1" />
                  Stock Quantity *
                </label>
                <input
                  type="number"
                  value={formData.totalStock}
                  onChange={(e) => setFormData({ ...formData, totalStock: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.totalStock ? 'border-red-300' : 'border-gray-300'
                    }`}
                  placeholder="Enter stock quantity"
                  min="0"
                />
                {errors.totalStock && <p className="text-red-500 text-xs mt-1">{errors.totalStock}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Hash className="h-4 w-4 inline mr-1" />
                Minimum Stock Alert
              </label>
              <input
                type="number"
                value={formData.minimumStock}
                onChange={(e) => setFormData({ ...formData, minimumStock: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Minimum stock level"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter product description (optional)"
            />
          </div>

          {/* Form Actions */}
          <div className="flex space-x-4 pt-6">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-all"
            >
              {product ? 'Update Product' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductForm;
