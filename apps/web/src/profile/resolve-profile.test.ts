import { describe, expect, it } from "vitest";
import { resolveEffectiveProfile } from "./resolve-profile.js";

describe("profile/resolve-profile (task 11 extension: three-state default profile)", () => {
  it("an explicit choice wins over a server default", () => {
    expect(
      resolveEffectiveProfile({ explicit: "developer", serverDefault: "artist", fallback: "developer" }),
    ).toBe("developer");
  });

  it("an explicit choice wins over a server default, the other way round too", () => {
    expect(
      resolveEffectiveProfile({ explicit: "artist", serverDefault: "developer", fallback: "developer" }),
    ).toBe("artist");
  });

  it("the server default is used when there is no explicit choice", () => {
    expect(resolveEffectiveProfile({ explicit: null, serverDefault: "artist", fallback: "developer" })).toBe(
      "artist",
    );
  });

  it("falls back when neither an explicit choice nor a server default exists", () => {
    expect(resolveEffectiveProfile({ explicit: null, serverDefault: null, fallback: "developer" })).toBe(
      "developer",
    );
  });

  it("a null server default (no groups, or groups matching no mapping) falls through to fallback, not an error", () => {
    expect(resolveEffectiveProfile({ explicit: null, serverDefault: null, fallback: "artist" })).toBe("artist");
  });
});
