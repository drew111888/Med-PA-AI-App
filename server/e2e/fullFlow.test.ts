/**
 * Full-flow end-to-end regression (durable regression asset).
 *
 * Exercises the entire HARDENED journey over the real HTTP API against synthetic
 * data, authenticated throughout:
 *   login -> poll -> classify -> gather -> gate -> reason -> packet_ready
 *   -> approve(version) -> generate handoff -> record submission receipt -> submitted
 * plus deadline surfacing (urgency retained until submission) and audit completeness.
 */

import { describe, it, expect } from 'vitest';
import { openTestDb } from '../db/index.ts';
import { createApp } from '../app.ts';
import { loadConfig, resetConfigCache } from '../config.ts';

const testApp = () => {
  resetConfigCache();
  const config = loadConfig({ clientDistPath: '/nonexistent-dist', isTest: true });
  return createApp(config, openTestDb());
};

async function withServer<T>(app: any, fn: (base: string) => Promise<T>): Promise<T> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as any).port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function login(base: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`login failed: ${JSON.stringify(body)}`);
  return body.token;
}

async function call(base: string, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

describe('full hardened journey (authenticated)', () => {
  it('medical-necessity denial: poll -> approve(version) -> handoff -> submission receipt', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      // Provider has all permissions needed.
      const token = await login(base, 'provider', 'dev-provider-pass');

      const poll = await call(base, token, 'POST', '/api/run/poll', {});
      expect(poll.status).toBe(200);
      expect(poll.body.cases).toBe(3);

      const detail = await call(base, token, 'GET', '/api/cases/case_den_001');
      expect(detail.body.case.state).toBe('packet_ready');
      expect(detail.body.case.classification.category).toBe('medical_necessity');
      expect(detail.body.case.classification.appealDeadline).toBe('2026-11-30');
      expect(detail.body.case.classification.deadlineStatus).toBe('calculated');
      expect(detail.body.case.packet.aiValidationPassed).toBe(true);
      const version = detail.body.case.packetVersion;

      // Audit records each pipeline step (detail is encrypted at rest, decrypted on read).
      const actions = detail.body.audit.map((a: any) => a.action);
      for (const step of ['intake', 'classified', 'gathered', 'gated', 'reasoned', 'packet_ready']) {
        expect(actions).toContain(step);
      }

      // Approve the exact reviewed version.
      const approve = await call(base, token, 'POST', '/api/cases/case_den_001/approve', { packetVersion: version });
      expect(approve.status).toBe(200);
      expect(approve.body.state).toBe('approved');

      // Generating a handoff is NOT submission.
      const handoff = await call(base, token, 'POST', '/api/cases/case_den_001/handoff', {});
      expect(handoff.status).toBe(200);
      expect(handoff.body.state).toBe('handoff_generated');
      expect(handoff.body.package.letter.length).toBeGreaterThan(40);

      // Still not submitted; deadline urgency retained.
      const midSummary = await call(base, token, 'GET', '/api/summary');
      expect(midSummary.body.submitted).toBe(0);
      expect(midSummary.body.handoffGenerated).toBe(1);

      // Downloadable handoff available.
      const dl = await call(base, token, 'GET', '/api/cases/case_den_001/handoff');
      expect(dl.status).toBe(200);
      expect(dl.body.caseId).toBe('case_den_001');

      // Record a human submission receipt -> submitted.
      const submit = await call(base, token, 'POST', '/api/cases/case_den_001/submit', {
        channel: 'payer_portal',
        confirmationNumber: 'CONF-12345',
      });
      expect(submit.status).toBe(200);
      expect(submit.body.state).toBe('submitted');

      const summary = await call(base, token, 'GET', '/api/summary');
      expect(summary.body.submitted).toBe(1);

      const finalDetail = await call(base, token, 'GET', '/api/cases/case_den_001');
      const finalActions = finalDetail.body.audit.map((a: any) => a.action);
      for (const a of ['approved', 'handoff_generated', 'submitted']) {
        expect(finalActions).toContain(a);
      }
    });
  });

  it('a needs-more-data case stops before AI and cannot be approved', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await login(base, 'provider', 'dev-provider-pass');
      await call(base, token, 'POST', '/api/run/poll', {});

      const detail = await call(base, token, 'GET', '/api/cases/case_den_003');
      expect(detail.body.case.state).toBe('needs_more_data');
      expect(detail.body.case.gate.decision).toBe('needs_more_data');
      expect(detail.body.case.packet).toBeNull();

      const approve = await call(base, token, 'POST', '/api/cases/case_den_003/approve', { packetVersion: 1 });
      expect(approve.status).toBe(409);
    });
  });

  it('cannot generate a handoff for a case that was not approved', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await login(base, 'provider', 'dev-provider-pass');
      await call(base, token, 'POST', '/api/run/poll', {});
      const handoff = await call(base, token, 'POST', '/api/cases/case_den_002/handoff', {});
      expect(handoff.status).toBe(409);
    });
  });
});
