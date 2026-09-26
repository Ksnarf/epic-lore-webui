import type { TreeNode } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/**
 * Depth of `path` below `prefix`, or `null` if `path` is not at or under
 * `prefix`. 0 means `path === prefix` itself (the prefix-root entry); 1
 * means a direct child; etc.
 */
function relativeDepth(path: string, prefix: string): number | null {
  const pathSegments = splitPath(path);
  const prefixSegments = splitPath(prefix);
  if (prefixSegments.length > pathSegments.length) {
    return null;
  }
  for (let i = 0; i < prefixSegments.length; i++) {
    if (pathSegments[i] !== prefixSegments[i]) {
      return null;
    }
  }
  return pathSegments.length - prefixSegments.length;
}

/**
 * Fixture-mode emulation of `RevisionTreeRequest.path_prefix` /
 * `max_depth` filtering (proto/vendor/lore/lore/thin_client/v1/thin_client.proto):
 * "If set and non-empty, only entries at or under this path are emitted.
 * The prefix itself is emitted as a DIRECTORY node when it exists... If
 * set, limits the depth of descent below the prefix root. 1 emits only
 * direct children of the prefix root... 0 or unset means unbounded."
 *
 * `allNodes` is a branch's full fixture tree (flat, full repository-relative
 * paths); this walks it the same way the real server would walk CAS.
 */
export function queryFixtureTree(
  allNodes: TreeNode[],
  pathPrefix: string | undefined,
  maxDepth: number | undefined,
): TreeNode[] {
  const prefix = pathPrefix ?? "";
  const out: TreeNode[] = [];
  for (const node of allNodes) {
    const depth = relativeDepth(node.path, prefix);
    if (depth === null) {
      continue;
    }
    if (depth === 0) {
      // The prefix root itself -- always emitted when present, regardless
      // of max_depth (max_depth bounds descent *below* the root).
      out.push(node);
      continue;
    }
    if (maxDepth !== undefined && maxDepth > 0 && depth > maxDepth) {
      continue;
    }
    out.push(node);
  }
  return out;
}
