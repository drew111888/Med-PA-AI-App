import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.stubEnv('MEDAUTH_DEMO_MODE', 'true'); vi.stubEnv('MEDAUTH_API_BASE', 'https://unused.invalid'); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('demo-mode boundaries', () => {
  it('uses same-origin API paths even if an ordinary-app base URL is configured', async () => {
    const client = await import('../../services/apiClient.ts');
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetch);
    await client.api.demoStart('PROVIDER');
    expect(fetch.mock.calls[0][0]).toBe('/api/demo/start');
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
});
