import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, isOk, setAuthTokenGetter, setOnUnauthorized } from '../../services/apiClient.ts';

let calls: { url: string; init: RequestInit }[];
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
beforeEach(() => { calls = []; setAuthTokenGetter(() => 'synthetic-test-token'); setOnUnauthorized(null); });
afterEach(() => { setAuthTokenGetter(() => null); setOnUnauthorized(null); vi.restoreAllMocks(); });
const stub = (status = 200, body: unknown = {}) => {
  globalThis.fetch = vi.fn(async (url: any, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return response(status, body); }) as typeof fetch;
};

describe('fixed public demo gateway client', () => {
  it('starts a password-free role session without a bearer header', async () => {
    stub();
    await api.demoStart('PROVIDER');
    expect(calls[0].url).toContain('/api/demo/start');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ role: 'PROVIDER' });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined();
  });
  it('uses the current server token for role and isolated reset requests', async () => {
    stub();
    await api.demoChangeRole('BILLER');
    await api.demoReset();
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ role: 'BILLER' });
    expect(calls[1].init.body).toBe('{}');
    for (const call of calls) expect((call.init.headers as Record<string, string>).authorization).toBe('Bearer synthetic-test-token');
  });
  it('intakes only the chosen fixture identifier and sends no record text', async () => {
    stub();
    await api.demoIntake('unknown-date');
    expect(calls[0].url).toContain('/api/demo/intake/unknown-date');
    expect(calls[0].init.body).toBe('{}');
  });
  it('records a generated demo receipt with an empty body', async () => {
    stub();
    await api.recordDemoSubmission('case_sample');
    expect(calls[0].url).toContain('/api/cases/case_sample/submit');
    expect(calls[0].init.body).toBe('{}');
  });
  it('keeps capacity limits distinct from server failures and retains retry timing', async () => {
    stub(429, { error: 'Demo capacity reached', code: 'DEMO_CAPACITY', retryAfter: 30 });
    const result = await api.demoStart('BILLER');
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result).toMatchObject({ kind: 'rateLimited', status: 429, retryAfter: 30, code: 'DEMO_CAPACITY' });
  });
  it('does not end a replacement session when an old-token 401 arrives late', async () => {
    let complete!: (value: Response) => void;
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; })) as typeof fetch;
    const ended = vi.fn();
    setOnUnauthorized(ended);
    const request = api.listCases();
    setAuthTokenGetter(() => 'replacement-test-token');
    complete(response(401, { error: 'session revoked' }));
    await request;
    expect(ended).not.toHaveBeenCalled();
    stub(401, { error: 'current session expired' });
    await api.listCases();
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }), 'replacement-test-token');
  });
});
