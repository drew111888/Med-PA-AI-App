
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
  Users 
} from 'lucide-react';
import { View, User } from '../types.ts';
import { canAccessView } from '../services/permissionsService.ts';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, user, onLogout }) => {
  const navItems = [
    { id: View.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: View.ANALYZER, label: 'Auth Analyzer', icon: ShieldCheck },
    { id: View.LIBRARY, label: 'Policy Library', icon: Library },
    { id: View.APPEALS, label: 'Appeal Builder', icon: FileText },
    { id: View.HISTORY, label: 'Case History', icon: History },
    { id: View.USER_MANAGEMENT, label: 'User Management', icon: Users },
  ].filter(item => canAccessView(user, item.id));

  // Safe split for initials
  const initials = (user?.name || 'User Account')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-64 h-full bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 border-r border-slate-800 z-50 shadow-2xl">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="text-white" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase tracking-wider">MedAuth AI</h1>
        </div>

        <div className="p-4 bg-slate-800/50 rounded-[20px] border border-slate-700/50 mb-6">
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
            <LogOut size={12} /> Sign Out
          </button>
        </div>
      </div>
      
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
              currentView === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' 
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800/50">
        <button 
          onClick={() => onNavigate(View.SETTINGS)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
            currentView === View.SETTINGS ? 'bg-slate-800 text-white border border-slate-700' : 'hover:bg-slate-800'
          }`}
        >
          <LucideSettings size={18} />
          Practice Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
