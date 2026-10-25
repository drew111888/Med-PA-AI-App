/**
 * Pipeline orchestrator — runs a single denial end to end.
 *
 * Sequence (deterministic-first; AI only on appeal_ready):
 *   intake -> classify -> gather chart -> gate -> [reason -> packet] -> persist
 *
 * Every step writes an audit entry. The denial, claim, and patient are persisted
 * (PHI encrypted). Non-appealable / needs-more-data cases stop before AI and are
 * recorded with their gate decision. Errors mark the case failed and are logged.
 */

import type { EHRPort } from '../ports/ehrPort.ts';
import type { PayerPolicyPort } from '../ports/payerPolicyPort.ts';
import type { AiProviderPort } from '../ports/aiProviderPort.ts';
import type { Denial } from '../domain/types.ts';
import type { CaseRepository } from '../repositories/caseRepository.ts';
import type { AuditRepository } from '../repositories/auditRepository.ts';
import { classifyDenial } from './classifier.ts';
import { evaluateGates } from './gateEngine.ts';
import { runReasoning } from './reasoning.ts';
import { buildPacket } from './packetBuilder.ts';

export interface OrchestratorDeps {
  ehr: EHRPort;
  payerPolicy: PayerPolicyPort;
  ai: AiProviderPort;
  cases: CaseRepository;
  audit: AuditRepository;
}

export interface PipelineResult {
  caseId: string;
  state: string;
  gateDecision: string | null;
  packetReady: boolean;
}

const newCaseId = (denialId: string) => `case_${denialId}`;

export const processDenial = async (
  deps: OrchestratorDeps,
  denial: Denial,
): Promise<PipelineResult> => {
  const { ehr, payerPolicy, ai, cases, audit } = deps;
  const caseId = newCaseId(denial.id);

  // Idempotency: a case that already reached a terminal/human-owned state is NOT
  // reprocessed. But a 'failed' case (or one left mid-flight by a crash) MUST be
  // resumed/repaired rather than reported as success.
  const existing = cases.getCaseByDenial(denial.id);
  const RESUMABLE = new Set(['failed', 'intake', 'classified', 'gathering', 'gated', 'reasoning']);
  if (existing && !RESUMABLE.has(existing.state)) {
    return {
      caseId: existing.id,
      state: existing.state,
      gateDecision: existing.gate?.decision ?? null,
      packetReady: existing.state === 'packet_ready',
    };
  }

  const claim = await ehr.getClaim(denial.claimId);
  if (!claim) throw new Error(`Claim ${denial.claimId} not found for denial ${denial.id}`);
  const patient = await ehr.getPatient(claim.patientId);
  if (!patient) throw new Error(`Patient ${claim.patientId} not found`);

  // Persist inputs (PHI encrypted in repo).
  cases.upsertPatient(patient);
  cases.upsertClaim(claim);
  cases.insertDenial(denial);
  if (!existing) {
    cases.createCase(caseId, denial.id, 'intake');
    audit.log({ caseId, actor: 'system', action: 'intake', detail: `denial ${denial.id} ingested` });
  } else {
    // Resuming: reset to intake and record the repair attempt.
    cases.updateCase(caseId, { state: 'intake' });
    audit.log({ caseId, actor: 'system', action: 'resume', detail: `resuming from ${existing.state}` });
  }

  try {
    // 1. Classify (deterministic).
    const cpt = claim.cptCodes[0];
    const policy = cpt ? await payerPolicy.getPolicy(denial.carrier, cpt) : null;
    const classification = classifyDenial(denial, policy);
    cases.updateCase(caseId, { state: 'classified', classification });
    audit.log({
      caseId,
      actor: 'system',
      action: 'classified',
      detail: `${classification.category}; deadline ${classification.appealDeadline}`,
    });

    // 2. Gather chart.
    const chart = await ehr.getChartDocuments(patient.id, claim.id);
    cases.updateCase(caseId, { state: 'gathering' });
    audit.log({ caseId, actor: 'system', action: 'gathered', detail: `${chart.length} documents` });

    // 3. Gate (deterministic).
    const gate = evaluateGates(classification, policy, chart);
    cases.updateCase(caseId, { state: 'gated', gate });
    audit.log({ caseId, actor: 'system', action: 'gated', detail: gate.decision });

    if (gate.decision === 'ineligible') {
      cases.updateCase(caseId, { state: 'ineligible' });
      audit.log({ caseId, actor: 'system', action: 'stopped', detail: 'ineligible' });
      return { caseId, state: 'ineligible', gateDecision: gate.decision, packetReady: false };
    }
    if (gate.decision !== 'appeal_ready') {
      cases.updateCase(caseId, { state: 'needs_more_data' });
      audit.log({ caseId, actor: 'system', action: 'stopped', detail: gate.decision });
      return { caseId, state: 'needs_more_data', gateDecision: gate.decision, packetReady: false };
    }

    // 3b. Deadline gate: we will not draft an appeal we cannot time. If the
    //     deadline is not calculable (missing date or missing carrier rule),
    //     hold for human review BEFORE any AI call. Never fabricate a deadline.
    if (classification.deadlineStatus !== 'calculated' || !classification.appealDeadline) {
      cases.updateCase(caseId, { state: 'needs_review' });
      audit.log({
        caseId,
        actor: 'system',
        action: 'needs_review',
        detail: `deadline ${classification.deadlineStatus}; blockers: ${classification.deadlineBlockers.join(', ')}`,
      });
      return { caseId, state: 'needs_review', gateDecision: gate.decision, packetReady: false };
    }

    // 4. AI reasoning (only when appeal_ready AND deadline known).
    cases.updateCase(caseId, { state: 'reasoning' });
    const reasoning = await runReasoning(ai, { patient, classification, gate, policy, chart });
    audit.log({
      caseId,
      actor: 'system',
      action: 'reasoned',
      detail: `provider ${reasoning.provider}; validation ${reasoning.validation.valid ? 'pass' : 'fail'}`,
    });

    // 5. Build + persist packet (versioned). Fail closed on AI validation:
    //    a packet whose AI output failed validation goes to 'needs_review' and
    //    is NOT approvable until a human remediates and re-runs.
    const packet = buildPacket({ caseId, denial, patient, classification, gate, reasoning });

    // Guard: a packet with a known deadline requirement but no deadline, or with
    // no evidence, is incomplete and must not be presented as ready.
    const complete = isPacketComplete(packet);
    const readyState: 'packet_ready' | 'needs_review' =
      reasoning.validation.valid && complete.ok ? 'packet_ready' : 'needs_review';

    cases.updateCase(caseId, { state: readyState, packet });
    audit.log({
      caseId,
      actor: 'system',
      action: readyState,
      detail:
        readyState === 'packet_ready'
          ? `evidence ${packet.evidence.length}; validated`
          : `held for review: ${[
              ...(reasoning.validation.valid ? [] : ['ai_validation_failed']),
              ...complete.issues,
            ].join(', ')}`,
    });

    return {
      caseId,
      state: readyState,
      gateDecision: gate.decision,
      packetReady: readyState === 'packet_ready',
    };
  } catch (err) {
    cases.updateCase(caseId, { state: 'failed' });
    audit.log({
      caseId,
      actor: 'system',
      action: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

/** Deterministic completeness check — required before a packet is approvable. */
export const isPacketComplete = (packet: {
  evidence: unknown[];
  draftLetter: string;
  appealDeadline: string | null;
  classification: { deadlineStatus: string };
}): { ok: boolean; issues: string[] } => {
  const issues: string[] = [];
  if (!packet.draftLetter || packet.draftLetter.trim().length < 40) issues.push('empty_draft');
  if (!packet.evidence || packet.evidence.length === 0) issues.push('no_evidence');
  // A calculated deadline must actually be present; an unknown deadline is a
  // review blocker (a human must supply the missing date/rule first).
  if (packet.classification.deadlineStatus !== 'calculated' || !packet.appealDeadline) {
    issues.push('deadline_unknown');
  }
  return { ok: issues.length === 0, issues };
};
