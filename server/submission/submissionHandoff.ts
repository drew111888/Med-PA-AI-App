/**
 * Submission handoff — two distinct, separately-gated steps.
 *
 *   approved --(generateHandoff)--> handoff_generated --(recordSubmission)--> submitted
 *
 * Generating a handoff is NOT submission. generateHandoff produces a downloadable
 * package from the APPROVED packet version and moves the case to
 * 'handoff_generated'. The case is only 'submitted' once a human records a
 * submission receipt (confirmation number / channel / timestamp) via
 * recordSubmission. Deadline urgency is retained until submission is recorded.
 *
 * Nothing is transmitted to a payer here — the practice sends via their channel
 * and records the receipt. No PHI leaves the box.
 */

import type { CaseRepository } from '../repositories/caseRepository.ts';
import type { AuditRepository } from '../repositories/auditRepository.ts';

export interface HandoffPackage {
  caseId: string;
  packetVersion: number;
  carrier: string;
  appealRoute: string | null;
  appealDeadline: string | null;
  letter: string;
  evidenceCount: number;
  generatedAt: string;
}

export interface SubmissionReceiptInput {
  /** Channel used to submit (e.g. 'payer_portal', 'fax', 'mail'). */
  channel: string;
  /** Carrier confirmation / tracking number recorded by the human. */
  confirmationNumber: string;
  /** When the human actually submitted (ISO). Defaults to now if omitted. */
  submittedAt?: string;
  note?: string;
}

export class SubmissionError extends Error {}

/**
 * Produce a downloadable handoff package from the approved packet version.
 * Requires state === 'approved' and that the approval matches the current
 * packet version (no stale approval). Does NOT mark the case submitted.
 */
export const generateHandoff = (
  cases: CaseRepository,
  audit: AuditRepository,
  caseId: string,
  actorUserId: string,
): HandoffPackage => {
  const c = cases.getCase(caseId);
  if (!c) throw new SubmissionError(`case ${caseId} not found`);
  if (c.state !== 'approved') {
    throw new SubmissionError(`handoff requires an approved case; state is ${c.state}`);
  }
  if (!c.packet) throw new SubmissionError('case has no packet');
  if (c.approvedVersion !== c.packetVersion) {
    throw new SubmissionError(
      `approval is stale (approved v${c.approvedVersion}, current v${c.packetVersion}); re-approve first`,
    );
  }

  const pkg: HandoffPackage = {
    caseId: c.id,
    packetVersion: c.packetVersion,
    carrier: c.packet.carrier,
    appealRoute: c.packet.appealRoute,
    appealDeadline: c.packet.appealDeadline,
    letter: c.packet.draftLetter,
    evidenceCount: c.packet.evidence.length,
    generatedAt: new Date().toISOString(),
  };

  cases.saveHandoff(c.id, pkg, c.packetVersion);
  audit.log({
    caseId: c.id,
    actor: actorUserId,
    action: 'handoff_generated',
    detail: `v${c.packetVersion} route ${pkg.appealRoute ?? 'n/a'} to ${pkg.carrier}`,
  });
  return pkg;
};

/**
 * Record a human-entered submission receipt. Only this marks the case
 * 'submitted'. Requires a handoff to have been generated first.
 */
export const recordSubmission = (
  cases: CaseRepository,
  audit: AuditRepository,
  caseId: string,
  actorUserId: string,
  receipt: SubmissionReceiptInput,
): { caseId: string; state: 'submitted' } => {
  const c = cases.getCase(caseId);
  if (!c) throw new SubmissionError(`case ${caseId} not found`);
  if (c.state !== 'handoff_generated') {
    throw new SubmissionError(
      `submission receipt requires a generated handoff; state is ${c.state}`,
    );
  }
  if (!receipt?.channel || !receipt?.confirmationNumber) {
    throw new SubmissionError('submission receipt requires channel and confirmationNumber');
  }

  const stored = {
    channel: receipt.channel,
    confirmationNumber: receipt.confirmationNumber,
    submittedAt: receipt.submittedAt ?? new Date().toISOString(),
    note: receipt.note ?? null,
    recordedBy: actorUserId,
  };
  cases.recordSubmission(c.id, actorUserId, stored);
  audit.log({
    caseId: c.id,
    actor: actorUserId,
    action: 'submitted',
    detail: `channel ${receipt.channel}; confirmation ${receipt.confirmationNumber}`,
  });
  return { caseId: c.id, state: 'submitted' };
};
