# Stack / bootstrap decision

Pre-work item 3 (see `tasks.md`). Decisions below were approved by Kilo on
2026-09-20, closing the "marked for Kilo review" item that
`docs/design/api-contract.md` left open. This is a decision record, not a
new study -- every section either cites `docs/design/api-contract.md` for
the reasoning that produced it, or states a fresh, narrow finding inline
where one was needed to make the call.

## Context: two settled inputs from the API contract study

Two conclusions from `docs/design/api-contract.md` are treated as fixed
inputs here, not re-litigated:

- **Section 2 (the transport decision):** a thin BFF (Node/TS), not
  grpc-web-via-proxy. The browser never speaks gRPC or grpc-web to
  `lore-server`/`epic-lore-authz`; it speaks plain JSON to a same-origin BFF,
  which holds native gRPC clients to both.
- **Section 3 (cookie vs. token storage, CSRF/CORS):** cookie-based session
  storage (`HttpOnly`, `Secure`, `SameSite`), because the BFF -- not the
  browser -- presents the bearer token to `lore-server`/`epic-lore-authz`;
  same-origin serving means no CORS surface is needed; and any
  state-changing BFF route needs its own CSRF defense, because
  `epic-lore-authz`'s `admin/origin.rs` CSRF gate protects only its own
  admin panel and does not extend to this UI's BFF (api-contract.md
  section 3, "Cookie vs. token storage" subsection).

Everything below designs around those two settled points.

## Build tooling: Vite, SPA, static output

**Decision:** Vite, single-page app, static build output served by the BFF.

**Rejected: Next.js as a single combined app.** The transport decision
already put a separate BFF in the architecture (api-contract.md section 2)
-- that BFF is where the service-account credential, the gRPC clients, the
SSE fan-out, and the admin-proxy routes live. A Next.js app's server half
(route handlers, server actions) would either duplicate that BFF or become
a second place some of this logic lives, and either way it is a poor host
for the two things the BFF specifically needs to do well: hold long-lived
gRPC channels to `lore-server`/`epic-lore-authz` across requests, and bridge
server-streaming RPCs into a single multiplexed SSE connection per session
(see "Streaming" below). A plain Vite SPA keeps the frontend a pure static
build with no server runtime of its own, and puts all server-side
responsibility in one place: the BFF.

## Routing: React Router v7, library mode

**Decision:** React Router v7, used as a client-side routing library (not
its framework/SSR mode -- that would reintroduce the same server-half
question Next.js was rejected for above).

URLs are load-bearing for this product, not incidental: repository, branch,
revision, and file path all need to be independently deep-linkable so a
link to a specific diff, a specific tree path, or a specific revision is
shareable and reload-safe. This tracks directly with api-contract.md
section 1 features 1-3 (repo browse + file tree, revision history + branch
graph, diff views), all of which are URL-addressable state in every
comparable tool (GitHub, GitLab, Horde).

## State management: TanStack Query + Zustand

**Decision:** TanStack Query owns all server/RPC data; Zustand owns
cross-cutting UI state that has no server representation.

- **TanStack Query** for everything that comes from the BFF: `RevisionList`
  pagination maps directly onto `useInfiniteQuery` (the RPC is already
  cursor-based -- `signature_forward`/`signature_backward`,
  api-contract.md section 1 feature 2); the multi-lane branch graph is
  assembled client-side from many small, independently-cacheable queries
  (`BranchList` plus a per-branch `RevisionList` walk -- there is no
  single cross-branch DAG RPC, api-contract.md section 1 feature 2's gap
  note), which is exactly the shape TanStack Query's per-key caching and
  request de-duplication is built for. SSE notifications (see "Streaming"
  below) do not carry their own separate state tree -- they write into the
  Query cache as targeted invalidations, so a notification just makes the
  next read of an already-cached query refetch, rather than the UI
  maintaining two parallel sources of truth for the same data.
- **Zustand** for state that has no server counterpart at all: which
  profile is active (Developer vs. Artist, task 11), file-tree expansion
  state, diff view mode (side-by-side vs. unified), toast/notification
  queue. Keeping this out of Query (which is for server data) and out of
  component-local state (which would not survive navigation) avoids a
  common failure mode of routing UI-only state through a data-fetching
  library.

## Components: headless primitives + Tailwind, three purpose-built views

**Decision:** headless component primitives (Radix or shadcn-style, built
on Radix) for shell chrome and standard controls (menus, dialogs, tooltips,
form inputs), styled with Tailwind. Three views are dense enough that they
get purpose-built implementations rather than reaching for a generic
component:

- **Multi-lane branch graph:** custom SVG or canvas rendering. There is no
  off-the-shelf component for this shape of data, and -- as noted above --
  no server-side RPC produces a ready-made graph structure to hand to one;
  the rendering has to be built around whatever lane-assignment algorithm
  the client-side DAG assembly produces.
- **File tree:** lazy, virtualized with TanStack Virtual, driven directly by
  `RevisionTree`'s `path_prefix`/`max_depth` parameters (api-contract.md
  section 1 feature 1) so that expanding a directory triggers a scoped
  server request rather than the client holding (or the server returning)
  a repository's entire tree at once.
- **Diff pane:** CodeMirror 6 or Monaco. Left as an implementation-time
  choice -- both render diffs well; the decision should be made when the
  diff feature (task 3) is actually built, weighing bundle size
  (CodeMirror 6 is materially smaller) against Monaco's more complete
  built-in diff-view chrome, rather than guessed at now.

**Dual profile (task 11) is not two component trees.** Developer vs. Artist
(simplified) view is a capability-flag plus layout layer over the one
component set above -- which panels are shown, what density and defaults
apply -- not a fork of the UI. This keeps the three purpose-built views
(graph, tree, diff) single-maintained regardless of which profile is active.

## Auth (v1 shape)

**Decision:** the BFF performs OIDC/PKCE against Okta directly. On success,
the session is stored as an `AES-GCM`-encrypted, `HttpOnly`, `Secure`,
`SameSite=Lax` cookie holding the user's token. The BFF is stateless (no
server-side session store) for v1, with an explicit escape hatch to add one
later if revocation or multi-replica logout requires it (a stateless
encrypted-cookie session cannot be invalidated server-side before its own
expiry; a session store is the standard fix if that turns out to matter).
Every state-changing BFF route carries a CSRF token, per the cookie/CSRF
conclusion already reached in api-contract.md section 3 -- `epic-lore-authz`'s
`admin/origin.rs` gate protects only its own admin panel and does not cover
BFF routes, so the BFF owns this defense itself.

### Critical verified finding: token exchange into `epic-lore-authz` is not available today

This decision record adds one new, independently verified fact beyond what
`docs/design/api-contract.md` established, because it directly shapes what
"BFF performs OIDC against Okta" can mean in practice:

`epic-lore-authz`'s `ExchangeExternalTokenForUserToken` RPC -- the RPC
api-contract.md section 3 flagged as one of two possible paths to turning an
IdP token into a Lore `UserToken` without the CLI-shaped `login_code`
machinery -- **is an unimplemented stub.** Verified 2026-09-20 against a
local checkout of `epic-lore-authz` at commit `4726ad64c9867624627b9656c858540a87ac9997`
(`git describe --tags` reports `v0.2.0-7-g4726ad6`: 7 documentation-only
commits ahead of the pinned `v0.2.0` tag referenced in
`docs/design/authz-integration.md`):

```
crates/lore-authz-server/src/grpc.rs:235-241

// P1, Phase 1b (deliberately untouched by PHASE 1a -- see tasks.md).
async fn exchange_external_token_for_user_token(
    &self,
    _request: Request<epic_urc::ExchangeExternalTokenForUserTokenRequest>,
) -> Result<Response<epic_urc::ExchangeExternalTokenForUserTokenResponse>, Status> {
    Err(Status::unimplemented(
        "exchange_external_token_for_user_token: Phase 1b (see tasks.md)",
    ))
}
```

Further, `epic-lore-authz`'s own design (`docs/architecture.md:129-137` at
that checkout) only proposes three `token_type` values for this RPC once
implemented: `api-key`, `github-actions` (OIDC workload identity for CI
providers), and `lore` (direct token, admin-minted). **None of these is an
Okta/OIDC ID token type for an interactively-logged-in web user** --
`github-actions` is a CI workload-identity federation path, not a shape that
fits an Okta-authenticated browser session.

**Consequence:** the BFF cannot delegate "turn this Okta login into a Lore
`UserToken`" to `ExchangeExternalTokenForUserToken` today. This was framed
as one of two possible paths in api-contract.md section 3; it is now
confirmed closed. The only path left open there -- a new endpoint on
`epic-lore-authz` (or equivalent trust relationship the BFF establishes)
that performs the `StartAuthSession` -> redirect -> callback sequence for a
browser session and hands back a real `UserToken` -- is upstream work on
`epic-lore-authz`, not something this repo's BFF can substitute for by
itself. This is a **verified blocker on task 8**, not a speculative one; see
"Upstream dependencies" below.

## BFF: Fastify, gRPC codegen via buf, hex-encoded bytes, admin proxy, SSE

**Decision, by sub-area:**

- **HTTP framework:** Fastify, with `@fastify/cookie` (session cookie),
  `@fastify/csrf-protection` (state-changing routes, per "Auth" above),
  `@fastify/static` serving the built SPA same-origin -- which is also what
  keeps CORS out of the picture entirely, matching `epic-lore-authz`'s own
  "no CORS layer" posture rather than fighting it (api-contract.md
  section 2, "Weighed against the stated constraints"). Native SSE for the
  streaming path below.
- **gRPC client generation:** `buf` plus `@bufbuild/protobuf` and
  `@connectrpc/connect-node`'s `createGrpcTransport`, generating
  server-side-only clients against the vendored protos in
  `proto/vendor/lore/` (see `docs/design/build-deps.md`). This is
  explicitly **not** a reopening of api-contract.md section 2's rejected
  connect-web-in-browser option (option (c), "connect-web / gRPC-gateway")
  -- `@connectrpc/connect-node` runs only inside the BFF process; the
  browser still speaks plain JSON to the BFF and never sees a Connect or
  gRPC client. A committed `buf.gen.yaml`, generate-on-build, and a CI
  cleanliness check (generated output matches what's committed, or the
  build fails) together pin the proto toolchain choice that
  `docs/design/build-deps.md` section 1 left open (TBD).
- **Bytes serialization convention:** every `bytes` field crossing the BFF's
  JSON boundary (signatures, addresses, repository ids -- roughly 153 such
  fields across the vendored protos) is rendered as **hex, not base64**.
  This convention is owned by `packages/api-types` (see "Monorepo" below) so
  it is defined once and both `apps/web` and `apps/bff` agree on it by
  construction rather than by convention alone.
- **Admin proxy (task 9):** `/api/admin/*` routes on the BFF, gated per-route
  by a `CheckUserPermission` check (api-contract.md section 4's "option 1"),
  with `ADMIN_API_TOKEN` read from environment only -- never hardcoded, never
  shipped to the browser. Per api-contract.md section 4's fail-closed
  framing, these routes **404 when the env var is unset**, rather than
  falling back to some degraded-but-reachable state; an admin surface that
  silently disables itself is safer than one that silently opens.
- **Streaming (task 10):** Server-Sent Events, not WebSocket. Every RPC this
  UI needs to stream is server-streaming-only (api-contract.md section 2,
  "Streaming needs"), which SSE covers without needing bidirectional
  transport. One multiplexed SSE channel per session, with the BFF
  fanning out per-repository subscriptions server-side onto that single
  channel -- this respects the HTTP/1.1 browser connection cap (~6 per
  origin) that would otherwise be exhausted by one SSE connection per
  subscribed repository. `RevisionTree`, `RevisionDiff`, and `ContentDiff`
  collapse to plain paginated JSON responses by default; NDJSON or SSE
  progressive delivery is used only for large diffs, where sending the
  whole payload as one JSON blob would mean the UI waits for the entire
  response before rendering anything.

## Asset preview (task 4): BFF-minted presign, service-account credential

**Decision (Kilo's ruling, resolving a contradiction api-contract.md left
open between its section 1 feature 4 and section 3):** the BFF holds a
service-account credential, checks the requesting user's permission via
`CheckUserPermission`, and mints a presigned URL on their behalf; the
browser then fetches the asset bytes directly from `lore-server` using that
presigned URL. No bearer token of any kind is ever held or presented by the
browser for this flow.

This was flagged as unresolved in api-contract.md section 1 feature 4
("presign minting is service-account-only... the BFF... minting an actual
presigned URL only when a shareable, credential-free link is needed") --
this ruling settles it as the standard path for every asset preview, not an
edge case. **Consequence:** provisioning a `lore` service account with
appropriate read grants is a v1 dependency for this repo, not optional
polish; see "Upstream dependencies" below.

## Monorepo: pnpm workspaces, one repo, no Turborepo/Nx yet

**Decision:** a single repo, pnpm workspaces, no build-orchestration tool
(Turborepo, Nx) layered on top yet -- add one later if/when build times or
cross-package task graphs actually demand it, rather than pre-adopting the
complexity.

**Layout:**

- `apps/web` -- the Vite SPA.
- `apps/bff` -- the Fastify BFF.
- `packages/lore-client` -- buf-generated gRPC clients from
  `proto/vendor/lore` (see `docs/design/build-deps.md`). **BFF-only**,
  enforced by an ESLint boundary rule so a generated gRPC client can never
  be imported from `apps/web` -- this is the structural guarantee behind
  "the browser never speaks gRPC," not just a convention people are
  expected to remember.
- `packages/api-types` -- the BFF's own route contracts (request/response
  shapes, including the hex-bytes convention above), imported by both
  `apps/web` and `apps/bff`. This package is the browser's *only* contract
  with the backend -- it never imports from `packages/lore-client`.

**Deploy:** one container. The web build's static output is copied into the
BFF's image and served via `@fastify/static`, matching the "boring,
already-familiar deployment shape" reasoning api-contract.md section 2 used
to favor a BFF over an Envoy sidecar in the first place -- one more ordinary
service, not a new infrastructure category. Node version is pinned to
**Node 22 LTS** via a committed `.nvmrc` plus `engines` in each `package.json`,
closing the "node version TBD at scaffold" item `docs/design/build-deps.md`
section 1 left open.

## Upstream dependencies and open items

These are dependencies on work outside this repo that v1 cannot ship
without, carried forward (and in one case, sharpened) from the studies
that fed this decision:

1. **`epic-lore-authz` Phase 1b: web-login / token-exchange support,
   including security review.** Verified blocker (see "Critical verified
   finding" above): `ExchangeExternalTokenForUserToken` is an unimplemented
   stub with no Okta/OIDC token type even designed for it yet. Blocks task 8
   and any real (non-mocked) login. This needs either a new browser-native
   login endpoint on `epic-lore-authz` or an extended/new token type for
   `ExchangeExternalTokenForUserToken`, plus a security review before this
   repo can build against it.
2. **`lore` service-account provisioning.** Blocks task 4's presign path
   (see "Asset preview" above) -- the BFF cannot mint presigned URLs without
   a service-account credential that exists and is scoped correctly.
3. **IdP-initiated Okta tile entry.** Unbuilt upstream, and a distinct
   problem from item 1 above (api-contract.md section 3, "IdP-initiated
   entry is a distinct problem... not the same one" -- it needs its own
   acceptance path on `epic-lore-authz`, since the current SP-initiated flow
   correctly rejects any callback with no pre-existing session). Part of
   task 8; not resolved by this decision record.

None of these block starting v1 scaffolding against mocked/stubbed BFF auth
-- they block *real* login, *real* presign minting, and the Okta tile
specifically. Code should not silently work around them; each should stay a
named, visible gap until the upstream dependency lands.
