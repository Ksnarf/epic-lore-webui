# epic-lore-webui

A web UI for [`EpicGames/lore`](https://github.com/EpicGames/lore) (Epic's
open source version control system), built by WBG.

## What this is

`lore` ships a server (`lore-server`) and a CLI (`lore`), but no browser
client. This project is that browser client: a web application that talks to
`lore-server` over its gRPC API (including the thin-client surface,
`lore.thin_client.v1`, and presigned content HTTP URLs for asset bytes) and
lets a repository's contents, history, branches, locks, and reviews be
browsed and managed from a browser instead of the CLI.

Authentication is fronted by
[`epic-lore-authz`](https://github.com/Ksnarf/epic-lore-authz), WBG's
enterprise SSO / authorization sidecar for `lore-server`: this UI logs users
in against a real enterprise IdP (Okta) via OIDC, through `epic-lore-authz`,
rather than implementing its own auth.

## Why

Epic's own web client is on their public roadmap, but committed for 2027 and
not yet started (see `docs/research/epic-webui-signals.md` for the sourced
findings). Studios adopting `lore` today have no browser surface at all.
This project fills that gap now, and does so on top of server-side
primitives (presigned asset URLs, fragment-level binary diff, advisory
locks, review metadata, notifications) that already exist in `lore-server`
but have no UI exposing them anywhere, including in the CLI.

## Planned stack

- **React + TypeScript.** This follows Epic's own precedent: their internal
  web dashboard for Horde (their build/test orchestration system) is a
  React + TypeScript single-page app. No `lore`-specific web client exists
  yet to follow instead.
- Consumes `lore-server`'s gRPC API, including `lore.thin_client.v1`
  (a browser/thin-client-oriented surface) and presigned content HTTP URLs
  for fetching asset bytes without proxying them through gRPC.
- Auth via `epic-lore-authz`: OIDC login against Okta, session/token
  handling delegated to the sidecar rather than implemented here.
- Exact framework and build tooling (bundler, routing, state management,
  component library, etc.) are an open decision -- see `tasks.md`, marked
  for Kilo's review before any code is written.

## What this is NOT (yet)

- Not started as code. This repository currently holds scaffolding,
  research, and a task list only -- see "No code scaffolding" in
  `tasks.md`. The stack/bootstrap decision is explicitly gated behind
  review before implementation begins.
- Not affiliated with or endorsed by Epic Games, Inc.
- Not a replacement for `epic-lore-authz`. This project is a client of it,
  not a fork or reimplementation.

## v1 scope

See `tasks.md` for the full, ordered task list. In short, v1 targets:

1. Repo browse + file tree
2. Revision history + multi-lane branch graph
3. Side-by-side text diff + binary-aware diff (thumbnail/metadata/chunk-delta)
4. Asset preview via presigned URLs (differentiator vs. GitHub/GitLab)
5. Lock management across all branches (exceeds GitLab's lock support)
6. Change-request review flow with inline comments
7. Branch management + merge/conflict UI
8. Okta auth via `epic-lore-authz`, including IdP-initiated tile entry
9. Permissions view backed by `epic-lore-authz` roles/grants
10. Live notifications via `urc.notification`
11. Dual profile: Developer vs. Artist (simplified) view

## Repository layout

- `docs/research/competitor-analysis.md` -- feature comparison against
  Helix Swarm, GitHub, GitLab, Bitbucket, Azure DevOps, Unity VC, and
  Anchorpoint.
- `docs/research/epic-webui-signals.md` -- sourced findings on Epic's own
  web client roadmap and the server-side primitives this UI can build on.
- `docs/design/api-contract.md` -- feature-by-feature RPC map, transport
  recommendation (thin BFF), web-login gap, permissions-surface gap.
- `docs/design/authz-integration.md` -- pinned-tag references into
  `epic-lore-authz` for the auth integration points this UI needs.
- `docs/design/build-deps.md` -- everything a fresh clone needs to build:
  proto source, authz integration, doc reading order.
- `proto/vendor/lore/` -- the `lore` `.proto` files this UI/BFF generates
  clients from, vendored verbatim under their upstream MIT license; see
  `proto/vendor/lore/PROVENANCE.md` for the pinned commit and file list.
- `tasks.md` -- v1 scope as ordered tasks, plus pre-work (API contract
  study, stack decision).
- `log.log` -- append-only local work log. Not committed (see
  `.gitignore`); mirrors `epic-lore-authz`'s convention of keeping
  operator-identifying, locally-scoped notes out of a public repository.

## Status

Scaffolding + research only. No code yet -- see `tasks.md`.
