/**
 * Server-side de-identification + re-identification.
 *
 * Hardened from the original browser complianceService: adds MRN, address-ish
 * and explicit-name/term redaction on top of SSN/email/phone/DOB. This is the
 * data that protects PHI before any OUTBOUND cloud AI call. The de-identifying
 * provider wrapper enforces its use; callers never call cloud adapters directly.
 *
 * NOTE: regex de-id is necessary but not sufficient for arbitrary narrative. It
 * is paired with a verification pass (verifyDeidentified) that fails closed when
 * known-PHI terms survive, so the cloud path cannot leak the specific
 * identifiers we were given.
 */

export type RedactionMapping = Record<string, string>;

export interface DeidResult {
  text: string;
  mapping: RedactionMapping;
}

/** Known explicit identifiers to redact (names, policy numbers, MRNs). */
export interface PhiHints {
  names?: string[];
  policyNumbers?: string[];
  mrns?: string[];
}

const PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'SSN', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { key: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { key: 'PHONE', re: /\b(?:\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  { key: 'DOB', re: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g },
  { key: 'MRN', re: /\bMRN[-\s:]?\w+\b/gi },
];

const escapeRe = (s: string): string => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

export const deidentify = (input: string, hints: PhiHints = {}): DeidResult => {
  let text = input;
  const mapping: RedactionMapping = {};

  const redactLiteral = (value: string, token: string) => {
    if (!value || value.trim().length < 2) return;
    const re = new RegExp(escapeRe(value), 'gi');
    if (re.test(text)) {
      text = text.replace(re, token);
      mapping[token] = value;
    }
  };

  (hints.names ?? []).forEach((n, i) => redactLiteral(n, `[NAME_${i}]`));
  (hints.policyNumbers ?? []).forEach((p, i) => redactLiteral(p, `[POLICY_${i}]`));
  (hints.mrns ?? []).forEach((m, i) => redactLiteral(m, `[MRN_${i}]`));

  for (const { key, re } of PATTERNS) {
    text = text.replace(re, (match) => {
      const token = `[${key}_${Object.keys(mapping).length}]`;
      mapping[token] = match;
      return token;
    });
  }

  return { text, mapping };
};

export const reidentify = (input: string, mapping: RedactionMapping): string => {
  let text = input;
  // Replace longer tokens first so [NAME_10] isn't clobbered by [NAME_1].
  const tokens = Object.keys(mapping).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    text = text.replace(new RegExp(escapeRe(token), 'g'), mapping[token]);
  }
  return text;
};

/**
 * Fail-closed verification: confirm none of the known PHI hint values survive in
 * the de-identified text. Returns the list of leaked values (empty = clean).
 */
export const verifyDeidentified = (text: string, hints: PhiHints = {}): string[] => {
  const leaked: string[] = [];
  const all = [
    ...(hints.names ?? []),
    ...(hints.policyNumbers ?? []),
    ...(hints.mrns ?? []),
  ];
  const lower = text.toLowerCase();
  for (const value of all) {
    if (value && value.trim().length >= 2 && lower.includes(value.toLowerCase())) {
      leaked.push(value);
    }
  }
  return leaked;
};
