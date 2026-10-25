/**
 * Adapter registry — resolves configured port implementations.
 *
 * This is the single place that maps config names to concrete adapters. The
 * pipeline receives ports from here and never constructs adapters directly, so
 * swapping synthetic -> Athena (or local -> cloud AI) is a config change only.
 */

import type { AppConfig } from '../config.ts';
import type { EHRPort } from '../ports/ehrPort.ts';
import type { PayerPolicyPort } from '../ports/payerPolicyPort.ts';
import { SyntheticEhrAdapter } from './synthetic/syntheticEhrAdapter.ts';
import { SyntheticPayerPolicyAdapter } from './synthetic/syntheticPayerPolicyAdapter.ts';
import { AthenaEhrAdapter, FetchTransport } from './athena/athenaEhrAdapter.ts';

export interface Ports {
  ehr: EHRPort;
  payerPolicy: PayerPolicyPort;
}

export const resolvePorts = (config: AppConfig): Ports => {
  const ehr: EHRPort = (() => {
    switch (config.ehrAdapter) {
      case 'synthetic':
        return new SyntheticEhrAdapter();
      case 'athena': {
        // Credentials are local secrets, read from env — never from code.
        const baseUrl = process.env.ATHENA_BASE_URL;
        const practiceId = process.env.ATHENA_PRACTICE_ID;
        const clientId = process.env.ATHENA_CLIENT_ID;
        const clientSecret = process.env.ATHENA_CLIENT_SECRET;
        if (!baseUrl || !practiceId || !clientId || !clientSecret) {
          throw new Error(
            'Athena adapter requires ATHENA_BASE_URL, ATHENA_PRACTICE_ID, ' +
              'ATHENA_CLIENT_ID, ATHENA_CLIENT_SECRET in the environment.',
          );
        }
        const getToken = makeAthenaTokenProvider(baseUrl, clientId, clientSecret);
        const transport = new FetchTransport(baseUrl, getToken);
        return new AthenaEhrAdapter(transport, practiceId);
      }
      default:
        return new SyntheticEhrAdapter();
    }
  })();

  const payerPolicy: PayerPolicyPort = (() => {
    switch (config.payerPolicyAdapter) {
      case 'synthetic':
        return new SyntheticPayerPolicyAdapter();
      case 'fhir-davinci':
        throw new Error('FHIR Da Vinci payer-policy adapter not yet available (deferred).');
      default:
        return new SyntheticPayerPolicyAdapter();
    }
  })();

  return { ehr, payerPolicy };
};

/**
 * OAuth2 client-credentials token provider for Athena, with simple in-memory
 * caching until expiry. Secrets are passed in (sourced from env), not stored.
 */
const makeAthenaTokenProvider = (
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): (() => Promise<string>) => {
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
    const res = await fetch(new URL('/oauth2/v1/token', baseUrl).toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    if (!res.ok) throw new Error(`Athena token request failed: ${res.status}`);
    const json: any = await res.json();
    cached = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return cached.token;
  };
};
