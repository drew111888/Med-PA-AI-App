import { RedactionMapping } from "../types.ts";

/**
 * Robust PHI detection patterns
 */
const PHI_PATTERNS = {
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  PHONE: /\b(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
  DOB: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
};

export const deIdentify = (text: string, phiToRedact: { name?: string; policy?: string }): { redactedText: string; mapping: RedactionMapping } => {
  let redactedText = text;
  const mapping: RedactionMapping = {};

  // Redact specific known PHI
  if (phiToRedact.name && phiToRedact.name.trim().length > 2) {
    const namePattern = new RegExp(phiToRedact.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    redactedText = redactedText.replace(namePattern, '[PATIENT_NAME]');
    mapping['[PATIENT_NAME]'] = phiToRedact.name;
  }

  if (phiToRedact.policy && phiToRedact.policy.trim().length > 2) {
    const policyPattern = new RegExp(phiToRedact.policy.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    redactedText = redactedText.replace(policyPattern, '[POLICY_ID]');
    mapping['[POLICY_ID]'] = phiToRedact.policy;
  }

  // Redact pattern-based PHI
  Object.entries(PHI_PATTERNS).forEach(([key, pattern]) => {
    redactedText = redactedText.replace(pattern, (match) => {
      const uniqueKey = `[${key}_${Object.keys(mapping).length}]`;
      mapping[uniqueKey] = match;
      return uniqueKey;
    });
  });

  return { redactedText, mapping };
};

export const reIdentify = (text: string, mapping: RedactionMapping): string => {
  let restoredText = text;
  // Sort keys by length descending to prevent partial replacement of tokens
  const sortedKeys = Object.keys(mapping).sort((a, b) => b.length - a.length);
  
  sortedKeys.forEach((token) => {
    const original = mapping[token];
    const escapedToken = token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    restoredText = restoredText.replace(new RegExp(escapedToken, 'g'), original);
  });
  
  return restoredText;
};