
import React, { useMemo } from 'react';
import { ShieldCheck, AlertCircle, FileText, CheckCircle2, ArrowUpRight, Lock, Database, Wifi } from 'lucide-react';
import { View } from '../types.ts';
import { getCaseHistory, getDashboardStats } from '../services/historyService.ts';

interface DashboardProps {
  onNavigate: (view: View) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const liveStats = useMemo(() => getDashboardStats(), []);
  const recentHistory = useMemo(() => getCaseHistory().slice(0, 5), []);

  const stats = [
    { label: 'Total Analyzed', value: liveStats.totalAnalyzed.toString(), icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Risk Flags Found', value: liveStats.riskFlags.toString(), icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Appeals Generated', value: liveStats.appealsGenerated.toString(), icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Approval Rate', value: liveStats.approvalRate, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Practice Overview</h2>
          <p className="text-slate-500">Monitor your authorization success and denial management.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 text-[10px] font-bold uppercase tracking-widest">
            <Wifi size={12} /> Server: Secure
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 text-[10px] font-bold uppercase tracking-widest">
            <Database size={12} /> AES-256 Encrypted
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            </div>
            <div className={`p-2 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Compliance Audit History</h3>
            <button 
              onClick={() => onNavigate(View.HISTORY)}
              className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-1"
            >
              View Full History <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {recentHistory.length > 0 ? recentHistory.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-semibold uppercase">
                    {item.patientName[0] || '?'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{item.patientName || 'Anonymous Case'}</p>
                    <p className="text-sm text-slate-500">{item.type}: {item.cptCode}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    item.status.includes('Denied') || item.status === 'Likely Denied' ? 'bg-red-50 text-red-600' : 
                    item.status.includes('Approved') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.status}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">{getTimeAgo(item.timestamp)}</p>
                </div>
              </div>
            )) : (
              <div className="py-12 text-center text-slate-400">
                <FileText className="mx-auto mb-3 opacity-20" size={48} />
                <p>No activity recorded yet.</p>
                <button 
                  onClick={() => onNavigate(View.ANALYZER)}
                  className="mt-4 text-sm font-bold text-blue-600 hover:underline"
                >
                  Start your first analysis
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-2xl shadow-xl text-white flex flex-col justify-between border border-slate-700">
          <div>
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6 backdrop-blur-sm border border-white/10">
              <Lock className="text-emerald-400" size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Secure Workstation</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              All data processing is currently being performed on your organization's private VPC. PHI is de-identified before transport.
            </p>
          </div>
          <div className="space-y-3">
             <button 
              onClick={() => onNavigate(View.ANALYZER)}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition-colors shadow-lg"
            >
              Start Secure Analysis
            </button>
            <p className="text-[10px] text-center text-slate-500 uppercase font-bold tracking-widest">
              Practice Data Protection Enabled • BAA Active
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
