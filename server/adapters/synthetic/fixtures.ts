/**
 * Synthetic (made-up) internal data for first-pass development.
 *
 * All PHI here is fictional. These fixtures let the entire pipeline run end to
 * end with zero external systems. They deliberately cover multiple denial
 * categories so the deterministic classifier and gate engine can be exercised.
 */

import type {
  Patient,
  Claim,
  Denial,
  ChartDocument,
  PayerPolicy,
} from '../../domain/types.ts';

export const PATIENTS: Patient[] = [
  { id: 'pat_001', mrn: 'MRN-10001', name: 'Jordan A. Rivera', dob: '1972-04-18' },
  { id: 'pat_002', mrn: 'MRN-10002', name: 'Sam T. Okafor', dob: '1985-11-02' },
  { id: 'pat_003', mrn: 'MRN-10003', name: 'Dana L. Whitfield', dob: '1960-07-25' },
];

export const CLAIMS: Claim[] = [
  {
    id: 'clm_001',
    patientId: 'pat_001',
    carrier: 'Anthem',
    cptCodes: ['72148'], // Lumbar MRI
    dateOfService: '2026-09-10',
  },
  {
    id: 'clm_002',
    patientId: 'pat_002',
    carrier: 'UnitedHealthcare',
    cptCodes: ['J2350'], // Ocrevus infusion
    dateOfService: '2026-09-15',
  },
  {
    id: 'clm_003',
    patientId: 'pat_003',
    carrier: 'Anthem',
    cptCodes: ['29881'], // Knee arthroscopy
    dateOfService: '2026-09-20',
  },
];

export const DENIALS: Denial[] = [
  {
    // Medical necessity denial (CARC 50).
    id: 'den_001',
    claimId: 'clm_001',
    source: 'api',
    carrier: 'Anthem',
    carcCodes: ['50'],
    rarcCodes: ['N115'],
    denialDate: '2026-10-01',
    rawText:
      'Claim denied. The service is not medically necessary per carrier clinical policy. ' +
      'Documentation did not establish failure of conservative management.',
    externalRef: 'ANTHEM-ERA-0001',
  },
  {
    // Authorization missing/invalid (CARC 197).
    id: 'den_002',
    claimId: 'clm_002',
    source: 'api',
    carrier: 'UnitedHealthcare',
    carcCodes: ['197'],
    rarcCodes: [],
    denialDate: '2026-10-05',
    rawText:
      'Precertification/authorization absent for the billed service. Payment denied.',
    externalRef: 'UHC-ERA-0002',
  },
  {
    // Missing/insufficient information (CARC 16 + 17).
    id: 'den_003',
    claimId: 'clm_003',
    source: 'api',
    carrier: 'Anthem',
    carcCodes: ['16', '17'],
    rarcCodes: ['M127'],
    denialDate: '2026-10-08',
    rawText:
      'Claim lacks information needed for adjudication. Requested records were not received.',
    externalRef: 'ANTHEM-ERA-0003',
  },
];

export const CHART_DOCUMENTS: ChartDocument[] = [
  // Patient 001 — strong conservative-management evidence (medical necessity appeal-ready).
  {
    id: 'doc_001',
    patientId: 'pat_001',
    type: 'progress_note',
    title: 'Ortho follow-up',
    authoredBy: 'Dr. P. Nguyen',
    authoredAt: '2026-08-01T14:00:00Z',
    text:
      'Patient completed an 8-week course of physical therapy with no meaningful relief. ' +
      'Continued radicular pain radiating below the left knee. NSAID trial failed. ' +
      'MRI recommended to evaluate for disc herniation.',
  },
  {
    id: 'doc_002',
    patientId: 'pat_001',
    type: 'medication_record',
    title: 'Medication history',
    authoredAt: '2026-08-01T14:05:00Z',
    text: 'Naproxen 500mg BID x 6 weeks — discontinued for lack of efficacy. Gabapentin trialed.',
  },
  // Patient 002 — DMT trial documented (auth appeal has supporting evidence).
  {
    id: 'doc_003',
    patientId: 'pat_002',
    type: 'progress_note',
    title: 'Neurology note',
    authoredBy: 'Dr. R. Shah',
    authoredAt: '2026-09-01T10:00:00Z',
    text:
      'Diagnosis: Relapsing Multiple Sclerosis. Prior DMT (interferon beta-1a) failed with ' +
      'continued relapses. Plan: initiate Ocrevus infusion.',
  },
  // Patient 003 — sparse chart (missing-info case will show deficits).
  {
    id: 'doc_004',
    patientId: 'pat_003',
    type: 'progress_note',
    title: 'Knee eval',
    authoredBy: 'Dr. L. Kim',
    authoredAt: '2026-09-18T09:00:00Z',
    text: 'Knee pain, ongoing. Considering arthroscopy.',
  },
];

export const PAYER_POLICIES: PayerPolicy[] = [
  {
    id: 'pol_001',
    carrier: 'Anthem',
    cptCodes: ['72148', '72149'],
    title: 'Lumbar Spine MRI — Medical Necessity',
    appealWindowDays: 60,
    appealRoute: 'anthem_medical_necessity_level1',
    requirements: [
      {
        id: 'req_conservative_tx',
        description: 'Documented failed conservative management (PT and/or medication) >= 6 weeks',
        evidenceKey: 'conservative_management_failed',
        required: true,
      },
      {
        id: 'req_neuro_findings',
        description: 'Radicular pain below the knee or neurological deficit documented',
        evidenceKey: 'radicular_or_neuro_deficit',
        required: true,
      },
    ],
  },
  {
    id: 'pol_002',
    carrier: 'UnitedHealthcare',
    cptCodes: ['J2350'],
    title: 'Ocrevus (Ocrelizumab) Infusion',
    appealWindowDays: 180,
    appealRoute: 'uhc_authorization_appeal',
    requirements: [
      {
        id: 'req_ms_dx',
        description: 'Diagnosis of RMS or PPMS documented',
        evidenceKey: 'ms_diagnosis',
        required: true,
      },
      {
        id: 'req_prior_dmt',
        description: 'Trial and failure of at least one other DMT',
        evidenceKey: 'prior_dmt_failed',
        required: true,
      },
    ],
  },
  {
    id: 'pol_003',
    carrier: 'Anthem',
    cptCodes: ['29881', '29880'],
    title: 'Knee Arthroscopy',
    appealWindowDays: 60,
    appealRoute: 'anthem_missing_info_resubmit',
    requirements: [
      {
        id: 'req_mechanical',
        description: 'Objective evidence of mechanical locking/catching',
        evidenceKey: 'mechanical_symptoms',
        required: true,
      },
      {
        id: 'req_mri_correlation',
        description: 'MRI demonstrating meniscal tear correlating with findings',
        evidenceKey: 'mri_meniscal_tear',
        required: true,
      },
    ],
  },
];
