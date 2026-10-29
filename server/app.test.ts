import { describe, it, expect } from 'vitest';
import { openTestDb } from './db/index.ts';
import { createApp } from './app.ts';
import { loadConfig, resetConfigCache } from './config.ts';
import { hashToken } from './auth/password.ts';
import { runStartupRecovery } from './jobs/startupRecovery.ts';

const testApp = () => {
  resetConfigCache();
  const config = loadConfig({ clientDistPath: '/nonexistent-dist', isTest: true });
  return createApp(config, openTestDb());
};

/** Run the app on an ephemeral port for one test body. */
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
    ['GET', '/api/cases/case_x/handoff'],
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

describe('current handoff download safety', () => {
  it('withholds an old artifact through revision/re-approval, then serves only the regenerated version', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const firstCase = ctx.services.cases.getCase('case_den_001')!;
      await req(base, 'POST', '/api/cases/case_den_001/approve', {
        token, body: { packetVersion: firstCase.packetVersion },
      });
      const first = await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });
      const current = await req(base, 'GET', '/api/cases/case_den_001/handoff', { token });
      expect(current.status).toBe(200);
      expect(current.body).toEqual(first.body.package);

      ctx.services.cases.updateCase(firstCase.id, {
        state: 'packet_ready',
        packet: { ...firstCase.packet!, draftLetter: `${firstCase.packet!.draftLetter}\nSynthetic reviewed revision.` },
      });
      const revised = ctx.services.cases.getCase(firstCase.id)!;
      expect(revised.packetVersion).toBe(firstCase.packetVersion + 1);
      expect(revised.approvedVersion).toBeNull();
      const stale = await req(base, 'GET', '/api/cases/case_den_001/handoff', { token });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('handoff_stale');
      expect(stale.body.action).toMatch(/approve.*generate/i);
      expect(stale.body).not.toHaveProperty('letter');
      expect(ctx.services.cases.getSubmissionReceipt(firstCase.id)).toBeNull();

      await req(base, 'POST', '/api/cases/case_den_001/approve', {
        token, body: { packetVersion: revised.packetVersion },
      });
      // Re-approval alone must not release the artifact generated from v1.
      expect((await req(base, 'GET', '/api/cases/case_den_001/handoff', { token })).status).toBe(409);
      const regenerated = await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });
      expect(regenerated.status).toBe(200);
      const replacement = await req(base, 'GET', '/api/cases/case_den_001/handoff', { token });
      expect(replacement.status).toBe(200);
      expect(replacement.body.packetVersion).toBe(revised.packetVersion);
      expect(replacement.body.letter).toContain('Synthetic reviewed revision.');
      expect(replacement.body.letter).not.toBe(first.body.package.letter);

      // Recording a receipt does not invalidate the current approved artifact.
      expect((await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token, body: { channel: 'test_portal', confirmationNumber: 'SYNTHETIC-CURRENT' },
      })).status).toBe(200);
      expect((await req(base, 'GET', '/api/cases/case_den_001/handoff', { token })).body).toEqual(replacement.body);
    });
  });

  it('blocks both download and receipt recording when same-version approval was revoked', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const c = ctx.services.cases.getCase('case_den_001')!;
      await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: c.packetVersion } });
      await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });
      // There is no public revocation API. Model the invariant directly in the
      // disposable database without introducing a new workflow/state transition.
      ctx.db.prepare('UPDATE appeal_cases SET approved_version=NULL, approved_by=NULL, approved_at=NULL WHERE id=?').run(c.id);

      const download = await req(base, 'GET', '/api/cases/case_den_001/handoff', { token });
      expect(download.status).toBe(409);
      expect(download.body.code).toBe('handoff_approval_invalid');
      expect(download.body).not.toHaveProperty('letter');
      const receipt = await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token, body: { channel: 'test_portal', confirmationNumber: 'SYNTHETIC-REVOKED' },
      });
      expect(receipt.status).toBe(409);
      expect(receipt.body.error).toMatch(/approval.*revoked/i);
      expect(ctx.services.cases.getSubmissionReceipt(c.id)).toBeNull();
      expect(ctx.services.audit.forCase(c.id).filter((a) => a.action === 'submitted')).toHaveLength(0);
    });
  });

  it('rejects an artifact whose embedded version disagrees with its current case', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const c = ctx.services.cases.getCase('case_den_001')!;
      await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: c.packetVersion } });
      const handoff = await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });
      ctx.services.cases.saveHandoff(c.id, { ...handoff.body.package, packetVersion: c.packetVersion - 1 }, c.packetVersion);
      const download = await req(base, 'GET', '/api/cases/case_den_001/handoff', { token });
      expect(download.status).toBe(409);
      expect(download.body.code).toBe('handoff_stale');
      expect(download.body).not.toHaveProperty('letter');
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
      expect(ctx.services.cases.getSubmissionReceipt(c.id)).toBeNull();
      expect(ctx.services.audit.forCase(c.id).filter((a) => a.action === 'submitted')).toHaveLength(0);
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

describe('PDF-only retry recovery & durable retry-job tracking (R2/R3/R4)', () => {
  // --- R2: PDF-only retry succeeds (the core bug) ---
  it('retries a PDF-sourced held case (previously 409 "not discoverable"); works via persisted state', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      // PDF intake with a denialId that is NOT in the EHR fixtures. With a
      // missing date it lands in needs_review (held). A pre-change retry would
      // 409 "no longer discoverable" because discoverDenials() never yields it.
      const intake = await req(base, 'POST', '/api/intake/pdf', {
        token,
        body: {
          text: 'Anthem EOB. CARC 50. Remark code N115. Not medically necessary.',
          claimId: 'clm_001',
          carrier: 'Anthem',
          denialId: 'den_pdf_retry',
          externalRef: 'pdf-retry-1',
        },
      });
      expect(intake.status).toBe(200);
      const before = await req(base, 'GET', '/api/cases/case_den_pdf_retry', { token });
      expect(before.body.case.state).toBe('needs_review');

      const retry = await req(base, 'POST', '/api/cases/case_den_pdf_retry/retry', { token, body: {} });
      expect(retry.status).toBe(200);
      // Durable contract: a real job id + the ACTUAL re-run state (not hardcoded).
      expect(retry.body.jobId).toBeTruthy();
      expect(retry.body.jobStatus).not.toBeNull();
      // Re-run of a no-date case deterministically holds in needs_review again.
      expect(retry.body.state).toBe('needs_review');

      // Persisted state: source provenance preserved as 'pdf', no duplicate rows.
      const denRow = ctx.db.prepare('SELECT source FROM denials WHERE id=?').get('den_pdf_retry') as any;
      expect(denRow.source).toBe('pdf');
      const denCount = (ctx.db.prepare('SELECT COUNT(*) c FROM denials WHERE id=?').get('den_pdf_retry') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_pdf_retry') as any).c;
      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_pdf_retry') as any).c;
      expect(denCount).toBe(1);
      expect(caseCount).toBe(1);
      expect(jobCount).toBe(1);
    });
  });

  // --- R2: missing-evidence blocker ---
  it('returns an explicit 409 blocker when the persisted denial row is absent', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      // Create a held case, then delete its denial row to simulate missing evidence.
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });
      expect((await req(base, 'GET', '/api/cases/case_den_003', { token })).body.case.state).toBe('needs_more_data');
      // Simulate a missing persisted denial row (data loss) while keeping the
      // referencing case. Toggle FK enforcement only for this synthetic deletion.
      ctx.db.exec('PRAGMA foreign_keys = OFF;');
      ctx.db.prepare('DELETE FROM denials WHERE id=?').run('den_003');
      ctx.db.exec('PRAGMA foreign_keys = ON;');

      // The initial run created the single denial:den_003 job; capture its state.
      const jobBefore = ctx.db.prepare("SELECT status, attempts FROM jobs WHERE idempotency_key=?").get('denial:den_003') as any;

      const retry = await req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} });
      expect(retry.status).toBe(409);
      expect(retry.body.missing).toContain('denial_row');
      // No NEW job enqueued and the existing job is untouched (not re-queued),
      // and no state advance.
      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_003') as any).c;
      const jobAfter = ctx.db.prepare("SELECT status, attempts FROM jobs WHERE idempotency_key=?").get('denial:den_003') as any;
      expect(jobCount).toBe(1);
      expect(jobAfter.status).toBe(jobBefore.status);
      expect(jobAfter.attempts).toBe(jobBefore.attempts);
      expect((await req(base, 'GET', '/api/cases/case_den_003', { token })).body.case.state).toBe('needs_more_data');
    });
  });

  it('returns a 422 naming the missing normalized field (no CARC/RARC codes)', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      const cases = ctx.services.cases;
      cases.upsertPatient({ id: 'pat_mc', mrn: 'm', name: 'Missing Codes' });
      cases.upsertClaim({ id: 'clm_mc', patientId: 'pat_mc', carrier: 'Anthem', cptCodes: ['72148'], dateOfService: '2026-09-10' });
      cases.insertDenial({
        id: 'den_nocodes',
        claimId: 'clm_mc',
        source: 'api',
        carrier: 'Anthem',
        carcCodes: [],
        rarcCodes: [],
        denialDate: '2026-09-15',
        externalRef: 'NOCODES-1',
      });
      cases.createCase('case_den_nocodes', 'den_nocodes', 'failed');

      const retry = await req(base, 'POST', '/api/cases/case_den_nocodes/retry', { token, body: {} });
      expect(retry.status).toBe(422);
      expect(retry.body.missing).toContain('carcCodes_or_rarcCodes');
      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_nocodes') as any).c;
      expect(jobCount).toBe(0);
    });
  });

  // --- Held-state gate: non-retryable states still 409 with state-specific message ---
  it('still 409s a submitted (non-retryable) case with the state-specific message', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      // Drive to submitted via the real pipeline, then confirm retry is refused.
      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const v = detail.body.case.packetVersion;
      await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: v } });
      await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });
      await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token,
        body: { channel: 'fax', confirmationNumber: 'CONF-1' },
      });
      const retry = await req(base, 'POST', '/api/cases/case_den_001/retry', { token, body: {} });
      expect(retry.status).toBe(409);
      expect(retry.body.error).toMatch(/cannot retry from state submitted/);
    });
  });

  // --- R3: idempotent repeated retries, no duplicate rows/jobs ---
  it('is idempotent across repeated sequential retries (no duplicate case/denial/packet/job)', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });

      await req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} });
      await req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} });

      const denCount = (ctx.db.prepare('SELECT COUNT(*) c FROM denials WHERE id=?').get('den_003') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_003') as any).c;
      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_003') as any).c;
      expect(denCount).toBe(1);
      expect(caseCount).toBe(1);
      expect(jobCount).toBe(1);
    });
  });

  // --- R3: concurrent/overlapping retries create no duplicate jobs/cases ---
  it('reconciles concurrent/overlapping retries to a single job and case', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });

      const [a, b] = await Promise.all([
        req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} }),
        req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      // Both requests reconcile to the SAME durable job.
      expect(a.body.jobId).toBe(b.body.jobId);

      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_003') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_003') as any).c;
      const denCount = (ctx.db.prepare('SELECT COUNT(*) c FROM denials WHERE id=?').get('den_003') as any).c;
      expect(jobCount).toBe(1);
      expect(caseCount).toBe(1);
      expect(denCount).toBe(1);
    });
  });

  // --- R3: failure-then-retry repairs the case (EHR-sourced path still works) ---
  it('repairs a failed EHR-sourced case to a non-failed state via the durable job', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      ctx.db.prepare("UPDATE appeal_cases SET state='failed' WHERE id='case_den_001'").run();

      const retry = await req(base, 'POST', '/api/cases/case_den_001/retry', { token, body: {} });
      expect(retry.status).toBe(200);
      expect(retry.body.state).toBe('packet_ready');
      expect(retry.body.jobStatus).toBe('done');
      // Persisted state agrees with the response.
      const after = await req(base, 'GET', '/api/cases/case_den_001', { token });
      expect(after.body.case.state).toBe('packet_ready');
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_001') as any).c;
      expect(caseCount).toBe(1);
    });
  });

  // --- R3: interruption + restart recovery through the retry path ---
  it('recovers an interrupted retry job via recoverInterrupted() + drain with no duplicates', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      ctx.db.prepare("UPDATE appeal_cases SET state='failed' WHERE id='case_den_001'").run();

      // Enqueue a retry job but force it to 'running' before it is drained, then
      // recover + drain exactly like a crash/restart.
      const jobId = ctx.services.jobs.enqueueProcessDenial(
        ctx.services.cases.getDenial('den_001')!,
        'den_001',
      );
      ctx.db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(jobId);

      const recovered = ctx.services.jobs.recoverInterrupted();
      expect(recovered).toBe(1);
      await ctx.services.jobs.drain();

      const job = ctx.services.jobs.getJob(jobId);
      expect(job?.status).toBe('done');
      const after = await req(base, 'GET', '/api/cases/case_den_001', { token });
      expect(after.body.case.state).toBe('packet_ready');
      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_001') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_001') as any).c;
      expect(jobCount).toBe(1);
      expect(caseCount).toBe(1);
    });
  });

  // --- R4: authorization ---
  it('rejects an unauthenticated retry (401)', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const r = await req(base, 'POST', '/api/cases/case_den_001/retry', { body: {} });
      expect(r.status).toBe(401);
    });
  });

  it('rejects a retry from a role lacking run_pipeline (403)', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });

      // A role outside ROLE_PERMISSIONS has no run_pipeline permission.
      ctx.db
        .prepare('INSERT INTO users (id, username, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('usr_noperm', 'noperm', 'No Perms', 'GUEST', 'x', new Date().toISOString());
      ctx.db
        .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(hashToken('noperm-token'), 'usr_noperm', new Date().toISOString(), new Date(Date.now() + 3_600_000).toISOString());

      const r = await req(base, 'POST', '/api/cases/case_den_003/retry', { token: 'noperm-token', body: {} });
      expect(r.status).toBe(403);
    });
  });

  // --- R4: stale approval/handoff protection holds after a packet-regenerating change ---
  it('invalidates a prior approval and 409s a stale-handoff submit after the packet hash changes', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      const v = detail.body.case.packetVersion;
      await req(base, 'POST', '/api/cases/case_den_001/approve', { token, body: { packetVersion: v } });
      await req(base, 'POST', '/api/cases/case_den_001/handoff', { token, body: {} });

      // Simulate a packet-regenerating retry: a changed packet hash bumps the
      // version and clears the prior approval (never auto-approve/auto-submit).
      const c = ctx.services.cases.getCase('case_den_001')!;
      ctx.services.cases.updateCase('case_den_001', {
        packet: { ...c.packet!, draftLetter: `${c.packet!.draftLetter} (regenerated)` },
      });
      const afterRow = ctx.services.cases.getCase('case_den_001')!;
      expect(afterRow.approvedVersion).toBeNull();
      expect(afterRow.packetVersion).toBe(v + 1);

      // The stale handoff can no longer be submitted.
      const stale = await req(base, 'POST', '/api/cases/case_den_001/submit', {
        token,
        body: { channel: 'fax', confirmationNumber: 'CONF-STALE' },
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toMatch(/stale/i);
    });
  });
});

describe('retry backend contract: audit, actionable bodies, latestJob, recovery (FEAT-001)', () => {
  it('409 missing-denial-row body carries code/missing/action and keeps 409 status', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });
      expect((await req(base, 'GET', '/api/cases/case_den_003', { token })).body.case.state).toBe('needs_more_data');

      // Delete the persisted denial row (simulated data loss) via ctx.db.
      ctx.db.exec('PRAGMA foreign_keys = OFF;');
      ctx.db.prepare('DELETE FROM denials WHERE id=?').run('den_003');
      ctx.db.exec('PRAGMA foreign_keys = ON;');

      const retry = await req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} });
      expect(retry.status).toBe(409);
      expect(retry.body.code).toBe('denial_row_missing');
      expect(retry.body.missing).toEqual(['denial_row']);
      expect(typeof retry.body.action).toBe('string');
      expect(retry.body.action.length).toBeGreaterThan(0);
    });
  });

  it('422 incomplete-evidence body carries code/missing/action and keeps 422 status', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      const cases = ctx.services.cases;
      cases.upsertPatient({ id: 'pat_ei', mrn: 'm', name: 'Evidence Incomplete' });
      cases.upsertClaim({ id: 'clm_ei', patientId: 'pat_ei', carrier: 'Anthem', cptCodes: ['72148'], dateOfService: '2026-09-10' });
      cases.insertDenial({
        id: 'den_ei',
        claimId: 'clm_ei',
        source: 'api',
        carrier: 'Anthem',
        carcCodes: [],
        rarcCodes: [],
        denialDate: '2026-09-15',
        externalRef: 'EI-1',
      });
      cases.createCase('case_den_ei', 'den_ei', 'failed');

      const retry = await req(base, 'POST', '/api/cases/case_den_ei/retry', { token, body: {} });
      expect(retry.status).toBe(422);
      expect(retry.body.code).toBe('evidence_incomplete');
      expect(retry.body.missing).toContain('carcCodes_or_rarcCodes');
      expect(typeof retry.body.action).toBe('string');
      expect(retry.body.action).toContain('carcCodes_or_rarcCodes');
    });
  });

  it('writes a single retry_requested audit entry with a server-derived actor; processing steps stay system', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });

      // Spoof an actor in the body — it must be ignored (server-derived only).
      await req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: { actor: 'SPOOFED' } });

      const after = await req(base, 'GET', '/api/cases/case_den_003', { token });
      const retryEntries = after.body.audit.filter((a: any) => a.action === 'retry_requested');
      expect(retryEntries.length).toBe(1);
      expect(retryEntries[0].actor).toMatch(/^usr_/);
      expect(retryEntries[0].actor).not.toBe('SPOOFED');

      // Every orchestrator processing-step audit entry remains attributed to
      // 'system' — only the human-initiated retry_requested carries a user id.
      const humanActions = new Set(['retry_requested', 'approved', 'handoff_generated', 'submitted']);
      const processing = after.body.audit.filter((a: any) => !humanActions.has(a.action));
      expect(processing.length).toBeGreaterThan(0);
      for (const entry of processing) expect(entry.actor).toBe('system');
    });
  });

  it('GET /api/cases/:id exposes an additive latestJob field after the initial run', async () => {
    const { app } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });

      const initial = await req(base, 'GET', '/api/cases/case_den_001', { token });
      // Existing fields preserved + additive latestJob present.
      expect(initial.body.case).toBeTruthy();
      expect(Array.isArray(initial.body.audit)).toBe(true);
      expect(initial.body.latestJob).not.toBeNull();
      expect(initial.body.latestJob.type).toBe('process_denial');
      expect(initial.body.latestJob).toHaveProperty('id');
      expect(initial.body.latestJob).toHaveProperty('status');
      expect(initial.body.latestJob).toHaveProperty('attempts');
      expect(initial.body.latestJob).toHaveProperty('lastError');
      expect(initial.body.latestJob).toHaveProperty('updatedAt');
    });
  });

  it('case detail reads durable job metadata without decoding the stored narrative payload', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      const job = ctx.services.jobs.getLatestJobForDenial('den_001')!;
      // Metadata remains readable even if a completed job's payload cannot be
      // decrypted/parsed. This does not change queue execution/recovery behavior.
      ctx.db.prepare('UPDATE jobs SET payload_enc=?, payload=? WHERE id=?').run(
        'enc:v1:unreadable-payload', 'not-json', job.id,
      );
      const detail = await req(base, 'GET', '/api/cases/case_den_001', { token });
      expect(detail.status).toBe(200);
      expect(detail.body.latestJob).toEqual({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError,
        updatedAt: job.updatedAt,
      });
      expect(detail.body.latestJob).not.toHaveProperty('payload');
      expect(ctx.services.cases.getCase('case_den_001')?.state).toBe('packet_ready');
    });
  });

  it('FRESH GET after a retry reflects durable job status/attempts', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      ctx.db.prepare("UPDATE appeal_cases SET state='failed' WHERE id='case_den_001'").run();

      const retry = await req(base, 'POST', '/api/cases/case_den_001/retry', { token, body: {} });
      expect(retry.status).toBe(200);

      const fresh = await req(base, 'GET', '/api/cases/case_den_001', { token });
      expect(fresh.body.latestJob).not.toBeNull();
      expect(fresh.body.latestJob.status).toBe(retry.body.jobStatus);
      expect(fresh.body.latestJob.status).toBe('done');
      expect(fresh.body.latestJob.attempts).toBe(retry.body.attempts);
      expect(fresh.body.latestJob.id).toBe(retry.body.jobId);
    });
  });

  it('a BILLER (coordinator) retry succeeds (200) while a no-token retry is 401', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const prov = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token: prov, body: {} });
      ctx.db.prepare("UPDATE appeal_cases SET state='failed' WHERE id='case_den_001'").run();

      // No token -> 401.
      const noAuth = await req(base, 'POST', '/api/cases/case_den_001/retry', { body: {} });
      expect(noAuth.status).toBe(401);

      // BILLER has run_pipeline -> 200.
      const coord = await loginAs(base, COORDINATOR.u, COORDINATOR.p);
      const retry = await req(base, 'POST', '/api/cases/case_den_001/retry', { token: coord, body: {} });
      expect(retry.status).toBe(200);
    });
  });

  it('concurrent/repeated retry for one case yields exactly one job row and one appeal_cases row', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_003', { token, body: {} });

      await Promise.all([
        req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} }),
        req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} }),
      ]);
      await req(base, 'POST', '/api/cases/case_den_003/retry', { token, body: {} });

      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_003') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_003') as any).c;
      expect(jobCount).toBe(1);
      expect(caseCount).toBe(1);
    });
  });

  it('runStartupRecovery against createApp services recovers an interrupted job with no duplicates', async () => {
    const { app, ctx } = testApp();
    await withServer(app, async (base) => {
      const token = await loginAs(base, PROVIDER.u, PROVIDER.p);
      await req(base, 'POST', '/api/run/denial/den_001', { token, body: {} });
      ctx.db.prepare("UPDATE appeal_cases SET state='failed' WHERE id='case_den_001'").run();

      // Enqueue a retry job, force it 'running' (interrupted), then recover at boot.
      const jobId = ctx.services.jobs.enqueueProcessDenial(ctx.services.cases.getDenial('den_001')!, 'den_001');
      ctx.db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(jobId);

      const { recovered } = await runStartupRecovery(ctx.services);
      expect(recovered).toBe(1);

      expect(ctx.services.jobs.getJob(jobId)?.status).toBe('done');
      const after = await req(base, 'GET', '/api/cases/case_den_001', { token });
      expect(after.body.case.state).toBe('packet_ready');
      const jobCount = (ctx.db.prepare("SELECT COUNT(*) c FROM jobs WHERE idempotency_key=?").get('denial:den_001') as any).c;
      const caseCount = (ctx.db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_001') as any).c;
      expect(jobCount).toBe(1);
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
