import React, { useState } from 'react';
import { ArrowRight, FlaskConical, Loader2 } from 'lucide-react';
import { useSession } from '../services/sessionContext.tsx';
import { isOk, type ApiError } from '../services/apiClient.ts';

export const demoErrorText = (error: ApiError): string => {
  if (error.status === 429) {
    return `The demo has reached a temporary capacity or request limit. ${error.retryAfter ? `Try again in ${error.retryAfter} seconds.` : 'Wait before trying again or start fresh after an action limit.'}`;
  }
  if (error.status === 401 || (error.status === 403 && /expired|expiry|ended/i.test(error.message))) {
    return 'This demo session has expired or ended. Start a fresh demo to continue with a new synthetic sandbox.';
  }
  if (error.status === 403) {
    return 'This action is unavailable for the selected demo role. A biller can coordinate a case but cannot approve it.';
  }
  if (error.status === 0 || error.status >= 500) {
    return 'The demo service is unavailable right now. Check the current case status before retrying an action; start a session later if the welcome screen is still shown.';
  }
  if (error.status === 400) return 'Choose Provider or Biller before starting the demo.';
  return error.message || 'The demo could not complete that action. Please try again.';
};

export const DemoNotice: React.FC = () => (
  <div role="note" className="sticky top-0 z-[60] shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
    <strong>Synthetic demo only — no real patient information or credentials.</strong>{' '}
    Requests use the real workflow backend with synthetic EHR fixtures and an AI stub. No packet is delivered to a payer.
  </div>
);

const DemoGateway: React.FC = () => {
  const session = useSession();
  const [role, setRole] = useState<'PROVIDER' | 'BILLER'>('PROVIDER');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const visibleError = error ?? session.sessionError;

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await session.demoStart(role);
    if (!isOk(result)) setError(result);
    setPending(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DemoNotice />
      <main className="mx-auto grid min-h-[80vh] max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-2 md:px-8">
        <section className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
            <FlaskConical size={16} aria-hidden="true" /> Public synthetic workflow demo
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Walk through an appeal workflow.</h1>
          <p className="max-w-md text-base leading-relaxed text-slate-600">
            Start a temporary server session, choose a fixed sample record, inspect its evidence and deadline,
            then try the approval and handoff steps.
          </p>
          <ul className="space-y-3 text-sm leading-relaxed text-slate-600">
            <li><strong className="text-slate-900">Provider:</strong> review and approve an eligible packet version.</li>
            <li><strong className="text-slate-900">Biller:</strong> run cases and coordinate handoff and synthetic receipts; no clinical approval.</li>
            <li><strong className="text-slate-900">Fixed fixtures only:</strong> no uploads, real chart entry, or payer delivery.</li>
          </ul>
        </section>

        <section aria-labelledby="demo-start-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 id="demo-start-title" className="text-xl font-bold">Start your demo sandbox</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            No account or password is needed. The server issues a short-lived session for this demo.
            Its token stays only in this tab’s memory; refreshing leaves the session view.
          </p>
          <form onSubmit={start} className="mt-6 space-y-5">
            <div>
              <label htmlFor="demo-role" className="mb-2 block text-sm font-semibold">Demo role</label>
              <select
                id="demo-role"
                value={role}
                onChange={(event) => setRole(event.target.value as 'PROVIDER' | 'BILLER')}
                disabled={pending}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="PROVIDER">Provider — review and approve</option>
                <option value="BILLER">Biller — coordinate and record handoff</option>
              </select>
            </div>
            {visibleError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-relaxed text-rose-800">{demoErrorText(visibleError)}</p>}
            <button type="submit" disabled={pending} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
              {pending ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
              {pending ? 'Starting server session…' : 'Start synthetic demo'}
            </button>
          </form>
          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            Server limits and expiry apply. Reset creates a fresh isolated context. This demonstration does not establish clinical accuracy, coverage, or compliance.
          </p>
        </section>
      </main>
    </div>
  );
};

export default DemoGateway;
