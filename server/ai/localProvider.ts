/**
 * Local AI provider adapter (default).
 *
 * Represents a model running ON the practice machine (e.g. Ollama/llama.cpp).
 * Because it is local, PHI never leaves the box, so the de-identifying wrapper
 * does not force redaction for this provider. For first-pass development without
 * a model installed, it runs in a deterministic "echo-reasoning" stub mode that
 * produces structured, testable output; wiring a real local HTTP model is a
 * drop-in replacement of `complete`.
 */

import type {
  AiProviderPort,
  AiCompletionRequest,
  AiCompletionResult,
} from '../ports/aiProviderPort.ts';

export interface LocalProviderOptions {
  /** Base URL of a local model server, if available (e.g. http://127.0.0.1:11434). */
  endpoint?: string;
  model?: string;
}

export class LocalAiProvider implements AiProviderPort {
  readonly name = 'local';
  readonly isCloud = false;
  private readonly model: string;

  constructor(private readonly options: LocalProviderOptions = {}) {
    this.model = options.model ?? 'local-stub';
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    // When a real local endpoint is configured, call it here. Until then, a
    // deterministic stub keeps the whole pipeline runnable and testable offline.
    if (this.options.endpoint) {
      return this.callLocalEndpoint(request);
    }
    return {
      text: stubReasoning(request),
      provider: this.name,
      model: this.model,
    };
  }

  private async callLocalEndpoint(request: AiCompletionRequest): Promise<AiCompletionResult> {
    // Minimal Ollama-style call; shape kept generic. Errors propagate.
    const res = await fetch(`${this.options.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: `${request.system}\n\n${request.prompt}`,
        stream: false,
      }),
    });
    const json: any = await res.json();
    return { text: json.response ?? '', provider: this.name, model: this.model };
  }
}

/**
 * Deterministic stand-in for a local model. Produces a structured draft that
 * echoes the de-identified prompt content so downstream validation (Task 6) has
 * something concrete and reproducible to check.
 */
const stubReasoning = (request: AiCompletionRequest): string => {
  return [
    'DRAFT APPEAL (local-stub reasoning)',
    '',
    request.prompt.trim(),
    '',
    'This draft was produced by the local stub provider for offline development.',
  ].join('\n');
};
