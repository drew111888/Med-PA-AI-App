/**
 * Focused tests for the Package 3 & 4 mutation + run methods on apiClient.
 *
 * These follow the exact no-DOM, node-environment pattern of
 * tests/client/apiClient.test.ts: globalThis.fetch is stubbed and calls are
 * captured. They assert the request shape (path, method, body), the bearer
 * header on EVERY request (including the Blob download), the status->kind
 * mapping (including the reconciliation that submit-field errors arrive as
 * 409/conflict, not 400), and that NO mutation body ever contains `actor`.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  isOk,
  setAuthTokenGetter,
  setOnUnauthorized,
  type ApiResult,
} from '../../services/apiClient.ts';

type FetchCall = { url: string; init: RequestInit };

const makeResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => ({ text: async () => JSON.stringify(body) }) as unknown as Blob,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

let calls: FetchCall[];

const stubFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init: init ?? {} });
    return impl(String(url), init ?? {});
  }) as unknown as typeof fetch;
};

const errKind = <T>(r: ApiResult<T>): string | null => (isOk(r) ? null : r.kind);
const authOf = (c: FetchCall): string | undefined =>
  (c.init.headers as Record<string, string> | undefined)?.['authorization'];
const bodyOf = (c: FetchCall): string => (typeof c.init.body === 'string' ? c.init.body : '');

beforeEach(() => {
  calls = [];
  setAuthTokenGetter(() => 'tok-123');
  setOnUnauthorized(null);
});

afterEach(() => {
  setAuthTokenGetter(() => null);
  setOnUnauthorized(null);
  vi.restoreAllMocks();
});

describe('approveCase', () => {
  it('POSTs {packetVersion} only (no actor) with the bearer header and maps 200 -> ok', async () => {
    stubFetch(async () => makeResponse(200, { ok: true, state: 'approved', approvedVersion: 3 }));
    const r = await api.approveCase('case_1', 3);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.data.approvedVersion).toBe(3);
    expect(calls[0].url).toContain('/api/cases/case_1/approve');
    expect(calls[0].init.method).toBe('POST');
    const body = JSON.parse(bodyOf(calls[0]));
    expect(Object.keys(body)).toEqual(['packetVersion']);
    expect(body.packetVersion).toBe(3);
    expect(bodyOf(calls[0])).not.toContain('actor');
    expect(authOf(calls[0])).toBe('Bearer tok-123');
  });

  it('maps 409 -> conflict (stale version / duplicate approval)', async () => {
    stubFetch(async () => makeResponse(409, { error: 'stale' }));
    expect(errKind(await api.approveCase('case_1', 2))).toBe('conflict');
  });

  it('maps 400 -> badRequest (missing/invalid packetVersion)', async () => {
    stubFetch(async () => makeResponse(400, { error: 'packetVersion required' }));
    expect(errKind(await api.approveCase('case_1', 2))).toBe('badRequest');
  });

  it('maps 403 -> forbidden (e.g. BILLER cannot approve)', async () => {
    stubFetch(async () => makeResponse(403, { error: 'denied' }));
    expect(errKind(await api.approveCase('case_1', 2))).toBe('forbidden');
  });
});

describe('generateHandoff', () => {
  it('POSTs to /handoff with the bearer header, no actor, maps 200 -> ok with the package', async () => {
    stubFetch(async () =>
      makeResponse(200, { ok: true, state: 'handoff_generated', package: { caseId: 'case_1', packetVersion: 3 } }),
    );
    const r = await api.generateHandoff('case_1');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.data.package.packetVersion).toBe(3);
    expect(calls[0].url).toContain('/api/cases/case_1/handoff');
    expect(calls[0].init.method).toBe('POST');
    expect(bodyOf(calls[0])).not.toContain('actor');
    expect(authOf(calls[0])).toBe('Bearer tok-123');
  });

  it('maps 409 -> conflict (not approved / stale approval)', async () => {
    stubFetch(async () => makeResponse(409, { error: 'not approved' }));
    expect(errKind(await api.generateHandoff('case_1'))).toBe('conflict');
  });
});

describe('downloadHandoff', () => {
  it('sends Authorization: Bearer and returns a Blob on 200', async () => {
    stubFetch(async () => makeResponse(200, { caseId: 'case_1', packetVersion: 4 }));
    const r = await api.downloadHandoff('case_1');
    expect(isOk(r)).toBe(true);
    expect(calls[0].url).toContain('/api/cases/case_1/handoff');
    // No explicit method => GET.
    expect(calls[0].init.method).toBeUndefined();
    expect(authOf(calls[0])).toBe('Bearer tok-123');
    if (isOk(r)) {
      const parsed = JSON.parse(await r.data.text());
      expect(parsed.packetVersion).toBe(4);
    }
  });

  it('maps 404 -> notFound (no handoff generated)', async () => {
    stubFetch(async () => makeResponse(404, { error: 'no handoff' }));
    expect(errKind(await api.downloadHandoff('case_1'))).toBe('notFound');
  });

  it('maps a thrown network failure -> serverError with status 0', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const r = await api.downloadHandoff('case_1');
    expect(errKind(r)).toBe('serverError');
    if (!isOk(r)) expect(r.status).toBe(0);
  });

  it('invokes the session-expiry handler on 401', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    stubFetch(async () => makeResponse(401, { error: 'nope' }));
    const r = await api.downloadHandoff('case_1');
    expect(errKind(r)).toBe('unauthorized');
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });
});

describe('recordSubmission + receipt readback', () => {
  it('POSTs {channel,confirmationNumber,...} (no actor) with the bearer header and maps 200 -> ok', async () => {
    stubFetch(async () => makeResponse(200, { ok: true, caseId: 'case_1', state: 'submitted' }));
    const r = await api.recordSubmission('case_1', {
      channel: 'fax',
      confirmationNumber: 'CONF-9',
      submittedAt: '2024-01-02T03:04',
      note: 'memo',
    });
    expect(isOk(r)).toBe(true);
    expect(calls[0].url).toContain('/api/cases/case_1/submit');
    expect(calls[0].init.method).toBe('POST');
    const body = JSON.parse(bodyOf(calls[0]));
    expect(body.channel).toBe('fax');
    expect(body.confirmationNumber).toBe('CONF-9');
    expect(body.submittedAt).toBe('2024-01-02T03:04');
    expect(body.note).toBe('memo');
    expect(bodyOf(calls[0])).not.toContain('actor');
    expect(authOf(calls[0])).toBe('Bearer tok-123');
  });

  it('omits undefined optional fields from the body', async () => {
    stubFetch(async () => makeResponse(200, { ok: true, caseId: 'case_1', state: 'submitted' }));
    await api.recordSubmission('case_1', { channel: 'mail', confirmationNumber: 'C-1' });
    const body = JSON.parse(bodyOf(calls[0]));
    expect(Object.keys(body).sort()).toEqual(['channel', 'confirmationNumber']);
  });

  it('maps a missing-field server rejection to conflict (409), NOT badRequest', async () => {
    // Reconciliation: recordSubmission throws SubmissionError -> route returns 409.
    stubFetch(async () => makeResponse(409, { error: 'channel and confirmationNumber are required' }));
    const r = await api.recordSubmission('case_1', { channel: '', confirmationNumber: '' });
    expect(errKind(r)).toBe('conflict');
  });

  it('getReceipt reads back the stored confirmation with the bearer header', async () => {
    stubFetch(async () =>
      makeResponse(200, { channel: 'fax', confirmationNumber: 'CONF-9', submittedAt: 'x', note: null, recordedBy: 'u1' }),
    );
    const r = await api.getReceipt('case_1');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.data.confirmationNumber).toBe('CONF-9');
    expect(authOf(calls[0])).toBe('Bearer tok-123');
  });
});

describe('retryCase', () => {
  it('POSTs to /retry (no actor), carries the bearer header, maps 200 -> ok', async () => {
    stubFetch(async () =>
      makeResponse(200, {
        caseId: 'case_1',
        state: 'packet_ready',
        jobId: 'job_abc',
        jobStatus: 'done',
        attempts: 1,
        packetReady: true,
      }),
    );
    const r = await api.retryCase('case_1');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.data.state).toBe('packet_ready');
      // Durable contract: the job id/status/attempts are surfaced to the client.
      expect(r.data.jobId).toBe('job_abc');
      expect(r.data.jobStatus).toBe('done');
      expect(r.data.attempts).toBe(1);
    }
    expect(calls[0].url).toContain('/api/cases/case_1/retry');
    expect(calls[0].init.method).toBe('POST');
    expect(bodyOf(calls[0])).not.toContain('actor');
    expect(authOf(calls[0])).toBe('Bearer tok-123');
  });

  it('maps 409 -> conflict (not in a retryable state)', async () => {
    stubFetch(async () => makeResponse(409, { error: 'cannot retry from state submitted' }));
    expect(errKind(await api.retryCase('case_1'))).toBe('conflict');
  });

  it('populates ApiError.details {code,missing,action} from the enriched 409 body (denial_row_missing)', async () => {
    stubFetch(async () =>
      makeResponse(409, {
        error: 'normalized denial record absent',
        code: 'denial_row_missing',
        missing: ['denial_row'],
        action: 'Re-run intake or re-import the denial before retrying; the normalized denial record is absent.',
      }),
    );
    const r = await api.retryCase('case_1');
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) {
      // 409 keeps its conflict kind; actionable detail is carried alongside.
      expect(r.kind).toBe('conflict');
      expect(r.status).toBe(409);
      expect(r.details?.code).toBe('denial_row_missing');
      expect(r.details?.missing).toEqual(['denial_row']);
      expect(r.details?.action).toContain('re-import');
    }
  });

  it('surfaces 422 distinctly (status 422 preserved + details.code) from the enriched evidence_incomplete body', async () => {
    stubFetch(async () =>
      makeResponse(422, {
        error: 'evidence incomplete',
        code: 'evidence_incomplete',
        missing: ['claimId', 'carcCodes_or_rarcCodes'],
        action: 'Supply the missing fields (claimId, carcCodes_or_rarcCodes), then retry.',
      }),
    );
    const r = await api.retryCase('case_1');
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) {
      // 422 is not a dedicated kind; the UI distinguishes it via status/details.code.
      expect(r.status).toBe(422);
      expect(r.details?.code).toBe('evidence_incomplete');
      expect(r.details?.missing).toEqual(['claimId', 'carcCodes_or_rarcCodes']);
      expect(r.details?.action).toContain('Supply the missing fields');
    }
  });

  it('leaves ApiError.details undefined for a plain error body (backward compatible)', async () => {
    stubFetch(async () => makeResponse(409, { error: 'cannot retry' }));
    const r = await api.retryCase('case_1');
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.details).toBeUndefined();
  });
});

describe('run controls', () => {
  it('runDenial POSTs to /run/denial/:id, carries the bearer header, returns the actual case state', async () => {
    stubFetch(async () => makeResponse(200, { jobId: 'job_1', caseId: 'case_den_001', state: 'packet_ready' }));
    const r = await api.runDenial('den_001');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.data.state).toBe('packet_ready');
      expect(r.data.caseId).toBe('case_den_001');
    }
    expect(calls[0].url).toContain('/api/run/denial/den_001');
    expect(calls[0].init.method).toBe('POST');
    expect(authOf(calls[0])).toBe('Bearer tok-123');
  });

  it('runDenial maps 404 -> notFound (denial not found)', async () => {
    stubFetch(async () => makeResponse(404, { error: 'denial not found' }));
    expect(errKind(await api.runDenial('nope'))).toBe('notFound');
  });

  it('runPoll POSTs to /run/poll, returns {processed,cases} (a drain result, not a case state)', async () => {
    stubFetch(async () => makeResponse(200, { processed: 2, cases: 5 }));
    const r = await api.runPoll();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.data.processed).toBe(2);
      expect(r.data.cases).toBe(5);
    }
    expect(calls[0].url).toContain('/api/run/poll');
    expect(calls[0].init.method).toBe('POST');
    expect(authOf(calls[0])).toBe('Bearer tok-123');
  });
});

describe('no mutation body ever contains `actor`', () => {
  it('sweeps every new mutation/run method', async () => {
    stubFetch(async () => makeResponse(200, { ok: true }));
    await api.approveCase('c1', 1);
    await api.generateHandoff('c1');
    await api.recordSubmission('c1', { channel: 'fax', confirmationNumber: 'C-1', submittedAt: 's', note: 'n' });
    await api.retryCase('c1');
    await api.runDenial('d1');
    await api.runPoll('2024-01-01');
    for (const c of calls) {
      expect(bodyOf(c)).not.toContain('actor');
    }
  });
});
