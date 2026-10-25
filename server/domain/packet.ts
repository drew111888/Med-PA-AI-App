/**
 * AppealPacket — the reviewable, ready-to-submit artifact the pipeline produces.
 *
 * It bundles every deterministic decision, the AI draft, and the chart evidence
 * citations so a human can review the whole basis for the appeal in one place
 * before approving submission.
 */

import type { Classification } from '../pipeline/classifier.ts';
import type { GateResult } from '../pipeline/gateEngine.ts';

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
  appealDeadline: string;
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
