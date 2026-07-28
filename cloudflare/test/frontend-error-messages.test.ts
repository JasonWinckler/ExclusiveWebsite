import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "../../src/lib/error-messages.js";

describe("customer-facing error messages", () => {
  it("uses the Appwrite error type instead of displaying a numeric status", () => {
    expect(friendlyErrorMessage({
      code: 401,
      type: "user_invalid_credentials",
    }, "de")).toBe("E-Mail-Adresse oder Passwort ist nicht korrekt.");
  });

  it("turns an otherwise unknown 403 into a useful localized explanation", () => {
    expect(friendlyErrorMessage({ code: 403 }, "de"))
      .toBe("Du bist für diese Aktion nicht berechtigt.");
    expect(friendlyErrorMessage({ status: 403 }, "en"))
      .toBe("You are not permitted to perform this action.");
  });

  it("explains deletion holds without exposing an internal API code", () => {
    const message = friendlyErrorMessage({
      status: 409,
      code: "DELETION_BLOCKED_ADMINISTRATIVE_HOLD",
    }, "de");
    expect(message).toContain("rechtlich erforderlichen Sperre");
    expect(message).not.toContain("DELETION_BLOCKED");
  });

  it("adds a safe request reference to service failures", () => {
    expect(friendlyErrorMessage({
      status: 503,
      code: "MEMBERSHIP_DATABASE_UNAVAILABLE",
      requestId: "request-123456",
    }, "de")).toContain("Referenz: request-123456");
  });
});
