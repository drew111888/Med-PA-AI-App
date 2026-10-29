> Live synthetic application demo: https://med-pa-synthetic-demo.onrender.com — temporary isolated sessions, fixed sample records and a deterministic AI stub. Never enter real patient data. See [HOSTED_ACCEPTANCE.md](HOSTED_ACCEPTANCE.md) for the exact deployed release, verified flows and remaining limits.

> This branch contains the isolated synthetic application demo. See [DEMO_RELEASE.md](DEMO_RELEASE.md) for startup/hosting boundaries and [DEMO_ACCEPTANCE.md](DEMO_ACCEPTANCE.md) for executed tests. Use the demo entry, not the ordinary practice server, for public testing. Never enter real patient data.

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

## Product backlog

Recorded **2026-10-28**. These are proposed capabilities, not implemented
transport or production-readiness claims. The current demo remains synthetic
only, with local-stub AI, no live payer delivery, and no automatic clinical
approval or sending. Close the retry/handoff acceptance defects in
`PDF_RETRY_HANDOFF.md` before adding delivery.

### Shared evidence and distinct workflows

| ID | Backlog item | Completion criteria |
|---|---|---|
| PA-01 | Shared evidence workspace | Reuse sourced chart evidence across **initial medical prior authorization**, **pre-service PA-denial appeal**, and **post-service claim reconsideration/appeal**, while preserving separate workflow types, required forms, deadlines, review gates, and case histories. Do not route one workflow using another workflow's rules. |
| PA-02 | Clinician-reviewed PDF packet | Compile a readable cover, document index, required forms, and selected evidence into a PDF. Let a clinician inspect the exact compiled output before approval. Create an immutable packet version, content hash, and manifest of included documents, their versions, page ranges, and provenance; retain links to source evidence. Missing required material blocks preparation for sending. |
| PA-03 | Verified payer routing | Resolve destination by payer, state, plan/product, and workflow. Record the official source, source/effective date, verification date and reviewer, required identifiers/forms, and channel restrictions. Unknown, expired, conflicting, or unverified routing requires review; never guess a fax number or apply a generic appeal window. Show the selected destination alongside the packet at final approval. |

### Delivery and reconciliation

| ID | Backlog item | Completion criteria |
|---|---|---|
| SEND-01 | Provider-agnostic transport adapters | Prefer a verified payer portal/API route; support tracked fax only as a verified fallback. Define common prepare/send/status/cancel capabilities with explicit unsupported operations, preserving payer-specific identifiers and receipts. EHR, AI, and transport vendors remain replaceable. Do not implement a vendor connection until access and terms are verified. |
| SEND-02 | Final human send approval | Require a separate, explicit human approval of the **current immutable packet and destination** immediately before sending. A packet, attachment, manifest, or destination change invalidates that approval. Keep clinical packet review, send authorization, workflow execution, and payer decisions separate; no automatic approval or send. Reject stale or revoked approvals server-side, including operational artifact downloads. |
| SEND-03 | Durable send ledger | Bind each send intent to packet version/hash, destination, workflow, approving actor, idempotency key, attempt, provider request ID, and timestamps. Persist the intent before transmission. On an ambiguous timeout, reconcile provider status before retrying; do not blindly resend. Repeated clicks, restarts, and concurrent requests must not create duplicate deliveries. |
| SEND-04 | Delivery states and callbacks | Track `prepared`, `transport_accepted`, `delivered`, `payer_acknowledged`, `accepted_for_processing`, and `decision` independently from case and job state. Retain failures and partial delivery as explicit outcomes. A transport receipt is not payer acceptance or a coverage decision. Authenticate callbacks, reject replay, deduplicate events, handle out-of-order updates without losing history, and reconcile missed callbacks. Require review before retrying partial or uncertain delivery. |
| SEND-05 | Inbound association, audit, and retention | Associate inbound responses using verified references; route ambiguous matches to human review rather than attaching to a guessed case. Audit packet/destination changes, approval, send attempts, callbacks, reconciliation, and human corrections without leaking document contents into logs. Define retention, access, recovery, and deletion rules across the application, hosting, and transport provider, including retained callback files and fax artifacts. |

Acceptance must include synthetic contract tests for stale/revoked approval,
duplicate clicks, concurrent sends, timeout-after-acceptance, restart recovery,
forged/replayed callbacks, out-of-order events, partial fax delivery, mismatched
inbound references, and loss of provider status. Preserve the current manual
handoff/receipt semantics until a separately reviewed transport implementation
exists; a human-entered receipt must not become a verified delivery event.

### Research and selection gates

Primary-source research checked **2026-10-28**. Reverify access, supported
workflows, pricing, contracts, and documentation before selecting a vendor or
implementing an adapter. No vendor has been chosen, and a marketing compliance
claim does not establish this application's compliance.

| Candidate or route | Evidence and remaining question |
|---|---|
| Anthem / Availity | The [Anthem New York PA page](https://providers.anthem.com/new-york-provider/claims/prior-authorization-requirements) prefers ICR through Availity for its stated PA scope; this does not establish every state's, plan's, or appeal's route. [Availity Service Reviews add-on documentation](https://developer.availity.com/blog/2025/3/4/service-reviews) currently marks IsAuthRequired unavailable to new customers and Attachments as a closed pilot unavailable to new customers. Verify payer participation and actual access before promising an API workflow. |
| UnitedHealthcare / Optum medical | The [UHC API overview](https://www.uhcprovider.com/en/resource-library/Application-Programming-Interface.html) describes Optum Real APIs and currently lists Real Prior Authorization as coming soon. Confirm the exact medical plan, transaction, onboarding requirements, and availability; the name “Optum” alone is insufficient routing evidence. |
| Optum Rx | The [Optum Rx e-PA page](https://business.optum.com/en/pharmacy-services/electronic-prior-authorization.html) describes medication requests and plan-specific questions. Keep pharmacy-benefit e-PA distinct from medical PA and claim appeals; first confirm which benefit and organization the practice means. |
| Fax candidates: Phaxio, SRFax, Documo | Compare [Phaxio pricing](https://www.phaxio.com/pricing/) and [account/security requirements](https://www.phaxio.com/docs/security/hipaa), [SRFax healthcare plans/API offering](https://www.srfax.com/fax-plans/healthcare-solutions/), and [Documo cloud fax](https://www.documo.com/cloud-fax/). These are research placeholders. Verify API access, signed callback support, status/partial-delivery semantics, BAA eligibility, storage/retention controls, support, and full cost at the practice's expected volume. No account, contract, number, or credential is authorized by this backlog. |
| PHI readiness | [HHS cloud-computing guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html) requires appropriate BAAs and risk analysis/risk management when applicable; encryption alone does not remove a cloud provider's business-associate obligations. Before PHI, review the full hosting/transport chain, security responsibilities, access controls, logging, retention, backup/recovery, and incident response. A BAA or regex redaction alone is not a compliance guarantee. |

Before prioritizing adapters, obtain the brother's exact payer/state/plan and
benefit, the initial-PA versus denial/claim workflow, the application/portal used
today, required forms and destination source, expected monthly cases/pages and
inbound volume, and the clinician/coordinator review responsibilities. Use those
answers to select one synthetic pilot workflow and its acceptance criteria;
leave other carriers and transports behind adapters.
