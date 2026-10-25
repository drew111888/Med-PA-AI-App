/**
 * Assembles the final AppealPacket from completed pipeline outputs.
 */

import type { AppealPacket, PacketEvidenceItem } from '../domain/packet.ts';
import type { Patient, Denial } from '../domain/types.ts';
import type { Classification } from './classifier.ts';
import type { GateResult } from './gateEngine.ts';
import type { ReasoningOutput } from './reasoning.ts';

export interface BuildPacketInput {
  caseId: string;
  denial: Denial;
  patient: Patient;
  classification: Classification;
  gate: GateResult;
  reasoning: ReasoningOutput;
}

export const buildPacket = (input: BuildPacketInput): AppealPacket => {
  const evidence: PacketEvidenceItem[] = input.gate.satisfied.flatMap((check) =>
    check.citations.map((c) => ({
      requirementId: check.requirementId,
      description: check.description,
      documentId: c.documentId,
      snippet: c.snippet,
    })),
  );

  return {
    caseId: input.caseId,
    denialId: input.denial.id,
    patientId: input.patient.id,
    carrier: input.denial.carrier,
    category: input.classification.category,
    appealRoute: input.classification.appealRoute,
    appealDeadline: input.classification.appealDeadline,
    classification: input.classification,
    gate: input.gate,
    evidence,
    draftLetter: input.reasoning.draftLetter,
    aiProvider: input.reasoning.provider,
    aiModel: input.reasoning.model,
    aiValidationPassed: input.reasoning.validation.valid,
    aiValidationIssues: input.reasoning.validation.issues,
    createdAt: new Date().toISOString(),
  };
};
