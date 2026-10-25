/**
 * In-memory session provider.
 *
 * Holds the opaque bearer token and the server-returned user in React state
 * ONLY — never localStorage/sessionStorage. The token is injected into the API
 * client via setAuthTokenGetter so every protected request carries it; a 401
 * from any request ends the session and routes back to login (preserving only a
 * safe intended-navigation target). Capabilities derive from the server role.
 *
 * No password or token is ever logged.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  isOk,
  setAuthTokenGetter,
  setOnUnauthorized,
  type ApiResult,
  type LoginResponse,
  type SessionUser,
} from './apiClient.ts';
import { deriveCapabilities, NO_CAPABILITIES, type Capabilities } from './capabilities.ts';

export type SessionStatus = 'initializing' | 'anonymous' | 'authenticated';

export type LoginOutcome =
  | { ok: true }
  | { ok: false; kind: 'unauthorized' | 'serverError' | 'badRequest' | 'other'; message: string };

export interface SessionContextValue {
  user: SessionUser | null;
  token: string | null;
  isAuthenticated: boolean;
  status: SessionStatus;
  capabilities: Capabilities;
  /** Safe navigation target captured when a 401 interrupted the user. */
  intendedTarget: string | null;
  clearIntendedTarget: () => void;
  login: (username: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('initializing');
  const [intendedTarget, setIntendedTarget] = useState<string | null>(null);

  // Token lives in a ref (memory only) so the injected getter always reads the
  // latest value without a stale closure, and it is never persisted anywhere.
  const tokenRef = useRef<string | null>(null);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Wire the API client to read the in-memory token and react to 401s.
  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
    setOnUnauthorized(() => {
      // Preserve only a safe intended target (current path/hash — no secrets).
      if (typeof window !== 'undefined') {
        setIntendedTarget(window.location.pathname + window.location.hash);
      }
      clearSession();
    });
    return () => {
      setAuthTokenGetter(() => null);
      setOnUnauthorized(null);
    };
  }, [clearSession]);

  // Restore identity on load. There is no persisted token (memory-only), so on a
  // fresh load there is nothing to restore; we validate only if a token exists
  // (e.g. a future same-session remount) via GET /api/auth/me.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!tokenRef.current) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      const res = await api.me();
      if (cancelled) return;
      if (isOk(res)) {
        setUser(res.data.user);
        setStatus('authenticated');
      } else {
        clearSession();
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (username: string, password: string): Promise<LoginOutcome> => {
    const res: ApiResult<LoginResponse> = await api.login(username, password);
    if (!isOk(res)) {
      if (res.kind === 'unauthorized') return { ok: false, kind: 'unauthorized', message: res.message };
      if (res.kind === 'serverError') return { ok: false, kind: 'serverError', message: res.message };
      if (res.kind === 'badRequest') return { ok: false, kind: 'badRequest', message: res.message };
      return { ok: false, kind: 'other', message: res.message };
    }
    tokenRef.current = res.data.token;
    setUser(res.data.user);
    setStatus('authenticated');
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    // Best-effort server logout (invalidates the token server-side), then clear.
    if (tokenRef.current) {
      await api.logout();
    }
    clearSession();
    setIntendedTarget(null);
  }, [clearSession]);

  const clearIntendedTarget = useCallback(() => setIntendedTarget(null), []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      token: tokenRef.current,
      isAuthenticated: status === 'authenticated' && user !== null,
      status,
      capabilities: user ? deriveCapabilities(user.role) : NO_CAPABILITIES,
      intendedTarget,
      clearIntendedTarget,
      login,
      logout,
    }),
    [user, status, intendedTarget, clearIntendedTarget, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
};
