import React, { useEffect, useMemo, useState } from "react";
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
  adminListPrivacyRequests,
  adminListUserDevices,
  adminListUsers,
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
  getProducts,
  getAdminSessionExpiry,
  requestPasswordReset,
} from "./lib/platform";
import { friendlyErrorMessage } from "./lib/error-messages";

const copy = {
  de: {
    title: "Admin-Bereich",
    subtitle: "Manuelle Prüfung, Zahlungseingänge und Single-Creator-Uploads",
    age: "Altersprüfung",
    content: "Content",
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
    tier: "Galerie / Zugriff",
    file: "Beitragsmedium (Bild oder Video)",
    publish: "Beitrag jetzt veröffentlichen",
    published: "Der Beitrag wurde veröffentlicht.",
    currentContent: "Veröffentlichte Beiträge",
    noContent: "Noch keine Beiträge vorhanden.",
    csvTitle: "N26-CSV importieren",
    csvText: "Exportiere die Kontobewegungen bei N26 als CSV. Es werden ausschließlich Betrag, Datum und der exakte Verwendungszweck „Exclusive Content - ID #…“ für den Abgleich verarbeitet; die vollständige CSV wird nicht gespeichert.",
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
    subtitle: "Manual review, incoming payments and single-creator uploads",
    age: "Age review",
    content: "Content",
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
    tier: "Gallery / access",
    file: "Post media (image or video)",
    publish: "Publish post now",
    published: "The post was published.",
    currentContent: "Published posts",
    noContent: "No posts yet.",
    csvTitle: "Import N26 CSV",
    csvText: "Export account activity from N26 as CSV. Only the amount, date and exact “Exclusive Content - ID #…” remittance value are processed for matching; the complete CSV is not stored.",
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
  EXCLUSIVE_BASIC: "Exclusive Basic",
  EXCLUSIVE_PREMIUM: "Exclusive Premium",
  EXCLUSIVE_VIP: "Exclusive VIP",
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

export default function AdminPortal({ user, language, setLanguage, onLogout }) {
  const t = copy[language] || copy.de;
  const [tab, setTab] = useState("overview");
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [items, setItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
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
    if (!editingItem && (!(file instanceof File) || !file.size)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        title: String(data.get("title") || ""),
        tier: String(data.get("tier") || ""),
        bodyText: String(data.get("bodyText") || ""),
        allowComments: data.get("allowComments") === "on",
      };
      const item = editingItem
        ? await adminUpdateContent(editingItem.id, payload)
        : await adminCreateContent({
          slug: String(data.get("slug") || ""),
          ...payload,
        });
      if (file instanceof File && file.size) await adminUploadContent(item.id, file);
      form.reset();
      setEditingItem(null);
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
    setEditingItem(item);
    setNotice("");
    setError("");
    requestAnimationFrame(() => {
      document.querySelector(".post-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
      if (editingItem?.id === item.id) setEditingItem(null);
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
      <div><a className="brand brand--wordmark" href="/">Shadow’s Temptation</a><p>{t.subtitle}</p></div>
      <div className="admin-header__actions">
        <span>{user.email}</span>
        <div className="language-switcher">{["de", "en"].map((lang) => <button className={`language-button${lang === language ? " is-active" : ""}`} type="button" onClick={() => setLanguage(lang)} key={lang}>{lang.toUpperCase()}</button>)}</div>
        <button className="secondary-action" type="button" onClick={onLogout}>{t.logout}</button>
      </div>
    </header>
    <main className="admin-main">
      <div className="admin-title"><div><p className="eyebrow">SINGLE CREATOR CONTROL</p><h1>{t.title}</h1><small className="admin-session-timer">{language === "de" ? "Sichere Admin-Sitzung" : "Secure admin session"} · {Math.floor(sessionSeconds / 60)}:{String(sessionSeconds % 60).padStart(2, "0")}</small></div><button className="secondary-action" type="button" onClick={loadAll} disabled={busy}>{t.refresh}</button></div>
      <nav className="admin-tabs" aria-label={t.title}>{[
        ["overview", language === "de" ? "Übersicht" : "Overview"],
        ["users", language === "de" ? "Nutzer" : "Users"],
        ["age", t.age], ["content", t.content], ["payments", t.payments],
        ["privacy", language === "de" ? "Datenschutz" : "Privacy"],
      ].map(([key, label]) => <button type="button" className={tab === key ? "is-active" : ""} onClick={() => { setTab(key); setNotice(""); setError(""); }} key={key}>{label}</button>)}</nav>
      {busy && <p className="form-notice" role="status">{t.loading}</p>}
      {notice && <p className="form-notice form-notice--success" role="status">{notice}</p>}
      {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}

      {tab === "overview" && <section className="admin-overview-grid">
        <article className="admin-metric-card"><span>{language === "de" ? "Aktive Nutzer" : "Active users"}</span><strong>{users.filter((item) => item.account_status === "ACTIVE").length}</strong><small>{users.length} {language === "de" ? "Konten gesamt" : "accounts total"}</small></article>
        <article className="admin-metric-card"><span>{language === "de" ? "Offene Altersprüfungen" : "Pending age reviews"}</span><strong>{cases.length}</strong><button className="text-button" type="button" onClick={() => setTab("age")}>{language === "de" ? "Prüfen →" : "Review →"}</button></article>
        <article className="admin-metric-card"><span>{language === "de" ? "Offene Zahlungen" : "Pending payments"}</span><strong>{orders.filter((item) => ["PENDING","PROCESSING","PAID"].includes(item.status)).length}</strong><button className="text-button" type="button" onClick={() => setTab("payments")}>{language === "de" ? "Öffnen →" : "Open →"}</button></article>
        <article className="admin-metric-card"><span>{language === "de" ? "Veröffentlichte Beiträge" : "Published posts"}</span><strong>{items.filter((item) => item.content_status === "ACTIVE").length}</strong><small>{comments.filter((item) => item.status === "ACTIVE").length} {language === "de" ? "aktive Kommentare" : "active comments"}</small></article>
        <article className="admin-metric-card"><span>{language === "de" ? "Datenschutzanfragen" : "Privacy requests"}</span><strong>{privacyRequests.filter((item) => ["PENDING","IN_REVIEW"].includes(item.status)).length}</strong><button className="text-button" type="button" onClick={() => setTab("privacy")}>{language === "de" ? "Bearbeiten →" : "Review →"}</button></article>
      </section>}

      {tab === "users" && <section className="admin-panel user-management">
        <div className="admin-panel__heading"><div><p className="eyebrow">{language === "de" ? "ACCOUNT CONTROL" : "ACCOUNT CONTROL"}</p><h2>{language === "de" ? "Nutzerverwaltung" : "User management"}</h2></div><span>{users.length}</span></div>
        <label className="form-field user-search"><span>{language === "de" ? "Suchen" : "Search"}</span><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder={language === "de" ? "Name, E-Mail oder User-ID" : "Name, email or user ID"} /></label>
        <div className="admin-user-list">{users.filter((profile) => `${profile.display_name} ${profile.email} ${profile.appwrite_user_id}`.toLowerCase().includes(userSearch.toLowerCase())).map((profile) => {
          const restricted = profile.account_status === "RESTRICTED";
          const reason = userReasons[profile.appwrite_user_id] || "";
          return <article className="admin-user-card" key={profile.appwrite_user_id}>
            <div className="admin-user-card__head"><div><strong>{profile.display_name || "Member"}</strong><span>{profile.email}</span></div><span className="order-status">{profile.account_status}</span></div>
            <dl className="admin-facts"><div><dt>E-Mail</dt><dd>{profile.email_verified ? (language === "de" ? "Bestätigt" : "Verified") : (language === "de" ? "Offen" : "Pending")}</dd></div><div><dt>Age</dt><dd>{profile.age_status}</dd></div><div><dt>Membership</dt><dd>{profile.entitlement_tier ? `${tierLabels[profile.entitlement_tier]} · ${formatDate(profile.entitlement_expires_at, language)}` : (language === "de" ? "Keine aktive" : "No active membership")}</dd></div><div><dt>{language === "de" ? "Bestellungen" : "Orders"}</dt><dd>{profile.order_count || 0} · {profile.open_order_count || 0} {language === "de" ? "offen" : "open"}</dd></div><div><dt>{language === "de" ? "Letzte Aktivität" : "Last active"}</dt><dd>{formatDate(profile.last_active_at, language)}</dd></div><div><dt>User ID</dt><dd>{profile.appwrite_user_id}</dd></div></dl>
            <label className="form-field"><span>{language === "de" ? "Admin-Begründung" : "Admin reason"}</span><input minLength="3" maxLength="500" value={reason} onChange={(event) => setUserReasons((current) => ({ ...current, [profile.appwrite_user_id]: event.target.value }))} placeholder={language === "de" ? "Für Sperrung, Freigabe oder Löschung" : "For restriction, restore or deletion"} /></label>
            <div className="admin-membership-grant">
              <label className="form-field"><span>{language === "de" ? "Membership manuell vergeben" : "Grant membership manually"}</span><select value={membershipSelections[profile.appwrite_user_id] || "exclusive-basic-30d"} onChange={(event) => setMembershipSelections((current) => ({ ...current, [profile.appwrite_user_id]: event.target.value }))}>{membershipProducts.map((product) => <option value={product.sku} key={product.sku}>{product.displayName}</option>)}</select></label>
              <button className="primary-action" type="button" disabled={busy || reason.trim().length < 3 || profile.account_status !== "ACTIVE" || !profile.email_verified || profile.age_status !== "APPROVED"} onClick={() => grantMembership(profile)}>{language === "de" ? "Membership vergeben" : "Grant membership"}</button>
              {(profile.account_status !== "ACTIVE" || !profile.email_verified || profile.age_status !== "APPROVED") && <small>{language === "de" ? "Erst nach aktiver E-Mail- und Altersverifikation möglich." : "Available after active email and age verification."}</small>}
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
          <fieldset className="review-checklist"><legend>Pflichtprüfung vor Freigabe</legend>{requiredReviewItems.map((item) => <label key={item}><input type="checkbox" checked={checkedReviewItems.includes(item)} onChange={(event) => setCheckedReviewItems((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} /><span>{(approvalChecklist[language] || approvalChecklist.de)[item]}</span></label>)}</fieldset>
          <label className="form-field"><span>{t.reason}</span><textarea id="admin-decision-reason" minLength="3" maxLength="500" required /></label>
          <div className="decision-actions"><button className="primary-action" type="button" disabled={busy || checkedReviewItems.length !== requiredReviewItems.length} onClick={() => decide("APPROVED")}>{t.approve}</button><button className="danger-action" type="button" disabled={busy} onClick={() => decide("REJECTED")}>{t.reject}</button></div>
        </> : <p>{t.selectCase}</p>}</article>
      </section>}

      {tab === "content" && <section className="admin-grid admin-content-studio">
        <article className="admin-panel post-composer">
          <p className="eyebrow">{language === "de" ? "CREATOR STUDIO" : "CREATOR STUDIO"}</p>
          <h2>{editingItem ? (language === "de" ? "Beitrag bearbeiten" : "Edit post") : t.uploadTitle}</h2>
          <p className="admin-note">{editingItem
            ? (language === "de" ? "Passe Text, Zugriffslevel oder Kommentare an. Eine neue Mediendatei ersetzt das bisherige Medium." : "Update copy, access or comments. Choosing new media replaces the existing file.")
            : (language === "de" ? "Erstelle einen vollständigen Beitrag aus Titel, persönlichem Text, Medium und Zugriffslevel. Erfolgreiche Uploads werden sofort veröffentlicht." : "Create a complete post with a title, personal text, media and access level. Successful uploads publish immediately.")}</p>
          <form className="admin-form post-composer__form" onSubmit={uploadContent} key={editingItem?.id || "new-post"}>
            <label className="form-field"><span>{t.contentTitle}</span><input name="title" maxLength="160" defaultValue={editingItem?.title || ""} placeholder={language === "de" ? "Gib dem Moment einen Titel…" : "Give the moment a title…"} required /></label>
            <label className="form-field"><span>{language === "de" ? "Beitragstext" : "Post text"}</span><textarea name="bodyText" rows="8" maxLength="10000" defaultValue={editingItem?.body_text || ""} placeholder={language === "de" ? "Erzähle die Geschichte hinter dem Beitrag, sprich deine Mitglieder direkt an oder kündige etwas Besonderes an…" : "Tell the story behind this post, speak directly to your members, or tease something special…"} /></label>
            <div className="post-composer__row"><label className="form-field"><span>{t.slug}</span><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength="128" defaultValue={editingItem?.slug || ""} placeholder="midnight-confession" required={!editingItem} disabled={Boolean(editingItem)} /></label><label className="form-field"><span>{t.tier}</span><select name="tier" defaultValue={editingItem?.required_tier || "FREE"}>{Object.entries(tierLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
            <label className="media-drop-field"><span>{editingItem ? (language === "de" ? "Medium optional ersetzen" : "Optionally replace media") : t.file}</span><strong>{language === "de" ? "Datei auswählen" : "Choose media"}</strong><small>JPEG · PNG · WebP · MP4 · WebM</small><input name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required={!editingItem} /></label>
            <label className="checkout-confirmation"><input name="allowComments" type="checkbox" defaultChecked={editingItem ? Boolean(editingItem.allow_comments) : true} /><span>{language === "de" ? "Exclusive Member dürfen diesen Beitrag kommentieren." : "Exclusive Members may comment on this post."}</span></label>
            <div className="composer-publish-row"><small>{editingItem ? (language === "de" ? "Änderungen sind nach dem Speichern sofort aktiv." : "Changes are active immediately after saving.") : (language === "de" ? "Der Beitrag ist nach erfolgreichem Upload sofort im gewählten Bereich sichtbar." : "The post becomes visible in the selected area immediately after upload.")}</small><div className="decision-actions">{editingItem && <button className="secondary-action" type="button" disabled={busy} onClick={() => setEditingItem(null)}>{language === "de" ? "Abbrechen" : "Cancel"}</button>}<button className="primary-action" disabled={busy}>{editingItem ? (language === "de" ? "Änderungen speichern" : "Save changes") : t.publish}</button></div></div>
          </form>
        </article>
        <article className="admin-panel">
          <h2>{t.currentContent}</h2>
          {items.length ? <div className="content-admin-list">{items.map((item) => <div className="content-admin-card" key={item.id}><div><strong>{item.title}</strong><span>{tierLabels[item.required_tier]} · {item.content_status}</span>{item.body_text && <p>{item.body_text}</p>}</div><div><span>{item.content_type ? formatBytes(item.size_bytes) : "–"}</span><small>{Number(item.comment_count || 0)} {language === "de" ? "Kommentare" : "comments"}</small><div className="content-admin-card__actions"><button className="secondary-action" type="button" disabled={busy} onClick={() => editContent(item)}>{language === "de" ? "Bearbeiten" : "Edit"}</button><button className="danger-action" type="button" disabled={busy} onClick={() => deleteContent(item)}>{language === "de" ? "Löschen" : "Delete"}</button></div></div></div>)}</div> : <p>{t.noContent}</p>}
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
              </dl>
              <div className="manual-payment-review">
                <label className="form-field"><span>{t.manualReason}</span><textarea minLength="3" maxLength="500" value={reason} onChange={(event) => setPaymentReasons((current) => ({ ...current, [order.id]: event.target.value }))} /></label>
                {canActivate && <><label className="checkout-confirmation"><input type="checkbox" checked={Boolean(paymentConfirmations[order.id])} onChange={(event) => setPaymentConfirmations((current) => ({ ...current, [order.id]: event.target.checked }))} /><span>{t.manualConfirmation}</span></label><button className="danger-action" type="button" disabled={busy || reason.trim().length < 3 || !paymentConfirmations[order.id]} onClick={() => activatePayment(order.id)}>{t.manualActivate}</button></>}
                <div className="order-admin-actions">{order.status === "PENDING" && <button className="secondary-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => managePaymentOrder(order, "CANCEL")}>{language === "de" ? "Auftrag stornieren" : "Cancel order"}</button>}{["CANCELLED","EXPIRED","REFUNDED"].includes(order.status) && <button className="secondary-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => managePaymentOrder(order, "ARCHIVE")}>{language === "de" ? "Archivieren" : "Archive"}</button>}</div>
              </div>
            </section>;
          })}</div> : <p>{t.noOrders}</p>}
        </article>
      </section>}
    </main>
  </div>;
}
