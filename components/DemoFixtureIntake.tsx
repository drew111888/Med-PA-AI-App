import React, { useState } from 'react';
import { api, isOk, type ApiError, type DemoIntakeResult } from '../services/apiClient.ts';
import { useSession } from '../services/sessionContext.tsx';
import { demoErrorText } from './DemoGateway.tsx';

const DemoFixtureIntake: React.FC<{ onCompleted: (result: DemoIntakeResult) => Promise<void> }> = ({ onCompleted }) => {
  const { demoSession, refreshDemoSession } = useSession();
  const [fixtureId, setFixtureId] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DemoIntakeResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const fixtures = demoSession?.fixtures ?? [];
  const selected = fixtures.find((fixture) => fixture.id === fixtureId) ?? fixtures[0];
  const intake = async () => {
    if (!selected || pending) return;
    setPending(true); setError(null); setResult(null);
    const response = await api.demoIntake(selected.id);
    if (isOk(response)) {
      setResult(response.data);
      await onCompleted(response.data);
      await refreshDemoSession();
    } else setError(response);
    setPending(false);
  };
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5 space-y-3" aria-labelledby="fixture-intake-title">
      <h3 id="fixture-intake-title" className="font-bold text-slate-900">Try a fixed synthetic intake</h3>
      <p className="text-sm text-slate-600">This calls the actual backend pipeline with a server-owned sample. No text, patient information, credentials, or documents can be uploaded.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 min-w-0 text-sm font-semibold">Sample record
          <select className="block w-full min-h-11 mt-1 p-3 rounded-xl border border-slate-300 bg-white" value={selected?.id ?? ''} onChange={(event) => setFixtureId(event.target.value)} disabled={pending || !fixtures.length}>
            {fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.label}</option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-xl px-5 py-3 bg-blue-700 text-white font-bold self-end w-full sm:w-auto disabled:opacity-50" onClick={() => void intake()} disabled={pending || !selected}>{pending ? 'Running actual intake…' : 'Run sample intake'}</button>
      </div>
      {selected && <p className="text-sm text-slate-600">{selected.description}</p>}
      {selected?.id === 'unknown-date' && <p className="text-sm text-amber-800">This sample demonstrates an unknown deadline. Retry is unavailable for this fixed scenario; choose the ready-for-review sample to test approval.</p>}
      {result && <p role="status" className="text-sm font-semibold text-emerald-800">Backend result: {result.caseId ?? 'no case returned'} · {result.state?.replace(/_/g, ' ') ?? 'no state returned'}. Cases and workflow status refreshed.</p>}
      {error && <p role="alert" className="text-sm text-red-800">{demoErrorText(error)}</p>}
    </section>
  );
};
export default DemoFixtureIntake;
