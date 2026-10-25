import React, { useEffect, useId, useRef, useState } from 'react';
import { Clock, Download, Loader2, RotateCcw } from 'lucide-react';
import { useSession } from '../services/sessionContext.tsx';
import { isOk, type ApiError } from '../services/apiClient.ts';
import { DemoNotice, demoErrorText } from './DemoGateway.tsx';

interface DemoControlsProps {
  onShowCases?: () => void;
  showNotice?: boolean;
}

const DemoControls: React.FC<DemoControlsProps> = ({ onShowCases, showNotice = true }) => {
  const session = useSession();
  const demo = session.demoSession;
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState<'role' | 'reset' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [exported, setExported] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const roleId = useId();
  const resetTitleId = useId();
  const feedbackId = useId();
  const absoluteExpiry = demo ? Date.parse(demo.expiresAt) : NaN;
  const idleExpiry = demo ? Date.parse(demo.idleExpiresAt) : NaN;
  const expiry = Number.isFinite(idleExpiry) ? Math.min(absoluteExpiry, idleExpiry) : absoluteExpiry;
  const countdownCap = demo ? Math.min(demo.limits.idleMinutes * 60, demo.limits.ttlMinutes * 60) : Infinity;
  const remaining = Number.isFinite(expiry) ? Math.max(0, Math.min(countdownCap, Math.ceil((expiry - now) / 1000))) : null;
  const expired = remaining === 0;
  const countdown = remaining === null ? 'Checking expiry' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (resetOpen && !dialog.open) dialog.showModal();
    if (!resetOpen && dialog.open) dialog.close();
  }, [resetOpen]);

  const changeRole = async (role: 'PROVIDER' | 'BILLER') => {
    if (pending || expired || role === demo?.user.role) return;
    setPending('role');
    setError(null);
    const result = await session.demoChangeRole(role);
    if (!isOk(result)) setError(result);
    setPending(null);
  };

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || expired) return;
    setPending('reset');
    setError(null);
    const result = await session.demoReset();
    if (isOk(result)) setResetOpen(false);
    else setError(result);
    setPending(null);
  };

  const exportFeedback = (format: 'txt' | 'json') => {
    const content = {
      title: 'MedAuth synthetic demo feedback',
      exportedAt: new Date().toISOString(),
      notice: 'Local feedback export. Do not include real patient information or credentials. This file was not sent by the demo.',
      feedback,
    };
    const text = format === 'json' ? JSON.stringify(content, null, 2) : `${content.title}\n${content.exportedAt}\n${content.notice}\n\n${feedback}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `medauth-demo-feedback.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  };

  if (!demo) return <DemoNotice />;

  return (
    <section aria-label="Synthetic demo session" className="border-b border-slate-200 bg-white">
      {showNotice && <DemoNotice />}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock size={16} aria-hidden="true" />
          <span>{expired ? 'Demo session time reached' : `Estimated session remaining ${countdown}`}</span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label htmlFor={roleId} className="text-xs font-semibold text-slate-600">Server role</label>
          <select id={roleId} value={demo.user.role === 'BILLER' ? 'BILLER' : 'PROVIDER'} disabled={pending !== null || expired} onChange={(event) => void changeRole(event.target.value as 'PROVIDER' | 'BILLER')} className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:flex-none">
            <option value="PROVIDER">Provider</option>
            <option value="BILLER">Biller</option>
          </select>
          <button type="button" disabled={pending !== null || expired} onClick={() => setResetOpen(true)} className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />} Reset demo
          </button>
          <button type="button" disabled={pending !== null} onClick={() => session.leaveDemo()} className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold text-blue-800 underline underline-offset-4">{expired ? 'Start a fresh demo' : 'Leave demo'}</button>
        </div>
      </div>
      <p className="px-4 pb-3 text-xs leading-relaxed text-slate-500 sm:px-6">Server limits: {demo.limits.ttlMinutes}-minute session, {demo.limits.idleMinutes}-minute idle expiry, and up to {demo.limits.maxRetriesPerCase} retries per case. Countdown is an estimate; the server enforces expiry. Role changes keep this sample workspace; reset replaces its data. No payer delivery.</p>
      {(error ?? session.sessionError) && <p role="alert" className="mx-4 mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{demoErrorText((error ?? session.sessionError)!)}</p>}
      <details className="mx-4 mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:mx-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Walkthrough and local feedback</summary>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 text-sm leading-relaxed text-slate-600">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open Cases and intake one of the fixed synthetic records. Inspect its deadline and evidence checks.</li>
              <li>As Provider, acknowledge review and approve the exact eligible packet version. Biller cannot approve.</li>
              <li>Generate and download a handoff separately. This prepares an artifact; nothing is delivered.</li>
              <li>Record only the generated synthetic receipt offered by the demo. Reset to try the other role or fixture.</li>
            </ol>
            {onShowCases && <button type="button" onClick={onShowCases} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-blue-800">Open synthetic cases</button>}
            <p className="text-xs">Missing-evidence and unknown-deadline cases stay blocked until supported inputs exist; do not treat a successful request as carrier approval.</p>
          </div>
          <div>
            <label htmlFor={feedbackId} className="mb-2 block text-sm font-semibold text-slate-800">Local feedback — no patient information or secrets</label>
            <textarea id={feedbackId} value={feedback} maxLength={2000} onChange={(event) => { setFeedback(event.target.value); setExported(false); }} placeholder="Made-up example: I expected a separate handoff step after approval." className="min-h-[110px] w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Notes stay in this component’s memory and are never sent. Refreshing, switching roles, leaving, or resetting may erase them; download before you reset. No document upload.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => exportFeedback('txt')} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"><Download size={14} aria-hidden="true" /> Notes .txt</button>
              <button type="button" onClick={() => exportFeedback('json')} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">Notes .json</button>
              <button type="button" onClick={() => { setFeedback(''); setExported(false); }} className="min-h-[44px] rounded-lg px-3 py-2 text-xs font-semibold text-slate-600">Clear notes</button>
            </div>
            {exported && <p role="status" className="mt-2 text-xs text-emerald-800">Feedback downloaded to your device. Nothing was sent.</p>}
          </div>
        </div>
      </details>

      <dialog ref={dialogRef} aria-labelledby={resetTitleId} onCancel={(event) => { if (pending === 'reset') event.preventDefault(); else setResetOpen(false); }} onClose={() => setResetOpen(false)} style={{ width: 'calc(100% - 2rem)', maxHeight: 'calc(100dvh - 2rem)' }} className=" max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl">
        <form onSubmit={reset} className="space-y-5 p-5 sm:p-6">
          <h2 id={resetTitleId} className="text-xl font-bold text-slate-900">Reset this demo sandbox?</h2>
          <p className="text-sm leading-relaxed text-slate-600">The server creates a new isolated synthetic context and issues a new session token. Existing case views and work will be replaced. No real patient records are involved.</p>
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Download any local feedback first. Reset may clear notes held by the current view.</p>
          {error && <p role="alert" className="text-sm text-rose-800">{demoErrorText(error)}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" disabled={pending === 'reset'} onClick={() => setResetOpen(false)} className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={pending !== null || expired} className="flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending === 'reset' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{pending === 'reset' ? 'Resetting…' : 'Reset synthetic demo'}</button>
          </div>
        </form>
      </dialog>
    </section>
  );
};

export default DemoControls;
