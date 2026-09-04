import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { membersAPI, branchesAPI, installmentsAPI, productsAPI } from '../../utils/api';
import { formatBDDateShort, getCurrentBDDateTime } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import '../../styles/collectionSheet.css';
// 🔄 FORCE RELOAD: 2026-01-13T01:45:00

// Helper function for currency formatting
const formatCurrency = (amount) => {
  const numAmount = Number(amount) || 0;
  return '\u09F3' + numAmount.toString(); // Unicode for Bengali Taka symbol
};

const CollectionSheet = ({ selectedCollector, selectedBranch, selectedDay, onGoBack }) => {
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Loading collection sheet...');
  const [members, setMembers] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [collectorBranches, setCollectorBranches] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // Store all products for unit lookup
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all'); // 'all' or specific branchCode
  // Month filtering state
  const [selectedMonthYear, setSelectedMonthYear] = useState(() => {
    const today = new Date();
    return { month: today.getMonth(), year: today.getFullYear() };
  });
  // NEW: Pagination state for daily schedules (9 dates per page)
  const [currentDatePage, setCurrentDatePage] = useState(0);
  const [isDailySchedule, setIsDailySchedule] = useState(false);
  const DATES_PER_PAGE = 9; // Show 9 dates at a time for daily schedules

  console.log(' CollectionSheet loaded with DATES_PER_PAGE:', DATES_PER_PAGE);

  useEffect(() => {
    // Unified data loading logic
    loadInitialData();
  }, [selectedCollector, selectedBranch]);

  // Event listener for installment collection updates
  useEffect(() => {
    const handleInstallmentCollected = (event) => {
      console.log('💰 Collection Sheet: Installment collected! Refreshing data...', event.detail);
      // Reload data to reflect changes
      setTimeout(() => {
        loadInitialData();
        toast.success('Collection sheet updated!', {
          icon: '🔄',
          duration: 2000
        });
      }, 1500); // Small delay to allow backend processing
    };

    // Listen for collection events
    window.addEventListener('installmentCollected', handleInstallmentCollected);
    window.addEventListener('dashboardReload', handleInstallmentCollected);

    // Cleanup
    return () => {
      window.removeEventListener('installmentCollected', handleInstallmentCollected);
      window.removeEventListener('dashboardReload', handleInstallmentCollected);
    };
  }, [selectedCollector, selectedBranch]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setLoadingProgress(0);

      if (!selectedCollector) {
        setMembers([]);
        return;
      }

      setLoadingMessage('Loading branches and products...');
      setLoadingProgress(25);

      // Fetch all products for unit lookup
      try {
        const productsResponse = await productsAPI.getAll({ limit: 1000 });
        if (productsResponse.success && productsResponse.data) {
          console.log(`📦 Loaded ${productsResponse.data.length} products for unit lookup`);
          setAllProducts(productsResponse.data);
        }
      } catch (err) {
        console.error('❌ Failed to load products:', err);
        // Continue without products (units might be missing)
      }

      // ✅ FIXED: Use selectedBranch if provided, otherwise get all branches
      let branches = [];

      if (selectedBranch) {
        // 🎯 Specific branch selected - only load this branch
        console.log('🎯 Using selected branch:', selectedBranch);
        branches = [{
          branchCode: selectedBranch.code,
          name: selectedBranch.name,
          members: selectedBranch.members || []
        }];
        setCollectorBranches(branches);
        setSelectedBranchFilter(selectedBranch.code); // Auto-filter to this branch
      } else {
        // 📊 Get all branches for the collector
        const branchesResponse = await branchesAPI.getByCollector(selectedCollector.id);
        if (!branchesResponse.success || !branchesResponse.data) {
          setMembers([]);
          return;
        }
        branches = branchesResponse.data;
        setCollectorBranches(branches);

        // Auto-select first branch if not already selected and branches exist
        if (selectedBranchFilter === 'all' && branches.length === 1) {
          setSelectedBranchFilter(branches[0].branchCode);
        }
      }

      let allMembers = [];

      setLoadingMessage('Loading members...');
      setLoadingProgress(60);

      // 2. Get all members from selected/all branches
      console.log(`📊 Loading members from ${branches.length} branch(es):`, branches.map(b => `${b.branchCode}-${b.name}`));
      for (const branch of branches) {
        console.log(`👥 Fetching members for branch ${branch.branchCode} (${branch.name})...`);
        const membersResponse = await membersAPI.getAll({
          branchCode: branch.branchCode,
          limit: 1000, // Get all members
        });

        console.log(`📊 Members API response for ${branch.branchCode}:`, {
          success: membersResponse.success,
          count: membersResponse.data?.length || 0,
          sample: membersResponse.data?.slice(0, 2).map(m => ({ name: m.name, branchCode: m.branchCode }))
        });

        if (membersResponse.success && membersResponse.data) {
          // Add branch information to each member for context
          const membersWithBranch = membersResponse.data.map(member => ({
            ...member,
            branchName: branch.name,
            branchCode: branch.branchCode
          }));
          allMembers.push(...membersWithBranch);
          console.log(`✅ Added ${membersWithBranch.length} members from branch ${branch.branchCode}`);
        } else {
          console.log(`❌ No members found for branch ${branch.branchCode}`);
        }
      }

      console.log(`📈 Total members loaded: ${allMembers.length}`);

      if (allMembers.length === 0) {
        console.log('⚠️ WARNING: No members found! Check if:');
        console.log('1. Members exist in database for branch code:', branches.map(b => b.branchCode));
        console.log('2. Member branchCode field matches branch branchCode');
        console.log('3. Members are active (isActive: true)');
      }

      setLoadingMessage('Loading real database information...');
      setLoadingProgress(70);

      // 3. Get enhanced member data with real database information (optimized batches)
      const enhancedMembers = [];
      const batchSize = 5; // Process 5 members at a time for better performance
      const maxMembers = Math.min(allMembers.length, 50); // Process up to 50 members for balance of speed vs completeness

      for (let i = 0; i < maxMembers; i += batchSize) {
        const batch = allMembers.slice(i, i + batchSize);
        setLoadingMessage(`Loading member details (${i + batch.length}/${maxMembers})...`);
        setLoadingProgress(70 + (i / maxMembers) * 25);

        const batchResults = await Promise.all(
          batch.map(async (member, index) => {
            try {
              // Get detailed member information
              const memberDetailsResponse = await membersAPI.getById(member._id);
              let enhancedMember = { ...member };

              if (memberDetailsResponse.success && memberDetailsResponse.data) {
                const fullMemberData = memberDetailsResponse.data;
                // Fix: Don't use totalSavings from database as it contains product amounts
                // Calculate actual savings from savings-specific fields or set to 0
                const actualSavings = Number(fullMemberData.currentSavings || fullMemberData.savingsBalance || 0);

                enhancedMember = {
                  ...member,
                  // Update with more detailed information from database
                  name: fullMemberData.name || member.name || 'Unknown Member',
                  sponsorName: fullMemberData.sponsorName || fullMemberData.sponsor || fullMemberData.sponser || member.sponsorName || 'N/A',
                  address: fullMemberData.address || fullMemberData.village || fullMemberData.location || fullMemberData.area || member.address || 'N/A',
                  totalSavings: actualSavings,
                  phone: fullMemberData.phone || fullMemberData.mobile || fullMemberData.phoneNumber || member.phone || 'N/A',
                  memberCode: fullMemberData.memberCode || fullMemberData.code || member.memberCode || `${String(i + index + 1).padStart(3, '0')}`,
                  // Additional fields that might be available
                  nidNumber: fullMemberData.nidNumber || fullMemberData.nid || member.nidNumber || 'N/A',
                  joinDate: fullMemberData.joinDate || fullMemberData.createdAt || member.joinDate || 'N/A',
                  branch: fullMemberData.branch || member.branchName || 'N/A',
                  branchCode: fullMemberData.branchCode || member.branchCode || 'N/A'
                };
              }

              // Get installment history - CRITICAL: Use getByMember to get ALL installments for accurate Dofa numbering
              // This matches NewCollectInstallmentForm.jsx logic
              const installmentHistory = await installmentsAPI.getByMember(member._id);
              let installmentData = [];

              if (installmentHistory.success && installmentHistory.data) {
                installmentData = installmentHistory.data;

                if (installmentData.length > 0) {
                  const productInstallments = processInstallmentHistory(installmentData);
                  enhancedMember.productInstallments = productInstallments;

                  // Store all installment records for date-wise collection display
                  enhancedMember.allInstallmentRecords = installmentData;

                  // Calculate total collected amount (loan installments only) - ONLY COLLECTED STATUS
                  // DEFINITIVE FIX: A record is a loan collection if its type is 'regular' and it has been 'collected' or 'partial'.
                  // This is much more reliable than parsing the 'note' field.
                  const loanCollections = installmentData.filter(record =>
                    record.installmentType === 'regular' &&
                    record.status !== 'correction' &&
                    record.paymentMethod !== 'correction' &&
                    record.amount > 0 &&
                    (record.status === 'collected' || record.status === 'partial')
                  );

                  const totalLoanCollected = productInstallments.reduce((sum, product) => {
                    return sum + (product.paidAmount || 0);
                  }, 0);

                  const savingsCollections = installmentData.filter(record =>
                    record.installmentType === 'extra' &&
                    record.note &&
                    record.note.includes('Savings Collection')
                  );

                  const totalSavingsCollected = savingsCollections.reduce((sum, record) => sum + (record.amount || 0), 0);

                  // Debug disabled for performance

                  enhancedMember.totalCollectedAmount = totalLoanCollected;
                  // CRITICAL FIX: Use ONLY backend totalSavings (which already includes all savings calculations)
                  // Backend totalSavings = initial savings + all savings collections - withdrawals
                  // DO NOT add savings collections again here to avoid double counting!
                  const backendTotalSavings = Number(enhancedMember.totalSavings || member.totalSavings || member.savings || 0);
                  // console.log(`💰 [${member.name}] Backend Total Savings: ${backendTotalSavings} (already includes initial + collections - withdrawals)`);
                  enhancedMember.totalSavings = backendTotalSavings; // Use backend value directly
                } else {
                  // ✅ FIX: Even without installment records, keep initial savings
                  const initialSavings = Number(member.totalSavings || member.savings || 0);
                  // console.log(`💰 [${member.name}] No installments yet, but has initial savings: ${initialSavings}`);
                  enhancedMember.productInstallments = [];
                  enhancedMember.allInstallmentRecords = [];
                  enhancedMember.totalCollectedAmount = 0;
                  enhancedMember.totalSavings = initialSavings; // Keep initial savings!
                }
              } else {
                // ✅ FIX: Even without product sales, keep initial savings
                const initialSavings = Number(member.totalSavings || member.savings || 0);
                // console.log(`💰 [${member.name}] No product sales, but has initial savings: ${initialSavings}`);
                enhancedMember.productInstallments = [];
                enhancedMember.allInstallmentRecords = [];
                enhancedMember.totalCollectedAmount = 0;
                enhancedMember.totalSavings = initialSavings; // Keep initial savings!
              }

              return enhancedMember;
            } catch (error) {
              // Return basic member data if enhancement fails
              return {
                ...member,
                productInstallments: [],
                allInstallmentRecords: [],
                memberCode: member.memberCode || `${String(i + index + 1).padStart(3, '0')}`,
                sponsorName: member.sponsorName || member.sponsor || 'N/A',
                address: member.address || member.village || 'N/A',
                phone: member.phone || member.mobile || 'N/A',
                totalSavings: Number(member.totalSavings || member.savings || 0),
                totalCollectedAmount: 0
              };
            }
          })
        );

        enhancedMembers.push(...batchResults);

        // Small delay between batches to prevent server overload
        if (i + batchSize < maxMembers) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Add remaining members with basic data if we have more than maxMembers
      if (allMembers.length > maxMembers) {
        const remainingMembers = allMembers.slice(maxMembers).map((member, index) => ({
          ...member,
          productInstallments: [],
          allInstallmentRecords: [],
          memberCode: member.memberCode || `${String(maxMembers + index + 1).padStart(3, '0')}`,
          sponsorName: member.sponsorName || member.sponsor || 'N/A',
          address: member.address || member.village || 'N/A',
          phone: member.phone || member.mobile || 'N/A',
          totalSavings: Number(member.totalSavings || member.savings || 0),
          totalCollectedAmount: 0
        }));
        enhancedMembers.push(...remainingMembers);
      }

      setLoadingMessage('Collection sheet ready!');
      setLoadingProgress(100);

      setMembers(enhancedMembers);
      setDataLoaded(true);

    } catch (error) {
      toast.error('Failed to load collection sheet data.');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const processInstallmentHistory = (installments) => {
    // ✅ CRITICAL REWRITE: Match NewCollectInstallmentForm.jsx logic exactly to ensure consistent Dofa No (Type)

    // ✅ FIX: Pre-scan ALL installments to find "Product Sale" records and extract metadata (Quantity/Unit)
    // This is needed because the main filter below excludes "Product Sale" records (which are not "Loan" installments)
    const productMetadataMap = {}; // Key: distributionId or productName, Value: { quantity, unit }

    installments.forEach(inst => {
      if (inst.note && inst.note.includes('Product Sale')) {
        // ✅ ROBUST PARSING: Handle multiple products in one note (comma separated)
        // Format example: "Product Sale: Product A (Qty: 1), Product B (Qty: 2 piece)"

        let noteContent = inst.note;
        // Remove "Product Sale:" prefix if present
        const prefixMatch = noteContent.match(/Product Sale:\s*/);
        if (prefixMatch) {
          noteContent = noteContent.substring(prefixMatch[0].length);
        }

        // Split by comma, BUT ignore commas inside parentheses (to handle "Rice (5kg, pack)")
        // Regex Lookahead: split by comma if not followed by closing parenthesis without opening
        const parts = noteContent.split(/,(?![^(]*\))/);

        parts.forEach(part => {
          const trimmedPart = part.trim();
          if (!trimmedPart) return;

          // 1. Extract Quantity/Unit from parenthesis: "Name (Qty: 5 piece)"
          const quantityMatch = trimmedPart.match(/\(Qty:\s*(\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?/i);

          // 2. Extract Name: Everything before the parenthesis (or whole string if no paren)
          let name = trimmedPart;
          let quantity = null;
          let unit = null;

          if (quantityMatch) {
            quantity = quantityMatch[1];
            unit = quantityMatch[2] || null;
            // Name is part before the Qty parenthesis
            const nameMatch = trimmedPart.substring(0, quantityMatch.index).trim();
            name = nameMatch;
          } else {
            // Fallback: If no "Qty:" syntax, try "Name (5 piece)" style
            const simpleParenMatch = trimmedPart.match(/(.+?)\s*\((\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\)/);
            if (simpleParenMatch) {
              name = simpleParenMatch[1].trim();
              quantity = simpleParenMatch[2];
              unit = simpleParenMatch[3];
            }
          }

          // Clean up name (remove trailing special chars if any)
          if (name) {
            const cleanName = name.trim();

            // Store by Name
            if (cleanName) {
              // Only overwrite if we found a quantity (or if it's new)
              if (quantity || !productMetadataMap[cleanName]) {
                productMetadataMap[cleanName] = { quantity, unit };
              }
            }

            // Store by DistributionId ONLY if this is the ONLY product in the note
            // (Otherwise we can't be sure which distId belongs to which product)
            if (parts.length === 1 && inst.distributionId) {
              if (quantity || !productMetadataMap[inst.distributionId]) {
                productMetadataMap[inst.distributionId] = { quantity, unit };
              }
            }
          }
        });
      }
    });

    console.log('📦 Extracted Product Metadata:', productMetadataMap);

    // Step 1: Filter for actual loan installments (like form's loadMemberInstallments)
    const loanInstallments = installments.filter(record => {
      // ❌ NEVER include correction records in the loan installments schedule
      if (record.status === 'correction' || record.amount < 0 || record.installmentType === 'correction' || record.paymentMethod === 'correction') {
        return false;
      }

      const isLoanType = (record.installmentType === 'regular' && record.note && record.note.includes('Product Loan')) ||
        record.installmentType === 'loan';

      if (!isLoanType) return false;

      // Keep partial status
      if (record.status === 'partial') return true;

      // Filter out duplicate collection records
      if (record.status === 'collected' && record.note) {
        const installmentAmtMatch = record.note.match(/InstallmentAmt: ৳(\d+)/);
        if (installmentAmtMatch) {
          const noteInstallmentAmt = parseInt(installmentAmtMatch[1]);
          if (record.amount < noteInstallmentAmt) {
            return false; // Skip duplicate partial completion record
          }
        }
      }
      return true;
    });

    if (loanInstallments.length === 0) return [];

    // Step 2: Sort by due date/creation initially
    const sortedInstallments = loanInstallments.sort((a, b) => {
      const dateA = new Date(a.dueDate || a.createdAt);
      const dateB = new Date(b.dueDate || b.createdAt);
      return dateA - dateB;
    });

    // Step 3: Identify ALL products (Active + Completed) to establish STABLE Dofa Numbers
    // This allows us to say "This is Dofa 6" even if Dofa 1-5 are completed/hidden

    const allProductsMap = {};

    sortedInstallments.forEach(inst => {
      // Use logic similar to form's grouping
      let groupKey = inst.distributionId;
      if (!groupKey || groupKey === 'unknown') {
        // Fallback: group by product name and amount signature to separate different sales of same product
        groupKey = `legacy_${inst.productName}_${inst.amount}`;
      }

      // ✅ FIX: Extract product name AND quantity from note if missing (legacy support)
      let productName = inst.productName;
      let quantity = null;
      let unit = null;

      if ((!productName || productName === 'Product Loan' || productName === 'Unknown Product') && inst.note) {
        // Try to extract product name from note
        const noteMatch = inst.note.match(/Product Loan: (.+?) -/);
        if (noteMatch && noteMatch[1]) {
          productName = noteMatch[1].trim();
        } else if (inst.note.includes('Product Loan')) {
          // Try looser match
          const parts = inst.note.split('-');
          if (parts.length > 1) {
            const potentialName = parts[0].replace('Product Loan:', '').trim();
            if (potentialName.length > 2) productName = potentialName;
          }
        }
      }

      // ✅ NEW: Extract quantity and unit from the note (format: "Qty: 10 pices" or "Qty: 2")
      if (inst.note) {
        // Regex to match: Qty: [number] [optional unit] [comma or paren]
        const quantityMatch = inst.note.match(/Qty:\s*(\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?/i);
        if (quantityMatch) {
          quantity = quantityMatch[1];
          unit = quantityMatch[2] || null; // Unit serves as fallback or null
        }
      }

      if (!productName) productName = 'Unknown Product';

      // ✅ NEW: Look up metadata from our pre-scan map
      if (!quantity && productMetadataMap[groupKey]) {
        quantity = productMetadataMap[groupKey].quantity;
        unit = productMetadataMap[groupKey].unit;
      }
      if (!quantity && productMetadataMap[productName]) {
        quantity = productMetadataMap[productName].quantity;
        unit = productMetadataMap[productName].unit;
      }

      if (!allProductsMap[groupKey]) {
        allProductsMap[groupKey] = {
          productName: productName,
          quantity: quantity, // ✅ NEW: Store quantity from first installment or metadata
          unit: unit, // ✅ NEW: Store unit from first installment or metadata
          distributionId: groupKey,
          // Use the EARLIEST creation time of any installment in this group as the timestamp
          timestamp: new Date(inst.createdAt).getTime(),
          installments: []
        };
      } else {
        // ✅ CRITICAL FIX: If we found quantity/unit in this installment or metadata but didn't have it before
        if (quantity && !allProductsMap[groupKey].quantity) {
          allProductsMap[groupKey].quantity = quantity;
          allProductsMap[groupKey].unit = unit;
        }
      }

      const instTime = new Date(inst.createdAt).getTime();
      if (instTime < allProductsMap[groupKey].timestamp) {
        allProductsMap[groupKey].timestamp = instTime;
      }

      allProductsMap[groupKey].installments.push(inst);
    });

    // Step 4: Sort ALL products by timestamp to get stable ordering (Dofa 1, 2, 3...)
    const allProductsList = Object.values(allProductsMap).sort((a, b) => a.timestamp - b.timestamp);

    // Assign stable Dofa numbers
    allProductsList.forEach((product, index) => {
      product.dofaNo = index + 1; // 1-based index
    });

    // Step 5: Filter to show only RELEVANT products (Active) for the sheet
    const finalProductList = [];

    for (const product of allProductsList) {
      // Filter installments in product to only valid positive loan installments
      const validInstallments = product.installments.filter(inst =>
        inst.status !== 'correction' && inst.amount > 0 && inst.installmentType !== 'correction' && inst.paymentMethod !== 'correction'
      );

      // Calculate paying status
      const total = validInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);

      // Calculate paid amount logic aligned with form
      const paid = validInstallments.reduce((sum, inst) => {
        if ((inst.status === 'paid' || inst.status === 'partial' || inst.status === 'collected') &&
          (inst.paidAmount > 0 || inst.status === 'collected')) { // collected check for old records

          if (inst.status === 'partial') {
            return sum + (inst.paidAmount || 0);
          } else {
            // For paid/collected: use paidAmount if present or original amount
            return sum + (inst.paidAmount !== undefined && inst.paidAmount !== null ? inst.paidAmount : inst.amount);
          }
        }
        return sum;
      }, 0);

      const due = Math.max(0, total - paid);

      // DECISION: Show if Active (due > 0)
      // Using small threshold to handle floating point issues
      if (due > 0.01) {
        // Find generic details from first installment
        const firstInst = validInstallments[0] || product.installments[0];

        // Calculate collection count (transactions)
        const collectionCount = validInstallments.filter(i =>
          i.status === 'paid' || i.status === 'collected' || i.status === 'partial'
        ).length;

        finalProductList.push({
          productName: product.productName,
          quantity: product.quantity, // ✅ NEW: Store quantity for display
          unit: product.unit, // ✅ NEW: Store unit for display
          dofaNo: product.dofaNo, // ✅ THE FIX: Use the stable global index
          distributionId: product.distributionId,
          totalAmount: total,
          paidAmount: paid,
          pendingAmount: due,
          installmentCount: collectionCount,
          totalInstallments: validInstallments.length,
          installmentFrequency: firstInst?.installmentFrequency || 'weekly',
          deliveryDate: firstInst?.saleDate || firstInst?.dueDate || firstInst?.createdAt, // ✅ FIX: Use saleDate (actual sale date) instead of dueDate (first installment date)
          saleId: firstInst?._id,
          note: firstInst?.note,
          // ✅ NEW: Attach metadata map to allow looking up individual quantities for combined products
          metadataMap: productMetadataMap
        });
      }
    }

    return finalProductList;
  };

  // Function to get collection amounts for a specific date and installment amount
  const getCollectionForDateAndAmount = (member, targetDate, installmentAmount) => {
    try {
      // Ensure targetDate is a Date object
      const dateObj = targetDate instanceof Date ? targetDate : new Date(targetDate);

      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        return { loanAmount: 0, savingsInAmount: 0, savingsOutAmount: 0 };
      }

      // Fix timezone issue - use local date instead of UTC
      const targetDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

      // Get all installment records for this member
      const allRecords = member.allInstallmentRecords || [];

      // Calculate amounts for different types
      let loanAmount = 0;           // Product installment payments
      let savingsInAmount = 0;      // Member deposits savings  
      let savingsOutAmount = 0;     // Always 0 - functionality removed

      // Process all records to find matches for this date and amount
      const processedRecordIds = new Set();

      allRecords.forEach(record => {
        if (!record) return;

        // Skip if already processed (prevent duplicates)
        const recordId = record._id || record.id || `${record.amount}-${record.note}-${record.createdAt}`;
        if (processedRecordIds.has(recordId)) {
          return;
        }
        processedRecordIds.add(recordId);

        // Get record date in multiple formats
        let recordDateStr = null;
        const recordDate = record.collectionDate || record.date || record.createdAt;

        if (recordDate) {
          try {
            // Try different date parsing approaches
            const parsedDate = new Date(recordDate);
            if (!isNaN(parsedDate.getTime())) {
              recordDateStr = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
            }
          } catch (e) {
            // Skip invalid dates
            return;
          }
        }

        // Enhanced date matching - try multiple date formats and ranges
        const isDateMatch = recordDateStr === targetDateStr ||
          // Also try to match if within same day but different time
          (recordDate && Math.abs(new Date(recordDate) - dateObj) < 24 * 60 * 60 * 1000);

        if (isDateMatch) {
          const amount = record.amount || 0;
          const note = record.note || '';
          const type = record.installmentType || '';

          // Enhanced Loan installment collections detection - ONLY COLLECTED OR PARTIAL STATUS AND MATCHING AMOUNT
          if (type === 'regular' && (record.status === 'collected' || record.status === 'partial') && note && (
            note.includes('Product Loan') ||
            note.includes('Installment') ||
            note.includes('Full payment') ||
            note.includes('Partial payment') ||
            note.includes('Full Payment') ||
            note.includes('Partial Payment')
          )) {
            // Only include if the amount matches the installment amount (within tolerance)
            const tolerance = Math.max(installmentAmount * 0.3, 50); // Increased to 30% tolerance or minimum ৳50
            const amountDifference = Math.abs(amount - installmentAmount);

            if (amountDifference <= tolerance) {
              loanAmount += amount;
            }
          }
          // Enhanced Savings collections detection - be more specific to avoid loan confusion
          else if (type === 'extra' && note && (
            note.includes('Savings Collection') ||
            note.includes('\u09b8\u099e\u09cd\u099a\u09af\u09bc') ||
            (note.toLowerCase().includes('savings') && !note.includes('Product') && !note.includes('Loan') && !note.includes('Withdrawal'))
          )) {
            savingsInAmount += amount;
          }
          // Savings Out - Only for Savings Withdrawal transactions
          else if (type === 'extra' && note && note.includes('Savings Withdrawal')) {
            savingsOutAmount += amount;
            console.log(`\u2705 [Sav Out] Savings withdrawal found: \u09f3${amount} for ${member.name} on ${targetDateStr}`);
          }
        }
      });

      return { loanAmount, savingsInAmount, savingsOutAmount };
    } catch (error) {
      console.error(`âŒ Error in getCollectionForDateAndAmount for ${member.name}:`, error);
      return { loanAmount: 0, savingsInAmount: 0, savingsOutAmount: 0 };
    }
  };

  // Track collections that have been matched to prevent double-counting across rows
  const matchedCollections = React.useRef(new Set());

  // Function to get product-specific collection amounts
  const getProductSpecificCollection = (member, targetDate, consolidatedProductData, products, isFirstTransaction = false) => {
    try {
      // Ensure targetDate is a Date object
      const dateObj = targetDate instanceof Date ? targetDate : new Date(targetDate);

      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        return { loanAmount: 0, savingsInAmount: 0, savingsOutAmount: 0 };
      }

      // Fix timezone issue - use local date instead of UTC
      const targetDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

      // Get all installment records for this member
      const allRecords = member.allInstallmentRecords || [];

      // 🎯 AUTO-DETECT MONTHLY: Check if installments in this distribution are monthly
      // Group by distributionId and check date gaps
      const distributionDateGaps = {};

      allRecords.forEach(rec => {
        if (rec.distributionId && rec.dueDate) { // ✅ Removed status check
          if (!distributionDateGaps[rec.distributionId]) {
            distributionDateGaps[rec.distributionId] = [];
          }
          distributionDateGaps[rec.distributionId].push(new Date(rec.dueDate));
        }
      });

      // Calculate average gap for each distribution
      const monthlyDistributions = new Set();
      Object.keys(distributionDateGaps).forEach(distId => {
        const dates = distributionDateGaps[distId].sort((a, b) => a - b);
        if (dates.length >= 2) {
          // Calculate average gap in days
          let totalGap = 0;
          for (let i = 1; i < dates.length; i++) {
            const gap = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
            totalGap += gap;
          }
          const avgGap = totalGap / (dates.length - 1);

          // If average gap is >= 25 days, consider it monthly
          if (avgGap >= 25) {
            monthlyDistributions.add(distId);
          }
        }
      });

      console.log('📊 Monthly distributions detected:', Array.from(monthlyDistributions));
      if (monthlyDistributions.size > 0) {
        console.log('✅ Found monthly installments for member:', member.name);
        Object.keys(distributionDateGaps).forEach(distId => {
          if (monthlyDistributions.has(distId)) {
            const dates = distributionDateGaps[distId];
            console.log(`  📅 DistID ${distId}: ${dates.length} installments, dates:`,
              dates.map(d => d.toISOString().split('T')[0]));
          }
        });
      }

      // CRITICAL: Get all distributionIds for products in this row
      // Each product may have a distributionId field that links it to specific installments
      const distributionIds = products
        .map(p => p.distributionId || p.saleId || p._id)
        .filter(Boolean);

      // Removed verbose logs for cleaner console output

      // Special debug for Mehenaj
      if (member.name === 'Mehenaj') {
        console.log(`ðŸ”´ MEHENAJ DEBUG - Checking row for date ${targetDateStr}`);
        console.log(`   ðŸ“‘ Products in this row:`, products);
        console.log(`   ðŸ†” Distribution IDs:`, distributionIds);
        console.log(`   ðŸ“Š All collected/partial loan records:`, allRecords.filter(r =>
          (r.status === 'collected' || r.status === 'partial') &&
          r.installmentType === 'regular' &&
          r.note?.includes('Product Loan')
        ).map(r => ({
          amount: r.amount,
          dueDate: r.dueDate,
          distributionId: r.distributionId,
          note: r.note?.substring(0, 100),
          status: r.status
        })));
      }

      // Calculate amounts for different types
      let loanAmount = 0;           // Product installment payments
      let savingsInAmount = 0;      // Member deposits savings  
      let savingsOutAmount = 0;     // Always 0 - functionality removed

      // Process all records to find matches for this date and product
      const processedRecordIds = new Set();

      allRecords.forEach(record => {
        if (!record) return;

        // Skip correction records (they are not loan installments or savings)
        if (record.status === 'correction' || record.amount < 0 || record.installmentType === 'correction' || record.paymentMethod === 'correction') {
          return;
        }

        // Skip if already processed (prevent duplicates)
        const recordId = record._id || record.id || `${record.amount}-${record.note}-${record.createdAt}`;
        if (processedRecordIds.has(recordId)) {
          return;
        }
        processedRecordIds.add(recordId);

        // Create a unique key for this collection to track cross-row matching
        const collectionKey = `${member._id || member.id}-${targetDateStr}-${recordId}`;

        // Get record details first to determine which date to use
        // CRITICAL: For partial payments, use paidAmount instead of amount
        const amount = (record.paidAmount !== undefined && record.paidAmount > 0)
          ? record.paidAmount
          : (record.amount || 0);
        const note = record.note || '';
        const type = record.installmentType || '';

        // CRITICAL FIX: Use DIFFERENT date matching logic for different transaction types
        // - For LOAN installments: Use DUE DATE (shows when installment was scheduled)
        // - For SAVINGS collections: Use COLLECTION DATE (shows when savings was actually collected)
        // - For AUTO DEDUCTIONS: Use COLLECTION DATE (shows when deduction was processed)
        let recordDateStr = null;
        let recordDate = null;

        // Check if this is a savings collection or deduction
        const isSavingsCollection = type === 'extra' && note && (
          note.includes('Savings Collection') ||
          note.includes('সঞ্চয়') ||
          (note.toLowerCase().includes('savings') && !note.includes('Product') && !note.includes('Loan'))
        );

        const isAutoDeduction = record.paymentMethod === 'savings_deduction' || note.includes('deducted from savings');

        // ✅ KEY FIX: Determine if this is a monthly loan installment
        const isMonthlyLoanRecord = type === 'regular' && note && note.includes('Product Loan') &&
          (record.installmentFrequency === 'monthly' ||
            (monthlyDistributions && monthlyDistributions.has(record.distributionId)));

        // CRITICAL FIX: Use appropriate date based on transaction type
        if (isAutoDeduction) {
          // For auto deductions: Always use COLLECTION DATE (when deduction was processed)
          recordDate = record.collectionDate || record.date || record.createdAt;
        } else if (isMonthlyLoanRecord) {
          // ✅ KEY FIX: For MONTHLY loans (pending, partial, OR collected) → ALWAYS use DUE DATE
          // This ensures partial/collected monthly installments appear in their correct scheduled column
          recordDate = record.dueDate || record.installmentDate || record.collectionDate || record.date || record.createdAt;
        } else if (record.status === 'collected' || record.status === 'partial') {
          // For collected/partial weekly/daily installments: Use COLLECTION DATE (within ±3 day range)
          recordDate = record.collectionDate || record.date || record.createdAt;
        } else {
          // For pending installments: Use DUE DATE (scheduled installment date)
          recordDate = record.dueDate || record.installmentDate || record.collectionDate || record.date || record.createdAt;
        }

        if (recordDate) {
          try {
            const parsedDate = new Date(recordDate);
            if (!isNaN(parsedDate.getTime())) {
              recordDateStr = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;

              // Debug: Log each record's date and type
              if (record.installmentType === 'regular' && record.note?.includes('Product Loan')) {
                console.log(`  ðŸ“ Loan Record: Due=${recordDateStr}, Type=${record.installmentType}, Status=${record.status}, Amount=à§³${record.amount}, CollectionDate=${record.collectionDate ? new Date(record.collectionDate).toISOString().split('T')[0] : 'N/A'}, DistID=${record.distributionId || 'N/A'}`);
              } else if (isSavingsCollection) {
                console.log(`  ðŸ’° [getProductSpecificCollection] Savings Record Found:`, {
                  memberName: member.name,
                  amount: amount,
                  collectionDate: recordDateStr,
                  targetDate: targetDateStr,
                  matches: recordDateStr === targetDateStr,
                  note: note.substring(0, 50)
                });
              }
            }
          } catch (e) {
            return;
          }
        }

        // Match by the appropriate date
        // CRITICAL FIX: Use FLEXIBLE RANGE matching for weekly/daily, EXACT matching for monthly
        // Collection Sheet columns represent collection periods
        // Weekly/Daily: Allow collections within ±3 days of the column date
        // Monthly: EXACT date match only (installment should appear in column matching its exact due date)

        let isDateMatch = false;

        if (recordDateStr) {
          const recordDateObj = new Date(recordDate);
          recordDateObj.setHours(12, 0, 0, 0); // Noon to avoid timezone issues

          const targetDateObj = new Date(targetDateStr);
          targetDateObj.setHours(12, 0, 0, 0);

          // 🎯 CRITICAL: Check if this is a MONTHLY installment
          const isPending = record.status === 'pending';
          const isLoan = type === 'regular' && note && note.includes('Product Loan');
          const isMonthlyInstallment = record.installmentFrequency === 'monthly' ||
            (monthlyDistributions && monthlyDistributions.has(record.distributionId));

          // 🔍 DEBUG: Log monthly detection
          if (isLoan && record.distributionId) {
            console.log(`🔍 Checking installment: DistID=${record.distributionId}, Frequency=${record.installmentFrequency}, InMonthlySet=${monthlyDistributions && monthlyDistributions.has(record.distributionId)}, isMonthly=${isMonthlyInstallment}`);
            console.log(`   Record Date: ${recordDateStr}, Target Date: ${targetDateStr}, Match needed: ${isMonthlyInstallment ? 'EXACT' : 'RANGE'}`);
          }

          // 🎯 NEW LOGIC: Monthly installments = EXACT date match ONLY
          if (isMonthlyInstallment) {
            // Monthly installment: must match EXACT date
            isDateMatch = recordDateStr === targetDateStr;
            if (isDateMatch) {
              console.log(`📅 ✅ MONTHLY EXACT MATCH: ${recordDateStr} === ${targetDateStr} for ${member.name}`);
            } else {
              console.log(`📅 ❌ MONTHLY NO MATCH: ${recordDateStr} !== ${targetDateStr} for ${member.name}`);
            }
          } else if (isPending && isLoan) {
            // Pending weekly/daily loan: exact date
            isDateMatch = recordDateStr === targetDateStr;
          } else {
            // Collected/Partial/Savings: use range (±3 days)
            const rangeStart = new Date(targetDateObj);
            rangeStart.setDate(targetDateObj.getDate() - 3);

            const rangeEnd = new Date(targetDateObj);
            rangeEnd.setDate(targetDateObj.getDate() + 3);

            isDateMatch = recordDateObj >= rangeStart && recordDateObj <= rangeEnd;
          }

          // Debug range matching for collected installments
          if (isDateMatch && type === 'regular' && record.status === 'collected') {
            const daysDiff = Math.round((recordDateObj - targetDateObj) / (1000 * 60 * 60 * 24));
            console.log(`  ✅ DATE MATCH: Record ${recordDateStr} matches column ${targetDateStr} (${daysDiff} days diff, ${isMonthlyInstallment ? 'EXACT (monthly)' : 'range ±3 days'})`);
          }
        }

        if (isDateMatch) {
          // Enhanced Loan installment collections detection with distributionId filtering
          // MODIFIED: Show both COLLECTED/PARTIAL and PENDING installments
          if (type === 'regular' && note && (
            note.includes('Product Loan') ||
            note.includes('Installment') ||
            note.includes('Full payment') ||
            note.includes('Partial payment') ||
            note.includes('Full Payment') ||
            note.includes('Partial Payment')
          )) {
            // CRITICAL FIX: Filter by distributionId to prevent cross-contamination between product rows
            const recordDistributionId = record.distributionId;

            // Debug logging for loan collection detection - SIMPLIFIED FORMAT
            console.log(`ðŸ” LOAN COLLECTION: ${member.name} | Date: ${targetDateStr} | Amount: à§³${amount} | Status: ${record.status}`);
            console.log(`   ðŸ†” Record DistID: ${recordDistributionId || 'NONE'}`);
            console.log(`   ðŸ†” Row DistIDs: ${JSON.stringify(distributionIds)}`);
            console.log(`   ðŸ“ Note: "${note.substring(0, 80)}"`);
            console.log(`   ðŸ“‘ Products: ${products.map(p => p.productName).join(', ')}`);

            // Log collection date info
            const recCollDate = record.collectionDate ? new Date(record.collectionDate).toISOString().split('T')[0] : 'N/A';
            const recDueDate = record.dueDate ? new Date(record.dueDate).toISOString().split('T')[0] : 'N/A';
            console.log(`   ðŸ“… CollectionDate: ${recCollDate} | DueDate: ${recDueDate}`);
            console.log(`   ðŸ” Using date for matching: ${recordDateStr}`);
            console.log(`   ðŸ’° PAYMENT AMOUNT: record.amount=à§³${record.amount}, record.paidAmount=à§³${record.paidAmount || 'N/A'}, using amount=à§³${amount}`);

            // Check if this collection belongs to any of the distributions in this row
            let belongsToThisRow = false;

            // PRIMARY FILTER: Check if record has distributionId and it matches this row
            if (recordDistributionId && distributionIds.includes(recordDistributionId)) {
              belongsToThisRow = true;
              console.log(`   âœ… Distribution ID match found: ${recordDistributionId}`);
            } else if (recordDistributionId) {
              // Check if the distributionId contains any of the product saleIds (for backward compatibility)
              // Backend creates distributionIds like: DIST-{saleId}-{serialNumber}
              // Extract the saleId from the distributionId for matching
              let extractedSaleId = null;
              if (recordDistributionId.startsWith('DIST-')) {
                // Extract saleId from DIST-{saleId}-{serial} format
                const parts = recordDistributionId.split('-');
                if (parts.length >= 2) {
                  extractedSaleId = parts[1]; // Get the saleId part
                }
              }

              console.log(`   ðŸ” Extracted Sale ID from ${recordDistributionId}: ${extractedSaleId}`);

              const matchesSaleId = distributionIds.some(id => {
                // Check direct match
                if (id === recordDistributionId) {
                  console.log(`   âœ… Direct match: ${id} === ${recordDistributionId}`);
                  return true;
                }

                // Check if extracted saleId matches any distribution ID
                if (extractedSaleId && id === extractedSaleId) {
                  console.log(`   âœ… Extracted saleId match: ${id} === ${extractedSaleId}`);
                  return true;
                }

                // Check if recordDistributionId contains this saleId (for DIST-{saleId}-{serial} format)
                if (recordDistributionId.includes(id)) {
                  console.log(`   âœ… Contains match: ${recordDistributionId} contains ${id}`);
                  return true;
                }

                // Check reverse: if this id contains the recordDistributionId
                if (id.includes(recordDistributionId)) {
                  console.log(`   âœ… Reverse contains match: ${id} contains ${recordDistributionId}`);
                  return true;
                }

                // Check if this id contains the extracted saleId
                if (extractedSaleId && id.includes(extractedSaleId)) {
                  console.log(`   âœ… ID contains extracted saleId: ${id} contains ${extractedSaleId}`);
                  return true;
                }

                return false;
              });

              if (matchesSaleId) {
                belongsToThisRow = true;
                console.log(`   âœ… Distribution ID partial match found: ${recordDistributionId} matches saleId in`, distributionIds);
              } else {
                // Record has distributionId but doesn't match this row
                console.log(`   âŒ Distribution ID mismatch: ${recordDistributionId} not in`, distributionIds);

                // CRITICAL FALLBACK: If member has multiple product rows, try to match by product name in note
                // This handles cases where backend uses different distribution IDs than expected
                console.log(`   ðŸ”„ Attempting product name fallback for distribution ID mismatch...`);

                // Extract just the product name (before any parentheses or special chars)
                const productNamesInNote = products.map(p => {
                  const name = p.productName || p.name || '';
                  // Extract name before parentheses: "cal (Qty: 28)" -> "cal"
                  const cleanName = name.split('(')[0].trim().toLowerCase();
                  return cleanName;
                }).filter(n => n.length > 0);

                const noteText = note.toLowerCase();

                console.log(`   ðŸ” Product names (lowercase):`, productNamesInNote);
                console.log(`   ðŸ” Note text (lowercase): "${noteText}"`);

                let foundProductMatch = false;
                for (const productName of productNamesInNote) {
                  console.log(`   ðŸ” Checking product: "${productName}"`);

                  // Check for product name or major keywords from product name
                  const productKeywords = productName.split(' ').filter(w => w.length > 3);
                  console.log(`   ðŸ” Keywords (>3 chars): ${JSON.stringify(productKeywords)}`);

                  if (noteText.includes(productName)) {
                    console.log(`   âœ… Product name found in note: "${productName}"`);
                    foundProductMatch = true;
                    break;
                  } else {
                    console.log(`   âŒ Product name NOT in note: "${productName}"`);
                  }

                  for (const keyword of productKeywords) {
                    if (noteText.includes(keyword)) {
                      console.log(`   âœ… Product keyword found in note: "${keyword}" (from "${productName}")`);
                      foundProductMatch = true;
                      break;
                    }
                  }

                  if (foundProductMatch) break;
                }

                if (foundProductMatch) {
                  belongsToThisRow = true;
                  console.log(`   âœ… Product name fallback successful - accepting collection`);
                } else {
                  // Still no match - reject this collection for this row
                  belongsToThisRow = false;
                }
              }
            } else {
              // FALLBACK: For old records without distributionId, use product name matching
              console.log(`   âš ï¸ No distributionId in record, falling back to product name matching`);
              const productNames = consolidatedProductData.productNames.toLowerCase();
              const noteText = note.toLowerCase();

              // Split product names and check each one
              const productNamesArray = consolidatedProductData.productNames.split(',').map(name => name.trim().toLowerCase());
              console.log(`   ðŸ” Checking product names:`, productNamesArray);

              for (const productName of productNamesArray) {
                if (noteText.includes(productName)) {
                  belongsToThisRow = true;
                  console.log(`   âœ… Product name match found: "${productName}" in note`);
                  break;
                }
              }

              // Additional flexible matching for common product variations
              if (!belongsToThisRow && noteText.includes('product loan')) {
                for (const productName of productNamesArray) {
                  const productWords = productName.split(' ').filter(word => word.length > 2);
                  for (const word of productWords) {
                    if (noteText.includes(word)) {
                      belongsToThisRow = true;
                      console.log(`   âœ… Product word match found: "${word}"`);
                      break;
                    }
                  }
                  if (belongsToThisRow) break;
                }
              }

              // Amount-based matching as last resort - Enhanced for better matching
              if (!belongsToThisRow && consolidatedProductData.totalInstallments > 0) {
                const expectedInstallmentAmount = Math.round(consolidatedProductData.totalAmount / consolidatedProductData.totalInstallments);
                const tolerance = Math.max(expectedInstallmentAmount * 0.5, 200); // Increased tolerance to 50% or à§³200
                const amountDifference = Math.abs(amount - expectedInstallmentAmount);

                console.log(`ðŸ’° Enhanced Amount-based matching:`);
                console.log(`   ðŸ“Š Collection Amount: à§³${amount}`);
                console.log(`   ðŸŽ¯ Expected Amount: à§³${expectedInstallmentAmount}`);
                console.log(`   ðŸ“ Tolerance: Â±à§³${tolerance}`);
                console.log(`   ðŸ“ Difference: à§³${amountDifference}`);
                console.log(`   âœ… Within Tolerance: ${amountDifference <= tolerance}`);

                if (amountDifference <= tolerance) {
                  belongsToThisRow = true;
                  console.log(`   âœ… Enhanced amount-based match found: à§³${amount} â‰ˆ à§³${expectedInstallmentAmount}`);
                } else {
                  // Try matching with other possible installment amounts in this row
                  const alternativeAmounts = products.map(p => {
                    if (p.totalAmount && p.totalInstallments) {
                      return Math.round(p.totalAmount / p.totalInstallments);
                    }
                    return null;
                  }).filter(Boolean);

                  console.log(`   ðŸ” Trying alternative amounts:`, alternativeAmounts);

                  for (const altAmount of alternativeAmounts) {
                    const altDifference = Math.abs(amount - altAmount);
                    const altTolerance = Math.max(altAmount * 0.5, 200);
                    console.log(`     - à§³${altAmount}: diff=à§³${altDifference}, tolerance=à§³${altTolerance}`);

                    if (altDifference <= altTolerance) {
                      belongsToThisRow = true;
                      console.log(`   âœ… Alternative amount match found: à§³${amount} â‰ˆ à§³${altAmount}`);
                      break;
                    }
                  }

                  // Ultra-fallback: If this is a typical loan installment amount and no other row has claimed it
                  // This helps catch cases where collections belong to different sales not shown in current rows
                  if (!belongsToThisRow && amount >= 50 && amount <= 5000 && note.includes('Product Loan')) {
                    // Check if this collection might reasonably belong to this member
                    // Apply more generous matching when distribution IDs don't match visible sales
                    const memberHasAnyProducts = products && products.length > 0 && products.some(p => p.totalAmount && p.totalAmount > 0);

                    if (memberHasAnyProducts) {
                      // Additional check: if this looks like a reasonable installment amount for this member's loans
                      const memberTotalLoanAmounts = products.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
                      const estimatedInstallmentRange = {
                        min: Math.floor(memberTotalLoanAmounts / 50), // Very conservative minimum
                        max: Math.ceil(memberTotalLoanAmounts / 5)    // Very liberal maximum
                      };

                      if (amount >= estimatedInstallmentRange.min && amount <= estimatedInstallmentRange.max) {
                        console.log(`   âš ï¸ Ultra-fallback matching applied for orphaned loan collection`);
                        console.log(`   ðŸ”„ Member has product loans (total: à§³${memberTotalLoanAmounts}), estimated installment range: à§³${estimatedInstallmentRange.min}-à§³${estimatedInstallmentRange.max}`);
                        console.log(`   âœ… Collection amount à§³${amount} falls within estimated range, accepting as match`);
                        belongsToThisRow = true;
                      } else {
                        console.log(`   âŒ Ultra-fallback rejected: à§³${amount} outside estimated range à§³${estimatedInstallmentRange.min}-à§³${estimatedInstallmentRange.max}`);
                      }
                    } else {
                      console.log(`   âŒ Ultra-fallback not applied: member has no product loans`);
                    }
                  }
                }
              }
            }

            if (belongsToThisRow) {
              // Check if this collection has already been matched to another row for this member
              if (!matchedCollections.current.has(collectionKey)) {
                // 🎯 FIX: For PENDING installments, count them as scheduled (show in collection sheet)
                // For COLLECTED/PARTIAL, use paidAmount
                let collectionAmount = 0;

                if (record.status === 'pending') {
                  // Pending: Use full installment amount (scheduled amount)
                  collectionAmount = record.amount || 0;
                  console.log(`📅 PENDING INSTALLMENT: ৳${collectionAmount} (Status: pending, scheduled for this date)`);
                } else if (record.status === 'collected' || record.status === 'paid') {
                  // Collected: Use paidAmount or amount
                  collectionAmount = record.paidAmount || record.amount || 0;
                  console.log(`✅ COLLECTED: ৳${collectionAmount} (Status: ${record.status})`);
                } else if (record.status === 'partial') {
                  // Partial: Use paidAmount only
                  collectionAmount = record.paidAmount || 0;
                  console.log(`⚠️ PARTIAL: ৳${collectionAmount} (Status: partial)`);
                }

                loanAmount += collectionAmount;
                matchedCollections.current.add(collectionKey);
                console.log(`💰 Added ৳${collectionAmount} (Status: ${record.status}) to loan collection for this row. Total: ৳${loanAmount}`);
              } else {
                console.log(`⚠️ Skipping ৳${amount} - already matched to another row for this member`);
              }
            } else {
              console.log(`❌ Collection does not belong to this product row`);
            }
          }
          // Savings collections (product-specific matching)
          else if (type === 'extra' && note && (
            note.includes('Savings Collection') ||
            note.includes('সঞ্চয়') ||
            (note.toLowerCase().includes('savings') && !note.includes('Product') && !note.includes('Loan') && !note.includes('Withdrawal'))
          )) {
            // Check if this savings belongs to this product row
            let savingsBelongsToRow = false;
            const noteText = note.toLowerCase();

            // Method 1: Distribution ID match
            if (record.distributionId && distributionIds.includes(record.distributionId)) {
              savingsBelongsToRow = true;
              console.log(`  âœ… Savings matched by distributionId`);
            }
            // Method 2: Product name in note ("Product: Dal")
            else if (noteText.includes('product:')) {
              const productNamesInRow = products.map(p => {
                const name = p.productName || p.name || '';
                return name.split('(')[0].trim().toLowerCase();
              }).filter(n => n.length > 0);

              if (productNamesInRow.some(productName => noteText.includes(`product: ${productName}`))) {
                savingsBelongsToRow = true;
                console.log(`  âœ… Savings matched by product name in note`);
              }
            }
            // Method 3: Old savings without product info - show only in first row
            else if (!record.distributionId && !noteText.includes('product:')) {
              // Show in first transaction row only (avoid duplication)
              if (isFirstTransaction) {
                savingsBelongsToRow = true;
                console.log(`  âš ï¸ Old savings (no product info) - showing in first row only`);
              }
            }

            if (savingsBelongsToRow) {
              savingsInAmount += amount;
              console.log(`âœ… [getProductSpecificCollection] Savings Added: à§³${amount} for ${member.name} on ${targetDateStr}`);
            } else {
              console.log(`âŒ [getProductSpecificCollection] Savings SKIPPED: à§³${amount} (not for this product row)`);
            }
          }
          // Savings Out - Only for Savings Withdrawal transactions (with product-specific matching)
          else if (type === 'extra' && note && note.includes('Savings Withdrawal')) {
            // Check if this withdrawal belongs to this product row
            let withdrawalBelongsToRow = false;
            const noteText = note.toLowerCase();

            // Method 1: Distribution ID match
            if (record.distributionId && distributionIds.includes(record.distributionId)) {
              withdrawalBelongsToRow = true;
              console.log(`  ✅ Savings Withdrawal matched by distributionId`);
            }
            // Method 2: Product name in note ("Product: Dal")
            else if (noteText.includes('product:')) {
              const productNamesInRow = products.map(p => {
                const name = p.productName || p.name || '';
                return name.split('(')[0].trim().toLowerCase();
              }).filter(n => n.length > 0);

              if (productNamesInRow.some(productName => noteText.includes(`product: ${productName}`))) {
                withdrawalBelongsToRow = true;
                console.log(`  ✅ Savings Withdrawal matched by product name in note`);
              }
            }
            // Method 3: Old withdrawals without product info - show only in first row
            else if (!record.distributionId && !noteText.includes('product:')) {
              // Show in first transaction row only (avoid duplication)
              if (isFirstTransaction) {
                withdrawalBelongsToRow = true;
                console.log(`  ⚠️ Old withdrawal (no product info) - showing in first row only`);
              }
            }

            if (withdrawalBelongsToRow) {
              savingsOutAmount += amount;
              console.log(`✅ [getProductSpecificCollection] Savings Withdrawal Added: ৳${amount} for ${member.name} on ${targetDateStr}`);
            } else {
              console.log(`❌ [getProductSpecificCollection] Savings Withdrawal SKIPPED: ৳${amount} (not for this product row)`);
            }
          }
        }
      });

      return { loanAmount, savingsInAmount, savingsOutAmount };
    } catch (error) {
      console.error(`âŒ Error in getProductSpecificCollection for ${member.name}:`, error);
      return { loanAmount: 0, savingsInAmount: 0, savingsOutAmount: 0 };
    }
  };

  // Function to get collection amounts for a specific date from actual database records
  const getCollectionForDate = (member, targetDate, sectionFilter = null) => {
    try {
      // Ensure targetDate is a Date object
      const dateObj = targetDate instanceof Date ? targetDate : new Date(targetDate);

      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        return { loanAmount: 0, savingsInAmount: 0, savingsOutAmount: 0 };
      }

      // Fix timezone issue - use local date instead of UTC
      const targetDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

      // Get all installment records for this member
      const allRecords = member.allInstallmentRecords || [];

      // Calculate amounts for different types
      let loanAmount = 0;           // Product installment payments
      let savingsInAmount = 0;      // Member deposits savings  
      let savingsOutAmount = 0;     // Always 0 - functionality removed

      // Debug disabled for performance

      // Process all records to find matches for this date - prevent duplicates
      const processedRecordIds = new Set();

      allRecords.forEach(record => {
        if (!record) return;

        // Skip if already processed (prevent duplicates)
        const recordId = record._id || record.id || `${record.amount}-${record.note}-${record.createdAt}`;
        if (processedRecordIds.has(recordId)) {
          return;
        }
        processedRecordIds.add(recordId);

        // Get record details first to determine which date to use
        // CRITICAL: For partial payments, use paidAmount instead of amount
        const amount = (record.paidAmount !== undefined && record.paidAmount > 0)
          ? record.paidAmount
          : (record.amount || 0);
        const note = record.note || '';
        const type = record.installmentType || '';

        // CRITICAL FIX: Use DIFFERENT date matching logic for different transaction types
        // - For LOAN installments: Use DUE DATE (shows when installment was scheduled)
        // - For SAVINGS collections: Use COLLECTION DATE (shows when savings was actually collected)
        // - For AUTO DEDUCTIONS: Use COLLECTION DATE (shows when deduction was processed)
        let recordDateStr = null;
        let recordDate = null;

        // Check if this is a savings collection or auto deduction
        const isSavingsCollection = type === 'extra' && note && (
          note.includes('Savings Collection') ||
          note.includes('সঞ্চয়') ||
          (note.toLowerCase().includes('savings') && !note.includes('Product') && !note.includes('Loan') && !note.includes('Withdrawal'))
        );

        const isAutoDeduction = record.paymentMethod === 'savings_deduction' || note.includes('deducted from savings');

        // Choose date based on transaction type
        if (isAutoDeduction) {
          // For auto deductions: Always use COLLECTION DATE (when deduction was processed)
          recordDate = record.collectionDate || record.date || record.createdAt;
        } else if (isSavingsCollection) {
          // For savings: Use COLLECTION DATE (when it was actually collected)
          recordDate = record.collectionDate || record.date || record.createdAt;
        } else {
          // For loans and others: Use DUE DATE (scheduled installment date)
          recordDate = record.dueDate || record.installmentDate || record.collectionDate || record.date || record.createdAt;
        }

        if (recordDate) {
          try {
            const parsedDate = new Date(recordDate);
            if (!isNaN(parsedDate.getTime())) {
              recordDateStr = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;

              // Debug logging for savings collections
              if (isSavingsCollection) {
                console.log(`ðŸ’° [getCollectionForDate] Savings Collection Found:`, {
                  memberName: member.name,
                  amount: amount,
                  collectionDate: recordDateStr,
                  targetDate: targetDateStr,
                  matches: recordDateStr === targetDateStr,
                  note: note.substring(0, 50)
                });
              }
            }
          } catch (e) {
            // Skip invalid dates
            return;
          }
        }

        // Match by the appropriate date
        // CRITICAL: Only exact date match, no fuzzy matching
        const isDateMatch = recordDateStr === targetDateStr;

        if (isDateMatch) {
          // Enhanced Loan installment collections detection - SUPPORT ALL STATUSES
          if (type === 'regular' && note && (
            note.includes('Product Loan') ||
            note.includes('Installment') ||
            note.includes('Full payment') ||
            note.includes('Partial payment') ||
            note.includes('Mobile') || // Product name matching
            note.includes('Rice') ||
            note.includes('Dal')
          )) {
            // Use backend's paidAmount for calculation
            let collectedAmount = 0;
            if (record.status === 'collected' || record.status === 'paid') {
              collectedAmount = record.paidAmount || record.amount || 0;
            } else if (record.status === 'partial') {
              collectedAmount = record.paidAmount || 0;
            }
            console.log(`✅ [getCollectionForDate] COLLECTION: ৳${collectedAmount} (Status: ${record.status})`);
            loanAmount += collectedAmount;
          }
          // Enhanced Savings collections detection - be more specific to avoid loan confusion
          else if (type === 'extra' && note && (
            note.includes('Savings Collection') ||
            note.includes('সঞ্চয়') ||
            (note.toLowerCase().includes('savings') && !note.includes('Product') && !note.includes('Loan') && !note.includes('Withdrawal'))
          )) {
            savingsInAmount += amount;
            console.log(`✅ [getCollectionForDate] Savings Added: ৳${amount} for ${member.name} on ${targetDateStr}`);
          }
          // Savings Out - Only for Savings Withdrawal transactions
          else if (type === 'extra' && note && note.includes('Savings Withdrawal')) {
            savingsOutAmount += amount;
            console.log(`✅ [getCollectionForDate] Savings withdrawal: ৳${amount} for ${member.name} on ${targetDateStr}`);
          }
        }
      });

      // Debug disabled for performance

      return { loanAmount, savingsInAmount, savingsOutAmount };
    } catch (error) {
      console.error(`âŒ Error in getCollectionForDate for ${member.name}:`, error);
      return { loanAmount: 0, savingsInAmount: 0, savingsOutAmount: 0 };
    }
  };

  const generateInstallmentDates = () => {
    // ✅ STEP 1: Check if this is a daily collector (Daily Kisti)
    let hasDailySchedule = false;

    try {
      // 🎯 CRITICAL FIX: Check collector's collectionType first
      if (selectedCollector?.collectionType === 'daily' || selectedDay?.isDaily) {
        hasDailySchedule = true;
        console.log('✅ DAILY KISTI COLLECTOR DETECTED from collector type!');
      } else {
        // Fallback: Check members' product installments for daily frequency
        console.log('🔍 Checking for daily schedule in', members.length, 'members');

        for (const member of members) {
          if (member.productInstallments && member.productInstallments.length > 0) {
            console.log(`📦 Member ${member.name} has ${member.productInstallments.length} products`);

            for (const product of member.productInstallments) {
              console.log(`  - Product: ${product.productName}, Frequency: ${product.installmentFrequency}`);

              if (product.installmentFrequency === 'daily') {
                hasDailySchedule = true;
                console.log('✅ DAILY SCHEDULE DETECTED from product!');
                break;
              }
            }
            if (hasDailySchedule) break;
          }
        }
      }

      console.log(`📊 Final daily schedule detection result: ${hasDailySchedule}`);
    } catch (error) {
      console.log('❌ Error checking daily schedule:', error);
    }

    // Update state to track if this is daily schedule
    if (hasDailySchedule !== isDailySchedule) {
      console.log(`🔄 Updating isDailySchedule state from ${isDailySchedule} to ${hasDailySchedule}`);
      setIsDailySchedule(hasDailySchedule);
    }

    // ✅ STEP 2: Generate dates based on schedule type
    if (hasDailySchedule) {
      // 📅 DAILY SCHEDULE: Generate all dates in month (excluding Fridays)
      const year = selectedMonthYear.year;
      const month = selectedMonthYear.month;

      // Get number of days in this month
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const dailyDates = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);

        // ✅ Skip Fridays (getDay() === 5)
        if (date.getDay() !== 5) {
          dailyDates.push(date);
        }
      }

      console.log(`📅 Daily schedule detected: Generated ${dailyDates.length} dates (Fridays excluded)`);
      return dailyDates;
    } else {
      // 📅 WEEKLY/MONTHLY SCHEDULE: Use collector's saved schedule
      try {
        const savedSchedule = localStorage.getItem(`collection_schedule_${selectedCollector?.id}`);
        if (savedSchedule) {
          const parsed = JSON.parse(savedSchedule);
          if (parsed.collectionDates && parsed.collectionDates.length > 0) {
            // Convert saved dates to Date objects
            return parsed.collectionDates.map(dateStr => {
              // Parse DD/MM/YYYY format
              const [day, month, year] = dateStr.split('/');
              return new Date(year, month - 1, day);
            });
          }
        }
      } catch (error) {
        console.log('Error loading collector schedule:', error);
      }

      // ✅ FIXED: Generate dates based on selected day of week
      const currentMonth = selectedMonthYear.month;
      const currentYear = selectedMonthYear.year;

      // Get selected day name (e.g., "Saturday")
      const selectedDayName = selectedDay?.name || 'Saturday';

      console.log('📅 Selected Day:', selectedDay);
      console.log('📅 Day Name:', selectedDayName);

      // Map day names to JavaScript day numbers (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const dayNameToNumber = {
        'Sunday': 0,
        'Monday': 1,
        'Tuesday': 2,
        'Wednesday': 3,
        'Thursday': 4,
        'Friday': 5,
        'Saturday': 6
      };

      const targetDayNumber = dayNameToNumber[selectedDayName] !== undefined
        ? dayNameToNumber[selectedDayName]
        : 6; // Default to Saturday

      console.log(`📅 Generating dates for ${selectedDayName} (day ${targetDayNumber}) in ${currentMonth + 1}/${currentYear}`);

      // Generate all dates for this day in the selected month
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const generatedDates = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        if (date.getDay() === targetDayNumber) {
          generatedDates.push(date);
          console.log(`  ✅ Found ${selectedDayName}: ${day}/${currentMonth + 1}/${currentYear}`);
        }
      }

      console.log(`📊 Generated ${generatedDates.length} ${selectedDayName}s for October 2025`);

      return generatedDates;
    }
  };

  // Filter dates by selected month and year
  const filterDatesByMonth = (dates) => {
    return dates.filter(date => {
      return date.getMonth() === selectedMonthYear.month &&
        date.getFullYear() === selectedMonthYear.year;
    });
  };

  // ✅ NEW: Get paginated dates for daily schedule (9 dates per page)
  const getPaginatedDates = (allDates) => {
    if (!isDailySchedule) {
      // Weekly/Monthly: return all dates
      return allDates;
    }

    // Daily: return only current page (9 dates)
    const startIndex = currentDatePage * DATES_PER_PAGE;
    const endIndex = startIndex + DATES_PER_PAGE;
    const paginatedDates = allDates.slice(startIndex, endIndex);

    console.log(`📅 Showing dates ${startIndex + 1}-${startIndex + paginatedDates.length} of ${allDates.length}`);
    return paginatedDates;
  };

  // ✅ NEW: Navigate to previous 9 dates
  const goToPreviousDates = () => {
    if (currentDatePage > 0) {
      setCurrentDatePage(currentDatePage - 1);
    }
  };

  // ✅ NEW: Navigate to next 9 dates
  const goToNextDates = () => {
    const allDates = filterDatesByMonth(generateInstallmentDates());
    const totalPages = Math.ceil(allDates.length / DATES_PER_PAGE);

    if (currentDatePage < totalPages - 1) {
      setCurrentDatePage(currentDatePage + 1);
    }
  };

  // Navigate to previous month
  const goToPreviousMonth = () => {
    setSelectedMonthYear(prev => {
      const newMonth = prev.month === 0 ? 11 : prev.month - 1;
      const newYear = prev.month === 0 ? prev.year - 1 : prev.year;
      return { month: newMonth, year: newYear };
    });
    // Reset date page when changing month
    setCurrentDatePage(0);
  };

  // Navigate to next month
  const goToNextMonth = () => {
    setSelectedMonthYear(prev => {
      const newMonth = prev.month === 11 ? 0 : prev.month + 1;
      const newYear = prev.month === 11 ? prev.year + 1 : prev.year;
      return { month: newMonth, year: newYear };
    });
    // Reset date page when changing month
    setCurrentDatePage(0);
  };

  // Get month name for display
  const getMonthYearDisplay = () => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[selectedMonthYear.month]} ${selectedMonthYear.year}`;
  };

  if (!selectedBranch || !selectedCollector) {
    return (
      <div className="bg-white rounded-3xl shadow-2xl border p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-gray-600">Please select a branch and collector first.</p>
            <button
              onClick={onGoBack}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-3xl shadow-2xl border p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center w-full max-w-md">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">{loadingMessage}</p>
            <p className="text-sm text-blue-600 mt-1">Loading real database information...</p>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 mt-4">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2 font-medium">{Math.round(loadingProgress)}% Complete</p>
            <p className="text-xs text-gray-500 mt-1">Fetching member details, sponsor names, addresses, and product sales...</p>

            <button
              onClick={() => {
                setLoading(false);
                setMembers([]);
              }}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-all"
            >
              Cancel Loading
            </button>
          </div>
        </div>
      </div>
    );
  }

  const allInstallmentDates = generateInstallmentDates();
  const filteredDates = filterDatesByMonth(allInstallmentDates);
  const installmentDates = getPaginatedDates(filteredDates);

  return (
    <div className="bg-white rounded-xl md:rounded-3xl shadow-2xl border p-3 md:p-6 lg:p-8 print:p-0 print:shadow-none print:border-0 print:rounded-none">
      {/* Controls - Back, Branch and Month Selection */}
      <div className="mb-6 no-print">
        <div className="bg-gray-50 rounded-xl p-3 md:p-4 border space-y-3">
          {/* Row 1: Back and Print Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={onGoBack}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-all w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm md:text-base">Back to Selection</span>
            </button>

            {/* Print Button */}
            <button
              onClick={() => window.print()}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all w-full sm:w-auto"
              title="Print Collection Sheet (Legal Size)"
            >
              <Printer className="h-4 w-4" />
              <span className="text-sm md:text-base">Print Sheet</span>
            </button>
          </div>

          {/* Row 2: Branch Filter and Month Navigation */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Branch Filter */}
            <div className="flex items-center space-x-2 flex-1">
              <span className="text-xs md:text-sm font-medium text-gray-700 whitespace-nowrap">Branch:</span>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="flex-1 px-2 md:px-3 py-1.5 md:py-1 bg-white border border-gray-300 rounded-lg text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Branches</option>
                {collectorBranches.map((branch) => (
                  <option key={branch.branchCode} value={branch.branchCode}>
                    ({branch.branchCode}) {branch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Navigation */}
            <div className="flex items-center justify-center space-x-2">
              <button onClick={goToPreviousMonth} className="p-1.5 md:p-2 hover:bg-gray-200 rounded-lg transition-all">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 md:px-3 py-1 bg-white rounded-lg font-medium text-xs md:text-sm border whitespace-nowrap">
                {getMonthYearDisplay()}
              </span>
              <button onClick={goToNextMonth} className="p-1.5 md:p-2 hover:bg-gray-200 rounded-lg transition-all">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Row 3: Daily Schedule Date Navigation (9 dates per page) */}
          {isDailySchedule && (
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 pt-2 border-t">
              <span className="text-xs md:text-sm font-medium text-gray-700 text-center sm:text-left">
                📅 Dates {currentDatePage * DATES_PER_PAGE + 1}-{Math.min((currentDatePage + 1) * DATES_PER_PAGE, filteredDates.length)} of {filteredDates.length}
              </span>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={goToPreviousDates}
                  disabled={currentDatePage === 0}
                  className="flex-1 sm:flex-none px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all text-xs md:text-sm"
                >
                  ← Previous 9
                </button>
                <button
                  onClick={goToNextDates}
                  disabled={currentDatePage >= Math.ceil(filteredDates.length / DATES_PER_PAGE) - 1}
                  className="flex-1 sm:flex-none px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all text-xs md:text-sm"
                >
                  Next 9 →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collection Sheet */}
      <div id="collection-sheet-content" className={isDailySchedule ? 'daily-schedule-sheet' : ''}>
        {/* Members Table */}
        {(() => {
          // Filter members by selected branch
          const filteredMembers = selectedBranchFilter === 'all'
            ? members
            : members.filter(m => m.branchCode === selectedBranchFilter);

          // Filter branches for header display
          const displayBranches = selectedBranchFilter === 'all'
            ? collectorBranches
            : collectorBranches.filter(b => b.branchCode === selectedBranchFilter);

          // Calculate total column count for colspan
          const columnCount = 12 + installmentDates.length;

          return filteredMembers.length > 0 && installmentDates.length > 0 ? (
            <div className="overflow-x-auto print:overflow-visible" style={{ marginTop: '0', paddingTop: '0' }}>
              <table className="w-full border-collapse border border-black text-xs sheet-table">
                <thead>
                  {/* Line 1: Company Title */}
                  <tr className="border-0">
                    <td colSpan={12 + installmentDates.length} className="text-center py-2 border-0">
                      <div className="text-lg font-bold">Satrong Sajghor Traders</div>
                      <div className="text-base">Borobari, Lalmonirhat</div>
                      <div className="text-base font-bold">Collection Sheet - {getMonthYearDisplay()}</div>
                    </td>
                  </tr>
                  {/* Line 2: Somity & Location Info */}
                  <tr className="border-0">
                    <td colSpan={12 + installmentDates.length} className="p-1 border-0">
                      <div className="grid" style={{ gridTemplateColumns: 'minmax(350px, 1fr) auto minmax(350px, 1fr)', alignItems: 'center', width: '100%', padding: '0 1rem' }}>
                        {/* Somity Box - Left Aligned */}
                        <div className="flex justify-start">
                          <div className="border border-black px-2 py-1.5 min-w-[300px]">
                            <div className="font-bold mb-1 text-[14px]">Somity Name & Code:</div>
                            <div className="font-bold text-[16px]">
                              {displayBranches.map((branch, index) => (
                                <span key={branch.branchCode || index}>
                                  {index > 0 && ', '}
                                  ({branch.branchCode}) {branch.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* District, Upazilla, Union - Centered on Page */}
                        <div className="flex gap-2 justify-center">
                          <div className="border border-black px-2 py-1 text-[13px]">
                            <span className="font-bold">District:</span> Lalmonirhat
                          </div>
                          <div className="border border-black px-2 py-1 text-[13px]">
                            <span className="font-bold">Upazilla:</span> Lalmonirhat
                          </div>
                          <div className="border border-black px-2 py-1 text-[13px]">
                            <span className="font-bold">Union:</span> Borobari
                          </div>
                        </div>

                        {/* Right Spacer - Empty to balance the grid */}
                        <div></div>
                      </div>
                    </td>
                  </tr>
                  {/* Line 3: Field Officer & Dates */}
                  <tr className="border-0">
                    <td colSpan={12 + installmentDates.length} className="p-1 border-0">
                      <div className="flex gap-2 justify-center pb-2">
                        <div className="border border-black px-2 py-1 text-[13px]">
                          <span className="font-bold">Field Officer Name:</span> {selectedCollector?.name || 'N/A'}
                        </div>
                        <div className="border border-black px-2 py-1 text-[13px]">
                          <span className="font-bold">Start Date:</span> {installmentDates.length > 0 ? installmentDates[0].toLocaleDateString('en-GB') : 'N/A'}
                        </div>
                        <div className="border border-black px-2 py-1 text-[13px]">
                          <span className="font-bold">Day/Month/Year:</span> {(() => {
                            const today = getCurrentBDDateTime();
                            return today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                          })()}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Table Header Row */}
                  <tr className="bg-gray-200">
                    <th className="border border-black px-1 py-2 text-center font-bold" style={{ width: '30px' }}>S.L</th>
                    <th className="border border-black px-1.5 py-1.5 text-center font-bold" style={{ minWidth: '120px' }}>
                      <div>Member Name</div>
                      <div>& Code</div>
                    </th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '85px' }}>
                      <div>Mobile</div>
                      <div>Number</div>
                    </th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '90px' }}>
                      <div>Sponsor</div>
                      <div>Name</div>
                    </th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '100px' }}>Address</th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '90px' }}>
                      <div>Product</div>
                      <div>Name</div>
                    </th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '65px' }}>
                      <div>Total</div>
                      <div>Amount</div>
                    </th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '60px' }}>
                      <div>Delivery</div>
                      <div>Date</div>
                    </th>
                    <th className="border border-black px-0.5 py-1.5 text-center font-bold" style={{ width: '35px' }}>
                      <div>Dofa</div>
                      <div>No</div>
                    </th>
                    <th className="border border-black px-0.5 py-1.5 text-center font-bold" style={{ width: '35px' }}>
                      <div>Install</div>
                      <div>ment</div>
                    </th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '70px' }}>
                      <div>Total Collected</div>
                      <div>Amount</div>
                    </th>
                    <th className="border border-black px-1 py-1.5 text-center font-bold" style={{ width: '65px' }}>
                      <div>Total</div>
                      <div>Savings</div>
                    </th>
                    {installmentDates.map((date, index) => (
                      <th key={index} className="border border-black px-0.5 py-1.5 text-center font-bold" style={{ minWidth: '115px', maxWidth: '115px' }}>
                        <div className="font-bold mb-0.5 text-[11px]">{formatBDDateShort(date)}</div>
                        <div className="grid grid-cols-3 gap-0">
                          <div className="text-[9px] font-normal bg-red-100 px-0.5 py-0.5 border-r border-black">
                            Loan
                          </div>
                          <div className="text-[9px] font-normal bg-green-100 px-0.5 py-0.5 border-r border-black">
                            Sav In
                          </div>
                          <div className="text-[9px] font-normal bg-orange-100 px-0.5 py-0.5" title="Savings Deducted (Auto + Manual)">
                            Sav Out
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                  {(() => {
                    // ✅ GROUPING LOGIC BASED ON COLLECTOR'S SCHEDULE TYPE
                    let membersWithFrequency;

                    if (isDailySchedule) {
                      // 🔵 DAILY COLLECTOR: সব members-কে "SHORT" group-এ রাখব
                      console.log('📊 Daily collector: All members will be under "SHORT" group');
                      membersWithFrequency = filteredMembers.map(m => ({
                        ...m,
                        _frequency: 'short' // সবাই একই group
                      }));
                    } else {
                      // 🔵 WEEKLY/MONTHLY COLLECTOR: Member-এর frequency অনুযায়ী grouping
                      console.log('📊 Weekly/Monthly collector: Grouping by member frequency');
                      membersWithFrequency = filteredMembers.map(m => ({
                        ...m,
                        _frequency: (m.productInstallments && m.productInstallments.length > 0 &&
                          m.productInstallments.some(p => p.installmentFrequency === 'monthly'))
                          ? 'monthly' : 'weekly'
                      }));
                    }

                    // Sort members
                    const sortedMembers = isDailySchedule
                      ? membersWithFrequency // Daily: no sorting needed (all same group)
                      : membersWithFrequency.sort((a, b) => {
                        // Weekly/Monthly: weekly first, then monthly
                        if (a._frequency === b._frequency) return 0;
                        return a._frequency === 'weekly' ? -1 : 1;
                      });

                    // Render with group headers
                    const tbodies = [];
                    let lastGroup = null;
                    let memberCount = 0; // ✅ Track member count

                    sortedMembers.forEach((member, memberIndex) => {
                      const memberTbodyRows = [];

                      // Insert group header when group changes
                      if (member._frequency !== lastGroup) {
                        // ✅ Group names based on collector type
                        let groupName;
                        if (isDailySchedule) {
                          groupName = 'SHORT'; // Daily collector: শুধু SHORT
                        } else {
                          // Weekly/Monthly collector: JAGORON/AGROSOR
                          groupName = member._frequency === 'weekly' ? 'JAGORON' : 'AGROSOR';
                        }

                        memberTbodyRows.push(
                          <tr key={`group-${member._frequency}`} className="bg-white">
                            <td colSpan={12 + installmentDates.length} className="border border-black py-1.5 font-bold text-black text-sm" style={{ textAlign: 'left', paddingLeft: '140px' }}>
                              {groupName}
                            </td>
                          </tr>
                        );
                        lastGroup = member._frequency;
                      }

                      // Render member rows (keep original logic)
                      const memberRows = (() => {
                        // Clear collection tracking for this member (prevent double-counting only within member's rows)
                        matchedCollections.current.clear();

                        // ✅ FILTER: Remove fully paid products (Total Collected Amount >= Total Amount)
                        let activeProducts = [];

                        // GROUP PRODUCTS BY SALE TRANSACTION: Products from same sale in consecutive rows
                        if (member.productInstallments && member.productInstallments.length > 0) {
                          // 👁️ DEBUG: Log all products before filtering
                          console.log(`📊 Member: ${member.name} - Checking ${member.productInstallments.length} products:`);
                          member.productInstallments.forEach((p, i) => {
                            console.log(`  ${i + 1}. ${p.productName}: Total=৳${p.totalAmount || 0}, Paid=৳${p.paidAmount || 0}, Fully Paid=${(p.paidAmount || 0) >= (p.totalAmount || 0) && (p.totalAmount || 0) > 0}`);
                          });

                          // ✅ UPDATED: Group products by sale transaction ID FIRST, then filter by group status
                          // This ensures that if one product in a bundle is active, ALL products in that bundle are shown
                          const saleTransactionGroups = {};

                          member.productInstallments.forEach(product => {
                            const saleTransactionId = product.saleTransactionId || `LEGACY-${product.saleId}`;
                            if (!saleTransactionGroups[saleTransactionId]) {
                              saleTransactionGroups[saleTransactionId] = [];
                            }
                            saleTransactionGroups[saleTransactionId].push(product);
                          });

                          // Filter groups: Keep group if AT LEAST ONE product is NOT fully paid
                          const activeTransactionGroups = [];
                          const completedTransactionGroups = []; // 🆕 Store completed groups for savings transfer

                          Object.entries(saleTransactionGroups).forEach(([id, products]) => {
                            const isGroupFullyPaid = products.every(p => {
                              const total = p.totalAmount || 0;
                              const paid = p.paidAmount || 0;
                              return paid >= total && total > 0;
                            });

                            if (!isGroupFullyPaid) {
                              activeTransactionGroups.push([id, products]);
                            } else {
                              console.log(`🔒 Transaction fully paid - removing from sheet: ${id}`);
                              completedTransactionGroups.push([id, products]); // 🆕 Save for savings transfer
                            }
                          });



                          // Sort transaction groups
                          const sortedTransactionGroups = activeTransactionGroups
                            .sort(([, productsA], [, productsB]) => {
                              const dateA = new Date(productsA[0].deliveryDate);
                              const dateB = new Date(productsB[0].deliveryDate);
                              return dateA - dateB;
                            });

                          if (sortedTransactionGroups.length === 0) {
                            console.log(`💰 All product groups fully paid for ${member.name} - showing as No Product member (savings only)`);
                          }

                          // Only process products if there are active transaction groups
                          if (sortedTransactionGroups.length > 0) {

                            // Create rows for all products, grouped by transaction
                            const memberRows = []; // ✅ Use memberRows instead to avoid shadowing main allRows
                            let totalProductIndex = 0;

                            // ✅ PRE-CALCULATION: Calculate savings for all rows to distribute total savings correctly
                            const rowSavingsMap = {};
                            let totalSpecificSavings = 0;

                            sortedTransactionGroups.forEach(([saleTransactionId, products], index) => {
                              const rowProductNames = products.map(p => (p.productName || '').toLowerCase().split('(')[0].trim());
                              const rowDistributionIds = products.map(p => p.distributionId).filter(Boolean);
                              const allRecords = member.allInstallmentRecords || [];

                              // ✅ UPDATED: Use NewCollectInstallmentForm's exact matching logic
                              // Get all savings records (collections, withdrawals, initial)
                              const savingsRecords = allRecords.filter(record => {
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

                              // Calculate savings for THIS product row using same logic as NewCollectInstallmentForm
                              let rowSavingsIn = 0;
                              let rowSavingsOut = 0;

                              savingsRecords.forEach((record) => {
                                const isWithdrawal = record.note && record.note.includes('Withdrawal');
                                const amount = record.amount || 0;

                                // ✅ USING EXACT SAME LOGIC AS DISPLAY CALCULATION
                                const belongsToThisProduct = products.some(inst => {
                                  // Method 1: Match by distributionId (most reliable)
                                  if (record.distributionId && inst.distributionId) {
                                    if (record.distributionId === inst.distributionId) {
                                      // ✅ Skip completed sales (their savings will be "unmatched")
                                      const isCompleted = (inst.pendingAmount !== undefined && inst.pendingAmount <= 0) ||
                                        (inst.paidAmount !== undefined && inst.totalAmount !== undefined && inst.paidAmount >= inst.totalAmount);

                                      if (isCompleted) {
                                        console.log(`  [First Loop] ⏭️ Skipping completed ${inst.productName} - savings will transfer`);
                                        return false;
                                      }
                                      return true;
                                    }
                                  }

                                  // Method 2: Match by saleId
                                  if (record.distributionId && inst.saleId) {
                                    if (record.distributionId === inst.saleId) {
                                      // ✅ Skip completed sales
                                      const isCompleted = (inst.pendingAmount !== undefined && inst.pendingAmount <= 0) ||
                                        (inst.paidAmount !== undefined && inst.totalAmount !== undefined && inst.paidAmount >= inst.totalAmount);

                                      if (isCompleted) {
                                        console.log(`  [First Loop] ⏭️ Skipping completed ${inst.productName}`);
                                        return false;
                                      }
                                      return true;
                                    }
                                  }

                                  // Method 3: Match by installment amount in note
                                  const installmentAmount = inst.totalAmount / inst.totalInstallments;
                                  if (record.note && record.note.includes(`InstallmentAmt: ৳${installmentAmount}`)) {
                                    return true;
                                  }

                                  // Method 4: Match by product name in note
                                  // ✅ CRITICAL: Also check if completed (for same product re-sales)
                                  if (!record.distributionId && record.note && inst.productName) {
                                    // Skip completed sales
                                    const isCompleted = (inst.pendingAmount !== undefined && inst.pendingAmount <= 0) ||
                                      (inst.paidAmount !== undefined && inst.totalAmount !== undefined && inst.paidAmount >= inst.totalAmount);

                                    if (isCompleted) {
                                      console.log(`  [First Loop Method 4] ⏭️ Skipping completed ${inst.productName}`);
                                      return false;
                                    }

                                    const cleanProductName = inst.productName.split('(')[0].trim();
                                    if (record.note.includes(cleanProductName)) {
                                      return true;
                                    }
                                  }

                                  return false;
                                });

                                if (belongsToThisProduct) {
                                  if (isWithdrawal) {
                                    rowSavingsOut += amount;
                                    console.log(`💔 [WITHDRAWAL] ${member.name} - ${products[0]?.productName}: ৳${amount} withdrawn`);
                                  } else {
                                    rowSavingsIn += amount;
                                    console.log(`💚 [COLLECTION] ${member.name} - ${products[0]?.productName}: ৳${amount} collected`);
                                  }
                                }
                              });

                              const netSavings = Math.max(0, rowSavingsIn - rowSavingsOut);
                              console.log(`📊 Row ${index} (${products[0]?.productName}): In=৳${rowSavingsIn}, Out=৳${rowSavingsOut}, Net=৳${netSavings}`);
                              rowSavingsMap[index] = netSavings;
                              totalSpecificSavings += netSavings;
                            });

                            // Calculate unmatched savings for logging (will be added in display calculation)
                            const backendTotalSavings = Number(member.totalSavings || 0);
                            const unmatchedSavings = Math.max(0, backendTotalSavings - totalSpecificSavings);

                            // Calculate remainder (should be 0 if everything matched)
                            const remainingSavings = Math.max(0, backendTotalSavings - totalSpecificSavings);

                            console.log(`💰 Savings Distribution for ${member.name}: Backend Total=৳${backendTotalSavings}, Matched=৳${totalSpecificSavings}, Unmatched=৳${unmatchedSavings}, Remainder=৳${remainingSavings}`);

                            sortedTransactionGroups.forEach(([saleTransactionId, products], transactionIndex) => {
                              // DEBUG: Log product details
                              console.log(`ðŸ“¦ Transaction ${saleTransactionId}:`, products.map(p => ({
                                name: p.productName,
                                totalInstallments: p.totalInstallments,
                                installmentCount: p.installmentCount
                              })));

                              // Calculate total collected amount for THIS ROW ONLY (not all member collections)
                              const rowDistributionIds = products.map(p => p.distributionId || p.saleId || p._id).filter(Boolean);

                              // ✅ NEW LOGIC: Match NewCollectInstallmentForm's savings calculation exactly
                              // Get all savings records (collections, withdrawals, initial)
                              const savingsRecords = (member.allInstallmentRecords || []).filter(record => {
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

                              console.log(`💰 Total savings records for ${member.name}:`, savingsRecords.length);

                              // Calculate savings for THIS product row using same logic as NewCollectInstallmentForm
                              let productSavingsIn = 0;
                              let productSavingsOut = 0;

                              savingsRecords.forEach((record, idx) => {
                                const isWithdrawal = record.note && record.note.includes('Withdrawal');
                                const amount = record.amount || 0;

                                // Check if this savings belongs to THIS product row
                                const belongsToThisProduct = products.some(inst => {
                                  // Method 1: Match by distributionId (most reliable)
                                  // ✅ NO COMPLETION CHECK - completed sales' savings should transfer
                                  if (record.distributionId && inst.distributionId) {
                                    const match = record.distributionId === inst.distributionId;
                                    if (match) {
                                      console.log(`  ✅ Matched by distributionId: ${record.distributionId}`);
                                      return true;
                                    }
                                  }

                                  // Method 2: Match by saleId
                                  // ✅ NO COMPLETION CHECK - completed sales' savings should transfer
                                  if (record.distributionId && inst.saleId) {
                                    const match = record.distributionId === inst.saleId;
                                    if (match) {
                                      console.log(`  ✅ Matched by saleId: ${inst.saleId}`);
                                      return true;
                                    }
                                  }

                                  // Method 3: Match by installment amount in note
                                  const installmentAmount = inst.totalAmount / inst.totalInstallments;
                                  if (record.note && record.note.includes(`InstallmentAmt: ৳${installmentAmount}`)) {
                                    console.log(`  ✅ Matched by InstallmentAmt in note`);
                                    return true;
                                  }


                                  // Method 4: Match by product name in note
                                  // ⚠️ FALLBACK for old records without distributionId
                                  // ✅ ONLY HERE: Check if product is completed (for old records)
                                  if (!record.distributionId && record.note && inst.productName) {
                                    // For old records, only match if product is ACTIVE
                                    const isCompleted = (inst.pendingAmount !== undefined && inst.pendingAmount <= 0) ||
                                      (inst.paidAmount !== undefined && inst.totalAmount !== undefined && inst.paidAmount >= inst.totalAmount);

                                    if (isCompleted) {
                                      console.log(`  ⏭️ Skipping old record for completed product: ${inst.productName}`);
                                      return false;
                                    }

                                    const cleanProductName = inst.productName.split('(')[0].trim();
                                    const productNameInNote = record.note.includes(cleanProductName);
                                    if (productNameInNote) {
                                      console.log(`  ⚠️ Matched by product name (old record): ${cleanProductName}`);
                                      return true;
                                    }
                                  }

                                  return false;
                                });

                                if (belongsToThisProduct) {
                                  if (isWithdrawal) {
                                    productSavingsOut += amount;
                                    console.log(`  💔 Withdrawal: ৳${amount}`);
                                  } else {
                                    productSavingsIn += amount;
                                    console.log(`  💚 Collection: ৳${amount}`);
                                  }
                                }
                              });

                              // Net savings for this product row (In - Out)
                              const productSavings = Math.max(0, productSavingsIn - productSavingsOut);

                              console.log(`💰 Product Savings for ${member.name} (Transaction: ${saleTransactionId}):`);
                              console.log(`   💚 Savings In: ৳${productSavingsIn}`);
                              console.log(`   💔 Savings Out: ৳${productSavingsOut}`);
                              console.log(`   💵 Net Savings: ৳${productSavings}`);

                              // ✅ FIX: Calculate total collected amount for THIS ROW's products only
                              const totalCollectedAmount = products.reduce((sum, product) => {
                                return sum + (product.paidAmount || 0);
                              }, 0);

                              console.log(`💰 Row Collected Amount for ${member.name} (Transaction: ${saleTransactionId}):`);
                              console.log(`   🆔 Row Distribution IDs:`, rowDistributionIds);
                              console.log(`   📦 Products in row:`, products.map(p => `${p.productName} (Paid: ৳${p.paidAmount || 0})`));
                              console.log(`   💵 Total Collected for this row: ৳${totalCollectedAmount}`);

                              // Get the maximum installment count from products (already calculated in processInstallmentHistory)
                              console.log('🔢 Dofa & Installment Debug:', products.map(p => ({
                                name: p.productName,
                                dofaNo: p.dofaNo,
                                installmentCount: p.installmentCount,
                                paidAmount: p.paidAmount,
                                distributionId: p.distributionId
                              })));
                              const paidInstallmentCount = Math.max(...products.map(p => p.installmentCount || 0), 0);


                              // ✅ SIMPLE APPROACH: Match NewCollectInstallmentForm
                              // First row = Total member savings - other active rows' savings
                              // Other rows = Their product-specific savings only
                              let savingsForThisRow;

                              if (transactionIndex === 0) {
                                // First product gets: Total - (sum of all other active products' savings)
                                const backendTotalSavings = Number(member.totalSavings || 0);

                                // Calculate savings for OTHER rows (excluding this first row)
                                let otherRowsSavingsTotal = 0;
                                for (let i = 1; i < sortedTransactionGroups.length; i++) {
                                  const otherRowSavings = rowSavingsMap[i] || 0;
                                  otherRowsSavingsTotal += otherRowSavings;
                                }

                                savingsForThisRow = Math.max(0, backendTotalSavings - otherRowsSavingsTotal);

                                console.log(`💰 FIRST ROW Savings: Total=৳${backendTotalSavings} - Others=৳${otherRowsSavingsTotal} = ৳${savingsForThisRow}`);
                              } else {
                                // Other rows: just their product-specific savings
                                savingsForThisRow = productSavings;
                                console.log(`💰 Row ${transactionIndex} Savings: ৳${savingsForThisRow} (product-specific)`);
                              }

                              // Consolidate all products from this transaction into one row
                              const consolidatedProductData = {
                                // Extract clean product names without quantity/price details
                                productNames: products.map(p => {
                                  const fullName = p.productName || p.name || 'Unknown Product';
                                  // Remove everything after '(' to get just the product name
                                  const cleanName = fullName.split('(')[0].trim();

                                  // ✅ NEW: Handle Combined Product Names (comma separated)
                                  if (cleanName.includes(',')) {
                                    // Split combined name: "Jalalabad tin 35mm, Chofa"
                                    const parts = cleanName.split(',').map(part => part.trim());
                                    const formattedParts = parts.map(partName => {
                                      // Lookup metadata for this specific part
                                      const meta = p.metadataMap ? p.metadataMap[partName] : null;
                                      const partQty = meta?.quantity || 1; // Default to 1
                                      const partUnit = meta?.unit || p.unit || 'piece';

                                      // If we have metadata (or default 1), show it
                                      // Note: We force show quantity for ALL parts of a combined product
                                      if (meta?.unit) {
                                        return `${partName} (${partQty} ${meta.unit})`;
                                      } else {
                                        // Fallback unit lookup
                                        const productInfo = allProducts.find(prod => prod.name === partName);
                                        const unit = productInfo?.unit || 'piece';
                                        return `${partName} (${partQty} ${unit})`;
                                      }
                                    });
                                    return formattedParts.join(', ');
                                  }

                                  // Standard Single Product Logic
                                  const displayQty = p.quantity || 1; // Default to 1 if missing

                                  if (p.unit) {
                                    return `${cleanName} (${displayQty} ${p.unit})`;
                                  } else {
                                    // Fallback: Lookup unit from allProducts
                                    const productInfo = allProducts.find(prod => prod.name === cleanName);
                                    const unit = productInfo?.unit || 'piece';
                                    return `${cleanName} (${displayQty} ${unit})`;
                                  }
                                }).join(', '),
                                totalAmount: products.reduce((sum, p) => sum + (p.totalAmount || 0), 0),
                                // Use the maximum installment count from all products in this transaction
                                // This handles cases where products have different installment counts
                                totalInstallments: Math.max(...products.map(p => p.totalInstallments || p.installmentCount || 0)),
                                installmentCount: paidInstallmentCount, // Number of paid installments
                                paidAmount: totalCollectedAmount, // Total across all dates
                                totalSavings: savingsForThisRow, // Initial + 1st sale savings (row 1), or only this sale savings (other rows)
                                deliveryDate: products[0].deliveryDate, // Use first product's delivery date
                                // ✅ FIX: Use the pre-calculated dofaNo from the first product in this transaction
                                // The dofaNo was already assigned sequentially (1, 2, 3, 4...) in processInstallmentHistory
                                dofaNumber: products[0]?.dofaNo || (transactionIndex + 1) // Fallback to transactionIndex if dofaNo not found
                              };

                              memberRows.push(
                                <tr
                                  key={`${member._id}-${saleTransactionId}`}
                                  className="h-8"
                                >
                                  {/* Show member details only in first transaction row */}
                                  {transactionIndex === 0 && (
                                    <>
                                      <td rowSpan={sortedTransactionGroups.length} className="border border-black px-1 py-1 text-center font-medium text-xs">{memberIndex + 1}</td>
                                      <td rowSpan={sortedTransactionGroups.length} className="border border-black px-1.5 py-1 text-xs">
                                        <div className="font-medium">
                                          ({member.memberCode || String(memberIndex + 1).padStart(3, '0')}) {member.name}
                                        </div>
                                      </td>
                                      <td rowSpan={sortedTransactionGroups.length} className="border border-black px-1 py-1 text-center text-[11px]">
                                        {member.phone}
                                      </td>
                                      <td rowSpan={sortedTransactionGroups.length} className="border border-black px-1 py-1 text-center text-[11px]">
                                        {member.sponsorName || 'N/A'}
                                      </td>
                                      <td rowSpan={sortedTransactionGroups.length} className="border border-black px-1 py-1 text-[11px]">
                                        {member.address || member.village || 'N/A'}
                                      </td>
                                    </>
                                  )}

                                  {/* Consolidated product details for this transaction */}
                                  <td className="border border-black px-1 py-1 text-center font-medium text-[11px]">
                                    {consolidatedProductData.productNames}
                                  </td>
                                  <td className="border border-black px-1 py-1 text-center font-medium text-[11px]">
                                    {formatCurrency(consolidatedProductData.totalAmount)}
                                  </td>
                                  <td className="border border-black px-1 py-1 text-center text-[10px]">
                                    {consolidatedProductData.deliveryDate ? formatBDDateShort(consolidatedProductData.deliveryDate) : 'N/A'}
                                  </td>
                                  <td className="border border-black px-0.5 py-1 text-center text-[11px]">
                                    {consolidatedProductData.dofaNumber}
                                  </td>
                                  <td className="border border-black px-0.5 py-1 text-center text-[11px]">
                                    {consolidatedProductData.installmentCount}
                                  </td>
                                  <td className="border border-black px-1 py-1 text-center font-medium text-green-600 text-[11px]">
                                    {formatCurrency(consolidatedProductData.paidAmount)}
                                  </td>

                                  {/* Show product-specific savings for each row */}
                                  <td className="border border-black px-1 py-1 text-center font-medium text-blue-600 text-[11px]">
                                    {consolidatedProductData.totalSavings > 0 ? formatCurrency(consolidatedProductData.totalSavings) : ''}
                                  </td>

                                  {/* Installment date columns */}
                                  {installmentDates.map((date, dateIndex) => {
                                    // 🆕 CRITICAL: Check if collection date is BEFORE delivery date
                                    // If yes, show EMPTY cells for both Loan and Sav In

                                    // Parse and validate delivery date
                                    let deliveryDateObj = null;
                                    if (consolidatedProductData.deliveryDate) {
                                      try {
                                        deliveryDateObj = new Date(consolidatedProductData.deliveryDate);
                                        // Validate the date object
                                        if (isNaN(deliveryDateObj.getTime())) {
                                          console.warn(`⚠️ Invalid deliveryDate for ${member.name}: ${consolidatedProductData.deliveryDate}`);
                                          deliveryDateObj = null;
                                        }
                                      } catch (e) {
                                        console.error(`❌ Error parsing deliveryDate for ${member.name}:`, e);
                                        deliveryDateObj = null;
                                      }
                                    }

                                    const collectionDateObj = new Date(date);

                                    // Set both dates to midnight for accurate date-only comparison
                                    if (deliveryDateObj) {
                                      deliveryDateObj.setHours(0, 0, 0, 0);
                                    }
                                    collectionDateObj.setHours(0, 0, 0, 0);

                                    // ✅ CRITICAL FIX: Show ONLY if delivery date exists AND collection date is AFTER delivery
                                    // Delivery date MUST exist to show any amounts
                                    // Daily: 20 Nov delivery → 21 Nov থেকে শুরু (collectionDate > deliveryDate)
                                    // Weekly/Monthly: 20 Nov delivery → 22 Nov onwards (next collection date after delivery)

                                    let shouldShowAmount = false;

                                    if (deliveryDateObj) {
                                      // Only show if collection date is AFTER delivery date
                                      shouldShowAmount = collectionDateObj > deliveryDateObj;
                                    }
                                    // If no delivery date, don't show anything (product not delivered yet)

                                    // ✅ FIXED: Show SCHEDULED amounts, not actual collected amounts
                                    // Calculate scheduled installment amount (fixed per installment)
                                    const scheduledInstallmentAmount = consolidatedProductData.totalInstallments > 0
                                      ? Math.round(consolidatedProductData.totalAmount / consolidatedProductData.totalInstallments)
                                      : 0;

                                    // ✅ Determine expected savings based on installment frequency (fixed)
                                    const installmentFrequency = products[0]?.installmentFrequency || 'weekly';
                                    const expectedSavings = installmentFrequency === 'monthly' ? 50 : 20;

                                    // Get actual collection data ONLY for Sav Out (actual withdrawals should show)
                                    const collection = !shouldShowAmount
                                      ? { loanAmount: 0, savingsInAmount: 0, savingsOutAmount: 0 } // Empty if no installment due
                                      : getProductSpecificCollection(member, date, consolidatedProductData, products, transactionIndex === 0);

                                    // 🎯 For monthly installments, show if:
                                    // 1. There's an actual collected/partial record matching this due date, OR
                                    // 2. There's a PENDING installment with exact due date matching this column date
                                    const isMonthlyProduct = installmentFrequency === 'monthly';

                                    // Check for any installment (pending, partial, or collected) with due date = this column date
                                    const columnDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                    const hasMonthlyInstallmentOnThisDate = isMonthlyProduct && (member.allInstallmentRecords || []).some(rec => {
                                      if (rec.installmentType !== 'regular') return false;
                                      if (!rec.note || !rec.note.includes('Product Loan')) return false;
                                      // Must belong to this row's distribution
                                      const recDistId = rec.distributionId;
                                      const rowDistIds = products.map(p => p.distributionId).filter(Boolean);
                                      if (recDistId && rowDistIds.length > 0 && !rowDistIds.some(id =>
                                        id === recDistId || (recDistId && recDistId.includes(id)) || (id && id.includes(recDistId))
                                      )) return false;
                                      // Check due date match
                                      const dueDateObj = rec.dueDate ? new Date(rec.dueDate) : null;
                                      if (!dueDateObj || isNaN(dueDateObj.getTime())) return false;
                                      const dueDateStr = `${dueDateObj.getFullYear()}-${String(dueDateObj.getMonth() + 1).padStart(2, '0')}-${String(dueDateObj.getDate()).padStart(2, '0')}`;
                                      return dueDateStr === columnDateStr;
                                    });

                                    const hasActualLoanCollection = collection.loanAmount > 0;
                                    // Monthly: show if there's an installment due this date (pending/partial/collected)
                                    const monthlyShowCondition = hasActualLoanCollection || hasMonthlyInstallmentOnThisDate;

                                    // ✅ FIXED: Display logic
                                    // - DAILY: Show ONLY if installment due on this date
                                    // - WEEKLY: Show if delivery has happened (all weekly dates after delivery)
                                    // - MONTHLY: Show ONLY if installment due OR collected/partial on THIS EXACT date
                                    // - Loan box: Show SCHEDULED amount (weekly) OR ONLY when actual match (monthly)
                                    // - Sav In box: Show EXPECTED savings
                                    // - Sav Out box: Show ACTUAL withdrawals

                                    const displayLoan = !shouldShowAmount
                                      ? '' // Empty if before delivery
                                      : isMonthlyProduct
                                        ? (monthlyShowCondition ? formatCurrency(scheduledInstallmentAmount) : '') // Monthly: show if due or collected
                                        : (scheduledInstallmentAmount > 0 ? formatCurrency(scheduledInstallmentAmount) : ''); // Weekly/Daily: show always after delivery

                                    const displaySavingsIn = !shouldShowAmount
                                      ? '' // Empty if before delivery
                                      : isMonthlyProduct
                                        ? (monthlyShowCondition ? `৳${expectedSavings}` : '') // Monthly: show ONLY when loan also shows
                                        : `৳${expectedSavings}`; // Weekly/Daily: show always after delivery

                                    return (
                                      <td key={dateIndex} className="border border-black px-0.5 py-0.5">
                                        <div className="grid grid-cols-3 gap-0 h-6">
                                          <div className="text-center text-[9px] flex items-center justify-center bg-red-50 collection-cell border-r border-black">
                                            {displayLoan}
                                          </div>
                                          <div className="text-center text-[9px] flex items-center justify-center bg-green-50 collection-cell border-r border-black">
                                            {displaySavingsIn}
                                          </div>
                                          <div className="text-center text-[9px] flex items-center justify-center bg-orange-50 collection-cell">
                                            {collection.savingsOutAmount > 0 ? formatCurrency(collection.savingsOutAmount) : ''}
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            });

                            return memberRows;
                          } // End of if (activeProducts.length > 0)
                        } // End of if (member.productInstallments && member.productInstallments.length > 0)

                        // Member with no active products (either never had products OR all products are fully paid)
                        // Show them as "No Product" member (they still need to pay savings)
                        return (
                          <tr key={member._id} className="h-8">
                            <td className="border border-black px-1 py-1 text-center font-medium text-xs">{memberIndex + 1}</td>
                            <td className="border border-black px-1.5 py-1 text-xs">
                              <div className="font-medium">
                                ({member.memberCode || String(memberIndex + 1).padStart(3, '0')}) {member.name}
                              </div>
                            </td>
                            <td className="border border-black px-1 py-1 text-center text-[11px]">
                              {member.phone}
                            </td>
                            <td className="border border-black px-1 py-1 text-center text-[11px]">
                              {member.sponsorName || 'N/A'}
                            </td>
                            <td className="border border-black px-1 py-1 text-[11px]">
                              {member.address || member.village || 'N/A'}
                            </td>
                            <td className="border border-black px-1 py-1 text-center text-gray-500 text-[11px]">
                              No Product
                            </td>
                            <td className="border border-black px-1 py-1 text-center text-gray-500 text-[11px]">
                              {formatCurrency(0)}
                            </td>
                            <td className="border border-black px-1 py-1 text-center text-gray-500 text-[10px]">
                              N/A
                            </td>
                            <td className="border border-black px-0.5 py-1 text-center text-gray-500 text-[11px]">
                              N/A
                            </td>
                            <td className="border border-black px-0.5 py-1 text-center text-gray-500 text-[11px]">
                              0
                            </td>
                            <td className="border border-black px-1 py-1 text-center font-medium text-green-600 text-[11px]">
                              {formatCurrency(member.totalCollectedAmount || 0)}
                            </td>
                            <td className="border border-black px-1 py-1 text-center font-medium text-blue-600 text-[11px]">
                              {(() => {
                                console.log(`💰 [SHEET RENDER] ${member.name} totalSavings: ${member.totalSavings}`);
                                return formatCurrency(member.totalSavings || 0);
                              })()}
                            </td>
                            {installmentDates.map((date, dateIndex) => {
                              // For members with no products, show scheduled savings per frequency (Jagoron/Aggrosor)
                              // Determine expected savings (weekly: 20, monthly: 50)
                              const expectedSavings = (member._frequency === 'monthly') ? 50 : 20;

                              // 🎯 NEW: Check if this date is AFTER member's join date
                              const memberJoinDate = member.joinDate ? new Date(member.joinDate) : null;
                              const collectionDate = new Date(date);

                              // Set time to start of day for proper comparison
                              if (memberJoinDate) {
                                memberJoinDate.setHours(0, 0, 0, 0);
                              }
                              collectionDate.setHours(0, 0, 0, 0);

                              // Show savings only if collection date is AFTER join date
                              const shouldShowSavings = !memberJoinDate || collectionDate > memberJoinDate;

                              // Debug log (only for first date to avoid spam)
                              if (dateIndex === 0) {
                                console.log(`📅 [${member.name}] Join: ${memberJoinDate ? memberJoinDate.toISOString().split('T')[0] : 'N/A'}, First Collection: ${collectionDate.toISOString().split('T')[0]}, Show Savings: ${shouldShowSavings}`);
                              }

                              // Get actual savings withdrawals for Sav Out display
                              const collection = getCollectionForDate(member, date);

                              return (
                                <td key={dateIndex} className="border border-black px-0.5 py-0.5">
                                  <div className="grid grid-cols-3 gap-0 h-6">
                                    <div className="text-center text-[8px] flex items-center justify-center bg-red-50 collection-cell border-r border-black">
                                      {/* Loan: Empty for no-product members */}
                                    </div>
                                    <div className="text-center text-[8px] flex items-center justify-center bg-green-50 collection-cell border-r border-black">
                                      {shouldShowSavings ? `৳${expectedSavings}` : ''}
                                    </div>
                                    <div className="text-center text-[8px] flex items-center justify-center bg-orange-50 collection-cell">
                                      {collection.savingsOutAmount > 0 ? formatCurrency(collection.savingsOutAmount) : ''}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })(); // Close memberRows IIFE

                      // Push member rows to memberTbodyRows
                      if (Array.isArray(memberRows)) {
                        memberTbodyRows.push(...memberRows);
                      } else if (memberRows) {
                        memberTbodyRows.push(memberRows);
                      }

                      // ✅ INCREMENT member count
                      memberCount++;

                      // Push a tbody for this member (which might also contain the group header if it was just added)
                      tbodies.push(
                        <tbody key={`member-tbody-${member._id || memberIndex}`} className="member-tbody">
                          {memberTbodyRows}
                        </tbody>
                      );
                    });

                    // ✅ SIGNATURE: Add signature inside its own tbody at the very end of the entire list
                    tbodies.push(
                      <tbody key="signature-tbody" className="signature-tbody">
                        <tr className="signature-row">
                          <td colSpan={12 + installmentDates.length} className="border-0 p-0" style={{ border: 'none' }}>
                            <div style={{ marginTop: '0.8cm', marginBottom: '0.2cm', padding: '0 2cm' }}>
                              <div className="flex justify-between items-end">
                                <div className="text-center">
                                  <div className="border-t-2 border-black w-48 mb-2" style={{ borderTop: '2px solid black', width: '12rem', marginBottom: '0.5rem' }}></div>
                                  <p className="text-sm font-semibold" style={{ fontSize: '0.875rem', fontWeight: '600' }}>Manager Signature</p>
                                </div>
                                <div className="text-center">
                                  <div className="border-t-2 border-black w-48 mb-2" style={{ borderTop: '2px solid black', width: '12rem', marginBottom: '0.5rem' }}></div>
                                  <p className="text-sm font-semibold" style={{ fontSize: '0.875rem', fontWeight: '600' }}>Field Officer Signature</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    );

                    return tbodies;
                  })()}
              </table>

            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Members Found</h3>
              <p className="text-gray-600">
                No members found for selected filter.
              </p>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export default CollectionSheet;
