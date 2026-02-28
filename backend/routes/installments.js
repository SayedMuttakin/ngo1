const express = require('express');
const Installment = require('../models/Installment');
const CollectionSchedule = require('../models/CollectionSchedule');
const Member = require('../models/Member');
const Product = require('../models/Product');
const CollectionHistory = require('../models/CollectionHistory');
const autoSavingsDeductionService = require('../services/autoSavingsDeduction.service');
const { protect, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { getDatesForDayInMonth, getNextDatesForDay } = require('../utils/dateHelper');

const router = express.Router();

// 🆕 HELPER FUNCTION: Check if product is complete and transfer savings
async function checkAndTransferSavings(memberId, distributionId, collectorId, member, userId) {
  if (!distributionId) return; // No distributionId means no product to check

  console.log(`\n🔍 Checking if product ${distributionId} is fully paid...`);

  // Get all installments for this product
  const allProductInstallments = await Installment.find({
    member: memberId,
    distributionId: distributionId,
    installmentType: 'regular',
    isActive: true
  });

  // Check if ALL installments are collected
  const allCollected = allProductInstallments.every(inst => inst.status === 'collected');
  const totalInstallments = allProductInstallments.length;
  const collectedCount = allProductInstallments.filter(inst => inst.status === 'collected').length;

  console.log(`📊 Product status: ${collectedCount}/${totalInstallments} installments collected`);

  if (allCollected && totalInstallments > 0) {
    console.log(`\n✅ ✅ ✅ ALL INSTALLMENTS PAID! Product ${distributionId} is COMPLETE! ✅ ✅ ✅`);

    // Extract product name for robust matching
    const completedInst = allProductInstallments[0];
    let productName = '';
    if (completedInst && completedInst.note) {
      const match = completedInst.note.match(/Product Loan: (.+?) -/);
      if (match) productName = match[1].trim();
    }

    console.log(`🔍 Searching savings for product: "${productName}" (ID: ${distributionId})`);

    // Calculate total savings for this completed product
    // Match by distributionId OR by product name in the note
    const productSavingsRecords = await Installment.find({
      member: memberId,
      installmentType: { $in: ['extra', 'savings'] },
      isActive: true,
      $and: [
        {
          $or: [
            { distributionId: distributionId },
            ...(productName ? [{ note: { $regex: productName, $options: 'i' } }] : [])
          ]
        },
        {
          $or: [
            { note: { $regex: 'Savings Collection', $options: 'i' } },
            { note: { $regex: 'Savings Withdrawal', $options: 'i' } },
            { note: { $regex: 'Product Sale:', $options: 'i' } }
          ]
        }
      ]
    });

    let totalSavings = 0;
    productSavingsRecords.forEach(record => {
      const isWithdrawal = record.note && record.note.includes('Withdrawal');
      const amount = record.paidAmount || record.amount || 0;
      if (isWithdrawal) {
        totalSavings -= amount;
      } else {
        totalSavings += amount;
      }
    });

    console.log(`💰 Total savings for completed product: ৳${totalSavings}`);

    if (totalSavings > 0) {
      // Find active product (other distributionId with unpaid installments)
      const otherProducts = await Installment.find({
        member: memberId,
        distributionId: { $ne: distributionId },
        installmentType: 'regular',
        status: { $in: ['pending', 'partial'] },
        isActive: true
      }).sort({ dueDate: 1 }).limit(1);

      if (otherProducts.length > 0) {
        const activeProduct = otherProducts[0];
        console.log(`🎯 Found active product: ${activeProduct.distributionId}`);

        // Extract product names
        const completedInst = allProductInstallments[0];
        let completedProductName = 'Product';
        let activeProductName = 'Active Product';

        if (completedInst && completedInst.note) {
          const match = completedInst.note.match(/Product Loan: (.+?) -/);
          if (match) completedProductName = match[1].trim();
        }

        if (activeProduct.note) {
          const match = activeProduct.note.match(/Product Loan: (.+?) -/);
          if (match) activeProductName = match[1].trim();
        }

        // Create savings transfer record
        const transferData = {
          member: memberId,
          collector: collectorId,
          amount: totalSavings,
          installmentType: 'extra',
          paymentMethod: 'cash',
          collectionDate: new Date(),
          collectionDay: new Date().toLocaleString('en-US', { weekday: 'long' }),
          weekNumber: Math.ceil(new Date().getDate() / 7),
          monthYear: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
          branch: member.branch,
          branchCode: member.branchCode,
          receiptNumber: `TRANSFER-${Date.now()}`,
          note: `Savings transferred from completed product: ${completedProductName} - ৳${totalSavings} transferred to ${activeProductName}`,
          status: 'collected',
          createdBy: userId,
          distributionId: activeProduct.distributionId,
          dueDate: new Date()
        };

        const transferRecord = await Installment.create(transferData);
        console.log(`✅ ✅ Created savings transfer record: ৳${totalSavings} from ${completedProductName} to ${activeProductName}`);
        console.log(`   Transfer ID: ${transferRecord._id}`);
        console.log(`   From: ${distributionId} → To: ${activeProduct.distributionId}`);
      } else {
        console.log(`ℹ️ No active product found to transfer savings to.`);
      }
    } else {
      console.log(`ℹ️ No savings to transfer (total: ৳${totalSavings})`);
    }
  }
}


// @desc    Create product loan installments
// @route   POST /api/installments/create-product-loan
// @access  Private
router.post('/create-product-loan', protect, async (req, res) => {
  try {
    const {
      memberId,
      productNames,
      totalAmount,
      installmentCount,
      installmentAmount,
      installmentType,
      branchCode,
      branchName,
      collectionDay,  // 🎯 NEW: Day of week instead of schedule array
      collectorId,
      saleDate,  // 📅 NEW: Sale date (can be past date)
      saleTransactionId // ✅ NEW: Sale transaction ID from product sale
    } = req.body;

    console.log('\n========== CREATING PRODUCT LOAN INSTALLMENTS ==========');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('📅 Collection Day:', collectionDay);
    console.log('🎯 Collection Day Type:', typeof collectionDay);
    console.log('👤 Collector ID:', collectorId);
    console.log('📝 Installment Type:', installmentType);
    console.log('💰 Total Amount:', totalAmount);
    console.log('📅 Installment Count:', installmentCount);
    console.log('🗓️ Sale Date:', saleDate);
    console.log('====================================================\n');

    // Validate required fields
    if (!memberId || !totalAmount || !installmentCount || !installmentAmount) {
      return res.status(400).json({
        success: false,
        message: 'Member ID, total amount, installment count, and installment amount are required'
      });
    }

    // Find the member
    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // ✅ CRITICAL FIX: Check for existing loan installments and calculate active product sales
    console.log('🔍 Checking for existing loan installments for member:', member.name);
    const existingInstallments = await Installment.find({
      member: memberId,
      installmentType: 'regular',
      note: { $regex: 'Product Loan', $options: 'i' },
      isActive: true
    }).sort({ dueDate: 1 });

    console.log(`📊 Found ${existingInstallments.length} existing loan installments`);

    // 🚫 NEW: Check for maximum 2 active product sales restriction
    // Group by distributionId and calculate Total vs Paid for each product
    const productSales = {};

    existingInstallments.forEach(inst => {
      if (!inst.distributionId) return;

      // ✅ CRITICAL FIX: Skip savings collections - only count LOAN payments
      // Savings collections have installmentType: 'extra' and note contains "Savings"
      if (inst.installmentType === 'extra' && inst.note &&
        (inst.note.includes('Savings Collection') || inst.note.includes('Savings Withdrawal'))) {
        console.log(`⏭️ Skipping savings record: ${inst.note} (not a loan payment)`);
        return; // Don't count savings in paidAmount
      }

      if (!productSales[inst.distributionId]) {
        productSales[inst.distributionId] = {
          distributionId: inst.distributionId,
          totalAmount: 0,
          paidAmount: 0,
          installments: []
        };
      }

      productSales[inst.distributionId].installments.push(inst);
      productSales[inst.distributionId].totalAmount += inst.amount;
      productSales[inst.distributionId].paidAmount += (inst.paidAmount || 0);
    });

    // Filter to only products with outstanding due (not fully paid)
    const activeDistributionIds = Object.keys(productSales).filter(distId => {
      const sale = productSales[distId];
      const due = sale.totalAmount - sale.paidAmount;
      console.log(`💜 Product ${distId}: Total=৳${sale.totalAmount}, Paid=৳${sale.paidAmount}, Due=৳${due}`);
      return due > 0; // Only count if there's still outstanding amount
    });

    const activeProductSalesCount = activeDistributionIds.length;
    console.log(`📊 Member has ${activeProductSalesCount} active product sales (with outstanding due)`);
    console.log(`📊 Distribution IDs: ${activeDistributionIds.join(', ')}`);

    // Prevent creating a new sale if member already has 2 active sales
    if (activeProductSalesCount >= 2) {
      console.log('🚫 Member already has 2 active product sales. Cannot create new sale.');
      return res.status(400).json({
        success: false,
        message: 'এই সদস্যের ইতিমধ্যে ২টি সক্রিয় পণ্য বিক্রয় রয়েছে। নতুন বিক্রয় করতে হলে আগের কিস্তি সম্পূর্ণ পরিশোধ করতে হবে।',
        messageEn: 'This member already has 2 active product sales. Previous installments must be fully paid before making a new sale.',
        error: 'MAX_ACTIVE_SALES_REACHED',
        data: {
          activeProductSalesCount: activeProductSalesCount,
          maxAllowed: 2
        }
      });
    }

    // Keep only pending installments for duplicate checking
    const existingPendingInstallments = existingInstallments.filter(inst => inst.status === 'pending');

    // If there are already pending installments for this member, don't create duplicates
    if (existingPendingInstallments.length > 0) {
      console.log('⚠️ Member already has pending loan installments. Checking if we should skip creation...');

      // Check if the product names match (to allow different product loans)
      const existingProductNames = existingPendingInstallments
        .map(inst => inst.note)
        .filter(note => note && note.includes('Product Loan:'))
        .map(note => {
          const match = note.match(/Product Loan: (.+?) - /);
          return match ? match[1].trim() : '';
        })
        .filter(name => name.length > 0);

      // If same product names exist in pending installments, return existing ones
      const hasMatchingProduct = existingProductNames.some(existingName =>
        productNames && productNames.toLowerCase().includes(existingName.toLowerCase())
      );

      if (hasMatchingProduct) {
        console.log('✅ Same product loan installments already exist. Returning existing installments.');
        return res.status(200).json({
          success: true,
          message: `${existingPendingInstallments.length} loan installments already exist for this product`,
          data: {
            installments: existingPendingInstallments,
            member: {
              _id: member._id,
              name: member.name
            },
            summary: {
              totalInstallments: existingPendingInstallments.length,
              totalAmount: existingPendingInstallments.reduce((sum, inst) => sum + inst.amount, 0),
              installmentAmount: existingPendingInstallments[0]?.amount || 0,
              installmentType: installmentType,
              isExisting: true
            }
          }
        });
      }
    }

    // 🎯 NEW: Calculate schedule dates based on collection day
    const now = new Date();
    const bdTime = new Date(now.getTime() + (6 * 60 * 60 * 1000)); // Bangladesh = UTC+6

    // 📅 Use saleDate if provided, otherwise use today (Bangladesh time)
    let today;
    if (saleDate) {
      // Parse saleDate (YYYY-MM-DD) as UTC date
      const [year, month, day] = saleDate.split('-');
      today = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
      console.log(`📅 Using provided sale date: ${saleDate}`);
    } else {
      today = new Date(Date.UTC(bdTime.getUTCFullYear(), bdTime.getUTCMonth(), bdTime.getUTCDate(), 0, 0, 0));
      console.log(`📅 Using today's date (Bangladesh time)`);
    }

    console.log(`\n📅 Server time: ${now.toISOString()}`);
    console.log(`📅 Bangladesh time: ${bdTime.toISOString()}`);
    console.log(`📅 Product Sale Date: ${today.toISOString().split('T')[0]}`);

    // 🎯 Calculate dates based on collection day - starting from sale date
    let scheduleDates = [];
    let parsedScheduleDates = [];

    if (collectionDay && collectorId) {
      // 🎯 CRITICAL FIX: Generate schedule dates based on collector's collectionDay
      console.log(`📅 Fetching actual schedule for collector ${collectorId} on ${collectionDay}`);

      // 🎯 NEW: Handle Daily kisti separately
      if (collectionDay === 'Daily') {
        console.log('📅 Daily Kisti detected - generating consecutive daily dates starting from tomorrow');

        // Generate consecutive dates starting from TOMORROW (not today)
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(today.getUTCDate() + 1);

        for (let i = 0; i < installmentCount; i++) {
          const installmentDate = new Date(tomorrow);
          installmentDate.setUTCDate(tomorrow.getUTCDate() + i);

          parsedScheduleDates.push(new Date(installmentDate));

          const day = String(installmentDate.getUTCDate()).padStart(2, '0');
          const month = String(installmentDate.getUTCMonth() + 1).padStart(2, '0');
          const year = installmentDate.getUTCFullYear();
          scheduleDates.push(`${day}/${month}/${year}`);
        }

        console.log(`📅 Generated ${scheduleDates.length} consecutive daily dates`);
        console.log(`📅 First date: ${scheduleDates[0]} (tomorrow)`);
        console.log(`📅 Last date: ${scheduleDates[scheduleDates.length - 1]}`);
      } else {
        // Weekly collection - find specific day of week
        try {
          const collectorSchedule = await CollectionSchedule.findOne({
            collector: collectorId,
            collectionDay: collectionDay,
            isActive: true
          });

          if (collectorSchedule) {
            console.log(`✅ Found schedule for ${collectorSchedule.collectionDay}`);

            // 🎯 Generate dates for this collection day for next 12 months
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const targetDayIndex = daysOfWeek.indexOf(collectionDay);

            // Generate all occurrences of this day for next 12 months
            const monthsToGenerate = 12;

            for (let monthOffset = 0; monthOffset < monthsToGenerate; monthOffset++) {
              const targetMonth = new Date(today);
              targetMonth.setUTCMonth(today.getUTCMonth() + monthOffset);

              const year = targetMonth.getUTCFullYear();
              const month = targetMonth.getUTCMonth();
              const firstDay = new Date(Date.UTC(year, month, 1, 0, 0, 0));
              const lastDay = new Date(Date.UTC(year, month + 1, 0, 0, 0, 0));

              // Find all occurrences of target day in this month
              for (let date = new Date(firstDay); date <= lastDay; date.setUTCDate(date.getUTCDate() + 1)) {
                if (date.getUTCDay() === targetDayIndex && date >= today) { // 📅 Include sale date
                  parsedScheduleDates.push(new Date(date));
                  const day = String(date.getUTCDate()).padStart(2, '0');
                  const monthStr = String(date.getUTCMonth() + 1).padStart(2, '0');
                  const yearStr = date.getUTCFullYear();
                  scheduleDates.push(`${day}/${monthStr}/${yearStr}`);
                }
              }
            }

            // Sort by date
            parsedScheduleDates.sort((a, b) => a - b);

            console.log(`📅 Generated ${scheduleDates.length} future ${collectionDay} dates`);
            console.log(`📅 First 10 dates:`, scheduleDates.slice(0, 10));
          } else {
            console.log('⚠️ No schedule found in database, using day-based calculation');
            // Fallback to day-based calculation
            scheduleDates = getNextDatesForDay(collectionDay, today, installmentCount * 4);
            parsedScheduleDates = scheduleDates.map(dateStr => {
              const [day, month, year] = dateStr.split('/');
              return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
            });
          }
        } catch (error) {
          console.error('❌ Error fetching collection schedule:', error);
          // Fallback to day-based calculation
          scheduleDates = getNextDatesForDay(collectionDay, today, installmentCount * 4);
          parsedScheduleDates = scheduleDates.map(dateStr => {
            const [day, month, year] = dateStr.split('/');
            return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
          });
        }
      } // Close the try-catch block for weekly collection

      console.log(`📅 Collection Day: ${collectionDay}`);
      console.log(`📅 First installment will be on: ${scheduleDates[0]} (next ${collectionDay} after today)`);
    } else {
      // Fallback: use next dates from today
      console.log('⚠️ No collection day provided, using fallback');
      scheduleDates = getNextDatesForDay('Saturday', today, installmentCount * 4);
      parsedScheduleDates = scheduleDates.map(dateStr => {
        const [day, month, year] = dateStr.split('/');
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
      });
    }

    console.log(`📅 Installment Schedule:`, parsedScheduleDates.map(d => d.toISOString().split('T')[0]));

    // Helper: pick mid-of-month date from a list (closest to 16th)
    const pickMidOfMonth = (dates) => {
      if (!dates || dates.length === 0) return null;
      const targetDay = 16;
      let best = dates[0];
      let bestDiff = Math.abs(dates[0].getUTCDate() - targetDay);
      for (const d of dates) {
        const diff = Math.abs(d.getUTCDate() - targetDay);
        if (diff < bestDiff) {
          best = d;
          bestDiff = diff;
        }
      }
      return best;
    };

    // Helper: add months safely keeping day where possible
    const addMonthsSafe = (base, monthsToAdd) => {
      const y = base.getUTCFullYear();
      const m = base.getUTCMonth();
      const d = base.getUTCDate();
      const anchor = new Date(Date.UTC(y, m, 1, 0, 0, 0));
      anchor.setUTCMonth(anchor.getUTCMonth() + monthsToAdd);
      const daysInTargetMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate();
      anchor.setUTCDate(Math.min(d, daysInTargetMonth));
      return anchor;
    };

    // For monthly: Find the first schedule date after 15th, then use same day each month
    const getMonthlyDatesFixed = (count) => {
      if (parsedScheduleDates.length === 0 || count <= 0) return [];

      // 🎯 CRITICAL FIX: Find the SMALLEST day number after 15th from schedule
      // Example: If schedule has [6, 13, 20, 27], we want 20 (smallest after 15)
      let targetDay = null;

      console.log(`📅 Current date: ${today.toISOString().split('T')[0]}`);
      console.log(`📅 Searching for smallest date after 15th in schedule...`);

      // Collect all unique day numbers after 15th
      const daysAfter15 = [];
      for (const d of parsedScheduleDates) {
        const dayNum = d.getUTCDate();
        if (dayNum > 15 && !daysAfter15.includes(dayNum)) {
          daysAfter15.push(dayNum);
        }
      }

      // Sort and get the smallest
      if (daysAfter15.length > 0) {
        daysAfter15.sort((a, b) => a - b);
        targetDay = daysAfter15[0]; // Smallest day after 15th
        console.log(`📅 ✅ Days after 15th in schedule: [${daysAfter15.join(', ')}]`);
        console.log(`📅 ✅ Selected smallest day: ${targetDay}`);
        console.log(`📅 Using day ${targetDay} for all monthly installments`);
      }

      // If no date after 15th found in immediate schedule, check next month's pattern
      if (!targetDay && parsedScheduleDates.length > 0) {
        // Get the day of week from first schedule date
        const firstScheduleDate = parsedScheduleDates[0];
        const dayOfWeek = firstScheduleDate.getUTCDay();

        // Find dates with same day of week in next month that are after 15th
        const nextMonth = new Date(today);
        nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
        nextMonth.setUTCDate(16); // Start from 16th

        // Find the first occurrence of that day of week after 15th
        while (nextMonth.getUTCDay() !== dayOfWeek) {
          nextMonth.setUTCDate(nextMonth.getUTCDate() + 1);
          if (nextMonth.getUTCDate() > 28) break; // Safety check
        }

        if (nextMonth.getUTCDate() > 15 && nextMonth.getUTCDate() <= 28) {
          targetDay = nextMonth.getUTCDate();
          console.log(`📅 Found by projecting to next month: Day ${targetDay}`);
        }
      }

      // Fallback to 20th if still no date found (common mid-month date)
      if (!targetDay) {
        targetDay = 20;
        console.log(`📅 ⚠️ Using fallback: Day ${targetDay}`);
      }

      // Generate monthly dates using the same day each month
      const results = [];
      let baseDate = new Date(today);
      baseDate.setUTCDate(targetDay);

      // 🎯 If target day in current month has already passed, move to next month
      if (baseDate <= today) {
        baseDate.setUTCMonth(baseDate.getUTCMonth() + 1);
        console.log(`📅 Target day ${targetDay} already passed this month, moving to next month`);
      }

      console.log(`📅 First monthly installment will be on: ${baseDate.toISOString().split('T')[0]}`);

      // Generate the installment dates
      for (let i = 0; i < count; i++) {
        const installmentDate = new Date(baseDate);
        installmentDate.setUTCMonth(baseDate.getUTCMonth() + i);

        // Handle month overflow (e.g., Jan 31 -> Feb 28/29)
        const targetMonth = (baseDate.getUTCMonth() + i) % 12;
        const targetYear = baseDate.getUTCFullYear() + Math.floor((baseDate.getUTCMonth() + i) / 12);
        installmentDate.setUTCFullYear(targetYear);
        installmentDate.setUTCMonth(targetMonth);

        // Ensure we keep the target day or last day of month
        const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        installmentDate.setUTCDate(Math.min(targetDay, lastDayOfMonth));

        results.push(installmentDate);
      }

      return results;
    };

    // Precompute monthly due dates if needed
    let precomputedMonthlyDates = null;
    if (installmentType === 'monthly') {
      precomputedMonthlyDates = getMonthlyDatesFixed(installmentCount);
      console.log('📅 Monthly installment dates:', precomputedMonthlyDates.map(d => d.toISOString().split('T')[0]));
    }

    // Find the first schedule date that is AFTER today (not including today) for weekly cycle
    let firstInstallmentDate = null;
    let startScheduleIndex = 0;

    for (let idx = 0; idx < parsedScheduleDates.length; idx++) {
      if (parsedScheduleDates[idx] > today) {
        firstInstallmentDate = new Date(parsedScheduleDates[idx]);
        startScheduleIndex = idx;
        console.log(`✅ First (weekly) installment will be on: ${firstInstallmentDate.toISOString().split('T')[0]} (schedule index ${idx})`);
        break;
      }
    }

    // If no future weekly date found in current cycle, start from first date of next cycle
    if (!firstInstallmentDate && parsedScheduleDates.length > 0) {
      firstInstallmentDate = new Date(parsedScheduleDates[0]);
      // Add days to move to next month assuming weekly cycle
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      firstInstallmentDate.setDate(firstInstallmentDate.getDate() + daysInMonth);
      startScheduleIndex = 0;
      console.log(`⚠️ No future weekly date. Starting from next month: ${firstInstallmentDate.toISOString().split('T')[0]}`);
    }

    // ✅ CRITICAL FIX: Use saleTransactionId if provided (links sales + installments + savings)
    // Otherwise generate unique distribution ID
    const distributionId = saleTransactionId || `DIST-${memberId}-${Date.now()}`;
    console.log(`📦 Distribution ID: ${distributionId}`);
    if (saleTransactionId) {
      console.log(`✅ Using saleTransactionId from product sale: ${saleTransactionId}`);
    } else {
      console.log(`⚠️ No saleTransactionId provided, generated new ID`);
    }

    // Create individual loan installments
    const createdInstallments = [];

    // ✅ FIX: Define loanSaleDate from the scope variables
    const loanSaleDate = saleDate ? new Date(saleDate) : new Date();

    // Helper: Find next specific day
    const getNextDayOnOrAfter = (date, dayName) => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDay = days.indexOf(dayName);
      if (targetDay === -1) return new Date(date);

      const result = new Date(date);
      const current = result.getUTCDay();
      const add = (targetDay - current + 7) % 7;
      result.setUTCDate(result.getUTCDate() + add);
      return result;
    };

    // 🎯 NEW: Keep track of dates for daily kisti (skipping Fridays)
    let lastDailyDate = new Date(loanSaleDate);

    for (let i = 0; i < installmentCount; i++) {
      let installmentDate;

      // ✅ SIMPLIFIED DATE LOGIC (User Request)
      // Base date is the sale date (loanSaleDate)
      // Monthly: Add i+1 months
      // Daily: Add i+1 days
      // Weekly: Add (i+1) * 7 days

      /* LOGIC_START */
      const loanSaleDateObj = new Date(loanSaleDate);

      // 🎯 SMART ALIGNMENT LOGIC (User Request)
      if (collectionDay && collectionDay !== 'Daily') {
        // ... (weekly/monthly alignment logic)
        if (installmentType === 'monthly') {
          // ... (monthly alignment logic)
          // (Keeping existing logic for brevity in this replace call, but targeting the structure)
          // 🎯 MONTHLY ALIGNMENT: Find the closest collector day to the same day-of-month each month
          const targetDayOfMonth = loanSaleDateObj.getUTCDate();

          // Calculate target date for this installment (i+1 months after sale)
          const targetDateMonth = new Date(Date.UTC(
            loanSaleDateObj.getUTCFullYear(),
            loanSaleDateObj.getUTCMonth() + (i + 1),
            1, 0, 0, 0
          ));

          const targetYear = targetDateMonth.getUTCFullYear();
          const targetMonth = targetDateMonth.getUTCMonth();

          // Find all occurrences of the collector's day in the target month
          const collectorDaysInMonth = [];
          const lastDayInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

          const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const targetDayIndex = daysOfWeek.indexOf(collectionDay);

          for (let d = 1; d <= lastDayInMonth; d++) {
            const checkDate = new Date(Date.UTC(targetYear, targetMonth, d, 0, 0, 0));
            if (checkDate.getUTCDay() === targetDayIndex) {
              collectorDaysInMonth.push(checkDate);
            }
          }

          if (collectorDaysInMonth.length > 0) {
            // Find the date in this list that is closest to targetDayOfMonth
            let closestDate = collectorDaysInMonth[0];
            let minDiff = Math.abs(collectorDaysInMonth[0].getUTCDate() - targetDayOfMonth);

            for (const d of collectorDaysInMonth) {
              const diff = Math.abs(d.getUTCDate() - targetDayOfMonth);
              if (diff < minDiff) {
                closestDate = d;
                minDiff = diff;
              }
            }
            installmentDate = closestDate;
          } else {
            // Fallback: just use the target dayOfMonth
            installmentDate = new Date(Date.UTC(targetYear, targetMonth, Math.min(targetDayOfMonth, lastDayInMonth)));
          }

          console.log(`   📅 (Monthly Aligned) #${i + 1}: ${collectionDay} closest to day ${targetDayOfMonth} = ${installmentDate.toISOString().split('T')[0]}`);

        } else if (installmentType === 'weekly') {
          // Weekly
          let first = getNextDayOnOrAfter(loanSaleDateObj, collectionDay);
          if (first <= loanSaleDateObj) first.setUTCDate(first.getUTCDate() + 7);
          installmentDate = new Date(first);
          installmentDate.setUTCDate(first.getUTCDate() + (i * 7));
          console.log(`   📅 (Weekly Aligned) #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);
        } else {
          installmentDate = new Date(loanSaleDateObj);
          installmentDate.setUTCDate(loanSaleDateObj.getUTCDate() + (i + 1));
          console.log(`   📅 (Daily Aligned) #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);
        }
      } else {
        // 🎯 TARGET: collectionDay is 'Daily' OR no collectionDay provided
        installmentDate = new Date(loanSaleDateObj);

        // ✅ CRITICAL FIX: If collectionDay is 'Daily', ALWAYS use daily logic + SKIP FRIDAYS
        if (collectionDay === 'Daily' || installmentType === 'daily') {
          // Increment lastDailyDate until we find a non-Friday
          lastDailyDate.setUTCDate(lastDailyDate.getUTCDate() + 1);
          while (lastDailyDate.getUTCDay() === 5) { // 5 = Friday
            console.log(`   ⏭️ Skipping Friday: ${lastDailyDate.toISOString().split('T')[0]}`);
            lastDailyDate.setUTCDate(lastDailyDate.getUTCDate() + 1);
          }

          installmentDate = new Date(lastDailyDate);

          if (collectionDay === 'Daily') {
            console.log(`   📅 (Daily Kisti-NoFriday) #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);
          } else {
            console.log(`   📅 (Daily Type) #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);
          }
        } else if (installmentType === 'monthly') {
          installmentDate.setUTCMonth(loanSaleDateObj.getUTCMonth() + (i + 1));
          // Handle month end overflow
          const expectedMonth = (loanSaleDateObj.getUTCMonth() + i + 1) % 12;
          if (installmentDate.getUTCMonth() !== expectedMonth) {
            installmentDate = new Date(Date.UTC(installmentDate.getUTCFullYear(), expectedMonth + 1, 0));
          }
          console.log(`   📅 (Monthly Fallback) #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);
        } else {
          // Default to weekly
          installmentDate.setUTCDate(loanSaleDateObj.getUTCDate() + ((i + 1) * 7));
          console.log(`   📅 (Weekly Fallback) #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);
        }
      }

      /* OLD LOGIC REMOVED */
      if (false) {
        if (installmentType === 'monthly') {
          // Add (i+1) months to base date
          installmentDate = new Date(baseDate);
          installmentDate.setMonth(baseDate.getMonth() + (i + 1));

          // Handle month end overflow (e.g. Jan 31 -> Feb 28)
          const expectedMonth = (baseDate.getMonth() + (i + 1)) % 12;
          if (installmentDate.getMonth() !== expectedMonth) {
            installmentDate = new Date(installmentDate.getFullYear(), expectedMonth + 1, 0);
          }
          console.log(`   📅 (Monthly) Installment #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);

        } else if (installmentType === 'daily') {
          // Add (i+1) days to base date
          installmentDate = new Date(baseDate);
          installmentDate.setDate(baseDate.getDate() + (i + 1));
          console.log(`   📅 (Daily) Installment #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);

        } else {
          // Default to WEEKLY: Add (i+1) weeks
          installmentDate = new Date(baseDate);
          installmentDate.setDate(baseDate.getDate() + ((i + 1) * 7));
          console.log(`   📅 (Weekly) Installment #${i + 1}: ${installmentDate.toISOString().split('T')[0]}`);
        }
        // (Simplified logic complete)
      }

      // 🔹 Use provided collectorId if available, otherwise use logged-in user
      const effectiveCollectorId = collectorId || req.user.id;

      if (collectorId && collectorId !== req.user.id) {
        console.log(`✅ Using selected collector: ${collectorId} (logged-in user: ${req.user.id})`);
      } else {
        console.log(`ℹ️ Using logged-in user as collector: ${req.user.id}`);
      }

      const installmentData = {
        member: memberId,
        collector: effectiveCollectorId,  // 🔹 Use effective collector ID
        amount: parseFloat(installmentAmount),
        installmentType: 'regular', // Mark as regular loan installment
        collectionDay: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][installmentDate.getUTCDay()], // 🎯 FIX: Use getUTCDay() for Bangladesh time
        paymentMethod: 'cash',
        weekNumber: Math.ceil(installmentDate.getUTCDate() / 7), // 🎯 FIX: Use getUTCDate()
        monthYear: `${installmentDate.getUTCFullYear()}-${String(installmentDate.getUTCMonth() + 1).padStart(2, '0')}`, // 🎯 FIX: Use UTC methods
        note: `Product Loan: ${productNames} - Installment ${i + 1}/${installmentCount} (${installmentType})`,
        receiptNumber: `PL-${Date.now()}-${i + 1}`,
        branchCode: branchCode || member.branchCode,
        branch: branchName || member.branch,
        dueDate: installmentDate, // Set the due date for this installment
        status: 'pending', // Mark as pending (not yet collected)
        createdBy: req.user.id,
        // Distribution grouping fields
        distributionId: distributionId,
        serialNumber: i + 1,
        totalInDistribution: installmentCount,
        // Product sale date tracking
        saleDate: today, // 📅 Store the actual sale date (from form or today)
        installmentFrequency: installmentType // 🎯 NEW: Track frequency (monthly/weekly/daily)
      };

      console.log(`✅ Installment #${i + 1} Due Date: ${installmentDate.toISOString().split('T')[0]}`);

      const installment = await Installment.create(installmentData);
      createdInstallments.push(installment);
    }

    console.log(`✅ Created ${createdInstallments.length} product loan installments for ${member.name}`);

    res.status(201).json({
      success: true,
      message: `${createdInstallments.length} loan installments created successfully`,
      data: {
        installments: createdInstallments,
        member: {
          _id: member._id,
          name: member.name
        },
        summary: {
          totalInstallments: createdInstallments.length,
          totalAmount: totalAmount,
          installmentAmount: installmentAmount,
          installmentType: installmentType
        }
      }
    });

  } catch (error) {
    console.error('Create product loan installments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating product loan installments',
      error: error.message
    });
  }
});

// @desc    Create product sale with installments
// @route   POST /api/installments/product-sale
// @access  Private
router.post('/product-sale', protect, async (req, res) => {
  try {
    const {
      memberId,
      memberName,
      branchCode,
      branchName,
      products,
      customProductName,
      totalAmount,
      paymentType,
      installmentType,
      installmentCount,
      installmentAmount,
      savingsCollection,
      deliveryDate,
      notes
    } = req.body;

    console.log('Product sale request:', req.body);

    // Validate required fields
    if (!memberId || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Member ID and total amount are required'
      });
    }

    // Check if we have either products or custom product name
    if ((!products || products.length === 0) && !customProductName) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one product or enter a custom product name'
      });
    }

    // Find the member
    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // ✅ CRITICAL FIX: Check for duplicate ACTIVE product sales (not completed ones)
    if (products && products.length > 0) {
      const productNames = products.map(p => p.productName).join(', ');
      console.log('🔍 Checking for active duplicate product sales for:', productNames);

      // Get ALL product loan installments for this member
      const allLoanInstallments = await Installment.find({
        member: memberId,
        installmentType: 'regular',
        note: { $regex: 'Product Loan', $options: 'i' },
        isActive: true
      });

      console.log(`📊 Found ${allLoanInstallments.length} total loan installments`);

      // Group by distributionId and check if product is still active (has outstanding dues)
      const activeProductSales = {};

      allLoanInstallments.forEach(inst => {
        if (!inst.distributionId) return;

        if (!activeProductSales[inst.distributionId]) {
          activeProductSales[inst.distributionId] = {
            distributionId: inst.distributionId,
            totalAmount: 0,
            paidAmount: 0,
            productNames: new Set()
          };
        }

        // Extract product name from note
        const noteMatch = inst.note ? inst.note.match(/Product Loan: (.+?) -/) : null;
        if (noteMatch && noteMatch[1]) {
          activeProductSales[inst.distributionId].productNames.add(noteMatch[1].trim());
        }

        activeProductSales[inst.distributionId].totalAmount += inst.amount;
        activeProductSales[inst.distributionId].paidAmount += (inst.paidAmount || 0);
      });

      // Check if any of the products being sold are in ACTIVE sales (with outstanding dues)
      let hasDuplicateActiveProduct = false;
      let duplicateProductName = '';

      for (const [distId, saleData] of Object.entries(activeProductSales)) {
        const outstandingDue = saleData.totalAmount - saleData.paidAmount;

        // Only consider it duplicate if there's outstanding due
        if (outstandingDue > 0) {
          const saleProductNames = Array.from(saleData.productNames);

          // Check if any of the new products match active sale products
          for (const newProduct of products) {
            if (saleProductNames.some(existing => existing.toLowerCase().includes(newProduct.productName.toLowerCase()))) {
              hasDuplicateActiveProduct = true;
              duplicateProductName = newProduct.productName;
              console.log(`⚠️ Found active sale of "${duplicateProductName}" with outstanding due: ৳${outstandingDue}`);
              break;
            }
          }
        } else {
          console.log(`✅ Product sale ${distId} is completed (no outstanding due), allowing re-sale`);
        }

        if (hasDuplicateActiveProduct) break;
      }

      if (hasDuplicateActiveProduct) {
        console.log(`⚠️ Cannot sell "${duplicateProductName}" - member has active sale with outstanding due.`);
        return res.status(409).json({
          success: false,
          message: `এই সদস্যের "${duplicateProductName}" এর বিক্রয় এখনও সক্রিয় আছে। আগের কিস্তি সম্পূর্ণ পরিশোধ না করে নতুন বিক্রয় করা যাবে না।`,
          messageEn: `Member has an active sale of "${duplicateProductName}" with outstanding dues. Previous installments must be fully paid before selling this product again.`,
          error: 'DUPLICATE_ACTIVE_SALE'
        });
      }

      console.log('✅ No active duplicate products found. Proceeding with sale.');
    }

    // Determine product name for display
    let displayProductName = '';
    if (products && products.length > 0) {
      displayProductName = products.map(p => p.productName).join(', ');
    } else if (customProductName) {
      displayProductName = customProductName;
    }

    // Get current date info for required fields
    const currentDate = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[currentDate.getDay()];
    const weekNumber = Math.ceil(currentDate.getDate() / 7);
    const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    // Generate unique receipt number and sale transaction ID for product sale
    const timestamp = Date.now();
    const receiptNumber = `PS-${timestamp}`;
    const saleTransactionId = `SALE-${timestamp}`; // Unique ID to group products from same sale

    // Create detailed note for product sale
    let productNote = '';
    if (products && products.length > 0) {
      const productDetails = products.map(p => `${p.productName} (Qty: ${p.quantity}, ৳${p.subtotal})`).join(', ');
      productNote = `Product Sale: ${productDetails}`;
    } else if (customProductName) {
      productNote = `Product Sale: ${customProductName}`;
    }

    if (paymentType === 'installment') {
      productNote += ` | Payment: ${installmentType} (${installmentCount} installments of ৳${installmentAmount} each)`;
    } else {
      productNote += ` | Payment: Cash`;
    }

    if (notes) {
      productNote += ` | Notes: ${notes}`;
    }

    // Create separate installment records for each product
    const createdRecords = [];

    if (products && products.length > 0) {
      // Create separate record for each product
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const productReceiptNumber = `PS-${timestamp}-${i + 1}`;

        const productNote = `Product Sale: ${product.productName} (Qty: ${product.quantity}, ৳${product.subtotal})`;
        const fullNote = paymentType === 'installment'
          ? `${productNote} | Payment: ${installmentType} (${installmentCount} installments of ৳${installmentAmount} each) | SaleID: ${saleTransactionId}`
          : `${productNote} | Payment: Cash | SaleID: ${saleTransactionId}`;

        const installmentData = {
          // Required fields from Installment model
          member: memberId,
          collector: req.user.id,
          amount: parseFloat(product.subtotal),
          installmentType: 'extra', // Use 'extra' for product sales
          paymentMethod: paymentType === 'cash' ? 'cash' : 'cash',
          collectionDate: currentDate,
          collectionDay: currentDay,
          weekNumber: weekNumber,
          monthYear: monthYear,
          branch: branchName || member.branch,
          branchCode: branchCode || member.branchCode,
          receiptNumber: productReceiptNumber,
          note: fullNote, // Detailed product sale note
          status: 'collected', // Mark as collected
          createdBy: req.user.id,
          distributionId: saleTransactionId, // ✅ Link this product sale to the transaction
          saleDate: deliveryDate ? new Date(deliveryDate) : currentDate // ✅ Save the selected sale/delivery date
        };

        const installment = await Installment.create(installmentData);
        createdRecords.push(installment);

        // ✅ NEW: Create CollectionHistory record for product cash sale
        try {
          await CollectionHistory.create({
            installment: installment._id,
            member: memberId,
            collector: req.user.id,
            collectionAmount: parseFloat(product.subtotal),
            collectionDate: currentDate,
            receiptNumber: productReceiptNumber,
            paymentMethod: 'cash',
            outstandingAfterCollection: 0,
            installmentTarget: parseFloat(product.subtotal),
            installmentDue: 0,
            distributionId: saleTransactionId,
            branch: member.branch,
            branchCode: member.branchCode,
            collectionDay: currentDay,
            weekNumber: weekNumber,
            monthYear: monthYear,
            note: fullNote,
            createdBy: req.user.id
          });
        } catch (historyError) {
          console.error('❌ Error creating CollectionHistory for product sale:', historyError);
        }

        // Update product stock for this specific product
        try {
          const productDoc = await Product.findById(product.productId);
          if (productDoc) {
            console.log(`📦 Updating stock for ${productDoc.name}: Available: ${productDoc.availableStock}, Selling: ${product.quantity}`);

            // Update stock quantities
            const oldAvailable = productDoc.availableStock || 0;
            const oldDistributed = productDoc.distributedStock || 0;

            productDoc.availableStock = Math.max(0, oldAvailable - product.quantity);
            productDoc.distributedStock = oldDistributed + product.quantity;

            await productDoc.save();

            console.log(`✅ Updated ${productDoc.name} stock: Available: ${oldAvailable} → ${productDoc.availableStock}, Distributed: ${oldDistributed} → ${productDoc.distributedStock}`);
          } else {
            console.log(`❌ Product not found: ${product.productId}`);
          }
        } catch (stockError) {
          console.error('❌ Error updating product stock:', stockError);
          // Don't fail the sale if stock update fails
        }
      }
    } else if (customProductName) {
      // Create single record for custom product
      const customReceiptNumber = `PS-${timestamp}-1`;
      const customNote = `Product Sale: ${customProductName}`;
      const fullNote = paymentType === 'installment'
        ? `${customNote} | Payment: ${installmentType} (${installmentCount} installments of ৳${installmentAmount} each) | SaleID: ${saleTransactionId}`
        : `${customNote} | Payment: Cash | SaleID: ${saleTransactionId}`;

      const installmentData = {
        member: memberId,
        collector: req.user.id,
        amount: parseFloat(totalAmount),
        installmentType: 'extra',
        paymentMethod: paymentType === 'cash' ? 'cash' : 'cash',
        collectionDate: currentDate,
        collectionDay: currentDay,
        weekNumber: weekNumber,
        monthYear: monthYear,
        branch: branchName || member.branch,
        branchCode: branchCode || member.branchCode,
        receiptNumber: customReceiptNumber,
        note: fullNote,
        status: 'collected',
        createdBy: req.user.id,
        distributionId: saleTransactionId, // ✅ Link this custom product sale to the transaction
        saleDate: deliveryDate ? new Date(deliveryDate) : currentDate // ✅ Save the selected sale/delivery date
      };

      const installment = await Installment.create(installmentData);
      createdRecords.push(installment);

      // ✅ NEW: Create CollectionHistory record for custom product cash sale
      try {
        await CollectionHistory.create({
          installment: installment._id,
          member: memberId,
          collector: req.user.id,
          collectionAmount: parseFloat(totalAmount),
          collectionDate: currentDate,
          receiptNumber: customReceiptNumber,
          paymentMethod: 'cash',
          outstandingAfterCollection: 0,
          installmentTarget: parseFloat(totalAmount),
          installmentDue: 0,
          distributionId: saleTransactionId,
          branch: member.branch,
          branchCode: member.branchCode,
          collectionDay: currentDay,
          weekNumber: weekNumber,
          monthYear: monthYear,
          note: fullNote,
          createdBy: req.user.id
        });
      } catch (historyError) {
        console.error('❌ Error creating CollectionHistory for custom product sale:', historyError);
      }
    }

    // ✅ NEW: Create savings collection record if savings were collected during product sale
    if (savingsCollection && savingsCollection > 0) {
      console.log(`💰 Creating savings collection record: ৳${savingsCollection}`);

      // Use member's assigned collector, fallback to current user
      const savingsCollector = member.assignedCollector || member.collector || req.user.id;
      console.log(`👤 Savings collector: ${savingsCollector} (member's assigned collector)`);

      const savingsReceiptNumber = `SAV-${timestamp}`;
      const savingsNote = `Savings Collection - ৳${savingsCollection} - Product Sale: ${products && products.length > 0 ? products.map(p => p.productName).join(', ') : customProductName}`;

      const savingsInstallmentData = {
        member: memberId,
        collector: savingsCollector, // ✅ Use member's assigned collector
        amount: parseFloat(savingsCollection),
        installmentType: 'extra',
        paymentMethod: 'cash',
        collectionDate: currentDate,
        collectionDay: currentDay,
        weekNumber: weekNumber,
        monthYear: monthYear,
        branch: branchName || member.branch,
        branchCode: branchCode || member.branchCode,
        receiptNumber: savingsReceiptNumber,
        note: savingsNote,
        status: 'collected',
        createdBy: req.user.id,
        distributionId: saleTransactionId // ✅ Link savings to the same product sale transaction
      };

      const savingsInstallment = await Installment.create(savingsInstallmentData);
      createdRecords.push(savingsInstallment);

      // ✅ NEW: Create CollectionHistory record for savings collected during sale
      try {
        await CollectionHistory.create({
          installment: savingsInstallment._id,
          member: memberId,
          collector: savingsCollector,
          collectionAmount: parseFloat(savingsCollection),
          collectionDate: currentDate,
          receiptNumber: savingsReceiptNumber,
          paymentMethod: 'cash',
          outstandingAfterCollection: 0,
          installmentTarget: parseFloat(savingsCollection),
          installmentDue: 0,
          distributionId: saleTransactionId,
          branch: member.branch,
          branchCode: member.branchCode,
          collectionDay: currentDay,
          weekNumber: weekNumber,
          monthYear: monthYear,
          note: savingsNote,
          createdBy: req.user.id
        });
      } catch (historyError) {
        console.error('❌ Error creating CollectionHistory for sale-time savings:', historyError);
      }

      // Update member's total savings
      member.totalSavings = (member.totalSavings || 0) + parseFloat(savingsCollection);
      console.log(`💰 Updated ${member.name} total savings: ${member.totalSavings}`);
    }

    // Update member's payment information
    member.totalPaid = (member.totalPaid || 0) + parseFloat(totalAmount);
    member.lastPaymentDate = new Date();
    member.updatedBy = req.user.id;
    await member.save();

    console.log(`✅ Product sale created: ${createdRecords.length} records for ${member.name} - Total Amount: ৳${totalAmount}${savingsCollection ? ` + Savings: ৳${savingsCollection}` : ''}`);

    res.status(201).json({
      success: true,
      message: 'Product sale created successfully',
      data: {
        saleTransactionId: saleTransactionId, // ✅ NEW: Return saleTransactionId for frontend
        records: createdRecords,
        totalRecords: createdRecords.length,
        totalAmount: totalAmount,
        savingsCollected: savingsCollection || 0
      }
    });

  } catch (error) {
    console.error('Product sale creation error:', error);
    console.error('Error details:', error.stack);
    console.error('Request body:', req.body);

    // Handle specific MongoDB validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating product sale',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Validation middleware for installment collection
const validateInstallmentCollection = [
  body('memberId')
    .isMongoId()
    .withMessage('Valid member ID is required'),

  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),

  body('installmentType')
    .isIn(['regular', 'extra', 'advance', 'penalty', 'savings'])
    .withMessage('Invalid installment type'),

  body('collectionDay')
    .isIn(['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    .withMessage('Invalid collection day'),

  body('paymentMethod')
    .optional()
    .isIn(['cash', 'mobile_banking', 'bank_transfer', 'savings_withdrawal'])
    .withMessage('Invalid payment method'),

  body('note')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Note cannot be more than 500 characters'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

// @desc    Get collection schedule by day
// @route   GET /api/installments/schedule/:day
// @access  Private
router.get('/schedule/:day', protect, async (req, res) => {
  try {
    const { day } = req.params;

    // Validate day
    const validDays = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid day. Must be one of: ' + validDays.join(', ')
      });
    }

    // Get collectors for the specified day
    const collectors = await CollectionSchedule.findCollectorsByDay(day);

    res.status(200).json({
      success: true,
      data: collectors
    });

  } catch (error) {
    console.error('Get collection schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collection schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get collector's schedule for specific day
// @route   GET /api/installments/collector/:collectorId/day/:day
// @access  Private
router.get('/collector/:collectorId/day/:day', protect, async (req, res) => {
  try {
    const { collectorId, day } = req.params;

    // Role-based access control
    if (req.user.role === 'collector' && req.user.id !== collectorId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own schedule.'
      });
    }

    const schedule = await CollectionSchedule.findByCollectorAndDay(collectorId, day);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'No collection schedule found for this collector and day'
      });
    }

    res.status(200).json({
      success: true,
      data: schedule
    });

  } catch (error) {
    console.error('Get collector schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collector schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Collect installment
// @route   POST /api/installments/collect
// @access  Private
router.post('/collect', protect, validateInstallmentCollection, async (req, res) => {
  try {
    const {
      memberId,
      amount,
      installmentType,
      collectionDay,
      paymentMethod,
      note,
      location,
      receiptNumber,
      weekNumber,
      monthYear,
      dueDate,
      installmentId,  // Add installmentId to directly identify which installment to collect
      distributionId, // Add distributionId for grouping
      serialNumber,   // Add serialNumber for proper matching
      collectorId     // 🔹 Add collectorId from frontend (selected collector)
    } = req.body;

    // 🔹 Use provided collectorId if available, otherwise use logged-in user
    const effectiveCollectorId = collectorId || req.user.id;

    if (collectorId && collectorId !== req.user.id) {
      console.log(`✅ Using selected collector: ${collectorId} (logged-in user: ${req.user.id})`);
    } else {
      console.log(`ℹ️ Using logged-in user as collector: ${req.user.id}`);
    }

    // Get member details
    const member = await Member.findById(memberId);
    if (!member || !member.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Role-based access control for collectors
    if (req.user.role === 'collector' &&
      member.assignedCollector &&
      member.assignedCollector.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only collect from members assigned to you.'
      });
    }

    // ✅ CRITICAL FIX: Check for duplicate collections before creating new record
    console.log('🔍 Checking for duplicate collections...');
    const duplicateCheckParams = {
      member: memberId,
      amount: amount,
      installmentType: installmentType,
      status: 'collected',
      isActive: true
    };

    // For product loan collections, also check the note pattern
    if (installmentType === 'regular' && note && note.includes('Product Loan')) {
      // Check for exact same installment already collected today
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      // ✅ FIX: Build a more specific duplicate check query
      const duplicateQuery = {
        ...duplicateCheckParams,
        collectionDate: { $gte: startOfDay, $lte: endOfDay },
        note: { $regex: note.split(' - ')[0], $options: 'i' } // Match product name part
      };

      // ✅ FIX: If we have installmentId or serialNumber, use them for more accurate check
      if (installmentId) {
        duplicateQuery._id = installmentId;
        console.log(`🔍 Duplicate check using installmentId: ${installmentId}`);
      } else if (distributionId && serialNumber) {
        duplicateQuery.distributionId = distributionId;
        duplicateQuery.serialNumber = serialNumber;
        console.log(`🔍 Duplicate check using distributionId: ${distributionId}, serialNumber: ${serialNumber}`);
      }

      const existingCollection = await Installment.findOne(duplicateQuery);

      if (existingCollection && existingCollection.status === 'collected') {
        console.log('⚠️ Duplicate collection detected for same product installment today');
        console.log(`   Existing: ${existingCollection._id}, Status: ${existingCollection.status}`);
        return res.status(409).json({
          success: false,
          message: 'This installment has already been collected today.',
          error: 'DUPLICATE_COLLECTION',
          existingRecord: existingCollection._id
        });
      }
    }

    // ✅ UPDATE: If this is a pending installment being collected, update the existing one instead of creating new
    if (installmentType === 'regular' && note && note.includes('Product Loan')) {
      // Find the corresponding pending installment using installmentId OR distributionId + serialNumber
      let pendingInstallment = null;

      if (installmentId) {
        // Direct lookup by installmentId (most accurate)
        console.log(`🔍 Looking for installment by ID: ${installmentId}`);
        pendingInstallment = await Installment.findOne({
          _id: installmentId,
          member: memberId,
          status: { $in: ['pending', 'partial'] }, // ✅ FIX: Also find partial installments
          isActive: true
        });
      } else if (distributionId && serialNumber) {
        // Lookup by distributionId + serialNumber (second best)
        console.log(`🔍 Looking for installment by distributionId: ${distributionId}, serialNumber: ${serialNumber}`);
        pendingInstallment = await Installment.findOne({
          member: memberId,
          distributionId: distributionId,
          serialNumber: serialNumber,
          status: { $in: ['pending', 'partial'] }, // ✅ FIX: Also find partial installments
          isActive: true
        });
      } else {
        // Fallback: Find by amount and note (least accurate, can cause cross-distribution issues)
        console.log(`⚠️ Using fallback method - looking by amount and note`);
        pendingInstallment = await Installment.findOne({
          member: memberId,
          amount: amount,
          installmentType: 'regular',
          status: { $in: ['pending', 'partial'] }, // ✅ FIX: Also find partial installments
          note: { $regex: note.split(' - ')[0], $options: 'i' },
          isActive: true
        }).sort({ dueDate: 1 }); // Get the earliest pending one
      }

      if (pendingInstallment) {
        console.log('✅ Found matching pending installment. Updating instead of creating new.');
        console.log(`   Original amount: ৳${pendingInstallment.amount}, Collecting: ৳${amount}`);
        console.log(`   Current paidAmount: ৳${pendingInstallment.paidAmount || 0}`);

        // ✅ UPDATE: Track partial payments and handle overpayment
        const currentPaidAmount = pendingInstallment.paidAmount || 0;
        const paymentAmount = parseFloat(amount);
        const currentRemaining = Math.max(0, pendingInstallment.amount - currentPaidAmount);

        // 🎯 NEW LOGIC: Only record the portion that applies to THIS installment initially
        const primaryAppliedAmount = Math.min(paymentAmount, currentRemaining);
        let overpayment = paymentAmount - primaryAppliedAmount;

        let newPaidAmount = currentPaidAmount + primaryAppliedAmount;
        let remainingAmount = Math.max(0, pendingInstallment.amount - newPaidAmount);

        pendingInstallment.paidAmount = newPaidAmount;
        pendingInstallment.lastPaymentAmount = paymentAmount; // Keep full transaction amount for display
        pendingInstallment.remainingAmount = remainingAmount;

        // ✅ Calculate outstanding AFTER the FULL collection (including overpayment)
        // Outstanding = Total loan - (Total paid before + Full current payment)
        let outstanding = 0;
        if (pendingInstallment.distributionId) {
          const allInstsForDist = await Installment.find({
            member: memberId,
            distributionId: pendingInstallment.distributionId,
            isActive: true
          });

          const totalLoan = allInstsForDist.reduce((sum, inst) => sum + (inst.amount || 0), 0);

          // Calculate total paid BEFORE this new transaction
          const totalPaidBefore = allInstsForDist.reduce((sum, inst) => {
            if (inst._id.toString() === pendingInstallment._id.toString()) {
              // Use the OLD paid amount for the primary installment
              return sum + (currentPaidAmount || 0);
            }
            if (inst.status === 'collected' || inst.status === 'paid') {
              return sum + (inst.amount || 0);
            } else if (inst.status === 'partial') {
              return sum + (inst.paidAmount || 0);
            }
            return sum;
          }, 0);

          outstanding = Math.max(0, totalLoan - (totalPaidBefore + paymentAmount));
          pendingInstallment.outstandingAtCollection = outstanding;

          console.log(`📊 Outstanding AFTER FULL payment (৳${paymentAmount}): ৳${outstanding} (Total: ৳${totalLoan}, Paid Before: ৳${totalPaidBefore})`);
        }

        // Only mark as 'collected' if fully paid (compare with original amount)
        if (newPaidAmount >= pendingInstallment.amount) {
          pendingInstallment.status = 'collected';
          console.log(`✅ Installment FULLY PAID - marking as collected (paid: ৳${newPaidAmount}, target: ৳${pendingInstallment.amount})`);
        } else {
          pendingInstallment.status = 'partial'; // Keep as partial if not fully paid
          console.log(`⚠️ Installment PARTIALLY PAID - ৳${newPaidAmount} paid, ৳${remainingAmount} remaining`);
        }

        // ✅ CRITICAL FIX: collectionDate should ALWAYS be today (actual collection date), NOT dueDate
        // This ensures daily collection filters show only collections actually made on that day
        pendingInstallment.collectionDate = new Date(); // Always use TODAY as the actual collection date
        pendingInstallment.collector = effectiveCollectorId; // 🔹 Use effective collector ID
        pendingInstallment.paymentMethod = paymentMethod || 'cash';
        pendingInstallment.location = location;
        pendingInstallment.receiptNumber = receiptNumber || pendingInstallment.receiptNumber;
        pendingInstallment.updatedBy = req.user.id;

        // ✅ NEW: Add this payment to payment history
        if (!pendingInstallment.paymentHistory) {
          pendingInstallment.paymentHistory = [];
        }
        pendingInstallment.paymentHistory.push({
          amount: primaryAppliedAmount, // 🎯 Only record what was applied to THIS installment
          date: new Date(),
          collector: effectiveCollectorId,
          receiptNumber: receiptNumber,
          note: `Collection of ৳${paymentAmount} - ${pendingInstallment.status}${overpayment > 0 ? ` (৳${overpayment} carry-forward)` : ''}`
        });
        console.log(`📝 Added payment to history: ৳${primaryAppliedAmount} (Total payments in history: ${pendingInstallment.paymentHistory.length})`);

        // ✅ NEW: Create CollectionHistory record for this specific collection
        // This allows displaying each collection as a separate row in loan history
        try {
          const collectionHistoryData = {
            installment: pendingInstallment._id,
            member: memberId,
            collector: effectiveCollectorId,
            collectionAmount: paymentAmount,
            collectionDate: new Date(),
            receiptNumber: receiptNumber || `CH-${Date.now()}`,
            paymentMethod: paymentMethod || 'cash',
            outstandingAfterCollection: pendingInstallment.outstandingAtCollection || 0,
            installmentTarget: pendingInstallment.amount,
            installmentDue: remainingAmount,
            distributionId: pendingInstallment.distributionId || null,
            branch: pendingInstallment.branch,
            branchCode: pendingInstallment.branchCode,
            collectionDay: pendingInstallment.collectionDay,
            weekNumber: pendingInstallment.weekNumber,
            monthYear: pendingInstallment.monthYear,
            note: pendingInstallment.note,
            createdBy: req.user.id
          };

          const collectionHistory = await CollectionHistory.create(collectionHistoryData);
          console.log(`✅ Created CollectionHistory record: ID=${collectionHistory._id}, Amount=৳${paymentAmount}, Outstanding=৳${pendingInstallment.outstandingAtCollection}`);
        } catch (historyError) {
          console.error('❌ Error creating CollectionHistory:', historyError);
        }

        await pendingInstallment.save();

        // ✅ ENABLED: Apply overpayment to next installments automatically
        if (overpayment > 0 && pendingInstallment.distributionId) {
          console.log(`🔄 Applying overpayment of ৳${overpayment} to next installment(s)...`);

          // Find next pending installments with same distributionId, ordered by serialNumber
          const nextInstallments = await Installment.find({
            member: memberId,
            distributionId: pendingInstallment.distributionId,
            status: { $in: ['pending', 'partial'] },
            serialNumber: { $gt: pendingInstallment.serialNumber },
            isActive: true
          }).sort({ serialNumber: 1, dueDate: 1 });

          console.log(`📋 Found ${nextInstallments.length} future installments to apply overpayment`);

          let remainingOverpayment = overpayment;

          // Apply overpayment to next installments sequentially
          for (const nextInst of nextInstallments) {
            if (remainingOverpayment <= 0) break;

            const nextCurrentPaid = nextInst.paidAmount || 0;
            const nextRemaining = Math.max(0, nextInst.amount - nextCurrentPaid);

            if (nextRemaining > 0) {
              const applyAmount = Math.min(remainingOverpayment, nextRemaining);
              const newNextPaid = nextCurrentPaid + applyAmount;
              const newNextRemaining = Math.max(0, nextInst.amount - newNextPaid);

              nextInst.paidAmount = newNextPaid;
              nextInst.remainingAmount = newNextRemaining;

              if (newNextRemaining <= 0) {
                nextInst.status = 'collected';
                console.log(`  ✅ Installment #${nextInst.serialNumber} FULLY PAID via overpayment`);
              } else {
                nextInst.status = 'partial';
                console.log(`  💰 Applied ৳${applyAmount} to installment #${nextInst.serialNumber} (now ৳${newNextRemaining} remaining)`);
              }

              // ✅ Mark as auto-applied
              nextInst.isAutoApplied = true;
              nextInst.receiptNumber = undefined;
              nextInst.collectionDate = new Date();
              nextInst.updatedBy = req.user.id;

              // ✅ NEW: Add payment to history for auto-applied installments
              if (!nextInst.paymentHistory) {
                nextInst.paymentHistory = [];
              }
              nextInst.paymentHistory.push({
                amount: applyAmount,
                date: new Date(),
                collector: effectiveCollectorId,
                receiptNumber: receiptNumber,
                note: `Auto-applied from overpayment - ${nextInst.status}`
              });

              await nextInst.save();
              remainingOverpayment -= applyAmount;
            }
          }

          if (remainingOverpayment > 0) {
            console.log(`⚠️ Still have ৳${remainingOverpayment} overpayment remaining after applying to all future installments. Adding to primary paidAmount.`);
            // If any overpayment remains (no more installments in this product), add it back to primary paidAmount ONLY
            // We do NOT add it to paymentHistory again because the full paymentAmount is already reflected in the member's totalPaid
            // and recorded once in the primary installment's first history entry or the CollectionHistory.
            pendingInstallment.paidAmount += remainingOverpayment;
            console.log(`💰 FINAL primary paidAmount: ৳${pendingInstallment.paidAmount}`);
          }
        }



        // Update member's payment information
        // ✅ FIX: Use actual payment amount (paymentAmount), not installment amount
        // This ensures overpayments are reflected in member's totalPaid
        member.totalPaid = (member.totalPaid || 0) + paymentAmount;
        member.lastPaymentDate = new Date();
        member.updatedBy = req.user.id;
        await member.save();

        // Populate the updated installment
        await pendingInstallment.populate('member', 'name phone branch branchCode totalSavings totalPaid');
        await pendingInstallment.populate('collector', 'name email');

        console.log('✅ Updated pending installment to collected successfully');

        return res.status(200).json({
          success: true,
          message: 'Installment collected successfully (updated existing pending record)',
          data: {
            installment: pendingInstallment,
            member: {
              _id: member._id,
              name: member.name,
              totalSavings: member.totalSavings || 0,
              totalPaid: member.totalPaid || 0
            },
            wasUpdated: true
          }
        });
      }
    }

    // CRITICAL FIX: Determine collectionDate based on transaction type
    // For SAVINGS: use dueDate (which is set to today's date in frontend)
    // For LOANS: use today's date as actual collection date
    const isSavingsCollection = installmentType === 'extra' && note && note.includes('Savings Collection');
    // ✅ CRITICAL FIX: collectionDate should ALWAYS be the actual collection date (today), NOT the due date
    // This ensures monthly collection reports show collections by when they were collected, not when they were due
    const collectionDate = new Date(); // Always use today's date as the actual collection date

    // Create installment record
    const installmentData = {
      member: memberId,
      collector: effectiveCollectorId, // 🔹 Use effective collector ID
      amount,
      installmentType,
      collectionDay,
      paymentMethod: paymentMethod || 'cash',
      branch: member.branch,
      branchCode: member.branchCode,
      dueDate: dueDate ? new Date(dueDate) : undefined, // Preserve original due date
      collectionDate: collectionDate, // ✅ CRITICAL: Set collection date for proper sheet mapping
      note,
      location,
      receiptNumber,
      weekNumber,
      monthYear,
      createdBy: req.user.id,
      status: 'collected',
      // ✅ CRITICAL: Add distributionId and serialNumber for product-specific matching
      distributionId: distributionId || null,
      serialNumber: serialNumber || null
    };

    console.log(`📝 Creating installment:`);
    console.log(`   - Type: ${installmentType}`);
    console.log(`   - Amount: ৳${amount}`);
    console.log(`   - Is Savings: ${isSavingsCollection}`);
    console.log(`   - DueDate: ${dueDate || 'NOT PROVIDED'}`);
    console.log(`   - CollectionDate: ${collectionDate.toISOString().split('T')[0]}`);
    console.log(`   - Note: ${note?.substring(0, 60)}`);

    const installment = await Installment.create(installmentData);

    console.log(`✅ Installment created successfully:`);
    console.log(`   - ID: ${installment._id}`);
    console.log(`   - DueDate: ${installment.dueDate || 'NOT SET'}`);
    console.log(`   - CollectionDate: ${installment.collectionDate ? installment.collectionDate.toISOString().split('T')[0] : 'NOT SET'}`);

    // Update member's payment information
    member.totalPaid = (member.totalPaid || 0) + amount;
    member.lastPaymentDate = new Date();
    member.updatedBy = req.user.id;

    // ✅ UPDATE member.totalSavings for savings collections and withdrawals
    const isProductLoan = note && note.includes('Product Loan');
    const isSavingsWithdrawal = paymentMethod === 'savings_withdrawal' || (note && note.includes('Savings Withdrawal'));
    // ✅ FIX: Exclude "Product Sale" savings - those are already added in product-sale route
    const isSavingsDeposit = installmentType === 'extra' && note && note.includes('Savings Collection') && !note.includes('Product Sale');

    if (isSavingsWithdrawal) {
      // ✅ FIX: Prevent negative savings
      const currentSavings = member.totalSavings || 0;
      const withdrawalAmount = parseFloat(amount);

      if (currentSavings < withdrawalAmount) {
        console.log(`❌ Withdrawal failed: Insufficient savings (${member.name}). Current: ৳${currentSavings}, Request: ৳${withdrawalAmount}`);
        return res.status(400).json({
          success: false,
          message: `সদস্যের সঞ্চয় যথেষ্ট নয়। বর্তমান সঞ্চয়: ৳${currentSavings}, উত্তোলনের চেষ্টা: ৳${withdrawalAmount}`
        });
      }

      // Deduct from totalSavings for withdrawals
      member.totalSavings = currentSavings - withdrawalAmount;
      console.log(`📤 Savings withdrawal recorded: ${member.name} - Amount: ৳${withdrawalAmount} - New Total: ৳${member.totalSavings}`);
    } else if (isSavingsDeposit) {
      // Add to totalSavings for collections
      member.totalSavings = (member.totalSavings || 0) + parseFloat(amount);
      console.log(`💰 Savings collection recorded: ${member.name} - Amount: ৳${amount} - New Total: ৳${member.totalSavings}`);
    } else if (isProductLoan) {
      console.log(`📦 Product loan payment recorded: ${member.name}, Amount: ৳${amount}`);
    } else {
      console.log(`📝 Installment recorded: ${installmentType}, Amount: ৳${amount}`);
    }

    await member.save();
    console.log(`✅ Member updated: ${member.name} - totalPaid: ${member.totalPaid}, totalSavings: ${member.totalSavings || 0}`);

    // Check if this is a product sale and update product stock
    if (installmentType === 'extra' && note && note.includes('Product Sale:')) {
      try {
        console.log('🔍 Detected product sale, processing note:', note);

        // Extract product name from note
        const productMatch = note.match(/Product Sale: ([^|]+)/);
        if (productMatch) {
          const productName = productMatch[1].trim();
          console.log('🏷️ Extracted product name:', productName);

          // Extract quantity from note
          const quantityMatch = note.match(/Qty: (\d+(?:\.\d+)?)\s*(\w+)/);
          if (quantityMatch) {
            const quantity = parseFloat(quantityMatch[1]);
            const unit = quantityMatch[2];
            console.log('📊 Extracted quantity:', quantity, unit);

            // Find and update product
            const product = await Product.findOne({ name: productName });
            if (product) {
              console.log('📦 Found product:', product.name, 'Current stock:', product.availableStock, 'Distributed:', product.distributedStock);

              // Update distributed stock
              const oldDistributed = product.distributedStock || 0;
              const oldAvailable = product.availableStock;

              product.distributedStock = oldDistributed + quantity;
              product.availableStock = Math.max(0, oldAvailable - quantity);

              await product.save();

              console.log(`✅ Updated product stock: ${productName}`);
              console.log(`   - Available: ${oldAvailable} → ${product.availableStock}`);
              console.log(`   - Distributed: ${oldDistributed} → ${product.distributedStock}`);
              console.log(`   - Sold: ${quantity} ${unit}`);
            } else {
              console.log('❌ Product not found:', productName);
            }
          } else {
            console.log('❌ Could not extract quantity from note:', note);
          }
        } else {
          console.log('❌ Could not extract product name from note:', note);
        }
      } catch (error) {
        console.error('❌ Error updating product stock:', error);
        // Don't fail the installment if product update fails
      }
    }

    // ✅ NEW: Create CollectionHistory record for this collection
    try {
      const collectionHistoryData = {
        installment: installment._id,
        member: memberId,
        collector: effectiveCollectorId,
        collectionAmount: parseFloat(amount),
        collectionDate: new Date(),
        receiptNumber: receiptNumber || `CH-${Date.now()}`,
        paymentMethod: paymentMethod || 'cash',
        outstandingAfterCollection: 0, // Fallback for non-loan collections
        installmentTarget: parseFloat(amount),
        installmentDue: 0,
        distributionId: distributionId || null,
        branch: member.branch,
        branchCode: member.branchCode,
        collectionDay: collectionDay,
        weekNumber: weekNumber,
        monthYear: monthYear,
        note: note,
        createdBy: req.user.id
      };

      await CollectionHistory.create(collectionHistoryData);
      console.log(`✅ Created CollectionHistory record for ${installmentType}: Amount=৳${amount}`);
    } catch (historyError) {
      console.error('❌ Error creating CollectionHistory:', historyError);
    }

    // Populate the created installment
    await installment.populate('member', 'name phone branch branchCode totalSavings totalPaid');
    await installment.populate('collector', 'name email');

    res.status(201).json({
      success: true,
      message: 'Installment collected successfully',
      data: {
        installment,
        member: {
          _id: member._id,
          name: member.name,
          totalSavings: member.totalSavings || 0,
          totalPaid: member.totalPaid || 0
        }
      }
    });

  } catch (error) {
    console.error('Collect installment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while collecting installment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get daily collection summary
// @route   GET /api/installments/daily-summary
// @access  Private
router.get('/daily-summary', protect, async (req, res) => {
  try {
    const { date, collectorId } = req.query;

    // Default to today if no date provided
    const targetDate = date ? new Date(date) : new Date();

    // Role-based filtering
    let filterCollectorId = null;
    if (req.user.role === 'collector') {
      filterCollectorId = req.user.id;
    } else if (collectorId) {
      filterCollectorId = collectorId;
    }

    const summary = await Installment.getDailyCollectionSummary(targetDate, filterCollectorId);

    // Calculate totals
    const totals = summary.reduce((acc, collector) => {
      acc.totalAmount += collector.totalAmount;
      acc.totalInstallments += collector.totalInstallments;
      acc.totalCollectors += 1;
      return acc;
    }, { totalAmount: 0, totalInstallments: 0, totalCollectors: 0 });

    res.status(200).json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        summary,
        totals
      }
    });

  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching daily summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get all installments for a member
// @route   GET /api/installments/member/:memberId
// @access  Private
router.get('/member/:memberId', protect, async (req, res) => {
  try {
    const { memberId } = req.params;

    // Verify member exists
    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Get all installments for this member
    const installments = await Installment.find({ member: memberId })
      .populate('member', 'name phone')
      .populate('collector', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: installments,
      count: installments.length
    });

  } catch (error) {
    console.error('Get member installments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching member installments',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get installment history for a member
// @route   GET /api/installments/member/:memberId/history
// @access  Private
router.get('/member/:memberId/history', protect, async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit = 10 } = req.query;

    // Check if member exists
    const member = await Member.findById(memberId);
    if (!member || !member.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Role-based access control
    if (req.user.role === 'collector' &&
      member.assignedCollector &&
      member.assignedCollector.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view history of members assigned to you.'
      });
    }

    const history = await Installment.getMemberHistory(memberId, parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        member: {
          id: member._id,
          name: member.name,
          phone: member.phone,
          branch: member.branch,
          monthlyInstallment: member.monthlyInstallment,
          totalPaid: member.totalPaid
        },
        history
      }
    });

  } catch (error) {
    console.error('Get member history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching member history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get collection history for a member  
// @route   GET /api/installments/member/:memberId/collection-history
// @access  Private
router.get('/member/:memberId/collection-history', protect, async (req, res) => {
  try {
    const { memberId } = req.params;

    // Check if member exists
    const member = await Member.findById(memberId);
    if (!member || !member.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Get all collection history for this member
    const collectionHistory = await CollectionHistory.getByMember(memberId);

    console.log(`📋 Found ${collectionHistory.length} collection history records for member ${member.name}`);

    res.status(200).json({
      success: true,
      data: collectionHistory,
      count: collectionHistory.length
    });

  } catch (error) {
    console.error('Get collection history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collection history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get all installments with filters
// @route   GET /api/installments
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      dueDateBefore,
      collectorId,
      memberId,
      branchCode,
      installmentType,
      status,
      sortBy = 'collectionDate',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { isActive: true };

    // Date range filter (for collectionDate)
    if (startDate || endDate) {
      filter.collectionDate = {};
      if (startDate) filter.collectionDate.$gte = new Date(startDate);
      if (endDate) filter.collectionDate.$lte = new Date(endDate);
    }

    // ✅ Due date filter - filter by dueDate (matches collectorDashboard logic)
    if (dueDateBefore) {
      const dueDateEnd = new Date(dueDateBefore);
      dueDateEnd.setHours(23, 59, 59, 999);
      filter.dueDate = { $lte: dueDateEnd };
    }

    if (collectorId) filter.collector = collectorId;
    if (memberId) filter.member = memberId;
    if (branchCode) filter.branchCode = branchCode;
    if (installmentType) filter.installmentType = installmentType;
    if (status) filter.status = status;

    // Role-based filtering
    if (req.user.role === 'collector') {
      filter.collector = req.user.id;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Execute query
    const installments = await Installment.find(filter)
      .populate('member', 'name phone branch branchCode isActive')
      .populate('collector', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // ✅ Filter out installments for inactive/deleted members
    const activeInstallments = installments.filter(inst =>
      inst.member && inst.member.isActive !== false
    );

    // Get total count for pagination (adjust for filtered results)
    const total = activeInstallments.length;

    // ✅ Set cache-control headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      success: true,
      data: activeInstallments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get installments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching installments',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get single installment
// @route   GET /api/installments/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const installment = await Installment.findById(req.params.id)
      .populate('member', 'name phone branch branchCode monthlyInstallment')
      .populate('collector', 'name email phone')
      .populate('createdBy', 'name email');

    if (!installment || !installment.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Installment not found'
      });
    }

    // Role-based access control
    if (req.user.role === 'collector' &&
      installment.collector._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own collections.'
      });
    }

    res.status(200).json({
      success: true,
      data: installment
    });

  } catch (error) {
    console.error('Get installment error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid installment ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching installment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Update installment (for corrections)
// @route   PUT /api/installments/:id
// @access  Private (Admin/Manager only)
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { amount, note, status } = req.body;

    const installment = await Installment.findById(req.params.id);

    if (!installment || !installment.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Installment not found'
      });
    }

    // Update allowed fields only
    const updateData = { updatedBy: req.user.id };
    if (amount !== undefined) updateData.amount = amount;
    if (note !== undefined) updateData.note = note;
    if (status !== undefined) updateData.status = status;

    const updatedInstallment = await Installment.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('member', 'name phone branch branchCode')
      .populate('collector', 'name email');

    res.status(200).json({
      success: true,
      message: 'Installment updated successfully',
      data: updatedInstallment
    });

  } catch (error) {
    console.error('Update installment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating installment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Cancel installment (soft delete)
// @route   DELETE /api/installments/:id
// @access  Private (Admin/Manager only)
router.delete('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const installment = await Installment.findById(req.params.id);

    if (!installment || !installment.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Installment not found'
      });
    }

    // Soft delete
    installment.isActive = false;
    installment.status = 'cancelled';
    installment.updatedBy = req.user.id;
    await installment.save();

    // Update member's total paid amount
    const member = await Member.findById(installment.member);
    if (member) {
      member.totalPaid = Math.max(0, (member.totalPaid || 0) - installment.amount);
      member.updatedBy = req.user.id;
      await member.save();
    }

    res.status(200).json({
      success: true,
      message: 'Installment cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel installment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling installment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Fix duplicate installments (Development only)
// @route   POST /api/installments/fix-duplicates
// @access  Private (Admin only)
router.post('/fix-duplicates', protect, authorize('admin'), async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Duplicate fixing is not allowed in production'
      });
    }

    console.log('🔍 Starting duplicate installments fix...');

    // Find potential duplicate groups
    const duplicateGroups = await Installment.aggregate([
      {
        $match: {
          isActive: true,
          installmentType: 'regular',
          note: { $regex: 'Product Loan', $options: 'i' }
        }
      },
      {
        $group: {
          _id: {
            member: '$member',
            amount: '$amount',
            // Extract product name from note for grouping
            productName: {
              $regexFind: {
                input: '$note',
                regex: 'Product Loan: (.+?) -',
                options: 'i'
              }
            }
          },
          installments: {
            $push: {
              id: '$_id',
              status: '$status',
              createdAt: '$createdAt',
              note: '$note'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`📊 Found ${duplicateGroups.length} potential duplicate groups`);

    let totalFixed = 0;
    const fixedGroups = [];

    for (const group of duplicateGroups) {
      const installments = group.installments;
      const collectedCount = installments.filter(inst => inst.status === 'collected').length;
      const pendingInstallments = installments.filter(inst => inst.status === 'pending');

      console.log(`🔄 Processing group with ${installments.length} installments (${collectedCount} collected, ${pendingInstallments.length} pending)`);

      if (collectedCount > 0 && pendingInstallments.length > 0) {
        // Keep collected ones, remove excess pending
        const excessPending = pendingInstallments.slice(collectedCount);

        if (excessPending.length > 0) {
          console.log(`🗑️ Fixing ${excessPending.length} excess pending installments`);

          for (const excess of excessPending) {
            await Installment.findByIdAndUpdate(excess.id, {
              isActive: false,
              status: 'cancelled',
              updatedAt: new Date(),
              note: excess.note + ' [DUPLICATE FIXED BY API]'
            });
            totalFixed++;
          }

          fixedGroups.push({
            member: group._id.member,
            productName: group._id.productName?.match?.[1] || 'Unknown',
            amount: group._id.amount,
            fixedCount: excessPending.length
          });
        }
      }
    }

    console.log(`✅ Fixed ${totalFixed} duplicate installments`);

    res.status(200).json({
      success: true,
      message: `Fixed ${totalFixed} duplicate installments`,
      data: {
        totalGroupsFound: duplicateGroups.length,
        totalDuplicatesFixed: totalFixed,
        fixedGroups: fixedGroups
      }
    });

  } catch (error) {
    console.error('Fix duplicates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fixing duplicates',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Create test installments for demo (Development only)
// @route   POST /api/installments/create-test-data
// @access  Private (Admin only)
router.post('/create-test-data', protect, authorize('admin'), async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Test data creation is not allowed in production'
      });
    }

    // Get some collectors and members
    const collectors = await require('../models/User').find({ role: 'collector', isActive: true }).limit(5);
    const members = await Member.find({ isActive: true }).limit(20);

    if (collectors.length === 0 || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No collectors or members found. Please create some first.'
      });
    }

    const testInstallments = [];
    const today = new Date();
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Create test installments for today
    for (let i = 0; i < Math.min(10, members.length); i++) {
      const member = members[i];
      const collector = collectors[i % collectors.length];

      const installment = {
        member: member._id,
        collector: collector._id,
        amount: Math.floor(Math.random() * 500) + 100, // Random amount between 100-600
        installmentType: Math.random() > 0.8 ? 'extra' : 'regular',
        paymentMethod: 'cash',
        collectionDate: today,
        collectionDay: days[today.getDay()],
        branch: member.branch,
        branchCode: member.branchCode,
        note: `Test installment for ${member.name}`,
        status: 'collected',
        createdBy: req.user.id,
        isActive: true
      };

      testInstallments.push(installment);
    }

    // Insert test installments
    const createdInstallments = await Installment.insertMany(testInstallments);

    // Update member totals
    for (const installment of createdInstallments) {
      const member = await Member.findById(installment.member);
      if (member) {
        member.totalPaid = (member.totalPaid || 0) + installment.amount;
        if (installment.installmentType === 'regular') {
          member.totalSavings = (member.totalSavings || 0) + installment.amount;
        }
        member.lastPaymentDate = today;
        await member.save();
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdInstallments.length} test installments`,
      data: {
        count: createdInstallments.length,
        totalAmount: createdInstallments.reduce((sum, inst) => sum + inst.amount, 0)
      }
    });

  } catch (error) {
    console.error('Create test data error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating test data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Recalculate due dates for loan installments based on collector schedule
// @route   POST /api/installments/recalculate-due-dates/:memberId
// @access  Private
router.post('/recalculate-due-dates/:memberId', protect, async (req, res) => {
  try {
    const { memberId } = req.params;
    const { collectorId } = req.body;

    console.log(`🔄 Recalculating due dates for member: ${memberId}, collector: ${collectorId}`);

    // Find the member
    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // 🔍 DEBUG: Check all schedules in database
    const allSchedules = await CollectionSchedule.find({ isActive: true }).select('collector collectionDates');
    console.log(`📊 Total active schedules in DB: ${allSchedules.length}`);
    allSchedules.forEach(s => {
      console.log(`   - Collector: ${s.collector}, Dates: ${s.collectionDates?.length || 0}`);
    });

    // Get collector's schedule
    const schedule = await CollectionSchedule.findOne({
      collector: collectorId,
      isActive: true
    }).select('collectionDates');

    console.log(`🔍 Looking for collector: ${collectorId}`);
    console.log(`🔍 Found schedule:`, schedule ? `YES (${schedule.collectionDates?.length || 0} dates)` : 'NO');

    if (!schedule || !schedule.collectionDates || schedule.collectionDates.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Collector schedule not found for collector ID: ${collectorId}. Please set up the collector schedule first. Found ${allSchedules.length} other schedules in database.`,
        debug: {
          collectorId: collectorId,
          totalSchedules: allSchedules.length,
          scheduleCollectors: allSchedules.map(s => s.collector.toString())
        }
      });
    }

    console.log(`📅 Collector schedule:`, schedule.collectionDates);

    // Find all pending loan installments for this member
    const loanInstallments = await Installment.find({
      member: memberId,
      status: { $in: ['pending', 'partial'] },
      installmentType: 'regular',
      note: { $regex: 'Product Loan', $options: 'i' },
      isActive: true
    }).sort({ serialNumber: 1, createdAt: 1 });

    console.log(`📊 Found ${loanInstallments.length} pending loan installments`);

    if (loanInstallments.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending loan installments found for this member',
        data: {
          updatedCount: 0
        }
      });
    }

    // Parse collection schedule dates
    const parseCollectionDate = (dateString) => {
      try {
        const [day, month, year] = dateString.split('/');
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
      } catch (error) {
        console.error(`Failed to parse date: ${dateString}`, error);
        return new Date();
      }
    };

    // Sort schedule dates chronologically
    const parsedScheduleDates = schedule.collectionDates
      .map(dateStr => ({
        original: dateStr,
        parsed: parseCollectionDate(dateStr)
      }))
      .sort((a, b) => a.parsed - b.parsed)
      .map(item => item.parsed);

    console.log(`📅 Sorted schedule dates:`, parsedScheduleDates.map(d => d.toISOString().split('T')[0]));

    // Find first schedule date after today
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));

    let startScheduleIndex = parsedScheduleDates.findIndex(date => date > today);

    // If no future date found, start from first date of next cycle
    if (startScheduleIndex === -1) {
      startScheduleIndex = 0;
    }

    console.log(`🎯 Starting from schedule index ${startScheduleIndex}: ${parsedScheduleDates[startScheduleIndex].toISOString().split('T')[0]}`);

    // Detect cadence (monthly vs weekly) from note
    const isMonthlyCadence = loanInstallments[0]?.note?.toLowerCase()?.includes('monthly');

    // For monthly recalculation: Find target day from schedule, then apply to all months
    const getMonthlyDatesFixed = (count) => {
      if (parsedScheduleDates.length === 0 || count <= 0) return [];

      // Find the first date after 15th from the collector's schedule
      let targetDay = null;
      for (const d of parsedScheduleDates) {
        if (d.getUTCDate() > 15) {
          targetDay = d.getUTCDate();
          console.log(`📅 (Recalc) Found schedule after 15th: Day ${targetDay}`);
          break;
        }
      }

      // If no date after 15th found, try cycling forward
      if (!targetDay) {
        for (let weeks = 1; weeks <= 4; weeks++) {
          for (const d of parsedScheduleDates) {
            const testDate = new Date(d);
            testDate.setUTCDate(testDate.getUTCDate() + (weeks * 7));
            if (testDate.getUTCDate() > 15) {
              targetDay = testDate.getUTCDate();
              console.log(`📅 (Recalc) Found after ${weeks} weeks: Day ${targetDay}`);
              break;
            }
          }
          if (targetDay) break;
        }
      }

      // Fallback to 17th
      if (!targetDay) {
        targetDay = 17;
        console.log(`📅 (Recalc) Using fallback: Day ${targetDay}`);
      }

      // Generate monthly dates using the same day each month
      const results = [];
      let baseDate = new Date(today);

      // Find the first occurrence of targetDay after today
      if (today.getUTCDate() >= targetDay) {
        baseDate.setUTCMonth(baseDate.getUTCMonth() + 1);
      }
      baseDate.setUTCDate(targetDay);

      for (let i = 0; i < count; i++) {
        const installmentDate = new Date(baseDate);
        installmentDate.setUTCMonth(baseDate.getUTCMonth() + i);

        const targetMonth = (baseDate.getUTCMonth() + i) % 12;
        const targetYear = baseDate.getUTCFullYear() + Math.floor((baseDate.getUTCMonth() + i) / 12);
        installmentDate.setUTCFullYear(targetYear);
        installmentDate.setUTCMonth(targetMonth);

        const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        installmentDate.setUTCDate(Math.min(targetDay, lastDayOfMonth));

        results.push(installmentDate);
      }

      return results;
    };

    let recalculatedMonthlyDates = [];
    if (isMonthlyCadence) {
      recalculatedMonthlyDates = getMonthlyDatesFixed(loanInstallments.length);
      console.log('📅 (Recalc) Monthly installment dates:', recalculatedMonthlyDates.map(d => d.toISOString().split('T')[0]));
    }

    // Update each installment's due date
    let updatedCount = 0;
    const updates = [];

    for (let i = 0; i < loanInstallments.length; i++) {
      const installment = loanInstallments[i];

      let newDueDate;
      if (isMonthlyCadence && recalculatedMonthlyDates[i]) {
        // Monthly cadence: first schedule after 15th
        newDueDate = recalculatedMonthlyDates[i];
      } else {
        // Weekly cadence: based on collector's weekly schedule
        const currentScheduleIndex = (startScheduleIndex + i) % parsedScheduleDates.length;
        const cycleNumber = Math.floor((startScheduleIndex + i) / parsedScheduleDates.length);
        newDueDate = new Date(parsedScheduleDates[currentScheduleIndex]);
        if (cycleNumber > 0) {
          const daysToAdd = cycleNumber * 7 * parsedScheduleDates.length;
          newDueDate.setDate(newDueDate.getDate() + daysToAdd);
        }
      }

      const oldDueDate = installment.dueDate ? new Date(installment.dueDate).toISOString().split('T')[0] : 'N/A';
      const newDueDateStr = newDueDate.toISOString().split('T')[0];

      console.log(`   📝 Installment #${i + 1}: ${oldDueDate} → ${newDueDateStr}`);

      // Update the installment
      installment.dueDate = newDueDate;
      installment.updatedAt = new Date();
      await installment.save();

      updatedCount++;
      updates.push({
        installmentId: installment._id,
        serialNumber: installment.serialNumber,
        oldDueDate: oldDueDate,
        newDueDate: newDueDateStr
      });
    }

    console.log(`✅ Successfully updated ${updatedCount} installments`);

    res.status(200).json({
      success: true,
      message: `Successfully recalculated due dates for ${updatedCount} installments`,
      data: {
        updatedCount: updatedCount,
        totalInstallments: loanInstallments.length,
        updates: updates,
        schedule: parsedScheduleDates.map(d => d.toISOString().split('T')[0])
      }
    });

  } catch (error) {
    console.error('Recalculate due dates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while recalculating due dates',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Process auto savings deduction for a member
// @route   POST /api/installments/auto-deduction
// @access  Private
router.post('/auto-deduction', protect, async (req, res) => {
  try {
    const { memberId, installmentId, deductionDate } = req.body;

    if (!memberId || !installmentId) {
      return res.status(400).json({
        success: false,
        message: 'Member ID and Installment ID are required'
      });
    }

    const result = await autoSavingsDeductionService.processAutoDeduction(
      memberId,
      installmentId,
      deductionDate ? new Date(deductionDate) : null
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Auto deduction API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing auto deduction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Process auto deductions for all pending installments
// @route   POST /api/installments/batch-auto-deduction
// @access  Private (Admin/Manager only)
router.post('/batch-auto-deduction', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { targetDate } = req.body;

    const result = await autoSavingsDeductionService.processAllPendingDeductions(
      targetDate ? new Date(targetDate) : null
    );

    res.status(200).json({
      success: true,
      message: 'Batch auto deduction completed',
      data: result
    });
  } catch (error) {
    console.error('Batch auto deduction API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing batch auto deduction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get member's savings deduction history
// @route   GET /api/installments/deduction-history/:memberId
// @access  Private
router.get('/deduction-history/:memberId', protect, async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit } = req.query;

    const result = await autoSavingsDeductionService.getMemberDeductionHistory(
      memberId,
      parseInt(limit) || 50
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to fetch deduction history',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Deduction history API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching deduction history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Calculate potential savings deductions
// @route   GET /api/installments/potential-deductions
// @access  Private
router.get('/potential-deductions', protect, async (req, res) => {
  try {
    const { targetDate } = req.query;

    const result = await autoSavingsDeductionService.calculatePotentialDeductions(
      targetDate ? new Date(targetDate) : null
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        data: result.analysis
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to calculate potential deductions',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Potential deductions API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error calculating potential deductions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get member's active product sales count
// @route   GET /api/installments/active-sales/:memberId
// @access  Private
router.get('/active-sales/:memberId', protect, async (req, res) => {
  try {
    const { memberId } = req.params;

    console.log(`🔍 Checking active product sales for member: ${memberId}`);

    // Find ALL loan installments for this member (not just pending)
    const allInstallments = await Installment.find({
      member: memberId,
      installmentType: 'regular',
      note: { $regex: 'Product Loan', $options: 'i' },
      isActive: true
    });

    console.log(`📋 Found ${allInstallments.length} total product loan installments`);

    // Group by distributionId to get unique products
    const productSales = {};

    allInstallments.forEach(inst => {
      // If no distributionId, try to group by product name from note (FALLBACK)
      let groupKey = inst.distributionId;
      let isFallback = false;

      if (!groupKey) {
        // Extract product name from note
        if (inst.note && inst.note.includes('Product Loan:')) {
          const match = inst.note.match(/Product Loan: (.+?) -/);
          if (match && match[1]) {
            groupKey = `fallback_${match[1].trim()}`;
            isFallback = true;
          }
        }
      }

      // If still no group key, skip (can't identify product)
      if (!groupKey) return;

      // ✅ CRITICAL FIX: Skip savings collections - only count LOAN payments
      // Savings collections have installmentType: 'extra' and note contains "Savings"
      if (inst.installmentType === 'extra' && inst.note &&
        (inst.note.includes('Savings Collection') || inst.note.includes('Savings Withdrawal'))) {
        console.log(`⏭️ Skipping savings record: ${inst.note} (not a loan payment)`);
        return; // Don't count savings in paidAmount
      }

      if (!productSales[groupKey]) {
        productSales[groupKey] = {
          distributionId: isFallback ? null : groupKey,
          fallbackName: isFallback ? groupKey.replace('fallback_', '') : null,
          totalAmount: 0,
          paidAmount: 0,
          installments: []
        };
      }

      productSales[groupKey].installments.push(inst);
      productSales[groupKey].totalAmount += inst.amount;
      productSales[groupKey].paidAmount += (inst.paidAmount || 0);
    });

    // Filter to only products with outstanding installments (pending or partial status)
    // Don't use due > 0 because overpayments can make due negative while still having partial installments
    const activeDistributionIds = Object.keys(productSales).filter(distId => {
      const sale = productSales[distId];
      const due = sale.totalAmount - sale.paidAmount;

      // Check if there are any pending or partial installments
      const hasOutstandingInstallments = sale.installments.some(inst =>
        inst.status === 'pending' || inst.status === 'partial'
      );

      console.log(`💜 Product ${distId}: Total=৳${sale.totalAmount}, Paid=৳${sale.paidAmount}, Due=৳${due}, Has Outstanding: ${hasOutstandingInstallments}`);

      return hasOutstandingInstallments; // Product is active if it has any pending/partial installments
    });

    const activeProductSalesCount = activeDistributionIds.length;
    const canCreateNewSale = activeProductSalesCount < 2;

    console.log(`📊 Member has ${activeProductSalesCount} active product sales (with outstanding due)`);
    console.log(`✅ Can create new sale: ${canCreateNewSale}`);

    // Get details of each active sale
    const activeSales = activeDistributionIds.map(distId => {
      const sale = productSales[distId];
      const saleInstallments = sale.installments;
      const totalInstallments = saleInstallments.length;
      const paidInstallments = saleInstallments.filter(inst => inst.status === 'collected' || inst.status === 'paid').length;

      // Extract product name from note or use fallback
      let productName = sale.fallbackName || 'Unknown Product';

      if (!sale.fallbackName && saleInstallments[0]?.note) {
        const match = saleInstallments[0].note.match(/Product Loan: (.+?) - /);
        if (match) {
          productName = match[1].trim();
        }
      }

      return {
        distributionId: distId,
        productName: productName,
        totalInstallments: totalInstallments,
        paidInstallments: paidInstallments,
        pendingInstallments: saleInstallments.length,
        totalAmount: saleInstallments.reduce((sum, inst) => sum + inst.amount, 0),
        installmentAmount: saleInstallments[0]?.amount || 0
      };
    });

    res.status(200).json({
      success: true,
      data: {
        memberId: memberId,
        activeProductSalesCount: activeProductSalesCount,
        maxAllowed: 2,
        canCreateNewSale: canCreateNewSale,
        activeSales: activeSales
      }
    });
  } catch (error) {
    console.error('Active sales check API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error checking active sales',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
