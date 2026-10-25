/**
 * AIProviderPort — the AI boundary and PHI choke point.
 *
 * Every AI call in the system goes through an implementation of this port. The
 * de-identification requirement (decision 1C) is enforced by the port wrapper
 * (see ai/deidentifyingProvider.ts), NOT by callers. Concrete adapters (local
 * model, cloud) implement only `complete`; they receive already-de-identified
 * text when routed through the wrapper.
 */

export interface AiCompletionRequest {
  /** System/role instruction. */
  system: string;
  /** User prompt. For cloud routing this MUST already be de-identified. */
  prompt: string;
  /** Optional JSON schema hint for structured output. */
  jsonSchema?: unknown;
  /** Logical model tier, mapped to a concrete model by the adapter. */
  tier?: 'reasoning' | 'drafting' | 'extraction';
}

export interface AiCompletionResult {
  text: string;
  /** Adapter + model that served the request, for audit. */
  provider: string;
  model: string;
}

export interface AiProviderPort {
  readonly name: string;
  /** True if this provider sends data off the local machine. */
  readonly isCloud: boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
