# Synthetic application demo release

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
