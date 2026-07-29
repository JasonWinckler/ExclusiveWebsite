import React, { useCallback, useEffect, useState } from "react";
import {
  forgetCurrentDevice,
  getLoginSessions,
  getRegisteredDevices,
  revokeLoginSession,
  revokeRegisteredDevice,
  setRegisteredDeviceLock,
} from "./lib/appwrite";
import { friendlyErrorMessage } from "./lib/error-messages";

function sessionName(session, language) {
  const device = [session.deviceBrand, session.deviceName, session.deviceModel]
    .filter(Boolean)
    .join(" ");
  const client = [session.clientName, session.osName].filter(Boolean).join(" · ");
  return device || client || (language === "de" ? "Unbekanntes Gerät" : "Unknown device");
}

function when(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function DeviceManager({ language, onCurrentRevoked }) {
  const [data, setData] = useState({ sessions: [], devices: [], limit: 3 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setNotice("");
    try {
      const [sessions, registered] = await Promise.all([
        getLoginSessions(),
        getRegisteredDevices(),
      ]);
      setData({
        sessions: sessions?.sessions || [],
        devices: registered?.devices || [],
        limit: registered?.limit || 3,
      });
    } catch (error) {
      setNotice(friendlyErrorMessage(
        error,
        language,
        language === "de" ? "Geräte konnten nicht geladen werden." : "Devices could not be loaded.",
      ));
    } finally {
      setBusy(false);
    }
  }, [language]);

  useEffect(() => {
    load();
  }, [load]);

  const removeSession = async (session) => {
    if (!confirm(language === "de"
      ? "Diese Login-Sitzung wirklich abmelden?"
      : "Sign out this login session?")) return;
    setBusy(true);
    try {
      await revokeLoginSession(session.$id || session.id);
      if (session.current) {
        onCurrentRevoked?.();
        return;
      }
      await load();
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language));
      setBusy(false);
    }
  };

  const removeRegistered = async (device) => {
    if (!confirm(language === "de"
      ? "Dieses registrierte Gerät wirklich entfernen?"
      : "Remove this registered device?")) return;
    setBusy(true);
    try {
      const result = await revokeRegisteredDevice(device.id);
      if (result.current) {
        forgetCurrentDevice();
        onCurrentRevoked?.();
        return;
      }
      await load();
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language));
      setBusy(false);
    }
  };

  const changeDeviceLock = async (device, locked) => {
    const question = locked
      ? (language === "de"
        ? "Dieses Gerät sperren? Es wird sofort abgemeldet und kann erst nach einer Entsperrung wieder verwendet werden."
        : "Lock this device? It will be signed out immediately and cannot be used until it is unlocked.")
      : (language === "de"
        ? "Dieses Gerät entsperren? Eine spätere Anmeldung ist danach wieder möglich."
        : "Unlock this device? It will be able to sign in again afterwards.");
    if (!confirm(question)) return;
    setBusy(true);
    try {
      const result = await setRegisteredDeviceLock(device.id, locked);
      if (locked && result.current) {
        forgetCurrentDevice();
        onCurrentRevoked?.();
        return;
      }
      await load();
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language));
      setBusy(false);
    }
  };

  return <section className="device-manager">
    <div className="device-manager__heading">
      <div>
        <h3>{language === "de" ? "Geräte & Sitzungen" : "Devices & sessions"}</h3>
        <p>{language === "de"
          ? `Maximal ${data.limit} registrierte Geräte. „Entfernen“ meldet nur ab; „Sperren“ blockiert eine erneute Anmeldung auf diesem Gerät.`
          : `Up to ${data.limit} registered devices. “Remove” only signs out; “Lock” blocks this device from signing in again.`}</p>
      </div>
      <button className="secondary-action" type="button" disabled={busy} onClick={load}>
        {language === "de" ? "Aktualisieren" : "Refresh"}
      </button>
    </div>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <div className="device-manager__groups">
      <div>
        <h4>{language === "de" ? "Login-Sitzungen" : "Login sessions"}</h4>
        {data.sessions.length ? data.sessions.map((session) => <article className="device-card" key={session.$id || session.id}>
          <div><strong>{sessionName(session, language)}{session.current ? ` · ${language === "de" ? "dieses Gerät" : "this device"}` : ""}</strong>
            <span>{session.countryName || session.countryCode || "—"} · {when(session.$updatedAt || session.updatedAt, language)}</span></div>
          <button className="danger-action" type="button" disabled={busy} onClick={() => removeSession(session)}>
            {language === "de" ? "Abmelden" : "Sign out"}
          </button>
        </article>) : <p>{language === "de" ? "Keine aktiven Sitzungen." : "No active sessions."}</p>}
      </div>
      <div>
        <h4>{language === "de" ? "Registrierte Inhaltsgeräte" : "Registered content devices"}</h4>
        {data.devices.length
          ? data.devices.map((device) => <article className={`device-card${device.status === "REVOKED" ? " is-locked" : ""}`} key={device.id}>
            <div><strong>{device.displayName || (language === "de" ? "Persönliches Gerät" : "Personal device")}{device.current ? ` · ${language === "de" ? "dieses Gerät" : "this device"}` : ""}</strong>
              <span>{device.status === "REVOKED"
                ? (language === "de" ? `Gesperrt seit ${when(device.revokedAt, language)}` : `Locked since ${when(device.revokedAt, language)}`)
                : `${language === "de" ? "Zuletzt aktiv" : "Last active"}: ${when(device.lastSeenAt, language)}`}</span></div>
            <div className="device-card__actions">
              <button className="secondary-action" type="button" disabled={busy} onClick={() => changeDeviceLock(device, device.status === "ACTIVE")}>
                {device.status === "ACTIVE"
                  ? (language === "de" ? "Sperren" : "Lock")
                  : (language === "de" ? "Entsperren" : "Unlock")}
              </button>
              <button className="danger-action" type="button" disabled={busy} onClick={() => removeRegistered(device)}>
                {language === "de" ? "Entfernen" : "Remove"}
              </button>
            </div>
          </article>)
          : <p>{language === "de" ? "Keine registrierten Geräte." : "No registered devices."}</p>}
      </div>
    </div>
  </section>;
}
