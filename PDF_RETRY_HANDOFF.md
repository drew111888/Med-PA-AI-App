# PDF-only Retry Recovery & Durable Retry-Job Tracking — Handoff

> This source handoff is retained for provenance. The separate local hosted-demo
> integration candidate, its exact tested commit, and remaining release gates
> are recorded in [DEMO_RELEASE.md](DEMO_RELEASE.md#local-integration-candidate--2026-10-29).
> Acceptance of the source branch below does not establish candidate browser or
> platform acceptance.
> The source-QA server and browser-gate descriptions below are historical.
> Port 4397 now serves the isolated demo candidate; its later actual Safari
> acceptance and limits are recorded in `DEMO_RELEASE.md`.

**Prepared by:** Anthony LaVear
**Title:** Lead BSA, SDIT Architecture

Provider-agnostic, EHR-agnostic handoff. This document records the diagnosis, the
implementation, the exact branch and commit, the commands run and their results, the API
contract changes, the remaining blockers, and the evidence a UI agent needs to consume the
result.

## Local acceptance fixes — 2026-10-28

- Branch: `codex/retry-acceptance-fixes`, local only.
- Worktree: `/Users/anthonylavear/Documents/Codex/2026-10-24/task/retry-acceptance-fixes`.
- Reviewed base: `9f5d6c43cff99387fb7b78b0e9f7ddfd08145313`.
- Tested implementation commit: `9a675d0d1ca1f3c26d7185134a2b5f83b317e389`.
  A documentation-only follow-up records this handoff; resolve the branch tip with
  `git rev-parse codex/retry-acceptance-fixes`.

The first browser pass on `f548819` confirmed three remaining defects. This
follow-up fixes them without adding transport, historical artifact downloads,
packet-edit routes, or new state transitions:

1. The latest workflow job appears independently of retry permissions and case
   state, including `packet_ready`, `approved`, `handoff_generated`, and
   `submitted`. The retry action keeps its existing permission/state gates.
2. The parent-owned 409 notice renders the server's missing fields and corrective
   action after the review panel is replaced. Generic version conflicts do not
   advise re-importing a denial. The actionable 422 display is preserved.
3. The operational handoff endpoint rejects a stale version, revoked/incomplete
   current approval, an invalid lifecycle state, or an artifact whose embedded
   case/version does not match. It returns 409 with an action before delivering
   the artifact. Valid current handoffs, including submitted ones, remain
   downloadable. The UI mirrors the gate and says **Download requested**, since
   it cannot confirm a browser file save. A receipt also requires current
   approval; a stale/revoked attempt writes no receipt.

The case-detail job query now selects metadata without decoding the encrypted
denial narrative. A corrupt completed-job payload therefore cannot break an
otherwise valid detail read. Worker execution/startup handling of a corrupt
queued payload remains outside this narrow change and has not been hardened.

### Verification of the implementation commit

Node **v24.21.0**, existing matching installed dependencies, no installation, and
a clean test environment without live adapter credentials:

| Check | Actual result |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **248 passed, 1 skipped, 21 files passed**. The skipped test is live Athena; no live EHR/cloud AI/payer calls were made. |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed. |
| `node node_modules/vite/bin/vite.js build` | Passed; existing large-chunk warning remains. |
| Independent source review and `git diff --check` | No blocking findings; whitespace check passed. |

The suite includes actual loopback HTTP regressions for stale/revoked artifact
downloads, valid current/submitted downloads, regeneration returning the current
artifact, embedded-version mismatch, no receipt on rejected submission, auth,
and metadata-only detail reads. Both HTTP server helpers explicitly bind to
`127.0.0.1`. Sixteen rendering regressions cover job visibility across states,
newly fetched metadata, parent-owned 409 details, generic conflict guidance,
422 actions, and current versus invalid download controls. Rendering tests are
not browser reconciliation or click-flow evidence.

### Browser handoff and remaining acceptance

The fixed application is running only on **http://127.0.0.1:4397/**, using the
same disposable synthetic database and private encryption key as the earlier
QA pass. Health reports synthetic EHR, local-stub AI, and cloud AI disabled;
startup recovered/drained zero pending jobs. No new credentials were created.

The earlier authenticated Safari session was no longer present. The fixed build
opened at a fresh acknowledgment screen; **Proceed to Secure Login is disabled**.
No acknowledgment was accepted and no login was attempted for this new page.
Authenticated browser acceptance of this implementation is **pending owner
review of that screen**, not passed. Do not assert an active BAA unless accurate.

After the owner completes the gate, verify in Safari: job status after repair,
Refresh cases, and Dashboard-to-Cases remount; missing-row 409 action after
reconciliation; unchanged 422 guidance; stale download disabled/current download
requested; and receipt/submission separation. Full reload, role-switch, mobile,
and forced concurrent browser flows remain unrun for this revision. The earlier
66-assertion HTTP pass and browser journey belong to the reviewed base; they do
not substitute for this remaining browser acceptance.

The owner checkout remains at `9fd98ef7dbabcb89df8718e02b70acce3bfb801d` with its
pre-existing untracked review files. The hosted synthetic demo and Kiro's
branches were not changed. Nothing was pushed, merged, or deployed. Keep this
branch local pending browser acceptance and integration review.

Future provider-agnostic PA/evidence/delivery work is recorded in the existing
[README product backlog](README.md#product-backlog), with dated primary-source
research, human send approval, transport reconciliation, and PHI-readiness gates.
No vendor was selected or connected.

---

The following parts are retained as historical implementation baselines.

Scope constraints in force throughout: synthetic data only, local-stub AI only, Node 24+
only. No push, no merge to any base branch or `main`, no deploy, no credentials, no cloud
AI, no live Athena, no real PHI, no payer submission.

The historical handoff has two parts, newest first:

- **Part A — Retry/Restart Recovery Hardening** (`feat/retry-recovery-hardening`, reviewed
  baseline): D1 unconditional boot recovery, D2 additive `latestJob` surviving UI
  remount, D3 enriched actionable 409/422 bodies, D4 `retry_requested` audit attribution.
- **Part B — PDF-only Retry Recovery & Durable Retry-Job Tracking**
  (`feat/pdf-retry-recovery`, prior deliverable this branch builds on). Retained verbatim
  below for continuity.

---

# Part A — Retry/Restart Recovery Hardening

## Branch and commit (Part A — historical baseline)

- **Branch:** `feat/retry-recovery-hardening`
- **Worktree:** `/Users/anthonylavear/Med-PA-AI-App/.worktrees/retry-recovery-hardening`
- **Base branch/commit:** `feat/pdf-retry-recovery` @ `899cb1545f1b63d5970d24cdb30e4211d096a2c5`
- **Commits on this branch (base → tip):**
  - `80ed050` — `feat: harden retry recovery backend contract (FEAT-001)`
  - `f548819` — `feat: wire retry status + actionable 409/422 errors from server (FEAT-002)`
- **Code tip (reviewed/APPROVED, what the UI agent builds on):**
  **`f548819bdceee29d9c0dd7bf6adf6fb5ef916372`** (FEAT-002)
- **Final branch tip (local, unpushed):** docs-only commits layered on top of `f548819`
  (handoff + task artifacts; no code change beyond `f548819`). Resolve the live tip with
  `git -C <worktree> rev-parse feat/retry-recovery-hardening`. The authoritative pickup
  point for the UI agent is the code tip **`f548819`** above.
- **Review verdict:** `APPROVED` (`.agents/tasks/verdict.json`, no findings;
  detail in `.agents/tasks/review.md`).

## Diagnosis (D1–D4, root cause with evidence)

### D1 — Interrupted-job recovery never ran in MANUAL (scheduler-disabled) mode
`recoverInterrupted()` (`server/jobs/jobRunner.ts`) requeues jobs stuck in `'running'` and
is idempotent, but its only caller was `Scheduler.start()`
(`server/jobs/scheduler.ts`), which `server/index.ts` invoked **only** when
`config.enableScheduler` was true. With `MEDAUTH_ENABLE_SCHEDULER=false` a restart never
ran recovery+drain, so jobs left `'running'` by a crash were stranded. **Root cause: boot
recovery was coupled to the optional scheduler.**

### D2 — Retry/job status lost on UI refresh / component remount
`CaseReview` held retry status in React local state (`lastRetryJob` `useState`) set only
from the retry response. Because `<CaseReview>` is keyed by case id, a refresh or remount
discarded it. `GET /api/cases/:id` returned only `{ case, audit }` with no job
information, and the only job endpoint was a global `GET /api/jobs`. **Root cause: no
server-derived, case-scoped retry status survived remount.**

### D3 — 409/422 evidence errors not surfaced actionably in the UI
The retry handler returned `409 { error, missing:['denial_row'] }` and
`422 { error, missing:[...] }`, but `apiClient.ts` mapped only `body.error` → `.message`
and dropped `missing`; the UI rendered a generic line. **Root cause: actionable detail
existed server-side but was discarded by the client and not rendered distinctly.**

### D4 — No audit entry for the initiating user on retry
The retry route enqueued/drained but wrote no audit entry for the request itself; all
orchestrator processing steps correctly log `actor:'system'`. **Root cause: retry
initiation was unattributed (the human initiator was not recorded), while processing
attribution was already correct.**

## Implementation (D1–D4)

### D1 — Unconditional boot recovery, decoupled from the scheduler
- New `server/jobs/startupRecovery.ts` exports
  `runStartupRecovery(services): Promise<{ recovered, drained }>` — calls
  `recoverInterrupted()` then `await drain()` exactly once; safe no-op when nothing is stuck.
- `server/index.ts` calls `runStartupRecovery(ctx.services)` **unconditionally at boot,
  before** the `if (config.enableScheduler)` block, and logs the counts.
- `Scheduler.start()` no longer calls `recoverInterrupted()` or the initial `drain()` (the
  periodic interval poll + `pollOnStart` are preserved), so no path double-recovers.
- Idempotency preserved: `recoverInterrupted` requeue is a no-op on queued rows; orchestrator
  resume updates the existing `case_<denialId>` row; `insertDenial` is id-idempotent; the
  `denial:<id>` job key keeps one job per denial — so recovery creates no duplicate
  case/denial/packet/job rows.

### D2 — Additive `latestJob` on `GET /api/cases/:id`, consumed by the UI
- `JobRunner.getJobByIdempotencyKey(key)` and thin
  `getLatestJobForDenial(denialId)` (= key `denial:<id>`) return the durable `JobRow | null`.
- `GET /api/cases/:id` now returns an additive, typed, nullable field
  `latestJob: { id, status, attempts, lastError, type, updatedAt } | null`. Existing
  `case`/`audit` fields are unchanged (backward compatible).
- Client: `CaseDetail.latestJob?` mirrors the backend; `CaseReview` derives status from
  `detail.latestJob` (server truth). The `lastRetryJob` source-of-truth `useState` was
  removed; `handleRetry` keeps only a transient hint and reloads via the existing
  `onMutated(id)`, so the durable line repaints from server state after remount/refresh.

### D3 — Enriched, distinct, actionable 409/422
- Backend keeps the status codes unchanged and enriches the bodies:
  - `409` → `{ error, code:'denial_row_missing', missing:['denial_row'], action }`
  - `422` → `{ error, code:'evidence_incomplete', missing:[...], action }`
  Original `error`/`missing` keys preserved.
- Client: `ApiError.details?: { code?, missing?, action? }` parsed from the body in both
  `request()` and `downloadHandoff()` (omitted when absent — backward compatible). A
  `RetryErrorLine` renders 409 vs 422 distinctly (heading, message, missing-field list,
  action), falling back to the existing `ErrorLine` for other errors. Never an empty state.

### D4 — `retry_requested` audited to the initiating user; processing stays `system`
- The retry handler logs exactly one
  `audit.log({ caseId, actor: req.authUser!.id, action:'retry_requested', detail })` after
  the 422 gate and before enqueue. Actor is **server-derived** (`req.authUser.id`); any
  body `actor` is ignored. No orchestrator audit call changed — processing stays
  `actor:'system'`.

### Safety boundaries — preserved
Retry remains guarded by `requireAuth` + `requirePermission('run_pipeline')` (401 without a
token; BILLER/coordinator succeeds). Encryption at rest, fail-closed AI validation,
unknown-deadline approval blocking, packet versioning, stale-approval/stale-handoff
protection, and the separate `packet_ready`/`approved`/`handoff_generated`/`submitted`
states are untouched. Retry can never auto-approve or auto-submit. No safety test was
weakened or deleted (the three new test files are additive, 0 deletions).

## API contract changes (Part A)

1. **`GET /api/cases/:id`** — gains an **additive**, typed, nullable field:
   ```json
   "latestJob": { "id": "...", "status": "queued|running|done|failed",
                  "attempts": 0, "lastError": null, "type": "process_denial",
                  "updatedAt": "..." }
   ```
   or `"latestJob": null`. Resolved via the `denial:<case.denialId>` idempotency key.
   Existing `case`/`audit` fields unchanged → backward compatible. This is the server truth
   the UI reads so retry status survives refresh/remount.
2. **`POST /api/cases/:id/retry`** — status codes unchanged; error bodies **enriched**:
   - `409 { error, code:'denial_row_missing', missing:['denial_row'], action }`
   - `422 { error, code:'evidence_incomplete', missing:[...], action }`
   `code` and `action` are additive; `error`/`missing` preserved.
3. **No new endpoints**; no async `/run/*` contract changes.

## Commands run and results (Part A — final verification, this worktree)

Runtime: `node --version` → **v24.21.0** (`engines.node >= 24.0.0`; `pretest` runs the
Node-24 guard `scripts/checkNode.mjs`).

| Check | Command | Result | Counts |
|-------|---------|--------|--------|
| Test suite | `npm test` (`vitest run`) | **PASSED** (exit 0) | 20 files · **227 passed / 0 failed / 1 skipped** (228 total) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASSED** (exit 0) | 0 errors |
| Build | `npm run build` (`vite build`) | **PASSED** (exit 0) | 1953 modules, built in ~1.3s; >500 kB chunk advisory only (non-fatal) |

- The single skip is the expected live-Athena integration test
  (`server/adapters/athena/athenaEhrAdapter.test.ts`) — must stay skipped (unverified by design).
- New regression tests added on this branch (all additive, none weakened):
  - `server/jobs/jobRunner.test.ts` — `runStartupRecovery` MANUAL-mode interrupted-job
    recovery (recovered===1, drains to `done`, case `packet_ready`, exactly one
    denial/case/job row), no-op case (recovered===0/drained===0, no new rows), and
    `getLatestJobForDenial` durable lookup + null for unknown denial.
  - `server/app.test.ts` — boot recovery via real `createApp` services; `latestJob`
    present after run and surviving a **fresh** GET after retry; 409/422 enriched body
    shapes with preserved status codes; `retry_requested` audited to `/^usr_/` (spoofed
    body `actor` ignored) while processing stays `actor:'system'`; permission 401/200.
  - `tests/client/apiClientMutations.test.ts` — `ApiError.details` populated from 409/422
    bodies, `undefined` for a plain body.

**Verification level: L4 (build-verified)** plus full unit/HTTP suite and typecheck.
Browser runtime of the React UI is **NOT RUNTIME VERIFIED** on this base (no browser
harness present) — handed to the UI agent.

## Remaining blockers / unverified (Part A)

- **Browser runtime (React UI) — NOT RUNTIME VERIFIED.** No Playwright/Cypress/Puppeteer/
  DOM-render harness exists on this base; `tests/client/*` are unit-level. A UI-agent
  browser pass is required to confirm the UI consumes `latestJob`, shows durable status
  across refresh/remount, and renders the distinct 409/422 actionable errors.
- **Live Athena — unverified** (synthetic adapter only; Athena test stays skipped).
- **Cloud AI / real model — disabled and unverified** (local-stub AI only).
- Non-blocking note: concurrent retries each write one `retry_requested` audit entry (one
  per request) while still producing a single durable `denial:<id>` job row — consistent
  with "one audit entry per retry request."

## Evidence a UI agent needs to pick this up (Part A)

1. **Durable retry status is server truth:** read `latestJob` from `GET /api/cases/:id`
   (`{ id, status, attempts, lastError, type, updatedAt }` or `null`). Render from this
   after every reload so status survives refresh/remount — do not rely on response-only
   local state.
2. **Retry success body** still carries `jobId`/`jobStatus`/`attempts`; prefer `state` and
   the reloaded `latestJob` as the source of truth (no optimistic advance).
3. **Actionable errors:** `409 { code:'denial_row_missing', missing:['denial_row'], action }`
   vs `422 { code:'evidence_incomplete', missing:[...], action }` — render heading, message,
   the `missing` list, and `action` distinctly per code. `ApiError.details` exposes them.
4. **Permissions unchanged:** retry needs `run_pipeline` (401 without a token, 403 without
   the permission; BILLER has it).
5. Retry can never auto-approve or auto-submit; approval/handoff/submission stay separate,
   human-driven, version-checked states.

---

# Part B — PDF-only Retry Recovery & Durable Retry-Job Tracking (prior work, retained)

---

## Branch and commit

- **Branch:** `feat/pdf-retry-recovery`
- **Worktree:** `/Users/anthonylavear/Med-PA-AI-App/.worktrees/pdf-retry-recovery`
- **Base branch:** `codex/runtime-ui-acceptance`
- **Base commit:** `378141dcc5d5b7b41b67e99c79b4b7854ff7af82` ("fix: preserve case review state during runtime navigation")
- **Final commit (local, unpushed):** `caa41aec1c95a518373b1e4e68acc6406859a138`
  (the `feat:` commit carrying the code, tests, and this handoff doc; a small follow-up
  `docs:` commit records this SHA in the file and is the branch tip)

---

## Diagnosis

`POST /api/cases/:id/retry` (in `server/routes/caseRoutes.ts`) had two defects:

1. **EHR-discovery dependency (the core bug).** The handler resolved the underlying
   denial through `ehr.discoverDenials().find(d => d.id === c.denialId)`. PDF-intake
   denials are persisted in the `denials` table but are **never** returned by
   `discoverDenials()` — the synthetic adapter only yields its fixture `DENIALS`.
   Consequently every PDF-sourced case failed retry with a `409` ("denial … is no longer
   discoverable; cannot retry"), even though the normalized denial already existed in the
   database. PDF intake is the practice's primary path (they usually receive or fetch a
   PDF), so this blocked the main real-world case.

2. **Direct `processDenial` bypass of the durable job queue.** The handler called
   `processDenial(orchestratorDeps, denial)` directly. That execution was not persisted,
   not attempt-tracked, and not recoverable after a restart — unlike the `/run` endpoints,
   which correctly enqueue a durable `process_denial` job and `drain()` it. A successful
   retry **request** could therefore imply completed **processing** that was never durably
   recorded, and interrupted work could not be recovered.

---

## Implementation

### 1. Persisted-denial reconstruction (no EHR rediscovery)

Added a typed read method `getDenial(denialId): Denial | null` to `CaseRepository`
(`server/repositories/caseRepository.ts`). It reads the `denials` row by `id` and rebuilds
a fully-typed `Denial` entirely from persisted state:

- `JSON.parse` of `carc_codes` / `rarc_codes`,
- decrypt `raw_text_enc` → `rawText` (via `decryptField`; `undefined` when the column is null),
- `source` (`'api' | 'pdf'`) read **verbatim** — provenance is never re-derived or mutated,
- `carrier`, nullable `denialDate`, and optional `externalRef` (`undefined` when null),
- validated with `DenialSchema.parse(...)` so the reconstructed entity is shape-identical
  to the API and PDF intake paths.

The retry handler replaced the `ehr.discoverDenials()` resolution with
`cases.getDenial(c.denialId)`. This works identically for `source:'pdf'` and `source:'api'`
and requires **no EHR external reference**. Claim/patient/chart resolution during the
re-run is unchanged — `processDenial` resolves those through `getClaim`/`getPatient`/
`getChartDocuments`, and PDF cases already supply an operator `claimId` that resolved at
intake. Only the **denial** now comes from the DB.

### 2. Job-runner routing (durable execution)

The retry handler now routes through the durable job runner instead of calling
`processDenial` directly. The direct `processDenial` import and the `orchestratorDeps`
destructure were removed from the route. Flow:

```
jobId = jobs.enqueueRetryProcessDenial(denial, denial.id)   // idempotency key: denial:<id>
await jobs.drain()                                           // run queued work
after = cases.getCase(c.id)                                  // re-read ACTUAL state
job   = jobs.getJob(jobId)                                   // read durable job status/attempts
```

A new `enqueueRetryProcessDenial(denial, denialId)` was added to `JobRunner`
(`server/jobs/jobRunner.ts`). It keeps exactly **one** durable job per denial keyed on
`denial:<id>`:

- **no existing job** → create a fresh `queued` `process_denial` job;
- **queued / running** → reconcile: return the SAME job id (no conflicting second job);
- **done / failed (terminal)** → re-queue the SAME row (same id, preserved attempt history,
  payload refreshed and re-encrypted, `last_error` cleared) so a human-requested retry
  genuinely re-runs rather than returning an inert terminal job.

Job state and attempts are persisted in the `jobs` table. Interrupted retries are
recoverable after restart via the existing `recoverInterrupted()` + scheduler/`drain()`
mechanism (unchanged). The orchestrator's resume branch updates the **existing** case
(case id is deterministically `case_<denialId>` for both PDF and EHR intake), and
`insertDenial` is id-idempotent, so no duplicate case / denial / packet rows are created.

### 3. Idempotency and duplicate prevention

- **Single job per denial** via the `denial:<id>` idempotency key: repeated or concurrent
  retry requests reconcile to one job id; no overlapping second job is created.
- **No duplicate case/denial/packet:** resume updates the existing `case_<denialId>` row;
  `insertDenial` upserts on the denial id.
- **Honest response:** the handler returns the ACTUAL post-drain case state plus
  `jobId` / `jobStatus` / `attempts`. `packetReady` is DERIVED (`state === 'packet_ready'`),
  never an asserted/hardcoded success. A successful request does not imply completion.
- **Missing evidence returns an explicit blocker, never fabricated data** (see API
  contract below).

### 4. Safety boundaries preserved

Retry routes through the same orchestrator/repository/handoff code, so every existing R4
safety invariant is reused verbatim rather than re-implemented:

- Bearer auth (`requireAuth`) + `requirePermission('run_pipeline')` on retry (unchanged);
- server-derived audit actor; encryption at rest (`raw_text_enc`, gate, packet,
  job `payload_enc` + `last_error`, audit `detail_enc`);
- fail-closed AI validation → `needs_review`; unknown-deadline hold;
- packet version checks; stale-approval invalidation (`updateCase` bumps `packet_version`
  and clears approval on packet-hash change); stale-handoff `409` on submit;
- separate `packet_ready` / `approved` / `handoff_generated` / `submitted` states.
  `packet_ready` / `approved` / `submitted` are **not** in the retryable set, so retry can
  never auto-approve or auto-submit.

### 5. UI wiring (minimal)

`components/Cases.tsx`: on retry success it captures `jobId` / `jobStatus` / `attempts` and
renders a "Last retry: job … · status · attempt n" line inside the existing Package-4 retry
panel; server state is refreshed via the existing `onMutated` (no optimistic advance). The
error path keeps the existing `ErrorLine` / conflict rendering, so a `422`/`409`
`{error, missing}` body renders as a distinct, actionable message. Retry-button gating is
unchanged (state-based; already enables PDF-sourced held/failed cases). Base-branch runtime
UI fixes were not touched. No redesign, no packet-edit or scheduling UI.

---

## API contract changes

### Retry: `POST /api/cases/:id/retry`

**Before** (success 200):

```json
{ "caseId": "...", "state": "...", "packetReady": false }
```

**After** (success 200):

```json
{
  "caseId": "...",
  "state": "...",
  "jobId": "...",
  "jobStatus": "queued|running|done|failed|null",
  "attempts": 0,
  "packetReady": false
}
```

- `state` is the ACTUAL re-read case state after drain.
- `jobStatus` / `attempts` come from the durable `jobs` row.
- `packetReady` is derived from `state === 'packet_ready'` (backward-compatible convenience).
- Client typing updated in `services/apiClient.ts` (`retryCase`); call signature unchanged,
  so the change is backward compatible.

**New / changed error bodies (actionable missing-evidence blocker):**

| Status | Condition | Body |
|--------|-----------|------|
| `409` | Case not in a retryable state | `{ "error": "cannot retry from state <state>" }` (unchanged) |
| `409` | Denial has no persisted DB row | `{ "error": "denial <id> has no persisted record; cannot retry", "missing": ["denial_row"] }` |
| `422` | Denial missing mandatory normalized fields | `{ "error": "denial <id> is missing required fields for retry: <list>", "missing": ["claimId"\|"carcCodes_or_rarcCodes", ...] }` |
| `401` | No/invalid token | auth error (unchanged) |
| `403` | Role lacks `run_pipeline` | permission error (unchanged) |

Note: the prior `409 "denial … is no longer discoverable"` body was replaced by the
`"has no persisted record"` body. Missing-evidence errors return **before** any job is
enqueued (no job created, no state advance). The denial **date** is intentionally NOT a
retry blocker — a missing date is a legitimate `needs_review` outcome the pipeline already
surfaces.

---

## Commands run and results

Runtime: `node --version` → **v24.21.0** (`engines.node >= 24.0.0` satisfied; `pretest`
runs the Node-24 guard `scripts/checkNode.mjs`). npm `11.19.0`.

Baseline (recorded BEFORE any application-code change) vs final verification:

| Check | Command | Baseline | Final | Result |
|-------|---------|----------|-------|--------|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) | PASS (exit 0) | **PASSED** |
| Test suite | `npm test` (`vitest run`) | 20 files · 200 total · **199 passed / 0 failed / 1 skipped** | 20 files · 214 total · **213 passed / 0 failed / 1 skipped** | **PASSED — +14 new tests, no regression** |
| Build | `npm run build` (`vite build`) | PASS — 1953 modules, ~1.04s (chunk-size advisory only) | PASS — 1953 modules, ~1.07s (chunk-size advisory only) | **PASSED** |
| HTTP smoke | live `tsx server/index.ts`, temp gitignored DB, persisted-state asserted via `node:sqlite` | — | full journey green | **PASSED (server/HTTP only)** |
| Browser acceptance | none available | — | no harness present | **NOT RUNTIME VERIFIED** |

- The single skip is the expected live-Athena skip
  (`server/adapters/athena/athenaEhrAdapter.test.ts`). It must stay skipped.
- The +14 tests are the new PDF-retry / durable-job regression tests (3 repository + 10 app
  + 1 client). Baseline 199 passed / 1 skipped is fully preserved — no regression.

**HTTP smoke detail** (harness `.agents/tasks/smoke.mjs`; real server, isolated temp
`MEDAUTH_DB_PATH` under gitignored `data/`, loopback ephemeral port):

- Phase 1 (scheduler OFF — retry drains in-request):
  - Intake synthetic PDF denial → `200`, case `needs_review` (no-date PDF holds, by design). **PASSED**
  - Drive case to `failed` (direct DB write) → state `failed`. **PASSED**
  - Retry → `200`, real `jobId`, `jobStatus=done`, `attempts=2`, resulting state `needs_review`
    (≠ the forced `failed`) — a genuine re-run, not a fabricated success. **PASSED**
  - Persisted-state agreement + provenance → DB state == response state; `denials.source='pdf'` preserved. **PASSED**
  - Repeat retry → no duplicate rows: denials=1, cases=1, jobs=1 (same job id reconciled). **PASSED**
  - Unauthorized (no token) → `401`. **PASSED**
  - Unauthorized (GUEST role lacking `run_pipeline`) → `403`. **PASSED**
- Phase 2 (scheduler ON — startup `recoverInterrupted()` + drain):
  - Force a retry job to `running` + case to `failed` (simulate crash) → 1 running job. **PASSED**
  - Restart with scheduler → recover + drain → job `done`, case `needs_review` (not failed);
    denials=1, cases=1, jobs=1; 1 `job_recovery` audit entry. **PASSED**

All temp DB files created under gitignored `data/` were removed after the smoke; no real
DB was touched; no application code was modified during verification.

**Safety boundaries regression-tested** (server HTTP + persisted-state assertions, plus the
new vitest regression suite):

- PDF-only retry success + provenance (`source='pdf'`) preserved;
- missing denial row → `409` (no job created, no state advance);
- missing mandatory codes → `422` (no job);
- non-retryable state (e.g. `packet_ready` / `submitted`) → `409` with the state-specific message;
- idempotent repeated retries → single job / case / denial;
- concurrent/overlapping retries → single `denial:<id>` job, no conflicting second job;
- failure-then-retry repair (EHR path `den_001` `failed` → `packet_ready`);
- interruption + restart recovery (`recoverInterrupted()` + drain) → consistent state, no duplicates;
- unauthorized retry → `401`; role lacking `run_pipeline` → `403`;
- stale-approval / stale-handoff protection after a packet-hash change (no auto-approve / auto-submit).

---

## Verification level

- **L2 Static Verified** — typecheck clean.
- **L3 Test Verified** — full suite green, no baseline regression (+14 tests).
- **L4 Build Verified** — production build succeeds.
- **L5 Runtime Verified (server / HTTP only)** — live server exercised the full
  PDF intake → failed → retry → repeat retry → unauthorized → restart-recovery journey with
  persisted-state assertions against a temp DB.
- **UI: NOT RUNTIME VERIFIED** — no browser harness on this base.

---

## Remaining blockers / unverified items (explicitly out of scope and unverified)

- **Browser runtime (React UI) — NOT RUNTIME VERIFIED.** There is no browser acceptance
  harness on this base (no Playwright, Cypress, Puppeteer, WebdriverIO, or
  `@testing-library` rendering the UI in a DOM). The `tests/client/*.test.ts` suites are
  unit-level (API client / view helpers). A manual or UI-agent browser pass is required to
  confirm the UI consumes the real retry contract, durable status, and actionable errors.
- **Live Athena — unverified.** Only the synthetic EHR adapter was exercised; the Athena
  adapter test stays skipped. No live credentials, no live connection.
- **Cloud AI — disabled and unverified.** Local-stub AI only. Regex/known-identifier tests
  do not establish safe de-identification of arbitrary clinical text.
- **Real model — unverified.** No real LLM was invoked.

None of the above were enabled, configured, or tested; all remain explicitly out of scope.

---

## Evidence a UI agent needs to pick this up

1. **Retry contract (success 200):**
   `{ caseId, state, jobId, jobStatus, attempts, packetReady }`.
   - Render `state` as the source of truth (do not optimistically advance).
   - Surface `jobId` / `jobStatus` / `attempts` for durable retry status.
   - `packetReady` is derived from `state === 'packet_ready'`; prefer reading `state`.
2. **Job-status / attempts fields:**
   - `jobStatus ∈ { queued, running, done, failed, null }`.
   - `attempts` is the cumulative durable attempt count for the `denial:<id>` job.
   - The jobs list view (`listJobs` / `JobRow`) already exposes `status` and `attempts` for
     a runs/jobs panel.
3. **Distinct error bodies to render actionably:**
   - `409 { error: "cannot retry from state <state>" }` — not in a retryable state.
   - `409 { error, missing: ["denial_row"] }` — no persisted denial record.
   - `422 { error, missing: ["claimId" | "carcCodes_or_rarcCodes", ...] }` — missing
     mandatory evidence; show the actionable `error` text and the `missing` list.
   - `401` / `403` — auth / permission (`run_pipeline`).
   The client surfaces these via `ApiError.kind`; render `error` (and optionally `missing`)
   distinctly rather than collapsing to an empty state.
4. **Which states can be retried:**
   - Retryable: `failed`, `needs_more_data`, `needs_review`.
   - Not retryable (retry button hidden/disabled; server returns `409`): `packet_ready`,
     `approved`, `handoff_generated`, `submitted`, `ineligible`.
   - Retry can never auto-approve or auto-submit; approval/handoff/submission remain
     separate, human-driven, version-checked states.
