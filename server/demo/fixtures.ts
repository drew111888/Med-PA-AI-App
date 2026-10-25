import type { DemoFixture } from './types.ts';

/** Public labels only. Neither visitors nor their headers can supply clinical input. */
export const DEMO_FIXTURES: ReadonlyArray<DemoFixture> = Object.freeze([
  { id: 'ready-review', label: 'Ready for review', description: 'Run the committed Jordan Rivera synthetic denial through the real local-stub packet pipeline.' },
  { id: 'missing-evidence', label: 'Missing evidence', description: 'Run the committed Dana Whitfield synthetic denial and inspect its evidence deficits.' },
  { id: 'unknown-date', label: 'Unknown deadline', description: 'Run a fixed synthetic intake example with no denial date. Its deadline remains unknown; retry is unavailable in this demo.' },
]);

export const DEMO_DENIAL_IDS = new Set(['den_001', 'den_002', 'den_003', 'den_demo_unknown']);
export const DEMO_UNKNOWN_DENIAL = 'den_demo_unknown';
export const DEMO_PDF_BODY = Object.freeze({
  text: 'SYNTHETIC DEMO ONLY. Anthem denial. CARC 50. RARC N115. Medical necessity appeal. The source notice date is intentionally absent.',
  claimId: 'clm_001',
  carrier: 'Anthem',
  denialId: DEMO_UNKNOWN_DENIAL,
  externalRef: 'DEMO-FIXED-UNKNOWN-DATE',
});

export const fixtureRoute = (id: string): { path: string; body: Record<string, unknown> } | null => {
  if (id === 'ready-review') return { path: '/api/run/denial/den_001', body: {} };
  if (id === 'missing-evidence') return { path: '/api/run/denial/den_003', body: {} };
  if (id === 'unknown-date') return { path: '/api/intake/pdf', body: { ...DEMO_PDF_BODY } };
  return null;
};
