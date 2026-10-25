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

Pipeline (deterministic-first; AI only on appeal-ready cases with a known deadline):

```
intake -> classify (CARC/RARC) -> gather chart -> gate (required-field checks)
       -> deadline gate -> [AI reasoning -> packet (validated)]
       -> human approve (version-bound) -> generate handoff -> record submission receipt
```

The deterministic layer owns CARC/RARC interpretation, appeal deadlines,
required-field gates, and carrier appeal routing. AI owns narrative reasoning and
letter drafting, and its output is validated against the deterministic rules.

### Case state machine

```
packet_ready  -> approved -> handoff_generated -> submitted
needs_review      (AI validation failed, deadline unknown, or incomplete — not approvable)
needs_more_data   (deterministic gate: required evidence missing)
ineligible | failed
```

- **Fail closed:** AI output that fails validation, or a packet that is
  incomplete (no evidence, empty draft, or an unknown deadline) goes to
  `needs_review` and is NOT approvable.
- **Deadlines are never fabricated.** A deadline is only `calculated` when both a
  denial date and a carrier appeal-window rule are known; otherwise it is
  `unknown_missing_date` / `unknown_missing_policy` and the case is held for
  review with the missing inputs named.
- **Handoff ≠ submission.** Generating a handoff produces a downloadable package
  but does not submit. A case is `submitted` only after a human records a
  submission receipt (channel + confirmation number). Deadline urgency is
  retained until submission is recorded.
- **Packet versioning:** editing evidence/draft bumps the packet version and
  invalidates any prior approval; stale and duplicate approvals are rejected.

### Authentication & authorization

Every data API is authenticated (opaque bearer session) and permission-checked.
The audit actor is always derived from the authenticated session, never from a
request body. Roles: `ADMIN`, `PROVIDER` (can approve), `BILLER` (coordinator —
runs the pipeline and records submission, cannot approve the clinical appeal).

### Security at rest

PHI-bearing fields are encrypted with AES-256-GCM: patient identifiers, denial
raw text, appeal packets, **job payloads**, and **audit detail** (citation
snippets). Passwords are scrypt-hashed; session tokens are stored hashed. The
former in-browser Google GenAI path has been removed — the browser never calls
any AI provider directly and no AI key is in the client bundle.

## Run locally

Prerequisites: **Node.js 24+** (required — uses the built-in `node:sqlite`).
`npm start` and `npm test` run a Node-version check (`scripts/checkNode.mjs`)
and `package.json` declares `engines.node >= 24`.

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
| `MEDAUTH_ALLOW_CLOUD_AI` | `false` | must be `true` to permit cloud AI (kept disabled) |
| `MEDAUTH_ENABLE_SCHEDULER` | `true` | start the background worker/scheduler (off under tests) |
| `MEDAUTH_POLL_INTERVAL_MS` | `300000` | scheduler poll interval; `0` disables periodic polling |

Seeded synthetic users (local dev only; override passwords via
`MEDAUTH_SEED_ADMIN_PASSWORD` / `_PROVIDER_PASSWORD` / `_COORDINATOR_PASSWORD`):
`admin` / `provider` / `coordinator`.

Athena (opt-in, when `MEDAUTH_EHR_ADAPTER=athena`): `ATHENA_BASE_URL`,
`ATHENA_PRACTICE_ID`, `ATHENA_CLIENT_ID`, `ATHENA_CLIENT_SECRET`. A live sandbox
test runs when `ATHENA_LIVE_TEST=true` with those credentials set.

## Status

Proven end to end on **synthetic data** with authentication, the full state
machine, versioned approvals, handoff-vs-submission separation, unknown-deadline
handling, job retry/repair, and restart recovery. Verified via 133 passing tests,
typecheck, client build, and a live synthetic HTTP journey.

**Explicitly NOT verified (do not assume working):**

- **Athena** integration — implemented against a fake transport only; no live
  sandbox run (no credentials). `ATHENA_LIVE_TEST` remains unexecuted.
- **Cloud AI** — disabled. Regex + known-identifier de-identification does NOT
  establish safe de-identification of arbitrary clinical text; cloud providers
  must stay off until hardened.
- **Real-model** local inference — the local provider runs a deterministic stub
  unless a real endpoint is configured; model output quality is unverified.
