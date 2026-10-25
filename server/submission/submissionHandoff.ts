/**
 * Submission handoff.
 *
 * Submission stays human-approved: a case must be in 'approved' state before it
 * can be handed off. For the first-pass route this produces an exportable
 * submission package (the appeal letter + structured metadata the carrier
 * channel needs) and transitions the case to 'submitted' with an audit entry.
 *
 * The actual transport to a carrier (fax/portal/FHIR PAS) is intentionally a
 * pluggable detail; here we generate the package and record the handoff so the
 * practice can transmit via their supported channel. No PHI leaves the box.
 */

import type { CaseRepository } from '../repositories/caseRepository.ts';
import type { AuditRepository } from '../repositories/auditRepository.ts';

export interface SubmissionPackage {
  caseId: string;
  carrier: string;
  appealRoute: string | null;
  appealDeadline: string;
  letter: string;
  evidenceCount: number;
  generatedAt: string;
}

export class SubmissionError extends Error {}

export const buildSubmissionPackage = (
  cases: CaseRepository,
  audit: AuditRepository,
  caseId: string,
  actor: string,
): SubmissionPackage => {
  const c = cases.getCase(caseId);
  if (!c) throw new SubmissionError(`case ${caseId} not found`);
  if (c.state !== 'approved') {
    throw new SubmissionError(`case must be approved before submission; state is ${c.state}`);
  }
  if (!c.packet) throw new SubmissionError('case has no packet');

  const pkg: SubmissionPackage = {
    caseId: c.id,
    carrier: c.packet.carrier,
    appealRoute: c.packet.appealRoute,
    appealDeadline: c.packet.appealDeadline,
    letter: c.packet.draftLetter,
    evidenceCount: c.packet.evidence.length,
    generatedAt: new Date().toISOString(),
  };

  cases.updateCase(c.id, { state: 'submitted' });
  audit.log({
    caseId: c.id,
    actor,
    action: 'submitted',
    detail: `handoff for route ${pkg.appealRoute ?? 'n/a'} to ${pkg.carrier}`,
  });

  return pkg;
};
