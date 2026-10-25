
import React from 'react';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  FileText, 
  History, 
  Settings as LucideSettings, 
  Library, 
  LogOut, 
  Lock, 
  Users,
  Inbox
} from 'lucide-react';
import { View, User } from '../types.ts';
import { canAccessView } from '../services/permissionsService.ts';
import { DEMO_MODE } from '../services/apiClient.ts';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, user, onLogout }) => {
  const navItems = [
    { id: View.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: View.CASES, label: 'Appeal Cases', icon: Inbox },
    { id: View.ANALYZER, label: 'Auth Analyzer', icon: ShieldCheck },
    { id: View.LIBRARY, label: 'Policy Library', icon: Library },
    { id: View.APPEALS, label: 'Appeal Builder', icon: FileText },
    { id: View.HISTORY, label: 'Case History', icon: History },
    { id: View.USER_MANAGEMENT, label: 'User Management', icon: Users },
  ].filter(item => canAccessView(user, item.id) && (!DEMO_MODE || item.id === View.DASHBOARD || item.id === View.CASES));

  // Safe split for initials
  const initials = (user?.name || 'User Account')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className={`w-full lg:w-64 lg:h-full shrink-0 bg-slate-900 text-slate-300 flex flex-col ${DEMO_MODE ? 'lg:static' : 'lg:fixed lg:left-0 lg:top-0'} border-r border-slate-800 z-50 shadow-2xl`}>
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-3 mb-3 lg:mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="text-white" size={20} />
          </div>
          <p className="text-xl font-black tracking-tight text-white uppercase tracking-wider">{DEMO_MODE ? 'MedAuth demo' : 'MedAuth AI'}</p>
        </div>

        <div className="hidden lg:block p-4 bg-slate-800/50 rounded-[20px] border border-slate-700/50 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shadow-inner ${
              user?.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 
              user?.role === 'PROVIDER' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-black text-white truncate uppercase tracking-tighter">{user?.name || 'Anonymous'}</p>
              <p className="text-[9px] text-slate-400 font-bold flex items-center gap-1 uppercase tracking-widest mt-0.5">
                <Lock size={10} className="text-emerald-500" /> {user?.role || 'Guest'}
              </p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full py-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all flex items-center justify-center gap-2 border border-slate-700"
          >
            <LogOut size={12} /> {DEMO_MODE ? 'Leave demo' : 'Sign Out'}
          </button>
        </div>
        <p className="lg:hidden text-sm">{user.name} · {user.role} {DEMO_MODE ? '· synthetic sandbox' : ''}</p>
      </div>
      
      <nav aria-label="Workspace navigation" className="flex lg:flex-col lg:flex-1 px-3 pb-3 lg:pb-0 gap-2 overflow-x-auto lg:overflow-visible">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={currentView === item.id ? 'page' : undefined}
            className={`shrink-0 lg:w-full flex items-center gap-3 px-4 py-3 min-h-11 rounded-xl text-sm font-bold transition-all duration-200 ${
              currentView === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' 
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={18} />
            {DEMO_MODE && item.id === View.CASES ? 'Cases & workflows' : item.label}
          </button>
        ))}
      </nav>

      {!DEMO_MODE && <div className="p-4 border-t border-slate-800/50">
        <button 
          onClick={() => onNavigate(View.SETTINGS)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
            currentView === View.SETTINGS ? 'bg-slate-800 text-white border border-slate-700' : 'hover:bg-slate-800'
          }`}
        >
          <LucideSettings size={18} />
          Practice Settings
        </button>
      </div>}
    </aside>
  );
};

export default Sidebar;
