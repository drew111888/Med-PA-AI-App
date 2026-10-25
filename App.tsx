
import React, { useState } from 'react';
import Sidebar from './components/Sidebar.tsx';
import Dashboard from './components/Dashboard.tsx';
import Cases from './components/Cases.tsx';
import Analyzer from './components/Analyzer.tsx';
import Appeals from './components/Appeals.tsx';
import History from './components/History.tsx';
import PolicyLibrary from './components/PolicyLibrary.tsx';
import SecurityGateway from './components/SecurityGateway.tsx';
import UserManagement from './components/UserManagement.tsx';
import PracticeSettings from './components/PracticeSettings.tsx';
import { View, User } from './types.ts';
import { SessionProvider, useSession } from './services/sessionContext.tsx';
import { DEMO_MODE, type SessionUser } from './services/apiClient.ts';
import DemoGateway, { DemoNotice } from './components/DemoGateway.tsx';
import DemoControls from './components/DemoControls.tsx';
import DemoDashboard from './components/DemoDashboard.tsx';

/**
 * Map the server session user onto the browser `User` shape the legacy Sidebar
 * and out-of-scope screens still expect. Role is the server-authoritative role.
 */
const toUser = (u: SessionUser): User => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: '',
  role: u.role,
});

const AuthenticatedApp: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const { refreshDemoSession } = useSession();
  const navigate = (view: View) => {
    setCurrentView(DEMO_MODE && view !== View.DASHBOARD ? View.CASES : view);
    if (DEMO_MODE) void refreshDemoSession();
  };

  const renderView = () => {
    try {
      if (DEMO_MODE) return currentView === View.DASHBOARD ? <DemoDashboard onNavigate={navigate} /> : <Cases />;
      switch (currentView) {
        case View.DASHBOARD:
          return <Dashboard onNavigate={setCurrentView} />;
        case View.CASES:
          return <Cases />;
        case View.ANALYZER:
          return <Analyzer onNavigate={setCurrentView} />;
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
      console.error('View rendering error:', e);
      return (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-white rounded-[40px] shadow-sm border border-slate-100 h-full">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Module Error</h2>
          <p className="text-slate-500 max-w-md mb-8">A component in the {currentView} view failed to initialize. Please reload the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
          >
            Reload Workstation
          </button>
        </div>
      );
    }
  };

  return (
    <div className={`${DEMO_MODE ? 'flex flex-col h-dvh overflow-hidden' : 'flex flex-col lg:flex-row min-h-screen lg:h-screen lg:overflow-hidden'} bg-slate-50 font-sans antialiased text-slate-900`}>
      {DEMO_MODE && <DemoNotice />}
      <div className={DEMO_MODE ? 'flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden' : 'contents'}>
      <Sidebar
        currentView={currentView}
        onNavigate={navigate}
        user={user}
        onLogout={onLogout}
      />
      <main className={`flex-1 min-w-0 ${DEMO_MODE ? '' : 'lg:ml-64'} lg:overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50/50`}>
        <div className="max-w-6xl mx-auto min-h-full">
          {DEMO_MODE && <DemoControls showNotice={false} onShowCases={() => navigate(View.CASES)} />}
          {renderView()}
        </div>
      </main>
      </div>
    </div>
  );
};

const AppShell: React.FC = () => {
  const session = useSession();

  if (session.status === 'initializing') {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-blue-500 mx-auto" size={40} />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Initializing Secure Environment...</p>
        </div>
      </div>
    );
  }

  if (!session.isAuthenticated || !session.user) {
    return DEMO_MODE ? <DemoGateway /> : <SecurityGateway />;
  }

  return <AuthenticatedApp key={DEMO_MODE ? `${session.demoSession?.sandboxId}:${session.contextVersion}` : 'app'} user={toUser(session.user)} onLogout={() => DEMO_MODE ? session.leaveDemo() : void session.logout()} />;
};

const App: React.FC = () => (
  <SessionProvider>
    <AppShell />
  </SessionProvider>
);

// Simple internal loader for the App entry
const Loader2 = ({ className, size }: { className?: string; size?: number }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default App;
