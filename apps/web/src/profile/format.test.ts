import { describe, expect, it } from "vitest";
import {
  formatByteSize,
  formatLockTimestamp,
  relativeTimeFromNow,
  revisionLabel,
  shortHex,
  showsTechnicalDetail,
} from "./format.js";

describe("shortHex", () => {
  it("truncates a long hex string with an ellipsis", () => {
    expect(shortHex("a1b2c3d4e5f6a7b8", 10)).toBe("a1b2c3d4e5…");
  });

  it("returns a short string unchanged", () => {
    expect(shortHex("a1b2", 10)).toBe("a1b2");
  });

  it("handles an empty string without throwing", () => {
    expect(shortHex("", 10)).toBe("");
  });
});

describe("revisionLabel", () => {
  const revision = { number: "12", signature: "a1b2c3d4e5f6a7b8c9d0" };

  it("developer profile: number + truncated signature", () => {
    expect(revisionLabel(revision, "developer")).toBe("#12 a1b2c3d4e5f6…");
  });

  it("artist profile: friendly label, no signature at all", () => {
    expect(revisionLabel(revision, "artist")).toBe("Revision 12");
  });
});

describe("showsTechnicalDetail", () => {
  it("is true for developer, false for artist", () => {
    expect(showsTechnicalDetail("developer")).toBe(true);
    expect(showsTechnicalDetail("artist")).toBe(false);
  });
});

describe("formatByteSize", () => {
  it("developer profile: exact byte count, unchanged from pre-task-11 behavior", () => {
    expect(formatByteSize("512", "developer")).toBe("512B");
    expect(formatByteSize("2097152", "developer")).toBe("2097152B");
  });

  it("artist profile: human-scaled units", () => {
    expect(formatByteSize("512", "artist")).toBe("512 B");
    expect(formatByteSize("2048", "artist")).toBe("2.0 KB");
    expect(formatByteSize("5242880", "artist")).toBe("5.0 MB");
    expect(formatByteSize("1073741824", "artist")).toBe("1.0 GB");
  });

  it("artist profile: rounds to a whole number at 10+ units", () => {
    expect(formatByteSize("15728640", "artist")).toBe("15 MB");
  });

  it("falls back to the raw decimal string on a non-numeric size, either profile", () => {
    expect(formatByteSize("not-a-number", "artist")).toBe("not-a-numberB");
  });
});

describe("relativeTimeFromNow", () => {
  const now = Date.UTC(2026, 9, 1, 12, 0, 0); // 2026-10-01T12:00:00Z

  it("renders a past instant in minutes", () => {
    expect(relativeTimeFromNow(now - 5 * 60 * 1000, now)).toBe("5 minutes ago");
  });

  it("renders a past instant in hours", () => {
    expect(relativeTimeFromNow(now - 3 * 60 * 60 * 1000, now)).toBe("3 hours ago");
  });

  it("renders a past instant in days", () => {
    expect(relativeTimeFromNow(now - 2 * 24 * 60 * 60 * 1000, now)).toBe("2 days ago");
  });

  it("renders a future instant (clock skew / optimistic update) without throwing", () => {
    expect(relativeTimeFromNow(now + 10 * 60 * 1000, now)).toBe("in 10 minutes");
  });
});

describe("formatLockTimestamp", () => {
  const lockedAt = Date.UTC(2026, 9, 1, 10, 0, 0);
  const now = Date.UTC(2026, 9, 1, 12, 0, 0);

  it("developer profile: exact ISO instant, unchanged from pre-task-11 behavior", () => {
    expect(formatLockTimestamp(String(lockedAt), "developer", now)).toBe(new Date(lockedAt).toISOString());
  });

  it("artist profile: relative time", () => {
    expect(formatLockTimestamp(String(lockedAt), "artist", now)).toBe("2 hours ago");
  });
});
