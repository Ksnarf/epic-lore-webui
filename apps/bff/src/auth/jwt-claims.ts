/**
 * v1 task 11 extension (group-membership default profile, built
 * path-agnostically -- see ../routes/auth.ts's doc comment for the two
 * paths this is meant to serve unmodified: a future authz-minted `groups`
 * claim on the session's `UserToken` (Path A, requirements handed to the
 * authz team), or a native Okta/OIDC token carrying its own `groups` claim
 * directly (Path B). Either way, by the time a token reaches this BFF it is
 * the same shape this file reads: a JWT string on `SessionPayload.userToken`
 * (../auth/session.ts).
 *
 * **Trust boundary, stated explicitly:** this function decodes the JWT
 * PAYLOAD only -- it does not verify the token's signature. That is safe
 * here, and only here, because the token this BFF ever calls this on
 * arrives over the trusted authz gRPC channel (`GetAuthSession`,
 * ./authz-client.ts) -- a channel this BFF already authenticates as a
 * client of, the same way `GetAuthSession`'s returned `UserToken.userToken`
 * is already trusted today for `userId`/`userName`/`expiresAt` without any
 * separate signature check in this codebase (see ../routes/auth.ts). If
 * this function (or the pattern it establishes) is ever reused to decode a
 * token arriving over an UNTRUSTED channel -- e.g. one handed to the BFF
 * directly by the browser -- it must be preceded by real signature
 * verification against the issuer's JWKS first; that is a different
 * problem this function does not solve and must not be mistaken for
 * solving.
 */

/** Decodes one base64url JWT segment to a UTF-8 string. Throws on malformed base64 -- callers below always catch. */
function decodeBase64UrlSegment(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

/**
 * Extracts a named claim from a JWT's payload (middle segment) as a
 * `string[]`, tolerating every shape of "this isn't there" the two
 * paths above can produce: not a JWT at all, a JWT with an unparsable
 * payload, a payload with no such claim, or a claim present but not an
 * array of strings. All of these return an empty array -- GROUPS ARE
 * OPTIONAL EVERYWHERE (this task's own constraint): an empty result here
 * must mean "no group default", never an error, since today's real authz
 * tokens carry no such claim at all and that is expected, not a bug.
 */
export function extractGroupsClaim(jwt: string, claimName: string): string[] {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    return [];
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64UrlSegment(parts[1]!));
  } catch {
    return [];
  }

  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const claim = (payload as Record<string, unknown>)[claimName];
  if (!Array.isArray(claim)) {
    return [];
  }

  return claim.filter((entry): entry is string => typeof entry === "string");
}
