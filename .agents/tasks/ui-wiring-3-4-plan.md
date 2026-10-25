# Implementation Plan — UI Wiring Packages 3 & 4 (mutation actions + runs/legacy)

Author / Prepared by: Anthony LaVear — Lead BSA, SDIT Architecture

Branch: `feat/ui-wiring-3-4`. Worktree: `/Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-3-4`.
All git via `git -C /Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-3-4`. **Do NOT merge to main.**

This builds on the already-wired Packages 1 & 2 (login + read-only Cases/Dashboard/WorkflowRuns).
Scope = Package 3 (versioned approval, handoff generate/download, human submission receipt) +
Package 4 (run controls, retry, legacy-feature handling, health status). Synthetic data only,
local-stub AI only, Node 24+ only.

---

## Baseline verified during exploration (FACT)

- Node: **v24.21.0** (`node --version`).
- Full suite GREEN now: **175 passed / 1 skipped**, 18 test files (`npm test`). This count must not
  drop; new client tests add to it.
- Build command: `npm run build` (vite). Typecheck: `npm run typecheck` (`tsc --noEmit`). Test:
  `npm test` (`vitest run`). `pretest`/`start`/`dev:server` all gate on `scripts/checkNode.mjs` (>=24).
- Client tests run in vitest's **`node`** environment (`vitest.config.ts` `environment:'node'`,
  `include: ['server/**/*.test.ts','tests/**/*.test.ts']`). Existing client tests
  (`tests/client/apiClient.test.ts`, `capabilities.test.ts`, `deadlineView.test.ts`) stub
  `globalThis.fetch` and need **no DOM**. New mutation tests follow the same no-DOM pattern — do NOT
  add jsdom; keep the single node environment.
- Routes are mounted at `/api` (`server/app.ts`), so the Package-3/4 paths are exactly
  `/api/cases/:id/approve|handoff|submit|receipt|retry`, `/api/run/denial/:denialId`, `/api/run/poll`.
- Backend contracts are **test-locked** in `server/app.test.ts` (approve/handoff/submit/retry/run,
  spoofed-actor-ignored, 400/409 cases). Do NOT modify any `server/**` file or any existing test.

## Files that already exist and are REUSED (do not reinvent)

- `services/apiClient.ts` — typed `request()` → `ApiResult<T>` union with distinct
  `unauthorized|forbidden|badRequest|notFound|conflict|serverError`; bearer attached on every
  non-anonymous request; `setAuthTokenGetter`/`setOnUnauthorized`; `__test__.request` export.
  Currently exposes reads only (`health, login, me, logout, listCases, getCase, summary, listJobs,
  getReceipt`). **Package 3/4 adds the mutation methods here.**
- `services/sessionContext.tsx` — in-memory `useSession()` with `capabilities`.
- `services/capabilities.ts` — `deriveCapabilities(role)`: `canApprove` (ADMIN/PROVIDER only),
  `canRun`/`canViewHandoff`/`canRecordSubmission` (all three roles). Matches `ROLE_PERMISSIONS`.
- `services/deadlineView.ts` — `describeDeadline()` null-safe deadline helper (reused as-is).
- `components/Cases.tsx` — read-only list + inline `CaseReview`. Has disabled "Approve (next
  increment)" and a disabled "Scan for Denials (next increment)" button. Mounts `<WorkflowRuns/>`.
- `components/WorkflowRuns.tsx` — global `GET /api/jobs` list with a disabled "Retry (next
  increment)" button per job.
- `components/Dashboard.tsx` — health badges + synthetic/cloud-off indicator + summary panels.
- `services/geminiService.ts` — four rejecting shims (`analyzeGuidelines`, `generatePolicyDigest`,
  `generateAppealLetter`, `parsePolicyDocument`). Keep rejecting; do NOT restore any cloud SDK.
- `components/Analyzer.tsx` / `components/Appeals.tsx` — already have the FileReader
  `try { onload async try/catch/finally } onerror` cleanup from the prior increment. Preserve it.

---

## Backend contract verification — server is source of truth (reconciliations recorded)

Verified against `server/routes/caseRoutes.ts`, `server/submission/submissionHandoff.ts`,
`server/repositories/caseRepository.ts`, `server/domain/types.ts`, `server/app.ts`, and the
test-locked behaviour in `server/app.test.ts`.

| Action | Verified server contract (FACT) |
| --- | --- |
| Approve | `POST /api/cases/:id/approve` body `{packetVersion:int}` → `{ok:true,state:'approved',approvedVersion}`. **400** if `packetVersion` missing/non-integer. **409** if state≠`packet_ready`, packet not AI-validated, zero evidence, `deadlineStatus≠'calculated'` or null deadline, version stale, or duplicate. Permission `approve_appeal` (ADMIN/PROVIDER; **BILLER→403**). Spoofed body `actor` ignored. |
| Generate handoff | `POST /api/cases/:id/handoff` (no body needed) → `{ok:true,state:'handoff_generated',package:{caseId,packetVersion,carrier,appealRoute,appealDeadline,letter,evidenceCount,generatedAt}}`. **409** if state≠`approved`, no packet, or `approvedVersion≠packetVersion` (stale). Permission `generate_handoff` (**all three roles**). |
| Download handoff | `GET /api/cases/:id/handoff` (Bearer, `view_cases`) → the stored `HandoffPackage` JSON (the fields above — NOT the full packet) with `content-disposition: attachment; filename="handoff_<id>.json"`. **404** if none. |
| Record submission | `POST /api/cases/:id/submit` body `{channel,confirmationNumber,submittedAt?,note?}` → `{ok:true,caseId,state:'submitted'}`. Permission `record_submission` (**all three roles**). |
| Receipt readback | `GET /api/cases/:id/receipt` (`view_cases`) → `{channel,confirmationNumber,submittedAt,note,recordedBy}` or **404**. |
| Retry | `POST /api/cases/:id/retry` (`run_pipeline`) → `{caseId,state,packetReady}`. **409** if state ∉ {`failed`,`needs_more_data`,`needs_review`}. **404** if case missing; **409** if denial no longer discoverable. |
| Run denial | `POST /api/run/denial/:denialId` (`run_pipeline`) → `{jobId,caseId,state}` AFTER awaiting drain. **404** if denial not found. |
| Run poll | `POST /api/run/poll` (`run_pipeline`) → `{processed,cases}` AFTER awaiting drain. |

### Reconciliations: UI_WIRING_PACKAGE.md / brief vs. actual server (server WINS — report these)

1. **Submit validation status is 409, not 400.** `recordSubmission()` throws `SubmissionError` for
   missing `channel`/`confirmationNumber`, which the route maps to **409** (not 400). The brief's own
   submit row already says 409, so this agrees with the brief but **contradicts the generic
   "400 input validation" intuition**. UI: do client-side required-field validation to *prevent* the
   call, but when the server returns 409 for a missing field treat 409 as authoritative (do not
   assume 400). Record: submit field errors arrive as `conflict`, not `badRequest`.
2. **`POST /api/run/poll` does NOT return a case state.** It returns `{processed:number,
   cases:number}` (jobs processed in the drain + total case count). The brief says "show pending then
   the actual returned state" — for poll the "returned state" is the drain result `{processed,cases}`,
   not a single case state. UI: show pending, then render `processed`/`cases` and refresh list+summary.
3. **`POST /api/run/denial/:id` returns `{jobId,caseId,state}`** (single resulting case state,
   synchronous post-drain). This matches "show actual returned state". `state` for the seeded
   `den_001` resolves to `packet_ready` (test-locked).
4. **`POST /api/cases/:id/retry` returns `{caseId,state,packetReady}`** — not a full updated case
   row. UI must refresh the detail (`getCase`) to repaint, not rely on the retry response body alone.
5. **Download handoff body is the `HandoffPackage`, not the full packet.** Fields:
   `{caseId,packetVersion,carrier,appealRoute,appealDeadline,letter,evidenceCount,generatedAt}`.
   Surface `packetVersion` from this body as "which version you downloaded".
6. **Handoff staleness uses `approvedVersion` vs `packetVersion`; submit staleness uses
   `handoffVersion` vs `packetVersion`.** Both are exposed on the detail `case` object
   (`approvedVersion`, `handoffVersion`, `packetVersion`, plus `hasHandoff`/`hasReceipt`). Use these
   detail fields to drive enable/disable; never invent a version.
7. **No `DESIGN.md`, no APL aliases, no packet-edit/revision endpoint, no schedule-config API.**
   (Carried from the Pkg 1&2 reconciliation.) Omit or clearly disable "Request changes"/revision and
   any schedule-editing UI — there is no authenticated edit/version-invalidation route.
8. **Receipt readback IS available now** (`GET /api/cases/:id/receipt`). The Pkg-1&2 plan and
   HARDENING_REVIEW #5 noted this contract was "needed"; it now exists and is wired by `api.getReceipt`.
   Display the recorded confirmation from this endpoint — do NOT derive a confirmation from audit text.
9. **BILLER/coordinator can generate handoff AND record submission** (only approve is blocked). So the
   handoff panel and receipt form are shown to all three roles; only the approval panel is
   approver-gated. Server still enforces (BILLER approve → 403).

---

## Shared conventions for all mutation items (apply to every item below)

- **No optimistic state.** Never close/advance a case in the UI before the API returns `ok:true`.
- **Pending + disable.** Disable the triggering control while its request is in flight; show a
  spinner/pending label.
- **Post-mutation refresh.** After ANY successful mutation, re-run `api.getCase(id)` (detail),
  `api.listCases()` (list) and `api.summary()` (summary) so all three reconcile to server truth. In
  `Cases.tsx` thread `refresh` (list) and a `reloadDetail(id)` callback into `CaseReview`; summary
  refresh is triggered via a shared bump (see item 3).
- **409 handling.** On `conflict`, do NOT auto-retry. Re-fetch the detail (and list+summary), surface
  the server message, and for approval force the review acknowledgment back to unchecked
  ("the packet changed — re-review before approving").
- **Error surfacing.** Map every `ApiError.kind` to a distinct inline message using the existing
  rose-panel pattern already in `Cases.tsx`/`WorkflowRuns.tsx`. Never collapse an error to empty.
- **No `actor` in any body.** Server derives the actor from the token (test-locked). The existing
  `apiClient.test.ts` asserts no body contains `actor`; keep that invariant for the new methods.

---

## Ordered implementation items

- [ ] 1. Add the mutation + run methods to `services/apiClient.ts`.
      Extend the exported `api` object (keep every existing read method). Add exact signatures &
      return types mirrored from the verified contracts:
      - `approveCase(id: string, packetVersion: number) => ApiResult<{ok:true;state:'approved';approvedVersion:number}>`
        — `POST /cases/:id/approve`, body `JSON.stringify({ packetVersion })`. (No `actor`.)
      - `generateHandoff(id: string) => ApiResult<{ok:true;state:'handoff_generated';package:HandoffPackage}>`
        — `POST /cases/:id/handoff`, no body (`{ method:'POST' }`).
      - `recordSubmission(id, input: SubmissionInput) => ApiResult<{ok:true;caseId:string;state:'submitted'}>`
        where `SubmissionInput = { channel:string; confirmationNumber:string; submittedAt?:string; note?:string }`
        — `POST /cases/:id/submit`, body = the input object (omit undefined optionals).
      - `retryCase(id) => ApiResult<{caseId:string;state:AppealCaseState;packetReady:boolean}>` — `POST /cases/:id/retry`.
      - `runDenial(denialId) => ApiResult<{jobId:string;caseId:string|null;state:AppealCaseState|null}>` — `POST /run/denial/:denialId`.
      - `runPoll(since?: string) => ApiResult<{processed:number;cases:number}>` — `POST /run/poll`,
        body `JSON.stringify({ since })` (since optional).
      - `downloadHandoff(id) => ApiResult<Blob>` — a SEPARATE helper (not the JSON `request()` path)
        that calls `fetch(`${BASE}/api/cases/:id/handoff`, { headers:{ authorization:`Bearer ${token}` } })`,
        reading the token via the same module-level `tokenGetter`, and returns the response Blob on
        2xx or the mapped `ApiError` on non-2xx / network failure (reuse `kindForStatus` + the
        `onUnauthorized` 401 hook). Expose the raw-text `packetVersion` by having callers parse the
        Blob as JSON, OR return `{ blob, filename }` — prefer returning the Blob and let the caller
        read `content-disposition` is NOT reliable in all fetch impls, so parse the JSON
        `HandoffPackage` in the component to display `packetVersion`.
      Add exported types: `HandoffPackage` (the 8 fields from the contract table) and
      `SubmissionInput`. Keep `__test__` exporting `request`; optionally also export the download
      helper under `__test__` for unit testing the bearer header.
      Files: `services/apiClient.ts`
      Verify: `npm run typecheck` → clean; `npm test` → existing `tests/client/apiClient.test.ts`
      still green (175/1 preserved).

- [ ] 2. Build the Approval panel with a mandatory human-review acknowledgment in `CaseReview`
      (inside `components/Cases.tsx`).
      Replace the disabled "Approve for submission (next increment)" button (shown when
      `c.state==='packet_ready' && canApprove`) with a real panel: (a) an **acknowledgment checkbox**
      ("I have reviewed this packet and approve version v{c.packetVersion} for submission") that
      must be checked to enable Approve; (b) an **Approve** button, disabled while pending and until
      the checkbox is checked. On click call `api.approveCase(c.id, c.packetVersion)` sending the
      loaded `packetVersion`. On `ok`: run the shared post-mutation refresh (item 3) and reset the
      checkbox. On `conflict`: force the checkbox back to unchecked, show the server message
      ("packet changed / already approved — re-review"), and refresh detail+list+summary (never
      auto-reapprove). On `forbidden` (e.g. BILLER somehow): show the permission message. Keep the
      deadline urgency panel visible throughout. Approver-gated via `capabilities.canApprove`.
      Files: `components/Cases.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 3. Thread refresh plumbing from `Cases` into `CaseReview` and add summary refresh.
      In `Cases`, pass `onMutated: () => Promise<void>` to `CaseReview` that re-runs `openCase(id)`
      (detail reload) AND `refresh()` (list reload), and bumps a summary trigger. Add a lightweight
      summary fetch owned by `Cases` (or lift from Dashboard) so a mutation refreshes the on-screen
      review-work/deadline counts; minimally, reload detail+list here and document that Dashboard
      re-fetches summary on its own mount — but to satisfy "refresh detail+list+summary", add an
      `api.summary()` call in `onMutated` whose result updates a small summary-derived badge in Cases
      (e.g. "{packetsReady} ready for review"). Keep all three fetches null-safe and error-typed.
      Files: `components/Cases.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 4. Build the Handoff panel (generate + download) in `CaseReview`.
      Shown to all roles with `capabilities.canViewHandoff`. Two controls:
      - **Generate handoff** button, enabled ONLY when `c.state==='approved'` (disabled otherwise with
        an explanatory title). On click `api.generateHandoff(c.id)`; disable while pending; on `ok`
        show the generated `package.packetVersion` and run `onMutated`. On `conflict` (e.g. stale
        approval) show the message and refresh.
      - **Download handoff** button, enabled when `c.hasHandoff` is true. On click call
        `api.downloadHandoff(c.id)`; on the returned Blob, parse it as JSON to read `packetVersion`,
        create an object URL (`URL.createObjectURL`), trigger a download via a programmatically
        created `<a download=`handoff_${c.id}.json`>` click, then `URL.revokeObjectURL`. Surface
        `notFound`/`serverError` inline. Display "downloaded packet v{packetVersion}" after success.
        (Rationale: the Blob+object-URL path carries the bearer header; a plain `<a href>` would not.)
      Keep the deadline-urgency panel visible — generating a handoff is NOT submission and must not
      dismiss urgency. Show the handoff fields (`carrier`, `appealRoute`, `generatedAt`,
      `evidenceCount`, `packetVersion`) read from the last generate response or a prior
      `c.handoffVersion`.
      Files: `components/Cases.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 5. Build the human Submission-receipt form + readback in `CaseReview`.
      A SEPARATE form (distinct from Generate/Download), shown to roles with
      `capabilities.canRecordSubmission`, enabled ONLY when `c.state==='handoff_generated'`. Fields:
      `channel` (required; e.g. a select of payer_portal/fax/mail or free text), `confirmationNumber`
      (required), optional `submittedAt` (date/datetime) and `note`. **Label the whole form
      explicitly** as "Record a human-entered submission receipt — this is NOT payer transmission or
      independent confirmation." Client-side validate that `channel` and `confirmationNumber` are
      non-empty before enabling submit, BUT treat a server **409** as authoritative (show its message,
      do not assume 400). On click `api.recordSubmission(c.id, input)`; disable while pending; on `ok`
      immediately call `api.getReceipt(c.id)` and render the returned
      `{channel,confirmationNumber,submittedAt,note,recordedBy}` as the confirmed record (do NOT
      fabricate a confirmation from audit text), then run `onMutated`. On `conflict` show the message
      and refresh. When `c.hasReceipt` is already true on load, fetch and display the existing receipt.
      Do NOT wire any "Request changes"/revision control — render a short disabled note explaining no
      authenticated packet-edit/version-invalidation API exists.
      Files: `components/Cases.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 6. Wire run controls (replace the disabled "Scan for Denials") in `components/Cases.tsx`.
      Replace the disabled header button with real run controls, gated by `capabilities.canRun`:
      - A **Poll for denials** button → `api.runPoll()`. Show pending; on `ok` render the returned
        `{processed, cases}` (these are the SYNCHRONOUS drain results, not an async job id) and run the
        list+summary refresh. Label it clearly as a synchronous drain ("ran now; {processed} processed").
      - A **Run denial** control that takes a `denialId` (text input or a list of known denial ids if
        available) → `api.runDenial(denialId)`; show pending; on `ok` render `{caseId, state}` and
        refresh list+summary; `notFound` → "denial not found". Do NOT describe either as an
        accepted/async job. Do NOT build any schedule-editing UI (no schedule-config API exists).
      Files: `components/Cases.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 7. Enable Retry in `components/WorkflowRuns.tsx` AND add a case-level retry in `CaseReview`.
      - `WorkflowRuns`: the job list has no case id on the row, and retry is a **case** action
        (`POST /api/cases/:id/retry`), not a job action. So in `WorkflowRuns` either (a) keep the
        per-job control disabled with an accurate label ("retry is a case action — open the case"),
        OR remove it; do NOT wire a job-id-based retry (no such endpoint). Prefer relabeling to avoid
        implying a non-existent job-retry contract.
      - `CaseReview`: add a **Retry / re-run pipeline** button, gated by `capabilities.canRun`, shown
        only when `c.state ∈ {failed, needs_more_data, needs_review}`. On click `api.retryCase(c.id)`;
        disable while pending; on `ok` run `onMutated` (reload detail — the retry body is only
        `{caseId,state,packetReady}`, so repaint from a fresh `getCase`). For `needs_more_data` /
        `needs_review`, label it clearly: "Re-runs the pipeline for this case (there is no evidence or
        date-correction editor — correct the source data upstream, then re-run)." Do NOT fabricate an
        evidence/date editor. On `conflict` (state no longer retryable) show message + refresh.
      Files: `components/WorkflowRuns.tsx`, `components/Cases.tsx`
      Verify: `npm run typecheck` + `npm run build` pass.

- [ ] 8. Confirm legacy AI controls stay disabled + keep synthetic/cloud-off status visible.
      - `services/geminiService.ts`: leave the four rejecting shims untouched (no cloud SDK, no key).
      - `components/Analyzer.tsx` / `components/Appeals.tsx`: keep the existing FileReader
        try/catch/finally + `onerror` cleanup (already present — do NOT regress it). Ensure the
        upload/generate controls that call the rejecting shims are visibly disabled or marked
        "unavailable — backend replacement pending" (add a short disabled badge/tooltip near each
        control that invokes `analyzeGuidelines`/`generateAppealLetter`/`parsePolicyDocument`). Do NOT
        restore any browser cloud call, bundled key, or raw narrative egress. Do NOT present the
        prototype's `localStorage 'medauth_appeal_handoff'` fixture as a real server contract — leave
        that legacy convenience as-is but do not surface it as backend-backed.
      - Keep the Dashboard health badges + "Synthetic data • local-stub AI • cloud AI OFF" indicator
        (sourced from `GET /api/health` `allowCloudAi===false`) visible — already present; verify no
        regression.
      Files: `components/Analyzer.tsx`, `components/Appeals.tsx` (disabled-control labels only)
      Verify: `npm run typecheck` + `npm run build` pass; grep confirms no new import of any cloud SDK
      and the four shims still throw.

- [ ] 9. Add client unit tests for the new apiClient mutation methods (no DOM; node env).
      New `tests/client/apiClientMutations.test.ts` following the exact style of the existing
      `tests/client/apiClient.test.ts` (stub `globalThis.fetch`, capture calls). Assert:
      (a) `approveCase` POSTs `{packetVersion}` ONLY (body has no `actor`), maps 200→ok,
      400→badRequest, 409→conflict, 403→forbidden; (b) `generateHandoff` POSTs to `/handoff` with the
      bearer header and no `actor`, 409→conflict; (c) `recordSubmission` POSTs `{channel,
      confirmationNumber,...}` (no `actor`) and maps a 409 (missing field) → conflict — asserting the
      reconciliation that submit-field errors are `conflict`, not `badRequest`; (d) `retryCase`,
      `runDenial`, `runPoll` map status→kind correctly and carry the bearer header; `runPoll` returns
      `{processed,cases}` shape; (e) `downloadHandoff` sends `Authorization: Bearer <token>` and
      returns a Blob on 200 and the mapped `ApiError` on 404/network. Extend the existing
      "never sends actor" sweep to include the new methods (or add an equivalent assertion here).
      Files: `tests/client/apiClientMutations.test.ts` (new); optionally a tiny additive tweak to
      `services/apiClient.ts` `__test__` export for the download helper.
      Verify: `npm test` → all prior 175/1 PLUS the new tests pass (total rises; 175/1 must not drop).

- [ ] 10. Full verification gate (run all; fix any regression before done).
      In order, capture outputs:
      1. `node --version` → `v24.x`.
      2. `npm run typecheck` → clean.
      3. `npm test` → prior 175 passed / 1 skipped preserved + new client tests pass.
      4. `npm run build` → succeeds.
      5. Runtime smoke (temp DB, scheduler off) per the procedure below — exercise the real mutation
         chain end-to-end with curl so the wired contracts are confirmed against a live server.
      Files: none (verification only).
      Verify: all five pass; record outputs for the final report.

---

## Runtime smoke procedure (item 10.5) — temp DB, scheduler off

```
cd /Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-3-4
TMPDB="$(mktemp -t medauth-smoke-XXXX.db)"
MEDAUTH_DB_PATH="$TMPDB" MEDAUTH_ENABLE_SCHEDULER=false MEDAUTH_PORT=4100 npm start &
BASE=http://127.0.0.1:4100
```

Checks (expected):
1. `GET $BASE/api/health` (no token) → 200, `allowCloudAi:false`.
2. Login provider (`provider`/`dev-provider-pass`) → `$PTOK`. Login coordinator
   (`coordinator`/`dev-coordinator-pass`) → `$BTOK`.
3. `POST $BASE/api/run/denial/den_001` (Bearer `$PTOK`) → 200 `{jobId,caseId:"case_den_001",state:"packet_ready"}`.
4. `POST $BASE/api/cases/case_den_001/approve` with `$BTOK` body `{packetVersion:<v>}` → **403**
   (BILLER cannot approve). With `$PTOK` + wrong version → **409 stale**. With `$PTOK` + no body → **400**.
   With `$PTOK` + correct `{packetVersion:<v>}` (read `<v>` from `GET /api/cases/case_den_001`) → 200
   `{state:"approved",approvedVersion:<v>}`; a second identical call → **409** (duplicate).
5. `POST $BASE/api/cases/case_den_001/submit` before handoff → **409**. Then
   `POST $BASE/api/cases/case_den_001/handoff` (`$PTOK`) → 200 `state:"handoff_generated"`.
6. `GET $BASE/api/cases/case_den_001/handoff` (`$PTOK`) → 200 JSON with `content-disposition`
   attachment and `packetVersion`.
7. `POST $BASE/api/cases/case_den_001/submit` body `{channel:"fax"}` (missing confirmation) → **409**.
   Then body `{channel:"fax",confirmationNumber:"CONF-9"}` → 200 `state:"submitted"`.
8. `GET $BASE/api/cases/case_den_001/receipt` (`$PTOK`) → 200
   `{channel:"fax",confirmationNumber:"CONF-9",submittedAt,note,recordedBy}`.
9. `POST $BASE/api/run/poll` (`$PTOK`) → 200 `{processed,cases}`.
10. Retry on a terminal `submitted` case → **409** (not retryable).

Teardown: kill the server, `rm -f "$TMPDB"`. Never point the smoke at the real dev DB.

---

## Files summary
- Change: `services/apiClient.ts`, `components/Cases.tsx`, `components/WorkflowRuns.tsx`,
  `components/Analyzer.tsx`, `components/Appeals.tsx` (disabled-control labels only).
- New: `tests/client/apiClientMutations.test.ts`.
- Preserve untouched: all `server/**` and all existing tests; `services/geminiService.ts` (rejecting
  shims); `services/sessionContext.tsx`, `services/capabilities.ts`, `services/deadlineView.ts`;
  `components/Dashboard.tsx` (health status already correct — verify, don't rewrite).

## Scope guardrails (binding)
- Package 3 + 4 only. No backend contract change (server wins over the markdown; reconciliations
  recorded above). No cloud AI, no real model, no live Athena, no payer transport. Do NOT merge main.
- No optimistic UI; refresh detail+list+summary after every mutation; reconcile 409 to server state.
- Do NOT weaken or delete any existing test (keep 175/1 at minimum). Node 24+ only.

## Implement/review loop stop contract
- Stop when `/Users/anthonylavear/Med-PA-AI-App/.worktrees/ui-wiring-3-4/.agents/tasks/review.json`
  has `verdict` == `APPROVED`. Implementer runs first; verdict-writer runs last; the final
  verification + commit step is preserved.
