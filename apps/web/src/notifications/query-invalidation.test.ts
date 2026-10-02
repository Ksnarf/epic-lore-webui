import type { HexBytes, NotificationEventDto } from "@epic-lore-webui/api-types";
import { describe, expect, it } from "vitest";
import { queryKeysForNotificationEvent } from "./query-invalidation.js";

/** `HexBytes` is a branded string (packages/api-types/src/hex-bytes.ts) -- hand-picked ids, same convention as ../locks/group-locks.test.ts. */
function hex(value: string): HexBytes {
  return value as HexBytes;
}

const REPO_ID = "repo-1";

function baseEvent(overrides: Partial<NotificationEventDto>): NotificationEventDto {
  return {
    id: "evt-1",
    time: "0",
    repositoryId: hex("aa"),
    kind: "other",
    ...overrides,
  };
}

describe("queryKeysForNotificationEvent", () => {
  it("resourceLocked invalidates only the locks list", () => {
    const event = baseEvent({ kind: "resourceLocked", userId: "alice", resources: [] });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([["locks", REPO_ID]]);
  });

  it("resourceUnlocked invalidates only the locks list", () => {
    const event = baseEvent({ kind: "resourceUnlocked", userId: "alice", resources: [] });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([["locks", REPO_ID]]);
  });

  it("branchPushed with a branchId invalidates that branch's revisions plus the branches list", () => {
    const event = baseEvent({ kind: "branchPushed", branchId: hex("branch-1"), revisionNumber: "5" });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([
      ["revisions", REPO_ID, "branch-1"],
      ["branches", REPO_ID],
    ]);
  });

  it("branchPushed with no branchId falls back to invalidating only the branches list", () => {
    const event = baseEvent({ kind: "branchPushed" });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([["branches", REPO_ID]]);
  });

  it("branchCreated invalidates the branches list", () => {
    const event = baseEvent({ kind: "branchCreated", branchId: hex("branch-2") });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([["branches", REPO_ID]]);
  });

  it("branchDeleted invalidates the branches list", () => {
    const event = baseEvent({ kind: "branchDeleted", branchId: hex("branch-2") });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([["branches", REPO_ID]]);
  });

  it("obliterate invalidates nothing (no consuming view)", () => {
    const event = baseEvent({ kind: "obliterate" });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([]);
  });

  it("other (extension event) invalidates nothing", () => {
    const event = baseEvent({ kind: "other", extensionType: "org.example.custom" });
    expect(queryKeysForNotificationEvent(event, REPO_ID)).toEqual([]);
  });
});
