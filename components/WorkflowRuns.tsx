/**
 * WorkflowRuns — READ-ONLY global job list (GET /api/jobs).
 *
 * This is the GLOBAL job queue, not a per-case view. It surfaces the real
 * attempts / status / lastError (decrypted server-side) so a reviewer can see
 * pipeline run health. Status only — retry is a CASE action (there is no
 * job-retry endpoint), so each row points the reviewer to open the affected
 * case to re-run it. Loading / empty / error states are explicit and distinct
 * (never silently empty).
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertCircle, Workflow } from 'lucide-react';
import { api, isOk, type JobRow, type ApiError } from '../services/apiClient.ts';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; error: ApiError }
  | { phase: 'ready'; jobs: JobRow[] };

const statusChip = (status: JobRow['status']): string => {
  const map: Record<JobRow['status'], string> = {
    queued: 'bg-slate-100 text-slate-600',
    running: 'bg-blue-50 text-blue-700',
    done: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-rose-50 text-rose-700',
  };
  return map[status];
};

const WorkflowRuns: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  const refresh = useCallback(async () => {
    setState({ phase: 'loading' });
    const res = await api.listJobs();
    if (isOk(res)) {
      setState({ phase: 'ready', jobs: res.data.jobs });
    } else {
      // Never collapse an error into an empty list.
      setState({ phase: 'error', error: res });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return (
    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-xl"><Workflow size={18} /></div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Workflow Runs</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global pipeline job queue</p>
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 transition-all"
          aria-label="Refresh jobs"
        >
          <RefreshCw size={16} className={state.phase === 'loading' ? 'animate-spin' : ''} />
        </button>
      </div>

      {state.phase === 'loading' && (
        <div className="py-10 text-center text-slate-400">
          <Loader2 className="animate-spin mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-widest mt-2">Loading jobs…</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-bold">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="uppercase tracking-widest">Could not load jobs ({state.error.kind})</p>
            <p className="font-medium mt-0.5">{state.error.message}</p>
          </div>
        </div>
      )}

      {state.phase === 'ready' && state.jobs.length === 0 && (
        <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No jobs recorded</p>
          <p className="text-[10px] text-slate-300 mt-1">The pipeline has not been run on this workstation.</p>
        </div>
      )}

      {state.phase === 'ready' && state.jobs.length > 0 && (
        <div className="space-y-2">
          {state.jobs.map((j) => (
            <div key={j.id} className="p-4 rounded-2xl border border-slate-100 hover:bg-slate-50/60 transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${statusChip(j.status)}`}>{j.status}</span>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{j.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-500 mt-1 truncate">{j.id}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Attempts {j.attempts}</p>
                  <p className="text-[9px] text-slate-300 font-bold">{j.updatedAt}</p>
                  {/* Retry is a CASE action (POST /api/cases/:id/retry), not a job
                      action — there is no job-retry endpoint. Open the affected
                      case to re-run its pipeline. */}
                  <span
                    title="Retry is a case action — open the affected case to re-run its pipeline"
                    className="mt-1 inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded bg-slate-100 text-slate-400"
                  >
                    Retry: open the case
                  </span>
                </div>
              </div>
              {j.lastError && (
                <p className="mt-2 text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 break-words">
                  Last error: {j.lastError}
                </p>
              )}
              {j.idempotencyKey && (
                <p className="mt-1 text-[9px] text-slate-400 font-mono">key: {j.idempotencyKey}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowRuns;
