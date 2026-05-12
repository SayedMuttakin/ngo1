import React, { useState, useEffect } from 'react';
import { collectorsAPI } from '../utils/api';
import {
  PiggyBank,
  ChevronDown,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  Search,
  AlertCircle
} from 'lucide-react';

const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return `৳${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function CollectorSavings() {
  const [collectors, setCollectors] = useState([]);
  const [selectedCollector, setSelectedCollector] = useState('');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [collectorsLoading, setCollectorsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Load all collectors on mount
  useEffect(() => {
    const fetchCollectors = async () => {
      try {
        setCollectorsLoading(true);
        const res = await collectorsAPI.getAll({ limit: 100 });
        setCollectors(res.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setCollectorsLoading(false);
      }
    };
    fetchCollectors();
  }, []);

  const handleCollectorChange = async (collectorId) => {
    setSelectedCollector(collectorId);
    setOverview(null);
    setError('');
    if (!collectorId) return;
    try {
      setLoading(true);
      const res = await collectorsAPI.getSavingsOverview(collectorId);
      if (res.success) {
        setOverview(res.data);
      } else {
        setError(res.message || 'Failed to load savings data.');
      }
    } catch (e) {
      setError('Failed to load savings data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (selectedCollector) handleCollectorChange(selectedCollector);
  };

  const filteredMembers = (overview?.members || []).filter(m =>
    !search ||
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.memberCode?.toLowerCase().includes(search.toLowerCase()) ||
    m.branchCode?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 rounded-xl p-3 backdrop-blur-sm">
              <PiggyBank className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Collector Savings Overview</h1>
              <p className="text-emerald-100 text-sm mt-1">
                View net savings balance of all members under a collector
              </p>
            </div>
          </div>
          {selectedCollector && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center space-x-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl font-medium transition-all border border-white/30"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Collector Selector */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Select Collector
        </label>
        <div className="relative">
          <select
            value={selectedCollector}
            onChange={(e) => handleCollectorChange(e.target.value)}
            disabled={collectorsLoading}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-10 text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all cursor-pointer"
          >
            <option value="">-- Select a Collector --</option>
            {collectors.map(c => (
              <option key={c._id} value={c._id}>
                {c.name} {c.phone ? `(${c.phone})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
        </div>
        {collectorsLoading && (
          <p className="text-sm text-gray-500 mt-2">Loading collectors...</p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading savings data...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {overview && !loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 rounded-xl p-2.5">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Members</p>
                  <p className="text-2xl font-bold text-gray-900">{overview.summary.memberCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-emerald-100 rounded-xl p-2.5">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Savings In</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(overview.summary.totalSavingsIn)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 rounded-xl p-2.5">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Savings Out</p>
                  <p className="text-2xl font-bold text-red-500">{formatCurrency(overview.summary.totalSavingsOut)}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 rounded-xl p-2.5">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-emerald-100 font-medium uppercase tracking-wide">Net Savings Balance</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(overview.summary.totalNetSavings)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Member Table */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">
                Member-wise Savings — {overview.collector.name}
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search member, code, branch..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 w-12">S/L</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Member Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Branch</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Savings In</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Savings Out</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                        No members found.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m, i) => (
                      <tr key={m.memberId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500 font-medium">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{m.name}</div>
                          {m.phone && <div className="text-xs text-gray-400">{m.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono">{m.memberCode || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700">
                            {m.branchCode || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {formatCurrency(m.savingsIn)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-500">
                          {m.savingsOut > 0 ? formatCurrency(m.savingsOut) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold text-base ${m.netSavings > 0 ? 'text-teal-600' : 'text-gray-500'}`}>
                            {formatCurrency(m.netSavings)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredMembers.length > 0 && (
                  <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 font-bold text-gray-800">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        {formatCurrency(filteredMembers.reduce((s, m) => s + m.savingsIn, 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">
                        {formatCurrency(filteredMembers.reduce((s, m) => s + m.savingsOut, 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-teal-700 text-base">
                        {formatCurrency(filteredMembers.reduce((s, m) => s + m.netSavings, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* Placeholder when no collector selected */}
      {!selectedCollector && !loading && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-16 text-center">
          <PiggyBank className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">Select a Collector</h3>
          <p className="text-gray-400 text-sm">
            Choose a collector above to view the net savings balance of all members under them.
          </p>
        </div>
      )}
    </div>
  );
}
