# epic-lore-webui

A web UI for [`EpicGames/lore`](https://github.com/EpicGames/lore) (Epic's
open source version control system), built by WBG.

## What this is

`lore` ships a server (`lore-server`) and a CLI (`lore`), but no browser
client. This project is that browser client: a web application that talks to
`lore-server` over its gRPC API (including the thin-client surface,
`lore.thin_client.v1`) through a server-side BFF, and lets a repository's
contents, history, branches, and locks be browsed and managed from a browser
instead of the CLI.

Authentication is fronted by
[`epic-lore-authz`](https://github.com/Ksnarf/epic-lore-authz), WBG's
enterprise SSO / authorization sidecar for `lore-server`: this UI logs users
in against a real enterprise IdP (Okta, via a Dex-backed demo stack in
development) through `epic-lore-authz`'s existing, unmodified login flow,
rather than implementing its own auth.

## Why

Epic's own web client is on their public roadmap, but committed for 2027 and
not yet started (see `docs/research/epic-webui-signals.md` for the sourced
findings). Studios adopting `lore` today have no browser surface at all.
This project fills that gap now, on top of server-side primitives (presigned
asset URLs, advisory locks, revision/branch metadata) that already exist in
`lore-server` but have no UI exposing them anywhere, including in the CLI.

Some of that gap turned out to be wider than expected once this project
started integrating against a real server: a few of the primitives the
original plan assumed existed (chunk-level binary diff, inline review
comments, a working `ContentDiff` RPC on the tested server build) either
don't exist yet or aren't implemented in the `lore-server` build this project
validates against. Those are called out plainly below, not glossed over.

## What works today

Everything in this section has been run end-to-end against a live
`epic-lore-authz` demo stack (real Okta-style login via its Dex mock
connector, a real `lore-server`) -- not just built and code-read. See
`tasks.md` for full evidence (commands run, responses received).

- **Okta login via `epic-lore-authz`** (its existing, unmodified Phase 1b
  flow -- zero changes made to that project). The BFF plays the role the
  `lore` CLI already plays: it starts an auth session, opens the real login
  flow in a separate browser window/tab, polls for completion, and on
  success mints an encrypted `HttpOnly` session cookie for the browser.
  Every `lore` RPC the BFF makes on the user's behalf carries both a
  per-user token and a per-repository token (exchanged server-side).
  Logout clears the session; unauthenticated or tampered requests get a
  clean `401`, not a crash or a raw proxy error. (tasks.md task 8)
- **Repository browsing**: repository list, branch list, and a lazy file
  tree (only a directory's immediate children load until it's expanded).
  Repository -> branch -> path is fully deep-linkable by URL. (task 1)
- **Lock management across all branches**: list, acquire, and release
  advisory locks, with real per-user attribution (the lock owner recorded is
  the actual logged-in user, confirmed live, not a placeholder). (task 5)
- **Permissions view**: a self-service "my permissions" page shows every
  resource the logged-in user actually holds a grant on and at what level
  (`epic-lore-authz`'s `LookupUserPermissions`) -- proven live returning the
  real logged-in user's real seeded grants, friendly-labeled in the Artist
  profile and raw in Developer. An admin view (viewing other users' grants)
  is also built, behind a BFF-held `ADMIN_API_TOKEN` that is never shipped
  to the browser and an `admin`-on-`urc-*` permission gate re-checked on
  every request; it is absent entirely (`404`) unless that token is
  configured. The gate's deny path and the admin HTTP-proxy's reachability
  are both proven live; its allow path is proven only against fixture data
  and a direct client call (the demo stack has no user holding that
  wildcard grant to prove it denying-then-allowing without writing to that
  stack's database). (task 9)
- **Live notifications**: repository-scoped views subscribe to
  `lore-server`'s live `lore.notification.NotificationService.Subscribe`
  through a BFF-relayed SSE connection, invalidating the locks/branches/
  revisions views automatically when a lock is acquired/released or a
  branch changes, with a subtle connection indicator. Proven live, the full
  chain: a real lock acquired and released through this project's own BFF
  routes produced real notification events, observed arriving through the
  actual SSE route with a real logged-in session -- `lore-server` ->
  gRPC -> SSE -> browser, not just at the gRPC layer. (task 10)

### Built, but only fixture-verified so far (pending real server content)

These features are fully implemented client-side and BFF-side, pass their
own tests, and work correctly against this repo's in-memory fixture data.
Validating them against the *real* `lore-server` needs real multi-revision
history or a newer server build than this project currently has access to
-- see "Limitations" below for exactly what's blocking each one.

- **Revision history + multi-lane branch graph**: cursor-paginated revision
  list and a custom SVG graph showing forks and merges across branches.
  Proven live against an empty branch (correct shape, no crash); pagination
  across multiple pages and merge rendering are unverified against real
  content. (task 2)
- **Side-by-side text diff**: per-revision changed-file lists
  (`RevisionDiff`) are proven live against the real server, including its
  edge cases. The line-level diff text itself depends on `ContentDiff`,
  which the tested `lore-server` build does not implement (see below), so
  the diff *view* is currently verified only against fixture data. (task 3)

## Limitations pending Epic lore-server updates

These are not bugs in this project -- they are gaps in the server surface
this project builds against, found and documented while integrating
against a real stack:

- **No line-level diff text against the real server.** `ContentDiff`
  (`lore.thin_client.v1.ThinClientService`), the RPC that actually produces
  diff text, returns gRPC `Unimplemented` on the tested `lore-server` build.
  The UI and BFF for side-by-side text diff are complete and correct against
  fixture data; they cannot be proven live until a server build implementing
  `ContentDiff` is reachable.
- **No visual diff for binary files.** There is no chunk-level binary diff
  RPC in the current API at all (not just unimplemented) -- binary files can
  only be reported as "changed," with no thumbnail or delta view. This was
  part of the original plan and had to be descoped once confirmed.
- **Asset preview (presigned URLs)** is not built: it depends on a `lore`
  service-account credential being provisioned for this project, which
  hasn't happened yet.
- **Change-request review with inline comments** is not built: `lore`'s
  revision metadata can carry reviewer/change-request fields, but there is
  no server-side data model for inline comment threads at all. This needs
  new server-side surface, not just UI work.
- **Conflict-resolution UI** is not built. Conflict *display* is supported
  by the API today; conflict *resolution* (committing new, user-edited
  content) needs `StorageService` RPCs that are bidirectional-streaming and
  cannot be driven from any browser transport, including grpc-web. This is
  an architectural limitation of the current API, not an unproven detail.
- **Okta-tile (IdP-initiated) login** is not built. Only the sign-in-from-
  this-app flow (SP-initiated) is built. Starting a session from an Okta
  tile needs a new acceptance path on `epic-lore-authz`'s own side, which is
  outside this project.

## Status table

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Repo browse + file tree | Done, verified live | |
| 2 | Revision history + branch graph | Built, fixture-verified | real pagination/merge rendering unproven |
| 3 | Side-by-side text diff | Built, fixture-verified | `ContentDiff` unimplemented on tested server |
| 4 | Asset preview (presigned URLs) | Not started | needs service-account provisioning |
| 5 | Lock management | Done, verified live | |
| 6 | CR review + inline comments | Not started | no server-side data model exists |
| 7 | Branch mgmt + conflict UI | Not started | resolution unreachable from any browser transport |
| 8 | Okta login (SP-initiated) | Done, verified live | IdP-initiated tile entry not built |
| 9 | Permissions view | Done, verified live | self-service proven live; admin view built, deny path + proxy reachability proven live, allow path fixture/direct-client only |
| 10 | Live notifications | Done, verified live | full lore-server -> gRPC -> SSE -> client chain proven with real lock events |
| 11 | Developer/Artist dual profile | Done, verified live | |

Full evidence for every row (commands run, exact responses) lives in
`tasks.md`.

## Stack

- **React + TypeScript** SPA (Vite build, React Router v7 in library mode),
  with TanStack Query for server data and Zustand for cross-cutting UI
  state (file-tree expansion, etc.).
- **Fastify BFF** (`apps/bff`): the only thing that speaks gRPC to
  `lore-server` and `epic-lore-authz`. Generates a typed client from the
  vendored `lore` protos (buf + `protoc-gen-es` v2), hex-encodes binary
  fields at the JSON boundary, and owns the OIDC/session flow.
- **pnpm monorepo**: `apps/web`, `apps/bff`, `packages/lore-client`
  (buf-generated `lore` client), `packages/api-types` (shared DTOs + the
  hex-bytes convention). Node 22 LTS pinned.
- A `fixture` backend (in-memory, built from real generated proto message
  types) lets the full app run with zero external dependencies; a `grpc`
  backend dials a real `lore-server` + `epic-lore-authz`. See "Configuration"
  below.

This follows Epic's own precedent for web tooling: their internal Horde
dashboard is also a React + TypeScript single-page app.

## Configuration

The BFF is configured entirely via environment variables (no config file).
Names only below -- see `apps/bff/src/config.ts` for full documentation and
defaults; never commit real values.

| Env var | Purpose |
|---|---|
| `LORE_BACKEND` | `fixture` (default, no external dependencies) or `grpc` (real `lore-server`) |
| `LORE_SERVER_ADDR` | `host:port` of the real `lore-server`, used when `LORE_BACKEND=grpc` |
| `AUTHZ_SERVER_ADDR` | `host:port` of `epic-lore-authz`'s gRPC listener, for login |
| `SESSION_SECRET` | encryption key for the session cookie; required when `LORE_BACKEND=grpc` |
| `COOKIE_SECURE` | whether auth cookies require HTTPS (default `true`; a local plain-HTTP demo stack must set this `false`) |
| `GROUPS_CLAIM` | JWT claim name read for group membership on login (default `groups`) |
| `PROFILE_GROUPS_ARTIST` | comma-separated group names that default a user to the Artist profile |
| `PROFILE_GROUPS_DEVELOPER` | comma-separated group names that default a user to the Developer profile (wins if a user is in both lists) |
| `FIXTURE_GROUPS` | comma-separated fake group names for the fixture auth path, so group-based default-profile resolution is testable with no real IdP |
| `ADMIN_API_TOKEN` | `epic-lore-authz` admin-surface bearer secret; unset (default) disables `/api/admin/*` entirely |
| `ADMIN_AUTHZ_HTTP_ADDR` | `host:port` of `epic-lore-authz`'s raw HTTP (admin) listener, only read when `ADMIN_API_TOKEN` is set |

## Dev quickstart

```
pnpm install
pnpm run dev       # runs apps/web and apps/bff in parallel, fixture backend by default
pnpm run build     # production build, all workspaces
pnpm run typecheck # pnpm -r run typecheck
pnpm run lint
```

With no environment variables set, the app runs entirely against its
in-memory fixture backend -- no `lore-server` or `epic-lore-authz` needed.
To run against a real stack, set `LORE_BACKEND=grpc` plus the `LORE_SERVER_ADDR`
/ `AUTHZ_SERVER_ADDR` / `SESSION_SECRET` variables above.

## What this is NOT

- Not affiliated with or endorsed by Epic Games, Inc.
- Not a replacement for `epic-lore-authz`. This project is a client of it,
  not a fork or reimplementation -- no source file in that project has been
  modified.
- Not yet usable for change-request review, conflict resolution, asset
  preview, or permissions *administration* (creating/suspending/deleting
  principals, resources, or grants -- the permissions *view* built in task 9
  is read-only by design) -- see "Limitations" above.

## v1 scope

See `tasks.md` for the full, ordered task list with checkbox status and
evidence for every claim above. In short, v1 targets:

1. Repo browse + file tree
2. Revision history + multi-lane branch graph
3. Side-by-side text diff (binary files flagged-only; no chunk-delta RPC exists)
4. Asset preview via presigned URLs (differentiator vs. GitHub/GitLab)
5. Lock management across all branches (exceeds GitLab's lock support)
6. Change-request review flow with inline comments
7. Branch management + merge/conflict display (resolution out of browser reach)
8. Okta auth via `epic-lore-authz` (SP-initiated; IdP-initiated tile entry not built)
9. Permissions view backed by `epic-lore-authz` roles/grants
10. Live notifications via `lore.notification`
11. Dual profile: Developer vs. Artist (simplified) view

## Repository layout

- `apps/web` -- the React + TypeScript SPA.
- `apps/bff` -- the Fastify backend-for-frontend: gRPC clients, auth/session
  handling, hex-bytes JSON boundary, fixture/grpc backend switch.
- `packages/lore-client` -- buf-generated TypeScript client from
  `proto/vendor/lore`.
- `packages/api-types` -- DTOs shared between `apps/web` and `apps/bff`,
  plus the hex-bytes encoding convention.
- `proto/vendor/lore/` -- the `lore` `.proto` files this UI/BFF generates
  clients from, vendored verbatim under their upstream MIT license; see
  `proto/vendor/lore/PROVENANCE.md` for the pinned commit and file list.
- `docs/research/competitor-analysis.md` -- feature comparison against
  Helix Swarm, GitHub, GitLab, Bitbucket, Azure DevOps, Unity VC, and
  Anchorpoint.
- `docs/research/epic-webui-signals.md` -- sourced findings on Epic's own
  web client roadmap and the server-side primitives this UI can build on.
- `docs/design/api-contract.md` -- feature-by-feature RPC map, transport
  recommendation (thin BFF), web-login gap, permissions-surface gap.
- `docs/design/authz-integration.md` -- pinned-tag references into
  `epic-lore-authz` for the auth integration points this UI needs.
- `docs/design/stack-decision.md` -- the approved stack/bootstrap decision.
- `docs/design/build-deps.md` -- everything a fresh clone needs to build:
  proto source, authz integration, doc reading order.
- `tasks.md` -- v1 scope as ordered tasks, checkbox status, and the full
  evidence trail (commands run, real responses) behind every status claim
  in this README.
- `log.log` -- append-only local work log. Not committed (see
  `.gitignore`); mirrors `epic-lore-authz`'s convention of keeping
  operator-identifying, locally-scoped notes out of a public repository.

## Status

Six of eleven v1 features (repo browse, lock management, Okta login,
permissions view, live notifications, Developer/Artist dual profile) are
built and verified end-to-end against a real `epic-lore-authz` + `lore-server`
stack. Two more (revision history, text diff) are fully built client-side and
BFF-side but are currently limited by server-side gaps described above
(unprovable pagination/merge cases, an unimplemented `ContentDiff` RPC). The
remaining three are either blocked on server-side work that belongs to
Epic/upstream projects, or simply not yet started. See `tasks.md` for the
authoritative, evidence-backed status of every item.
