
import React, { useState, useEffect } from 'react';
import { Search, Filter, MoreHorizontal, Download, Eye, Database, Trash2 } from 'lucide-react';
import { getHistory, clearHistory, ExtendedRecord } from '../services/historyService.ts';

const History: React.FC = () => {
  const [records, setRecords] = useState<ExtendedRecord[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setRecords(getHistory());
  }, []);

  const handleClear = () => {
    if (window.confirm("Permanent Action: This will clear ALL clinical history from this workstation. Proceed?")) {
      clearHistory();
      setRecords([]);
    }
  };

  const filtered = records.filter(r => 
    r.patient.toLowerCase().includes(search.toLowerCase()) || 
    (r.cpt && r.cpt.includes(search))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Case Registry</h2>
          <p className="text-slate-500">Secure log of clinical analyses and appeal outcomes.</p>
        </div>
        <button onClick={handleClear} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-2">
          <Trash2 size={12} /> Wipe Registry
        </button>
      </div>

      <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by patient, CPT, or result..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="px-4 py-2 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-xl border border-blue-100">
              {records.length} Total Records
            </div>
          </div>
        </div>

        {filtered.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Timestamp</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Patient / ID</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">CPT</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Operation</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Workstation User</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6 text-[11px] font-bold text-slate-500 uppercase tracking-tight">{record.date}</td>
                  <td className="px-8 py-6">
                    <p className="font-bold text-slate-900">{record.patient || 'Anonymous Case'}</p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border mt-1 inline-block ${
                      record.status === 'Likely Denied' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                      record.status === 'Likely Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-xs font-black text-slate-400 font-mono tracking-widest">{record.cpt || '---'}</td>
                  <td className="px-8 py-6">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      record.type === 'Analysis' ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {record.type}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-xs font-bold text-slate-600 truncate max-w-[120px]">{record.userName}</p>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2.5 hover:bg-white rounded-xl text-slate-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-slate-100" title="View Details">
                        <Eye size={16} />
                      </button>
                      <button className="p-2.5 hover:bg-white rounded-xl text-slate-400 hover:text-slate-900 shadow-sm border border-transparent hover:border-slate-100" title="Export Metadata">
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-32 text-center">
            <Database size={64} className="mx-auto text-slate-100 mb-6" />
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Registry Empty</h3>
            <p className="text-slate-400 text-sm mt-2 max-w-xs mx-auto font-medium">No clinical cases have been processed yet. Your activity will appear here automatically.</p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="p-6 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span>Audit Trail Active • {filtered.length} Entries</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
