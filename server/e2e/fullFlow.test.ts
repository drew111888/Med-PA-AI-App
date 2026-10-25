/**
 * Full-flow end-to-end regression (durable regression asset).
 *
 * Exercises the entire journey over the real HTTP API against synthetic data:
 *   poll (discover) -> classify -> gather -> gate -> reason -> packet
 *   -> approve -> submission handoff
 * plus deadline surfacing and audit-trail completeness.
 *
 * This is the oracle for the critical user journey. If any pipeline stage
 * regresses, this test fails.
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

async function call(app: any, method: string, path: string, body?: unknown) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as any).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

describe('full denial -> packet -> approval -> submission journey', () => {
  it('runs the complete pipeline for a medical-necessity denial', async () => {
    const { app } = testApp();

    // 1. Discover + process all denials (scheduled-style poll).
    const poll = await call(app, 'POST', '/api/run/poll', {});
    expect(poll.status).toBe(200);
    expect(poll.body.cases).toBe(3);

    // 2. The medical-necessity case is packet_ready.
    const detail = await call(app, 'GET', '/api/cases/case_den_001');
    expect(detail.body.case.state).toBe('packet_ready');
    expect(detail.body.case.classification.category).toBe('medical_necessity');
    expect(detail.body.case.classification.appealDeadline).toBe('2026-11-30');
    expect(detail.body.case.gate.decision).toBe('appeal_ready');
    expect(detail.body.case.packet.evidence.length).toBeGreaterThan(0);
    expect(detail.body.case.packet.aiValidationPassed).toBe(true);

    // 3. Audit trail records each pipeline step.
    const actions = detail.body.audit.map((a: any) => a.action);
    for (const step of ['intake', 'classified', 'gathered', 'gated', 'reasoned', 'packet_ready']) {
      expect(actions).toContain(step);
    }

    // 4. Human approval gate.
    const approve = await call(app, 'POST', '/api/cases/case_den_001/approve', { actor: 'Anthony LaVear' });
    expect(approve.body.state).toBe('approved');

    // 5. Submission handoff produces a package and marks submitted.
    const submit = await call(app, 'POST', '/api/cases/case_den_001/submit', { actor: 'Anthony LaVear' });
    expect(submit.status).toBe(200);
    expect(submit.body.state).toBe('submitted');
    expect(submit.body.package.letter.length).toBeGreaterThan(40);
    expect(submit.body.package.appealDeadline).toBe('2026-11-30');
    expect(submit.body.package.appealRoute).toBe('anthem_medical_necessity_level1');

    // 6. Deadlines surface on the summary; submitted case no longer urgent.
    const summary = await call(app, 'GET', '/api/summary');
    expect(summary.body.submitted).toBe(1);
    const den001 = summary.body.deadlines.find((d: any) => d.caseId === 'case_den_001');
    expect(den001.state).toBe('submitted');

    // 7. Full audit trail includes the human actions.
    const finalDetail = await call(app, 'GET', '/api/cases/case_den_001');
    const finalActions = finalDetail.body.audit.map((a: any) => a.action);
    expect(finalActions).toContain('approved');
    expect(finalActions).toContain('submitted');
  });

  it('a needs-more-data case stops before AI and cannot be approved', async () => {
    const { app } = testApp();
    await call(app, 'POST', '/api/run/poll', {});

    const detail = await call(app, 'GET', '/api/cases/case_den_003');
    expect(detail.body.case.state).toBe('gated');
    expect(detail.body.case.gate.decision).toBe('needs_more_data');
    expect(detail.body.case.packet).toBeNull();

    const approve = await call(app, 'POST', '/api/cases/case_den_003/approve', { actor: 'x' });
    expect(approve.status).toBe(409);
  });

  it('cannot submit a case that was not approved', async () => {
    const { app } = testApp();
    await call(app, 'POST', '/api/run/poll', {});
    const submit = await call(app, 'POST', '/api/cases/case_den_002/submit', { actor: 'x' });
    expect(submit.status).toBe(409);
  });
});
