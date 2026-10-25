# Implementation Plan — UI Wiring Packages 1 & 2 (READ-ONLY increment)

Author / Prepared by: Anthony LaVear — Lead BSA, SDIT Architecture

Branch: `feat/ui-wiring-1-2` (based on `feat/backend-prereqs`). Worktree:
`/Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-1-2`. All git via
`git -C /Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-1-2`. Do NOT merge to main.

## Scope guardrails (binding)
- Packages **1 and 2 only**. No mutation action is wired this increment: approve, generate
  handoff, download handoff, record submission, retry. Controls for them may render **disabled/
  "next increment"** or be omitted — never wired.
- Synthetic data only; local-stub AI only; Node 24+ only.
- Preserve the existing visual design. This is wiring, not a redesign.
- Do NOT restore browser-direct AI, bundled keys, or any cloud SDK path. The four
  `geminiService.ts` functions stay rejecting shims. Keep the existing Analyzer/Appeals
  FileReader cleanup (already present: `onerror` + `finally { setIsParsing(false) }`) — do not
  regress it; no other change to those files.
- Do NOT weaken or delete any existing passing test. Backend suite must stay **152 passed / 1
  skipped**. (Confirmed green now, plus `tsc --noEmit` clean and `vite build` clean.)

---

## Server contract — source of truth (verified against server/ source)

Verified from `server/auth/authRoutes.ts`, `server/routes/caseRoutes.ts`, `server/app.ts`,
`server/domain/types.ts`, `server/pipeline/classifier.ts`, `server/pipeline/gateEngine.ts`,
`server/domain/packet.ts`, `server/repositories/caseRepository.ts` (`AppealCaseRow`,
`mapCaseRow`), `server/repositories/auditRepository.ts` (`AuditEntry`),
`server/jobs/jobRunner.ts` (`JobRow`).

Auth (public login; Bearer elsewhere):
- `POST /api/auth/login` `{username,password}` → `{token, user:{id,username,name,role}, expiresAt}`;
  400 if missing fields; 401 invalid creds.
- `GET /api/auth/me` (Bearer) → `{user}`; 401 missing/expired/invalid.
- `POST /api/auth/logout` (Bearer) → `{ok:true}`.
- Seeded dev users exist ONLY on an empty DB (admin/dev-admin-pass, provider/dev-provider-pass,
  coordinator/dev-coordinator-pass). Do NOT embed these in the app.

Roles & permissions (`ROLE_PERMISSIONS`): ADMIN & PROVIDER = run_pipeline, view_cases,
approve_appeal, generate_handoff, record_submission. BILLER (coordinator) = all of those EXCEPT
approve_appeal.

Reads (all Bearer, permission `view_cases`):
- `GET /api/cases` → `{count, cases:[{id, denialId, state, category|null,
  appealDeadline|null, deadlineStatus|null, gateDecision|null, packetVersion, approvedVersion|null,
  packetReady, updatedAt}]}`.
- `GET /api/cases/:id` → `{case: AppealCaseRow, audit: AuditEntry[]}` or 404.
  `AppealCaseRow` = `{id, denialId, state, classification|null, gate|null, packet|null,
  packetVersion, packetHash|null, approvedVersion|null, approvedBy|null, approvedAt|null,
  handoffVersion|null, handoffGeneratedAt|null, hasHandoff, hasReceipt, submittedBy|null,
  submittedAt|null, createdAt, updatedAt}`.
  - `classification` = `{category, appealable, recognizedCodes[], unrecognizedCodes[],
    appealDeadline|null, deadlineStatus: 'calculated'|'unknown_missing_date'|'unknown_missing_policy',
    appealWindowDays|null, denialDate|null, deadlineBlockers[], appealRoute|null, policyId|null,
    rationale}`.
  - `gate` = `{decision:'appeal_ready'|'needs_more_data'|'ineligible', checks[], deficits[],
    satisfied[], rationale}`; each check `{requirementId, description, evidenceKey, required,
    satisfied, citations: EvidenceHit[]}`; `EvidenceHit` carries `documentId` (+ snippet).
  - `packet` = `{caseId, denialId, patientId, carrier, category, appealRoute|null,
    appealDeadline|null, classification, gate, evidence:[{requirementId, description, documentId,
    snippet}], draftLetter, aiProvider, aiModel, aiValidationPassed, aiValidationIssues[],
    createdAt}`. **packet may be null** (e.g. needs_review when the date gate stopped before AI).
  - `AuditEntry` = `{id, caseId|null, actor, action, detail|null, createdAt}`.
- `GET /api/summary` → `{total, byState:Record<string,number>, packetsReady, needsReview,
  approved, handoffGenerated, submitted, urgentDeadlines[], unknownDeadlines[], deadlines[]}`.
  Each deadline item = `{caseId, denialId, state, deadlineKnown:boolean, appealDeadline|null,
  deadlineStatus|null, deadlineBlockers[], daysRemaining:number|null}`. `daysRemaining` is null
  when `deadlineKnown` is false.
- `GET /api/jobs` → `{jobs: JobRow[]}`, GLOBAL (not per-case). `JobRow` = `{id, type, payload,
  status:'queued'|'running'|'done'|'failed', attempts, lastError:string|null, idempotencyKey|null,
  createdAt, updatedAt}`.
- `GET /api/cases/:id/receipt` → receipt fields `{channel, confirmationNumber, submittedAt,
  note|null, recordedBy}` or 404. Read-only display only this increment.
- `GET /api/health` (PUBLIC, no Bearer) → `{status, db, ehrAdapter, aiProvider, allowCloudAi,
  time}`.

States to render intentionally: `packet_ready, needs_review, needs_more_data, approved,
handoff_generated, submitted, ineligible, failed` + intermediate `intake, classified, gathering,
gated, reasoning`. A completed job does NOT imply an approved/submitted case.

### Contract mismatches between UI_WIRING_PACKAGE.md and the actual server (server wins — record for final report)
1. **Type source.** UI_WIRING says "type against `DESIGN.md`'s exact responses." There is no
   `DESIGN.md` in the worktree and the step mandate names the **server source** as source of
   truth. Reconcile: type every client model against the server route/repository source listed
   above; ignore `DESIGN.md`.
2. **Case alias IDs.** UI_WIRING mentions `case_den_001` / "APL aliases presentation-only." The
   server returns the real `id`/`denialId` (e.g. `case_den_001`, `den_001`); there is no separate
   APL alias field. Reconcile: display server `id`/`denialId` verbatim; do not invent aliases.
3. **`appealDeadline` nullability in the packet.** The stale client `AppealPacket.appealDeadline`
   is typed `string` (non-null) but the server `AppealPacket.appealDeadline` is `string | null`.
   Reconcile: client type must be `string | null` and render null-safe.
4. **`daysRemaining` nullability.** Stale client `DeadlineItem.daysRemaining: number` and
   `appealDeadline: string`; Dashboard compares `d.daysRemaining <= 14` and renders `${…}d`. Server
   returns `daysRemaining: number | null` and `appealDeadline: string | null` with
   `deadlineKnown`. Reconcile: never compare `null <= 14`, never render `nulld`; branch on
   `deadlineKnown`.
5. **Summary shape.** Stale client `SummaryInfo` omits `needsReview`, `handoffGenerated`,
   `unknownDeadlines`, and the per-item `deadlineKnown/deadlineStatus/deadlineBlockers`. Reconcile:
   add them; render `unknownDeadlines` as a SEPARATE list.
6. **Approve/submit request bodies.** Stale client sends `{actor}` to `/approve` and `/submit`.
   Server derives actor from the token and requires `{packetVersion}` on approve / `{channel,
   confirmationNumber,...}` on submit. Reconcile: this increment does NOT wire approve/submit at
   all; remove the stale `actor`-sending methods from the client surface so no path sends `actor`.
7. **`listDenials` / `/api/dev/denials`.** Stale client exposes `/dev/denials`; `server/app.ts`
   states the unauthenticated `/api/dev/*` routes were REMOVED. Reconcile: delete `listDenials`
   from the client; nothing calls it in the wired path.
8. **Capability concept.** UI_WIRING warns the prototype's narrower admin concept must not
   override server policy. Reconcile: derive capabilities from the server `role` only (step 4
   map), not from `permissionsService.ts` view-gating names.

---

## Typed error outcomes (apiClient)

Centralize all fetch in `apiClient.request()`. Classify every response into a discriminated
union and NEVER convert an error into an empty list / zero count:

- `ok` — 2xx, parsed body.
- `unauthorized` — **401**: end the session (clear in-memory token + user), route to login,
  preserve only a safe intended-navigation target. Surfaced via a session-expiry callback the
  SessionProvider registers.
- `forbidden` — **403**: keep the session; carry an action-specific permission message.
- `badRequest` — **400** (validation).
- `notFound` — **404** (missing resource; e.g. no receipt/handoff).
- `conflict` — **409** (stale/state conflict).
- `serverError` — network failure or **5xx**.

Represent as `type ApiResult<T> = { ok: true; data: T } | { ok: false; kind:
'unauthorized'|'forbidden'|'badRequest'|'notFound'|'conflict'|'serverError'; status: number;
message: string }`. Callers render explicit loading/empty/error states that are distinct — an
error is never shown as an empty queue or a zero.

## Capability map (derived from server role ONLY)

```
canApprove            = role === 'ADMIN' || role === 'PROVIDER'          // NOT this increment: display-only
canRun                = true  for ADMIN | PROVIDER | BILLER
canViewHandoff        = true  for ADMIN | PROVIDER | BILLER
canRecordSubmission   = true  for ADMIN | PROVIDER | BILLER
// coordinator(BILLER) canApprove === false
```
Buttons reflect capabilities; the server remains the enforcement boundary. No mutation button is
functional this increment regardless of capability.

---

## Ordered implementation items

- [ ] 1. Add server-auth client types + typed `request()` in `services/apiClient.ts`.
      Rewrite the module: `request<T>()` attaches `Authorization: Bearer <token>` (from an
      injected token getter — see item 2) on every call except `health`/`login`; returns the
      `ApiResult<T>` union above; maps 401→unauthorized (invokes the registered session-expiry
      handler), 403→forbidden, 400/404/409 distinctly, network+5xx→serverError; never throws an
      empty list. Define exact types: `SessionUser{id,username,name,role:'ADMIN'|'PROVIDER'|
      'BILLER'}`, `LoginResponse{token,user,expiresAt}`, `CaseSummary`, `CaseDetail{case:AppealCase,
      audit:AuditEntry[]}` with the FULL `AppealCase`/`Classification`/`GateResult`/`AppealPacket`/
      `EvidenceHit` shapes from the contract section (packet nullable, appealDeadline nullable),
      `SummaryInfo` (incl. `needsReview, handoffGenerated, unknownDeadlines`, per-item
      `deadlineKnown/deadlineStatus/deadlineBlockers/daysRemaining:number|null`), `JobRow`,
      `ReceiptInfo`, `HealthInfo{status,db,ehrAdapter,aiProvider,allowCloudAi,time}`. API surface:
      `login`, `me`, `logout`, `health`, `listCases`, `getCase`, `summary`, `listJobs`, `getReceipt`.
      REMOVE `approveCase`, `submitCase`, `runDenial`, `runPoll`, `listDenials` and any `{actor}`
      body (no code path sends `actor`). Export a `setAuthTokenGetter(fn)` and
      `setOnUnauthorized(fn)` so the SessionProvider wires token + 401 handling without localStorage.
      Files: `services/apiClient.ts`
      Verify: `npm run typecheck` passes (apiClient compiles; downstream items fix callers).

- [ ] 2. Create an in-memory SessionProvider React context.
      New `services/sessionContext.tsx` (or `components/SessionProvider.tsx`): holds `{token,
      user}` in React state ONLY (memory, never localStorage). Exposes `login(username,password)`
      (calls `api.login`, stores token+user, registers token getter via `setAuthTokenGetter`),
      `logout()` (calls `api.logout` best-effort then clears state), `restore()` (on mount, if a
      token exists call `api.me` to validate; on 401 clear), and a `useSession()` hook returning
      `{user, token, isAuthenticated, capabilities, login, logout, status}` where `capabilities`
      is the step-4 map computed from `user.role`. Register `setOnUnauthorized(() => clear +
      intendedTarget)`. No token/password logged anywhere.
      Files: `services/sessionContext.tsx`
      Verify: `npm run typecheck` passes.

- [ ] 3. Wire `App.tsx` to the SessionProvider; replace localStorage session bootstrap.
      Wrap the app in `<SessionProvider>`. Replace `getCurrentUser()`/`authLogout()` usage with
      `useSession()`: show the initializing loader while `restore()` runs, render
      `<SecurityGateway>` when not authenticated, pass `user` from context to `Sidebar`. `handleLogout`
      calls `session.logout()`. Remove the browser `authService`/`auditService` login/logout audit
      calls from the authenticated bootstrap path (server records login/logout audit). Preserve the
      existing view routing and the Module Error boundary.
      Files: `App.tsx`
      Verify: `npm run typecheck` passes; `npm run build` succeeds.

- [ ] 4. Replace browser password comparison in `SecurityGateway.tsx` with server login.
      Keep the existing two-step BAA + login visual flow. Replace the `authenticate()` call with
      `session.login(username,password)`; on the returned `unauthorized` result show "Invalid
      credentials"; on `serverError` show a distinct "cannot reach local server" message; never log
      password/token; drop the artificial `setTimeout`-based fake verification (optional) but keep
      the submit-pending UI. Remove the `signAgreement()`/Gemini billing link coupling only insofar
      as needed to stop importing browser `authService.authenticate`; the BAA acknowledgment
      checkbox UI stays. Do NOT embed seeded credentials or a role picker as authentication.
      Files: `components/SecurityGateway.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 5. Rewrite `components/Cases.tsx` as READ-ONLY, server-typed, state-intentional review.
      Use `useSession()` for `capabilities` (not `getCurrentUser`). Fetch via `api.listCases` /
      `api.getCase`, handling each `ApiResult` kind with explicit, distinct loading/empty/error
      UI (never silently empty). Remove `approve()`/`submit()` and the `runPoll` "Scan for Denials"
      wiring (that triggers a pipeline run → next increment); render any such control disabled and
      labeled "next increment", or omit. In `CaseReview`: handle `packet === null` safely (show
      "no packet — held before AI; {state}"); render every state with a distinct badge (extend
      `stateBadge` to cover needs_review, needs_more_data, handoff_generated, ineligible, and
      intermediate states); render `packet.aiValidationIssues`, gate `deficits`/`checks` with
      citation **documentId** preserved beside each snippet, classification policy/date inputs and
      `deadlineBlockers`. Null-safe deadline: if `deadlineStatus !== 'calculated'` or
      `appealDeadline == null`, show "deadline unknown — needs {deadlineBlockers}"; otherwise label
      the date "calculated from synthetic rule" (not verified payer coverage). Render audit entries
      (`action/actor/detail/createdAt`). Keep `packetVersion`, `approvedVersion`, `hasHandoff`,
      `hasReceipt`, `handoffVersion` as SEPARATE displayed fields; never conflate "job done" with
      "approved/submitted". Show explicit "unavailable" for patient/carrier-owner joins and tasks
      (no such endpoints); do not fabricate to-dos or fetch charts. You MAY extract a small
      `CaseReview` component (already inline) — keep it in-file or split to
      `components/CaseReview.tsx`.
      Files: `components/Cases.tsx` (+ optional `components/CaseReview.tsx`)
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 6. Rewrite the backend-driven parts of `components/Dashboard.tsx` null-safe and separated.
      Keep the visual layout and the browser-local `historyService` stat cards as-is (out of
      scope). For the API panels: use the item-1 `SummaryInfo`. Review-work count = `summary.
      packetsReady` (equivalently `state === 'packet_ready'`). Deadlines list must branch on
      `deadlineKnown`: known → `${daysRemaining}d` (Past due when `< 0`) + date labeled "calculated
      from synthetic rule"; unknown → render in a SEPARATE "Deadline unknown — needs {blockers}"
      section sourced from `summary.unknownDeadlines`; never compute `null <= 14` or render
      `nulld`. Health badge: show `status`, `db`, `ehrAdapter`, `aiProvider`, and an explicit
      "Synthetic / local-stub AI / cloud-off" indicator from `allowCloudAi === false`; distinct
      offline state on `serverError`. Each API panel has explicit loading/empty/error states (not
      silently empty/zero).
      Files: `components/Dashboard.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 7. Add a READ-ONLY global jobs view (WorkflowRuns) surfaced from Cases or Dashboard.
      New small `components/WorkflowRuns.tsx` consuming `api.listJobs()` (GLOBAL list). Display real
      `id, type, status, attempts, lastError, idempotencyKey, createdAt, updatedAt`. Show status
      only — NO working Retry button (render disabled/"next increment" or omit). Explicit
      loading/empty/error states. Mount it in Cases (or Dashboard) without a pipeline-trigger
      control.
      Files: `components/WorkflowRuns.tsx` (+ small mount edit in `components/Cases.tsx`)
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 8. Reconcile capability gating for the wired views without weakening server policy.
      Where wired components need role-based display (e.g. a disabled "Approve (next increment)"
      button visible only to `canApprove`), source it from `useSession().capabilities`, not from
      `services/permissionsService.ts`. Do NOT change `permissionsService.ts` view-routing used by
      out-of-scope screens (Analyzer/Appeals/PolicyLibrary/UserManagement) — they keep their current
      browser-local behavior this increment. Confirm no wired path reads `getCurrentUser()` from
      `services/authService.ts` anymore (leave the file for the untouched legacy screens, but the
      wired path uses context).
      Files: wired components only (no change to `permissionsService.ts`)
      Verify: `grep` shows Cases/Dashboard/App/SecurityGateway no longer import `getCurrentUser`;
      `npm run typecheck` passes.

- [ ] 9. Add frontend unit tests for the new wiring (do not touch backend tests).
      Add Vitest tests under a client path (e.g. `services/apiClient.test.ts`,
      `services/sessionContext.test.tsx`) that: (a) assert `request()` maps 401/403/400/404/409/
      network+5xx to the correct `ApiResult.kind` and never returns an empty list on error;
      (b) assert no request body ever contains `actor`; (c) assert the capability map (BILLER
      cannot approve; all three can run/view-handoff/record-submission); (d) assert deadline
      rendering helpers never emit `nulld` and never compare null numerically. Use the jsdom
      environment if the component test needs it; keep the existing `vitest.config.ts` includes
      intact so the backend suite still runs. If adding a client test environment requires a config
      change, extend (not replace) `vitest.config.ts`/add `@vitejs` jsdom without altering backend
      test behavior.
      Files: `services/apiClient.test.ts`, `services/sessionContext.test.tsx`, possibly
      `vitest.config.ts` (additive)
      Verify: `npm test` → existing **152 passed / 1 skipped** PLUS the new client tests pass
      (total count rises; the 152/1 backend figure must not drop).

- [ ] 10. Full verification gate (run all; fix regressions before done).
      Run, in order, and capture results:
      1. `node --version` → must be `v24.x`.
      2. `npm run typecheck` → clean.
      3. `npm test` → backend 152 passed / 1 skipped preserved + new client tests pass.
      4. `npm run build` → succeeds.
      5. curl runtime smoke against a temp-DB server with the scheduler OFF (see below).
      Files: none (verification only)
      Verify: all five pass; record outputs for the final report.

---

## Runtime smoke procedure (item 10.5) — temp DB, scheduler off

Start an isolated synthetic server (empty temp DB seeds the three dev users; scheduler disabled
so no background jobs mutate state mid-smoke):

```
cd /Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-1-2
TMPDB="$(mktemp -t medauth-smoke-XXXX.db)"
MEDAUTH_DB_PATH="$TMPDB" MEDAUTH_ENABLE_SCHEDULER=false MEDAUTH_PORT=4100 \
  npm start &   # tsx server/index.ts; waits for "listening at http://127.0.0.1:4100"
BASE=http://127.0.0.1:4100
```

Checks (expected results):
1. `curl -s $BASE/api/health` → 200, `allowCloudAi:false`, `aiProvider:"local"` (synthetic/
   cloud-off visible). PUBLIC (no token).
2. `curl -s $BASE/api/cases` (no token) → **401**.
3. Login provider: `curl -s -XPOST $BASE/api/auth/login -H 'content-type: application/json' -d
   '{"username":"provider","password":"dev-provider-pass"}'` → 200 `{token,user:{role:"PROVIDER"},
   expiresAt}`. Capture `$PTOK`.
4. `curl -s $BASE/api/auth/me -H "authorization: Bearer $PTOK"` → 200 `{user}`.
5. Authenticated reads with `$PTOK`: `/api/cases`, `/api/summary`, `/api/jobs` → 200 with the
   documented shapes (summary includes `unknownDeadlines`; jobs is a global array).
6. Bad token: `curl -s $BASE/api/cases -H "authorization: Bearer bogus"` → **401**.
7. BILLER reads: login `coordinator`/`dev-coordinator-pass` → `$BTOK`; `/api/cases` + `/api/summary`
   → 200 (BILLER has `view_cases`). (Approve is out of scope this increment; no approve call is
   made — but note BILLER would get 403 on `approve`, which stays server-enforced.)
8. Logout: `curl -s -XPOST $BASE/api/auth/logout -H "authorization: Bearer $PTOK"` → `{ok:true}`;
   then `/api/auth/me` with the same token → **401**.

Teardown: kill the server, `rm -f "$TMPDB"`. Do not point the smoke at the real dev DB.

---

## Files summary
- Change: `services/apiClient.ts`, `App.tsx`, `components/SecurityGateway.tsx`,
  `components/Cases.tsx`, `components/Dashboard.tsx`.
- New: `services/sessionContext.tsx`, `components/WorkflowRuns.tsx`, optional
  `components/CaseReview.tsx`, `services/apiClient.test.ts`, `services/sessionContext.test.tsx`.
- Preserve untouched: `services/geminiService.ts` (rejecting shims), `components/Analyzer.tsx` &
  `components/Appeals.tsx` (keep existing FileReader cleanup), `services/permissionsService.ts`,
  all `server/**`, all backend tests. `services/authService.ts`/`auditService.ts` remain for the
  untouched legacy screens but are no longer on the wired auth path.

## Assumptions / open items (non-blocking)
- `services/authService.ts` and the browser-local `userService/historyService/auditService` stay in
  place for out-of-scope legacy screens (Analyzer/Appeals/PolicyLibrary/UserManagement/History);
  fully removing them is a later increment. The wired path (login + Cases + Dashboard) uses the
  in-memory SessionProvider exclusively.
- If a client (jsdom) test environment is not yet configured, add it additively in
  `vitest.config.ts` so the backend suite's includes and counts are unaffected.
- The stop contract for the implement/review loop is
  `/Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-1-2/.agents/tasks/review.json` with
  jsonPath `verdict` == `APPROVED`.
