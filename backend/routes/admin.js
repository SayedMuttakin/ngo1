const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Member = require('../models/Member');
const Installment = require('../models/Installment');
const SystemSettings = require('../models/SystemSettings');

// @desc    Reset all financial data (delete installments, reset member balances)
// @route   POST /api/admin/reset-financial-data
// @access  Private/Admin
router.post('/reset-financial-data', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
        console.log('🔄 Starting financial data reset...');
        console.log('👤 Requested by:', req.user.name, '(', req.user.role, ')');

        // 1. Count before deletion
        const installmentCountBefore = await Installment.countDocuments({});
        const memberCountBefore = await Member.countDocuments({});

        console.log(`📊 Before reset: ${installmentCountBefore} installments, ${memberCountBefore} members`);

        // 2. Delete all installments
        console.log('🗑️  Deleting all installments...');
        const deletedInstallments = await Installment.deleteMany({});
        console.log(`   ✅ Deleted ${deletedInstallments.deletedCount} installments`);

        // 3. Reset member financial fields
        console.log('💰 Resetting member financial balances...');
        const updateResult = await Member.updateMany(
            {},
            {
                $set: {
                    totalSavings: 0,
                    totalPaid: 0,
                    lastPaymentDate: null
                }
            }
        );
        console.log(`   ✅ Reset balances for ${updateResult.modifiedCount} members`);

        // 4. Verify results
        const installmentCountAfter = await Installment.countDocuments({});
        const memberCountAfter = await Member.countDocuments({});

        const summary = {
            success: true,
            message: 'Financial data reset completed successfully',
            details: {
                installmentsDeleted: deletedInstallments.deletedCount,
                membersReset: updateResult.modifiedCount,
                before: {
                    installments: installmentCountBefore,
                    members: memberCountBefore
                },
                after: {
                    installments: installmentCountAfter,
                    members: memberCountAfter
                },
                resetBy: {
                    name: req.user.name,
                    role: req.user.role,
                    id: req.user.id
                },
                timestamp: new Date().toISOString()
            }
        };

        console.log('✅ Financial data reset completed successfully!');
        console.log('📊 Final summary:', summary);

        res.status(200).json(summary);

    } catch (error) {
        console.error('❌ Error during financial data reset:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset financial data',
            error: error.message
        });
    }
});

// @desc    Get reset statistics (what would be deleted)
// @route   GET /api/admin/reset-stats
// @access  Private/Admin
router.get('/reset-stats', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
        const installmentCount = await Installment.countDocuments({});
        const memberCount = await Member.countDocuments({});
        const membersWithSavings = await Member.countDocuments({ totalSavings: { $gt: 0 } });
        const membersWithPayments = await Member.countDocuments({ totalPaid: { $gt: 0 } });

        // Get total amounts
        const members = await Member.find({});
        const totalSavings = members.reduce((sum, m) => sum + (m.totalSavings || 0), 0);
        const totalPaid = members.reduce((sum, m) => sum + (m.totalPaid || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                installments: {
                    total: installmentCount,
                    willBeDeleted: installmentCount
                },
                members: {
                    total: memberCount,
                    withSavings: membersWithSavings,
                    withPayments: membersWithPayments,
                    willBeReset: memberCount
                },
                amounts: {
                    totalSavings,
                    totalPaid
                },
                warning: '⚠️ This action cannot be undone!'
            }
        });

    } catch (error) {
        console.error('Error getting reset stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get reset statistics',
            error: error.message
        });
    }
});

// @desc    Check if admin PIN is set
// @route   GET /api/admin/pin-status
// @access  Private/Admin
router.get('/pin-status', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
        const settings = await SystemSettings.getSettings();
        res.status(200).json({
            success: true,
            isPinSet: !!settings.adminPin
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to check PIN status'
        });
    }
});

// @desc    Set initial admin PIN
// @route   POST /api/admin/set-pin
// @access  Private/Admin
router.post('/set-pin', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin || pin.length < 4) {
            return res.status(400).json({
                success: false,
                message: 'PIN must be at least 4 digits'
            });
        }

        const settings = await SystemSettings.getSettings();
        if (settings.adminPin) {
            return res.status(400).json({
                success: false,
                message: 'PIN is already set'
            });
        }

        settings.adminPin = pin;
        await settings.save();

        res.status(200).json({
            success: true,
            message: 'PIN set successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to set PIN'
        });
    }
});

// @desc    Verify admin PIN
// @route   POST /api/admin/verify-pin
// @access  Private/Admin
router.post('/verify-pin', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { pin } = req.body;
        const settings = await SystemSettings.getSettings();

        if (!settings.adminPin) {
            return res.status(400).json({
                success: false,
                message: 'PIN is not set'
            });
        }

        if (settings.adminPin === pin) {
            res.status(200).json({
                success: true,
                message: 'PIN verified successfully'
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Incorrect PIN'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to verify PIN'
        });
    }
});

// @desc    Export database backup as JSON
// @route   GET /api/admin/database/backup
// @access  Private/Admin
router.get('/database/backup', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
        console.log('📦 Starting database backup export...');
        const backupData = {
            backupVersion: '1.0.0',
            timestamp: new Date().toISOString(),
            exportedBy: req.user.name,
            collections: {}
        };

        const models = {
            users: require('../models/User'),
            members: require('../models/Member'),
            branches: require('../models/Branch'),
            products: require('../models/Product'),
            distributions: require('../models/Distribution'),
            installments: require('../models/Installment'),
            collectionhistories: require('../models/CollectionHistory'),
            collectionschedules: require('../models/CollectionSchedule'),
            collectorschedules: require('../models/CollectorSchedule'),
            systemsettings: require('../models/SystemSettings')
        };

        for (const [key, Model] of Object.entries(models)) {
            let query = Model.find({});
            if (key === 'users') {
                query = query.select('+password');
            }
            const documents = await query.lean();
            backupData.collections[key] = documents;
            console.log(`   📂 Exported ${documents.length} documents from ${key}`);
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=ngo_db_backup_${new Date().toISOString().split('T')[0]}.json`);
        res.status(200).send(JSON.stringify(backupData, null, 2));
    } catch (error) {
        console.error('❌ Database backup export failed:', error);
        res.status(500).json({
            success: false,
            message: 'Database backup failed',
            error: error.message
        });
    }
});

// Helper function to sanitize documents before insertion
function sanitizeDoc(doc) {
    if (!doc || typeof doc !== 'object') return doc;
    const clean = { ...doc };
    delete clean.__v;

    // Convert _id if Extended JSON $oid
    if (clean._id && typeof clean._id === 'object' && clean._id.$oid) {
        clean._id = clean._id.$oid;
    }

    for (const [prop, value] of Object.entries(clean)) {
        if (value === null || value === undefined) continue;

        // Extended JSON $oid
        if (typeof value === 'object' && value.$oid) {
            clean[prop] = value.$oid;
        }
        // Extended JSON $date
        else if (typeof value === 'object' && value.$date) {
            clean[prop] = new Date(value.$date);
        }
        // Populated Object with _id (e.g. collector: { _id: "...", name: "..." })
        else if (
            typeof value === 'object' &&
            !(value instanceof Date) &&
            !Array.isArray(value) &&
            value._id
        ) {
            clean[prop] = typeof value._id === 'object' && value._id.$oid ? value._id.$oid : value._id;
        }
        // Convert ISO date strings to Date objects
        else if (
            typeof value === 'string' &&
            (prop.endsWith('Date') || prop.endsWith('At') || prop === 'lastLogin') &&
            /^\d{4}-\d{2}-\d{2}T/.test(value)
        ) {
            const parsedDate = new Date(value);
            if (!isNaN(parsedDate.getTime())) {
                clean[prop] = parsedDate;
            }
        }
    }

    return clean;
}

// Helper to get collection array flexibly from backup JSON
function getCollectionData(collections, targetKey) {
    if (!collections || typeof collections !== 'object') return [];
    if (Array.isArray(collections[targetKey])) return collections[targetKey];

    const normalizedTarget = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, val] of Object.entries(collections)) {
        const normalizedK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedK === normalizedTarget && Array.isArray(val)) {
            return val;
        }
    }
    return [];
}

// @desc    Restore database backup from uploaded JSON file
// @route   POST /api/admin/database/restore
// @access  Private/Admin
router.post('/database/restore', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
        console.log('📥 Starting database restore...');
        const { backupData } = req.body;

        if (!backupData || !backupData.collections) {
            return res.status(400).json({
                success: false,
                message: 'Invalid backup file format'
            });
        }

        const models = {
            users: require('../models/User'),
            members: require('../models/Member'),
            branches: require('../models/Branch'),
            products: require('../models/Product'),
            distributions: require('../models/Distribution'),
            installments: require('../models/Installment'),
            collectionhistories: require('../models/CollectionHistory'),
            collectionschedules: require('../models/CollectionSchedule'),
            collectorschedules: require('../models/CollectorSchedule'),
            systemsettings: require('../models/SystemSettings')
        };

        const restoreSummary = {};
        const bcrypt = require('bcryptjs');

        // Loop over each collection and restore
        for (const [key, Model] of Object.entries(models)) {
            const docs = getCollectionData(backupData.collections, key);

            try {
                // Delete existing collection
                await Model.deleteMany({});
                console.log(`   🗑️ Cleared collection: ${key}`);

                if (docs && docs.length > 0) {
                    const docsToInsert = await Promise.all(docs.map(async doc => {
                        const cleanDoc = sanitizeDoc(doc);

                        // If user collection and password missing, add fallback
                        if (key === 'users' && !cleanDoc.password) {
                            const salt = await bcrypt.genSalt(12);
                            cleanDoc.password = await bcrypt.hash('112233', salt);
                        }
                        return cleanDoc;
                    }));

                    try {
                        await Model.insertMany(docsToInsert, { ordered: false, validateBeforeSave: false });
                    } catch (bulkError) {
                        console.warn(`   ⚠️ Partial bulk insert note for ${key}:`, bulkError.message);
                    }

                    const countAfter = await Model.countDocuments();
                    console.log(`   ✅ Restored ${countAfter} documents into ${key}`);
                    restoreSummary[key] = countAfter;
                } else {
                    restoreSummary[key] = 0;
                }
            } catch (collError) {
                console.error(`   ❌ Failed restoring collection ${key}:`, collError.message);
                restoreSummary[key] = `Error: ${collError.message}`;
            }
        }

        res.status(200).json({
            success: true,
            message: 'Database restored successfully',
            summary: restoreSummary
        });
    } catch (error) {
        console.error('❌ Database restore failed:', error);
        res.status(500).json({
            success: false,
            message: 'Database restore failed: ' + error.message,
            error: error.message
        });
    }
});

module.exports = router;
