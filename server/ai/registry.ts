/**
 * AI provider registry.
 *
 * Resolves the configured provider and ALWAYS returns it wrapped in the
 * DeidentifyingProvider choke point. Cloud is only selectable when both
 * aiProvider === 'cloud' AND allowCloudAi is true; otherwise the system falls
 * back to the local provider. This is the only place providers are constructed.
 */

import type { AppConfig } from '../config.ts';
import type { AiProviderPort } from '../ports/aiProviderPort.ts';
import { LocalAiProvider } from './localProvider.ts';
import { CloudAiProvider, type CloudTransport } from './cloudProvider.ts';
import { DeidentifyingProvider } from './deidentifyingProvider.ts';

export interface AiRegistryOptions {
  /** Injected cloud transport (Gemini/Claude/etc.). Required if cloud is used. */
  cloudTransport?: CloudTransport;
  localEndpoint?: string;
  localModel?: string;
}

export const resolveAiProvider = (
  config: AppConfig,
  options: AiRegistryOptions = {},
): AiProviderPort => {
  const wantsCloud = config.aiProvider === 'cloud' && config.allowCloudAi;

  let base: AiProviderPort;
  if (wantsCloud) {
    if (!options.cloudTransport) {
      throw new Error('Cloud AI selected but no cloud transport configured.');
    }
    base = new CloudAiProvider(options.cloudTransport);
  } else {
    base = new LocalAiProvider({
      endpoint: options.localEndpoint,
      model: options.localModel,
    });
  }

  // Every provider is wrapped in the de-identification choke point.
  return new DeidentifyingProvider(base);
};
