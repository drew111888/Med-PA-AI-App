
import React from 'react';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  FileText, 
  History, 
  Settings as SettingsIcon, 
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

  return (
    <div className="w-64 h-full bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 border-r border-slate-800 z-50">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="text-white" size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">MedAuth AI</h1>
        </div>

        <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
              user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 
              user.role === 'PROVIDER' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Lock size={10} className="text-emerald-500" /> {user.role}
              </p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full mt-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-all flex items-center justify-center gap-2"
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
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              currentView === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={() => onNavigate(View.SETTINGS)}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentView === View.SETTINGS ? 'bg-slate-800 text-white' : 'hover:bg-slate-800'
          }`}
        >
          <SettingsIcon size={18} />
          System Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
