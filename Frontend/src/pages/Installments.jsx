import React, { useState, useEffect } from 'react';
import DaySelection from '../components/installments/DaySelection';
import CollectorSelection from '../components/installments/CollectorSelection';
import CollectorDashboard from '../components/installments/CollectorDashboard';
import BranchSelection from '../components/installments/BranchSelection';
import MembersList from '../components/installments/MembersList';
import CollectionSheet from '../components/installments/CollectionSheet';

const Installments = () => {
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedCollector, setSelectedCollector] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showCollectionSheet, setShowCollectionSheet] = useState(false);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0); // ✅ Force dashboard reload

  // Load state from localStorage on component mount
  useEffect(() => {
    const savedState = localStorage.getItem('installmentCollectionState');

    // Check if we have a special parameter indicating we want to start fresh
    const urlParams = new URLSearchParams(window.location.search);
    const startFresh = urlParams.get('fresh') === 'true';

    if (savedState && !startFresh) {
      try {
        const { day, collector, branch, dashboard, directMember } = JSON.parse(savedState);

        if (day) setSelectedDay(day);
        if (collector) {
          setSelectedCollector(collector);
          // Also store collector separately for easy access
          localStorage.setItem('selectedCollector', JSON.stringify(collector));
        }
        if (branch) setSelectedBranch(branch);
        if (dashboard !== undefined) setShowDashboard(dashboard);


      } catch (error) {
        localStorage.removeItem('installmentCollectionState');
        localStorage.removeItem('selectedCollector');
      }
    } else if (startFresh) {
      // Only clear state if no day is selected yet (first time)
      const hasSelectedDay = savedState && JSON.parse(savedState).day;

      if (!hasSelectedDay) {
        // Fresh start - no day selected yet
        localStorage.removeItem('installmentCollectionState');
        localStorage.removeItem('selectedCollector');
        localStorage.removeItem('autoOpenMember');
        console.log('🔄 Fresh start - showing day selection');
      } else {
        // Day already selected, restore the state
        console.log('📍 Day already selected, restoring previous state');
        try {
          const { day, collector, branch, dashboard, directMember } = JSON.parse(savedState);

          if (day) setSelectedDay(day);
          if (collector) {
            setSelectedCollector(collector);
            localStorage.setItem('selectedCollector', JSON.stringify(collector));
          }
          if (branch) setSelectedBranch(branch);
          if (dashboard !== undefined) setShowDashboard(dashboard);


        } catch (error) {
          localStorage.removeItem('installmentCollectionState');
          localStorage.removeItem('selectedCollector');
        }
      }

      // Clean the URL
      window.history.replaceState({}, '', '/installments');
    }

    // ✅ LISTEN FOR INSTALLMENT COLLECTION EVENTS
    const handleDashboardReload = () => {
      console.log('💥 PARENT: Dashboard reload triggered from installment collection');
      // Add delay to allow backend to process the collection
      setTimeout(() => {
        console.log('🔄 PARENT: Reloading dashboard with updated data...');
        setDashboardReloadKey(prev => prev + 1);
      }, 2000); // Wait 2 seconds for backend to process and respond
    };

    window.addEventListener('installmentCollected', handleDashboardReload);
    window.addEventListener('dashboardReload', handleDashboardReload);

    return () => {
      window.removeEventListener('installmentCollected', handleDashboardReload);
      window.removeEventListener('dashboardReload', handleDashboardReload);
    };
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    const state = {
      day: selectedDay,
      collector: selectedCollector,
      branch: selectedBranch,
      dashboard: showDashboard
    };

    if (selectedDay || selectedCollector || selectedBranch || showDashboard) {
      localStorage.setItem('installmentCollectionState', JSON.stringify(state));
    }
  }, [selectedDay, selectedCollector, selectedBranch, showDashboard]);

  // Enhanced setters that also save to localStorage
  const handleDaySelect = (day) => {
    setSelectedDay(day);
    // Reset subsequent selections when day changes
    setSelectedCollector(null);
    setSelectedBranch(null);
  };

  const handleCollectorSelect = (collector) => {
    setSelectedCollector(collector);
    // Reset branch selection when collector changes
    setSelectedBranch(null);
    // Show dashboard when collector is selected
    setShowDashboard(true);

    // Store selected collector separately for easy access by other components
    localStorage.setItem('selectedCollector', JSON.stringify(collector));
  };

  const handleBranchSelect = (branch) => {
    setSelectedBranch(branch);
  };

  // Clear all selections and localStorage
  const handleReset = () => {
    setSelectedDay(null);
    setSelectedCollector(null);
    setSelectedBranch(null);
    setShowDashboard(false);
    localStorage.removeItem('installmentCollectionState');
    localStorage.removeItem('selectedCollector');
  };

  // Go back functions that maintain state
  const handleGoBackFromDashboard = () => {
    setSelectedCollector(null);
    setSelectedBranch(null);
    setShowDashboard(false);
  };

  const handleGoBackFromBranch = () => {
    setSelectedBranch(null);
    setShowDashboard(true); // Go back to dashboard
  };

  const handleGoBackFromMembers = () => {
    setSelectedBranch(null);
    setShowDashboard(true); // Go back to dashboard
  };

  const handleShowCollectionSheet = (branch = null) => {
    console.log('📋 Collection Sheet requested for branch:', branch);

    // If specific branch provided, use it
    if (branch) {
      const branchData = {
        code: branch.branchCode || branch.code,
        name: branch.name,
        members: branch.members || []
      };

      console.log('🎯 Setting selected branch:', branchData);
      setSelectedBranch(branchData);
      setShowCollectionSheet(true);
      setShowDashboard(false);
    } else {
      console.log('⚠️ No branch provided - showing all branches sheet');
      // From dashboard - show collection sheet for all branches
      setSelectedBranch(null); // null means show all branches
      setShowCollectionSheet(true);
      setShowDashboard(false);
    }
  };

  const handleGoBackFromCollectionSheet = () => {
    setShowCollectionSheet(false);
    setShowDashboard(true);
    // Clear selected branch to ensure we go to dashboard
    setSelectedBranch(null);
  };

  // Days of the week + Daily Kisti option
  const weekDays = [
    { id: 1, name: 'Saturday', color: 'from-blue-500 to-blue-600' },
    { id: 2, name: 'Sunday', color: 'from-green-500 to-green-600' },
    { id: 3, name: 'Monday', color: 'from-purple-500 to-purple-600' },
    { id: 4, name: 'Tuesday', color: 'from-yellow-500 to-yellow-600' },
    { id: 5, name: 'Wednesday', color: 'from-red-500 to-red-600' },
    { id: 6, name: 'Thursday', color: 'from-indigo-500 to-indigo-600' },
    { id: 7, name: 'Daily Kisti', color: 'from-orange-500 to-orange-600', isDaily: true }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-6 print:p-0 print:bg-white">
      <div className="max-w-6xl mx-auto print:max-w-none">
        <div className="text-center mb-8 no-print">
          {/* Reset Button - Always show for easy fresh start */}
          <button
            onClick={handleReset}
            className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-all"
          >
            🔄 Start Over
          </button>

          {/* Show current progress */}
          {selectedDay && (
            <div className="mt-2 text-sm text-gray-600">
              Selected: {selectedDay.name}
              {selectedCollector && ` → ${selectedCollector.name}`}
              {selectedBranch && ` → ${selectedBranch.name}`}
            </div>
          )}
        </div>

        {!selectedDay ? (
          <DaySelection
            weekDays={weekDays}
            onDaySelect={handleDaySelect}
          />
        ) : !selectedCollector ? (
          <CollectorSelection
            selectedDay={selectedDay}
            onCollectorSelect={handleCollectorSelect}
            onGoBack={handleGoBackFromDashboard}
          />
        ) : showCollectionSheet ? (
          <CollectionSheet
            selectedCollector={selectedCollector}
            selectedBranch={selectedBranch}
            selectedDay={selectedDay}
            onGoBack={handleGoBackFromCollectionSheet}
          />
        ) : showDashboard && !selectedBranch ? (
          <CollectorDashboard
            key={dashboardReloadKey}
            selectedDay={selectedDay}
            selectedCollector={selectedCollector}
            onGoBack={handleGoBackFromDashboard}
            onBranchSelect={handleBranchSelect}
            onShowCollectionSheet={handleShowCollectionSheet}
          />
        ) : selectedBranch ? (
          <MembersList
            selectedBranch={selectedBranch}
            selectedCollector={selectedCollector}
            selectedDay={selectedDay}
            onGoBack={handleGoBackFromMembers}
          />
        ) : (
          <BranchSelection
            selectedDay={selectedDay}
            selectedCollector={selectedCollector}
            onBranchSelect={handleBranchSelect}
            onGoBack={handleGoBackFromBranch}
            onShowCollectionSheet={handleShowCollectionSheet}
          />
        )}
      </div>
    </div>
  );
};

export default Installments;