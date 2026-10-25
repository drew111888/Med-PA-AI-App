# MedAuth AI — Local-First Autonomous Denial Appeal System

A self-hosted system that turns insurance denials into appeal packets. It detects
a denial (scheduled poll or on demand), pulls the patient's chart from the EHR,
runs a blended **deterministic + AI** pipeline, and produces a ready-to-submit
appeal packet for human review, approval, and submission handoff.

Everything runs on one local machine. PHI stays on the box.

**Prepared by:** Anthony LaVear — Lead BSA, SDIT Architecture

## Architecture

Port-and-adapter design; every external dependency is swappable by config:

- `EHRPort` — chart/denial access. Adapters: `synthetic` (default), `athena`.
- `PayerPolicyPort` — carrier appeal windows, routes, documentation rules.
  Adapter: `synthetic` (seeded rules; a FHIR Da Vinci CRD/DTR adapter is deferred).
- `AIProviderPort` — the PHI choke point. Adapters: `local` (default, on-box),
  `cloud` (opt-in). All AI calls are de-identified locally before any cloud
  request and re-identified on return; the cloud path fails closed if known PHI
  survives redaction.

Pipeline (deterministic-first; AI only on appeal-ready cases):

```
intake -> classify (CARC/RARC) -> gather chart -> gate (required-field checks)
       -> [AI reasoning -> packet] -> human approve -> submission handoff
```

The deterministic layer owns CARC/RARC interpretation, appeal deadlines,
required-field gates, and carrier appeal routing. AI owns narrative reasoning and
letter drafting, and its output is validated against the deterministic rules.

## Run locally

Prerequisites: Node.js 24+ (uses the built-in `node:sqlite`).

```bash
npm install
npm run build        # build the React UI
npm start            # start the local server at http://127.0.0.1:4000
```

For UI development with hot reload, run the Vite dev server alongside the API:

```bash
npm run dev:server   # API on :4000
npm run dev          # UI on :3000, proxies /api to :4000
```

Run the tests:

```bash
npm test
```

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `MEDAUTH_PORT` | `4000` | API/UI port |
| `MEDAUTH_HOST` | `127.0.0.1` | Bind interface (loopback keeps it local) |
| `MEDAUTH_DB_PATH` | `data/medauth.db` | Embedded SQLite file |
| `MEDAUTH_DB_ENCRYPTION_KEY` | dev key | Field encryption key for PHI at rest (set in production) |
| `MEDAUTH_EHR_ADAPTER` | `synthetic` | `synthetic` or `athena` |
| `MEDAUTH_PAYER_POLICY_ADAPTER` | `synthetic` | payer policy source |
| `MEDAUTH_AI_PROVIDER` | `local` | `local` or `cloud` |
| `MEDAUTH_ALLOW_CLOUD_AI` | `false` | must be `true` to permit cloud AI |

Athena (opt-in, when `MEDAUTH_EHR_ADAPTER=athena`): `ATHENA_BASE_URL`,
`ATHENA_PRACTICE_ID`, `ATHENA_CLIENT_ID`, `ATHENA_CLIENT_SECRET`. A live sandbox
test runs when `ATHENA_LIVE_TEST=true` with those credentials set.

## Status

The full flow is proven end to end on synthetic data (intake → classify → gather
→ gate → reason → packet → approve → submission handoff), with API-first denial
intake and PDF fallback. Real Athena and cloud AI are implemented but deferred to
live verification until credentials/endpoints are available.
