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

  // Idempotency at the case level: if a case already exists for this denial,
  // do not reprocess.
  const existing = cases.getCaseByDenial(denial.id);
  if (existing) {
    return {
      caseId: existing.id,
      state: existing.state,
      gateDecision: existing.gate?.decision ?? null,
      packetReady: existing.state === 'packet_ready' || existing.state === 'approved',
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
  cases.createCase(caseId, denial.id, 'intake');
  audit.log({ caseId, actor: 'system', action: 'intake', detail: `denial ${denial.id} ingested` });

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
      audit.log({ caseId, actor: 'system', action: 'stopped', detail: gate.decision });
      return { caseId, state: 'gated', gateDecision: gate.decision, packetReady: false };
    }

    // 4. AI reasoning (only when appeal_ready).
    cases.updateCase(caseId, { state: 'reasoning' });
    const reasoning = await runReasoning(ai, { patient, classification, gate, policy, chart });
    audit.log({
      caseId,
      actor: 'system',
      action: 'reasoned',
      detail: `provider ${reasoning.provider}; validation ${reasoning.validation.valid ? 'pass' : 'fail'}`,
    });

    // 5. Build + persist packet.
    const packet = buildPacket({ caseId, denial, patient, classification, gate, reasoning });
    cases.updateCase(caseId, { state: 'packet_ready', packet });
    audit.log({ caseId, actor: 'system', action: 'packet_ready', detail: `evidence ${packet.evidence.length}` });

    return { caseId, state: 'packet_ready', gateDecision: gate.decision, packetReady: true };
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
