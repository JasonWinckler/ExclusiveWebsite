import React, { useEffect, useId, useState } from "react";

export default function EmailVerificationForm({ email, verification, busy, notice, language, onConfirm, onResend }) {
  const [code, setCode] = useState("");
  const [now, setNow] = useState(Date.now);
  const hintId = useId();
  const de = language === "de";
  const resendAt = Date.parse(verification?.resendAfter || "") || 0;
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [verification?.resendAfter]);

  return <>
    <p className="modal-intro">{verification?.delivery === "failed"
      ? <>{de ? "Bestätige deine E-Mail-Adresse: " : "Verify your email address: "}<strong>{email}</strong>. {de ? "Du kannst hier bleiben und eine neue E-Mail anfordern." : "You can stay here and request another email."}</>
      : <>{de ? "Gib den sechsstelligen Code aus der E-Mail ein, die wir an " : "Enter the six-digit code from the email sent to "}<strong>{email}</strong>{de ? " gesendet haben. Du bleibst hier und wirst nach der Bestätigung automatisch angemeldet." : ". Stay here — you will be signed in automatically after confirmation."}</>}</p>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <form className="auth-panel email-verification-panel" onSubmit={(event) => {
      event.preventDefault();
      onConfirm(code);
    }}>
      <label className="form-field">
        <span>{de ? "6-stelliger E-Mail-Code" : "6-digit email code"}</span>
        <input name="emailCode" type="text" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" minLength="6" maxLength="6" required autoFocus
          value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text").replace(/\s|-/g, "");
            if (/^[0-9]{6}$/.test(pasted)) { event.preventDefault(); setCode(pasted); }
          }}
          aria-describedby={hintId} disabled={busy} />
      </label>
      <p id={hintId} className="upload-note">{de ? "Der Code ist 15 Minuten gültig. Nutze alternativ den Bestätigungslink in derselben E-Mail." : "The code is valid for 15 minutes. You can also use the confirmation link in the same email."}</p>
      <button type="submit" className="primary-action" disabled={busy || code.length !== 6}>{busy ? (de ? "Wird bestätigt …" : "Verifying …") : (de ? "E-Mail bestätigen & anmelden" : "Verify email & sign in")}</button>
      <button type="button" className="secondary-action" disabled={busy || remaining > 0}
        onClick={async () => { if (await onResend()) setCode(""); }}>
        {remaining > 0 ? (de ? `Neuen Code anfordern in ${remaining} s` : `Request another code in ${remaining}s`) : (de ? "Neuen Code senden" : "Send a new code")}
      </button>
    </form>
  </>;
}
