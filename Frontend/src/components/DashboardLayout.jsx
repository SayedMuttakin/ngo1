import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { formatBDDateShort } from '../utils/dateUtils';
import toast from 'react-hot-toast';
import {
  Home,
  Users,
  Package,
  DollarSign,
  Menu,
  X,
  LogOut,
  Bell,
  Settings,
  TrendingUp,
  AlertCircle,
  UserCircle,
  BarChart3,
  PiggyBank,
  Activity,
  MessageSquare,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: Home, path: '/' },
    { id: 'members', name: 'Member Management', icon: Users, path: '/members' },
    { id: 'activity-log', name: 'Activity Log', icon: Activity, path: '/activity-log' },
    { id: 'products', name: 'Product Management', icon: Package, path: '/products' },
    { id: 'sales-report', name: 'Sales Report', icon: BarChart3, path: '/sales-report' },
    { id: 'installments', name: 'Installment Collection', icon: DollarSign, path: '/installments?fresh=true' },

    { id: 'daily-collection', name: 'Daily Total Collection', icon: TrendingUp, path: '/daily-collection' },
    { id: 'daily-savings', name: 'Daily Total Savings', icon: PiggyBank, path: '/daily-savings' },
    { id: 'total-due', name: 'Total Due Amount', icon: AlertCircle, path: '/total-due' },
    { id: 'sms-management', name: 'SMS Management', icon: MessageSquare, path: '/sms-management' },
    { id: 'admin-control-panel', name: 'Admin Control Panel', icon: Shield, path: '/admin-control-panel' },
    { id: 'profile', name: 'Profile', icon: UserCircle, path: '/profile' },
  ];

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully. See you again!');
    navigate('/login');
  };

  const Sidebar = ({ mobile = false }) => (
    <div className={`no-print ${mobile ? 'fixed inset-0 z-[60] lg:hidden' : 'hidden lg:flex lg:w-64 lg:flex-col'}`}>
      {mobile && (
        <div className="fixed inset-0 bg-transparent" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`${mobile ? 'relative flex w-full max-w-xs flex-1 flex-col shadow-2xl' : 'flex flex-1 flex-col min-h-0'} bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 backdrop-blur-xl`}>
        {mobile && (
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-900/80 backdrop-blur-sm hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-purple-500 transition-all duration-200"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
        )}

        {/* Logo */}
        <div className="flex flex-1 flex-col pt-5 pb-4 overflow-y-auto scrollbar-hide">
          <div className="flex items-center flex-shrink-0 px-4 mb-2">
            <div className="flex items-center space-x-3 w-full bg-indigo-900/40 rounded-xl p-3 border border-purple-700/50">
              <img src={logo} alt="Satrong Sajghor Traders" className="h-12 w-12 rounded-lg border-2 border-purple-500 bg-white object-contain p-1 shadow-lg shadow-purple-500/30" />
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Satrong Sajghor Traders</h1>
                <p className="text-xs text-purple-300 font-medium">Business Management System</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="mt-6 flex-1 px-3 space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    navigate(item.path);
                    if (mobile) setSidebarOpen(false);
                  }}
                  className={`w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 ease-out ${isActive
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30 scale-[1.02] border border-purple-400/50'
                    : 'text-purple-200 hover:bg-indigo-900/60 hover:text-white hover:scale-[1.02] hover:shadow-md hover:border hover:border-purple-700/50 border border-transparent'
                    }`}
                >
                  <Icon className={`mr-3 flex-shrink-0 h-5 w-5 transition-all duration-300 ${isActive ? 'text-white scale-110' : 'text-purple-400 group-hover:text-purple-300 group-hover:scale-110'
                    }`} />
                  <span className="transition-all duration-300 font-medium">{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info */}
        <div className="flex-shrink-0 flex border-t border-purple-700/50 p-4 bg-indigo-900/30">
          <button
            onClick={() => {
              navigate('/profile');
              if (mobile) setSidebarOpen(false);
            }}
            className="flex items-center w-full hover:bg-indigo-800/40 rounded-xl p-2.5 transition-all duration-300 group hover:scale-[1.02]"
          >
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 border-2 border-purple-400 flex items-center justify-center group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-purple-500/40 transition-all duration-300 overflow-hidden">
                {user?.profileImage ? (
                  <img
                    src={`${import.meta.env.VITE_API_URL?.replace('/api', '')}${user.profileImage}`}
                    alt={user.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.classList.remove('overflow-hidden');
                      // The fallback span below will act as backup if we handle it right, 
                      // but simplest is just:
                    }}
                  />
                ) : (
                  <span className="text-sm font-bold text-white">
                    {user?.name?.charAt(0) || 'A'}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-3 flex-1 text-left">
              <p className="text-sm font-semibold text-white">{user?.name || 'User'}</p>
              <p className="text-xs text-purple-300 font-medium">
                {user?.role === 'admin' ? 'Admin' :
                  user?.role === 'manager' ? 'Manager' :
                    user?.role === 'collector' ? 'Collector' :
                      user?.role === 'supervisor' ? 'Supervisor' : 'Staff'}
              </p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="ml-2 flex-shrink-0 p-2.5 text-purple-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 rounded-xl transition-all duration-300 border border-transparent hover:scale-110"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Mobile sidebar */}
      {sidebarOpen && <Sidebar mobile />}

      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden print:w-full">
        {/* Top navigation */}
        <div className="no-print relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <button
            type="button"
            className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1 px-2 sm:px-4 flex justify-between items-center">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 truncate">
                {getPageTitle(location.pathname)}
              </h1>
            </div>

            <div className="ml-2 sm:ml-4 flex items-center space-x-1 sm:space-x-2 md:space-x-3">
              <div className="hidden sm:block text-xs sm:text-sm text-gray-500">
                Today's Date: {formatBDDateShort(new Date())}
              </div>

              <button className="bg-white p-1 sm:p-2 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
              </button>

              <button className="bg-white p-1 sm:p-2 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
              </button>

              <div className="bg-green-100 text-green-800 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium">
                Online
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none print:overflow-visible">
          <div className="py-6 print:py-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 print:max-w-none print:px-0">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const getPageTitle = (pathname) => {
  const titles = {
    '/': 'Dashboard',
    '/profile': 'My Profile',
    '/members': 'Member Management',
    '/activity-log': 'Activity Log',
    '/products': 'Product Management',
    '/sales-report': 'Sales Report',
    '/installments': 'Installment Collection',

    '/daily-collection': 'Daily Total Collection',
    '/daily-savings': 'Daily Total Savings',
    '/total-due': 'Total Due Amount',
    '/sms-management': 'SMS Management',
    '/admin-control-panel': 'Admin Control Panel'
  };

  // Handle member profile pages
  if (pathname.startsWith('/members/')) {
    return 'Member Profile';
  }

  return titles[pathname] || 'Dashboard';
};

export default DashboardLayout;
