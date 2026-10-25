import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, RefreshCw, PlayCircle, CheckCircle2, AlertCircle, X,
  ArrowRight, ShieldCheck, Clock, FileText, ChevronRight,
} from 'lucide-react';
import { api, CaseSummary, CaseDetail } from '../services/apiClient.ts';
import { getCurrentUser } from '../services/authService.ts';

/**
 * Cases — the autonomous-pipeline review and approval screen.
 *
 * Lists appeal cases produced by the backend pipeline, shows the deterministic
 * decision + AI draft + evidence for a selected case, and provides the human
 * approval gate. All data comes from the local backend; no AI/EHR calls happen
 * in the browser.
 */
const Cases: React.FC = () => {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<CaseDetail | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = getCurrentUser();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listCases();
      setCases(data.cases);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runPoll = async () => {
    setRunning(true);
    setError(null);
    try {
      await api.runPoll();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Poll failed');
    } finally {
      setRunning(false);
    }
  };

  const openCase = async (id: string) => {
    setSelecting(id);
    try {
      setSelected(await api.getCase(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case');
    } finally {
      setSelecting(null);
    }
  };

  const approve = async () => {
    if (!selected) return;
    setApproving(true);
    try {
      await api.approveCase(selected.case.id, user?.name || 'user');
      await openCase(selected.case.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  const submit = async () => {
    if (!selected) return;
    setApproving(true);
    try {
      await api.submitCase(selected.case.id, user?.name || 'user');
      await openCase(selected.case.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setApproving(false);
    }
  };

  const stateBadge = (state: string) => {
    const map: Record<string, string> = {
      packet_ready: 'bg-blue-50 text-blue-700',
      approved: 'bg-emerald-50 text-emerald-700',
      submitted: 'bg-emerald-50 text-emerald-700',
      gated: 'bg-amber-50 text-amber-700',
      ineligible: 'bg-rose-50 text-rose-700',
      failed: 'bg-rose-50 text-rose-700',
    };
    return map[state] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Appeal Cases</h2>
          <p className="text-slate-500">Autonomous pipeline output — review and approve before submission.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={refresh} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={runPoll} disabled={running} className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg">
            {running ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
            {running ? 'Scanning Denials…' : 'Scan for Denials'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-sm font-bold">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Case list */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" /></div>
          ) : cases.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[32px]">
              <FileText size={40} className="mx-auto text-slate-200 mb-4" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No cases yet</p>
              <p className="text-xs text-slate-300 mt-1">Scan for denials to run the pipeline.</p>
            </div>
          ) : (
            cases.map((c) => (
              <button key={c.id} onClick={() => openCase(c.id)} className={`w-full text-left p-5 bg-white rounded-[24px] border transition-all flex items-center justify-between ${selected?.case.id === c.id ? 'border-blue-300 shadow-md' : 'border-slate-100 hover:border-blue-200'}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${stateBadge(c.state)}`}>{c.state.replace(/_/g, ' ')}</span>
                    {c.category && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{c.category.replace(/_/g, ' ')}</span>}
                  </div>
                  <p className="font-bold text-slate-900 text-sm">{c.denialId}</p>
                  {c.appealDeadline && (
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
                      <Clock size={10} /> Due {c.appealDeadline}
                    </p>
                  )}
                </div>
                {selecting === c.id ? <Loader2 size={16} className="animate-spin text-slate-300" /> : <ChevronRight size={16} className="text-slate-300" />}
              </button>
            ))
          )}
        </div>

        {/* Case detail */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[40px]">
              <ShieldCheck className="text-slate-200 mb-4" size={56} />
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Select a case to review</p>
            </div>
          ) : (
            <CaseReview detail={selected} onApprove={approve} onSubmit={submit} approving={approving} />
          )}
        </div>
      </div>
    </div>
  );
};

const CaseReview: React.FC<{ detail: CaseDetail; onApprove: () => void; onSubmit: () => void; approving: boolean }> = ({ detail, onApprove, onSubmit, approving }) => {
  const { case: c } = detail;
  const packet = c.packet;
  const gate = c.gate;

  return (
    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{c.id}</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
            {c.classification?.category?.replace(/_/g, ' ')} • {packet?.carrier}
          </p>
        </div>
        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl ${c.state === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
          {c.state.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Deterministic decision */}
      {gate && (
        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
            <ShieldCheck size={14} className="text-blue-500" /> Deterministic Gate: {gate.decision.replace(/_/g, ' ')}
          </p>
          <div className="space-y-2">
            {gate.checks.map((check) => (
              <div key={check.requirementId} className="flex items-start gap-2 text-[11px] font-bold">
                {check.satisfied ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" /> : <X size={14} className="text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <span className="text-slate-700">{check.description}</span>
                  {check.citations.map((cit, i) => (
                    <p key={i} className="text-[10px] text-slate-400 italic mt-0.5">"{cit.snippet}"</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI draft */}
      {packet && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <FileText size={14} className="text-indigo-500" /> Draft Appeal Letter
            </p>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${packet.aiValidationPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {packet.aiValidationPassed ? 'Validated' : 'Validation Issues'}
            </span>
          </div>
          <textarea readOnly value={packet.draftLetter} className="w-full h-64 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium leading-relaxed outline-none resize-none" />
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
            Deadline {packet.appealDeadline} • Route {packet.appealRoute || 'n/a'} • {packet.aiProvider}
          </p>
        </div>
      )}

      {/* Approval gate */}
      {c.state === 'packet_ready' && (
        <button onClick={onApprove} disabled={approving} className="w-full py-5 bg-emerald-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-3 transition-all shadow-lg">
          {approving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {approving ? 'Approving…' : 'Approve for Submission'}
        </button>
      )}
      {c.state === 'approved' && (
        <button onClick={onSubmit} disabled={approving} className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-3 transition-all shadow-lg">
          {approving ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
          {approving ? 'Preparing handoff…' : 'Hand Off for Submission'}
        </button>
      )}
      {c.state === 'submitted' && (
        <div className="flex items-center justify-center gap-2 py-4 bg-emerald-50 text-emerald-700 rounded-2xl font-black uppercase tracking-widest text-xs">
          <CheckCircle2 size={16} /> Submitted — handoff package generated
        </div>
      )}
    </div>
  );
};

export default Cases;
