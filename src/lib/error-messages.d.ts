export interface FriendlyErrorLike {
  code?: string | number;
  type?: string;
  message?: string;
  status?: number;
  requestId?: string | null;
}

export function friendlyErrorMessage(
  error: FriendlyErrorLike | null | undefined,
  language?: "de" | "en" | string,
  fallback?: string,
): string;
