
import React, { useState, useEffect, Suspense } from 'react';
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
    if (user) {
      logAction(user, 'User logged out', 'LOGIN', 'Session ended manually').catch(console.error);
    }
    authLogout();
    setUser(null);
  };

  const handleAuthenticated = (newUser: User) => {
    setUser(newUser);
    logAction(newUser, 'User logged in', 'LOGIN', 'Session established with BAA verification').catch(console.error);
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
      console.error("View rendering error:", e);
      return (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-white rounded-[40px] shadow-sm border border-slate-100">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Module Loading Error</h2>
          <p className="text-slate-500 max-w-md mb-8">The requested module could not be initialized. This may be due to a local storage conflict or module resolution error.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
          >
            Reload Application
          </button>
        </div>
      );
    }
  };

  if (!user) {
    return <SecurityGateway onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans antialiased text-slate-900">
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        user={user} 
        onLogout={handleLogout} 
      />
      <main className="flex-1 ml-64 overflow-y-auto p-8 bg-slate-50/50">
        <div className="max-w-6xl mx-auto min-h-full">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;
