export * from "./transport.js";

// Generated clients live under ./gen (buf generate, gitignored, produced by
// `pnpm run generate` / generate-on-build -- see buf.gen.yaml). Import them
// directly via deep imports, WITHOUT a trailing ".js" (this is a package
// subpath import resolved via package.json's "exports" map, not a relative
// file import -- NodeNext's explicit-extension rule doesn't apply here; the
// "./gen/*" export pattern below appends its own ".js"/".d.ts" suffix, so a
// caller-supplied ".js" produces a broken double extension and TS2307
// "cannot find module"), e.g.:
//   import { RepositoryService } from "@epic-lore-webui/lore-client/gen/lore/repository/v1/repository_pb";
// This index intentionally does not re-export generated code.
