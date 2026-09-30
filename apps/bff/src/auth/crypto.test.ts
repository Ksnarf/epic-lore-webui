import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.js";

describe("auth/crypto (v1 task 8)", () => {
  it("round-trips a plaintext payload under the same secret", () => {
    const secret = "test-secret-one";
    const plaintext = JSON.stringify({ userId: "abc", expiresAt: 12345 });
    const token = encrypt(secret, plaintext);
    expect(decrypt(secret, token)).toBe(plaintext);
  });

  it("produces a different ciphertext every time (random IV), same plaintext", () => {
    const secret = "test-secret-one";
    const a = encrypt(secret, "same-plaintext");
    const b = encrypt(secret, "same-plaintext");
    expect(a).not.toBe(b);
    expect(decrypt(secret, a)).toBe("same-plaintext");
    expect(decrypt(secret, b)).toBe("same-plaintext");
  });

  it("fails closed (undefined, not a throw) when decrypted under the wrong secret", () => {
    const token = encrypt("secret-a", "sensitive-token-value");
    expect(decrypt("secret-b", token)).toBeUndefined();
  });

  it("fails closed on a tampered token", () => {
    const secret = "test-secret-one";
    const token = encrypt(secret, "sensitive-token-value");
    // Flip a character in the middle of the base64url payload -- GCM's auth
    // tag must reject this, not silently decrypt to garbage.
    const tampered = token.slice(0, 10) + (token[10] === "A" ? "B" : "A") + token.slice(11);
    expect(decrypt(secret, tampered)).toBeUndefined();
  });

  it("fails closed on garbage input", () => {
    expect(decrypt("any-secret", "not-a-real-token")).toBeUndefined();
    expect(decrypt("any-secret", "")).toBeUndefined();
  });
});
