import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.stubEnv('MEDAUTH_DEMO_MODE', 'true'); vi.stubEnv('MEDAUTH_API_BASE', 'https://unused.invalid'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const failure = (status: number, body: unknown) => ({ ok: false, status, json: async () => body }) as Response;

describe('demo-mode boundaries', () => {
  it('uses same-origin API paths even if an ordinary-app base URL is configured', async () => {
    const client = await import('../../services/apiClient.ts');
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => ({}), blob: async () => new Blob(['{}']) }));
    vi.stubGlobal('fetch', fetch);
    await client.api.demoStart('PROVIDER');
    await client.api.downloadHandoff('case_sample');
    expect(fetch.mock.calls[0][0]).toBe('/api/demo/start');
    expect(fetch.mock.calls[1][0]).toBe('/api/cases/case_sample/handoff');
    expect(client.DEMO_MODE).toBe(true);
  });
  it('distinguishes expired demo sessions from a role-denied action', async () => {
    const client = await import('../../services/apiClient.ts');
    client.setAuthTokenGetter(() => 'synthetic-session');
    const end = vi.fn(); client.setOnUnauthorized(end);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Provider approval required' }) })));
    expect(await client.api.approveCase('case_sample', 1)).toMatchObject({ ok: false, kind: 'forbidden', status: 403 });
    expect(end).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sandbox expired', code: 'DEMO_EXPIRED' }) })));
    expect(await client.api.listCases()).toMatchObject({ ok: false, kind: 'expired', status: 401, code: 'DEMO_EXPIRED' });
    expect(end).toHaveBeenCalledTimes(1);
    client.setAuthTokenGetter(() => null); client.setOnUnauthorized(null);
  });

  it.each([
    { status: 409, code: 'denial_row_missing', missing: ['denial_row'], action: 'Re-import the synthetic denial before retrying.', kind: 'conflict' },
    { status: 422, code: 'evidence_incomplete', missing: ['carcCodes_or_rarcCodes'], action: 'Supply the missing codes upstream, then retry.', kind: 'serverError' },
  ])('preserves actionable $status retry guidance in demo mode', async ({ status, code, missing, action, kind }) => {
    const client = await import('../../services/apiClient.ts');
    client.setAuthTokenGetter(() => 'synthetic-session');
    const end = vi.fn(); client.setOnUnauthorized(end);
    vi.stubGlobal('fetch', vi.fn(async () => failure(status, { error: 'Synthetic retry rejected.', code, missing, action })));
    expect(await client.api.retryCase('case_sample')).toMatchObject({
      ok: false, kind, status, code, details: { code, missing, action },
    });
    expect(end).not.toHaveBeenCalled();
  });

  it('retains current-handoff conflict guidance on the separate Blob download path', async () => {
    const client = await import('../../services/apiClient.ts');
    client.setAuthTokenGetter(() => 'synthetic-session');
    const end = vi.fn(); client.setOnUnauthorized(end);
    const action = 'Review and approve the current packet, then generate a new handoff.';
    vi.stubGlobal('fetch', vi.fn(async () => failure(409, { error: 'Synthetic handoff is stale.', code: 'handoff_stale', action })));
    expect(await client.api.downloadHandoff('case_sample')).toMatchObject({
      ok: false, kind: 'conflict', status: 409, code: 'handoff_stale',
      details: { code: 'handoff_stale', action },
    });
    expect(end).not.toHaveBeenCalled();
  });

  it.each(['json', 'download'] as const)('keeps capacity and retry timing alongside details on %s errors', async (path) => {
    const client = await import('../../services/apiClient.ts');
    client.setAuthTokenGetter(() => 'synthetic-session');
    const end = vi.fn(); client.setOnUnauthorized(end);
    vi.stubGlobal('fetch', vi.fn(async () => failure(429, { error: 'Synthetic retry limit reached.', code: 'demo_retry_limit', retryAfter: 60 })));
    const result = path === 'json' ? await client.api.retryCase('case_sample') : await client.api.downloadHandoff('case_sample');
    expect(result).toMatchObject({
      ok: false, kind: 'rateLimited', status: 429, code: 'demo_retry_limit', retryAfter: 60,
      details: { code: 'demo_retry_limit' },
    });
    expect(end).not.toHaveBeenCalled();
  });

  it.each([
    { path: 'json', status: 401 }, { path: 'download', status: 401 },
    { path: 'json', status: 403 }, { path: 'download', status: 403 },
  ])('does not clear a replacement session for a late $status expiry on $path', async ({ path, status }) => {
    const client = await import('../../services/apiClient.ts');
    let token = 'original-synthetic-session';
    client.setAuthTokenGetter(() => token);
    const end = vi.fn(); client.setOnUnauthorized(end);
    let complete!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; })));
    const read = () => path === 'json' ? client.api.listCases() : client.api.downloadHandoff('case_sample');
    const oldRequest = read();
    token = 'replacement-synthetic-session';
    const expired = () => failure(status, { error: 'Synthetic sandbox expired.', code: 'demo_session_expired', action: 'Start a new synthetic sandbox.' });
    complete(expired());
    expect(await oldRequest).toMatchObject({
      ok: false, kind: 'expired', status, code: 'demo_session_expired',
      details: { code: 'demo_session_expired', action: 'Start a new synthetic sandbox.' },
    });
    expect(end).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(async () => expired()));
    await read();
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expired', status }), token);
  });

  it('does not clear an existing session for an anonymous demo-start rejection', async () => {
    const client = await import('../../services/apiClient.ts');
    client.setAuthTokenGetter(() => 'existing-synthetic-session');
    const end = vi.fn(); client.setOnUnauthorized(end);
    vi.stubGlobal('fetch', vi.fn(async () => failure(401, { error: 'Synthetic start rejected.', code: 'demo_session_expired' })));
    expect(await client.api.demoStart('PROVIDER')).toMatchObject({ ok: false, kind: 'expired' });
    expect(end).not.toHaveBeenCalled();
  });
});
