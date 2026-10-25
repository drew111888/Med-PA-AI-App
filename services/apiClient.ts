/**
 * Client API module.
 *
 * The browser talks ONLY to the local backend. No AI/EHR keys exist client-side;
 * every protected action is an authenticated backend call carrying an opaque
 * bearer token. The token is supplied by an injected getter (the in-memory
 * SessionProvider) and is NEVER read from or written to localStorage here.
 *
 * request() classifies every response into a typed ApiResult discriminated union
 * and NEVER converts an error into an empty list or a zero count. Callers render
 * explicit, distinct loading / empty / error states from the result kind.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

const BASE = (typeof process !== 'undefined' && (process as any).env?.MEDAUTH_API_BASE) || '';

// --- Session wiring (injected by the SessionProvider; no localStorage) ---

type TokenGetter = () => string | null;
let tokenGetter: TokenGetter = () => null;
let onUnauthorized: (() => void) | null = null;

/** Register how request() obtains the current bearer token (in-memory). */
export const setAuthTokenGetter = (fn: TokenGetter): void => {
  tokenGetter = fn;
};

/** Register a handler invoked on any 401 so the session can end + route to login. */
export const setOnUnauthorized = (fn: (() => void) | null): void => {
  onUnauthorized = fn;
};

// --- Typed outcomes ---

export type ApiErrorKind =
  | 'unauthorized' // 401 — session ended, route to login
  | 'forbidden' // 403 — session kept, permission denied
  | 'badRequest' // 400 — input validation
  | 'notFound' // 404 — missing resource
  | 'conflict' // 409 — stale / state conflict
  | 'serverError'; // network failure or 5xx

export interface ApiError {
  ok: false;
  kind: ApiErrorKind;
  status: number;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | ApiError;

/** True when the result is a successful read with data. */
export const isOk = <T>(r: ApiResult<T>): r is { ok: true; data: T } => r.ok;

const errorMessage = (kind: ApiErrorKind, status: number, bodyError?: string): string => {
  if (bodyError) return bodyError;
  switch (kind) {
    case 'unauthorized':
      return 'Your session has expired. Please sign in again.';
    case 'forbidden':
      return 'You do not have permission to perform this action.';
    case 'badRequest':
      return 'The request was invalid.';
    case 'notFound':
      return 'The requested resource was not found.';
    case 'conflict':
      return 'The resource changed or is in a conflicting state.';
    case 'serverError':
    default:
      return status === 0
        ? 'Cannot reach the local server.'
        : `The server reported an error (${status}).`;
  }
};

const kindForStatus = (status: number): ApiErrorKind => {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 400) return 'badRequest';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  return 'serverError'; // any other non-2xx (incl. 5xx)
};

interface RequestOptions {
  /** Omit the Authorization header (public endpoints: health, login). */
  anonymous?: boolean;
}

/**
 * Central fetch. Attaches the bearer token (unless anonymous), parses JSON, and
 * returns a typed ApiResult. On 401 it invokes the registered onUnauthorized
 * handler so the SessionProvider can clear in-memory state and route to login.
 *
 * Never throws for an HTTP error status and never returns an empty collection to
 * stand in for an error — the caller inspects `.ok` / `.kind`.
 */
const request = async <T>(path: string, init: RequestInit = {}, opts: RequestOptions = {}): Promise<ApiResult<T>> => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (!opts.anonymous) {
    const token = tokenGetter();
    if (token) headers['authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  } catch {
    // Network failure / server unreachable — distinct from a 5xx but same kind.
    return { ok: false, kind: 'serverError', status: 0, message: errorMessage('serverError', 0) };
  }

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: true, data };
  }

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const kind = kindForStatus(res.status);
  if (kind === 'unauthorized' && onUnauthorized) onUnauthorized();
  return { ok: false, kind, status: res.status, message: errorMessage(kind, res.status, body.error) };
};

// --- Types mirrored EXACTLY from the backend source of truth ---
// (server/domain/types.ts, server/pipeline/classifier.ts, server/pipeline/gateEngine.ts,
//  server/domain/packet.ts, server/repositories/caseRepository.ts, auditRepository.ts,
//  server/jobs/jobRunner.ts, server/routes/caseRoutes.ts, server/app.ts health)

export type Role = 'ADMIN' | 'PROVIDER' | 'BILLER';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
  expiresAt: string;
}

export type DeadlineStatus = 'calculated' | 'unknown_missing_date' | 'unknown_missing_policy';

export type DenialCategory =
  | 'medical_necessity'
  | 'authorization'
  | 'missing_information'
  | 'coding'
  | 'coordination_of_benefits'
  | 'non_appealable'
  | 'unknown';

export type AppealCaseState =
  | 'intake'
  | 'classified'
  | 'gathering'
  | 'gated'
  | 'reasoning'
  | 'packet_ready'
  | 'needs_review'
  | 'approved'
  | 'handoff_generated'
  | 'submitted'
  | 'ineligible'
  | 'needs_more_data'
  | 'failed';

export type GateDecision = 'appeal_ready' | 'needs_more_data' | 'ineligible';

/** EvidenceHit — preserves the citation document id. */
export interface EvidenceHit {
  documentId: string;
  snippet: string;
}

export interface RequirementCheck {
  requirementId: string;
  description: string;
  evidenceKey: string;
  required: boolean;
  satisfied: boolean;
  citations: EvidenceHit[];
}

export interface GateResult {
  decision: GateDecision;
  checks: RequirementCheck[];
  deficits: RequirementCheck[];
  satisfied: RequirementCheck[];
  rationale: string;
}

export interface Classification {
  category: DenialCategory;
  appealable: boolean;
  recognizedCodes: string[];
  unrecognizedCodes: string[];
  appealDeadline: string | null;
  deadlineStatus: DeadlineStatus;
  appealWindowDays: number | null;
  denialDate: string | null;
  deadlineBlockers: string[];
  appealRoute: string | null;
  policyId: string | null;
  rationale: string;
}

export interface PacketEvidenceItem {
  requirementId: string;
  description: string;
  documentId: string;
  snippet: string;
}

export interface AppealPacket {
  caseId: string;
  denialId: string;
  patientId: string;
  carrier: string;
  category: string;
  appealRoute: string | null;
  /** Null when the deadline could not be calculated (see classification.deadlineStatus). */
  appealDeadline: string | null;
  classification: Classification;
  gate: GateResult;
  evidence: PacketEvidenceItem[];
  draftLetter: string;
  aiProvider: string;
  aiModel: string;
  aiValidationPassed: boolean;
  aiValidationIssues: string[];
  createdAt: string;
}

/** Full case row as returned by GET /api/cases/:id. */
export interface AppealCase {
  id: string;
  denialId: string;
  state: AppealCaseState;
  classification: Classification | null;
  gate: GateResult | null;
  packet: AppealPacket | null;
  packetVersion: number;
  packetHash: string | null;
  approvedVersion: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  handoffVersion: number | null;
  handoffGeneratedAt: string | null;
  hasHandoff: boolean;
  hasReceipt: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  caseId: string | null;
  actor: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface CaseDetail {
  case: AppealCase;
  audit: AuditEntry[];
}

/** List row as returned by GET /api/cases. */
export interface CaseSummary {
  id: string;
  denialId: string;
  state: AppealCaseState;
  category: DenialCategory | null;
  appealDeadline: string | null;
  deadlineStatus: DeadlineStatus | null;
  gateDecision: GateDecision | null;
  packetVersion: number;
  approvedVersion: number | null;
  packetReady: boolean;
  updatedAt: string;
}

/** A single deadline item from GET /api/summary. */
export interface DeadlineItem {
  caseId: string;
  denialId: string;
  state: AppealCaseState;
  deadlineKnown: boolean;
  appealDeadline: string | null;
  deadlineStatus: DeadlineStatus | null;
  deadlineBlockers: string[];
  /** Null when deadlineKnown is false — NEVER rendered as a number. */
  daysRemaining: number | null;
}

export interface SummaryInfo {
  total: number;
  byState: Record<string, number>;
  packetsReady: number;
  needsReview: number;
  approved: number;
  handoffGenerated: number;
  submitted: number;
  urgentDeadlines: DeadlineItem[];
  unknownDeadlines: DeadlineItem[];
  deadlines: DeadlineItem[];
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type JobType = 'process_denial' | 'poll_denials';

export interface JobRow {
  id: string;
  type: JobType;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptInfo {
  channel: string;
  confirmationNumber: string;
  submittedAt: string;
  note: string | null;
  recordedBy: string;
}

export interface HealthInfo {
  status: string;
  db: string;
  ehrAdapter: string;
  aiProvider: string;
  allowCloudAi: boolean;
  time: string;
}

/**
 * The stored handoff artifact returned by POST/GET /api/cases/:id/handoff.
 * This is the HandoffPackage — NOT the full packet. `packetVersion` identifies
 * exactly which approved version the artifact was generated for.
 */
export interface HandoffPackage {
  caseId: string;
  packetVersion: number;
  carrier: string;
  appealRoute: string | null;
  /** Null when the deadline could not be calculated. */
  appealDeadline: string | null;
  letter: string;
  evidenceCount: number;
  generatedAt: string;
}

/**
 * Fields for a HUMAN-ENTERED submission receipt. This records that a person
 * transmitted the appeal out-of-band; it is NOT payer confirmation. The server
 * maps missing required fields (channel/confirmationNumber) to 409, not 400.
 */
export interface SubmissionInput {
  channel: string;
  confirmationNumber: string;
  submittedAt?: string;
  note?: string;
}

/**
 * Download the handoff artifact as a Blob.
 *
 * This is a SEPARATE helper (not the JSON request() path) so the download
 * carries the bearer header: a plain <a href> cannot attach Authorization and
 * would 401. It reads the token from the same in-memory tokenGetter, maps a 401
 * through the onUnauthorized hook, and returns the Blob on 2xx or the mapped
 * ApiError on any non-2xx / network failure. The caller parses the Blob JSON to
 * display which packetVersion the artifact is for.
 */
const downloadHandoff = async (id: string): Promise<ApiResult<Blob>> => {
  const headers: Record<string, string> = {};
  const token = tokenGetter();
  if (token) headers['authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/cases/${encodeURIComponent(id)}/handoff`, { headers });
  } catch {
    return { ok: false, kind: 'serverError', status: 0, message: errorMessage('serverError', 0) };
  }

  if (res.ok) {
    const blob = await res.blob();
    return { ok: true, data: blob };
  }

  const kind = kindForStatus(res.status);
  if (kind === 'unauthorized' && onUnauthorized) onUnauthorized();
  // Best-effort error message from the JSON body (may not be JSON on a download path).
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, kind, status: res.status, message: errorMessage(kind, res.status, body.error) };
};

// --- API surface: reads + auth (Pkg 1&2) + mutations/runs (Pkg 3&4) ---
// The server derives the audit actor from the token; NO method ever sends `actor`.

export const api = {
  // Public (no bearer).
  health: () => request<HealthInfo>('/health', {}, { anonymous: true }),
  login: (username: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }, { anonymous: true }),

  // Session (bearer).
  me: () => request<{ user: SessionUser }>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  // Reads (bearer, view_cases).
  listCases: () => request<{ count: number; cases: CaseSummary[] }>('/cases'),
  getCase: (id: string) => request<CaseDetail>(`/cases/${encodeURIComponent(id)}`),
  summary: () => request<SummaryInfo>('/summary'),
  listJobs: () => request<{ jobs: JobRow[] }>('/jobs'),
  getReceipt: (id: string) => request<ReceiptInfo>(`/cases/${encodeURIComponent(id)}/receipt`),

  // --- Mutations (Package 3) ---

  /** Approve the EXACT reviewed version. Body is {packetVersion} only. */
  approveCase: (id: string, packetVersion: number) =>
    request<{ ok: true; state: 'approved'; approvedVersion: number }>(
      `/cases/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: JSON.stringify({ packetVersion }) },
    ),

  /** Generate the handoff artifact (NOT submission). Enabled only when approved. */
  generateHandoff: (id: string) =>
    request<{ ok: true; state: 'handoff_generated'; package: HandoffPackage }>(
      `/cases/${encodeURIComponent(id)}/handoff`,
      { method: 'POST' },
    ),

  /** Download the handoff artifact as a Blob (bearer carried — see helper). */
  downloadHandoff,

  /** Record a HUMAN-ENTERED submission receipt. Server validates (missing field -> 409). */
  recordSubmission: (id: string, input: SubmissionInput) => {
    const body: Record<string, string> = {
      channel: input.channel,
      confirmationNumber: input.confirmationNumber,
    };
    if (input.submittedAt !== undefined) body.submittedAt = input.submittedAt;
    if (input.note !== undefined) body.note = input.note;
    return request<{ ok: true; caseId: string; state: 'submitted' }>(
      `/cases/${encodeURIComponent(id)}/submit`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  // --- Runs & retry (Package 4) ---

  /** Re-run the pipeline for a failed / needs_more_data / needs_review case. */
  retryCase: (id: string) =>
    request<{ caseId: string; state: AppealCaseState; packetReady: boolean }>(
      `/cases/${encodeURIComponent(id)}/retry`,
      { method: 'POST' },
    ),

  /** Synchronous drain of a single denial — returns the resulting case state. */
  runDenial: (denialId: string) =>
    request<{ jobId: string; caseId: string | null; state: AppealCaseState | null }>(
      `/run/denial/${encodeURIComponent(denialId)}`,
      { method: 'POST' },
    ),

  /** Synchronous poll drain — returns {processed, cases}, NOT a case state. */
  runPoll: (since?: string) =>
    request<{ processed: number; cases: number }>(
      '/run/poll',
      { method: 'POST', body: JSON.stringify({ since }) },
    ),
};

// Exposed only for focused unit testing of the typed-outcome mapping + download.
export const __test__ = { request, downloadHandoff };
