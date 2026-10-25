/**
 * Core domain model for the denial-appeal pipeline.
 *
 * These types are provider-agnostic: no Athena, Gemini, or payer-specific shape
 * leaks in here. Adapters translate their external representations into these
 * entities at the boundary. CARC/RARC codes are the key the deterministic
 * classifier keys off of.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { z } from 'zod';

// --- Standardized denial codes (X12) ---

/** Claim Adjustment Reason Code — e.g. "50", "15", "197". */
export const CarcCodeSchema = z.string().min(1);
/** Remittance Advice Remark Code — e.g. "N115", "M127". */
export const RarcCodeSchema = z.string().min(1);

// --- Patient / Claim / Chart ---

export const PatientSchema = z.object({
  id: z.string(),
  mrn: z.string(),
  name: z.string(),
  dob: z.string().optional(), // ISO date
});
export type Patient = z.infer<typeof PatientSchema>;

export const ChartDocumentSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  type: z.enum([
    'progress_note',
    'imaging_report',
    'lab_result',
    'procedure_note',
    'medication_record',
    'referral',
    'other',
  ]),
  title: z.string(),
  authoredBy: z.string().optional(),
  authoredAt: z.string(), // ISO datetime
  text: z.string(), // PHI-bearing free text
});
export type ChartDocument = z.infer<typeof ChartDocumentSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  carrier: z.string(),
  cptCodes: z.array(z.string()),
  dateOfService: z.string(), // ISO date
});
export type Claim = z.infer<typeof ClaimSchema>;

// --- Denial (normalized from API or PDF) ---

export const DenialSourceSchema = z.enum(['api', 'pdf']);
export type DenialSource = z.infer<typeof DenialSourceSchema>;

export const DenialSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  source: DenialSourceSchema,
  carrier: z.string(),
  carcCodes: z.array(CarcCodeSchema),
  rarcCodes: z.array(RarcCodeSchema),
  /**
   * ISO date that starts the appeal clock. May be null when the source did not
   * provide a usable date; the deadline is then UNKNOWN and must not be fabricated.
   */
  denialDate: z.string().nullable(),
  /** Original denial narrative (PHI). Optional for API-sourced structured denials. */
  rawText: z.string().optional(),
  /** Idempotency key from the source system (e.g. remittance id). */
  externalRef: z.string().optional(),
});
export type Denial = z.infer<typeof DenialSchema>;

// --- Payer policy (shaped toward FHIR R4 + Da Vinci CRD/DTR) ---

/**
 * A single documentation / eligibility requirement the carrier imposes for a
 * given service. Maps conceptually to Da Vinci DTR questionnaire items and CRD
 * coverage requirements. Kept simple and deterministic for the rules engine.
 */
export const PolicyRequirementSchema = z.object({
  id: z.string(),
  description: z.string(),
  /** Machine key the gate engine checks chart evidence against. */
  evidenceKey: z.string(),
  required: z.boolean(),
});
export type PolicyRequirement = z.infer<typeof PolicyRequirementSchema>;

export const PayerPolicySchema = z.object({
  id: z.string(),
  carrier: z.string(),
  /** CPT codes this policy governs. */
  cptCodes: z.array(z.string()),
  title: z.string(),
  /** Appeal filing window in days from denial date. */
  appealWindowDays: z.number().int().positive(),
  /** Named appeal route/channel for this carrier + denial category. */
  appealRoute: z.string(),
  requirements: z.array(PolicyRequirementSchema),
});
export type PayerPolicy = z.infer<typeof PayerPolicySchema>;

// --- Appeal case lifecycle ---

export const AppealCaseStateSchema = z.enum([
  'intake', // denial ingested, not yet classified
  'classified', // deterministic classification done
  'gathering', // pulling chart
  'gated', // deterministic gates evaluated
  'reasoning', // AI drafting
  'packet_ready', // reviewable packet assembled AND AI-validated
  'needs_review', // packet assembled but AI validation FAILED — human review required, not approvable
  'approved', // human approved a specific packet version
  'handoff_generated', // a downloadable submission package was produced (NOT submitted)
  'submitted', // a human recorded a submission receipt to the payer
  'ineligible', // deterministic gate rejected
  'needs_more_data', // deterministic gate: required evidence missing
  'failed', // pipeline error
]);
export type AppealCaseState = z.infer<typeof AppealCaseStateSchema>;

/** States from which deadline urgency should still be surfaced (not yet sent). */
export const OPEN_FOR_DEADLINE: AppealCaseState[] = [
  'intake',
  'classified',
  'gathering',
  'gated',
  'reasoning',
  'packet_ready',
  'needs_review',
  'approved',
  'handoff_generated',
  'needs_more_data',
];

// --- Authorization roles ---

/**
 * Roles for server-side authorization. Aligned to the existing UI roles
 * (ADMIN/PROVIDER/BILLER) plus a coordinator concept: BILLER acts as the appeal
 * coordinator. Permissions are enforced on every protected API.
 */
export const RoleSchema = z.enum(['ADMIN', 'PROVIDER', 'BILLER']);
export type Role = z.infer<typeof RoleSchema>;

export type Permission =
  | 'run_pipeline' // trigger intake / poll / on-demand runs
  | 'view_cases' // read cases, packets, summary
  | 'approve_appeal' // record human approval of a packet version
  | 'generate_handoff' // produce a downloadable submission package
  | 'record_submission'; // record a human submission receipt

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ['run_pipeline', 'view_cases', 'approve_appeal', 'generate_handoff', 'record_submission'],
  // Providers own the clinical approval decision.
  PROVIDER: ['run_pipeline', 'view_cases', 'approve_appeal', 'generate_handoff', 'record_submission'],
  // Coordinators (billers) run the pipeline and handle submission logistics but
  // cannot approve the clinical appeal.
  BILLER: ['run_pipeline', 'view_cases', 'generate_handoff', 'record_submission'],
};

/** High-level category the deterministic classifier assigns. */
export const DenialCategorySchema = z.enum([
  'medical_necessity',
  'authorization',
  'missing_information',
  'coding',
  'coordination_of_benefits',
  'non_appealable',
  'unknown',
]);
export type DenialCategory = z.infer<typeof DenialCategorySchema>;
