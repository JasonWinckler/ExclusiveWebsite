import { describe, expect, it } from "vitest";
import {
  ageDeletionConfirmationMessageId,
  ageDeletionReceiptReference,
  ageVerificationDeletionEmail,
} from "../src/shared/age-verification-email";

describe("age verification deletion confirmation", () => {
  const caseId = "123e4567-e89b-12d3-a456-426614174000";

  it("creates a stable non-sensitive deletion reference", () => {
    expect(ageDeletionReceiptReference(caseId)).toBe("AV-123E4567E8");
  });

  it("keeps the transactional message id within the private mail API limit", () => {
    const messageId = ageDeletionConfirmationMessageId(caseId);
    expect(messageId).toHaveLength(36);
    expect(messageId).toMatch(/^age-[A-Za-z0-9]+$/);
  });

  it("renders localized receipt details and escapes member content", () => {
    const german = ageVerificationDeletionEmail({
      locale: "de",
      displayName: "<Jason>",
      deletedAt: "2026-07-31T09:30:00.000Z",
      deletionReference: "AV-123E4567E8",
    });
    const english = ageVerificationDeletionEmail({
      locale: "en",
      displayName: "Member",
      deletedAt: "2026-07-31T09:30:00.000Z",
      deletionReference: "AV-123E4567E8",
    });

    expect(german.subject).toContain("Löschbestätigung");
    expect(german.html).toContain("AV-123E4567E8");
    expect(german.html).toContain("&lt;Jason&gt;");
    expect(german.html).not.toContain("<Jason>");
    expect(english.subject).toContain("Deletion receipt");
    expect(english.html).toContain("privacy data copy");
  });
});
