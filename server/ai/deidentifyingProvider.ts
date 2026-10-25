/**
 * DeidentifyingProvider — the PHI choke point for all AI calls.
 *
 * Wraps any AiProviderPort. Behavior:
 *   - De-identifies the prompt using provided PHI hints (names/policy/MRN) plus
 *     pattern redaction, before the inner provider sees it.
 *   - For CLOUD providers: verifies no known PHI survived (fail closed). If a
 *     hint value leaked, it throws and never makes the outbound call. It also
 *     stamps the de-identified marker the cloud adapter requires.
 *   - For LOCAL providers: de-id is still applied for consistency, but since the
 *     data never leaves the box, verification failure downgrades to a no-op
 *     (local is allowed to see raw PHI by design — 1C only constrains cloud).
 *   - Re-identifies the model's response locally before returning it.
 *
 * Enforcement lives here, not in callers. The pipeline asks for a provider from
 * the AI registry and always gets a wrapped one.
 */

import type {
  AiProviderPort,
  AiCompletionRequest,
  AiCompletionResult,
} from '../ports/aiProviderPort.ts';
import {
  deidentify,
  reidentify,
  verifyDeidentified,
  type PhiHints,
} from './deidentify.ts';
import { DEIDENTIFIED_MARKER } from './cloudProvider.ts';

export interface DeidCompletionRequest extends AiCompletionRequest {
  /** Known PHI to redact from the prompt before any provider call. */
  phiHints?: PhiHints;
}

export class DeidentifyingProvider implements AiProviderPort {
  readonly name: string;
  readonly isCloud: boolean;

  constructor(private readonly inner: AiProviderPort) {
    this.name = `deid(${inner.name})`;
    this.isCloud = inner.isCloud;
  }

  async complete(request: DeidCompletionRequest): Promise<AiCompletionResult> {
    const hints = request.phiHints ?? {};
    const { text: deidPrompt, mapping } = deidentify(request.prompt, hints);

    if (this.inner.isCloud) {
      const leaked = verifyDeidentified(deidPrompt, hints);
      if (leaked.length > 0) {
        // Fail closed — do NOT call the cloud provider.
        throw new Error(
          `De-identification verification failed: ${leaked.length} known PHI value(s) ` +
            `survived redaction. Cloud call blocked.`,
        );
      }
    }

    const innerRequest: AiCompletionRequest & Record<string, unknown> = {
      system: request.system,
      prompt: deidPrompt,
      jsonSchema: request.jsonSchema,
      tier: request.tier,
      // Stamp the marker the cloud adapter requires. Harmless for local.
      [DEIDENTIFIED_MARKER]: true,
    };

    const result = await this.inner.complete(innerRequest);

    // Re-identify locally before returning to the pipeline.
    return {
      ...result,
      provider: this.name,
      text: reidentify(result.text, mapping),
    };
  }
}
