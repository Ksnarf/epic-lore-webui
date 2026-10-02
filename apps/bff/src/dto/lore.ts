import { timestampMs } from "@bufbuild/protobuf/wkt";
import { encodeHexBytes } from "@epic-lore-webui/api-types";
import type {
  BranchSummary,
  ContentDiffResponseBody,
  DiffActionDto,
  DiffChangeDto,
  DiffConflictSummaryDto,
  DiffPartitionDto,
  LockDto,
  LockResourceDto,
  NotificationEventDto,
  RepositorySummary,
  RevisionDiffHeaderDto,
  RevisionDto,
  RevisionItemDto,
  RevisionParentDto,
  RevisionRefDto,
  TreeNodeDto,
} from "@epic-lore-webui/api-types";
import type { Lock, Resource } from "@epic-lore-webui/lore-client/gen/lock_pb";
import type { Event } from "@epic-lore-webui/lore-client/gen/lore_notification_pb";
import type { Branch, RevisionIdentifier, RevisionItem, Repository } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import {
  Action,
  FileMode,
  NodeType,
  type ContentDiffHeader,
  type DiffChange,
  type DiffConflict,
  type DiffPartition,
  type Revision,
  type Revision_Parent,
  type TreeNode,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import type { RevisionDiffHeader } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
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

/** Converts a gRPC `urc.lock.Resource` to the BFF's JSON contract (v1 task 5). */
export function toLockResourceDto(resource: Resource): LockResourceDto {
  return {
    branchId: encodeHexBytes(resource.branch),
    hash: encodeHexBytes(resource.hash),
    description: resource.description,
  };
}

/**
 * Converts a gRPC `urc.lock.Lock` to the BFF's JSON contract (v1 task 5).
 * `resource` is optional on the wire (`Lock.resource?: Resource | undefined`)
 * but every real lock the server returns should carry one -- falls back to
 * an empty resource rather than throwing, same defensive convention as
 * `toRevisionParentDto`'s `branchId` fallback above.
 */
export function toLockDto(lock: Lock): LockDto {
  return {
    resource: lock.resource ? toLockResourceDto(lock.resource) : { branchId: encodeHexBytes(new Uint8Array(0)), hash: encodeHexBytes(new Uint8Array(0)), description: "" },
    owner: lock.owner,
    lockedAt: lock.lockedAt ? String(timestampMs(lock.lockedAt)) : "0",
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

// --- v1 task 3 (side-by-side text diff + binary-aware diff) ---------------

function diffActionName(action: Action): DiffActionDto {
  switch (action) {
    case Action.KEEP:
      return "KEEP";
    case Action.ADD:
      return "ADD";
    case Action.DELETE:
      return "DELETE";
    case Action.MOVE:
      return "MOVE";
    case Action.COPY:
      return "COPY";
  }
}

function toRevisionRefDto(identifier: RevisionIdentifier | undefined): RevisionRefDto {
  return {
    branchId: encodeHexBytes(identifier?.branchId ?? new Uint8Array(0)),
    number: String(identifier?.number ?? 0n),
  };
}

/** Converts a gRPC `lore.thin_client.v1.DiffChange` to the BFF's JSON contract. */
export function toDiffChangeDto(change: DiffChange): DiffChangeDto {
  return {
    path: change.path,
    pathFrom: change.pathFrom,
    action: diffActionName(change.action),
    nodeType: nodeTypeName(change.nodeType),
    contentFrom: encodeHexBytes(change.contentFrom),
    contentTo: encodeHexBytes(change.contentTo),
    automerged: change.automerged,
    linkRepositoryIndex: change.linkRepositoryIndex,
    tracking: change.tracking,
  };
}

/** Converts a gRPC `lore.thin_client.v1.RevisionDiffHeader` to the BFF's JSON contract. */
export function toRevisionDiffHeaderDto(header: RevisionDiffHeader): RevisionDiffHeaderDto {
  return {
    identifierFrom: toRevisionRefDto(header.identifierFrom),
    signatureFrom: encodeHexBytes(header.signatureFrom),
    identifierTo: toRevisionRefDto(header.identifierTo),
    signatureTo: encodeHexBytes(header.signatureTo),
    identifierBase: header.identifierBase ? toRevisionRefDto(header.identifierBase) : null,
    signatureBase: header.signatureBase ? encodeHexBytes(header.signatureBase) : null,
  };
}

/**
 * Converts a gRPC `lore.thin_client.v1.DiffConflict` to the BFF's JSON
 * contract's minimal summary shape -- see `DiffConflictSummaryDto`'s doc
 * comment on why this task doesn't expand the full conflict content (task
 * 7's scope, not this one).
 */
export function toDiffConflictSummaryDto(conflict: DiffConflict): DiffConflictSummaryDto {
  return {
    changeFromPath: conflict.changeFrom?.path ?? "",
    changeToPath: conflict.changeTo?.path ?? "",
  };
}

/** Converts a gRPC `lore.thin_client.v1.DiffPartition` to the BFF's JSON contract. */
export function toDiffPartitionDto(partition: DiffPartition): DiffPartitionDto {
  return {
    index: partition.index,
    linkPartition: encodeHexBytes(partition.linkPartition),
  };
}

/**
 * Converts a gRPC `lore.thin_client.v1.ContentDiffHeader` plus the BFF's
 * already-concatenated chunk text (see `ContentDiffResponseBody`'s doc
 * comment on why concatenation must happen before this point) into the
 * BFF's JSON contract.
 */
export function toContentDiffResponseBody(header: ContentDiffHeader, diff: string): ContentDiffResponseBody {
  return {
    linesAdded: Number(header.linesAdded),
    linesDeleted: Number(header.linesDeleted),
    binary: header.binary,
    truncated: header.truncated,
    hasConflicts: header.hasConflicts,
    conflictCount: header.conflictCount,
    diff,
  };
}

// --- v1 task 10 (live notifications) ---------------------------------------

/**
 * Converts a gRPC `lore.notification.Event` to the BFF's JSON/SSE contract,
 * flattening `Event`'s `oneof event` into one `kind`-discriminated shape --
 * see `packages/api-types/src/notification.ts`'s top comment for why
 * `obliterate`/`other` carry no extra fields (no consuming UI feature exists
 * for either in this task's surgical scope).
 */
export function toNotificationEventDto(event: Event): NotificationEventDto {
  const base = {
    id: event.id,
    time: event.time ? String(timestampMs(event.time)) : "0",
    repositoryId: encodeHexBytes(event.repository),
  };
  switch (event.event.case) {
    case "branchCreated":
      return { ...base, kind: "branchCreated", branchId: encodeHexBytes(event.event.value.branch) };
    case "branchPushed":
      return {
        ...base,
        kind: "branchPushed",
        branchId: encodeHexBytes(event.event.value.branch),
        revisionNumber: String(event.event.value.revisionNumber),
        userId: event.event.value.userId,
      };
    case "branchDeleted":
      return { ...base, kind: "branchDeleted", branchId: encodeHexBytes(event.event.value.branch) };
    case "resourceLocked":
      return {
        ...base,
        kind: "resourceLocked",
        userId: event.event.value.userId,
        resources: event.event.value.resources.map(toLockResourceDto),
      };
    case "resourceUnlocked":
      return {
        ...base,
        kind: "resourceUnlocked",
        userId: event.event.value.userId,
        resources: event.event.value.resources.map(toLockResourceDto),
      };
    case "obliterate":
      return { ...base, kind: "obliterate" };
    case "other":
      return { ...base, kind: "other", extensionType: event.event.value.type };
    case undefined:
      // Proto3 oneof with no case set -- not expected from a real server
      // (every `Event` on the wire should carry one of the above), but
      // mapped to an honest "other" rather than throwing, so one malformed
      // frame doesn't take down the whole SSE relay.
      return { ...base, kind: "other" };
  }
}
