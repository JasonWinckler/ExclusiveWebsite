import { describe, expect, it } from "vitest";
import { membershipActivationEmail, membershipRenewalReminderEmail, telegramAccessEmail } from "../src/shared/membership-email";
import { newsletterEmailHtml } from "../src/shared/newsletter-email";

describe("music membership email copy", () => {
  it.each([
    ["EXCLUSIVE_BASIC", "Basic Shadow"],
    ["EXCLUSIVE_PREMIUM", "Premium Shadow"],
    ["EXCLUSIVE_VIP", "VIP Shadow"],
  ])("uses the current %s display name without changing the internal tier", (tier, name) => {
    for (const locale of ["de", "en"] as const) {
      const activation = membershipActivationEmail({ locale, productName: `${name} — 30`, tier,
        startsAt: "2026-10-30T10:00:00Z", expiresAt: "2026-11-29T10:00:00Z" });
      const renewal = membershipRenewalReminderEmail({ locale, displayName: "Music Supporter", productName: `${name} — 30`, tier,
        expiresAt: "2026-11-29T10:00:00Z" });
      const telegram = telegramAccessEmail({ locale, displayName: "Music Supporter", tier });
      expect(activation.subject).toContain(name);
      expect(renewal.subject).toContain(name);
      expect(telegram.html).toContain(name);
      for (const email of [activation, renewal, telegram]) {
        expect(email.html).not.toMatch(/\bOrden\b|Temptation/i);
        expect(email.html).toContain("Jason Shadow · The Healing Shadow");
        expect(email.html).toContain("https://exclusive.jason-shadow.com/");
      }
    }
  });

  it.each(["de", "en"] as const)("brands both confirmation and post newsletters in %s", (locale) => {
    for (const unsubscribeUrl of [undefined, "https://exclusive.jason-shadow.com/api/member/v1/newsletter/action?purpose=unsubscribe&token=example"]) {
      const html = newsletterEmailHtml({ locale, title: "New music", intro: "Behind the scenes", actionLabel: "Open",
        actionUrl: "https://exclusive.jason-shadow.com/", unsubscribeUrl });
      expect(html).toContain("Jason Shadow · The Healing Shadow");
      expect(html).toContain("The Order of Shadows · Jason Shadow");
      expect(html).not.toMatch(/\bOrden\b|Temptation/i);
      expect(html).toContain(unsubscribeUrl ? (locale === "de" ? "Newsletter abbestellen" : "Unsubscribe") :
        (locale === "de" ? "Ohne Bestätigung" : "without confirming"));
    }
  });
});
