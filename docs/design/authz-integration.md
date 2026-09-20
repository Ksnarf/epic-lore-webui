# authz integration reference

`epic-lore-authz` (https://github.com/Ksnarf/epic-lore-authz) is a separate
public repository under the same account. Its **source is not copied into
this repo** -- this document instead pins references to it at a tagged
release, `v0.2.0`
(https://github.com/Ksnarf/epic-lore-authz/releases/tag/v0.2.0), so the
links below stay stable even as `epic-lore-authz`'s `main` branch moves.

This is a reference, not a design doc in its own right: the integration
points below are grounded in, and should be read alongside,
`docs/design/api-contract.md` sections 2-4, which is where the analysis
(transport decision, auth-flow gap, permissions-surface gap) actually
lives. This document exists so a build of this repo has direct links to the
exact upstream files that analysis is grounded in, without vendoring their
contents.

## Pinned reference

- **Tag:** `v0.2.0`
- **Commit:** `5041d40ceab6cfda303600970bd7b91a635f41f4`
- **Repo:** https://github.com/Ksnarf/epic-lore-authz

## Integration points, with links at the pinned tag

### 1. JWKS

`epic-lore-authz` publishes its signing key as a standard JWKS document at
`GET /.well-known/jwks.json`, routed in
[`http.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/http.rs).
`lore-server` fetches this to verify the bearer tokens `epic-lore-authz`
issues. This UI/BFF does not need to touch JWKS directly -- it consumes
tokens `epic-lore-authz` already issued -- but the BFF's own token
validation (if it validates tokens itself rather than trusting
`lore-server` to reject bad ones) would fetch from the same endpoint.

### 2. Token exchange (`ExchangeExternalTokenForUserToken`)

Defined in the vendored `proto/vendor/lore/auth_api.proto`
(`UrcAuthApi.ExchangeExternalTokenForUserToken`), implemented in
[`grpc.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/grpc.rs).
Per `docs/design/api-contract.md` section 3, this is one of the two viable
paths for closing the web-login gap: the BFF does the OIDC exchange itself
and calls this RPC to turn the IdP's token into a Lore `UserToken`, bypassing
the CLI-shaped `login_code`/session-polling flow entirely.

### 3. `CheckUserPermission` / `LookupUserPermissions`

Also in `auth_api.proto`, implemented in
[`grpc.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/grpc.rs)
(`check_user_permission` around line 383, `lookup_user_permissions` around
line 449 at this tag). Per `docs/design/api-contract.md` section 4, these
are genuine self-service reads -- a user's own bearer token is sufficient,
no service-account or `ADMIN_API_TOKEN` credential needed. This is the API
task 9 ("my permissions" view) should call directly (via the BFF, per the
transport recommendation in section 2 of the contract doc), and is also the
recommended mechanism for gating access to the BFF's own admin-proxy routes
(check the caller holds `admin` on a UI-defined wildcard resource, rather
than inventing a separate authorization check).

### 4. `oidc_login.rs` endpoints (the web-login gap)

[`oidc_login.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/oidc_login.rs)
implements the three legs of the existing CLI-shaped login flow: `start`
(called by `StartAuthSession`), `authorize_redirect` (backs
`GET /login/{login_code}`), and `complete_callback` (backs
`GET /oidc/callback`). Its module doc is explicit that the browser is not
handed a token at the end of this flow today -- see
[`http.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/http.rs)'s
module doc, quoted in `docs/design/api-contract.md` section 3.

### 5. The two unbuilt gaps

Both are named, not designed, by `docs/design/api-contract.md` section 3,
and are `epic-lore-authz`-side work, not something this UI's frontend can
work around:

- **Web-login endpoint.** No route on `epic-lore-authz` (or elsewhere)
  performs the `StartAuthSession` -> redirect -> callback sequence for a
  plain browser session and hands back a token/cookie instead of the
  current "you may close this tab" static page
  ([`http.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/http.rs)
  line ~223 at this tag). Needs a new endpoint here, or the BFF doing the
  OIDC exchange itself via `ExchangeExternalTokenForUserToken` (see #2
  above).
- **IdP-initiated tile entry.** `complete_callback` requires a
  pre-existing, pending session resolved by `state`
  ([`oidc_login.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/oidc_login.rs)),
  and correctly rejects any inbound request with no matching state as
  `Invalid`. An Okta-tile-initiated login has no such pre-existing state by
  construction, so it needs a distinct acceptance path (commonly Okta's
  "third-party-initiated login" pattern: the tile hits a fixed
  `target_link_uri`, and the relying party itself starts a fresh
  SP-initiated request from there). This needs its own design and security
  review on `epic-lore-authz`; not resolved here.

## What this UI/BFF must never do

Per `docs/design/api-contract.md` section 4: never embed `ADMIN_API_TOKEN`
in any browser-reachable artifact. The admin gate
([`admin/auth.rs`](https://github.com/Ksnarf/epic-lore-authz/blob/v0.2.0/crates/lore-authz-server/src/admin/auth.rs))
is a single shared secret with no per-user scoping; only the BFF (a
server-side component) may hold it, and only to call `epic-lore-authz`'s
`/admin/v1` surface on the browser's behalf after an independent
`CheckUserPermission` check has authorized that specific caller.
