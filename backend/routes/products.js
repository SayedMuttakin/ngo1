const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const Product = require('../models/Product');
const { validateProduct } = require('../middleware/validation');

const router = express.Router();

// @desc    Get all products
// @route   GET /api/products
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      category,
      status,
      search,
      lowStock,
      page = 1,
      limit = 10000
    } = req.query;

    // Build query
    let query = { isActive: true };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get products
    let productsQuery = Product.find(query)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 });

    // Apply pagination
    const skip = (page - 1) * limit;
    productsQuery = productsQuery.skip(skip).limit(parseInt(limit));

    const products = await productsQuery;

    // Filter for low stock if requested
    let filteredProducts = products;
    if (lowStock === 'true') {
      filteredProducts = products.filter(product => product.isLowStock);
    }

    // Get total count
    const total = await Product.countDocuments(query);

    // Calculate global statistics for the dashboard
    // We fetch all active products once to calculate stats for the entire inventory
    const allActiveProducts = await Product.find({ isActive: true });

    const stats = {
      totalProducts: allActiveProducts.length,
      inStock: allActiveProducts.filter(p => !p.isLowStock && p.availableStock > 0).length,
      lowStock: allActiveProducts.filter(p => p.isLowStock && p.availableStock > 0).length,
      outOfStock: allActiveProducts.filter(p => p.availableStock === 0).length
    };

    res.json({
      success: true,
      data: filteredProducts,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message
    });
  }
});

// @desc    Create new product
// @route   POST /api/products
// @access  Private (Manager/Admin only)
router.post('/', protect, authorize('manager', 'admin'), async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      unit,
      unitPrice,
      totalStock,
      minimumStock,
      expiryDate,
      supplier
    } = req.body;

    // Validate input
    const validation = validateProduct(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    // Check if product already exists
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      isActive: true
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product with this name already exists'
      });
    }

    // Create product
    const productData = {
      name,
      category,
      description,
      unit,
      unitPrice: parseFloat(unitPrice),
      totalStock: parseInt(totalStock),
      availableStock: parseInt(totalStock), // Initially all stock is available
      initialStock: parseInt(totalStock), // Store initial stock
      minimumStock: parseInt(minimumStock) || 10,
      expiryDate: expiryDate || null,
      supplier: supplier || {},
      createdBy: req.user.id
    };

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Manager/Admin only)
router.put('/:id', protect, authorize('manager', 'admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Validate input
    const validation = validateProduct(req.body, true); // Pass true for isUpdate
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    // Check for duplicate name (excluding current product)
    if (req.body.name && req.body.name !== product.name) {
      const existingProduct = await Product.findOne({
        name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
        _id: { $ne: req.params.id },
        isActive: true
      });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product with this name already exists'
        });
      }
    }

    // Update fields
    const allowedFields = [
      'name', 'category', 'description', 'unit', 'unitPrice',
      'totalStock', 'availableStock', 'minimumStock', 'expiryDate',
      'supplier', 'status'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'unitPrice' || field === 'totalStock' || field === 'availableStock' || field === 'minimumStock') {
          product[field] = parseFloat(req.body[field]);
        } else {
          product[field] = req.body[field];
        }
      }
    });

    product.updatedBy = req.user.id;
    await product.save();

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
});

// @desc    Delete product (soft delete)
// @route   DELETE /api/products/:id
// @access  Private (Manager/Admin only)
router.delete('/:id', protect, authorize('manager', 'admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Soft delete
    product.isActive = false;
    product.status = 'Inactive';
    product.updatedBy = req.user.id;
    await product.save();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message
    });
  }
});

// @desc    Update product stock
// @route   PATCH /api/products/:id/stock
// @access  Private (Manager/Admin only)
router.patch('/:id/stock', protect, authorize('manager', 'admin'), async (req, res) => {
  try {
    const { action, quantity, reason } = req.body;

    if (!action || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Action and valid quantity are required'
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const qty = parseInt(quantity);

    if (action === 'add') {
      product.totalStock += qty;
      product.availableStock += qty;
      product.restockHistory.push({
        quantity: qty,
        date: new Date(),
        updatedBy: req.user.id,
        reason: reason || 'Stock added'
      });
    } else if (action === 'remove') {
      if (product.availableStock < qty) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock available'
        });
      }
      product.totalStock -= qty;
      product.availableStock -= qty;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "add" or "remove"'
      });
    }

    product.updatedBy = req.user.id;
    await product.save();

    res.json({
      success: true,
      message: `Stock ${action}ed successfully`,
      data: product
    });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock',
      error: error.message
    });
  }
});

// @desc    Get product statistics
// @route   GET /api/products/stats/overview
// @access  Private
router.get('/stats/overview', protect, async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ isActive: true });
    const activeProducts = await Product.countDocuments({ status: 'Active', isActive: true });
    const outOfStock = await Product.countDocuments({ status: 'Out of Stock', isActive: true });
    const expiredProducts = await Product.countDocuments({ status: 'Expired', isActive: true });

    // Low stock products
    const products = await Product.find({ isActive: true });
    const lowStockProducts = products.filter(product => product.isLowStock).length;

    // Total stock value
    const totalStockValue = products.reduce((sum, product) => {
      return sum + (product.availableStock * product.unitPrice);
    }, 0);

    // Category breakdown
    const categoryStats = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalProducts,
        activeProducts,
        outOfStock,
        expiredProducts,
        lowStockProducts,
        totalStockValue,
        categoryStats
      }
    });
  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product statistics',
      error: error.message
    });
  }
});

// @desc    Get sales report by date
// @route   GET /api/products/sales/report
// @access  Private
router.get('/sales/report', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // CRITICAL: Frontend sends Bangladesh date (YYYY-MM-DD)
    // We need to convert to UTC range that covers that Bangladesh date
    // BD date 2025-10-11 = UTC 2025-10-10 18:00:00 to 2025-10-11 17:59:59

    let start, end;

    if (startDate) {
      // Parse the BD date
      const [year, month, day] = startDate.split('-').map(Number);
      // BD date starts at UTC previous day 18:00 (BD 00:00 = UTC-6)
      start = new Date(Date.UTC(year, month - 1, day - 1, 18, 0, 0, 0));
    } else {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    }

    if (endDate) {
      // Parse the BD date
      const [year, month, day] = endDate.split('-').map(Number);
      // BD date ends at UTC same day 17:59:59 (BD 23:59 = UTC+6)
      end = new Date(Date.UTC(year, month - 1, day, 17, 59, 59, 999));
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    console.log('📊 Fetching sales report from Installments');
    console.log('   BD Date requested:', startDate, 'to', endDate);
    console.log('   UTC Range: Start:', start.toISOString());
    console.log('   UTC Range: End:', end.toISOString());

    // Get product sales from Installments (installmentType: 'extra' with 'Product Sale:' in note)
    const Installment = require('../models/Installment');

    // Find all product sale installments within date range
    const productSales = await Installment.find({
      collectionDate: { $gte: start, $lte: end },
      installmentType: 'extra',
      note: { $regex: 'Product Sale:', $options: 'i' },
      status: 'collected',
      isActive: true
    })
      .populate('member', 'name memberId')
      .populate('collector', 'name')
      .sort({ collectionDate: -1 });

    console.log(`✅ Found ${productSales.length} product sale records`);

    // Debug: Show first 3 records
    if (productSales.length > 0) {
      console.log('Sample records:');
      productSales.slice(0, 3).forEach((sale, i) => {
        console.log(`  ${i + 1}. Note: ${sale.note}`);
        console.log(`     Amount: ৳${sale.amount}`);
        console.log(`     Date: ${sale.collectionDate}`);
      });
    } else {
      console.log('⚠️ No product sales found in this date range');
      console.log('Checking if there are ANY product sales in database...');
      const anySales = await Installment.find({
        installmentType: 'extra',
        note: { $regex: 'Product Sale:', $options: 'i' },
        status: 'collected',
        isActive: true
      }).limit(3);
      console.log(`Found ${anySales.length} product sales in total (any date)`);
      if (anySales.length > 0) {
        anySales.forEach((sale, i) => {
          console.log(`  ${i + 1}. Date: ${sale.collectionDate?.toISOString().split('T')[0] || 'No date'}`);
          console.log(`     Note: ${sale.note?.substring(0, 80)}`);
        });
      }
    }

    // Aggregate sales by product
    const productSalesMap = {};
    let totalSalesValue = 0;
    let totalQuantitySold = 0;

    for (const sale of productSales) {
      try {
        // Extract product details from note
        // Format: "Product Sale: ProductName (Qty: X kg/piece, ৳XXX) | Payment: ..."
        // OR: "Product Sale: ProductName (Qty: X, ৳XXX) | Payment: ..." (without unit)

        let noteMatch = sale.note.match(/Product Sale: (.+?) \(Qty: ([\d.]+)\s*(\w+),\s*৳([\d,]+)\)/);
        let productName, quantity, unit, subtotal;

        if (noteMatch) {
          // Format with unit: "Product Sale: Mobile (Qty: 2 piece, ৳25400)"
          productName = noteMatch[1].trim();
          quantity = parseFloat(noteMatch[2]);
          unit = noteMatch[3];
          subtotal = parseFloat(noteMatch[4].replace(/,/g, ''));
        } else {
          // Try format without unit: "Product Sale: Mobile (Qty: 2, ৳25400)"
          noteMatch = sale.note.match(/Product Sale: (.+?) \(Qty: ([\d.]+),\s*৳([\d,]+)\)/);
          if (noteMatch) {
            productName = noteMatch[1].trim();
            quantity = parseFloat(noteMatch[2]);
            unit = 'piece'; // Default unit
            subtotal = parseFloat(noteMatch[3].replace(/,/g, ''));
          }
        }

        if (noteMatch && productName) {

          // Try to find the product in database
          const productDoc = await Product.findOne({ name: productName });
          const productId = productDoc ? productDoc._id.toString() : productName;
          const category = productDoc ? productDoc.category : 'Other';
          const unitPrice = quantity > 0 ? (subtotal / quantity) : 0;

          if (!productSalesMap[productId]) {
            productSalesMap[productId] = {
              productId,
              name: productName,
              category: category,
              unit: unit,
              unitPrice: unitPrice,
              totalQuantity: 0,
              totalValue: 0,
              transactions: 0
            };
          }

          productSalesMap[productId].totalQuantity += quantity;
          productSalesMap[productId].totalValue += subtotal;
          productSalesMap[productId].transactions += 1;

          totalSalesValue += subtotal;
          totalQuantitySold += quantity;

          console.log(`  ✅ ${productName}: ${quantity} ${unit} = ৳${subtotal}`);
        } else {
          console.log(`  ⚠️ Could not parse note: ${sale.note}`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing sale ${sale._id}:`, error.message);
      }
    }

    // Convert to array and sort by value
    const salesArray = Object.values(productSalesMap).sort((a, b) => b.totalValue - a.totalValue);

    console.log(`📊 Summary: ${salesArray.length} products, ${totalQuantitySold} units, ৳${totalSalesValue}`);

    res.json({
      success: true,
      data: {
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        summary: {
          totalDistributions: productSales.length,
          totalProductsSold: salesArray.length,
          totalQuantitySold,
          totalSalesValue
        },
        productSales: salesArray
      }
    });
  } catch (error) {
    console.error('❌ Error fetching sales report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sales report',
      error: error.message
    });
  }
});

// @desc    Get today's product activity report
// @route   GET /api/products/today/report
// @access  Private
router.get('/today/report', protect, async (req, res) => {
  try {
    const { date } = req.query;
    
    let bdYear, bdMonth, bdDay;
    if (date) {
      // Expecting 'YYYY-MM-DD'
      const parts = date.split('-');
      bdYear = parseInt(parts[0], 10);
      bdMonth = parseInt(parts[1], 10) - 1;
      bdDay = parseInt(parts[2], 10);
    } else {
      const now = new Date();
      // Bangladesh timezone offset = UTC+6
      const bdOffset = 6 * 60 * 60 * 1000;
      // Get today's date in BD timezone
      const bdNow = new Date(now.getTime() + bdOffset);
      bdYear = bdNow.getUTCFullYear();
      bdMonth = bdNow.getUTCMonth();
      bdDay = bdNow.getUTCDate();
    }

    // Target date start in UTC = BD midnight = UTC prev day 18:00
    const todayStart = new Date(Date.UTC(bdYear, bdMonth, bdDay - 1, 18, 0, 0, 0));
    // Target date end in UTC = BD midnight next day - 1ms = UTC today 17:59:59
    const todayEnd = new Date(Date.UTC(bdYear, bdMonth, bdDay, 17, 59, 59, 999));

    console.log('📅 Product Report - BD Date:', `${bdYear}-${bdMonth + 1}-${bdDay}`);
    console.log('   UTC Range:', todayStart.toISOString(), 'to', todayEnd.toISOString());

    // 1. Products added today
    const productsAddedToday = await Product.find({
      isActive: true,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    }).populate('createdBy', 'name').sort({ createdAt: -1 });

    // 2. Products updated (stock added) today
    const productsWithRestocks = await Product.find({
      isActive: true,
      'restockHistory.date': { $gte: todayStart, $lte: todayEnd }
    }).populate({
      path: 'restockHistory.updatedBy',
      select: 'name'
    }).populate('updatedBy', 'name');

    // Format productsRestocked array
    const productsRestockedToday = productsWithRestocks.map(p => {
      // Filter today's restock entries
      const todayRestocks = p.restockHistory.filter(r => r.date >= todayStart && r.date <= todayEnd);
      const totalAdded = todayRestocks.reduce((sum, r) => sum + r.quantity, 0);

      // Get the latest restock entry for display details
      const latestRestock = todayRestocks.reduce((latest, current) => {
        return !latest.date || current.date > latest.date ? current : latest;
      }, {});

      return {
        _id: p._id,
        name: p.name,
        category: p.category,
        unitPrice: p.unitPrice,
        availableStock: p.availableStock,
        unit: p.unit,
        addedQuantity: totalAdded,
        updatedBy: latestRestock.updatedBy?.name || p.updatedBy?.name || 'Unknown',
        updatedAt: latestRestock.date || p.updatedAt
      };
    });

    // Sort restocked products by updatedAt descending
    productsRestockedToday.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // 3. Today's product sales from Installments
    const Installment = require('../models/Installment');
    const todaySales = await Installment.find({
      collectionDate: { $gte: todayStart, $lte: todayEnd },
      installmentType: 'extra',
      note: { $regex: 'Product Sale:', $options: 'i' },
      status: 'collected',
      isActive: true
    }).populate('member', 'name memberCode').populate('collector', 'name').sort({ collectionDate: -1 });

    // Parse sales details
    let totalSalesValue = 0;
    let totalQtySold = 0;
    const salesDetails = [];

    for (const sale of todaySales) {
      try {
        let noteMatch = sale.note.match(/Product Sale: (.+?) \(Qty: ([\d.]+)\s*(\w+),\s*৳([\d,]+)\)/);
        let productName, quantity, unit, subtotal;

        if (noteMatch) {
          productName = noteMatch[1].trim();
          quantity = parseFloat(noteMatch[2]);
          unit = noteMatch[3];
          subtotal = parseFloat(noteMatch[4].replace(/,/g, ''));
        } else {
          noteMatch = sale.note.match(/Product Sale: (.+?) \(Qty: ([\d.]+),\s*৳([\d,]+)\)/);
          if (noteMatch) {
            productName = noteMatch[1].trim();
            quantity = parseFloat(noteMatch[2]);
            unit = 'piece';
            subtotal = parseFloat(noteMatch[3].replace(/,/g, ''));
          }
        }

        if (noteMatch && productName) {
          totalSalesValue += subtotal;
          totalQtySold += quantity;
          salesDetails.push({
            productName,
            quantity,
            unit,
            subtotal,
            memberName: sale.member?.name || 'Unknown',
            memberCode: sale.member?.memberCode || '',
            collectorName: sale.collector?.name || 'Unknown',
            collectionDate: sale.collectionDate,
            note: sale.note
          });
        }
      } catch (err) {
        console.error('Error parsing sale note:', err.message);
      }
    }

    // Aggregate sales by product name
    const salesByProduct = {};
    for (const s of salesDetails) {
      if (!salesByProduct[s.productName]) {
        salesByProduct[s.productName] = { productName: s.productName, unit: s.unit, totalQty: 0, totalValue: 0, transactions: 0 };
      }
      salesByProduct[s.productName].totalQty += s.quantity;
      salesByProduct[s.productName].totalValue += s.subtotal;
      salesByProduct[s.productName].transactions += 1;
    }

    res.json({
      success: true,
      data: {
        date: `${bdYear}-${String(bdMonth + 1).padStart(2, '0')}-${String(bdDay).padStart(2, '0')}`,
        productsAdded: productsAddedToday.map(p => {
          const addedQty = p.initialStock !== undefined ? p.initialStock : p.totalStock;
          return {
            _id: p._id,
            name: p.name,
            category: p.category,
            unitPrice: p.unitPrice,
            totalStock: p.totalStock,
            availableStock: p.availableStock,
            initialStock: addedQty,
            unit: p.unit,
            createdBy: p.createdBy?.name || 'Unknown',
            createdAt: p.createdAt,
            stockValue: addedQty * p.unitPrice
          };
        }),
        productsRestocked: productsRestockedToday,
        sales: {
          totalTransactions: todaySales.length,
          totalSalesValue,
          totalQtySold,
          byProduct: Object.values(salesByProduct).sort((a, b) => b.totalValue - a.totalValue),
          details: salesDetails
        },
        summary: {
          newProductsCount: productsAddedToday.length,
          restockedCount: productsRestockedToday.length,
          totalSalesValue,
          totalNewStockValue: productsAddedToday.reduce((sum, p) => {
            const addedQty = p.initialStock !== undefined ? p.initialStock : p.totalStock;
            return sum + (addedQty * p.unitPrice);
          }, 0)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching today report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching today report',
      error: error.message
    });
  }
});

// @desc    Get collector product sales report (Daily or Monthly)
// @route   GET /api/products/collector-sales/report
// @access  Private
router.get('/collector-sales/report', protect, async (req, res) => {
  try {
    const { date, month } = req.query;
    const User = require('../models/User');
    const Installment = require('../models/Installment');

    let start, end, periodLabel, filterType;

    if (month) {
      // month is YYYY-MM
      filterType = 'monthly';
      const [year, m] = month.split('-').map(Number);
      // BD Time start of month
      start = new Date(Date.UTC(year, m - 1, 0, 18, 0, 0, 0));
      end = new Date(Date.UTC(year, m, 0, 17, 59, 59, 999));
      periodLabel = month;
    } else {
      filterType = 'daily';
      let targetDateStr = date;
      if (!targetDateStr) {
        // Default to today in BD time
        const now = new Date();
        const bdNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
        const y = bdNow.getFullYear();
        const m = String(bdNow.getMonth() + 1).padStart(2, '0');
        const d = String(bdNow.getDate()).padStart(2, '0');
        targetDateStr = `${y}-${m}-${d}`;
      }
      const [year, m, day] = targetDateStr.split('-').map(Number);
      start = new Date(Date.UTC(year, m - 1, day - 1, 18, 0, 0, 0));
      end = new Date(Date.UTC(year, m - 1, day, 17, 59, 59, 999));
      periodLabel = targetDateStr;
    }

    console.log(`📊 Fetching collector product sales report (${filterType})`);

    // Get all active collectors
    const collectors = await User.find({
      role: 'collector',
      isActive: true
    }).select('_id name email phone branch branchCode');

    // Find all product sale installments within date range
    const productSales = await Installment.find({
      collectionDate: { $gte: start, $lte: end },
      installmentType: 'extra',
      note: { $regex: 'Product Sale:', $options: 'i' },
      status: 'collected',
      isActive: true
    })
      .populate('member', 'name memberId branchCode phone')
      .populate('collector', 'name email phone')
      .sort({ collectionDate: -1 });

    // Group sales by collector
    const collectorMap = {};

    // Initialize all active collectors in the map
    collectors.forEach(c => {
      collectorMap[c._id.toString()] = {
        collectorId: c._id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        branch: c.branch,
        branchCode: c.branchCode,
        totalSalesValue: 0,
        totalTransactions: 0,
        totalItemsCount: 0,
        sales: []
      };
    });

    let grandTotalSalesValue = 0;
    let totalTransactionsCount = 0;

    for (const sale of productSales) {
      let collectorId = sale.collector?._id ? sale.collector._id.toString() : null;

      if (collectorId && !collectorMap[collectorId]) {
        collectorMap[collectorId] = {
          collectorId: sale.collector._id,
          name: sale.collector.name || 'Unknown',
          email: sale.collector.email || '',
          phone: sale.collector.phone || '',
          branch: sale.collector.branch || '',
          branchCode: sale.collector.branchCode || '',
          totalSalesValue: 0,
          totalTransactions: 0,
          totalItemsCount: 0,
          sales: []
        };
      } else if (!collectorId) {
        const unassignedKey = 'unassigned';
        if (!collectorMap[unassignedKey]) {
          collectorMap[unassignedKey] = {
            collectorId: 'unassigned',
            name: 'Unassigned / Admin',
            email: '',
            phone: '',
            branch: '',
            branchCode: '',
            totalSalesValue: 0,
            totalTransactions: 0,
            totalItemsCount: 0,
            sales: []
          };
        }
        collectorId = unassignedKey;
      }

      let noteMatch = sale.note.match(/Product Sale: (.+?) \(Qty: ([\d.]+)\s*(\w+),\s*৳([\d,]+)\)/);
      let productName = 'Product Sale', quantity = 1, unit = 'piece', subtotal = sale.amount || 0;

      if (noteMatch) {
        productName = noteMatch[1].trim();
        quantity = parseFloat(noteMatch[2]);
        unit = noteMatch[3];
        subtotal = parseFloat(noteMatch[4].replace(/,/g, ''));
      } else {
        noteMatch = sale.note.match(/Product Sale: (.+?) \(Qty: ([\d.]+),\s*৳([\d,]+)\)/);
        if (noteMatch) {
          productName = noteMatch[1].trim();
          quantity = parseFloat(noteMatch[2]);
          unit = 'piece';
          subtotal = parseFloat(noteMatch[3].replace(/,/g, ''));
        }
      }

      const saleItem = {
        installmentId: sale._id,
        productName,
        quantity,
        unit,
        subtotal,
        memberId: sale.member?._id,
        memberName: sale.member?.name || 'Unknown Member',
        memberCode: sale.member?.memberId || 'N/A',
        memberPhone: sale.member?.phone || '',
        collectionDate: sale.collectionDate,
        note: sale.note
      };

      collectorMap[collectorId].totalSalesValue += subtotal;
      collectorMap[collectorId].totalTransactions += 1;
      collectorMap[collectorId].totalItemsCount += quantity;
      collectorMap[collectorId].sales.push(saleItem);

      grandTotalSalesValue += subtotal;
      totalTransactionsCount += 1;
    }

    const collectorResults = Object.values(collectorMap).sort((a, b) => b.totalSalesValue - a.totalSalesValue);
    const activeSellersCount = collectorResults.filter(c => c.totalSalesValue > 0).length;

    res.json({
      success: true,
      data: {
        filterType,
        period: periodLabel,
        summary: {
          grandTotalSalesValue,
          totalTransactionsCount,
          totalCollectorsCount: collectors.length,
          activeSellersCount
        },
        collectors: collectorResults
      }
    });

  } catch (error) {
    console.error('❌ Error fetching collector sales report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching collector sales report',
      error: error.message
    });
  }
});

module.exports = router;

