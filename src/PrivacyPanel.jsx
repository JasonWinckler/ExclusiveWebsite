import React, { useEffect, useMemo, useState } from "react";
import { countryOptions, usRegions } from "./lib/privacy";

const choiceKeys = [
  "marketingOptOut",
  "saleShareOptOut",
  "targetedAdsOptOut",
  "profilingOptOut",
  "sensitiveDataLimit",
];

function dateLabel(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function Toggle({ name, checked, onChange, title, text, disabled }) {
  return <label className="privacy-toggle">
    <span><strong>{title}</strong><small>{text}</small></span>
    <input
      name={name}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
    <span className="privacy-toggle__control" aria-hidden="true" />
  </label>;
}

export default function PrivacyPanel({
  language,
  privacy,
  loading,
  busy,
  onSaveLocation,
  onSaveChoices,
  onExport,
  onCreateRequest,
  onCancelRequest,
  onDeleteAccount,
}) {
  const de = language === "de";
  const [countryCode, setCountryCode] = useState("DE");
  const [regionCode, setRegionCode] = useState("");
  const [choices, setChoices] = useState(Object.fromEntries(choiceKeys.map((key) => [key, false])));
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
    setChoices(Object.fromEntries(choiceKeys.map((key) => [key, Boolean(privacy.choices?.[key])])));
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
  const submitChoices = (event) => {
    event.preventDefault();
    onSaveChoices(choices);
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
          ? "Verwalte deinen Wohnsitz, deine Datenschutzentscheidungen und deine gesetzlichen Betroffenenrechte an einem Ort."
          : "Manage your residence, privacy choices and statutory data rights in one place."}</p>
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

    <form className="privacy-card privacy-card--choices" onSubmit={submitChoices}>
      <div className="privacy-card__heading">
        <span>03</span>
        <div><h4>{de ? "Datenschutzentscheidungen" : "Privacy choices"}</h4>
          <p>{de
            ? "Wir verkaufen keine personenbezogenen Daten und nutzen kein Cross-Context-Targeting. Deine Entscheidungen werden trotzdem verbindlich gespeichert."
            : "We do not sell personal data or use cross-context targeting. Your choices are still stored and enforced."}</p></div>
      </div>
      <div className="privacy-choice-list">
        <Toggle name="marketingOptOut" checked={choices.marketingOptOut} disabled={busy}
          onChange={(event) => setChoices((current) => ({ ...current, marketingOptOut: event.target.checked }))}
          title={de ? "Keine nicht notwendigen Marketing-E-Mails" : "No non-essential marketing emails"}
          text={de ? "Service-, Sicherheits- und Rechnungsnachrichten bleiben aktiv." : "Service, security and invoice messages remain active."} />
        <Toggle name="saleShareOptOut" checked={choices.saleShareOptOut} disabled={busy}
          onChange={(event) => setChoices((current) => ({ ...current, saleShareOptOut: event.target.checked }))}
          title={de ? "Verkauf / Weitergabe ablehnen" : "Opt out of sale / sharing"}
          text={de ? "Gilt vorsorglich; aktuell findet kein Verkauf oder Ad-Sharing statt." : "Stored as a precaution; no sale or ad-sharing currently occurs."} />
        <Toggle name="targetedAdsOptOut" checked={choices.targetedAdsOptOut} disabled={busy}
          onChange={(event) => setChoices((current) => ({ ...current, targetedAdsOptOut: event.target.checked }))}
          title={de ? "Gezielte Werbung ablehnen" : "Opt out of targeted advertising"}
          text={de ? "Wir betreiben derzeit keine verhaltensbasierte Werbung." : "We currently do not operate behavioural advertising."} />
        <Toggle name="profilingOptOut" checked={choices.profilingOptOut} disabled={busy}
          onChange={(event) => setChoices((current) => ({ ...current, profilingOptOut: event.target.checked }))}
          title={de ? "Bedeutsames automatisiertes Profiling ablehnen" : "Opt out of significant automated profiling"}
          text={de ? "Zugangs- und Altersentscheidungen erfolgen nicht ausschließlich automatisiert." : "Access and age decisions are not made solely by automation."} />
        <Toggle name="sensitiveDataLimit" checked={choices.sensitiveDataLimit} disabled={busy}
          onChange={(event) => setChoices((current) => ({ ...current, sensitiveDataLimit: event.target.checked }))}
          title={de ? "Nutzung sensibler Daten begrenzen" : "Limit use of sensitive data"}
          text={de ? "Notwendige Verarbeitung für Altersprüfung, Sicherheit und Rechtspflichten bleibt möglich." : "Processing required for age checks, security and legal duties may continue."} />
      </div>
      <div className="privacy-card__actions">
        <button className="secondary-action" disabled={busy || !profile.complete}>
          {de ? "Entscheidungen speichern" : "Save choices"}
        </button>
        {privacy?.choices?.updatedAt && <span>{de ? "Zuletzt gespeichert" : "Last saved"}: {dateLabel(privacy.choices.updatedAt, language)}</span>}
      </div>
    </form>

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
            ? "Du kannst dein Konto auch mit aktiver Membership löschen. Personenbezogene Kontodaten und Prüfnachweise werden entfernt; gesetzlich erforderliche Transaktionsnachweise bleiben nur im notwendigen Umfang pseudonymisiert erhalten."
            : "You may delete your account even with an active membership. Personal account data and verification evidence are removed; legally required transaction records remain only to the necessary extent in pseudonymised form."}</p></div>
      </div>
      <label className="field"><span>{de ? "Grund / Hinweis zur Löschung" : "Deletion reason / note"}</span>
        <textarea value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)}
          minLength="3" maxLength="500" required rows="3" />
      </label>
      <label className="consent-check">
        <input type="checkbox" checked={deletionConfirmed} onChange={(event) => setDeletionConfirmed(event.target.checked)} required />
        <span>{de
          ? "Ich verstehe, dass mein Zugang sofort widerrufen und mein Konto unwiderruflich gelöscht wird. Gesetzlich aufzubewahrende Rechnungsdaten bleiben nur pseudonymisiert erhalten."
          : "I understand that access is revoked immediately and my account is permanently deleted. Legally retained invoice records remain only in pseudonymised form."}</span>
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
