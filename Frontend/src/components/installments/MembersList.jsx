import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Plus, DollarSign, Package, Edit, Trash2, UserPlus, Bell, Calendar, Clock, CheckCircle, AlertCircle, Minus } from 'lucide-react';
import { membersAPI, installmentsAPI, productsAPI } from '../../utils/api';
import AddMemberForm from './AddMemberForm';
import ProductSaleForm from './ProductSaleForm';
import NewCollectInstallmentForm from './NewCollectInstallmentForm';
import SavingsForm from '../savings/SavingsForm';
import { formatBDDateShort, getCurrentBDDateTime } from '../../utils/dateUtils';
import { getImageUrl } from '../../utils/imageUtils';
import toast from 'react-hot-toast';

const MembersList = ({ selectedBranch, selectedCollector, selectedDay, onGoBack }) => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [showProductSaleForm, setShowProductSaleForm] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberProductSales, setMemberProductSales] = useState([]);
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [membersDueToday, setMembersDueToday] = useState(new Set());
  const [collectingInstallment, setCollectingInstallment] = useState(null);
  const [memberActiveSales, setMemberActiveSales] = useState({}); // Track active sales count per member

  // Load members for this branch
  useEffect(() => {
    loadMembers();
    loadProducts();



    // Check for recent payments in localStorage
    const lastPayment = localStorage.getItem('lastPayment');
    if (lastPayment) {
      try {
        const paymentData = JSON.parse(lastPayment);
        const timeDiff = Date.now() - paymentData.timestamp;

        // If payment was made in last 5 minutes, force refresh
        if (timeDiff < 5 * 60 * 1000) {
          console.log('🔄 Recent payment detected, will refresh data...');
          setTimeout(() => {
            if (paymentData.memberId) {
              loadMemberProductSales(paymentData.memberId);
            }
          }, 1000);
        }
      } catch (error) {
        console.log('Error parsing payment data:', error);
      }
    }
  }, [selectedBranch]);

  // Check members due today
  useEffect(() => {
    try {
      const today = getCurrentBDDateTime();
      const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

      // Get today's date in YYYY-MM-DD format
      const todayStr = today.toISOString().split('T')[0];

      // For now, we'll check based on collection day and product installments
      // This is a simplified version - you can enhance based on your business logic
      const dueMembers = new Set();

      // Check if any members have pending product installments
      members.forEach(member => {
        // Check if member has any active product sales with pending installments
        if (member.activeProductSales && member.activeProductSales.length > 0) {
          member.activeProductSales.forEach(sale => {
            if (sale.installments && sale.installments.some(inst => inst.status === 'pending')) {
              dueMembers.add(member._id);
            }
          });
        }

        // You can add more logic here based on:
        // - Monthly installment schedule
        // - Weekly collection days
        // - Overdue payments
      });

      setMembersDueToday(dueMembers);

    } catch (error) {
      console.log('Error checking due members:', error);
    }
  }, [members]);

  // Mock members for testing (empty - will show "no members found")
  const mockMembers = [];

  const loadMembers = async () => {
    try {
      setLoading(true);
      console.log('📋 Loading members for branch:', selectedBranch.code);

      const response = await membersAPI.getByBranch(selectedBranch.code);
      console.log('📋 Members API response:', response);

      if (response.success && response.data) {
        // Filter members by assigned collector if collector is selected
        let filteredMembers = response.data;

        if (selectedCollector && selectedCollector._id) {
          console.log('🔍 Filtering members for collector:', selectedCollector.name);
          filteredMembers = response.data.filter(member =>
            member.assignedCollector === selectedCollector._id ||
            member.assignedCollector?._id === selectedCollector._id
          );
          console.log('✅ Filtered members count:', filteredMembers.length);
        }

        setMembers(filteredMembers);
        console.log('✅ Members loaded successfully:', filteredMembers.length);

        // Load active sales count for each member
        loadActiveSalesForMembers(filteredMembers);
      } else {
        console.log('❌ Failed to load members:', response);
        setMembers([]);
      }
    } catch (error) {
      console.error('❌ Error loading members:', error);
      toast.error('Failed to load members');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      if (response.success) {
        setAvailableProducts(response.data || []);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      setAvailableProducts([]);
    }
  };

  const loadMemberProductSales = async (memberId) => {
    try {
      console.log('📦 Loading product sales for member:', memberId);
      const response = await installmentsAPI.getByMember(memberId);

      if (response.success && response.data) {
        console.log('📦 Raw API Response:', response.data);

        // Filter installments that are product sales (installmentType: 'extra' and note contains 'Product Sale')
        const productSaleInstallments = response.data.filter(installment =>
          installment.installmentType === 'extra' &&
          installment.note &&
          installment.note.includes('Product Sale')
        );

        console.log('📦 Found product sale installments:', productSaleInstallments);

        const productSales = productSaleInstallments.map((installment, index) => {
          console.log(`📦 Processing installment ${index + 1}:`, installment);

          // Extract product name from note (e.g., "Product Sale: Rice cooker | Payment: cash")
          let productName = 'Unknown Product';
          const noteMatch = installment.note.match(/Product Sale: ([^|]+)/);
          if (noteMatch) {
            productName = noteMatch[1].trim();
          }

          const productData = {
            id: installment._id || `sale-${index}`,
            productName: productName,
            totalAmount: installment.amount || 0,
            paidAmount: installment.amount || 0, // Since installment is collected, it's paid
            remainingAmount: 0, // No remaining amount for collected installments
            saleDate: installment.collectionDate || installment.createdAt || new Date().toISOString(),
            installmentType: 'completed', // Mark as completed since it's already collected
            status: installment.status || 'collected',
            memberId: installment.member?._id || memberId,
            memberName: installment.member?.name || 'Unknown Member',
            note: installment.note || '',
            receiptNumber: installment.receiptNumber || '',
            collectionDay: installment.collectionDay || ''
          };

          console.log('📦 Extracted product data:', productData);
          return productData;
        });

        // Filter out completed products (optional - user can choose to show/hide)
        const activeProductSales = productSales.filter(sale => sale.status !== 'completed');

        console.log('✅ Final product sales array:', productSales);
        console.log('📊 Active product sales:', activeProductSales);

        // Check for recent payments in localStorage and preserve status
        const lastPayment = localStorage.getItem('lastPayment');
        if (lastPayment) {
          try {
            const paymentData = JSON.parse(lastPayment);
            const timeDiff = Date.now() - paymentData.timestamp;

            // If payment was made in last 10 minutes, preserve paid status
            if (timeDiff < 10 * 60 * 1000 && paymentData.memberId === memberId) {
              console.log('🔄 Preserving recent payment status for installment #' + paymentData.installmentNumber);

              const preservedSales = activeProductSales.map(sale => {
                if (sale.id === paymentData.productId) {
                  const preservedSchedule = sale.installmentSchedule.map(inst => {
                    if (inst.installmentNumber === paymentData.installmentNumber) {
                      return { ...inst, isPaid: true, status: 'paid' };
                    }
                    return inst;
                  });
                  return { ...sale, installmentSchedule: preservedSchedule };
                }
                return sale;
              });

              setMemberProductSales(preservedSales);
              return; // Exit early with preserved data
            }
          } catch (error) {
            console.log('Error parsing payment data:', error);
          }
        }

        setMemberProductSales(activeProductSales);
      } else {
        console.log('❌ API response failed or no data:', response);
        setMemberProductSales([]);
      }
    } catch (error) {
      console.error('❌ Error loading member product sales:', error);
      setMemberProductSales([]);
    }
  };

  const handleCollectInstallment = (member) => {
    console.log('💰 Opening installment form for member:', member.name, 'ID:', member._id);
    setSelectedMember(member);
    setShowInstallmentForm(true);
  };

  // Load active sales count for all members
  const loadActiveSalesForMembers = async (membersList) => {
    try {
      const activeSalesData = {};

      // Load active sales for each member in parallel
      await Promise.all(
        membersList.map(async (member) => {
          try {
            const response = await installmentsAPI.getActiveSales(member._id);
            if (response.success && response.data) {
              activeSalesData[member._id] = {
                count: response.data.activeProductSalesCount,
                canCreateNew: response.data.canCreateNewSale,
                activeSales: response.data.activeSales
              };
            }
          } catch (error) {
            console.error(`Error loading active sales for member ${member.name}:`, error);
            activeSalesData[member._id] = { count: 0, canCreateNew: true, activeSales: [] };
          }
        })
      );

      setMemberActiveSales(activeSalesData);
      console.log('📊 Active sales data loaded:', activeSalesData);
    } catch (error) {
      console.error('Error loading active sales:', error);
    }
  };

  const handleProductSale = (member) => {
    // Check if member can create new sale
    const activeSalesInfo = memberActiveSales[member._id];

    if (activeSalesInfo && !activeSalesInfo.canCreateNew) {
      toast.error(
        `${member.name} এর ইতিমধ্যে ${activeSalesInfo.count}টি সক্রিয় পণ্য বিক্রয় রয়েছে। নতুন বিক্রয় করতে হলে আগের কিস্তি সম্পূর্ণ পরিশোধ করতে হবে।`,
        { duration: 5000 }
      );
      return;
    }

    console.log('🛍️ Opening product sale form for member:', member.name);
    setSelectedMember(member);
    setShowProductSaleForm(true);
  };

  const handleEditMember = (member) => {
    console.log('🔧 Editing member:', member);
    setEditingMember(member);
    setShowAddForm(true);
  };

  const handleDeleteMember = async (memberId) => {
    if (window.confirm('Are you sure you want to delete this member?')) {
      try {
        const response = await membersAPI.delete(memberId);
        if (response.success) {
          toast.success('Member deleted successfully');
          loadMembers();
        } else {
          toast.error('Failed to delete member');
        }
      } catch (error) {
        console.error('Error deleting member:', error);
        toast.error('Failed to delete member');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="relative mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 border-t-indigo-600 mx-auto"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-400 animate-ping"></div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Loading Members</h3>
            <p className="text-gray-600">Please wait while we fetch your branch members...</p>
            <div className="mt-4 flex justify-center space-x-1">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-2 md:p-6">
      {/* Professional Header */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 mb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <button
            onClick={onGoBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-indigo-600 transition-all duration-300 hover:bg-indigo-50 px-4 py-2 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="font-medium">Back to Branch Selection</span>
          </button>

          {/* Removed central title/subtitle as requested */}
          <div className="hidden md:block" />

          <button
            onClick={() => setShowAddForm(true)}
            className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center space-x-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <Plus className="h-5 w-5" />
            <span>Add Member</span>
          </button>
        </div>

        {/* Branch Info Card - Mobile Responsive */}
        <div className="mt-6 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl p-4 text-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Branch */}
            <div className="flex items-center space-x-3 bg-white/10 rounded-lg p-3">
              <div className="bg-white/20 rounded-full p-2 flex-shrink-0">
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-indigo-100 text-xs font-medium">Branch</p>
                <p className="font-bold text-sm md:text-base truncate">{selectedBranch.code} - {selectedBranch.name}</p>
              </div>
            </div>

            {/* Collector */}
            <div className="flex items-center space-x-3 bg-white/10 rounded-lg p-3">
              <div className="bg-white/20 rounded-full p-2 flex-shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-indigo-100 text-xs font-medium">Collector</p>
                <p className="font-bold text-sm md:text-base truncate">
                  {selectedBranch.collectorName || selectedCollector?.name || 'Not Assigned'}
                </p>
              </div>
            </div>

            {/* Total Members */}
            <div className="flex items-center space-x-3 bg-white/10 rounded-lg p-3">
              <div className="bg-white/20 rounded-full p-2 flex-shrink-0">
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-indigo-100 text-xs font-medium">Total Members</p>
                <p className="font-bold text-sm md:text-base">{members.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Members Grid */}
      {members.length === 0 ? (
        <div className="text-center py-16">
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-16 max-w-lg mx-auto border border-white/20">
            <div className="relative mb-8">
              <div className="bg-gradient-to-r from-indigo-100 to-blue-100 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
                <Users className="h-12 w-12 text-indigo-600" />
              </div>
              <div className="absolute -top-2 -right-2 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full w-8 h-8 flex items-center justify-center">
                <Plus className="h-4 w-4 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-3">No Members Found</h3>
            <p className="text-gray-600 mb-8 leading-relaxed">
              No members are registered for this branch yet.<br />
              <span className="text-indigo-600 font-medium">Start by adding your first member!</span>
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-10 py-4 rounded-2xl font-bold transition-all duration-300 flex items-center space-x-3 mx-auto shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
            >
              <Plus className="h-6 w-6" />
              <span>Add Your First Member</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {members.map((member, index) => (
            <div
              key={member._id}
              className={`group relative bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 p-4 md:p-6 border border-white/20 hover:border-indigo-200 transform hover:-translate-y-2 h-full flex flex-col ${membersDueToday.has(member._id)
                ? 'ring-2 ring-orange-400 bg-gradient-to-br from-orange-50 to-amber-50'
                : 'hover:bg-gradient-to-br hover:from-indigo-50 hover:to-blue-50'
                }`}
              style={{
                animationDelay: `${index * 100}ms`
              }}
            >
              {/* Decorative Elements */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-indigo-100 to-blue-100 rounded-full -translate-y-10 translate-x-10 opacity-20 group-hover:opacity-30 transition-opacity"></div>

              {/* Member Header */}
              <div className="relative z-10 flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    {member.profileImage ? (
                      <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-lg border-2 border-white">
                        <img
                          src={getImageUrl(member.profileImage)}
                          alt={member.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to default icon if image fails to load
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                        <div className={`absolute inset-0 ${membersDueToday.has(member._id)
                          ? 'bg-gradient-to-r from-orange-400 to-amber-500'
                          : 'bg-gradient-to-r from-indigo-500 to-blue-600'
                          } rounded-full p-3 shadow-lg hidden items-center justify-center`}>
                          <Users className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className={`${membersDueToday.has(member._id)
                        ? 'bg-gradient-to-r from-orange-400 to-amber-500'
                        : 'bg-gradient-to-r from-indigo-500 to-blue-600'
                        } rounded-full p-3 shadow-lg`}>
                        <Users className="h-5 w-5 text-white" />
                      </div>
                    )}
                    {membersDueToday.has(member._id) && (
                      <div className="absolute -top-1 -right-1 bg-red-500 rounded-full w-3 h-3 animate-pulse"></div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-indigo-700 transition-colors">
                      {member.memberCode ? `(${member.memberCode}) ${member.name}` : member.name}
                    </h3>
                    <p className="text-sm text-gray-500 font-medium">ID: {member.memberNumber || member._id.slice(-6)}</p>
                  </div>
                </div>

                {membersDueToday.has(member._id) && (
                  <div className="bg-gradient-to-r from-orange-400 to-red-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center shadow-lg animate-pulse">
                    <Bell className="h-3 w-3 mr-1" />
                    Due Today
                  </div>
                )}
              </div>

              {/* Member Details */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600 bg-gray-50 rounded-lg p-2">
                  <div className="bg-indigo-100 rounded-full p-1 mr-3">
                    <Calendar className="h-3 w-3 text-indigo-600" />
                  </div>
                  <span className="font-medium">Age: {member.age} | Phone: {member.phone}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600 bg-gray-50 rounded-lg p-2">
                  <div className="bg-blue-100 rounded-full p-1 mr-3">
                    <Clock className="h-3 w-3 text-blue-600" />
                  </div>
                  <span className="font-medium">Join Date: {formatBDDateShort(member.joinDate || member.createdAt)}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600 bg-green-50 rounded-lg p-2">
                  <div className="bg-green-100 rounded-full p-1 mr-3">
                    <DollarSign className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="font-bold text-green-700">Total Savings: ৳{member.totalSavings?.toLocaleString() || 0}</span>
                </div>
              </div>

              {/* Active Sales Indicator */}
              <div className="mb-3 h-8">
                {memberActiveSales[member._id] && memberActiveSales[member._id].count > 0 ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-700 font-semibold">
                        Active Sales: {memberActiveSales[member._id].count}/2
                      </span>
                      {!memberActiveSales[member._id].canCreateNew && (
                        <span className="text-red-600 font-bold">Max Limit</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div></div>
                )}
              </div>

              {/* Action Buttons */}
              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 mt-auto">
                <button
                  onClick={() => handleCollectInstallment(member)}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Collect
                </button>

                <button
                  onClick={() => handleProductSale(member)}
                  disabled={memberActiveSales[member._id] && !memberActiveSales[member._id].canCreateNew}
                  className={`${memberActiveSales[member._id] && !memberActiveSales[member._id].canCreateNew
                    ? 'bg-gradient-to-r from-gray-300 to-gray-400 cursor-not-allowed opacity-60'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 hover:shadow-xl transform hover:-translate-y-0.5'
                    } text-white px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center shadow-lg relative`}
                  title={
                    memberActiveSales[member._id] && !memberActiveSales[member._id].canCreateNew
                      ? 'এই সদস্যের ইতিমধ্যে ২টি সক্রিয় পণ্য বিক্রয় রয়েছে'
                      : 'পণ্য বিক্রয় করুন'
                  }
                >
                  <Package className="h-4 w-4 mr-1" />
                  Sale
                  {memberActiveSales[member._id] && memberActiveSales[member._id].count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {memberActiveSales[member._id].count}
                    </span>
                  )}
                </button>
              </div>

              {/* Hover Effect Overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-blue-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
            </div>
          ))}
        </div>
      )}

      {/* New Separate Components */}
      {showAddForm && (
        <AddMemberForm
          selectedBranch={selectedBranch}
          selectedCollector={selectedCollector}
          editingMember={editingMember}
          onClose={() => {
            setShowAddForm(false);
            setEditingMember(null);
          }}
          onMemberAdded={loadMembers}
        />
      )}

      {showProductSaleForm && selectedMember && (
        <ProductSaleForm
          key={`sale-form-${selectedMember._id}`}
          selectedMember={selectedMember}
          selectedBranch={selectedBranch}
          selectedCollector={selectedCollector}
          selectedDay={selectedDay}
          availableProducts={availableProducts}
          onClose={() => {
            setShowProductSaleForm(false);
            setSelectedMember(null);
          }}
          onSaleAdded={() => {
            loadMembers();
            if (selectedMember) {
              loadMemberProductSales(selectedMember._id);
            }
          }}
        />
      )}

      {/* Collect Installment Form */}
      {showInstallmentForm && selectedMember && (
        <NewCollectInstallmentForm
          selectedMember={selectedMember}
          selectedBranch={selectedBranch}
          selectedCollector={selectedCollector}
          onClose={() => {
            setShowInstallmentForm(false);
            setSelectedMember(null);
          }}
          onInstallmentCollected={loadMembers}
        />
      )}
    </div>
  );
};

export default MembersList;
