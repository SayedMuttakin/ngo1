import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { installmentsAPI } from '../../utils/api';
import { triggerCollectionUpdate } from '../../utils/collectionEvents';

const NewCollectInstallmentForm = ({ selectedMember, selectedBranch, selectedCollector, onClose, onInstallmentCollected }) => {
  const [memberInstallments, setMemberInstallments] = useState([]);
  const [completedProductSales, setCompletedProductSales] = useState([]); // History of completed sales
  const [allInstallmentRecords, setAllInstallmentRecords] = useState([]); // Store all raw data for savings calculation
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [savingsAmount, setSavingsAmount] = useState('');
  const [savingsType, setSavingsType] = useState('in'); // 'in' or 'out'
  const [showHistory, setShowHistory] = useState(false); // Toggle history view
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionInstallment, setCorrectionInstallment] = useState(null);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // InstallmentCard component for individual installment display
  const InstallmentCard = ({ installment }) => {
    // Debug Installment #4
    if (installment.serialNumber === 4) {
      console.log('🔍 Installment #4 Data:', {
        paid: installment.paidAmount,
        remaining: installment.remainingAmount,
        isAuto: installment.isAutoApplied,
        receipt: installment.receiptNumber,
        lastPay: installment.lastPaymentAmount,
        status: installment.status
      });
    }

    // 🔻 Correction Record - Special display, read-only, no action buttons
    if (installment.status === 'correction') {
      const correctionNote = installment.note || '';
      const reasonMatch = correctionNote.match(/Reason: (.+?)(?:\.|$)/);
      const correctionReason = reasonMatch ? reasonMatch[1] : 'No reason provided';
      const deductedAmount = Math.abs(installment.amount);
      const dateStr = installment.collectionDate
        ? new Date(installment.collectionDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' })
        : installment.dueDate || '—';

      return (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🔻</span>
              <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg px-3 py-1">
                <span className="text-sm font-bold">CORRECTION</span>
              </div>
              <div>
                <p className="text-red-800 font-bold text-base">
                  -{'\u09F3'}{deductedAmount.toLocaleString()} Deducted
                </p>
                <p className="text-red-600 text-xs mt-0.5">
                  📅 {dateStr} • Reason: {correctionReason}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block bg-red-100 text-red-800 border border-red-300 px-3 py-1 rounded-lg text-xs font-bold">
                CORRECTION
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`rounded-xl border p-4 transition-all duration-300 hover:shadow-lg ${getStatusColor(installment.status)}`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4 w-full md:w-auto">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{getStatusIcon(installment.status)}</span>
              <div className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-lg px-3 py-1">
                <span className="text-sm font-bold">#{installment.serialNumber}</span>
              </div>
            </div>
            <div className="flex-1 md:flex-none">
              <h4 className="font-bold text-gray-800 text-base md:text-lg">{installment.productName}</h4>
              <div className="mt-1">
                <p className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">
                  Due: {installment.dueDate} • ({installment.installmentNumber}/{installment.totalInstallments})
                </p>
              </div>
              {installment.paidAmount > 0 && !installment.isAutoApplied && (
                <p className="text-green-600 font-semibold text-xs md:text-sm">
                  Paid: ৳{installment.originalInstallment?.lastPaymentAmount || installment.paidAmount}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end space-x-4 w-full md:w-auto">
            <div className="text-left md:text-right">
              <p className="text-xl font-bold text-gray-800">৳{installment.remainingAmount}</p>
              <div className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${getStatusColor(installment.status)}`}>
                {installment.status.toUpperCase()}
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              {installment.status !== 'paid' && installment.remainingAmount > 0 ? (
                <>
                  <button
                    onClick={() => handleLoanPayment(installment)}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-medium transition-all duration-300 disabled:opacity-50 text-sm"
                  >
                    💰 Loan
                  </button>
                </>
              ) : (
                <div className="flex items-center space-x-2 bg-green-100 px-4 py-2 rounded-lg">
                  <span className="text-lg">✅</span>
                  <span className="text-green-700 font-bold text-sm">COLLECTED</span>
                </div>
              )}

              {/* 🔴 Correction button - shown when installment has any paid amount */}
              {(installment.status === 'paid' || installment.status === 'partial' || installment.paidAmount > 0) && (
                <button
                  onClick={() => handleOpenCorrection(installment)}
                  disabled={isSubmitting}
                  title="Apply correction / deduct from collected amount"
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white rounded-lg font-medium transition-all duration-300 disabled:opacity-50 text-sm flex items-center justify-center gap-1"
                >
                  <span>⚡</span> Correction
                </button>
              )}

              <button
                onClick={() => handleSavingsCollection(installment)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-lg font-medium transition-all duration-300 disabled:opacity-50 text-sm"
              >
                💰 Savings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };


  // Load member installments on component mount and when schedule changes
  useEffect(() => {
    loadMemberInstallments();

    // Listen for collector schedule changes
    const handleStorageChange = (e) => {
      if (e.key && e.key.includes('collection_schedule_')) {
        console.log('📅 Collector schedule changed, refreshing installments...');
        loadMemberInstallments();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom events (for same-tab updates)
    const handleScheduleUpdate = () => {
      console.log('📅 Schedule updated in same tab, refreshing installments...');
      setTimeout(() => loadMemberInstallments(), 100);
    };

    window.addEventListener('collectorScheduleUpdated', handleScheduleUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('collectorScheduleUpdated', handleScheduleUpdate);
    };
  }, [selectedMember]);

  const loadMemberInstallments = async () => {
    if (!selectedMember?._id) return;

    setLoading(true);
    try {
      const response = await installmentsAPI.getByMember(selectedMember._id);

      if (response.success && response.data) {
        // ✅ STEP 1: Separate correction records FIRST — they must NOT be processed as regular installments
        const correctionRecords = response.data.filter(record => record.status === 'correction');
        console.log(`🔻 Found ${correctionRecords.length} correction record(s)`);

        // Filter for actual loan installments (exclude corrections — handled separately)
        const loanInstallments = response.data.filter(record => {
          // ❌ NEVER include correction records in the main loan list
          if (record.status === 'correction') return false;

          const isLoanType = (record.installmentType === 'regular' && record.note && record.note.includes('Product Loan')) ||
            record.installmentType === 'loan';

          if (!isLoanType) return false;

          // ✅ IMPROVED: Keep installments with 'partial' status - they represent real dues
          if (record.status === 'partial') {
            console.log(`✅ Keeping partial status installment: Amount ৳${record.amount}, Remaining: ৳${record.remainingAmount || 0}`);
            return true;
          }

          // CRITICAL: Filter out duplicate collection records that were created during partial payment completions
          if (record.status === 'collected' && record.note) {
            const installmentAmtMatch = record.note.match(/InstallmentAmt: ৳(\d+)/);
            if (installmentAmtMatch) {
              const noteInstallmentAmt = parseInt(installmentAmtMatch[1]);
              if (record.amount < noteInstallmentAmt) {
                console.log(`⚠️ Skipping duplicate partial completion record: Amount ৳${record.amount} < InstallmentAmt ৳${noteInstallmentAmt}`);
                return false;
              }
            }
          }

          return true;
        });

        if (loanInstallments.length > 0) {
          console.log('✅ Using actual loan installments:', loanInstallments);
          console.log(`📊 Total loan installments loaded: ${loanInstallments.length}`);
          console.log('🔍 Installment details:');
          loanInstallments.forEach((inst, idx) => {
            console.log(`   ${idx + 1}. Amount: ৳${inst.amount}, Status: ${inst.status}, Note: ${inst.note?.substring(0, 50)}`);
          });

          // Get current collector schedule for real-time updates
          const selectedCollectorData = JSON.parse(localStorage.getItem('selectedCollector') || '{}');
          const collectorId = selectedCollectorData.id || selectedCollectorData._id || 'hayat';
          const savedSchedule = localStorage.getItem(`collection_schedule_${collectorId}`);

          let currentScheduleDates = ['02/09/2025', '09/09/2025', '16/09/2025', '23/09/2025', '30/09/2025'];
          if (savedSchedule) {
            const parsed = JSON.parse(savedSchedule);
            currentScheduleDates = parsed.collectionDates || currentScheduleDates;
          }

          console.log('📅 Current collector schedule:', currentScheduleDates);
          // Process actual loan installments from database
          const processedInstallments = loanInstallments.map((installment, index) => {
            // ✅ SIMPLIFIED: Check if THIS installment is collected (using its status)
            const isCollected = installment.status === 'collected';
            console.log(`🔍 Installment ${index + 1} (${installment._id}): status = ${installment.status}`);

            // Count how many installments have been collected for this member (OLD LOGIC - keeping for compatibility)
            console.log(`🔍 Checking collections for installment ${index + 1}:`, response.data.length, 'total records');
            const collectionRecords = response.data.filter(record => {
              const memberMatch = (record.memberId === selectedMember._id) ||
                (record.member && (
                  (typeof record.member === 'object' && record.member._id === selectedMember._id) ||
                  (typeof record.member === 'string' && record.member === selectedMember._id)
                ));

              const typeMatch = record.installmentType === 'regular';
              const noteMatch = record.note && (
                (record.note.includes('Product Loan:') && record.note.includes('Installment') && record.note.includes('/') &&
                  (record.note.includes('Full payment') || record.note.includes('Partial payment') ||
                    record.note.includes('Full Payment') || record.note.includes('Partial Payment'))) ||
                (record.note.includes('Loan Installment') &&
                  (record.note.includes('Full payment') || record.note.includes('Partial payment') ||
                    record.note.includes('Full Payment') || record.note.includes('Partial Payment'))) ||
                // Enhanced detection for any installment collection
                (record.note.includes('Product Loan') &&
                  (record.note.includes('payment') || record.note.includes('Payment') || record.note.includes('collected')))
              );

              return memberMatch && typeMatch && noteMatch;
            });

            console.log(`📊 Found ${collectionRecords.length} collection records for member ${selectedMember.name}`);

            // DEBUG: Log all collection amounts for this member
            if (index === 16 || index === 17) { // Only for installments 17 & 18 (indices 16 & 17)
              console.log(`   📄 ALL collection amounts for ${selectedMember.name}:`);
              collectionRecords.forEach((rec, idx) => {
                console.log(`      ${idx + 1}. ৳${rec.amount} - Note: ${rec.note?.substring(0, 80)}...`);
              });
            }

            // Determine if this specific installment has been collected
            const installmentNumber = index + 1;
            console.log(`🎯 Checking specific installment #${installmentNumber} collections:`);

            const thisInstallmentCollections = collectionRecords.filter(record => {
              if (!record.note) return false;

              console.log(`   📝 Checking note: "${record.note}"`);

              // CRITICAL FIX: Match by installment ID FIRST (most accurate)
              const installmentId = installment._id;
              if (record.note && record.note.includes(`ID: ${installmentId}`)) {
                console.log(`   ✅✅✅ PERFECT MATCH by Installment ID: ${installmentId}`);
                return true;
              }

              // If note doesn't have ID, fall back to pattern matching
              // CRITICAL: Match by installment number patterns
              const patterns = [
                `Installment ${installmentNumber}/`,
                `Installment ${installmentNumber} `,
                `- Installment ${installmentNumber}`,
                ` ${installmentNumber}/`,
                ` ${installmentNumber} `,
                `Installment #${installmentNumber}/`, // Added # pattern
                `#${installmentNumber}/` // Added short # pattern
              ];

              const installmentNumberMatches = patterns.some(pattern => {
                const found = record.note.includes(pattern);
                if (found) {
                  console.log(`   ✅ Pattern match: "${pattern}" found in note`);
                }
                return found;
              });

              if (!installmentNumberMatches) {
                console.log(`   ❌ No pattern match for installment #${installmentNumber}`);
                return false;
              }

              // If no ID in note, warn but continue with pattern matching
              if (!record.note || !record.note.includes('ID:')) {
                console.log(`   ⚠️  Old format collection without ID - using pattern match`);
              }

              // CRITICAL FIX 2: Match by amount to distinguish between different product sales
              // This prevents collection of ৳950 from being matched to ৳250 installment
              const collectionAmount = record.amount || 0;
              const expectedAmount = installment.amount || 0;

              // Also check if note mentions the installment amount
              const installmentAmtMatch = record.note.match(/InstallmentAmt: ৳(\d+)/);
              if (installmentAmtMatch) {
                const noteInstallmentAmt = parseInt(installmentAmtMatch[1]);
                if (noteInstallmentAmt === expectedAmount) {
                  console.log(`   ✅✅ Strong match by InstallmentAmt in note: ৳${noteInstallmentAmt}`);
                  return true;
                } else {
                  console.log(`   ❌ InstallmentAmt mismatch: Expected ৳${expectedAmount}, Note has ৳${noteInstallmentAmt}`);
                  return false;
                }
              }

              // Fallback: Match by collection amount with tolerance
              const amountTolerance = Math.max(expectedAmount * 0.1, 10); // 10% tolerance or ৳10
              const amountDifference = Math.abs(collectionAmount - expectedAmount);

              const amountMatches = amountDifference <= amountTolerance;

              if (!amountMatches) {
                console.log(`   ❌ Amount mismatch: Expected ৳${expectedAmount}, Got ৳${collectionAmount} (Diff: ৳${amountDifference})`);
                return false;
              }

              console.log(`   ✅ Fallback match by amount tolerance: ৳${collectionAmount}`);
              return true;
            });

            console.log(`🎯 Found ${thisInstallmentCollections.length} collections for installment #${installmentNumber}`);

            // ✅ USE DIRECT STATUS from installment with partial payment support
            let status = 'due';
            let totalCollected = installment.paidAmount || 0;
            let remainingAmount = installment.remainingAmount || installment.amount;

            // Check if installment has paidAmount/remainingAmount fields (new system)
            if (installment.paidAmount !== undefined && installment.remainingAmount !== undefined) {
              totalCollected = installment.paidAmount;
              remainingAmount = installment.remainingAmount;

              console.log(`🔍 Installment #${installmentNumber} Status Check:`);
              console.log(`   - Backend status: "${installment.status}"`);
              console.log(`   - paidAmount: ৳${installment.paidAmount}`);
              console.log(`   - remainingAmount: ৳${installment.remainingAmount}`);
              console.log(`   - remainingAmount <= 0: ${remainingAmount <= 0}`);
              console.log(`   - status === 'collected': ${installment.status === 'collected'}`);

              // CRITICAL FALLBACK: Check if there are collection records for this installment
              // This handles cases where backend doesn't update paidAmount/remainingAmount properly
              const installmentCollections = response.data.filter(record => {
                if (record.installmentType !== 'regular' || !record.note) return false;

                // Check if this collection is for this installment by ID
                return record.note.includes(`ID: ${installment._id}`);
              });

              if (installmentCollections.length > 0) {
                console.log(`   🔍 Found ${installmentCollections.length} collection records for this installment`);

                // Log each collection record for debugging
                installmentCollections.forEach((rec, idx) => {
                  console.log(`      Record ${idx + 1}: Amount ৳${rec.amount}, Date: ${rec.date || rec.createdAt}`);
                });

                // Calculate actual total collected from records
                const actualCollected = installmentCollections.reduce((sum, rec) => sum + (rec.amount || 0), 0);
                const actualRemaining = Math.max(0, installment.amount - actualCollected);

                console.log(`   💰 Total installment amount: ৳${installment.amount}`);
                console.log(`   💰 Actual collected from records: ৳${actualCollected}`);
                console.log(`   💰 Actual remaining: ৳${actualRemaining}`);

                // Override backend values with calculated values
                totalCollected = actualCollected;
                remainingAmount = actualRemaining;
              }

              // Determine status based ONLY on remaining amount (ignore backend status)
              // This ensures validation persists until full amount is cleared
              if (remainingAmount <= 0) {
                status = 'paid';
                remainingAmount = 0;
                console.log(`✅ Setting status to PAID (fully collected)`);
              } else if (totalCollected > 0) {
                status = 'partial';
                console.log(`⚠️ Setting status to PARTIAL (৳${totalCollected} paid, ৳${remainingAmount} remaining)`);
              }
            } else if (isCollected || installment.status === 'collected') {
              // Old system - assume full payment if collected
              status = 'paid';
              totalCollected = installment.amount;
              remainingAmount = 0;
              console.log(`✅ Installment ${installmentNumber} is COLLECTED (old system)`);
            } else {
              // Fallback to old detection logic for backward compatibility
              totalCollected = thisInstallmentCollections.reduce((sum, record) => {
                const amount = record.paidAmount != null ? record.paidAmount : record.amount;
                return sum + (amount || 0);
              }, 0);
              remainingAmount = Math.max(0, installment.amount - totalCollected);

              if (totalCollected >= installment.amount) {
                status = 'paid';
              } else if (totalCollected > 0) {
                status = 'partial';
              }
            }

            // 🎯 Use backend dueDate directly (already calculated correctly)
            let dueDate;
            try {
              // PRIORITY: Use dueDate from backend if available
              if (installment.dueDate) {
                dueDate = new Date(installment.dueDate).toISOString().split('T')[0];
                console.log(`🎯 Using backend dueDate for installment #${index + 1}: ${dueDate}`);
              } else {
                // Fallback: Calculate based on current collector schedule (for old installments)
                console.log(`⚠️ No backend dueDate, calculating for installment #${index + 1}`);
                const dateIndex = (index) % currentScheduleDates.length;
                const [day, month, year] = currentScheduleDates[dateIndex].split('/');

                // Create date with proper timezone handling to avoid date shift
                dueDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);

                // If we need more installments than available dates, add weeks
                if (index >= currentScheduleDates.length) {
                  const weeksToAdd = Math.floor(index / currentScheduleDates.length);
                  dueDate.setDate(dueDate.getDate() + (weeksToAdd * 7));
                }

                // Format date properly to avoid timezone issues
                const formattedYear = dueDate.getFullYear();
                const formattedMonth = String(dueDate.getMonth() + 1).padStart(2, '0');
                const formattedDay = String(dueDate.getDate()).padStart(2, '0');
                dueDate = `${formattedYear}-${formattedMonth}-${formattedDay}`;
              }
            } catch (error) {
              console.error('Date calculation error:', error);
              // Final fallback to installment record date or current date
              dueDate = installment.dueDate || installment.date || installment.createdAt;
              if (dueDate) {
                dueDate = new Date(dueDate).toISOString().split('T')[0];
              } else {
                dueDate = new Date().toISOString().split('T')[0];
              }
            }

            // Extract product name from note
            let productName = 'Product Loan';
            if (installment.note) {
              const noteMatch = installment.note.match(/Product Loan: (.+?) -/);
              if (noteMatch && noteMatch[1]) {
                productName = noteMatch[1].trim();
              }
            }

            // Check for manual collections
            // 1. Look for separate collection records (backward compatibility)
            const hasSeparateCollection = thisInstallmentCollections.some(record => !record.isAutoApplied);

            // 2. Check installment properties (for direct updates from backend)
            //    - Paid amount > 0
            //    - NOT auto-applied (or has a manual receipt number starting with RC or SAV)
            //    - Receipt number is NOT the original 'PL-' one
            const isManuallyUpdated = installment.paidAmount > 0 &&
              (!installment.isAutoApplied ||
                (installment.receiptNumber && !installment.receiptNumber.startsWith('PL-')));

            // Combine both checks
            const hasManualCollection = hasSeparateCollection || isManuallyUpdated;

            return {
              id: `${installment._id}-${index}`,
              serialNumber: index + 1,
              productName: productName,
              installmentNumber: index + 1,
              totalInstallments: loanInstallments.length,
              installmentType: 'loan',
              dueDate: dueDate,
              amount: installment.amount,
              paidAmount: totalCollected,
              remainingAmount: remainingAmount,
              status: status,
              distributionId: installment.distributionId, // 🎯 Add distributionId for proper grouping
              isAutoApplied: installment.isAutoApplied || false, // ✅ Pass through isAutoApplied flag
              hasManualCollection: hasManualCollection, // ✅ Flag to hide button after manual collection
              originalInstallment: installment
            };
          });

          // 🎯 Sort installments by dueDate (earliest first)
          const sortedInstallments = processedInstallments.sort((a, b) => {
            const dateA = new Date(a.dueDate);
            const dateB = new Date(b.dueDate);
            return dateA - dateB;
          });

          // 🔢 Re-assign installment numbers after sorting (1 = earliest, last = latest)
          const renumberedInstallments = sortedInstallments.map((inst, index) => ({
            ...inst,
            installmentNumber: index + 1,
            serialNumber: index + 1
          }));

          console.log('✅ Processed loan installments:', renumberedInstallments);
          console.log('📅 Sorted by dueDate - First:', renumberedInstallments[0]?.dueDate, 'Last:', renumberedInstallments[renumberedInstallments.length - 1]?.dueDate);
          console.log('🔢 Renumbered - First #', renumberedInstallments[0]?.installmentNumber, 'Last #', renumberedInstallments[renumberedInstallments.length - 1]?.installmentNumber);

          // 🎯 NEW: Separate completed product sales (all installments paid) from active ones
          // Group by BOTH distributionId AND amount (for backward compatibility)
          const groupedByDistribution = {};
          renumberedInstallments.forEach(inst => {
            // Use distributionId if available, otherwise group by amount
            let groupKey = inst.distributionId;
            if (!groupKey || groupKey === 'unknown') {
              // Fallback: group by amount (same amount = same product type)
              groupKey = `amount_${inst.amount}`;
            }

            if (!groupedByDistribution[groupKey]) {
              groupedByDistribution[groupKey] = [];
            }
            groupedByDistribution[groupKey].push(inst);
          });

          console.log('📦 Grouped installments:', Object.keys(groupedByDistribution).map(key => ({
            key,
            count: groupedByDistribution[key].length,
            allPaid: groupedByDistribution[key].every(inst => inst.status === 'paid')
          })));

          const completedSales = [];
          const activeInstallments = [];

          Object.entries(groupedByDistribution).forEach(([groupKey, installments]) => {
            // Check if ALL installments in this group are paid
            // Use BOTH status and remainingAmount for better detection
            const allPaid = installments.every(inst => {
              const isPaidByStatus = inst.status === 'paid';
              const isPaidByAmount = inst.remainingAmount === 0 || inst.remainingAmount === '0';
              return isPaidByStatus || isPaidByAmount;
            });

            console.log(`🔍 Group ${groupKey}: ${installments.length} installments, allPaid: ${allPaid}`);
            installments.forEach((inst, idx) => {
              console.log(`   ${idx + 1}. Status: ${inst.status}, Remaining: ৳${inst.remainingAmount}, Paid: ${inst.paidAmount}`);
            });

            if (allPaid && installments.length > 0) {
              // This is a completed sale - move to history
              const firstInst = installments[0];
              const productName = firstInst.productName || 'Unknown Product';
              const totalAmount = installments.reduce((sum, inst) => sum + inst.amount, 0);
              const installmentAmount = firstInst.amount;

              completedSales.push({
                distributionId: groupKey,
                productName: productName,
                totalInstallments: installments.length,
                installmentAmount: installmentAmount,
                totalAmount: totalAmount,
                completedDate: installments[installments.length - 1]?.dueDate || new Date().toISOString().split('T')[0],
                installments: installments
              });

              console.log(`✅ Completed sale found: ${productName} (${installments.length} installments, ৳${totalAmount})`);
            } else {
              // Active installments - keep in main list
              activeInstallments.push(...installments);
            }
          });

          console.log(`📊 Active installments: ${activeInstallments.length}, Completed sales: ${completedSales.length}`);

          // ✅ STEP 2: Format and append correction records at the END of the active list
          const formattedCorrectionRows = correctionRecords.map((rec, idx) => ({
            id: `correction-${rec._id}-${idx}`,
            serialNumber: `C${idx + 1}`,
            productName: (() => {
              const match = rec.note?.match(/CORRECTION: Product Loan: (.+?) -/);
              return match ? match[1].trim() : 'Correction';
            })(),
            installmentNumber: null,
            totalInstallments: null,
            installmentType: 'correction',
            dueDate: rec.collectionDate
              ? new Date(rec.collectionDate).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
            amount: rec.amount,         // negative value e.g. -500
            paidAmount: rec.paidAmount,
            remainingAmount: 0,
            status: 'correction',
            note: rec.note,
            collectionDate: rec.collectionDate,
            distributionId: rec.distributionId,
            originalInstallment: rec
          }));

          const finalInstallments = [...activeInstallments, ...formattedCorrectionRows];

          setMemberInstallments(finalInstallments);
          setCompletedProductSales(completedSales);
          setAllInstallmentRecords(response.data); // Store all raw data for savings calculation
        } else {
          console.log('❌ No loan installments found for this member');
          setMemberInstallments([]);
          setCompletedProductSales([]);
        }
      } else {
        console.log('❌ No installment data found');
        setMemberInstallments([]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading member installments:', error);
      setMemberInstallments([]);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'due': return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      case 'overdue': return 'bg-red-50 text-red-800 border-red-200';
      case 'partial': return 'bg-orange-50 text-orange-800 border-orange-200';
      case 'upcoming': return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'paid': return 'bg-green-50 text-green-800 border-green-200';
      case 'collected': return 'bg-green-50 text-green-800 border-green-200';
      case 'correction': return 'bg-red-50 text-red-800 border-red-300';
      default: return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'due': return '⏰';
      case 'overdue': return '🚨';
      case 'partial': return '⚠️';
      case 'upcoming': return '📅';
      case 'paid': return '✅';
      case 'collected': return '✅';
      case 'correction': return '🔻';
      default: return '📋';
    }
  };

  const handleFullPayment = async (installment) => {
    await collectInstallment(installment, installment.remainingAmount, 'Full payment');
  };

  const handlePartialPayment = (installment) => {
    setSelectedInstallment(installment);
    setPartialAmount('');
    setShowPartialModal(true);
  };

  // New unified loan payment handler (replaces Full + Partial buttons)
  const handleLoanPayment = (installment) => {
    setSelectedInstallment(installment);
    setPartialAmount('');
    setShowPartialModal(true);
  };

  const handleSavingsCollection = (installment) => {
    setSelectedInstallment(installment);
    setSavingsAmount('');
    setSavingsType('in'); // Reset to default 'Savings In'
    setShowSavingsModal(true);
  };

  const collectInstallment = async (installment, amount, description, type = 'installment', savingsDirection = 'in') => {
    setIsSubmitting(true);
    const loadingToast = toast.loading(`Collecting ${type}...`);

    try {
      const currentDate = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[currentDate.getDay()];
      const weekNumber = Math.ceil(currentDate.getDate() / 7);
      const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

      // Format current date for savings dueDate
      const currentDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

      // CRITICAL: For savings with installment context, use installment's dueDate
      // This makes savings appear in the correct date column of the collection sheet
      const savingsDueDate = (type === 'savings' && installment?.dueDate)
        ? installment.dueDate
        : (installment?.dueDate || currentDateStr);

      // 🔹 Get the selected collector from prop or localStorage
      const collectorId = selectedCollector?._id || selectedCollector?.id ||
        JSON.parse(localStorage.getItem('selectedCollector') || '{}')._id ||
        JSON.parse(localStorage.getItem('selectedCollector') || '{}').id;

      if (!collectorId) {
        console.warn('⚠️ No collector selected! Using logged-in user as fallback.');
      } else {
        console.log('✅ Using selected collector:', selectedCollector?.name || 'Unknown', '(ID:', collectorId, ')');
      }

      const collectionData = {
        memberId: selectedMember._id,
        collectorId: collectorId, // 🔹 Add selected collector ID
        amount: amount,
        installmentType: type === 'savings' ? 'extra' : 'regular', // Use 'extra' type for savings
        collectionDay: currentDay,
        paymentMethod: (type === 'savings' && savingsDirection === 'out') ? 'savings_withdrawal' : 'cash', // Special payment method for withdrawals
        weekNumber: weekNumber,
        monthYear: monthYear,
        dueDate: savingsDueDate, // Use installment's dueDate for proper sheet mapping
        note: type === 'savings'
          ? (savingsDirection === 'out'
            ? `Savings Withdrawal - ৳${amount} - Product: ${installment?.productName || 'General'} - Member: ${selectedMember.name}${installment ? ` - From Installment #${installment.installmentNumber} (Due: ${installment.dueDate})` : ''}`
            : `Savings Collection - ৳${amount} - Product: ${installment?.productName || 'General'} - Member: ${selectedMember.name}${installment ? ` - With Installment #${installment.installmentNumber} (Due: ${installment.dueDate})` : ''}`)
          : `Product Loan: ${installment.productName} - Installment #${installment.installmentNumber}/${installment.totalInstallments} - ${description} - Amount: ৳${amount} - InstallmentAmt: ৳${installment.amount} - ID: ${installment.originalInstallment._id}`,
        receiptNumber: `${type === 'savings' ? 'SAV' : 'RC'}-${Date.now()}`,
        branchCode: selectedBranch.code || selectedBranch.branchCode,
        branch: selectedBranch.name,

        // ✅ CRITICAL FIX: Add these fields to identify exact installment
        // For BOTH savings and loan collections
        ...(installment && {
          // 🔹 CRITICAL FIX: Always use originalInstallment to get the correct IDs
          installmentId: installment.originalInstallment?._id,
          distributionId: installment.originalInstallment?.distributionId,
          serialNumber: installment.originalInstallment?.serialNumber
        })
      };

      console.log('📤 Collecting:', collectionData);
      console.log('🔍 Installment object:', installment);
      console.log('🔍 Original Installment:', installment?.originalInstallment);

      // ✅ VERIFY: Log the critical fields
      if (installment) {
        console.log(`✅ ${type === 'savings' ? 'Savings' : 'Installment'} Identifiers:`);
        console.log('   - installmentId:', collectionData.installmentId);
        console.log('   - distributionId:', collectionData.distributionId);
        console.log('   - serialNumber:', collectionData.serialNumber);

        if (type !== 'savings' && !collectionData.installmentId) {
          console.error('❌ ERROR: installmentId is missing! Backend will create NEW installment instead of updating.');
          console.error('❌ This will cause duplicate installments!');
          console.error('🔍 Installment structure:', JSON.stringify(installment, null, 2));
        }
      }

      if (type === 'savings' && installment) {
        console.log('💰 Savings with installment context:');
        console.log('   - Installment #', installment.installmentNumber);
        console.log('   - Installment Due Date:', installment.dueDate);
        console.log('   - Will appear in sheet column:', installment.dueDate);
      }

      const response = await installmentsAPI.collect(collectionData);
      toast.dismiss(loadingToast);

      if (response.success) {
        let successMessage = '';
        if (type === 'savings') {
          if (savingsDirection === 'out') {
            successMessage = `Savings withdrawal of ৳${amount} processed successfully! 📤`;
          } else {
            successMessage = `Savings of ৳${amount} collected successfully! 💰`;
          }
        } else if (installment && amount > installment.remainingAmount) {
          const overpayment = amount - installment.remainingAmount;
          successMessage = `Payment collected! ৳${overpayment.toFixed(2)} overpayment applied to next installment(s)! 🎯`;
        } else if (installment && amount < installment.remainingAmount) {
          const remaining = installment.remainingAmount - amount;
          successMessage = `Partial payment of ৳${amount} collected! Remaining due: ৳${remaining.toFixed(2)}`;
        } else {
          successMessage = `Installment of ৳${amount} collected successfully!`;
        }

        toast.success(successMessage);

        // Refresh data immediately before closing modals
        await loadMemberInstallments();
        onInstallmentCollected();

        // 🔄 TRIGGER COLLECTION SHEET UPDATE: Use new utility
        triggerCollectionUpdate({
          memberId: selectedMember._id,
          memberName: selectedMember.name,
          amount: amount,
          installmentId: installment?.originalInstallment?._id || installment?._id,
          status: type === 'savings' ? 'savings_collected' :
            (amount < installment?.remainingAmount ? 'partial' : 'collected'),
          collectionDate: new Date().toISOString(),
          note: type === 'savings' ?
            (savingsDirection === 'out'
              ? `Savings withdrawal of ৳${amount}`
              : `Savings collection of ৳${amount}`) :
            `${description} of ৳${amount} for ${installment?.productName}`
        });

        console.log('🔄 Collection Sheet update event triggered');

        // Close modals after data is refreshed
        if (showPartialModal) {
          setShowPartialModal(false);
          setSelectedInstallment(null);
        }
        if (showSavingsModal) {
          setShowSavingsModal(false);
          setSelectedInstallment(null);
        }

      } else {
        toast.error(response.message || 'Failed to collect payment');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error collecting payment:', error);
      toast.error('Failed to collect payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const collectSavings = async () => {
    const amount = parseFloat(savingsAmount);
    if (amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // ✅ CRITICAL VALIDATION: For withdrawal, check product-specific savings
    // This MUST match the display logic exactly!
    if (savingsType === 'out' && selectedInstallment) {
      // ✅ REPLICATE DISPLAY LOGIC: Group installments by amount
      const installmentsByAmount = {};
      memberInstallments.forEach(inst => {
        const instAmount = inst.amount || inst.remainingAmount;
        if (!installmentsByAmount[instAmount]) {
          installmentsByAmount[instAmount] = [];
        }
        installmentsByAmount[instAmount].push(inst);
      });

      // Sort descending (same as display)
      const amountTypes = Object.keys(installmentsByAmount).map(Number).sort((a, b) => b - a);

      // Find which group this installment belongs to
      const selectedAmount = selectedInstallment.amount || selectedInstallment.remainingAmount;
      const groupIndex = amountTypes.indexOf(selectedAmount);

      console.log(`🔍 Installment amount: ৳${selectedAmount}, Group index: ${groupIndex} (0=Type 1, 1=Type 2)`);

      // Get all savings records
      const savingsRecords = allInstallmentRecords.filter(record => {
        if (!(record.installmentType === 'extra' || record.installmentType === 'savings')) return false;
        if (!record.note) return false;

        const isSavingsCollection = record.note.includes('Savings Collection');
        const isSavingsWithdrawal = record.note.includes('Savings Withdrawal');
        const isInitialSavings = record.note.includes('Initial Savings');
        const isProductSaleRecord = record.note.match(/Product Sale:.+\(Qty:.+\|/);

        return (isSavingsCollection || isSavingsWithdrawal || isInitialSavings) && !isProductSaleRecord;
      });

      // Get installments for THIS group
      const groupInstallments = groupIndex >= 0 ? installmentsByAmount[amountTypes[groupIndex]] : [];

      // Calculate savings for THIS group (same logic as display)
      let productSavings = savingsRecords.reduce((sum, record) => {
        const belongsToGroup = groupInstallments.some(inst => {
          if (record.distributionId && inst.originalInstallment?.distributionId) {
            return record.distributionId === inst.originalInstallment.distributionId;
          }
          if (record.installmentId && inst.originalInstallment?._id) {
            return record.installmentId === inst.originalInstallment._id;
          }
          if (record.note && inst.productName && record.note.includes(inst.productName)) {
            return true;
          }
          return false;
        });

        if (belongsToGroup) {
          const isWithdrawal = record.note.includes('Withdrawal');
          return sum + (isWithdrawal ? -record.amount : record.amount);
        }
        return sum;
      }, 0);

      // ✅ CRITICAL: Display shows SMALLER amount as Type 1!
      // So initial savings go to the NON-zero index (NOT the largest amount)
      // If there are only 2 types: index 0 = largest, index 1 = smallest (Type 1 in display)
      const isDisplayedAsType1 = groupIndex === 1 || (groupIndex === 0 && amountTypes.length === 1);

      if (isDisplayedAsType1) {
        // Add initial savings
        const initialSavings = savingsRecords.filter(record =>
          record.note && (record.note.includes('Initial Savings') || record.note.includes('Registration'))
        ).reduce((sum, record) => sum + record.amount, 0);

        // Add unmatched savings
        const unmatchedSavings = savingsRecords.filter(record => {
          if (!record.distributionId && !record.installmentId) {
            const notMatched = !memberInstallments.some(inst => {
              return (record.note && inst.productName && record.note.includes(inst.productName));
            });
            return notMatched && !record.note.includes('Initial Savings');
          }
          return false;
        }).reduce((sum, record) => {
          const isWithdrawal = record.note && record.note.includes('Withdrawal');
          return sum + (isWithdrawal ? -record.amount : record.amount);
        }, 0);

        productSavings += initialSavings + unmatchedSavings;

        // 🆕 SAVINGS TRANSFER: Add savings from completed products (fully paid products)
        if (completedProductSales && completedProductSales.length > 0) {
          const completedSavings = completedProductSales.reduce((sum, sale) => {
            // Get all savings records for this completed product
            const completedProductSavings = savingsRecords.filter(record => {
              // Match by distributionId or product name
              if (record.distributionId && record.distributionId === sale.distributionId) {
                return true;
              }
              if (record.note && record.note.includes(sale.productName)) {
                return true;
              }
              return false;
            }).reduce((savSum, record) => {
              const isWithdrawal = record.note && record.note.includes('Withdrawal');
              return savSum + (isWithdrawal ? -record.amount : record.amount);
            }, 0);

            return sum + Math.max(0, completedProductSavings);
          }, 0);

          if (completedSavings > 0) {
            console.log(`💸 Adding ৳${completedSavings} from ${completedProductSales.length} completed product(s) to Type 1`);
            productSavings += completedSavings;
          }
        }

        console.log(`💰 Type 1 Product ${selectedInstallment.productName} - Product-specific: ৳${productSavings - initialSavings - unmatchedSavings}, Initial: ৳${initialSavings}, Unmatched: ৳${unmatchedSavings}, Total: ৳${productSavings}`);
      } else {
        console.log(`💰 Type ${groupIndex + 1} Product ${selectedInstallment.productName} - Available Savings: ৳${productSavings}`);
      }

      if (amount > productSavings) {
        toast.error(
          `⚠️ Cannot withdraw ৳${amount.toLocaleString()}!\n` +
          `Available savings for ${selectedInstallment.productName}: ৳${productSavings.toLocaleString()}\n` +
          `Exceeds by: ৳${(amount - productSavings).toLocaleString()}`,
          { duration: 5000 }
        );
        return;
      }
    }

    // Proceed with savings collection/withdrawal
    const type = 'savings'; // Always use 'savings' type for backend compatibility
    const description = savingsType === 'out' ? `Savings withdrawal - ৳${amount}` : `Savings collection - ৳${amount}`;
    await collectInstallment(selectedInstallment, amount, description, type, savingsType);
  };

  const collectPartialPayment = async () => {
    const amount = parseFloat(partialAmount);

    if (amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // ✅ CRITICAL VALIDATION: Check if this amount would exceed the product's total due amount
    // Get all installments for this product (by product name)
    const productInstallments = memberInstallments.filter(inst =>
      inst.productName === selectedInstallment.productName
    );

    console.log(`🔍 Product Name Filter Debug:`);
    console.log(`   Selected Installment: #${selectedInstallment.installmentNumber}, Product: "${selectedInstallment.productName}"`);
    console.log(`   Total member installments: ${memberInstallments.length}`);
    console.log(`   Matched installments: ${productInstallments.length}`);
    productInstallments.forEach((inst, idx) => {
      console.log(`      ${idx + 1}. #${inst.installmentNumber}: ${inst.productName}, Remaining: ৳${inst.remainingAmount}`);
    });

    // Calculate total remaining due for this product
    const totalDue = productInstallments.reduce((sum, inst) => sum + inst.remainingAmount, 0);

    console.log(`🚨 Over-collection check for ${selectedInstallment.productName}:`);
    console.log(`   💵 Payment amount: ৳${amount}`);
    console.log(`   💳 Total remaining due: ৳${totalDue}`);

    // ⚠️ PREVENT OVER-COLLECTION: Don't allow payment more than total due
    if (amount > totalDue) {
      toast.error(
        `⚠️ Cannot collect ৳${amount.toLocaleString()}!\n` +
        `Total remaining due for ${selectedInstallment.productName}: ৳${totalDue.toLocaleString()}\n` +
        `Over-collection: ৳${(amount - totalDue).toLocaleString()}`,
        { duration: 5000 }
      );
      return;
    }

    // ✅ Allow overpayment within product due limit (amount can be greater than single installment remaining amount)
    const description = amount > selectedInstallment.remainingAmount
      ? `Payment with overpayment (৳${(amount - selectedInstallment.remainingAmount).toFixed(2)} will be applied to next installment)`
      : 'Partial payment';

    await collectInstallment(selectedInstallment, amount, description);
  };

  // ────────────────────────────────────────────────────────────
  // CORRECTION HANDLERS
  // ────────────────────────────────────────────────────────────
  const handleOpenCorrection = (installment) => {
    setCorrectionInstallment(installment);
    setCorrectionAmount('');
    setCorrectionReason('');
    setShowCorrectionModal(true);
  };

  const handleApplyCorrection = async () => {
    const amount = parseFloat(correctionAmount);
    if (!correctionInstallment) return;

    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid deduction amount');
      return;
    }

    const maxDeduct = correctionInstallment.paidAmount || 0;
    if (amount > maxDeduct) {
      toast.error(`Cannot deduct more than ৳${maxDeduct} (the paid amount)`);
      return;
    }

    if (!correctionReason.trim()) {
      toast.error('Please enter a reason for this correction');
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading('Applying correction...');

    try {
      const response = await installmentsAPI.correct({
        installmentId: correctionInstallment.originalInstallment?._id || correctionInstallment._id,
        memberId: selectedMember._id,
        deductAmount: amount,
        reason: correctionReason.trim()
      });

      toast.dismiss(loadingToast);

      if (response.success) {
        toast.success(`✅ Correction applied: ৳${amount} deducted successfully!`, { duration: 4000 });
        setShowCorrectionModal(false);
        setCorrectionInstallment(null);
        setCorrectionAmount('');
        setCorrectionReason('');

        // Refresh data
        await loadMemberInstallments();
        onInstallmentCollected();

        // Trigger dashboard refresh
        triggerCollectionUpdate({
          memberId: selectedMember._id,
          memberName: selectedMember.name,
          amount: -amount,
          installmentId: correctionInstallment.originalInstallment?._id || correctionInstallment._id,
          status: 'correction',
          collectionDate: new Date().toISOString(),
          note: `Correction: -৳${amount} for ${correctionInstallment.productName}. Reason: ${correctionReason}`
        });
      } else {
        toast.error(response.message || 'Failed to apply correction');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Correction error:', error);
      toast.error('Failed to apply correction. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Function to recalculate due dates for member's installments
  const handleRecalculateDueDates = async () => {
    if (!selectedMember?._id) {
      toast.error('Member not selected');
      return;
    }

    const collectorId = selectedCollector?._id || selectedCollector?.id;
    if (!collectorId) {
      toast.error('Collector not found. Please select a collector.');
      return;
    }

    const loadingToast = toast.loading('Recalculating due dates...');

    try {
      console.log(`🔄 Recalculating due dates for member: ${selectedMember.name} (${selectedMember._id}), collector: ${collectorId}`);

      const response = await installmentsAPI.recalculateDueDates(selectedMember._id, collectorId);
      toast.dismiss(loadingToast);

      if (response.success) {
        toast.success(`✅ ${response.message}`);
        console.log('✅ Due dates updated:', response.data);

        // Reload installments to show updated dates
        await loadMemberInstallments();
      } else {
        toast.error(response.message || 'Failed to recalculate due dates');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error recalculating due dates:', error);
      toast.error('Failed to recalculate due dates. ' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50/80 to-indigo-100/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-blue-100 w-full max-w-7xl h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Collect Installment</h2>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="text-white hover:text-indigo-200 text-2xl font-light transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Member & Branch Info */}
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Member Info */}
            <div className="bg-white rounded-xl p-3 shadow border border-blue-200">
              <div className="flex items-center">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl w-10 h-10 flex items-center justify-center mr-3">
                  <span className="text-lg">👤</span>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">Member</p>
                  <p className="text-gray-800 font-bold text-lg">{selectedMember.name}</p>
                  <p className="text-xs text-gray-500">
                    ID: {selectedMember.memberNumber || selectedMember._id.slice(-6)}
                  </p>
                </div>
              </div>
            </div>

            {/* Branch Info */}
            <div className="bg-white rounded-xl p-3 shadow border border-blue-200">
              <div className="flex items-center">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl w-10 h-10 flex items-center justify-center mr-3">
                  <span className="text-lg">🏢</span>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">Branch</p>
                  <p className="text-gray-800 font-bold text-lg">{selectedBranch.code} - {selectedBranch.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* Installments List */}
        <div className="px-6 pb-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 border-t-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg font-medium">Loading installments...</p>
              <p className="text-gray-500 text-sm mt-2">Please wait while we fetch your installment data</p>
            </div>
          ) : memberInstallments.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">
                  {showHistory ? `${completedProductSales.length} Completed Sales` : `${memberInstallments.length} Installments`}
                </h3>
                <div className="flex items-center space-x-2">
                  {completedProductSales.length > 0 && (
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center space-x-2 shadow hover:shadow-lg text-sm"
                    >
                      <span>{showHistory ? '📋' : '📜'}</span>
                      <span>{showHistory ? 'Active' : 'History'}</span>
                      {!showHistory && completedProductSales.length > 0 && (
                        <span className="bg-white text-orange-600 rounded-full px-2 py-0.5 text-xs font-bold">
                          {completedProductSales.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {showHistory ? (
                // 📜 HISTORY VIEW: Show completed product sales
                <div className="space-y-4">
                  {completedProductSales.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl">
                      <span className="text-6xl mb-4 block">📜</span>
                      <p className="text-gray-600 text-lg font-medium">No completed sales yet</p>
                      <p className="text-gray-500 text-sm mt-2">Completed product sales will appear here</p>
                    </div>
                  ) : (
                    completedProductSales.map((sale, index) => (
                      <div key={sale.distributionId} className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full w-12 h-12 flex items-center justify-center">
                              <span className="text-xl">✅</span>
                            </div>
                            <div>
                              <h4 className="text-xl font-bold text-green-800">{sale.productName}</h4>
                              <p className="text-sm text-green-600">Completed on {sale.completedDate}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-green-700">৳{sale.totalAmount.toLocaleString()}</p>
                            <p className="text-sm text-green-600">{sale.totalInstallments} installments × ৳{sale.installmentAmount}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-green-200">
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-600 mb-1">Total Installments</p>
                            <p className="text-lg font-bold text-gray-800">{sale.totalInstallments}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-600 mb-1">Per Installment</p>
                            <p className="text-lg font-bold text-gray-800">৳{sale.installmentAmount}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-600 mb-1">Status</p>
                            <p className="text-lg font-bold text-green-600">PAID</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (() => {
                // 📋 ACTIVE VIEW: Show pending installments

                // 🎯 CRITICAL: Create stable type numbering across ALL products (active + completed)
                // This ensures type numbers don't change when a product is completed

                // Step 1: Collect ALL products (active + completed) with their distributionIds
                const allProducts = [];

                // Add active products
                const activeProductsMap = {};
                memberInstallments.forEach(installment => {
                  const productName = installment.productName || 'Unknown Product';
                  const distId = installment.distributionId || installment.originalInstallment?.distributionId || `temp_${productName}`;

                  if (!activeProductsMap[distId]) {
                    activeProductsMap[distId] = {
                      productName,
                      distributionId: distId,
                      isActive: true,
                      timestamp: distId.split('-').pop() || '0',
                      installments: []
                    };
                  }
                  activeProductsMap[distId].installments.push(installment);
                });

                // Add completed products
                const completedProductsMap = {};
                completedProductSales.forEach(sale => {
                  const distId = sale.distributionId;
                  completedProductsMap[distId] = {
                    productName: sale.productName,
                    distributionId: distId,
                    isActive: false,
                    timestamp: distId.split('-').pop() || '0',
                    completedSale: sale
                  };
                });

                // Combine all products
                allProducts.push(...Object.values(activeProductsMap), ...Object.values(completedProductsMap));

                // Step 2: Sort ALL products by timestamp to get stable ordering
                allProducts.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

                // Step 3: Create stable type number mapping (distributionId -> typeNumber)
                const productTypeMapping = {};
                allProducts.forEach((product, index) => {
                  productTypeMapping[product.distributionId] = index + 1; // Type 1, Type 2, etc.
                  console.log(`📌 Stable Type ${index + 1}: ${product.productName} (${product.isActive ? 'Active' : 'Completed'})`);
                });

                // Step 4: Group active installments by product name (for display)
                const installmentsByAmount = {};
                memberInstallments.forEach(installment => {
                  const productName = installment.productName || 'Unknown Product';
                  if (!installmentsByAmount[productName]) {
                    installmentsByAmount[productName] = [];
                  }
                  installmentsByAmount[productName].push(installment);
                });

                // Step 5: Sort active products by their stable type numbers
                const amountTypes = Object.keys(installmentsByAmount).sort((a, b) => {
                  const firstInstallmentA = installmentsByAmount[a][0];
                  const firstInstallmentB = installmentsByAmount[b][0];

                  const distIdA = firstInstallmentA.distributionId || firstInstallmentA.originalInstallment?.distributionId || '';
                  const distIdB = firstInstallmentB.distributionId || firstInstallmentB.originalInstallment?.distributionId || '';

                  // Use the stable type numbers from mapping
                  const typeNumA = productTypeMapping[distIdA] || 999;
                  const typeNumB = productTypeMapping[distIdB] || 999;

                  return typeNumA - typeNumB;
                });

                if (amountTypes.length === 1) {
                  // Single type - display in single column
                  const singleType = amountTypes[0];
                  const singleTypeInstallments = installmentsByAmount[singleType];

                  // Renumber for consistent display
                  const renumberedInstallments = singleTypeInstallments.map((installment, index) => ({
                    ...installment,
                    serialNumber: index + 1,
                    installmentNumber: index + 1,
                    totalInstallments: singleTypeInstallments.length
                  }));

                  // Calculate totals
                  const total = singleTypeInstallments.reduce((sum, inst) => sum + inst.amount, 0);
                  // ✅ FIX: Count only collected/partial installments with actual paidAmount
                  // Auto-applied overpayments should not be double-counted
                  // Only count paidAmount from installments that have collectionDate (actual collections)
                  const paid = singleTypeInstallments.reduce((sum, inst) => {
                    // Only count if this installment was actually collected (has paidAmount and is collected/partial)
                    if ((inst.status === 'paid' || inst.status === 'partial' || inst.status === 'collected') && inst.paidAmount > 0) {
                      // For collected installments: use original amount, not paidAmount (to avoid overpayment)
                      // For partial: use actual paidAmount
                      if (inst.status === 'partial') {
                        return sum + (inst.paidAmount || 0);
                      } else {
                        // For paid/collected: use original amount (not overpayment)
                        return sum + inst.amount;
                      }
                    }
                    return sum;
                  }, 0);
                  // Due: total - paid (can go negative if overpaid, but show 0)
                  const due = Math.max(0, total - paid);

                  // ✅ If fully paid (due < 0.01), don't show in active view
                  // Using threshold to handle floating-point precision errors
                  if (due < 0.01) {
                    console.log(`✅ Product "${singleType}" is fully paid. Hiding from active view.`);
                    return (
                      <div className="text-center py-12 bg-gray-50 rounded-xl">
                        <span className="text-6xl mb-4 block">🎉</span>
                        <p className="text-gray-700 text-lg font-bold">All installments paid!</p>
                        <p className="text-gray-600 text-sm mt-2">This product sale has been completed</p>
                      </div>
                    );
                  }

                  // 💰 Calculate savings for single type
                  // ✅ FIX: Use ALL valid savings records for single type view
                  // This ensures no savings are lost if IDs don't match perfectly
                  const savingsRecords = allInstallmentRecords.filter(record => {
                    // Must be extra or savings type
                    if (!(record.installmentType === 'extra' || record.installmentType === 'savings')) {
                      return false;
                    }

                    // Must have a note
                    if (!record.note) {
                      return false;
                    }

                    // Include only actual savings collections, NOT product sale records
                    const isSavingsCollection = record.note.includes('Savings Collection');
                    const isSavingsWithdrawal = record.note.includes('Savings Withdrawal');
                    const isInitialSavings = record.note.includes('Initial Savings');

                    // Exclude product sale records (these are for installment creation, not savings)
                    const isProductSaleRecord = record.note.match(/Product Sale:.+\(Qty:.+\|/);

                    return (isSavingsCollection || isSavingsWithdrawal || isInitialSavings) && !isProductSaleRecord;
                  });

                  console.log('💰 Single type - Total savings records found:', savingsRecords.length);

                  // Calculate TOTAL savings from all records
                  // For single type view, we just sum everything up
                  let singleTypeSavings = savingsRecords.reduce((sum, record) => {
                    const isWithdrawal = record.note.includes('Withdrawal');
                    return sum + (isWithdrawal ? -record.amount : record.amount);
                  }, 0);

                  console.log('💰 Single type total savings:', singleTypeSavings);

                  // Get product name and stable type number
                  const productName = renumberedInstallments[0]?.productName || 'Product';
                  const distId = renumberedInstallments[0]?.distributionId || renumberedInstallments[0]?.originalInstallment?.distributionId;
                  const stableTypeNum = productTypeMapping[distId] || 1;

                  return (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                        <h4 className="text-lg font-bold text-blue-800 mb-3">
                          Type {stableTypeNum}: {productName}
                        </h4>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-gray-700 mb-1 font-semibold">Total</p>
                            <p className="text-sm font-bold text-gray-900">৳{total.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-green-100 to-emerald-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-green-700 mb-1 font-semibold">Paid</p>
                            <p className="text-sm font-bold text-green-800">৳{paid.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-orange-100 to-red-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-orange-700 mb-1 font-semibold">Due</p>
                            <p className="text-sm font-bold text-orange-800">৳{due.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-purple-100 to-pink-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-purple-700 mb-1 font-semibold">💰 Savings</p>
                            <p className="text-sm font-bold text-purple-800">৳{singleTypeSavings.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-sm text-blue-600">
                          {renumberedInstallments.length} installments • ৳{renumberedInstallments[0]?.amount || 0} each
                        </p>
                      </div>
                      {renumberedInstallments.map((installment) => (
                        <InstallmentCard key={installment.id} installment={installment} />
                      ))}
                    </div>
                  );
                }

                // 🎯 NEW: Support for 3+ products - display vertically
                if (amountTypes.length > 2) {
                  console.log(`📊 ${amountTypes.length} products found - displaying vertically`);

                  return (
                    <div className="space-y-6">
                      {amountTypes.map((productName, typeIndex) => {
                        const productInstallments = installmentsByAmount[productName];

                        // Calculate totals for this product
                        const total = productInstallments.reduce((sum, inst) => sum + inst.amount, 0);
                        // ✅ FIX: Use correct paid calculation (same as single type)
                        const paid = productInstallments.reduce((sum, inst) => {
                          if ((inst.status === 'paid' || inst.status === 'partial' || inst.status === 'collected') && inst.paidAmount > 0) {
                            if (inst.status === 'partial') {
                              return sum + (inst.paidAmount || 0);
                            } else {
                              return sum + inst.amount;
                            }
                          }
                          return sum;
                        }, 0);
                        const due = Math.max(0, total - paid);

                        // ✅ Skip if fully paid (due < 0.01)
                        // Using threshold to handle floating-point precision errors
                        if (due < 0.01) {
                          console.log(`✅ Product "${productName}" is fully paid. Hiding from active view.`);
                          return null;
                        }

                        // Renumber installments
                        const renumberedInstallments = productInstallments.map((inst, idx) => ({
                          ...inst,
                          serialNumber: idx + 1,
                          installmentNumber: idx + 1,
                          totalInstallments: productInstallments.length
                        }));

                        // Calculate savings for this product
                        const savingsRecords = allInstallmentRecords.filter(record => {
                          if (!(record.installmentType === 'extra' || record.installmentType === 'savings')) return false;
                          if (!record.note) return false;

                          const isSavingsCollection = record.note.includes('Savings Collection');
                          const isSavingsWithdrawal = record.note.includes('Savings Withdrawal');
                          const isInitialSavings = record.note.includes('Initial Savings');
                          const isProductSaleRecord = record.note.match(/Product Sale:.+\(Qty:.+\|/);

                          return (isSavingsCollection || isSavingsWithdrawal || isInitialSavings) && !isProductSaleRecord;
                        });

                        // Calculate TOTAL savings from all records
                        const totalSavings = savingsRecords.reduce((sum, record) => {
                          const isWithdrawal = record.note.includes('Withdrawal');
                          return sum + (isWithdrawal ? -record.amount : record.amount);
                        }, 0);

                        // Calculate savings for THIS product (explicit match)
                        let productSavings = savingsRecords.reduce((sum, record) => {
                          const belongsToProduct = productInstallments.some(inst => {
                            // Match by distributionId (most reliable)
                            if (record.distributionId && inst.originalInstallment?.distributionId) {
                              return record.distributionId === inst.originalInstallment.distributionId;
                            }
                            // Match by installmentId
                            if (record.installmentId && inst.originalInstallment?._id) {
                              return record.installmentId === inst.originalInstallment._id;
                            }
                            // ✅ FALLBACK: Product name matching (ONLY for ACTIVE products AND orphaned records)
                            if (!record.distributionId && record.note && inst.productName && due > 0.01) {
                              // Case-insensitive match check
                              const noteLower = record.note.toLowerCase();
                              const productLower = inst.productName.toLowerCase().trim();

                              if (noteLower.includes(productLower)) {
                                console.log(`   🎯 ACTIVE Type ${typeIndex + 1} match: ৳${record.amount} → "${inst.productName}"`);
                                return true;
                              }
                            }
                            return false;
                          });

                          if (belongsToProduct) {
                            const isWithdrawal = record.note.includes('Withdrawal');
                            return sum + (isWithdrawal ? -record.amount : record.amount);
                          }
                          return sum;
                        }, 0);

                        // ✅ FIX: Conservation of Savings Logic
                        // If this is Type 1 (index 0), it inherits ALL savings that are NOT matched to other types
                        if (typeIndex === 0) {
                          // Calculate savings explicitly matched to OTHER types
                          let otherTypesSavings = 0;

                          amountTypes.forEach((otherType, otherIdx) => {
                            if (otherIdx === 0) return; // Skip Type 1

                            // Calculate due for this other type to check if it's active
                            const otherInstallments = installmentsByAmount[otherType];
                            const otherTotal = otherInstallments.reduce((s, i) => s + i.amount, 0);
                            const otherPaid = otherInstallments.reduce((s, i) => {
                              if ((i.status === 'paid' || i.status === 'partial' || i.status === 'collected') && i.paidAmount > 0) {
                                return s + (i.status === 'partial' ? i.paidAmount : i.amount);
                              }
                              return s;
                            }, 0);
                            const otherDue = Math.max(0, otherTotal - otherPaid);

                            const otherSavings = savingsRecords.reduce((sum, record) => {
                              const belongsToOther = otherInstallments.some(inst => {
                                // Match by distributionId (most reliable)
                                if (record.distributionId && inst.originalInstallment?.distributionId) {
                                  return record.distributionId === inst.originalInstallment.distributionId;
                                }
                                // Match by installmentId
                                if (record.installmentId && inst.originalInstallment?._id) {
                                  return record.installmentId === inst.originalInstallment._id;
                                }
                                // ✅ FALLBACK: Product name matching (ONLY for ACTIVE products AND orphaned records)
                                if (!record.distributionId && record.note && inst.productName && otherDue > 0.01) {
                                  const noteLower = record.note.toLowerCase();
                                  const productLower = inst.productName.toLowerCase().trim();
                                  if (noteLower.includes(productLower)) {
                                    return true;
                                  }
                                }
                                return false;
                              });

                              if (belongsToOther) {
                                const isWithdrawal = record.note.includes('Withdrawal');
                                return sum + (isWithdrawal ? -record.amount : record.amount);
                              }
                              return sum;
                            }, 0);

                            otherTypesSavings += otherSavings;
                          });

                          // Type 1 gets everything else
                          productSavings = totalSavings - otherTypesSavings;
                          console.log(`💰 Type 1 Savings (Conservation): Total ৳${totalSavings} - Other Types ৳${otherTypesSavings} = ৳${productSavings}`);
                        }

                        // Get stable type number for this product
                        const distId = productInstallments[0]?.distributionId || productInstallments[0]?.originalInstallment?.distributionId;
                        const stableTypeNum = productTypeMapping[distId] || (typeIndex + 1);

                        const colors = [
                          { bg: 'from-blue-50 to-indigo-50', border: 'border-blue-200', text: 'text-blue-800' },
                          { bg: 'from-green-50 to-emerald-50', border: 'border-green-200', text: 'text-green-800' },
                          { bg: 'from-purple-50 to-pink-50', border: 'border-purple-200', text: 'text-purple-800' }
                        ];
                        const color = colors[typeIndex % colors.length];

                        return (
                          <div key={productName} className="space-y-3">
                            <div className={`bg-gradient-to-r ${color.bg} rounded-xl p-4 border ${color.border}`}>
                              <h4 className={`text-lg font-bold ${color.text} mb-3`}>
                                Type {stableTypeNum}: {productName}
                              </h4>
                              <div className="grid grid-cols-4 gap-2 mb-3">
                                <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-2 text-center shadow-sm">
                                  <p className="text-xs text-gray-700 mb-1 font-semibold">Total</p>
                                  <p className="text-sm font-bold text-gray-900">৳{total.toLocaleString()}</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-100 to-emerald-200 rounded-lg p-2 text-center shadow-sm">
                                  <p className="text-xs text-green-700 mb-1 font-semibold">Paid</p>
                                  <p className="text-sm font-bold text-green-800">৳{paid.toLocaleString()}</p>
                                </div>
                                <div className="bg-gradient-to-br from-orange-100 to-red-200 rounded-lg p-2 text-center shadow-sm">
                                  <p className="text-xs text-orange-700 mb-1 font-semibold">Due</p>
                                  <p className="text-sm font-bold text-orange-800">৳{due.toLocaleString()}</p>
                                </div>
                                <div className="bg-gradient-to-br from-purple-100 to-pink-200 rounded-lg p-2 text-center shadow-sm">
                                  <p className="text-xs text-purple-700 mb-1 font-semibold">💰 Savings</p>
                                  <p className="text-sm font-bold text-purple-800">৳{productSavings.toLocaleString()}</p>
                                </div>
                              </div>
                              <p className="text-sm ${color.text}">
                                {renumberedInstallments.length} installments • ৳{productInstallments[0]?.amount || 0} each
                              </p>
                            </div>
                            {renumberedInstallments.map((installment) => (
                              <InstallmentCard key={installment.id} installment={installment} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // Multiple types (exactly 2) - display in two columns with synchronized dates and serial numbers
                const leftType = amountTypes[0];
                const rightType = amountTypes[1];
                const leftInstallments = installmentsByAmount[leftType] || [];
                const rightInstallments = installmentsByAmount[rightType] || [];

                // Extract product names for each type directly from installments
                const getProductNamesForType = (installments) => {
                  // Each installment already has productName field (extracted on line 429-435)
                  // Just collect unique product names from this specific type's installments
                  const productNames = new Set();

                  installments.forEach((installment) => {
                    const name = installment.productName;
                    // Skip generic names, only add specific product names
                    if (name && name !== 'Product Loan' && name !== 'Product' && name.trim().length > 0) {
                      productNames.add(name);
                    }
                  });

                  const uniqueNames = Array.from(productNames);
                  console.log(`🎯 Product names for this type:`, uniqueNames);
                  return uniqueNames;
                };

                const leftProductNames = getProductNamesForType(leftInstallments);
                const rightProductNames = getProductNamesForType(rightInstallments);

                // 🎯 Get stable type numbers for display
                const leftDistId = leftInstallments[0]?.distributionId || leftInstallments[0]?.originalInstallment?.distributionId;
                const rightDistId = rightInstallments[0]?.distributionId || rightInstallments[0]?.originalInstallment?.distributionId;
                const leftTypeNum = productTypeMapping[leftDistId] || 1;
                const rightTypeNum = productTypeMapping[rightDistId] || 2;

                console.log(`🎯 Stable Type Numbers: Left=${leftTypeNum}, Right=${rightTypeNum}`);

                // Get current collector schedule for date synchronization
                const selectedCollectorData = JSON.parse(localStorage.getItem('selectedCollector') || '{}');
                const collectorId = selectedCollectorData.id || selectedCollectorData._id || 'hayat';
                const savedSchedule = localStorage.getItem(`collection_schedule_${collectorId}`);

                let currentScheduleDates = ['02/09/2025', '09/09/2025', '16/09/2025', '23/09/2025', '30/09/2025'];
                if (savedSchedule) {
                  const parsed = JSON.parse(savedSchedule);
                  currentScheduleDates = parsed.collectionDates || currentScheduleDates;
                }

                // DO NOT synchronize dates - keep original dates for each product sale
                // Renumber BOTH left and right installments for consistent display
                const leftInstallmentsWithNumbers = leftInstallments.map((installment, index) => {
                  // Keep the original due date from backend - DO NOT change it
                  return {
                    ...installment,
                    dueDate: installment.dueDate,
                    serialNumber: index + 1,
                    installmentNumber: index + 1,
                    totalInstallments: leftInstallments.length // ✅ Fix: Use group size, not overall total
                  };
                });

                const rightInstallmentsWithNumbers = rightInstallments.map((installment, index) => {
                  // Keep the original due date from backend - DO NOT change it
                  // Each product sale should have its own schedule based on when it was sold
                  return {
                    ...installment,
                    // Keep original dueDate unchanged
                    dueDate: installment.dueDate,
                    // Only update serial numbers for display
                    serialNumber: index + 1,
                    installmentNumber: index + 1,
                    totalInstallments: rightInstallments.length // ✅ Fix: Use group size, not overall total
                  };
                });

                // Calculate totals for each type
                const leftTotal = leftInstallments.reduce((sum, inst) => sum + inst.amount, 0);
                // ✅ FIX: Use correct paid calculation
                const leftPaid = leftInstallments.reduce((sum, inst) => {
                  if ((inst.status === 'paid' || inst.status === 'partial' || inst.status === 'collected') && inst.paidAmount > 0) {
                    if (inst.status === 'partial') {
                      return sum + (inst.paidAmount || 0);
                    } else {
                      return sum + inst.amount;
                    }
                  }
                  return sum;
                }, 0);
                // Due: total - paid (can go negative if overpaid, but show 0)
                const leftDue = Math.max(0, leftTotal - leftPaid);

                const rightTotal = rightInstallments.reduce((sum, inst) => sum + inst.amount, 0);
                // ✅ FIX: Use correct paid calculation
                const rightPaid = rightInstallments.reduce((sum, inst) => {
                  if ((inst.status === 'paid' || inst.status === 'partial' || inst.status === 'collected') && inst.paidAmount > 0) {
                    if (inst.status === 'partial') {
                      return sum + (inst.paidAmount || 0);
                    } else {
                      return sum + inst.amount;
                    }
                  }
                  return sum;
                }, 0);
                // Due: total - paid (can go negative if overpaid, but show 0)
                const rightDue = Math.max(0, rightTotal - rightPaid);

                // ⏲️ Calculate Start Dates to filter out "Ghost" savings from previous sales
                const getProdStart = (insts) => {
                  if (!insts || insts.length === 0) return Date.now();
                  const dates = insts.map(i => {
                    const d = i.saleDate || i.createdAt || i.originalInstallment?.createdAt || i.originalInstallment?.saleDate || i.date;
                    return d ? new Date(d).getTime() : Date.now();
                  });
                  return Math.min(...dates);
                };
                const leftStart = getProdStart(leftInstallments);
                const rightStart = getProdStart(rightInstallments);

                // 💰 Calculate savings collected for each type (Filtering Ghosts)
                const savingsRecords = allInstallmentRecords.filter(record => {
                  if (!(record.installmentType === 'extra' || record.installmentType === 'savings')) return false;
                  if (!record.note) return false;

                  const isSavingsCollection = record.note.includes('Savings Collection');
                  const isSavingsWithdrawal = record.note.includes('Savings Withdrawal');
                  const isInitialSavings = record.note.includes('Initial Savings');
                  const isProductSaleRecord = record.note.match(/Product Sale:.+\(Qty:.+\|/);

                  if (!((isSavingsCollection || isSavingsWithdrawal || isInitialSavings) && !isProductSaleRecord)) return false;

                  // 👻 Ghost Filter REMOVED (Logic moved to matching fallback to allow conservation)

                  return true;
                });

                console.log('💰 Multiple types - Total savings records found:', savingsRecords.length);
                savingsRecords.forEach((record, idx) => {
                  console.log(`   ${idx + 1}. Type: ${record.installmentType}, Amount: ৳${record.amount}, DistId: ${record.distributionId || 'NONE'}, Note: ${record.note?.substring(0, 80)}`);
                });

                // Calculate TOTAL savings from all records
                const totalSavings = savingsRecords.reduce((sum, record) => {
                  const isWithdrawal = record.note.includes('Withdrawal');
                  return sum + (isWithdrawal ? -record.amount : record.amount);
                }, 0);

                // Calculate savings for right type (Type 2) - Explicit Match Only
                const rightSavings = savingsRecords.reduce((sum, record) => {
                  const belongsToRight = rightInstallments.some(inst => {
                    // Method 1: Match by distributionId (most reliable)
                    if (record.distributionId && inst.originalInstallment?.distributionId) {
                      return record.distributionId === inst.originalInstallment.distributionId;
                    }

                    // Method 2: Match by installmentId (for savings collected with specific installment)
                    if (record.installmentId && inst.originalInstallment?._id) {
                      return record.installmentId === inst.originalInstallment._id;
                    }



                    // Method 3: Match by product name in note
                    // ✅ IMPORTANT: Only match by name if this is an ACTIVE product (not completed)
                    //  AND if the record has NO distributionId (orphaned).
                    if (!record.distributionId && record.note && inst.productName && rightDue > 0.01) {
                      const noteLower = record.note.toLowerCase();
                      const productLower = inst.productName.toLowerCase().trim();

                      if (noteLower.includes(productLower)) {
                        // 📅 Date Check: Prevent claiming "Ghost" savings (older than product)
                        const recTime = new Date(record.createdAt || record.collectionDate || Date.now()).getTime();
                        // Buffer (5s) to allow immediate post-sale savings
                        if (recTime < rightStart - 5000) {
                          console.log(`   👻 Ghost skipped (Right): ${record.note}`);
                          return false;
                        }

                        console.log(`   🎯 ACTIVE product name match: ৳${record.amount} → "${inst.productName}"`);
                        return true;
                      }
                    }

                    return false;
                  });

                  if (belongsToRight) {
                    const isWithdrawal = record.note.includes('Withdrawal');
                    return sum + (isWithdrawal ? -record.amount : record.amount);
                  }
                  return sum;
                }, 0);

                // ✅ FIX: Conservation of Savings Logic
                // Left type (Type 1) inherits ALL savings that are NOT matched to Right type (Type 2)
                // This ensures "orphaned" savings are attributed to the first product
                let leftSavings = totalSavings - rightSavings;

                console.log('💰 Savings Calculation (Conservation):');
                console.log(`   - Total Savings: ৳${totalSavings}`);
                console.log(`   - Right (Type 2) Matched: ৳${rightSavings}`);
                console.log(`   - Left (Type 1) Calculated: ৳${leftSavings}`);

                // ✅ Check if products are fully paid (using threshold to handle floating-point precision)
                const leftFullyPaid = leftDue < 0.01;
                const rightFullyPaid = rightDue < 0.01;

                // If both are fully paid, show completion message
                if (leftFullyPaid && rightFullyPaid) {
                  return (
                    <div className="text-center py-12 bg-gray-50 rounded-xl">
                      <span className="text-6xl mb-4 block">🎉</span>
                      <p className="text-gray-700 text-lg font-bold">All installments paid!</p>
                      <p className="text-gray-600 text-sm mt-2">All product sales have been completed</p>
                    </div>
                  );
                }

                // If only one is fully paid, show only the active one
                if (leftFullyPaid) {
                  return (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 rounded-xl p-4 border">
                        <h4 className="text-lg font-bold mb-3 text-orange-800">
                          Type {rightTypeNum}: {rightProductNames.length > 0 ? rightProductNames.join(', ') : 'Product'}
                        </h4>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-gray-700 mb-1 font-semibold">Total</p>
                            <p className="text-sm font-bold text-gray-900">৳{rightTotal.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-green-100 to-emerald-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-green-700 mb-1 font-semibold">Paid</p>
                            <p className="text-sm font-bold text-green-800">৳{rightPaid.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-orange-100 to-red-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-orange-700 mb-1 font-semibold">Due</p>
                            <p className="text-sm font-bold text-orange-800">৳{rightDue.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-purple-100 to-pink-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-purple-700 mb-1 font-semibold">💰 Savings</p>
                            <p className="text-sm font-bold text-purple-800">৳{rightSavings.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-sm text-orange-600">
                          {rightInstallments.length} installments • ৳{rightInstallments[0]?.amount || 0} each
                        </p>
                      </div>
                      {rightInstallmentsWithNumbers.map((installment) => (
                        <InstallmentCard key={installment.id} installment={installment} />
                      ))}
                    </div>
                  );
                }

                if (rightFullyPaid) {
                  return (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 rounded-xl p-4 border">
                        <h4 className="text-lg font-bold mb-3 text-green-800">
                          Type {leftTypeNum}: {leftProductNames.length > 0 ? leftProductNames.join(', ') : 'Product'}
                        </h4>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-gray-700 mb-1 font-semibold">Total</p>
                            <p className="text-sm font-bold text-gray-900">৳{leftTotal.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-green-100 to-emerald-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-green-700 mb-1 font-semibold">Paid</p>
                            <p className="text-sm font-bold text-green-800">৳{leftPaid.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-orange-100 to-red-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-orange-700 mb-1 font-semibold">Due</p>
                            <p className="text-sm font-bold text-orange-800">৳{leftDue.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-purple-100 to-pink-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-purple-700 mb-1 font-semibold">💰 Savings</p>
                            <p className="text-sm font-bold text-purple-800">৳{leftSavings.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-sm text-green-600">
                          {leftInstallmentsWithNumbers.length} installments • ৳{leftInstallmentsWithNumbers[0]?.amount || 0} each
                        </p>
                      </div>
                      {leftInstallmentsWithNumbers.map((installment) => (
                        <InstallmentCard key={installment.id} installment={installment} />
                      ))}
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">


                    {/* Left Column - Type 1 */}
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 rounded-xl p-4 border">
                        <h4 className="text-lg font-bold mb-3 text-green-800">
                          Type {leftTypeNum}: {leftProductNames.length > 0 ? leftProductNames.join(', ') : 'Product'}
                        </h4>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-gray-700 mb-1 font-semibold">Total</p>
                            <p className="text-sm font-bold text-gray-900">৳{leftTotal.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-green-100 to-emerald-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-green-700 mb-1 font-semibold">Paid</p>
                            <p className="text-sm font-bold text-green-800">৳{leftPaid.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-orange-100 to-red-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-orange-700 mb-1 font-semibold">Due</p>
                            <p className="text-sm font-bold text-orange-800">৳{leftDue.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-purple-100 to-pink-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-purple-700 mb-1 font-semibold">💰 Savings</p>
                            <p className="text-sm font-bold text-purple-800">৳{leftSavings.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-sm text-green-600">
                          {leftInstallmentsWithNumbers.length} installments • ৳{leftInstallmentsWithNumbers[0]?.amount || 0} each
                        </p>
                      </div>
                      {leftInstallmentsWithNumbers.map((installment) => (
                        <InstallmentCard key={installment.id} installment={installment} />
                      ))}
                    </div>

                    {/* Right Column - Type 2 with original dates */}
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 rounded-xl p-4 border">
                        <h4 className="text-lg font-bold mb-3 text-orange-800">
                          Type {rightTypeNum}: {rightProductNames.length > 0 ? rightProductNames.join(', ') : 'Product'}
                        </h4>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-gray-700 mb-1 font-semibold">Total</p>
                            <p className="text-sm font-bold text-gray-900">৳{rightTotal.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-green-100 to-emerald-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-green-700 mb-1 font-semibold">Paid</p>
                            <p className="text-sm font-bold text-green-800">৳{rightPaid.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-orange-100 to-red-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-orange-700 mb-1 font-semibold">Due</p>
                            <p className="text-sm font-bold text-orange-800">৳{rightDue.toLocaleString()}</p>
                          </div>
                          <div className="bg-gradient-to-br from-purple-100 to-pink-200 rounded-lg p-2 text-center shadow-sm">
                            <p className="text-xs text-purple-700 mb-1 font-semibold">💰 Savings</p>
                            <p className="text-sm font-bold text-purple-800">৳{rightSavings.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-sm text-orange-600">
                          {rightInstallments.length} installments • ৳{rightInstallments[0]?.amount || 0} each
                        </p>
                      </div>
                      {rightInstallmentsWithNumbers.map((installment) => (
                        <InstallmentCard key={installment.id} installment={installment} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="bg-gradient-to-r from-gray-100 to-blue-100 rounded-full w-24 h-24 mx-auto flex items-center justify-center mb-6">
                <span className="text-4xl">📋</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">No Installments Found</h3>
              <p className="text-gray-600 text-lg mb-6">
                This member doesn't have any product loan installments yet.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
                <button
                  onClick={() => { setSelectedInstallment(null); setSavingsType('in'); setShowSavingsModal(true); }}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  💰 Collect Savings
                </button>
                <button
                  onClick={() => { setSelectedInstallment(null); setSavingsType('out'); setShowSavingsModal(true); }}
                  className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  📤 Withdraw Savings
                </button>
              </div>
              <button
                onClick={onClose}
                className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Loan Payment Modal */}
        {showPartialModal && selectedInstallment && (
          <div className="fixed inset-0 bg-gradient-to-br from-black/30 to-gray-900/30 backdrop-blur-md flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-8 w-full max-w-md mx-4 shadow-2xl border-2 border-blue-200">
              <h3 className="text-2xl font-bold mb-6 text-gray-800">💰 Loan Payment</h3>
              <div className="mb-6">
                <p className="text-gray-600 mb-2 font-medium">
                  {selectedInstallment.productName} - Installment #{selectedInstallment.serialNumber}
                </p>
                <p className="text-gray-600 font-semibold">
                  Total Due: ৳{selectedInstallment.remainingAmount}
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Payment Amount (৳) *
                </label>
                <input
                  type="number"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                  placeholder="Enter payment amount"
                  min="0.01"
                  step="0.01"
                />
                {partialAmount && parseFloat(partialAmount) > 0 && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-blue-800 font-semibold">
                      Collecting: ৳{partialAmount}
                    </p>
                    <p className="text-blue-600">
                      Remaining: ৳{(selectedInstallment.remainingAmount - parseFloat(partialAmount)).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    setShowPartialModal(false);
                    setSelectedInstallment(null);
                    setPartialAmount('');
                  }}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={collectPartialPayment}
                  disabled={!partialAmount || parseFloat(partialAmount) <= 0 || isSubmitting}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 font-semibold transition-all duration-300"
                >
                  {isSubmitting ? 'Processing...' : 'Collect Payment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Savings Collection Modal */}
        {showSavingsModal && (
          <div className="fixed inset-0 bg-gradient-to-br from-black/30 to-gray-900/30 backdrop-blur-md flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-8 w-full max-w-md mx-4 shadow-2xl border-2 border-purple-200">
              <h3 className="text-xl font-bold mb-4 text-gray-800">💰 Savings Transaction</h3>
              <div className="mb-4">
                <p className="text-gray-600 mb-2 font-medium">
                  Member: {selectedMember.name}
                </p>
              </div>

              {/* Savings Type Selection */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  Transaction Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSavingsType('in')}
                    className={`px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${savingsType === 'in'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    💰 Savings In
                  </button>
                  <button
                    onClick={() => setSavingsType('out')}
                    className={`px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${savingsType === 'out'
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    📤 Savings Out
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {savingsType === 'in' ? 'Deposit' : 'Withdrawal'} Amount (৳) *
                </label>
                <input
                  type="number"
                  value={savingsAmount}
                  onChange={(e) => setSavingsAmount(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                  placeholder={`Enter ${savingsType === 'in' ? 'deposit' : 'withdrawal'} amount`}
                  min="0.01"
                  step="0.01"
                />
                {savingsAmount && parseFloat(savingsAmount) > 0 && (
                  <div className={`mt-3 p-3 rounded-xl border ${savingsType === 'in'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-orange-50 border-orange-200'
                    }`}>
                    <p className={`font-semibold ${savingsType === 'in' ? 'text-green-800' : 'text-orange-800'
                      }`}>
                      {savingsType === 'in' ? 'Depositing' : 'Withdrawing'}: ৳{savingsAmount}
                    </p>
                    <p className={`text-sm ${savingsType === 'in' ? 'text-green-600' : 'text-orange-600'
                      }`}>
                      {savingsType === 'in'
                        ? 'This will be added to member savings'
                        : 'This will be deducted from member savings and shown in Sav Out column'}
                    </p>
                    {selectedInstallment && (
                      <p className={`text-xs mt-1 ${savingsType === 'in' ? 'text-green-500' : 'text-orange-500'
                        }`}>
                        Sheet Date: {selectedInstallment.dueDate}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    setShowSavingsModal(false);
                    setSelectedInstallment(null);
                    setSavingsAmount('');
                    setSavingsType('in');
                  }}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={collectSavings}
                  disabled={!savingsAmount || parseFloat(savingsAmount) <= 0 || isSubmitting}
                  className={`flex-1 px-6 py-3 text-white rounded-xl disabled:opacity-50 font-semibold transition-all duration-300 ${savingsType === 'in'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                    : 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700'
                    }`}
                >
                  {isSubmitting ? 'Processing...' : (savingsType === 'in' ? 'Collect Savings' : 'Withdraw Savings')}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ─── CORRECTION MODAL ─── */}
        {showCorrectionModal && correctionInstallment && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-3xl shadow-2xl border border-red-100 w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

              {/* Header */}
              <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 rounded-full p-2">
                      <span className="text-xl">⚡</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Installment Correction</h3>
                      <p className="text-red-100 text-sm">Deduct from collected amount</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowCorrectionModal(false); setCorrectionInstallment(null); }}
                    className="text-white/80 hover:text-white text-2xl font-light"
                  >×</button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Installment Info */}
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-600">Installment</span>
                    <span className="text-sm font-bold text-gray-800">
                      #{correctionInstallment.installmentNumber} — {correctionInstallment.productName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-600">Total Amount</span>
                    <span className="text-sm font-bold text-gray-800">৳{correctionInstallment.amount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-green-700">Already Paid</span>
                    <span className="text-base font-bold text-green-700">৳{correctionInstallment.paidAmount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="h-px bg-red-200 my-1" />
                  <p className="text-xs text-red-600 font-medium">
                    ⚠️ You can deduct up to ৳{correctionInstallment.paidAmount || 0} (the paid amount).
                  </p>
                </div>

                {/* Deduction Amount */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Deduction Amount (৳) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={correctionAmount}
                    onChange={(e) => setCorrectionAmount(e.target.value)}
                    placeholder="Enter amount to deduct"
                    min="1"
                    max={correctionInstallment.paidAmount || 0}
                    step="1"
                    className="w-full px-4 py-3 border-2 border-red-200 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-transparent text-lg font-semibold"
                    autoFocus
                  />
                  {correctionAmount && parseFloat(correctionAmount) > 0 && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-red-700 font-bold text-sm">
                        Will deduct: ৳{parseFloat(correctionAmount).toLocaleString()}
                      </p>
                      <p className="text-red-500 text-xs mt-1">
                        New paid amount: ৳{Math.max(0, (correctionInstallment.paidAmount || 0) - parseFloat(correctionAmount)).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Reason for Correction <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    placeholder="e.g. Collected ৳5100 instead of ৳4500 by mistake"
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-transparent text-sm resize-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => { setShowCorrectionModal(false); setCorrectionInstallment(null); }}
                    className="flex-1 px-5 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCorrection}
                    disabled={
                      isSubmitting ||
                      !correctionAmount ||
                      parseFloat(correctionAmount) <= 0 ||
                      parseFloat(correctionAmount) > (correctionInstallment.paidAmount || 0) ||
                      !correctionReason.trim()
                    }
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-xl font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-red-200"
                  >
                    {isSubmitting ? '⏳ Applying...' : '⚡ Apply Correction'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewCollectInstallmentForm;
