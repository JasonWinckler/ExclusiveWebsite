import React, { useEffect, useMemo, useState } from "react";
import {
  adminActivatePaymentOrder,
  adminCreateContent,
  adminDecideAgeCase,
  adminFetchAgeEvidence,
  adminGetAgeCase,
  adminImportN26Csv,
  adminListAgeCases,
  adminListContent,
  adminListContentComments,
  adminListPaymentOrders,
  adminModerateContentComment,
  adminUploadContent,
} from "./lib/appwrite";

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
  },
  en: {
    DOCUMENT_FRONT_LEGIBLE: "The front is complete and legible.",
    DOCUMENT_BACK_LEGIBLE: "The back is complete and legible.",
    DOCUMENT_VALID_AND_OVER_18: "The document is valid and the date of birth confirms age 18 or older.",
    DOCUMENT_SAME_ORIGINAL: "Images and video show the same physical original document and plausible security features.",
    FACE_MATCHES_DOCUMENT: "The face in the video plausibly matches the ID portrait.",
    LIVE_VIDEO_UNCUT: "The live video is continuous, without cuts, filters, screen replay or another person.",
    CHALLENGE_COMPLETED_IN_ORDER: "The server challenge was completed in full and in the required order.",
  },
};

const challengeCopy = {
  de: {
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
  const [tab, setTab] = useState("age");
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [items, setItems] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentReasons, setCommentReasons] = useState({});
  const [orders, setOrders] = useState([]);
  const [paymentReasons, setPaymentReasons] = useState({});
  const [paymentConfirmations, setPaymentConfirmations] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [checkedReviewItems, setCheckedReviewItems] = useState([]);

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
  const loadAll = async () => {
    setBusy(true);
    setError("");
    try {
      await Promise.all([loadCases(), loadContent(), loadComments(), loadPayments()]);
    } catch (requestError) {
      setError(requestError?.code || t.genericError);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const selectCase = async (caseId) => {
    setBusy(true);
    setError("");
    try {
      setSelectedCase(await adminGetAgeCase(caseId));
      setPreview(null);
      setCheckedReviewItems([]);
    } catch (requestError) {
      setError(requestError?.code || t.genericError);
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
      setError(requestError?.code || t.genericError);
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
      setError(requestError?.code || t.genericError);
    } finally {
      setBusy(false);
    }
  };

  const uploadContent = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const item = await adminCreateContent({
        slug: String(data.get("slug") || ""),
        title: String(data.get("title") || ""),
        tier: String(data.get("tier") || ""),
        bodyText: String(data.get("bodyText") || ""),
        allowComments: data.get("allowComments") === "on",
      });
      await adminUploadContent(item.id, file);
      form.reset();
      setNotice(t.published);
      await loadContent();
    } catch (requestError) {
      setError(requestError?.code || t.genericError);
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
      setError(requestError?.code || t.genericError);
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
      setError(requestError?.code || t.genericError);
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
      setError(requestError?.code || t.genericError);
    } finally {
      setBusy(false);
    }
  };

  const selectedEvidence = selectedCase?.evidence || [];
  const requiredReviewItems = Object.keys(approvalChecklist[language] || approvalChecklist.de);
  const selectedChallenge = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedCase?.case?.liveness_challenge_json || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
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
      <div className="admin-title"><div><p className="eyebrow">SINGLE CREATOR CONTROL</p><h1>{t.title}</h1></div><button className="secondary-action" type="button" onClick={loadAll} disabled={busy}>{t.refresh}</button></div>
      <nav className="admin-tabs" aria-label={t.title}>{[
        ["age", t.age], ["content", t.content], ["payments", t.payments],
      ].map(([key, label]) => <button type="button" className={tab === key ? "is-active" : ""} onClick={() => { setTab(key); setNotice(""); setError(""); }} key={key}>{label}</button>)}</nav>
      {busy && <p className="form-notice" role="status">{t.loading}</p>}
      {notice && <p className="form-notice form-notice--success" role="status">{notice}</p>}
      {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}

      {tab === "age" && <section className="admin-grid">
        <article className="admin-panel"><h2>{t.pending}</h2>{cases.length ? <div className="admin-list">{cases.map((item) => <button type="button" className={selectedCase?.case?.id === item.id ? "is-active" : ""} onClick={() => selectCase(item.id)} key={item.id}><strong>{item.display_name || item.appwrite_user_id}</strong><span>{item.evidence_count} Dateien · {formatDate(item.submitted_at, language)}</span></button>)}</div> : <p>{t.noCases}</p>}</article>
        <article className="admin-panel admin-review">{selectedCase ? <>
          <p className="eyebrow">{selectedCase.case.manual_review_status}</p>
          <h2>{selectedCase.case.display_name || selectedCase.case.appwrite_user_id}</h2>
          <dl className="admin-facts"><div><dt>E-Mail</dt><dd>{selectedCase.case.email}</dd></div><div><dt>User ID</dt><dd>{selectedCase.case.appwrite_user_id}</dd></div><div><dt>Eingereicht</dt><dd>{formatDate(selectedCase.case.submitted_at, language)}</dd></div><div><dt>Consent</dt><dd>{selectedCase.case.instructions_version} · {formatDate(selectedCase.case.consented_at, language)}</dd></div></dl>
          <h3>Live-Challenge</h3><ol className="challenge-list">{selectedChallenge.map((step) => <li key={step}>{(challengeCopy[language] || challengeCopy.de)[step] || step}</li>)}</ol>
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
          <h2>{t.uploadTitle}</h2>
          <p className="admin-note">{language === "de" ? "Erstelle einen vollständigen Beitrag aus Titel, persönlichem Text, Medium und Zugriffslevel. Erfolgreiche Uploads werden sofort veröffentlicht." : "Create a complete post with a title, personal text, media and access level. Successful uploads publish immediately."}</p>
          <form className="admin-form post-composer__form" onSubmit={uploadContent}>
            <label className="form-field"><span>{t.contentTitle}</span><input name="title" maxLength="160" placeholder={language === "de" ? "Gib dem Moment einen Titel…" : "Give the moment a title…"} required /></label>
            <label className="form-field"><span>{language === "de" ? "Beitragstext" : "Post text"}</span><textarea name="bodyText" rows="8" maxLength="10000" placeholder={language === "de" ? "Erzähle die Geschichte hinter dem Beitrag, sprich deine Mitglieder direkt an oder kündige etwas Besonderes an…" : "Tell the story behind this post, speak directly to your members, or tease something special…"} /></label>
            <div className="post-composer__row"><label className="form-field"><span>{t.slug}</span><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength="128" placeholder="midnight-confession" required /></label><label className="form-field"><span>{t.tier}</span><select name="tier" defaultValue="FREE">{Object.entries(tierLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
            <label className="media-drop-field"><span>{t.file}</span><strong>{language === "de" ? "Datei auswählen" : "Choose media"}</strong><small>JPEG · PNG · WebP · MP4 · WebM</small><input name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required /></label>
            <label className="checkout-confirmation"><input name="allowComments" type="checkbox" defaultChecked /><span>{language === "de" ? "Paid Member dürfen diesen Beitrag kommentieren." : "Paid members may comment on this post."}</span></label>
            <div className="composer-publish-row"><small>{language === "de" ? "Der Beitrag ist nach erfolgreichem Upload sofort im gewählten Bereich sichtbar." : "The post becomes visible in the selected area immediately after upload."}</small><button className="primary-action" disabled={busy}>{t.publish}</button></div>
          </form>
        </article>
        <article className="admin-panel">
          <h2>{t.currentContent}</h2>
          {items.length ? <div className="content-admin-list">{items.map((item) => <div className="content-admin-card" key={item.id}><div><strong>{item.title}</strong><span>{tierLabels[item.required_tier]} · {item.content_status}</span>{item.body_text && <p>{item.body_text}</p>}</div><div><span>{item.content_type ? formatBytes(item.size_bytes) : "–"}</span><small>{Number(item.comment_count || 0)} {language === "de" ? "Kommentare" : "comments"}</small></div></div>)}</div> : <p>{t.noContent}</p>}
        </article>
        <article className="admin-panel admin-panel--wide comment-moderation">
          <div className="admin-panel__heading"><div><p className="eyebrow">{language === "de" ? "COMMUNITY" : "COMMUNITY"}</p><h2>{language === "de" ? "Kommentarmoderation" : "Comment moderation"}</h2></div><span>{comments.length}</span></div>
          {comments.length ? <div className="admin-comment-list">{comments.map((comment) => <article className={`admin-comment-card status-${String(comment.status).toLowerCase()}`} key={comment.id}><div className="admin-comment-card__head"><div><strong>{comment.display_name || comment.email || "Member"}</strong><span>{comment.content_title} · {formatDate(comment.created_at, language)}</span></div><span className="order-status">{comment.status}</span></div><p>{comment.body}</p><label className="form-field"><span>{language === "de" ? "Moderationsgrund" : "Moderation reason"}</span><input minLength="3" maxLength="500" value={commentReasons[comment.id] || ""} onChange={(event) => setCommentReasons((current) => ({ ...current, [comment.id]: event.target.value }))} placeholder={language === "de" ? "Interner, nachvollziehbarer Grund" : "Internal moderation reason"} /></label><div className="decision-actions">{comment.status !== "ACTIVE" && <button className="secondary-action" type="button" disabled={busy || String(commentReasons[comment.id] || "").trim().length < 3} onClick={() => moderateComment(comment.id, "RESTORE")}>{language === "de" ? "Wiederherstellen" : "Restore"}</button>}{comment.status === "ACTIVE" && <button className="secondary-action" type="button" disabled={busy || String(commentReasons[comment.id] || "").trim().length < 3} onClick={() => moderateComment(comment.id, "HIDE")}>{language === "de" ? "Ausblenden" : "Hide"}</button>}<button className="danger-action" type="button" disabled={busy || comment.status === "DELETED" || String(commentReasons[comment.id] || "").trim().length < 3} onClick={() => moderateComment(comment.id, "DELETE")}>{language === "de" ? "Löschen" : "Delete"}</button></div></article>)}</div> : <p>{language === "de" ? "Noch keine Kommentare vorhanden." : "No comments yet."}</p>}
        </article>
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
              </dl>
              {canActivate && <div className="manual-payment-review">
                <label className="form-field"><span>{t.manualReason}</span><textarea minLength="3" maxLength="500" value={reason} onChange={(event) => setPaymentReasons((current) => ({ ...current, [order.id]: event.target.value }))} /></label>
                <label className="checkout-confirmation"><input type="checkbox" checked={Boolean(paymentConfirmations[order.id])} onChange={(event) => setPaymentConfirmations((current) => ({ ...current, [order.id]: event.target.checked }))} /><span>{t.manualConfirmation}</span></label>
                <button className="danger-action" type="button" disabled={busy || reason.trim().length < 3 || !paymentConfirmations[order.id]} onClick={() => activatePayment(order.id)}>{t.manualActivate}</button>
              </div>}
            </section>;
          })}</div> : <p>{t.noOrders}</p>}
        </article>
      </section>}
    </main>
  </div>;
}
