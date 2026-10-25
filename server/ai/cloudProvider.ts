/**
 * Cloud AI provider adapter (opt-in).
 *
 * Sends requests to an off-box cloud model. It is only ever reached through the
 * DeidentifyingProvider wrapper, which guarantees the prompt has been
 * de-identified and verified first. As a defense-in-depth measure this adapter
 * ALSO refuses to run unless the request is explicitly marked de-identified, so
 * a caller cannot bypass the wrapper and send raw PHI.
 *
 * The concrete transport is intentionally abstract: a provider function is
 * injected, so Gemini/Claude/etc. are a configuration detail, not baked in.
 */

import type {
  AiProviderPort,
  AiCompletionRequest,
  AiCompletionResult,
} from '../ports/aiProviderPort.ts';

/** Marker a request MUST carry to reach the cloud transport. */
export const DEIDENTIFIED_MARKER = '__deidentified__';

export type CloudTransport = (
  request: AiCompletionRequest,
) => Promise<{ text: string; model: string }>;

export class CloudAiProvider implements AiProviderPort {
  readonly name: string;
  readonly isCloud = true;

  constructor(
    private readonly transport: CloudTransport,
    providerName = 'cloud',
  ) {
    this.name = providerName;
  }

  async complete(request: AiCompletionRequest & Record<string, unknown>): Promise<AiCompletionResult> {
    // Fail closed: structurally reject any request not marked de-identified.
    if (request[DEIDENTIFIED_MARKER] !== true) {
      throw new Error(
        'CloudAiProvider refused: request was not de-identified. ' +
          'Cloud providers must be called via DeidentifyingProvider.',
      );
    }
    const out = await this.transport(request);
    return { text: out.text, provider: this.name, model: out.model };
  }
}
