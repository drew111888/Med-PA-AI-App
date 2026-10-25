/**
 * Denial intake — normalizes denials from either source into one Denial entity.
 *
 * API-first: the EHR/remittance path (EHRPort.discoverDenials) already yields
 * structured Denial entities. PDF fallback: when only a document is available,
 * we extract the structured fields (carrier, CARC/RARC, dates) and build the
 * SAME Denial entity, so both sources flow through the identical pipeline.
 *
 * The PDF path runs text through the AIProviderPort (de-identified) for
 * extraction, but CARC/RARC codes are recovered deterministically by regex
 * first — codes are not PHI and deterministic extraction is preferred over AI
 * when the structure is machine-readable.
 */

import { z } from 'zod';
import type { AiProviderPort } from '../ports/aiProviderPort.ts';
import type { DeidCompletionRequest } from '../ai/deidentifyingProvider.ts';
import type { Denial } from '../domain/types.ts';
import { DenialSchema } from '../domain/types.ts';

export interface PdfIntakeInput {
  /** Extracted text of the denial PDF (upstream OCR/text-extraction). */
  text: string;
  /** The claim this denial is associated with (operator-supplied linkage). */
  claimId: string;
  /** Optional known carrier; AI/deterministic extraction may override. */
  carrier?: string;
  /** Stable id for the created denial. */
  denialId: string;
  /** Idempotency key (e.g. document hash). */
  externalRef?: string;
}

/** CARC codes appear as "CARC 50", "Reason Code: 50", or bare in adjustment tables. */
const CARC_PATTERNS = [
  /\bCARC[:\s]*([0-9]{1,3}[A-Z]?)\b/gi,
  /\breason code[:\s]*([0-9]{1,3}[A-Z]?)\b/gi,
  /\badjustment reason[:\s]*([0-9]{1,3}[A-Z]?)\b/gi,
];
const RARC_PATTERNS = [
  /\bRARC[:\s]*([MN][0-9]{1,4})\b/gi,
  /\bremark code[:\s]*([MN][0-9]{1,4})\b/gi,
  /\b([MN][0-9]{2,4})\b/g, // bare remark codes like N115, M127
];

const uniq = (arr: string[]) => Array.from(new Set(arr));

export const extractCodesDeterministic = (
  text: string,
): { carc: string[]; rarc: string[] } => {
  const carc: string[] = [];
  for (const re of CARC_PATTERNS) {
    for (const m of text.matchAll(re)) if (m[1]) carc.push(m[1].toUpperCase());
  }
  const rarc: string[] = [];
  for (const re of RARC_PATTERNS) {
    for (const m of text.matchAll(re)) if (m[1]) rarc.push(m[1].toUpperCase());
  }
  return { carc: uniq(carc), rarc: uniq(rarc) };
};

/** ISO-ish date extraction for the denial date (first date found). */
export const extractDenialDate = (text: string): string | null => {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
};

const ExtractionSchema = z.object({
  carrier: z.string().optional(),
  denialDate: z.string().optional(),
});

/**
 * Build a normalized Denial from a PDF. Deterministic extraction first; AI only
 * fills gaps (carrier/date) it could not recover, via the de-id choke point.
 */
export const intakeDenialFromPdf = async (
  ai: AiProviderPort,
  input: PdfIntakeInput,
): Promise<Denial> => {
  const codes = extractCodesDeterministic(input.text);
  let carrier = input.carrier;
  let denialDate = extractDenialDate(input.text) ?? undefined;

  // Only call AI if deterministic extraction left required gaps.
  if (!carrier || !denialDate) {
    const request: DeidCompletionRequest = {
      system:
        'Extract denial metadata from the text. Return ONLY JSON with keys ' +
        '"carrier" and "denialDate" (ISO yyyy-mm-dd). Do not include PHI.',
      prompt: input.text,
      tier: 'extraction',
      // The denial text may contain patient identifiers; de-id before any call.
      phiHints: {},
    };
    try {
      const result = await ai.complete(request);
      const parsed = ExtractionSchema.safeParse(safeJson(result.text));
      if (parsed.success) {
        carrier = carrier ?? parsed.data.carrier;
        denialDate = denialDate ?? parsed.data.denialDate;
      }
    } catch {
      /* AI extraction is best-effort; deterministic values still used. */
    }
  }

  const denial: Denial = {
    id: input.denialId,
    claimId: input.claimId,
    source: 'pdf',
    carrier: carrier ?? 'Unknown',
    carcCodes: codes.carc,
    rarcCodes: codes.rarc,
    denialDate: denialDate ?? new Date().toISOString().slice(0, 10),
    rawText: input.text,
    externalRef: input.externalRef,
  };

  // Validate the normalized entity — identical shape to the API path.
  return DenialSchema.parse(denial);
};

const safeJson = (text: string): unknown => {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    return JSON.parse(text);
  } catch {
    return {};
  }
};
