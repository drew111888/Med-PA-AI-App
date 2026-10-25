/**
 * Client API module.
 *
 * The browser talks ONLY to the local backend. No AI/EHR keys exist client-side;
 * every pipeline action (run, review, approve) is a backend call. The base URL
 * is the local server (same origin in production, proxied in dev).
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

const BASE = (typeof process !== 'undefined' && (process as any).env?.MEDAUTH_API_BASE) || '';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
};

// --- Types mirrored from the backend (subset the UI needs) ---

export interface CaseSummary {
  id: string;
  denialId: string;
  state: string;
  category: string | null;
  appealDeadline: string | null;
  gateDecision: string | null;
  packetReady: boolean;
  updatedAt: string;
}

export interface RequirementCheck {
  requirementId: string;
  description: string;
  evidenceKey: string;
  required: boolean;
  satisfied: boolean;
  citations: { documentId: string; snippet: string }[];
}

export interface AppealPacket {
  caseId: string;
  carrier: string;
  category: string;
  appealRoute: string | null;
  appealDeadline: string;
  evidence: { requirementId: string; description: string; documentId: string; snippet: string }[];
  draftLetter: string;
  aiProvider: string;
  aiModel: string;
  aiValidationPassed: boolean;
  aiValidationIssues: string[];
}

export interface CaseDetail {
  case: {
    id: string;
    denialId: string;
    state: string;
    classification: any;
    gate: { decision: string; checks: RequirementCheck[]; deficits: RequirementCheck[]; satisfied: RequirementCheck[]; rationale: string } | null;
    packet: AppealPacket | null;
  };
  audit: { id: string; action: string; actor: string; detail: string | null; createdAt: string }[];
}

export interface HealthInfo {
  status: string;
  db: string;
  ehrAdapter: string;
  aiProvider: string;
}

export interface DeadlineItem {
  caseId: string;
  denialId: string;
  state: string;
  appealDeadline: string;
  daysRemaining: number;
}

export interface SummaryInfo {
  total: number;
  byState: Record<string, number>;
  packetsReady: number;
  approved: number;
  submitted: number;
  urgentDeadlines: DeadlineItem[];
  deadlines: DeadlineItem[];
}

// --- API surface ---

export const api = {
  health: () => request<HealthInfo>('/health'),

  listCases: () => request<{ count: number; cases: CaseSummary[] }>('/cases'),

  getCase: (id: string) => request<CaseDetail>(`/cases/${encodeURIComponent(id)}`),

  approveCase: (id: string, actor: string) =>
    request<{ ok: boolean; state: string }>(`/cases/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ actor }),
    }),

  submitCase: (id: string, actor: string) =>
    request<{ ok: boolean; state: string; package: any }>(`/cases/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ actor }),
    }),

  summary: () => request<SummaryInfo>('/summary'),

  runDenial: (denialId: string) =>
    request<{ jobId: string; caseId: string | null; state: string | null }>(
      `/run/denial/${encodeURIComponent(denialId)}`,
      { method: 'POST', body: '{}' },
    ),

  runPoll: () =>
    request<{ processed: number; cases: number }>('/run/poll', {
      method: 'POST',
      body: '{}',
    }),

  listDenials: () =>
    request<{ adapter: string; count: number; denials: any[] }>('/dev/denials'),
};
