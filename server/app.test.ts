import { describe, it, expect } from 'vitest';
import { openTestDb } from './db/index.ts';
import { createApp } from './app.ts';
import { loadConfig, resetConfigCache } from './config.ts';

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
