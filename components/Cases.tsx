import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, RefreshCw, CheckCircle2, AlertCircle, X,
  ShieldCheck, Clock, FileText, ChevronRight, Info,
  Send, Download, PlayCircle, RotateCcw, Package,
} from 'lucide-react';
import {
  api,
  isOk,
  type CaseSummary,
  type CaseDetail,
  type ApiError,
  type AppealCaseState,
  type HandoffPackage,
  type ReceiptInfo,
  type SubmissionInput,
  type SummaryInfo,
} from '../services/apiClient.ts';
import { useSession } from '../services/sessionContext.tsx';
import { describeDeadline } from '../services/deadlineView.ts';
import type { Capabilities } from '../services/capabilities.ts';
import WorkflowRuns from './WorkflowRuns.tsx';

/**
 * Cases — pipeline review + mutation screen (UI Wiring Packages 1–4).
 *
 * Lists appeal cases from the local backend and renders a selected case's full
 * deterministic + AI basis (read-only, Pkg 1&2). Packages 3&4 wire the real
 * mutations: versioned approval (with a mandatory human-review acknowledgment),
 * handoff generate/download, a human-entered submission receipt, pipeline run
 * controls, and case retry. No optimistic UI — after any successful mutation we
 * refresh detail + list + summary from the server. A 409 is reconciled to
 * current server state, never blind-retried. Every state is rendered; packet
 * may be null; deadlines are null-safe. All data comes from the backend.
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
  const [summary, setSummary] = useState<SummaryInfo | null>(null);

  const refresh = useCallback(async () => {
    setList({ phase: 'loading' });
    const res = await api.listCases();
    if (isOk(res)) setList({ phase: 'ready', cases: res.data.cases });
    else setList({ phase: 'error', error: res }); // never collapse to empty
  }, []);

  // Summary refresh is part of the post-mutation reconciliation (detail+list+summary).
  const refreshSummary = useCallback(async () => {
    const res = await api.summary();
    setSummary(isOk(res) ? res.data : null);
  }, []);

  const openCase = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail({ phase: 'loading', id });
    const res = await api.getCase(id);
    if (isOk(res)) setDetail({ phase: 'ready', detail: res.data });
    else setDetail({ phase: 'error', id, error: res });
  }, []);

  useEffect(() => { void refresh(); void refreshSummary(); }, [refresh, refreshSummary]);

  /**
   * Post-mutation reconciliation: re-fetch detail (so the review panel repaints
   * from server truth — several mutation responses return only partial rows),
   * the list, and the summary. Never advance/close a case optimistically.
   */
  const reloadAfterMutation = useCallback(async (id: string) => {
    await Promise.all([openCase(id), refresh(), refreshSummary()]);
  }, [openCase, refresh, refreshSummary]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Appeal Cases</h2>
          <p className="text-slate-500">
            Pipeline output — review and act on cases.
            {summary && (
              <span className="ml-2 font-black text-slate-600 uppercase tracking-widest text-[11px]">
                {summary.packetsReady} ready for review
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { void refresh(); void refreshSummary(); }} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all" aria-label="Refresh cases">
            <RefreshCw size={18} className={list.phase === 'loading' ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Pipeline run controls — synchronous drains, NOT async accepted jobs. */}
      {capabilities.canRun && (
        <RunControls
          onRan={async () => { await Promise.all([refresh(), refreshSummary()]); }}
        />
      )}

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
          {detail.phase === 'ready' && (
            <CaseReview
              key={detail.detail.case.id}
              detail={detail.detail}
              capabilities={capabilities}
              onMutated={reloadAfterMutation}
            />
          )}
        </div>
      </div>

      {/* Global pipeline job queue (read-only). */}
      <WorkflowRuns />
    </div>
  );
};

/** Small inline error line reused by the mutation panels. */
const ErrorLine: React.FC<{ error: ApiError }> = ({ error }) => (
  <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-[11px] font-bold">
    <AlertCircle size={14} className="shrink-0 mt-0.5" />
    <div>
      <p className="uppercase tracking-widest">{error.kind}</p>
      <p className="font-medium mt-0.5">{error.message}</p>
    </div>
  </div>
);

/**
 * Pipeline run controls. Both endpoints are SYNCHRONOUS drains (the server
 * awaits the job queue before responding) — they are NOT async accepted-job
 * APIs, and there is no schedule-config endpoint to edit, so no scheduler UI.
 */
const RunControls: React.FC<{ onRan: () => Promise<void> }> = ({ onRan }) => {
  const [denialId, setDenialId] = useState('');
  const [pending, setPending] = useState<'poll' | 'denial' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pollResult, setPollResult] = useState<{ processed: number; cases: number } | null>(null);
  const [denialResult, setDenialResult] = useState<{ caseId: string | null; state: AppealCaseState | null } | null>(null);

  const runPoll = async () => {
    setPending('poll'); setError(null); setDenialResult(null);
    const res = await api.runPoll();
    if (isOk(res)) {
      setPollResult(res.data);
      await onRan();
    } else {
      setPollResult(null);
      setError(res);
    }
    setPending(null);
  };

  const runDenial = async () => {
    const id = denialId.trim();
    if (!id) return;
    setPending('denial'); setError(null); setPollResult(null);
    const res = await api.runDenial(id);
    if (isOk(res)) {
      setDenialResult({ caseId: res.data.caseId, state: res.data.state });
      await onRan();
    } else {
      setDenialResult(null);
      setError(res);
    }
    setPending(null);
  };

  return (
    <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <PlayCircle size={16} className="text-blue-500" />
        <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Run pipeline (synchronous drain)</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void runPoll()}
          disabled={pending !== null}
          className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-800 disabled:opacity-50 transition-all"
        >
          {pending === 'poll' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {pending === 'poll' ? 'Draining…' : 'Poll for denials'}
        </button>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={denialId}
            onChange={(e) => setDenialId(e.target.value)}
            placeholder="denial id (e.g. den_001)"
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => void runDenial()}
            disabled={pending !== null || denialId.trim() === ''}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {pending === 'denial' ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
            {pending === 'denial' ? 'Running…' : 'Run denial'}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 font-medium">
        Each control runs now on this workstation and returns its actual result — not an accepted background job. No schedule configuration is exposed.
      </p>
      {pollResult && (
        <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2">
          Poll ran now — {pollResult.processed} job(s) processed • {pollResult.cases} case(s) total.
        </p>
      )}
      {denialResult && (
        <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2">
          Denial ran now — case {denialResult.caseId ?? 'n/a'} resolved to state{' '}
          <span className="uppercase">{denialResult.state ? label(denialResult.state) : 'n/a'}</span>.
        </p>
      )}
      {error && <ErrorLine error={error} />}
    </div>
  );
};

/** Review of a single case plus the wired Package 3/4 mutation panels. */
const CaseReview: React.FC<{
  detail: CaseDetail;
  capabilities: Capabilities;
  onMutated: (id: string) => Promise<void>;
}> = ({ detail, capabilities, onMutated }) => {
  const canApprove = capabilities.canApprove;
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

  // --- Approval state (versioned, with mandatory human-review acknowledgment) ---
  const [acknowledged, setAcknowledged] = useState(false);
  const [approvePending, setApprovePending] = useState(false);
  const [approveError, setApproveError] = useState<ApiError | null>(null);

  // --- Handoff state (generate + download) ---
  const [handoffPending, setHandoffPending] = useState(false);
  const [handoffError, setHandoffError] = useState<ApiError | null>(null);
  const [generatedHandoff, setGeneratedHandoff] = useState<HandoffPackage | null>(null);
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState<ApiError | null>(null);
  const [downloadedVersion, setDownloadedVersion] = useState<number | null>(null);

  // --- Submission receipt state ---
  const [channel, setChannel] = useState('payer_portal');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [submittedAt, setSubmittedAt] = useState('');
  const [note, setNote] = useState('');
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [receiptError, setReceiptError] = useState<ApiError | null>(null);

  // --- Retry state ---
  const [retryPending, setRetryPending] = useState(false);
  const [retryError, setRetryError] = useState<ApiError | null>(null);

  // Load an existing receipt when one is already recorded for this case.
  const loadedReceiptFor = useRef<string | null>(null);
  useEffect(() => {
    if (c.hasReceipt && loadedReceiptFor.current !== c.id) {
      loadedReceiptFor.current = c.id;
      void (async () => {
        const res = await api.getReceipt(c.id);
        if (isOk(res)) { setReceipt(res.data); setReceiptError(null); }
        else { setReceipt(null); setReceiptError(res); }
      })();
    }
  }, [c.id, c.hasReceipt]);

  const handleApprove = async () => {
    setApprovePending(true); setApproveError(null);
    const res = await api.approveCase(c.id, c.packetVersion);
    if (isOk(res)) {
      setAcknowledged(false);
      await onMutated(c.id);
    } else {
      // 409 => packet changed / already approved: force re-review, never retry.
      if (res.kind === 'conflict') {
        setAcknowledged(false);
        await onMutated(c.id);
      }
      setApproveError(res);
    }
    setApprovePending(false);
  };

  const handleGenerateHandoff = async () => {
    setHandoffPending(true); setHandoffError(null);
    const res = await api.generateHandoff(c.id);
    if (isOk(res)) {
      setGeneratedHandoff(res.data.package);
      await onMutated(c.id);
    } else {
      if (res.kind === 'conflict') await onMutated(c.id);
      setHandoffError(res);
    }
    setHandoffPending(false);
  };

  const handleDownloadHandoff = async () => {
    setDownloadPending(true); setDownloadError(null);
    const res = await api.downloadHandoff(c.id);
    if (isOk(res)) {
      try {
        // Parse the Blob JSON to surface which version the artifact is for.
        const text = await res.data.text();
        const pkg = JSON.parse(text) as Partial<HandoffPackage>;
        if (typeof pkg.packetVersion === 'number') setDownloadedVersion(pkg.packetVersion);
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `handoff_${c.id}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        // Blob arrived but could not be parsed/saved; surface a server-error line.
        setDownloadError({ ok: false, kind: 'serverError', status: 0, message: 'Downloaded artifact could not be read.' });
      }
    } else {
      setDownloadError(res);
    }
    setDownloadPending(false);
  };

  const handleRecordSubmission = async () => {
    setSubmitPending(true); setSubmitError(null);
    const input: SubmissionInput = {
      channel: channel.trim(),
      confirmationNumber: confirmationNumber.trim(),
      ...(submittedAt.trim() ? { submittedAt: submittedAt.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const res = await api.recordSubmission(c.id, input);
    if (isOk(res)) {
      // Read back the stored, server-decrypted receipt (do not fabricate from audit).
      const rc = await api.getReceipt(c.id);
      if (isOk(rc)) { setReceipt(rc.data); setReceiptError(null); }
      else { setReceipt(null); setReceiptError(rc); }
      await onMutated(c.id);
    } else {
      if (res.kind === 'conflict') await onMutated(c.id);
      setSubmitError(res);
    }
    setSubmitPending(false);
  };

  const handleRetry = async () => {
    setRetryPending(true); setRetryError(null);
    const res = await api.retryCase(c.id);
    if (isOk(res)) {
      await onMutated(c.id);
    } else {
      if (res.kind === 'conflict') await onMutated(c.id);
      setRetryError(res);
    }
    setRetryPending(false);
  };

  const submitFieldsValid = channel.trim() !== '' && confirmationNumber.trim() !== '';
  const retryable = c.state === 'failed' || c.state === 'needs_more_data' || c.state === 'needs_review';

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

      {/* ===== Package 3 — Approval (versioned, human-review acknowledged) ===== */}
      {c.state === 'packet_ready' && canApprove && (
        <div className="p-5 rounded-3xl border border-blue-100 bg-blue-50/40 space-y-3">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck size={14} className="text-blue-500" /> Approve for submission
          </p>
          <label className="flex items-start gap-3 text-[11px] font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={approvePending}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>I have reviewed this packet and approve version v{c.packetVersion} for submission.</span>
          </label>
          <button
            onClick={() => void handleApprove()}
            disabled={!acknowledged || approvePending}
            className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all"
          >
            {approvePending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {approvePending ? 'Approving…' : `Approve v${c.packetVersion}`}
          </button>
          {approveError && (
            <div className="space-y-1">
              <ErrorLine error={approveError} />
              {approveError.kind === 'conflict' && (
                <p className="text-[10px] text-amber-700 font-bold">
                  The packet changed or was already approved — re-review the refreshed packet before approving again.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Package 3 — Handoff (generate + download). NOT submission. ===== */}
      {capabilities.canViewHandoff && (
        <div className="p-5 rounded-3xl border border-indigo-100 bg-indigo-50/40 space-y-3">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <Package size={14} className="text-indigo-500" /> Handoff artifact
          </p>
          <p className="text-[10px] text-slate-500 font-medium">
            Generating a handoff prepares a downloadable artifact — it is NOT a submission to the payer, and the appeal deadline stays open until a submission receipt is recorded below.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handleGenerateHandoff()}
              disabled={c.state !== 'approved' || handoffPending}
              title={c.state !== 'approved' ? 'Enabled only once the packet is approved' : undefined}
              className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {handoffPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {handoffPending ? 'Generating…' : 'Generate handoff'}
            </button>
            <button
              onClick={() => void handleDownloadHandoff()}
              disabled={!c.hasHandoff || downloadPending}
              title={!c.hasHandoff ? 'No handoff has been generated yet' : undefined}
              className="flex items-center gap-2 px-5 py-3 bg-white text-slate-900 border border-slate-200 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {downloadPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {downloadPending ? 'Downloading…' : 'Download handoff'}
            </button>
          </div>
          {generatedHandoff && (
            <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2 space-y-0.5">
              <p>Handoff generated for packet v{generatedHandoff.packetVersion}.</p>
              <p className="text-[10px] text-slate-500 font-medium">
                {generatedHandoff.carrier} • route {generatedHandoff.appealRoute ?? 'n/a'} • {generatedHandoff.evidenceCount} evidence item(s) • generated {generatedHandoff.generatedAt}
              </p>
            </div>
          )}
          {downloadedVersion != null && (
            <p className="text-[11px] font-bold text-slate-600">Downloaded artifact for packet v{downloadedVersion}.</p>
          )}
          {handoffError && <ErrorLine error={handoffError} />}
          {downloadError && <ErrorLine error={downloadError} />}
        </div>
      )}

      {/* ===== Package 3 — Human submission receipt + readback ===== */}
      {capabilities.canRecordSubmission && (
        <div className="p-5 rounded-3xl border border-slate-200 bg-slate-50 space-y-3">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <Send size={14} className="text-slate-600" /> Record submission receipt
          </p>
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-2xl text-amber-800 text-[10px] font-bold">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>This records a HUMAN-ENTERED submission receipt — proof that a person transmitted the appeal out-of-band. It is NOT payer transmission and NOT independent payer confirmation.</p>
          </div>

          {/* Existing recorded receipt (read-back from the server). */}
          {receipt && (
            <div className="text-[11px] bg-white border border-slate-200 rounded-2xl px-4 py-3 space-y-0.5">
              <p className="font-black text-slate-900 uppercase tracking-widest text-[10px]">Recorded submission</p>
              <p className="text-slate-700 font-bold">Channel: {receipt.channel}</p>
              <p className="text-slate-700 font-bold">Confirmation #: {receipt.confirmationNumber}</p>
              <p className="text-slate-500">Submitted at: {receipt.submittedAt}</p>
              {receipt.note && <p className="text-slate-500">Note: {receipt.note}</p>}
              <p className="text-slate-400 text-[10px]">Entered by {receipt.recordedBy} (human record — not payer confirmation).</p>
            </div>
          )}
          {receiptError && <ErrorLine error={receiptError} />}

          {/* Entry form — enabled only once a handoff exists to submit. */}
          {c.state === 'handoff_generated' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Channel (required)</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    disabled={submitPending}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="payer_portal">payer_portal</option>
                    <option value="fax">fax</option>
                    <option value="mail">mail</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Confirmation # (required)</label>
                  <input
                    type="text"
                    value={confirmationNumber}
                    onChange={(e) => setConfirmationNumber(e.target.value)}
                    disabled={submitPending}
                    placeholder="e.g. CONF-9"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Submitted at (optional)</label>
                  <input
                    type="datetime-local"
                    value={submittedAt}
                    onChange={(e) => setSubmittedAt(e.target.value)}
                    disabled={submitPending}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Note (optional)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={submitPending}
                    placeholder="Reference / memo"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={() => void handleRecordSubmission()}
                disabled={!submitFieldsValid || submitPending}
                className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all"
              >
                {submitPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {submitPending ? 'Recording…' : 'Record submission'}
              </button>
              {submitError && <ErrorLine error={submitError} />}
            </div>
          ) : (
            !receipt && (
              <p className="text-[10px] text-slate-400 font-medium">
                Recording a submission is enabled only after a handoff has been generated (current state: {label(c.state)}).
              </p>
            )
          )}

          {/* No authenticated packet-edit / version-invalidation API exists. */}
          <p className="text-[10px] text-slate-400 font-medium border-t border-slate-200 pt-2">
            Requesting changes / revising the packet is not available: there is no authenticated packet-edit or version-invalidation API. Correct source data upstream and re-run the pipeline instead.
          </p>
        </div>
      )}

      {/* ===== Package 4 — Retry / re-run pipeline ===== */}
      {capabilities.canRun && retryable && (
        <div className="p-5 rounded-3xl border border-amber-100 bg-amber-50/50 space-y-3">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <RotateCcw size={14} className="text-amber-600" /> Retry / re-run pipeline
          </p>
          <p className="text-[10px] text-slate-600 font-medium">
            {c.state === 'failed'
              ? 'Re-runs the pipeline for this failed case to resume and repair it.'
              : 'Re-runs the pipeline for this case. There is no evidence or date-correction editor — correct the source data upstream, then re-run.'}
          </p>
          <button
            onClick={() => void handleRetry()}
            disabled={retryPending}
            className="flex items-center gap-2 px-5 py-3 bg-amber-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-amber-700 disabled:opacity-50 transition-all"
          >
            {retryPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            {retryPending ? 'Re-running…' : 'Retry (re-run pipeline)'}
          </button>
          {retryError && <ErrorLine error={retryError} />}
        </div>
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
