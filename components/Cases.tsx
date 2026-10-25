import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, RefreshCw, CheckCircle2, AlertCircle, X,
  ShieldCheck, Clock, FileText, ChevronRight, Lock, Info,
} from 'lucide-react';
import {
  api,
  isOk,
  type CaseSummary,
  type CaseDetail,
  type ApiError,
  type AppealCaseState,
} from '../services/apiClient.ts';
import { useSession } from '../services/sessionContext.tsx';
import { describeDeadline } from '../services/deadlineView.ts';
import WorkflowRuns from './WorkflowRuns.tsx';

/**
 * Cases — READ-ONLY pipeline review screen (UI Wiring increment).
 *
 * Lists appeal cases from the local backend and renders a selected case's full
 * deterministic + AI basis. NO mutation is wired this increment: approve,
 * generate handoff, download, record submission, and retry are display-only /
 * omitted. Every state is rendered intentionally; packet may be null; deadlines
 * are null-safe. All data comes from the authenticated backend.
 */

type ListState =
  | { phase: 'loading' }
  | { phase: 'error'; error: ApiError }
  | { phase: 'ready'; cases: CaseSummary[] };

type DetailState =
  | { phase: 'idle' }
  | { phase: 'loading'; id: string }
  | { phase: 'error'; id: string; error: ApiError }
  | { phase: 'ready'; detail: CaseDetail };

const STATE_BADGE: Record<AppealCaseState, string> = {
  packet_ready: 'bg-blue-50 text-blue-700',
  needs_review: 'bg-amber-50 text-amber-700',
  needs_more_data: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  handoff_generated: 'bg-indigo-50 text-indigo-700',
  submitted: 'bg-emerald-50 text-emerald-700',
  ineligible: 'bg-rose-50 text-rose-700',
  failed: 'bg-rose-50 text-rose-700',
  intake: 'bg-slate-100 text-slate-600',
  classified: 'bg-slate-100 text-slate-600',
  gathering: 'bg-slate-100 text-slate-600',
  gated: 'bg-slate-100 text-slate-600',
  reasoning: 'bg-slate-100 text-slate-600',
};

const badge = (state: AppealCaseState): string => STATE_BADGE[state] ?? 'bg-slate-100 text-slate-600';
const label = (s: string): string => s.replace(/_/g, ' ');

const Cases: React.FC = () => {
  const { capabilities } = useSession();
  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [detail, setDetail] = useState<DetailState>({ phase: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setList({ phase: 'loading' });
    const res = await api.listCases();
    if (isOk(res)) setList({ phase: 'ready', cases: res.data.cases });
    else setList({ phase: 'error', error: res }); // never collapse to empty
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openCase = async (id: string) => {
    setSelectedId(id);
    setDetail({ phase: 'loading', id });
    const res = await api.getCase(id);
    if (isOk(res)) setDetail({ phase: 'ready', detail: res.data });
    else setDetail({ phase: 'error', id, error: res });
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Appeal Cases</h2>
          <p className="text-slate-500">Pipeline output — review only. Actions arrive in a later increment.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => void refresh()} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all" aria-label="Refresh cases">
            <RefreshCw size={18} className={list.phase === 'loading' ? 'animate-spin' : ''} />
          </button>
          {/* Pipeline-trigger ("Scan for Denials") is a mutation → next increment. */}
          {capabilities.canRun && (
            <button
              disabled
              title="Running the pipeline is wired in a later increment"
              className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-400 font-black uppercase tracking-widest text-[10px] rounded-2xl cursor-not-allowed"
            >
              <Lock size={14} /> Scan for Denials (next increment)
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Case list */}
        <div className="lg:col-span-2 space-y-3">
          {list.phase === 'loading' && (
            <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" /></div>
          )}

          {list.phase === 'error' && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-bold">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="uppercase tracking-widest">Could not load cases ({list.error.kind})</p>
                <p className="font-medium mt-0.5">{list.error.message}</p>
              </div>
            </div>
          )}

          {list.phase === 'ready' && list.cases.length === 0 && (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[32px]">
              <FileText size={40} className="mx-auto text-slate-200 mb-4" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No cases yet</p>
              <p className="text-xs text-slate-300 mt-1">The pipeline has not produced any appeal cases.</p>
            </div>
          )}

          {list.phase === 'ready' && list.cases.map((c) => {
            const dv = describeDeadline({
              deadlineKnown: c.deadlineStatus === 'calculated' && Boolean(c.appealDeadline),
              appealDeadline: c.appealDeadline,
              daysRemaining: null, // list endpoint has no day count; detail/summary carry it
              deadlineBlockers: [],
            });
            return (
              <button key={c.id} onClick={() => void openCase(c.id)} className={`w-full text-left p-5 bg-white rounded-[24px] border transition-all flex items-center justify-between ${selectedId === c.id ? 'border-blue-300 shadow-md' : 'border-slate-100 hover:border-blue-200'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${badge(c.state)}`}>{label(c.state)}</span>
                    {c.category && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label(c.category)}</span>}
                  </div>
                  <p className="font-bold text-slate-900 text-sm truncate">{c.denialId}</p>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-0.5">Case {c.id} • packet v{c.packetVersion}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
                    <Clock size={10} /> {dv.known ? `Due ${c.appealDeadline} (synthetic rule)` : 'Deadline unknown'}
                  </p>
                </div>
                {detail.phase === 'loading' && detail.id === c.id
                  ? <Loader2 size={16} className="animate-spin text-slate-300 shrink-0" />
                  : <ChevronRight size={16} className="text-slate-300 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Case detail */}
        <div className="lg:col-span-3">
          {detail.phase === 'idle' && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[40px]">
              <ShieldCheck className="text-slate-200 mb-4" size={56} />
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Select a case to review</p>
            </div>
          )}
          {detail.phase === 'loading' && (
            <div className="h-full flex items-center justify-center p-12 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[40px]">
              <Loader2 className="animate-spin text-slate-300" size={32} />
            </div>
          )}
          {detail.phase === 'error' && (
            <div className="flex items-start gap-3 p-6 bg-rose-50 border border-rose-100 rounded-[40px] text-rose-700 text-sm font-bold">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="uppercase tracking-widest">Could not load case ({detail.error.kind})</p>
                <p className="font-medium mt-0.5">{detail.error.message}</p>
              </div>
            </div>
          )}
          {detail.phase === 'ready' && <CaseReview detail={detail.detail} canApprove={capabilities.canApprove} />}
        </div>
      </div>

      {/* Global pipeline job queue (read-only). */}
      <WorkflowRuns />
    </div>
  );
};

/** Read-only review of a single case's full deterministic + AI basis. */
const CaseReview: React.FC<{ detail: CaseDetail; canApprove: boolean }> = ({ detail, canApprove }) => {
  const { case: c, audit } = detail;
  const packet = c.packet;
  const gate = c.gate;
  const cls = c.classification;

  const dv = describeDeadline({
    deadlineKnown: cls?.deadlineStatus === 'calculated' && Boolean(cls?.appealDeadline),
    appealDeadline: cls?.appealDeadline ?? null,
    daysRemaining: null,
    deadlineBlockers: cls?.deadlineBlockers ?? [],
  });

  return (
    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight truncate">{c.id}</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
            {cls?.category ? label(cls.category) : 'uncategorized'} • {packet?.carrier ?? 'carrier unavailable'}
          </p>
        </div>
        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl shrink-0 ${badge(c.state)}`}>
          {label(c.state)}
        </span>
      </div>

      {/* Separate lifecycle fields — never conflate job/approval/submission. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field k="Packet version" v={`v${c.packetVersion}`} />
        <Field k="Approved version" v={c.approvedVersion != null ? `v${c.approvedVersion}` : 'not approved'} />
        <Field k="Handoff" v={c.hasHandoff ? `generated v${c.handoffVersion ?? '?'}` : 'none'} />
        <Field k="Submission receipt" v={c.hasReceipt ? 'recorded' : 'none'} />
        <Field k="Submitted" v={c.submittedAt ? c.submittedAt : 'not submitted'} />
        <Field k="Updated" v={c.updatedAt} />
      </div>

      {/* Deadline — null-safe, synthetic-rule labelled. */}
      <div className={`p-4 rounded-2xl border ${dv.known ? 'border-slate-100 bg-slate-50' : 'border-amber-100 bg-amber-50'}`}>
        <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-slate-700">
          <Clock size={13} className={dv.known ? 'text-blue-500' : 'text-amber-500'} /> Appeal deadline
        </p>
        <p className={`text-xs font-bold mt-1 ${dv.known ? 'text-slate-700' : 'text-amber-800'}`}>{dv.detail}</p>
        {dv.known && <p className="text-[10px] text-slate-400 mt-1">Not verified payer coverage — derived from a synthetic appeal-window rule.</p>}
      </div>

      {/* No packet (held before AI). */}
      {!packet && (
        <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-600 text-xs font-bold">
          <Info size={16} className="shrink-0 mt-0.5 text-slate-400" />
          <p>No packet for this case — the pipeline stopped before AI drafting (state: {label(c.state)}). There is no draft letter or AI validation to review yet.</p>
        </div>
      )}

      {/* Classification inputs. */}
      {cls && (
        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-2">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Classification</p>
          <p className="text-[11px] text-slate-600 font-medium">{cls.rationale}</p>
          <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">appealable: {String(cls.appealable)}</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">denial date: {cls.denialDate ?? 'unknown'}</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">window: {cls.appealWindowDays != null ? `${cls.appealWindowDays}d` : 'unknown'}</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">route: {cls.appealRoute ?? 'unknown'}</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">policy: {cls.policyId ?? 'none'}</span>
          </div>
          {cls.recognizedCodes.length > 0 && (
            <p className="text-[10px] text-slate-500"><span className="font-black uppercase tracking-widest">Recognized CARC:</span> {cls.recognizedCodes.join(', ')}</p>
          )}
          {cls.unrecognizedCodes.length > 0 && (
            <p className="text-[10px] text-amber-700"><span className="font-black uppercase tracking-widest">Unrecognized CARC:</span> {cls.unrecognizedCodes.join(', ')}</p>
          )}
          {cls.deadlineStatus !== 'calculated' && cls.deadlineBlockers.length > 0 && (
            <p className="text-[10px] text-amber-700"><span className="font-black uppercase tracking-widest">Deadline blockers:</span> {cls.deadlineBlockers.join(', ')}</p>
          )}
        </div>
      )}

      {/* Deterministic gate with citations (documentId preserved). */}
      {gate && (
        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
            <ShieldCheck size={14} className="text-blue-500" /> Deterministic gate: {label(gate.decision)}
          </p>
          <p className="text-[11px] text-slate-600 font-medium mb-3">{gate.rationale}</p>
          {gate.checks.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic">No requirement checks produced (no governing policy resolved).</p>
          ) : (
            <div className="space-y-2">
              {gate.checks.map((check) => (
                <div key={check.requirementId} className="flex items-start gap-2 text-[11px] font-bold">
                  {check.satisfied ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" /> : <X size={14} className="text-rose-500 shrink-0 mt-0.5" />}
                  <div>
                    <span className="text-slate-700">{check.description}{check.required ? '' : ' (optional)'}</span>
                    {check.citations.map((cit, i) => (
                      <p key={i} className="text-[10px] text-slate-400 italic mt-0.5">
                        <span className="not-italic font-mono text-slate-500">[{cit.documentId}]</span> "{cit.snippet}"
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {gate.deficits.length > 0 && (
            <p className="text-[10px] text-rose-600 font-bold mt-3 uppercase tracking-widest">
              {gate.deficits.length} required requirement(s) unmet
            </p>
          )}
        </div>
      )}

      {/* AI draft + validation. */}
      {packet && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <FileText size={14} className="text-indigo-500" /> Draft appeal letter
            </p>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${packet.aiValidationPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {packet.aiValidationPassed ? 'AI-validated' : 'Validation failed'}
            </span>
          </div>
          <textarea readOnly value={packet.draftLetter} className="w-full h-56 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium leading-relaxed outline-none resize-none" />
          {packet.aiValidationIssues.length > 0 && (
            <div className="mt-2 p-3 bg-rose-50 border border-rose-100 rounded-2xl">
              <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-1">AI validation issues</p>
              <ul className="list-disc list-inside text-[11px] text-rose-700 font-medium space-y-0.5">
                {packet.aiValidationIssues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
            Route {packet.appealRoute || 'n/a'} • {packet.aiProvider}/{packet.aiModel}
          </p>
          {/* Evidence list (citation documentIds preserved). */}
          {packet.evidence.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Evidence</p>
              {packet.evidence.map((e, i) => (
                <p key={i} className="text-[10px] text-slate-500">
                  <span className="font-mono text-slate-600">[{e.documentId}]</span> {e.description}: <span className="italic">"{e.snippet}"</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Patient / carrier / owner joins and task assignment are NOT provided by the backend. */}
      <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-500 text-[10px] font-medium">
        <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
        <p>Patient, carrier contact, owner, and task assignments are unavailable — the backend exposes no patient-join or task endpoints this increment.</p>
      </div>

      {/* Approval is a mutation → next increment. Shown only to approvers, disabled. */}
      {c.state === 'packet_ready' && canApprove && (
        <button
          disabled
          title="Approval is wired in a later increment"
          className="w-full py-4 bg-slate-100 text-slate-400 font-black uppercase tracking-[0.2em] text-xs rounded-2xl cursor-not-allowed flex items-center justify-center gap-3"
        >
          <Lock size={16} /> Approve for submission (next increment)
        </button>
      )}

      {/* Audit trail. */}
      {audit.length > 0 && (
        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-3">Audit trail</p>
          <div className="space-y-1.5">
            {audit.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-[10px]">
                <span className="font-black text-slate-500 uppercase tracking-widest shrink-0">{a.action}</span>
                <span className="text-slate-400">by {a.actor}{a.detail ? ` — ${a.detail}` : ''}</span>
                <span className="text-slate-300 ml-auto shrink-0">{a.createdAt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{k}</p>
    <p className="text-[11px] font-bold text-slate-700 mt-0.5 break-words">{v}</p>
  </div>
);

export default Cases;
