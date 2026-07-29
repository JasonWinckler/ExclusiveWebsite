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

export interface MembershipRenewalReminderEmailInput {
  locale: MembershipLocale;
  displayName: string;
  productName: string;
  tier: string;
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

export function membershipRenewalReminderMessageId(
  entitlementId: string,
  expiresAt: string,
): string {
  const expiry = expiresAt.replace(/[^0-9]/g, "").slice(0, 14);
  return `ren-${entitlementId.replace(/[^A-Za-z0-9]/g, "").slice(0, 17)}-${expiry}`;
}

export function membershipRenewalReminderEmail(
  input: MembershipRenewalReminderEmailInput,
): { subject: string; html: string } {
  const isGerman = input.locale === "de";
  const product = escapeHtml(input.productName);
  const tier = escapeHtml(tierName(input.tier));
  const expiresAt = escapeHtml(formattedDate(input.expiresAt, input.locale));
  const copy = isGerman
    ? {
      subject: `Noch 7 Tage: Verlängere deine ${tierName(input.tier)} Membership`,
      preheader: `Dein Zugang läuft am ${formattedDate(input.expiresAt, input.locale)} aus.`,
      kicker: "DEIN ZUGANG · NOCH 7 TAGE",
      title: "Lass den Schatten nicht enden.",
      greeting: `Hallo ${input.displayName},`,
      intro: "deine aktuelle Membership endet in sieben Tagen. Da keine automatische Verlängerung stattfindet, entscheidest du selbst, wann dein nächstes Kapitel beginnt.",
      membership: "Aktueller Zugang",
      validUntil: "Aktiv bis",
      cta: "Membership erneut wählen",
      note: "Eine neue Einmalzahlung verlängert deinen Zugang entsprechend der gewählten Laufzeit. Eine höherwertige Membership startet sofort; dein bisheriger Restzugang pausiert und läuft danach weiter.",
      legal: "Rechtliches & Datenschutz",
    }
    : {
      subject: `7 days left: renew your ${tierName(input.tier)} membership`,
      preheader: `Your access ends on ${formattedDate(input.expiresAt, input.locale)}.`,
      kicker: "YOUR ACCESS · 7 DAYS LEFT",
      title: "Do not let the shadow fade.",
      greeting: `Hello ${input.displayName},`,
      intro: "your current membership ends in seven days. There is no automatic renewal, so you decide when your next chapter begins.",
      membership: "Current access",
      validUntil: "Active until",
      cta: "Choose membership again",
      note: "A new one-time payment extends access for the term you choose. A higher-tier membership starts immediately; your remaining current access pauses and continues afterwards.",
      legal: "Legal & privacy",
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
          <p style="margin:0 0 12px;color:#fff4df;font-size:17px">${escapeHtml(copy.greeting)}</p>
          <p style="margin:0;color:#d8c2b9;font-size:17px;line-height:1.65">${copy.intro}</p>
        </td></tr>
        <tr><td style="padding:18px 38px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#180008;border:1px solid #5b3028;border-radius:16px">
            <tr><td style="padding:20px 22px;border-bottom:1px solid #41202a;color:#bdaaa4">${copy.membership}</td><td style="padding:20px 22px;border-bottom:1px solid #41202a;text-align:right;font-weight:bold;color:#fff4df">${product}<br><span style="color:#f0b46d;font-size:13px">${tier}</span></td></tr>
            <tr><td style="padding:18px 22px;color:#bdaaa4">${copy.validUntil}</td><td style="padding:18px 22px;text-align:right;color:#fff4df">${expiresAt}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:10px 38px 28px">
          <a href="https://exclusive.jason-shadow.com/?action=renew#pricing" style="display:inline-block;background:linear-gradient(135deg,#f26b2f,#9d122a);color:#fff8eb;text-decoration:none;font-weight:bold;padding:16px 26px;border-radius:999px">${copy.cta}</a>
        </td></tr>
        <tr><td style="padding:0 38px 34px;color:#bdaaa4;font-size:14px;line-height:1.6">
          <p style="margin:0 0 14px">${copy.note}</p>
          <p style="margin:0"><a href="https://exclusive.jason-shadow.com/legal/" style="color:#f0b46d">${copy.legal}</a></p>
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

export async function sendMembershipRenewalReminder(
  env: MembershipEmailDeliveryEnv,
  entitlementId: string,
): Promise<"SENT" | "FAILED" | "ALREADY_SENT" | "NOT_ELIGIBLE"> {
  const now = isoNow();
  const entitlement = await env.DB.prepare(`
    SELECT e.id, e.appwrite_user_id, e.tier, e.expires_at,
      e.renewal_reminder_status, e.paused_at,
      p.display_name, p.display_name_en,
      u.display_name AS member_name, u.account_status, u.email_verified,
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
    expires_at: string;
    renewal_reminder_status: string;
    paused_at: string | null;
    display_name: string;
    display_name_en: string | null;
    member_name: string;
    account_status: string;
    email_verified: number;
    locale: "de" | "en";
  }>();
  if (!entitlement) throw new ApiError(404, "ENTITLEMENT_NOT_FOUND");
  if (entitlement.renewal_reminder_status === "SENT") return "ALREADY_SENT";
  if (
    entitlement.paused_at ||
    entitlement.account_status !== "ACTIVE" ||
    entitlement.email_verified !== 1 ||
    Date.parse(entitlement.expires_at) <= Date.parse(now)
  ) return "NOT_ELIGIBLE";
  const locale = entitlement.locale === "en" ? "en" : "de";
  const messageId = membershipRenewalReminderMessageId(
    entitlement.id,
    entitlement.expires_at,
  );
  const email = membershipRenewalReminderEmail({
    locale,
    displayName: entitlement.member_name,
    productName: locale === "en"
      ? entitlement.display_name_en ?? entitlement.display_name
      : entitlement.display_name,
    tier: entitlement.tier,
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
      UPDATE entitlements SET renewal_reminder_status = 'SENT',
        renewal_reminder_message_id = ?, renewal_reminder_sent_at = ?,
        renewal_reminder_last_error_code = NULL, updated_at = ?
      WHERE id = ?
    `).bind(messageId, sentAt, sentAt, entitlement.id).run();
    return "SENT";
  } catch {
    await env.DB.prepare(`
      UPDATE entitlements SET renewal_reminder_status = 'FAILED',
        renewal_reminder_message_id = ?,
        renewal_reminder_last_error_code = 'TRANSACTIONAL_EMAIL_FAILED',
        updated_at = ?
      WHERE id = ?
    `).bind(messageId, isoNow(), entitlement.id).run();
    return "FAILED";
  }
}
