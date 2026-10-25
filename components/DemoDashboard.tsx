import React, { useEffect, useState } from 'react';
import { api, isOk, type ApiError, type SummaryInfo } from '../services/apiClient.ts';
import { View } from '../types.ts';
import { describeDeadline } from '../services/deadlineView.ts';
import { demoErrorText } from './DemoGateway.tsx';

const DemoDashboard: React.FC<{ onNavigate: (view: View) => void }> = ({ onNavigate }) => {
  const [summary, setSummary] = useState<SummaryInfo | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; void api.summary().then((result) => {
    if (!active) return;
    if (isOk(result)) setSummary(result.data); else setError(result);
    setLoading(false);
  }); return () => { active = false; }; }, []);
  return <div className="space-y-5 pb-10">
    <div className="space-y-2"><h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Synthetic workflow workspace</h1><p className="text-slate-600">Real backend sessions, pipeline, versioned approval and handoff records — using only synthetic EHR fixtures and a deterministic AI stub. No payer delivery.</p></div>
    <button onClick={() => onNavigate(View.CASES)} className="min-h-11 w-full sm:w-auto px-5 py-3 bg-blue-700 text-white rounded-xl font-bold">Open cases and workflow tests</button>
    {loading && <p role="status">Loading this sandbox’s actual case summary…</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{demoErrorText(error)}</p>}
    {summary && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
        ['Cases', summary.total], ['Awaiting approval', summary.packetsReady], ['Needs review', summary.needsReview],
        ['Handoff prepared', summary.handoffGenerated], ['Synthetic receipts', summary.submitted], ['Unknown deadlines', summary.unknownDeadlines.length],
      ].map(([title, value]) => <button key={title} onClick={() => onNavigate(View.CASES)} className="text-left bg-white rounded-2xl border border-slate-200 p-4 min-w-0"><span className="text-sm text-slate-600">{title}</span><strong className="block text-3xl text-slate-900 mt-2">{value}</strong></button>)}</div>
      <section className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-3"><h2 className="text-lg font-bold">Actual sandbox deadlines</h2>
        {!summary.deadlines.length && <p className="text-sm text-slate-600">No cases yet. Open Cases and run a fixed sample intake.</p>}
        {summary.deadlines.map((item) => { const deadline = describeDeadline(item); return <div key={item.caseId} className="border-t border-slate-100 pt-3 text-sm space-y-1 break-words"><strong>{item.denialId} · {item.state.replace(/_/g, ' ')}</strong><p className={deadline.known ? 'text-slate-600' : 'text-amber-800'}>{deadline.detail}</p></div>; })}
      </section>
    </>}
  </div>;
};
export default DemoDashboard;
