import { describe, it, expect } from 'vitest';
import { openTestDb } from './db/index.ts';
import { createApp } from './app.ts';
import { loadConfig, resetConfigCache } from './config.ts';

const testApp = () => {
  resetConfigCache();
  const config = loadConfig({ clientDistPath: '/nonexistent-dist', isTest: true });
  const db = openTestDb();
  return createApp(config, db);
};

describe('GET /api/health', () => {
  it('returns ok with db connected', async () => {
    const { app } = testApp();
    const response = await invoke(app, 'GET', '/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.db).toBe('connected');
    expect(response.body.ehrAdapter).toBe('synthetic');
    expect(response.body.aiProvider).toBe('local');
  });
});

describe('dev routes through ports', () => {
  it('GET /api/dev/denials lists synthetic denials', async () => {
    const { app } = testApp();
    const res = await invoke(app, 'GET', '/api/dev/denials');
    expect(res.status).toBe(200);
    expect(res.body.adapter).toBe('synthetic-ehr');
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.denials)).toBe(true);
  });

  it('GET /api/dev/patients/:id/chart returns a patient chart', async () => {
    const { app } = testApp();
    const res = await invoke(app, 'GET', '/api/dev/patients/pat_001/chart');
    expect(res.status).toBe(200);
    expect(res.body.patient.id).toBe('pat_001');
    expect(res.body.documentCount).toBeGreaterThan(0);
  });

  it('GET /api/dev/patients/:id/chart 404s for unknown patient', async () => {
    const { app } = testApp();
    const res = await invoke(app, 'GET', '/api/dev/patients/nope/chart');
    expect(res.status).toBe(404);
  });
});

describe('case + approval API (Task 9 backend)', () => {
  it('runs a denial on demand and lists the resulting case', async () => {
    const { app } = testApp();
    const run = await invoke(app, 'POST', '/api/run/denial/den_001');
    expect(run.status).toBe(200);
    expect(run.body.state).toBe('packet_ready');

    const list = await invoke(app, 'GET', '/api/cases');
    expect(list.status).toBe(200);
    expect(list.body.count).toBeGreaterThan(0);
    const summary = list.body.cases.find((c: any) => c.denialId === 'den_001');
    expect(summary.packetReady).toBe(true);
    expect(summary.appealDeadline).toBe('2026-11-30');
  });

  it('returns case detail with packet and audit trail', async () => {
    const { app } = testApp();
    await invoke(app, 'POST', '/api/run/denial/den_001');
    const detail = await invoke(app, 'GET', '/api/cases/case_den_001');
    expect(detail.status).toBe(200);
    expect(detail.body.case.packet.evidence.length).toBeGreaterThan(0);
    expect(detail.body.audit.length).toBeGreaterThan(0);
  });

  it('approves a packet_ready case and blocks double approval', async () => {
    const { app } = testApp();
    await invoke(app, 'POST', '/api/run/denial/den_001');
    const approve = await invoke(app, 'POST', '/api/cases/case_den_001/approve', { actor: 'tester' });
    expect(approve.status).toBe(200);
    expect(approve.body.state).toBe('approved');

    const again = await invoke(app, 'POST', '/api/cases/case_den_001/approve', { actor: 'tester' });
    expect(again.status).toBe(409);
  });

  it('poll run discovers and processes all denials', async () => {
    const { app } = testApp();
    const poll = await invoke(app, 'POST', '/api/run/poll', {});
    expect(poll.status).toBe(200);
    expect(poll.body.cases).toBeGreaterThan(0);
  });

  it('PDF-fallback intake runs the same pipeline to packet_ready', async () => {
    const { app } = testApp();
    const res = await invoke(app, 'POST', '/api/intake/pdf', {
      text: 'Anthem EOB. Denied 2026-10-01. CARC 50. Remark code N115. Not medically necessary.',
      claimId: 'clm_001',
      carrier: 'Anthem',
      denialId: 'den_pdf_http',
      externalRef: 'hash-http-1',
    });
    expect(res.status).toBe(200);
    expect(res.body.denial.source).toBe('pdf');
    expect(res.body.state).toBe('packet_ready');
  });

  it('rejects PDF intake missing required fields', async () => {
    const { app } = testApp();
    const res = await invoke(app, 'POST', '/api/intake/pdf', { text: 'x' });
    expect(res.status).toBe(400);
  });
});

/**
 * Tiny in-process invoker so we don't need supertest. Spins the app on an
 * ephemeral port, issues a fetch, then closes.
 */
async function invoke(app: any, method: string, pathName: string, body?: unknown) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const respBody = await res.json().catch(() => ({}));
    return { status: res.status, body: respBody };
  } finally {
    server.close();
  }
}
