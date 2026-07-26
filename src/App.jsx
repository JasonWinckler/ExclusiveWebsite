import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import AdminPortal from "./AdminPortal";
import {
  completeEmailVerification,
  completePasswordReset,
  createAgeVerificationCase,
  createContentComment,
  createSepaOrder,
  deleteContentComment,
  fetchContentItem,
  getContentComments,
  getContentItems,
  getCurrentUser,
  getMembershipStatus,
  getPaymentOrders,
  getPremiumTelegramPerk,
  getProducts,
  getVipWhatsappPerk,
  login,
  logout,
  registerAccount,
  registerCurrentDevice,
  requestPasswordReset,
  resendVerification,
  submitAgeVerificationCase,
  updateProfileName,
  uploadAgeEvidence,
  cancelPaymentOrder,
} from "./lib/appwrite";

const languageKey = "jason-shadow-membership-language";
const initialLanguage = () => localStorage.getItem(languageKey) || (navigator.language?.startsWith("de") ? "de" : "en");

const copy = {
  de: {
    pricingEyebrow: "EXCLUSIVE MEMBERSHIP",
    pricingTitle: "Wähle deinen Zugang",
    pricingText: "Einmalige Laufzeit, keine automatische Verlängerung. Freischaltung erfolgt erst nach dem bestätigten SEPA-Zahlungseingang.",
    basic: "Exclusive Basic",
    premium: "Exclusive Premium",
    vip: "Exclusive VIP",
    basicText: "Zugang zur Basic Gallery.",
    premiumText: "Basic plus Premium Gallery.",
    vipText: "Alle Galerien plus zusätzliche VIP-Perks.",
    buy: "Zugang wählen",
    trial: "Einmaliges Schnupperangebot",
    catalogUnavailable: "Der Produktkatalog ist derzeit nicht erreichbar. Es kann kein Zahlungsauftrag erzeugt werden.",
    paymentTitle: "Bestellung & SEPA-Zahlung",
    paymentIntro: "Prüfe deine Auswahl und Rechnungsdaten. Anschließend erhältst du deine persönlichen SEPA-Zahlungsdaten.",
    checkoutReviewTitle: "Bestellübersicht",
    checkoutReviewText: "Deine Bestellung wird erst nach deiner Bestätigung verbindlich angelegt.",
    productLabel: "Mitgliedschaft",
    durationCheckout: "Laufzeit",
    billingAccount: "Abrechnungskonto",
    paymentKind: "Zahlungsart",
    paymentKindValue: "Einmalige SEPA-Überweisung",
    renewalLabel: "Verlängerung",
    renewalValue: "Keine automatische Verlängerung",
    accessLabel: "Freischaltung",
    accessValue: "Nach bestätigtem Zahlungseingang",
    totalDue: "Heute zu zahlen",
    confirmationText: "Ich bestätige Tarif, Laufzeit und Gesamtbetrag und möchte im nächsten Schritt die SEPA-Zahlungsdaten anfordern.",
    confirmOrder: "Bestellung bestätigen",
    backToSummary: "Zurück zur Bestellübersicht",
    payWithSepa: "PAY WITH SEPA",
    databaseOrderNote: "Im nächsten Schritt erhältst du QR-Code und Zahlungsdaten für eine einmalige SEPA-Überweisung.",
    qrView: "QR-Code",
    detailsView: "Zahlungsdaten",
    scanQr: "Scanne den QR-Code mit deiner Banking-App und prüfe die vorausgefüllten Daten vor der Freigabe.",
    beneficiary: "Empfänger",
    iban: "IBAN",
    bic: "BIC",
    amount: "Betrag",
    reference: "Verwendungszweck",
    due: "Zahlbar bis",
    paymentPending: "Nach der Überweisung kann die Zuordnung erst mit dem nächsten N26-CSV-Abgleich im Adminbereich erfolgen.",
    ageTitle: "Manuelle Altersprüfung",
    ageText: "Lade gut lesbare Bilder der Vorder- und Rückseite deines Ausweises hoch. Nimm danach direkt im Browser ein Live-Video auf, in dem dein Gesicht sichtbar ist, du den Ausweis hochhältst und deinen Kopf bewegst.",
    documentFront: "Ausweis – Vorderseite",
    documentBack: "Ausweis – Rückseite",
    video: "Live-Video mit Gesicht und Ausweis",
    videoInstructions: "Führe die unten angezeigte Einmal-Challenge ohne Unterbrechung aus. Aufnahme: mindestens 10, höchstens 20 Sekunden.",
    cameraStart: "Kamera starten",
    recordStart: "Live-Aufnahme starten",
    recordStop: "Aufnahme beenden",
    recordAgain: "Neu aufnehmen",
    videoReady: "Live-Video ist bereit",
    cameraError: "Die Kamera konnte nicht gestartet werden. Erlaube den Kamerazugriff und nutze einen aktuellen Browser über HTTPS.",
    verificationRules: "Vorbereitung und zulässige Daten",
    rules: [
      "Verwende ausschließlich deinen eigenen, gültigen amtlichen Lichtbildausweis im Original – keine Kopie, kein Screenshot und kein Bild eines Bildschirms.",
      "Gut sichtbar bleiben müssen: Name, Foto, Geburtsdatum, Dokumentart, Ausstellungsland und Gültigkeitsdatum.",
      "Decke nicht benötigte Angaben vor der Aufnahme ab: Anschrift, Ausweis-/Seriennummer, CAN/Zugangsnummer, maschinenlesbare Zone, Unterschrift, Größe und Augenfarbe.",
      "Sorge für helles, gleichmäßiges Licht. Gesicht und Dokument müssen scharf, vollständig und ohne Spiegelung sichtbar sein; Filter, Sonnenbrille, Maske und weitere Personen sind unzulässig.",
    ],
    watermarkNote: "Die Website entfernt Bildmetadaten, verkleinert sehr große Aufnahmen und fügt außerhalb des Dokuments den Hinweis „KOPIE – NUR ALTERSPRÜFUNG“ mit Datum und Seite hinzu.",
    consentText: "Ich bin mindestens 18 Jahre alt, verwende meinen eigenen gültigen Ausweis und willige in die ausschließlich zur Alters- und Identitätsprüfung erforderliche Verarbeitung der Ausweisbilder und Live-Aufnahme ein. Ich habe die Datenschutzhinweise und Löschfrist gelesen.",
    beginVerification: "Einmal-Challenge erzeugen",
    challengeTitle: "Deine persönliche Live-Challenge",
    agePrivacy: "Bilder und Videos werden privat in Cloudflare R2 gespeichert, sind nicht öffentlich abrufbar und werden nach der festgelegten Aufbewahrungsfrist gelöscht.",
    submitAge: "Sicher hochladen & zur Prüfung senden",
    ageSubmitted: "Deine Anfrage wurde zur manuellen Prüfung eingereicht.",
    reviewReady: "Zur Prüfung eingereicht",
    gallery: "Galerie",
    openGallery: "Galerie öffnen",
    galleryText: "Free Preview sowie freigeschaltete Basic-, Premium- und VIP-Inhalte.",
    noContent: "In dieser Galerie ist noch kein Content veröffentlicht.",
    lockedTier: "Für deinen aktuellen Zugang gesperrt",
    openContent: "Ansehen",
    deviceNote: "Dieser Browser wird beim ersten Öffnen als persönliches Gerät registriert.",
    entitlement: "Mitgliedschaft",
    expires: "Gültig bis",
    noMembership: "Keine aktive Mitgliedschaft",
    adminRedirect: "Admin-Zugang wird geöffnet…",
    fileRequired: "Ausweisvorderseite, Ausweisrückseite und Live-Video sind erforderlich.",
    logout: "Abmelden",
    loading: "Wird verarbeitet…",
  },
  en: {
    pricingEyebrow: "EXCLUSIVE MEMBERSHIP",
    pricingTitle: "Choose your access",
    pricingText: "Fixed term, no automatic renewal. Access is activated only after the SEPA payment has been confirmed.",
    basic: "Exclusive Basic",
    premium: "Exclusive Premium",
    vip: "Exclusive VIP",
    basicText: "Access to the Basic Gallery.",
    premiumText: "Basic plus Premium Gallery.",
    vipText: "All galleries plus additional VIP perks.",
    buy: "Choose access",
    trial: "One-time trial offer",
    catalogUnavailable: "The product catalog is unavailable. A payment order cannot be created.",
    paymentTitle: "Order & SEPA payment",
    paymentIntro: "Review your selection and billing details. Your personal SEPA payment details are shown in the next step.",
    checkoutReviewTitle: "Order summary",
    checkoutReviewText: "Your order is created only after you confirm it.",
    productLabel: "Membership",
    durationCheckout: "Term",
    billingAccount: "Billing account",
    paymentKind: "Payment method",
    paymentKindValue: "One-time SEPA credit transfer",
    renewalLabel: "Renewal",
    renewalValue: "No automatic renewal",
    accessLabel: "Activation",
    accessValue: "After confirmed receipt of payment",
    totalDue: "Due now",
    confirmationText: "I confirm the plan, term and total amount and want to request the SEPA payment details in the next step.",
    confirmOrder: "Confirm order",
    backToSummary: "Back to order summary",
    payWithSepa: "PAY WITH SEPA",
    databaseOrderNote: "The next step shows your QR code and payment details for a one-time SEPA credit transfer.",
    qrView: "QR code",
    detailsView: "Payment details",
    scanQr: "Scan the QR code with your banking app and verify the pre-filled details before approving it.",
    beneficiary: "Beneficiary",
    iban: "IBAN",
    bic: "BIC",
    amount: "Amount",
    reference: "Remittance information",
    due: "Pay by",
    paymentPending: "After transfer, matching takes place with the next N26 CSV reconciliation in the admin portal.",
    ageTitle: "Manual age review",
    ageText: "Upload legible images of the front and back of your ID. Then record a live video in the browser showing your face, holding up the ID and moving your head.",
    documentFront: "ID – front",
    documentBack: "ID – back",
    video: "Live video with face and ID",
    videoInstructions: "Complete the one-time challenge shown below without interruption. Record for 10 to 20 seconds.",
    cameraStart: "Start camera",
    recordStart: "Start live recording",
    recordStop: "Stop recording",
    recordAgain: "Record again",
    videoReady: "Live video is ready",
    cameraError: "The camera could not be started. Allow camera access and use a current browser over HTTPS.",
    verificationRules: "Preparation and permitted data",
    rules: [
      "Use only your own valid government-issued photo ID in its physical original form—no copy, screenshot or image shown on another screen.",
      "Keep visible: name, portrait, date of birth, document type, issuing country and expiry date.",
      "Cover data not needed for review before capture: address, document/serial number, CAN/access number, machine-readable zone, signature, height and eye colour.",
      "Use bright, even light. Face and document must be sharp, complete and glare-free; filters, sunglasses, masks and other people are not permitted.",
    ],
    watermarkNote: "The website removes image metadata, scales down very large images and adds a dated “COPY – AGE VERIFICATION ONLY” label outside the document image.",
    consentText: "I am at least 18, use my own valid ID and consent to processing the ID images and live recording only as necessary for age and identity review. I have read the privacy and deletion information.",
    beginVerification: "Create one-time challenge",
    challengeTitle: "Your personal live challenge",
    agePrivacy: "Images and videos are stored privately in Cloudflare R2, cannot be accessed publicly, and are removed after the configured retention period.",
    submitAge: "Upload securely & submit",
    ageSubmitted: "Your request was submitted for manual review.",
    reviewReady: "Submitted for review",
    gallery: "Gallery",
    openGallery: "Open gallery",
    galleryText: "Free Preview plus unlocked Basic, Premium and VIP content.",
    noContent: "No content has been published in this gallery yet.",
    lockedTier: "Locked for your current access",
    openContent: "View",
    deviceNote: "This browser is registered as a personal device when the gallery is first opened.",
    entitlement: "Membership",
    expires: "Valid until",
    noMembership: "No active membership",
    adminRedirect: "Opening admin access…",
    fileRequired: "ID front, ID back and live video are required.",
    logout: "Log out",
    loading: "Processing…",
  },
};

const errorCopy = {
  AGE_ALREADY_APPROVED: "ageAlreadyApproved",
  AGE_VERIFICATION_NOT_CONFIGURED: "ageUnavailable",
  EMAIL_NOT_VERIFIED: "emailRequired",
  MEMBERSHIP_API_NOT_CONFIGURED: "backendUnavailable",
  ADMIN_API_NOT_CONFIGURED: "backendUnavailable",
  AGE_CASE_ALREADY_OPEN: "ageExists",
  REQUIRED_EVIDENCE_MISSING: "filesRequired",
  PRODUCT_PURCHASE_LIMIT_REACHED: "genericError",
};

function messageFor(error, t) {
  const code = error?.code || error?.message;
  const key = errorCopy[code];
  return (key && t[key]) || code || t.genericError;
}

const tierNames = {
  EXCLUSIVE_BASIC: "basic",
  EXCLUSIVE_PREMIUM: "premium",
  EXCLUSIVE_VIP: "vip",
};

const challengeLabels = {
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

async function prepareIdCopy(file, side, language) {
  const bitmap = await createImageBitmap(file);
  try {
    const maximumDimension = 2560;
    const scale = Math.min(1, maximumDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const imageHeight = Math.max(1, Math.round(bitmap.height * scale));
    const bannerHeight = Math.max(72, Math.round(width * 0.07));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = imageHeight + bannerHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("IMAGE_PROCESSING_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, width, imageHeight);
    context.fillStyle = "#1b050a";
    context.fillRect(0, imageHeight, width, bannerHeight);
    context.fillStyle = "#fff5e7";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${Math.max(14, Math.round(width / 42))}px Inter, sans-serif`;
    const sideLabel = language === "de"
      ? side === "front" ? "VORDERSEITE" : "RÜCKSEITE"
      : side === "front" ? "FRONT" : "BACK";
    const purpose = language === "de" ? "KOPIE – NUR ALTERSPRÜFUNG" : "COPY – AGE VERIFICATION ONLY";
    context.fillText(`${purpose} · exclusive.jason-shadow.com · ${new Date().toISOString().slice(0, 10)} · ${sideLabel}`, width / 2, imageHeight + bannerHeight / 2, width - 28);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("IMAGE_PROCESSING_FAILED")),
      "image/jpeg",
      0.92,
    ));
    return new File([blob], `age-id-${side}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function Field({ label, ...props }) {
  return <label className="form-field"><span>{label}</span><input {...props} /></label>;
}

function VerificationRules({ ui }) {
  return <div className="verification-rules"><h3>{ui.verificationRules}</h3><ol>{ui.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol><p>{ui.watermarkNote}</p></div>;
}

function Tier({ number, title, text, featured }) {
  return <article className={`tier-card${featured ? " tier-card--featured" : ""}`}><span className="step-number">{number}</span><h3>{title}</h3><p>{text}</p></article>;
}

function LockedCard({ t, wide }) {
  return <article className="locked-card"><div className={`locked-preview${wide ? " locked-preview--exclusive" : ""}`} aria-hidden="true"><span className="lock-icon">◇</span></div><div><p className="card-kicker">{t.previewLabel}</p><h3>{t.lockedTitle}</h3><p>{t.lockedText}</p></div></article>;
}

function Modal({ title, eyebrow, onClose, children, t, wide = false }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", key);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`process-modal${wide ? " process-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label={t.close}>×</button><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2>{children}</section></div>;
}

function QrImage({ payload, alt }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let current = true;
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 320 })
      .then((value) => current && setSource(value));
    return () => { current = false; };
  }, [payload]);
  return source ? <img className="sepa-qr" src={source} alt={alt} /> : null;
}

function LiveVideoRecorder({ ui, value, onChange, disabled, challenge, language }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  useEffect(() => {
    if (!value) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopStream();
  }, []);

  const startCamera = async () => {
    setError("");
    onChange(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("CAMERA_UNAVAILABLE");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      setSeconds(0);
    } catch {
      stopStream();
      setError(ui.cameraError);
    }
  };

  const stopRecording = () => {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    try {
      chunksRef.current = [];
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 2_000_000 })
        : new MediaRecorder(streamRef.current, { videoBitsPerSecond: 2_000_000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const contentType = recorder.mimeType.split(";", 1)[0] || "video/webm";
        const extension = contentType === "video/mp4" ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: contentType });
        if (blob.size) onChange(new File([blob], `live-age-verification.${extension}`, { type: contentType }));
        setRecording(false);
        stopStream();
      };
      recorder.start(500);
      setRecording(true);
      setSeconds(0);
      const startedAt = Date.now();
      intervalRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
      timeoutRef.current = setTimeout(stopRecording, 20_000);
    } catch {
      setError(ui.cameraError);
      stopStream();
    }
  };

  return <div className="live-recorder">
    <div className="live-recorder__head"><strong>{ui.video}</strong><span>{recording ? `${seconds}s / 20s` : value ? "✓" : ""}</span></div>
    <p>{ui.videoInstructions}</p>
    <ol className="challenge-list">{challenge.map((step) => <li key={step}>{(challengeLabels[language] || challengeLabels.de)[step] || step}</li>)}</ol>
    {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}
    <div className="camera-frame">{previewUrl && !cameraReady ? <video src={previewUrl} controls playsInline /> : <video ref={videoRef} muted playsInline />}</div>
    <div className="camera-actions">
      {!cameraReady && !value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.cameraStart}</button>}
      {cameraReady && !recording && <button className="primary-action" type="button" disabled={disabled} onClick={startRecording}>{ui.recordStart}</button>}
      {recording && <button className="danger-action" type="button" disabled={seconds < 10} onClick={stopRecording}>{ui.recordStop}</button>}
      {value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.recordAgain}</button>}
    </div>
    {value && <p className="live-recorder__ready">{ui.videoReady}</p>}
  </div>;
}

const formatCurrency = (product, language) => new Intl.NumberFormat(
  language === "de" ? "de-DE" : "en-IE",
  { style: "currency", currency: product.currency },
).format(product.amountMinor / 100);

const durationLabel = (product, language) => {
  if (language === "de") return `${product.durationValue} ${product.durationUnit === "MONTHS" ? (product.durationValue === 1 ? "Monat" : "Monate") : "Tage"}`;
  return `${product.durationValue} ${product.durationUnit === "MONTHS" ? (product.durationValue === 1 ? "month" : "months") : "days"}`;
};

function PricingGroup({ tier, products, language, ui, onChoose }) {
  const key = tierNames[tier];
  const showcase = products.find((product) => product.durationUnit === "DAYS" && product.durationValue === 30) || products[0];
  const perks = showcase?.perks || [];
  const symbols = { basic: "◇", premium: "✦", vip: "♛" };
  return <article className={`pricing-group pricing-group--${key}`}>
    <div className="membership-symbol" aria-hidden="true">{symbols[key]}</div>
    <div className="pricing-group__head">
      <p className="eyebrow">{key === "vip" ? "SIGNATURE ACCESS" : key === "premium" ? "MOST DESIRED" : "PRIVATE ENTRY"}</p>
      <h3>{ui[key]}</h3>
      <p>{ui[`${key}Text`]}</p>
      <div className="showcase-price"><strong>{formatCurrency(showcase, language)}</strong><span>{durationLabel(showcase, language)}</span></div>
    </div>
    <ul className="membership-perks">
      {(perks.length ? perks : [{ title: ui[`${key}Text`] }]).slice(0, 4).map((perk) => <li key={perk.id || perk.title}><span>✓</span><strong>{perk.title}</strong></li>)}
    </ul>
    <button className="membership-card-cta" type="button" onClick={() => onChoose(products)}>
      <span>{language === "de" ? "Laufzeit & Benefits wählen" : "Choose term & benefits"}</span><strong>→</strong>
    </button>
  </article>;
}

export default function App() {
  const [language, setLanguage] = useState(initialLanguage);
  const [user, setUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [products, setProducts] = useState([]);
  const [catalogError, setCatalogError] = useState(false);
  const [modal, setModal] = useState(null);
  const [mode, setMode] = useState("login");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sepaOrder, setSepaOrder] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState("review");
  const [checkoutAccepted, setCheckoutAccepted] = useState(false);
  const [paymentView, setPaymentView] = useState("qr");
  const [gallery, setGallery] = useState([]);
  const [contentPreview, setContentPreview] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentAccess, setCommentAccess] = useState({ allowComments: false, canComment: false });
  const [liveVideo, setLiveVideo] = useState(null);
  const [ageSession, setAgeSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [dashboardTab, setDashboardTab] = useState("overview");
  const [premiumTelegram, setPremiumTelegram] = useState(null);
  const [vipWhatsapp, setVipWhatsapp] = useState(null);
  const [billing, setBilling] = useState({ name: "", street: "", postalCode: "", city: "", countryCode: "DE" });
  const [tierSelection, setTierSelection] = useState([]);
  const initialized = useRef(false);
  const t = useMemo(() => window.SiteTranslations?.[language] || window.SiteTranslations.en, [language]);
  const ui = copy[language] || copy.de;
  const isAdmin = Boolean(user?.labels?.includes("admin"));
  const ageRequest = membership?.ageVerification || null;
  const activeAgeCase = ageSession?.caseId ? ageSession : ageRequest;
  const profile = membership?.account || null;
  const entitlement = membership?.entitlement || null;
  const ageStatus = ageRequest?.status || (user ? "NOT_STARTED" : "SIGNED_OUT");

  const refresh = async () => {
    const current = await getCurrentUser();
    setUser(current);
    if (!current || current.labels?.includes("admin")) {
      setMembership(null);
      setOrders([]);
      setPremiumTelegram(null);
      setVipWhatsapp(null);
      return;
    }
    setBilling((previous) => ({ ...previous, name: previous.name || current.name || "" }));
    try {
      const [nextMembership, orderResult] = await Promise.all([
        getMembershipStatus(),
        getPaymentOrders().catch(() => ({ orders: [] })),
      ]);
      setMembership(nextMembership);
      setOrders(orderResult.orders || []);
      const tier = nextMembership?.entitlement?.active ? nextMembership.entitlement.tier : null;
      setPremiumTelegram(tier === "EXCLUSIVE_PREMIUM"
        ? await getPremiumTelegramPerk().catch(() => null)
        : null);
      setVipWhatsapp(tier === "EXCLUSIVE_VIP"
        ? await getVipWhatsappPerk().catch(() => null)
        : null);
    } catch {
      setMembership({ account: { status: "BACKEND_UNAVAILABLE" }, ageVerification: { status: "UNAVAILABLE" }, entitlement: { active: false } });
      setOrders([]);
      setPremiumTelegram(null);
      setVipWhatsapp(null);
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.metaTitle;
    localStorage.setItem(languageKey, language);
  }, [language, t]);

  useEffect(() => {
    getProducts().then((result) => {
      setProducts(result.products || []);
      setCatalogError(false);
    }).catch(() => setCatalogError(true));
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const parameters = new URLSearchParams(location.search);
    (async () => {
      try {
        if (parameters.get("action") === "verify-email" && parameters.get("userId") && parameters.get("secret")) {
          await completeEmailVerification(parameters.get("userId"), parameters.get("secret"));
          setNotice(t.emailVerified);
          history.replaceState({}, "", "/");
          setModal("account");
        } else if (parameters.get("action") === "recover") {
          setMode("recover");
          setModal("auth");
        }
        await refresh();
      } catch (error) {
        setNotice(messageFor(error, t));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (isAdmin && location.pathname !== "/admin") history.replaceState({}, "", "/admin");
  }, [isAdmin]);

  useEffect(() => () => {
    if (contentPreview?.url) URL.revokeObjectURL(contentPreview.url);
  }, [contentPreview]);

  useEffect(() => {
    if (!user || ageStatus !== "APPROVED") {
      setGallery([]);
      return;
    }
    let current = true;
    (async () => {
      try {
        await registerCurrentDevice();
        const result = await getContentItems();
        if (current) setGallery((result.items || []).filter((item) => item.accessible));
      } catch {
        if (current) setGallery([]);
      }
    })();
    return () => { current = false; };
  }, [user?.$id, ageStatus, entitlement?.tier, entitlement?.expiresAt]);

  const openAuth = (nextMode) => {
    setMode(nextMode);
    setNotice("");
    setModal("auth");
  };

  const run = async (work, success, nextModal) => {
    setBusy(true);
    setNotice("");
    try {
      await work();
      await refresh();
      setNotice(success);
      if (nextModal) setModal(nextModal);
    } catch (error) {
      setNotice(messageFor(error, t));
    } finally {
      setBusy(false);
    }
  };

  const handleAuth = (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === "register") run(() => registerAccount(data), t.registrationSent, "account");
    else if (mode === "reset") run(() => requestPasswordReset(data.email), t.resetSent);
    else if (mode === "recover") {
      const parameters = new URLSearchParams(location.search);
      run(() => completePasswordReset(parameters.get("userId"), parameters.get("secret"), data.password), t.passwordChanged, "auth");
    } else run(() => login(data.email, data.password), t.loginSuccess, "account");
  };

  const submitAge = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const uploadedKinds = new Set(activeAgeCase?.evidenceKinds || []);
    const documentFront = data.get("documentFront");
    const documentBack = data.get("documentBack");
    if (
      (!uploadedKinds.has("DOCUMENT_FRONT") && (!(documentFront instanceof File) || !documentFront.size)) ||
      (!uploadedKinds.has("DOCUMENT_BACK") && (!(documentBack instanceof File) || !documentBack.size)) ||
      (!uploadedKinds.has("VIDEO") && (!(liveVideo instanceof File) || !liveVideo.size))
    ) {
      setNotice(ui.fileRequired);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const ageCase = activeAgeCase?.caseId && activeAgeCase?.reviewStatus === "UPLOADING"
        ? { caseId: activeAgeCase.caseId }
        : await createAgeVerificationCase();
      if (!uploadedKinds.has("DOCUMENT_FRONT")) {
        await uploadAgeEvidence(ageCase.caseId, "DOCUMENT_FRONT", await prepareIdCopy(documentFront, "front", language));
      }
      if (!uploadedKinds.has("DOCUMENT_BACK")) {
        await uploadAgeEvidence(ageCase.caseId, "DOCUMENT_BACK", await prepareIdCopy(documentBack, "back", language));
      }
      if (!uploadedKinds.has("VIDEO")) await uploadAgeEvidence(ageCase.caseId, "VIDEO", liveVideo);
      await submitAgeVerificationCase(ageCase.caseId);
      await refresh();
      form.reset();
      setLiveVideo(null);
      setAgeSession(null);
      setNotice(ui.ageSubmitted);
      setModal("account");
    } catch (error) {
      setNotice(messageFor(error, t));
    } finally {
      setBusy(false);
    }
  };

  const beginAgeVerification = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const created = await createAgeVerificationCase();
      setAgeSession({ ...created, evidenceKinds: [] });
      await refresh();
    } catch (error) {
      setNotice(messageFor(error, t));
    } finally {
      setBusy(false);
    }
  };

  const openTierSelection = (tierProducts) => {
    setTierSelection(tierProducts);
    setNotice("");
    setModal("membership");
  };

  const chooseProduct = (product) => {
    setNotice("");
    if (!user) return openAuth("register");
    if (!user.emailVerification || ageStatus !== "APPROVED") {
      setNotice(ageStatus !== "APPROVED" ? t.emailRequired || t.genericError : "");
      setModal("account");
      return;
    }
    setSelectedProduct(product);
    setSepaOrder(null);
    setCheckoutStep("review");
    setCheckoutAccepted(false);
    setPaymentView("qr");
    setModal("payment");
  };

  const startPayment = async () => {
    setBusy(true);
    setNotice("");
    try {
      const order = await createSepaOrder(selectedProduct.sku, billing, language);
      setSepaOrder(order);
      await refresh();
    } catch (error) {
      setNotice(messageFor(error, t));
    } finally {
      setBusy(false);
    }
  };

  const openGallery = async () => {
    if (!user) return openAuth("login");
    setBusy(true);
    setNotice("");
    try {
      await registerCurrentDevice();
      const result = await getContentItems();
      setGallery(result.items || []);
      setModal("gallery");
    } catch (error) {
      setNotice(messageFor(error, t));
      setModal("account");
    } finally {
      setBusy(false);
    }
  };

  const openContent = async (item) => {
    setBusy(true);
    setNotice("");
    try {
      const [response, commentResult] = await Promise.all([
        fetchContentItem(item.slug),
        getContentComments(item.slug).catch(() => ({ comments: [], allowComments: false, canComment: false })),
      ]);
      const blob = await response.blob();
      setContentPreview({
        url: URL.createObjectURL(blob),
        type: item.contentType,
        title: item.title,
        bodyText: item.bodyText || "",
        slug: item.slug,
      });
      setComments(commentResult.comments || []);
      setCommentAccess({
        allowComments: Boolean(commentResult.allowComments),
        canComment: Boolean(commentResult.canComment),
      });
    } catch (error) {
      setNotice(messageFor(error, t));
    } finally {
      setBusy(false);
    }
  };

  const viewContent = async (item) => {
    setModal("gallery");
    await openContent(item);
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!contentPreview?.slug) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get("comment") || "").trim();
    if (!body) return;
    setBusy(true);
    setNotice("");
    try {
      await createContentComment(contentPreview.slug, body);
      const next = await getContentComments(contentPreview.slug);
      setComments(next.comments || []);
      setCommentAccess({ allowComments: Boolean(next.allowComments), canComment: Boolean(next.canComment) });
      form.reset();
    } catch (error) {
      setNotice(messageFor(error, t));
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (commentId) => {
    if (!window.confirm(language === "de" ? "Diesen Kommentar löschen?" : "Delete this comment?")) return;
    setBusy(true);
    try {
      await deleteContentComment(commentId);
      if (contentPreview?.slug) {
        const next = await getContentComments(contentPreview.slug);
        setComments(next.comments || []);
      }
    } catch (error) {
      setNotice(messageFor(error, t));
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (order) => {
    const question = language === "de"
      ? "Diesen noch offenen Zahlungsauftrag wirklich stornieren?"
      : "Cancel this pending payment order?";
    if (!window.confirm(question)) return;
    await run(
      () => cancelPaymentOrder(order.orderId, "Cancelled by customer in dashboard"),
      language === "de" ? "Der Zahlungsauftrag wurde storniert." : "The payment order was cancelled.",
      "account",
    );
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(
      () => updateProfileName(String(data.get("name") || "").trim()),
      language === "de" ? "Dein Profil wurde aktualisiert." : "Your profile was updated.",
      "account",
    );
  };

  const handleAdminLogout = async () => {
    setBusy(true);
    try {
      await logout();
      history.replaceState({}, "", "/");
      setUser(null);
      setMembership(null);
    } finally {
      setBusy(false);
    }
  };

  if (isAdmin) return <AdminPortal user={user} language={language} setLanguage={setLanguage} onLogout={handleAdminLogout} />;
  if (busy && !user && location.pathname === "/admin") return <p className="app-loading">{ui.adminRedirect}</p>;

  const groupedProducts = Object.keys(tierNames).map((tier) => [tier, products.filter((product) => product.tier === tier)]);
  const reviewPending = ageRequest?.reviewStatus === "READY_FOR_REVIEW";

  return <>
    <div className="ember-field" aria-hidden="true" />
    <header className="exclusive-header"><a className="brand brand--wordmark" href="#top">Shadow’s Temptation</a><nav className="main-nav desktop-nav" aria-label={t.navigation}><a href="#experience">{t.navProfile}</a><a href="#membership">{t.navExclusive}</a><a href="#pricing">Membership</a><a href="#access">{t.navAccess}</a></nav><div className="header-actions"><div className="language-switcher">{["de", "en"].map((lang) => <button className={`language-button${lang === language ? " is-active" : ""}`} type="button" onClick={() => setLanguage(lang)} key={lang}>{lang.toUpperCase()}</button>)}</div><button className="secondary-action header-link" type="button" onClick={() => user ? setModal("account") : openAuth("login")}>{user ? t.account : t.login}</button></div></header>
    <main id="top">
      {user ? <>
        <section className="hero adult-hero member-hero">
          <div className="hero-media" aria-hidden="true"><img src="/linktree/uploads/banner.png" alt="" /><div className="hero-media__shade" /></div>
          <div className="hero-content adult-hero__content">
            <img className="avatar hero-avatar" src="/linktree/uploads/profile.png" alt="Jason Shadow" />
            <p className="eyebrow">{language === "de" ? "DEIN PRIVATER BEREICH" : "YOUR PRIVATE SPACE"}</p>
            <h1>{language === "de" ? `Willkommen, ${user.name || "du"}` : `Welcome, ${user.name || "you"}`}</h1>
            <p className="tagline">{ageStatus === "APPROVED"
              ? entitlement?.active
                ? (language === "de" ? "Dein Zugang ist aktiv. Entdecke neue Posts, deine freigeschalteten Galerien und persönlichen Benefits." : "Your access is active. Discover new posts, unlocked galleries and personal benefits.")
                : (language === "de" ? "Deine Altersprüfung ist abgeschlossen. Die Free Gallery wartet auf dich." : "Your age review is complete. Your Free Gallery is ready.")
              : (language === "de" ? "Vervollständige deine Altersprüfung, damit dein persönlicher Bereich freigeschaltet werden kann." : "Complete age verification to unlock your personal space.")}</p>
            <div className="member-status-row">
              <span className={user.emailVerification ? "status-chip is-active" : "status-chip"}>{user.emailVerification ? "✓ " : ""}E-Mail</span>
              <span className={ageStatus === "APPROVED" ? "status-chip is-active" : "status-chip"}>{ageStatus === "APPROVED" ? "✓ " : ""}{language === "de" ? "18+ bestätigt" : "18+ verified"}</span>
              <span className={entitlement?.active ? "status-chip is-active" : "status-chip"}>{entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "") : (language === "de" ? "Free Access" : "Free access")}</span>
            </div>
            <div className="hero-actions">
              {ageStatus === "APPROVED" ? <button className="primary-action" type="button" onClick={openGallery}>{language === "de" ? "Meine Galerie öffnen" : "Open my gallery"}</button> : <button className="primary-action" type="button" onClick={() => setModal("age")}>{language === "de" ? "Verifizierung fortsetzen" : "Continue verification"}</button>}
              <button className="secondary-action" type="button" onClick={() => { setDashboardTab("overview"); setModal("account"); }}>{language === "de" ? "Mein Dashboard" : "My dashboard"}</button>
            </div>
          </div>
        </section>
        <section className="section member-gallery-section" id="member-gallery">
          <div className="section-heading">
            <p className="eyebrow">{entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "") : "FREE"}</p>
            <h2>{language === "de" ? "Neu für dich" : "New for you"}</h2>
            <p>{language === "de" ? "Deine freigeschalteten Veröffentlichungen – ohne Umwege." : "Your unlocked releases, ready to explore."}</p>
          </div>
          {gallery.length ? <div className="member-content-grid">{gallery.slice(0, 6).map((item) => <article className="member-content-card" key={item.slug}><div className="gallery-placeholder">{item.contentType.startsWith("video/") ? "▶" : "◇"}</div><p className="eyebrow">{item.tier}</p><h3>{item.title}</h3><button className="primary-action" type="button" onClick={() => viewContent(item)}>{ui.openContent}</button></article>)}</div> : <div className="member-empty-state"><h3>{ageStatus === "APPROVED" ? ui.noContent : (language === "de" ? "Noch nicht freigeschaltet" : "Not unlocked yet")}</h3><p>{ageStatus === "APPROVED" ? (language === "de" ? "Sobald neue Beiträge veröffentlicht werden, erscheinen sie direkt hier." : "New posts will appear here as soon as they are published.") : ui.ageText}</p></div>}
        </section>
        {orders.some((order) => order.status === "PENDING") && <section className="section pending-order-strip"><div><p className="eyebrow">{language === "de" ? "ZAHLUNG AUSSTEHEND" : "PAYMENT PENDING"}</p><h2>{language === "de" ? "Dein Auftrag wartet auf Zahlung" : "Your order is awaiting payment"}</h2><p>{language === "de" ? "Die Zahlungsdaten und den Verwendungszweck findest du jederzeit in deinen Bestellungen." : "Payment details and remittance information remain available in your orders."}</p></div><button className="secondary-action" type="button" onClick={() => { setDashboardTab("orders"); setModal("account"); }}>{language === "de" ? "Bestellungen ansehen" : "View orders"}</button></section>}
        <section id="pricing" className="section pricing-section"><div className="section-heading"><p className="eyebrow">{ui.pricingEyebrow}</p><h2>{entitlement?.active ? (language === "de" ? "Noch mehr entdecken" : "Discover more") : ui.pricingTitle}</h2><p>{ui.pricingText}</p></div>{catalogError && <p className="form-notice form-notice--error">{ui.catalogUnavailable}</p>}<div className="pricing-grid">{Object.keys(tierNames).map((tier) => [tier, products.filter((product) => product.tier === tier)]).map(([tier, tierProducts]) => tierProducts.length > 0 && <PricingGroup tier={tier} products={tierProducts} language={language} ui={ui} onChoose={openTierSelection} key={tier} />)}</div></section>
      </> : <>
      <section className="hero adult-hero"><div className="hero-media" aria-hidden="true"><img src="/linktree/uploads/banner.png" alt="" /><div className="hero-media__shade" /></div><div className="hero-content adult-hero__content"><img className="avatar hero-avatar" src="/linktree/uploads/profile.png" alt="Jason Shadow" /><p className="eyebrow">{t.adultsOnly}</p><h1>{t.heroTitle}</h1><p className="tagline">{t.heroText}</p><div className="hero-actions"><button className="primary-action" type="button" onClick={() => user ? setModal("account") : openAuth("register")}>{user ? t.account : t.register}</button><a className="secondary-action" href="#experience">{t.explore}</a></div><p className="trust-line"><span>18+</span> {t.trustLine}</p></div></section>
      <section id="experience" className="section intro-section"><div className="section-heading"><p className="eyebrow">{t.profileEyebrow}</p><h2>{t.introTitle}</h2><p>{t.bio}</p></div><div className="editorial-grid"><LockedCard t={t} wide /><div className="editorial-copy"><p className="eyebrow">{t.privateLabel}</p><h2>{t.privateTitle}</h2><p>{t.privateText}</p><a href="#membership" className="text-link">{t.discoverAccess} →</a></div></div></section>
      <section id="membership" className="section membership-section"><div className="section-heading"><p className="eyebrow">{t.accessPath}</p><h2>{t.howItWorks}</h2><p>{t.processIntro}</p></div><div className="tier-list"><Tier number="01" title={t.stepAccount} text={t.stepAccountText} /><Tier number="02" title={t.stepVerify} text={ui.ageText} featured /><Tier number="03" title={t.stepAccess} text={t.stepAccessText} /></div></section>
      <section id="pricing" className="section pricing-section"><div className="section-heading"><p className="eyebrow">{ui.pricingEyebrow}</p><h2>{ui.pricingTitle}</h2><p>{ui.pricingText}</p></div>{catalogError && <p className="form-notice form-notice--error">{ui.catalogUnavailable}</p>}<div className="pricing-grid">{groupedProducts.map(([tier, tierProducts]) => tierProducts.length > 0 && <PricingGroup tier={tier} products={tierProducts} language={language} ui={ui} onChoose={openTierSelection} key={tier} />)}</div></section>
      <section id="exclusive" className="section preview-section"><div className="section-heading"><p className="eyebrow">{t.curatedLabel}</p><h2>{t.exclusiveHeading}</h2><p>{ui.galleryText}</p></div><div className="locked-grid"><LockedCard t={t} /><LockedCard t={t} /><LockedCard t={t} /></div><div className="section-action"><button className="primary-action" type="button" onClick={openGallery}>{ui.openGallery}</button><p>{ui.deviceNote}</p></div></section>
      <section id="access" className="section access-section"><div><p className="eyebrow">{t.readyLabel}</p><h2>{t.readyTitle}</h2><p>{t.readyText}</p></div><div className="hero-actions"><button className="primary-action" type="button" onClick={() => user ? setModal("account") : openAuth("register")}>{user ? t.openDashboard : t.createAccount}</button><button className="secondary-action" type="button" onClick={() => user ? setModal("account") : openAuth("login")}>{user ? t.viewStatus : t.login}</button></div></section>
      </>}
    </main>
    <footer id="legal" className="site-footer legal-footer"><div><a className="brand brand--wordmark" href="#top">Shadow’s Temptation</a><p>{t.footerLive}</p></div><nav><a href="https://www.instagram.com/shadows.temptation_official/" target="_blank" rel="noopener noreferrer">Instagram</a><a href="/linktree/">Links</a><a href="/legal/">{t.legalLink}</a></nav></footer>

    {modal === "auth" && <Modal title={mode === "register" ? t.createAccount : mode === "login" ? t.welcomeBack : t.reset} eyebrow={t.secureAccount} onClose={() => setModal(null)} t={t}><div className="auth-tabs">{["login", "register", "reset"].map((item) => <button type="button" className={mode === item ? "is-active" : ""} onClick={() => { setMode(item); setNotice(""); }} key={item}>{t[item]}</button>)}</div>{notice && <p className="form-notice" role="status">{notice}</p>}<form className="auth-panel" onSubmit={handleAuth}>{mode === "register" && <Field label={t.name} name="name" autoComplete="name" required maxLength="128" />}{mode !== "recover" && <Field label={t.emailLabel} name="email" type="email" autoComplete="email" required />}{mode !== "reset" && <Field label={t.password} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength="8" required />}<button className="primary-action" disabled={busy}>{busy ? ui.loading : t[`${mode}Submit`]}</button></form></Modal>}

    {modal === "account" && <Modal title={language === "de" ? "Mein Konto" : "My account"} eyebrow={entitlement?.active ? entitlement.tier : ageStatus} onClose={() => setModal(null)} t={t} wide>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {!user ? <button className="primary-action" onClick={() => openAuth("login")}>{t.login}</button> : <div className="account-dashboard">
        <div className="dashboard-tabs" role="tablist" aria-label={language === "de" ? "Kontobereiche" : "Account sections"}>
          {[
            ["overview", language === "de" ? "Übersicht" : "Overview"],
            ["profile", language === "de" ? "Meine Daten" : "My data"],
            ["orders", language === "de" ? "Bestellungen" : "Orders"],
            ["access", language === "de" ? "Zugang & Perks" : "Access & perks"],
          ].map(([key, label]) => <button type="button" role="tab" aria-selected={dashboardTab === key} className={dashboardTab === key ? "is-active" : ""} onClick={() => setDashboardTab(key)} key={key}>{label}</button>)}
        </div>
        {dashboardTab === "overview" && <div className="dashboard-overview">
          <div className="dashboard-profile-card"><img src="/linktree/uploads/profile.png" alt="" /><div><p className="eyebrow">{language === "de" ? "WILLKOMMEN ZURÜCK" : "WELCOME BACK"}</p><h3>{user.name || user.email}</h3><p>{user.email}</p></div></div>
          <div className="dashboard-stat-grid">
            <article><span>{language === "de" ? "Kontostatus" : "Account status"}</span><strong>{profile?.status || "EMAIL_PENDING"}</strong></article>
            <article><span>{language === "de" ? "Altersprüfung" : "Age verification"}</span><strong>{reviewPending ? ui.reviewReady : ageStatus}</strong></article>
            <article><span>{ui.entitlement}</span><strong>{entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "") : ui.noMembership}</strong></article>
          </div>
          <div className="dashboard-actions">
            {!user.emailVerification && <button className="secondary-action" onClick={() => run(resendVerification, t.verificationSent)}>{t.resendVerification}</button>}
            <button className="primary-action" disabled={!user.emailVerification || reviewPending || ageStatus === "APPROVED"} onClick={() => { setNotice(""); setModal("age"); }}>{reviewPending ? ui.reviewReady : ageStatus === "APPROVED" ? t.ageAlreadyApproved : t.avsStart}</button>
            {ageStatus === "APPROVED" && <button className="secondary-action" type="button" onClick={openGallery}>{ui.openGallery}</button>}
          </div>
        </div>}
        {dashboardTab === "profile" && <form className="dashboard-form" onSubmit={saveProfile}>
          <Field label={t.name} name="name" defaultValue={user.name || ""} autoComplete="name" required maxLength="128" />
          <Field label={t.emailLabel} value={user.email} disabled readOnly />
          <p className="upload-note">{language === "de" ? "Die E-Mail-Adresse wird zur Anmeldung, für Bestellbestätigungen und Rechnungen verwendet." : "Your email is used for sign-in, order confirmations and invoices."}</p>
          <button className="primary-action" disabled={busy}>{language === "de" ? "Änderungen speichern" : "Save changes"}</button>
        </form>}
        {dashboardTab === "orders" && <div className="order-list">
          {orders.length ? orders.map((order) => <article className="order-card" key={order.orderId}>
            <div className="order-card__head"><div><p className="eyebrow">{order.status}</p><h3>{order.productName}</h3></div><strong>{new Intl.NumberFormat(language === "de" ? "de-DE" : "en-IE", { style: "currency", currency: order.currency }).format(order.amountMinor / 100)}</strong></div>
            <dl className="order-facts"><div><dt>{language === "de" ? "Verwendungszweck" : "Remittance information"}</dt><dd className="payment-reference">{order.reference}</dd></div><div><dt>{ui.due}</dt><dd>{new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(order.paymentDueAt))}</dd></div>{order.invoice?.number && <div><dt>{language === "de" ? "Rechnung" : "Invoice"}</dt><dd>{order.invoice.number} · {order.invoice.emailStatus}</dd></div>}</dl>
            {order.status === "PENDING" && <div className="order-actions"><button className="secondary-action" type="button" onClick={() => { setSelectedProduct(products.find((product) => product.sku === order.productSku) || { displayName: order.productName, currency: order.currency, amountMinor: order.amountMinor, durationValue: order.durationValue, durationUnit: order.durationUnit }); setSepaOrder(order); setPaymentView("details"); setModal("payment"); }}>{language === "de" ? "Zahlungsdetails" : "Payment details"}</button><button className="danger-action" type="button" onClick={() => cancelOrder(order)}>{language === "de" ? "Auftrag stornieren" : "Cancel order"}</button></div>}
          </article>) : <div className="member-empty-state"><h3>{language === "de" ? "Noch keine Bestellungen" : "No orders yet"}</h3><p>{language === "de" ? "Deine zukünftigen Zahlungsaufträge erscheinen hier." : "Your future payment orders will appear here."}</p></div>}
        </div>}
        {dashboardTab === "access" && <div className="access-perks">
          <article className="perk-access-card"><span>✦</span><div><h3>{entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "Exclusive ") : (language === "de" ? "Free Access" : "Free access")}</h3><p>{entitlement?.expiresAt ? `${ui.expires}: ${new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(entitlement.expiresAt))}` : ui.noMembership}</p></div></article>
          {premiumTelegram && <article className="perk-access-card is-private"><span>↗</span><div><h3>Private Telegram Channel</h3><p>{language === "de" ? "Nur für deine aktive Premium-Laufzeit sichtbar." : "Visible only during your active Premium term."}</p><a className="primary-action" href={premiumTelegram.inviteUrl} target="_blank" rel="noreferrer">{language === "de" ? "Telegram öffnen" : "Open Telegram"}</a></div></article>}
          {vipWhatsapp && <article className="perk-access-card is-vip"><span>VIP</span><div><h3>{language === "de" ? "Meine private WhatsApp-Nummer" : "My private WhatsApp number"}</h3><p>{vipWhatsapp.phoneNumber}</p><a className="primary-action" href={vipWhatsapp.whatsappUrl} target="_blank" rel="noreferrer">{language === "de" ? "WhatsApp öffnen" : "Open WhatsApp"}</a></div></article>}
          {!premiumTelegram && !vipWhatsapp && entitlement?.active && <p className="upload-note">{language === "de" ? "Deine laufzeitabhängigen Benefits werden hier automatisch freigeschaltet." : "Term-specific benefits unlock here automatically."}</p>}
        </div>}
        <div className="dashboard-footer-actions"><a className="secondary-action button-link" href="#pricing" onClick={() => setModal(null)}>{ui.pricingTitle}</a><button className="text-button" onClick={() => run(logout, t.logoutSuccess, "auth")}>{ui.logout}</button></div>
      </div>}
    </Modal>}

    {modal === "age" && <Modal title={ui.ageTitle} eyebrow={t.stepVerify} onClose={() => setModal("account")} t={t}><p className="modal-intro">{ui.ageText}</p>{notice && <p className="form-notice" role="status">{notice}</p>}{!activeAgeCase?.caseId ? <form className="auth-panel" onSubmit={beginAgeVerification}><VerificationRules ui={ui} /><p className="upload-note">{ui.agePrivacy}</p><label className="consent-check"><input name="consent" type="checkbox" required /><span>{ui.consentText}</span></label><button className="primary-action" type="submit" disabled={busy}>{busy ? ui.loading : ui.beginVerification}</button></form> : <form className="auth-panel" onSubmit={submitAge}><VerificationRules ui={ui} /><p className="upload-note">{ui.agePrivacy}</p><p className="eyebrow">{ui.challengeTitle}</p><Field label={`${ui.documentFront}${activeAgeCase?.evidenceKinds?.includes("DOCUMENT_FRONT") ? " ✓" : ""}`} name="documentFront" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required={!activeAgeCase?.evidenceKinds?.includes("DOCUMENT_FRONT")} /><Field label={`${ui.documentBack}${activeAgeCase?.evidenceKinds?.includes("DOCUMENT_BACK") ? " ✓" : ""}`} name="documentBack" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required={!activeAgeCase?.evidenceKinds?.includes("DOCUMENT_BACK")} />{activeAgeCase?.evidenceKinds?.includes("VIDEO") ? <p className="live-recorder__ready">✓ {ui.videoReady}</p> : <LiveVideoRecorder ui={ui} value={liveVideo} onChange={setLiveVideo} disabled={busy} challenge={activeAgeCase?.livenessChallenge || []} language={language} />}<button className="primary-action" type="submit" disabled={busy}>{busy ? ui.loading : ui.submitAge}</button></form>}</Modal>}

    {modal === "membership" && tierSelection.length > 0 && <Modal
      title={tierSelection[0].displayName.replace(/\s[–-].*$/, "")}
      eyebrow={language === "de" ? "WÄHLE DEIN ERLEBNIS" : "CHOOSE YOUR EXPERIENCE"}
      onClose={() => setModal(null)}
      t={t}
      wide
    >
      <p className="modal-intro">{language === "de" ? "30 Tage sind vorausgewählt gedacht – entscheide dich hier bewusst für deine gewünschte Laufzeit. Jede Buchung ist eine Einmalzahlung ohne automatische Verlängerung." : "The 30-day experience is the standard choice—select your preferred term here. Every purchase is a one-time payment with no automatic renewal."}</p>
      <div className="duration-choice-grid">
        {tierSelection.map((product) => <article className={`duration-choice-card${product.durationUnit === "DAYS" && product.durationValue === 30 ? " is-default" : ""}`} key={product.sku}>
          {product.durationUnit === "DAYS" && product.durationValue === 30 && <span className="duration-badge">{language === "de" ? "STANDARD" : "DEFAULT"}</span>}
          {product.purchaseLimitPerUser ? <span className="duration-badge is-trial">{ui.trial}</span> : null}
          <p className="eyebrow">{durationLabel(product, language)}</p>
          <strong className="duration-price">{formatCurrency(product, language)}</strong>
          <ul>{(product.perks || []).map((perk) => <li key={perk.id}><span>✓</span><div><strong>{perk.title}</strong>{perk.description && <small>{perk.description}</small>}</div></li>)}</ul>
          <button className="primary-action" type="button" onClick={() => chooseProduct(product)}>{language === "de" ? "Diese Membership wählen" : "Choose this membership"}</button>
        </article>)}
      </div>
    </Modal>}

    {modal === "payment" && selectedProduct && <Modal title={ui.paymentTitle} eyebrow={selectedProduct.displayName} onClose={() => setModal(null)} t={t}>
      <p className="modal-intro">{ui.paymentIntro}</p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {!sepaOrder && checkoutStep === "review" && <div className="checkout-summary">
        <div>
          <p className="eyebrow">{ui.checkoutReviewTitle}</p>
          <p className="checkout-step-note">{ui.checkoutReviewText}</p>
        </div>
        <dl className="checkout-facts">
          <div><dt>{ui.productLabel}</dt><dd>{selectedProduct.displayName}</dd></div>
          <div><dt>{ui.durationCheckout}</dt><dd>{durationLabel(selectedProduct, language)}</dd></div>
          <div><dt>{ui.billingAccount}</dt><dd>{user?.email}</dd></div>
          <div><dt>{ui.paymentKind}</dt><dd>{ui.paymentKindValue}</dd></div>
          <div><dt>{ui.renewalLabel}</dt><dd>{ui.renewalValue}</dd></div>
          <div><dt>{ui.accessLabel}</dt><dd>{ui.accessValue}</dd></div>
        </dl>
        <div className="billing-fields">
          <p className="eyebrow">{language === "de" ? "RECHNUNGSADRESSE" : "BILLING ADDRESS"}</p>
          <Field label={language === "de" ? "Vollständiger Name" : "Full name"} value={billing.name} onChange={(event) => setBilling({ ...billing, name: event.target.value })} autoComplete="name" required />
          <Field label={language === "de" ? "Straße und Hausnummer" : "Street and number"} value={billing.street} onChange={(event) => setBilling({ ...billing, street: event.target.value })} autoComplete="street-address" required />
          <div className="billing-fields__row"><Field label={language === "de" ? "Postleitzahl" : "Postal code"} value={billing.postalCode} onChange={(event) => setBilling({ ...billing, postalCode: event.target.value })} autoComplete="postal-code" required /><Field label={language === "de" ? "Ort" : "City"} value={billing.city} onChange={(event) => setBilling({ ...billing, city: event.target.value })} autoComplete="address-level2" required /></div>
          <Field label={language === "de" ? "Ländercode (z. B. DE)" : "Country code (e.g. DE)"} value={billing.countryCode} onChange={(event) => setBilling({ ...billing, countryCode: event.target.value.toUpperCase().slice(0, 2) })} autoComplete="country" pattern="[A-Za-z]{2}" required />
          <p className="upload-note">{language === "de" ? "Die Rechnung wird an diese Angaben ausgestellt. Zahlungsfrist: 48 Stunden." : "The invoice is issued to these details. Payment term: 48 hours."}</p>
        </div>
        <div className="payment-total"><span>{ui.totalDue}</span><strong>{formatCurrency(selectedProduct, language)}</strong></div>
        <label className="checkout-confirmation">
          <input type="checkbox" checked={checkoutAccepted} onChange={(event) => setCheckoutAccepted(event.target.checked)} />
          <span>{ui.confirmationText}</span>
        </label>
        <p className="checkout-legal-note">{language === "de" ? <>Mit der Bestellung gelten unsere <a href="/legal/#terms" target="_blank">AGB</a>, <a href="/legal/#withdrawal" target="_blank">Widerrufsinformationen</a> und <a href="/legal/#privacy" target="_blank">Datenschutzhinweise</a>.</> : <>Your order is subject to our <a href="/legal/#terms" target="_blank">Terms</a>, <a href="/legal/#withdrawal" target="_blank">Cancellation information</a> and <a href="/legal/#privacy" target="_blank">Privacy notice</a>.</>}</p>
        <button className="primary-action" type="button" disabled={!checkoutAccepted || busy || !billing.name.trim() || !billing.street.trim() || !billing.postalCode.trim() || !billing.city.trim() || !/^[A-Z]{2}$/.test(billing.countryCode)} onClick={() => setCheckoutStep("pay")}>{ui.confirmOrder}</button>
      </div>}
      {!sepaOrder && checkoutStep === "pay" && <div className="payment-start">
        <div className="payment-total"><span>{selectedProduct.displayName} · {durationLabel(selectedProduct, language)}</span><strong>{formatCurrency(selectedProduct, language)}</strong></div>
        <p className="checkout-step-note">{ui.databaseOrderNote}</p>
        <div className="checkout-actions">
          <button className="secondary-action" type="button" disabled={busy} onClick={() => setCheckoutStep("review")}>{ui.backToSummary}</button>
          <button className="primary-action" type="button" disabled={busy} onClick={startPayment}>{busy ? ui.loading : ui.payWithSepa}</button>
        </div>
      </div>}
      {sepaOrder && <div className="sepa-order">
        <div className="auth-tabs"><button type="button" className={paymentView === "qr" ? "is-active" : ""} onClick={() => setPaymentView("qr")}>{ui.qrView}</button><button type="button" className={paymentView === "details" ? "is-active" : ""} onClick={() => setPaymentView("details")}>{ui.detailsView}</button></div>
        {paymentView === "qr" ? <div className="qr-panel"><QrImage payload={sepaOrder.qr.payload} alt="EPC SEPA QR" /><p>{ui.scanQr}</p></div> : <dl className="payment-details"><div><dt>{ui.beneficiary}</dt><dd>{sepaOrder.beneficiary}</dd></div><div><dt>{ui.iban}</dt><dd>{sepaOrder.iban}</dd></div>{sepaOrder.bic && <div><dt>{ui.bic}</dt><dd>{sepaOrder.bic}</dd></div>}<div><dt>{ui.amount}</dt><dd>{new Intl.NumberFormat(language === "de" ? "de-DE" : "en-IE", { style: "currency", currency: sepaOrder.currency }).format(sepaOrder.amountMinor / 100)}</dd></div><div><dt>{ui.reference}</dt><dd className="payment-reference">{sepaOrder.reference}</dd></div><div><dt>{ui.due}</dt><dd>{new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(sepaOrder.paymentDueAt))}</dd></div></dl>}
        <p className="upload-note">{ui.paymentPending}</p>
      </div>}
    </Modal>}

    {modal === "gallery" && <Modal title={ui.gallery} eyebrow={entitlement?.active ? entitlement.tier : "FREE PREVIEW"} onClose={() => { setModal(null); setContentPreview(null); }} t={t} wide>{notice && <p className="form-notice" role="status">{notice}</p>}{contentPreview ? <div className="content-viewer"><button className="text-button" type="button" onClick={() => { setContentPreview(null); setComments([]); }}>← {ui.gallery}</button><h3>{contentPreview.title}</h3>{contentPreview.bodyText && <p className="post-body">{contentPreview.bodyText}</p>}{contentPreview.type.startsWith("video/") ? <video src={contentPreview.url} controls playsInline /> : <img src={contentPreview.url} alt={contentPreview.title} />}<section className="comments-panel" aria-labelledby="comments-title"><div className="comments-panel__head"><div><p className="eyebrow">{language === "de" ? "PRIVATE COMMUNITY" : "PRIVATE COMMUNITY"}</p><h3 id="comments-title">{language === "de" ? "Kommentare" : "Comments"} <span>{comments.length}</span></h3></div>{entitlement?.active && <span className="status-chip is-active">{entitlement.tier.replace("EXCLUSIVE_", "")}</span>}</div>{comments.length ? <div className="comment-list">{comments.map((comment) => <article className={comment.own ? "comment-card is-own" : "comment-card"} key={comment.id}><div><strong>{comment.displayName || user?.name || "Member"}</strong><time>{new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.createdAt))}</time></div><p>{comment.body}</p>{comment.own && <button className="text-button" type="button" onClick={() => removeComment(comment.id)}>{language === "de" ? "Löschen" : "Delete"}</button>}</article>)}</div> : <p className="upload-note">{language === "de" ? "Sei der Erste, der diesen Beitrag kommentiert." : "Be the first to comment on this post."}</p>}{commentAccess.canComment ? <form className="comment-composer" onSubmit={submitComment}><label><span>{language === "de" ? "Dein Kommentar" : "Your comment"}</span><textarea name="comment" rows="3" maxLength="1200" required placeholder={language === "de" ? "Was löst dieser Beitrag bei dir aus?" : "What does this post make you feel?"} /></label><div><small>{language === "de" ? "Respektvoll bleiben. Deine Kommentare sind nur für berechtigte Mitglieder sichtbar." : "Keep it respectful. Comments are visible only to eligible members."}</small><button className="primary-action" disabled={busy}>{language === "de" ? "Kommentar veröffentlichen" : "Post comment"}</button></div></form> : commentAccess.allowComments && <div className="paid-comment-teaser"><strong>{language === "de" ? "Paid Member Benefit" : "Paid member benefit"}</strong><p>{language === "de" ? "Aktive Mitglieder können unter Beiträgen kommentieren." : "Active paid members can join the conversation."}</p><a className="secondary-action" href="#pricing" onClick={() => { setModal(null); setContentPreview(null); }}>{language === "de" ? "Membership entdecken" : "Explore membership"}</a></div>}</section></div> : gallery.length ? <div className="gallery-grid">{gallery.map((item) => <article className={item.accessible ? "" : "is-locked"} key={item.slug}><div className="gallery-placeholder">{item.contentType.startsWith("video/") ? "▶" : "◇"}</div><p className="eyebrow">{item.tier}</p><h3>{item.title}</h3><button className={item.accessible ? "primary-action" : "secondary-action"} type="button" disabled={!item.accessible || busy} onClick={() => openContent(item)}>{item.accessible ? ui.openContent : ui.lockedTier}</button></article>)}</div> : <p>{ui.noContent}</p>}</Modal>}
  </>;
}
