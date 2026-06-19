import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Trash2, Edit2, Search, Shield, Users, Building2, UserCog, Lock, KeyRound, Database, Download, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MemberForm from '../components/members/MemberForm';

const AdminControlPanel = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('members');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);

    // PIN Verification states
    const [isVerified, setIsVerified] = useState(false);
    const [isPinSet, setIsPinSet] = useState(false);
    const [pinLoading, setPinLoading] = useState(true);
    const [pinInput, setPinInput] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [verifying, setVerifying] = useState(false);

    // Data states
    const [members, setMembers] = useState([]);
    const [collectors, setCollectors] = useState([]);
    const [branches, setBranches] = useState([]);

    // Edit modal states
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const tabs = [
        { id: 'members', name: 'Members', icon: Users },
        { id: 'collectors', name: 'Collectors', icon: UserCog },
        { id: 'branches', name: 'Branches', icon: Building2 },
        { id: 'database', name: 'Backup & Restore', icon: Database },
    ];

    // Check PIN status on mount
    useEffect(() => {
        checkPinStatus();
    }, []);

    const checkPinStatus = async () => {
        try {
            const token = localStorage.getItem('ngo_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/pin-status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setIsPinSet(data.isPinSet);
            }
        } catch (error) {
            console.error('Error checking PIN status:', error);
        } finally {
            setPinLoading(false);
        }
    };

    const handleVerifyPin = async (e) => {
        if (e) e.preventDefault();
        setVerifying(true);
        try {
            const token = localStorage.getItem('ngo_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/verify-pin`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pin: pinInput })
            });

            const data = await response.json();
            if (data.success) {
                setIsVerified(true);
                toast.success('PIN Verified');
            } else {
                toast.error(data.message || 'Incorrect PIN');
                setPinInput('');
            }
        } catch (error) {
            toast.error('Verification failed');
        } finally {
            setVerifying(false);
        }
    };

    const handleSetPin = async (e) => {
        e.preventDefault();
        if (pinInput !== confirmPin) {
            toast.error('PINs do not match');
            return;
        }
        if (pinInput.length < 4) {
            toast.error('PIN must be at least 4 digits');
            return;
        }

        setVerifying(true);
        try {
            const token = localStorage.getItem('ngo_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/set-pin`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pin: pinInput })
            });

            const data = await response.json();
            if (data.success) {
                setIsPinSet(true);
                setIsVerified(true);
                toast.success('PIN setup successful');
            } else {
                toast.error(data.message || 'Failed to set PIN');
            }
        } catch (error) {
            toast.error('Setup failed');
        } finally {
            setVerifying(false);
        }
    };

    // Fetch data based on active tab - only if verified
    useEffect(() => {
        if (isVerified) {
            fetchData();
        }
    }, [activeTab, isVerified]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('ngo_token');

            if (!token) {
                console.error('❌ No token found');
                toast.error('Authentication required. Please login again.');
                setLoading(false);
                return;
            }

            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            let url = '';
            switch (activeTab) {
                case 'members':
                    url = `${import.meta.env.VITE_API_URL}/members?limit=1000`;
                    break;
                case 'collectors':
                    url = `${import.meta.env.VITE_API_URL}/collectors?limit=1000`;
                    break;
                case 'branches':
                    url = `${import.meta.env.VITE_API_URL}/branches/from-schedules`;
                    break;
                default:
                    return;
            }

            console.log(`🔍 Fetching ${activeTab} from:`, url);

            const response = await fetch(url, { headers });
            console.log(`📡 Response status for ${activeTab}:`, response.status);

            const data = await response.json();
            console.log(`📦 Response data for ${activeTab}:`, data);

            if (data.success) {
                console.log(`✅ Successfully loaded ${activeTab}:`, data.data?.length || 0, 'items');
                switch (activeTab) {
                    case 'members':
                        setMembers(data.data || []);
                        break;
                    case 'collectors':
                        setCollectors(data.data || []);
                        break;
                    case 'branches':
                        setBranches(data.data || []);
                        console.log('🏢 Branches state updated:', data.data);
                        break;
                }
            } else {
                console.error(`❌ Failed to load ${activeTab}:`, data.message);
                toast.error(data.message || `Failed to load ${activeTab}`);
            }
        } catch (error) {
            console.error(`❌ Error fetching ${activeTab}:`, error);
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    // Handle delete
    const handleDelete = async (id, type) => {
        const confirmMessage = `Are you sure you want to delete this ${type}?`;
        if (!window.confirm(confirmMessage)) return;

        try {
            const token = localStorage.getItem('ngo_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/${type}s/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`);
                fetchData();
            } else {
                toast.error(data.message || 'Failed to delete');
            }
        } catch (error) {
            console.error('Error deleting:', error);
            toast.error('Failed to delete');
        }
    };

    // Handle edit
    const handleEdit = (item, type) => {
        setEditingItem({ ...item, type });
        setEditFormData(item);
        setShowEditModal(true);
    };

    // Handle save edit
    const handleSaveEdit = async (memberData) => {
        try {
            const token = localStorage.getItem('ngo_token');

            let url, method, body;

            // Special handling for members - memberData comes directly from MemberForm
            if (activeTab === 'members') {
                // MemberForm passes the updated member data directly
                url = `${import.meta.env.VITE_API_URL}/members/${editingItem._id || editingItem.id}`;
                method = 'PUT';

                // Check if it's FormData (with image) or regular object
                if (memberData instanceof FormData) {
                    const response = await fetch(url, {
                        method,
                        headers: {
                            'Authorization': `Bearer ${token}`
                            // Don't set Content-Type for FormData, browser will set it with boundary
                        },
                        body: memberData
                    });

                    const data = await response.json();

                    if (data.success) {
                        toast.success('Member updated successfully');
                        setShowEditModal(false);
                        setEditingItem(null);
                        setEditFormData({});
                        fetchData();
                    } else {
                        toast.error(data.message || 'Failed to update member');
                    }
                    return;
                } else {
                    body = JSON.stringify(memberData);
                }
            }
            // Special handling for branches
            else if (editingItem.type === 'branch') {
                url = `${import.meta.env.VITE_API_URL}/branches/update-name/${editingItem.branchCode}`;
                method = 'PUT';
                body = JSON.stringify({ name: editFormData.name });
            } else {
                url = `${import.meta.env.VITE_API_URL}/${editingItem.type}s/${editingItem._id}`;
                method = 'PUT';
                body = JSON.stringify(editFormData);
            }

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body
            });

            const data = await response.json();

            if (data.success) {
                toast.success('Updated successfully');
                setShowEditModal(false);
                setEditingItem(null);
                setEditFormData({});
                fetchData();
            } else {
                toast.error(data.message || 'Failed to update');
            }
        } catch (error) {
            console.error('Error updating:', error);
            toast.error('Failed to update');
        }
    };

    // Filter data based on search
    const getFilteredData = () => {
        let data = [];
        switch (activeTab) {
            case 'members':
                data = members;
                break;
            case 'collectors':
                data = collectors;
                break;
            case 'branches':
                data = branches;
                break;
        }

        if (!searchTerm) return data;

        return data.filter(item => {
            const searchLower = searchTerm.toLowerCase();
            return (
                item.name?.toLowerCase().includes(searchLower) ||
                item.phone?.toLowerCase().includes(searchLower) ||
                item.email?.toLowerCase().includes(searchLower) ||
                item.branchCode?.toLowerCase().includes(searchLower) ||
                item.memberCode?.toLowerCase().includes(searchLower)
            );
        });
    };

    // Database Backup and Restore Handlers
    const [restoring, setRestoring] = useState(false);

    const handleDownloadBackup = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('ngo_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/database/backup`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Backup failed');
            }

            // Trigger file download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ngo_db_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast.success('Database backup downloaded successfully');
        } catch (error) {
            console.error('Error downloading backup:', error);
            toast.error('Failed to download database backup');
        } finally {
            setLoading(false);
        }
    };

    const handleRestoreBackup = async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('backup-file-input');
        const file = fileInput?.files?.[0];

        if (!file) {
            toast.error('Please select a backup JSON file first');
            return;
        }

        const confirmRestore = window.confirm(
            "⚠️ CRITICAL WARNING!\n\n" +
            "Are you sure you want to restore the database?\n" +
            "This will completely overwrite your current database and replace all data with the contents of the backup file.\n" +
            "This action cannot be undone."
        );
        if (!confirmRestore) return;

        setRestoring(true);
        const loadingToast = toast.loading('Restoring database... Please do not close this window.');

        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const backupData = JSON.parse(event.target.result);
                    
                    if (!backupData.collections) {
                        throw new Error('Invalid backup file structure. Missing "collections" key.');
                    }

                    const token = localStorage.getItem('ngo_token');
                    const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/database/restore`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ backupData })
                    });

                    const data = await response.json();
                    toast.dismiss(loadingToast);

                    if (data.success) {
                        toast.success('Database restored successfully!', { duration: 5000 });
                        fileInput.value = '';
                    } else {
                        toast.error(data.message || 'Restore failed');
                    }
                } catch (parseError) {
                    toast.dismiss(loadingToast);
                    console.error('Parse error:', parseError);
                    toast.error('Failed to parse backup JSON file: ' + parseError.message);
                } finally {
                    setRestoring(false);
                }
            };
            reader.readAsText(file);
        } catch (error) {
            toast.dismiss(loadingToast);
            console.error('Restore error:', error);
            toast.error('Restore operation failed');
            setRestoring(false);
        }
    };

    const renderBackupScreen = () => {
        return (
            <div className="p-8 space-y-8">
                {/* Backup Section */}
                <div className="bg-purple-50 rounded-2xl border border-purple-100 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                        <h3 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                            <Download className="h-5 w-5 text-purple-600" />
                            Backup Database
                        </h3>
                        <p className="text-sm text-purple-700">
                            Download a complete copy of your MongoDB database (including all members, collectors, branches, sales, and collection histories) to your local computer. This file can be used to restore the system later or migrate to another MongoDB database.
                        </p>
                    </div>
                    <button
                        onClick={handleDownloadBackup}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 whitespace-nowrap"
                    >
                        <Download className="h-5 w-5" />
                        {loading ? 'Downloading...' : 'Backup Database Now'}
                    </button>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100"></div>

                {/* Restore Section */}
                <div className="bg-red-50 rounded-2xl border border-red-100 p-6 space-y-4">
                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-red-900 flex items-center gap-2">
                            <Upload className="h-5 w-5 text-red-600" />
                            Restore Database
                        </h3>
                        <p className="text-sm text-red-700">
                            Restore your database from a previously downloaded JSON backup file. 
                        </p>
                        <div className="bg-red-100/50 border border-red-200 rounded-xl p-4 text-xs text-red-800 space-y-1">
                            <p className="font-bold">⚠️ CRITICAL WARNING:</p>
                            <p>1. This will permanently delete all current data in your MongoDB database.</p>
                            <p>2. Do not close this browser window or disconnect internet during the restore process.</p>
                            <p>3. Make sure to use a valid JSON backup file generated by this system.</p>
                        </div>
                    </div>

                    <form onSubmit={handleRestoreBackup} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                        <div className="flex-1">
                            <input
                                id="backup-file-input"
                                type="file"
                                accept=".json"
                                disabled={restoring}
                                className="w-full text-sm text-gray-500
                                    file:mr-4 file:py-2.5 file:px-4
                                    file:rounded-xl file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-red-100 file:text-red-700
                                    hover:file:bg-red-200
                                    border border-red-200 rounded-xl p-1 bg-white cursor-pointer"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={restoring}
                            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                            <Upload className="h-5 w-5" />
                            {restoring ? 'Restoring...' : 'Restore Database Now'}
                        </button>
                    </form>
                </div>
            </div>
        );
    };

    // Render table based on active tab
    const renderTable = () => {
        const filteredData = getFilteredData();

        if (loading) {
            return (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
            );
        }

        if (filteredData.length === 0) {
            return (
                <div className="text-center py-12">
                    <p className="text-gray-500">No {activeTab} found</p>
                </div>
            );
        }

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {activeTab === 'members' && (
                                <>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member Code</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </>
                            )}
                            {activeTab === 'collectors' && (
                                <>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch Code</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </>
                            )}
                            {activeTab === 'branches' && (
                                <>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch Code</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredData.map((item) => (
                            <tr key={item._id} className="hover:bg-gray-50">
                                {activeTab === 'members' && (
                                    <>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.memberCode}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.phone}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.branch}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleEdit(item, 'member')}
                                                className="text-indigo-600 hover:text-indigo-900 mr-3"
                                            >
                                                <Edit2 className="h-5 w-5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item._id, 'member')}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </>
                                )}
                                {activeTab === 'collectors' && (
                                    <>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.phone || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.branch || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.branchCode || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {item.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleEdit(item, 'collector')}
                                                className="text-indigo-600 hover:text-indigo-900 mr-3"
                                            >
                                                <Edit2 className="h-5 w-5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item._id, 'collector')}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </>
                                )}
                                {activeTab === 'branches' && (
                                    <>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.branchCode}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.address || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.memberCount || 0}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleEdit(item, 'branch')}
                                                className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                title="Edit branch name"
                                            >
                                                <Edit2 className="h-5 w-5" />
                                            </button>
                                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                                                Name only
                                            </span>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div >
        );
    };

    // Render edit modal
    const renderEditModal = () => {
        if (!showEditModal || !editingItem) return null;

        // Use MemberForm for members
        if (activeTab === 'members') {
            return (
                <div className="fixed inset-0 backdrop-blur-sm bg-white/30 z-50 flex items-center justify-center p-4">
                    <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <MemberForm
                            member={editingItem}
                            onSave={handleSaveEdit}
                            onCancel={() => {
                                setShowEditModal(false);
                                setEditingItem(null);
                                setEditFormData({});
                            }}
                        />
                    </div>
                </div>
            );
        }

        // Simple form for non-members (collectors, branches, products)
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4">
                    <h3 className="text-xl font-bold mb-4">
                        Edit {activeTab === 'collectors' ? 'Collector' : 'Branch'}
                    </h3>

                    <div className="space-y-4">
                        {activeTab === 'collectors' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={editFormData.name || ''}
                                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                    <input
                                        type="text"
                                        value={editFormData.phone || ''}
                                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                                    <input
                                        type="text"
                                        value={editFormData.branch || ''}
                                        onChange={(e) => setEditFormData({ ...editFormData, branch: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch Code</label>
                                    <input
                                        type="text"
                                        value={editFormData.branchCode || ''}
                                        onChange={(e) => setEditFormData({ ...editFormData, branchCode: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </>
                        )}

                        {activeTab === 'branches' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch Code</label>
                                    <input
                                        type="text"
                                        value={editFormData.branchCode || ''}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Branch code cannot be changed</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                                    <input
                                        type="text"
                                        value={editFormData.name || ''}
                                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Enter branch name"
                                    />
                                </div>
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                                    <p className="text-sm text-yellow-800">
                                        ℹ️ <strong>Note:</strong> Only the branch name can be edited here.
                                        This will update the name across all collection schedules where this branch appears.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            onClick={() => {
                                setShowEditModal(false);
                                setEditingItem(null);
                                setEditFormData({});
                            }}
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveEdit}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Render PIN screen
    if (pinLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (!isVerified) {
        return (
            <div className="flex items-center justify-center min-h-[500px] p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-purple-100">
                    <div className="bg-purple-600 p-8 flex flex-col items-center">
                        <div className="bg-white/20 p-4 rounded-full mb-4">
                            {isPinSet ? <Lock className="h-12 w-12 text-white" /> : <KeyRound className="h-12 w-12 text-white" />}
                        </div>
                        <h2 className="text-2xl font-bold text-white">
                            {isPinSet ? 'Admin Access' : 'Initial PIN Setup'}
                        </h2>
                        <p className="text-purple-100 text-center mt-2">
                            {isPinSet
                                ? 'Please enter your administrator PIN to continue'
                                : 'Protect the Admin Panel by setting up a unique PIN'}
                        </p>
                    </div>

                    <form onSubmit={isPinSet ? handleVerifyPin : handleSetPin} className="p-8 space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {isPinSet ? 'Enter PIN' : 'Choose a New PIN'}
                                </label>
                                <input
                                    type="password"
                                    value={pinInput}
                                    onChange={(e) => setPinInput(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center text-2xl tracking-[1em] font-bold"
                                    placeholder="••••"
                                    required
                                    autoFocus
                                />
                            </div>

                            {!isPinSet && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm PIN</label>
                                    <input
                                        type="password"
                                        value={confirmPin}
                                        onChange={(e) => setConfirmPin(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center text-2xl tracking-[1em] font-bold"
                                        placeholder="••••"
                                        required
                                    />
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={verifying}
                            className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all transform active:scale-[0.98] ${verifying ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200'
                                }`}
                        >
                            {verifying ? 'Processing...' : (isPinSet ? 'Verify Access' : 'Create PIN')}
                        </button>

                        <p className="text-xs text-gray-400 text-center mt-4">
                            {isPinSet
                                ? 'Contact the system administrator if you forgot your PIN.'
                                : 'Please remember this PIN as you will need it for every access.'}
                        </p>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Shield className="h-8 w-8 text-purple-600 mr-3" />
                        Admin Control Panel
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Centralized management for all members, collectors, and branches
                    </p>
                    {activeTab === 'branches' && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <p className="text-sm text-blue-800">
                                ℹ️ <strong>Note:</strong> Branches are managed through Collection Schedules.
                                To edit branches, please go to the Collection Schedule management page.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setSearchTerm('');
                                }}
                                className={`${activeTab === tab.id
                                    ? 'border-purple-500 text-purple-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                            >
                                <Icon className="h-5 w-5 mr-2" />
                                {tab.name}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Search Bar */}
            {activeTab !== 'database' && (
                <div className="flex items-center space-x-4">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={`Search ${activeTab}...`}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                    </div>
                    <button
                        onClick={fetchData}
                        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                        Refresh
                    </button>
                </div>
            )}

            {/* Content Area */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                {activeTab === 'database' ? renderBackupScreen() : renderTable()}
            </div>

            {/* Edit Modal */}
            {renderEditModal()}
        </div>
    );
};

export default AdminControlPanel;

