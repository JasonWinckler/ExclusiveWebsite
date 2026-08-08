import React, { useEffect, useState } from "react";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotpMfa,
  getMfaStatus,
} from "./lib/platform";
import { friendlyErrorMessage } from "./lib/error-messages";

const text = {
  de: {
    eyebrow: "OPTIONALER KONTOSCHUTZ",
    title: "Zwei-Faktor-Authentifizierung",
    intro: "Schütze dein Konto zusätzlich mit einer Authenticator-App. Die Funktion ist freiwillig und kann jederzeit wieder deaktiviert werden.",
    active: "Aktiv",
    inactive: "Nicht aktiviert",
    start: "Authenticator-App einrichten",
    scan: "Scanne den QR-Code mit deiner Authenticator-App und gib anschließend den sechsstelligen Code ein.",
    secret: "Einrichtungsschlüssel",
    code: "6-stelliger Sicherheitscode",
    confirm: "Prüfen und MFA aktivieren",
    recoveryTitle: "Wiederherstellungscodes sichern",
    recoveryText: "Bewahre diese Einmalcodes getrennt von deinem Passwort auf. Sie werden aus Sicherheitsgründen nur jetzt vollständig angezeigt.",
    download: "Codes herunterladen",
    saved: "Ich habe die Codes sicher gespeichert",
    done: "MFA ist aktiv. Bei deiner nächsten Anmeldung wird zusätzlich ein Code aus deiner Authenticator-App verlangt.",
    disable: "MFA deaktivieren",
    disableQuestion: "Möchtest du den zusätzlichen Kontoschutz wirklich deaktivieren?",
    keep: "Aktiv lassen",
    disableConfirm: "Ja, MFA deaktivieren",
    disabled: "MFA wurde deaktiviert.",
    setupCancelled: "Die unvollständige Einrichtung wurde zurückgesetzt. Du kannst MFA jetzt erneut einrichten.",
    resetSetup: "Einrichtung neu starten",
    incomplete: "Eine frühere Einrichtung wurde nicht abgeschlossen.",
    loading: "Sicherheitsstatus wird geladen …",
    requiredEyebrow: "VERPFLICHTENDER ADMINSCHUTZ",
    requiredIntro: "Bevor du den Admin-Bereich öffnen kannst, richte eine Authenticator-App ein. Diese zusätzliche Absicherung ist für jedes Admin-Konto verpflichtend.",
    continueAdmin: "Recovery-Codes gesichert – Admin-Bereich öffnen",
  },
  en: {
    eyebrow: "OPTIONAL ACCOUNT PROTECTION",
    title: "Two-factor authentication",
    intro: "Add an authenticator app as an extra layer of protection. MFA is optional and can be disabled again at any time.",
    active: "Active",
    inactive: "Not enabled",
    start: "Set up authenticator app",
    scan: "Scan the QR code with your authenticator app, then enter its six-digit code.",
    secret: "Setup key",
    code: "6-digit security code",
    confirm: "Verify and enable MFA",
    recoveryTitle: "Save your recovery codes",
    recoveryText: "Keep these one-time codes separate from your password. For security, they are shown in full only now.",
    download: "Download codes",
    saved: "I have stored the codes safely",
    done: "MFA is active. Your next sign-in will also require a code from your authenticator app.",
    disable: "Disable MFA",
    disableQuestion: "Do you really want to remove this extra layer of account protection?",
    keep: "Keep enabled",
    disableConfirm: "Yes, disable MFA",
    disabled: "MFA has been disabled.",
    setupCancelled: "The incomplete setup was reset. You can now configure MFA again.",
    resetSetup: "Restart setup",
    incomplete: "A previous setup was not completed.",
    loading: "Loading security status …",
    requiredEyebrow: "REQUIRED ADMIN PROTECTION",
    requiredIntro: "Before you can open the admin area, set up an authenticator app. This additional protection is required for every administrator account.",
    continueAdmin: "Recovery codes saved — open admin area",
  },
};

export default function MfaPanel({ language, user, onUserUpdate, required = false }) {
  const t = text[language] || text.de;
  const [status, setStatus] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [qrCode, setQrCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);

  const refresh = async () => {
    setBusy(true);
    try {
      const next = await getMfaStatus();
      setStatus(next);
      return next;
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language));
      return null;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [user?.$id]);

  useEffect(() => {
    let current = true;
    if (!enrollment?.uri) {
      setQrCode("");
      return () => { current = false; };
    }
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(enrollment.uri, {
        width: 320,
        margin: 1,
        color: { dark: "#170008", light: "#fff8ea" },
      }))
      .then((result) => {
        if (current) setQrCode(result);
      })
      .catch(() => {
        if (current) setQrCode("");
      });
    return () => { current = false; };
  }, [enrollment?.uri]);

  const startEnrollment = async () => {
    setBusy(true);
    setNotice("");
    try {
      const created = await beginTotpEnrollment();
      setEnrollment(created);
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  };

  const finishEnrollment = async (event) => {
    event.preventDefault();
    const otp = String(new FormData(event.currentTarget).get("otp") || "").replace(/\s/g, "");
    setBusy(true);
    setNotice("");
    try {
      const result = await confirmTotpEnrollment(otp);
      setRecoveryCodes(result.recoveryCodes);
      setStatus((previous) => ({
        ...(previous || {}),
        enabled: true,
        factors: { ...(previous?.factors || {}), totp: true, recoveryCode: true },
        user: result.user,
      }));
      setEnrollment(null);
      setPendingUser(result.user);
      if (!required) onUserUpdate?.(result.user);
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  };

  const downloadRecoveryCodes = () => {
    const blob = new Blob(
      [`Shadow's Temptation MFA recovery codes\n\n${recoveryCodes.join("\n")}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shadows-temptation-recovery-codes.txt";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const disableMfa = async () => {
    setBusy(true);
    setNotice("");
    try {
      const nextUser = await disableTotpMfa();
      setStatus((previous) => ({
        ...(previous || {}),
        enabled: false,
        factors: { ...(previous?.factors || {}), totp: false, recoveryCode: false },
        user: nextUser,
      }));
      setRecoveryCodes([]);
      setRecoveryConfirmed(false);
      setConfirmDisable(false);
      setNotice(t.disabled);
      onUserUpdate?.(nextUser);
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  };

  if (busy && !status && !enrollment) {
    return <div className="security-settings"><p className="upload-note">{t.loading}</p></div>;
  }

  return <div className="security-settings">
    <article className="security-card">
      <div className="security-card__heading">
        <span className={`security-status-dot${status?.enabled ? " is-active" : ""}`} aria-hidden="true" />
        <div>
          <p className="eyebrow">{required ? t.requiredEyebrow : t.eyebrow}</p>
          <h3>{t.title}</h3>
          <p>{required ? t.requiredIntro : t.intro}</p>
        </div>
        <strong className={`status-chip${status?.enabled ? " is-active" : ""}`}>
          {status?.enabled ? t.active : t.inactive}
        </strong>
      </div>

      {notice && <p className="form-notice" role="status">{notice}</p>}

      {!status?.enabled && !enrollment && !status?.factors?.totp && (
        <button className="primary-action" type="button" disabled={busy} onClick={startEnrollment}>
          {t.start}
        </button>
      )}

      {!status?.enabled && !enrollment && status?.factors?.totp && (
        <div className="security-confirmation">
          <p>{t.incomplete}</p>
          <button className="secondary-action" type="button" disabled={busy} onClick={disableMfa}>
            {t.resetSetup}
          </button>
        </div>
      )}

      {enrollment && <form className="mfa-enrollment" onSubmit={finishEnrollment}>
        <p>{t.scan}</p>
        <div className="mfa-enrollment__setup">
          {qrCode
            ? <img src={qrCode} alt={language === "de" ? "QR-Code für die Authenticator-App" : "Authenticator app QR code"} />
            : <div className="mfa-qr-placeholder" aria-hidden="true" />}
          <div>
            <span>{t.secret}</span>
            <code>{enrollment.secret}</code>
          </div>
        </div>
        <label className="form-field">
          <span>{t.code}</span>
          <input
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength="6"
            maxLength="6"
            required
          />
        </label>
        <button className="primary-action" disabled={busy}>{t.confirm}</button>
      </form>}

      {status?.enabled && recoveryCodes.length > 0 && <section className="mfa-recovery">
        <h4>{t.recoveryTitle}</h4>
        <p>{t.recoveryText}</p>
        <div className="mfa-recovery__codes">
          {recoveryCodes.map((code) => <code key={code}>{code}</code>)}
        </div>
        <button className="secondary-action" type="button" onClick={downloadRecoveryCodes}>{t.download}</button>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={recoveryConfirmed}
            onChange={(event) => setRecoveryConfirmed(event.target.checked)}
          />
          <span>{t.saved}</span>
        </label>
        {recoveryConfirmed && <p className="form-notice" role="status">{t.done}</p>}
        {required && recoveryConfirmed && pendingUser && (
          <button className="primary-action" type="button" onClick={() => onUserUpdate?.(pendingUser)}>
            {t.continueAdmin}
          </button>
        )}
      </section>}

      {!required && status?.enabled && recoveryCodes.length === 0 && !confirmDisable && (
        <button className="danger-action" type="button" disabled={busy} onClick={() => setConfirmDisable(true)}>
          {t.disable}
        </button>
      )}

      {!required && status?.enabled && confirmDisable && <div className="security-confirmation">
        <p>{t.disableQuestion}</p>
        <div>
          <button className="secondary-action" type="button" onClick={() => setConfirmDisable(false)}>{t.keep}</button>
          <button className="danger-action" type="button" disabled={busy} onClick={disableMfa}>{t.disableConfirm}</button>
        </div>
      </div>}
    </article>
  </div>;
}
