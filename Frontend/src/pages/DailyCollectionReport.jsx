import React, { useState, useEffect } from 'react';
import { collectorsAPI } from '../utils/api';
import {
  ClipboardList,
  ChevronDown,
  RefreshCw,
  Search,
  AlertCircle,
  Calendar,
  Users,
  DollarSign,
  PiggyBank,
  TrendingUp,
  Building2,
  CheckCircle2,
  Clock,
  ArrowUpFromLine
} from 'lucide-react';

const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  if (num < 0) {
    return `-৳${Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `৳${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function DailyCollectionReport() {
  const [collectors, setCollectors] = useState([]);
  const [selectedCollector, setSelectedCollector] = useState('');
  const [reportDate, setReportDate] = useState(() => {
    // Default to today in YYYY-MM-DD (BD time)
    const now = new Date();
    now.setHours(now.getHours() + 6); // BD offset from UTC
    return now.toISOString().split('T')[0];
  });
  const [report, setReport] = useState(null);
  const [savingsOut, setSavingsOut] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collectorsLoading, setCollectorsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Load collectors
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

  const fetchReport = async (collectorId, date) => {
    if (!collectorId) return;
    try {
      setLoading(true);
      setError('');
      setReport(null);
      setSavingsOut([]);
      // Fetch both report and savings-out in parallel
      const [repRes, savRes] = await Promise.all([
        collectorsAPI.getDailyReport(collectorId, date),
        collectorsAPI.getTodaysSavingsOut(collectorId, date)
      ]);
      if (repRes.success) setReport(repRes.data);
      else setError(repRes.message || 'Failed to load report.');
      if (savRes.success) setSavingsOut(savRes.data?.withdrawals || []);
    } catch (e) {
      setError('Failed to load report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCollectorChange = (e) => {
    const id = e.target.value;
    setSelectedCollector(id);
    setReport(null);
    setError('');
    if (id) fetchReport(id, reportDate);
  };

  const handleDateChange = (e) => {
    const d = e.target.value;
    setReportDate(d);
    if (selectedCollector) fetchReport(selectedCollector, d);
  };

  const handleRefresh = () => {
    if (selectedCollector) fetchReport(selectedCollector, reportDate);
  };

  const filteredMembers = (report?.members || []).filter(m =>
    !search ||
    m.memberName?.toLowerCase().includes(search.toLowerCase()) ||
    m.memberCode?.toLowerCase().includes(search.toLowerCase()) ||
    m.branchCode?.toLowerCase().includes(search.toLowerCase()) ||
    m.branchName?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by branch for display
  const branchGroups = {};
  filteredMembers.forEach(m => {
    const key = m.branchCode || 'N/A';
    if (!branchGroups[key]) branchGroups[key] = { branchName: m.branchName || key, members: [] };
    branchGroups[key].members.push(m);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 rounded-xl p-3 backdrop-blur-sm">
              <ClipboardList className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Daily Collection Report</h1>
              <p className="text-violet-200 text-sm mt-1">
                View today's installment & savings collections by collector
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

      {/* Filter Controls */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Collector Selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Select Collector
            </label>
            <div className="relative">
              <select
                value={selectedCollector}
                onChange={handleCollectorChange}
                disabled={collectorsLoading}
                className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-10 text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
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
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Report Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={reportDate}
                onChange={handleDateChange}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading daily report...</p>
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
      {report && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 rounded-xl p-2.5">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Members Paid</p>
                  <p className="text-2xl font-bold text-gray-900">{report.summary.memberCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 rounded-xl p-2.5">
                  <DollarSign className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Loan Collection</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(report.summary.totalLoanCollection)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-emerald-100 rounded-xl p-2.5">
                  <PiggyBank className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Savings Collected</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCurrency(report.summary.totalSavingsCollection)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-orange-100 p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-orange-100 rounded-xl p-2.5">
                  <ArrowUpFromLine className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Savings Out</p>
                  <p className="text-xl font-bold text-orange-600">
                    {formatCurrency(savingsOut.reduce((s, r) => s + (r.amount || 0), 0))}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl shadow-lg p-5">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 rounded-xl p-2.5">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-violet-100 font-medium uppercase tracking-wide">Total Collection</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(report.summary.totalCollection)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Report Info Banner */}
          <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-violet-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-semibold text-sm">
                Report for: <span className="text-violet-900">{report.collector.name}</span>
              </span>
            </div>
            <div className="flex items-center space-x-2 text-violet-700">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Date: {formatDate(report.reportDate)}</span>
            </div>
          </div>

          {/* Search */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                <ClipboardList className="h-5 w-5 text-violet-600" />
                <span>Collection Details by Member</span>
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search member, branch..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium">No collections found for this date.</p>
                <p className="text-sm text-gray-400 mt-1">No installments or savings were collected on this date.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Group by branch */}
                {Object.entries(branchGroups).map(([branchCode, group]) => (
                  <div key={branchCode}>
                    {/* Branch Header */}
                    <div className="flex items-center space-x-2 px-5 py-2.5 bg-violet-50 border-b border-violet-100">
                      <Building2 className="h-4 w-4 text-violet-600" />
                      <span className="font-bold text-violet-800 text-sm">
                        Branch: ({branchCode}) {group.branchName}
                      </span>
                      <span className="ml-auto text-xs text-violet-500 font-medium">
                        {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-600 w-10">S/L</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-600">Member Name</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-600">Code</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-600">Phone</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-600">Installment (৳)</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-600">Savings In (৳)</th>
                          <th className="px-4 py-3 text-right font-semibold text-orange-600">Savings Out (৳)</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-600">Total (৳)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.members.map((m) => {
                            // Find savings-out for this member on this date
                            const memberSavOut = savingsOut
                              .filter(r => r.memberId === m.memberId)
                              .reduce((s, r) => s + (r.amount || 0), 0);
                            return (
                            <tr key={m.memberId} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-gray-500 font-medium">{m.serial}</td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-gray-900">{m.memberName}</div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 font-mono text-xs">{m.memberCode || '—'}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{m.phone || '—'}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-semibold ${m.loanAmount !== 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {m.loanAmount !== 0 ? formatCurrency(m.loanAmount) : '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-semibold ${m.savingsAmount !== 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                  {m.savingsAmount !== 0 ? formatCurrency(m.savingsAmount) : '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-semibold ${memberSavOut > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                  {memberSavOut > 0 ? formatCurrency(memberSavOut) : '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-violet-700">
                                {formatCurrency(m.totalCollected)}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Branch subtotal */}
                        <tr className="bg-violet-50 border-t border-violet-100">
                          <td colSpan={4} className="px-4 py-2 text-sm font-bold text-violet-800">
                            Branch Subtotal
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-red-600">
                            {formatCurrency(group.members.reduce((s, m) => s + m.loanAmount, 0))}
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-emerald-600">
                            {formatCurrency(group.members.reduce((s, m) => s + m.savingsAmount, 0))}
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-orange-500">
                            {formatCurrency(
                              savingsOut
                                .filter(r => group.members.some(m => m.memberId === r.memberId))
                                .reduce((s, r) => s + (r.amount || 0), 0)
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-violet-800">
                            {formatCurrency(group.members.reduce((s, m) => s + m.totalCollected, 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Grand Total */}
                <div className="border-t-2 border-gray-300 bg-gray-50 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                  <span className="font-bold text-gray-800 text-base">Grand Total — {filteredMembers.length} members</span>
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 font-medium">Installment</p>
                      <p className="font-bold text-red-600">{formatCurrency(filteredMembers.reduce((s, m) => s + m.loanAmount, 0))}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 font-medium">Savings In</p>
                      <p className="font-bold text-emerald-600">{formatCurrency(filteredMembers.reduce((s, m) => s + m.savingsAmount, 0))}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-orange-500 font-medium">Savings Out</p>
                      <p className="font-bold text-orange-600">{formatCurrency(savingsOut.reduce((s, r) => s + (r.amount || 0), 0))}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 font-medium">Total</p>
                      <p className="font-bold text-violet-700 text-lg">{formatCurrency(filteredMembers.reduce((s, m) => s + m.totalCollected, 0))}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Placeholder */}
      {!selectedCollector && !loading && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-16 text-center">
          <ClipboardList className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">Select a Collector</h3>
          <p className="text-gray-400 text-sm">
            Choose a collector above to see who paid installments and savings today.
          </p>
        </div>
      )}
    </div>
  );
}
