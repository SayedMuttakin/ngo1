import React, { useState, useEffect, useRef } from 'react';
import { Calendar, TrendingUp, Package, DollarSign, RefreshCw, Download, Filter, BarChart3, Banknote, Clock } from 'lucide-react';
import { productsAPI } from '../utils/api';
import { getCurrentBDDate, formatBDDateLong } from '../utils/dateUtils';
import toast from 'react-hot-toast';

const SalesReport = () => {
  const [startDate, setStartDate] = useState(getCurrentBDDate()); // Start date for range
  const [endDate, setEndDate] = useState(getCurrentBDDate()); // End date for range
  const [paymentType, setPaymentType] = useState('all'); // 'all', 'cash', 'installment'
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const initialLoadRef = useRef(true); // Track initial load to prevent duplicate notifications

  const categories = ['Food', 'Clothing', 'Medicine', 'Education', 'Emergency', 'Other'];

  useEffect(() => {
    fetchSalesReport();
  }, [startDate, endDate, paymentType]);  // 🔹 Trigger API call when date range or payment type changes

  const fetchSalesReport = async () => {
    try {
      setLoading(true);
      console.log('📊 Fetching sales report for date range:', { startDate, endDate, paymentType });
      
      // Validate date range
      if (new Date(startDate) > new Date(endDate)) {
        toast.error('Start date cannot be after end date');
        setLoading(false);
        return;
      }
      
      const response = await productsAPI.getSalesReport({
        startDate: startDate,
        endDate: endDate,
        paymentType: paymentType
      });

      console.log('✅ Sales report response:', response);

      if (response.success) {
        setSalesData(response.data);
        const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
        // Only show toast after initial load to prevent duplicates
        if (!initialLoadRef.current) {
          if (startDate === endDate) {
            toast.success(`Sales report loaded for ${formatBDDateLong(startDate)}`);
          } else {
            toast.success(`Sales report loaded for ${days} days (${formatBDDateLong(startDate)} - ${formatBDDateLong(endDate)})`);
          }
        } else {
          initialLoadRef.current = false; // Mark initial load as complete
        }
      } else {
        toast.error('Failed to load sales report');
      }
    } catch (error) {
      console.error('❌ Error fetching sales report:', error);
      toast.error('Error loading sales report');
    } finally {
      setLoading(false);
    }
  };

  const handleTodayClick = () => {
    const today = getCurrentBDDate();
    setStartDate(today);
    setEndDate(today);
  };

  const handleYesterdayClick = () => {
    const today = getCurrentBDDate();
    const [year, month, day] = today.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day - 1);
    const yesterday = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    setStartDate(yesterday);
    setEndDate(yesterday);
  };

  const handleLast7DaysClick = () => {
    const today = getCurrentBDDate();
    const [year, month, day] = today.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    dateObj.setDate(dateObj.getDate() - 6); // 7 days including today
    const sevenDaysAgo = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    setStartDate(sevenDaysAgo);
    setEndDate(today);
  };

  const handleLast10DaysClick = () => {
    const today = getCurrentBDDate();
    const [year, month, day] = today.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    dateObj.setDate(dateObj.getDate() - 9); // 10 days including today
    const tenDaysAgo = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    setStartDate(tenDaysAgo);
    setEndDate(today);
  };

  const handleLast30DaysClick = () => {
    const today = getCurrentBDDate();
    const [year, month, day] = today.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    dateObj.setDate(dateObj.getDate() - 29); // 30 days including today
    const thirtyDaysAgo = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    setStartDate(thirtyDaysAgo);
    setEndDate(today);
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Food': 'bg-orange-100 text-orange-700 border-orange-200',
      'Clothing': 'bg-purple-100 text-purple-700 border-purple-200',
      'Medicine': 'bg-red-100 text-red-700 border-red-200',
      'Education': 'bg-blue-100 text-blue-700 border-blue-200',
      'Emergency': 'bg-pink-100 text-pink-700 border-pink-200',
      'Other': 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colors[category] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const filteredProducts = salesData?.productSales.filter(product => 
    filterCategory === 'all' || product.category === filterCategory
  ) || [];

  const summary = salesData?.summary || {
    totalSalesValue: 0,
    totalProductsSold: 0,
    totalQuantitySold: 0,
    totalCashSalesValue: 0,
    totalCashQuantity: 0,
    totalCashTransactions: 0,
    totalInstallmentSalesValue: 0,
    totalInstallmentQuantity: 0,
    totalInstallmentTransactions: 0
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md mb-3">
            <BarChart3 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            Sales Report (পণ্য বিক্রয় রিপোর্ট)
          </h1>
          <p className="text-gray-500 text-sm">View cash and installment product sales for any date range</p>
        </div>

        {/* Date & Payment Filter Section */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 mb-4">
            {/* Date Range Picker */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Calendar className="h-4 w-4 inline mr-1 text-blue-600" />
                  From Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Calendar className="h-4 w-4 inline mr-1 text-blue-600" />
                  To Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={getCurrentBDDate()}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-lg"
                />
              </div>
            </div>
          </div>

          {/* Payment Type Filter Tabs */}
          <div className="mb-4 pt-3 border-t">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Payment Mode (বিক্রির ধরন ফিল্টার):
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPaymentType('all')}
                className={`px-4 py-2 text-sm font-bold rounded-xl transition-all border ${
                  paymentType === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200'
                }`}
              >
                All Sales (সকল বিক্রি)
              </button>
              <button
                onClick={() => setPaymentType('cash')}
                className={`px-4 py-2 text-sm font-bold rounded-xl transition-all border flex items-center gap-1.5 ${
                  paymentType === 'cash'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200'
                }`}
              >
                <Banknote className="h-4 w-4" />
                <span>Cash Sales (নগদ বিক্রি)</span>
              </button>
              <button
                onClick={() => setPaymentType('installment')}
                className={`px-4 py-2 text-sm font-bold rounded-xl transition-all border flex items-center gap-1.5 ${
                  paymentType === 'installment'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                    : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border-purple-200'
                }`}
              >
                <Clock className="h-4 w-4" />
                <span>Installment Sales (কিস্তি বিক্রি)</span>
              </button>
            </div>
          </div>

          {/* Quick Date Filters */}
          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t">
            <button
              onClick={handleTodayClick}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all font-semibold text-sm shadow-md"
            >
              Today
            </button>
            <button
              onClick={handleYesterdayClick}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-semibold text-sm shadow-md"
            >
              Yesterday
            </button>
            <button
              onClick={handleLast7DaysClick}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all font-semibold text-sm shadow-md"
            >
              Last 7 Days
            </button>
            <button
              onClick={handleLast10DaysClick}
              className="px-4 py-2 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-lg hover:from-pink-600 hover:to-pink-700 transition-all font-semibold text-sm shadow-md"
            >
              Last 10 Days
            </button>
            <button
              onClick={handleLast30DaysClick}
              className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all font-semibold text-sm shadow-md"
            >
              Last 30 Days
            </button>
            <button
              onClick={fetchSalesReport}
              disabled={loading}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-md flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Loading...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Category Filter */}
          <div className="mt-4 flex items-center space-x-3 pt-3 border-t">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500 text-lg">Loading sales report...</p>
          </div>
        )}

        {/* Sales Summary Cards */}
        {!loading && salesData && (
          <>
            {/* Date Range Indicator */}
            <div className="mb-6 flex justify-center">
              <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-3 rounded-full shadow-lg">
                <Calendar className="h-5 w-5" />
                {startDate === endDate ? (
                  <span className="font-semibold">
                    Report for: {formatBDDateLong(startDate)}
                  </span>
                ) : (
                  <span className="font-semibold">
                    Report from {formatBDDateLong(startDate)} to {formatBDDateLong(endDate)}
                    <span className="ml-2 bg-white bg-opacity-20 px-2 py-0.5 rounded-full text-sm">
                      {Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1} days
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Summary Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Total Sales */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-blue-100 text-sm font-semibold">Total Sales Value</p>
                  <DollarSign className="h-6 w-6 text-blue-200" />
                </div>
                <p className="text-4xl font-extrabold">৳{summary.totalSalesValue.toLocaleString()}</p>
                <p className="text-xs text-blue-100 mt-1">Total {summary.totalQuantitySold} units sold</p>
              </div>

              {/* Cash Sales Card */}
              <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-emerald-100 text-sm font-semibold">💵 Cash Sales (নগদ বিক্রি)</p>
                  <Banknote className="h-6 w-6 text-emerald-200" />
                </div>
                <p className="text-4xl font-extrabold">৳{summary.totalCashSalesValue.toLocaleString()}</p>
                <p className="text-xs text-emerald-100 mt-1">
                  {summary.totalCashQuantity} units ({summary.totalCashTransactions} Cash Sales)
                </p>
              </div>

              {/* Installment Sales Card */}
              <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-purple-100 text-sm font-semibold">📅 Installment (কিস্তি বিক্রি)</p>
                  <Clock className="h-6 w-6 text-purple-200" />
                </div>
                <p className="text-4xl font-extrabold">৳{summary.totalInstallmentSalesValue.toLocaleString()}</p>
                <p className="text-xs text-purple-100 mt-1">
                  {summary.totalInstallmentQuantity} units ({summary.totalInstallmentTransactions} Installment Sales)
                </p>
              </div>

              {/* Unique Products Card */}
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-amber-100 text-sm font-semibold">Unique Products</p>
                  <Package className="h-6 w-6 text-amber-200" />
                </div>
                <p className="text-4xl font-extrabold">{summary.totalProductsSold}</p>
                <p className="text-xs text-amber-100 mt-1">Different product models</p>
              </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                    <Package className="h-6 w-6 mr-2 text-blue-600" />
                    Product-wise Sales Details (পণ্যভিত্তিক বিক্রয় বিবরণী)
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Showing {filteredProducts.length} of {salesData.productSales.length} products
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Product Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Payment Breakdown (নগদ vs কিস্তি)
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Total Quantity
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Unit Price
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Total Sales Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((product) => (
                        <tr key={product.productId} className="hover:bg-blue-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="bg-blue-100 p-2 rounded-lg mr-3">
                                <Package className="h-5 w-5 text-blue-600" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-gray-900">{product.name}</div>
                                <div className="text-xs text-gray-500">ID: {product.productId.slice(-6)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getCategoryColor(product.category)}`}>
                              {product.category}
                            </span>
                          </td>
                          
                          {/* Payment Breakdown (Cash vs Installment) */}
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex flex-col items-center gap-1">
                              {product.cashQuantity > 0 && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  💵 নগদ (Cash): {product.cashQuantity} {product.unit} (৳{product.cashValue.toLocaleString()})
                                </span>
                              )}
                              {product.installmentQuantity > 0 && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                  📅 কিস্তি (Installment): {product.installmentQuantity} {product.unit} (৳{product.installmentValue.toLocaleString()})
                                </span>
                              )}
                              {product.cashQuantity === 0 && product.installmentQuantity === 0 && (
                                <span className="text-xs text-gray-400">N/A</span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="text-lg font-bold text-gray-900">
                              {product.totalQuantity} <span className="text-sm font-medium text-gray-500">{product.unit}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="text-sm font-semibold text-gray-900">
                              ৳{product.unitPrice.toLocaleString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-lg font-extrabold text-green-600">
                              ৳{product.totalValue.toLocaleString()}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center">
                          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 text-lg font-medium">No sales found for this filter</p>
                          <p className="text-gray-400 text-sm mt-2">
                            Try selecting a different date range, payment mode, or category.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* No Data State */}
        {!loading && !salesData && (
          <div className="text-center py-12 bg-white rounded-2xl shadow-xl">
            <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">No sales report generated yet</p>
            <p className="text-gray-400 text-sm mt-2">Select a date range and click "Generate Report"</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesReport;
