import React, { useState, useEffect } from 'react';
import { ShoppingBag, Calendar, DollarSign, Users, RefreshCw, AlertCircle, Eye, X, User } from 'lucide-react';
import { productsAPI } from '../utils/api';
import { getCurrentBDDate } from '../utils/dateUtils';
import toast from 'react-hot-toast';

const CollectorSalesReport = () => {
  const [filterType, setFilterType] = useState('monthly'); // 'daily' or 'monthly'
  const [selectedDate, setSelectedDate] = useState(getCurrentBDDate());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentBDDate().substring(0, 7));
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCollectorModal, setSelectedCollectorModal] = useState(null);

  const fetchSalesReport = async (type = filterType, dateVal = selectedDate, monthVal = selectedMonth) => {
    try {
      setLoading(true);
      const params = type === 'monthly' ? { month: monthVal } : { date: dateVal };
      const response = await productsAPI.getCollectorSalesReport(params);

      if (response.success && response.data) {
        setReportData(response.data);
      } else {
        setReportData(null);
        toast.error('Failed to load sales report');
      }
    } catch (error) {
      console.error('Error fetching collector sales report:', error);
      toast.error('Error loading collector sales report');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSalesReport(filterType, selectedDate, selectedMonth);
    setRefreshing(false);
    toast.success('Sales data refreshed');
  };

  const handleFilterTypeChange = (newType) => {
    setFilterType(newType);
    fetchSalesReport(newType, selectedDate, selectedMonth);
  };

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    fetchSalesReport('daily', newDate, selectedMonth);
  };

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
    fetchSalesReport('monthly', selectedDate, newMonth);
  };

  useEffect(() => {
    fetchSalesReport(filterType, selectedDate, selectedMonth);
  }, []);

  const summary = reportData?.summary || { grandTotalSalesValue: 0, totalTransactionsCount: 0, totalCollectorsCount: 0, activeSellersCount: 0 };
  const collectors = reportData?.collectors || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Banner */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            
            <div className="flex flex-wrap items-center gap-4">
              {/* Filter Mode Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter Mode (ফিল্টার টাইপ)
                </label>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1">
                  <button
                    onClick={() => handleFilterTypeChange('daily')}
                    className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                      filterType === 'daily'
                        ? 'bg-white text-green-700 shadow-sm border border-gray-200'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Daily (দৈনিক)
                  </button>
                  <button
                    onClick={() => handleFilterTypeChange('monthly')}
                    className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                      filterType === 'monthly'
                        ? 'bg-white text-green-700 shadow-sm border border-gray-200'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Monthly (মাসিক)
                  </button>
                </div>
              </div>

              {/* Date / Month Picker */}
              {filterType === 'daily' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="h-4 w-4 inline mr-1 text-green-600" />
                    Select Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm font-medium"
                    disabled={loading}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="h-4 w-4 inline mr-1 text-green-600" />
                    Select Month (মাস নির্বাচন)
                  </label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="px-4 py-2 border border-green-400 bg-green-50 rounded-lg focus:ring-2 focus:ring-green-500 text-sm font-bold text-green-900"
                    disabled={loading}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2.5 rounded-lg font-medium transition-all flex items-center space-x-2 text-sm shadow-sm"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>

          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            <span className="ml-3 text-gray-600">Loading collector product sales...</span>
          </div>
        )}

        {/* Overall Summary Card */}
        {!loading && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 rounded-xl shadow-lg p-8 text-white max-w-3xl mx-auto">
              <div className="text-center mb-4">
                <p className="text-sm opacity-80 mb-1">
                  {filterType === 'monthly' ? 'Product Sales for Month' : 'Product Sales for Date'}
                </p>
                <p className="text-xl font-semibold">
                  {filterType === 'monthly' ? (
                    (() => {
                      if (!selectedMonth) return 'Invalid Month';
                      const [yr, mo] = selectedMonth.split('-');
                      const dt = new Date(parseInt(yr), parseInt(mo) - 1, 1);
                      return isNaN(dt.getTime()) ? selectedMonth : dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    })()
                  ) : (
                    selectedDate
                  )}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
                <div className="text-center">
                  <p className="text-sm opacity-90 mb-1">Total Collector Product Sales</p>
                  <p className="text-5xl font-extrabold">৳{summary.grandTotalSalesValue.toLocaleString()}</p>
                </div>
                <div className="h-12 w-px bg-white/30 hidden sm:block"></div>
                <div className="text-center">
                  <p className="text-sm opacity-90 mb-1">Active Sellers</p>
                  <p className="text-3xl font-bold">{summary.activeSellersCount} <span className="text-sm font-normal opacity-80">/ {summary.totalCollectorsCount} Collectors</span></p>
                </div>
                <div className="h-12 w-px bg-white/30 hidden sm:block"></div>
                <div className="text-center">
                  <p className="text-sm opacity-90 mb-1">Total Transactions</p>
                  <p className="text-3xl font-bold">{summary.totalTransactionsCount}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collectors Grid */}
        {!loading && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag className="h-6 w-6 text-green-600" />
                Collector Product Sales Breakdown ({filterType === 'monthly' ? 'মাসিক' : 'দৈনিক'})
              </h2>
            </div>

            {collectors.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No collector sales data found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {collectors.map((collector) => {
                  const hasSales = collector.totalSalesValue > 0;

                  return (
                    <div
                      key={collector.collectorId}
                      className={`rounded-xl p-5 border-2 transition-all flex flex-col justify-between ${
                        hasSales
                          ? 'bg-gradient-to-br from-green-50 via-emerald-50 to-white border-green-300 shadow-md hover:shadow-lg'
                          : 'bg-gray-50 border-gray-200 opacity-75'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-3 mb-4">
                          <div className={`p-2.5 rounded-full ${hasSales ? 'bg-green-600 text-white' : 'bg-gray-400 text-white'}`}>
                            <User className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg leading-tight">{collector.name}</h3>
                            <p className="text-xs text-gray-500">{collector.phone || collector.email || 'Collector'}</p>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-inner text-center mb-4">
                          <p className="text-xs text-gray-500 mb-1 font-medium">
                            {filterType === 'monthly' ? 'Monthly Product Sales' : "Daily Product Sales"}
                          </p>
                          <p className={`text-3xl font-extrabold ${hasSales ? 'text-green-600' : 'text-gray-400'}`}>
                            ৳{collector.totalSalesValue.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {collector.totalTransactions} Sales ({collector.totalItemsCount} items)
                          </p>
                        </div>
                      </div>

                      {hasSales ? (
                        <button
                          onClick={() => setSelectedCollectorModal(collector)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Eye className="h-4 w-4" />
                          <span>বিক্রির বিস্তারিত দেখুন</span>
                        </button>
                      ) : (
                        <div className="text-center text-xs text-gray-400 py-1 font-medium">
                          No sales recorded
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal for Collector Sales Details */}
        {selectedCollectorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[85vh] flex flex-col shadow-2xl animate-fadeIn">
              <div className="flex items-center justify-between border-b pb-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedCollectorModal.name} - Product Sales</h3>
                  <p className="text-sm text-gray-500">
                    Total: <strong className="text-green-600 font-bold">৳{selectedCollectorModal.totalSalesValue.toLocaleString()}</strong> ({selectedCollectorModal.totalTransactions} Sales)
                  </p>
                </div>
                <button
                  onClick={() => setSelectedCollectorModal(null)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {selectedCollectorModal.sales.map((sale, idx) => (
                  <div key={idx} className="bg-gray-50 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900 text-base">{sale.productName}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Member: <span className="font-semibold text-gray-800">{sale.memberName}</span> ({sale.memberCode})
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Date: {new Date(sale.collectionDate).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold text-green-700">৳{sale.subtotal.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Qty: {sale.quantity} {sale.unit}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 mt-4 text-right">
                <button
                  onClick={() => setSelectedCollectorModal(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium px-5 py-2 rounded-lg text-sm transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CollectorSalesReport;
