# Provenance: vendored `lore` protos

These `.proto` files are copied **verbatim** from
[`EpicGames/lore`](https://github.com/EpicGames/lore) (mirrored at
[`Ksnarf/epic-lore`](https://github.com/Ksnarf/epic-lore), the local clone
this vendoring was taken from).

- **Upstream repo:** https://github.com/EpicGames/lore
- **Pinned commit:** `4ed62928ecb0f960e3e310d918ea6774b0beeb86`
- **Commit date:** 2026-09-01 14:07:15 +0000
- **Vendored:** 2026-09-20
- **License:** MIT (Copyright (c) 2026 Epic Games, Inc.) -- see `LICENSE` in
  this directory, copied unmodified from the upstream repo root. MIT permits
  verbatim redistribution provided the copyright notice and permission
  notice are retained, which this directory does.

## Why vendored instead of fetched at build time

Verified permissive license (MIT), so the files are committed directly
rather than pulled by a fetch script. This keeps a fresh clone of this
(public) repo buildable with no dependency on `EpicGames/lore` (or its
`Ksnarf/epic-lore` mirror) being reachable at build time.

## Files, and why each is here

Selected to cover exactly the services `docs/design/api-contract.md`
identifies as what this web UI/BFF needs to generate clients for, plus the
transitive `import` dependencies required for those files to compile
standalone (see "Import graph" below).

| File | Package | Why |
|---|---|---|
| `lore/thin_client/v1/thin_client.proto` | `lore.thin_client.v1` | `ThinClientService` -- `RevisionTree`, `RevisionInfo`, `RevisionDiff`, `ContentDiff` (api-contract.md section 1, features 1-3) |
| `lore/thin_client/v1/model.proto` | `lore.thin_client.v1` | Message types for the above (`DiffConflict`, `ContentDiffRequest`/`Response`, etc.) |
| `lore/repository/v1/repository.proto` | `lore.repository.v1` | `RepositoryService` -- `RepositoryList`/`RepositoryGet` (feature 1) |
| `lore/revision/v1/revision.proto` | `lore.revision.v1` | `RevisionService` -- `BranchList`/`BranchGet`/`BranchCreate`/`BranchDelete`/`BranchPush`/`RevisionList` (features 1, 2, 7) |
| `lore/model/v1/model.proto` | `lore.model.v1` | Shared model types (`Branch`, `Revision`, `Metadata`, ...) imported by every `lore.*.v1` service above |
| `lock.proto` | `urc.lock` | `LockService` -- `Lock`/`Query`/`Status`/`Unlock`/`AdminLock` (feature 5) |
| `lore_notification.proto` | `lore.notification` | **Live** `NotificationService.Subscribe` (feature 10). Note: this is the corrected package -- see `docs/design/api-contract.md` section 1, feature 10. The sibling legacy file `notification.proto` (package `urc.notification`) is intentionally **not** vendored; `lore-server` does not serve it. |
| `model.proto` | `urc.model` | Legacy model types. Vendored only because `lore_notification.proto` imports it (`import "model.proto";`) -- not otherwise used by this UI. |
| `auth_api.proto` | `epic_urc` | `UrcAuthApi` -- `CheckUserPermission`/`LookupUserPermissions`/`ExchangeExternalTokenForUserToken` (api-contract.md sections 3-4) |
| `rebac_api.proto` | (see file) | Relationship-based access control API the contract doc requires alongside `auth_api.proto` |

`admin.proto` (the `ADMIN_API_TOKEN`-gated admin surface) is deliberately
**not** vendored: `docs/design/api-contract.md` section 4 is explicit that
the browser must never speak this API directly, and even the BFF's use of
it goes through `epic-lore-authz`'s `/admin/v1` HTTP surface (documented in
`docs/design/authz-integration.md`), not this gRPC service.

## Import graph (why each file needs the others present)

```
thin_client.proto  -> lore/model/v1/model.proto, lore/thin_client/v1/model.proto
thin_client/v1/model.proto -> lore/model/v1/model.proto
repository.proto    -> lore/model/v1/model.proto
revision.proto       -> lore/model/v1/model.proto
lore_notification.proto -> model.proto (legacy), lock.proto,
                           google/protobuf/{any,empty,timestamp}.proto
lock.proto            -> google/protobuf/timestamp.proto
auth_api.proto        -> (no lore-internal imports)
rebac_api.proto       -> (no lore-internal imports)
```

The `google/protobuf/*` well-known types are **not** vendored -- they ship
with any standard protobuf toolchain (`protoc`, `grpc-tools`,
`protobufjs`, `buf`, etc.) and are resolved automatically by those tools;
they are not part of the `lore` codebase.

## How to regenerate this vendored set

```
git -C <clone of EpicGames/lore, or Ksnarf/epic-lore mirror> checkout 4ed62928ecb0f960e3e310d918ea6774b0beeb86
# then copy the files listed above from lore-proto/proto/ into this
# directory, preserving their relative paths so the import statements
# above still resolve.
```

## Build verification performed

This exact vendored set was compiled standalone (this directory as the
proto include root, `-p proto/vendor/lore`) with
`protobufjs-cli`'s `pbjs -t json`, targeting all nine `lore`-owned files
above. It produced a single valid descriptor JSON covering every package
referenced (`lore`, `urc`, `epic_urc`, plus the `google` well-known types),
confirming the import graph is complete and self-contained with no missing
files. See `docs/design/build-deps.md` for the command.
