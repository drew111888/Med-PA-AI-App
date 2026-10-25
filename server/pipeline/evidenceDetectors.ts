/**
 * Deterministic evidence detectors.
 *
 * Each policy requirement has an `evidenceKey`. A detector maps that key to a
 * pure function over the patient's chart documents that returns whether the
 * evidence is present plus the citations (document ids + matched snippets) that
 * support it. NO AI here — this is the deterministic gate's source of truth.
 *
 * Detection uses conservative keyword/phrase matching. The AI reasoning step
 * (Task 6) later produces narrative, but it may only run once these gates pass,
 * and its output is validated against these same citations.
 */

import type { ChartDocument } from '../domain/types.ts';

export interface EvidenceHit {
  documentId: string;
  snippet: string;
}

export interface EvidenceFinding {
  present: boolean;
  citations: EvidenceHit[];
}

type Detector = (docs: ChartDocument[]) => EvidenceFinding;

/** Find documents whose text matches ALL of the given phrase groups.
 *  Each group is an array of alternatives (OR); groups are ANDed. */
const matchAllGroups = (docs: ChartDocument[], groups: string[][]): EvidenceFinding => {
  const citations: EvidenceHit[] = [];
  for (const doc of docs) {
    const text = doc.text.toLowerCase();
    const groupHits = groups.map((alts) =>
      alts.find((phrase) => text.includes(phrase.toLowerCase())),
    );
    if (groupHits.every((hit) => hit !== undefined)) {
      citations.push({
        documentId: doc.id,
        snippet: extractSnippet(doc.text, groupHits[0] as string),
      });
    }
  }
  return { present: citations.length > 0, citations };
};

const extractSnippet = (text: string, needle: string): string => {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + needle.length + 60);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
};

export const DETECTORS: Record<string, Detector> = {
  conservative_management_failed: (docs) =>
    matchAllGroups(docs, [
      ['physical therapy', 'pt ', 'nsaid', 'medication', 'conservative'],
      ['failed', 'no relief', 'no meaningful relief', 'discontinued', 'lack of efficacy'],
    ]),

  radicular_or_neuro_deficit: (docs) =>
    matchAllGroups(docs, [
      ['radicular', 'radiating', 'neurological deficit', 'below the knee', 'below the left knee'],
    ]),

  ms_diagnosis: (docs) =>
    matchAllGroups(docs, [
      ['multiple sclerosis', 'relapsing multiple sclerosis', 'rms', 'ppms'],
    ]),

  prior_dmt_failed: (docs) =>
    matchAllGroups(docs, [
      ['dmt', 'interferon', 'disease-modifying'],
      ['failed', 'continued relapses', 'relapse'],
    ]),

  mechanical_symptoms: (docs) =>
    matchAllGroups(docs, [['mechanical locking', 'locking', 'catching']]),

  mri_meniscal_tear: (docs) =>
    matchAllGroups(docs, [['meniscal tear', 'meniscus tear']]),
};

/** Evaluate a single evidence key against the chart. Unknown keys => absent. */
export const detectEvidence = (evidenceKey: string, docs: ChartDocument[]): EvidenceFinding => {
  const detector = DETECTORS[evidenceKey];
  if (!detector) return { present: false, citations: [] };
  return detector(docs);
};
