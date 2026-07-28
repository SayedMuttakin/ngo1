import React, { useState, useEffect } from 'react';
import { TrendingUp, User, Calendar, DollarSign, Users, Clock, RefreshCw, Download, AlertCircle } from 'lucide-react';
import { dashboardAPI, collectorsAPI, branchesAPI, membersAPI, installmentsAPI } from '../utils/api';
import { getCurrentBDDate, formatBDDateLong, toBDTime } from '../utils/dateUtils';
import toast from 'react-hot-toast';

const DailyCollection = () => {
  const [filterType, setFilterType] = useState('daily'); // 'daily' | 'monthly'
  const [selectedDate, setSelectedDate] = useState(getCurrentBDDate()); // Bangladesh date (YYYY-MM-DD)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentBDDate().substring(0, 7)); // YYYY-MM
  const [collectionData, setCollectionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch collection data from API - OPTIMIZED VERSION
  const fetchDailyCollection = async (type = filterType, dateVal = selectedDate, monthVal = selectedMonth) => {
    try {
      setLoading(true);
      const isMonthly = type === 'monthly';
      console.log(`📅 Fetching collection data - Type: ${type}, Date: ${dateVal}, Month: ${monthVal}`);

      // Try to use backend API first
      try {
        const apiResponse = isMonthly 
          ? await dashboardAPI.getDailyCollection(null, monthVal)
          : await dashboardAPI.getDailyCollection(dateVal, null);

        if (apiResponse.success && apiResponse.data) {
          const { summary, collectors } = apiResponse.data;

          // Format data for frontend
          const formattedData = {
            date: isMonthly ? monthVal : dateVal,
            filterType: type,
            totalCollection: summary.totalCollection || 0,
            activeCollectors: collectors.length,
            collectors: collectors.map(c => ({
              id: c.id,
              name: c.name,
              totalCollection: c.totalCollection || 0,
              totalMembers: c.totalMembers || 0,
              branches: c.branches || [],
              branchCount: c.branchCount || 0,
              lastUpdated: c.lastUpdated
            })),
            lastUpdated: apiResponse.data.lastUpdated
          };

          setCollectionData(formattedData);
          setLoading(false);
          console.log('✅ Using backend API data');
          return;
        }
      } catch (apiError) {
        console.log('⚠️ Backend API failed, falling back to manual calculation:', apiError.message);
      }

      // Convert selected date to proper format for comparison
      const selectedDateObj = new Date(date);
      const targetDateStr = selectedDateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
      console.log(`🎯 Target date string: ${targetDateStr}`);

      // Get all collectors
      const collectorsResponse = await collectorsAPI.getAll({ limit: 100, isActive: 'true', role: 'collector' });

      if (collectorsResponse.success && collectorsResponse.data) {
        const allCollectors = collectorsResponse.data;

        // Filter collectors based on role and active status
        const filteredCollectors = allCollectors.filter(collector => {
          return collector.role === 'collector' && collector.isActive && collector.email;
        });

        console.log(`👥 Found ${filteredCollectors.length} active collectors`);

        // Load all branches once (not per collector)
        let branchesData = [];
        try {
          const branchesResponse = await branchesAPI.getAll();
          if (branchesResponse.success && branchesResponse.data) {
            branchesData = branchesResponse.data;
          }
        } catch (error) {
          console.error('Error loading branches:', error);
        }

        // ✅ OPTIMIZED: Get all members at once with their branches
        const allMembersMap = new Map(); // branchCode -> members
        const memberCollectorMap = new Map(); // memberId -> collectorId

        // Process collectors and build maps
        for (const collector of filteredCollectors) {
          // Get collector's branches
          let collectorBranches = [];

          if (collector.branches && collector.branches.length > 0) {
            collectorBranches = collector.branches;
          } else if (collector.assignedBranches && collector.assignedBranches.length > 0) {
            collectorBranches = collector.assignedBranches;
          } else {
            const assignedBranches = branchesData.filter(branch =>
              branch.assignedCollector === collector._id ||
              branch.collectorId === collector._id ||
              branch.collector === collector._id
            );
            collectorBranches = assignedBranches;
          }

          // Get members for each branch
          for (const branch of collectorBranches) {
            const branchCode = branch.branchCode || branch.code;
            if (branchCode && !allMembersMap.has(branchCode)) {
              try {
                const membersResponse = await membersAPI.getAll({
                  branchCode: branchCode,
                  limit: 1000
                });

                if (membersResponse.success && membersResponse.data) {
                  allMembersMap.set(branchCode, membersResponse.data);
                  // Map members to this collector
                  membersResponse.data.forEach(member => {
                    memberCollectorMap.set(member._id, collector._id);
                  });
                }
              } catch (error) {
                console.error(`Error loading members for branch ${branchCode}:`, error);
              }
            } else if (branchCode && allMembersMap.has(branchCode)) {
              // Branch already loaded, just map members to this collector
              const members = allMembersMap.get(branchCode);
              members.forEach(member => {
                memberCollectorMap.set(member._id, collector._id);
              });
            }
          }
        }

        console.log(`📊 Loaded ${allMembersMap.size} branches with members`);

        // ✅ OPTIMIZED: Get ALL installments, then filter by actual collection date
        let allDateInstallments = [];
        try {
          // Get ALL installments (not filtered by date yet)
          const installmentsResponse = await installmentsAPI.getAll({
            limit: 10000 // Get all recent installments
          });

          if (installmentsResponse.success && installmentsResponse.data) {
            allDateInstallments = installmentsResponse.data;
          }
        } catch (error) {
          console.error('Error loading installments:', error);
        }

        console.log(`💰 Found ${allDateInstallments.length} total installments in database`);

        // ✅ STRICT FILTER: Only installments actually collected on the selected date
        const collectedOnDate = allDateInstallments.filter(installment => {
          // CRITICAL: Must be collected or partial status
          if (installment.status !== 'collected' && installment.status !== 'partial') {
            return false;
          }

          // CRITICAL: Check COLLECTION DATE (not due date) matches selected date
          if (!installment.collectionDate) return false;

          const collectionDate = new Date(installment.collectionDate);

          // Convert both to YYYY-MM-DD format for accurate comparison
          const collectionDateStr = collectionDate.toISOString().split('T')[0];

          const matches = collectionDateStr === targetDateStr;

          // Detailed logging for debugging
          if (installment.status === 'collected' || installment.status === 'partial') {
            if (!matches) {
              console.log(`⏭️ SKIP: Collected on ${collectionDateStr}, looking for ${targetDateStr}`);
            } else {
              console.log(`✅ MATCH: Collected on ${collectionDateStr} = ${targetDateStr}`);
            }
          }

          return matches;
        });

        console.log(`✅ ${collectedOnDate.length} installments were actually collected on ${targetDateStr}`);

        // Build collection map: collectorId -> collection data
        const collectorCollectionMap = new Map();

        collectedOnDate.forEach(installment => {
          const memberId = installment.member?._id || installment.member;
          const collectorId = memberCollectorMap.get(memberId);

          if (collectorId) {
            if (!collectorCollectionMap.has(collectorId)) {
              collectorCollectionMap.set(collectorId, {
                totalCollection: 0,
                collectedMembers: new Set()
              });
            }

            const collectorData = collectorCollectionMap.get(collectorId);

            // ✅ CRITICAL FIX: Sum ALL payments from paymentHistory made ON THE TARGET DATE
            // This ensures partial payments are correctly attributed to the right day
            let amount = 0;
            let hasPaymentsToday = false;

            if (installment.paymentHistory && installment.paymentHistory.length > 0) {
              const targetDatePayments = installment.paymentHistory.filter(payment => {
                if (!payment.date) return false;
                const pDate = new Date(payment.date);
                return pDate.toISOString().split('T')[0] === targetDateStr;
              });

              if (targetDatePayments.length > 0) {
                amount = targetDatePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                hasPaymentsToday = true;
                console.log(`💰 [Manual] Installment ${installment._id}: ${targetDatePayments.length} payments today = ৳${amount}`);
              }
            }

            // Fallback for legacy records or cases where paymentHistory is missing but collectionDate matched
            if (!hasPaymentsToday) {
              amount = (installment.lastPaymentAmount != null && installment.lastPaymentAmount > 0)
                ? installment.lastPaymentAmount
                : (installment.paidAmount != null && installment.paidAmount > 0)
                  ? installment.paidAmount
                  : (installment.amount || 0);
            }
            const note = installment.note || '';
            const type = installment.installmentType;

            // Count all collections (loan, savings, advance payments)
            // Improved logic to handle all types of collections
            const noteLower = note.toLowerCase();

            // Skip product sales (loan disbursement)
            if (noteLower.includes('product sale:') && noteLower.includes('saleid:')) {
              console.log(`  ❌ Skipped Product Sale (loan disbursement)`);
            }
            // ✅ FIX: Skip savings collected during product sale
            // These have format: "Savings Collection - ৳XXX - Product Sale: ProductName"
            else if (noteLower.includes('savings collection') && noteLower.includes('product sale:')) {
              console.log(`  ❌ Skipped Savings from Product Sale (collected during product sale)`);
            }
            // ✅ FIX: Skip initial savings (member registration)
            // These have format: "Initial Savings - ৳XXX - Member: Name"
            else if (noteLower.includes('initial savings')) {
              console.log(`  ❌ Skipped Initial Savings (member registration)`);
            }
            else {
              // Count all other collections
              collectorData.totalCollection += amount;
              collectorData.collectedMembers.add(memberId);

              // Log type for debugging
              if (noteLower.includes('savings') || type === 'savings') {
                console.log(`  💵 Collector ${collectorId}: +৳${amount} (Savings)`);
              } else {
                console.log(`  💰 Collector ${collectorId}: +৳${amount} (Loan/Regular)`);
              }
            }
          }
        });

        // Build final collector data
        const processedCollectors = filteredCollectors.map(collector => {
          const collectorId = collector._id || collector.id;
          const collectionData = collectorCollectionMap.get(collectorId) || {
            totalCollection: 0,
            collectedMembers: new Set()
          };

          // Get collector's branches
          let collectorBranches = [];
          if (collector.branches && collector.branches.length > 0) {
            collectorBranches = collector.branches;
          } else if (collector.assignedBranches && collector.assignedBranches.length > 0) {
            collectorBranches = collector.assignedBranches;
          } else {
            collectorBranches = branchesData.filter(branch =>
              branch.assignedCollector === collectorId ||
              branch.collectorId === collectorId ||
              branch.collector === collectorId
            );
          }

          // Count total members
          let totalMembers = 0;
          collectorBranches.forEach(branch => {
            const branchCode = branch.branchCode || branch.code;
            const members = allMembersMap.get(branchCode) || [];
            totalMembers += members.length;
          });

          const hasCollection = collectionData.totalCollection > 0;

          return {
            id: collectorId,
            name: collector.name,
            totalCollection: collectionData.totalCollection,
            totalMembers: totalMembers,
            todayMembers: collectionData.collectedMembers.size,
            assignedMembers: totalMembers,
            branches: collectorBranches.map(b => b.name || b.branchName).filter(Boolean),
            branchCount: collectorBranches.length,
            lastUpdated: hasCollection
              ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
              : null
          };
        });

        // Calculate totals
        const totalCollection = processedCollectors.reduce((sum, c) => sum + c.totalCollection, 0);
        const totalMembers = processedCollectors.reduce((sum, c) => sum + c.totalMembers, 0);

        console.log(`✅ Total Collection for ${targetDateStr}: ৳${totalCollection}`);

        // Debug: Check branch counts
        processedCollectors.forEach(c => {
          console.log(`Collector ${c.name}: ${c.branchCount} branches, branches array:`, c.branches);
        });

        const collectionData = {
          date: date,
          totalCollection: totalCollection,
          activeCollectors: processedCollectors.length,
          collectors: processedCollectors,
          lastUpdated: new Date().toISOString()
        };

        setCollectionData(collectionData);

      } else {
        setCollectionData(null);
      }

    } catch (error) {
      console.error('Error in fetchDailyCollection:', error);
      toast.error(`Error loading collection data: ${error.message}`);
      setCollectionData(null);
    } finally {
      setLoading(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDailyCollection(filterType, selectedDate, selectedMonth);
    setRefreshing(false);
    toast.success('Data refreshed successfully');
  };

  // Handle date change
  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    fetchDailyCollection('daily', newDate, selectedMonth);
  };

  // Handle month change
  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
    fetchDailyCollection('monthly', selectedDate, newMonth);
  };

  // Handle filter type toggle
  const handleFilterTypeChange = (newType) => {
    setFilterType(newType);
    fetchDailyCollection(newType, selectedDate, selectedMonth);
  };

  // Load data on component mount (auto-refresh disabled)
  useEffect(() => {
    fetchDailyCollection(filterType, selectedDate, selectedMonth);
  }, []);

  // Fallback collectors data (for when API is not available)
  const installmentCollectors = [
    {
      id: 1,
      name: 'Rahim',
      branches: [
        {
          code: 'B001',
          name: 'Dhaka Branch',
          members: [
            { name: 'Abdul Karim', dueAmount: 150 },
            { name: 'Fatema Khatun', dueAmount: 200 },
            { name: 'Nasir Uddin', dueAmount: 150 }
          ]
        },
        {
          code: 'B002',
          name: 'Gulshan Branch',
          members: [
            { name: 'Salma Begum', dueAmount: 180 },
            { name: 'Rasheda Begum', dueAmount: 150 },
            { name: 'Kamal Hossain', dueAmount: 220 }
          ]
        }
      ]
    },
    {
      id: 2,
      name: 'Karim',
      branches: [
        {
          code: 'B003',
          name: 'Mirpur Branch',
          members: [
            { name: 'Rokeya Khatun', dueAmount: 150 },
            { name: 'Abdur Rahim', dueAmount: 500 }
          ]
        },
        {
          code: 'B004',
          name: 'Uttara Branch',
          members: [
            { name: 'Sumaiya Akter', dueAmount: 150 },
            { name: 'Alamgir Hossain', dueAmount: 190 }
          ]
        }
      ]
    }
  ];

  // Calculate collection data from installment collectors
  const calculateCollectionData = () => {
    let totalCollection = 0;
    let totalMembers = 0;
    const processedCollectors = [];

    installmentCollectors.forEach((collector) => {
      let collectorTotal = 0;
      let collectorMembers = 0;
      const branchNames = [];

      collector.branches.forEach((branch) => {
        branchNames.push(branch.name);
        branch.members.forEach((member) => {
          collectorTotal += member.dueAmount;
          collectorMembers += 1;
        });
      });

      totalCollection += collectorTotal;
      totalMembers += collectorMembers;

      processedCollectors.push({
        id: collector.id,
        name: collector.name,
        amount: collectorTotal,
        members: collectorMembers,
        branches: branchNames,
        branchCount: collector.branches.length,
        lastUpdated: new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        })
      });
    });

    return {
      totalCollection,
      totalMembers,
      collectedMembers: totalMembers, // Assuming all are collected for now
      pendingMembers: 0,
      collectors: processedCollectors
    };
  };

  // Use API data if available, otherwise fallback to static data
  let displayData;

  if (collectionData) {
    // Use real API data
    displayData = {
      summary: {
        totalCollection: collectionData.totalCollection || 0,
        totalMembers: collectionData.collectors?.reduce((sum, c) => sum + (c.totalMembers || 0), 0) || 0,
        activeCollectors: collectionData.activeCollectors || 0,
        targetCollection: 5000,
        collectionPercentage: 0
      },
      collectors: collectionData.collectors || [],
      date: collectionData.date || selectedDate,
      lastUpdated: collectionData.lastUpdated || new Date().toISOString()
    };
  } else if (!loading) {
    // Use fallback data
    const fallbackData = calculateCollectionData();
    displayData = {
      summary: {
        totalCollection: fallbackData.totalCollection,
        totalMembers: fallbackData.totalMembers,
        activeCollectors: fallbackData.collectors.length,
        targetCollection: 2000,
        collectionPercentage: Math.round((fallbackData.totalCollection / 2000) * 100)
      },
      collectors: fallbackData.collectors,
      date: selectedDate,
      lastUpdated: new Date().toISOString()
    };
  } else {
    // Loading state
    displayData = {
      summary: {
        totalCollection: 0,
        totalMembers: 0,
        activeCollectors: 0,
        targetCollection: 5000,
        collectionPercentage: 0
      },
      collectors: [],
      date: selectedDate,
      lastUpdated: new Date().toISOString()
    };
  }

  const getProgressColor = (percentage) => {
    if (percentage >= 90) return 'bg-green-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusBadge = (collected, target) => {
    const percentage = (collected / target) * 100;
    if (percentage >= 100) return 'bg-green-100 text-green-800';
    if (percentage >= 80) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Date / Month Selector and Actions */}
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

              {/* Date or Month Picker */}
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
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm font-medium"
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
                    className="px-4 py-2 border border-green-400 bg-green-50 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm font-bold text-green-900"
                    disabled={loading}
                  />
                </div>
              )}

              <div className="text-xs text-gray-500 self-end mb-2">
                <Clock className="h-3.5 w-3.5 inline mr-1" />
                Last updated: {toBDTime(new Date()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
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

              <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-all flex items-center space-x-2 text-sm shadow-sm">
                <Download className="h-4 w-4" />
                <span>Export Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            <span className="ml-3 text-gray-600">Loading collection data...</span>
          </div>
        )}

        {/* Summary Stats */}
        {!loading && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl shadow-lg p-8 text-white max-w-2xl mx-auto">
              <div className="text-center mb-4">
                <p className="text-sm opacity-80 mb-1">
                  {filterType === 'monthly' ? 'Collection Month' : 'Collection Date'}
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
                    (() => {
                      if (!selectedDate) return 'Invalid Date';
                      const dt = new Date(selectedDate);
                      return isNaN(dt.getTime()) ? selectedDate : dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    })()
                  )}
                </p>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <p className="text-lg opacity-90 mb-2">
                    {filterType === 'monthly' ? 'Total Monthly Collection' : 'Total Collection'}
                  </p>
                  <p className="text-6xl font-bold">৳{displayData.summary.totalCollection.toLocaleString()}</p>
                  <p className="text-sm opacity-80 mt-3">
                    {displayData.collectors.filter(c => c.totalCollection > 0).length} of {displayData.summary.activeCollectors} collectors collected {filterType === 'monthly' ? 'this month' : 'today'}
                  </p>
                </div>
                <div className="bg-white bg-opacity-20 p-4 rounded-full ml-6">
                  <DollarSign className="h-12 w-12" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collectors Performance */}
        {!loading && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Collectors Performance {filterType === 'monthly' ? '(Monthly Summary)' : ''}
              </h2>
              <div className="text-sm text-gray-500">
                {displayData.summary.activeCollectors} Active Collectors
              </div>
            </div>

            {displayData.collectors.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No collection data available for {filterType === 'monthly' ? selectedMonth : selectedDate}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayData.collectors.map((collector) => {
                  const hasCollection = (collector.totalCollection || 0) > 0;

                  return (
                    <div
                      key={collector.id}
                      className={`rounded-xl p-5 border-2 transition-all ${hasCollection
                        ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300 shadow-md'
                        : 'bg-gray-50 border-gray-200'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-full ${hasCollection ? 'bg-green-500' : 'bg-gray-400'
                            }`}>
                            <User className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg">{collector.name}</h3>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-1">
                            {filterType === 'monthly' ? 'Monthly Collection' : "Today's Collection"}
                          </p>
                          <p className={`text-3xl font-bold ${hasCollection ? 'text-green-600' : 'text-gray-400'
                            }`}>
                            ৳{(collector.totalCollection || 0).toLocaleString()}
                          </p>
                          {hasCollection && collector.lastUpdated && (
                            <p className="text-xs text-gray-500 mt-2">
                              Last updated: {collector.lastUpdated}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


      </div>
    </div>
  );
};

export default DailyCollection;
