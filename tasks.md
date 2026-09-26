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
- [x] [verified-e2e] Build materials assembled: vendored the nine `lore`
      protos this UI/BFF needs client generation for (`thin_client`,
      `thin_client/v1/model`, `repository.v1`, `revision.v1`, `model.v1`,
      `lock`, the live `lore.notification` (`lore_notification.proto`, not
      legacy `urc.notification` -- per the API contract study), `auth_api`,
      `rebac_api`, plus the legacy `model.proto` transitive dependency)
      verbatim under `proto/vendor/lore/`, license call: MIT (confirmed by
      reading `~/Documents/epic-lore/LICENSE` -- "MIT License, Copyright (c)
      2026 Epic Games, Inc.") permits verbatim redistribution, so vendored
      rather than fetch-scripted; pinned to upstream commit
      `4ed62928ecb0f960e3e310d918ea6774b0beeb86` (2026-09-01), documented in
      `proto/vendor/lore/PROVENANCE.md` (upstream URL, commit, file list,
      import graph). Added `docs/design/authz-integration.md` (pinned-tag
      `v0.2.0` references into `epic-lore-authz`'s `grpc.rs`/`http.rs`/
      `oidc_login.rs`/`admin/auth.rs`, no source copied) and
      `docs/design/build-deps.md` (fresh-clone build requirements, proto
      source, authz integration, doc reading order). Evidence: `npx -p
      protobufjs-cli pbjs -t json -p proto/vendor/lore -o
      /tmp/lore-protos.json` against all nine vendored files succeeded,
      producing a single valid descriptor JSON with packages `lore`, `urc`,
      `epic_urc`, `google` (well-known types) and no missing-import errors
      -- proves the vendored set is complete and self-contained against its
      own import graph. `[verified-e2e]` scoped to "these protos compile
      from this vendored tree," not an application build (no application
      code exists yet -- see the stack decision above, now closed).
- [x] [code-says] Stack / bootstrap decision -- approved by Kilo
      2026-09-20. Recorded in `docs/design/stack-decision.md`: Vite SPA
      (static output, no Next.js server half) + React Router v7 (library
      mode); TanStack Query for RPC data, Zustand for cross-cutting UI
      state; headless primitives (Radix/shadcn-style) + Tailwind, with the
      branch graph, file tree, and diff pane purpose-built; BFF is Fastify
      (buf-generated gRPC clients, server-side only, hex-encoded bytes at
      the JSON boundary, SSE for streaming, `/api/admin/*` proxy); auth is
      BFF-side OIDC/PKCE against Okta with an encrypted `HttpOnly` cookie
      session; asset preview (task 4) is BFF-minted presigned URLs off a
      service-account credential; one repo, pnpm workspaces
      (`apps/web`, `apps/bff`, `packages/lore-client`, `packages/api-types`),
      one deploy container, Node 22 LTS pinned. Also records a newly
      verified finding: `epic-lore-authz`'s `ExchangeExternalTokenForUserToken`
      RPC is an unimplemented stub with no Okta/OIDC token type designed
      for it, confirmed against a local checkout -- see task 8 below.
      `[code-says]` not `[verified-e2e]`: this is a decision record with no
      code to run yet; downstream task notes updated to reflect it.

- [x] [verified-e2e] Monorepo skeleton scaffolded per
      `docs/design/stack-decision.md` (pnpm workspaces: `apps/web` Vite +
      React + TS SPA with Tailwind, React Router v7 library mode
      (`react-router@7.18.4`, not the now-latest v8 on npm -- pinned to
      match the approved decision), TanStack Query provider, Zustand store
      stub; `apps/bff` Fastify with `@fastify/cookie`,
      `@fastify/csrf-protection`, `@fastify/static` (serving
      `apps/web/dist` same-origin), `/healthz` + placeholder `/api/`
      routes, OIDC/session/admin-proxy/SSE stubbed with TODOs referencing
      tasks 8/9/10; `packages/api-types` owns the hex-bytes `bytes`-field
      convention (`encodeHexBytes`/`decodeHexBytes`/`isHexBytes`) plus the
      `/healthz` contract type; `packages/lore-client` does buf-based
      codegen (`buf.gen.yaml`, `protoc-gen-es` v2 -- not the older
      `protoc-gen-connect-es`, which still pins `@bufbuild/protobuf` v1 and
      would conflict with the v2 runtime used here) against
      `proto/vendor/lore`, generate-on-build, generated `src/gen/`
      gitignored, plus a thin `createLoreTransport` factory and nothing
      else hand-written; root ESLint flat config enforces the
      `apps/web` -> `packages/lore-client` import ban via
      `no-restricted-imports`; Node 22 LTS pinned via `.nvmrc` +
      `engines` in every `package.json`. Evidence (all real commands, run
      2026-09-25/26):
      - `pnpm install`: succeeded, 389 packages added (pnpm itself was not
        preinstalled in the environment -- installed via
        `npm install -g pnpm`, giving a real pnpm 12.6.0 binary, not an
        npm-as-pnpm substitution; `@bufbuild/buf`/`esbuild` postinstall
        scripts approved via `pnpm-workspace.yaml`'s `allowBuilds`).
      - `pnpm run typecheck`: `pnpm -r run typecheck` exits 0 across all 4
        buildable workspaces (`packages/api-types`, `packages/lore-client`,
        `apps/web`, `apps/bff`).
      - `pnpm run build`: exits 0; `apps/web build` produces
        `apps/web/dist/{index.html,assets/*.js,assets/*.css}` via a real
        Vite production build; `apps/bff build` produces
        `apps/bff/dist/server.js` via `tsc`.
      - buf generate: `packages/lore-client`'s `pnpm run generate` (`buf
        generate`, using the `@bufbuild/buf` npm package's binary --
        no system/brew `buf` available in this environment) ran against
        `proto/vendor/lore` and produced real `.ts` output under
        `packages/lore-client/src/gen/` (`auth_api_pb.ts`, `lock_pb.ts`,
        `model_pb.ts`, `rebac_api_pb.ts`, `lore_notification_pb.ts`, plus
        `lore/{model,repository,revision,thin_client}/v1/*_pb.ts`) -- this
        is real generated code, not faked.
      - BFF boot proof: started `node apps/bff/dist/server.js` on
        `PORT=3055`, `curl -i http://localhost:3055/healthz` returned
        `HTTP/1.1 200 OK` with body
        `{"status":"ok","service":"epic-lore-webui-bff","timestamp":"2026-09-26T06:20:14.805Z"}`,
        then the process was killed and a follow-up curl confirmed
        connection-refused (server actually stopped, not left running).
      - ESLint boundary rule proof (not just "lint passes because nothing
        imports it yet"): temporarily added a file under `apps/web/src`
        importing `@epic-lore-webui/lore-client` -- `pnpm run lint` failed
        with a `no-restricted-imports` error naming that exact import;
        file removed immediately after, `pnpm run lint` back to exit 0.
      - `pnpm run lint`: exits 0 on the real scaffold (post boundary-rule
        proof above).
      `[verified-e2e]` scoped to what was actually run: install, typecheck,
      build, buf generate, one BFF boot+curl+stop cycle, and one ESLint
      boundary-rule trip. Not implied "verified": no v1 feature work exists
      yet to verify (by design -- scaffold only, per this task's scope).
      Interpretation calls made beyond the decision doc's text: (1)
      `react-router` pinned to the v7.18.4 line explicitly, since npm's
      current `latest` for that package is now v8 and the decision doc
      names v7 specifically; (2) `packages/lore-client`'s buf codegen uses
      only `protoc-gen-es` v2 (no `protoc-gen-connect-es`) because that
      older plugin is incompatible with the `@bufbuild/protobuf` v2 /
      `@connectrpc/connect` v2 line the decision doc specifies -- protoc-gen-es
      v2 generates both messages and service descriptors itself; (3)
      `packages/api-types` and `packages/lore-client`'s `typecheck` scripts
      do a real `tsc` emit (not `--noEmit`) because `apps/bff`/`apps/web`
      resolve their workspace `.d.ts` files from `dist/`, not from
      TS project references -- a `--noEmit` typecheck of a dependency
      package left dependents unable to resolve its types; (4) Node 22 LTS
      is pinned in `.nvmrc`/`engines` per the decision doc, but this
      environment's actual Node is v26.7.0 with no `nvm`/`volta`/`fnm`
      available to install/switch to 22 -- all verification above therefore
      ran on Node v26.7.0, not the pinned 22 LTS; this is an environment gap
      to close before real CI, not a scaffold defect.

## v1 scope

- [~] 1. Repo browse + file tree. Implemented: BFF routes `GET
      /api/repositories`, `GET /api/repositories/:repositoryId`, `GET
      /api/repositories/:repositoryId/branches`, `GET
      /api/repositories/:repositoryId/branches/:branchId/tree?path=&depth=`
      (`apps/bff/src/routes/repositories.ts`), backed by a `LoreBackend`
      interface (`apps/bff/src/backend/types.ts`) with two implementations
      selected by `LORE_BACKEND` (default `fixture`): `backend/fixture.ts`
      (in-memory data built with the real generated proto message
      constructors, `create(FooSchema, {...})` against
      `proto/vendor/lore`, not invented object literals) and
      `backend/grpc.ts` (real `@connectrpc/connect-node` gRPC client,
      dialing `LORE_SERVER_ADDR`, default `localhost:41337`). Web side:
      three React Router v7 routes
      (`/`, `/repositories/:repositoryId`,
      `/repositories/:repositoryId/branches/:branchId/*`) -- repository ->
      branch -> path is fully deep-linkable via the URL, per
      docs/design/stack-decision.md's "Routing" section; TanStack Query
      hooks (`apps/web/src/queries/lore.ts`) own all server data; Zustand
      (`apps/web/src/store/ui-store.ts`) owns file-tree expansion state and
      mirrors the URL-derived selected path. The file tree
      (`apps/web/src/components/file-tree.tsx`) is lazy: only the root's
      direct children load up front; expanding a directory issues a new,
      independently-cached request with `path`/`depth` mapped onto
      `RevisionTreeRequest.path_prefix`/`max_depth`.

      **Two real findings made building this, neither anticipated by
      docs/design/api-contract.md or stack-decision.md:**

      1. **`lore.revision.v1.RevisionService.BranchList` has no
         repository-scoping filter, and `lore.model.v1.Branch` carries no
         `repository_id` field at all** (verified against
         `proto/vendor/lore/lore/revision/v1/revision.proto` and
         `.../lore/model/v1/model.proto`). `BranchList` streams every
         branch the server knows about, full stop. Worked around by
         walking each branch's `stack` (ancestry chain, parent-first /
         root-last) to its root and matching that root against the target
         repository's `default_branch_id`
         (`apps/bff/src/backend/branch-scope.ts`, `filterBranchesForRepository`) --
         a real client-side (BFF-side) computation the API surface doesn't
         do for you, documented in `packages/api-types/src/branch.ts`.
      2. **`protoc-gen-es` v2's default output is not runnable under real
         Node ESM.** `packages/lore-client`'s own `buf.gen.yaml` didn't set
         `import_extension=js`, so generated cross-file relative imports
         (e.g. `from "../../model/v1/model_pb"`) compiled cleanly --
         `packages/lore-client`'s own `tsconfig.json` uses
         `moduleResolution: "Bundler"`, which doesn't check this -- but
         failed at actual `node` runtime with `ERR_MODULE_NOT_FOUND` the
         first time a real process (the BFF) imported them. This was
         latent since the prior scaffold task (nothing had exercised a
         deep `./gen/*` import at runtime yet). Fixed by adding
         `import_extension=js` to `buf.gen.yaml` and regenerating. Separately,
         `packages/lore-client`'s own package.json `exports` map
         (`"./gen/*"`) was broken for the *documented* deep-import style
         (`.../repository_pb.js`, written in `packages/lore-client/src/index.ts`'s
         own comment): the wildcard capture already includes the caller's
         `.js`, so the target pattern appended a second one, producing
         `TS2307` for every deep import. Fixed by dropping the `.js` on
         these package-subpath imports (not a relative import, so
         NodeNext's explicit-extension rule doesn't apply) and correcting
         the misleading doc comment.

      Evidence (real commands, run 2026-09-26):
      - `pnpm run typecheck`: `pnpm -r run typecheck` exits 0 across all 4
        workspaces.
      - `pnpm run lint`: `eslint .` exits 0; re-proved the
        `no-restricted-imports` boundary rule by temporarily adding
        `apps/web/src/__boundary_check.ts` importing
        `@epic-lore-webui/lore-client` -- lint failed naming that exact
        import, file removed, lint back to exit 0.
      - `pnpm run build`: exits 0 across all 4 workspaces (web `vite build`
        + bff `tsc`).
      - Booted the BFF in fixture mode (`PORT=3057 LORE_BACKEND=fixture
        node apps/bff/dist/server.js`) and curled the real routes:
        `GET /api/repositories` returned hex-encoded `id`/`defaultBranchId`
        (not base64), e.g. `"id":"00000000000000000000000000000001"`;
        `GET /api/repositories/<lore-id>/branches` returned exactly that
        repository's 3 fixture branches (and the sibling repository's
        `/branches` route returned only its own 2), proving the
        ancestry-root branch-scoping filter above actually works;
        `GET .../tree?depth=1` (no `path`) returned only the root's direct
        entries (`crates` collapsed, no grandchildren); re-requesting with
        `path=crates%2Flore-revision&depth=1` returned that directory
        echoed plus only its direct children (no
        `crates/lore-revision/src/lib.rs` leaked) -- proving the lazy
        `path_prefix`/`max_depth` semantics. Also proved the SPA fallback
        (`app.setNotFoundHandler` serving `index.html` for any
        non-`/api/*` GET so a direct/reloaded deep link works) and that a
        genuinely missing `/api/*` route still 404s as JSON. Process
        killed afterward; confirmed stopped (`curl` connection-refused).
      - `LORE_BACKEND=grpc LORE_SERVER_ADDR=localhost:41337`: attempted per
        the task brief. `nc -z -w 2 localhost 41337` reported `CLOSED` (the
        docker-compose demo stack was not up at verification time) --
        curling `/api/repositories` returned `HTTP/1.1 500` with
        `{"code":"14","message":"[unavailable]"}`, and the BFF's own log
        showed a real `ConnectError` caused by `ECONNREFUSED` from
        `@connectrpc/connect-node`'s actual HTTP/2 client attempting a real
        TCP connection -- i.e. this is a genuine network failure against a
        real (absent) backend, not a stub or a fake error path. Process
        killed afterward; confirmed stopped.

      **What is NOT proven:** the `grpc` backend was never exercised
      against a live `lore-server` -- only against `ECONNREFUSED`. The
      real-RPC shape (field names, streaming framing, and especially the
      `filterBranchesForRepository` ancestry-root assumption above) is
      `[code-says]` only: it compiles against the vendored proto types and
      is internally consistent, but nothing has confirmed a real
      `lore-server` actually behaves the way that assumption requires.
      `[~]` rather than `[x]` for exactly this reason -- re-run the
      `LORE_BACKEND=grpc` curl sequence above once the demo stack is
      reachable and flip to `[x] [verified-e2e]` (or correct the ancestry
      assumption) based on what that shows.
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
      needed. **Ruling (`docs/design/stack-decision.md`, "Asset preview"):**
      this is now the standard path, not an edge case -- the BFF holds a
      service-account credential, checks the user's permission via
      `CheckUserPermission`, mints the presigned URL, and the browser
      fetches bytes directly from `lore-server`; no bearer token is ever
      held by the browser. Provisioning that `lore` service account is a
      named v1 dependency (see stack-decision.md, "Upstream dependencies").
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
      resolved by this study. **VERIFIED (`docs/design/stack-decision.md`,
      "Critical verified finding"):** the (a)-side blockage above is no
      longer speculative -- `ExchangeExternalTokenForUserToken` is
      confirmed an unimplemented stub (`Status::unimplemented`,
      `epic-lore-authz` `crates/lore-authz-server/src/grpc.rs:235-241`,
      verified 2026-09-20 against local checkout `4726ad6`, 7 doc-only
      commits ahead of the pinned `v0.2.0`), and its design
      (`docs/architecture.md:129-137`) only proposes `api-key`,
      `github-actions`, and `lore` token types -- no Okta/OIDC ID token
      type. Web login cannot delegate token minting to that RPC today;
      this is a verified upstream Phase 1b dependency on `epic-lore-authz`
      (new/extended token type or a dedicated web-login endpoint, plus
      security review), not just a documented gap.
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
