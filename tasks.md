# tasks

Checkbox scheme: `[ ]` open, `[x]` done, `[~]` partial, `[?]` blocked.
Provenance tags on `[x]`/`[~]` items: `[verified-e2e]` (real integration run,
evidence logged), `[code-says]` (code exists / builds, not run end-to-end),
`[deployed-not-proven]`, `[not-built]`, `[blocked]`.

## Pre-work (before any code)

- [ ] API contract study: read `lore-proto` in the local `~/Documents/epic-lore`
      clone (`lore-proto/proto/`, `lore-proto/src/grpc/`) end to end, focused
      on `lore.thin_client.v1` (`lore-proto/proto/lore/thin_client/v1/
      thin_client.proto`), the presigned-content-URL flow, `urc.lock`,
      `urc.notification`, and revision review metadata
      (`reviewed-by`/`merged-by`/`change-request`). Produce a contract note
      (service, RPCs, and message shapes this UI will actually call) before
      any client code is written.
- [ ] Stack / bootstrap decision -- **marked for Kilo review before code
      starts.** React + TypeScript is proposed (see README, "Planned
      stack"), following Epic's own Horde dashboard as precedent. Still
      open: build tooling (e.g. Vite vs. other), routing, state management,
      component library, gRPC-web client generation, and how auth handoff
      to `epic-lore-authz` is implemented on the frontend. Do not scaffold
      code against this decision until Kilo has signed off on it.

## v1 scope

- [ ] 1. Repo browse + file tree
- [ ] 2. Revision history + multi-lane branch graph
- [ ] 3. Side-by-side text diff + binary-aware diff (thumbnail/metadata/
      chunk-delta), built on `lore-server`'s fragment-level dedup /
      chunk-aware binary diff (see `docs/research/epic-webui-signals.md`)
- [ ] 4. Asset preview via presigned URLs -- differentiator vs. GitHub/
      GitLab, neither of which does browser asset preview natively (see
      `docs/research/competitor-analysis.md`)
- [ ] 5. Lock management across all branches, via `urc.lock` -- exceeds
      GitLab's lock support (Premium-tier-only per the competitor analysis)
- [ ] 6. Change-request review flow with inline comments, built on
      existing revision metadata fields (`reviewed-by`, `merged-by`,
      `change-request`)
- [ ] 7. Branch management + merge/conflict UI
- [ ] 8. Okta auth via `epic-lore-authz`, including IdP-initiated tile
      entry -- a web surface is what makes tile-initiated login possible
      at all; the CLI has no equivalent entry point
- [ ] 9. Permissions view backed by `epic-lore-authz` roles/grants
- [ ] 10. Live notifications via `urc.notification`
- [ ] 11. [ux] Dual profile: Developer view vs. Artist (simplified) view
