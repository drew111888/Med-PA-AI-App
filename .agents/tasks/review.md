# Review — UI Wiring Packages 1 & 2 (READ-ONLY increment)

Reviewer pass on `feat/ui-wiring-1-2` @ `84a12f2`, diffed against base `feat/backend-prereqs`.
Scope: focused frontend-integration increment (Package 1 server-auth + capabilities +
centralized typed fetch; Package 2 read-only typed list/detail/summary/jobs rendering).
No mutation wired.

## Verdict: APPROVED — no blocking findings.

## Evidence basis

- Diff: `git diff feat/backend-prereqs` (14 files, +1907/-365). Changed app files:
  `App.tsx`, `services/apiClient.ts`, `services/sessionContext.tsx`, `services/capabilities.ts`,
  `services/deadlineView.ts`, `components/SecurityGateway.tsx`, `components/Cases.tsx`,
  `components/Dashboard.tsx`, `components/WorkflowRuns.tsx`, plus 3 client test files.
- Server contracts read directly: `server/auth/authRoutes.ts`, `server/routes/caseRoutes.ts`,
  `server/domain/types.ts`, `server/app.ts` (health). Client types were checked field-by-field
  against these; server source wins and the client matches it.
- Recorded verification (`verification.md`): Node v24.21.0; `tsc --noEmit` clean; `vitest run`
  175 passed / 1 skipped (backend 152/1 preserved + 23 new client tests); `vite build` ok;
  curl smoke at the API boundary (auth, bearer enforcement, reads, role reads, logout
  invalidation). Not re-run per instructions; test files spot-read to confirm they assert the
  required behaviors.

## Required-behavior checks

1. **Login via server; no browser password compare; no embedded creds; no secret logging; no
   role-picker auth.** PASS. `SecurityGateway.handleLogin` calls `session.login()` →
   `api.login` → `POST /api/auth/login` (`apiClient.ts` login). No in-browser comparison; no
   seeded credentials in the wired files; grep found no password/token logging in
   apiClient/sessionContext/SecurityGateway. BAA checkbox is a UX gate, not authentication.

2. **In-memory token (not localStorage); Bearer on every protected request incl. downloads;
   `/auth/me` restore; `/auth/logout` clears state.** PASS. Token held in `tokenRef`
   (`sessionContext.tsx`), injected via `setAuthTokenGetter`; no localStorage/sessionStorage in
   wired files (only doc comments). `request()` attaches `Authorization: Bearer <token>` unless
   `anonymous`; `getReceipt` (download/receipt path) is protected and carries the token (asserted
   by `apiClient.test.ts`). `restore()` calls `api.me()`; `logout()` calls `api.logout()` then
   clears.

3. **Capabilities from server role only; canApprove={ADMIN,PROVIDER}; canRun/canViewHandoff/
   canRecordSubmission=all three; BILLER cannot approve.** PASS. `capabilities.deriveCapabilities`
   mirrors `ROLE_PERMISSIONS`; `capabilities.test.ts` asserts BILLER cannot approve, all three
   can run/view/record, null role → no capabilities. Not derived from browser names.

4. **Single centralized `request()`; 401 ends session + routes to login; 403 keeps session +
   message; distinct 400/404/409/network+5xx; never error→empty list/zero; no `actor` sent.**
   PASS. `apiClient.request()` is the sole fetch path; `kindForStatus` maps 401→unauthorized
   (invokes `onUnauthorized`), 403→forbidden, 400/404/409 distinct, network→serverError status 0,
   5xx→serverError. Errors return typed `ApiError`, never a collapsed empty collection
   (asserted). Only `actor` occurrence in the worktree services is the read-only
   `AuditEntry.actor` display field; no request body sends `actor` (asserted). Stale
   `approveCase`/`submitCase`/`runPoll`/`listDenials` were removed from this worktree's API
   surface (surface ends at `getReceipt`).

5. **Types match actual server contracts; lifecycle fields separate; job-done not conflated with
   approved/submitted.** PASS. Client `CaseSummary`, `AppealCase`, `Classification`, `GateResult`,
   `AppealPacket`, `DeadlineItem`, `SummaryInfo`, `JobRow`, `HealthInfo` match the route/domain
   source (packet nullable, appealDeadline nullable, daysRemaining nullable). `caseId/denialId/
   state/packetVersion/approvedVersion/hasHandoff/hasReceipt/handoffVersion/submittedAt` are
   rendered as separate `Field`s in `CaseReview`. Jobs are shown in a distinct `WorkflowRuns`
   panel; job status is never mapped onto case approval/submission state.

6. **All states rendered; packet===null safe; aiValidationIssues/gate deficits/citations
   (documentId preserved)/policy+date inputs+deadlineBlockers rendered; review count from
   packetsReady; unknownDeadlines separate; nullable deadlines null-safe; audit rendered; missing
   joins explicit; /api/jobs global; Retry not wired; loading/empty/error distinct; health
   synthetic/cloud-off visible.** PASS. `STATE_BADGE` covers all 13 states with a safe fallback.
   `CaseReview` guards `!packet` with an explicit held-before-AI message; renders
   `aiValidationIssues`, gate `checks`/`deficits` with `[documentId] "snippet"`, classification
   date/window/route/policy and `deadlineBlockers`, and the audit trail. Dashboard review count =
   `summary.packetsReady`; `unknownDeadlines` rendered in a separate section;
   `describeDeadline` branches on `deadlineKnown` and never compares null numerically nor emits
   `nulld` (asserted in `deadlineView.test.ts`); calculated deadlines labelled "calculated from
   synthetic rule". Patient/carrier/owner joins + tasks shown as explicit "unavailable".
   `WorkflowRuns` consumes global `GET /api/jobs`; Retry button is `disabled` + "next increment".
   Every panel has distinct loading/error/empty states. Health badge shows
   `aiProvider`/`cloud-off` from `allowCloudAi === false`.

7. **No mutation wired; legacy browser-AI/bundled keys/cloud SDK not restored.** PASS. Approve,
   Scan-for-Denials, and Retry render `disabled` with "next increment"; handoff/submission are not
   wired. No mutation methods remain on the client surface. `services/geminiService.ts`,
   `components/Analyzer.tsx`, `components/Appeals.tsx`, `services/permissionsService.ts` have an
   empty diff against base (untouched).

8. **Existing tests not weakened; backend 152/1 preserved; commit on branch, correct author, not
   merged.** PASS per recorded evidence (175 passed / 1 skipped total; backend 152/1 intact; only
   additive client tests). `git branch --contains HEAD` → only `feat/ui-wiring-1-2` (not merged
   into base/main). Author: `Anthony LaVear, Lead BSA, SDIT Architecture`.

## Notes (non-blocking, not findings)

- The main-checkout `services/apiClient.ts` (outside this worktree) still contains stale
  `{actor}` methods; that is a separate checkout and out of scope for this branch review. The
  worktree under review is clean.
- `__test__ = { request }` export is test-only surface; harmless.
- Rendered UI was not exercised in a browser/E2E runner (none configured); client logic is
  covered by unit tests and the API boundary by curl. This matches the increment's stated L4 +
  partial-L5 scope and the read-only no-mutation guardrail.

## Verification level accepted
L4 (build) + L2/L3 (typecheck + 23 client unit tests) + partial L5 at the API boundary (curl),
as recorded. Appropriate for a read-only wiring increment.
