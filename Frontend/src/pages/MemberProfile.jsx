import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { membersAPI, installmentsAPI } from '../utils/api';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Calendar,
  PiggyBank,
  AlertCircle,
  Printer
} from 'lucide-react';
import { getImageUrl } from '../utils/imageUtils';

const MemberProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loanHistory, setLoanHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState('all');
  const [uniqueLoans, setUniqueLoans] = useState([]);

  // Print styles
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        @page { size: legal landscape; margin: 0.5in; }
        body * { visibility: hidden; }
        #printable-area, #printable-area * { visibility: visible; }
        #printable-area { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
        .print-full-width { width: 100% !important; max-width: 100% !important; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Fetch member
  useEffect(() => {
    const fetchMember = async () => {
      try {
        setLoading(true);
        const response = await membersAPI.getById(id);
        if (response.success) {
          setMember(response.data);
        } else {
          toast.error('Failed to load member');
          navigate('/members');
        }
      } catch (error) {
        console.error('Error:', error);
        toast.error('Error loading member');
        navigate('/members');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchMember();
  }, [id, navigate]);

  // Fetch loan history
  useEffect(() => {
    const fetchLoanHistory = async () => {
      try {
        setLoadingHistory(true);
        const response = await installmentsAPI.getByMember(id);

        if (response.success && response.data) {
          console.log('🔍 Raw Response Data:', response.data.length, 'installments');

          // DEBUG: Check for multiple collections on same installment
          const installmentGroups = {};
          response.data.forEach(inst => {
            const note = inst.note || '';
            const match = note.match(/Installment (\d+)\/\d+/);
            if (match) {
              const instNum = match[1];
              if (!installmentGroups[instNum]) {
                installmentGroups[instNum] = [];
              }
              installmentGroups[instNum].push({
                amount: inst.amount,
                date: inst.collectionDate,
                isAuto: inst.isAutoApplied,
                receipt: inst.receiptNumber
              });
            }
          });

          console.log('📊 Installment Collections Count:');
          Object.keys(installmentGroups).forEach(num => {
            if (installmentGroups[num].length > 1) {
              console.log(`   Installment #${num}: ${installmentGroups[num].length} collections`, installmentGroups[num]);
            }
          });

          // ✅ NEW: Fetch collection history to get individual collection rows
          let collectionHistoryResponse = null;
          try {
            collectionHistoryResponse = await installmentsAPI.getCollectionHistory(id);
            if (collectionHistoryResponse.success && collectionHistoryResponse.data) {
              console.log('✅ Fetched', collectionHistoryResponse.data.length, 'collection history records');
            }
          } catch (historyError) {
            console.log('⚠️ No collection history available (this is normal for older data)');
          }

          // Store the original unfiltered data to correctly calculate totals later
          window.rawLoanData = response.data;
          window.collectionHistoryData = collectionHistoryResponse?.data || [];

          const savingsInstallments = [];
          const productLoanHistory = [];

          response.data.forEach(installment => {
            const note = installment.note || '';

            // ✅ FIX: Skip auto-applied installments to prevent double counting
            // If an amount is auto-applied (e.g. 12.5 spillover), it's usually already included 
            // in the previous installment's total collection (e.g. 856.25).
            // Showing it again would be confusing and double-deduct from outstanding.
            if (installment.isAutoApplied && !installment.receiptNumber) {
              console.log('⏭️ Skipping auto-applied installment:', {
                note: note.substring(0, 60),
                amount: installment.amount,
                paid: installment.paidAmount
              });
              return;
            }

            const isSavingsOnly = note.toLowerCase().includes('savings collection') ||
              note.toLowerCase().includes('savings withdrawal') ||
              note.toLowerCase().includes('initial savings') ||
              installment.installmentType === 'savings';

            if (isSavingsOnly) {
              savingsInstallments.push(installment);
            } else {
              productLoanHistory.push(installment);
            }
          });

          window.memberSavingsData = savingsInstallments;

          const sortedHistory = [...savingsInstallments, ...productLoanHistory].sort((a, b) =>
            new Date(a.dueDate || a.collectionDate) - new Date(b.dueDate || b.collectionDate)
          );

          setLoanHistory(sortedHistory);

          const salesMap = new Map();
          sortedHistory.forEach(installment => {
            if (installment.distributionId) {
              const saleId = installment.distributionId.toString();
              if (!salesMap.has(saleId)) {
                const note = installment.note || '';
                let productNames = '';

                // Only extract from Product Loan installments, NOT savings
                if (note.includes('Product Loan:')) {
                  console.log('📝 Processing LOAN note for saleId', saleId.slice(-6), ':', note.substring(0, 100));

                  // Try multiple regex patterns
                  const patterns = [
                    /Product Loan: ([^-]+)/,           // Pattern 1: "Product Loan: Name - "
                    /Product Loan:\s*([^\n]+)/,        // Pattern 2: "Product Loan: Name" (until newline)
                  ];

                  for (const pattern of patterns) {
                    const match = note.match(pattern);
                    if (match && match[1]) {
                      productNames = match[1].trim().split('-')[0].trim(); // Take first part before any dash
                      console.log('✅ Product name extracted:', productNames);
                      break;
                    }
                  }

                  if (productNames) {
                    salesMap.set(saleId, {
                      id: saleId,
                      productName: productNames,
                      shortId: saleId.slice(-6)
                    });
                    console.log('✅ Added to salesMap:', saleId.slice(-6), '→', productNames);
                  }
                }
              }
            }
          });

          console.log('📋 Total products found:', salesMap.size);

          const salesArray = Array.from(salesMap.values()).sort((a, b) =>
            a.id.localeCompare(b.id)
          );
          setUniqueLoans(salesArray);

          if (salesArray.length > 0) {
            setSelectedLoan(salesArray[0].id);
          } else {
            setSelectedLoan('savings');
          }
        }
      } catch (error) {
        console.error('Error:', error);
        toast.error('Failed to load loan history');
      } finally {
        setLoadingHistory(false);
      }
    };
    if (id) fetchLoanHistory();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Member not found</h2>
          <button onClick={() => navigate('/members')} className="text-blue-600 hover:text-blue-700">
            Back to Members
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/members')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Member Profile</h1>
            <p className="text-gray-600">ID: #{(member._id || member.id).toString().slice(-6)}</p>
          </div>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </button>
      </div>

      <div id="printable-area">
        <div className="bg-white rounded-xl shadow-sm border p-6 print-full-width">
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              {member.profileImage ? (
                <img
                  src={getImageUrl(member.profileImage)}
                  alt={member.name}
                  className="w-24 h-32 rounded-lg object-cover border-3 border-blue-300"
                  style={{ objectPosition: 'center top' }}
                  onError={(e) => {
                    console.error('Error loading image:', e.target.src);
                    e.target.src = 'https://via.placeholder.com/150?text=No+Image';
                  }}
                />
              ) : (
                <div className="w-24 h-32 bg-blue-100 rounded-lg flex items-center justify-center">
                  <User className="h-12 w-12 text-blue-600" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">{member.name}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start space-x-3">
                  <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium text-gray-900">{member.phone || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Address</p>
                    <p className="font-medium text-gray-900">{member.address || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Join Date</p>
                    <p className="font-medium text-gray-900">
                      {member.joinDate ? new Date(member.joinDate).toLocaleDateString('en-US') : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <PiggyBank className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Branch</p>
                    <p className="font-medium text-gray-900">{member.branch || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Current Filter</p>
                    <p className="font-medium text-gray-900">
                      {selectedLoan === 'savings' ? '💰 Savings' :
                        uniqueLoans.length > 0 ?
                          `Dofa ${uniqueLoans.findIndex(l => l.id === selectedLoan) + 1}` :
                          'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Total Sales</p>
                    <p className="font-medium text-gray-900">
                      {uniqueLoans.length > 0 ? `${uniqueLoans.length} Dofa` : 'No Sales'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden print-full-width mt-6">
          <div className="bg-gradient-to-r from-green-500 to-teal-600 px-6 py-4 print:bg-gray-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center space-x-3">
                <PiggyBank className="h-6 w-6 text-white print:text-gray-900" />
                <h3 className="text-xl font-bold text-white print:text-gray-900">
                  {uniqueLoans.length > 0 ? 'Loan & Savings History' : 'Savings History'}
                </h3>
              </div>
              {uniqueLoans.length > 0 && (
                <select
                  value={selectedLoan}
                  onChange={(e) => setSelectedLoan(e.target.value)}
                  className="no-print px-4 py-2 rounded-lg border-2 border-white/30 bg-white/10 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  {uniqueLoans.map((sale, index) => (
                    <option key={sale.id} value={sale.id} className="text-gray-900">
                      {sale.productName} (Dofa {index + 1})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {loadingHistory ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <span className="ml-3 text-gray-600">Loading...</span>
            </div>
          ) : (
            <div className="p-4">
              {(() => {
                const savingsData = window.memberSavingsData || [];
                const hasProducts = uniqueLoans.length > 0;

                console.log('👁️ Rendering History - Has Products:', hasProducts, 'Selected:', selectedLoan);

                // Case 1: No products - show only savings
                if (!hasProducts) {
                  console.log('💰 Showing ONLY Savings (no products)');

                  let savingsBalance = 0;
                  const savingsRows = savingsData
                    .filter(sav => !sav.note?.includes('Product Sale:'))
                    .sort((a, b) => new Date(a.collectionDate || a.dueDate) - new Date(b.collectionDate || b.dueDate))
                    .map((sav, index) => {
                      const date = new Date(sav.collectionDate || sav.dueDate);
                      const dateStr = date.toLocaleDateString('en-GB');
                      const isWithdrawal = sav.note?.toLowerCase().includes('withdrawal');
                      const amount = sav.paidAmount || sav.amount || 0;

                      const savingsIn = isWithdrawal ? 0 : amount;
                      const savingsOut = isWithdrawal ? amount : 0;
                      savingsBalance += (savingsIn - savingsOut);

                      const bgColor = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                      return (
                        <tr key={`sav-${index}`} className={`${bgColor} hover:bg-blue-50 transition-colors`}>
                          <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">{dateStr}</td>
                          <td className="px-3 py-3 text-sm text-right font-medium text-green-600 border border-gray-800">
                            {savingsIn > 0 ? `৳${savingsIn.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-3 text-sm text-right font-medium text-red-600 border border-gray-800">
                            {savingsOut > 0 ? `৳${savingsOut.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-3 text-sm text-right font-semibold text-blue-600 border border-gray-800">
                            ৳{savingsBalance.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">
                            {sav.collector?.name || sav.collectorName || 'N/A'}
                          </td>
                        </tr>
                      );
                    });

                  if (savingsRows.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-500">
                        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        No savings history found
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-800">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-800">Date</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Savings In</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Savings Out</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Savings Balance</th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-800">Field Officer</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {savingsRows}
                        </tbody>
                      </table>
                    </div>
                  );
                }


                // Case 2: Has products - show loan + savings side by side
                console.log('🔄 Showing Loan + Savings for product:', selectedLoan);

                // Get loan installments for selected product
                const allProductInstallments = loanHistory.filter(inst => {
                  const isProductLoan = inst.note?.includes('Product Loan:');
                  const matchesProduct = inst.distributionId?.toString() === selectedLoan;
                  return isProductLoan && matchesProduct;
                });

                // Only collected/paid/partial
                // ✅ Helper: Check if a product is fully paid (Moved up for scope access)
                const isProductFullyPaid = (loanId) => {
                  // Use collection history data (backend has already calculated outstanding correctly)
                  const collectionHistoryData = window.collectionHistoryData || [];

                  // Get collection history for this product
                  const productCollections = collectionHistoryData.filter(history =>
                    history.distributionId === loanId
                  );

                  if (productCollections.length === 0) return false;

                  // Sort by date and get the LAST collection record
                  const sortedCollections = productCollections.sort((a, b) =>
                    new Date(b.collectionDate) - new Date(a.collectionDate)
                  );

                  const lastCollection = sortedCollections[0];

                  // Backend calculates outstanding correctly
                  const outstanding = parseFloat(lastCollection.outstanding || lastCollection.outstandingAfterCollection || 0);

                  const isFullyPaid = outstanding <= 0.1; // Allow tiny rounding errors

                  return isFullyPaid;
                };

                const installmentData = allProductInstallments.map(inst => ({
                  status: inst.status,
                  paidAmount: inst.paidAmount,
                  amount: inst.amount,
                  note: inst.note?.substring(0, 50)
                }));
                console.log('🔍 All product installments:', JSON.stringify(installmentData, null, 2));

                const collectedInstallments = allProductInstallments.filter(inst =>
                  inst.status === 'collected' || inst.status === 'paid' || inst.status === 'partial'
                );

                console.log(`📚 Found ${collectedInstallments.length} collected installments for product`);

                // Calculate total loan amount from RAW data (not filtered collected ones)
                const rawData = window.rawLoanData || [];
                const allRawInstallments = rawData.filter(inst =>
                  inst.distributionId?.toString() === selectedLoan &&
                  inst.note?.includes('Product Loan:') &&
                  inst.status !== 'correction' // ✅ EXCLUDE correction records from total loan amount calculation
                );
                const totalLoanAmount = allRawInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                let currentOutstanding = totalLoanAmount;

                console.log('💰 Total Loan Amount (from raw data):', totalLoanAmount, 'installments:', allRawInstallments.length);

                // Build loan rows with product sale as first row
                const loanRows = [];

                // Add product sale row as first row
                if (allProductInstallments.length > 0) {
                  // Use saleDate if available (new field), otherwise fallback to dueDate for backward compatibility
                  const sortedByDue = [...allProductInstallments].sort((a, b) =>
                    new Date(a.dueDate) - new Date(b.dueDate)
                  );
                  const firstInst = sortedByDue[0];

                  // 🎯 Use saleDate if available (newly added field), otherwise fallback to dueDate
                  const saleDate = new Date(firstInst.saleDate || firstInst.dueDate || firstInst.collectionDate);
                  const saleDateStr = saleDate.toLocaleDateString('en-GB');

                  loanRows.push(
                    <tr key="product-sale" className="bg-blue-50 hover:bg-blue-100 transition-colors">
                      <td className="px-3 py-3 text-sm font-bold text-gray-900 border border-gray-800">{saleDateStr}</td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-gray-900 border border-gray-800">-</td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-gray-900 border border-gray-800">-</td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-gray-900 border border-gray-800">-</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-purple-600 border border-gray-800">
                        ৳{totalLoanAmount.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">Product Sale</td>
                    </tr>
                  );
                }

                // ✅ NEW: Use collection history to display individual collections as separate rows
                const collectionHistoryData = window.collectionHistoryData || [];

                // Filter collection history for this product - EXCLUDE product sale & savings records
                // ✅ INCLUDE correction records too
                const productCollectionHistory = collectionHistoryData.filter(history => {
                  // Must match the selected product
                  if (history.distributionId !== selectedLoan) return false;

                  // ✅ INCLUDE: Correction records (negative amount, paymentMethod === 'correction')
                  if (history.paymentMethod === 'correction' || (history.note && history.note.startsWith('CORRECTION:'))) {
                    return true;
                  }

                  // ✅ EXCLUDE: Product Sale initialization records
                  if (history.note && history.note.includes('Product Sale:')) return false;

                  // ✅ EXCLUDE: Savings collections
                  if (history.note && history.note.includes('Savings Collection')) return false;
                  if (history.note && history.note.includes('Savings Withdrawal')) return false;

                  // ✅ INCLUDE: Only actual loan installment payments
                  return history.note && history.note.includes('Product Loan:');
                });

                console.log(`📋 Found ${productCollectionHistory.length} LOAN collection history records for product ${selectedLoan}`);

                if (productCollectionHistory.length > 0) {
                  // Use collection history records (each collection is a separate row)
                  productCollectionHistory
                    .sort((a, b) => new Date(a.collectionDate) - new Date(b.collectionDate))
                    .forEach((history, index) => {
                      const isCorrection = history.paymentMethod === 'correction' || (history.note && history.note.startsWith('CORRECTION:'));
                      const date = new Date(history.collectionDate);
                      const dateStr = date.toLocaleDateString('en-GB');
                      const target = history.installmentTarget || 0;
                      const collection = history.collectionAmount || 0; // negative for correction
                      const due = history.installmentDue || 0;
                      const outstanding = history.outstandingAfterCollection || 0;

                      const bgColor = isCorrection ? 'bg-red-50' : ((index + 1) % 2 === 0 ? 'bg-white' : 'bg-gray-50');
                      const fieldOfficer = history.collector?.name || 'N/A';

                      // Extract correction reason from note
                      const correctionReasonMatch = history.note?.match(/Reason: (.+?)(?:\.|$)/);
                      const correctionReason = correctionReasonMatch ? correctionReasonMatch[1] : '';

                      console.log(`📊 Collection #${index + 1}: Date=${dateStr}, Collection=৳${collection}, Outstanding=৳${outstanding}, isCorrection=${isCorrection}`);

                      if (isCorrection) {
                        // Render correction row with red styling
                        loanRows.push(
                          <tr key={`correction-${history._id || index}`} className="bg-red-50 hover:bg-red-100 transition-colors">
                            <td className="px-3 py-3 text-sm text-red-700 font-medium border border-gray-800">{dateStr}</td>
                            <td className="px-3 py-3 text-sm text-right font-medium text-gray-400 border border-gray-800">-</td>
                            <td className="px-3 py-3 text-sm text-right font-bold text-red-600 border border-gray-800">
                              🔻 ৳{Math.abs(collection).toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-medium text-gray-400 border border-gray-800">-</td>
                            <td className="px-3 py-3 text-sm text-right font-semibold text-purple-600 border border-gray-800">
                              ৳{outstanding.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-sm text-red-600 border border-gray-800">
                              ⚡ Correction{correctionReason ? ` (${correctionReason})` : ''}
                            </td>
                          </tr>
                        );
                      } else {
                        loanRows.push(
                          <tr key={`collection-${history._id || index}`} className={`${bgColor} hover:bg-blue-50 transition-colors`}>
                            <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">{dateStr}</td>
                            <td className="px-3 py-3 text-sm text-right font-medium text-gray-900 border border-gray-800">
                              ৳{target.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-semibold text-green-600 border border-gray-800">
                              ৳{collection.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-medium text-orange-600 border border-gray-800">
                              {due > 0 ? `৳${due.toLocaleString()}` : '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-semibold text-purple-600 border border-gray-800">
                              ৳{outstanding.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">{fieldOfficer}</td>
                          </tr>
                        );
                      }
                    });
                } else {
                  // Fallback: Use old method if no collection history available (older data)
                  console.log('⚠️ No collection history found, using fallback method (installments)');

                  collectedInstallments
                    .sort((a, b) => new Date(a.collectionDate) - new Date(b.collectionDate))
                    .forEach((inst, index) => {
                      const date = new Date(inst.collectionDate);
                      const dateStr = date.toLocaleDateString('en-GB');
                      const target = inst.amount || 0;

                      // ✅ FIX: Show actual collected amount for THIS transaction
                      // Use lastPaymentAmount if available (represents THIS collection)
                      // Otherwise use paidAmount
                      const collection = inst.lastPaymentAmount || inst.paidAmount || 0;

                      // Debug log
                      console.log(`📊 Row ${index + 1}: Date=${dateStr}, Collection=৳${collection}, Target=৳${target}`);

                      // ✅ FIX: Use remainingAmount from database
                      const due = inst.remainingAmount !== undefined ? inst.remainingAmount : Math.max(0, target - collection);

                      // Update outstanding balance
                      currentOutstanding -= collection;
                      const outstanding = Math.max(0, currentOutstanding);

                      const bgColor = (index + 1) % 2 === 0 ? 'bg-white' : 'bg-gray-50'; // +1 because of sale row
                      const fieldOfficer = inst.collector?.name || inst.collectorName || 'N/A';

                      loanRows.push(
                        <tr key={`loan-${inst._id || index}`} className={`${bgColor} hover:bg-blue-50 transition-colors`}>
                          <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">{dateStr}</td>
                          <td className="px-3 py-3 text-sm text-right font-medium text-gray-900 border border-gray-800">
                            ৳{target.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-sm text-right font-semibold text-green-600 border border-gray-800">
                            ৳{collection.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-sm text-right font-medium text-orange-600 border border-gray-800">
                            {due > 0 ? `৳${due.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-3 text-sm text-right font-semibold text-purple-600 border border-gray-800">
                            ৳{outstanding.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">{fieldOfficer}</td>
                        </tr>
                      );
                    });
                }

                // 🎯 NEW APPROACH: Match NewCollectInstallmentForm logic
                // Group savings by distributionId and display them clearly

                // Get all valid savings records
                const allValidSavingsRecords = savingsData.filter(record => {
                  if (!(record.installmentType === 'extra' || record.installmentType === 'savings')) return false;
                  if (!record.note) return false;

                  const isSavingsCollection = record.note.includes('Savings Collection');
                  const isSavingsWithdrawal = record.note.includes('Savings Withdrawal');
                  const isInitialSavings = record.note.includes('Initial Savings');
                  const isProductSaleRecord = record.note.match(/Product Sale:.+\(Qty:.+\|/);

                  return (isSavingsCollection || isSavingsWithdrawal || isInitialSavings) && !isProductSaleRecord;
                });

                console.log('💰 Total valid savings records found:', allValidSavingsRecords.length);

                // 🔍 DEBUG: Show ALL valid savings records with details
                console.log('🔍 ALL Valid Savings Records:');
                allValidSavingsRecords.forEach((record, idx) => {
                  const amount = record.paidAmount || record.amount || 0;
                  const distId = record.distributionId ? `SALE-${record.distributionId.toString().slice(-6)}` : 'NO_DIST_ID';
                  const instId = record.installmentId ? record.installmentId.toString().slice(-6) : 'NO_INST_ID';
                  console.log(`   [${idx + 1}] ৳${amount} | DistID: ${distId} | InstID: ${instId} | Note: ${record.note?.substring(0, 60)}`);
                });

                // Calculate savings for the SELECTED product by distributionId
                let productSavings = [];

                // Match savings by distributionId (most reliable)
                const matchedSavings = allValidSavingsRecords.filter(record => {
                  // Direct match by distributionId
                  if (record.distributionId && record.distributionId.toString() === selectedLoan) {
                    console.log(`   ✅ Direct match by distributionId: ${record.note?.substring(0, 50)}`);
                    return true;
                  }

                  // Match by installmentId
                  if (record.installmentId) {
                    const belongsToProduct = allProductInstallments.some(inst => inst._id === record.installmentId);
                    if (belongsToProduct) {
                      console.log(`   ✅ Match by installmentId: ${record.note?.substring(0, 50)}`);
                      return true;
                    }
                  }

                  return false;
                });

                productSavings.push(...matchedSavings);
                console.log(`💰 Found ${matchedSavings.length} direct savings for product ${selectedLoan.slice(-6)}`);

                // Get current product info
                const currentProduct = uniqueLoans.find(loan => loan.id === selectedLoan);
                const currentProductName = currentProduct?.productName || '';
                const selectedProductIndex = uniqueLoans.findIndex(l => l.id === selectedLoan);

                // 🎯 NEW: If this is the FIRST product (index 0), include Initial Savings
                // Initial Savings have no distributionId because they're collected during member registration
                if (selectedProductIndex === 0) {
                  const initialSavings = allValidSavingsRecords.filter(record => {
                    // Skip if already matched
                    if (productSavings.some(p => p._id === record._id)) return false;

                    // Check if this is Initial Savings (no distributionId)
                    const isInitialSavings = !record.distributionId && record.note?.includes('Initial Savings');

                    if (isInitialSavings) {
                      console.log(`   💎 Initial Savings (added to 1st product): ${record.note?.substring(0, 50)}`);
                      return true;
                    }

                    return false;
                  });

                  productSavings.push(...initialSavings);
                  console.log(`💎 Added ${initialSavings.length} Initial Savings to first product`);
                }

                // Check if this product is completed (for display purposes)
                const isProductCompleted = isProductFullyPaid(selectedLoan);

                // 🎯 NEW: For COMPLETED products, include savings from ALL previous completed products
                // This shows the complete savings state when this product was active
                if (isProductCompleted && selectedProductIndex > 0) {
                  console.log(`🔍 Checking for previous completed products' savings to include...`);

                  // Get all products before this one (chronologically)
                  const previousProducts = uniqueLoans.slice(0, selectedProductIndex);

                  previousProducts.forEach((prevProduct, idx) => {
                    // Check if this previous product is also completed
                    const isPrevCompleted = isProductFullyPaid(prevProduct.id);

                    if (isPrevCompleted) {
                      console.log(`   📦 Previous completed product [${idx}]: ${prevProduct.productName}`);

                      // Get all savings from this previous completed product
                      const prevProductSavings = allValidSavingsRecords.filter(record => {
                        // Skip if already in productSavings
                        if (productSavings.some(p => p._id === record._id)) return false;

                        // Match by distributionId
                        if (record.distributionId && record.distributionId.toString() === prevProduct.id) {
                          return true;
                        }

                        // Match by installmentId
                        const prevProductInstallments = loanHistory.filter(inst =>
                          inst.distributionId?.toString() === prevProduct.id &&
                          inst.note?.includes('Product Loan:')
                        );

                        if (record.installmentId && prevProductInstallments.some(inst => inst._id === record.installmentId)) {
                          return true;
                        }

                        // Include Initial Savings if this is the first product
                        if (idx === 0 && !record.distributionId && record.note?.includes('Initial Savings')) {
                          return true;
                        }

                        return false;
                      });

                      if (prevProductSavings.length > 0) {
                        productSavings.push(...prevProductSavings);
                        console.log(`      ➕ Added ${prevProductSavings.length} savings from completed product: ${prevProduct.productName}`);
                      }
                    }
                  });

                  console.log(`💰 Total savings after including previous completed products: ${productSavings.length}`);
                }

                // 🎯 CRITICAL: Find the FIRST ACTIVE product (not just index 0)
                // Completed products should transfer their savings to the first ACTIVE product
                const activeProducts = uniqueLoans.filter(loan => !isProductFullyPaid(loan.id));
                const firstActiveProduct = activeProducts.length > 0 ? activeProducts[0] : null;
                const isFirstActiveProduct = firstActiveProduct && firstActiveProduct.id === selectedLoan;

                console.log(`   Current Product: ${currentProductName}, Index: ${selectedProductIndex}`);
                console.log(`   Is First Active Product: ${isFirstActiveProduct}`);
                console.log(`   First Active Product: ${firstActiveProduct?.productName || 'None'}`)

                // 🐛 DEBUG: Show all products and their completion status
                console.log('🐛 DEBUG - All products status:');
                uniqueLoans.forEach((loan, idx) => {
                  const isCompleted = isProductFullyPaid(loan.id);
                  console.log(`   [${idx}] ${loan.productName}: ${isCompleted ? '✅ COMPLETED' : '❌ ACTIVE (incomplete)'}`);
                });
                console.log(`🐛 DEBUG - Active products: ${activeProducts.map(p => p.productName).join(', ')}`);
                console.log(`🐛 DEBUG - First active product: ${firstActiveProduct?.productName || 'None'}`);

                // 🎯 CRITICAL: If this is the FIRST ACTIVE product, add all unmatched savings AND completed products' savings
                if (isFirstActiveProduct) {
                  console.log('   💡 This is First Active Product - adding unmatched savings...');

                  // Get savings that DON'T match any other ACTIVE product OR the current product
                  // 🔥 NEW: We should NOT take savings from ANY active products (even current one)
                  // Savings should only transfer from COMPLETED products
                  const unmatchedSavings = allValidSavingsRecords.filter(record => {
                    // Skip if already in productSavings
                    if (productSavings.some(p => p._id === record._id)) return false;

                    // 🎯 CRITICAL: Check if this savings belongs to ANY active (incomplete) product
                    const belongsToActiveProduct = activeProducts.some((activeLoan) => {
                      // Match by distributionId
                      if (record.distributionId && record.distributionId.toString() === activeLoan.id) {
                        console.log(`      ⛔ Skipping - belongs to active product: ${activeLoan.productName}`);
                        return true;
                      }

                      // Match by installmentId
                      const activeProductInstallments = loanHistory.filter(inst =>
                        inst.distributionId?.toString() === activeLoan.id &&
                        inst.note?.includes('Product Loan:')
                      );

                      if (record.installmentId && activeProductInstallments.some(inst => inst._id === record.installmentId)) {
                        console.log(`      ⛔ Skipping - belongs to active product: ${activeLoan.productName}`);
                        return true;
                      }

                      return false;
                    });

                    // Include only if it doesn't belong to any active product
                    if (!belongsToActiveProduct) {
                      console.log(`      ➕ Unmatched savings (not from any active product): ${record.note?.substring(0, 50)}`);
                      return true;
                    }

                    return false;
                  });

                  productSavings.push(...unmatchedSavings);
                  console.log(`   💡 Added ${unmatchedSavings.length} unmatched savings to First Active Product`);

                  // 🎯 SAVINGS TRANSFER: Add savings from ALL completed products
                  const completedProducts = uniqueLoans.filter(loan => isProductFullyPaid(loan.id));

                  console.log(`   💡 Found ${completedProducts.length} completed products for transfer`);

                  completedProducts.forEach(completedLoan => {
                    const completedProductSavings = allValidSavingsRecords.filter(record => {
                      // Skip if already in productSavings
                      if (productSavings.some(p => p._id === record._id)) return false;

                      // Match by distributionId
                      if (record.distributionId && record.distributionId.toString() === completedLoan.id) {
                        console.log(`         ✅ Match by distributionId for ${completedLoan.productName}`);
                        return true;
                      }

                      // Match by installmentId
                      const completedInstallments = loanHistory.filter(inst =>
                        inst.distributionId?.toString() === completedLoan.id
                      );

                      if (record.installmentId && completedInstallments.some(inst => inst._id === record.installmentId)) {
                        console.log(`         ✅ Match by installmentId for ${completedLoan.productName}`);
                        return true;
                      }

                      // Match by product name (fallback for old records without distributionId)
                      if (!record.distributionId && record.note && completedLoan.productName) {
                        if (record.note.includes(completedLoan.productName)) {
                          console.log(`         ✅ Match by name for ${completedLoan.productName}`);
                          return true;
                        }
                      }

                      return false;
                    });

                    if (completedProductSavings.length > 0) {
                      console.log(`      ➡️ Transferring ${completedProductSavings.length} savings from completed: ${completedLoan.productName}`);
                      productSavings.push(...completedProductSavings);
                    } else {
                      console.log(`      ⚠️ No savings found for completed product: ${completedLoan.productName}`);
                    }
                  });
                }

                console.log(`💰 Total savings for ${currentProductName}: ${productSavings.length} records`);

                // 🎯 Separate savings into "Direct" vs "Inherited/Transferred"
                // Direct = belongs to THIS product (by distributionId or installmentId)
                // Inherited = from completed products or unmatched (shown as Opening Balance)

                const directSavings = [];
                const inheritedSavings = [];

                productSavings.forEach(sav => {
                  // Check if this savings DIRECTLY belongs to current product
                  const isDirect =
                    (sav.distributionId && sav.distributionId.toString() === selectedLoan) ||
                    (sav.installmentId && allProductInstallments.some(inst => inst._id === sav.installmentId));

                  if (isDirect) {
                    directSavings.push(sav);
                  } else {
                    inheritedSavings.push(sav);
                  }
                });

                console.log(`💡 Direct savings: ${directSavings.length}, Inherited/Transferred: ${inheritedSavings.length}`);

                // 🎯 CRITICAL FIX: For COMPLETED products, use matchedSavings (historical snapshot)
                // For ACTIVE products, use directSavings (current state)
                let savingsToDisplay = [];

                if (isProductCompleted) {
                  // For completed products, show ALL productSavings (includes previous completed products' savings)
                  // This shows the complete savings state when this product was active/completed
                  savingsToDisplay = productSavings.sort((a, b) =>
                    new Date(a.collectionDate || a.dueDate) - new Date(b.collectionDate || b.dueDate)
                  );
                  console.log(`📸 COMPLETED Product - Showing historical snapshot: ${savingsToDisplay.length} savings records`);
                } else {
                  // For active products, use productSavings filtered for direct transactions
                  // This ensures Initial Savings are included (they're in productSavings but not in directSavings)
                  savingsToDisplay = productSavings.filter(sav => {
                    // Include direct savings for this product
                    return (sav.distributionId && sav.distributionId.toString() === selectedLoan) ||
                      (sav.installmentId && allProductInstallments.some(inst => inst._id === sav.installmentId)) ||
                      (!sav.distributionId && sav.note?.includes('Initial Savings') && selectedProductIndex === 0);
                  }).sort((a, b) =>
                    new Date(a.collectionDate || a.dueDate) - new Date(b.collectionDate || b.dueDate)
                  );
                  console.log(`🔴 ACTIVE Product - Showing direct savings: ${savingsToDisplay.length} savings records (includes Initial Savings if first product)`);
                }

                // Calculate opening balance from inherited/previous savings
                let openingBalance = 0;

                // For both COMPLETED and ACTIVE products, calculate transferred balance from previous products
                if (selectedProductIndex > 0 || inheritedSavings.length > 0) {
                  // Get all savings from productSavings that are NOT direct to this product
                  const transferredSavings = productSavings.filter(sav => {
                    const isDirect =
                      (sav.distributionId && sav.distributionId.toString() === selectedLoan) ||
                      (sav.installmentId && allProductInstallments.some(inst => inst._id === sav.installmentId)) ||
                      (!sav.distributionId && sav.note?.includes('Initial Savings') && selectedProductIndex === 0);
                    return !isDirect; // Return savings that are NOT direct
                  });

                  transferredSavings.forEach(sav => {
                    const isWithdrawal = sav.note?.toLowerCase().includes('withdrawal');
                    const amount = sav.paidAmount || sav.amount || 0;
                    openingBalance += isWithdrawal ? -amount : amount;
                  });

                  console.log(`💰 Opening balance from transferred savings: ৳${openingBalance} (${transferredSavings.length} previous transactions)`);

                  // For completed products, update savingsToDisplay to show only direct savings
                  if (isProductCompleted && openingBalance !== 0) {
                    // Filter to show only THIS product's direct savings
                    savingsToDisplay = productSavings.filter(sav => {
                      return (sav.distributionId && sav.distributionId.toString() === selectedLoan) ||
                        (sav.installmentId && allProductInstallments.some(inst => inst._id === sav.installmentId)) ||
                        (!sav.distributionId && sav.note?.includes('Initial Savings') && selectedProductIndex === 0);
                    }).sort((a, b) =>
                      new Date(a.collectionDate || a.dueDate) - new Date(b.collectionDate || b.dueDate)
                    );
                    console.log(`   🔧 Filtered to show only direct savings: ${savingsToDisplay.length} records (opening balance will be shown separately)`);
                  }
                }

                // Build savings rows
                const savingsRows = [];
                let savingsBalance = openingBalance;

                // Add Opening Balance row if there is transferred savings (for BOTH active and completed products)
                if (openingBalance !== 0) {
                  savingsRows.push(
                    <tr key="opening-balance" className="bg-blue-50 hover:bg-blue-100 transition-colors">
                      <td className="px-3 py-3 text-sm font-bold text-gray-900 border border-gray-800">-</td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-gray-900 border border-gray-800">-</td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-gray-900 border border-gray-800">-</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-blue-600 border border-gray-800">
                        ৳{openingBalance.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">
                        Opening Balance (Transferred)
                      </td>
                    </tr>
                  );
                }

                // Add savings transaction rows (using savingsToDisplay)
                savingsToDisplay.forEach((sav, index) => {
                  const date = new Date(sav.collectionDate || sav.dueDate);
                  const dateStr = date.toLocaleDateString('en-GB');
                  const isWithdrawal = sav.note?.toLowerCase().includes('withdrawal');
                  const amount = sav.paidAmount || sav.amount || 0;

                  const savingsIn = isWithdrawal ? 0 : amount;
                  const savingsOut = isWithdrawal ? amount : 0;
                  savingsBalance += (savingsIn - savingsOut);

                  const bgColor = (index + (openingBalance !== 0 ? 1 : 0)) % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                  savingsRows.push(
                    <tr key={`sav-${sav._id || index}`} className={`${bgColor} hover:bg-blue-50 transition-colors`}>
                      <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">{dateStr}</td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-green-600 border border-gray-800">
                        {savingsIn > 0 ? `৳${savingsIn.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-red-600 border border-gray-800">
                        {savingsOut > 0 ? `৳${savingsOut.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-blue-600 border border-gray-800">
                        ৳{savingsBalance.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 border border-gray-800">
                        {sav.collector?.name || sav.collectorName || 'N/A'}
                      </td>
                    </tr>
                  );
                });

                console.log(`💰 Final savings balance for ${currentProductName}: ৳${savingsBalance}`);

                // 🎯 Add info message for completed products
                if (isProductCompleted && savingsBalance !== 0) {
                  const transferNote = savingsBalance < 0
                    ? `Note: This product is completed. Historical transactions shown. Final savings transferred to active products.`
                    : `Note: This product is completed. Final balance of ৳${savingsBalance.toLocaleString()} transferred to active products.`;

                  console.log(`   ℹ️ ${transferNote}`);
                }


                // Display rendered

                return (
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Loan History Table */}
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                          <span className="mr-2">💵</span> Loan History
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-800">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-800">Date</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Target</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Collection</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Due</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Outstanding</th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-800">Field Officer</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {loanRows}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Savings History Table */}
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                          <span className="mr-2">💰</span> Savings History
                        </h4>
                        {savingsRows.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse border border-gray-800">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-800">Date</th>
                                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Savings In</th>
                                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Savings Out</th>
                                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase border border-gray-800">Savings Balance</th>
                                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-800">Field Officer</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white">
                                {savingsRows}
                              </tbody>
                            </table>

                            {/* Info note for completed products with negative balance */}
                            {isProductCompleted && savingsBalance < 0 && (
                              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-start gap-2 text-sm text-blue-800">
                                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <strong>ℹ️ Completed Product:</strong> This product's loan is fully paid.
                                    Historical transactions shown above. Any remaining positive balance has been
                                    transferred to active products. Negative balance indicates withdrawals were
                                    made using transferred savings from other products.
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-500 border border-gray-200 rounded-lg bg-gray-50">
                            <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                            No savings history for this product
                          </div>
                        )}
                      </div>
                    </div>


                  </div>
                );
              })()}


            </div>
          )}
        </div>
      </div>
    </div >
  );
};

export default MemberProfile;
