# Local synthetic application acceptance

> Hosted follow-up (2026-10-28): `HOSTED_ACCEPTANCE.md` records the actual public deployment and browser/HTTP acceptance, separate from this historical local pass.

Base: `378141dcc5d5b7b41b67e99c79b4b7854ff7af82`. Release branch: `codex/hosted-synthetic-demo`. All work was performed in a separate task worktree; the owner's checkout and Kiro's PDF retry work were preserved.

## Automated evidence

- Node 24.21.0, using the already installed dependency tree; no package installation.
- Full Vitest suite: **25 files passed; 246 tests passed, one live-Athena test skipped**, duration 3.45 s. Includes the final startup, key-verification and public-root guards.
- Includes **21 actual HTTP demo acceptance tests** against disposable databases and **55 client tests**. HTTP listeners were confined to loopback using a QA-only preload; application source was not altered for that constraint.
- TypeScript `tsc --noEmit`: pass.
- `npm run build:demo`: pass. Vite's large-chunk advisory remains; no build error.
- `git diff --check`: pass.
- Built client scan found none of the encryption-key variable names, development admin password, old loopback API origin, remote ESM import map or Google Fonts URL.

See `server/demo/HTTP_ACCEPTANCE_REVIEW.md` for the authorization/lifecycle review and individual HTTP coverage. All original core tests remain in the suite. No live Athena, model, cloud AI or payer transport was exercised.

## Actual browser journey

The final built React client ran against `server/demoIndex.ts` at `http://127.0.0.1:4389/`, using a private disposable local data directory and an uncommitted test key. This is a verified local route, not a remote hosted application URL. The owned QA server was stopped cleanly with exit code 0 after acceptance.

| Check | Observed result |
|---|---|
| Server-issued session | Start Provider creates a real bearer-backed sandbox, initially empty. No password or real-person identity is requested. |
| Actual pipeline | Ready-for-review fixture produces `case_den_001`, a durable completed job, evidence citations, a checked local-stub output and packet v1. |
| Approval | Disabled before acknowledgment. Provider approval changes persisted state/approved version; handoff and receipt remain absent. |
| Handoff/download | Separate generation enables authenticated JSON download; the downloaded artifact is real synthetic backend output. Submission stays unrecorded. |
| Receipt/readback | Record synthetic receipt stores a server-generated reference. Dashboard count becomes one; navigate away/back reads the same receipt and audit actor from the server. No payer delivery occurs. |
| Independent testers | Second Biller session has its own `case_den_001`, still pending while the first Provider's case is approved/submitted. Biller has no approval action. |
| Role rotation | Server switch from Biller to Provider retains that tester's independent case and enables the Provider acknowledgment/action. |
| Repeated intake | Repeating the ready fixture after submission keeps the submitted case/receipt; no duplicate appeal is created. |
| Unknown date | Fixed unknown-date intake produces `needs_review`, packet v0/null draft, unknown deadline and no approval. No date is fabricated. |
| Missing evidence/retry | Fixed missing-evidence fixture produces `needs_more_data` without an AI draft. Retrying does not satisfy evidence gates; the third retry is rejected with the configured limit message. |
| Reset/cancel | Escape cancels reset without changing cases. Confirmed reset empties only the first tester's workspace; the second tester's case stays pending. |
| Local feedback | Synthetic comment exports as a local JSON download. No application endpoint receives feedback. |
| Logout/expiry | Leave returns to welcome. For the UI expiry check, only the disposable private QA registry's expiry was advanced; the next refresh returns to entry with an explicit expired-session message, not an empty queue. Deterministic expiry/reopen/capacity tests also pass in HTTP acceptance. |
| Desktop/tablet/phone | Desktop, 820×1180 tablet and 390×844 phone inspected. Tablet/phone document widths match their viewports. Phone navigation uses normal flow, with full-width review/approval controls and no 256px sidebar crowding the content. |
| Console | No JavaScript errors observed. The inherited Tailwind browser-runtime dependency remains a packaging limitation described below. |

Screenshots were inspected through the supported browser API only. No denied screenshot export, native ChatGPT app control or alternative export workaround was attempted; no screenshot file is claimed.

## Boundaries and remaining release gates

Actual defaults are four sandboxes, 30-minute absolute/15-minute idle expiry, 16 KiB bodies, 64 MiB total demo storage, one poll/reset, two retries/case, four resets/hour, and separate bootstrap/read/mutation/traffic budgets. They are tested application limits, not a provider billing cap or hosted load guarantee. SQLite case fields retain core application encryption; this does not mean every metadata field or the entire database is encrypted.

The core retry/intake implementation was not changed. Fixed PDF/unknown-date retry is explicitly unavailable until Kiro's separate fix is completed, reviewed and integrated by exact commit. The demo demonstrates synthetic EHR/known-text intake, not arbitrary binary PDF upload or real model inference.

The existing Tailwind CDN runtime remains; its pinned download returned HTTP 403 and was not bypassed. Google Fonts/remote ESM references were removed. This release is not fully offline.

`Dockerfile.demo` is prepared but was not image-built, because the installed Docker CLI has no running daemon: its desktop-linux socket is missing. No Docker installation, daemon startup or local image pull/build was attempted. Render CLI is unavailable and Python's JSON-schema validator is absent; `render.demo.yaml` was reviewed against the current official specification/schema, but no Render platform validation or sync was performed. The official schema was fetched read-only. Apply native validation before an approved resource creation.

The owner approved the specified paid service/disk and native generated encryption key; no paid service/disk, host secret or backend deployment had been created at this local acceptance checkpoint. See `DEMO_RELEASE.md` for the resource/billing/secret package and `CONTAINER_CHECKS.md` for remaining live checks. Branch push does not constitute deployment or merge to main.
