import { isoNow } from "./db";
import { ApiError } from "./http";
import { sendTransactionalEmail } from "./identity-service";

type AgeVerificationLocale = "de" | "en";

interface AgeVerificationEmailEnv {
  DB: D1Database;
  IDENTITY_PROJECTION: Service;
  LABEL_SYNC_SERVICE_SECRET: string;
}

interface AgeVerificationDeletionEmailInput {
  locale: AgeVerificationLocale;
  displayName: string;
  deletedAt: string;
  deletionReference: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formattedDateTime(value: string, locale: AgeVerificationLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export function ageDeletionReceiptReference(caseId: string): string {
  return `AV-${caseId.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()}`;
}

export function ageDeletionConfirmationMessageId(caseId: string): string {
  return `age-${caseId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
}

export function ageVerificationDeletionEmail(
  input: AgeVerificationDeletionEmailInput,
): { subject: string; html: string } {
  const isGerman = input.locale === "de";
  const deletedAt = escapeHtml(formattedDateTime(input.deletedAt, input.locale));
  const deletionReference = escapeHtml(input.deletionReference);
  const displayName = escapeHtml(input.displayName);
  const copy = isGerman
    ? {
      subject: "Altersverifikation bestätigt · Löschbestätigung",
      preheader: "Deine Altersverifikation ist abgeschlossen und die privaten Prüfdateien wurden gelöscht.",
      kicker: "VERIFIKATION ABGESCHLOSSEN",
      title: "Dein Zugang ist altersbestätigt.",
      greeting: `Hallo ${displayName},`,
      intro: "die manuelle Prüfung wurde erfolgreich abgeschlossen. Deine privaten Dokumentaufnahmen und das Live-Verifikationsvideo wurden anschließend aus dem geschützten Prüfbereich gelöscht.",
      deletionTitle: "Deine Löschbestätigung",
      deletedAt: "Löschung abgeschlossen",
      reference: "Löschreferenz",
      retained: "Gespeichert bleiben ausschließlich die notwendige Prüfentscheidung und dieser Löschvermerk. Die Referenz ist außerdem in deiner persönlichen Datenschutz-Datenkopie enthalten.",
      cta: "Datenschutzbereich öffnen",
      help: "Bitte bewahre diese E-Mail bei Bedarf als Bestätigung auf. Bei Rückfragen kannst du direkt auf diese Nachricht antworten.",
      legal: "Rechtliches & Datenschutz",
      privacy: "Datenschutzerklärung",
    }
    : {
      subject: "Age verification confirmed · Deletion receipt",
      preheader: "Your age verification is complete and the private review files have been deleted.",
      kicker: "VERIFICATION COMPLETE",
      title: "Your access is age-confirmed.",
      greeting: `Hello ${displayName},`,
      intro: "the manual review has been completed successfully. Your private document captures and live verification video were then deleted from the protected review area.",
      deletionTitle: "Your deletion receipt",
      deletedAt: "Deletion completed",
      reference: "Deletion reference",
      retained: "Only the necessary verification decision and this deletion record remain. The reference is also included in your personal privacy data copy.",
      cta: "Open privacy center",
      help: "Keep this email as confirmation if needed. You can reply directly if you have any questions.",
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
          <p style="margin:0 0 12px;color:#fff4df;font-size:17px">${copy.greeting}</p>
          <p style="margin:0;color:#d8c2b9;font-size:17px;line-height:1.65">${copy.intro}</p>
        </td></tr>
        <tr><td style="padding:18px 38px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#180008;border:1px solid #5b3028;border-radius:16px">
            <tr><td colspan="2" style="padding:20px 22px 10px;color:#f0b46d;font-weight:bold">${copy.deletionTitle}</td></tr>
            <tr><td style="padding:10px 22px;color:#bdaaa4">${copy.deletedAt}</td><td style="padding:10px 22px;text-align:right;color:#fff4df">${deletedAt}</td></tr>
            <tr><td style="padding:10px 22px 20px;color:#bdaaa4">${copy.reference}</td><td style="padding:10px 22px 20px;text-align:right;color:#fff4df;font-weight:bold">${deletionReference}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 38px 22px;color:#d8c2b9;font-size:14px;line-height:1.65">${copy.retained}</td></tr>
        <tr><td align="center" style="padding:4px 38px 28px">
          <a href="https://exclusive.jason-shadow.com/?action=account" style="display:inline-block;background:linear-gradient(135deg,#f26b2f,#9d122a);color:#fff8eb;text-decoration:none;font-weight:bold;padding:16px 26px;border-radius:999px">${copy.cta}</a>
        </td></tr>
        <tr><td style="padding:0 38px 34px;color:#bdaaa4;font-size:14px;line-height:1.6">
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

export async function sendAgeVerificationDeletionConfirmation(
  env: AgeVerificationEmailEnv,
  caseId: string,
): Promise<"SENT" | "FAILED" | "ALREADY_SENT" | "NOT_ELIGIBLE"> {
  const ageCase = await env.DB.prepare(`
    SELECT c.id, c.appwrite_user_id, c.status, c.evidence_deleted_at,
      c.deletion_confirmation_email_status,
      c.deletion_confirmation_email_attempted_at,
      u.display_name, u.preferred_locale, u.account_status, u.email_verified
    FROM age_verification_cases c
    JOIN user_profiles u ON u.appwrite_user_id = c.appwrite_user_id
    WHERE c.id = ?
    LIMIT 1
  `).bind(caseId).first<{
    id: string;
    appwrite_user_id: string;
    status: string;
    evidence_deleted_at: string | null;
    deletion_confirmation_email_status: string;
    deletion_confirmation_email_attempted_at: string | null;
    display_name: string;
    preferred_locale: "de" | "en" | null;
    account_status: string;
    email_verified: number;
  }>();
  if (!ageCase) throw new ApiError(404, "AGE_CASE_NOT_FOUND");
  if (ageCase.deletion_confirmation_email_status === "SENT") return "ALREADY_SENT";
  if (
    ageCase.status !== "APPROVED" ||
    !ageCase.evidence_deleted_at ||
    ageCase.account_status !== "ACTIVE" ||
    ageCase.email_verified !== 1
  ) return "NOT_ELIGIBLE";

  const now = isoNow();
  const staleAttempt = new Date(Date.parse(now) - 15 * 60_000).toISOString();
  const messageId = ageDeletionConfirmationMessageId(ageCase.id);
  const claim = await env.DB.prepare(`
    UPDATE age_verification_cases
    SET deletion_confirmation_email_status = 'SENDING',
      deletion_confirmation_email_message_id = ?,
      deletion_confirmation_email_attempted_at = ?,
      deletion_confirmation_email_last_error_code = NULL,
      updated_at = ?
    WHERE id = ? AND (
      deletion_confirmation_email_status IN ('PENDING', 'FAILED')
      OR (
        deletion_confirmation_email_status = 'SENDING'
        AND deletion_confirmation_email_attempted_at <= ?
      )
    )
  `).bind(messageId, now, now, ageCase.id, staleAttempt).run();
  if ((claim.meta.changes ?? 0) !== 1) return "NOT_ELIGIBLE";

  const locale: AgeVerificationLocale = ageCase.preferred_locale === "en" ? "en" : "de";
  const email = ageVerificationDeletionEmail({
    locale,
    displayName: ageCase.display_name,
    deletedAt: ageCase.evidence_deleted_at,
    deletionReference: ageDeletionReceiptReference(ageCase.id),
  });
  try {
    await sendTransactionalEmail(env.IDENTITY_PROJECTION, env.LABEL_SYNC_SERVICE_SECRET, {
      userId: ageCase.appwrite_user_id,
      messageId,
      subject: email.subject,
      html: email.html,
    });
    const sentAt = isoNow();
    await env.DB.prepare(`
      UPDATE age_verification_cases
      SET deletion_confirmation_email_status = 'SENT',
        deletion_confirmation_email_sent_at = ?,
        deletion_confirmation_email_last_error_code = NULL,
        updated_at = ?
      WHERE id = ? AND deletion_confirmation_email_status = 'SENDING'
        AND deletion_confirmation_email_message_id = ?
    `).bind(sentAt, sentAt, ageCase.id, messageId).run();
    return "SENT";
  } catch {
    await env.DB.prepare(`
      UPDATE age_verification_cases
      SET deletion_confirmation_email_status = 'FAILED',
        deletion_confirmation_email_last_error_code = 'TRANSACTIONAL_EMAIL_FAILED',
        updated_at = ?
      WHERE id = ? AND deletion_confirmation_email_status = 'SENDING'
        AND deletion_confirmation_email_message_id = ?
    `).bind(isoNow(), ageCase.id, messageId).run();
    return "FAILED";
  }
}
