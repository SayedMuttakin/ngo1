import React, { useState, useEffect } from 'react';
import { Search, User, Clock, DollarSign, MapPin, AlertCircle, RefreshCw, Loader, Calendar } from 'lucide-react';
import { installmentsAPI } from '../utils/api';
import { toast } from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';

const PendingInstallments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingInstallments, setPendingInstallments] = useState([]);
  const [collectorGroups, setCollectorGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollector, setSelectedCollector] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0); // ✅ Force refresh state

  // Fetch pending installments
  const fetchPendingInstallments = async () => {
    console.log('🔄 fetchPendingInstallments called at:', new Date().toLocaleTimeString());
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const timestamp = Date.now();
      console.log('🕑 Cache busting timestamp:', timestamp);

      // Fetch pending installments (with cache busting)
      const pendingResponse = await installmentsAPI.getAll({
        status: 'pending',
        limit: 10000,
        populate: true,
        _t: timestamp // Cache busting timestamp
      });

      console.log('🟡 Pending response:', {
        success: pendingResponse.success,
        count: pendingResponse.data?.length || 0
      });

      // Fetch partial installments (with cache busting)
      const partialResponse = await installmentsAPI.getAll({
        status: 'partial',
        limit: 10000,
        populate: true,
        _t: timestamp // Cache busting timestamp
      });

      console.log('🟡 Partial response:', {
        success: partialResponse.success,
        count: partialResponse.data?.length || 0
      });

      const allInstallments = [
        ...(pendingResponse.success ? pendingResponse.data || [] : []),
        ...(partialResponse.success ? partialResponse.data || [] : [])
      ];

      console.log('📦 Total installments fetched:', allInstallments.length);

      // Filter installments that are due today or overdue AND have active members
      const dueInstallments = allInstallments.filter(inst => {
        // ✅ Skip if member is inactive/deleted
        if (!inst.member || inst.member.isActive === false) {
          console.log('⚠️ Skipping installment for inactive member:', inst.member?.name);
          return false;
        }

        // Use dueDate if available, otherwise use collectionDate
        const dateToCheck = inst.dueDate || inst.collectionDate;

        // If no date at all, consider it as pending
        if (!dateToCheck) return true;

        const checkDate = new Date(dateToCheck);
        checkDate.setHours(0, 0, 0, 0);

        // Include if date has passed or is today
        return checkDate <= today;
      });

      // Sort by due date (oldest first)
      dueInstallments.sort((a, b) => {
        const dateA = new Date(a.dueDate || a.collectionDate || new Date());
        const dateB = new Date(b.dueDate || b.collectionDate || new Date());
        return dateA - dateB;
      });

      console.log('✅ Due installments after filtering:', dueInstallments.length);
      if (dueInstallments.length > 0) {
        console.log('📝 First few due installments:', dueInstallments.slice(0, 3).map(i => ({
          member: i.member?.name,
          amount: i.amount,
          dueDate: i.dueDate,
          status: i.status
        })));
      }

      setPendingInstallments(dueInstallments);

      // Group by collector and then by member
      const collectorMap = new Map();

      dueInstallments.forEach(inst => {
        if (!inst.member || !inst.collector) return;

        const collectorId = inst.collector._id || inst.collector.id;
        const collectorName = inst.collector.name || 'Unknown';
        const memberId = inst.member._id || inst.member.id;

        if (!collectorMap.has(collectorId)) {
          collectorMap.set(collectorId, {
            collector: inst.collector,
            members: new Map()
          });
        }

        const collectorData = collectorMap.get(collectorId);

        if (!collectorData.members.has(memberId)) {
          collectorData.members.set(memberId, {
            member: inst.member,
            installments: [],
            totalDue: 0
          });
        }

        const memberData = collectorData.members.get(memberId);
        memberData.installments.push(inst);

        const dueAmount = inst.status === 'partial'
          ? (inst.amount - (inst.paidAmount || 0))
          : inst.amount;
        memberData.totalDue += dueAmount;
      });

      // Convert to array format
      const groupedData = Array.from(collectorMap.values()).map(collectorData => ({
        collector: collectorData.collector,
        members: Array.from(collectorData.members.values()),
        totalMembers: collectorData.members.size,
        totalDue: Array.from(collectorData.members.values()).reduce((sum, m) => sum + m.totalDue, 0)
      }));

      // Sort by total due amount (highest first)
      groupedData.sort((a, b) => b.totalDue - a.totalDue);

      console.log('👥 Collector groups created:', groupedData.length);
      groupedData.forEach(group => {
        console.log(`   - ${group.collector.name}: ${group.totalMembers} members, ৳${group.totalDue}`);
      });

      setCollectorGroups(groupedData);

    } catch (error) {
      console.error('Error fetching pending installments:', error);
      toast.error('Failed to load pending installments');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Refresh data when navigating back to this page
  useEffect(() => {
    console.log('📡 Location changed - refreshing pending installments');
    console.log('🔑 Location key:', location.key, 'Pathname:', location.pathname);
    setRefreshKey(prev => prev + 1); // ✅ Force component refresh
    fetchPendingInstallments();
  }, [location.pathname, location.key]); // ✅ Also listen to location.key for back/forward navigation

  useEffect(() => {
    fetchPendingInstallments();

    // Auto-refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('📱 Page became visible, refreshing pending installments...');
        fetchPendingInstallments();
      }
    };

    // ✅ Listen for installment collection events
    const handleInstallmentCollected = (event) => {
      console.log('💰 Installment collected! Refreshing pending list...', event.detail);
      // Add small delay to allow backend to process
      setTimeout(() => {
        setRefreshKey(prev => prev + 1); // ✅ Force component refresh
        fetchPendingInstallments();
        toast.success('Pending list updated!', {
          icon: '🔄',
          duration: 2000
        });
      }, 1000);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('installmentCollected', handleInstallmentCollected);
    window.addEventListener('dashboardReload', handleInstallmentCollected);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('installmentCollected', handleInstallmentCollected);
      window.removeEventListener('dashboardReload', handleInstallmentCollected);
    };
  }, []);

  // Filter collector groups based on search and selected collector
  const filteredCollectorGroups = collectorGroups
    .filter(group => {
      // Filter by selected collector
      if (selectedCollector !== 'all') {
        const collectorId = group.collector._id || group.collector.id;
        if (String(collectorId) !== String(selectedCollector)) return false;
      }

      // Filter by search term
      if (searchTerm) {
        const matchingMembers = group.members.filter(memberData => {
          const member = memberData.member;
          return member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.phone?.includes(searchTerm) ||
            member.branchCode?.includes(searchTerm);
        });
        return matchingMembers.length > 0;
      }

      return true;
    })
    .map(group => {
      // If searching, filter members within group
      if (searchTerm) {
        const filteredMembers = group.members.filter(memberData => {
          const member = memberData.member;
          return member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.phone?.includes(searchTerm) ||
            member.branchCode?.includes(searchTerm);
        });

        return {
          ...group,
          members: filteredMembers,
          totalMembers: filteredMembers.length,
          totalDue: filteredMembers.reduce((sum, m) => sum + m.totalDue, 0)
        };
      }

      return group;
    });

  // Calculate totals
  const totalPendingAmount = filteredCollectorGroups.reduce((sum, group) => sum + group.totalDue, 0);
  const totalMembers = filteredCollectorGroups.reduce((sum, group) => sum + group.totalMembers, 0);

  // Handle click on member - navigate to collection page
  const handleMemberClick = (memberData, collector) => {
    const member = memberData.member;

    if (!member) {
      toast.error('Member information not available');
      return;
    }

    // Prepare collector data
    const collectorData = collector ? {
      _id: collector._id || collector.id,
      name: collector.name || 'Unknown',
      email: collector.email || ''
    } : null;

    // Prepare branch data
    const branchData = {
      code: member.branchCode || member.branch_code || 'N/A',
      branchCode: member.branchCode || member.branch_code || 'N/A',
      name: member.branch || 'Unknown',
      collectorName: collectorData?.name || 'Unknown'
    };

    // Get collection day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const collectionDay = dayNames[today.getDay()];

    // Save state for Installments page
    const installmentState = {
      day: collectionDay,
      collector: collectorData,
      branch: branchData,
      dashboard: false,
      directMember: member
    };

    localStorage.setItem('installmentCollectionState', JSON.stringify(installmentState));
    if (collectorData) {
      localStorage.setItem('selectedCollector', JSON.stringify(collectorData));
    }

    toast.success(`Opening collection for ${member.name}`, {
      icon: '💰',
      duration: 2000
    });

    // Navigate to installments page
    navigate('/installments');
  };

  // Calculate days overdue
  const getDaysOverdue = (dueDate) => {
    if (!dueDate) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = today - due;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return diffDays > 0 ? diffDays : 0;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Search and Summary */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Search className="h-4 w-4 inline mr-1" />
                Search Member
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, phone, or branch code..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            {/* Collector Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                Filter by Collector
              </label>
              <select
                value={selectedCollector}
                onChange={(e) => setSelectedCollector(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="all">All Collectors</option>
                {collectorGroups.map(group => (
                  <option key={group.collector._id || group.collector.id} value={group.collector._id || group.collector.id}>
                    {group.collector.name} ({group.totalMembers} members)
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg p-4">
              <p className="text-sm opacity-90">Total Pending Amount</p>
              <p className="text-3xl font-bold">৳{totalPendingAmount.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-4">
              <p className="text-sm opacity-90">Total Members</p>
              <p className="text-3xl font-bold">{totalMembers}</p>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-4">
              <p className="text-sm opacity-90">Collectors</p>
              <p className="text-3xl font-bold">{filteredCollectorGroups.length}</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={fetchPendingInstallments}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-all disabled:opacity-50"
            >
              {loading ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Collector Groups */}
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-center py-12">
                <Loader className="h-8 w-8 animate-spin text-orange-600" />
                <span className="ml-3 text-gray-600">Loading pending installments...</span>
              </div>
            </div>
          ) : filteredCollectorGroups.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 text-lg font-semibold mb-2">
                  {searchTerm || selectedCollector !== 'all'
                    ? 'No pending installments found matching your filters'
                    : 'No pending installments found'}
                </p>
                <p className="text-sm text-gray-500">
                  All installments are up to date!
                </p>
              </div>
            </div>
          ) : (
            filteredCollectorGroups.map((group) => (
              <div key={group.collector._id || group.collector.id} className="bg-white rounded-xl shadow-sm border p-6">
                {/* Collector Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b-2 border-orange-200 gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{group.collector.name}</h3>
                      <p className="text-sm text-gray-600">{group.collector.email}</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm text-gray-600">Total Due</p>
                    <p className="text-2xl font-bold text-red-600">৳{group.totalDue.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">{group.totalMembers} members</p>
                  </div>
                </div>

                {/* Members Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.members.map((memberData, index) => {
                    const member = memberData.member;
                    const oldestInstallment = memberData.installments[0];
                    const daysOverdue = getDaysOverdue(oldestInstallment?.dueDate);
                    const isOverdue = daysOverdue > 0;

                    return (
                      <div
                        key={member._id || index}
                        onClick={() => handleMemberClick(memberData, group.collector)}
                        className="border-2 border-orange-200 rounded-lg p-4 hover:shadow-lg hover:border-orange-400 transition-all cursor-pointer bg-gradient-to-r from-white to-orange-50"
                      >
                        {/* Member Info */}
                        <div className="flex items-center space-x-3 mb-3">
                          {member.photo ? (
                            <img
                              src={member.photo}
                              alt={member.name}
                              className="h-12 w-12 rounded-full object-cover border-2 border-orange-300"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center border-2 border-orange-300">
                              <span className="text-lg font-bold text-white">
                                {member.name?.charAt(0) || 'M'}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-900 truncate">{member.name}</h4>
                            <p className="text-xs text-gray-600 truncate">📞 {member.phone}</p>
                          </div>
                        </div>

                        {/* Branch Info */}
                        <div className="flex items-center text-xs text-gray-600 mb-2">
                          <MapPin className="h-3 w-3 mr-1" />
                          <span className="truncate">{member.branchCode || 'N/A'} - {member.branch || 'Unknown'}</span>
                        </div>

                        {/* Due Amount */}
                        <div className="bg-white rounded-lg p-3 mb-2 border border-red-300">
                          <p className="text-xs text-gray-600">Total Due Amount</p>
                          <p className="text-2xl font-bold text-red-600">৳{memberData.totalDue.toLocaleString()}</p>
                          <p className="text-xs text-gray-500 mt-1">{memberData.installments.length} pending installment{memberData.installments.length > 1 ? 's' : ''}</p>
                        </div>

                        {/* Status Badge */}
                        <div className="flex justify-between items-center">
                          {isOverdue ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-600 text-white animate-pulse">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {daysOverdue} day{daysOverdue > 1 ? 's' : ''} overdue
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                              <Clock className="h-3 w-3 mr-1" />
                              Due Today
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingInstallments;
