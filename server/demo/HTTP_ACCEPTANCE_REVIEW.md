# Synthetic demo HTTP acceptance review

Scope: the hosted demo gateway in this isolated project. This review does not authorize real patient data, live EHR/model connections, payer transmission, or publication of credentials. Final local configuration/readiness guards pass as recorded in `../../CONTAINER_CHECKS.md`; hosted image/runtime acceptance remains pending.

## Acceptance coverage

`demo.test.ts` exercises actual HTTP requests against disposable stores, rather than mocking the gateway's authorization or repositories. It covers:

- Two tester sessions processing the same canonical case ID, with independent approval, handoff download, receipt, and reset state.
- Server-enforced BILLER restrictions, rejection of ADMIN, role-switch revocation, and logout revocation.
- Denial of raw login, arbitrary PDF intake, admin/unknown APIs, encoded route variants, caller-selected record IDs, and extra fixture text.
- The unknown-date evidence gate, positive-version contract, stale-version conflict, concurrent approval, handoff before submission, generated synthetic receipt, and repeated submission conflict.
- Sandbox capacity, bootstrap rate, storage allocation, mutation/poll/retry budgets, absolute and idle expiry using an injected clock, reset quotas, and persistent registry reopen behavior.
- Malformed/oversized bodies and sanitized errors without internal paths, secrets, or stack traces.

There are 21 HTTP acceptance tests. For the historical `b68258a` baseline, the parent task executed the suite with Node 24 and the permitted loopback preload: **23 test files, 228 tests passed, one live-Athena test skipped**, in 3.17 seconds. All 21 demo HTTP acceptance tests passed at that baseline; repeated expiry/cleanup cycles completed in 870 ms. The baseline demo build and diff check also passed. No live Athena connection was exercised. A subsequent authorized final run passed **25 files, 246 tests, one live-Athena test skipped**, including all 15 key/readiness and three entry tests, plus typecheck and demo build.

This review agent authored the HTTP tests and reviewed the source; historical runtime execution was performed by the parent task. An earlier key/readiness test attempt was rejected and did not execute. After the owner explicitly approved loopback-only testing with disposable synthetic data, the exact target was retried once and passed, followed by the full final suite. Hosted deployment verification remains pending.

## Source review conclusions

The inspected implementation derives the sandbox context from a hash of the bearer token, then retains the core session and role checks. Separate fresh database handles, generation checks, strict route/body allowlists, fixed server-owned fixtures, and revocation on reset/role change are present. The gateway creates only synthetic PROVIDER/BILLER identities before constructing the core app; raw login and ADMIN selection are unavailable.

The service configuration pins synthetic EHR/policy adapters, local stub AI, cloud disabled, and no background scheduler. Handoff generation and recording a synthetic receipt remain separate actions. API responses prohibit caching. No concrete cross-sandbox, ADMIN/default-login, arbitrary-intake, or route-canonicalization bypass was identified in this source review.

## Operational controls checked in the final source

- Read/session requests have a separate budget; API peer/global budgets apply before JSON parsing and registry activity updates.
- Expiry invalidates tokens before deleting only the owned generation. Registry/retry records are pruned after its handles close, followed by a WAL checkpoint. Reset preserves the active sandbox record while replacing its generation.
- Successful logout invalidates only that tester's sandbox and releases its capacity. A second tester's database remains separate.
- Nonempty unsupported content types are rejected before fixture execution. Content length and JSON parsing enforce the body limit. Empty-body documented actions remain supported.
- Forwarded core 5xx responses are sanitized without converting failure into success.

The passing acceptance suite includes regressions for these boundaries: read-rate recovery, independent traffic caps, logout/capacity reuse, repeated expiry/cleanup across registry reopen, and non-JSON intake rejection with no case/job side effects.

## Verification limits

These tests do not establish a production medical, identity, encryption, de-identification, or delivery system. They establish a bounded synthetic demonstration boundary. Hosting-layer egress restrictions, reverse-proxy rate limits, HTTPS behavior, external accessibility, and operational resource limits require verification in the deployment environment. No independent payer acknowledgment is produced.
