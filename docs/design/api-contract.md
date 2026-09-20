# API contract study

Pre-work item 1 (see `tasks.md`). Read end-to-end against the local clones of
`~/Documents/epic-lore` (`lore-proto/`, `lore-server/`, `lore-revision/`) and
`~/Documents/epic-lore-authz` (`crates/lore-authz-server/src/`). Every claim
below is grounded in a specific file and line range so it can be re-verified
against those clones. No local filesystem paths, hostnames, or WBG account
identifiers appear below; `~/Documents/...` stands in for wherever the
reader has cloned the two repos.

This is a **contract study**, not an implementation. It answers: which RPCs
does each v1 feature call, how does a browser reach them at all (there is no
existing answer to this), how does browser login work, and how does the UI
read permissions. It does not scaffold any client code.

## 1. Feature -> RPC map

Each v1 feature (`tasks.md`, "v1 scope") mapped to the concrete RPC(s) or
HTTP endpoint(s) it consumes.

### 1. Repo browse + file tree

- `lore.repository.v1.RepositoryService.RepositoryList` /
  `RepositoryGet` -- list/resolve repositories.
  `lore-proto/proto/lore/repository/v1/repository.proto:23-25`
- `lore.revision.v1.RevisionService.BranchList` / `BranchGet` -- list/resolve
  branches within a repository.
  `lore-proto/proto/lore/revision/v1/revision.proto:18-20`
- `lore.thin_client.v1.ThinClientService.RevisionTree` -- server-streamed
  file/directory listing at a revision, with `path_prefix` / `max_depth` for
  lazy-loading subtrees rather than walking the whole tree up front.
  `lore-proto/proto/lore/thin_client/v1/thin_client.proto:21-23`,
  request shape at
  `lore-proto/proto/lore/thin_client/v1/thin_client.proto:108-127`

### 2. Revision history + multi-lane branch graph

- `lore.revision.v1.RevisionService.RevisionList` -- paginated (cursor-based,
  `signature_forward`/`signature_backward`) per-branch history.
  `lore-proto/proto/lore/revision/v1/revision.proto:30`, response shape
  `revision.proto:204-219`
- `lore.thin_client.v1.ThinClientService.RevisionInfo` -- full record for one
  revision, resolvable by identifier or signature.
  `lore-proto/proto/lore/thin_client/v1/thin_client.proto:17`
- **Gap:** there is no single RPC that returns a cross-branch DAG. A
  "multi-lane branch graph" view has to be assembled client-side from
  `BranchList` (each `Branch` carries its own `stack` -- the ancestry chain
  back to its fork point, `lore-proto/proto/lore/model/v1/model.proto:149-151`)
  plus a `RevisionList` walk per branch of interest. Fine for a handful of
  branches; a repo with hundreds of live branches would need the UI to
  paginate/lazy-load lanes rather than requesting the whole graph in one call
  server-side, because no such call exists.

### 3. Side-by-side text diff + binary-aware diff

- `lore.thin_client.v1.ThinClientService.RevisionDiff` -- server-streamed
  2-way/3-way diff between two revisions (`DiffChange` per path, `DiffConflict`
  in 3-way mode, `DiffPartition` for linked-repository content).
  `lore-proto/proto/lore/thin_client/v1/thin_client.proto:18-20`, message
  shapes `thin_client.proto:89-106`
- `lore.thin_client.v1.ThinClientService.ContentDiff` -- server-streamed
  unified/3-way diff of two CAS blobs directly (no revision context needed);
  reports `binary = true` and stops emitting chunks when the input is binary,
  and reports `truncated = true` past `max_diff_size` without emitting a huge
  diff body.
  `lore-proto/proto/lore/thin_client/v1/thin_client.proto:15`, request/response
  at `lore-proto/proto/lore/thin_client/v1/model.proto:186-254`
- The chunk-aware binary diff research finding (`docs/research/
  epic-webui-signals.md`) is about `lore-server`'s internal content-defined
  chunking for storage dedup, not a dedicated "binary diff" RPC -- `ContentDiff`
  itself just reports `binary = true` and stops. A chunk-level binary diff
  view (thumbnail/metadata/chunk-delta, per the task wording) is **not** a
  server capability today; it would have to be built client-side on top of
  `ContentDiff`'s binary flag plus whatever per-chunk metadata the UI fetches
  separately, or deferred.

### 4. Asset preview via presigned URLs

- Presigned URL mint: `POST /v1/repository/{repository_id}/content/{address}/presign`.
  `lore-server/src/http/repositories/repository/contents/content/
  presign_repository_content.rs:115-230`
- Presigned URL redeem (plain HTTPS GET, no bearer token, browser-direct):
  `GET /v1/presigned/{repository_id}/{address}?token=...`.
  `lore-server/src/http/presigned/repository/redeem.rs:97-198`
- **Gap (load-bearing for the transport decision, see section 2):** minting a
  presigned URL is gated to **service accounts only**.
  `call_is_service_account` returns `false` (and the handler returns `403
  NotServiceAccount`) for any JWT whose `is_service_account` claim is not
  `true` -- which is every ordinary user token this UI's login flow would
  issue.
  `lore-server/src/http/repositories/repository/contents/content/
  presign_repository_content.rs:103-130`
  A logged-in human user's browser session **cannot** mint its own presigned
  URLs.
- There is a second path that does not need a presign at all: plain
  `GET /v1/repository/{repository_id}/content/{address}` accepts an ordinary
  user bearer token (`Extension<Option<AuthorizationToken>>`, auth optional
  only when no JWT verifier is configured server-wide) and streams the
  content directly.
  `lore-server/src/http/repositories/repository/contents/content/
  get_repository_content.rs:114-167`, JWT-authenticated test at
  `get_repository_content.rs:377-452`
  This is the realistic path for browser asset preview: fetch content
  directly with the user's own bearer token, rather than presigning. The
  README's "differentiator" framing (asset bytes via presigned URL) still
  holds for any flow that needs a **shareable, credential-free** link (e.g.
  pasting an image URL into chat) -- but that flow needs a service-account
  credential somewhere in the request path, which the browser must not hold
  directly (see section 2's BFF recommendation).

### 5. Lock management across all branches

- `urc.lock.LockService`: `Lock`, `Query`, `Status`, `Unlock`, `AdminLock`.
  All five are plain unary RPCs -- no streaming.
  `lore-proto/proto/lock.proto:37-52`
- "Across all branches": `QueryRequest.branch` is `optional`
  (`lore-proto/proto/lock.proto:62`) -- omitting it returns locks across the
  whole repository rather than scoping to one branch, which is exactly what
  a cross-branch lock view needs. No gap here.
- `AdminLock` (lock on another user's behalf,
  `lore-proto/proto/lock.proto:85-93`) is presumably authorization-gated
  server-side by role, not by anything visible in `lock.proto` itself; not
  confirmed against `lore-server`'s handler for this study (out of scope --
  `lore-server/src/http` was the specified read target, not every gRPC
  handler). Flagged as an open question for whoever builds the lock UI: does
  `AdminLock` need a distinct "admin" affordance in the UI, gated on the
  permissions surface (section 4)?

### 6. Change-request review flow with inline comments

- Review state is **not** a set of dedicated proto fields. The legacy
  `urc.model.Revision` message explicitly reserves what used to be
  `reviewed_by` (field 6) and `change_request` (field 9) as deprecated:
  `lore-proto/proto/model.proto:70-80`. The live `lore.model.v1`-era model
  carries review state as conventional string keys inside the generic
  `repeated Metadata metadata` field on a Revision
  (`lore-proto/proto/lore/thin_client/v1/model.proto:156-157`, `Metadata`
  message at `model.proto:177-184`). The well-known keys are real, named
  constants server-side, not just documentation convention:
  `REVIEWED_BY = "reviewed-by"`, `MERGED_BY = "merged-by"`,
  `CHANGE_REQUEST = "change-request"`, plus `CREATED_BY`, `COMMITTED_BY`,
  `RESTORED_FROM`, `CHERRY_PICKED_FROM`, `REVERTED_FROM`,
  `FAST_FORWARD_MERGE`.
  `lore-revision/src/metadata.rs:108-129`
  `lore-server` itself writes `MERGED_BY` on a server-computed
  fast-forward merge (`lore-server/src/grpc/handlers/branch_push.rs:582-610`),
  confirming these keys are live, not vestigial.
- Reading this metadata: `RevisionInfo` /`RevisionDiffResponse.header`
  already returns the full `Revision` including its `metadata` list, so the
  read side of "change-request / reviewed-by / merged-by" needs no new RPC.
- **Gap:** there is no RPC to *write* one of these keys from a client (no
  "set revision metadata" call analogous to `BranchMetadataSet` /
  `RepositoryMetadataSet`, which CAS-swap a *pointer* hash, not structured
  key/value content). Setting `reviewed-by` server-side today happens by
  constructing a full metadata blob and threading it through a revision
  write, which is the CLI/native-client write path (see the `StorageService`
  gap below), not something the thin-client surface exposes.
- **Gap, larger:** "inline comments" (per-line, threaded) has **no server
  data model at all**. A metadata key is a single string value per key per
  revision -- there is no comment-thread, no per-line anchor, no reply
  structure anywhere in `lore-proto`. This is not a small gap: it is new
  server-side surface (a comments service/table), not a UI-only feature.
  Flagged for `tasks.md`.

### 7. Branch management + merge/conflict UI

- Branch lifecycle: `BranchCreate`, `BranchDelete`, `BranchGet`, `BranchList`,
  `BranchPush` (with `force` / `fast_forward_merge` flags).
  `lore-proto/proto/lore/revision/v1/revision.proto:13-23`
- Conflict *detection/display*: `RevisionDiff` in 3-way mode streams
  `DiffConflict` pairs (`change_from`/`change_to`, both rooted at the common
  ancestor) alongside an `autoresolve` flag that, when set, has the server
  flag auto-resolved changes via `automerged = true`.
  `lore-proto/proto/lore/thin_client/v1/thin_client.proto:45-66`,
  `DiffConflict` at `lore-proto/proto/lore/thin_client/v1/model.proto:93-102`
- **Gap:** conflict *resolution* -- committing a new revision whose content
  the user actually edited to resolve a conflict -- is not reachable through
  `RevisionService`, `RepositoryService`, or `ThinClientService`. `BranchPush`
  only re-points a branch tip at a revision signature that **must already
  exist in CAS** ("Caller must ensure the revision and all data it references
  are present in CAS before calling",
  `lore-proto/proto/lore/revision/v1/revision.proto:117-124`). Writing new
  content and constructing the revision/tree structures that make a
  signature valid is the job of `lore.storage.v1.StorageService`
  (`Put`/`PutResolved`, both **bidirectional streaming**,
  `lore-proto/proto/lore/storage/v1/storage.proto:22-44`) plus
  `lore-revision`'s in-process tree/metadata assembly logic, which today only
  the CLI (a native process with a local CAS cache) exercises. A browser
  cannot open a bidi gRPC stream over grpc-web at all (see section 2), so
  a v1 "resolve conflicts in the browser and commit" flow is **not buildable
  against the current API surface** without new thin-client-shaped write
  RPCs server-side. Read-only conflict *display* is fully supported;
  resolution is not. This should be scoped down for v1 (e.g. "show
  conflicts, direct the user to resolve via CLI") or explicitly flagged as
  needing new server work, not silently assumed.

### 8. Okta auth via `epic-lore-authz`, including IdP-initiated tile entry

See section 3 (dedicated section -- this is the auth-flow deliverable).

### 9. Permissions view backed by `epic-lore-authz` roles/grants

See section 4 (dedicated section).

### 10. Live notifications

- Tasks.md and the README name this `urc.notification`. That is the
  **legacy** proto (`lore-proto/proto/notification.proto`, package
  `urc.notification`, `NotificationService.Subscribe` at
  `notification.proto:88-89`). It is not what `lore-server` actually serves.
- `lore-server`'s live gRPC notification service implements
  `lore.notification.NotificationService` (package `lore.notification`,
  defined in `lore-proto/proto/lore_notification.proto`), confirmed by the
  handler registration:
  `lore-server/src/grpc/notification_service.rs:38-48`
  (`impl lore_notification::NotificationService for NotificationService`,
  `SubscribeRequest.repository` scoping).
- `Subscribe` is **server-streaming**, one call per repository (`bytes
  repository = 1` in `SubscribeRequest`,
  `lore-proto/proto/lore_notification.proto:75-77`), emitting `Event`s
  (`BranchPushed`, `ResourceLocked`/`Unlocked`, `BranchDeleted`,
  `BranchCreated`, `Obliterate`, or an `ExtensionEvent` escape hatch).
  `lore-proto/proto/lore_notification.proto:50-73`
  This confirms the streaming need cited in the task brief is real, and is
  ordinary server-streaming (not bidi) -- grpc-web handles this natively.
- **Action for `tasks.md`:** update task 10's proto reference from
  `urc.notification` to `lore.notification` (specifically
  `lore_notification.proto`'s `NotificationService.Subscribe`); the
  `urc.notification` package appears to be inherited legacy naming, not the
  live wire contract.

### 11. Dual profile: Developer vs. Artist (simplified) view

Not an API concern -- this is UI-side view composition over the same RPCs
already listed above (probably a reduced/relabeled subset of features 1-10
for the Artist profile). No proto gap; flagged as UI/UX scope only, no
change needed here.

### Gap list (summary)

| Feature | Gap | Severity |
|---|---|---|
| 2. Branch graph | No cross-branch DAG RPC; client assembles from `BranchList.stack` + per-branch `RevisionList` | Workable, scales poorly for very branch-heavy repos |
| 3. Binary diff | No chunk-level binary diff RPC; `ContentDiff` only flags `binary = true` | Feature as specced (thumbnail/metadata/chunk-delta) needs new server work or descoping |
| 4. Presigned URLs | Minting is service-account-only; a logged-in user cannot mint their own | Real gap -- shapes the transport decision (needs a trusted intermediary holding a service-account credential) |
| 6. Inline comments | No comment/thread data model anywhere in `lore-proto` | Real gap -- new server-side surface, not UI-only |
| 6. Review metadata writes | No RPC to set a single metadata key/value without a full revision write | Workable only via the CLI/native write path today |
| 7. Merge conflict resolution | Committing resolved content needs `StorageService` (bidi streaming, CLI-shaped), unreachable from a browser | Real gap -- v1 scope should be read-only conflict display, or this needs new thin-client write RPCs |
| 10. Notification proto name | `tasks.md`/README say `urc.notification`; live service is `lore.notification` | Documentation fix only, not a capability gap |

## 2. THE TRANSPORT DECISION

**Constraint:** browsers cannot speak native gRPC (HTTP/2 trailers-based
framing is not exposed to browser JS; `fetch`/`XHR` cannot read trailers or
drive raw h2 streams). Every RPC in section 1 is `lore-server` or
`epic-lore-authz` gRPC (`tonic`); none of it is reachable from a browser as-is.

### Options considered

**(a) grpc-web via a proxy (e.g. Envoy) in front of `lore-server` +
`epic-lore-authz`.** Translates the grpc-web wire format (base64 or binary
framing over plain HTTP/1.1 or HTTP/2, no trailers needed) to native gRPC.
Neither `lore-server` nor `epic-lore-authz` has any grpc-web tooling wired in
today (`grep`-confirmed: no `tonic_web`, `grpc_web`, or `CorsLayer` reference
in either codebase) -- this is a from-scratch addition either way, whether
the translation lives in a proxy or in-process. grpc-web supports
server-streaming natively (this UI's only real streaming need --
`RevisionDiff`, `RevisionTree`, `ContentDiff`, `NotificationService.Subscribe`
are all server-streaming, confirmed per-RPC above); it does **not** support
client-streaming or bidi streaming in any browser today, which rules out
ever reaching `StorageService.Put`/`PutResolved` (bidi) from the browser
regardless of which transport option is chosen -- that gap (section 1,
feature 7) exists no matter what.

**(b) A thin BFF (Node/TS) translating REST/JSON <-> gRPC.** A small service
that speaks native gRPC to `lore-server` and `epic-lore-authz` on one side,
and plain JSON/REST (or a typed RPC layer like tRPC) to the browser on the
other. This is also the natural place to hold a **service-account
credential** and mint presigned URLs on the user's behalf after checking
their permission -- directly closing the section 1 feature-4 gap (a browser
cannot hold that credential itself; a same-network backend component can).
It is also the natural place to implement the "web login" gap this study
found in section 3, since that gap requires server-side session/cookie
handling that a pure grpc-web browser client has no way to do on its own.

**(c) connect-web / gRPC-gateway.** `connect-web` (Buf's Connect protocol)
is a grpc-web-compatible browser client with better ergonomics than raw
grpc-web codegen, but still needs the same kind of proxy-or-in-process
translation as (a) -- it does not remove the need for a server-side
component, it only changes what generates the client code and what protocol
runs over the wire. gRPC-gateway (grpc-gateway/protoc-gen-grpc-gateway)
generates a REST/JSON reverse proxy from proto service definitions with
`google.api.http` annotations; none of the studied protos carry those
annotations today, so this option requires either annotating every RPC this
UI needs or hand-writing the mapping -- functionally converging on option
(b) but as generated code fronting the existing services rather than a
hand-written BFF.

### Weighed against the stated constraints

- **ALB gRPC listeners already planned for tt.lore:** an ALB gRPC listener
  targets native HTTP/2 gRPC backends; it does not itself speak grpc-web, so
  it does not remove the need for a translation layer -- it is orthogonal to
  this decision, not a reason to pick (a) over (b).
- **`epic-lore-authz`'s browser-facing HTTP endpoints:** `epic-lore-authz`
  already has a plain-HTTP axum surface (`/login/*`, `/oidc/callback`,
  `/.well-known/jwks.json`, `/admin/**`) that the browser talks to directly
  today, with **no CORS layer configured anywhere** in that crate (confirmed
  by grep) and a same-origin CSRF gate purpose-built for its admin panel
  (`crates/lore-authz-server/src/admin/origin.rs:1-96`). Fronting
  `epic-lore-authz`'s gRPC surface with a permissive-CORS grpc-web proxy (a)
  sits awkwardly next to that: the admin CSRF design explicitly reasons
  about "no CORS layer anywhere on this service" as a security property
  (`admin/origin.rs:34-45`), and introducing one for a different route
  prefix is the kind of change that module's own module doc warns would
  "re-open exactly this hole" if done carelessly. A same-origin BFF (b)
  avoids the question by never exposing cross-origin gRPC to the browser at
  all -- the browser only ever talks same-origin JSON to the BFF, and the
  BFF-to-authz hop is a trusted server-to-server gRPC call the existing CSRF
  design never has to reason about.
- **Presigned URL flow (plain HTTPS, browser-direct):** unaffected by this
  choice either way -- the browser already fetches presigned/redeemed
  content directly from `lore-server`'s HTTP surface
  (`GET /v1/presigned/{repo}/{address}`), bypassing gRPC and any proxy
  entirely. This flow stays exactly as-is under any of (a)/(b)/(c). What
  changes is *who mints* the presign token (see feature-4 gap above) -- a
  BFF is the natural holder of the service-account credential that requires;
  a browser-facing grpc-web proxy (a) does not solve that problem at all,
  since the proxy still just forwards the user's own (non-service-account)
  credential.
- **Streaming needs:** confirmed server-streaming-only across every RPC this
  UI needs except the out-of-scope `StorageService` write path (section 1).
  grpc-web handles server-streaming; a REST/JSON BFF needs its own streaming
  transport to the browser for these (SSE or a WebSocket, translating from
  the gRPC server-stream it receives) -- an extra design decision (b) carries
  that (a) does not, since grpc-web's server-streaming passes through more
  directly.
- **WBG's boring-deployable preference (one more container in the same ECS
  task vs. a separate service):** a Node/TS BFF (b) is one more container,
  same shape as every other WBG service stood up so far -- ordinary
  build/push/deploy, no new infrastructure category. An Envoy-based grpc-web
  proxy (a) is also "one more container," but it is a piece of
  infrastructure this fleet does not otherwise run (no existing Envoy
  footprint noted in this study), where a Node/TS service is a pattern
  already in active use elsewhere in this engagement.

### Recommendation

**Option (b): a thin BFF.** It is the only option that closes the
presigned-URL-minting gap and the web-login gap (section 3) with existing,
already-planned infrastructure patterns rather than introducing a new proxy
technology; it avoids layering cross-origin gRPC traffic next to
`epic-lore-authz`'s CSRF model, which was deliberately designed around
having no CORS surface; and it fits WBG's stated preference for boring,
already-familiar deployment shapes over a new infrastructure category like
an Envoy sidecar. This is a firm recommendation, not a placeholder -- do not
revisit grpc-web-via-proxy unless the BFF's translation work turns out to be
substantially larger than expected (e.g. if most v1 RPCs need bespoke
streaming bridges rather than simple REST wrapping).

**Consequence for `tasks.md`:** the stack-decision task (currently framed as
just "React + TypeScript, build tooling, routing, state management,
component library, gRPC-web client generation") needs a new line item for
the BFF component -- its own repo-or-package decision, its runtime (Node/TS
is the natural choice given the React/TS frontend, for one shared language
and one shared team), and how it is deployed alongside the frontend and
`lore-server`/`epic-lore-authz`. This was not visible before this study; the
"gRPC-web client generation" line in the existing stack-decision task
description should be corrected to "BFF client generation" or similar, since
the browser will not speak grpc-web to `lore-server` directly under this
recommendation.

## 3. Web auth flow

### What exists today: a CLI-shaped, SP-initiated flow

`epic-lore-authz`'s `http.rs` module doc is explicit and load-bearing here:

> "Nothing here mints a token. The browser's only power is to move a session
> from `pending` to `authenticated`; the token is issued to the CLI, over
> gRPC, against a secret the browser never sees."

`lore-authz-server/src/http.rs:18-20`

The full flow, as implemented:

1. The **CLI** calls `StartAuthSession` (gRPC) and receives a `session_code`
   (which the CLI polls with, over gRPC) and a `login_url` containing a
   *different* secret, `login_code`.
   `lore-proto/proto/auth_api.proto:48-53`,
   `lore-authz-server/src/oidc_login.rs:197-204` explains why the two codes
   are deliberately distinct secrets.
2. The **browser** is pointed at `GET /login/{login_code}`
   (`lore-authz-server/src/http.rs:91`), which redirects it to the IdP's
   OIDC authorization endpoint with PKCE + `state` + `nonce` bound to that
   session (`lore-authz-server/src/oidc_login.rs:118-153`).
3. The IdP redirects back to `GET /oidc/callback`
   (`lore-authz-server/src/http.rs:94`), which validates everything (state,
   PKCE, ID token signature/`iss`/`aud`/`exp`/`nonce`), resolves or
   JIT-provisions a principal, and marks the **database session**
   `authenticated` (`lore-authz-server/src/oidc_login.rs:162-255`). The
   browser gets a static "you may close this tab" page
   (`lore-authz-server/src/http.rs:223-232`).
4. The **CLI**, still polling `GetAuthSession` over gRPC, receives the
   minted `UserToken` once the session flips to `authenticated`.

The browser **never receives a token** in this flow. There is no code path
where step 3's browser response carries anything but a static HTML page.

### The gap: this has no IdP-initiated (Okta tile) entry point, and no
pure-browser entry point either

Two related problems, both real:

1. **No CLI, no `login_code`.** A web app has nothing to play the CLI's role
   in step 1 -- there is no pre-existing `StartAuthSession` caller to mint a
   `login_code` before the browser shows up. A web login needs *something*
   to call `StartAuthSession` on the browser's behalf before redirecting to
   the IdP, and needs a way to hand the resulting token to the browser at
   the end (step 3 currently hands back nothing but a static page). Both of
   these are new server-side surface, not client-side wiring the frontend
   team can work around. Concretely, this needs either:
   - a new endpoint on `epic-lore-authz` (or the BFF from section 2) that
     performs the `StartAuthSession` -> redirect -> callback sequence for a
     browser session directly, and on success sets the resulting `UserToken`
     as an HttpOnly, Secure, `SameSite` cookie (or hands it to the BFF to
     hold server-side) instead of rendering the "close this tab" page; or
   - the BFF holding a service-account-flavored trust relationship and doing
     the OIDC exchange itself, then calling
     `ExchangeExternalTokenForUserToken` (`auth_api.proto:16`,
     `ExchangeExternalTokenForUserTokenRequest{external_token, token_type}`
     -> `UserToken`) to turn the IdP's token into a Lore `UserToken` without
     going through the session/`login_code` machinery at all.
   Neither of these is implemented anywhere in the studied code today. This
   is the honest gap: **`tasks.md` names this as needed work
   (`epic-lore-authz`, including IdP-initiated tile entry -- a web surface
   is what makes tile-initiated login possible at all"), and this study
   confirms there is currently zero server-side support for it.** It is not
   a frontend-only task.
2. **IdP-initiated (Okta tile) entry is a distinct problem from (1), not the
   same one.** Okta-tile-initiated SSO starts at the IdP, not at the
   relying party -- there is no pre-existing `state`/`nonce`/PKCE verifier
   for the callback to check against, because nothing on the authz side
   asked for a login yet. `complete_callback`'s whole design is built around
   resolving `state` to a **pre-existing, pending session**
   (`lore-authz-server/src/oidc_login.rs:173-183`) and explicitly treats an
   unrecognized `state` as `Invalid` -- by design, an IdP-initiated request
   would be indistinguishable from an attack under the current logic, and
   correctly gets rejected. Supporting a real Okta tile therefore needs a
   **second, separate acceptance path** (commonly, Okta's OIDC
   "third-party-initiated login" pattern: the tile hits a fixed
   `target_link_uri` carrying an `iss`/`login_hint`, and the relying party
   *itself* starts a fresh, ordinary SP-initiated authorization request from
   there -- rather than trying to accept an inbound assertion with no prior
   state at all). This needs its own design and security review on the
   `epic-lore-authz` side; it is out of scope to design here, and this study
   deliberately does not invent one. Flag it as a named open item, not a
   detail to be filled in silently during frontend implementation.

### Cookie vs. token storage, and CSRF/CORS, given the section-2 recommendation

With a same-origin BFF (section 2) sitting between the browser and both
`lore-server` and `epic-lore-authz`:

- **Cookie storage is the right call**, not browser-JS-accessible token
  storage (`localStorage`/`sessionStorage`), because it lets the token be
  `HttpOnly` (unreadable to any XSS payload) and the BFF -- not the browser
  -- is what actually presents the bearer token to `lore-server`/
  `epic-lore-authz` on each call. The browser only ever holds a session
  cookie scoped to the BFF's own origin.
- **CORS:** because the browser only talks to the BFF, and the BFF is
  served same-origin with the frontend (both behind the same public
  hostname per WBG's boring-deployable preference), no CORS configuration
  should be needed on the browser-facing side at all -- matching
  `epic-lore-authz`'s existing "no CORS layer" posture (section 2) rather
  than fighting it.
- **CSRF:** a cookie-authenticated same-origin app needs its own CSRF
  defense on any state-changing BFF route (the classic `SameSite=Lax/Strict`
  cookie plus a double-submit or synchronizer token, depending on what the
  eventual frontend framework supports) -- this is new surface the BFF
  introduces and owns; it is unrelated to `epic-lore-authz`'s own
  `admin/origin.rs` CSRF gate, which only protects `epic-lore-authz`'s own
  admin panel and does not extend to the web UI's BFF.

## 4. Permissions surface

### What a logged-in user can read about themselves: real, self-service APIs exist

- `CheckUserPermission(resource_id[], target_user?)` -- resolves the
  caller's own principal from their `authorization` bearer token by default
  (`target_user` is optional and, when unset, the caller's own token is
  used); returns allowed/denied `ResourcePermission` per requested
  `resource_id`. Fails closed on any resolution or database error.
  RPC: `lore-proto/proto/auth_api.proto:27-28`. Implementation:
  `lore-authz-server/src/grpc.rs:383-436`, caller resolution at
  `grpc.rs:89-116`.
- `LookupUserPermissions(resource_filter, context_filter?, page_size?,
  page_token?)` -- same self-resolution (always the caller's own token;
  `target_user` is not accepted here), prefix-matches `resource_filter`
  against known resource ids, then returns only the ones the caller actually
  holds a grant on (direct, group, or wildcard). An empty `resource_filter`
  matches every known resource id, so this is effectively "list everything I
  can do."
  RPC: `lore-proto/proto/auth_api.proto:29-30`. Implementation:
  `lore-authz-server/src/grpc.rs:449-511`.

Both are exactly the self-service read API a "my permissions" view (task 9)
needs, and neither requires anything beyond the user's own bearer token --
no service-account credential, no `ADMIN_API_TOKEN`.

### What an admin-view UI cannot do: no self-service "view someone else's
grants" API, only the root-token-gated admin surface

- `CheckUserPermissionRequest.target_user` *can* name a different principal
  than the caller -- but only by presenting **that other principal's own
  `user_token`** (`TargetUser{ user_token }`,
  `lore-proto/proto/auth_api.proto:38-42`,
  `grpc.rs:391-399`). A UI has no way to obtain another user's token, so
  this is not a usable "admin looks up someone else's permissions" path --
  it is a token-exchange convenience for a caller who already holds both
  tokens (e.g. a service impersonating another identity it was handed), not
  an admin-permissions API.
- The only place that actually lists/manages principals, groups, and grants
  across users is `/admin/v1/**` (and the mirrored `/admin/ui` HTML panel),
  and **every route under it is gated on a single shared secret,
  `ADMIN_API_TOKEN`**, compared in constant time, failing closed (denying
  everything) when unset -- there is no per-user admin role that grants
  access to this surface.
  `lore-authz-server/src/admin/auth.rs:1-3, 89-114`
  The module doc for the whole admin surface is explicit that this secret is
  for "an OPERATOR or an automation acting on the deployment's own behalf,
  not an end user," and that using a per-user token here "would make the
  admin surface reachable by anyone holding ANY valid user token, since
  nothing in this product's data model yet expresses 'this principal may
  administer the authorization service itself.'"
  `lore-authz-server/src/admin/auth.rs:5-19`
- **This is exactly the constraint the task brief named up front: the UI
  must not embed `ADMIN_API_TOKEN`.** Confirmed as architecturally correct
  to avoid -- it is a single shared secret with no per-user scoping, and the
  admin surface it gates can mint authority (create a principal, bind it to
  `admin` over every repository). Shipping it into any browser-reachable
  artifact would hand every user of the web UI the deployment's master key.

### The gap, stated plainly

There is currently **no API suitable for an admin-view UI** (task 9's
"permissions view backed by `epic-lore-authz` roles/grants," read as
covering *administering* other users' grants, not just reading one's own).
The two real options:

1. **Route admin actions through the BFF (section 2), which holds
   `ADMIN_API_TOKEN` server-side** (never shipped to the browser), and gate
   *who may reach the BFF's admin routes* using this product's own
   `CheckUserPermission`/`LookupUserPermissions` against a convention this
   UI defines (e.g. "the caller must hold `admin` on the `urc-*` wildcard
   resource"). This reuses the existing self-service permission-check APIs
   to build the missing "am I allowed to see the admin surface" check, while
   the BFF -- not the browser -- is the only thing that ever presents
   `ADMIN_API_TOKEN` to `epic-lore-authz`.
2. **`epic-lore-authz` grows a genuinely per-user-scoped admin API** (a real
   `role_bindings`-driven "may administer this deployment" permission,
   distinct from the `urc-*` repository roles the admin module doc says
   don't express this today). This is `epic-lore-authz`'s own scope, not
   something this study can resolve, and is a larger, security-sensitive
   change to that service's authorization model.

Option 1 is buildable now with what exists; option 2 is a real `
epic-lore-authz` feature request this study surfaces but does not design.
Recommend option 1 for v1, with the BFF's admin-proxy routes treated as a
narrow, carefully-scoped exception to "the BFF is a thin translator" --
this is the one place it necessarily carries authorization logic of its
own.

## Sources (consolidated)

- `~/Documents/epic-lore/lore-proto/proto/lore/thin_client/v1/thin_client.proto`
- `~/Documents/epic-lore/lore-proto/proto/lore/thin_client/v1/model.proto`
- `~/Documents/epic-lore/lore-proto/proto/lore/repository/v1/repository.proto`
- `~/Documents/epic-lore/lore-proto/proto/lore/revision/v1/revision.proto`
- `~/Documents/epic-lore/lore-proto/proto/lore/model/v1/model.proto`
- `~/Documents/epic-lore/lore-proto/proto/lock.proto`
- `~/Documents/epic-lore/lore-proto/proto/notification.proto` (legacy `urc.notification`)
- `~/Documents/epic-lore/lore-proto/proto/lore_notification.proto` (live `lore.notification`)
- `~/Documents/epic-lore/lore-proto/proto/model.proto` (legacy `urc.model`, reserved fields)
- `~/Documents/epic-lore/lore-proto/proto/auth_api.proto`
- `~/Documents/epic-lore/lore-proto/proto/rebac_api.proto`
- `~/Documents/epic-lore/lore-proto/proto/admin.proto`
- `~/Documents/epic-lore/lore-proto/proto/lore/storage/v1/storage.proto`
- `~/Documents/epic-lore/lore-server/src/http/mod.rs`
- `~/Documents/epic-lore/lore-server/src/http/repositories/repository/contents/content/presign_repository_content.rs`
- `~/Documents/epic-lore/lore-server/src/http/repositories/repository/contents/content/get_repository_content.rs`
- `~/Documents/epic-lore/lore-server/src/http/presign_token.rs`
- `~/Documents/epic-lore/lore-server/src/http/presigned/repository/redeem.rs`
- `~/Documents/epic-lore/lore-server/src/grpc/notification_service.rs`
- `~/Documents/epic-lore/lore-server/src/grpc/handlers/branch_push.rs`
- `~/Documents/epic-lore/lore-revision/src/metadata.rs`
- `~/Documents/epic-lore-authz/crates/lore-authz-server/src/http.rs`
- `~/Documents/epic-lore-authz/crates/lore-authz-server/src/oidc_login.rs`
- `~/Documents/epic-lore-authz/crates/lore-authz-server/src/grpc.rs`
- `~/Documents/epic-lore-authz/crates/lore-authz-server/src/admin/mod.rs`
- `~/Documents/epic-lore-authz/crates/lore-authz-server/src/admin/auth.rs`
- `~/Documents/epic-lore-authz/crates/lore-authz-server/src/admin/origin.rs`
