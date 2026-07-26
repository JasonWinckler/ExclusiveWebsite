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
