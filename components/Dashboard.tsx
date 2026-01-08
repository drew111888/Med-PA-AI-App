import React from 'react';
import { ShieldCheck, AlertCircle, FileText, CheckCircle2, ArrowUpRight, Lock, Database, Wifi } from 'lucide-react';
import { View } from '../types.ts';

interface DashboardProps {
  onNavigate: (view: View) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const stats = [
    { label: 'Total Analyzed', value: '124', icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Risk Flags Found', value: '18', icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Appeals Generated', value: '42', icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Approval Rate', value: '94%', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

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
            <button className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-1">
              View Audit Logs <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {[
              { patient: 'Sarah Jenkins', type: 'MRI Lumbar Spine', status: 'Likely Denied', date: '2h ago' },
              { patient: 'Michael Chen', type: 'Cardiac Ablation', status: 'Approved', date: '5h ago' },
              { patient: 'Robert Taylor', type: 'Tympanostomy', status: 'Likely Approved', date: '1d ago' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-semibold">
                    {item.patient[0]}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{item.patient}</p>
                    <p className="text-sm text-slate-500">{item.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    item.status === 'Likely Denied' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {item.status}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">{item.date}</p>
                </div>
              </div>
            ))}
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
              NPI: 1234567890 • BAA Active
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;