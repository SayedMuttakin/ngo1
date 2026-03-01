import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './styles/responsive-fixes.css'; // Import responsive fixes

// Components
import Login from './components/Login';
import Register from './components/Register';
import DashboardLayout from './components/DashboardLayout';
import Profile from './components/Profile';
import SplashScreen from './components/SplashScreen';

// Pages
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Products from './pages/Products';
import SalesReport from './pages/SalesReport';
import Installments from './pages/Installments';
import ExtraInstallments from './pages/ExtraInstallments';
import Savings from './pages/Savings';
import Weekly from './pages/Weekly';
import DailyCollection from './pages/DailyCollection';
import DailySavings from './pages/DailySavings';
import TotalDue from './pages/TotalDue';
import MemberProfile from './pages/MemberProfile';
import PendingInstallments from './pages/PendingInstallments';
import ActivityLog from './pages/ActivityLog';
import SMSManagement from './pages/SMSManagement';
import AdminControlPanel from './pages/AdminControlPanel';

// Context
import { AuthProvider, useAuth } from './context/AuthContext';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash if it hasn't been shown in this session
    const hasShownSplash = sessionStorage.getItem('splashShown');
    return !hasShownSplash;
  });

  // Handle splash screen completion
  const handleSplashComplete = () => {
    setShowSplash(false);
    // Mark that splash has been shown in this session
    sessionStorage.setItem('splashShown', 'true');
  };

  // Show splash screen on first load only
  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {!isAuthenticated ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="profile" element={<Profile />} />
              <Route path="members" element={<Members />} />
              <Route path="members/:id" element={<MemberProfile />} />
              <Route path="activity-log" element={<ActivityLog />} />
              <Route path="products" element={<Products />} />
              <Route path="sales-report" element={<SalesReport />} />
              <Route path="installments" element={<Installments />} />
              <Route path="pending-installments" element={<PendingInstallments />} />
              <Route path="extra-installments" element={<ExtraInstallments />} />
              <Route path="savings" element={<Savings />} />
              <Route path="weekly" element={<Weekly />} />
              <Route path="daily-collection" element={<DailyCollection />} />
              <Route path="daily-savings" element={<DailySavings />} />
              <Route path="total-due" element={<TotalDue />} />
              <Route path="sms-management" element={<SMSManagement />} />
              <Route path="admin-control-panel" element={<AdminControlPanel />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Router>
  );
}


function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster
        position="top-right"
        reverseOrder={false}
        gutter={8}
        containerClassName=""
        containerStyle={{}}
        toastOptions={{
          // Define default options
          className: '',
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
          // Default options for specific types
          success: {
            duration: 3000,
            style: {
              background: '#10B981',
              color: '#fff',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#10B981',
            },
          },
          error: {
            duration: 4000,
            style: {
              background: '#EF4444',
              color: '#fff',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#EF4444',
            },
          },
          loading: {
            style: {
              background: '#3B82F6',
              color: '#fff',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#3B82F6',
            },
          },
        }}
      />
    </AuthProvider>
  );
}

export default App;