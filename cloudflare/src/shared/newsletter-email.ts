/** Shared music-brand layout for optional newsletter confirmation and new posts. */
export function newsletterEmailHtml(input: {
  locale: "de" | "en";
  title: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  unsubscribeUrl?: string;
  kicker?: string;
}): string {
  const de = input.locale === "de";
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
  const kicker = input.kicker || (de ? "MUSIK. STIMME. NÄHE." : "MUSIC. VOICE. CONNECTION.");
  return `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(input.title)} · The Order of Shadows</title></head>
<body style="margin:0;background:#240007;color:#fff8ef;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(input.intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#240007"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border:1px solid #70554a;background:#31000b">
<tr><td align="center" style="padding:20px 40px 0"><img src="cid:shadow-brand-banner" width="360" alt="Jason Shadow · The Healing Shadow" style="display:block;width:100%;max-width:360px;height:auto;border:0"></td></tr>
<tr><td style="padding:8px 40px 40px"><p style="margin:0 0 24px;text-align:center;color:#efd18a;font-size:11px;letter-spacing:3px">THE ORDER OF SHADOWS</p><div style="height:1px;background:#70554a;margin:0 0 36px"></div>
<p style="margin:0 0 14px;color:#efd18a;font-size:10px;font-weight:bold;letter-spacing:2px">${escape(kicker)}</p>
<h1 style="margin:0 0 22px;color:#fff8ef;font-family:Georgia,serif;font-size:38px;font-weight:normal;line-height:1.15">${escape(input.title)}</h1>
<p style="margin:0;color:#dfcec5;font-size:16px;line-height:1.8">${escape(input.intro)}</p>
<p style="margin:30px 0"><a href="${escape(input.actionUrl)}" style="display:inline-block;padding:16px 25px;background:#efd18a;color:#240007;text-decoration:none;font-size:14px;font-weight:bold">${escape(input.actionLabel)} &nbsp; →</a></p>
<p style="margin:0;color:#bba89e;font-size:13px;line-height:1.7">${de ? "Danke, dass du Musik und Geschichten eine Stimme gibst." : "Thank you for helping give music and stories a voice."}<br><span style="color:#efd18a;font-family:Georgia,serif;font-size:20px">Jason Shadow</span></p>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #70554a;background:#240007;color:#bba89e;font-size:12px;line-height:1.9">
The Order of Shadows · Jason Shadow<br><a href="https://jason-shadow.com" style="color:#efd18a">${de ? "Musik & Sprecherarbeit" : "Music & voice work"}</a> · <a href="https://exclusive.jason-shadow.com/legal/" style="color:#efd18a">${de ? "Rechtliches & Datenschutz" : "Legal & privacy"}</a><br>
<a href="mailto:info@exclusive.jason-shadow.com" style="color:#efd18a">${de ? "Kontakt" : "Contact"}</a>${input.unsubscribeUrl ? ` · <a href="${escape(input.unsubscribeUrl)}" style="color:#efd18a">${de ? "Newsletter abbestellen" : "Unsubscribe"}</a>` : `<br>${de ? "Nicht angefordert? Ignoriere diese Nachricht. Ohne Bestätigung erhältst du keinen Newsletter." : "Didn’t request this? Ignore this message. You won’t receive the newsletter without confirming."}`}
</td></tr></table></td></tr></table></body></html>`;
}
