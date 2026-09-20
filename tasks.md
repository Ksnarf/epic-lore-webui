# tasks

Checkbox scheme: `[ ]` open, `[x]` done, `[~]` partial, `[?]` blocked.
Provenance tags on `[x]`/`[~]` items: `[verified-e2e]` (real integration run,
evidence logged), `[code-says]` (code exists / builds, not run end-to-end),
`[deployed-not-proven]`, `[not-built]`, `[blocked]`.

## Pre-work (before any code)

- [x] [code-says] API contract study: read `lore-proto` (thin_client,
      thin_client/v1/model, repository, revision, model/v1/model, lock,
      notification, lore_notification, auth_api, rebac_api, admin, storage
      protos), `lore-server`'s presigned-content-URL flow, `lore-revision`'s
      well-known metadata keys, and `epic-lore-authz`'s grpc.rs / http.rs /
      oidc_login.rs / admin/* end to end, all grounded file:line. Produced
      `docs/design/api-contract.md`: feature-by-feature RPC map + gap list,
      a transport recommendation (thin BFF, not grpc-web-via-proxy), the
      web-login gap (browser never receives a token today; IdP-initiated
      tile entry has no acceptance path at all), and the permissions-surface
      gap (no self-service "view another user's grants" API; an admin UI
      must proxy through a BFF holding `ADMIN_API_TOKEN`, never the
      browser). Evidence: doc committed at `docs/design/api-contract.md`;
      `[code-says]` not `[verified-e2e]` because a study document has no
      runtime/build to execute. Downstream task notes below updated to
      reflect what this study changed.
- [ ] Stack / bootstrap decision -- **marked for Kilo review before code
      starts.** React + TypeScript is proposed (see README, "Planned
      stack"), following Epic's own Horde dashboard as precedent. Still
      open: build tooling (e.g. Vite vs. other), routing, state management,
      component library, how auth handoff to `epic-lore-authz` is
      implemented on the frontend, **and now also (per the API contract
      study, `docs/design/api-contract.md` section 2): a thin BFF
      (Node/TS recommended) as a new, separate component the browser talks
      to instead of speaking grpc-web directly to `lore-server`/
      `epic-lore-authz`** -- its own repo-or-package decision and how it
      deploys alongside the frontend. "gRPC-web client generation" from the
      original framing is superseded by "BFF client generation" under this
      recommendation. Do not scaffold code against any of this until Kilo
      has signed off on it.

## v1 scope

- [ ] 1. Repo browse + file tree
- [ ] 2. Revision history + multi-lane branch graph
- [ ] 3. Side-by-side text diff + binary-aware diff (thumbnail/metadata/
      chunk-delta), via `ThinClientService.RevisionDiff` / `ContentDiff`
      (`lore.thin_client.v1`). API contract study
      (`docs/design/api-contract.md` section 1, feature 3): `ContentDiff`
      only flags `binary = true` -- there is no chunk-level binary diff RPC.
      The thumbnail/metadata/chunk-delta framing needs descoping or new
      server-side work; not a client-only feature as originally scoped.
- [ ] 4. Asset preview via presigned URLs -- differentiator vs. GitHub/
      GitLab, neither of which does browser asset preview natively (see
      `docs/research/competitor-analysis.md`). API contract study
      (`docs/design/api-contract.md` section 1, feature 4): presign minting
      is service-account-only (a logged-in user cannot mint their own); the
      realistic browser-preview path is a direct
      `GET /v1/repository/{id}/content/{address}` call with the user's own
      bearer token, with the BFF (see pre-work stack decision) minting an
      actual presigned URL only when a shareable, credential-free link is
      needed.
- [ ] 5. Lock management across all branches, via `urc.lock` -- exceeds
      GitLab's lock support (Premium-tier-only per the competitor analysis)
- [ ] 6. Change-request review flow with inline comments, built on
      existing revision metadata fields (`reviewed-by`, `merged-by`,
      `change-request`). API contract study
      (`docs/design/api-contract.md` section 1, feature 6): reading these
      keys needs no new RPC (they ride along on `Revision.metadata`), but
      **inline comments have no server-side data model at all** -- no
      thread, no per-line anchor, anywhere in `lore-proto`. This is new
      server-side surface, not a UI-only feature; needs its own scoping
      decision before it's built.
- [ ] 7. Branch management + merge/conflict UI. API contract study
      (`docs/design/api-contract.md` section 1, feature 7): branch
      lifecycle and conflict *display* (`RevisionDiff`'s 3-way `DiffConflict`
      entries) are fully supported. Conflict *resolution* (committing new,
      user-edited content) is not reachable from a browser -- it needs
      `StorageService.Put`/`PutResolved`, which are bidirectional-streaming
      RPCs no browser transport (grpc-web included) can drive. v1 should
      scope this to read-only conflict display unless new thin-client write
      RPCs are added server-side.
- [ ] 8. Okta auth via `epic-lore-authz`, including IdP-initiated tile
      entry -- a web surface is what makes tile-initiated login possible
      at all; the CLI has no equivalent entry point. API contract study
      (`docs/design/api-contract.md` section 3) confirms both halves of
      this are currently unbuilt: (a) the browser never receives a token in
      the existing CLI-shaped flow (`/login/{login_code}` requires a
      CLI-minted code; the callback only marks a DB session authenticated
      for the CLI to poll) -- a web login needs a new browser-native
      entry+token-handoff path on `epic-lore-authz` (or the BFF); (b)
      IdP-initiated entry needs its own acceptance path distinct from the
      current state-bound SP-initiated flow (which correctly rejects any
      request with no pre-existing session). Both need design + security
      review on `epic-lore-authz` before this task can start; not
      resolved by this study.
- [ ] 9. Permissions view backed by `epic-lore-authz` roles/grants. API
      contract study (`docs/design/api-contract.md` section 4): a "my
      permissions" view is fully supported today via
      `CheckUserPermission`/`LookupUserPermissions` (self-service, no
      `ADMIN_API_TOKEN` needed). An admin-view (viewing/managing *other*
      users' grants) has no self-service API -- only the
      `ADMIN_API_TOKEN`-gated `/admin/v1` surface, which the UI must never
      embed. Recommended path: the BFF holds `ADMIN_API_TOKEN` server-side
      and gates access to its own admin-proxy routes using
      `CheckUserPermission` against a convention this UI defines (e.g.
      `admin` on the `urc-*` wildcard resource).
- [ ] 10. Live notifications via `lore.notification.NotificationService`
      (corrected from `urc.notification`: API contract study,
      `docs/design/api-contract.md` section 1 feature 10, confirms
      `lore-server`'s live gRPC handler implements the `lore.notification`
      package from `lore_notification.proto`, not the legacy
      `urc.notification` package from `notification.proto`). Server-streaming
      only, scoped per-repository -- grpc-web-compatible if that transport
      were chosen, and straightforwardly proxyable by the BFF (recommended
      transport, see pre-work stack decision) via SSE/WebSocket.
- [ ] 11. [ux] Dual profile: Developer view vs. Artist (simplified) view
