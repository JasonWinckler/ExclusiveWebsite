import { describe, expect, it } from "vitest";
import { extractSepaTransferPurpose } from "../src/workers/admin-api";
import { createSepaTransferPurpose, isValidIban } from "../src/workers/membership-api";

describe("SEPA transfer purpose", () => {
  it("creates the owner-selected human-readable payment purpose", () => {
    expect(createSepaTransferPurpose("a1b2-c3d4-e5f6-7890"))
      .toBe("Exclusive Content - ID #A1B2C3D4E5F6");
  });

  it("extracts the same purpose from an N26 CSV row", () => {
    expect(extractSepaTransferPurpose([
      "Transfer",
      "exclusive content - id #a1b2c3d4e5f6",
      "4,99",
    ])).toBe("Exclusive Content - ID #A1B2C3D4E5F6");
  });

  it("validates an IBAN without embedding production bank data", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("DE001234567890")).toBe(false);
  });
});
