
import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle, FileText, CheckCircle2, ArrowUpRight, Lock, Database, Wifi, History as HistoryIcon, Activity } from 'lucide-react';
import { View } from '../types.ts';
import { getDashboardStats, getHistory, ExtendedRecord } from '../services/historyService.ts';

interface DashboardProps {
  onNavigate: (view: View) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState(getDashboardStats());
  const [recentHistory, setRecentHistory] = useState<ExtendedRecord[]>([]);

  useEffect(() => {
    setStats(getDashboardStats());
    setRecentHistory(getHistory().slice(0, 5));
  }, []);

  const statCards = [
    { label: 'Total Analyzed', value: stats.totalAnalyzed.toString(), icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Risk Flags Found', value: stats.riskFlags.toString(), icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Appeals Generated', value: stats.appealsGenerated.toString(), icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Approval Outlook', value: stats.approvalRate, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Practice Overview</h2>
          <p className="text-slate-500">Live metrics from your organization's secure workstation.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-blue-400 text-[9px] font-black uppercase tracking-widest shadow-lg">
            <Activity size={12} /> v2.8.4
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-[9px] font-black uppercase tracking-widest">
            <Wifi size={12} /> Sync Active
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-[9px] font-black uppercase tracking-widest">
            <Database size={12} /> BAA Secured
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex items-start justify-between group hover:border-blue-200 transition-all">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-hover:text-blue-400 transition-colors">{stat.label}</p>
              <p className="text-3xl font-black text-slate-900">{stat.value}</p>
            </div>
            <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color} shadow-inner`}>
              <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-slate-900 text-white rounded-xl"><HistoryIcon size={20} /></div>
               <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Recent Activity Log</h3>
             </div>
            <button 
              onClick={() => onNavigate(View.HISTORY)}
              className="text-blue-600 text-[10px] font-black uppercase tracking-widest hover:underline flex items-center gap-2"
            >
              Full History <ArrowUpRight size={14} />
            </button>
          </div>
          
          <div className="space-y-4">
            {recentHistory.length > 0 ? recentHistory.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-5 rounded-[24px] border border-slate-50 hover:bg-slate-50/80 transition-all group">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs ${
                    item.type === 'Appeal' ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {item.type[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{item.patient || 'Clinical Record'}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-1">
                      {item.type} • CPT {item.cpt || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl ${
                    item.status === 'Likely Denied' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {item.status}
                  </span>
                  <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-tighter">{item.date}</p>
                </div>
              </div>
            )) : (
              <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[32px]">
                <Database size={40} className="mx-auto text-slate-200 mb-4" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No workstation records found</p>
                <p className="text-xs text-slate-300 mt-1 uppercase tracking-tighter font-black">Ready for Clinical Input</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] shadow-2xl text-white flex flex-col justify-between border border-slate-800 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-500/20 transition-all duration-1000"></div>
          <div>
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-md border border-white/20 shadow-inner">
              <Lock className="text-emerald-400" size={28} />
            </div>
            <h3 className="text-2xl font-black mb-3 uppercase tracking-tight">Secure Action</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">
              Start a new HIPAA-compliant analysis or build an evidence-based appeal using Gemini's clinical reasoning.
            </p>
          </div>
          <div className="space-y-4">
             <button 
              onClick={() => onNavigate(View.ANALYZER)}
              className="w-full bg-blue-600 text-white font-black uppercase tracking-widest text-xs py-5 rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 border border-blue-400/30"
            >
              Start Clinical Analysis
            </button>
            <div className="flex items-center justify-center gap-4 text-[9px] text-slate-500 uppercase font-black tracking-[0.2em]">
              <span>AES-256</span>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <span>PHI-SAFE</span>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <span>SOC2-V2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
