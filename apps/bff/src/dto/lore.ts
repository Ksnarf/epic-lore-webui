import { encodeHexBytes } from "@epic-lore-webui/api-types";
import type {
  BranchSummary,
  RepositorySummary,
  RevisionDto,
  RevisionItemDto,
  RevisionParentDto,
  TreeNodeDto,
} from "@epic-lore-webui/api-types";
import type { Branch, RevisionItem, Repository } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import {
  FileMode,
  NodeType,
  type Revision,
  type Revision_Parent,
  type TreeNode,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import { bytesEqual } from "../backend/branch-scope.js";

/** Converts a gRPC `lore.model.v1.Repository` to the BFF's JSON contract (packages/api-types). */
export function toRepositorySummary(repository: Repository): RepositorySummary {
  return {
    id: encodeHexBytes(repository.id),
    name: repository.name,
    description: repository.description,
    defaultBranchId: encodeHexBytes(repository.defaultBranchId),
    defaultBranchName: repository.defaultBranchName,
    creator: repository.creator,
    created: String(repository.created),
  };
}

/** Converts a gRPC `lore.model.v1.Branch` to the BFF's JSON contract. `isDefault` is BFF-computed -- see packages/api-types/src/branch.ts. */
export function toBranchSummary(branch: Branch, repository: Repository): BranchSummary {
  return {
    id: encodeHexBytes(branch.id),
    name: branch.name,
    creator: branch.creator,
    category: branch.category,
    created: String(branch.created),
    latest: encodeHexBytes(branch.latest),
    deleted: branch.deleted,
    isDefault: bytesEqual(branch.id, repository.defaultBranchId),
    stack: branch.stack.map((point) => ({
      branchId: encodeHexBytes(point.branchId),
      revisionSignature: encodeHexBytes(point.revisionSignature),
    })),
  };
}

/** Converts a gRPC `lore.model.v1.RevisionItem` (RevisionList's lean row projection) to the BFF's JSON contract. */
export function toRevisionItemDto(item: RevisionItem): RevisionItemDto {
  return {
    number: String(item.number),
    signature: encodeHexBytes(item.signature),
    metadata: encodeHexBytes(item.metadata),
    state: encodeHexBytes(item.state),
  };
}

function toRevisionParentDto(parent: Revision_Parent): RevisionParentDto {
  return {
    signature: encodeHexBytes(parent.signature),
    branchId: encodeHexBytes(parent.identifier?.branchId ?? new Uint8Array(0)),
    number: String(parent.identifier?.number ?? 0n),
  };
}

/** Converts a gRPC `lore.thin_client.v1.Revision` (the full record, RevisionInfo's response) to the BFF's JSON contract. */
export function toRevisionDto(revision: Revision): RevisionDto {
  return {
    signature: encodeHexBytes(revision.signature),
    branchId: encodeHexBytes(revision.identifier?.branchId ?? new Uint8Array(0)),
    number: String(revision.number),
    commitMessage: revision.commitMessage,
    timestamp: String(revision.timestamp),
    createdBy: revision.createdBy,
    committedBy: revision.committedBy,
    parentSelf: revision.parentSelf ? toRevisionParentDto(revision.parentSelf) : null,
    parentOther: revision.parentOther ? toRevisionParentDto(revision.parentOther) : null,
  };
}

function nodeTypeName(nodeType: NodeType): TreeNodeDto["nodeType"] {
  switch (nodeType) {
    case NodeType.DIRECTORY:
      return "DIRECTORY";
    case NodeType.FILE:
      return "FILE";
    case NodeType.LINK:
      return "LINK";
  }
}

/** `TreeNode.mode` is a raw `uint64` bitmask on the wire, not a typed enum -- compare against `FileMode`'s known values. */
function fileModeName(mode: bigint): TreeNodeDto["mode"] {
  return mode === BigInt(FileMode.EXECUTABLE) ? "EXECUTABLE" : "NONE";
}

/** Converts a gRPC `lore.thin_client.v1.TreeNode` to the BFF's JSON contract. */
export function toTreeNodeDto(node: TreeNode): TreeNodeDto {
  return {
    path: node.path,
    nodeType: nodeTypeName(node.nodeType),
    address: node.address
      ? { hash: encodeHexBytes(node.address.hash), context: encodeHexBytes(node.address.context) }
      : null,
    size: String(node.size),
    mode: fileModeName(node.mode),
    tracking: node.tracking,
  };
}
