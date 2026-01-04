
import React from 'react';
import { LayoutDashboard, ShieldCheck, FileText, History, Settings, Library, LogOut, Lock, Users } from 'lucide-react';
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
    { id: View.USERS, label: 'User Management', icon: Users },
  ].filter(item => canAccessView(user, item.id));

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'ADMIN': return 'Practice Administrator';
      case 'CLINICAL': return 'Clinical Staff';
      case 'ADMIN_STAFF': return 'Administrative Staff';
      default: return role;
    }
  };

  return (
    <div className="w-64 h-full bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 border-r border-slate-800 z-50">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <ShieldCheck className="text-white" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase italic">MedAuth<span className="text-blue-500">AI</span></h1>
        </div>

        <div className="p-4 bg-slate-800/50 rounded-3xl border border-slate-700/50 mb-6 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm flex-shrink-0 shadow-sm border border-white/5 ${
              user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 
              user.role === 'CLINICAL' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-black text-white truncate">{user.name}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${user.role === 'ADMIN' ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                {getRoleLabel(user.role)}
              </p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full mt-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all flex items-center justify-center gap-2 border border-transparent hover:border-slate-600"
          >
            <LogOut size={12} /> Sign Out
          </button>
        </div>
      </div>
      
      <nav className="flex-1 px-4 space-y-1.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${
              currentView === item.id 
                ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          disabled={!canAccessView(user, View.SETTINGS)}
          onClick={() => onNavigate(View.SETTINGS)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${
            currentView === View.SETTINGS ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          } disabled:opacity-10`}
        >
          <Settings size={18} />
          System Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
