# Container and Render configuration gate

> Later platform evidence (2026-10-28): Render built and ran the image, accepted the 1 GB mounted disk, and passed readiness plus durable case/receipt readback across rollout and explicit restart. See `HOSTED_ACCEPTANCE.md`. Local Docker tests remain unavailable; the original checklist below records the pre-deployment gate.

Review began at `b68258a` and includes subsequent local packaging/readiness guards. The owner explicitly authorized local project tests, loopback-only listeners, disposable synthetic data, passing demo-branch pushes, and the specified Render service/disk/key setup. The subsequent guard patch passes local tests, type checking, and the demo build. Render image/platform acceptance remains unrun; this report does not certify a live deployment.

## Configuration checks

| Area | Evidence and result |
| --- | --- |
| Runtime | `Dockerfile.demo` selects `node:24-bookworm-slim`, satisfying the declared Node 24 minimum and providing the intended built-in SQLite runtime family. The actual image has not been pulled or inspected. |
| Start dependencies | `npm ci --include=dev` retains `tsx`, currently a dev dependency. `CMD ["node", "--import", "tsx", "server/demoIndex.ts"]` uses that retained runtime. The Docker command enters only the hosted synthetic gateway. |
| Build isolation | The Dockerfile defines a fresh dedicated UI build with `npm run build:demo`. `.dockerignore` excludes existing `node_modules`, `dist`, Git metadata, environment files, local data, and database/WAL files. No current source-tree symlinks or database/credential-file candidates were found by bounded metadata inspection. |
| Port and interface | Docker defaults set `PORT=10000` and `MEDAUTH_HOST=0.0.0.0`. The entry reads host-supplied `PORT` before `MEDAUTH_PORT`; Render can override the default. `EXPOSE` alone would not set the bind port, so the explicit environment default matters. |
| Persistent path | `/var/data/medpa-demo` is below the Blueprint's `/var/data` disk mount. Registry, generation databases, and SQLite sidecar files therefore use the mounted tree rather than the image's writable layer. Actual mount ownership and write behavior remain unverified. |
| Process identity | No Docker `USER` is set, so the image runs as root by default. The application creates owned demo directories with mode `0700`, but that is not a verified non-root deployment or a mounted-volume permission test. |
| Static files | Docker fixes the public root at `/app/dist`, separate from `/var/data/medpa-demo`; the core app does not own public asset serving. Current local source rejects missing/unreadable roots or indexes, source-root exposure, resolved static/data overlap, descendant symlinks, and special files. Asset-tree metadata traversal has depth/entry limits. The new guard tests pass against disposable local stores. |
| Synthetic services | The gateway constructs synthetic EHR/policy adapters, local-stub AI, cloud disabled, and no periodic scheduler. Its hardcoded service graph is the authoritative boundary; Docker environment labels alone are not relied upon. |
| Secret handling | The image requires a stable operator-supplied demo encryption key. The Blueprint uses `generateValue: true`, not a literal key. No host secret value was read or included in this review. Current local source adds an authenticated encrypted registry verifier, read-only preflight for existing stores, refusal to rebind nonempty legacy stores, startup write/fsync probes, and read-only registry/asset readiness. All 15 new key/readiness tests pass; wrong-key refusal leaves the existing registry unchanged. |
| Release control | One instance, preview generation off, and automatic deploy off match a single-host SQLite demo. No Blueprint sync, remote build, resource creation, image push, or deployment was performed by this reviewer. |

## Offline Blueprint check

The current YAML parses with already-installed PyYAML. A focused check against the owner's previously fetched official schema passed for:

- Declared top-level fields and root preview generation.
- Service required keys, declared fields, direct types/enums/minima, and the selected Docker-runtime branch.
- Disk required/declared fields and the minimum disk size.
- Generated-value environment-variable shape with no literal secret value.

Schema: Render's Draft 2020-12 `render.yaml JSON Schema`, `$id` `https://render.com/schema/render.yaml.json`.

Schema SHA-256: `8a3fb8da6b4f55fe686fbefa790e011d3dd7895f013f355953c572a21ab6494a`.

Checked `render.demo.yaml` SHA-256: `0a0718f6a6667b534c70c6c3473b91fce13c5ac45c0189255491d6cc44e00ea0`.

**This was not full JSON Schema validation.** `jsonschema`, `fastjsonschema`, AJV, and the Render CLI were unavailable in the bounded existing runtime locations checked. No package was installed or downloaded. A complete schema/platform validation remains a separate gate; field checks do not establish account access, repository/branch availability, compute availability, billing approval, or platform acceptance.

## Local validation after explicit approval

An earlier targeted test attempt was rejected by automatic approval review and did not execute. The owner then explicitly approved tests with loopback-only listeners and disposable synthetic data. The exact denied command was retried once and passed all 15 tests.

- Node 24.21.0 full suite: **25 files passed, 246 tests passed, one live-Athena test skipped**, duration 3.45 seconds. Loopback-only QA preload retained.
- All 15 key/readiness tests and all three real-entry child-process tests passed in this final run.
- TypeScript `tsc --noEmit`, the demo Vite build, and `git diff --check` passed. Vite reports its existing large-chunk advisory.
- No package installation, daemon startup, key retrieval, live EHR/cloud AI call, or external provisioning occurred during local validation.

## Historical evidence and remaining gates

- The `b68258a` baseline had 228 passing tests with one live-Athena test skipped. The final 246-pass run above validates the subsequent local guards on the Mac host.
- Three Node 24 real-entry tests passed again with the final guards: port precedence/live loopback startup, synthetic fixture operation under hostile service environment settings, missing-key/invalid-port refusal, and graceful SIGTERM. The child process had outbound fetch blocked. These are host-process tests, not Docker-image tests.
- Final source diff checks pass; tests executed only after explicit human approval.
- Docker CLI 29.8 is available, but the `desktop-linux` daemon socket at `~/.docker/run/docker.sock` is missing. No engine-start, install, pull, build, or run action was performed.

Still required before calling the container configuration runtime-verified:

1. Build this exact Dockerfile on an available Docker daemon or equivalent build host. Docker CLI availability without a daemon/socket does not satisfy this gate. No daemon was started, no image pulled, and no Docker build/run attempted here.
2. Run the image with the intended stable key, port, and persistent volume; verify cold boot, a fixed synthetic workflow, health/readiness, graceful shutdown, restart continuity, and volume permissions.
3. Local key/readiness/static-root regression tests pass. Repeat appropriate public-asset and readiness checks against the actual hosted image; local tests do not establish platform routing or disk behavior.
4. Run complete Blueprint/schema/platform validation before any apply, then verify the selected workspace, remote branch/configuration, plan/disk acceptance, and authorized secret setup.
5. Verify the actual HTTPS endpoint, host routing, durable restart, cache/authorization behavior, resource limits, and deployment-layer outbound restrictions. Local source assertions and tests do not establish those live properties.

The predictable development key, default core login credentials, real documents, live EHR credentials, and cloud-model credentials are outside this hosted demo's supported release path.
