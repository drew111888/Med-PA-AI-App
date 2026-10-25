# Verification — UI Wiring Packages 1 & 2 (READ-ONLY increment)

Author / Prepared by: Anthony LaVear — Lead BSA, SDIT Architecture
Branch: `feat/ui-wiring-1-2`
Worktree: `/Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-1-2`

This increment wires the React/Vite frontend onto the hardened local backend for
Package 1 (server-backed auth + capabilities + centralized typed fetch) and
Package 2 (read-only typed list/detail/summary/jobs rendering). NO mutation is
wired (approve, generate handoff, download handoff, record submission, retry are
display-only/omitted). Contracts were taken from the server source
(`server/routes/caseRoutes.ts`, `server/auth/authRoutes.ts`, `server/domain/types.ts`,
`server/pipeline/classifier.ts`, `server/pipeline/gateEngine.ts`,
`server/domain/packet.ts`, `server/repositories/caseRepository.ts`,
`server/repositories/auditRepository.ts`, `server/jobs/jobRunner.ts`,
`server/app.ts` health), not from guesses.

## Commands run and results

### 1. `node --version`
```
v24.21.0
```
Expectation v24.x — MET.

### 2. `npm run typecheck`  (`tsc --noEmit`)
Result: clean, exit 0, no diagnostics.

### 3. `npm test`  (`vitest run`)
Result: **175 passed | 1 skipped (176 total)**, 18 test files, exit 0.
- Backend baseline preserved: the prior **152 passed / 1 skipped** backend figure
  did not drop (no backend test was weakened or deleted).
- New client tests added: **23 passed** across 3 files:
  - `tests/client/apiClient.test.ts` — 13 tests (401/403/400/404/409/500/network
    outcome mapping; error never collapsed to empty list; bearer token attached
    on protected + download/receipt calls and omitted on health/login; no request
    body ever contains `actor`; login body is only username/password).
  - `tests/client/capabilities.test.ts` — 4 tests (ADMIN/PROVIDER approve; BILLER
    coordinator cannot approve but can run/view-handoff/record-submission;
    null/undefined → no capabilities).
  - `tests/client/deadlineView.test.ts` — 6 tests (unknown deadline shows blockers
    and never 'null'/day count; known deadline labelled synthetic rule; urgent ≤14d;
    past-due handled without numeric comparison on null).

Baseline (before changes) confirmed separately at 152 passed / 1 skipped.

### 4. `npm run build`  (`vite build`)
Result: succeeded, exit 0, 1952 modules transformed, `dist/` emitted.
Note: a pre-existing "chunks larger than 500 kB" advisory is printed; it is a
non-blocking Vite warning unrelated to this change.

### 5. Runtime curl smoke — temp DB, scheduler OFF
Server started with `MEDAUTH_DB_PATH=<tmp> MEDAUTH_ENABLE_SCHEDULER=false
MEDAUTH_PORT=4100 npm start`. Empty temp DB seeds the three synthetic dev users.
Results:

| Check | Expected | Actual |
|---|---|---|
| `GET /api/health` (public) | 200, aiProvider local, allowCloudAi false | `{"status":"ok","db":"connected","ehrAdapter":"synthetic","aiProvider":"local","allowCloudAi":false,...}` |
| `GET /api/cases` no token | 401 | 401 |
| `POST /api/auth/login` provider | 200 + token + role PROVIDER | 200, role PROVIDER, token returned |
| `GET /api/auth/me` (Bearer) | 200 {user} | 200, user PROVIDER |
| `GET /api/cases` (Bearer) | 200 | 200 |
| `GET /api/summary` (Bearer) | 200 incl. unknownDeadlines | 200, includes `unknownDeadlines:[]` |
| `GET /api/jobs` (Bearer) | 200 global array | 200 `{"jobs":[]}` |
| `GET /api/cases` bad token | 401 | 401 |
| BILLER `coordinator` login + `/cases` + `/summary` | 200 reads | role BILLER, both 200 |
| `POST /api/auth/logout` then `/api/auth/me` | {ok:true} then 401 | `{"ok":true}` then 401 |

Teardown: server killed, temp DB + log removed. The smoke did NOT point at the
real dev DB.

## Scope adherence (self-check)
- Password comparison removed from the browser; login goes to `POST /api/auth/login`.
  Seeded dev credentials are NOT embedded in code; no role picker is used as auth.
- Opaque token held in an in-memory React context (`services/sessionContext.tsx`),
  never localStorage/sessionStorage.
- `Authorization: Bearer <token>` attached on every protected request via the
  centralized `request()` (verified by unit test, incl. receipt/download path).
- `GET /api/auth/me` validates identity; `POST /api/auth/logout` clears local state.
- Capabilities derive from the server role only (`services/capabilities.ts`):
  canApprove = ADMIN|PROVIDER; canRun/canViewHandoff/canRecordSubmission = all three;
  BILLER cannot approve.
- `request()` returns a typed discriminated union; 401 ends session + routes to
  login (preserving a safe intended target), 403 keeps session with an
  action-specific message, 400/404/409/network+5xx are distinct; errors are never
  converted to empty lists/zeros; no `actor` field is sent anywhere.
- Read-only typed rendering of list/detail/summary/jobs with all states handled
  (packet_ready, needs_review [packet may be null — handled], needs_more_data,
  approved, handoff_generated, submitted, failed, ineligible, intermediate).
  packetVersion/approvedVersion/handoffVersion/hasHandoff/hasReceipt/submittedAt
  rendered as SEPARATE fields; job-done is never conflated with approved/submitted.
- Nullable deadlines are null-safe: no `null <= 14`, no `nulld`; unknown shows
  "deadline unknown — needs {blockers}"; calculated deadlines labelled
  "calculated from synthetic rule". `summary.unknownDeadlines` shown SEPARATELY.
- Global `GET /api/jobs` surfaced read-only (`components/WorkflowRuns.tsx`): real
  attempts/status/lastError; Retry is disabled/"next increment".
- Health "Synthetic / local-stub AI / cloud-off" indicator visible from
  `allowCloudAi === false`.
- No mutation wired. No browser-direct Gemini path restored; `services/geminiService.ts`
  rejecting shims untouched; Analyzer/Appeals FileReader cleanup untouched.
- Legacy out-of-scope screens (Analyzer/Appeals/PolicyLibrary/UserManagement/History)
  and `services/permissionsService.ts` left unchanged; `services/authService.ts`
  retained for those screens but no longer on the wired path.

## Verification level
L4 (Build Verified) + partial L5 (Runtime Verified at the API boundary via curl:
auth, bearer enforcement, read endpoints, role reads, logout invalidation). The
rendered UI itself was not exercised in a browser/E2E runner this increment
(no jsdom/E2E harness is configured); client logic is covered by unit tests.
