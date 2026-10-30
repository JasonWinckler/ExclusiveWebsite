import "../assets/css/admin.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  adminActivatePaymentOrder,
  adminArchivePaymentOrder,
  adminCancelPaymentOrder,
  adminCreateContent,
  adminDeleteContent,
  adminDecideAgeCase,
  adminFetchAgeEvidence,
  adminGrantMembership,
  adminGetAgeCase,
  adminImportN26Csv,
  adminListAgeCases,
  adminListContent,
  adminListContentComments,
  adminListPaymentOrders,
  adminFetchInvoiceCopy,
  adminListPrivacyRequests,
  adminListUserDevices,
  adminListUsers,
  adminGetSystemMonitoring,
  adminListTelegramConnections,
  adminConfigureTelegramWebhook,
  adminManageTelegramConnection,
  adminQueueNewDrop,
  adminRevokeUserDevice,
  adminSetUserDeviceLock,
  adminDecidePrivacyRequest,
  adminModerateContentComment,
  adminRestrictUser,
  adminScheduleAccountDeletion,
  adminUnrestrictUser,
  adminVerifyUserEmail,
  adminUpdateContent,
  adminUploadContent,
  adminFetchContentReviewMedia,
  adminPublishAdultContent,
  getProducts,
  getAdminSessionExpiry,
  requestPasswordReset,
  startAdminSimulation,
} from "./lib/platform";
import { friendlyErrorMessage } from "./lib/error-messages";

const copy = {
  de: {
    title: "Admin-Bereich",
    subtitle: "Musik, Community, Mitgliedschaften und Zahlungseingänge",
    age: "VIP-Altersprüfung",
    content: "Content studio",
    payments: "SEPA-Abgleich",
    refresh: "Aktualisieren",
    logout: "Abmelden",
    pending: "Offene Anfragen",
    noCases: "Keine offenen Anfragen.",
    selectCase: "Wähle eine Anfrage zur Prüfung aus.",
    evidence: "Prüfdateien",
    open: "Sicher öffnen",
    reason: "Begründung der Entscheidung",
    approve: "Freigeben",
    reject: "Ablehnen",
    approved: "Die Altersprüfung wurde freigegeben.",
    rejected: "Die Altersprüfung wurde abgelehnt.",
    privacy: "Prüfdateien werden nur über den geschützten Admin-Endpunkt geladen. Jeder Abruf wird protokolliert.",
    uploadTitle: "Neuen Beitrag erstellen",
    slug: "Slug",
    contentTitle: "Titel",
    tier: "Mitgliedschaft / Zugriff",
    file: "Beitragsmedium (Bild oder Video)",
    publish: "Beitrag jetzt veröffentlichen",
    published: "Der Beitrag wurde veröffentlicht.",
    currentContent: "Beiträge und Archiv",
    noContent: "Noch keine Beiträge vorhanden.",
    csvTitle: "N26-CSV importieren",
    csvText: "Exportiere die Kontobewegungen bei N26 als CSV. Es werden ausschließlich Betrag, Datum und der exakte Verwendungszweck „Order of Shadows - ID #…“ für den Abgleich verarbeitet. Bestehende Zahlungsreferenzen bleiben gültig; die vollständige CSV wird nicht gespeichert.",
    import: "CSV prüfen und zuordnen",
    importDone: "N26-CSV wurde verarbeitet.",
    ordersTitle: "Zahlungsaufträge",
    ordersText: "Die Aufträge stammen direkt aus der produktiven D1-Tabelle subscriptions. Eine manuelle Freischaltung erzeugt zusätzlich eine ADMIN-Banktransaktion, eine Berechtigung und einen Audit-Eintrag.",
    noOrders: "Noch keine Zahlungsaufträge vorhanden.",
    manualReason: "Support-Begründung",
    manualConfirmation: "Ich habe den tatsächlichen Zahlungseingang und die Zuordnung zu diesem Auftrag geprüft.",
    manualActivate: "Manuell freischalten",
    manualActivated: "Der Zahlungsauftrag wurde manuell freigeschaltet.",
    loading: "Wird verarbeitet…",
    genericError: "Die Admin-Aktion konnte nicht abgeschlossen werden.",
    directPublish: "Erfolgreiche Uploads sind sofort sichtbar. Medien bleiben privat in R2 und werden nur nach serverseitiger Zugriffsprüfung ausgeliefert.",
  },
  en: {
    title: "Admin portal",
    subtitle: "Music, community, memberships and incoming payments",
    age: "VIP age review",
    content: "Content studio",
    payments: "SEPA matching",
    refresh: "Refresh",
    logout: "Log out",
    pending: "Open requests",
    noCases: "No open requests.",
    selectCase: "Select a request to review it.",
    evidence: "Evidence",
    open: "Open securely",
    reason: "Decision reason",
    approve: "Approve",
    reject: "Reject",
    approved: "Age verification was approved.",
    rejected: "Age verification was rejected.",
    privacy: "Evidence is loaded only through the protected admin endpoint. Every access is audited.",
    uploadTitle: "Create a new post",
    slug: "Slug",
    contentTitle: "Title",
    tier: "Membership / access",
    file: "Post media (image or video)",
    publish: "Publish post now",
    published: "The post was published.",
    currentContent: "Posts and archive",
    noContent: "No posts yet.",
    csvTitle: "Import N26 CSV",
    csvText: "Export account activity from N26 as CSV. Only the amount, date and exact “Order of Shadows - ID #…” reference are processed for matching. Existing payment references remain valid; the complete CSV is not stored.",
    import: "Check and match CSV",
    importDone: "The N26 CSV was processed.",
    ordersTitle: "Payment orders",
    ordersText: "Orders are loaded directly from the production D1 subscriptions table. Manual activation also creates an ADMIN bank transaction, an entitlement and an audit event.",
    noOrders: "No payment orders yet.",
    manualReason: "Support reason",
    manualConfirmation: "I verified the actual incoming payment and its assignment to this order.",
    manualActivate: "Activate manually",
    manualActivated: "The payment order was activated manually.",
    loading: "Processing…",
    genericError: "The admin action could not be completed.",
    directPublish: "Successful uploads are immediately visible. Media remains private in R2 and is served only after server-side authorization.",
  },
};

const tierLabels = {
  FREE: "Free Preview",
  EXCLUSIVE_BASIC: "Basic Shadow",
  EXCLUSIVE_PREMIUM: "Premium Shadow",
  EXCLUSIVE_VIP: "VIP Shadow",
};

const approvalChecklist = {
  de: {
    DOCUMENT_FRONT_LEGIBLE: "Vorderseite ist vollständig und gut lesbar.",
    DOCUMENT_BACK_LEGIBLE: "Rückseite ist vollständig und gut lesbar.",
    DOCUMENT_VALID_AND_OVER_18: "Dokument ist gültig; Geburtsdatum bestätigt mindestens 18 Jahre.",
    DOCUMENT_SAME_ORIGINAL: "Bilder und Video zeigen dasselbe physische Originaldokument; Sicherheitsmerkmale wirken plausibel.",
    FACE_MATCHES_DOCUMENT: "Gesicht im Video stimmt plausibel mit dem Ausweisfoto überein.",
    LIVE_VIDEO_UNCUT: "Live-Video ist durchgehend, ohne Schnitt, Filter, Bildschirmwiedergabe oder zweite Person.",
    CHALLENGE_COMPLETED_IN_ORDER: "Die serverseitige Challenge wurde vollständig in der vorgegebenen Reihenfolge ausgeführt.",
    LIVENESS_CODE_MATCHES: "Der handschriftliche 6-stellige Code stimmt exakt mit dem Fallcode überein.",
  },
  en: {
    DOCUMENT_FRONT_LEGIBLE: "The front is complete and legible.",
    DOCUMENT_BACK_LEGIBLE: "The back is complete and legible.",
    DOCUMENT_VALID_AND_OVER_18: "The document is valid and the date of birth confirms age 18 or older.",
    DOCUMENT_SAME_ORIGINAL: "Images and video show the same physical original document and plausible security features.",
    FACE_MATCHES_DOCUMENT: "The face in the video plausibly matches the ID portrait.",
    LIVE_VIDEO_UNCUT: "The live video is continuous, without cuts, filters, screen replay or another person.",
    CHALLENGE_COMPLETED_IN_ORDER: "The server challenge was completed in full and in the required order.",
    LIVENESS_CODE_MATCHES: "The handwritten 6-digit code exactly matches the case code.",
  },
};

const challengeCopy = {
  de: {
    WRITE_AND_SHOW_CODE: "Persönlichen 6-stelligen Code auf Papier zeigen",
    FACE_CAMERA: "Gesicht frontal und vollständig zeigen",
    HOLD_ID_NEXT_TO_FACE: "Ausweis neben das Gesicht halten",
    SHOW_DOCUMENT_FRONT: "Vorderseite in die Kamera zeigen",
    SHOW_DOCUMENT_BACK: "Rückseite in die Kamera zeigen",
    TILT_DOCUMENT: "Ausweis langsam kippen, damit Sicherheitsmerkmale sichtbar werden",
    TURN_HEAD_LEFT: "Kopf nach links drehen",
    TURN_HEAD_RIGHT: "Kopf nach rechts drehen",
    LOOK_UP: "Nach oben schauen",
    BLINK_TWICE: "Zweimal deutlich blinzeln",
  },
  en: {
    WRITE_AND_SHOW_CODE: "Show the personal 6-digit code on paper",
    FACE_CAMERA: "Show the full face from the front",
    HOLD_ID_NEXT_TO_FACE: "Hold the ID beside the face",
    SHOW_DOCUMENT_FRONT: "Show the front to the camera",
    SHOW_DOCUMENT_BACK: "Show the back to the camera",
    TILT_DOCUMENT: "Slowly tilt the ID to show security features",
    TURN_HEAD_LEFT: "Turn the head left",
    TURN_HEAD_RIGHT: "Turn the head right",
    LOOK_UP: "Look up",
    BLINK_TWICE: "Blink clearly twice",
  },
};

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value, language) => value
  ? new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
      dateStyle: "medium", timeStyle: "short",
    }).format(new Date(value))
  : "–";

const eventTotal = (monitoring, eventName) => (monitoring?.events || [])
  .filter((event) => event.event_name === eventName)
  .reduce((sum, event) => sum + Number(event.event_count || 0), 0);

const conversionRate = (numerator, denominator) => denominator > 0
  ? `${Math.min(100, (numerator / denominator) * 100).toFixed(1)}%`
  : "—";

export default function AdminPortal({ user, language, setLanguage, onLogout }) {
  const t = copy[language] || copy.de;
  const [tab, setTab] = useState("overview");
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [items, setItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [contentScope, setContentScope] = useState("MUSIC");
  const [adultReviewItem, setAdultReviewItem] = useState(null);
  const [adultReviewPreview, setAdultReviewPreview] = useState(null);
  const adultReviewGeneration = useRef(0);
  const [comments, setComments] = useState([]);
  const [commentReasons, setCommentReasons] = useState({});
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [userReasons, setUserReasons] = useState({});
  const [membershipSelections, setMembershipSelections] = useState({});
  const [membershipProducts, setMembershipProducts] = useState([]);
  const [deviceUserId, setDeviceUserId] = useState(null);
  const [userDevices, setUserDevices] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [privacyRequests, setPrivacyRequests] = useState([]);
  const [privacyResponses, setPrivacyResponses] = useState({});
  const [privacyReasons, setPrivacyReasons] = useState({});
  const [paymentReasons, setPaymentReasons] = useState({});
  const [paymentConfirmations, setPaymentConfirmations] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [checkedReviewItems, setCheckedReviewItems] = useState([]);
  const [sessionSeconds, setSessionSeconds] = useState(600);
  const [monitoring, setMonitoring] = useState(null);
  const [telegramConnections, setTelegramConnections] = useState([]);
  const [telegramReasons, setTelegramReasons] = useState({});
  const [simulationRole, setSimulationRole] = useState("EXCLUSIVE_BASIC");

  const loadCases = async () => {
    const result = await adminListAgeCases();
    setCases(result.cases || []);
  };
  const loadContent = async () => {
    const result = await adminListContent();
    setItems(result.items || []);
  };
  const loadComments = async () => {
    const result = await adminListContentComments();
    setComments(result.comments || []);
  };
  const loadPayments = async () => {
    const result = await adminListPaymentOrders();
    setOrders(result.orders || []);
  };
  const loadUsers = async () => {
    const result = await adminListUsers();
    setUsers(result.users || []);
  };
  const loadMembershipProducts = async () => {
    const result = await getProducts(language);
    setMembershipProducts(result.products || []);
  };
  const loadPrivacyRequests = async () => {
    const result = await adminListPrivacyRequests();
    setPrivacyRequests(result.requests || []);
  };
  const loadMonitoring = async () => {
    const result = await adminGetSystemMonitoring();
    setMonitoring(result);
  };
  const loadTelegram = async () => {
    const result = await adminListTelegramConnections();
    setTelegramConnections(result.connections || []);
  };
  const loadAll = async () => {
    setBusy(true);
    setError("");
    try {
      await Promise.all([
        loadCases(),
        loadContent(),
        loadComments(),
        loadPayments(),
        loadUsers(),
        loadMembershipProducts(),
        loadPrivacyRequests(),
        loadMonitoring(),
        loadTelegram(),
      ]);
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { loadAll(); }, [language]);
  useEffect(() => {
    const check = () => {
      const expiry = getAdminSessionExpiry();
      if (!expiry) return;
      const remaining = Math.max(0, Math.ceil((Date.parse(expiry) - Date.now()) / 1000));
      setSessionSeconds(remaining);
      if (remaining === 0) onLogout();
    };
    check();
    const interval = window.setInterval(check, 1_000);
    return () => window.clearInterval(interval);
  }, [onLogout]);
  useEffect(() => {
    const previewUrl = preview?.url;
    if (!previewUrl) return undefined;
    const closeSensitivePreview = () => setPreview(null);
    const timeout = window.setTimeout(closeSensitivePreview, 120_000);
    const closeWhenHidden = () => {
      if (document.visibilityState === "hidden") closeSensitivePreview();
    };
    document.addEventListener("visibilitychange", closeWhenHidden);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", closeWhenHidden);
      URL.revokeObjectURL(previewUrl);
    };
  }, [preview?.url]);

  useEffect(() => {
    const previewUrl = adultReviewPreview?.url;
    if (!previewUrl) return undefined;
    const close = () => {
      adultReviewGeneration.current += 1;
      setAdultReviewPreview(null);
    };
    const timer = window.setTimeout(close, 120_000);
    const onHidden = () => { if (document.visibilityState === "hidden") close(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHidden);
      URL.revokeObjectURL(previewUrl);
    };
  }, [adultReviewPreview?.url]);

  useEffect(() => {
    if (tab !== "content") {
      adultReviewGeneration.current += 1;
      setAdultReviewPreview(null);
      setAdultReviewItem(null);
    }
  }, [tab]);

  useEffect(() => () => { adultReviewGeneration.current += 1; }, []);

  const selectCase = async (caseId) => {
    setBusy(true);
    setError("");
    try {
      setSelectedCase(await adminGetAgeCase(caseId));
      setPreview(null);
      setCheckedReviewItems([]);
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const openEvidence = async (evidence) => {
    setBusy(true);
    setError("");
    try {
      const response = await adminFetchAgeEvidence(evidence.id);
      const blob = await response.blob();
      setPreview({
        url: URL.createObjectURL(blob),
        type: evidence.content_type,
        kind: evidence.evidence_kind,
      });
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision) => {
    const reason = document.getElementById("admin-decision-reason")?.value || "";
    if (reason.trim().length < 3 || !selectedCase?.case?.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminDecideAgeCase(
        selectedCase.case.id,
        decision,
        reason.trim(),
        decision === "APPROVED" ? checkedReviewItems : [],
      );
      setNotice(decision === "APPROVED" ? t.approved : t.rejected);
      setSelectedCase(null);
      setPreview(null);
      await loadCases();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const uploadContent = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (editingItem && !["MUSIC", "VIP_ADULT"].includes(editingItem.content_scope)) {
      setError(friendlyErrorMessage({ code: "LEGACY_CONTENT_QUARANTINED" }, language));
      return;
    }
    if (!editingItem && (!(file instanceof File) || !file.size)) return;
    if (contentScope === "VIP_ADULT" && data.get("adultContentReviewed") !== "on") {
      setError(friendlyErrorMessage({ code: "ADULT_CONTENT_REVIEW_REQUIRED" }, language));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        title: String(data.get("title") || ""),
        tier: contentScope === "VIP_ADULT" ? "EXCLUSIVE_VIP" : (editingItem?.required_tier === "FREE" ? "FREE" : "EXCLUSIVE_BASIC"),
        contentScope,
        adultContentReviewed: contentScope === "VIP_ADULT" && data.get("adultContentReviewed") === "on",
        bodyText: String(data.get("bodyText") || ""),
        allowComments: data.get("allowComments") === "on",
      };
      const item = editingItem
        ? await adminUpdateContent(editingItem.id, payload)
        : await adminCreateContent({
          slug: String(data.get("slug") || ""),
          ...payload,
        });
      if (file instanceof File && file.size) await adminUploadContent(item.id, file, { adultContentReviewed: contentScope === "VIP_ADULT" });
      form.reset();
      setEditingItem(null);
      setContentScope("MUSIC");
      setNotice(editingItem
        ? (language === "de" ? "Der Beitrag wurde aktualisiert." : "The post was updated.")
        : t.published);
      await loadContent();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const editContent = (item) => {
    if (!["MUSIC", "VIP_ADULT"].includes(item.content_scope)) return;
    setContentScope(item.content_scope);
    setEditingItem(item);
    setNotice("");
    setError("");
    requestAnimationFrame(() => {
      document.querySelector(".post-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const closeAdultReview = () => {
    adultReviewGeneration.current += 1;
    setAdultReviewItem(null);
    setAdultReviewPreview(null);
  };

  const openAdultReview = async (item) => {
    const generation = ++adultReviewGeneration.current;
    setAdultReviewItem(item);
    setAdultReviewPreview(null);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await adminFetchContentReviewMedia(item.id);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (generation !== adultReviewGeneration.current) { URL.revokeObjectURL(url); return; }
      setAdultReviewPreview({ url, type: response.headers.get("content-type") || blob.type, itemId: item.id });
    } catch (requestError) {
      if (generation === adultReviewGeneration.current) setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const publishReviewedAdult = async (event) => {
    event.preventDefault();
    if (!adultReviewItem || adultReviewPreview?.itemId !== adultReviewItem.id) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") || "").trim();
    if (data.get("adultContentReviewed") !== "on" || reason.length < 10) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminPublishAdultContent(adultReviewItem.id, { adultContentReviewed: true, reason });
      closeAdultReview();
      await loadContent();
      setNotice(language === "de" ? "Der einzeln geprüfte Beitrag wurde im altersverifizierten privaten VIP-Bereich veröffentlicht." : "The individually reviewed post was published in the age-verified private VIP area.");
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const deleteContent = async (item) => {
    const reason = window.prompt(
      language === "de" ? "Interner Löschgrund (mindestens 3 Zeichen):" : "Internal deletion reason (at least 3 characters):",
      language === "de" ? "Vom Creator entfernt" : "Removed by creator",
    );
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm(language === "de"
      ? "Beitrag und zugehöriges Medium wirklich löschen?"
      : "Delete this post and its media?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminDeleteContent(item.id, reason.trim());
      if (editingItem?.id === item.id) { setEditingItem(null); setContentScope("MUSIC"); }
      if (adultReviewItem?.id === item.id) closeAdultReview();
      setNotice(language === "de" ? "Der Beitrag wurde gelöscht." : "The post was deleted.");
      await Promise.all([loadContent(), loadComments()]);
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("csv");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const summary = await adminImportN26Csv(file);
      setImportSummary(summary);
      setNotice(t.importDone);
      form.reset();
      await loadPayments();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const activatePayment = async (orderId) => {
    const reason = String(paymentReasons[orderId] || "").trim();
    if (reason.length < 3 || !paymentConfirmations[orderId]) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminActivatePaymentOrder(orderId, reason);
      setNotice(t.manualActivated);
      setPaymentReasons((current) => ({ ...current, [orderId]: "" }));
      setPaymentConfirmations((current) => ({ ...current, [orderId]: false }));
      await loadPayments();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const moderateComment = async (commentId, action) => {
    const reason = String(commentReasons[commentId] || "").trim();
    if (reason.length < 3) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminModerateContentComment(commentId, action, reason);
      setCommentReasons((current) => ({ ...current, [commentId]: "" }));
      setNotice(language === "de" ? "Kommentarstatus wurde aktualisiert." : "Comment status was updated.");
      await loadComments();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const manageUser = async (profile, action) => {
    const reason = String(userReasons[profile.appwrite_user_id] || "").trim();
    if (action !== "RESET" && reason.length < 3) return;
    if (action === "VERIFY_EMAIL" && !window.confirm(language === "de"
      ? "E-Mail-Adresse nach eigener Prüfung manuell bestätigen? Diese Aktion wird protokolliert."
      : "Manually verify this email address after your own review? This action is audited.")) return;
    if (action === "DELETE") {
      const deletionPhrase = window.prompt(language === "de"
        ? "Diese Löschung wird auch bei aktiver Membership ausgeführt. Zur Bestätigung LÖSCHEN eingeben:"
        : "This deletion also proceeds with an active membership. Type DELETE to confirm:");
      const accepted = language === "de"
        ? deletionPhrase?.trim().toLocaleUpperCase("de-DE") === "LÖSCHEN"
        : deletionPhrase?.trim().toUpperCase() === "DELETE";
      if (!accepted) return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "RESTRICT") await adminRestrictUser(profile.appwrite_user_id, reason);
      else if (action === "UNRESTRICT") await adminUnrestrictUser(profile.appwrite_user_id, reason);
      else if (action === "VERIFY_EMAIL") await adminVerifyUserEmail(profile.appwrite_user_id, reason);
      else if (action === "DELETE") await adminScheduleAccountDeletion(profile.appwrite_user_id, reason);
      else await requestPasswordReset(profile.email, language);
      setNotice(action === "RESET"
        ? (language === "de" ? "E-Mail zum Zurücksetzen des Passworts wurde angefordert." : "Password reset email was requested.")
        : (language === "de" ? "Nutzerstatus wurde aktualisiert." : "User status was updated."));
      setUserReasons((current) => ({ ...current, [profile.appwrite_user_id]: "" }));
      await loadUsers();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const configureTelegram = async () => {
    setBusy(true);
    setError("");
    try {
      await adminConfigureTelegramWebhook();
      setNotice(language === "de"
        ? "Der Telegram-Webhook ist produktiv eingerichtet."
        : "The Telegram webhook is configured for production.");
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const manageTelegram = async (connection, action) => {
    const reason = String(telegramReasons[connection.appwrite_user_id] || "").trim();
    if (reason.length < 3) return;
    if (action === "UNLINK" && !window.confirm(language === "de"
      ? "Telegram-Verknüpfung und gespeicherte Telegram-Konto-ID vollständig löschen?"
      : "Delete the Telegram connection and stored Telegram account ID completely?")) return;
    setBusy(true);
    setError("");
    try {
      await adminManageTelegramConnection(connection.appwrite_user_id, action, reason);
      setNotice(language === "de" ? "Telegram-Zugang wurde aktualisiert." : "Telegram access was updated.");
      await Promise.all([loadTelegram(), loadMonitoring()]);
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const openInvoiceCopy = async (order) => {
    setBusy(true);
    setError("");
    try {
      const response = await adminFetchInvoiceCopy(order.id);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(friendlyErrorMessage(caught, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const queueNewDrop = async (item) => {
    if (item.content_scope !== "MUSIC" || item.content_status !== "ACTIVE") return;
    if (!window.confirm(language === "de"
      ? `„${item.title}“ als New Drop an alle bestätigten Newsletter-Abonnenten senden?`
      : `Send “${item.title}” as a New Drop to all confirmed newsletter subscribers?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminQueueNewDrop(item.id);
      setNotice(language === "de"
        ? `New Drop wurde für ${result.deliveries || 0} bestätigte Abonnenten eingeplant.`
        : `New Drop was queued for ${result.deliveries || 0} confirmed subscribers.`);
      await loadMonitoring();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const grantMembership = async (profile) => {
    const reason = String(userReasons[profile.appwrite_user_id] || "").trim();
    const productSku = membershipSelections[profile.appwrite_user_id] ||
      membershipProducts.find((product) => product.sku === "exclusive-basic-30d")?.sku;
    if (!productSku || reason.length < 3) return;
    const product = membershipProducts.find((item) => item.sku === productSku);
    if (!window.confirm(language === "de"
      ? `${product?.displayName || productSku} manuell und ohne Zahlung vergeben? Die bisherige aktive oder vorgemerkte Membership wird vollständig ersetzt. Die Aktion wird protokolliert.`
      : `Grant ${product?.displayName || productSku} manually without payment? This fully replaces any active or scheduled membership. The action is audited.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminGrantMembership(profile.appwrite_user_id, productSku, reason);
      setNotice(language === "de"
        ? "Die bisherige Membership wurde ersetzt, die neue Membership vergeben und der Zugriff synchronisiert."
        : "The previous membership was replaced, the new membership was granted and access was synchronised.");
      setUserReasons((current) => ({ ...current, [profile.appwrite_user_id]: "" }));
      await loadUsers();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const openUserDevices = async (profile) => {
    setBusy(true);
    setError("");
    try {
      setDeviceUserId(profile.appwrite_user_id);
      setUserDevices(await adminListUserDevices(profile.appwrite_user_id));
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const removeUserDevice = async (profile, kind, targetId) => {
    if (!window.confirm(language === "de"
      ? "Dieses Gerät bzw. diese Sitzung wirklich entfernen?"
      : "Remove this device or session?")) return;
    setBusy(true);
    setError("");
    try {
      await adminRevokeUserDevice(profile.appwrite_user_id, kind, targetId);
      setUserDevices(await adminListUserDevices(profile.appwrite_user_id));
      setNotice(language === "de" ? "Gerät wurde entfernt." : "Device was removed.");
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const changeUserDeviceLock = async (profile, device, locked) => {
    if (!window.confirm(locked
      ? (language === "de"
        ? "Dieses Gerät sperren? Eine erneute Anmeldung bleibt blockiert, bis es wieder entsperrt wird."
        : "Lock this device? New sign-ins remain blocked until it is unlocked.")
      : (language === "de"
        ? "Dieses Gerät entsperren und eine spätere Anmeldung wieder erlauben?"
        : "Unlock this device and allow it to sign in again?"))) return;
    setBusy(true);
    setError("");
    try {
      await adminSetUserDeviceLock(profile.appwrite_user_id, device.id, locked);
      setUserDevices(await adminListUserDevices(profile.appwrite_user_id));
      setNotice(locked
        ? (language === "de" ? "Gerät wurde gesperrt." : "Device was locked.")
        : (language === "de" ? "Gerät wurde entsperrt." : "Device was unlocked."));
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const updatePrivacyRequest = async (item, status) => {
    const response = String(privacyResponses[item.id] || "").trim();
    const reason = String(privacyReasons[item.id] || "").trim();
    if (response.length < 3 || reason.length < 3) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminDecidePrivacyRequest(item.id, status, response, reason);
      setPrivacyResponses((current) => ({ ...current, [item.id]: "" }));
      setPrivacyReasons((current) => ({ ...current, [item.id]: "" }));
      setNotice(language === "de"
        ? "Die Datenschutzanfrage wurde aktualisiert."
        : "The privacy request has been updated.");
      await loadPrivacyRequests();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const managePaymentOrder = async (order, action) => {
    const reason = String(paymentReasons[order.id] || "").trim();
    if (reason.length < 3) return;
    const question = action === "ARCHIVE"
      ? (language === "de" ? "Diesen Auftrag aus den aktiven Ansichten archivieren?" : "Archive this order from active views?")
      : (language === "de" ? "Diesen Zahlungsauftrag stornieren?" : "Cancel this payment order?");
    if (!window.confirm(question)) return;
    setBusy(true);
    setError("");
    try {
      if (action === "ARCHIVE") await adminArchivePaymentOrder(order.id, reason);
      else await adminCancelPaymentOrder(order.id, reason);
      setNotice(language === "de" ? "Zahlungsauftrag wurde aktualisiert." : "Payment order was updated.");
      await loadPayments();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const selectedEvidence = selectedCase?.evidence || [];
  const requiredReviewItems = Object.keys(approvalChecklist[language] || approvalChecklist.de)
    .filter((item) => selectedCase?.case?.document_type !== "PASSPORT" || item !== "DOCUMENT_BACK_LEGIBLE")
    .filter((item) =>
      ["manual-age-v5", "manual-age-v6"].includes(selectedCase?.case?.instructions_version) ||
      item !== "LIVENESS_CODE_MATCHES");
  const selectedChallenge = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedCase?.case?.liveness_challenge_json || "[]");
      if (Array.isArray(parsed)) return { code: null, steps: parsed };
      if (parsed && Array.isArray(parsed.steps)) return {
        code: typeof parsed.code === "string" ? parsed.code : null,
        steps: parsed.steps,
      };
      return { code: null, steps: [] };
    } catch {
      return { code: null, steps: [] };
    }
  }, [selectedCase]);
  const summaryEntries = useMemo(
    () => importSummary ? Object.entries(importSummary).filter(([key]) => key !== "importId") : [],
    [importSummary],
  );

  return <div className="admin-shell">
    <header className="admin-header">
      <div><a className="brand brand--wordmark" href="/">Jason Shadow</a><p>{language === "de" ? "Exklusive Mitgliedschaft" : "Exclusive Membership"} · {t.subtitle}</p></div>
      <div className="admin-header__actions">
        <span>{user.email}</span>
        <div className="language-switcher">{["de", "en"].map((lang) => <button className={`language-button${lang === language ? " is-active" : ""}`} type="button" onClick={() => setLanguage(lang)} key={lang}>{lang.toUpperCase()}</button>)}</div>
        <button className="secondary-action" type="button" onClick={onLogout}>{t.logout}</button>
      </div>
    </header>
    <main className="admin-main">
      <div className="admin-title"><div><p className="eyebrow">THE ORDER OF SHADOWS · STUDIO</p><h1>{t.title}</h1><small className="admin-session-timer">{language === "de" ? "Sichere Admin-Sitzung" : "Secure admin session"} · {Math.floor(sessionSeconds / 60)}:{String(sessionSeconds % 60).padStart(2, "0")}</small></div><button className="secondary-action" type="button" onClick={loadAll} disabled={busy}>{t.refresh}</button></div>
      <nav className="admin-tabs" aria-label={t.title}>{[
        ["overview", language === "de" ? "Übersicht" : "Overview"],
        ["users", language === "de" ? "Nutzer" : "Users"],
        ["age", t.age], ["content", t.content], ["payments", t.payments],
        ["privacy", language === "de" ? "Datenschutz" : "Privacy"],
        ["telegram", "Telegram"],
        ["monitoring", "System Monitoring"],
        ["simulation", language === "de" ? "Website-Simulation" : "Website simulation"],
      ].map(([key, label]) => <button type="button" className={tab === key ? "is-active" : ""} onClick={() => { setTab(key); setNotice(""); setError(""); }} key={key}>{label}</button>)}</nav>
      {busy && <p className="form-notice" role="status">{t.loading}</p>}
      {notice && <p className="form-notice form-notice--success" role="status">{notice}</p>}
      {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}

      {tab === "overview" && <section className="admin-overview-grid">
        <article className="admin-metric-card"><span>{language === "de" ? "Aktive Nutzer" : "Active users"}</span><strong>{users.filter((item) => item.account_status === "ACTIVE").length}</strong><small>{users.length} {language === "de" ? "Konten gesamt" : "accounts total"}</small></article>
        <article className="admin-metric-card"><span>{language === "de" ? "VIP-Altersprüfungen" : "VIP age reviews"}</span><strong>{cases.length}</strong><button className="text-button" type="button" onClick={() => setTab("age")}>{language === "de" ? "Prüfen →" : "Review →"}</button></article>
        <article className="admin-metric-card"><span>{language === "de" ? "Offene Zahlungen" : "Pending payments"}</span><strong>{orders.filter((item) => ["PENDING","PROCESSING","PAID"].includes(item.status)).length}</strong><button className="text-button" type="button" onClick={() => setTab("payments")}>{language === "de" ? "Öffnen →" : "Open →"}</button></article>
        <article className="admin-metric-card"><span>{language === "de" ? "Veröffentlichte Beiträge" : "Published posts"}</span><strong>{items.filter((item) => item.content_status === "ACTIVE" && ["MUSIC", "VIP_ADULT"].includes(item.content_scope)).length}</strong><small>{comments.filter((item) => item.status === "ACTIVE").length} {language === "de" ? "aktive Kommentare" : "active comments"}</small></article>
        <article className="admin-metric-card"><span>{language === "de" ? "Datenschutzanfragen" : "Privacy requests"}</span><strong>{privacyRequests.filter((item) => ["PENDING","IN_REVIEW"].includes(item.status)).length}</strong><button className="text-button" type="button" onClick={() => setTab("privacy")}>{language === "de" ? "Bearbeiten →" : "Review →"}</button></article>
        <article className="admin-metric-card"><span>Telegram</span><strong>{telegramConnections.filter((item) => item.status === "ACTIVE").length}</strong><small>{telegramConnections.length} {language === "de" ? "Verknüpfungen" : "connections"}</small><button className="text-button" type="button" onClick={() => setTab("telegram")}>{language === "de" ? "Verwalten →" : "Manage →"}</button></article>
      </section>}

      {tab === "telegram" && <section className="admin-panel telegram-admin-panel">
        <div className="admin-panel__heading"><div><p className="eyebrow">PRIVATE COMMUNITY ACCESS</p><h2>{language === "de" ? "Telegram-Zugänge" : "Telegram access"}</h2><p className="admin-note">{language === "de" ? "Telegram ist ein Vorteil von Premium Shadow; VIP Shadow enthält keinen Telegram-Zugang. Einmalige Bot-Verknüpfung, kontogebundene Einladungen und automatischer Entzug bei Ende der Berechtigung. Gespeichert werden weder Telegram-Benutzernamen noch Profilbilder oder Chat-Inhalte." : "Telegram is a Premium Shadow benefit; VIP Shadow does not include Telegram access. One-time bot linking, account-bound invitations and automatic removal when eligibility ends. Telegram usernames, profile photos and chat content are never stored."}</p></div><button className="secondary-action" type="button" disabled={busy} onClick={configureTelegram}>{language === "de" ? "Webhook sicher neu verbinden" : "Securely reconnect webhook"}</button></div>
        <div className="telegram-admin-summary"><span><strong>{telegramConnections.filter((item) => item.status === "ACTIVE").length}</strong>{language === "de" ? "Aktiv" : "Active"}</span><span><strong>{telegramConnections.filter((item) => item.status === "INVITE_SENT").length}</strong>{language === "de" ? "Einladung gesendet" : "Invite sent"}</span><span><strong>{telegramConnections.filter((item) => item.status === "ERROR").length}</strong>{language === "de" ? "Prüfung nötig" : "Needs review"}</span></div>
        <div className="telegram-admin-list">{telegramConnections.length ? telegramConnections.map((connection) => {
          const reason = telegramReasons[connection.appwrite_user_id] || "";
          return <article className="telegram-admin-card" key={connection.appwrite_user_id}>
            <div className="telegram-admin-card__head"><div><strong>{connection.display_name || "Shadow Member"}</strong><span>{connection.email}</span></div><span className="order-status">{String(connection.status).replaceAll("_", " ")}</span></div>
            <dl className="admin-facts"><div><dt>Membership</dt><dd>{connection.active_tier ? tierLabels[connection.active_tier] : (language === "de" ? "Nicht aktiv" : "Inactive")}</dd></div><div><dt>{language === "de" ? "Verknüpft" : "Linked"}</dt><dd>{formatDate(connection.linked_at, language)}</dd></div><div><dt>{language === "de" ? "Beigetreten" : "Joined"}</dt><dd>{formatDate(connection.joined_at, language)}</dd></div><div><dt>{language === "de" ? "Letzter Abgleich" : "Last sync"}</dt><dd>{formatDate(connection.last_synced_at, language)}</dd></div>{connection.last_error_code && <div><dt>Error</dt><dd>{connection.last_error_code}</dd></div>}</dl>
            <label className="form-field"><span>{language === "de" ? "Nachvollziehbare Admin-Begründung" : "Documented admin reason"}</span><input minLength="3" maxLength="500" value={reason} onChange={(event) => setTelegramReasons((current) => ({ ...current, [connection.appwrite_user_id]: event.target.value }))} /></label>
            <div className="decision-actions"><button className="secondary-action" type="button" disabled={busy || reason.trim().length < 3 || connection.active_tier !== "EXCLUSIVE_PREMIUM"} onClick={() => manageTelegram(connection, "RESTORE")}>{language === "de" ? "Zugang neu senden" : "Resend access"}</button><button className="secondary-action" type="button" disabled={busy || reason.trim().length < 3 || connection.status === "ADMIN_SUSPENDED"} onClick={() => manageTelegram(connection, "REMOVE")}>{language === "de" ? "Zugang pausieren" : "Pause access"}</button><button className="danger-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => manageTelegram(connection, "UNLINK")}>{language === "de" ? "Verknüpfung löschen" : "Delete connection"}</button></div>
          </article>;
        }) : <div className="member-empty-state"><h3>{language === "de" ? "Noch keine Telegram-Verknüpfungen" : "No Telegram connections yet"}</h3><p>{language === "de" ? "Sobald ein Premium-Shadow-Mitglied den Bot verbindet, erscheint der datensparsame Status hier." : "Once a Premium Shadow member connects the bot, the data-minimised status appears here."}</p></div>}</div>
      </section>}

      {tab === "monitoring" && <section className="admin-panel system-monitoring">
        <div className="admin-panel__heading"><div><p className="eyebrow">PRIVACY-SAFE OPERATIONS</p><h2>System Monitoring</h2><p className="admin-note">{language === "de" ? "Technischer Zustand und aggregierte Conversion-Kennzahlen ohne gespeicherte IP-Adresse, User-Agent oder Werbe-Cookies." : "Technical health and aggregate conversion metrics without stored IP addresses, user agents or advertising cookies."}</p></div><span>{monitoring?.generatedAt ? formatDate(monitoring.generatedAt, language) : "—"}</span></div>
        <div className="admin-overview-grid">
          <article className="admin-metric-card"><span>{language === "de" ? "Besucher · 30 Tage" : "Visitors · 30 days"}</span><strong>{(monitoring?.visits || []).reduce((sum, day) => sum + Number(day.visitors || 0), 0)}</strong><small>{(monitoring?.visits || []).reduce((sum, day) => sum + Number(day.page_views || 0), 0)} Page Views</small></article>
          <article className="admin-metric-card"><span>{language === "de" ? "Aktive Konten" : "Active accounts"}</span><strong>{Number(monitoring?.funnel?.users?.active || 0)}</strong><small>{Number(monitoring?.funnel?.users?.total || 0)} {language === "de" ? "gesamt" : "total"}</small></article>
          <article className="admin-metric-card"><span>{language === "de" ? "VIP-Altersprüfungen" : "VIP age reviews"}</span><strong>{Number(monitoring?.funnel?.ageVerification?.pending || 0)}</strong><small>{Number(monitoring?.funnel?.ageVerification?.cleanup_pending || 0)} cleanup pending</small></article>
          <article className="admin-metric-card"><span>{language === "de" ? "Bezahlte Aufträge" : "Paid orders"}</span><strong>{Number(monitoring?.funnel?.orders?.paid || 0)}</strong><small>{Number(monitoring?.funnel?.orders?.pending || 0)} {language === "de" ? "offen" : "pending"}</small></article>
          <article className="admin-metric-card"><span>{language === "de" ? "Aktive Memberships" : "Active memberships"}</span><strong>{Number(monitoring?.funnel?.entitlements?.active || 0)}</strong></article>
          <article className="admin-metric-card"><span>Newsletter</span><strong>{Number(monitoring?.funnel?.newsletter?.subscribed || 0)}</strong><small>{Number(monitoring?.funnel?.newsletter?.pending || 0)} Double-Opt-in pending</small></article>
          <article className="admin-metric-card"><span>Telegram</span><strong>{Number(monitoring?.funnel?.telegram?.active || 0)}</strong><small>{Number(monitoring?.funnel?.telegram?.invite_sent || 0)} {language === "de" ? "Einladungen offen" : "invites pending"} · {Number(monitoring?.funnel?.telegram?.errors || 0)} errors</small></article>
        </div>
        <div className="monitoring-conversions">
          {[
            [language === "de" ? "Registrierung abgeschlossen" : "Registration completed", "registration_completed", "registration_started"],
            [language === "de" ? "VIP-Altersprüfung eingereicht" : "VIP age review submitted", "age_submitted", "age_started"],
            [language === "de" ? "Auftrag erstellt" : "Order created", "order_created", "checkout_started"],
            [language === "de" ? "Newsletter-Opt-in gestartet" : "Newsletter opt-in started", "newsletter_opt_in", "page_view"],
          ].map(([label, resultEvent, sourceEvent]) => {
            const result = eventTotal(monitoring, resultEvent);
            const source = eventTotal(monitoring, sourceEvent);
            return <article key={resultEvent}><span>{label}</span><strong>{result}</strong><small>{conversionRate(result, source)} {language === "de" ? "vom vorherigen Schritt" : "from previous step"}</small></article>;
          })}
        </div>
        <article className="monitoring-visit-trend">
          <div><h3>{language === "de" ? "Besuche der letzten 30 Tage" : "Visits in the last 30 days"}</h3><p className="admin-note">{language === "de" ? "Tagesaggregate ohne gespeicherte IP-Adressen oder geräteübergreifende Kennung." : "Daily aggregates without stored IP addresses or cross-device identifiers."}</p></div>
          <div className="monitoring-bars">{(monitoring?.visits || []).map((day) => {
            const maximum = Math.max(1, ...(monitoring?.visits || []).map((entry) => Number(entry.page_views || 0)));
            return <span key={day.day} title={`${day.day}: ${day.page_views} Page Views`} style={{ "--bar-size": `${Math.max(4, Number(day.page_views || 0) / maximum * 100)}%` }}><i /><small>{String(day.day).slice(5)}</small></span>;
          })}</div>
        </article>
        <div className="monitoring-grid">
          <article><h3>{language === "de" ? "Technik" : "Technical"}</h3><dl className="admin-facts">{Object.entries(monitoring?.technical || {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl></article>
          <article><h3>{language === "de" ? "Wartungsjobs" : "Maintenance jobs"}</h3><div className="monitoring-list">{(monitoring?.jobs || []).length ? monitoring.jobs.map((job, index) => <div key={`${job.job_name}-${job.started_at}-${index}`}><span><strong>{job.job_name}</strong><small>{formatDate(job.started_at, language)} · {job.duration_ms ?? "—"} ms</small></span><span className={`order-status order-status--${String(job.status).toLowerCase()}`}>{job.status}</span></div>) : <p>{language === "de" ? "Noch keine protokollierten Läufe." : "No recorded runs yet."}</p>}</div></article>
          <article><h3>{language === "de" ? "D1-Sicherungen" : "D1 backups"}</h3><p className="admin-note">{language === "de" ? "Private R2-Sicherungen, maximal zwei rotierende Stände." : "Private R2 backups with no more than two rotating snapshots."}</p><div className="monitoring-list">{(monitoring?.backups?.objects || []).map((backup) => <div key={backup.key}><span><strong>{backup.key.split("/").pop()}</strong><small>{formatBytes(backup.size)} · {formatDate(backup.uploadedAt, language)}</small></span><span className="order-status">PRIVATE</span></div>)}</div></article>
        </div>
      </section>}

      {tab === "simulation" && <section className="admin-panel role-simulation-panel">
        <div className="admin-panel__heading"><div><p className="eyebrow">SECURE PRODUCTION VIEW</p><h2>{language === "de" ? "Vollständige Website aus Nutzersicht" : "Full website from a member perspective"}</h2><p className="admin-note">{language === "de" ? "Öffnet die gesamte produktive Website in der gewählten Rolle – einschließlich aller dafür freigegebenen Musikbeiträge und Medien. Der private VIP-Bereich für Erwachsene ist von der Simulation ausgeschlossen. Die Ansicht bleibt schreibgeschützt und ist nur mit Adminrolle, MFA, registriertem Gerät und aktiver 10-Minuten-Sitzung verfügbar." : "Opens the complete production website in the selected role, including music posts and media available to that role. The private VIP adult area is excluded from simulation. The view remains read-only and requires an admin role, MFA, a registered device and an active 10-minute session."}</p></div></div>
        <label className="form-field simulation-role-select"><span>{language === "de" ? "Rolle / Membership" : "Role / membership"}</span><select value={simulationRole} onChange={(event) => setSimulationRole(event.target.value)}><option value="GUEST">Guest</option><option value="REGISTERED">Registered · Email pending</option><option value="FREE">Email verified · Free Preview</option><option value="EXCLUSIVE_BASIC">Basic Shadow</option><option value="EXCLUSIVE_PREMIUM">Premium Shadow</option><option value="EXCLUSIVE_VIP">VIP Shadow</option></select></label>
        <div className="simulation-launch-card">
          <div><span className="order-status">{tierLabels[simulationRole] || simulationRole}</span><h3>{language === "de" ? "Produktivansicht starten" : "Start production view"}</h3><p>{language === "de" ? "Die aktuelle Admin-Sitzung bleibt bestehen. Mit „Zurück zum Adminbereich“ beendest du die Simulation, ohne dich abzumelden." : "Your current admin session remains active. Use “Back to admin” to end the simulation without signing out."}</p></div>
          <button className="primary-action" type="button" onClick={() => startAdminSimulation(simulationRole)}>{language === "de" ? "Gesamte Website simulieren" : "Simulate full website"} →</button>
        </div>
      </section>}

      {tab === "users" && <section className="admin-panel user-management">
        <div className="admin-panel__heading"><div><p className="eyebrow">{language === "de" ? "ACCOUNT CONTROL" : "ACCOUNT CONTROL"}</p><h2>{language === "de" ? "Nutzerverwaltung" : "User management"}</h2></div><span>{users.length}</span></div>
        <p className="admin-note">{language === "de" ? "Alle bezahlten Stufen haben denselben Zugang zu Musik und Behind-the-Scenes-Inhalten. Premium Shadow und VIP Shadow erhalten 15 % Rabatt auf alle Leistungen von Jason Shadow. Telegram ist ausschließlich bei Premium Shadow enthalten; VIP Shadow bietet den separat altersverifizierten privaten Bereich." : "All paid tiers share the same music and behind-the-scenes access. Premium Shadow and VIP Shadow receive a 15% discount on all Jason Shadow services. Telegram is exclusive to Premium Shadow; VIP Shadow offers the separately age-verified private area."}</p>
        <label className="form-field user-search"><span>{language === "de" ? "Suchen" : "Search"}</span><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={language === "de" ? "Name, E-Mail oder User-ID" : "Name, email or user ID"} /></label>
        <div className="admin-user-list">{users.filter((profile) => `${profile.display_name} ${profile.email} ${profile.appwrite_user_id}`.toLowerCase().includes(userSearch.toLowerCase())).map((profile) => {
          const restricted = profile.account_status === "RESTRICTED";
          const reason = userReasons[profile.appwrite_user_id] || "";
          return <article className="admin-user-card" key={profile.appwrite_user_id}>
            <div className="admin-user-card__head"><div><strong>{profile.display_name || "Member"}</strong><span>{profile.email}</span></div><span className="order-status">{profile.account_status}</span></div>
            <dl className="admin-facts"><div><dt>E-Mail</dt><dd>{profile.email_verified ? (language === "de" ? "Bestätigt" : "Verified") : (language === "de" ? "Offen" : "Pending")}</dd></div><div><dt>{language === "de" ? "VIP-Altersprüfung" : "VIP age review"}</dt><dd>{profile.age_status}</dd></div><div><dt>Membership</dt><dd>{profile.entitlement_tier ? `${tierLabels[profile.entitlement_tier]} · ${formatDate(profile.entitlement_expires_at, language)}` : (language === "de" ? "Keine aktive" : "No active membership")}</dd></div><div><dt>{language === "de" ? "Bestellungen" : "Orders"}</dt><dd>{profile.order_count || 0} · {profile.open_order_count || 0} {language === "de" ? "offen" : "open"}</dd></div><div><dt>{language === "de" ? "Letzte Aktivität" : "Last active"}</dt><dd>{formatDate(profile.last_active_at, language)}</dd></div><div><dt>User ID</dt><dd>{profile.appwrite_user_id}</dd></div></dl>
            <label className="form-field"><span>{language === "de" ? "Admin-Begründung" : "Admin reason"}</span><input minLength="3" maxLength="500" value={reason} onChange={(event) => setUserReasons((current) => ({ ...current, [profile.appwrite_user_id]: event.target.value }))} placeholder={language === "de" ? "Für Sperrung, Freigabe oder Löschung" : "For restriction, restore or deletion"} /></label>
            <div className="admin-membership-grant">
              <label className="form-field"><span>{language === "de" ? "Membership manuell vergeben" : "Grant membership manually"}</span><select value={membershipSelections[profile.appwrite_user_id] || "exclusive-basic-30d"} onChange={(event) => setMembershipSelections((current) => ({ ...current, [profile.appwrite_user_id]: event.target.value }))}>{membershipProducts.map((product) => <option value={product.sku} key={product.sku}>{product.displayName}</option>)}</select></label>
              <button className="primary-action" type="button" disabled={busy || reason.trim().length < 3 || profile.account_status !== "ACTIVE" || !profile.email_verified} onClick={() => grantMembership(profile)}>{language === "de" ? "Membership vergeben" : "Grant membership"}</button>
              {(profile.account_status !== "ACTIVE" || !profile.email_verified) && <small>{language === "de" ? "Nur für aktive Konten mit bestätigter E-Mail-Adresse möglich." : "Available for active accounts with a verified email address."}</small>}
            </div>
            <div className="admin-user-actions"><button className="secondary-action" type="button" disabled={busy} onClick={() => manageUser(profile, "RESET")}>{language === "de" ? "Passwort zurücksetzen" : "Reset password"}</button>{!profile.email_verified && <button className="secondary-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => manageUser(profile, "VERIFY_EMAIL")}>{language === "de" ? "E-Mail manuell bestätigen" : "Verify email manually"}</button>}<button className={restricted ? "primary-action" : "secondary-action"} type="button" disabled={busy || reason.trim().length < 3} onClick={() => manageUser(profile, restricted ? "UNRESTRICT" : "RESTRICT")}>{restricted ? (language === "de" ? "Konto entsperren" : "Unblock account") : (language === "de" ? "Konto sperren" : "Block account")}</button><button className="danger-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => manageUser(profile, "DELETE")}>{language === "de" ? "Konto löschen" : "Delete account"}</button></div>
            <button className="secondary-action admin-device-toggle" type="button" disabled={busy} onClick={() => openUserDevices(profile)}>
              {language === "de" ? "Geräte & Sitzungen verwalten" : "Manage devices & sessions"}
            </button>
            {deviceUserId === profile.appwrite_user_id && userDevices && <div className="admin-device-manager">
              <h4>{language === "de" ? "Aktive Login-Sitzungen" : "Active login sessions"}</h4>
              {(userDevices.loginSessions || []).length
                ? userDevices.loginSessions.map((session) => <div className="admin-device-row" key={session.id}>
                  <span><strong>{[session.deviceBrand, session.deviceName, session.osName, session.clientName].filter(Boolean).join(" · ") || (language === "de" ? "Unbekanntes Gerät" : "Unknown device")}</strong><small>{formatDate(session.updatedAt, language)} · {session.countryName || session.countryCode || "—"}</small></span>
                  <button className="danger-action" type="button" disabled={busy} onClick={() => removeUserDevice(profile, "session", session.id)}>{language === "de" ? "Abmelden" : "Sign out"}</button>
                </div>)
                : <p>{language === "de" ? "Keine Login-Sitzungen." : "No login sessions."}</p>}
              <h4>{language === "de" ? "Registrierte Inhaltsgeräte" : "Registered content devices"}</h4>
              {(userDevices.registeredDevices || []).length
                ? userDevices.registeredDevices.map((device) => <div className={`admin-device-row${device.status === "REVOKED" ? " is-locked" : ""}`} key={device.id}>
                  <span><strong>{device.display_name || (language === "de" ? "Persönliches Gerät" : "Personal device")}</strong><small>{device.status === "REVOKED" ? (language === "de" ? "Gesperrt" : "Locked") : formatDate(device.last_seen_at, language)}</small></span>
                  <div className="device-card__actions"><button className="secondary-action" type="button" disabled={busy} onClick={() => changeUserDeviceLock(profile, device, device.status === "ACTIVE")}>{device.status === "ACTIVE" ? (language === "de" ? "Sperren" : "Lock") : (language === "de" ? "Entsperren" : "Unlock")}</button><button className="danger-action" type="button" disabled={busy} onClick={() => removeUserDevice(profile, "registered", device.id)}>{language === "de" ? "Entfernen" : "Remove"}</button></div>
                </div>)
                : <p>{language === "de" ? "Keine registrierten Geräte." : "No registered devices."}</p>}
            </div>}
          </article>;
        })}</div>
      </section>}

      {tab === "age" && <section className="admin-grid">
        <p className="admin-note admin-panel--wide">{language === "de" ? "Prüfe freiwillige Altersnachweise für den separaten privaten VIP-Bereich. Die normale Musik-Mitgliedschaft und ihre Behind-the-Scenes-Inhalte benötigen keine Altersprüfung. Bestehende und historische Fälle bleiben den vertraulichen Prüf- und Löschregeln unterworfen." : "Review voluntary age-verification requests for the separate private VIP area. Ordinary music membership and behind-the-scenes content do not require age verification. Existing and historical cases remain subject to the private review and deletion rules."}</p>
        <article className="admin-panel"><h2>{t.pending}</h2>{cases.length ? <div className="admin-list">{cases.map((item) => <button type="button" className={selectedCase?.case?.id === item.id ? "is-active" : ""} onClick={() => selectCase(item.id)} key={item.id}><strong>{item.display_name || item.appwrite_user_id}</strong><span>{item.evidence_count} Dateien · {formatDate(item.submitted_at, language)}</span></button>)}</div> : <p>{t.noCases}</p>}</article>
        <article className="admin-panel admin-review">{selectedCase ? <>
          <p className="eyebrow">{selectedCase.case.manual_review_status}</p>
          <h2>{selectedCase.case.display_name || selectedCase.case.appwrite_user_id}</h2>
          <dl className="admin-facts"><div><dt>E-Mail</dt><dd>{selectedCase.case.email}</dd></div><div><dt>User ID</dt><dd>{selectedCase.case.appwrite_user_id}</dd></div><div><dt>{language === "de" ? "Dokument" : "Document"}</dt><dd>{selectedCase.case.document_type} · {selectedCase.case.country_code_snapshot || "–"}</dd></div><div><dt>{language === "de" ? "Eingereicht" : "Submitted"}</dt><dd>{formatDate(selectedCase.case.submitted_at, language)}</dd></div><div><dt>Consent</dt><dd>{selectedCase.case.instructions_version} · {formatDate(selectedCase.case.consented_at, language)}</dd></div></dl>
          <h3>Live-Challenge</h3>
          {selectedChallenge.code && <div className="admin-liveness-code"><span>{language === "de" ? "Fallcode" : "Case code"}</span><strong>{selectedChallenge.code}</strong></div>}
          <ol className="challenge-list">{selectedChallenge.steps.map((step) => <li key={step}>{(challengeCopy[language] || challengeCopy.de)[step] || step}</li>)}</ol>
          <h3>{t.evidence}</h3><p className="admin-note">{t.privacy}</p>
          <div className="evidence-list">{selectedEvidence.map((item) => <button className="secondary-action" type="button" onClick={() => openEvidence(item)} key={item.id}>{t.open}: {item.evidence_kind} · {formatBytes(item.size_bytes)}</button>)}</div>
          {preview && <div className="evidence-preview">{preview.type.startsWith("video/") ? <video src={preview.url} controls playsInline /> : <img src={preview.url} alt={preview.kind} />}</div>}
          <fieldset className="review-checklist"><legend>{language === "de" ? "Pflichtprüfung vor Freigabe" : "Required review before approval"}</legend>{requiredReviewItems.map((item) => <label key={item}><input type="checkbox" checked={checkedReviewItems.includes(item)} onChange={(event) => setCheckedReviewItems((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} /><span>{(approvalChecklist[language] || approvalChecklist.de)[item]}</span></label>)}</fieldset>
          <label className="form-field"><span>{t.reason}</span><textarea id="admin-decision-reason" minLength="3" maxLength="500" required /></label>
          <div className="decision-actions"><button className="primary-action" type="button" disabled={busy || checkedReviewItems.length !== requiredReviewItems.length} onClick={() => decide("APPROVED")}>{t.approve}</button><button className="danger-action" type="button" disabled={busy} onClick={() => decide("REJECTED")}>{t.reject}</button></div>
        </> : <p>{t.selectCase}</p>}</article>
      </section>}

      {tab === "content" && <section className="admin-grid admin-content-studio">
        <article className="admin-panel post-composer">
          <p className="eyebrow">{language === "de" ? "CREATOR STUDIO" : "CREATOR STUDIO"}</p>
          <h2>{editingItem ? (language === "de" ? "Beitrag bearbeiten" : "Edit post") : t.uploadTitle}</h2>
          <p className="admin-note">{language === "de" ? "Musik und Behind-the-Scenes werden gemeinsam für alle bezahlten Stufen veröffentlicht. Der getrennte private VIP-Bereich ist ausschließlich für aktive, altersverifizierte VIP-Shadow-Mitglieder. Bestehende Archivbeiträge bleiben gesperrt, bis du jeden Beitrag einzeln prüfst und gezielt für VIP veröffentlichst." : "Music and behind-the-scenes posts are shared by all paid tiers. The separate private VIP area is exclusively for active, age-verified VIP Shadow members. Archived posts remain unavailable until you individually review and explicitly publish each one for VIP."}</p>
          <form className="admin-form post-composer__form" onSubmit={uploadContent} key={editingItem?.id || "new-post"}>
            <label className="form-field"><span>{t.contentTitle}</span><input name="title" maxLength="160" defaultValue={editingItem?.title || ""} placeholder={language === "de" ? "Zum Beispiel: Ein Abend im Studio…" : "For example: An evening in the studio…"} required /></label>
            <label className="form-field"><span>{language === "de" ? "Beitragstext" : "Post text"}</span><textarea name="bodyText" rows="8" maxLength="10000" defaultValue={editingItem?.body_text || ""} placeholder={language === "de" ? "Teile eine Probe, eine Song-Idee oder einen Einblick in deine Sprecherarbeit…" : "Share a rehearsal, a song idea or a glimpse of your voice work…"} /></label>
            <div className="post-composer__row"><label className="form-field"><span>{t.slug}</span><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength="128" defaultValue={editingItem?.slug || ""} placeholder="studio-diary-01" required={!editingItem} disabled={Boolean(editingItem)} /></label><label className="form-field"><span>{language === "de" ? "Inhaltsbereich" : "Content area"}</span><select name="contentScope" aria-label={language === "de" ? "Inhaltsbereich" : "Content area"} value={contentScope} onChange={(event) => setContentScope(event.target.value)} disabled={Boolean(editingItem)}><option value="MUSIC">{language === "de" ? "Musik & Behind-the-Scenes" : "Music & behind the scenes"}</option><option value="VIP_ADULT">{language === "de" ? "Privater VIP-Bereich · altersverifiziert" : "Private VIP area · age verified"}</option></select></label></div>
            <p className="admin-note">{contentScope === "VIP_ADULT" ? (language === "de" ? "Zugang: ausschließlich aktive VIP-Shadow-Mitglieder mit bestätigter Altersprüfung. Keine Newsletter-Veröffentlichung." : "Access: active VIP Shadow members with approved age verification only. Excluded from newsletters.") : editingItem?.required_tier === "FREE" ? (language === "de" ? "Bestehende Vorschau für registrierte Mitglieder; der bisherige Zugriff bleibt erhalten." : "Existing preview for registered members; its current access is preserved.") : (language === "de" ? "Gemeinsamer Zugriff: Basic Shadow, Premium Shadow und VIP Shadow." : "Shared access: Basic Shadow, Premium Shadow and VIP Shadow.")}</p>
            {contentScope === "VIP_ADULT" && <label className="checkout-confirmation"><input name="adultContentReviewed" type="checkbox" required /><span>{language === "de" ? "Ich habe diesen Beitrag für die Veröffentlichung im separaten altersverifizierten VIP-Bereich geprüft." : "I have reviewed this post for publication in the separate age-verified VIP area."}</span></label>}
            <label className="media-drop-field"><span>{editingItem ? (language === "de" ? "Medium optional ersetzen" : "Optionally replace media") : t.file}</span><strong>{language === "de" ? "Datei auswählen" : "Choose media"}</strong><small>JPEG · PNG · WebP · MP4 · WebM</small><input name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required={!editingItem} /></label>
            <label className="checkout-confirmation"><input name="allowComments" type="checkbox" defaultChecked={editingItem ? Boolean(editingItem.allow_comments) : true} /><span>{language === "de" ? "Berechtigte Mitglieder dürfen diesen Beitrag kommentieren." : "Members with access to this post may comment on it."}</span></label>
            <div className="composer-publish-row"><small>{editingItem ? (language === "de" ? "Änderungen sind nach dem Speichern sofort aktiv." : "Changes are active immediately after saving.") : (language === "de" ? "Der Beitrag ist nach erfolgreichem Upload sofort im gewählten Bereich sichtbar." : "The post becomes visible in the selected area immediately after upload.")}</small><div className="decision-actions">{editingItem && <button className="secondary-action" type="button" disabled={busy} onClick={() => { setEditingItem(null); setContentScope("MUSIC"); }}>{language === "de" ? "Abbrechen" : "Cancel"}</button>}<button className="primary-action" disabled={busy}>{editingItem ? (language === "de" ? "Änderungen speichern" : "Save changes") : t.publish}</button></div></div>
          </form>
        </article>
        <article className="admin-panel">
          <h2>{t.currentContent}</h2>
          {items.length ? <div className="content-admin-list">{["MUSIC", "VIP_ADULT", "LEGACY_ADULT"].map((scope) => {
            const scopedItems = items.filter((item) => (item.content_scope || "LEGACY_ADULT") === scope);
            if (!scopedItems.length) return null;
            return <section key={scope} className="admin-content-scope">
              <h3>{scope === "MUSIC" ? (language === "de" ? "Musik & Behind-the-Scenes · gemeinsame Mitgliedsinhalte" : "Music & behind the scenes · shared member content") : scope === "VIP_ADULT" ? (language === "de" ? "Privater VIP-Bereich · altersverifiziert" : "Private VIP area · age verified") : (language === "de" ? "Gesperrtes Archiv · Einzelprüfung erforderlich" : "Quarantined archive · individual review required")}</h3>
              {scopedItems.map((item) => <div className="content-admin-card" key={item.id}>
                <div><strong>{item.title}</strong><span>{scope === "MUSIC" ? (item.required_tier === "FREE" ? tierLabels.FREE : "Basic Shadow · Premium Shadow · VIP Shadow") : scope === "VIP_ADULT" ? "VIP Shadow · 18+" : (language === "de" ? "Nicht für Mitglieder sichtbar" : "Not visible to members")} · {item.content_status}</span>{item.body_text && <p>{item.body_text}</p>}</div>
                <div><span>{item.content_type ? formatBytes(item.size_bytes) : "–"}</span><small>{Number(item.comment_count || 0)} {language === "de" ? "Kommentare" : "comments"}</small>
                  <div className="content-admin-card__actions">
                    {scope === "MUSIC" && <button className="secondary-action" type="button" disabled={busy || item.content_status !== "ACTIVE"} onClick={() => queueNewDrop(item)}>{language === "de" ? "Als New Drop senden" : "Send as New Drop"}</button>}
                    {scope !== "LEGACY_ADULT" && <button className="secondary-action" type="button" disabled={busy || item.content_status === "RETIRED"} onClick={() => editContent(item)}>{language === "de" ? "Bearbeiten" : "Edit"}</button>}
                    {scope !== "MUSIC" && <button className="secondary-action" type="button" disabled={busy || item.content_status === "RETIRED" || !item.content_type} onClick={() => openAdultReview(item)}>{language === "de" ? "Privat prüfen" : "Review privately"}</button>}
                    <button className="danger-action" type="button" disabled={busy} onClick={() => deleteContent(item)}>{language === "de" ? "Löschen" : "Delete"}</button>
                  </div>
                </div>
              </div>)}
            </section>;
          })}</div> : <p>{t.noContent}</p>}
          {adultReviewItem && <section className="admin-panel adult-content-review" aria-labelledby="adult-review-title">
            <div className="admin-panel__heading"><h3 id="adult-review-title">{language === "de" ? "Einzelprüfung für den privaten VIP-Bereich" : "Individual review for the private VIP area"}</h3><button type="button" className="secondary-action" onClick={closeAdultReview}>{language === "de" ? "Prüfung schließen" : "Close review"}</button></div>
            <strong>{adultReviewItem.title}</strong>
            <p className="admin-note">{language === "de" ? "Die Vorschau ist nur über deine geschützte Admin-Sitzung verfügbar. Sie wird beim Verlassen dieser Ansicht, beim Wechsel in den Hintergrund oder nach zwei Minuten geschlossen. Erst die folgende ausdrückliche Freigabe veröffentlicht diesen einzelnen Beitrag für altersverifizierte VIP-Mitglieder." : "This preview is available only through your protected admin session. It closes when you leave this view, move it into the background or after two minutes. Only the explicit approval below publishes this individual post to age-verified VIP members."}</p>
            {adultReviewPreview ? <div className="evidence-preview">{adultReviewPreview.type.startsWith("video/") ? <video src={adultReviewPreview.url} controls playsInline /> : <img src={adultReviewPreview.url} alt={language === "de" ? "Geschützte Inhaltsprüfung" : "Protected content review"} />}</div> : <p>{busy ? t.loading : (language === "de" ? "Vorschau geschlossen. Öffne die Einzelprüfung erneut, um fortzufahren." : "Preview closed. Reopen the individual review to continue.")}</p>}
            <form className="admin-form" onSubmit={publishReviewedAdult} key={adultReviewItem.id}>
              <label className="checkout-confirmation"><input name="adultContentReviewed" type="checkbox" required /><span>{language === "de" ? "Ich habe diesen einzelnen Beitrag geprüft und gebe ihn ausschließlich für den separaten altersverifizierten VIP-Bereich frei." : "I have reviewed this individual post and approve it exclusively for the separate age-verified VIP area."}</span></label>
              <label className="form-field"><span>{language === "de" ? "Dokumentierte Prüfbegründung" : "Documented review reason"}</span><textarea name="reason" minLength="10" maxLength="1000" required /></label>
              <button className="primary-action" type="submit" disabled={busy || adultReviewPreview?.itemId !== adultReviewItem.id}>{language === "de" ? "Geprüften Beitrag für VIP veröffentlichen" : "Publish reviewed post for VIP"}</button>
            </form>
          </section>}
        </article>
        <article className="admin-panel admin-panel--wide comment-moderation">
          <div className="admin-panel__heading"><div><p className="eyebrow">{language === "de" ? "COMMUNITY" : "COMMUNITY"}</p><h2>{language === "de" ? "Kommentarmoderation" : "Comment moderation"}</h2></div><span>{comments.length}</span></div>
          {comments.length ? <div className="admin-comment-list">{comments.map((comment) => <article className={`admin-comment-card status-${String(comment.status).toLowerCase()}`} key={comment.id}><div className="admin-comment-card__head"><div><strong>{comment.display_name || comment.email || "Member"}</strong><span>{comment.content_title} · {formatDate(comment.created_at, language)}</span></div><span className="order-status">{comment.status}</span></div><p>{comment.body}</p><label className="form-field"><span>{language === "de" ? "Moderationsgrund" : "Moderation reason"}</span><input minLength="3" maxLength="500" value={commentReasons[comment.id] || ""} onChange={(event) => setCommentReasons((current) => ({ ...current, [comment.id]: event.target.value }))} placeholder={language === "de" ? "Interner, nachvollziehbarer Grund" : "Internal moderation reason"} /></label><div className="decision-actions">{comment.status !== "ACTIVE" && <button className="secondary-action" type="button" disabled={busy || String(commentReasons[comment.id] || "").trim().length < 3} onClick={() => moderateComment(comment.id, "RESTORE")}>{language === "de" ? "Wiederherstellen" : "Restore"}</button>}{comment.status === "ACTIVE" && <button className="secondary-action" type="button" disabled={busy || String(commentReasons[comment.id] || "").trim().length < 3} onClick={() => moderateComment(comment.id, "HIDE")}>{language === "de" ? "Ausblenden" : "Hide"}</button>}<button className="danger-action" type="button" disabled={busy || comment.status === "DELETED" || String(commentReasons[comment.id] || "").trim().length < 3} onClick={() => moderateComment(comment.id, "DELETE")}>{language === "de" ? "Löschen" : "Delete"}</button></div></article>)}</div> : <p>{language === "de" ? "Noch keine Kommentare vorhanden." : "No comments yet."}</p>}
        </article>
      </section>}

      {tab === "privacy" && <section className="admin-panel privacy-admin-panel">
        <div className="admin-panel__heading"><div>
          <p className="eyebrow">PRIVACY OPERATIONS</p>
          <h2>{language === "de" ? "Datenschutzanfragen" : "Privacy requests"}</h2>
          <p className="admin-note">{language === "de"
            ? "Nutzeranfragen, Rechtsraum und Zieldatum aus D1. Antworten sind für den Nutzer im Privacy Center sichtbar; jede Entscheidung wird revisionsfest protokolliert."
            : "User requests, jurisdiction and target date from D1. Responses appear in the user's Privacy center and every decision is audited."}</p>
        </div><span>{privacyRequests.filter((item) => ["PENDING","IN_REVIEW"].includes(item.status)).length}</span></div>
        <div className="privacy-admin-list">
          {privacyRequests.length ? privacyRequests.map((item) => {
            const response = privacyResponses[item.id] || "";
            const reason = privacyReasons[item.id] || "";
            const open = ["PENDING", "IN_REVIEW"].includes(item.status);
            const erasure = item.request_type === "ERASURE";
            return <article className="privacy-admin-card" key={item.id}>
              <div className="privacy-admin-card__head"><div>
                <strong>{item.display_name || item.email || item.appwrite_user_id}</strong>
                <span>{item.email} · {item.country_code || "—"}{item.region_code ? `-${item.region_code}` : ""} · {item.privacy_regime}</span>
              </div><span className={`order-status order-status--${String(item.status).toLowerCase()}`}>{item.status}</span></div>
              <dl className="admin-facts">
                <div><dt>{language === "de" ? "Anfrage" : "Request"}</dt><dd>{item.request_type.replaceAll("_", " ")}</dd></div>
                <div><dt>{language === "de" ? "Eingang" : "Submitted"}</dt><dd>{formatDate(item.created_at, language)}</dd></div>
                <div><dt>{language === "de" ? "Zieldatum" : "Target date"}</dt><dd>{formatDate(item.statutory_deadline_at, language)}</dd></div>
                <div><dt>User ID</dt><dd>{item.appwrite_user_id}</dd></div>
              </dl>
              <blockquote>{item.request_note}</blockquote>
              {item.response_summary && <p className="privacy-admin-response"><strong>{language === "de" ? "Antwort:" : "Response:"}</strong> {item.response_summary}</p>}
              {open && !erasure && <>
                <label className="form-field"><span>{language === "de" ? "Antwort an den Nutzer" : "Response to user"}</span>
                  <textarea minLength="3" maxLength="1000" value={response} onChange={(event) => setPrivacyResponses((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
                <label className="form-field"><span>{language === "de" ? "Interne Entscheidungsbegründung" : "Internal decision reason"}</span>
                  <input minLength="3" maxLength="500" value={reason} onChange={(event) => setPrivacyReasons((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
                <div className="decision-actions">
                  {item.status === "PENDING" && <button className="secondary-action" type="button" disabled={busy || response.trim().length < 3 || reason.trim().length < 3} onClick={() => updatePrivacyRequest(item, "IN_REVIEW")}>{language === "de" ? "In Bearbeitung setzen" : "Start review"}</button>}
                  <button className="primary-action" type="button" disabled={busy || response.trim().length < 3 || reason.trim().length < 3} onClick={() => updatePrivacyRequest(item, "COMPLETED")}>{language === "de" ? "Erfüllt abschließen" : "Complete"}</button>
                  <button className="danger-action" type="button" disabled={busy || response.trim().length < 3 || reason.trim().length < 3} onClick={() => updatePrivacyRequest(item, "DENIED")}>{language === "de" ? "Begründet ablehnen" : "Deny with reason"}</button>
                </div>
              </>}
              {open && erasure && <p className="admin-note">{language === "de"
                ? "Dieser Antrag ist mit dem sicheren Löschjob verknüpft und wird nach dessen Abschluss automatisch als erfüllt markiert."
                : "This request is linked to the secure deletion job and completes automatically when that job finishes."}</p>}
            </article>;
          }) : <p>{language === "de" ? "Noch keine Datenschutzanfragen." : "No privacy requests yet."}</p>}
        </div>
      </section>}

      {tab === "payments" && <section className="admin-grid">
        <article className="admin-panel">
          <h2>{t.csvTitle}</h2>
          <p>{t.csvText}</p>
          <form className="admin-form" onSubmit={importCsv}><label className="form-field"><span>N26 CSV</span><input name="csv" type="file" accept=".csv,text/csv" required /></label><button className="primary-action" disabled={busy}>{t.import}</button></form>
          {summaryEntries.length > 0 && <dl className="import-summary">{summaryEntries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>}
        </article>
        <article className="admin-panel">
          <h2>{t.ordersTitle}</h2>
          <p className="admin-note">{t.ordersText}</p>
          {orders.length ? <div className="payment-order-list">{orders.map((order) => {
            const canActivate = ["PENDING", "PROCESSING", "PAID"].includes(order.status);
            const reason = paymentReasons[order.id] || "";
            return <section className="payment-order-card" key={order.id}>
              <div className="payment-order-card__head">
                <div><strong>{order.product_name}</strong><span>{order.display_name || order.email || order.appwrite_user_id}</span></div>
                <span className={`order-status order-status--${String(order.status).toLowerCase()}`}>{order.status}</span>
              </div>
              <dl className="payment-order-facts">
                <div><dt>{t.amount || "Amount"}</dt><dd>{new Intl.NumberFormat(language === "de" ? "de-DE" : "en-IE", { style: "currency", currency: order.currency }).format(order.amount_minor / 100)}</dd></div>
                <div><dt>{t.durationCheckout || "Term"}</dt><dd>{order.duration_value} {order.duration_unit === "MONTHS" ? (language === "de" ? "Monate" : "months") : (language === "de" ? "Tage" : "days")}</dd></div>
                <div><dt>{language === "de" ? "Verwendungszweck" : "Remittance information"}</dt><dd className="payment-reference">{order.transfer_reference}</dd></div>
                <div><dt>{language === "de" ? "Erstellt" : "Created"}</dt><dd>{formatDate(order.created_at, language)}</dd></div>
                <div><dt>{language === "de" ? "Zahlbar bis" : "Due by"}</dt><dd>{formatDate(order.payment_due_at, language)}</dd></div>
                {order.settled_at && <div><dt>{language === "de" ? "Freigeschaltet" : "Activated"}</dt><dd>{formatDate(order.settled_at, language)}</dd></div>}
                {order.activation_email_status && <div><dt>{language === "de" ? "Aktivierungs-Mail" : "Activation email"}</dt><dd>{order.activation_email_status}</dd></div>}
                {order.invoice_number && <div><dt>{language === "de" ? "Rechnung" : "Invoice"}</dt><dd>{order.invoice_number} · {order.invoice_email_status || "PENDING"}</dd></div>}
              </dl>
              <div className="manual-payment-review">
                <label className="form-field"><span>{t.manualReason}</span><textarea minLength="3" maxLength="500" value={reason} onChange={(event) => setPaymentReasons((current) => ({ ...current, [order.id]: event.target.value }))} /></label>
                {canActivate && <><label className="checkout-confirmation"><input type="checkbox" checked={Boolean(paymentConfirmations[order.id])} onChange={(event) => setPaymentConfirmations((current) => ({ ...current, [order.id]: event.target.checked }))} /><span>{t.manualConfirmation}</span></label><button className="danger-action" type="button" disabled={busy || reason.trim().length < 3 || !paymentConfirmations[order.id]} onClick={() => activatePayment(order.id)}>{t.manualActivate}</button></>}
                <div className="order-admin-actions">{order.invoice_archive_available === 1 && <button className="secondary-action" type="button" disabled={busy} onClick={() => openInvoiceCopy(order)}>{language === "de" ? "Rechnungskopie öffnen" : "Open invoice copy"}</button>}{order.status === "PENDING" && <button className="secondary-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => managePaymentOrder(order, "CANCEL")}>{language === "de" ? "Auftrag stornieren" : "Cancel order"}</button>}{["CANCELLED","EXPIRED","REFUNDED"].includes(order.status) && <button className="secondary-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => managePaymentOrder(order, "ARCHIVE")}>{language === "de" ? "Archivieren" : "Archive"}</button>}</div>
              </div>
            </section>;
          })}</div> : <p>{t.noOrders}</p>}
        </article>
      </section>}
    </main>
  </div>;
}
