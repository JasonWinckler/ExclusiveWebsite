import React, { useEffect, useMemo, useState } from "react";
import { countryOptions, usRegions } from "./lib/privacy";

function dateLabel(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default function PrivacyPanel({
  language,
  privacy,
  loading,
  busy,
  onSaveLocation,
  onSubscribeNewsletter,
  onUnsubscribeNewsletter,
  onExport,
  onCreateRequest,
  onCancelRequest,
  onDeleteAccount,
}) {
  const de = language === "de";
  const [countryCode, setCountryCode] = useState("DE");
  const [regionCode, setRegionCode] = useState("");
  const [requestType, setRequestType] = useState("RESTRICT_PROCESSING");
  const [requestNote, setRequestNote] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [deletionPhrase, setDeletionPhrase] = useState("");
  const countries = useMemo(() => countryOptions(language), [language]);

  useEffect(() => {
    if (!privacy) return;
    setCountryCode(privacy.profile?.countryCode || "DE");
    setRegionCode(privacy.profile?.regionCode || "");
  }, [privacy]);

  if (loading && !privacy) {
    return <div className="privacy-loading" role="status">
      <span className="privacy-loading__mark">◌</span>
      <p>{de ? "Deine Datenschutz-Einstellungen werden sicher geladen …" : "Loading your privacy settings securely …"}</p>
    </div>;
  }

  const profile = privacy?.profile || {};
  const isUS = countryCode === "US";
  const regimeLabel = profile.regime === "EU_GDPR"
    ? (de ? "EU / EWR · DSGVO" : "EU / EEA · GDPR")
    : profile.regime === "US_STATE_PRIVACY"
      ? `USA · ${profile.regionCode || ""}`
      : (de ? "Globaler Datenschutzstandard" : "Global privacy baseline");
  const legalPath = profile.regime === "US_STATE_PRIVACY" ? "/legal/us/#privacy" : "/legal/eu/#privacy";
  const requests = privacy?.requests || [];

  const submitLocation = (event) => {
    event.preventDefault();
    onSaveLocation({ countryCode, regionCode: isUS ? regionCode : null });
  };
  const submitRequest = async (event) => {
    event.preventDefault();
    await onCreateRequest(requestType, requestNote);
    setRequestNote("");
  };
  const submitDeletion = async (event) => {
    event.preventDefault();
    const accepted = de
      ? deletionPhrase.trim().toLocaleUpperCase("de-DE") === "LÖSCHEN"
      : deletionPhrase.trim().toUpperCase() === "DELETE";
    if (!deletionConfirmed || !accepted) return;
    await onDeleteAccount(deletionReason);
  };

  return <div className="privacy-dashboard">
    <section className="privacy-hero">
      <div>
        <p className="eyebrow">{de ? "DEINE DATEN. DEINE KONTROLLE." : "YOUR DATA. YOUR CONTROL."}</p>
        <h3>{de ? "Privacy Center" : "Privacy center"}</h3>
        <p>{de
          ? "Verwalte deinen Wohnsitz, deine Datenkopie und deine gesetzlichen Betroffenenrechte an einem Ort."
          : "Manage your residence, data copy and statutory privacy rights in one place."}</p>
      </div>
      <span className="privacy-regime-badge">{regimeLabel}</span>
    </section>

    <div className="privacy-grid">
      <form className="privacy-card privacy-card--location" onSubmit={submitLocation}>
        <div className="privacy-card__heading">
          <span>01</span>
          <div><h4>{de ? "Wohnsitz & Rechtsraum" : "Residence & jurisdiction"}</h4>
            <p>{de
              ? "Deine Angabe bestimmt, welche zusätzlichen Rechte und Fristen angezeigt werden."
              : "Your selection determines which additional rights and timelines are shown."}</p></div>
        </div>
        <label className="field"><span>{de ? "Land des gewöhnlichen Aufenthalts" : "Country of residence"}</span>
          <select name="countryCode" value={countryCode} onChange={(event) => {
            setCountryCode(event.target.value);
            if (event.target.value !== "US") setRegionCode("");
          }} required>
            {countries.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
          </select>
        </label>
        {isUS && <label className="field"><span>{de ? "US-Bundesstaat / Territorium" : "U.S. state / territory"}</span>
          <select name="regionCode" value={regionCode} onChange={(event) => setRegionCode(event.target.value)} required>
            <option value="">{de ? "Bitte auswählen" : "Select state"}</option>
            {usRegions.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
          </select>
        </label>}
        <p className="privacy-fineprint">{de
          ? "Mit dem Speichern bestätigst du, dass die Angabe aktuell und wahrheitsgemäß ist, und nimmst die aktuelle Datenschutzerklärung zur Kenntnis."
          : "By saving, you confirm that this information is current and accurate and acknowledge the current privacy notice."}{" "}
          <a href={legalPath} target="_blank" rel="noreferrer">{de ? "Datenschutzerklärung" : "Privacy notice"}</a>
        </p>
        <button className="secondary-action" disabled={busy || (isUS && !regionCode)}>
          {de ? "Rechtsraum speichern" : "Save jurisdiction"}
        </button>
      </form>

      <section className="privacy-card privacy-card--export">
        <div className="privacy-card__heading">
          <span>02</span>
          <div><h4>{de ? "Auskunft & Datenkopie" : "Access & data copy"}</h4>
            <p>{de
              ? "Lade deine bei uns gespeicherten Daten direkt als maschinenlesbare JSON-Datei herunter."
              : "Download the data we hold about you as a machine-readable JSON file."}</p></div>
        </div>
        <ul className="privacy-feature-list">
          <li>{de ? "Profil- und Datenschutzeinstellungen" : "Profile and privacy settings"}</li>
          <li>{de ? "Bestellungen, Rechnungen und Zugänge" : "Orders, invoices and access records"}</li>
          <li>{de ? "Verifikationsstatus, Löschbestätigungen, Geräte und Kommentare" : "Verification status, deletion receipts, devices and comments"}</li>
        </ul>
        <button className="primary-action" type="button" disabled={busy || !profile.complete} onClick={onExport}>
          {de ? "Meine Daten herunterladen" : "Download my data"}
        </button>
        <p className="privacy-fineprint">{de
          ? "Private Prüfdateien sind nicht enthalten. Nach ihrer Löschung enthält die Datenkopie stattdessen den Löschvermerk und die zugehörige Referenz."
          : "Private review files are not included. After deletion, the data copy contains the deletion record and its reference instead."}</p>
      </section>
    </div>

    <section className="privacy-card privacy-card--newsletter">
      <div className="privacy-card__heading">
        <span>03</span>
        <div><h4>{de ? "New Drops Newsletter" : "New Drops newsletter"}</h4>
          <p>{de
            ? "Erhalte neue Veröffentlichungen, ausgewählte Einblicke und Membership-Impulse. Freiwillig, mit einmaliger E-Mail-Bestätigung und jederzeit abbestellbar."
            : "Receive new releases, selected previews and membership inspiration. Voluntary, confirmed once by email and cancellable at any time."}</p></div>
      </div>
      <div className="privacy-card__actions">
        {privacy?.newsletter?.status === "SUBSCRIBED"
          ? <button type="button" className="secondary-action" disabled={busy} onClick={onUnsubscribeNewsletter}>
            {de ? "Newsletter abbestellen" : "Unsubscribe"}
          </button>
          : <button type="button" className="primary-action" disabled={busy || !profile.complete} onClick={onSubscribeNewsletter}>
            {privacy?.newsletter?.status === "PENDING"
              ? (de ? "Bestätigung erneut senden" : "Resend confirmation")
              : (de ? "New Drops erhalten" : "Get New Drops")}
          </button>}
        <span>{privacy?.newsletter?.status === "SUBSCRIBED"
          ? (de ? "Aktiv und bestätigt" : "Active and confirmed")
          : privacy?.newsletter?.status === "PENDING"
            ? (de ? "Bestätigung ausstehend" : "Confirmation pending")
            : (de ? "Nicht abonniert" : "Not subscribed")}</span>
      </div>
      <p className="privacy-fineprint">{de
        ? "Der Newsletter enthält immer einen direkten Abmeldelink. Sicherheits-, Konto- und Rechnungsnachrichten sind davon unabhängig."
        : "Every newsletter includes a direct unsubscribe link. Security, account and invoice messages are independent of this choice."}</p>
    </section>

    <div className="privacy-grid">
      <form className="privacy-card" onSubmit={submitRequest}>
        <div className="privacy-card__heading">
          <span>04</span>
          <div><h4>{de ? "Weiteres Recht ausüben" : "Exercise another right"}</h4>
            <p>{de
              ? "Für Einschränkung, Widerspruch oder Beschwerdeprüfung kannst du eine nachvollziehbare Anfrage stellen."
              : "Submit a traceable request for restriction, objection or review of a privacy decision."}</p></div>
        </div>
        <label className="field"><span>{de ? "Art der Anfrage" : "Request type"}</span>
          <select value={requestType} onChange={(event) => setRequestType(event.target.value)}>
            <option value="RESTRICT_PROCESSING">{de ? "Verarbeitung einschränken" : "Restrict processing"}</option>
            <option value="OBJECT_PROCESSING">{de ? "Verarbeitung widersprechen" : "Object to processing"}</option>
            <option value="APPEAL">{de ? "Datenschutzentscheidung überprüfen" : "Appeal a privacy decision"}</option>
          </select>
        </label>
        <label className="field"><span>{de ? "Worum geht es?" : "Tell us what this concerns"}</span>
          <textarea value={requestNote} onChange={(event) => setRequestNote(event.target.value)}
            minLength="10" maxLength="1000" required rows="4" />
        </label>
        <button className="secondary-action" disabled={busy || !profile.complete}>
          {de ? "Anfrage verbindlich senden" : "Submit request"}
        </button>
      </form>

      <section className="privacy-card">
        <div className="privacy-card__heading">
          <span>05</span>
          <div><h4>{de ? "Deine Anfragen" : "Your requests"}</h4>
            <p>{de ? "Status und Antwortfrist bleiben hier jederzeit sichtbar." : "Status and response target remain visible here."}</p></div>
        </div>
        <div className="privacy-request-list">
          {requests.length ? requests.map((item) => <article key={item.id}>
            <div><strong>{item.type.replaceAll("_", " ")}</strong>
              <span className={`privacy-status privacy-status--${String(item.status).toLowerCase()}`}>{item.status}</span></div>
            <p>{item.note}</p>
            <small>{de ? "Eingang" : "Submitted"}: {dateLabel(item.createdAt, language)} · {de ? "Zieldatum" : "Target"}: {dateLabel(item.deadlineAt, language)}</small>
            {item.response && <p className="privacy-response">{item.response}</p>}
            {item.status === "PENDING" && <button type="button" className="text-button" disabled={busy}
              onClick={() => onCancelRequest(item.id)}>{de ? "Anfrage zurückziehen" : "Withdraw request"}</button>}
          </article>) : <p className="privacy-empty">{de ? "Noch keine offenen Datenschutzanfragen." : "No privacy requests yet."}</p>}
        </div>
      </section>
    </div>

    <form className="privacy-card privacy-card--danger" onSubmit={submitDeletion}>
      <div className="privacy-card__heading">
        <span>06</span>
        <div><h4>{de ? "Konto und Daten löschen" : "Delete account and data"}</h4>
          <p>{de
            ? "Du kannst dein Konto auch mit aktiver Membership löschen. Kontodaten und Prüfnachweise werden entfernt. Gesetzlich aufzubewahrende Rechnungen und die darin vorgeschriebenen Empfängerdaten bleiben getrennt und ausschließlich für Aufbewahrungs- und Nachweispflichten erhalten."
            : "You may delete your account even with an active membership. Account data and verification evidence are removed. Invoices and mandatory recipient details are retained separately only where required for statutory record-keeping."}</p></div>
      </div>
      <label className="field"><span>{de ? "Grund / Hinweis zur Löschung" : "Deletion reason / note"}</span>
        <textarea value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)}
          minLength="3" maxLength="500" required rows="3" />
      </label>
      <label className="consent-check">
        <input type="checkbox" checked={deletionConfirmed} onChange={(event) => setDeletionConfirmed(event.target.checked)} required />
        <span>{de
          ? "Ich verstehe, dass mein Zugang sofort widerrufen und mein Konto unwiderruflich gelöscht wird. Gesetzlich vorgeschriebene Rechnungsunterlagen bleiben getrennt für die gesetzliche Aufbewahrungsfrist erhalten."
          : "I understand that access is revoked immediately and my account is permanently deleted. Statutorily required invoice records remain separately stored for the legal retention period."}</span>
      </label>
      <label className="field"><span>{de ? "Zur Bestätigung LÖSCHEN eingeben" : "Type DELETE to confirm"}</span>
        <input value={deletionPhrase} onChange={(event) => setDeletionPhrase(event.target.value)}
          autoComplete="off" required />
      </label>
      <button className="danger-action" disabled={busy || !deletionConfirmed || (de
        ? deletionPhrase.trim().toLocaleUpperCase("de-DE") !== "LÖSCHEN"
        : deletionPhrase.trim().toUpperCase() !== "DELETE")}>
        {de ? "Konto jetzt endgültig löschen" : "Delete account permanently now"}
      </button>
    </form>
  </div>;
}
