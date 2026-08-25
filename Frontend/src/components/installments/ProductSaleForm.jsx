import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { installmentsAPI } from '../../utils/api';

const ProductSaleForm = ({ selectedMember, selectedBranch, selectedCollector, selectedDay, availableProducts, onClose, onSaleAdded }) => {
  // Get Bangladesh date (UTC+6)
  const getBangladeshDate = () => {
    const now = new Date();
    const bangladeshTime = new Date(now.getTime() + (6 * 60 * 60 * 1000)); // Add 6 hours
    return bangladeshTime.toISOString().split('T')[0];
  };

  const [productSaleData, setProductSaleData] = useState({
    selectedProducts: [], // Array with {product, quantity, subtotal}
    customProductName: '',
    totalAmount: 0,
    savingsCollection: 0, // Savings collected during product sale
    notes: '',
    paymentType: 'installment',
    installmentType: 'weekly',
    installmentCount: 4,
    installmentAmount: 0,
    manualInstallmentAmount: false, // Track if user manually set installment amount
    saleDate: (() => {
      const d = getBangladeshDate();
      console.log('📅 Initializing ProductSaleForm with default date:', d);
      return d;
    })() // Sale date - default to today (Bangladesh time)
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Auto calculate total amount when products change (but not for custom products)
  useEffect(() => {
    // Only auto-calculate if no custom product name is entered
    if (!productSaleData.customProductName) {
      const total = productSaleData.selectedProducts.reduce((sum, item) => {
        return sum + item.subtotal;
      }, 0);

      setProductSaleData(prev => ({
        ...prev,
        totalAmount: total,
        // Only auto-calculate installment amount if user hasn't manually set it
        installmentAmount: prev.manualInstallmentAmount ? prev.installmentAmount :
          (prev.installmentCount > 0 ? Math.round(total / prev.installmentCount) : 0)
      }));
    }
  }, [productSaleData.selectedProducts, productSaleData.installmentCount, productSaleData.customProductName]);

  // Smart installment calculation based on type and amount
  const calculateSmartInstallments = (totalAmount, installmentType) => {
    let suggestedCount = 4; // Default

    if (installmentType === 'daily') {
      if (totalAmount <= 500) suggestedCount = 10; // 10 days
      else if (totalAmount <= 1000) suggestedCount = 15; // 15 days
      else if (totalAmount <= 2000) suggestedCount = 20; // 20 days
      else if (totalAmount <= 5000) suggestedCount = 30; // 30 days
      else suggestedCount = 45; // 45 days
    } else if (installmentType === 'weekly') {
      if (totalAmount <= 500) suggestedCount = 4; // 4 weeks
      else if (totalAmount <= 1000) suggestedCount = 6; // 6 weeks
      else if (totalAmount <= 2000) suggestedCount = 8; // 8 weeks
      else if (totalAmount <= 5000) suggestedCount = 12; // 12 weeks
      else suggestedCount = 16; // 16 weeks
    } else if (installmentType === 'monthly') {
      if (totalAmount <= 1000) suggestedCount = 2; // 2 months
      else if (totalAmount <= 3000) suggestedCount = 3; // 3 months
      else if (totalAmount <= 5000) suggestedCount = 4; // 4 months
      else if (totalAmount <= 10000) suggestedCount = 6; // 6 months
      else suggestedCount = 8; // 8 months
    }

    return suggestedCount;
  };

  // Auto-update installment count and amount when type or total changes
  useEffect(() => {
    if (productSaleData.totalAmount > 0 && productSaleData.paymentType === 'installment') {
      const suggestedCount = calculateSmartInstallments(productSaleData.totalAmount, productSaleData.installmentType);
      const calculatedAmount = Math.round(productSaleData.totalAmount / suggestedCount);

      setProductSaleData(prev => ({
        ...prev,
        installmentCount: suggestedCount,
        installmentAmount: calculatedAmount
      }));
    }
  }, [productSaleData.totalAmount, productSaleData.installmentType, productSaleData.paymentType]);

  // 🎯 NEW: Auto-set installmentType to 'daily' for Daily Kisti
  useEffect(() => {
    const isDaily = selectedCollector?.collectionType === 'daily' || selectedDay?.isDaily;
    if (isDaily && productSaleData.installmentType !== 'daily') {
      console.log('📅 Daily Kisti detected - auto-setting installmentType to daily');
      setProductSaleData(prev => ({
        ...prev,
        installmentType: 'daily',
        manualInstallmentAmount: false // Reset manual flag to allow recalculation
      }));
    }
  }, [selectedCollector, selectedDay]);

  // Handle multiple product selection
  const handleProductSelect = (product) => {
    if (!product) return;

    const stock = product.availableStock !== undefined ? product.availableStock : (product.totalStock || 0);
    if (stock <= 0) {
      toast.error(`"${product.name}" এর স্টক শেষ (০)! এটি নির্বাচন করা যাবে না।`);
      return;
    }

    const isAlreadySelected = productSaleData.selectedProducts.some(item => item.product._id === product._id);

    if (!isAlreadySelected) {
      // Add to selection with default quantity 1
      const newItem = {
        product: product,
        quantity: 1,
        subtotal: product.unitPrice * 1
      };

      setProductSaleData(prev => ({
        ...prev,
        selectedProducts: [...prev.selectedProducts, newItem]
      }));
    }
  };

  // Remove product from selection
  const removeProduct = (productId) => {
    setProductSaleData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.filter(item => item.product._id !== productId)
    }));
  };

  // Update quantity for specific product with strict stock limits
  const updateProductQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) return;

    setProductSaleData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.map(item => {
        if (item.product._id === productId) {
          const maxStock = item.product.availableStock !== undefined ? item.product.availableStock : (item.product.totalStock || 0);
          
          if (newQuantity > maxStock) {
            toast.error(`"${item.product.name}" এর পর্যাপ্ত স্টক নেই! সর্বোচ্চ উপলব্ধ স্টক: ${maxStock} টি`);
            return {
              ...item,
              quantity: maxStock,
              subtotal: item.product.unitPrice * maxStock
            };
          }

          return {
            ...item,
            quantity: newQuantity,
            subtotal: item.product.unitPrice * newQuantity
          };
        }
        return item;
      })
    }));
  };

  // Update unit price for specific product
  const updateProductUnitPrice = (productId, newUnitPrice) => {
    if (newUnitPrice < 0) return;

    setProductSaleData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.map(item => {
        if (item.product._id === productId) {
          return {
            ...item,
            product: {
              ...item.product,
              unitPrice: newUnitPrice
            },
            subtotal: newUnitPrice * item.quantity
          };
        }
        return item;
      })
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    let newData = { [name]: value };

    // Handle total amount changes
    if (name === 'totalAmount') {
      const amount = parseFloat(value) || 0;
      newData.totalAmount = amount;
      // Auto-calculate installment amount based on new total
      if (!productSaleData.manualInstallmentAmount && productSaleData.installmentCount > 0) {
        newData.installmentAmount = Math.round(amount / productSaleData.installmentCount);
      }
    }

    // Auto-calculate installment amount when count changes (only if not manually set)
    if (name === 'installmentCount' && value > 0 && !productSaleData.manualInstallmentAmount) {
      newData.installmentAmount = Math.round(productSaleData.totalAmount / parseInt(value));
    }

    // Mark as manual when user changes installment amount
    if (name === 'installmentAmount') {
      newData.manualInstallmentAmount = true;
    }

    // Reset manual flag when installment type changes (to allow auto-calculation)
    if (name === 'installmentType') {
      newData.manualInstallmentAmount = false;
      newData.installmentAmount = Math.round(productSaleData.totalAmount / productSaleData.installmentCount);
    }

    setProductSaleData(prev => ({
      ...prev,
      ...newData
    }));
  };

  // Function to get collection schedule dates for the collector
  const getCollectionScheduleDates = async (collectorId) => {
    try {
      // 🎯 CRITICAL FIX: Fetch from backend API instead of localStorage
      console.log('🎯 Fetching schedule from backend API for collector:', collectorId);

      try {
        const response = await fetch(`/api/schedules/collector/${collectorId}/dates`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.collectionDates && data.data.collectionDates.length > 0) {
            console.log('✅ Fetched schedule from backend:', data.data.collectionDates);
            // Ensure dates are properly formatted
            return data.data.collectionDates.filter(date => date && date.includes('/'));
          }
        }
      } catch (apiError) {
        console.warn('⚠️ Backend API fetch failed, falling back to localStorage:', apiError);
      }

      // Fallback to localStorage if API fails
      const savedSchedule = localStorage.getItem(`collection_schedule_${collectorId}`);
      if (savedSchedule) {
        const parsed = JSON.parse(savedSchedule);
        const dates = parsed.collectionDates || [];

        console.log('📅 Using localStorage schedule (fallback):', dates);
        // Return dates as-is from localStorage (they should already have proper dates)
        return dates.filter(date => date && date.includes('/'));
      }

      // Generate weekly dates for next 4 months if no schedule found
      const today = new Date();
      const generatedDates = [];
      let currentDate = new Date(today);

      // Start from next Saturday (or today if it's Saturday)
      const daysUntilSaturday = (6 - currentDate.getDay() + 7) % 7 || 7;
      currentDate.setDate(currentDate.getDate() + daysUntilSaturday);

      // Generate 16 weekly dates (4 months worth)
      for (let i = 0; i < 16; i++) {
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = currentDate.getFullYear();
        generatedDates.push(`${day}/${month}/${year}`);

        // Move to next week
        currentDate.setDate(currentDate.getDate() + 7);
      }

      console.log('🆕 Generated default weekly schedule:', generatedDates);
      return generatedDates;

    } catch (error) {
      console.error('Error loading collection schedule:', error);
      // Generate fallback weekly dates
      const today = new Date();
      const fallbackDates = [];
      let currentDate = new Date(today);

      // Start from next Saturday
      const daysUntilSaturday = (6 - currentDate.getDay() + 7) % 7 || 7;
      currentDate.setDate(currentDate.getDate() + daysUntilSaturday);

      // Generate 16 weekly dates
      for (let i = 0; i < 16; i++) {
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = currentDate.getFullYear();
        fallbackDates.push(`${day}/${month}/${year}`);
        currentDate.setDate(currentDate.getDate() + 7);
      }

      return fallbackDates;
    }
  };

  // Function to convert DD/MM/YYYY to Date object
  const parseCollectionDate = (dateString) => {
    try {
      const [day, month, year] = dateString.split('/');
      return new Date(year, month - 1, day); // month is 0-indexed
    } catch (error) {
      return new Date();
    }
  };

  // Function to create loan installments in database
  const createLoanInstallments = async (saleData, baseDate) => {
    try {
      console.log('💰 Creating loan installments for installment payment');

      const productNames = saleData.products.map(p => p.productName).join(', ');

      // Get collection schedule dates from collector's schedule
      const collectorId = selectedCollector?.id || selectedCollector?._id || selectedMember?.collector?.id || selectedMember?.collectorId;
      const scheduleDates = await getCollectionScheduleDates(collectorId);

      console.log('📅 Using collection schedule dates:', scheduleDates);
      console.log('🎯 Sale date (today):', baseDate.toDateString());

      // 🎯 Find the next schedule date after sale date (not today, but sale date)
      const saleDate = new Date(baseDate);
      saleDate.setHours(0, 0, 0, 0);

      // Convert schedule dates to Date objects and sort them
      const scheduleDateObjects = scheduleDates
        .map(dateStr => parseCollectionDate(dateStr))
        .sort((a, b) => a - b);

      // Find first date after sale date
      let startDateIndex = scheduleDateObjects.findIndex(date => {
        const schedDate = new Date(date);
        schedDate.setHours(0, 0, 0, 0);
        return schedDate > saleDate;
      });

      // If all dates are in the past, use next month's schedule dates
      if (startDateIndex === -1) {
        console.log('⚠️ All schedule dates are in the past, generating next month dates');
        // Generate next month's dates with same day numbers
        const nextMonth = new Date(saleDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthNum = String(nextMonth.getMonth() + 1).padStart(2, '0');
        const nextYear = nextMonth.getFullYear();

        // Update schedule dates to next month
        const nextMonthDates = scheduleDates.map(dateStr => {
          const [day] = dateStr.split('/');
          return `${day}/${nextMonthNum}/${nextYear}`;
        });

        // Re-convert to Date objects
        const nextMonthDateObjects = nextMonthDates
          .map(dateStr => parseCollectionDate(dateStr))
          .sort((a, b) => a - b);

        // Find first date after sale date in next month
        startDateIndex = nextMonthDateObjects.findIndex(date => {
          const schedDate = new Date(date);
          schedDate.setHours(0, 0, 0, 0);
          return schedDate > saleDate;
        });

        // If still not found, use first date of next month
        if (startDateIndex === -1) {
          startDateIndex = 0;
        }

        // Use next month's dates for installments
        scheduleDateObjects.length = 0;
        scheduleDateObjects.push(...nextMonthDateObjects);
      }

      console.log(`🎯 First installment will be on: ${scheduleDateObjects[startDateIndex].toDateString()} (next collection date after sale)`);

      // Create individual installments using collection schedule dates
      const installmentDates = [];

      // Generate all future dates based on schedule pattern
      const allFutureDates = [];
      const maxMonthsAhead = 6; // Generate dates for next 6 months

      for (let monthOffset = 0; monthOffset <= maxMonthsAhead; monthOffset++) {
        for (const scheduleDate of scheduleDateObjects) {
          const futureDate = new Date(scheduleDate);
          futureDate.setMonth(futureDate.getMonth() + monthOffset);

          // Only add dates that are after sale date
          if (futureDate > saleDate) {
            allFutureDates.push(futureDate);
          }
        }
      }

      // Sort all future dates
      allFutureDates.sort((a, b) => a - b);

      console.log(`🎯 Generated ${allFutureDates.length} future collection dates based on schedule`);

      // Now assign dates to installments
      for (let i = 0; i < saleData.installmentCount; i++) {
        let installmentDate;

        if (i < allFutureDates.length) {
          // Use the next available collection date
          installmentDate = new Date(allFutureDates[i]);
          console.log(`📅 Installment ${i + 1}/${saleData.installmentCount} scheduled for: ${installmentDate.toDateString()}`);
        } else {
          // If we run out of scheduled dates, continue weekly from last date
          const lastDate = allFutureDates[allFutureDates.length - 1] || new Date();
          installmentDate = new Date(lastDate);
          const weeksToAdd = (i - allFutureDates.length + 1);
          installmentDate.setDate(installmentDate.getDate() + (weeksToAdd * 7));
          console.log(`📅 Installment ${i + 1}/${saleData.installmentCount} scheduled for: ${installmentDate.toDateString()} (extended beyond schedule)`);
        }

        const installmentData = {
          memberId: saleData.memberId,
          amount: saleData.installmentAmount,
          installmentType: 'regular', // Mark as regular loan installment
          collectionDay: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][installmentDate.getDay()],
          paymentMethod: 'cash',
          weekNumber: Math.ceil(installmentDate.getDate() / 7),
          monthYear: `${installmentDate.getFullYear()}-${String(installmentDate.getMonth() + 1).padStart(2, '0')}`,
          note: `Product Loan: ${productNames} - Installment ${i + 1}/${saleData.installmentCount} (${saleData.installmentType})`,
          receiptNumber: `PL-${Date.now()}-${i + 1}`,
          branchCode: saleData.branchCode,
          branch: saleData.branchName,
          date: installmentDate.toISOString().split('T')[0]
        };

        console.log(`💰 Creating installment ${i + 1}/${saleData.installmentCount}:`, installmentData);

        // Create the installment record
        const installmentResponse = await installmentsAPI.collect(installmentData);

        if (!installmentResponse.success) {
          console.error(`Failed to create installment ${i + 1}:`, installmentResponse.message);
        }
      }

      console.log('✅ All loan installments created successfully');
      toast.success(`${saleData.installmentCount} loan installments created for ${productNames}!`);

    } catch (error) {
      console.error('Error creating loan installments:', error);
      toast.error('Product sale created but failed to create loan installments');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (productSaleData.selectedProducts.length === 0 && !productSaleData.customProductName) {
      toast.error('Please select at least one product or enter a custom product name');
      return;
    }

    if (productSaleData.totalAmount <= 0) {
      toast.error('Total amount must be greater than 0');
      return;
    }

    // 🛡️ Pre-submit stock validation
    for (const item of productSaleData.selectedProducts) {
      const maxStock = item.product.availableStock !== undefined ? item.product.availableStock : (item.product.totalStock || 0);
      if (item.quantity > maxStock) {
        toast.error(`"${item.product.name}" এর পর্যাপ্ত স্টক নেই! উপলব্ধ স্টক: ${maxStock} টি, কিন্তু চাওয়া হয়েছে: ${item.quantity} টি।`);
        return;
      }
      if (maxStock <= 0) {
        toast.error(`"${item.product.name}" এর স্টক শেষ (০)!`);
        return;
      }
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading('Creating product sale...');

    try {
      // Get current date info for required fields
      const currentDate = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[currentDate.getDay()];
      const weekNumber = Math.ceil(currentDate.getDate() / 7);
      const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

      // Prepare sale data with all required fields
      const saleData = {
        // Basic member and branch info
        memberId: selectedMember._id,
        memberName: selectedMember.name,
        branchCode: selectedBranch.code || selectedBranch.branchCode,
        branchName: selectedBranch.name,

        // Product information
        products: productSaleData.selectedProducts.map(item => ({
          productId: item.product._id,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.unitPrice,
          subtotal: item.subtotal
        })),
        customProductName: productSaleData.customProductName,

        // Amount and payment details
        totalAmount: parseFloat(productSaleData.totalAmount),
        paymentType: productSaleData.paymentType,
        installmentType: productSaleData.installmentType,
        installmentCount: parseInt(productSaleData.installmentCount),
        installmentAmount: parseFloat(productSaleData.installmentAmount),

        // Savings collection during product sale
        savingsCollection: parseFloat(productSaleData.savingsCollection) || 0,

        // Required fields for backend validation
        collectionDay: currentDay,
        weekNumber: weekNumber,
        monthYear: monthYear,
        paymentMethod: productSaleData.paymentType === 'cash' ? 'cash' : 'cash',

        // Optional fields
        deliveryDate: productSaleData.saleDate, // Use the selected sale date as delivery date
        notes: productSaleData.notes || ''
      };

      console.log('🛍️ Sending product sale data:', saleData);
      const response = await installmentsAPI.createProductSale(saleData);
      toast.dismiss(loadingToast);

      if (response.success) {
        toast.success('Product sale created successfully!');

        // If installment payment is selected, create loan installments in database
        if (productSaleData.paymentType === 'installment') {
          console.log('💰 Creating loan installments for installment payment...');

          // 🎯 CRITICAL FIX: Get collector schedule from PROPS (selected collector)
          const collectorId = selectedCollector?._id || selectedCollector?.id;
          console.log('🎯 Using collector ID from props:', collectorId);
          console.log('👤 Selected Collector:', selectedCollector?.name);

          if (!collectorId) {
            console.error('❌ No collector ID found! Using fallback.');
            toast.error('Collector not selected properly. Please try again.');
            return;
          }

          // ✅ CRITICAL FIX: Determine collection day properly
          let collectionDay = null;

          // 1. Try selectedDay prop first
          if (selectedDay) {
            collectionDay = selectedDay?.isDaily ? 'Daily' : (selectedDay?.name || selectedDay);
            console.log('📅 Using selectedDay from props:', collectionDay);
          }

          // 2. If no selectedDay, fetch from collector's schedule IMMEDIATELY
          if (!collectionDay && collectorId) {
            try {
              console.log('📅 Fetching collection day from database for collector:', collectorId);
              const scheduleResponse = await fetch(`/api/schedules?collectorId=${collectorId}`, {
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
              });
              const scheduleData = await scheduleResponse.json();
              if (scheduleData.success && scheduleData.data.length > 0) {
                collectionDay = scheduleData.data[0].collectionDay;
                console.log('✅ Loaded collection day from database:', collectionDay);
              }
            } catch (error) {
              console.error('Error loading collection day:', error);
            }
          }

          // 3. Try collector object
          if (!collectionDay) {
            collectionDay = selectedCollector?.collectionDay;
            console.log('📅 Using collector default day:', collectionDay);
          }

          // 4. Fallback to Saturday if still no day found
          if (!collectionDay) {
            collectionDay = 'Saturday';
            console.log('⚠️ Using fallback collection day: Saturday');
          }

          console.log('🎯🎯 Final Collection Day for installments:', collectionDay);

          console.log('📅 Collection Day:', collectionDay);

          // ✅ CRITICAL FIX: Get saleTransactionId from product sale response
          const saleTransactionId = response.data?.saleTransactionId;
          console.log('🎯 Sale Transaction ID from response:', saleTransactionId);

          if (!saleTransactionId) {
            console.error('❌ No saleTransactionId in response!');
            toast.error('Product sale created but missing transaction ID. Please refresh.');
            return;
          }

          // Prepare loan data for the new API endpoint
          const loanData = {
            memberId: saleData.memberId,
            productNames: saleData.products.length > 0
              ? saleData.products.map(p => p.productName).join(', ')
              : saleData.customProductName,
            totalAmount: saleData.totalAmount,
            installmentCount: saleData.installmentCount,
            installmentAmount: saleData.installmentAmount,
            installmentType: saleData.installmentType,
            branchCode: saleData.branchCode,
            branchName: saleData.branchName,
            collectionDay: collectionDay,  // 🎯 NEW: Send day instead of dates array
            collectorId: selectedCollector?._id || selectedCollector?.id,
            saleDate: productSaleData.saleDate, // 📅 Sale date for calculating installment schedule
            saleTransactionId: saleTransactionId // ✅ NEW: Pass saleTransactionId to use as distributionId
          };

          console.log('📤 Creating product loan with data:', loanData);

          try {
            const loanResponse = await installmentsAPI.createProductLoan(loanData);
            if (loanResponse.success) {
              toast.success(`${loanResponse.data.summary.totalInstallments} loan installments created successfully! 💰`);
              console.log('✅ Product loan installments created:', loanResponse.data);
            } else {
              toast.error('Product sale created but failed to create loan installments');
            }
          } catch (loanError) {
            console.error('Error creating product loan:', loanError);

            // Check for max active sales error
            if (loanError.message && loanError.message.includes('MAX_ACTIVE_SALES_REACHED')) {
              toast.error('এই সদস্যের ইতিমধ্যে ২টি সক্রিয় পণ্য বিক্রয় রয়েছে। নতুন বিক্রয় করতে হলে আগের কিস্তি সম্পূর্ণ পরিশোধ করতে হবে।', {
                duration: 6000
              });
            } else {
              toast.error('Product sale created but failed to create loan installments');
            }
          }
        }

        onSaleAdded();
        onClose();
      } else {
        toast.error(response.message || 'Failed to create product sale');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error creating product sale:', error);
      console.error('Error details:', error.message);

      // Show more specific error messages
      if (error.message.includes('Authentication')) {
        toast.error('Authentication failed. Please login again.');
      } else if (error.message.includes('Validation')) {
        toast.error('Validation error: Please check all required fields');
      } else if (error.message.includes('Member not found')) {
        toast.error('Member not found. Please refresh and try again.');
      } else {
        toast.error(`Failed to create product sale: ${error.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-transparent backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-4xl mx-4 max-h-[95vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">Product Sale</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Member Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
          <div className="flex items-center">
            <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-3">
              👤
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">Member</p>
              <p className="text-blue-800 font-semibold">{selectedMember.name}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sale Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📅 Sale Date *
            </label>
            <input
              type="date"
              name="saleDate"
              value={productSaleData.saleDate}
              onChange={handleInputChange}
              max={getBangladeshDate()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              🕒 Default: Today's date. You can select previous dates if needed.
            </p>
          </div>
          {/* Multiple Product Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Products * (Multiple Selection with Individual Quantities)
            </label>

            {/* Selected Products Display with Individual Quantities */}
            {productSaleData.selectedProducts.length > 0 && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800 mb-3">Selected Products:</p>
                <div className="space-y-3">
                  {productSaleData.selectedProducts.map(item => (
                    <div key={item.product._id} className="bg-white border border-green-200 rounded-lg p-3">
                      {/* Mobile Responsive Layout */}
                      <div className="space-y-3">
                        {/* Product Name and Remove Button */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-wrap gap-2">
                            <h4 className="font-medium text-gray-800">{item.product.name}</h4>
                            <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                              📦 Stock: {item.product.availableStock !== undefined ? item.product.availableStock : (item.product.totalStock || 0)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeProduct(item.product._id)}
                            className="text-red-500 hover:text-red-700 font-bold text-xl ml-2"
                          >
                            ×
                          </button>
                        </div>

                        {/* Unit Price and Quantity - Mobile Friendly */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price</label>
                            <input
                              type="number"
                              value={item.product.unitPrice || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateProductUnitPrice(item.product._id, val === '' ? 0 : parseFloat(val));
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                              min="0"
                              step="1"
                              placeholder="Enter price"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-xs font-medium text-gray-600">Qty</label>
                              <span className="text-[11px] text-gray-500">Max: {item.product.availableStock !== undefined ? item.product.availableStock : (item.product.totalStock || 0)}</span>
                            </div>
                            <input
                              type="number"
                              value={item.quantity || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateProductQuantity(item.product._id, val === '' ? 1 : parseInt(val));
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-green-500"
                              min="1"
                              max={item.product.availableStock !== undefined ? item.product.availableStock : (item.product.totalStock || 1)}
                              placeholder="Qty"
                            />
                          </div>
                        </div>

                        {/* Total Amount */}
                        <div className="bg-green-50 px-3 py-2 rounded border border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-600">Total Amount:</span>
                            <span className="text-sm font-bold text-green-700">৳{item.subtotal}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-800">Total Amount:</span>
                    <span className="text-lg font-bold text-green-800">৳{productSaleData.totalAmount}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Product Search and Dropdown */}
            <div className="space-y-2">
              {/* Search Input */}
              <input
                type="text"
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                placeholder="🔍 Search products by name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              {/* Product Count Info */}
              {(() => {
                const filteredProducts = availableProducts.filter(product => {
                  const stock = product.availableStock !== undefined ? product.availableStock : 
                               (product.totalStock !== undefined ? product.totalStock : (product.stock || 0));
                  return stock > 0 && product.name.toLowerCase().includes(productSearchTerm.toLowerCase());
                });
                const inStockCount = availableProducts.filter(product => {
                  const stock = product.availableStock !== undefined ? product.availableStock : 
                               (product.totalStock !== undefined ? product.totalStock : (product.stock || 0));
                  return stock > 0;
                }).length;
                return (
                  <p className="text-xs text-gray-500">
                    {productSearchTerm 
                      ? `🔍 Found ${filteredProducts.length} of ${inStockCount} in-stock products`
                      : `📦 ${inStockCount} products in stock (${availableProducts.length - inStockCount} out of stock hidden)`
                    }
                  </p>

                );
              })()}

              {/* Product Dropdown with Filtered Results */}
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    const product = availableProducts.find(p => p._id === e.target.value);
                    handleProductSelect(product);
                    e.target.value = ''; // Reset dropdown
                    setProductSearchTerm(''); // Clear search
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                size="5"
              >
                <option value="" disabled>Choose from stock...</option>
                {(() => {
                  const filteredProducts = availableProducts.filter(product => {
                    const stock = product.availableStock !== undefined ? product.availableStock : 
                                 (product.totalStock !== undefined ? product.totalStock : (product.stock || 0));
                    return stock > 0 && product.name.toLowerCase().includes(productSearchTerm.toLowerCase());
                  });

                  if (filteredProducts.length === 0) {
                    return <option value="" disabled>No products found</option>;
                  }

                  return filteredProducts.map(product => (
                    <option
                      key={product._id}
                      value={product._id}
                      disabled={productSaleData.selectedProducts.some(item => item.product._id === product._id)}
                    >
                      {product.name} - Stock: {product.availableStock} - ৳{product.unitPrice}
                    </option>
                  ));
                })()}
              </select>
            </div>
          </div>

          {/* Custom Product Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Or Enter Custom Product Name (Optional)
            </label>
            <input
              type="text"
              name="customProductName"
              value={productSaleData.customProductName}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter custom product name if not in stock"
            />
          </div>

          {/* Total Amount - Editable for custom products, auto-calculated for selected products */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Amount (৳) *
              {productSaleData.customProductName ? (
                <span className="text-blue-600">(Editable)</span>
              ) : (
                <span className="text-green-600">(Auto-calculated)</span>
              )}
            </label>
            <input
              type="number"
              name="totalAmount"
              value={productSaleData.totalAmount}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${productSaleData.customProductName ? 'bg-white' : 'bg-gray-50 cursor-not-allowed'
                }`}
              placeholder={productSaleData.customProductName ? "Enter total amount" : "Auto-calculated from selected products"}
              readOnly={!productSaleData.customProductName}
              min="1"
              step="1"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {productSaleData.customProductName
                ? "💡 Enter amount for custom product. Installments will auto-calculate."
                : "Amount automatically calculated from selected products × quantity"
              }
            </p>
          </div>

          {/* Payment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Type *
            </label>
            <select
              name="paymentType"
              value={productSaleData.paymentType}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="cash">Cash Payment</option>
              <option value="installment">Installment Payment</option>
            </select>
          </div>

          {/* Installment Options */}
          {productSaleData.paymentType === 'installment' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Installment Type
                </label>
                <select
                  name="installmentType"
                  value={productSaleData.installmentType}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={selectedCollector?.collectionType === 'daily' || selectedDay?.isDaily}
                >
                  {/* For Daily Kisti collectors, only show Daily option */}
                  {(selectedCollector?.collectionType === 'daily' || selectedDay?.isDaily) ? (
                    <option value="daily">Daily</option>
                  ) : (
                    <>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </>
                  )}
                </select>
                {(selectedCollector?.collectionType === 'daily' || selectedDay?.isDaily) && (
                  <p className="text-xs text-blue-600 mt-1">
                    ℹ️ Daily Kisti collector - Only daily installments available
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Installments <span className="text-blue-600">(Auto-suggested)</span>
                  </label>
                  <input
                    type="number"
                    name="installmentCount"
                    value={productSaleData.installmentCount}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                  />
                  <p className="text-xs text-blue-600 mt-1">
                    Suggested based on {productSaleData.installmentType} payment
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Per Installment (৳) <span className="text-blue-600">(Editable)</span>
                  </label>
                  <input
                    type="number"
                    name="installmentAmount"
                    value={productSaleData.installmentAmount}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                    step="0.01"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {productSaleData.manualInstallmentAmount ?
                      `Manual: ৳${productSaleData.installmentAmount} × ${productSaleData.installmentCount} = ৳${productSaleData.installmentAmount * productSaleData.installmentCount}` :
                      `Auto: ৳${productSaleData.totalAmount} ÷ ${productSaleData.installmentCount} = ৳${productSaleData.installmentAmount}`
                    }
                  </p>
                </div>
              </div>

            </>
          )}

          {/* Savings Collection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              💰 Savings Collection (৳) <span className="text-gray-500">(Optional)</span>
            </label>
            <input
              type="number"
              name="savingsCollection"
              value={productSaleData.savingsCollection}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Enter savings amount collected"
              min="0"
              step="1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Collect savings from member during product sale (will be added to total savings)
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              name="notes"
              value={productSaleData.notes}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows="3"
              placeholder="Additional notes..."
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating Sale...' : 'Create Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductSaleForm;
