import { describe, it, expect } from 'vitest';
import { openTestDb } from './db/index.ts';
import { createApp } from './app.ts';
import { loadConfig, resetConfigCache } from './config.ts';
import { hashToken } from './auth/password.ts';

const testApp = () => {
  resetConfigCache();
  const config = loadConfig({ clientDistPath: '/nonexistent-dist', isTest: true });
  return createApp(config, openTestDb());
};

/** Run the app on an ephemeral port for one test body. */
async function withServer<T>(app: any, fn: (base: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as any).port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function req(base: string, method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function loginAs(base: string, username: string, password: string): Promise<string> {
  const r = await req(base, 'POST', '/api/auth/login', { body: { username, password } });
  return r.body.token;
}

const PROVIDER = { u: 'provider', p: 'dev-provider-pass' };
const COORDINATOR = { u: 'coordinator', p: 'dev-coordinator-pass' };

describe('GET /api/health (unauthenticated)', () => {
  it('returns ok with db connected and cloud AI disabled', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const r = await req(base, 'GET', '/api/health');
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('ok');
      expect(r.body.allowCloudAi).toBe(false);
    });
  });
});

describe('authentication', () => {
  it('rejects login with bad credentials', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const r = await req(base, 'POST', '/api/auth/login', { body: { username: 'provider', password: 'wrong' } });
      expect(r.status).toBe(401);
    });
  });

  it('logs in a seeded provider and returns a token', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const r = await req(base, 'POST', '/api/auth/login', { body: { username: PROVIDER.u, password: PROVIDER.p } });
      expect(r.status).toBe(200);
      expect(typeof r.body.token).toBe('string');
      expect(r.body.user.role).toBe('PROVIDER');
    });
  });
});

describe('unauthenticated access is rejected (401)', () => {
  const protectedRoutes: Array<[string, string]> = [
    ['GET', '/api/cases'],
    ['GET', '/api/cases/case_x'],
    ['POST', '/api/run/poll'],
    ['POST', '/api/run/denial/den_001'],
    ['POST', '/api/intake/pdf'],
    ['POST', '/api/cases/case_x/approve'],
    ['POST', '/api/cases/case_x/handoff'],
    ['POST', '/api/cases/case_x/submit'],
    ['GET', '/api/summary'],
    ['GET', '/api/jobs'],
  ];
  for (const [method, path] of protectedRoutes) {
    it(`${method} ${path} -> 401 without a token`, async () => {
      const { app } = testApp();
      await withServer(app, async (base) => {
        // Only attach a body for methods that allow one.
        const opts = method === 'GET' ? {} : { body: {} };
        const r = await req(base, method, path, opts);
        expect(r.status).toBe(401);
      });
    });
  }

  it('rejects an invalid/garbage token', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const r = await req(base, 'GET', '/api/cases', { token: 'not-a-real-token' });
      expect(r.status).toBe(401);
    });
  });
});

describe('authorization (403) — coordinator cannot approve', () => {
  it('coordinator lacks approve_appeal permission', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const prov = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/poll', { token: prov, body: {} });

      const coord = await loginAs(base, COORDINATOR.u, COORDINATOR.p);
      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token: coord });
      const version = detail.body.case.packetVersion;
      const r = await req(base, 'POST', '/api/cases/case_den_001/approve', {
        token: coord,
        body: { packetVersion: version },
      });
      expect(r.status).toBe(403);
    });
  });

  it('coordinator CAN run the pipeline and record submission', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const coord = await loginAs(base, COORDINATOR.u, COORDINATOR.p);
      const r = await req(base, 'POST', '/api/run/poll', { token: coord, body: {} });
      expect(r.status).toBe(200);
    });
  });
});

describe('case pipeline + state machine', () => {
  it('runs a denial on demand to packet_ready', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      const run = await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      expect(run.status).toBe(200);
      expect(run.body.state).toBe('packet_ready');

      const list = await req(base, 'GET', '/api/cases', { token });
      const summary = list.body.cases.find((c: any) => c.denialId === 'den_001');
      expect(summary.packetReady).toBe(true);
      expect(summary.appealDeadline).toBe('2026-11-30');
      expect(summary.deadlineStatus).toBe('calculated');
    });
  });

  it('audit actor is the user id, never a client-supplied name', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const version = detail.body.case.packetVersion;
      // Attempt to spoof the actor via the body — it must be ignored.
      await req(base, 'POST', '/api/cases/case_den_001/approve', {
        token,
        body: { packetVersion: version, actor: 'SPOOFED' },
      });
      const after = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const approvedEntry = after.body.audit.find((a: any) => a.action === 'approved');
      expect(approvedEntry.actor).toMatch(/^usr_/); // a real user id
      expect(approvedEntry.actor).not.toBe('SPOOFED');
    });
  });
});

describe('approval: version + duplicate + stale', () => {
  it('rejects approval with a missing/invalid packetVersion', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const r = await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: {} });
      expect(r.status).toBe(400);
    });
  });

  it('rejects a stale approval (wrong version)', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const r = await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: 999 } });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/stale/i);
    });
  });

  it('rejects a duplicate approval of the same version', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const v = detail.body.case.packetVersion;
      const first = await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: v } });
      expect(first.status).toBe(200);
      const second = await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: v } });
      expect(second.status).toBe(409);
    });
  });
});

describe('handoff vs submission are distinct steps', () => {
  it('handoff requires approval; submission requires a handoff and a receipt', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });

      // Submit before anything -> 409.
      const earlySubmit = await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token,
        body: { channel: 'fax', confirmationNumber: 'X' },
      });
      expect(earlySubmit.status).toBe(409);

      // Approve (version), then generate handoff.
      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const v = detail.body.case.packetVersion;
      await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: v } });
      const handoff = await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });
      expect(handoff.body.state).toBe('handoff_generated');

      // Submission requires channel + confirmationNumber.
      const bad = await req(base, 'POST', '/api/cases/case_den_001/submit', { token, body: { channel: 'fax' } });
      expect(bad.status).toBe(409);

      const good = await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token,
        body: { channel: 'fax', confirmationNumber: 'CONF-9' },
      });
      expect(good.body.state).toBe('submitted');
    });
  });
});

describe('GET /api/cases/:id/receipt + hasReceipt + stale handoff (FEAT-004)', () => {
  it('returns the decrypted receipt fields after a submission is recorded', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });

      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const v = detail.body.case.packetVersion;
      expect(detail.body.case.hasReceipt).toBe(false);

      await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: v } });
      await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });
      const submit = await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token,
        body: { channel: 'fax', confirmationNumber: 'CONF-9', submittedAt: '2026-05-01T12:00:00.000Z', note: 'sent' },
      });
      expect(submit.body.state).toBe('submitted');

      const receipt = await req(base, 'GET', '/api/cases/case_den_001/receipt', { token });
      expect(receipt.status).toBe(200);
      expect(receipt.body.channel).toBe('fax');
      expect(receipt.body.confirmationNumber).toBe('CONF-9');
      expect(receipt.body.submittedAt).toBe('2026-05-01T12:00:00.000Z');
      expect(receipt.body.note).toBe('sent');
      expect(receipt.body.recordedBy).toMatch(/^usr_/);

      // The case detail now exposes hasReceipt true.
      const after = await req(base, 'GET', '/api/cases/case_den_001', { token });
      expect(after.body.case.hasReceipt).toBe(true);
    });
  });

  it('returns 404 when no receipt exists', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const r = await req(base, 'GET', '/api/cases/case_den_001/receipt', { token });
      expect(r.status).toBe(404);
      expect(r.body.error).toMatch(/no submission receipt/i);
    });
  });

  it('requires authentication (401) and the view_cases permission (403)', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      // 401 without a token.
      const noAuth = await req(base, 'GET', '/api/cases/case_den_001/receipt');
      expect(noAuth.status).toBe(401);

      // 403 for a user whose role lacks view_cases. No seeded role lacks it, so
      // insert a user with a role outside ROLE_PERMISSIONS to drive the guard.
      ctx.db
        .prepare('INSERT INTO users (id, username, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('usr_norole', 'norole', 'No Perms', 'GUEST', 'x', new Date().toISOString());
      ctx.db
        .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(hashToken('norole-token'), 'usr_norole', new Date().toISOString(), new Date(Date.now() + 3_600_000).toISOString());

      const forbidden = await req(base, 'GET', '/api/cases/case_den_001/receipt', { token: 'norole-token' });
      expect(forbidden.status).toBe(403);
    });
  });

  it('rejects a stale handoff (packet changed after handoff) with 409', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });

      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const v = detail.body.case.packetVersion;
      await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: v } });
      await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });

      // Mutate the packet after the handoff was generated -> packet version bumps,
      // handoff_version no longer matches the current packet version.
      const c = ctx.services.cases.getCase('case_den_001')!;
      ctx.services.cases.updateCase('case_den_001', {
        packet: { ...c.packet!, draftLetter: `${c.packet!.draftLetter} (edited)` },
      });

      const stale = await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token,
        body: { channel: 'fax', confirmationNumber: 'CONF-STALE' },
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toMatch(/stale/i);
    });
  });
});

describe('POST /api/cases/:id/retry (FEAT-002)', () => {
  it('requires run_pipeline and 404s for a missing case', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      const r = await req(base, 'POST', '/api/cases/case_does_not_exist/retry', { token, body: {} });
      expect(r.status).toBe(404);
    });
  });

  it('409s when the case is not in a resumable/held state', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      // den_001 -> packet_ready (not retryable).
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const r = await req(base, 'POST', '/api/cases/case_den_001/retry', { token, body: {} });
      expect(r.status).toBe(409);
    });
  });

  it('retries a needs_more_data case with no duplicate denial/case rows', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      // den_003 lands in needs_more_data (sparse chart).
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });
      const before = await req(base, 'GET', '/api/cases/case_den_003', { token });
      expect(before.body.case.state).toBe('needs_more_data');

      const retry = await req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} });
      expect(retry.status).toBe(200);
      // Deterministic re-run of a sparse chart lands in needs_more_data again,
      // but it did not throw and repaired/updated the same case.
      expect(retry.body.state).toBe('needs_more_data');

      // Exactly one denial row and one appeal_case row for this denial.
      const denialCount = (ctx.db.prepare('SELECT COUNT(*) c FROM denials WHERE id=?').get('den_003') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_003') as any).c;
      expect(denialCount).toBe(1);
      expect(caseCount).toBe(1);
    });
  });

  it('retries a failed case and repairs it to a non-failed state with no duplicates', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      // Produce a real case, then force it to failed to simulate a broken run.
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      ctx.db.prepare("UPDATE appeal_cases SET state='failed' WHERE id='case_den_001'").run();

      const retry = await req(base, 'POST', '/api/cases/case_den_001/retry', { token, body: {} });
      expect(retry.status).toBe(200);
      expect(retry.body.state).not.toBe('failed');
      expect(retry.body.state).toBe('packet_ready');

      const denialCount = (ctx.db.prepare('SELECT COUNT(*) c FROM denials WHERE id=?').get('den_001') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_001') as any).c;
      expect(denialCount).toBe(1);
      expect(caseCount).toBe(1);
    });
  });
});

describe('GET /api/summary keeps failed-but-unsubmitted cases on the deadline radar (FEAT-003)', () => {
  it('a failed case with a known near deadline is urgent; with an unknown deadline is unknown', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      const cases = ctx.services.cases;

      // Minimal rows so appeal_case FKs resolve.
      cases.upsertPatient({ id: 'pat_f', mrn: 'm', name: 'Failed Case Patient' });
      cases.upsertClaim({
        id: 'clm_f',
        patientId: 'pat_f',
        carrier: 'Anthem',
        cptCodes: ['72148'],
        dateOfService: '2026-09-10',
      });

      // Known near deadline: 7 days from now.
      const near = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      cases.insertDenial({
        id: 'den_fail_known',
        claimId: 'clm_f',
        source: 'api',
        carrier: 'Anthem',
        carcCodes: ['50'],
        rarcCodes: ['N115'],
        denialDate: '2026-09-15',
        externalRef: 'FAIL-KNOWN',
      });
      cases.createCase('case_fail_known', 'den_fail_known', 'intake');
      cases.updateCase('case_fail_known', {
        state: 'failed',
        classification: {
          category: 'medical_necessity',
          appealable: true,
          rationale: 'synthetic',
          recognizedCodes: ['50'],
          unrecognizedCodes: [],
          appealDeadline: near,
          deadlineStatus: 'calculated',
          appealWindowDays: 60,
          denialDate: '2026-09-15',
          deadlineBlockers: [],
          appealRoute: 'route',
          policyId: 'pol_001',
        },
      });

      // Unknown deadline: missing denial date.
      cases.insertDenial({
        id: 'den_fail_unknown',
        claimId: 'clm_f',
        source: 'api',
        carrier: 'Anthem',
        carcCodes: ['50'],
        rarcCodes: ['N115'],
        denialDate: null,
        externalRef: 'FAIL-UNKNOWN',
      });
      cases.createCase('case_fail_unknown', 'den_fail_unknown', 'intake');
      cases.updateCase('case_fail_unknown', {
        state: 'failed',
        classification: {
          category: 'medical_necessity',
          appealable: true,
          rationale: 'synthetic',
          recognizedCodes: ['50'],
          unrecognizedCodes: [],
          appealDeadline: null,
          deadlineStatus: 'unknown_missing_date',
          appealWindowDays: 60,
          denialDate: null,
          deadlineBlockers: ['denial date'],
          appealRoute: 'route',
          policyId: 'pol_001',
        },
      });

      const summary = await req(base, 'GET', '/api/summary', { token });
      expect(summary.status).toBe(200);

      const urgentIds = summary.body.urgentDeadlines.map((d: any) => d.caseId);
      const unknownIds = summary.body.unknownDeadlines.map((d: any) => d.caseId);
      expect(urgentIds).toContain('case_fail_known');
      expect(unknownIds).toContain('case_fail_unknown');
    });
  });
});

describe('PDF intake with a missing date surfaces UNKNOWN deadline (never fabricated)', () => {
  it('produces needs_review (incomplete) with deadlineStatus unknown_missing_date', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      // No date in the text; carrier Anthem + CARC 50.
      const res = await req(base, 'POST', '/api/intake/pdf', {
        token,
        body: {
          text: 'Anthem EOB. CARC 50. Remark code N115. Not medically necessary.',
          claimId: 'clm_001',
          carrier: 'Anthem',
          denialId: 'den_pdf_nodate',
          externalRef: 'nodate-1',
        },
      });
      expect(res.status).toBe(200);
      const detail = await req(base, 'GET', '/api/cases/case_den_pdf_nodate', { token });
      expect(detail.body.case.classification.deadlineStatus).toBe('unknown_missing_date');
      expect(detail.body.case.classification.appealDeadline).toBeNull();
      expect(detail.body.case.classification.deadlineBlockers).toContain('denial date');
      // Unknown deadline -> held for review BEFORE any AI call, NOT packet_ready.
      expect(detail.body.case.state).toBe('needs_review');
      expect(detail.body.case.packet).toBeNull();

      // And it cannot be approved.
      const approve = await req(base, 'POST', '/api/cases/case_den_pdf_nodate/approve', {
        token,
        body: { packetVersion: detail.body.case.packetVersion },
      });
      expect(approve.status).toBe(409);
    });
  });
});
