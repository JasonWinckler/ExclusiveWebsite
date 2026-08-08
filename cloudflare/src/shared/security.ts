import { ApiError } from "./http";

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return bytesToHex(new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
  ));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomBase64Url(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function validatePassword(password: unknown): string {
  if (
    typeof password !== "string" ||
    password.length < 6 ||
    password.length > 128 ||
    !/[\p{L}\p{N}]/u.test(password) ||
    !/[^\p{L}\p{N}\s]/u.test(password) ||
    /[\u0000-\u001f\u007f]/.test(password)
  ) throw new ApiError(400, "PASSWORD_POLICY_NOT_MET");
  return password;
}

export async function hashPassword(
  password: string,
  salt = randomBase64Url(16),
  iterations = 600_000,
): Promise<{ hash: string; salt: string; iterations: number }> {
  validatePassword(password);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: Uint8Array.from(base64UrlToBytes(salt)).buffer,
    iterations,
  }, material, 256);
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt, iterations };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  if (!password || !expectedHash || !salt) return false;
  const derived = await hashPassword(password, salt, iterations);
  return secretsEqual(expectedHash, derived.hash);
}

export async function secretsEqual(expected: string, actual: string): Promise<boolean> {
  if (!expected || !actual) return false;
  const encoder = new TextEncoder();
  const [expectedHash, actualHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
  ]);
  const subtle = crypto.subtle;
  if ("timingSafeEqual" in subtle && typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(expectedHash, actualHash);
  }
  const left = new Uint8Array(expectedHash);
  const right = new Uint8Array(actualHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export function validateDeviceToken(value: string | null): string {
  const token = value?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new ApiError(401, "VALID_DEVICE_TOKEN_REQUIRED");
  }
  return token;
}
