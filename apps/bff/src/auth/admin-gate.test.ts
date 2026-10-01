import { describe, expect, it } from "vitest";
import { hasAdminGrant } from "./admin-gate.js";

describe("auth/admin-gate (task 9: BFF admin-proxy convention)", () => {
  it("grants when the wildcard resource carries the admin permission", () => {
    expect(hasAdminGrant([{ resourceId: "urc-*", permission: ["admin", "read", "write"] }])).toBe(true);
  });

  it("denies when the allowed list is empty", () => {
    expect(hasAdminGrant([])).toBe(false);
  });

  it("denies a specific-repository admin grant -- the wildcard resource id itself must be present", () => {
    expect(hasAdminGrant([{ resourceId: "urc-0194b726b34e72b0b45550b88a967076", permission: ["admin"] }])).toBe(
      false,
    );
  });

  it("denies the wildcard resource without the admin permission (read/write alone is not enough)", () => {
    expect(hasAdminGrant([{ resourceId: "urc-*", permission: ["read", "write"] }])).toBe(false);
  });

  it("grants when the wildcard entry is one of several allowed resources", () => {
    expect(
      hasAdminGrant([
        { resourceId: "urc-0194b726b34e72b0b45550b88a967076", permission: ["read", "write"] },
        { resourceId: "urc-*", permission: ["admin", "read", "write"] },
      ]),
    ).toBe(true);
  });
});
