import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionConflictNotice, CaseReview, RetryErrorLine } from '../../components/Cases.tsx';
import { deriveCapabilities } from '../../services/capabilities.ts';
import type { ApiError, AppealCaseState, CaseDetail } from '../../services/apiClient.ts';

const detailFor = (state: AppealCaseState): CaseDetail => {
  const classification = {
    category: 'medical_necessity' as const, appealable: true,
    recognizedCodes: ['50'], unrecognizedCodes: [], appealDeadline: '2026-12-01',
    deadlineStatus: 'calculated' as const, appealWindowDays: 60, denialDate: '2026-10-02',
    deadlineBlockers: [], appealRoute: 'synthetic_route', policyId: 'synthetic_policy',
    rationale: 'Synthetic classification for UI regression.',
  };
  const gate = { decision: 'appeal_ready' as const, checks: [], deficits: [], satisfied: [], rationale: 'Synthetic gate.' };
  return {
    case: {
      id: 'case_synthetic', denialId: 'den_synthetic', state, classification, gate,
      packet: {
        caseId: 'case_synthetic', denialId: 'den_synthetic', patientId: 'synthetic_patient',
        carrier: 'Synthetic payer', category: 'medical_necessity', appealRoute: 'synthetic_route',
        appealDeadline: '2026-12-01', classification, gate, evidence: [],
        draftLetter: 'Synthetic local-stub draft.', aiProvider: 'local', aiModel: 'stub',
        aiValidationPassed: true, aiValidationIssues: [], createdAt: '2026-10-28T00:00:00Z',
      },
      packetVersion: 2, packetHash: 'synthetic-hash', approvedVersion: 2,
      approvedBy: 'synthetic_provider', approvedAt: '2026-10-28T00:00:00Z',
      handoffVersion: 2, handoffGeneratedAt: '2026-10-28T00:00:00Z', hasHandoff: true,
      hasReceipt: false, submittedBy: null, submittedAt: null,
      createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z',
    },
    latestJob: { id: 'job_synthetic', type: 'process_denial', status: 'done', attempts: 3, lastError: null, updatedAt: '2026-10-28T00:00:00Z' },
    audit: [],
  };
};

const renderCase = (detail: CaseDetail, canRun = true) => renderToStaticMarkup(React.createElement(CaseReview, {
  detail, capabilities: { ...deriveCapabilities('PROVIDER'), canRun }, onMutated: async () => {},
}));

const buttonAttributes = (html: string, text: string): string => {
  const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) => match[2].includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  return button[1];
};

describe('case review durable workflow status', () => {
  it.each<AppealCaseState>(['packet_ready', 'approved', 'handoff_generated', 'submitted'])(
    'keeps the job visible in %s when retry is unavailable', (state) => {
      const html = renderCase(detailFor(state));
      expect(html).toContain('Latest workflow job');
      expect(html).toContain('job_synthetic');
      expect(html).toContain('attempts 3');
      expect(html).not.toContain('Retry (re-run pipeline)');
    },
  );

  it('renders newly fetched metadata after the review panel is recreated, without run permission', () => {
    expect(renderCase(detailFor('packet_ready'), false)).toContain('attempts 3');
    const refreshed = detailFor('packet_ready');
    refreshed.latestJob = { ...refreshed.latestJob!, attempts: 4, status: 'failed', lastError: 'Synthetic retry failed.' };
    const html = renderCase(refreshed, false);
    expect(html).toContain('attempts 4');
    expect(html).toContain('Last error: Synthetic retry failed.');
    expect(html).not.toContain('Retry (re-run pipeline)');
  });
});

describe('reconciled action errors', () => {
  it('renders the parent-owned missing-row 409 action and missing fields after panel replacement', () => {
    const error: ApiError = {
      ok: false, kind: 'conflict', status: 409, message: 'No persisted denial exists.',
      details: { code: 'denial_row_missing', missing: ['denial_row'], action: 'Re-import the denial before retrying.' },
    };
    const html = renderToStaticMarkup(React.createElement(ActionConflictNotice, { error }));
    expect(html).toContain('Denial record missing (409)');
    expect(html).toContain('Missing: denial row');
    expect(html).toContain('Re-import the denial before retrying.');
  });

  it('does not mislabel a version conflict as a missing denial', () => {
    const error: ApiError = { ok: false, kind: 'conflict', status: 409, message: 'Packet version changed.' };
    for (const Component of [ActionConflictNotice, RetryErrorLine]) {
      const html = renderToStaticMarkup(React.createElement(Component, { error }));
      expect(html).toContain('Packet version changed.');
      expect(html).not.toContain('re-import');
      expect(html).not.toContain('record is absent');
    }
  });

  it('preserves actionable 422 evidence guidance', () => {
    const error: ApiError = {
      ok: false, kind: 'serverError', status: 422, message: 'Evidence incomplete.',
      details: { code: 'evidence_incomplete', missing: ['carcCodes_or_rarcCodes'], action: 'Supply the missing codes upstream, then retry.' },
    };
    const html = renderToStaticMarkup(React.createElement(RetryErrorLine, { error }));
    expect(html).toContain('Missing evidence (422)');
    expect(html).toContain('carcCodes or rarcCodes');
    expect(html).toContain('Supply the missing codes upstream, then retry.');
  });
});

describe('current handoff download controls', () => {
  it.each<AppealCaseState>(['handoff_generated', 'submitted'])('permits a current approved %s artifact', (state) => {
    expect(buttonAttributes(renderCase(detailFor(state)), 'Download handoff')).not.toMatch(/\sdisabled(?:=|\s|$)/);
  });

  it.each(['stale', 'revoked', 'not_generated', 'no_packet', 'no_approver', 'no_approval_time'])(
    'disables an operational download for %s and explains why', (invalid) => {
      const detail = detailFor('handoff_generated');
      if (invalid === 'stale') detail.case.handoffVersion = 1;
      if (invalid === 'revoked') detail.case.approvedVersion = null;
      if (invalid === 'not_generated') detail.case.state = 'approved';
      if (invalid === 'no_packet') detail.case.packet = null;
      if (invalid === 'no_approver') detail.case.approvedBy = null;
      if (invalid === 'no_approval_time') detail.case.approvedAt = null;
      const html = renderCase(detail);
      expect(buttonAttributes(html, 'Download handoff')).toMatch(/\sdisabled(?:=|\s|$)/);
      expect(html).toContain('This handoff is stale or no longer approved.');
    },
  );
});

describe('integrated demo review boundaries', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('MEDAUTH_DEMO_MODE', 'true'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  const renderDemo = async (detail: CaseDetail) => {
    const { CaseReview: DemoReview } = await import('../../components/Cases.tsx');
    return renderToStaticMarkup(React.createElement(DemoReview, {
      detail, capabilities: deriveCapabilities('BILLER'), onMutated: async () => {},
    }));
  };

  it('shows durable status while keeping unknown-deadline retry and approval unavailable', async () => {
    const detail = detailFor('needs_review');
    detail.case.denialId = 'den_demo_unknown';
    detail.case.classification = {
      ...detail.case.classification!, appealDeadline: null, deadlineStatus: 'unknown_missing_date',
      denialDate: null, deadlineBlockers: ['denial date'],
    };
    detail.case.packet = null;
    detail.case.hasHandoff = false;
    detail.case.approvedVersion = null;
    const html = await renderDemo(detail);
    expect(html).toContain('Latest workflow job');
    expect(html).toContain('job_synthetic');
    expect(html).toContain('deadline unknown');
    expect(html).not.toContain('Retry (re-run pipeline)');
    expect(html).not.toContain('Approve v');
    expect(buttonAttributes(html, 'Download handoff')).toMatch(/\sdisabled(?:=|\s|$)/);
  });

  it('preserves the fixed synthetic receipt and stub labels for a valid coordinator handoff', async () => {
    const html = await renderDemo(detailFor('handoff_generated'));
    expect(html).toContain('Latest workflow job');
    expect(html).toContain('Stub output checks passed');
    expect(html).toContain('The server generates a fixed synthetic receipt');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('AI-validated');
    expect(buttonAttributes(html, 'Record synthetic receipt')).not.toMatch(/\sdisabled(?:=|\s|$)/);
    expect(buttonAttributes(html, 'Download handoff')).not.toMatch(/\sdisabled(?:=|\s|$)/);
  });

  it('disables both operational actions when the demo handoff is stale', async () => {
    const detail = detailFor('handoff_generated');
    detail.case.handoffVersion = 1;
    const html = await renderDemo(detail);
    expect(html).toContain('This handoff is stale or no longer approved.');
    expect(buttonAttributes(html, 'Record synthetic receipt')).toMatch(/\sdisabled(?:=|\s|$)/);
    expect(buttonAttributes(html, 'Download handoff')).toMatch(/\sdisabled(?:=|\s|$)/);
  });
});
