/** Server sessions live in memory only. A demo context never uses browser credentials. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  api, DEMO_MODE, isOk, setAuthTokenGetter, setOnUnauthorized,
  type ApiError, type ApiResult, type DemoRole, type DemoSessionInfo,
  type DemoSessionResponse, type SessionUser,
} from './apiClient.ts';
import { deriveCapabilities, NO_CAPABILITIES, type Capabilities } from './capabilities.ts';

export type SessionStatus = 'initializing' | 'anonymous' | 'authenticated';
export type LoginOutcome = { ok: true } | { ok: false; kind: 'unauthorized' | 'serverError' | 'badRequest' | 'other'; message: string };
export interface SessionContextValue {
  user: SessionUser | null;
  token: string | null;
  isAuthenticated: boolean;
  status: SessionStatus;
  capabilities: Capabilities;
  intendedTarget: string | null;
  clearIntendedTarget: () => void;
  login: (username: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  demoSession: DemoSessionInfo | null;
  sessionError: ApiError | null;
  contextVersion: number;
  demoStart: (role: DemoRole) => Promise<ApiResult<DemoSessionResponse>>;
  demoChangeRole: (role: DemoRole) => Promise<ApiResult<DemoSessionResponse>>;
  demoReset: () => Promise<ApiResult<DemoSessionResponse>>;
  refreshDemoSession: () => Promise<void>;
  leaveDemo: () => void;
}
const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('initializing');
  const [intendedTarget, setIntendedTarget] = useState<string | null>(null);
  const [demoSession, setDemoSession] = useState<DemoSessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<ApiError | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const tokenRef = useRef<string | null>(null);
  const sessionGeneration = useRef(0);
  const pendingDemoRotation = useRef<number | null>(null);

  const clearSession = useCallback(() => {
    sessionGeneration.current += 1;
    pendingDemoRotation.current = null;
    tokenRef.current = null;
    setUser(null);
    setDemoSession(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
    setOnUnauthorized((error, requestToken) => {
      // A response from a revoked pre-reset/role token cannot end the new session.
      if (requestToken !== undefined && requestToken !== tokenRef.current) return;
      // Role/reset revokes the old token before its replacement response arrives.
      if (DEMO_MODE && pendingDemoRotation.current !== null) return;
      if (!DEMO_MODE && typeof window !== 'undefined') {
        setIntendedTarget(window.location.pathname + window.location.hash);
      }
      if (DEMO_MODE) setSessionError(error ?? { ok: false, kind: 'expired', status: 401, message: 'Your demo session expired. Start a new synthetic workspace.' });
      clearSession();
    });
    setStatus('anonymous'); // No token is persisted across a page refresh.
    return () => { setAuthTokenGetter(() => null); setOnUnauthorized(null); };
  }, [clearSession]);

  const acceptDemo = useCallback((response: DemoSessionResponse) => {
    tokenRef.current = response.token;
    const { token: _token, ...info } = response;
    setDemoSession(info);
    setUser(response.user);
    setSessionError(null);
    setStatus('authenticated');
    // Forces case panels, drafts, notices, and pending reads to unmount on replacement.
    setContextVersion((version) => version + 1);
  }, []);

  const runDemoAction = useCallback(async (action: () => Promise<ApiResult<DemoSessionResponse>>, rotates = false) => {
    const generation = ++sessionGeneration.current;
    if (rotates) pendingDemoRotation.current = generation;
    const result = await action();
    // Logout, reset, or a newer role/start action makes this completion obsolete.
    if (generation !== sessionGeneration.current) return result;
    pendingDemoRotation.current = null;
    if (isOk(result)) acceptDemo(result.data);
    else {
      setSessionError(result);
      if (result.kind === 'expired' || result.kind === 'unauthorized') clearSession();
    }
    return result;
  }, [acceptDemo, clearSession]);
  const demoStart = useCallback((role: DemoRole) => runDemoAction(() => api.demoStart(role)), [runDemoAction]);
  const demoChangeRole = useCallback((role: DemoRole) => runDemoAction(() => api.demoChangeRole(role), true), [runDemoAction]);
  const demoReset = useCallback(() => runDemoAction(() => api.demoReset(), true), [runDemoAction]);

  const refreshDemoSession = useCallback(async () => {
    if (!DEMO_MODE || !tokenRef.current) return;
    const requestToken = tokenRef.current;
    const result = await api.demoSession();
    if (requestToken !== tokenRef.current) return;
    if (isOk(result)) setDemoSession(result.data);
    else if (result.kind !== 'expired' && result.kind !== 'unauthorized') setSessionError(result);
  }, []);

  // Absolute expiry is authoritative; idle expiry is verified by server responses.
  useEffect(() => {
    if (!DEMO_MODE || !demoSession) return;
    const remaining = Date.parse(demoSession.expiresAt) - Date.now();
    const timer = setTimeout(() => {
      setSessionError({ ok: false, kind: 'expired', status: 401, message: 'This demo session reached its time limit. Start a fresh synthetic workspace.' });
      clearSession();
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [demoSession?.expiresAt, clearSession]);

  const login = useCallback(async (username: string, password: string): Promise<LoginOutcome> => {
    const result = await api.login(username, password);
    if (!isOk(result)) {
      const kind = result.kind === 'unauthorized' || result.kind === 'serverError' || result.kind === 'badRequest' ? result.kind : 'other';
      return { ok: false, kind, message: result.message };
    }
    tokenRef.current = result.data.token;
    setUser(result.data.user);
    setStatus('authenticated');
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    const endingToken = tokenRef.current;
    if (tokenRef.current) await api.logout();
    if (generation !== sessionGeneration.current || endingToken !== tokenRef.current) return;
    clearSession();
    setSessionError(null);
    setIntendedTarget(null);
  }, [clearSession]);
  const leaveDemo = useCallback(() => {
    // Revoke the current demo token best-effort; never persist it.
    if (tokenRef.current) void api.logout();
    clearSession();
    setSessionError(null);
    setContextVersion((version) => version + 1);
  }, [clearSession]);
  const clearIntendedTarget = useCallback(() => setIntendedTarget(null), []);

  const value = useMemo<SessionContextValue>(() => ({
    user, token: tokenRef.current, isAuthenticated: status === 'authenticated' && user !== null,
    status, capabilities: user ? deriveCapabilities(user.role) : NO_CAPABILITIES,
    intendedTarget, clearIntendedTarget, login, logout, demoSession, sessionError, contextVersion,
    demoStart, demoChangeRole, demoReset, refreshDemoSession, leaveDemo,
  }), [user, status, intendedTarget, clearIntendedTarget, login, logout, demoSession, sessionError, contextVersion,
    demoStart, demoChangeRole, demoReset, refreshDemoSession, leaveDemo]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};
export const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
};
