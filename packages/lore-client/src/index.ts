export * from "./transport.js";

// Generated clients live under ./gen (buf generate, gitignored, produced by
// `pnpm run generate` / generate-on-build -- see buf.gen.yaml). Import them
// directly via deep imports, e.g.:
//   import { RepositoryService } from "@epic-lore-webui/lore-client/gen/lore/repository/v1/repository_pb.js";
// This index intentionally does not re-export generated code.
