// API utility functions for making authenticated requests

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Helper function to get auth token
const getAuthToken = () => {
  return localStorage.getItem('ngo_token');
};

// Helper function to get auth headers
const getAuthHeaders = (isFormData = false) => {
  const token = getAuthToken();
  const headers = {
    ...(token && { 'Authorization': `Bearer ${token}` })
  };

  // Don't set Content-Type for FormData, let browser set it with boundary
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

// Generic API request function
export const apiRequest = async (endpoint, options = {}) => {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const isFormData = options.body instanceof FormData;

    const config = {
      headers: {
        ...getAuthHeaders(isFormData),
        // ✅ Add cache-control headers to prevent browser caching
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      ...options,
      ...(options.body && typeof options.body === 'object' && !isFormData && {
        body: JSON.stringify(options.body)
      }),
      ...(isFormData && { body: options.body })
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('ngo_token');
        localStorage.removeItem('ngo_user');
        window.location.href = '/login';
        throw new Error('Authentication failed. Please login again.');
      }

      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
};

// Members API functions
export const membersAPI = {
  // Get all members with optional filters
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/members${queryString ? `?${queryString}` : ''}`);
  },

  // Get single member by ID
  getById: (id) => apiRequest(`/members/${id}`),

  // Create new member
  create: (memberData) => apiRequest('/members', {
    method: 'POST',
    body: memberData
  }),

  // Update member
  update: (id, memberData) => apiRequest(`/members/${id}`, {
    method: 'PUT',
    body: memberData
  }),

  // Delete member
  delete: (id) => apiRequest(`/members/${id}`, {
    method: 'DELETE'
  }),

  // Get member statistics
  getStats: () => apiRequest('/members/stats/overview'),

  // Get members by branch
  getByBranch: (branchCode) => apiRequest(`/members/branch/${branchCode}`),

  // ✅ Check if member code exists (global uniqueness)
  checkCode: (memberCode, excludeMemberId = null) => {
    const params = new URLSearchParams();
    if (excludeMemberId) params.append('excludeMemberId', excludeMemberId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/members/check-code/${memberCode}${query}`);
  },

  // Create member with image
  createWithImage: (formData) => apiRequest('/members', {
    method: 'POST',
    body: formData
  }),

  // Update member with image
  updateWithImage: (id, formData) => apiRequest(`/members/${id}`, {
    method: 'PUT',
    body: formData
  })
};

// Auth API functions
export const authAPI = {
  // Login
  login: (credentials) => apiRequest('/auth/login', {
    method: 'POST',
    body: credentials
  }),

  // Register
  register: (userData) => apiRequest('/auth/register', {
    method: 'POST',
    body: userData
  }),

  // Get current user
  getCurrentUser: () => apiRequest('/auth/me'),

  // Update profile
  updateProfile: (profileData) => apiRequest('/auth/profile', {
    method: 'PUT',
    body: profileData
  }),

  // Change password
  changePassword: (passwordData) => apiRequest('/auth/change-password', {
    method: 'PUT',
    body: passwordData
  }),

  // Logout
  logout: () => apiRequest('/auth/logout', {
    method: 'POST'
  }),

  // Check authentication
  checkAuth: () => apiRequest('/auth/check'),

  // Get pending users (super admin only)
  getPendingUsers: () => apiRequest('/auth/pending-users'),

  // Get all users (super admin only)
  getAllUsers: () => apiRequest('/auth/all-users'),

  // Approve user (super admin only)
  approveUser: (userId) => apiRequest(`/auth/approve-user/${userId}`, {
    method: 'PUT'
  }),

  // Reject user (super admin only)
  rejectUser: (userId) => apiRequest(`/auth/reject-user/${userId}`, {
    method: 'DELETE'
  }),

  // Activate user (super admin only)
  activateUser: (userId) => apiRequest(`/auth/activate-user/${userId}`, {
    method: 'PUT'
  }),

  // Deactivate user (super admin only)
  deactivateUser: (userId) => apiRequest(`/auth/deactivate-user/${userId}`, {
    method: 'PUT'
  }),

  // Delete user permanently (super admin only)
  deleteUser: (userId) => apiRequest(`/auth/delete-user/${userId}`, {
    method: 'DELETE'
  }),

  // Get system settings (super admin only)
  getSystemSettings: () => apiRequest('/auth/system-settings'),

  // Update system settings (super admin only)
  updateSystemSettings: (settings) => apiRequest('/auth/system-settings', {
    method: 'POST',
    body: settings
  })
};

// Dashboard API functions
export const dashboardAPI = {
  // Get dashboard statistics
  getStats: () => apiRequest('/dashboard/stats'),

  // Get collection trends
  getTrends: (days = 7) => apiRequest(`/dashboard/trends?days=${days}`),

  // Get daily collection performance
  getDailyCollection: (date = null) => {
    const params = date ? `?date=${date}` : '';
    return apiRequest(`/dashboard/daily-collection${params}`);
  },

  // Get daily savings performance
  getDailySavings: (date = null) => {
    const params = date ? `?date=${date}` : '';
    return apiRequest(`/dashboard/daily-savings${params}`);
  },

  // Get collector dashboard data
  getCollectorDashboard: (collectorId, date = null, day = null) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (day) params.append('day', day);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/collector-dashboard/${collectorId}${queryString}`);
  },

  // Get real-time collectors performance
  getCollectorsPerformance: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/dashboard/collectors-performance${queryString ? `?${queryString}` : ''}`);
  },

  // Get comprehensive dashboard overview (with optional month/year filter)
  getOverview: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/dashboard/overview${queryString ? `?${queryString}` : ''}`);
  }
};


// Installments API functions
export const installmentsAPI = {
  // Get all installments with filters
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/installments${queryString ? `?${queryString}` : ''}`);
  },

  // Get single installment by ID
  getById: (id) => apiRequest(`/installments/${id}`),

  // Collect installment
  collect: (installmentData) => apiRequest('/installments/collect', {
    method: 'POST',
    body: installmentData
  }),

  // Get collection schedule by day
  getScheduleByDay: (day) => apiRequest(`/installments/schedule/${day}`),

  // Get collector's schedule for specific day
  getCollectorSchedule: (collectorId, day) => apiRequest(`/installments/collector/${collectorId}/day/${day}`),

  // Get potential deductions
  getPotentialDeductions: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/installments/potential-deductions${queryString ? `?${queryString}` : ''}`);
  },

  // Get member's active product sales count
  getActiveSales: (memberId) => apiRequest(`/installments/active-sales/${memberId}`),

  // Get daily collection summary
  getDailySummary: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/installments/daily-summary${queryString ? `?${queryString}` : ''}`);
  },

  // Get member installment history
  getMemberHistory: (memberId, limit = 10) => {
    // Add timestamp to bypass browser cache and get fresh data
    const timestamp = new Date().getTime();
    return apiRequest(`/installments/member/${memberId}/history?limit=${limit}&_t=${timestamp}`);
  },

  // Get installments by member ID
  getByMember: (memberId) => {
    // Add timestamp to bypass browser cache
    const timestamp = new Date().getTime();
    return apiRequest(`/installments/member/${memberId}?_t=${timestamp}`);
  },

  // Get collection history by member ID (each collection as separate row)
  getCollectionHistory: (memberId) => {
    const timestamp = new Date().getTime();
    return apiRequest(`/installments/member/${memberId}/collection-history?_t=${timestamp}`);
  },

  // Update installment (admin/manager only)
  update: (id, updateData) => apiRequest(`/installments/${id}`, {
    method: 'PUT',
    body: updateData
  }),

  // Cancel installment (admin/manager only)
  cancel: (id) => apiRequest(`/installments/${id}`, {
    method: 'DELETE'
  }),

  // Create product sale with installments
  createProductSale: (productSaleData) => apiRequest('/installments/product-sale', {
    method: 'POST',
    body: productSaleData
  }),

  // Create product loan installments
  createProductLoan: (loanData) => apiRequest('/installments/create-product-loan', {
    method: 'POST',
    body: loanData
  }),

  // Recalculate due dates for member's loan installments
  recalculateDueDates: (memberId, collectorId) => apiRequest(`/installments/recalculate-due-dates/${memberId}`, {
    method: 'POST',
    body: { collectorId }
  })
};

// Collection Schedules API functions
export const schedulesAPI = {
  // Get all schedules
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/schedules${queryString ? `?${queryString}` : ''}`);
  },

  // Get single schedule by ID
  getById: (id) => apiRequest(`/schedules/${id}`),

  // Create new schedule
  create: (scheduleData) => apiRequest('/schedules', {
    method: 'POST',
    body: scheduleData
  }),

  // Update schedule
  update: (id, scheduleData) => apiRequest(`/schedules/${id}`, {
    method: 'PUT',
    body: scheduleData
  }),

  // Delete schedule
  delete: (id) => apiRequest(`/schedules/${id}`, {
    method: 'DELETE'
  }),

  // Add new branch to schedule
  addBranchToSchedule: (scheduleId, branchData) => apiRequest(`/schedules/${scheduleId}/branches`, {
    method: 'POST',
    body: branchData
  }),

  // Add members to branch in schedule
  addMembersToBranch: (scheduleId, branchCode, memberIds) => apiRequest(`/schedules/${scheduleId}/branches/${branchCode}/members`, {
    method: 'POST',
    body: { memberIds }
  }),

  // Remove member from branch in schedule
  removeMemberFromBranch: (scheduleId, branchCode, memberId) => apiRequest(`/schedules/${scheduleId}/branches/${branchCode}/members/${memberId}`, {
    method: 'DELETE'
  }),

  // Get weekly schedule overview
  getWeeklyOverview: (collectorId = null) => {
    const params = collectorId ? `?collectorId=${collectorId}` : '';
    return apiRequest(`/schedules/weekly-overview${params}`);
  }
};

// Savings API functions (placeholder)
export const savingsAPI = {
  getAll: () => apiRequest('/savings'),
  create: (savingsData) => apiRequest('/savings', {
    method: 'POST',
    body: savingsData
  })
};

// Products API functions
export const productsAPI = {
  // Get all products
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/products${queryString ? `?${queryString}` : ''}`);
  },

  // Get single product
  getById: (id) => apiRequest(`/products/${id}`),

  // Create new product
  create: (productData) => apiRequest('/products', {
    method: 'POST',
    body: productData
  }),

  // Update product
  update: (id, productData) => apiRequest(`/products/${id}`, {
    method: 'PUT',
    body: productData
  }),

  // Delete product
  delete: (id) => apiRequest(`/products/${id}`, {
    method: 'DELETE'
  }),

  // Update product stock
  updateStock: (id, stockData) => apiRequest(`/products/${id}/stock`, {
    method: 'PATCH',
    body: stockData
  }),

  // Get product statistics
  getStats: () => apiRequest('/products/stats/overview'),

  // Get sales report by date range
  getSalesReport: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/products/sales/report${queryString ? `?${queryString}` : ''}`);
  },

  // Get today's product activity report
  getTodayReport: () => apiRequest('/products/today/report')
};

// Distributions API functions
export const distributionsAPI = {
  // Get all distributions
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/distributions${queryString ? `?${queryString}` : ''}`);
  },

  // Get single distribution
  getById: (id) => apiRequest(`/distributions/${id}`),

  // Create new distribution
  create: (distributionData) => apiRequest('/distributions', {
    method: 'POST',
    body: distributionData
  }),

  // Update distribution
  update: (id, distributionData) => apiRequest(`/distributions/${id}`, {
    method: 'PUT',
    body: distributionData
  }),

  // Add recipient to distribution
  addRecipient: (id, recipientData) => apiRequest(`/distributions/${id}/recipients`, {
    method: 'POST',
    body: recipientData
  }),

  // Cancel distribution
  cancel: (id) => apiRequest(`/distributions/${id}/cancel`, {
    method: 'PATCH'
  }),

  // Get distribution statistics
  getStats: () => apiRequest('/distributions/stats/overview')
};

// Branches API functions
export const branchesAPI = {
  // Get all branches
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/branches${queryString ? `?${queryString}` : ''}`);
  },

  // Get single branch
  getById: (id) => apiRequest(`/branches/${id}`),

  // Create new branch
  create: (branchData) => apiRequest('/branches', {
    method: 'POST',
    body: branchData
  }),

  // Update branch
  update: (id, branchData) => apiRequest(`/branches/${id}`, {
    method: 'PUT',
    body: branchData
  }),

  // Delete branch
  delete: (id) => apiRequest(`/branches/${id}`, {
    method: 'DELETE'
  }),

  // Get branches by collector
  getByCollector: (collectorId) => apiRequest(`/branches/collector/${collectorId}`),

  // Assign collector to branch
  assignCollector: (branchId, collectorId) => apiRequest(`/branches/${branchId}/assign-collector`, {
    method: 'PATCH',
    body: { collectorId }
  })
};

// Collectors API functions
export const collectorsAPI = {
  // Get all collectors
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/collectors${queryString ? `?${queryString}` : ''}`);
  },

  // Get single collector by ID
  getById: (id) => apiRequest(`/collectors/${id}`),

  // Create new collector
  create: (collectorData) => apiRequest('/collectors', {
    method: 'POST',
    body: collectorData
  }),

  // Update collector
  update: (id, collectorData) => apiRequest(`/collectors/${id}`, {
    method: 'PUT',
    body: collectorData
  }),

  // Get collectors for specific day
  getByDay: (day) => apiRequest(`/collectors/day/${day}`),

  // Assign members to collector
  assignMembers: (collectorId, memberIds) => apiRequest(`/collectors/${collectorId}/assign-members`, {
    method: 'POST',
    body: { memberIds }
  }),

  // Remove members from collector
  removeMembers: (collectorId, memberIds) => apiRequest(`/collectors/${collectorId}/remove-members`, {
    method: 'POST',
    body: { memberIds }
  }),

  // Deactivate collector
  deactivate: (id) => apiRequest(`/collectors/${id}`, {
    method: 'DELETE'
  }),

  // Get collectors due amounts
  getDueAmounts: () => apiRequest('/collectors/due-amounts'),

  // Get collector's savings overview (net savings of all members)
  getSavingsOverview: (collectorId) => apiRequest(`/collectors/${collectorId}/savings-overview`),

  // Get collector's daily collection report
  getDailyReport: (collectorId, date = null) => {
    const params = date ? `?date=${date}` : '';
    return apiRequest(`/collectors/${collectorId}/daily-report${params}`);
  }
};

// SMS API functions
export const smsAPI = {
  // Check SMS balance
  checkBalance: () => apiRequest('/sms/balance'),

  // Get scheduler status
  getSchedulerStatus: () => apiRequest('/sms/scheduler/status'),

  // Send test SMS
  sendTestSMS: (phone, message) => apiRequest('/sms/test', {
    method: 'POST',
    body: { phone, message }
  }),

  // Send due reminders manually
  sendDueReminders: () => apiRequest('/sms/send-reminders', {
    method: 'POST'
  }),

  // Send payment confirmation
  sendPaymentConfirmation: (data) => apiRequest('/sms/payment-confirmation', {
    method: 'POST',
    body: data
  }),

  // Get SMS statistics
  getStats: () => apiRequest('/sms/stats'),

  // Update SMS settings
  updateSettings: (settings) => apiRequest('/sms/settings', {
    method: 'PUT',
    body: settings
  })
};

export default {
  apiRequest,
  membersAPI,
  authAPI,
  dashboardAPI,
  productsAPI,
  installmentsAPI,
  collectorsAPI,
  schedulesAPI,
  savingsAPI,
  smsAPI
};
