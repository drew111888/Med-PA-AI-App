# Review — UI Wiring Packages 3 & 4 (`feat/ui-wiring-3-4` @ fd41406)

Reviewer pass against `.agents/tasks/ui-wiring-3-4-plan.md`, the original user request, and the
listed discipline requirements. Diff compared against `feat/ui-wiring-1-2` (the Pkg 1&2 base).

## Verdict: APPROVED — no blocking findings.

## Scope of change (FACT — `git diff --name-status`)
- M `components/Analyzer.tsx`, `components/Appeals.tsx`, `components/Cases.tsx`,
  `components/WorkflowRuns.tsx`
- M `services/apiClient.ts`
- A `tests/client/apiClientMutations.test.ts`

No `server/**` file changed. No existing test file modified or deleted (the only `.test.ts`
in the diff is the new additive `tests/client/apiClientMutations.test.ts`). Matches the plan's
"change set" and the scope guardrail exactly.

## Verification evidence (read from commit message `fd41406`, not re-run)
- `node --version` → v24.21.0.
- `npm run typecheck` → clean (tsc --noEmit, exit 0).
- `npm test` → 19 files, 195 passed / 1 skipped (152 backend + 23 prior client + 20 new).
  Baseline 175/1 not regressed.
- `npm run build` → vite build OK (pre-existing chunk-size warning only).
- Runtime smoke (temp DB, scheduler off, port 4100): health allowCloudAi=false; run den_001 →
  packet_ready; approve BILLER 403 / wrong-version 409 / no-body 400 / correct 200 / duplicate
  409; submit-before-handoff 409; handoff 200 w/ packetVersion; download 200 attachment +
  packetVersion; submit missing-field 409 / valid 200; receipt readback 200; poll
  {processed:3,cases:3}; retry-on-submitted 409.

Evidence is complete (L2 static + L3 test + L4 build + L5 runtime smoke, per the commit).
Spot-checks performed this pass to resolve specific doubts: server route mapping and Dashboard
health status (both confirmed below). Full suites not re-run per instruction.

## Discipline requirements — findings

1. **Approve: {packetVersion} from loaded detail, human-review checkbox gate, disabled while
   pending, 409 → refresh detail+list+summary + force re-review, no auto-retry.** PASS.
   `handleApprove` sends `api.approveCase(c.id, c.packetVersion)` (loaded detail). Button
   `disabled={!acknowledged || approvePending}`; checkbox text names the exact version. On
   `conflict`: `setAcknowledged(false)` + `onMutated(c.id)` (which runs
   `getCase`+`listCases`+`summary`) and surfaces the re-review message. No branch re-issues the
   approve call. `apiClient.approveCase` body is `{packetVersion}` only (test-asserted
   `Object.keys(body) === ['packetVersion']`, no `actor`).

2. **Generate handoff: separate control, enabled ONLY when state==='approved', shows generated
   version, deadline urgency stays visible.** PASS. `disabled={c.state !== 'approved' ||
   handoffPending}` with an explanatory title otherwise; renders
   `generatedHandoff.packetVersion`; panel copy states it is NOT submission; the deadline panel
   is rendered unconditionally above and is not dismissed by handoff generation.

3. **Download handoff via fetch → Blob → object URL with bearer header, surfaces errors +
   packetVersion.** PASS. `downloadHandoff` in `apiClient.ts` is a separate `fetch` helper that
   attaches `authorization: Bearer <token>` from `tokenGetter` (NOT the JSON `request()` path,
   NOT a plain `<a href>`), returns the Blob on 2xx, maps non-2xx via `kindForStatus`, fires
   `onUnauthorized` on 401, and returns `serverError`/status 0 on network throw. The component
   parses Blob JSON for `packetVersion`, builds an object URL, triggers an `<a download>` click,
   then `revokeObjectURL`; download errors surface via `ErrorLine`. Tests cover bearer header,
   200 Blob, 404→notFound, network→serverError, 401→onUnauthorized.

4. **Record submission: separate form, enabled ONLY when state==='handoff_generated', 409
   authoritative, reads back GET /receipt, labeled HUMAN-ENTERED (not payer confirmation / not
   submitted-at-handoff).** PASS. Distinct panel; entry form only rendered when
   `c.state === 'handoff_generated'`; client validation gates the button but `handleRecordSubmission`
   routes a server `conflict` through `onMutated` and surfaces the message (treated as
   authoritative). On `ok` it calls `api.getReceipt(c.id)` and renders the stored record (not
   fabricated from audit). Copy explicitly labels it a human-entered receipt, "NOT payer
   transmission and NOT independent payer confirmation." Server maps SubmissionError → 409
   (confirmed in `caseRoutes.ts`), matching the client's 409-as-authoritative handling.

5. **After every mutation: refresh detail+list+summary; no optimistic advance; 409 reconciles.**
   PASS. `reloadAfterMutation` runs `Promise.all([openCase(id), refresh(), refreshSummary()])`
   and is passed as `onMutated` to every mutation handler (approve/handoff/submit/retry). No
   handler mutates local case state before `isOk(res)`. Every `conflict` branch calls `onMutated`.
   Run controls refresh list+summary via `onRan`.

6. **Revision / 'Request changes' omitted or clearly disabled.** PASS. No revision control exists;
   a static note states no authenticated packet-edit/version-invalidation API exists and directs
   the user to correct source data upstream and re-run.

7. **Run controls (run/denial, run/poll) show pending then actual returned state, not async; no
   schedule-editing UI.** PASS. `RunControls` shows pending labels ("Draining…"/"Running…") then
   renders `{processed,cases}` for poll and `{caseId,state}` for denial — the actual synchronous
   drain results. Copy explicitly says "runs now … not an accepted background job. No schedule
   configuration is exposed." No scheduler UI present.

8. **Retry enabled for failed/needs_more_data/needs_review with pending/disabled + post-action
   refresh; no fake evidence/date editor.** PASS. `retryable = state ∈ {failed, needs_more_data,
   needs_review}`; button `disabled={retryPending}`; on `ok`/`conflict` runs `onMutated`
   (repaints from fresh `getCase` since the retry body is partial). Copy states there is no
   evidence/date editor; none was added. `WorkflowRuns` correctly relabels retry as a case action
   (no job-retry endpoint) rather than wiring a non-existent contract.

9. **Legacy geminiService.ts shims remain rejecting; disabled 'unavailable — backend replacement
   pending' controls; FileReader try/finally intact; no browser cloud SDK / bundled key / raw
   narrative egress restored.** PASS. `services/geminiService.ts` byte-diff = 0 (untouched); all
   four functions reject via `notWired`; only import is a local `types.ts` (no cloud SDK).
   Analyzer/Appeals upload + analyze/generate controls are `disabled` with
   `title="Unavailable — backend replacement pending"`. FileReader `try/finally` + `onerror`
   cleanup still present (Analyzer lines 86/114/118; Appeals 98/102/139).

10. **Health-derived 'Synthetic / local-stub AI / cloud-off' status visible.** PASS.
    `Dashboard.tsx` derives `cloudOff = h.allowCloudAi === false` and renders
    "Synthetic data • local-stub AI (<provider>) • cloud AI OFF". Unchanged this pass (verified,
    not regressed).

11. **Backend contracts NOT changed; existing tests NOT weakened/deleted; new client tests cover
    mutation flows; suite not regressed below 175/1.** PASS. No `server/**` change; no existing
    test touched. New `apiClientMutations.test.ts` (20 tests) covers approve (200/400/409/403),
    generateHandoff (+409), downloadHandoff (bearer/Blob/404/network/401), recordSubmission
    (body shape, optional-field omission, missing-field→409 reconciliation), getReceipt readback,
    retryCase (+409), runDenial (+404), runPoll ({processed,cases}), and a no-`actor` sweep.
    Commit records 195 passed / 1 skipped (≥ 175/1).

## Server cross-check (spot-check, `server/routes/caseRoutes.ts`)
Confirmed the client's assumptions: approve → 400 (missing packetVersion) / 409 (state, no AI
validation, no evidence, stale/dup); retry → 409 for non-retryable / 404 missing / 409 denial
not discoverable; `POST /handoff` SubmissionError → 409; `GET /handoff` → 404 or package JSON
with `content-disposition: attachment` (so the Blob→JSON `packetVersion` read is valid);
`POST /submit` SubmissionError → 409 (matches the 409-authoritative handling). No contract drift.

## Remaining risk / unknowns (non-blocking)
- Runtime verification is the coder's recorded curl smoke (L5 for the API chain) plus L3 client
  unit tests; there is no automated browser/E2E test exercising the rendered React mutation
  panels. The component wiring is verified by inspection + the apiClient unit tests, not by a
  rendered-DOM test. Not a blocker for this scope (plan explicitly keeps the single node test
  env, no jsdom), but noted.
- Athena / real-model / payer transport remain explicitly out of scope and unverified, as
  intended.
