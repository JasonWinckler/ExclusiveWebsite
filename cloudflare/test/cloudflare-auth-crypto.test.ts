import { describe, expect, it } from "vitest";
import { hashPassword, randomBase64Url, validatePassword, verifyPassword } from "../src/shared/security";
import { decryptTotpSecret, encryptTotpSecret, verifyTotp } from "../src/shared/totp";

describe("Cloudflare-native authentication cryptography", () => {
  it("hashes passwords with a unique PBKDF2 salt and verifies without storing plaintext", async () => {
    const first = await hashPassword("Shadow!9");
    const second = await hashPassword("Shadow!9");
    expect(first.iterations).toBe(600_000);
    expect(first.hash).not.toBe(second.hash);
    await expect(verifyPassword("Shadow!9", first.hash, first.salt, first.iterations)).resolves.toBe(true);
    await expect(verifyPassword("Wrong!9", first.hash, first.salt, first.iterations)).resolves.toBe(false);
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

