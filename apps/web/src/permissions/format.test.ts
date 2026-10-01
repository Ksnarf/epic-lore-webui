import { describe, expect, it } from "vitest";
import {
  friendlyPermissionLabel,
  isWildcardResourceId,
  repositoryIdFromResourceId,
  resourceDisplayName,
} from "./format.js";

describe("permissions/format (task 9: self-service permissions view)", () => {
  describe("repositoryIdFromResourceId", () => {
    it("extracts the hex id from a urc-<hex> resource id", () => {
      expect(repositoryIdFromResourceId("urc-00000000000000000000000000000001")).toBe(
        "00000000000000000000000000000001",
      );
    });

    it("returns null for the wildcard", () => {
      expect(repositoryIdFromResourceId("urc-*")).toBeNull();
    });

    it("returns null for a non-urc resource namespace", () => {
      expect(repositoryIdFromResourceId("something-else")).toBeNull();
    });
  });

  describe("isWildcardResourceId", () => {
    it("is true only for the literal urc-* string", () => {
      expect(isWildcardResourceId("urc-*")).toBe(true);
      expect(isWildcardResourceId("urc-0001")).toBe(false);
    });
  });

  describe("resourceDisplayName", () => {
    const repoNames = new Map([["00000000000000000000000000000001", "epic-lore"]]);

    it("prefers the known repository name in Developer profile too", () => {
      expect(resourceDisplayName("urc-00000000000000000000000000000001", repoNames, "developer")).toBe("epic-lore");
    });

    it("prefers the known repository name in Artist profile", () => {
      expect(resourceDisplayName("urc-00000000000000000000000000000001", repoNames, "artist")).toBe("epic-lore");
    });

    it("Developer: falls back to the raw resource id when the repository is unknown", () => {
      expect(resourceDisplayName("urc-deadbeef", repoNames, "developer")).toBe("urc-deadbeef");
    });

    it("Artist: falls back to 'Other resource' for an unknown non-wildcard resource", () => {
      expect(resourceDisplayName("urc-deadbeef", repoNames, "artist")).toBe("Other resource");
    });

    it("Artist: the wildcard resource reads as 'All repositories'", () => {
      expect(resourceDisplayName("urc-*", repoNames, "artist")).toBe("All repositories");
    });

    it("Developer: the wildcard resource shows its raw id", () => {
      expect(resourceDisplayName("urc-*", repoNames, "developer")).toBe("urc-*");
    });
  });

  describe("friendlyPermissionLabel", () => {
    it("maps the three known permission strings", () => {
      expect(friendlyPermissionLabel("admin")).toBe("Full control");
      expect(friendlyPermissionLabel("write")).toBe("Can edit");
      expect(friendlyPermissionLabel("read")).toBe("Can view");
    });

    it("passes an unknown permission string through unchanged", () => {
      expect(friendlyPermissionLabel("some-future-permission")).toBe("some-future-permission");
    });
  });
});
