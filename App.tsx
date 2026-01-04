
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.tsx';
import Dashboard from './components/Dashboard.tsx';
import Analyzer from './components/Analyzer.tsx';
import Appeals from './components/Appeals.tsx';
import History from './components/History.tsx';
import PolicyLibrary from './components/PolicyLibrary.tsx';
import UserManagement from './components/UserManagement.tsx';
import Settings from './components/Settings.tsx';
import SecurityGateway from './components/SecurityGateway.tsx';
import { View, User, PracticeSettings } from './types.ts';
import { getCurrentUser, logout as authLogout } from './services/authService.ts';
import { logAction } from './services/auditService.ts';

const SETTINGS_KEY = 'medauth_practice_settings';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [user, setUser] = useState<User | null>(null);
  const [isProvisioned, setIsProvisioned] = useState(false);

  useEffect(() => {
    // Check for practice setup links: ?setup=ENCODED_JSON
    const params = new URLSearchParams(window.location.search);
    const setupCode = params.get('setup');
    
    if (setupCode) {
      try {
        const decoded = JSON.parse(atob(setupCode));
        const currentSettings: PracticeSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        
        const newSettings: PracticeSettings = {
          ...currentSettings,
          practiceName: decoded.p || currentSettings.practiceName || 'Central Health Partners',
          cloud: {
            enabled: true,
            supabaseUrl: decoded.u,
            supabaseKey: decoded.k
          }
        };
        
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
        setIsProvisioned(true);
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        console.info("Workstation provisioned via practice invite link.");
      } catch (e) {
        console.error("Invalid setup code", e);
      }
    }

    const activeUser = getCurrentUser();
    if (activeUser) {
      setUser(activeUser);
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
    switch (currentView) {
      case View.DASHBOARD: return <Dashboard onNavigate={setCurrentView} />;
      case View.ANALYZER: return <Analyzer />;
      case View.APPEALS: return <Appeals />;
      case View.HISTORY: return <History />;
      case View.LIBRARY: return <PolicyLibrary />;
      case View.USERS: return <UserManagement />;
      case View.SETTINGS: return <Settings />;
      default: return <Dashboard onNavigate={setCurrentView} />;
    }
  };

  if (!user) {
    return <SecurityGateway onAuthenticated={handleAuthenticated} provisioned={isProvisioned} />;
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        user={user} 
        onLogout={handleLogout} 
      />
      <main className="flex-1 ml-64 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;
