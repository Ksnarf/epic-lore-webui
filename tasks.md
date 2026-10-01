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
- [x] [verified-e2e] 8. Okta auth via `epic-lore-authz` (SP-initiated web
      login; IdP-initiated Okta-tile entry NOT built -- see "Not done"
      below). Built per `docs/design/api-contract.md` section 3, Option A:
      the BFF plays the CLI's role against `epic-lore-authz`'s EXISTING,
      **unmodified** `UrcAuthApi` (`StartAuthSession`/`GetAuthSession`/
      `ExchangeUserTokenForMultiresourceToken`) -- zero changes to
      `epic-lore-authz`.

      **CORRECTION to this task's own prior entry above:** that entry
      concluded "blocked" on `ExchangeExternalTokenForUserToken` being an
      unimplemented stub. That RPC is part of a DIFFERENT design (Option B
      in `api-contract.md` section 3: the BFF doing its own OIDC exchange
      and minting a token directly from an external IdP token) that this
      implementation does not use and never needed. Option A -- the BFF
      calling `StartAuthSession`/`GetAuthSession` exactly the way the `lore`
      CLI already does (`epic-lore-authz`'s own `docs/architecture.md`,
      "Human login flow (OIDC), end to end") -- was always fully buildable
      with zero `epic-lore-authz` changes: that Phase 1b flow is
      implemented and production-tested upstream (`epic-lore-authz`
      README.md's "Status" section: "Phase 1b ... is implemented and tested
      against real Dex"). The prior entry's "blocked" conclusion was a
      misread of which option `api-contract.md` actually recommended, not a
      real upstream gap. The IdP-initiated-tile half of this task's title
      (section 3's problem 2, a distinct, harder problem needing its own
      new acceptance path on `epic-lore-authz`) remains correctly
      unbuilt -- see "Not done" below -- but SP-initiated web login was
      never blocked.

      **Login-completion UX decision:** `epic-lore-authz`'s browser-facing
      flow ends on its own static "you are signed in, close this tab" page
      (`lore-authz-server/src/http.rs`'s `login_done`), with no redirect
      back into any app -- by design, and not something this task may
      change. A same-tab `GET /login` redirect therefore cannot return
      control to the UI. Fix: the web app's sign-in screen opens `/login`
      in a SEPARATE window (`window.open`) and keeps the original tab on a
      "waiting for sign-in" screen that polls `GET /api/auth/status`; the
      BFF's status route itself calls `GetAuthSession` on each poll (the
      same polling role a CLI already plays) and mints the session cookie
      the moment it resolves. Proven live, including the genuine
      still-pending state (not just success): see log.log for the full
      command/response trail.

      **Per-request token plumbing:** two different bearer tokens,
      confirmed live which RPCs need which (`apps/bff/src/auth/
      authz-client.ts`'s doc comment) -- the session's own AuthN token
      (from `GetAuthSession`) for `RepositoryService.RepositoryList`/
      `RepositoryGet` (confirmed live these need no resource scoping), and
      a per-repository AuthZ token (`ExchangeUserTokenForMultiresourceToken`,
      resource id `urc-<hex repository id>`, cached per `(userId,
      resourceId)`) for every `RevisionService`/`ThinClientService`/
      `LockService` call, all of which return `PermissionDenied` with the
      plain session token. `LoreBackend` (`apps/bff/src/backend/types.ts`)
      grew a trailing optional `authToken` on every method; route handlers
      (`apps/bff/src/routes/*.ts`) source it from `request.auth`
      (`apps/bff/src/auth/request-context.ts`), decorated onto every
      request by a new `onRequest` hook in `server.ts`.

      **Built:** encrypted (AES-256-GCM, Node `node:crypto`, no new
      dependency) `HttpOnly`/`SameSite=Lax` session cookie holding the
      `UserToken`, keyed by a new `SESSION_SECRET` env var (name only,
      required when `LORE_BACKEND=grpc`, auto-ephemeral in fixture mode);
      `GET /login`, `GET /logout`, `GET /api/auth/status`
      (`apps/bff/src/routes/auth.ts`); an `onRequest` auth gate that 401s
      every unauthenticated `/api/*` call in `grpc` mode and leaves
      `fixture` mode fully auth-optional (deliberate v1 scope decision --
      fixture mode exists precisely so the app runs with zero external
      dependencies, including `epic-lore-authz`); `PermissionDenied`/
      `Unauthenticated` `ConnectError`s now map to real `403`/`401`
      (`apps/bff/src/backend/errors.ts`, `grpc.ts`'s `mapAuthError`) instead
      of a raw 500, now that auth is real; web sign-in screen
      (`apps/web/src/routes/sign-in.tsx`), signed-in indicator + logout in
      the shell (`apps/web/src/components/page-shell.tsx`), and a global
      401 -> redirect-to-`/sign-in` handler
      (`apps/web/src/api/lore-client.ts`).

      **Verified live** (demo stack, BFF in `LORE_BACKEND=grpc`, zero
      shims/hand-injected tokens anywhere -- see log.log for full
      command/response evidence): unauthenticated `/api/*` -> real `401`;
      `GET /login` -> real `302` to `epic-lore-authz`'s `login_url` +
      login-attempt cookie set; followed that URL through the REAL Dex mock
      connector (`curl -L`, no credentials, exactly how `demo/scripts/
      verify.sh` drives it) -> landed on `epic-lore-authz`'s own
      unmodified "you are signed in" page; polled `/api/auth/status` with
      the same cookie jar -> real minted session, login-attempt cookie
      cleared; separately proved the PENDING poll path is genuine (two
      polls against a not-yet-followed `login_url` both returned
      `pending:true` from a live `GetAuthSession` call, then flipped to
      authenticated once that login completed); with the real session:
      `GET /api/repositories` returned both real demo repos; `GET
      .../branches` returned the real branch (per-repository AuthZ
      exchange working); `POST`/`GET`/`DELETE .../locks` acquired, listed,
      and released a real lock attributed to `owner: "af862d98-..."` --
      the actual logged-in user's real id, not a fixture/hardcoded
      owner, closing the loop task 5 could only test with a temporary
      `LOCKTEST` bearer-token interceptor; `GET /logout` cleared both
      cookies and the next `/api/repositories` correctly 401'd again; a
      garbage/tampered session cookie was rejected cleanly (401, no crash)
      and a garbage login-attempt cookie was treated as unauthenticated
      (200, not an error). `pnpm -r typecheck`/`lint`/`build` all exit 0
      (5/5 workspaces incl. the newly-added `apps/bff` test runner);
      `apps/bff` vitest 11/11 pass (new: AES-GCM round-trip/tamper/
      wrong-secret tests, session/login-attempt cookie round-trip +
      expiry tests -- pure logic, no network); `apps/web` vitest 14/14
      pass (pre-existing suites unaffected).

      **Not done / unproven, named honestly:**
      - IdP-initiated Okta-tile entry (this task's own title) is genuinely
        not built -- `api-contract.md` section 3's problem 2 is real and
        was correctly never attempted here: it needs a second, separate
        acceptance path on `epic-lore-authz` itself (Okta's third-party-
        initiated-login pattern), which is that project's own scope and
        security review, not something addable from the BFF side alone.
      - `PermissionDenied` -> `403` mapping (`grpc.ts`'s `mapAuthError`) is
        code-level only, not re-verified live this session: no repository
        existed in the demo stack where the logged-in test user is
        authenticated but ungranted, to trigger it for real (the same
        mock IdP user holds `admin` on both seeded demo repos from task
        1/5's validation). `Unauthenticated` -> `401` from a live
        server-side rejection (as opposed to the BFF's own local
        expired/absent-session check) was likewise not separately forced.
      - CSRF: the mutating lock routes rely on `SameSite=Lax` cookies (a
        cross-site fetch/POST does not carry a `Lax` cookie at all) as
        their CSRF defense; `@fastify/csrf-protection` stays registered but
        unused, as it was before this task -- not wired to any route.
      - IdP-side MFA/step-up, token refresh, and multi-user concurrent
        sessions were not exercised (the demo stack's Dex mock connector
        has exactly one fixed identity, no password, no MFA).
- [x] [verified-e2e] 9. Permissions view backed by `epic-lore-authz`
      roles/grants. API contract study (`docs/design/api-contract.md`
      section 4): a "my permissions" view is fully supported today via
      `CheckUserPermission`/`LookupUserPermissions` (self-service, no
      `ADMIN_API_TOKEN` needed). An admin-view (viewing/managing *other*
      users' grants) has no self-service API -- only the
      `ADMIN_API_TOKEN`-gated `/admin/v1` surface, which the UI must never
      embed. Recommended path: the BFF holds `ADMIN_API_TOKEN` server-side
      and gates access to its own admin-proxy routes using
      `CheckUserPermission` against a convention this UI defines (e.g.
      `admin` on the `urc-*` wildcard resource).

      **Layering decision:** permissions come entirely from
      `epic-lore-authz`'s `UrcAuthApi`, never `lore-server`
      (api-contract.md section 4 confirms no `lore-server` RPC is involved
      at all) -- so fixture/real parity lives in the auth layer
      (`apps/bff/src/auth/{authz-client,permissions-client,admin-client,
      admin-gate}.ts`), NOT `LoreBackend`, which stays `lore-server`-only.

      **Scope decision: both self-service AND the admin view were built.**
      The admin view is buildable+testable now, confirmed live this
      session (not assumed): the already-running demo stack's raw admin
      HTTP surface (`http://localhost:18080/admin/v1/**`, the demo's
      `DEMO_AUTHZ_HTTP_PORT`) answered real `GET /admin/v1/principals` and
      `GET /admin/v1/grants` with its committed demo `ADMIN_API_TOKEN`; the
      real logged-in demo user already holds two seeded `admin` grants
      (`urc-0194b726b34e72b0b45550b88a967076`,
      `urc-d1462510def162d8a0b29da98735d30e`) from this stack's own
      history, closing the loop on whether "view other users' grants" has
      real data to show. Per this task's fail-closed requirement, the admin
      routes are OFF unless `ADMIN_API_TOKEN` is actually set --
      `apps/bff/src/server.ts` only calls `registerAdminRoutes` inside an
      `if (config.adminApiToken)` block, so an unset token means
      `/api/admin/*` is never REGISTERED (a real `404`), not a route that
      exists but denies.

      **Built:** `packages/api-types/src/permission.ts`
      (`ResourcePermissionDto`/`MyPermissionsResponseBody`/`AdminUserDto`/
      `AdminUsersResponseBody`/`AdminGrantDto`/`AdminUserGrantsResponseBody`).
      `apps/bff/src/auth/authz-client.ts` grew `lookupUserPermissions`
      (paginates `LookupUserPermissions` via `next_page_token`, capped at
      50 pages) and `checkUserPermission` (single `CheckUserPermission`
      call), both using the session's own AuthN token -- confirmed live
      this needs no per-repository AuthZ exchange, same as
      `RepositoryList`/`RepositoryGet`. `apps/bff/src/auth/admin-gate.ts`
      (pure, unit-tested): this UI's own "`admin` on the `urc-*` wildcard
      resource" convention. `apps/bff/src/auth/permissions-client.ts`:
      `PermissionsClient` (`lookupMyPermissions`/`checkAdminGrant`),
      selected `grpc`-vs-`fixture` the same way `LoreBackend` already is in
      `server.ts`; the fixture implementation's canned data uses the SAME
      two resource ids `apps/bff/src/backend/fixture.ts`'s `REPO_LORE_ID`/
      `REPO_WEBUI_ID` produce, so fixture mode's resource-id -> repository-
      name join in the UI demonstrates working end to end, not just
      "returns something." `apps/bff/src/auth/admin-client.ts`:
      `AdminClient` (`listUsers`/`listGrantsForUser`) wrapping the raw
      `/admin/v1/principals`/`/admin/v1/grants` `GET`s (no `POST`/`DELETE`
      of any kind -- this task only ever reads), plus a fixture
      implementation. `apps/bff/src/routes/permissions.ts` (`GET
      /api/permissions/me`, always registered) and
      `apps/bff/src/routes/admin.ts` (`GET /api/admin/users`, `GET
      /api/admin/users/:userId/grants`, each request re-checking
      `checkAdminGrant`, `403` on failure -- registered only when
      `ADMIN_API_TOKEN` is set, wired from `apps/bff/src/server.ts`).
      `apps/bff/src/config.ts` grew `ADMIN_API_TOKEN` (optional, unset by
      default) and `ADMIN_AUTHZ_HTTP_ADDR` (default `localhost:18080`,
      matching the demo's `DEMO_AUTHZ_HTTP_PORT`). Web:
      `apps/web/src/permissions/format.ts` (pure, unit-tested):
      resource-id -> repository-name join against already-fetched `GET
      /api/repositories` data, falling back honestly
      ("All repositories"/"Other resource" in Artist, raw id in Developer)
      when unknown -- never a fabricated name; permission-string ->
      friendly label (`admin`/`write`/`read` -> "Full control"/"Can
      edit"/"Can view"). `apps/web/src/routes/permissions.tsx` (route
      `/permissions`, always reachable, both profiles) and
      `apps/web/src/routes/admin-permissions.tsx` (route
      `/admin/permissions`, Developer-profile only -- Artist sees an
      explanatory note, same profile-gated-panel pattern task 11
      established -- renders a real, distinguishable `404`
      "admin proxy not enabled" vs. `403` "you lack the admin grant" via a
      newly-exported `ApiError.status`, `apps/web/src/api/lore-client.ts`).
      `apps/web/src/components/page-shell.tsx` grew a persistent
      "My permissions" link (always) and an "Admin" link (Developer
      profile only), reachable from every route with zero per-route
      wiring, same convention `ProfileToggle`/`AuthIndicator` already use.

      **Verified live** (already-running demo stack, read-only inspection
      only -- no writes to `epic-lore-authz`'s database or source, see
      log.log for the full command/response trail): real login (the same
      `StartAuthSession` -> follow `login_url` through the real Dex mock
      connector -> `GetAuthSession` sequence task 8 proved, via `grpcurl` +
      `curl`) produced a real session for the real demo user (`af862d98-...`,
      "Kilgore Trout"); direct `grpcurl` calls BEFORE writing any BFF code
      confirmed `LookupUserPermissions(resource_filter="")` returns that
      user's real 2 seeded `admin` grants and `CheckUserPermission(["urc-*"])`
      correctly DENIES (no wildcard grant provisioned in this demo); with
      the BFF running in `LORE_BACKEND=grpc` (`SESSION_SECRET` set,
      `COOKIE_SECURE=false`) and the real session cookie: unauthenticated
      `GET /api/permissions/me` -> real `401`; authenticated ->
      `{"permissions":[{"resourceId":"urc-0194b726b34e72b0b45550b88a967076",
      "permission":["admin","read","write"]},{"resourceId":"urc-d1462510def162d8a0b29da98735d30e",
      "permission":["admin","read","write"]}]}` -- byte-identical in shape
      to the direct `grpcurl` call, through the real BFF route; with
      `ADMIN_API_TOKEN=<value from epic-lore-authz demo compose, redacted here>` and
      `ADMIN_AUTHZ_HTTP_ADDR=localhost:18080` also set, the SAME real
      session hit `GET /api/admin/users` and got a real, live `403`
      (`"forbidden: admin grant required..."`) -- proving the gate's deny
      path end to end, since this real user holds specific-repository
      `admin` grants but no `urc-*` wildcard grant; separately, the actual
      compiled `createAuthzAdminClient` (not a curl equivalent -- the real
      module, invoked directly, bypassing only the route's own gate)
      called the live demo's `/admin/v1/principals` and
      `/admin/v1/grants` and correctly mapped both real responses,
      confirming the admin-proxy's HTTP mechanics work end to end against
      live data. Fixture mode (`LORE_BACKEND=fixture`): `GET
      /api/permissions/me` returned the 2 canned fixture-repo entries,
      matching `GET /api/repositories`'s real fixture repo ids exactly (the
      name-join demonstrated, not just plumbed); with
      `ADMIN_API_TOKEN=fixture-admin-token` set, `GET /api/admin/users` and
      `GET /api/admin/users/fixture-user/grants` both returned real canned
      data through the full route/gate/client stack (fixture mode's
      `checkAdminGrant` always allows, matching task 8's "fixture mode has
      no auth concept at all" precedent); with `ADMIN_API_TOKEN` unset
      (the default), `GET /api/admin/users` -> real `404`
      (`{"error":"not found"}`), proving the fail-closed-by-absence
      behavior, not just a documented intention. `pnpm -r run
      typecheck`/`lint`/`build` all exit 0 (4/4 workspaces); `apps/bff`
      vitest 31/31 pass (5 new: `admin-gate.test.ts`); `apps/web` vitest
      57/57 pass (12 new: `permissions/format.test.ts`). All test BFF
      processes (ports 3601-3604) killed and confirmed dead (`ps` empty,
      every port connection-refused) afterward; `epic-lore-authz`'s demo
      stack confirmed still running/healthy and its grants table
      byte-identical before and after this session (same 2 grant ids,
      re-`curl`ed at the end).

      **Not done / honestly named:**
      - The admin gate's ALLOW path (a caller who genuinely holds `admin`
        on `urc-*`) is NOT proven live end-to-end through the gate itself
        -- no principal in this demo stack holds that wildcard grant, and
        provisioning one would mean writing to the demo's database, which
        this task deliberately avoided (per standing instructions: demo
        stack read-only inspection only). It is proven via (a) unit tests
        on the pure gate logic (`admin-gate.test.ts`, both allow and deny
        cases), (b) the fixture path exercising the identical route/gate/
        client code end to end with a gate that always allows, and (c) the
        real `createAuthzAdminClient` proven live directly (bypassing only
        the gate). A real deployment would provision the wildcard grant via
        one `POST /admin/v1/grants` call against the same admin API the
        proxy itself already calls through -- no new `epic-lore-authz`
        capability needed.
      - `/admin/v1/grants` has no server-side filter by principal
        (confirmed against `lore-authz-server/src/admin/mod.rs`'s route
        table -- `list_grants` takes no query extractor), so
        `listGrantsForUser` fetches the full, `admin::LIST_LIMIT`-bounded
        list and filters client-side; fine at this demo's scale, a real
        concern only at a principal/grant count near that limit.
      - No principal/group/resource/grant management (create/suspend/
        delete) was built -- this task's brief was "view," and the BFF
        proxy here issues only `GET`s against `/admin/v1/**`.
- [ ] 10. Live notifications via `lore.notification.NotificationService`
      (corrected from `urc.notification`: API contract study,
      `docs/design/api-contract.md` section 1 feature 10, confirms
      `lore-server`'s live gRPC handler implements the `lore.notification`
      package from `lore_notification.proto`, not the legacy
      `urc.notification` package from `notification.proto`). Server-streaming
      only, scoped per-repository -- grpc-web-compatible if that transport
      were chosen, and straightforwardly proxyable by the BFF (recommended
      transport, see pre-work stack decision) via SSE/WebSocket.
- [x] [verified-e2e] 11. [ux] Dual profile: Developer view vs. Artist
      (simplified) view. API contract study (`docs/design/api-contract.md`
      section 11): "not an API concern -- UI-side view composition over the
      same RPCs already listed," no proto gap. Stack decision doc
      (`docs/design/stack-decision.md`, "Components"): "not a fork of the
      UI" -- a capability-flag plus layout layer over the one component set,
      deciding which panels show and how dense/labeled they are. Built
      exactly that: no new routes, no BFF/DTO changes, no second component
      tree.

      **State + persistence:** `profile: "developer" | "artist"`
      (`apps/web/src/store/ui-store.ts`, pre-existing stub from the
      stack-decision scaffold) wrapped in `zustand/persist`
      (`partialize`-scoped to `profile` only -- file-tree expansion state
      stays unpersisted, unchanged from today). Persisted to `localStorage`
      under `epic-lore-webui.ui-profile`: tasks.md's own task 11 line never
      specified a mechanism, and this is a durable per-browser preference,
      not a per-session one, so `localStorage` over `sessionStorage` was the
      interpretation call made here. No new dependency -- `zustand/persist`
      is a subpath of the already-installed `zustand` package.

      **Pure, testable display layer:** `apps/web/src/profile/format.ts`
      (`shortHex`/`revisionLabel`/`showsTechnicalDetail`/`formatByteSize`/
      `relativeTimeFromNow`/`formatLockTimestamp`) and
      `apps/web/src/profile/placeholder.ts` (`colorForLabel`/
      `fileExtensionLabel`) -- no React/DOM/store import in either, same
      convention as `graph/lane-assignment.ts`/`locks/group-locks.ts`/
      `diff/unified-diff.ts`, with 26 new vitest unit tests
      (`format.test.ts` 16, `placeholder.test.ts` 10) covering both
      profiles' formatting, edge cases (empty/non-numeric/short strings),
      and the relative-time ladder (minutes/hours/days/future-skew).

      **A single switcher, mounted once:** `apps/web/src/components/
      profile-toggle.tsx`, a 2-option `radiogroup` wired to the store,
      mounted in `apps/web/src/components/page-shell.tsx`'s shared header
      -- present on every `PageShell`-based route (all of them except
      `sign-in.tsx`) with zero per-route wiring. Switching profiles only
      ever calls `setProfile`; it never touches the router, so deep links
      resolve identically in both profiles (same route, same data, same
      selection) -- only presentation differs, per this task's own
      constraint.

      **What Developer keeps (unchanged from pre-task-11 behavior):** exact
      byte counts in the file tree; `#<number> <12-char hex signature>` in
      the revision list; the full multi-lane SVG branch graph in history;
      raw CAS content-address hex in the diff view's binary-file card; the
      lock-acquire form's raw 32-byte hex hash input; ISO-instant lock
      timestamps.

      **What Artist hides/demotes, and why (per this task's design-intent
      brief):**
      - Revision list (`components/revision-list.tsx`): signature hex
        dropped entirely (not just shortened) -- `Revision 12`, not
        `#12 a1b2…`. A content hash is not an identity a non-technical user
        needs.
      - Branch history (`routes/branch-history.tsx`): the multi-lane SVG
        graph is hidden outright -- exactly the "lane graph detail" this
        task's brief names -- replaced with a one-line honest note
        ("switch profiles to see it"), not removed functionality.
      - Diff view (`components/diff-view.tsx`): the binary-file card's raw
        `contentFrom`/`contentTo` hex is replaced with a shared, consistent
        note (`format.ts`'s `HIDDEN_TECHNICAL_DETAIL_NOTE`); the actual
        text-diff hunks (real file content, not technical chrome) render
        identically in both profiles.
      - File tree (`components/file-tree.tsx`): byte counts become
        human-scaled (`512 B`/`2.0 KB`/`5.0 MB`); each file also gets an
        honest placeholder swatch (`profile/placeholder.ts`'s
        `colorForLabel`/`fileExtensionLabel`, a deterministic
        color+extension derived from the real path) -- explicitly NOT a
        thumbnail, since task 4 (asset preview) is unbuilt and there is no
        real image data to show; the swatch's `title` says so outright.
      - Locks (`routes/repository-locks.tsx`, this task's "who's working on
        what front and center" ask): lock rows re-order to owner-first,
        description-second; timestamps become relative
        (`formatLockTimestamp`, e.g. "2 hours ago") instead of ISO instants.
        The acquire-lock form is hidden entirely, replaced with an honest
        note directing the user to Developer view -- a deliberate
        functionality cut, not an oversight: task 5's own finding 4 is that
        the real server silently zeroes a hash shorter than 32 bytes
        instead of rejecting it (locking the wrong resource with no error),
        and resolving a real hash from the file tree automatically is
        out of this task's scope (task 5's note). Release needs no typed
        hash (it's read from the already-loaded lock), so it stays
        available in both profiles.
      - Repository branches (`routes/repository-branches.tsx`): the
        existing small "View locks" text link becomes a bordered, more
        prominent callout ("See who's working on what →") one step earlier
        in the navigation flow -- same link, same route, just elevated.

      **Design decisions, recorded per this task's "no AI-default slop"
      discipline:** no new UI library (the toggle, swatches, and relative-
      time formatting are plain Tailwind + native `Intl.RelativeTimeFormat`,
      zero new npm dependencies); the swatch palette reuses
      `revision-graph.tsx`'s existing 8-color `LANE_COLORS` set rather than
      inventing a second one, so Developer's graph and Artist's file-tree
      swatches read as one system; motion is a single `transition-colors`
      on the toggle's active segment (ui-motion's Level 1, MOTION_INTENSITY
      1-2 for this internal tool -- state-change feedback only, no
      animation beyond that).

      Evidence (real commands, run 2026-10-01):
      - `pnpm -r run typecheck`/`lint`/`build`: all exit 0 across all 4
        buildable workspaces.
      - `pnpm --filter @epic-lore-webui/web run test`: 40/40 pass (14
        pre-existing + 26 new: `profile/format.test.ts`,
        `profile/placeholder.test.ts`).
      - `pnpm --filter @epic-lore-webui/bff run test`: 11/11 pass,
        unaffected (this task touches no BFF file).
      - **Real interactive verification, not just a static-HTML curl
        check:** installed a local Playwright Chromium (`npm install
        playwright@1.63.0` inside the session's scratchpad directory only
        -- never added to this repo's `package.json`/lockfile), booted the
        real BFF (`PORT=3401 LORE_BACKEND=fixture node apps/bff/dist/
        server.js`, serving the actual `apps/web/dist` production build via
        `@fastify/static`, the same artifact `pnpm -r run build` above
        produced), and drove a real browser against it end-to-end: 22/22
        scripted checks passed -- default profile is Developer; the lane
        graph and hex both disappear on switching to Artist, replaced by
        the honest note; the choice survives a full page reload
        (`localStorage`, not just React state); a direct deep link into the
        diff route works identically and the binary card's hex is hidden
        under the persisted Artist profile; the locks route's acquire form
        disappears under Artist and reappears when switching back to
        Developer; the branches-page locks callout and the file-tree
        swatch render only in Artist; a keyboard-only Tab+Enter reached and
        activated the toggle with a visible focus ring. BFF process killed
        and confirmed dead afterward (`ps` empty, port free, follow-up
        `curl` connection-failed).

      **Honest limits of this verification:** this task touches no BFF/
      route/DTO/proto surface (confirmed by api-contract.md section 11), so
      there was nothing here to validate against the live
      `epic-lore-authz`/`lore-server` demo stack the way tasks 1/2/3/5/8
      did -- fixture-mode data is the correct and sufficient backend for a
      presentation-only feature, not a shortcut taken under time pressure.
      The interactive pass above ran in one local headless Chromium on one
      machine; it was not cross-browser-tested, not tested on a real mobile
      viewport (this repo is desktop-first by design, per
      docs/design/stack-decision.md), and did not re-test every route this
      task touches under Artist profile (e.g. `repository-branches.tsx`'s
      branch list itself, `branch-tree.tsx`'s non-file-tree chrome) --
      the checks above targeted the specific hide/demote/elevate claims
      made in this entry, not an exhaustive click-every-pixel pass.

- [x] [verified-e2e] 11a. Task 11 extension: tie the DEFAULT profile to the
      user's AD-group membership (Okta), built PATH-AGNOSTICALLY -- works
      whether group names eventually arrive via a future authz-minted
      `UserToken` claim (Path A, requirements already sent to the authz
      team, see log.log) or a native Okta/OIDC token directly (Path B
      native migration). Groups are OPTIONAL EVERYWHERE: absent groups ->
      no group default, feature silently inert -- proven, not just
      asserted (see evidence below).

      **Why this is path-agnostic:** the only thing this BFF reads is a
      `groups` claim (configurable name) off the session's `UserToken` JWT
      PAYLOAD (`apps/bff/src/auth/jwt-claims.ts`'s `extractGroupsClaim`) --
      it does not care whether that JWT was minted by `epic-lore-authz`
      (today) or, post-migration, issued directly by an OIDC provider. The
      one deliberate choice this makes, stated precisely: it decodes the
      payload WITHOUT verifying the signature, because today the only
      token it is ever called on arrives over the already-trusted authz
      gRPC channel (`GetAuthSession`) -- this is documented as a trust
      boundary in `jwt-claims.ts`'s doc comment and must not be copied
      as-is onto a path where the token arrives over an untrusted channel
      (e.g. straight from the browser) without adding real signature
      verification first.

      **Built:**
      - `apps/bff/src/auth/jwt-claims.ts` (new): `extractGroupsClaim(jwt,
        claimName)` -- decode-only JWT payload claim read, `string[]`,
        empty on anything malformed/absent/wrong-shaped. 8 vitest cases
        (valid claim, configurable claim name, absent claim, non-array
        claim, mixed-type array filtered to strings only, non-JWT input,
        malformed base64/JSON payload, non-object JSON payload).
      - `apps/bff/src/auth/profile-mapping.ts` (new): `resolveDefaultProfile(groups,
        artistGroups, developerGroups)` -- pure resolution, developer wins
        on both, `null` when neither/no groups/no mapping configured. 7
        vitest cases incl. the both-groups precedence and the
        no-mapping-configured case.
      - `apps/bff/src/config.ts`: `GROUPS_CLAIM` (default `groups`),
        `PROFILE_GROUPS_ARTIST`/`PROFILE_GROUPS_DEVELOPER` (comma-separated
        group names, names only), `FIXTURE_GROUPS` (comma-separated, names
        only) -- all parsed by a shared `parseGroupList` (trim, drop empty
        entries).
      - `apps/bff/src/auth/session.ts`: `SessionPayload.groups?: string[]`
        -- optional, stored encrypted alongside the token, never sent to
        the browser.
      - `apps/bff/src/routes/auth.ts`: on every `GetAuthSession` resolution
        (both a fresh login and -- for symmetry -- a re-poll of an
        already-established session), decodes the groups claim and stores
        it in the session; `GET /api/auth/status` now resolves
        `defaultProfile` from `session.groups` on every call (not just
        once at login), so a `PROFILE_GROUPS_*` config change takes effect
        without forcing a re-login. **Deliberate choice: the raw group
        list itself is never exposed to the browser** -- only the resolved
        `defaultProfile` is, per this task's own instruction to default to
        not exposing it. Also added the **fixture auth path**: when
        `LORE_BACKEND=fixture` AND `FIXTURE_GROUPS` is actually set (both
        conditions) AND there is no real session/login-attempt cookie,
        `/api/auth/status` returns a synthetic authenticated fixture user
        with `FIXTURE_GROUPS` as its groups -- opt-in only, so fixture
        mode's behavior is byte-for-byte unchanged
        (`{"authenticated":false}` with no cookies) when `FIXTURE_GROUPS`
        is unset, matching "groups optional everywhere, feature silently
        inert" for the one env var that is itself optional-by-design.
      - `packages/api-types/src/auth.ts`: new `DefaultProfileDto =
        "developer" | "artist" | null`; `AuthStatusResponseBody` gains
        `defaultProfile?: DefaultProfileDto`, present only when
        `authenticated: true`.
      - `apps/web/src/profile/resolve-profile.ts` (new): pure
        `resolveEffectiveProfile({explicit, serverDefault, fallback})` --
        the three-state rule (explicit user choice > server default >
        today's plain fallback). 5 vitest cases incl. explicit winning
        over a server default both directions, and a `null` server default
        falling through to fallback without erroring.
      - `apps/web/src/store/ui-store.ts`: `profile` is no longer a single
        persisted value -- `explicitProfile` (set ONLY by `setProfile`,
        i.e. a real `ProfileToggle` click) is the only thing persisted
        (`localStorage`, bumped to persist `version: 1` with a `migrate`
        that treats any pre-this-extension persisted shape as "no explicit
        choice recorded" -- see the store's own doc comment for why that
        old value can't be trusted as a real user choice); `serverDefaultProfile`
        (set ONLY by the new `applyServerDefaultProfile` action, from
        `GET /api/auth/status`) is NOT persisted -- re-derived every
        session; the resolved `profile` field every existing
        profile-aware component already reads is recomputed by both
        actions via `resolveEffectiveProfile`, so no consumer needed to
        change. A custom `merge` recomputes `profile` on rehydration too,
        so a returning user with a real explicit choice sees it
        immediately on load.
      - `apps/web/src/components/page-shell.tsx`: new `ProfileDefaultSync`
        (renders nothing), mounted once alongside the existing
        `AuthIndicator`/`ProfileToggle` -- pushes
        `useAuthStatusQuery`'s `defaultProfile` into
        `applyServerDefaultProfile` whenever it changes (that action itself
        no-ops on an unchanged value, so the 30s background poll doesn't
        thrash the store).

      No BFF route/DTO change beyond the one new `defaultProfile` field;
      no new routes; no new npm dependency on either side.

      Evidence (real commands, run 2026-10-01):
      - `pnpm -r run typecheck`/`lint`/`build`: all exit 0 across all 4
        buildable workspaces.
      - `pnpm --filter @epic-lore-webui/bff run test`: 26/26 pass (15 new:
        8 `jwt-claims.test.ts` + 7 `profile-mapping.test.ts`; existing
        `crypto`/`session` suites unaffected).
      - `pnpm --filter @epic-lore-webui/web run test`: 45/45 pass (5 new
        `resolve-profile.test.ts`; all 40 pre-existing suites unaffected).
      - **Fixture-mode e2e, exactly per this task's validation brief:**
        booted the real BFF (`PORT=3501 LORE_BACKEND=fixture
        FIXTURE_GROUPS="design-team" PROFILE_GROUPS_ARTIST="design-team"
        PROFILE_GROUPS_DEVELOPER="tools-team"`) and curled
        `GET /api/auth/status` -> `{"authenticated":true,"userId":
        "fixture-user","userName":"Fixture User","defaultProfile":"artist"}`
        -- the exact outcome the brief asked to prove. Process killed,
        confirmed dead (`ps` empty, follow-up curl connection-refused).
        Also proved, same mechanism: both-groups-configured ->
        `defaultProfile:"developer"` (developer-wins precedence, live, not
        just unit-tested) on a second boot (port 3502, killed/confirmed
        dead); and, critically, **`FIXTURE_GROUPS` unset ->
        `{"authenticated":false}`**, byte-identical to this route's
        pre-this-task behavior (port 3503, killed/confirmed dead) --
        proving the feature is genuinely inert, not just defaulting to a
        harmless value, when the operator hasn't opted in.
      - **Real built-artifact verification, not just a curl check:** reused
        a local Playwright Chromium already present in this session's
        scratchpad (from task 11's own prior verification pass), booted
        the real BFF serving the actual `apps/web/dist` production build
        (`PORT=3504`, same `FIXTURE_GROUPS`/`PROFILE_GROUPS_ARTIST` as
        above), and drove a real browser against it: 6/6 scripted checks
        passed -- on a fresh load (empty `localStorage`) the Artist toggle
        is active (server default honored, no explicit choice yet exists);
        `localStorage`'s persisted `explicitProfile` is confirmed `null` at
        that point (the server default did NOT get recorded as an
        explicit choice -- directly proving this task's "must only be set
        by a real user toggle action" constraint); clicking the Developer
        toggle button for real DOES persist `explicitProfile:"developer"`;
        reloading the page afterward shows Developer still active --
        the explicit choice winning over the still-`"artist"` server
        default, proving the three-state precedence end-to-end through the
        built SPA, not just in the pure `resolve-profile.ts` unit tests.
        Process killed, confirmed dead.
      - **Real demo-stack validation (grpc mode), proven, not left
        untested:** the brief said to attempt this "if time permits" --
        it did. Booted the real BFF in `LORE_BACKEND=grpc` against the
        same live `epic-lore-authz`+`lore-server` demo stack task 8
        validated (already running, confirmed healthy, untouched
        throughout), drove the REAL login flow end to end (`GET /login`
        -> real `302` to `epic-lore-authz`'s `login_url` -> followed it
        through the real Dex mock connector, `curl -L --resolve
        host.docker.internal:5556:127.0.0.1`, exactly task 8's precedent
        -> landed on `epic-lore-authz`'s own unmodified "you are signed
        in" page), then polled `GET /api/auth/status` with the same
        cookie jar: `{"authenticated":true,"userId":
        "af862d98-e0b4-48df-bac2-fa6f8fcb064c","userName":"Kilgore
        Trout","defaultProfile":null}` -- **the real authz token has no
        groups claim today, and the whole chain degrades to `null`
        gracefully, live, exactly as this task's brief predicted.** This
        is the strongest evidence this feature is genuinely inert absent
        groups: not a fixture assumption, a real signed token from a real
        login flow, decoded for real, correctly yielding no default.
        Process killed, confirmed dead (`ps` empty, connection-refused).
        `epic-lore-authz` git status confirmed clean (no source touched);
        demo stack confirmed still running, untouched.

      **What is NOT provable yet, named honestly:** Path A itself (a real
      authz-minted `groups` claim on a real `UserToken`) cannot be proven
      live because `epic-lore-authz` does not mint one today -- that is
      exactly the dependency this task's requirements doc was sent to the
      authz team to close (log.log, 2026-10-01 14:40 PT entry). What IS
      proven is every piece on this side of that dependency: claim
      extraction from a well-formed JWT (unit), the mapping/precedence
      rules (unit + live fixture), the browser-side three-state logic
      (unit + live built-artifact), and the graceful real-world "no claim
      yet" case (live, real demo stack). The moment authz ships a real
      `groups` claim, no code here needs to change -- only this task's own
      live-validation gap closes, by re-running the exact grpc-mode check
      above against a token that actually carries the claim.
