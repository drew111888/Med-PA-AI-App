# Hosted synthetic demo acceptance — 2026-10-28

Public application: https://med-pa-synthetic-demo.onrender.com

This is the React application with its real isolated demo gateway and durable workflow, separate from the earlier static concept. Records and roles are synthetic. No account/password, document upload, live EHR, real model call, or payer delivery is available.

## Release and resources

- Deployed application SHA: `72c489985265d4024bd5b2d33e0c3c78b2654e2d`, branch `codex/hosted-synthetic-demo`.
- Initial deployment: `5aec2a6f86778fe1b66f868638309f12c7f1fe22`, deploy `dep-dbguqcutlv9c73dem4sg`, live at 12:41:32 UTC.
- Final UI release: deploy `dep-dbgutletlv9c73det4pg`, live at 12:47:59 UTC. It changes only audit-row wrapping and contrast; backend behavior is unchanged.
- Workspace: Provider Platform, `tea-dakk93942hec73asmhkg`.
- Blueprint: Med-PA Demo, `exs-dbguptugekts738tk360`, custom path `render.demo.yaml`.
- Service: `med-pa-synthetic-demo`, `srv-dbguqcetlv9c73dem43g`, Oregon, one `0.5c-512mb` Docker instance.
- Disk: `dsk-dbguqcmtlv9c73dem4cg`, `med-pa-demo-data`, 1 GB at `/var/data`.
- Approved resource subtotal: $7.25/month before shared usage overages/tax. Charges are prorated; retained storage continues billing until deleted. No workspace upgrade or unrelated resource change was made.
- Service auto-deploy is off; Blueprint Auto Sync reads No. Later documentation-only pushes are not automatic releases.

The Dashboard plan accepted one $7/month server and one $0.25/month disk. Native Blueprint `generateValue: true` supplied the encryption key. No secret value was retrieved, printed, copied, or committed. This does not establish an invoice cap or validate whole-account billing.

## Deployment and persistence

Render built `Dockerfile.demo` successfully using the Node 24 bookworm image. The gateway started on the expected port and passed `/api/health`, reporting registry/assets ready, synthetic EHR, local-stub AI and cloud disabled. The configured SQLite tree lies beneath the mounted disk. Actual sandbox writes, case/packet reads and the write-probe passed on that runtime.

The initial Provider browser session, approved packet v1, handoff and exact synthetic receipt were read back unchanged after the final UI deployment. A retained HTTP Biller session and packet survived that same rollout. Revoked old tokens remained unauthorized.

A separate explicit Restart Service event, `evt-dbguupugekts738trvng`, occurred at 12:49:43 UTC without changing the deployed commit or key configuration. Health returned ready. The existing browser session then navigated away/back, reloaded case detail and fetched the same receipt after remount. A disk-backed rollout briefly returned 502 during the expected interruption; it recovered. Restart did not create another resource or increase the plan. Render metrics identify a new runtime instance after the explicit restart, while the instance count remains one. Observed process memory during the bounded run was roughly 55–73 MB against the reported 537 MB limit; this is a spot observation, not a load/capacity guarantee.

Local Docker-image testing remains unavailable because the Mac Docker daemon socket is missing. Successful Render image build/runtime and disk persistence supply platform evidence; they do not imply a local image test was run. One later Render log query returned a Loki 503; initial build/start logs and service/deploy/event APIs were available.

## Automated and HTTP evidence

The pre-deployment readiness release passed Node 24 type checking, demo build and the full suite: 25 files, 246 tests passed, one live-Athena test skipped. This includes 15 key/readiness guards, three real-entry tests and 21 demo HTTP tests. No live Athena test was run.

The final audit-layout-only patch passed type checking, demo build and diff checks. The full backend suite was not rerun for CSS-only changes. Render then built and ran that exact application commit.

The bounded live HTTP pass initially produced 134/134 passing assertions across 85 requests against `5aec2a6`; later durability/readback, response-cache and actual idle-expiry checks bring the final evidence to **151/151 passing assertions across 93 requests**, with zero failures. All 83 recorded API responses used no-store. These counts are not a fresh full pass on `72c4899`. The same unchanged backend is in both releases; final-release browser checks below run the new client.

Coverage includes independent same-ID sandboxes, anonymous/invalid-token 401, Biller approval 403, rejection of ADMIN/raw login/PDF/arbitrary text, stale and simultaneous approval conflicts, unknown-date/null-packet and missing-evidence gates, handoff versus generated receipt, reset revocation, per-case retry/poll limits, body limits and no-store responses. Prohibited source/.env/database-looking paths returned only the public SPA HTML fallback; HTTP 200 there does not mean private files were served. The sanitized harness/report is outside the checkout at `../hosted-demo-evidence/live/`.

Actual hosted idle expiry passed at 13:04:19.748902 UTC: the untouched Biller session returned 401 after 917 seconds (15 minutes 17 seconds), before its 30-minute absolute TTL. The same session spanned the explicit restart. No clock, database or limit was altered, and no HTTP read extended its idle time. All owned HTTP/browser testers were logged out or expired and private bearer state was deleted. The real 30-minute absolute timeout was covered by automated tests rather than a second live 30-minute wait.

## Browser acceptance on the final client

- Anonymous entry states synthetic-only, real workflow backend, AI stub and no payer delivery. Demo role selection is not real-person identity proof.
- An independent Biller starts empty while another tester has a submitted case. Its own ready case remains unapproved and has no approval control. Server-side Biller denial was separately verified by HTTP.
- Switching the Biller demo role to Provider preserves its own case and uses a new server session. Reset cancellation via Escape preserves the case; confirmed reset clears only that tester. The other browser still reads two cases and its recorded receipt.
- The final client runs a fresh ready fixture, shows packet v1/evidence, requires acknowledgment before approval, then shows approved with no handoff/receipt/submission. A separate handoff produces a real authenticated JSON download while submission remains unrecorded. Only the separate synthetic-receipt action records submitted/readback/audit.
- Unknown date stays unknown, needs review, packet v0/no draft and no approval. Missing evidence stays needs more data/no draft. Two browser retries preserve the evidence gate; the third shows the explicit retry-limit message.
- Feedback exported as local JSON. Both browser-owned sessions were logged out; the public entry remains open for the owner at the normal desktop viewport.
- Phone 390×844 and tablet 820×1180 document widths match their viewports. The audit card and every inspected row have matching client/scroll widths, including long actor/receipt details. Phone rows stack, tablet rows remain horizontal. The original audit timestamp overflow was fixed in the final commit. Desktop navigation and review flow also rendered.
- No JavaScript errors were observed during the core journeys. Expected 401/403/409/429 are acceptance cases, not successful clinical actions.

Screenshots were inspected through supported browser APIs. No screenshot file/export is claimed.

## Practical limits

Four concurrent sandboxes, 30-minute absolute lifetime, 15-minute idle lifetime, fixed catalog records, bounded bodies/retries/polls and storage apply. These are application controls, not a load test, penetration-test guarantee or hosting spending cap. Refreshing loses the tab-memory session view; use Leave demo to release its slot. Feedback is also in tab memory until exported.

The deterministic AI stub is not clinical reasoning validation. Rules/policies/dates are illustrative synthetic fixtures. No arbitrary clinical narrative, binary PDF upload, live Athena/cloud AI or payer transport was tested or enabled. Kiro's separate PDF retry implementation is not included. The original Tailwind CDN styling dependency remains; this is an online demonstration, not an offline/self-contained package. No production, identity, de-identification, coverage or compliance guarantee is made.

Final readiness checkpoint at 13:04:54 UTC: deployment `dep-dbgutletlv9c73det4pg` remains live at exact application SHA `72c489985265d4024bd5b2d33e0c3c78b2654e2d`; health returns HTTP 200 with registry/assets ready and cloud disabled. No remaining launch blocker was identified for this bounded synthetic demo. The limits above still apply.
