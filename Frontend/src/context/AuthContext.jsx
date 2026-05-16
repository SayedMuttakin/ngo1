import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

// API Base URL - Use environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing authentication on app load
    const token = localStorage.getItem('ngo_token');
    const savedUser = localStorage.getItem('ngo_user');

    console.log('🔍 Checking saved session...', { token: !!token, savedUser: !!savedUser });

    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        console.log('🔍 Saved user data:', userData);

        // Check if saved user is a member - if so, logout immediately
        if (userData.role === 'member') {
          console.log('🚫 MEMBER DETECTED - Force logout:', userData.name);
          clearAuthData();
          window.location.reload(); // Force page reload to clear any cached state
          return;
        }

        // Only allow admin/staff roles
        if (!['admin', 'manager', 'collector', 'supervisor'].includes(userData.role)) {
          console.log('🚫 NON-ADMIN ROLE DETECTED - Force logout:', userData.role);
          clearAuthData();
          window.location.reload(); // Force page reload to clear any cached state
          return;
        }

        console.log('✅ Valid admin session found:', userData.name, userData.role);
        setUser(userData);
        setIsAuthenticated(true);

        // Verify token with backend
        verifyToken(token);
      } catch (error) {
        console.error('Error parsing saved user data:', error);
        clearAuthData();
      }
    } else {
      console.log('🔍 No saved session found');
    }
    setLoading(false);
  }, []);

  // Helper function to clear auth data
  const clearAuthData = () => {
    localStorage.removeItem('ngo_token');
    localStorage.removeItem('ngo_user');
    setUser(null);
    setIsAuthenticated(false);
  };

  // Verify token with backend
  const verifyToken = async (token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/check`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && data.success && data.user) {
        // Sync local user data with server data
        console.log('✅ Token verified, syncing user data');
        updateUser(data.user);
      } else {
        clearAuthData();
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      clearAuthData();
    }
  };

  const login = async (credentials) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier: credentials.email, // Can be email or phone
          password: credentials.password
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const { token, user } = data;

        // Check if user has admin/manager role - NO MEMBER LOGIN ALLOWED
        if (user.role === 'member') {
          return {
            success: false,
            error: 'Members cannot login to the admin panel. Only administrators and managers are allowed.'
          };
        }

        // Only allow admin, manager, collector roles
        if (!['admin', 'manager', 'collector', 'supervisor'].includes(user.role)) {
          return {
            success: false,
            error: 'Access denied. Only administrative staff can login to this system.'
          };
        }

        setUser(user);
        setIsAuthenticated(true);

        // Save to localStorage
        localStorage.setItem('ngo_token', token);
        localStorage.setItem('ngo_user', JSON.stringify(user));

        console.log(`✅ Admin login successful: ${user.name} (${user.role})`);

        return { success: true, user };
      } else {
        // Check if user is pending approval
        if (data.requiresApproval) {
          return {
            success: false,
            error: data.message || 'Your account is waiting for approval',
            requiresApproval: true
          };
        }
        // Extract validation errors if present
        let errorMessage = data.message || 'Login failed';
        if (data.errors && data.errors.length > 0) {
          errorMessage = data.errors[0].message || errorMessage;
        }
        return {
          success: false,
          error: errorMessage
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Network error. Please check your connection.'
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: userData.name,
          email: userData.email,
          password: userData.password,
          role: 'admin' // Default role for new registrations
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Check if registration requires approval
        if (data.requiresApproval) {
          return {
            success: true,
            message: data.message,
            requiresApproval: true
          };
        }

        const { token, user } = data;

        setUser(user);
        setIsAuthenticated(true);

        // Save to localStorage
        localStorage.setItem('ngo_token', token);
        localStorage.setItem('ngo_user', JSON.stringify(user));

        return { success: true, user };
      } else {
        return {
          success: false,
          error: data.message || 'Registration failed'
        };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Network error. Please check your connection.'
      };
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('ngo_token');

      if (token) {
        // Call backend logout endpoint
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state and storage regardless of API call result
      clearAuthData();
    }
  };

  const updateUser = (updatedUserData) => {
    setUser(updatedUserData);
    localStorage.setItem('ngo_user', JSON.stringify(updatedUserData));
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
