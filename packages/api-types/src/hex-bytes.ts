/**
 * Hex-bytes convention (docs/design/stack-decision.md, "BFF" section,
 * "Bytes serialization convention"): every `bytes` field crossing the BFF's
 * JSON boundary (signatures, addresses, repository ids, ...) is rendered as
 * hex, not base64. This package owns the convention so `apps/web` and
 * `apps/bff` agree on it by construction.
 *
 * `packages/lore-client`'s generated types use `Uint8Array` for proto
 * `bytes` fields (the `@bufbuild/protobuf` runtime default). Routes in
 * `apps/bff` are responsible for converting `Uint8Array` <-> `HexBytes`
 * at the boundary where a gRPC response becomes a JSON response; this
 * package only defines the wire type and the conversion helpers, since it
 * must not import `packages/lore-client` (BFF-only, see stack-decision.md).
 */

/** A `bytes` field as it appears on the wire between `apps/bff` and `apps/web`: lowercase hex, no `0x` prefix. */
export type HexBytes = string & { readonly __brand: "HexBytes" };

const HEX_PATTERN = /^[0-9a-f]*$/;

/** Encode raw bytes as the wire `HexBytes` representation (lowercase hex). */
export function encodeHexBytes(bytes: Uint8Array): HexBytes {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out as HexBytes;
}

/** Decode a wire `HexBytes` value back into raw bytes. Throws on malformed hex. */
export function decodeHexBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !HEX_PATTERN.test(hex.toLowerCase())) {
    throw new Error(`decodeHexBytes: not a valid hex-bytes string: ${JSON.stringify(hex)}`);
  }
  const lower = hex.toLowerCase();
  const out = new Uint8Array(lower.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(lower.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Type guard: is this string well-formed as `HexBytes` (even length, lowercase hex digits)? */
export function isHexBytes(value: string): value is HexBytes {
  return value.length % 2 === 0 && HEX_PATTERN.test(value);
}
