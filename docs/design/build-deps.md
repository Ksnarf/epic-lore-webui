# Build dependencies

Everything a fresh clone of this repo needs to go from checkout to a
buildable web UI + BFF. This repo currently holds docs, research, task
tracking, and vendored proto sources -- no application code yet (see
`tasks.md`, "Stack / bootstrap decision", still open pending Kilo's
review). This document exists so the repo is self-explanatory to build from
once that decision lands, and so the proto/authz groundwork doesn't need to
be rediscovered.

## 1. Runtime / toolchain

- **Node.js version:** TBD -- pinned at scaffold time, once the stack
  decision (`tasks.md`, pre-work) is made. Both the frontend (React +
  TypeScript, proposed) and the recommended BFF (Node/TS, per
  `docs/design/api-contract.md` section 2) share one runtime.
- **Proto compiler:** any standard protobuf toolchain that resolves
  `google/protobuf/*` well-known types itself (`protoc`, `@grpc/grpc-js` +
  `grpc-tools`, `protobufjs`/`protobufjs-cli`, `buf`, etc.). Not pinned yet
  -- follows whatever code-generation approach the BFF's client-generation
  tooling ends up using (`tasks.md` pre-work notes this was reframed from
  "gRPC-web client generation" to "BFF client generation" by the API
  contract study).
- Verified buildable during this task with `protobufjs-cli`'s `pbjs`
  (no other toolchain assumed or required):
  ```
  npx -p protobufjs-cli pbjs -t json -p proto/vendor/lore -o /tmp/lore-protos.json \
    proto/vendor/lore/lore/thin_client/v1/thin_client.proto \
    proto/vendor/lore/lore/repository/v1/repository.proto \
    proto/vendor/lore/lore/revision/v1/revision.proto \
    proto/vendor/lore/lock.proto \
    proto/vendor/lore/lore_notification.proto \
    proto/vendor/lore/auth_api.proto \
    proto/vendor/lore/rebac_api.proto
  ```
  Produced a single valid descriptor JSON with no missing-import errors,
  covering packages `lore`, `urc`, `epic_urc`, and the `google` well-known
  types. This proves the vendored set in (2) below is complete and
  self-contained, independent of whichever code-gen tool the BFF ends up
  using.

## 2. Proto sources -- what to generate clients for

Per the task brief and `docs/design/api-contract.md`, the web UI/BFF needs
generated clients for: `thin_client`, `repository.v1`, `revision.v1`,
`model.v1`, `lock`, the live `lore.notification` service (not the legacy
`urc.notification` -- see api-contract.md section 1, feature 10), and
`auth_api`/`rebac_api`.

All of these are **vendored verbatim** under `proto/vendor/lore/` (MIT
license, matching `epic-lore`'s own license -- see
`proto/vendor/lore/LICENSE` and `proto/vendor/lore/PROVENANCE.md` for the
full file list, pinned upstream commit, and import graph). Point whatever
code-generation tool the BFF adopts at `proto/vendor/lore/` as the proto
include root; every file's `import` statements resolve within that
directory (verified above).

`admin.proto` (the `ADMIN_API_TOKEN`-gated surface) is intentionally not
vendored -- see `PROVENANCE.md` and `docs/design/authz-integration.md`,
"What this UI/BFF must never do."

## 3. `epic-lore-authz` integration

Not vendored (separate public repo, same account). See
`docs/design/authz-integration.md` for pinned-tag (`v0.2.0`) links to the
exact files (`grpc.rs`, `http.rs`, `oidc_login.rs`, `admin/auth.rs`) the
contract study is grounded in, plus a summary of the JWKS, token-exchange,
`CheckUserPermission`/`LookupUserPermissions`, and admin-proxy integration
points, and the two named-but-unbuilt gaps (web-login endpoint, IdP-initiated
tile entry).

## 4. Design docs to read before scaffolding

In read order:

1. `docs/research/epic-webui-signals.md` -- why this project exists (Epic's
   own web client is 2027+, not started).
2. `docs/research/competitor-analysis.md` -- feature bar to clear/exceed.
3. `docs/design/api-contract.md` -- the full feature-by-feature RPC map,
   the transport recommendation (thin BFF, not grpc-web-via-proxy), the
   web-auth-flow gap, and the permissions-surface gap. This is the primary
   design input for the stack/bootstrap decision.
4. `docs/design/authz-integration.md` -- pinned links into
   `epic-lore-authz` for the auth integration points above.
5. `proto/vendor/lore/PROVENANCE.md` -- what's vendored and why.
6. `tasks.md` -- current task state; the stack/bootstrap decision is the
   next gating item before any application code is written.

## 5. What is still an open decision (not a build dependency yet)

Per `tasks.md`, pre-work "Stack / bootstrap decision": bundler, routing,
state management, component library, the BFF's own repo-or-package
placement, and how it deploys alongside the frontend. None of this is
resolved here -- this document only covers what's needed once those
decisions land.
