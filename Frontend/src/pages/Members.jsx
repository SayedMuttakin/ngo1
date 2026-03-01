import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import MemberCard from '../components/members/MemberCard';
import MemberForm from '../components/members/MemberForm';
import { membersAPI } from '../utils/api';
import toast from 'react-hot-toast';

const Members = () => {
  const [editingMember, setEditingMember] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const MEMBERS_PER_PAGE = 50;

  // Mock data for fallback (empty - will show "no members found")
  const mockMembers = [];

  // Fetch members from API
  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      setLoading(true);

      // Direct API call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      // Fetch ALL members with large limit
      const response = await fetch(`${API_URL}/members?limit=10000`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ngo_token')}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          console.log('✅ Members fetched:', data.data.length, 'members');
          console.log('📋 Sample member data:', data.data[0]);
          setMembers(data.data);
          return;
        }
      }

      // Fallback to mock data if API fails
      setMembers(mockMembers);
      toast.error('Failed to fetch members from server, showing sample data');

    } catch (error) {
      console.error('Error fetching members:', error);
      setMembers(mockMembers);
      toast.error('Error connecting to server, showing sample data');
    } finally {
      setLoading(false);
    }
  };

  // Refetch when search or filter changes (but not on initial load)
  useEffect(() => {
    if (searchTerm !== '' || filterStatus !== 'all') {
      const timeoutId = setTimeout(() => {
        fetchMembers();
      }, 500); // Debounce search

      return () => clearTimeout(timeoutId);
    }
  }, [searchTerm, filterStatus]);


  // Filter members based on search and status
  const filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.phone.includes(searchTerm) ||
      member.branch.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'all' || member.status.toLowerCase() === filterStatus.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredMembers.length / MEMBERS_PER_PAGE);
  const startIndex = (currentPage - 1) * MEMBERS_PER_PAGE;
  const paginatedMembers = filteredMembers.slice(startIndex, startIndex + MEMBERS_PER_PAGE);

  // Reset to page 1 when search/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus]);

  // Handle member actions
  const handleEditMember = async (memberData) => {
    try {
      const loadingToast = toast.loading('Updating member...');
      const response = await membersAPI.update(editingMember._id || editingMember.id, memberData);
      toast.dismiss(loadingToast);

      if (response.success) {
        toast.success('Member updated successfully!');
        setEditingMember(null);
        fetchMembers();
      } else {
        toast.error(response.message || 'Failed to update member');
      }
    } catch (error) {
      console.error('Error updating member:', error);
      toast.error('Error updating member. Please try again.');
    }
  };

  const handleAddMember = async (memberData) => {
    try {
      const loadingToast = toast.loading('Adding member...');

      // Check if memberData is FormData (has image) or regular object
      const response = memberData instanceof FormData
        ? await membersAPI.createWithImage(memberData)
        : await membersAPI.create(memberData);

      toast.dismiss(loadingToast);

      if (response.success) {
        toast.success('Member added successfully!');
        setShowAddForm(false);
        fetchMembers();
      } else {
        toast.error(response.message || 'Failed to add member');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Error adding member. Please try again.');
    }
  };

  const handleDeleteMember = async (memberToDelete) => {
    if (window.confirm(`Are you sure you want to delete ${memberToDelete.name}?`)) {
      try {
        const loadingToast = toast.loading('Deleting member...');
        const response = await membersAPI.delete(memberToDelete._id || memberToDelete.id);
        toast.dismiss(loadingToast);

        if (response.success) {
          toast.success('Member deleted successfully!');
          fetchMembers();
        } else {
          toast.error(response.message || 'Failed to delete member');
        }
      } catch (error) {
        console.error('Error deleting member:', error);
        toast.error('Error deleting member. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filter */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-6">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search members by name, phone, or branch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all"
                />
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white transition-all"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Add Member Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 backdrop-blur-sm bg-white/30 z-50 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <MemberForm
                onSave={handleAddMember}
                onCancel={() => {
                  setShowAddForm(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Edit Member Form Modal */}
        {editingMember && (
          <div className="fixed inset-0 backdrop-blur-sm bg-white/30 z-50 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <MemberForm
                member={editingMember}
                onSave={handleEditMember}
                onCancel={() => {
                  setEditingMember(null);
                }}
              />
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600"></div>
            <span className="ml-3 text-gray-600">Loading members...</span>
          </div>
        ) : (
          <>
            {/* Members Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {filteredMembers.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No members found</h3>
                  <p className="text-gray-600">
                    {searchTerm || filterStatus !== 'all'
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Get started by adding your first member.'}
                  </p>
                  {members.length > 0 && (
                    <p className="text-red-600 mt-2">
                      Note: {members.length} members exist but are filtered out
                    </p>
                  )}
                </div>
              ) : (
                paginatedMembers.map((member) => (
                  <MemberCard
                    key={member._id || member.id}
                    member={member}
                    onEdit={setEditingMember}
                    onDelete={handleDeleteMember}
                  />
                ))
              )}
            </div>

            {/* Pagination Controls */}
            {filteredMembers.length > MEMBERS_PER_PAGE && (
              <div className="mt-6 bg-white rounded-lg shadow-md border border-gray-200 p-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-gray-600">
                    Showing <span className="font-semibold">{startIndex + 1}</span> to <span className="font-semibold">{Math.min(startIndex + MEMBERS_PER_PAGE, filteredMembers.length)}</span> of <span className="font-semibold">{filteredMembers.length}</span> members
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </button>
                    {/* Page numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
                          if (totalPages <= 7) return true;
                          if (page === 1 || page === totalPages) return true;
                          if (Math.abs(page - currentPage) <= 1) return true;
                          return false;
                        })
                        .map((page, idx, arr) => (
                          <React.Fragment key={page}>
                            {idx > 0 && arr[idx - 1] !== page - 1 && (
                              <span className="px-2 text-gray-400">...</span>
                            )}
                            <button
                              onClick={() => setCurrentPage(page)}
                              className={`min-w-[36px] h-9 text-sm font-medium rounded-lg transition-all ${currentPage === page
                                  ? 'bg-indigo-600 text-white shadow-md'
                                  : 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                                }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        ))}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Members;