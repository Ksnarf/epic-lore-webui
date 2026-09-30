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

- [x] [verified-e2e] 1. Repo browse + file tree. Implemented: BFF routes `GET
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

      **Real-server validation, 2026-09-29 (retiring `[~]`):** the
      docker-compose demo stack (`epic-lore-authz`'s `demo/`, at
      `/Users/test/Documents/epic-lore-authz` -- NOT
      `003-wbg/prj.tt.lore`, a different, unrelated repo the task brief
      pointed at by mistake) was brought up (`docker compose up -d --build
      --wait`, `DEMO_POSTGRES_PORT=15432` to dodge a local Postgres port
      collision; `nc -z localhost 41337`/`41339` both succeeded;
      `docker compose exec -T tools sh /scripts/verify.sh` passed 8/8).

      One real defect found and fixed, blocking on its own regardless of
      how a caller's bearer token is sourced: **every
      `RevisionService`/`ThinClientService` RPC
      (`BranchList`/`RevisionList`/`RevisionInfo`/`RevisionTree`) requires
      two gRPC metadata headers carrying the target repository's raw id
      bytes -- `urc-repository-id-bin` and `lore-partition-bin`** (matching
      `epic-lore`'s own `lore-transport/src/grpc/mod.rs`,
      `REPOSITORY_ID_KEY`/`PARTITION_ID_KEY`, injected by
      `inject_repository()`) -- confirmed live via `grpcurl` (using this
      repo's own vendored protos, real login + `ExchangeUserToken-
      ForMultiresourceToken` flow, no `epic-lore-authz` source touched):
      `BranchList`/`RevisionList`/`RevisionInfo` all returned
      `PermissionDenied: Unauthorized` with a valid bearer token but no
      such metadata, and succeeded once it was attached. `grpc.ts` attached
      neither header to any call, so `LORE_BACKEND=grpc` against any
      auth-enabled real `lore-server` failed on literally every
      branch/revision/tree/tip request -- previously undetected because
      the fixture backend has no auth concept and task 1's one prior
      `grpc` attempt hit `ECONNREFUSED` before ever reaching this code
      path. **Fixed**: `RevisionTreeParams`/`RevisionListParams`/
      `RevisionInfoParams` (`apps/bff/src/backend/types.ts`) now carry
      `repositoryId`, threaded from `routes/repositories.ts`/
      `routes/revisions.ts` (the `Repository` is already resolved at every
      call site); `grpc.ts`'s new `repositoryHeaders()` attaches both
      headers (base64 of the raw id bytes -- binary gRPC metadata is
      base64 over the wire and neither `@connectrpc/connect` nor
      `@connectrpc/connect-node` encode this for you) to
      `branchList`/`revisionTree`/`revisionList`/`revisionInfo`. Does not
      touch task 8's scope (no bearer-token *sourcing* was built -- BFF-side
      OIDC/session remains unbuilt).

      **Separate real finding, refining (not reverting) the ancestry-root
      finding above:** with that metadata attached, real `BranchList`
      **does** filter its results to the named repository server-side --
      contradicting the finding-1 doc comment above (written before this
      was known) that it streams every branch unfiltered. Proven with two
      real repositories seeded via the documented mechanism (`grpcurl` +
      the demo's own `/admin/v1/resources` + `/admin/v1/grants` JSON API +
      `RepositoryCreate`, exactly mirroring what `demo/scripts/verify.sh`
      already does for its one repo -- same pattern, a second resource id):
      the same multiresource token, pointed at repo 1's metadata, returned
      only repo 1's branch; pointed at repo 2's metadata, returned only
      repo 2's branch. `filterBranchesForRepository`'s ancestry-root
      client-side filter is therefore redundant once this metadata is
      attached (not wrong -- harmless double-filtering), kept as
      defense-in-depth; corrected in `grpc.ts`'s doc comment.

      Ran the fixed code through the **actual BFF HTTP routes** (not just
      `grpcurl`) end-to-end against the real server, using a temporary,
      git-reverted static-bearer-token interceptor to stand in for task 8's
      unbuilt token sourcing (confirmed removed by `grep` before the final
      build, and by a final unauthenticated boot re-failing honestly with
      `[unauthenticated] authorization header required` -- no lingering
      test scaffolding shipped): `GET /api/repositories` returned both real
      repositories with real hex ids; `GET .../branches` for repo 1
      returned only repo 1's branch, for repo 2 returned only repo 2's
      branch -- assumption (a) now proven live, not `[code-says]`.
      `pnpm -r run typecheck`/`lint`/`build` all exit 0 after the fix (and
      again after the temporary interceptor was reverted); fixture backend
      re-verified unaffected by the `LoreBackend` interface change (booted
      `LORE_BACKEND=fixture`, repositories/branches/tree/revisions/tip all
      still correct, process killed and confirmed dead).

      **Two further real, honestly-unfixed edge cases found** (out of
      surgical scope -- deciding the right product response is a design
      call, not a wire-protocol correctness fix, so left as raw errors
      rather than guessed at): on a branch with zero revisions ever pushed
      (unavoidable with this seed data -- see task 2's note on why no real
      revision content could be created), `GET .../tree` surfaces a raw
      `500` (`[invalid_argument] Cannot get the tree of a zeroed
      revision`) instead of an empty tree, and `GET .../revisions/0` (tip)
      surfaces a raw `500` (`[internal] file not found: metadata key`).
      Both are real, both reachable in principle on a brand-new
      production repository's first visit, neither touched here.
- [~] 2. Revision history + multi-lane branch graph. Implemented: BFF routes
      `GET /api/repositories/:repositoryId/branches/:branchId/revisions?cursor=`
      (cursor-paginated, `apps/bff/src/routes/revisions.ts`) and `GET
      .../revisions/:number` (`:number` decimal, `0` = tip). `LoreBackend`
      (apps/bff/src/backend/types.ts) extended with `listRevisions`
      (`RevisionList`) and `getRevisionInfo` (`ThinClientService.RevisionInfo`),
      implemented in both `backend/fixture.ts` and `backend/grpc.ts`.
      `BranchSummary` (packages/api-types/src/branch.ts) extended with
      `stack` (the branch's `BranchPoint[]` ancestry) so the web app can see
      fork points -- task 1's DTO never needed to expose it. New
      `packages/api-types/src/revision.ts`: `RevisionItemDto`/
      `RevisionListResponseBody`/`RevisionDto`/`RevisionParentDto`/
      `RevisionInfoResponseBody`. Web side: `useRevisionsInfiniteQuery`
      (TanStack Query's `useInfiniteQuery`, apps/web/src/queries/lore.ts);
      a pure, proto-agnostic lane-assignment module
      (`apps/web/src/graph/lane-assignment.ts`, one lane per branch, opened
      on first appearance and freed once a branch's loaded chain ends) with
      3 passing vitest unit tests (linear chain, branch point, merge +
      lane reuse -- `lane-assignment.test.ts`); a DAG-assembly module
      (`apps/web/src/graph/assemble-revision-graph.ts` +
      `use-revision-graph.ts`) that builds `GraphNode[]` from `BranchList`
      + a per-branch `RevisionList` walk, per the design doc, plus one
      addition the design doc didn't anticipate (see finding 1 below); a
      custom SVG multi-lane graph (`apps/web/src/components/revision-graph.tsx`,
      no charting library) and a row-aligned revision list
      (`components/revision-list.tsx`, sharing `graph/layout.ts`'s row
      height); a new deep-linkable route,
      `/repositories/:repositoryId/branches/:branchId/history/*` (splat =
      selected revision number), `apps/web/src/routes/branch-history.tsx`,
      following task 1's splat-carries-selection pattern
      (`branch-tree.tsx`). No diffs, locks, or auth touched.

      **Fixture topology** (apps/bff/src/backend/fixture.ts): `epic-lore`'s
      `main` branch got 25 real `lore.thin_client.v1.Revision` records
      (`create(RevisionSchema, {...})`, not invented literals); `feature/
      lazy-tree-loading` forks from `main` revision 12 (6 of its own
      revisions) and `release/1.0` forks from `main` revision 18 (4 of its
      own revisions) -- a genuine branch point, twice, with both branches
      open concurrently (parallel lanes); `main`'s revision 25 (its tip) is
      a real two-parent merge, `parent_self` continuing `main`'s own chain
      and `parent_other` pointing at `feature`'s tip -- not a fast-forward.

      **Three real findings made building this, none anticipated by
      docs/design/api-contract.md or stack-decision.md:**

      1. **`lore.model.v1.RevisionItem` (`RevisionList`'s lean row
         projection) carries no parent/ancestry field at all -- not even for
         merges.** Verified against `proto/vendor/lore/lore/model/v1/model.proto`
         (`RevisionItem`: `number`, `signature`, `metadata`, `state` only)
         vs. `proto/vendor/lore/lore/thin_client/v1/model.proto` (the full
         `Revision`: `parent_self`/`parent_other`, only reachable via
         `ThinClientService.RevisionInfo`). The design doc's gap note says
         the graph is "assembled client-side from `BranchList` ... plus a
         `RevisionList` walk" as if that pair were sufficient -- it is not:
         that combination can reconstruct a branch's own linear chain and,
         via `Branch.stack`, where it forked from, but it can **never**
         reveal a merge; `parent_other` is the only wire signal a merge
         exists at all. Worked around with a bounded addition: one
         `RevisionInfo` call per *branch tip* shown in the graph (O(branches
         displayed), never O(revisions)) -- `apps/web/src/graph/
         use-revision-graph.ts`. This is a scoped compromise, not a complete
         solution: a merge that isn't at whichever branch tip happens to be
         loaded (e.g. deep in history, already superseded by later commits)
         would not be detected without probing every revision, which this
         implementation deliberately does not do.
      2. **`RevisionItem` carries no timestamp**, so revisions from
         different branches can't be interleaved into one global
         chronological order client-side using `RevisionList` data alone.
         `assemble-revision-graph.ts` sidesteps this by not needing a global
         order at all: it emits each branch's own revisions as a contiguous
         run (newest-to-oldest) and lets `lane-assignment.ts`'s one-lane-
         per-branch model handle interleaving-independence -- correctness
         doesn't depend on *which* branch's run comes first, only
         readability does. Documented in both modules' top comments.
      3. **`RevisionListResponse`'s own doc comment says a page's anchor
         "is not necessarily items[0] -- the server may align the page on a
         wider boundary... and return items both newer and older than the
         anchor."** The fixture backend does not implement this: it always
         anchors strictly at `items[0]` and returns a disjoint, non-
         overlapping older page. This is a deliberate fixture
         simplification, not a proven real-server behavior -- see "What is
         NOT proven" below and packages/api-types/src/revision.ts's doc
         comment.

      Evidence (real commands, run 2026-09-26):
      - `pnpm run typecheck`: exits 0 across all 4 workspaces.
      - `pnpm run lint`: exits 0; re-proved the `no-restricted-imports`
        boundary rule (temporarily added a `lore-client` deep-import under
        `apps/web/src`, lint failed naming that exact import, file removed,
        lint back to exit 0).
      - `pnpm run build`: exits 0 across all 4 workspaces.
      - `pnpm --filter @epic-lore-webui/web run test` (vitest, newly added
        as a dev dependency -- none was configured before this task): 3/3
        pass -- linear chain (single lane throughout), branch point
        (forked branch gets a distinct lane while concurrently open, then
        frees it, then a later independent branch reuses the freed lane),
        merge (cross-branch connector resolves to the correct distinct
        lane; both lanes eventually free and get reused, `laneCount`
        stays 2 rather than growing unbounded).
      - Booted the BFF in fixture mode (`PORT=3123 LORE_BACKEND=fixture
        node apps/bff/dist/server.js`) and curled the real routes: `GET
        .../branches/<main>/revisions` (no cursor) returned revisions
        25..16 (numbers, all hex signatures) with
        `signatureBackward=...03f7`; following that cursor,
        `GET .../revisions?cursor=...03f7` returned revisions 15..6 -- a
        disjoint, strictly-older page, proving pagination actually walks
        forward and doesn't repeat. `GET .../revisions/0` (tip) on `main`
        returned the real merge record: `parentSelf` -> main #24,
        `parentOther` -> `feature`'s branch id, revision 6 -- proving the
        merge fixture and the `RevisionInfo` route both work end-to-end.
        `GET .../branches` showed `feature`/`release`'s `stack` pointing at
        `main` with distinct fork-point signatures (#12 and #18
        respectively, not the same placeholder signature task 1's fixture
        used). Process killed afterward; confirmed stopped (`ps` empty,
        follow-up curl connection-refused, exit code 7).

      **Real-server validation, 2026-09-29 (partial -- stays `[~]`):** ran
      against the same live demo stack task 1 validated (see task 1's
      entry for how it was brought up, and for the metadata-header defect
      found and fixed in `grpc.ts` -- shared by every route this task
      uses too, so this task benefits from that same fix). `(a)` the
      `grpc` backend's `listRevisions`/`getRevisionInfo` code paths ARE now
      exercised against a live `lore-server` (they were not before): `GET
      .../revisions` on a real (but genuinely empty) branch returned real,
      well-formed JSON -- `{"items":[],"signatureForward":null,
      "signatureBackward":null}`, HTTP 200 -- proving the route, the hex
      encoding, and the null-cursor case all work end-to-end against real
      wire responses, not just the vendored proto types.

      `(b)` and `(c)` remain genuinely **unprovable with this
      environment**, and this is a hard limitation, not a shortcut: proving
      real pagination windowing needs a branch with enough actual revision
      history to span multiple pages, and proving the bounded merge-
      detection heuristic needs a real two-parent merge. Both require
      pushing real revision content (`RevisionService.BranchPush`), which
      the real `lore-server` refuses unless "the revision and all data it
      references are present in CAS" first (`revision.proto`'s own doc
      comment on `BranchPushRequest`) -- i.e. a prior
      `StorageService` content-upload round trip. `StorageService` is not
      among the nine protos this repo vendors (deliberately -- see
      `docs/design/api-contract.md`'s prior finding that it needs bidi
      streaming unreachable from any browser-facing transport) and is not
      vendored anywhere reachable from this validation either, so building
      a real CAS-write client to manufacture multi-revision/merge
      topology was out of this task's surgical scope. What WAS confirmed:
      two real, genuinely-empty repositories were created live
      (`RepositoryCreate` needs no CAS), each with one real branch and
      zero revisions -- enough to prove `(a)`'s branch-scoping and the
      empty-page shape of `(b)`'s response, but not enough to observe an
      actual multi-page window or a real merge. `getRevisionInfo` on a
      zero-revision branch's tip additionally surfaced a raw real `500`
      (`[internal] file not found: metadata key`, see task 1's note on
      this same edge case) -- left as-is, not silently coerced to `null`,
      since guessing at what an `Internal`-coded error means risks masking
      a genuinely broken call elsewhere.

      Stays `[~]`: `(a)` is now `[verified-e2e]` in substance (proven live,
      empty-branch case), but `(b)` and `(c)` remain exactly as
      undetermined against a real server as before this session, for the
      reason above -- not a gap in effort, a gap in what this environment
      can produce without a full CAS-write client. Re-run this task's
      cursor-pagination and merge-detection checks the moment a real
      repository with actual multi-revision (ideally forked/merged)
      history becomes reachable -- via the real `lore` CLI against this
      same demo stack, or a seeded fixture repository with real content --
      and flip to `[x] [verified-e2e]` (or correct the assumptions) based
      on what that shows.
- [~] 3. Side-by-side text diff, via `ThinClientService.RevisionDiff` /
      `ContentDiff` (`lore.thin_client.v1`). **Descope, per the API contract
      study (`docs/design/api-contract.md` section 1, feature 3) and this
      task's brief:** `ContentDiff` only ever flags `binary = true` -- there
      is no chunk-level binary diff RPC, so the original "binary-aware diff
      (thumbnail/metadata/chunk-delta)" framing is not buildable client-only.
      Scope actually built: side-by-side **text** diff, plus honest binary
      handling (a plain "binary file changed" card reporting the wire's own
      `binary`/`truncated` flags and the two content addresses -- no
      thumbnail, no chunk-delta, since neither exists server-side; that
      remains new server-side surface, not something this task invented a
      workaround for).

      Implemented: BFF routes `GET
      /api/repositories/:repositoryId/branches/:branchId/diff/:from/:to`
      (`RevisionDiff`, `apps/bff/src/routes/diff.ts`) and `GET
      /api/repositories/:repositoryId/content-diff?from=&to=` (`ContentDiff`,
      hex CAS addresses, empty string = no content on that side).
      `LoreBackend` (`apps/bff/src/backend/types.ts`) extended with
      `getRevisionDiff`/`getContentDiff`, implemented in both `backend/
      fixture.ts` and `backend/grpc.ts` (both stream-buffering RPCs the same
      way `RevisionTree`/`RevisionList` already do, `repositoryHeaders()`
      metadata reused). New `packages/api-types/src/diff.ts`:
      `DiffChangeDto`/`RevisionDiffHeaderDto`/`DiffConflictSummaryDto`/
      `DiffPartitionDto`/`RevisionDiffResponseBody`/`ContentDiffResponseBody`.
      Web side: `useRevisionDiffQuery`/`useContentDiffQuery` (TanStack Query,
      `apps/web/src/queries/lore.ts`); a pure, proto-agnostic unified-diff
      parser + side-by-side row aligner (`apps/web/src/diff/unified-diff.ts`,
      no diff library -- see "library choice" below) with 6 passing vitest
      unit tests (pure addition, pure deletion, a mixed change group with a
      trailing one-sided row, multiple hunks, an empty diff, and a
      `\ No newline at end of file` marker); `components/diff-view.tsx`
      (two-pane hunk table, red/green row highlighting, plus the honest
      binary/truncated/linked-repository/no-textual-change cards); a new
      deep-linkable route,
      `/repositories/:repositoryId/branches/:branchId/diff/:from/:to/*`
      (splat = selected changed-file path), `apps/web/src/routes/
      revision-diff.tsx`; a "diff" link per revision row in
      `components/revision-list.tsx` (diffing that revision against its
      own-branch predecessor), disabled on revision #1 (see below).

      **Library choice, recorded per this task's brief:** a hand-written
      unified-diff parser/aligner, not the `diff` npm package. `ContentDiff`
      already computes the diff server-side and streams back finished
      unified-diff *text* -- this repo never needs to compute a diff from two
      strings (what `diff`/jsdiff is for), only to parse and align an
      already-computed one for two-pane display, which is a much smaller,
      fully bespoke problem (~90 lines, no dependency).

      **Scope decisions made building this, recorded precisely (not proto
      limitations -- deliberate reductions):**

      1. **`RevisionDiff` is scoped to one branch's own two revision
         numbers**, not the proto's more general independently-branched
         `query_from`/`query_to`. The web UI's only real need is "diff this
         revision against its own predecessor" from the history view; see
         `packages/api-types/src/diff.ts`'s top comment.
      2. **No "diff vs previous" link on revision #1.** That revision's real
         parent lives on a *different* branch (the fork point, via
         `Branch.stack` -- task 2's finding), and `Branch.stack` only carries
         that ancestor's *signature*, not its revision *number*; resolving
         the number needs an extra `RevisionInfo`-by-signature call this task
         deliberately doesn't make -- the same "bounded compromise" shape as
         task 2's merge-detection heuristic, not an oversight.
      3. **3-way `DiffConflict` entries are carried through the DTO
         unfiltered but not rendered** -- `docs/design/api-contract.md`
         itself splits this across two features: feature 3 (this task) is
         text/binary diff display, feature 7 (branch management + merge/
         conflict UI) owns conflict rendering. The route surfaces
         `conflicts.length` as a plain banner so a merge diff's presence is
         never silently hidden, without building feature 7's UI here.
      4. **`Action.KEEP` is read as "path unchanged, content may differ"
         (a "modify"), not "no change at all."** `DiffChange` carries
         `contentFrom`/`contentTo` alongside every action including `KEEP`,
         and there is no separate "MODIFY" action in the enum -- this is an
         interpretation call, not confirmed against a real multi-revision
         diff (the demo stack has none -- see below), documented in
         `packages/api-types/src/diff.ts`'s doc comment on `DiffChangeDto`.

      **Fixture data** (`apps/bff/src/backend/fixture.ts`): a realistic
      5-file `RevisionDiff` between `epic-lore`'s `main` revisions 11 and 12
      (both real fixture revisions from task 2's chain) covering every
      `Action` this repo models except `COPY` (not exercised by anything
      this study read, left untested rather than invented): a text `KEEP`
      (modify, reusing task 1's own `metadata.rs` tree-fixture address as the
      "from" side), a text `DELETE` (reusing task 1's `main.rs` address), a
      text `ADD` (new file), a content-preserving `MOVE` (rename,
      byte-identical content on both sides), and a binary `KEEP` (modify).
      Matching `ContentDiff` fixtures for all five content pairs: three real
      hand-written unified diffs (with correct `linesAdded`/`linesDeleted`),
      one genuinely empty diff (the rename), and one genuine `binary = true`
      response with zero stats and no diff text -- this task's honest binary
      handling exercised end-to-end, not just described.

      Evidence (real commands, run 2026-09-30):
      - `pnpm -r run typecheck`/`lint`/`build`: all exit 0 across all 4
        workspaces.
      - `pnpm --filter @epic-lore-webui/web run test`: 14/14 pass (6 new
        `unified-diff.test.ts` + the 8 pre-existing
        `lane-assignment.test.ts`/`group-locks.test.ts`).
      - Fixture mode (`PORT=3301 LORE_BACKEND=fixture`): curled every route.
        `GET .../diff/11/12` returned exactly the 5-change list above with
        correct hex content addresses (`contentFrom`/`contentTo` empty-string
        for the ADD/DELETE sides); `GET .../content-diff` for all 5 address
        pairs returned the correct `diff` text and `linesAdded`/
        `linesDeleted` for the 3 text cases, an empty `diff` with zero stats
        for the unchanged-content rename, and `binary: true` with an empty
        `diff` for the binary pair. Error paths: an unseeded revision-diff
        pair -> `404`; an unseeded content-diff address pair -> `404`;
        invalid hex -> `400`; a non-numeric revision number -> `400`; an
        unknown repository -> `404`. Process killed and confirmed stopped
        (`ps` empty, follow-up curl connection-refused).

      **Real-server validation, 2026-09-30** (same live demo stack tasks
      1/2/5 validated -- `epic-lore-authz`'s `demo/`, already running; no
      source file in that repo modified). This repo's own vendored
      `thin_client/v1/{thin_client,model}.proto` were `docker cp`'d into the
      demo's `tools` container (verbatim, not edited -- same mechanism task 5
      used for `lock.proto`) since the container's `/loreprotos` had an empty
      `lore/thin_client/v1/` directory. Logged in via the documented real
      flow (`StartAuthSession` -> browser leg -> `GetAuthSession`) and
      exchanged for a multiresource token scoped to the two repositories
      tasks 1/2/5 already seeded (`ExchangeUserTokenForMultiresourceToken`,
      no `epic-lore-authz` source touched).

      **(a) `RevisionDiff` is reachable, authenticated, and returns
      well-formed responses -- proven, not assumed:**
      - Confirmed via `grpcurl` that `RevisionDiff` needs the same
        `repositoryHeaders()` metadata every other `RevisionService`/
        `ThinClientService` RPC does: `PermissionDenied: Unauthorized` with a
        valid bearer token but no such metadata, succeeds once attached.
      - **New finding, refining task 1/2's edge-case note:** tip-vs-tip
        (`number = 0`) `RevisionDiff` on a genuinely zero-revision branch
        does **not** error the way `RevisionTree`/`RevisionInfo` do on the
        same edge case (`[invalid_argument] Cannot get the tree of a zeroed
        revision`, `[internal] file not found: metadata key`) -- it returns a
        real `200`-shaped stream with a degenerate all-zero header (the
        echoed `identifierFrom.branchId` is all-zero, not even the requested
        branch id) and an empty `changes` array. A third, distinct way this
        API surface handles "no revisions exist yet," on top of the two task
        1/2 already found -- flagged, not smoothed over.
      - Explicit non-tip lookup (`number = 1`) on the same zero-revision
        branch correctly returns a real `NotFound: Revision ...@1 not found`
        -- confirmed our `grpc.ts` `isNotFound()` mapping handles it, and
        confirmed live through the **actual BFF HTTP route** (not just
        `grpcurl`, via a temporary, git-reverted transport-level
        bearer-token interceptor, same precedent as tasks 1/2/5): `GET
        .../diff/1/1` returned a real `404 {"error":"branch or revision not
        found"}`; `GET .../diff/0/0` returned the real degenerate-header
        `200` above, through the full route/backend/DTO pipeline, not just
        the wire.

      **(b) MAJOR FINDING, not anticipated by `docs/design/api-contract.md`
      (which only flagged `ContentDiff`'s binary-only framing, never that it
      might be unimplemented): `ContentDiff` returns a real gRPC
      `Unimplemented` on this demo build of `lore-server` --
      `"lore.thin_client.v1.ThinClientService.ContentDiff not yet
      implemented"`.** Confirmed stable across repeated calls, including the
      degenerate both-addresses-empty case (which needs no real CAS content
      at all) -- ruling out a transient error. Confirmed the same
      `repositoryHeaders()` requirement applies first (`PermissionDenied`
      without it), then `Unimplemented` once authorized/scoped correctly.
      Confirmed through the **actual BFF HTTP route** too: `GET
      .../content-diff?from=&to=` returned a real, unswallowed `500
      {"code":"12","message":"[unimplemented] lore.thin_client.v1.
      ThinClientService.ContentDiff not yet implemented"}` -- the honest
      failure, not papered over. **This is a different, more fundamental gap
      than task 2's known CAS-write limitation**: task 2's gap is "we can't
      manufacture real revision content to test against"; this one is "the
      RPC this task's entire text/binary-diff feature depends on is not
      served by this build of `lore-server` at all," so even real CAS
      content would not make `ContentDiff` work against this demo stack
      today. The temporary interceptor (`DIFFTEST_BEARER_TOKEN`, `grpc.ts`
      transport-level) was fully reverted -- confirmed absent by `grep`
      across `apps/`/`packages/` after a clean `pnpm -r run build`.

      **What is proven vs. not, stated plainly:** the fixture backend and
      the full BFF/web pipeline (routes, DTOs, the unified-diff parser, the
      side-by-side view, the honest binary/truncated/rename/linked-repository
      cards) are built, typecheck/lint/build clean, and verified end-to-end
      against realistic fixture data covering every scoped case. Against the
      real server: `RevisionDiff` is proven reachable, correctly
      authenticated/scoped, and correctly handled for both its edge cases
      (zeroed-tip and not-found) through the real BFF route. `ContentDiff` --
      the half that actually produces diff *text* -- is proven **not
      callable at all** against this demo build, independent of and prior to
      the content-availability question task 2 already flagged. Side-by-side
      text-diff rendering is therefore verified only against fixture data;
      it cannot be verified live until either this demo stack's
      `lore-server` build implements `ContentDiff`, or a build that does
      becomes reachable. Stays `[~]`, not `[x]`: re-run this task's live
      `ContentDiff` check the moment a `lore-server` build implementing it is
      reachable, and flip to `[x] [verified-e2e]` (or correct the assumptions
      above) based on what that shows.
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
- [x] [verified-e2e] 5. Lock management across all branches, via `urc.lock`.
      Implemented: BFF routes `GET /api/repositories/:repositoryId/locks?
      branchId=&owner=&description=` (list, omitting `branchId` spans every
      branch -- the task's "across all branches"), `POST
      /api/repositories/:repositoryId/locks` (acquire, `LockService.Lock`),
      `DELETE /api/repositories/:repositoryId/locks` (release,
      `LockService.Unlock`) -- `apps/bff/src/routes/locks.ts`. `LoreBackend`
      (apps/bff/src/backend/types.ts) extended with `queryLocks`/
      `acquireLock`/`releaseLock`, implemented in both `backend/fixture.ts`
      (a genuinely mutable in-memory lock store -- the first fixture
      collection in this repo that acquire/release actually mutate, not
      static seed data) and `backend/grpc.ts` (real `LockService` client,
      `repositoryHeaders()` metadata reused from task 1). New
      `packages/api-types/src/lock.ts`: `LockResourceDto`/`LockDto`/
      `LockListResponseBody`/`LockAcquireRequestBody`/
      `LockAcquireResponseBody`/`LockReleaseRequestBody`/
      `LockReleaseResponseBody`. Web side: `useLocksQuery`/
      `useAcquireLockMutation`/`useReleaseLockMutation` (TanStack Query,
      apps/web/src/queries/lore.ts), a pure grouping/sorting module
      (`apps/web/src/locks/group-locks.ts`, one group per branch sorted by
      branch name, each group's locks sorted newest-locked-first) with 5
      passing vitest unit tests (group-by-branch, within-group sort,
      lockedAt-tie-break, unknown-branch fallback, empty-list), and a new
      deep-linkable route `/repositories/:repositoryId/locks`
      (`apps/web/src/routes/repository-locks.tsx`) with an acquire form
      (branch select + description + hex hash input, client-side hex
      validation via `isHexBytes` before the request) and a release button
      per lock row, linked from the branch list page. Deliberately out of
      scope, per this task's brief: `LockService.Status` (redundant with
      `Query` for this UI) and `AdminLock` (locking on another user's
      behalf) -- the API contract study flagged `AdminLock`'s authorization
      gating as an open question this study didn't resolve, and task 8
      (auth) hasn't landed to make that gating meaningful yet. No diffs, no
      auth, no notifications here -- those are other v1 tasks.

      **Three real findings made building this, none anticipated by
      docs/design/api-contract.md:**

      1. **`urc.lock.Resource` carries no repository id at all** (verified
         against `proto/vendor/lore/lock.proto`) -- confirmed live
         (docker-compose demo stack, 2026-09-30, `grpcurl` against this
         repo's own vendored `lock.proto`) that `LockService` needs the
         exact same `repositoryHeaders()` gRPC metadata
         (`urc-repository-id-bin`/`lore-partition-bin`) task 1 found for
         `RevisionService`/`ThinClientService`: `Query` returned
         `PermissionDenied: Unauthorized` with a valid bearer token but no
         such metadata, and succeeded (correctly scoped to the named
         repository) once attached. `grpc.ts` attaches it to all three lock
         RPCs.
      2. **The real server's `Lock` does NOT error on an already-locked
         resource**, contradicting `lock.proto`'s own doc comment ("errors
         if already locked"): confirmed live that re-locking an
         already-locked resource returns a successful response with an
         empty `locks` array, not an error. `grpc.ts`'s `acquireLock`
         returns whatever the server gives back as-is (including empty) --
         not translated into a thrown error, since that would invent
         behavior the real server doesn't have. The fixture backend's
         `ConflictError`-on-relock (409) is therefore a deliberate fixture
         simplification of what the proto *claims*, not a proven
         real-server behavior.
      3. **The real server's `Unlock` DOES error on a resource with no
         existing lock**, also contradicting `lock.proto`'s own doc comment
         ("no-ops if no lock exists"): confirmed live it returns a real
         `NotFound: lock does not exist` error. `grpc.ts`'s `releaseLock`
         catches this (the same `isNotFound` helper this file already uses
         for `getRepository`/`getRevisionInfo`) and returns `[]`, so this
         backend still honors `LoreBackend.releaseLock`'s documented no-op
         contract despite the real wire behavior differing from the proto's
         doc comment.
      4. **A `Resource.hash` shorter than 32 bytes is silently zeroed by the
         real server, not rejected or preserved** -- locking a resource with
         a 20-byte arbitrary hash returned (and `Query` later echoed) an
         all-zero 32-byte hash instead; a real 32-byte (sha256-length) hash
         was preserved verbatim. Undocumented in `lock.proto`. The web UI's
         acquire form does not currently resolve a file's real CAS hash from
         the tree automatically (task 3/4's tree-address plumbing is a
         separate concern) -- a user must supply a real 32-byte hex hash by
         hand (e.g. copied from a `tree` route's `address.hash`) for the
         lock to mean anything; a shorter or malformed value silently
         succeeds against the real server but locks the wrong (zeroed)
         resource identity. Flagged here rather than silently worked around.

      Evidence (real commands, run 2026-09-30):
      - `pnpm -r run typecheck`/`lint`/`build`: all exit 0 across all 4
        workspaces.
      - `pnpm --filter @epic-lore-webui/web run test`: 8/8 pass (5 new
        `group-locks.test.ts` + the 3 pre-existing `lane-assignment.test.ts`).
      - Fixture mode (`PORT=3201 LORE_BACKEND=fixture`): curled every route.
        `GET .../locks` (no filter) showed the pre-seeded `release/1.0` lock
        (cross-branch listing with zero UI interaction); `POST .../locks`
        acquiring a new resource on `main` returned `201 Created`;
        `GET .../locks?branchId=<main>` showed only that branch's lock;
        re-`POST`ing the identical resource returned `409 Conflict`
        (`"resource already locked"`); `DELETE .../locks` released it,
        confirmed gone from a follow-up `GET`; releasing again returned
        `200` with `{"resources":[]}` (no-op, per the fixture's documented
        contract); invalid hex (`"not-hex!"`) returned `400`; an unknown
        repository id returned `404`; repo 2's locks stayed empty throughout
        (no cross-repository leakage). Process killed and confirmed dead
        (`ps` empty, follow-up curl connection-refused).
      - **Real-server validation** against the same live demo stack tasks
        1/2 validated (`epic-lore-authz`'s `demo/`, docker-compose, already
        running; no source file in that repo modified -- only its documented
        admin/login flows and a real `BranchCreate` call were used to seed a
        second branch, exactly mirroring how task 1/2 seeded a second
        repository). Proved live via `grpcurl` against this repo's own
        vendored `lock.proto` (copied into the demo's `tools` container with
        `docker cp`, not edited): `Query` without repository metadata ->
        `PermissionDenied`; with metadata -> succeeds; `Lock` on a fresh
        branch + a second, newly-created branch, then `Query` with no
        `branch` filter returned **both** locks spanning **both** real
        branches -- direct proof of "across all branches"; `Query` filtered
        to one branch returned only that branch's lock; `Unlock` released
        both, second `Unlock` returned real `NotFound`.
      - **Then re-ran the fixed code through the actual BFF HTTP routes**
        (not just `grpcurl`), using a temporary, git-reverted
        transport-level bearer-token interceptor (`LOCKTEST_BEARER_TOKEN`,
        stands in for task 8's unbuilt token sourcing -- confirmed removed
        by `grep` across source and a clean rebuild before finishing, same
        precedent as task 1's validation): `GET /api/repositories/<demo-repo>
        /locks` returned both real locks with correct hex ids and decimal-
        string ms timestamps, spanning the two real branches; `POST
        .../locks` with a real 32-byte hex hash returned `201` and the lock
        was visible in a follow-up `GET`; `DELETE .../locks` released it
        (`200`); releasing again returned `200` with `{"resources":[]}` --
        proving the `NotFound`-to-no-op fix (finding 3 above) works through
        the real HTTP route, not just at the gRPC layer. A final boot with
        **no** bearer token at all returned a real, unswallowed
        `[unauthenticated] authorization header required` (`500`) --
        honestly surfaced, matching this task's brief on write-path error
        handling without task 8's auth. All live test locks were released
        and the temporary branch left in place (harmless, matches task 1/2's
        precedent of leaving seeded demo data); the interceptor was reverted
        (`grep -rn LOCKTEST apps/ packages/` clean after a full rebuild) and
        every BFF process started during validation was killed and confirmed
        dead (`ps` empty after each). The `epic-lore-authz` demo stack itself
        was left running, untouched.
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
