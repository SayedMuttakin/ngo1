import React, { useState, useEffect, useRef } from 'react';
import { Bell, User, DollarSign, RefreshCw, Loader, ChevronDown, ChevronUp, Users, Clock, AlertTriangle, Search, Filter } from 'lucide-react';
import { getCurrentBDDate, formatBDDateShort } from '../utils/dateUtils';
import { toast } from 'react-hot-toast';
import { collectorsAPI, dashboardAPI, installmentsAPI } from '../utils/api';
import { useNavigate } from 'react-router-dom';

const PendingInstallments = () => {
    const [loading, setLoading] = useState(false);
    const [collectorsData, setCollectorsData] = useState([]);
    const [expandedCollector, setExpandedCollector] = useState(null);
    const [collectorMembers, setCollectorMembers] = useState({});
    const [loadingMembers, setLoadingMembers] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCollector, setSelectedCollector] = useState('all');
    const [lastUpdated, setLastUpdated] = useState(null);
    const hasFetchedRef = useRef(false);
    const navigate = useNavigate();

    // Fetch all collectors and their due balances
    const fetchPendingData = async (showToast = true) => {
        setLoading(true);
        try {
            const response = await collectorsAPI.getAll({ limit: 100, isActive: true });
            if (!response.success || !response.data) {
                throw new Error('Failed to fetch collectors');
            }

            const allCollectors = response.data.filter(c => c.role === 'collector');
            const today = getCurrentBDDate();

            // Get due balance for each collector from backend API (accurate data)
            const collectorsWithDue = await Promise.all(allCollectors.map(async (collector) => {
                const collectorId = collector._id || collector.id;
                try {
                    const dashboardResponse = await dashboardAPI.getCollectorDashboard(collectorId, today);
                    if (dashboardResponse.success && dashboardResponse.data) {
                        return {
                            id: collectorId,
                            name: collector.name,
                            email: collector.email || '',
                            dueBalance: dashboardResponse.data.dueBalance || 0,
                            memberCount: 0, // Will be populated when expanded
                        };
                    }
                } catch (error) {
                    console.error(`Error fetching data for ${collector.name}:`, error);
                }
                return {
                    id: collectorId,
                    name: collector.name,
                    email: collector.email || '',
                    dueBalance: 0,
                    memberCount: 0,
                };
            }));

            // Sort by due balance (highest first)
            collectorsWithDue.sort((a, b) => b.dueBalance - a.dueBalance);
            setCollectorsData(collectorsWithDue);
            setLastUpdated(new Date());
            if (showToast) toast.success('ডেটা আপডেট হয়েছে');
        } catch (error) {
            console.error('Error fetching pending data:', error);
            toast.error('ডেটা লোড করতে ব্যর্থ হয়েছে');
        } finally {
            setLoading(false);
        }
    };

    // Fetch member-level pending installments for a specific collector
    const fetchCollectorMembers = async (collectorId) => {
        if (collectorMembers[collectorId]) return; // Already loaded

        setLoadingMembers(prev => ({ ...prev, [collectorId]: true }));
        try {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            // Fetch pending installments for this collector
            const [pendingRes, partialRes] = await Promise.all([
                installmentsAPI.getAll({ status: 'pending', collectorId, limit: 10000, populate: true }),
                installmentsAPI.getAll({ status: 'partial', collectorId, limit: 10000, populate: true }),
            ]);

            const allInstallments = [
                ...(pendingRes.success ? pendingRes.data || [] : []),
                ...(partialRes.success ? partialRes.data || [] : []),
            ];

            // Filter: active members + due today or overdue
            const dueInstallments = allInstallments.filter(inst => {
                if (!inst.member || inst.member.isActive === false) return false;
                const dueDate = inst.dueDate || inst.collectionDate;
                if (!dueDate) return true;
                const checkDate = new Date(dueDate);
                checkDate.setHours(23, 59, 59, 999);
                return checkDate <= new Date(todayStr + 'T23:59:59.999Z');
            });

            // Group by member
            const memberMap = {};
            dueInstallments.forEach(inst => {
                const memberId = inst.member?._id || inst.member;
                if (!memberId) return;
                if (!memberMap[memberId]) {
                    memberMap[memberId] = {
                        id: memberId,
                        name: inst.member?.name || 'Unknown',
                        phone: inst.member?.phone || '',
                        branchCode: inst.branchCode || '',
                        branchName: inst.branchName || inst.branchCode || '',
                        totalDue: 0,
                        pendingCount: 0,
                        oldestDueDate: null,
                        installments: [],
                    };
                }
                const amount = inst.status === 'partial' ? (inst.amount - (inst.paidAmount || 0)) : inst.amount;
                memberMap[memberId].totalDue += amount;
                memberMap[memberId].pendingCount += 1;
                memberMap[memberId].installments.push(inst);

                const dueDate = new Date(inst.dueDate || inst.collectionDate);
                if (!memberMap[memberId].oldestDueDate || dueDate < memberMap[memberId].oldestDueDate) {
                    memberMap[memberId].oldestDueDate = dueDate;
                }
            });

            // Sort members by total due (highest first)
            const members = Object.values(memberMap).sort((a, b) => b.totalDue - a.totalDue);

            setCollectorMembers(prev => ({ ...prev, [collectorId]: members }));

            // Update member count in collectors data
            setCollectorsData(prev => prev.map(c =>
                c.id === collectorId ? { ...c, memberCount: members.length } : c
            ));
        } catch (error) {
            console.error('Error fetching collector members:', error);
            toast.error('সদস্যদের ডেটা লোড করতে ব্যর্থ');
        } finally {
            setLoadingMembers(prev => ({ ...prev, [collectorId]: false }));
        }
    };

    // Toggle collector expansion
    const toggleCollector = (collectorId) => {
        if (expandedCollector === collectorId) {
            setExpandedCollector(null);
        } else {
            setExpandedCollector(collectorId);
            fetchCollectorMembers(collectorId);
        }
    };

    // Navigate to installment collection for a member
    const handleMemberClick = (member, collector) => {
        // Save state for Installments page to auto-open this member
        const state = {
            collector: { _id: collector.id, name: collector.name },
            branch: { code: member.branchCode, name: member.branchName },
            dashboard: false,
            directMember: { _id: member.id, name: member.name, phone: member.phone },
        };
        localStorage.setItem('installmentCollectionState', JSON.stringify(state));
        localStorage.setItem('selectedCollector', JSON.stringify({ _id: collector.id, name: collector.name }));
        localStorage.setItem('autoOpenMember', JSON.stringify({ _id: member.id, name: member.name, phone: member.phone }));
        navigate('/installments');
    };

    // Calculate days overdue
    const getDaysOverdue = (oldestDueDate) => {
        if (!oldestDueDate) return 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(oldestDueDate);
        due.setHours(0, 0, 0, 0);
        const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff);
    };

    // Initial fetch
    useEffect(() => {
        if (!hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchPendingData(false);
        }
    }, []);

    // Derived data
    const filteredCollectors = selectedCollector === 'all'
        ? collectorsData
        : collectorsData.filter(c => c.id === selectedCollector);

    const totalPendingAmount = collectorsData.reduce((sum, c) => sum + c.dueBalance, 0);
    const totalCollectors = collectorsData.filter(c => c.dueBalance > 0).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                            <Bell className="h-7 w-7" />
                            Pending Installments
                        </h1>
                        <p className="text-indigo-200 mt-1">আজকের ও বকেয়া কিস্তির তালিকা</p>
                    </div>
                    <button
                        onClick={() => {
                            setCollectorMembers({});
                            setExpandedCollector(null);
                            hasFetchedRef.current = false;
                            fetchPendingData(true);
                        }}
                        disabled={loading}
                        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 border border-white/30"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-indigo-200 text-xs font-medium">Total Pending Amount</p>
                        <p className="text-2xl md:text-3xl font-bold mt-1">৳{totalPendingAmount.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-indigo-200 text-xs font-medium">Collectors with Due</p>
                        <p className="text-2xl md:text-3xl font-bold mt-1">{totalCollectors}</p>
                    </div>
                    <div className="hidden md:block bg-white/15 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-indigo-200 text-xs font-medium">Last Updated</p>
                        <p className="text-lg font-bold mt-1">
                            {lastUpdated ? formatBDDateShort(lastUpdated) : '---'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="সদস্যের নাম, ফোন নম্বর দিয়ে খুঁজুন..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <select
                            value={selectedCollector}
                            onChange={(e) => setSelectedCollector(e.target.value)}
                            className="pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white appearance-none cursor-pointer min-w-[180px]"
                        >
                            <option value="all">সব Collector</option>
                            {collectorsData.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                        <Loader className="h-10 w-10 text-indigo-600 animate-spin mx-auto" />
                        <p className="text-gray-500 mt-3 font-medium">ডেটা লোড হচ্ছে...</p>
                    </div>
                </div>
            )}

            {/* Collectors List */}
            {!loading && filteredCollectors.map(collector => {
                const isExpanded = expandedCollector === collector.id;
                const members = collectorMembers[collector.id] || [];
                const isLoadingMembers = loadingMembers[collector.id];

                // Filter members by search query
                const filteredMembers = searchQuery
                    ? members.filter(m =>
                        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        m.phone.includes(searchQuery) ||
                        m.branchCode.includes(searchQuery)
                    )
                    : members;

                if (collector.dueBalance <= 0) return null;

                return (
                    <div key={collector.id} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                        {/* Collector Header */}
                        <button
                            onClick={() => toggleCollector(collector.id)}
                            className="w-full p-4 md:p-5 flex items-center justify-between hover:bg-gray-50 transition-all duration-200"
                        >
                            <div className="flex items-center gap-4">
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full p-3 shadow-lg">
                                    <User className="h-5 w-5 text-white" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-gray-900 text-lg">{collector.name}</h3>
                                    <p className="text-gray-500 text-xs">{collector.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 font-medium">Total Due</p>
                                    <p className="text-xl md:text-2xl font-bold text-red-600">৳{collector.dueBalance.toLocaleString()}</p>
                                    {isExpanded && members.length > 0 && (
                                        <p className="text-xs text-gray-500">{members.length} members</p>
                                    )}
                                </div>
                                {isExpanded ? (
                                    <ChevronUp className="h-5 w-5 text-gray-400" />
                                ) : (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                )}
                            </div>
                        </button>

                        {/* Expanded Members List */}
                        {isExpanded && (
                            <div className="border-t border-gray-100">
                                {isLoadingMembers ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader className="h-6 w-6 text-indigo-500 animate-spin" />
                                        <span className="ml-3 text-gray-500">সদস্যদের ডেটা লোড হচ্ছে...</span>
                                    </div>
                                ) : filteredMembers.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <Users className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                                        <p>কোনো বকেয়া কিস্তি পাওয়া যায়নি</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                                        {filteredMembers.map(member => {
                                            const daysOverdue = getDaysOverdue(member.oldestDueDate);
                                            return (
                                                <div
                                                    key={member.id}
                                                    onClick={() => handleMemberClick(member, collector)}
                                                    className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-4 hover:shadow-lg hover:border-indigo-300 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group"
                                                >
                                                    {/* Member Info */}
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="bg-gradient-to-br from-red-400 to-orange-500 rounded-full p-2 flex-shrink-0">
                                                                <User className="h-3.5 w-3.5 text-white" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h4 className="font-bold text-gray-800 text-sm truncate group-hover:text-indigo-700 transition-colors">
                                                                    {member.name}
                                                                </h4>
                                                                <p className="text-xs text-gray-500">📞 {member.phone}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Branch */}
                                                    <p className="text-xs text-gray-500 mb-3 truncate">
                                                        📍 {member.branchCode} - {member.branchName}
                                                    </p>

                                                    {/* Due Amount */}
                                                    <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 mb-2">
                                                        <p className="text-xs text-gray-500 font-medium">Total Due Amount</p>
                                                        <p className="text-lg font-bold text-red-600">৳{member.totalDue.toLocaleString()}</p>
                                                        <p className="text-xs text-gray-500">{member.pendingCount} pending installment{member.pendingCount > 1 ? 's' : ''}</p>
                                                    </div>

                                                    {/* Overdue Badge */}
                                                    {daysOverdue > 0 && (
                                                        <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                                                            <AlertTriangle className="h-3 w-3 text-orange-500" />
                                                            <span className="text-xs font-semibold text-orange-700">{daysOverdue} days overdue</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Empty State */}
            {!loading && filteredCollectors.every(c => c.dueBalance <= 0) && (
                <div className="text-center py-16 bg-white rounded-xl shadow-lg">
                    <Bell className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-700">কোনো বকেয়া কিস্তি নেই!</h3>
                    <p className="text-gray-500 mt-2">সব কিস্তি পরিশোধ হয়ে গেছে</p>
                </div>
            )}
        </div>
    );
};

export default PendingInstallments;
