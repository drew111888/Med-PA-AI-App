
import React, { useMemo } from 'react';
import { Search, Filter, MoreHorizontal, Download, Eye, FileText } from 'lucide-react';
import { getCaseHistory } from '../services/historyService.ts';

const History: React.FC = () => {
  const records = useMemo(() => getCaseHistory(), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Case History</h2>
          <p className="text-slate-500">Access previous clinical analyses and appeal drafts.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by patient name or CPT..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <Filter size={16} />
            Filters
          </button>
        </div>

        {records.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Patient</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">CPT Code</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-sm text-slate-600">{new Date(record.timestamp).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-900">{record.patientName}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">{record.cptCode}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      record.type === 'Analysis' ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {record.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`flex items-center gap-1.5 text-xs font-bold ${
                      record.status === 'Likely Denied' || record.status === 'Denied' ? 'text-red-500' : 
                      record.status === 'Approved' || record.status === 'Likely Approved' ? 'text-emerald-500' : 'text-slate-500'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        record.status === 'Likely Denied' || record.status === 'Denied' ? 'bg-red-500' : 
                        record.status === 'Approved' || record.status === 'Likely Approved' ? 'bg-emerald-500' : 'bg-slate-500'
                      }`} />
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 hover:bg-slate-200 rounded-lg text-slate-600" title="View Details">
                        <Eye size={16} />
                      </button>
                      <button className="p-2 hover:bg-slate-200 rounded-lg text-slate-600" title="Download PDF">
                        <Download size={16} />
                      </button>
                      <button className="p-2 hover:bg-slate-200 rounded-lg text-slate-600">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-20 text-center text-slate-400">
            <FileText className="mx-auto mb-4 opacity-10" size={64} />
            <p className="font-medium text-lg text-slate-600">No cases found</p>
            <p className="text-sm">Start an analysis or build an appeal to populate your history.</p>
          </div>
        )}

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-sm text-slate-500 font-medium">
          <span>Showing {records.length} records</span>
          <div className="flex gap-2">
            <button className="px-4 py-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg disabled:opacity-30">Previous</button>
            <button className="px-4 py-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default History;
