import { ApiError } from "./http";
import { randomBase64Url, secretsEqual, sha256Hex } from "./security";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string): Uint8Array {
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/g, "")) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new ApiError(400, "INVALID_TOTP_SECRET");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

function encryptionKey(raw: string): Uint8Array {
  const key = base64UrlBytes(raw);
  if (key.length !== 32) throw new ApiError(503, "AUTH_ENCRYPTION_KEY_INVALID");
  return key;
}

export async function encryptTotpSecret(secret: string, rawKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(encryptionKey(rawKey)).buffer, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: Uint8Array.from(iv).buffer },
    key,
    new TextEncoder().encode(secret),
  );
  return `${bytesBase64Url(iv)}.${bytesBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptTotpSecret(value: string, rawKey: string): Promise<string> {
  const [ivValue, cipherValue] = value.split(".");
  if (!ivValue || !cipherValue) throw new ApiError(503, "MFA_SECRET_INVALID");
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(encryptionKey(rawKey)).buffer, "AES-GCM", false, ["decrypt"]);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(base64UrlBytes(ivValue)).buffer },
      key,
      Uint8Array.from(base64UrlBytes(cipherValue)).buffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ApiError(503, "MFA_SECRET_INVALID");
  }
}

async function totpAt(secret: string, counter: number): Promise<string> {
  const counterBytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = remaining & 255;
    remaining = Math.floor(remaining / 256);
  }
  const key = await crypto.subtle.importKey(
    "raw", Uint8Array.from(base32Decode(secret)).buffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = digest[digest.length - 1]! & 15;
  const binary = ((digest[offset]! & 127) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(secret: string, candidate: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(candidate)) return false;
  const counter = Math.floor(now / 30_000);
  for (const drift of [-1, 0, 1]) {
    if (await secretsEqual(await totpAt(secret, counter + drift), candidate)) return true;
  }
  return false;
}

export function createTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function createRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBase64Url(9).replace(/[_-]/g, "A").toUpperCase().slice(0, 12);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export async function hashRecoveryCode(value: string): Promise<string> {
  return sha256Hex(value.trim().toUpperCase().replace(/\s/g, ""));
}
