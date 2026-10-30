# Synthetic application demo release

> Current status (2026-10-28): the approved service/disk were created and the actual application is live at https://med-pa-synthetic-demo.onrender.com. See `HOSTED_ACCEPTANCE.md` for exact deployed commit, resource IDs, completed evidence and limits. The approval/setup descriptions below preserve the earlier handoff context.

## Local integration candidate — 2026-10-29

This candidate is **local only and has not been deployed**. The hosted release
record in `HOSTED_ACCEPTANCE.md` remains separate evidence for `72c4899`, not
browser or platform acceptance of this candidate.

- Branch: `codex/demo-retry-integration`.
- Worktree: `/Users/anthonylavear/Documents/Codex/2026-10-24/task/demo-retry-integration`.
- Tested implementation: **`a3ec3e5c811f8dd3f8c5ca970efcd157ff81ae35`**.
- Hosted source base: `f6d34d13cd5890527146b8809b5c78b71479fa5f` (documentation
  above the deployed `72c489985265d4024bd5b2d33e0c3c78b2654e2d` application).
- Fix source: `c916a78281969d8cdff9d36b92e79c404d96169d`, including implementation
  `9a675d0d1ca1f3c26d7185134a2b5f83b317e389` and its retry-recovery foundation.
- A documentation-only follow-up records these results. Resolve the exact local
  tip with `git rev-parse codex/demo-retry-integration`.

Product changes were ported onto a new branch using the common source base
`378141d`. No existing branch was merged, reset, pushed, or deployed. Historical
task-control files were not imported. The three API-client conflicts were
resolved explicitly: actionable JSON/Blob error details coexist with demo
`code`/`retryAfter`, expiry/429 classification, same-origin requests, anonymous
calls, and current-request-token checks. Durable case-scoped job metadata and
retry results are additive.

The candidate keeps the job display outside retry-action gates, retains
parent-owned 409 corrective instructions after reconciliation, and rejects
stale/revoked operational handoff downloads and receipts. Valid current and
submitted artifacts remain downloadable. The UI requests a download rather
than claiming a confirmed browser file save.

Seventeen hosted boundary/config files were checked byte-for-byte unchanged,
including the gateway, per-tester registry, fixed fixtures and limits, demo entry,
auth/config, session provider, application shell, sidebar, workflow list, demo
build script, Dockerfile, Blueprint, Vite config, and Docker exclusions. Per-context
recovery remains owned by the gateway and runs once when that tester's context
opens; `createApp` has no recovery side effect. No scheduler was added. The fixed
unknown-date/PDF retry restriction remains **403** in the gateway and unavailable
in the demo UI. No new fixture, upload, transport, role, or clinical-input scope
was enabled.

### Candidate verification (application implementation `a3ec3e5`)

Using existing matching dependencies and Node **v24.21.0**, with clean test
environments, disposable synthetic stores, and loopback-only listeners:

| Check | Result |
|---|---|
| Full `vitest run` | **312 passed, 1 live-Athena test skipped; 26 files passed**. |
| TypeScript `tsc --noEmit` | Passed. |
| `node scripts/buildDemo.mjs` | Passed; same-origin demo assets built. Existing large-chunk warning remains. |
| Independent source/coverage review | No blocking findings. |
| `git diff --check` | Passed. |

Affected coverage includes actionable 409/422 JSON and Blob errors alongside
429 timing/expiry, late-token responses that cannot clear a replacement session,
metadata-only job reads, separate tester retry budgets, interrupted recovery
once per context, unchanged unknown-date denial, stale/revoked download and
receipt rejection, another tester's valid submitted download, and demo-mode
rendering without clinical free-text receipt entry. The rendering tests are not
browser click/unmount evidence. Worker handling of corrupt queued payloads was
not expanded; only metadata reads avoid narrative decoding.

### Local process-runtime follow-up — 2026-10-29

Verification commit: **`8c2376ba132dd6e7051db0a621fc3a84d5ae0699`**. This changes
only `server/demo/entry.test.ts`; production application and packaging code remain
identical to the tested `a3ec3e5` implementation. The 312-test result above was not
repeated or relabeled as a fresh full-suite run.

The focused entry suite passed **4/4 tests**, including an opt-in check against
the existing built demo assets. Type checking and whitespace checks also passed.
Run the additional check after building the demo client:

```sh
MEDAUTH_RUNTIME_ACCEPTANCE_DIST="$PWD/dist" node node_modules/vitest/vitest.mjs run server/demo/entry.test.ts
```

On Node v24.21.0, the actual `server/demoIndex.ts` child process served the built
index and the exact entry-asset SHA-256, completed a synthetic Provider approval,
handoff and fixed receipt, then exited with code 0 on SIGTERM. A distinct Node
process reopened the same disposable store: existing tester sessions, case,
audit, durable job, handoff and receipt read back unchanged. The second tester's
same-ID case stayed unapproved and BILLER approval still returned 403. Both
testers were logged out, revocation was checked, both processes exited cleanly,
and owned temporary stores were removed. The child blocks outbound fetches.
Only the pre-existing non-host test-key fixture was used; no real credential or
live key was read or configured.

Ordinary entry checks now create their own public asset fixture so they do not
depend on a prior Vite build; the opt-in check uses the actual built directory.
Independent review identified a failure-diagnostic risk in string assertions;
boolean checks now prevent captured output or bearer values from being printed
as assertion diffs. The final affected tests passed after that correction, and
the reviewer confirmed the finding closed.

This is **Mac production-entry/process persistence evidence**, not a Linux image,
container-volume, browser, or hosted-platform pass.

### Container verification blocker — 2026-10-29

The installed Docker CLI is v29.8.0 and Docker Desktop is present, but its selected
local socket `unix:///Users/anthonylavear/.docker/run/docker.sock` is absent.
Colima reports stopped and Lima reports no instance. Docker Desktop CLI help
reported a denied log write at
`/Users/anthonylavear/Library/Containers/com.docker.docker/Data/log/host/docker-desktop.log`
with `operation not permitted`. That CLI path was stopped after the access
failure. No engine-start attempt, alternative engine/remote context, permission
change, software installation, image pull/build, or registry login followed.

A permitted local engine is required before checking the candidate's Linux/amd64
image build, locked dependency installation and native binaries, mounted-volume
UID/permissions, container PID 1/SIGTERM behavior, and container networking/health.
Those checks remain **unrun**. Starting the existing application on macOS does
not substitute for them.

### Local candidate browser acceptance — 2026-10-29–30 UTC

The owner confirmed MedAuth was the front Safari page and handed over browser
control. After one transient native-selection timeout, supported metadata was
checked before recovering the read-only target. The recovered page was
`http://127.0.0.1:4397/`; Safari's Sources view showed the actual loaded
`/assets/index-XqMMHNI4.js`. Its served SHA-256 matched
`a91e5df9386169168dee4c57bf5dfe6ea1e4345712970bb795bb167459cf6556`.
This verifies the demo build of application implementation `a3ec3e5`, at local
documentation/test tip **`b9dd377f70ee303d1f58aefa3e982af6ec229872`**.

The preview runs `server/demoIndex.ts` on Node 24, bound only to
`127.0.0.1:4397`, with a separate owned demo store. The former practice-QA store
was preserved. Health reports synthetic EHR, local-stub AI, cloud disabled, and
registry/assets ready; server outbound fetches are blocked. No real credential,
healthcare agreement, live connection, or hosted setting was used or changed.

| Actual Safari check | Observed result |
|---|---|
| Packet-ready job after Dashboard/Cases remount and refresh | Same completed job/attempt metadata remained visible outside retry controls. |
| Approval acknowledgment and repeated clicks | Approval disabled before acknowledgment; double-click created one approved audit entry. |
| Current handoff download | Backend artifact became a browser Blob; UI said **Download requested**. Safari's download-permission prompt was canceled; file save was not verified or claimed. |
| Newer packet invalidates old artifact | Cached download returned an actionable conflict; reconciliation disabled download and receipt. |
| Approval revoked at the same version | Cached download returned an approval conflict; no Blob/download prompt appeared. |
| Cached receipt for a stale handoff | Conflict returned; receipt stayed absent and actions became disabled. |
| Missing retry fields (422) | Named `carcCodes_or_rarcCodes` and displayed the upstream correction. |
| Missing denial row (409) | Parent-owned missing-row heading, missing field and re-import action survived panel reconciliation and list refresh. |
| Repeated retry, durable job and limit | Double-click produced one retry; a second allowed retry reused the same job. A third was blocked by the demo limit. |
| Unknown-date sample | Needs-review, explicit unknown deadline and blocker, no approval/retry action; latest job remained visible. |
| Provider/Biller boundary and receipt readback | Role switch retained the workspace; Biller had no ready-packet approval controls, could record the valid fixed synthetic receipt, and its receipt/audit persisted after navigation. |
| Reset/cancel/empty state | Cancel preserved work; confirmed reset created an empty generation with no jobs. Biller could run a fresh fixture, without gaining approval controls. |
| Responsive navigation/layout | Visually inspected Safari viewports 390×844, 820×1180 and 1280×900; mobile navigation worked and controls remained available. Responsive mode was exited afterward. |
| Full reload and fresh entry | Reload returned to the explained in-memory-session entry screen; a new Provider session had zero cases. Leave demo returned to entry. |

Five reversible, guarded faults were applied only to the uniquely identified
owned synthetic generation: two packet-version invalidations, one approval
revocation, missing codes, and a missing normalized denial row. These were test
fixture changes, not exposed editing/revocation product features. Every fault
was restored before the next. A separate read-only capture before UI reset
confirmed three cases/denials/jobs, no duplicate associations/keys or foreign-key
violations, one approval, one submission, and two retry-request audit entries.
The held case's original job was done at attempt 3. No receipt was written by the
stale action. No product-code correction was needed during this browser pass.

Sanitized supporting records are in the task's
`demo-integration-evidence/browser-db-check.json` and `browser-acceptance.json`;
they contain no bearer values, keys, or encrypted narrative payloads. Earlier
browser-target blockers remain historical evidence, not the final status.
These records summarize tool observations rather than an exported raw browser
or network trace. Independent documentation/evidence review found no blocking
contradiction. Foreground control was released for the other project tasks.

Limits: this was a single Safari tab with role switching, not simultaneous
independent browser clients or a real device. Full reload intentionally abandons
the in-memory token; its old sandbox expires under the existing server limits.
No fresh wall-clock expiry wait, browser process-kill/restart, stale approval
POST from an old review form, or confirmed file save was performed. Existing
automated isolation/version tests and Mac process-restart evidence remain
separate results. No full suite was repeated for documentation-only changes.

### Remaining gates before a release decision

1. **Bounded local browser acceptance passed as recorded above.** Any broader
   browser/device, simultaneous-client, wall-clock expiry or file-save claims
   require additional evidence. The prior unrelated-private-window restriction
   was respected. Never accept a healthcare agreement on the owner's behalf.
2. **No candidate container or remote platform run has occurred.** Existing
   platform evidence belongs to `72c4899`. Preserve the single service/disk,
   manual release settings and stable host key if a later release is authorized.
   No key or live environment setting was read or configured here.
3. **Push, integration into an existing branch, and deployment require separate
   authorization.** No new vendor, payer transport, real model/EHR connection,
   PHI use, or production-readiness claim is included.
   The unchanged Blueprint still names `codex/hosted-synthetic-demo`; it does not
   select this local candidate automatically. A later authorized release must
   explicitly reconcile and verify its exact source SHA before any deployment.

The candidate preview is running at `http://127.0.0.1:4397/` from this worktree's
validated demo build, using a dedicated store outside public assets. It replaced
the stopped listener, not the former practice-QA database. It is available only
while the Mac and local process remain running; this is not a hosted release.

---

The sections below retain the original hosted release/setup context.

This local release is based on accepted application commit `378141dcc5d5b7b41b67e99c79b4b7854ff7af82`. It is separate from Kiro's active PDF retry branch and the already published static concept. Do not deploy the older remote `main` in its place.

## Boundaries

The React client uses real backend HTTP requests, hashed bearer sessions, permissions, encrypted case persistence, durable job/audit records and versioned approval/handoff gates. Test identities and all records are synthetic. EHR/policy adapters are fixed fixtures; AI is the deterministic local stub. A recorded test receipt does not deliver anything to a payer. There is no general upload or clinical free-text intake path in the demo gateway.

Each tester receives a separate SQLite/AppContext. Only Provider/Biller test roles are available. Do not publish seeded development admin credentials or expose the ordinary application server entry as this demo.

## Local and host packaging

- Node 24+ is required for `node:sqlite`.
- `npm run build:demo` builds the demo-only React navigation with relative same-origin API requests.
- `npm run start:demo` starts the isolated demo gateway, not the ordinary practice server.
- The server requires an explicitly supplied stable `MEDAUTH_DEMO_ENCRYPTION_KEY`; keep it outside source/history. For local QA use a disposable generated test key and data directory. The owner approved native Render generation/storage for this demo key; it has not been created or read.
- `MEDAUTH_DEMO_DATA_DIR` names the dedicated sandbox/registry directory, normally beneath the persistent mount. Never point it at a practice/Kiro database.
- `PORT`/`MEDAUTH_PORT` and `MEDAUTH_HOST` define the listener; local QA binds loopback, while the proposed host binds its routing interface.
- `MEDAUTH_CLIENT_DIST` points to this release's built `dist`. UI and API share an HTTPS origin on the host.
- The proposed Docker packaging is `Dockerfile.demo`. Its build deliberately retains TSX, currently a development dependency. Build locked dependencies on the host; never upload Mac `node_modules`.

No local dependency installation or Docker image pull/build is required for the current verification using the existing Node 24 runtime and dependency tree. The container build remains a separate verification step; it has not been claimed as tested merely because the local build passes.

## Styling packaging limit

Google Fonts, remote ESM import maps, and the browser loopback shim were removed. The existing Tailwind browser runtime remains at the application's original CDN URL. A read of the pinned existing asset at `https://cdn.tailwindcss.com/3.4.17` returned HTTP 403; that operation was stopped, with no alternative-path bypass or package installation. The demo still requires this existing external styling dependency until a permitted local CSS build/bundle is supplied. It is not an offline package.

## Proposed remote destination and cost

No paid service/disk or host credential has been created. Approved deployment destination is **Provider Platform**, Render workspace `tea-dakk93942hec73asmhkg`. Existing service inventory was read without changing any service. Proposed new resource: **med-pa-synthetic-demo**, one Docker web-service instance in Oregon plus a 1 GB disk mounted at `/var/data`; auto-deploy off, source pinned to the tested demo branch/commit.

Current official [pricing](https://render.com/pricing) lists $7/month for 0.5 CPU/512 MB and $0.25/GB/month for disk: **$7.25/month service/storage subtotal**, prorated compute, before tax/usage. This configuration needs no workspace upgrade under published Hobby limits; no new workspace subscription is proposed. Any existing workspace subscription is separate. The current workspace billing plan/invoice could not be inspected: the connector has no billing-plan tool, and the Dashboard redirected to GitHub sign-in without an existing browser session. No password was requested or entered. Therefore the whole-account bill is unverified.

Published Hobby allowances are 5 GB outbound and 500 standard build minutes; overage rates are $0.15/GB and $5/1,000 minutes. Quotas are workspace-wide and existing services consume them. Do not present $7.25 as a guaranteed maximum bill. Four concurrent synthetic sandboxes is an initial application limit, not proof that 512 MB is sufficient under hosted load.

[Terms, paid-services section](https://render.com/terms#paid-services) state monthly arrears invoicing and no cancellation refunds; accrued unpaid usage remains due on cancellation. [Pricing](https://render.com/pricing#faq) states compute billing is prorated to the second. The official [billing guide](https://render.com/articles/how-paas-billing-works) confirms that stopping the service ends compute charges while persistent storage keeps billing until deleted. Disk/data deletion requires a deliberate export/retention decision; automatic disk deletion with service deletion was not verified. No cancellation action has been performed, and no promise about a specific account's credits/refunds is made.

The owner explicitly approved this resource/storage cost and native generated key. Provisioning is blocked on an authenticated Render Dashboard session: the connector cannot attach the disk or use server-side `generateValue`, and the browser currently stops at GitHub sign-in. No attempt was made to extract existing credentials or create a partial paid service. Branch push, if performed, is only to the separate authorized demo branch in the existing Med-PA repository; it does not merge or rewrite main.


## Approval package and overage limits

`render.demo.yaml` declares only the proposed new demo service and its 1 GB disk, with auto-deploy and previews off. It does not modify the five existing services. Applying this single-service file is authorized but has not been performed. The separate approved feature-branch push does not apply a Blueprint.

With the owner’s explicit secret approval, Render can generate `MEDAUTH_DEMO_ENCRYPTION_KEY` itself with `generateValue: true`. The current [Blueprint reference](https://render.com/docs/blueprint-spec#generating-random-secrets) specifies a random base64-encoded 256-bit value when the variable is absent. Do not retrieve, print or commit that value. Preserve it across restarts; replacing it requires a new disposable demo store because existing encrypted records would no longer decrypt. No cloud/EHR/payer credentials are needed.

The [build spending limit](https://render.com/docs/build-pipeline) is workspace-wide; hitting it can stop builds for the other five services. It was not changed. The [outbound-bandwidth guide](https://render.com/docs/outbound-bandwidth) documents shared allowances and billed overage; no per-service total or bandwidth hard cap was found. Application request, session and storage limits reduce resource use but do not guarantee a maximum invoice, especially for public static asset traffic. Auto-deploy off prevents this demo from launching a build on every push; the disclosed subtotal and possible shared overages were approved, while account-specific billing remains unverified.

## Current release and dashboard handoff

The readiness fix is committed at `0f258cfeef11d28cb8bff884590aaeefa5beb689` on `codex/hosted-synthetic-demo`; final local tests pass (246 tests, one live-Athena skip), as do type checking and the demo build. The owner’s active checkout remains at `9fd98ef`; Kiro’s PDF retry work is unchanged.

Open the [Blueprint setup](https://dashboard.render.com/blueprint/new?repo=https://github.com/drew111888/Med-PA-AI-App), sign in normally, then select Provider Platform, branch `codex/hosted-synthetic-demo`, and custom Blueprint Path `render.demo.yaml`. Review that it creates only `med-pa-synthetic-demo`, one Oregon 0.5 CPU/512 MB instance and 1 GB disk; stop for any materially different price, subscription, permissions or legal terms. The Blueprint review supplies platform validation before creation. Keep the generated encryption-key value hidden.

Service auto-deploy is off in the file. Blueprint Auto Sync is a separate Dashboard setting: disable it for manual releases too, so future Blueprint changes do not deploy automatically. Use this same single service identity for all subsequent deploy checks.

After platform build/deploy, verify its exact commit and terminal deploy status, `/api/health`, anonymous entry, two independent tester sessions, role gates, ready/missing-evidence/unknown-date fixtures, approval → handoff/download → synthetic receipt/readback, reset/expiry, mobile layout, prohibited/private paths, and durable case/receipt state across a service restart. None of these remote checks is satisfied by local tests or resource creation alone. The public static concept URL is not the actual backend demo.
