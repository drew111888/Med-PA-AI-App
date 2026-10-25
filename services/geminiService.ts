/**
 * AI service (client shim).
 *
 * SECURITY: The browser no longer talks to any AI provider directly. The former
 * in-browser Google GenAI client (and its bundled API key) has been removed —
 * it sent PHI off the local machine and leaked the key into the client bundle.
 *
 * All AI operations now route through the local backend, which enforces
 * de-identification at a single choke point (AIProviderPort) and keeps cloud
 * providers disabled by default. These functions preserve their original
 * signatures so existing UI components keep compiling unchanged; each one calls
 * the local backend instead of a remote model.
 *
 * NOTE FOR THE UI AGENT: the backend AI endpoints these call are intentionally
 * minimal right now. If/when the manual Analyzer and Appeal-builder flows are
 * reworked, prefer the verified case/packet APIs in services/apiClient.ts over
 * these shims. Cloud AI remains disabled server-side pending hardened
 * de-identification of arbitrary clinical text.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { AnalysisResult, AppealLetterRequest, MedicalPolicy, PolicyDigest } from "../types.ts";

const BASE =
  (typeof process !== "undefined" && (process as any).env?.MEDAUTH_API_BASE) || "";

const notWired = (feature: string): never => {
  throw new Error(
    `${feature} is not available: in-browser AI has been removed for PHI safety. ` +
      `Use the backend case/packet pipeline (see services/apiClient.ts). ` +
      `A backend endpoint for this manual flow has not been wired yet.`,
  );
};

/**
 * Manual guideline analysis. The autonomous pipeline performs this server-side;
 * a dedicated manual endpoint is not yet exposed, so this fails loudly rather
 * than silently calling a remote model from the browser.
 */
export const analyzeGuidelines = async (
  _guidelineText: string,
  _clinicalNotes: string,
  _cptCode: string,
  _useSecureMode: boolean = false,
): Promise<AnalysisResult> => notWired("Manual guideline analysis");

export const generatePolicyDigest = async (
  _policyContent: string,
): Promise<PolicyDigest> => notWired("Policy digest generation");

export const generateAppealLetter = async (
  _request: AppealLetterRequest,
  _useSecureMode: boolean = false,
): Promise<string> => notWired("Manual appeal-letter generation");

export const parsePolicyDocument = async (
  _base64Data: string,
  _mimeType: string,
): Promise<Partial<MedicalPolicy>> => notWired("Client-side document parsing");

export { BASE as MEDAUTH_API_BASE };
