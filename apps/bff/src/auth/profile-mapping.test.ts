import { describe, expect, it } from "vitest";
import { resolveDefaultProfile } from "./profile-mapping.js";

const ARTIST_GROUPS = ["artists", "concept-art"];
const DEVELOPER_GROUPS = ["engineering", "tools-team"];

describe("auth/profile-mapping (task 11 extension: group-membership default profile)", () => {
  it("resolves artist when the user is only in an artist group", () => {
    expect(resolveDefaultProfile(["artists"], ARTIST_GROUPS, DEVELOPER_GROUPS)).toBe("artist");
  });

  it("resolves developer when the user is only in a developer group", () => {
    expect(resolveDefaultProfile(["tools-team"], ARTIST_GROUPS, DEVELOPER_GROUPS)).toBe("developer");
  });

  it("developer wins when the user is in both an artist and a developer group", () => {
    expect(resolveDefaultProfile(["artists", "engineering"], ARTIST_GROUPS, DEVELOPER_GROUPS)).toBe("developer");
  });

  it("resolves null when groups is empty (no group default -- feature stays inert)", () => {
    expect(resolveDefaultProfile([], ARTIST_GROUPS, DEVELOPER_GROUPS)).toBeNull();
  });

  it("resolves null when the user's groups match neither configured list", () => {
    expect(resolveDefaultProfile(["some-other-group"], ARTIST_GROUPS, DEVELOPER_GROUPS)).toBeNull();
  });

  it("resolves null when no mapping is configured at all, even with real groups", () => {
    expect(resolveDefaultProfile(["artists"], [], [])).toBeNull();
  });

  it("is an exact, case-sensitive string match (no normalization assumed)", () => {
    expect(resolveDefaultProfile(["Artists"], ARTIST_GROUPS, DEVELOPER_GROUPS)).toBeNull();
  });
});
