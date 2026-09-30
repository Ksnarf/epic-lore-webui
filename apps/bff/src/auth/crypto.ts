import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * v1 task 8 (Okta auth). Symmetric encryption for everything this BFF puts
 * in a cookie (the session cookie holding the user's `epic_urc.UserToken`,
 * and the short-lived "login attempt" cookie -- see ./session.ts). Nothing
 * here is bespoke crypto: AES-256-GCM via Node's own `node:crypto`, which is
 * why no new dependency was added for this (`@fastify/cookie` is already a
 * dependency and is used here only for cookie transport/parsing, not
 * encryption -- it has no built-in *encrypted* cookie support, only HMAC
 * signing, which would leave the token readable by anyone with the cookie).
 *
 * Key material: `SESSION_SECRET` (see ../config.ts), an operator-provided
 * high-entropy string. It is hashed with SHA-256 to get a fixed 32-byte
 * AES-256 key regardless of the secret's own length/encoding -- this is a
 * key-derivation shortcut (no salt, no KDF work factor), acceptable here
 * because `SESSION_SECRET` is expected to already be a long random value
 * (e.g. `openssl rand -base64 32`), not a human-chosen password low-entropy
 * enough to need scrypt/argon2's brute-force resistance.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard GCM nonce size.

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Encrypts `plaintext` (already-serialized JSON) into a single
 * base64url-safe token: `iv || authTag || ciphertext`, all concatenated
 * before encoding. Safe to put directly in a cookie value (no `;`, `,`, or
 * whitespace -- base64url's alphabet is cookie-value-safe).
 */
export function encrypt(secret: string, plaintext: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

/**
 * Inverse of `encrypt`. Returns `undefined` (never throws) on anything that
 * doesn't decrypt and authenticate cleanly -- a tampered cookie, one
 * encrypted under a different `SESSION_SECRET` (e.g. after a secret
 * rotation), or simple garbage. Callers (./session.ts) treat "doesn't
 * decrypt" exactly the same as "no cookie at all", which is the fail-closed
 * behavior a session mechanism needs.
 */
export function decrypt(secret: string, token: string): string | undefined {
  try {
    const key = deriveKey(secret);
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return undefined;
  }
}
