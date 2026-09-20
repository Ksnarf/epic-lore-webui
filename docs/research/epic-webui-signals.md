# Epic web-client signals and server-side primitives

Research session 2026-09-19. Findings below were checked against the cited
files in `github.com/EpicGames/lore` at the time of research; sources are
listed per finding so they can be re-verified against a specific commit if
`lore` has moved on since.

## Epic's own web client

- **Roadmap-committed for 2027, not yet started.** Epic's public roadmap
  lists a web client with scope "code review and repository management".
  It is listed as a future item, not in progress.
  Source: `docs/roadmap.md`, lines 81-85.
- **Planned to be open-source**, consistent with the rest of the `lore`
  project.
  Source: `docs/roadmap.md`; corroborated by `docs/faq.md`.
- No web client code, design doc, or in-progress branch was found in the
  repository at research time -- the roadmap entry is the only trace of it.
  Source: `docs/roadmap.md`, `docs/faq.md`.

This is the gap `epic-lore-webui` fills: a browser client that exists now,
years ahead of Epic's own, built against server capabilities that already
ship in `lore-server` today.

## Server-side primitives already available to build on

These exist in `lore-server` / `lore-proto` today and have no UI anywhere
(including the CLI) exposing them fully:

- **Presigned content URLs.** Asset bytes can be fetched over a presigned
  HTTP URL rather than proxied through gRPC -- the basis for browser asset
  preview (README item 4, the differentiator vs. GitHub/GitLab, neither of
  which does this natively).
  Source: `docs/explanation/system-design.md`.
- **Fragment-level dedup / chunk-aware binary diff.** Binary files are
  content-defined-chunked, so a diff between two binary revisions can be
  computed and shown at the chunk level rather than treated as an opaque
  blob replacement.
  Source: `docs/explanation/system-design.md`.
- **Advisory lock API (`urc.lock`).** Exclusive locks on paths, checkable
  and settable via gRPC -- the basis for README item 5 (lock management
  across all branches, which exceeds GitLab's lock support, itself
  Premium-tier-only per the competitor analysis).
  Source: `lore-proto/src/grpc/` (the `urc.lock` service definitions).
- **Revision metadata fields for review.** Revisions carry `reviewed-by`,
  `merged-by`, and `change-request` fields already -- the data model for a
  review flow (README item 6) exists server-side; only the UI is missing.
  Source: `lore-proto/src/grpc/`.
- **Notification / watch service (`urc.notification`).** A service for
  subscribing to and receiving change notifications -- the basis for
  README item 10 (live notifications).
  Source: `lore-proto/src/grpc/`.
- **`lore.thin_client.v1` gRPC surface.** A gRPC service explicitly shaped
  for thin/browser-style clients, distinct from the full CLI-oriented API
  surface -- the primary API this UI should consume where it fits, per the
  pre-work task in `tasks.md`.
  Source: `lore-proto/src/grpc/lore.thin_client.v1.rs`,
  `lore-proto/proto/lore/thin_client/v1/thin_client.proto` (local clone,
  `~/Documents/epic-lore/lore-proto/`).

## Epic's own web-client pattern

- Epic's precedent for a `lore`-adjacent web dashboard is **Horde**, Epic's
  build/test orchestration system: a React + TypeScript single-page app.
  In the absence of a `lore`-specific web client to follow, this is the
  closest applicable precedent for stack choice, and is why the README
  proposes React + TypeScript as the starting point (subject to the
  stack-decision task in `tasks.md`).
  Source: Horde docs.
- **UEFN** (Unreal Editor for Fortnite, which sits on similar asset-locking
  VCS workflows) uses lock-based binary workflows as its concurrency model
  for binary assets, reinforcing that lock-centric UX (README item 5) is
  the expected pattern for this audience rather than an edge case.
  Source: Horde docs / UEFN documentation, as referenced during this
  research session.

## Sources (consolidated)

- `github.com/EpicGames/lore`, `docs/roadmap.md`, lines 81-85
- `github.com/EpicGames/lore`, `docs/faq.md`
- `github.com/EpicGames/lore`, `docs/explanation/system-design.md`
- `github.com/EpicGames/lore`, `lore-proto/src/grpc/`
- Horde docs (Epic build/test orchestration dashboard, React + TypeScript)
