/**
 * Focused tests for the typed-outcome behaviour of apiClient.request().
 *
 * Verifies that every HTTP status maps to the correct ApiResult.kind, that a
 * network failure is a distinct serverError, that an error is NEVER converted
 * into an empty list, that the bearer token is attached (and omitted on
 * anonymous calls), that a 401 ends the session via the registered handler, and
 * that no request body ever contains an `actor` field.
 *
 * Node environment (no DOM) — fetch is stubbed on globalThis.
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
  }) as unknown as Response;

let calls: FetchCall[];

const stubFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init: init ?? {} });
    return impl(String(url), init ?? {});
  }) as unknown as typeof fetch;
};

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

const errKind = <T>(r: ApiResult<T>): string | null => (isOk(r) ? null : r.kind);

describe('apiClient.request typed outcomes', () => {
  it('maps a 200 to ok with parsed data (never an empty list on success)', async () => {
    stubFetch(async () => makeResponse(200, { count: 1, cases: [{ id: 'c1' }] }));
    const r = await api.listCases();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.data.cases).toHaveLength(1);
  });

  it('maps 400 -> badRequest', async () => {
    stubFetch(async () => makeResponse(400, { error: 'bad' }));
    expect(errKind(await api.listCases())).toBe('badRequest');
  });

  it('maps 401 -> unauthorized and invokes the session-expiry handler', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    stubFetch(async () => makeResponse(401, { error: 'nope' }));
    const r = await api.listCases();
    expect(errKind(r)).toBe('unauthorized');
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it('maps 403 -> forbidden and does NOT end the session', async () => {
    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    stubFetch(async () => makeResponse(403, { error: 'denied' }));
    const r = await api.listCases();
    expect(errKind(r)).toBe('forbidden');
    expect(onUnauth).not.toHaveBeenCalled();
  });

  it('maps 404 -> notFound', async () => {
    stubFetch(async () => makeResponse(404, { error: 'missing' }));
    expect(errKind(await api.getCase('x'))).toBe('notFound');
  });

  it('maps 409 -> conflict', async () => {
    stubFetch(async () => makeResponse(409, { error: 'stale' }));
    expect(errKind(await api.getCase('x'))).toBe('conflict');
  });

  it('maps 500 -> serverError', async () => {
    stubFetch(async () => makeResponse(500, { error: 'boom' }));
    expect(errKind(await api.summary())).toBe('serverError');
  });

  it('maps a thrown network failure -> serverError with status 0 (distinct, not empty)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const r = await api.listJobs();
    expect(errKind(r)).toBe('serverError');
    if (!isOk(r)) expect(r.status).toBe(0);
    // Crucially, the caller does NOT receive { jobs: [] }.
    expect(isOk(r)).toBe(false);
  });

  it('attaches the bearer token on protected requests', async () => {
    stubFetch(async () => makeResponse(200, { count: 0, cases: [] }));
    await api.listCases();
    const auth = (calls[0].init.headers as Record<string, string>)['authorization'];
    expect(auth).toBe('Bearer tok-123');
  });

  it('attaches the bearer token to downloads/receipt fetches too', async () => {
    stubFetch(async () => makeResponse(200, { channel: 'fax' }));
    await api.getReceipt('c1');
    const auth = (calls[0].init.headers as Record<string, string>)['authorization'];
    expect(auth).toBe('Bearer tok-123');
  });

  it('does NOT attach a bearer token to anonymous endpoints (health, login)', async () => {
    stubFetch(async () => makeResponse(200, { status: 'ok' }));
    await api.health();
    await api.login('u', 'p');
    for (const c of calls) {
      expect((c.init.headers as Record<string, string>)['authorization']).toBeUndefined();
    }
  });

  it('never sends an `actor` field in any request body', async () => {
    stubFetch(async () => makeResponse(200, {}));
    await api.login('u', 'p');
    await api.logout();
    await api.listCases();
    await api.getCase('c1');
    await api.summary();
    await api.listJobs();
    await api.getReceipt('c1');
    for (const c of calls) {
      const body = typeof c.init.body === 'string' ? c.init.body : '';
      expect(body).not.toContain('actor');
    }
  });

  it('login posts only username/password (no actor, no extra fields)', async () => {
    stubFetch(async () => makeResponse(200, { token: 't', user: {}, expiresAt: 'x' }));
    await api.login('alice', 'secret');
    const body = JSON.parse(String(calls[0].init.body));
    expect(Object.keys(body).sort()).toEqual(['password', 'username']);
  });
});
