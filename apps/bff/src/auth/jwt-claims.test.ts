import { describe, expect, it } from "vitest";
import { extractGroupsClaim } from "./jwt-claims.js";

function makeJwt(payload: unknown): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  // Signature segment is never read/verified (see this file's doc comment) --
  // any non-empty string stands in for one.
  return `${header}.${body}.unverified-signature`;
}

describe("auth/jwt-claims (task 11 extension: group-membership default profile)", () => {
  it("extracts a string[] groups claim under the default claim name", () => {
    const jwt = makeJwt({ groups: ["artists", "leads"] });
    expect(extractGroupsClaim(jwt, "groups")).toEqual(["artists", "leads"]);
  });

  it("extracts a string[] claim under a configured, non-default claim name", () => {
    const jwt = makeJwt({ memberOf: ["dev-team"] });
    expect(extractGroupsClaim(jwt, "memberOf")).toEqual(["dev-team"]);
  });

  it("returns [] when the claim is entirely absent (today's real authz tokens)", () => {
    const jwt = makeJwt({ sub: "u1", exp: 123 });
    expect(extractGroupsClaim(jwt, "groups")).toEqual([]);
  });

  it("returns [] when the claim is present but not an array", () => {
    const jwt = makeJwt({ groups: "not-an-array" });
    expect(extractGroupsClaim(jwt, "groups")).toEqual([]);
  });

  it("drops non-string entries from an otherwise-valid array claim", () => {
    const jwt = makeJwt({ groups: ["ok", 42, null, "also-ok"] });
    expect(extractGroupsClaim(jwt, "groups")).toEqual(["ok", "also-ok"]);
  });

  it("returns [] for a non-JWT string (not three dot-separated segments)", () => {
    expect(extractGroupsClaim("not-a-jwt-at-all", "groups")).toEqual([]);
  });

  it("returns [] for a JWT whose payload segment is not valid base64/JSON", () => {
    expect(extractGroupsClaim("header.not-valid-base64json!!!.sig", "groups")).toEqual([]);
  });

  it("returns [] for a JWT whose payload is valid JSON but not an object (e.g. a bare array)", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(["x", "y"])).toString("base64url");
    expect(extractGroupsClaim(`${header}.${body}.sig`, "groups")).toEqual([]);
  });
});
