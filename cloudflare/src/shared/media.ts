import { ApiError } from "./http";

type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4"
  | "video/webm";

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function sniffMediaType(bytes: Uint8Array): SupportedMediaType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) return "image/webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") return "video/mp4";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) return "video/webm";
  return null;
}

export function assertMediaSignature(
  bytes: Uint8Array,
  declaredType: string,
  errorCode: string,
): SupportedMediaType {
  const detected = sniffMediaType(bytes);
  if (!detected || detected !== declaredType) {
    throw new ApiError(415, errorCode);
  }
  return detected;
}
