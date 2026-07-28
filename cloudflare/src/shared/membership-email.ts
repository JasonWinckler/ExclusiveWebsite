import { isoNow } from "./db";
import { ApiError } from "./http";
import { sendTransactionalEmail } from "./identity-service";

type MembershipLocale = "de" | "en";

export interface MembershipActivationEmailInput {
  locale: MembershipLocale;
  productName: string;
  tier: string;
  startsAt: string;
  expiresAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formattedDate(value: string, locale: MembershipLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function tierName(tier: string): string {
  return tier
    .replace(/^EXCLUSIVE_/, "Exclusive ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function membershipActivationMessageId(entitlementId: string): string {
  return `act-${entitlementId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
}

export function membershipActivationEmail(
  input: MembershipActivationEmailInput,
): { subject: string; html: string } {
  const isGerman = input.locale === "de";
  const product = escapeHtml(input.productName);
  const tier = escapeHtml(tierName(input.tier));
  const startsAt = escapeHtml(formattedDate(input.startsAt, input.locale));
  const expiresAt = escapeHtml(formattedDate(input.expiresAt, input.locale));
  const copy = isGerman
    ? {
      subject: `Deine ${tierName(input.tier)} Membership wurde bestätigt`,
      preheader: `${input.productName} und dein Zugangszeitraum wurden bestätigt.`,
      kicker: "DEIN ZUGANG IST BESTÄTIGT",
      title: "Willkommen hinter dem Schatten.",
      intro: "Dein Zahlungseingang wurde bestätigt und dein persönlicher Zugangszeitraum ist jetzt verbindlich hinterlegt.",
      product: "Membership",
      period: "Dein Zugangszeitraum",
      activeFrom: "Aktiv ab",
      activeUntil: "Aktiv bis",
      note: "Es handelt sich um eine Einmalzahlung ohne automatische Verlängerung. Deinen Status und deine Bestellungen findest du jederzeit im persönlichen Dashboard.",
      cta: "Privaten Bereich öffnen",
      help: "Fragen zu deiner Freischaltung? Antworte einfach auf diese E-Mail.",
      legal: "Rechtliches & Datenschutz",
      privacy: "Datenschutz",
    }
    : {
      subject: `Your ${tierName(input.tier)} membership is confirmed`,
      preheader: `${input.productName} and your access period are confirmed.`,
      kicker: "YOUR ACCESS IS CONFIRMED",
      title: "Welcome beyond the shadow.",
      intro: "Your payment has been confirmed and your personal access period is now securely recorded.",
      product: "Membership",
      period: "Your access period",
      activeFrom: "Active from",
      activeUntil: "Active until",
      note: "This is a one-time payment with no automatic renewal. Your status and orders remain available in your personal dashboard.",
      cta: "Open private area",
      help: "Questions about your access? Simply reply to this email.",
      legal: "Legal & privacy",
      privacy: "Privacy notice",
    };

  return {
    subject: copy.subject,
    html: `<!doctype html>
<html lang="${input.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(copy.subject)}</title></head>
<body style="margin:0;background:#120006;color:#fff4df;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(copy.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#120006">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#25000d;border:1px solid #75452d;border-radius:22px;overflow:hidden">
        <tr><td><img src="cid:shadow-brand-banner" width="680" alt="Shadow's Temptation" style="display:block;width:100%;height:auto;border:0"></td></tr>
        <tr><td style="padding:34px 38px 14px">
          <p style="margin:0 0 12px;color:#f0b46d;font-size:12px;font-weight:700;letter-spacing:3px">${copy.kicker}</p>
          <h1 style="margin:0 0 18px;color:#fff4df;font-family:Georgia,serif;font-size:38px;line-height:1.08">${copy.title}</h1>
          <p style="margin:0;color:#d8c2b9;font-size:17px;line-height:1.65">${copy.intro}</p>
        </td></tr>
        <tr><td style="padding:18px 38px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#180008;border:1px solid #5b3028;border-radius:16px">
            <tr><td style="padding:20px 22px;border-bottom:1px solid #41202a;color:#bdaaa4">${copy.product}</td><td style="padding:20px 22px;border-bottom:1px solid #41202a;text-align:right;font-weight:bold;color:#fff4df">${product}</td></tr>
            <tr><td colspan="2" style="padding:18px 22px 8px;color:#f0b46d;font-weight:bold">${copy.period}</td></tr>
            <tr><td style="padding:8px 22px;color:#bdaaa4">${copy.activeFrom}</td><td style="padding:8px 22px;text-align:right;color:#fff4df">${startsAt}</td></tr>
            <tr><td style="padding:8px 22px 20px;color:#bdaaa4">${copy.activeUntil}</td><td style="padding:8px 22px 20px;text-align:right;color:#fff4df">${expiresAt}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:10px 38px 28px">
          <a href="https://exclusive.jason-shadow.com/?action=account" style="display:inline-block;background:linear-gradient(135deg,#f26b2f,#9d122a);color:#fff8eb;text-decoration:none;font-weight:bold;padding:16px 26px;border-radius:999px">${copy.cta}</a>
        </td></tr>
        <tr><td style="padding:0 38px 34px;color:#bdaaa4;font-size:14px;line-height:1.6">
          <p style="margin:0 0 14px">${copy.note}</p>
          <p style="margin:0 0 14px">${copy.help}</p>
          <p style="margin:0"><a href="https://exclusive.jason-shadow.com/legal/" style="color:#f0b46d">${copy.legal}</a> · <a href="https://exclusive.jason-shadow.com/legal/eu/#privacy" style="color:#f0b46d">${copy.privacy}</a></p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#806c68;font-size:12px">Shadow's Temptation · info@exclusive.jason-shadow.com</p>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

interface MembershipEmailDeliveryEnv {
  DB: D1Database;
  IDENTITY_PROJECTION: Service;
  LABEL_SYNC_SERVICE_SECRET: string;
}

export async function sendMembershipActivationConfirmation(
  env: MembershipEmailDeliveryEnv,
  entitlementId: string,
): Promise<"SENT" | "FAILED" | "ALREADY_SENT"> {
  const entitlement = await env.DB.prepare(`
    SELECT e.id, e.appwrite_user_id, e.tier, e.starts_at, e.expires_at,
      e.activation_email_status, p.display_name, p.display_name_en,
      COALESCE(s.customer_locale, u.preferred_locale, 'de') AS locale
    FROM entitlements e
    JOIN products p ON p.id = e.product_id
    JOIN user_profiles u ON u.appwrite_user_id = e.appwrite_user_id
    LEFT JOIN subscriptions s ON s.id = e.subscription_id
    WHERE e.id = ?
    LIMIT 1
  `).bind(entitlementId).first<{
    id: string;
    appwrite_user_id: string;
    tier: string;
    starts_at: string;
    expires_at: string;
    activation_email_status: string;
    display_name: string;
    display_name_en: string | null;
    locale: "de" | "en";
  }>();
  if (!entitlement) throw new ApiError(404, "ENTITLEMENT_NOT_FOUND");
  if (entitlement.activation_email_status === "SENT") return "ALREADY_SENT";
  const locale = entitlement.locale === "en" ? "en" : "de";
  const messageId = membershipActivationMessageId(entitlement.id);
  const email = membershipActivationEmail({
    locale,
    productName: locale === "en"
      ? entitlement.display_name_en ?? entitlement.display_name
      : entitlement.display_name,
    tier: entitlement.tier,
    startsAt: entitlement.starts_at,
    expiresAt: entitlement.expires_at,
  });
  try {
    await sendTransactionalEmail(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
      userId: entitlement.appwrite_user_id,
      messageId,
      subject: email.subject,
      html: email.html,
    });
    const sentAt = isoNow();
    await env.DB.prepare(`
      UPDATE entitlements SET activation_email_status = 'SENT',
        activation_email_message_id = ?, activation_email_sent_at = ?,
        activation_email_last_error_code = NULL, updated_at = ?
      WHERE id = ?
    `).bind(messageId, sentAt, sentAt, entitlement.id).run();
    return "SENT";
  } catch {
    await env.DB.prepare(`
      UPDATE entitlements SET activation_email_status = 'FAILED',
        activation_email_message_id = ?,
        activation_email_last_error_code = 'TRANSACTIONAL_EMAIL_FAILED',
        updated_at = ?
      WHERE id = ?
    `).bind(messageId, isoNow(), entitlement.id).run();
    return "FAILED";
  }
}
