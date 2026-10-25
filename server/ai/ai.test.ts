import { describe, it, expect, vi } from 'vitest';
import { deidentify, reidentify, verifyDeidentified } from './deidentify.ts';
import * as deidModule from './deidentify.ts';
import { LocalAiProvider } from './localProvider.ts';
import { CloudAiProvider, DEIDENTIFIED_MARKER, type CloudTransport } from './cloudProvider.ts';
import { DeidentifyingProvider } from './deidentifyingProvider.ts';
import { resolveAiProvider } from './registry.ts';
import { loadConfig, resetConfigCache } from '../config.ts';

describe('de-identification primitives', () => {
  it('redacts explicit names, policy numbers, MRNs and patterns', () => {
    const input =
      'Jordan A. Rivera (MRN-10001), policy ABC123, SSN 123-45-6789, DOB 04/18/1972, ' +
      'email jordan@example.com, phone 555-123-4567.';
    const { text, mapping } = deidentify(input, {
      names: ['Jordan A. Rivera'],
      policyNumbers: ['ABC123'],
      mrns: ['MRN-10001'],
    });
    expect(text).not.toContain('Jordan A. Rivera');
    expect(text).not.toContain('ABC123');
    expect(text).not.toContain('123-45-6789');
    expect(text).not.toContain('jordan@example.com');
    expect(text).not.toContain('555-123-4567');
    // round-trip restores the original
    expect(reidentify(text, mapping)).toContain('Jordan A. Rivera');
  });

  it('verifyDeidentified flags surviving known PHI', () => {
    const leaked = verifyDeidentified('patient Jordan A. Rivera', {
      names: ['Jordan A. Rivera'],
    });
    expect(leaked).toContain('Jordan A. Rivera');
  });

  it('verifyDeidentified returns empty when clean', () => {
    const { text } = deidentify('Jordan A. Rivera here', { names: ['Jordan A. Rivera'] });
    expect(verifyDeidentified(text, { names: ['Jordan A. Rivera'] })).toEqual([]);
  });
});

describe('DeidentifyingProvider over a local provider', () => {
  it('re-identifies the response and never requires redaction to pass locally', async () => {
    const local = new LocalAiProvider();
    const provider = new DeidentifyingProvider(local);
    const result = await provider.complete({
      system: 'sys',
      prompt: 'Draft appeal for Jordan A. Rivera.',
      phiHints: { names: ['Jordan A. Rivera'] },
    });
    // local stub echoes the (de-identified) prompt; after re-id the name returns.
    expect(result.text).toContain('Jordan A. Rivera');
    expect(result.provider).toContain('deid(local)');
  });
});

describe('DeidentifyingProvider over a cloud provider', () => {
  it('sends NO PHI in the outbound payload', async () => {
    const seen: string[] = [];
    const transport: CloudTransport = async (req) => {
      seen.push(req.prompt);
      return { text: 'Cloud draft for [NAME_0].', model: 'cloud-model-x' };
    };
    const cloud = new CloudAiProvider(transport);
    const provider = new DeidentifyingProvider(cloud);

    const result = await provider.complete({
      system: 'sys',
      prompt: 'Appeal for Jordan A. Rivera, MRN-10001, SSN 123-45-6789.',
      phiHints: { names: ['Jordan A. Rivera'], mrns: ['MRN-10001'] },
    });

    // Outbound payload the cloud transport actually received must be clean.
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain('Jordan A. Rivera');
    expect(seen[0]).not.toContain('MRN-10001');
    expect(seen[0]).not.toContain('123-45-6789');
    // Returned text is re-identified locally.
    expect(result.text).toContain('Jordan A. Rivera');
  });

  it('blocks the cloud call (fail closed) when verification reports a leak', async () => {
    // Force verifyDeidentified to report surviving PHI, isolating the wrapper's
    // fail-closed branch regardless of the regex redactor's behavior.
    const spy = vi
      .spyOn(deidModule, 'verifyDeidentified')
      .mockReturnValue(['Jordan A. Rivera']);
    try {
      const transport = vi.fn<CloudTransport>(async () => ({ text: 'x', model: 'm' }));
      const cloud = new CloudAiProvider(transport);
      const provider = new DeidentifyingProvider(cloud);
      await expect(
        provider.complete({
          system: 's',
          prompt: 'Appeal for Jordan A. Rivera.',
          phiHints: { names: ['Jordan A. Rivera'] },
        }),
      ).rejects.toThrow(/verification failed/i);
      expect(transport).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('CloudAiProvider structural guard', () => {
  it('refuses a request lacking the de-identified marker', async () => {
    const transport = vi.fn<CloudTransport>(async () => ({ text: 'x', model: 'm' }));
    const cloud = new CloudAiProvider(transport);
    await expect(cloud.complete({ system: 's', prompt: 'raw PHI' } as any)).rejects.toThrow(
      /not de-identified/i,
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it('allows a request carrying the marker', async () => {
    const transport = vi.fn<CloudTransport>(async () => ({ text: 'ok', model: 'm' }));
    const cloud = new CloudAiProvider(transport);
    const res = await cloud.complete({
      system: 's',
      prompt: 'clean',
      [DEIDENTIFIED_MARKER]: true,
    } as any);
    expect(res.text).toBe('ok');
    expect(transport).toHaveBeenCalledOnce();
  });
});

describe('AI registry (provider swap)', () => {
  it('defaults to a de-id-wrapped local provider', () => {
    resetConfigCache();
    const config = loadConfig({ aiProvider: 'local', allowCloudAi: false });
    const provider = resolveAiProvider(config);
    expect(provider.isCloud).toBe(false);
    expect(provider.name).toContain('deid(local)');
  });

  it('selects cloud only when allowed, wrapped in de-id', () => {
    resetConfigCache();
    const config = loadConfig({ aiProvider: 'cloud', allowCloudAi: true });
    const provider = resolveAiProvider(config, {
      cloudTransport: async () => ({ text: 'x', model: 'm' }),
    });
    expect(provider.isCloud).toBe(true);
    expect(provider.name).toContain('deid(cloud)');
  });

  it('falls back to local when cloud requested but not allowed', () => {
    resetConfigCache();
    const config = loadConfig({ aiProvider: 'cloud', allowCloudAi: false });
    const provider = resolveAiProvider(config);
    expect(provider.isCloud).toBe(false);
  });
});
