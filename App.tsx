
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.tsx';
import Dashboard from './components/Dashboard.tsx';
import Analyzer from './components/Analyzer.tsx';
import Appeals from './components/Appeals.tsx';
import History from './components/History.tsx';
import PolicyLibrary from './components/PolicyLibrary.tsx';
import SecurityGateway from './components/SecurityGateway.tsx';
import UserManagement from './components/UserManagement.tsx';
import PracticeSettings from './components/PracticeSettings.tsx';
import { View, User } from './types.ts';
import { getCurrentUser, logout as authLogout } from './services/authService.ts';
import { logAction } from './services/auditService.ts';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const activeUser = getCurrentUser();
      if (activeUser) {
        setUser(activeUser);
      }
    } catch (e) {
      console.error("Critical error during session recovery", e);
    }
  }, []);

  const handleLogout = () => {
    if (user) logAction(user, 'User logged out', 'LOGIN', 'Session ended manually');
    authLogout();
    setUser(null);
  };

  const handleAuthenticated = (newUser: User) => {
    setUser(newUser);
    logAction(newUser, 'User logged in', 'LOGIN', 'Session established with BAA verification');
  };

  const renderView = () => {
    try {
      switch (currentView) {
        case View.DASHBOARD:
          return <Dashboard onNavigate={setCurrentView} />;
        case View.ANALYZER:
          return <Analyzer />;
        case View.APPEALS:
          return <Appeals />;
        case View.HISTORY:
          return <History />;
        case View.LIBRARY:
          return <PolicyLibrary />;
        case View.USER_MANAGEMENT:
          return <UserManagement />;
        case View.SETTINGS:
          return <PracticeSettings />;
        default:
          return <Dashboard onNavigate={setCurrentView} />;
      }
    } catch (e) {
      console.error("View rendering error", e);
      return (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">View Load Error</h2>
          <p className="text-slate-500 mb-8">An error occurred while loading this module. This is often due to corrupted local configuration.</p>
          <button onClick={() => setCurrentView(View.DASHBOARD)} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold">Return to Dashboard</button>
        </div>
      );
    }
  };

  if (!user) {
    return <SecurityGateway onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        user={user} 
        onLogout={handleLogout} 
      />
      <main className="flex-1 ml-64 overflow-y-auto p-8 bg-slate-50/50">
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;
