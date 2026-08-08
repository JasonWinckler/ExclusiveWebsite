import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashPasswordVerifier,
  passwordMaterialSalt,
  randomBase64Url,
  validatePassword,
  verifyPassword,
  verifyPasswordVerifier,
} from "../src/shared/security";
import { decryptTotpSecret, encryptTotpSecret, verifyTotp } from "../src/shared/totp";

describe("Cloudflare-native authentication cryptography", () => {
  it("hashes passwords with a unique PBKDF2 salt and verifies without storing plaintext", async () => {
    const first = await hashPassword("Shadow!9");
    const second = await hashPassword("Shadow!9");
    expect(first.iterations).toBe(600_000);
    expect(first.hash).not.toBe(second.hash);
    await expect(verifyPassword("Shadow!9", first.hash, first.salt, first.iterations)).resolves.toBe(true);
    await expect(verifyPassword("Wrong!9", first.hash, first.salt, first.iterations)).resolves.toBe(false);
  }, 15_000);

  it("stores only a server-peppered client verifier", async () => {
    const pepper = randomBase64Url(32);
    const credential = {
      verifier: randomBase64Url(32),
      salt: randomBase64Url(16),
      iterations: 600_000,
    };
    const stored = await hashPasswordVerifier(credential, pepper);
    expect(stored).not.toBe(credential.verifier);
    await expect(verifyPasswordVerifier(
      credential.verifier,
      stored,
      credential.salt,
      credential.iterations,
      pepper,
    )).resolves.toBe(true);
    await expect(verifyPasswordVerifier(
      randomBase64Url(32),
      stored,
      credential.salt,
      credential.iterations,
      pepper,
    )).resolves.toBe(false);
    await expect(passwordMaterialSalt("unknown@example.test", pepper))
      .resolves.toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("enforces the configured minimum and a special character", () => {
    expect(validatePassword("Abcd!1")).toBe("Abcd!1");
    expect(() => validatePassword("abcdef")).toThrowError("PASSWORD_POLICY_NOT_MET");
    expect(() => validatePassword("A!1")).toThrowError("PASSWORD_POLICY_NOT_MET");
  });

  it("encrypts TOTP secrets at rest and accepts the RFC 6238 test instant", async () => {
    const key = randomBase64Url(32);
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const encrypted = await encryptTotpSecret(secret, key);
    expect(encrypted).not.toContain(secret);
    await expect(decryptTotpSecret(encrypted, key)).resolves.toBe(secret);
    await expect(verifyTotp(secret, "287082", 59_000)).resolves.toBe(true);
    await expect(verifyTotp(secret, "000000", 59_000)).resolves.toBe(false);
  });
});
