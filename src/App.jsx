import React, { useEffect, useMemo, useRef, useState } from "react";
import DeviceManager from "./DeviceManager";
import MfaPanel from "./MfaPanel";
import PrivacyPanel from "./PrivacyPanel";
import {
  cancelPrivacyRequest,
  completeEmailVerification,
  completeLegacyEmailVerification,
  completeLegacyPasswordReset,
  completeMfaLoginChallenge,
  completePasswordReset,
  createAgeVerificationCase,
  createContentComment,
  createMfaLoginChallenge,
  createSepaOrder,
  deleteContentComment,
  fetchContentItem,
  getContentComments,
  getContentItems,
  getCurrentUser,
  getMembershipStatus,
  getPaymentOrders,
  getPremiumTelegramPerk,
  getPrivacyOverview,
  getProducts,
  getVipWhatsappPerk,
  login,
  logout,
  registerAccount,
  registerCurrentDevice,
  requestAccountDeletion,
  requestPasswordReset,
  resendVerification,
  submitAgeVerificationCase,
  updateProfileEmail,
  updateProfileName,
  updatePrivacyChoices,
  updatePrivacyProfile,
  uploadAgeEvidence,
  cancelPaymentOrder,
  createPrivacyRequest,
  fetchPrivacyExport,
  endAdminSession,
} from "./lib/platform";
import {
  countryOptions,
  hasGlobalPrivacyControl,
  privacyNoticeVersion,
  usRegions,
} from "./lib/privacy";
import { friendlyErrorMessage } from "./lib/error-messages";

const languageKey = "jason-shadow-membership-language";
const initialLanguage = () => {
  const requested = new URLSearchParams(location.search).get("lang");
  if (requested === "de" || requested === "en") return requested;
  return localStorage.getItem(languageKey) || (navigator.language?.startsWith("de") ? "de" : "en");
};
const sensitiveMediaKey = "jason-shadow-sensitive-media-blur-v1";
const initialSensitiveMediaBlur = () => localStorage.getItem(sensitiveMediaKey) === "true";
const AdminPortal = React.lazy(() => import("./AdminPortal"));

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
    checkoutReviewText: "Prüfe alle Angaben in Ruhe. Verbindlich wird die Bestellung erst mit dem abschließenden, eindeutig gekennzeichneten Bestellbutton.",
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
    confirmationText: "Ich habe Tarif, Laufzeit, Gesamtpreis und Rechnungsdaten geprüft.",
    digitalConsentText: "Ich verlange ausdrücklich, dass der digitale Zugang nach bestätigtem Zahlungseingang vor Ablauf der 14-tägigen Widerrufsfrist beginnt. Mir ist bekannt, dass mein Widerrufsrecht mit Beginn der Bereitstellung erlischt.",
    confirmOrder: "Weiter zur SEPA-Zahlung",
    backToSummary: "Zurück zur Bestellübersicht",
    payWithSepa: "ZAHLUNGSPFLICHTIG BESTELLEN",
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
    paymentPending: "Sobald dein Zahlungseingang bestätigt wurde, wird dein Zugang automatisch freigeschaltet. Den aktuellen Status findest du jederzeit unter „Bestellungen“.",
    ageTitle: "Sichere Altersverifikation",
    ageText: "Bestätige einmalig, dass du mindestens 18 Jahre alt bist. Deine Nachweise werden persönlich und ausschließlich für diese Entscheidung geprüft.",
    ageKicker: "PRIVATE IDENTITY REVIEW",
    ageAssuranceTitle: "Vertraulich von der Aufnahme bis zur Löschung",
    ageAssuranceText: "Deine Live-Aufnahmen gelangen verschlüsselt in einen privaten EU-Prüfbereich. Zugriff erhält nur der autorisierte Prüfer.",
    ageDeletionText: "Nach der Entscheidung werden alle Nachweise sofort gelöscht, ohne Entscheidung spätestens nach 48 Stunden.",
    ageCloudflareBadge: "Geschützt auf Cloudflare",
    agePrivateBadge: "Privater EU-Speicher",
    ageDeleteBadge: "Nachweis-Löschung ≤ 48h",
    ageSecurityDetails: "Technische Sicherheitsdetails",
    ageSecurityItems: [
      "Verschlüsselte HTTPS-Übertragung direkt an den geschützten Worker.",
      "Separater, nicht öffentlich erreichbarer Cloudflare-R2-Bucket mit EU-Jurisdiktion.",
      "Keine öffentlichen URLs, Freigabelinks, Werbenutzung oder Profilbildung.",
      "Jeder Zugriff im Admin-Bereich ist authentifiziert und wird protokolliert.",
    ],
    ageSteps: ["Dokument wählen", "Live-Challenge aufnehmen", "Persönliche Prüfung"],
    documentType: "Dokumentart",
    nationalId: "Personalausweis / nationale ID",
    passport: "Reisepass",
    drivingLicence: "Führerschein / staatliche Photo-ID",
    passportFront: "Reisepass – Datenseite",
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
    verificationRules: "So gelingt deine Prüfung auf Anhieb",
    rules: [
      "Nutze deinen eigenen gültigen Lichtbildausweis im Original – keine Kopie oder Bildschirmaufnahme.",
      "Name, Foto, Geburtsdatum, Dokumentart, Ausstellungsland und Gültigkeit müssen lesbar sein. Andere Angaben darfst du abdecken.",
      "Achte auf gleichmäßiges Licht und ein scharfes Bild ohne Spiegelung, Filter oder weitere Personen.",
    ],
    watermarkNote: "Live-Fotos werden ohne Gerätemetadaten verarbeitet und als Kopie ausschließlich für die Altersprüfung gekennzeichnet.",
    livePhotoHint: "Ausschließlich jetzt live fotografieren · bestehende Dateien können nicht ausgewählt werden",
    photoCameraStart: "Live-Kamera öffnen",
    photoCapture: "Foto jetzt aufnehmen",
    photoAgain: "Foto neu aufnehmen",
    photoReady: "Live-Foto aufgenommen",
    captureOnlyNotice: "Aus Sicherheitsgründen ist die Auswahl vorhandener Dateien deaktiviert. Nimm jede erforderliche Dokumentseite jetzt live auf.",
    consentText: "Ich bin mindestens 18 Jahre alt, verwende mein eigenes gültiges Dokument und habe die Datenschutz- und Löschhinweise gelesen.",
    beginVerification: "Sichere Prüfung starten",
    challengeTitle: "Deine persönliche Live-Challenge",
    agePrivacy: "Weitere Informationen zu Zweck, Löschung und deinen Datenschutzrechten:",
    submitAge: "Geschützt übermitteln",
    ageSubmitted: "Deine Nachweise sind sicher eingegangen und warten auf die persönliche Prüfung.",
    reviewReady: "Zur Prüfung eingereicht",
    gallery: "Galerie",
    openGallery: "Galerie öffnen",
    galleryText: "Free Preview sowie freigeschaltete Basic-, Premium- und VIP-Inhalte.",
    noContent: "In dieser Galerie ist noch kein Content veröffentlicht.",
    lockedTier: "Für deinen aktuellen Zugang gesperrt",
    deviceNote: "Dieser Browser wird beim ersten Öffnen als persönliches Gerät registriert.",
    entitlement: "Mitgliedschaft",
    expires: "Gültig bis",
    noMembership: "Keine aktive Mitgliedschaft",
    adminRedirect: "Admin-Zugang wird geöffnet…",
    fileRequired: "Bitte nimm alle erforderlichen Dokumentseiten und das Live-Video vollständig in diesem Prozess auf.",
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
    checkoutReviewText: "Review every detail at your pace. The order becomes binding only when you select the final button that clearly states the payment obligation.",
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
    confirmationText: "I have reviewed the tier, term, total price and billing details.",
    digitalConsentText: "I expressly request digital access to begin after confirmed payment and before the 14-day withdrawal period ends. I understand that my withdrawal right expires when supply begins.",
    confirmOrder: "Continue to SEPA payment",
    backToSummary: "Back to order summary",
    payWithSepa: "ORDER & PAY WITH SEPA",
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
    paymentPending: "Your access activates as soon as payment is confirmed. You can check the current status at any time under Orders.",
    ageTitle: "Secure age verification",
    ageText: "Confirm once that you are at least 18. Your evidence is personally reviewed and processed only for this decision.",
    ageKicker: "PRIVATE IDENTITY REVIEW",
    ageAssuranceTitle: "Confidential from capture to deletion",
    ageAssuranceText: "Your live captures are encrypted and transferred to a private EU review area. Only the authorised reviewer receives access.",
    ageDeletionText: "All evidence is deleted immediately after the decision, or automatically within 48 hours if no decision is made.",
    ageCloudflareBadge: "Protected on Cloudflare",
    agePrivateBadge: "Private EU storage",
    ageDeleteBadge: "Evidence deletion ≤ 48h",
    ageSecurityDetails: "Technical security details",
    ageSecurityItems: [
      "Encrypted HTTPS transfer directly to the protected Worker.",
      "Separate, non-public Cloudflare R2 bucket with EU jurisdiction.",
      "No public URLs, share links, advertising use or profiling.",
      "Every admin access is authenticated and logged.",
    ],
    ageSteps: ["Choose document", "Record live challenge", "Personal review"],
    documentType: "Document type",
    nationalId: "National identity card",
    passport: "Passport",
    drivingLicence: "Driving licence / state photo ID",
    passportFront: "Passport – data page",
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
    verificationRules: "Get approved on your first attempt",
    rules: [
      "Use your own valid government-issued photo ID in its physical original form—never a copy or screen capture.",
      "Keep your name, portrait, date of birth, document type, issuing country and expiry date readable. You may cover other details.",
      "Use even light and keep the image sharp and glare-free, without filters or other people.",
    ],
    watermarkNote: "Live photos are processed without device metadata and marked as a copy solely for age verification.",
    livePhotoHint: "Live camera capture only · existing files cannot be selected",
    photoCameraStart: "Open live camera",
    photoCapture: "Take photo now",
    photoAgain: "Retake photo",
    photoReady: "Live photo captured",
    captureOnlyNotice: "For security, selecting existing files is disabled. Capture every required document side live now.",
    consentText: "I am at least 18, use my own valid document and have read the privacy and deletion information.",
    beginVerification: "Start secure verification",
    challengeTitle: "Your personal live challenge",
    agePrivacy: "More about purpose, deletion and your privacy rights:",
    submitAge: "Submit securely",
    ageSubmitted: "Your evidence arrived securely and is waiting for personal review.",
    reviewReady: "Submitted for review",
    gallery: "Gallery",
    openGallery: "Open gallery",
    galleryText: "Free Preview plus unlocked Basic, Premium and VIP content.",
    noContent: "No content has been published in this gallery yet.",
    lockedTier: "Locked for your current access",
    deviceNote: "This browser is registered as a personal device when the gallery is first opened.",
    entitlement: "Membership",
    expires: "Valid until",
    noMembership: "No active membership",
    adminRedirect: "Opening admin access…",
    fileRequired: "Please capture every required document side and the live video within this process.",
    logout: "Log out",
    loading: "Processing…",
  },
};

const tierNames = {
  EXCLUSIVE_BASIC: "basic",
  EXCLUSIVE_PREMIUM: "premium",
  EXCLUSIVE_VIP: "vip",
};

const challengeLabels = {
  de: {
    WRITE_AND_SHOW_CODE: "Den persönlichen 6-stelligen Code gut lesbar auf Papier schreiben und in die Kamera halten",
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
    WRITE_AND_SHOW_CODE: "Write the personal 6-digit code clearly on paper and hold it to the camera",
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
  return <details className="verification-rules">
    <summary><span aria-hidden="true">✓</span><strong>{ui.verificationRules}</strong><small>+</small></summary>
    <div><ol>{ui.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol><p>{ui.watermarkNote}</p></div>
  </details>;
}

function VerificationJourney({ ui, activeStep = 1 }) {
  return <div className="verification-journey" aria-label={ui.ageTitle}>
    {ui.ageSteps.map((step, index) => <div
      className={index + 1 <= activeStep ? "is-active" : ""}
      key={step}
    ><span>{index + 1}</span><strong>{step}</strong></div>)}
  </div>;
}

function VerificationAssurance({ ui }) {
  return <aside className="verification-assurance">
    <div className="verification-assurance__icon" aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M16 3 27 7v8c0 7-4.5 11.5-11 14C9.5 26.5 5 22 5 15V7l11-4Z" /><path d="m11 16 3 3 7-8" /></svg>
    </div>
    <div className="verification-assurance__content">
      <h3>{ui.ageAssuranceTitle}</h3>
      <p>{ui.ageAssuranceText}</p>
      <p className="verification-deletion-notice">{ui.ageDeletionText}</p>
      <div className="verification-trust-badges" aria-label={ui.ageSecurityDetails}>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M8 8h8M9 16h6" /></svg>{ui.ageCloudflareBadge}</span>
        <span>{ui.agePrivateBadge}</span>
        <span>{ui.ageDeleteBadge}</span>
      </div>
      <details className="verification-security-details">
        <summary>{ui.ageSecurityDetails}</summary>
        <ul>{ui.ageSecurityItems.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
    </div>
  </aside>;
}

function LivePhotoCapture({ label, complete, value, onChange, ui, disabled, side }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
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

  useEffect(() => () => stopStream(), []);

  const startCamera = async () => {
    setError("");
    onChange(null);
    stopStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_UNAVAILABLE");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_PREVIEW_UNAVAILABLE");
      video.srcObject = stream;
      setCameraReady(true);
      // Mobile browsers may expire the original tap while showing the
      // permission prompt. Keep the valid stream and let autoplay resume once
      // the preview becomes visible instead of reporting a false denial.
      void video.play().catch(() => undefined);
    } catch {
      stopStream();
      setError(ui.cameraError);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, 1920 / video.videoWidth, 1920 / video.videoHeight);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (blob) {
      onChange(new File([blob], `live-id-${side}.jpg`, { type: "image/jpeg" }));
      stopStream();
    }
  };

  if (complete) {
    return <div className="live-photo-capture is-complete">
      <div className="live-photo-capture__head"><span aria-hidden="true">✓</span><div><strong>{label}</strong><small>{ui.photoReady}</small></div></div>
    </div>;
  }

  return <div className={`live-photo-capture${value ? " is-complete" : ""}`}>
    <div className="live-photo-capture__head"><span aria-hidden="true">{value ? "✓" : side === "front" ? "01" : "02"}</span><div><strong>{label}</strong><small>{ui.livePhotoHint}</small></div></div>
    {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}
    <div className="camera-frame" hidden={!cameraReady && !previewUrl}>
      <video ref={videoRef} muted playsInline autoPlay hidden={!cameraReady} />
      {previewUrl && !cameraReady && <img src={previewUrl} alt="" />}
    </div>
    {!cameraReady && !value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.photoCameraStart}</button>}
    {cameraReady && <button className="primary-action" type="button" disabled={disabled} onClick={capturePhoto}>{ui.photoCapture}</button>}
    {value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.photoAgain}</button>}
    <canvas ref={canvasRef} hidden />
  </div>;
}

function ageDocumentOptions(countryCode, ui) {
  if (countryCode === "DE") {
    return [
      { value: "NATIONAL_ID", label: ui.nationalId },
      { value: "PASSPORT", label: ui.passport },
    ];
  }
  if (countryCode === "US") {
    return [
      { value: "DRIVING_LICENCE", label: ui.drivingLicence },
      { value: "PASSPORT", label: ui.passport },
    ];
  }
  return [
    { value: "NATIONAL_ID", label: ui.nationalId },
    { value: "PASSPORT", label: ui.passport },
    { value: "DRIVING_LICENCE", label: ui.drivingLicence },
  ];
}

function Tier({ number, title, text, featured }) {
  return <article className={`tier-card${featured ? " tier-card--featured" : ""}`}><span className="step-number">{number}</span><h3>{title}</h3><p>{text}</p></article>;
}

function LockIcon() {
  return <svg className="lock-symbol" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="10" width="14" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.2" />
  </svg>;
}

function MembershipMark({ tier, className = "" }) {
  const normalized = String(tier || "").replace("EXCLUSIVE_", "").toLowerCase();
  const label = normalized === "vip" ? "VIP" : normalized === "premium" ? "Premium" : "Basic";
  return <span className={`membership-mark membership-mark--${normalized || "basic"} ${className}`.trim()} aria-label={label}>
    {normalized === "vip"
      ? <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 10l6 5 6-9 6 9 6-5-3 15H7L4 10Z" /><path d="M8 27h16" /></svg>
      : normalized === "premium"
        ? <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3l3.2 9.8L29 16l-9.8 3.2L16 29l-3.2-9.8L3 16l9.8-3.2L16 3Z" /></svg>
        : <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 29 16 16 29 3 16 16 3Z" /><path d="M16 8 24 16 16 24 8 16 16 8Z" /></svg>}
  </span>;
}

function LockedCard({ t, wide }) {
  return <article className="locked-card"><div className={`locked-preview${wide ? " locked-preview--exclusive" : ""}`} aria-hidden="true"><LockIcon /></div><div><p className="card-kicker">{t.previewLabel}</p><h3>{t.lockedTitle}</h3><p>{t.lockedText}</p></div></article>;
}

function LockedGalleryShowcase({ language, signedIn, onAction }) {
  const tiers = ["EXCLUSIVE_BASIC", "EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP"];
  return <div className="locked-gallery-showcase">
    <div className="locked-gallery-showcase__grid" aria-hidden="true">
      {tiers.map((tier) => <div className={`locked-gallery-tile locked-gallery-tile--${tier.replace("EXCLUSIVE_", "").toLowerCase()}`} key={tier}>
        <MembershipMark tier={tier} />
        <LockIcon />
        <strong>{tier.replace("EXCLUSIVE_", "")}</strong>
      </div>)}
    </div>
    <button className="primary-action locked-gallery-showcase__cta" type="button" onClick={onAction}>
      {signedIn
        ? (language === "de" ? "Membership wählen & freischalten" : "Choose Membership & Unlock")
        : (language === "de" ? "Jetzt registrieren & freischalten" : "Register & Unlock Now")}
    </button>
  </div>;
}

function Modal({ title, eyebrow, onClose, children, t, wide = false }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const key = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", key);
      document.body.classList.remove("modal-open");
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className={`process-modal${wide ? " process-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label={t.close}>×</button><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2>{children}</section></div>;
}

function QrImage({ payload, alt }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let current = true;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(
        payload,
        { errorCorrectionLevel: "M", margin: 2, width: 320 },
      ))
      .then((value) => current && setSource(value));
    return () => { current = false; };
  }, [payload]);
  return source ? <img className="sepa-qr" src={source} alt={alt} /> : null;
}

function LiveVideoRecorder({ ui, value, onChange, disabled, challenge, challengeCode, language }) {
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
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_PREVIEW_UNAVAILABLE");
      video.srcObject = stream;
      setCameraReady(true);
      setSeconds(0);
      void video.play().catch(() => undefined);
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
    {challengeCode && <div className="liveness-code-card">
      <span>{language === "de" ? "DEIN EINMAL-CODE" : "YOUR ONE-TIME CODE"}</span>
      <strong aria-label={challengeCode.split("").join(" ")}>{challengeCode}</strong>
      <p>{language === "de"
        ? "Schreibe diesen Code auf einen Zettel und halte ihn während der ungeschnittenen Aufnahme gut sichtbar in die Kamera."
        : "Write this code on paper and keep it clearly visible during the uncut recording."}</p>
    </div>}
    <ol className="challenge-list">{challenge.map((step) => <li key={step}>{(challengeLabels[language] || challengeLabels.de)[step] || step}</li>)}</ol>
    {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}
    <div className="camera-frame">{previewUrl && !cameraReady ? <video src={previewUrl} controls playsInline /> : <video ref={videoRef} muted playsInline autoPlay />}</div>
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
  const perkPriority = (perk) => {
    const text = `${perk.title || ""} ${perk.description || ""}`.toLowerCase();
    if (key === "vip" && /whatsapp/.test(text)) return 0;
    if (key === "vip" && /treffen|meeting/.test(text)) return 1;
    return 10;
  };
  const showcasePerks = [...perks].sort((left, right) => perkPriority(left) - perkPriority(right));
  return <article className={`pricing-group pricing-group--${key}`}>
    <MembershipMark tier={tier} className="membership-symbol" />
    <div className="pricing-group__head">
      <p className="eyebrow">{key === "vip" ? "SIGNATURE ACCESS" : key === "premium" ? "MOST DESIRED" : "PRIVATE ENTRY"}</p>
      <h3>{ui[key]}</h3>
      <p>{ui[`${key}Text`]}</p>
      <div className="showcase-price"><strong>{formatCurrency(showcase, language)}</strong><span>{durationLabel(showcase, language)}</span></div>
    </div>
    <ul className="membership-perks">
      {(showcasePerks.length ? showcasePerks : [{ title: ui[`${key}Text`] }]).slice(0, key === "vip" ? 5 : 4).map((perk) => <li key={perk.id || perk.title}><span>✓</span><div><strong>{perk.title}</strong>{key === "vip" && /treffen|meeting/i.test(`${perk.title} ${perk.description || ""}`) && perk.description ? <small>{perk.description}</small> : null}</div></li>)}
    </ul>
    <button className="membership-card-cta" type="button" onClick={() => onChoose(products)}>
      <span>{language === "de" ? "Laufzeit & Benefits wählen" : "Choose term & benefits"}</span><strong>→</strong>
    </button>
  </article>;
}

function MembershipSelector({ products, language, ui, onChoose }) {
  const defaultIndex = Math.max(0, products.findIndex((product) => product.durationUnit === "DAYS" && product.durationValue === 30));
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const selected = products[selectedIndex] || products[defaultIndex] || products[0];
  if (!selected) return null;

  const tierPerks = products[0]?.perks || selected.perks || [];
  const monthly = products.find((product) => product.durationUnit === "DAYS" && product.durationValue === 30);
  const regularTotal = monthly && selected.durationUnit === "MONTHS"
    ? monthly.amountMinor * selected.durationValue
    : null;
  const saving = regularTotal && regularTotal > selected.amountMinor
    ? Math.round((1 - selected.amountMinor / regularTotal) * 100)
    : 0;

  return <div className="membership-selector">
    <div className="membership-selector__summary" key={selected.sku} aria-live="polite">
      <div>
        <p className="eyebrow">{language === "de" ? "DEINE AUSWAHL" : "YOUR SELECTION"}</p>
        <h3>{durationLabel(selected, language)}</h3>
        <p>{language === "de" ? "Einmalzahlung · keine automatische Verlängerung" : "One-time payment · no automatic renewal"}</p>
      </div>
      <div className="membership-selector__price">
        {saving > 0 && <span>{language === "de" ? `${saving}% Vorteil` : `Save ${saving}%`}</span>}
        {selected.purchaseLimitPerUser ? <span>{ui.trial}</span> : null}
        <strong>{formatCurrency(selected, language)}</strong>
      </div>
    </div>

    <div className="membership-slider">
      <input
        type="range"
        min="0"
        max={Math.max(0, products.length - 1)}
        step="1"
        value={selectedIndex}
        onChange={(event) => setSelectedIndex(Number(event.target.value))}
        aria-label={language === "de" ? "Laufzeit wählen" : "Choose membership term"}
        data-progress-index={selectedIndex}
        data-term-count={products.length}
      />
      <div className="membership-slider__labels" data-term-count={products.length}>
        {products.map((product, index) => <button
          type="button"
          className={index === selectedIndex ? "is-active" : ""}
          onClick={() => setSelectedIndex(index)}
          key={product.sku}
        >{durationLabel(product, language)}</button>)}
      </div>
    </div>

    <section className="membership-benefits">
      <div className="membership-benefits__head">
        <p className="eyebrow">{language === "de" ? "IMMER ENTHALTEN" : "ALWAYS INCLUDED"}</p>
        <h3>{language === "de" ? "Deine Benefits" : "Your benefits"}</h3>
      </div>
      <ul>
        {tierPerks.map((perk) => <li key={perk.id || perk.title}>
          <span>✓</span><div><strong>{perk.title}</strong>{perk.description && <small>{perk.description}</small>}</div>
        </li>)}
      </ul>
    </section>

    <button className="primary-action membership-selector__cta" type="button" onClick={() => onChoose(selected)}>
      {language === "de" ? `${durationLabel(selected, language)} wählen und fortfahren` : `Choose ${durationLabel(selected, language)} and continue`}
    </button>
  </div>;
}

function VisibilityIcon({ blurred }) {
  return blurred
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c5.3 0 9 4.5 9 8a8.6 8.6 0 0 1-2.1 4.6M6.2 6.3C4.1 7.7 3 10 3 12c0 3.5 3.7 8 9 8 1.3 0 2.5-.3 3.6-.8"/></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c0-3.5 3.7-8 9-8s9 4.5 9 8-3.7 8-9 8-9-4.5-9-8Z"/><circle cx="12" cy="12" r="3"/></svg>;
}

function SensitiveMediaToggle({ blurred, language, onToggle }) {
  const label = blurred
    ? (language === "de" ? "Sensible Medien anzeigen" : "Show sensitive media")
    : (language === "de" ? "Sensible Medien ausblenden" : "Blur sensitive media");
  return <button
    className={blurred ? "sensitive-media-toggle is-blurred" : "sensitive-media-toggle"}
    type="button"
    aria-pressed={blurred}
    aria-label={label}
    title={label}
    onClick={onToggle}
  >
    <span className="sensitive-media-toggle__age">18+</span>
    <VisibilityIcon blurred={blurred} />
    <span>{blurred
      ? (language === "de" ? "Ausgeblendet" : "Blurred")
      : (language === "de" ? "Sichtbar" : "Visible")}</span>
  </button>;
}

function formatPostDate(value, language) {
  if (!value) return language === "de" ? "Neu veröffentlicht" : "New release";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return language === "de" ? "Neu veröffentlicht" : "New release";
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function tierLabel(tier) {
  return tier === "FREE" ? "FREE PREVIEW" : String(tier || "").replace("EXCLUSIVE_", "");
}

const galleryTierOrder = ["FREE", "EXCLUSIVE_BASIC", "EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP"];

function galleryTierLabel(tier, language) {
  const labels = {
    FREE: language === "de" ? "Free Preview" : "Free preview",
    EXCLUSIVE_BASIC: "Basic",
    EXCLUSIVE_PREMIUM: "Premium",
    EXCLUSIVE_VIP: "VIP",
  };
  return labels[tier] || tierLabel(tier);
}

function CreatorPost({
  item,
  media,
  blurred,
  language,
}) {
  const accessible = item.accessible !== false;
  const mediaClass = blurred ? "creator-post__media is-sensitive-blurred" : "creator-post__media";
  return <article className={`creator-post${accessible ? "" : " is-locked"}`}>
    <header className="creator-post__header">
      <img src="/linktree/uploads/profile.png" alt="" />
      <div>
        <strong>Shadow’s Temptation</strong>
        <span>{formatPostDate(item.publishedAt, language)}</span>
      </div>
      <span className="creator-post__tier">{tierLabel(item.tier)}</span>
    </header>
    <div className="creator-post__copy">
      <h3>{item.title}</h3>
      {item.bodyText && <p>{item.bodyText}</p>}
    </div>
    <div className={mediaClass}>
      {!accessible
        ? <div className="creator-post__locked"><span>18+</span><strong>{language === "de" ? "Mit passender Membership freischalten" : "Unlock with the matching membership"}</strong></div>
        : media?.error
          ? <div className="creator-post__locked"><span>!</span><strong>{language === "de" ? "Medium konnte nicht geladen werden" : "Media could not be loaded"}</strong></div>
          : media?.url
            ? item.contentType.startsWith("video/")
              ? <video src={media.url} controls playsInline preload="metadata" />
              : <img src={media.url} alt={item.title} loading="eager" />
            : <div className="creator-post__loading" aria-label={language === "de" ? "Medium wird geladen" : "Loading media"}><span /></div>}
      {accessible && blurred && <div className="creator-post__blur-label"><span>18+</span>{language === "de" ? "Sensibler Inhalt ausgeblendet" : "Sensitive content blurred"}</div>}
    </div>
    <footer className="creator-post__footer">
      <span>{item.allowComments
        ? `${item.commentCount || 0} ${language === "de" ? "Kommentare" : "comments"}`
        : (language === "de" ? "Privater Beitrag" : "Private post")}</span>
    </footer>
  </article>;
}

function InlineComments({
  item,
  comments,
  commentAccess,
  commentsLoading,
  entitlementTier,
  userName,
  language,
  busy,
  onSubmit,
  onDelete,
}) {
  const titleId = `comments-${String(item.slug).replace(/[^a-z0-9-]/gi, "")}`;
  return <section className="comments-panel comments-panel--inline" aria-labelledby={titleId}>
    <div className="comments-panel__head">
      <div>
        <p className="eyebrow">{language === "de" ? "PRIVATE COMMUNITY" : "PRIVATE COMMUNITY"}</p>
        <h3 id={titleId}>{language === "de" ? "Kommentare" : "Comments"} <span>{comments.length}</span></h3>
      </div>
      {entitlementTier && <span className="status-chip is-active">{entitlementTier.replace("EXCLUSIVE_", "")}</span>}
    </div>
    {commentsLoading
      ? <p className="upload-note">{language === "de" ? "Kommentare werden geladen …" : "Loading comments …"}</p>
      : comments.length
        ? <div className="comment-list">{comments.map((comment) => <article className={comment.own ? "comment-card is-own" : "comment-card"} key={comment.id}>
          <div>
            <strong>{comment.displayName || userName || "Member"}</strong>
            <time>{new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.createdAt))}</time>
          </div>
          <p>{comment.body}</p>
          {comment.own && <button className="text-button" type="button" onClick={() => onDelete(comment.id)}>{language === "de" ? "Löschen" : "Delete"}</button>}
        </article>)}</div>
        : <p className="upload-note">{language === "de" ? "Sei der Erste, der diesen Beitrag kommentiert." : "Be the first to comment on this post."}</p>}
    {commentAccess.canComment
      ? <form className="comment-composer" onSubmit={onSubmit}>
        <label>
          <span>{language === "de" ? "Dein Kommentar" : "Your comment"}</span>
          <textarea name="comment" rows="3" maxLength="1200" required placeholder={language === "de" ? "Was löst dieser Beitrag bei dir aus?" : "What does this post make you feel?"} />
        </label>
        <div>
          <small>{language === "de" ? "Respektvoll bleiben. Deine Kommentare sind nur für berechtigte Mitglieder sichtbar." : "Keep it respectful. Comments are visible only to eligible members."}</small>
          <button className="primary-action" disabled={busy}>{language === "de" ? "Kommentar veröffentlichen" : "Post comment"}</button>
        </div>
      </form>
      : commentAccess.allowComments && <div className="paid-comment-teaser">
        <strong>{language === "de" ? "Exclusive Member Benefit" : "Exclusive Member Benefit"}</strong>
        <p>{language === "de" ? "Exclusive Member können direkt unter Beiträgen kommentieren." : "Exclusive Members can comment directly below posts."}</p>
        <a className="secondary-action" href="#pricing">{language === "de" ? "Membership entdecken" : "Explore membership"}</a>
      </div>}
  </section>;
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
  const [digitalConsentAccepted, setDigitalConsentAccepted] = useState(false);
  const [paymentView, setPaymentView] = useState("qr");
  const [gallery, setGallery] = useState([]);
  const [mediaBySlug, setMediaBySlug] = useState({});
  const [blurSensitiveMedia, setBlurSensitiveMedia] = useState(initialSensitiveMediaBlur);
  const [comments, setComments] = useState([]);
  const [commentAccess, setCommentAccess] = useState({ allowComments: false, canComment: false });
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [activeGalleryTier, setActiveGalleryTier] = useState("FREE");
  const [activePostIndex, setActivePostIndex] = useState(0);
  const [documentFront, setDocumentFront] = useState(null);
  const [documentBack, setDocumentBack] = useState(null);
  const [liveVideo, setLiveVideo] = useState(null);
  const [ageSession, setAgeSession] = useState(null);
  const [ageDocumentType, setAgeDocumentType] = useState("NATIONAL_ID");
  const [orders, setOrders] = useState([]);
  const [dashboardTab, setDashboardTab] = useState("overview");
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaFactor, setMfaFactor] = useState("totp");
  const [privacy, setPrivacy] = useState(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [registrationCountry, setRegistrationCountry] = useState("DE");
  const [registrationRegion, setRegistrationRegion] = useState("");
  const [premiumTelegram, setPremiumTelegram] = useState(null);
  const [vipWhatsapp, setVipWhatsapp] = useState(null);
  const [billing, setBilling] = useState({ name: "", street: "", postalCode: "", city: "", countryCode: "DE" });
  const [tierSelection, setTierSelection] = useState([]);
  const initialized = useRef(false);
  const mediaBySlugRef = useRef({});
  const mediaRequestsRef = useRef(new Map());
  const mediaGenerationRef = useRef(0);
  const t = useMemo(() => window.SiteTranslations?.[language] || window.SiteTranslations.en, [language]);
  const ui = copy[language] || copy.de;
  const registrationCountries = useMemo(() => countryOptions(language), [language]);
  const isAdmin = Boolean(user?.labels?.includes("admin"));
  const ageRequest = membership?.ageVerification || null;
  const activeAgeCase = ageSession?.caseId ? ageSession : ageRequest;
  const profile = membership?.account || null;
  const entitlement = membership?.entitlement || null;
  const ageStatus = ageRequest?.status || (user ? "NOT_STARTED" : "SIGNED_OUT");
  const galleryGroups = useMemo(() => galleryTierOrder
    .map((tier) => ({ tier, items: gallery.filter((item) => item.tier === tier) }))
    .filter((group) => group.items.length > 0), [gallery]);
  const activeGalleryGroup = galleryGroups.find((group) => group.tier === activeGalleryTier) || galleryGroups[0] || null;
  const normalizedPostIndex = activeGalleryGroup?.items.length
    ? activePostIndex % activeGalleryGroup.items.length
    : 0;
  const activePost = activeGalleryGroup?.items[normalizedPostIndex] || null;

  const refresh = async (sessionUser = null) => {
    const current = sessionUser || await getCurrentUser();
    setUser(current);
    if (!current) {
      setMembership(null);
      setOrders([]);
      setPremiumTelegram(null);
      setVipWhatsapp(null);
      setPrivacy(null);
      return current;
    }
    try {
      await registerCurrentDevice();
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
      if (["DEVICE_LIMIT_EXCEEDED", "DEVICE_LOCKED", "DEVICE_CREDENTIAL_REVOKED"].includes(error?.code)) {
        await logout().catch(() => null);
        setUser(null);
        setMembership(null);
        return null;
      }
    }
    if (current.labels?.includes("admin")) {
      setMembership(null);
      setOrders([]);
      setPremiumTelegram(null);
      setVipWhatsapp(null);
      setPrivacy(null);
      return current;
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
    return current;
  };

  const loadPrivacy = async () => {
    if (!user || isAdmin) return null;
    setPrivacyLoading(true);
    try {
      const next = await getPrivacyOverview();
      setPrivacy(next);
      return next;
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
      return null;
    } finally {
      setPrivacyLoading(false);
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.metaTitle;
    localStorage.setItem(languageKey, language);
  }, [language, t]);

  useEffect(() => {
    localStorage.setItem(sensitiveMediaKey, String(blurSensitiveMedia));
  }, [blurSensitiveMedia]);

  useEffect(() => {
    if (activeAgeCase?.documentType) {
      setAgeDocumentType(activeAgeCase.documentType);
      return;
    }
    setAgeDocumentType(profile?.countryCode === "US" ? "DRIVING_LICENCE" : "NATIONAL_ID");
  }, [activeAgeCase?.documentType, profile?.countryCode]);

  useEffect(() => {
    setDocumentFront(null);
    setDocumentBack(null);
    setLiveVideo(null);
  }, [ageDocumentType]);

  useEffect(() => {
    getProducts(language).then((result) => {
      const tierPerks = result.tierPerks || {};
      setProducts((result.products || []).map((product) => ({
        ...product,
        perks: tierPerks[product.tier] || product.perks || [],
      })));
      setCatalogError(false);
    }).catch(() => setCatalogError(true));
  }, [language]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const parameters = new URLSearchParams(location.search);
    (async () => {
      try {
        if (parameters.get("action") === "verify-email" && parameters.get("token")) {
          await completeEmailVerification(parameters.get("token"));
          await logout().catch(() => null);
          setUser(null);
          setMembership(null);
          setNotice(t.emailVerified);
          history.replaceState({}, "", "/");
          setMode("login");
          setModal("auth");
        } else if (parameters.get("action") === "verify-email" && parameters.get("userId") && parameters.get("secret")) {
          await completeLegacyEmailVerification(parameters.get("userId"), parameters.get("secret"));
          await logout().catch(() => null);
          setUser(null);
          setMembership(null);
          setNotice(t.emailVerified);
          history.replaceState({}, "", "/");
          setMode("login");
          setModal("auth");
        } else if (parameters.get("action") === "recover") {
          setMode("recover");
          setModal("auth");
        }
        const current = await refresh();
        if (parameters.get("action") === "orders") {
          if (current && !current.labels?.includes("admin")) {
            history.replaceState({}, "", "/");
            setDashboardTab("orders");
            setModal("account");
          } else if (!current) {
            setMode("login");
            setModal("auth");
          }
        }
      } catch (error) {
        if (error?.type === "user_more_factors_required") {
          try {
            const challenge = await createMfaLoginChallenge("totp");
            setMfaChallenge(challenge);
            setMfaFactor("totp");
            setNotice("");
            setModal("mfa");
          } catch (challengeError) {
            setNotice(friendlyErrorMessage(challengeError, language, t.genericError));
            setMode("login");
            setModal("auth");
          }
        } else {
          setNotice(friendlyErrorMessage(error, language, t.genericError));
        }
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (isAdmin && location.pathname !== "/admin") history.replaceState({}, "", "/admin");
  }, [isAdmin]);

  useEffect(() => {
    if (dashboardTab === "privacy" && user && !isAdmin) loadPrivacy();
  }, [dashboardTab, user?.$id, isAdmin]);

  useEffect(() => {
    mediaGenerationRef.current += 1;
    if (user) return;
    Object.values(mediaBySlugRef.current).forEach((media) => {
      if (media?.url) URL.revokeObjectURL(media.url);
    });
    mediaBySlugRef.current = {};
    mediaRequestsRef.current.clear();
    setMediaBySlug({});
  }, [user?.$id]);

  useEffect(() => () => {
    Object.values(mediaBySlugRef.current).forEach((media) => {
      if (media?.url) URL.revokeObjectURL(media.url);
    });
  }, []);

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

  const loadProtectedMedia = async (item, retry = false) => {
    const cached = mediaBySlugRef.current[item.slug];
    if (cached && (!cached.error || !retry)) return cached;
    if (retry && cached?.error) {
      const next = { ...mediaBySlugRef.current };
      delete next[item.slug];
      mediaBySlugRef.current = next;
      setMediaBySlug(next);
    }
    const pending = mediaRequestsRef.current.get(item.slug);
    if (pending) return pending;
    const generation = mediaGenerationRef.current;
    const request = (async () => {
      try {
        const response = await fetchContentItem(item.slug);
        const blob = await response.blob();
        const media = {
          url: URL.createObjectURL(blob),
          type: response.headers.get("content-type") || item.contentType,
        };
        if (generation !== mediaGenerationRef.current) {
          URL.revokeObjectURL(media.url);
          return null;
        }
        mediaBySlugRef.current = { ...mediaBySlugRef.current, [item.slug]: media };
        setMediaBySlug(mediaBySlugRef.current);
        return media;
      } catch (error) {
        if (generation === mediaGenerationRef.current) {
          mediaBySlugRef.current = { ...mediaBySlugRef.current, [item.slug]: { error: true, type: item.contentType } };
          setMediaBySlug(mediaBySlugRef.current);
        }
        throw error;
      } finally {
        mediaRequestsRef.current.delete(item.slug);
      }
    })();
    mediaRequestsRef.current.set(item.slug, request);
    return request;
  };

  useEffect(() => {
    if (!galleryGroups.length) {
      setActivePostIndex(0);
      setComments([]);
      setCommentAccess({ allowComments: false, canComment: false });
      return;
    }
    if (!galleryGroups.some((group) => group.tier === activeGalleryTier)) {
      setActiveGalleryTier(galleryGroups[0].tier);
      setActivePostIndex(0);
    }
  }, [galleryGroups, activeGalleryTier]);

  useEffect(() => {
    if (!activePost || !user || ageStatus !== "APPROVED") {
      setCommentsLoading(false);
      return;
    }
    let current = true;
    setComments([]);
    setCommentAccess({ allowComments: Boolean(activePost.allowComments), canComment: false });
    setCommentsLoading(true);
    Promise.all([
      loadProtectedMedia(activePost).catch(() => null),
      getContentComments(activePost.slug).catch(() => ({
        comments: [],
        allowComments: Boolean(activePost.allowComments),
        canComment: false,
      })),
    ]).then(([, commentResult]) => {
      if (!current) return;
      setComments(commentResult.comments || []);
      setCommentAccess({
        allowComments: Boolean(commentResult.allowComments),
        canComment: Boolean(commentResult.canComment),
      });
    }).finally(() => {
      if (current) setCommentsLoading(false);
    });
    return () => { current = false; };
  }, [activePost?.slug, user?.$id, ageStatus]);

  const openAuth = (nextMode) => {
    setMode(nextMode);
    setNotice("");
    setModal("auth");
  };

  const beginMfaSignIn = async (factor = "totp") => {
    setBusy(true);
    setNotice("");
    try {
      const challenge = await createMfaLoginChallenge(factor);
      setMfaChallenge(challenge);
      setMfaFactor(factor);
      setModal("mfa");
      return challenge;
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const run = async (work, success, nextModal) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await work();
      const current = await refresh(result?.sessionReady ? result.user : null);
      if (
        current &&
        !current.labels?.includes("admin") &&
        new URLSearchParams(location.search).get("action") === "orders"
      ) {
        history.replaceState({}, "", "/");
        setDashboardTab("orders");
      }
      setNotice(success);
      if (nextModal) setModal(nextModal);
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const handleAuth = (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === "register") run(() => registerAccount({
      ...data,
      countryCode: registrationCountry,
      regionCode: registrationCountry === "US" ? registrationRegion : null,
      privacyNoticeVersion,
      privacyNoticeAccepted: data.privacyNoticeAccepted === "on",
      gpcSignal: hasGlobalPrivacyControl(),
      locale: language,
    }), t.registrationSent, "account");
    else if (mode === "reset") run(() => requestPasswordReset(data.email, language), t.resetSent);
    else if (mode === "recover") {
      const parameters = new URLSearchParams(location.search);
      run(
        () => parameters.get("token")
          ? completePasswordReset(parameters.get("token"), data.password)
          : completeLegacyPasswordReset(parameters.get("userId"), parameters.get("secret"), data.password),
        t.passwordChanged,
        "auth",
      );
    } else {
      setBusy(true);
      setNotice("");
      login(data.email, data.password).then(async (result) => {
        if (result?.mfaRequired) {
          await beginMfaSignIn("totp");
          return;
        }
        await refresh(result?.user || null);
        setNotice(t.loginSuccess);
        setModal("account");
      }).catch((error) => {
        setNotice(friendlyErrorMessage(error, language, t.genericError));
      }).finally(() => setBusy(false));
    }
  };

  const finishMfaSignIn = async (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("otp") || "").trim();
    if (!mfaChallenge?.$id) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await completeMfaLoginChallenge(mfaChallenge.$id, value);
      await refresh(result.user);
      setMfaChallenge(null);
      setMfaFactor("totp");
      setNotice(t.loginSuccess);
      setModal("account");
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setNotice("");
    try {
      await logout();
      setUser(null);
      setMembership(null);
      setOrders([]);
      setPremiumTelegram(null);
      setVipWhatsapp(null);
      setPrivacy(null);
      setGallery([]);
      setComments([]);
      setMediaBySlug({});
      setAgeSession(null);
      setMfaChallenge(null);
      setMfaFactor("totp");
      setMode("login");
      setModal("auth");
      setNotice(t.logoutSuccess);
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const submitAge = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const uploadedKinds = new Set(activeAgeCase?.evidenceKinds || []);
    const requiredKinds = new Set(
      activeAgeCase?.requiredEvidence ||
      (ageDocumentType === "PASSPORT"
        ? ["DOCUMENT_FRONT", "VIDEO"]
        : ["DOCUMENT_FRONT", "DOCUMENT_BACK", "VIDEO"]),
    );
    if (
      (requiredKinds.has("DOCUMENT_FRONT") && !uploadedKinds.has("DOCUMENT_FRONT") && (!(documentFront instanceof File) || !documentFront.size)) ||
      (requiredKinds.has("DOCUMENT_BACK") && !uploadedKinds.has("DOCUMENT_BACK") && (!(documentBack instanceof File) || !documentBack.size)) ||
      (requiredKinds.has("VIDEO") && !uploadedKinds.has("VIDEO") && (!(liveVideo instanceof File) || !liveVideo.size))
    ) {
      setNotice(ui.fileRequired);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const ageCase = activeAgeCase?.caseId && activeAgeCase?.reviewStatus === "UPLOADING"
        ? { caseId: activeAgeCase.caseId }
        : await createAgeVerificationCase({ documentType: ageDocumentType });
      if (requiredKinds.has("DOCUMENT_FRONT") && !uploadedKinds.has("DOCUMENT_FRONT")) {
        await uploadAgeEvidence(ageCase.caseId, "DOCUMENT_FRONT", await prepareIdCopy(documentFront, "front", language));
      }
      if (requiredKinds.has("DOCUMENT_BACK") && !uploadedKinds.has("DOCUMENT_BACK")) {
        await uploadAgeEvidence(ageCase.caseId, "DOCUMENT_BACK", await prepareIdCopy(documentBack, "back", language));
      }
      if (requiredKinds.has("VIDEO") && !uploadedKinds.has("VIDEO")) {
        await uploadAgeEvidence(ageCase.caseId, "VIDEO", liveVideo);
      }
      await submitAgeVerificationCase(ageCase.caseId);
      await refresh();
      form.reset();
      setDocumentFront(null);
      setDocumentBack(null);
      setLiveVideo(null);
      setAgeSession(null);
      setNotice(ui.ageSubmitted);
      setModal("account");
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const beginAgeVerification = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const created = await createAgeVerificationCase({ documentType: ageDocumentType });
      setAgeSession({ ...created, evidenceKinds: [] });
      await refresh();
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
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
      setNotice(!user.emailVerification
        ? (t.emailRequired || (language === "de" ? "Bitte bestätige zuerst deine E-Mail-Adresse." : "Please verify your email address first."))
        : (language === "de" ? "Schließe zuerst die Altersprüfung ab." : "Complete age verification first."));
      setModal("account");
      return;
    }
    setSelectedProduct(product);
    setSepaOrder(null);
    setCheckoutStep("review");
    setCheckoutAccepted(false);
    setDigitalConsentAccepted(false);
    setPaymentView("qr");
    setModal("payment");
  };

  const startPayment = async () => {
    setBusy(true);
    setNotice("");
    try {
      const order = await createSepaOrder(selectedProduct.sku, billing, language, {
        termsVersion: "EU-2026-07-27-V1",
        digitalContentConsent: digitalConsentAccepted,
        withdrawalAcknowledgement: digitalConsentAccepted,
      });
      setSepaOrder(order);
      await refresh();
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
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
      setGallery((result.items || []).filter((item) => item.accessible));
      requestAnimationFrame(() => document.getElementById("member-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
      setModal("account");
    } finally {
      setBusy(false);
    }
  };

  const selectGallery = (tier) => {
    setActiveGalleryTier(tier);
    setActivePostIndex(0);
    setNotice("");
  };

  const movePost = (direction) => {
    const length = activeGalleryGroup?.items.length || 0;
    if (length < 2) return;
    setActivePostIndex((current) => (current + direction + length) % length);
    setNotice("");
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!activePost?.slug) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get("comment") || "").trim();
    if (!body) return;
    setBusy(true);
    setNotice("");
    try {
      await createContentComment(activePost.slug, body);
      const next = await getContentComments(activePost.slug);
      setComments(next.comments || []);
      setGallery((current) => current.map((item) => item.slug === activePost.slug
        ? { ...item, commentCount: (next.comments || []).length }
        : item));
      setCommentAccess({ allowComments: Boolean(next.allowComments), canComment: Boolean(next.canComment) });
      form.reset();
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (commentId) => {
    if (!window.confirm(language === "de" ? "Diesen Kommentar löschen?" : "Delete this comment?")) return;
    setBusy(true);
    try {
      await deleteContentComment(commentId);
      if (activePost?.slug) {
        const next = await getContentComments(activePost.slug);
        setComments(next.comments || []);
        setGallery((current) => current.map((item) => item.slug === activePost.slug
          ? { ...item, commentCount: (next.comments || []).length }
          : item));
      }
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
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
      language === "de"
        ? "Dein Benutzername wurde geändert. Die nächste Änderung ist in 14 Tagen möglich."
        : "Your username was changed. You can change it again in 14 days.",
      "account",
    );
  };

  const changeEmail = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    setBusy(true);
    setNotice("");
    let emailChanged = false;
    try {
      await updateProfileEmail(email, password, language);
      emailChanged = true;
      await resendVerification(language);
      await refresh();
      form.reset();
      setNotice(language === "de"
        ? "E-Mail-Adresse geändert. Bitte bestätige die neue Adresse über den soeben versendeten Link."
        : "Email address changed. Confirm the new address using the link we just sent.");
    } catch (error) {
      if (emailChanged) {
        await refresh().catch(() => null);
        setNotice(language === "de"
          ? "Die E-Mail-Adresse wurde geändert, aber die Bestätigungsmail konnte noch nicht zugestellt werden. Nutze bitte „Bestätigungs-E-Mail erneut senden“ in der Übersicht."
          : "Your email address was changed, but the confirmation email could not be delivered yet. Use “Resend confirmation email” in Overview.");
      } else {
        setNotice(friendlyErrorMessage(error, language, t.genericError));
      }
    } finally {
      setBusy(false);
    }
  };

  const privacyAction = async (work, success) => {
    setBusy(true);
    setNotice("");
    try {
      await work();
      await Promise.all([refresh(), loadPrivacy()]);
      setNotice(success);
      return true;
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const savePrivacyLocation = ({ countryCode, regionCode }) => privacyAction(
    () => updatePrivacyProfile({
      countryCode,
      regionCode,
      noticeAccepted: true,
      noticeVersion: privacyNoticeVersion,
      gpcSignal: hasGlobalPrivacyControl(),
      locale: language,
    }),
    language === "de"
      ? "Dein Rechtsraum wurde gespeichert."
      : "Your jurisdiction has been saved.",
  );

  const savePrivacyChoices = (choices) => privacyAction(
    () => updatePrivacyChoices(choices),
    language === "de"
      ? "Deine Datenschutzentscheidungen wurden gespeichert."
      : "Your privacy choices have been saved.",
  );

  const submitPrivacyRequest = (requestType, note) => privacyAction(
    () => createPrivacyRequest(requestType, note),
    language === "de"
      ? "Deine Datenschutzanfrage wurde sicher erfasst."
      : "Your privacy request has been recorded securely.",
  );

  const withdrawPrivacyRequest = (requestId) => privacyAction(
    () => cancelPrivacyRequest(requestId),
    language === "de"
      ? "Die Anfrage wurde zurückgezogen."
      : "The request has been withdrawn.",
  );

  const deleteAccountFromPrivacyCenter = async (reason) => {
    setBusy(true);
    setNotice("");
    try {
      const deletion = await requestAccountDeletion(reason);
      await logout().catch(() => null);
      setUser(null);
      setMembership(null);
      setOrders([]);
      setPremiumTelegram(null);
      setVipWhatsapp(null);
      setPrivacy(null);
      setAgeSession(null);
      setLiveVideo(null);
      setDashboardTab("overview");
      setMode("login");
      setModal("auth");
      history.replaceState({}, "", "/");
      setNotice(language === "de"
        ? (deletion.status === "DELETED"
          ? "Dein Konto und alle unmittelbar löschbaren personenbezogenen Daten wurden gelöscht. Gesetzlich aufzubewahrende Rechnungs- und Buchungsdaten verbleiben ausschließlich pseudonymisiert."
          : "Deine Kontolöschung wurde gestartet. Du wurdest abgemeldet; ein rechtlich erforderlicher Sperrgrund wird dir über den Support erläutert.")
        : (deletion.status === "DELETED"
          ? "Your account and all immediately erasable personal data were deleted. Legally required invoice and accounting records remain only in pseudonymised form."
          : "Your account deletion has started. You were signed out; support can explain any legally required hold."));
      return true;
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const downloadPrivacyData = async () => {
    setBusy(true);
    setNotice("");
    let objectUrl = null;
    try {
      const response = await fetchPrivacyExport();
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/i)?.[1]
        || `shadows-temptation-data-${new Date().toISOString().slice(0, 10)}.json`;
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setNotice(language === "de"
        ? "Deine Datenkopie wurde erstellt und heruntergeladen."
        : "Your data copy has been generated and downloaded.");
    } catch (error) {
      setNotice(friendlyErrorMessage(error, language, t.genericError));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBusy(false);
    }
  };

  const handleAdminLogout = async () => {
    setBusy(true);
    try {
      await endAdminSession().catch(() => null);
      await logout();
      history.replaceState({}, "", "/");
      setUser(null);
      setMembership(null);
    } finally {
      setBusy(false);
    }
  };

  if (isAdmin && user?.mfa !== true) return <main className="admin-mfa-gate">
    <section className="admin-mfa-gate__panel">
      <div className="admin-mfa-gate__intro">
        <img src="/linktree/uploads/profile.png" alt="Shadow’s Temptation" width="1536" height="1536" />
        <div>
          <p className="eyebrow">{language === "de" ? "ADMIN SECURITY" : "ADMIN SECURITY"}</p>
          <h1>{language === "de" ? "Schütze deinen Admin-Zugang" : "Protect your admin access"}</h1>
          <p>{language === "de"
            ? "Für den Zugriff auf sensible Verwaltungsfunktionen ist eine Authenticator-App verpflichtend. Die Einrichtung dauert nur wenige Minuten."
            : "An authenticator app is required before sensitive administration features can be accessed. Setup only takes a few minutes."}</p>
        </div>
      </div>
      <MfaPanel language={language} user={user} onUserUpdate={setUser} required />
      <button className="secondary-action" type="button" disabled={busy} onClick={handleAdminLogout}>
        {language === "de" ? "Abmelden" : "Sign out"}
      </button>
    </section>
  </main>;
  if (isAdmin) return <React.Suspense fallback={<p className="app-loading">{ui.adminRedirect}</p>}>
    <AdminPortal user={user} language={language} setLanguage={setLanguage} onLogout={handleAdminLogout} />
  </React.Suspense>;
  if (busy && !user && location.pathname === "/admin") return <p className="app-loading">{ui.adminRedirect}</p>;

  const groupedProducts = Object.keys(tierNames).map((tier) => [tier, products.filter((product) => product.tier === tier)]);
  const reviewPending = ageRequest?.reviewStatus === "READY_FOR_REVIEW";

  return <>
    <div className="ember-field" aria-hidden="true" />
    <header className="exclusive-header"><a className="brand brand--wordmark" href="#top">Shadow’s Temptation</a><nav className="main-nav desktop-nav" aria-label={t.navigation}>{user ? <><a href="#member-gallery">{language === "de" ? "Beiträge" : "Feed"}</a><a href="#pricing">Memberships</a></> : <><a href="#experience">{t.navProfile}</a><a href="#pricing">Memberships</a><a href="#exclusive">{language === "de" ? "Galerien" : "Galleries"}</a></>}</nav><div className="header-actions"><div className="language-switcher">{["de", "en"].map((lang) => <button className={`language-button${lang === language ? " is-active" : ""}`} type="button" onClick={() => setLanguage(lang)} key={lang}>{lang.toUpperCase()}</button>)}</div><button className="secondary-action header-link" type="button" onClick={() => user ? setModal("account") : openAuth("login")}>{user ? t.account : t.login}</button></div></header>
    <main id="top">
      {user ? <>
        <section className="hero adult-hero member-hero">
          <div className="hero-media" aria-hidden="true"><img src="/linktree/uploads/banner.png" alt="" width="1536" height="652" decoding="async" fetchPriority="high" /><div className="hero-media__shade" /></div>
          <div className="hero-content adult-hero__content">
            <img className="avatar hero-avatar" src="/linktree/uploads/profile.png" alt="Shadow’s Temptation" width="1536" height="1536" decoding="async" />
            <p className="eyebrow">{language === "de" ? "DEIN PRIVATER BEREICH" : "YOUR PRIVATE SPACE"}</p>
            <h1>{language === "de" ? `Willkommen, ${user.name || "du"}` : `Welcome, ${user.name || "you"}`}</h1>
            <p className="tagline">{ageStatus === "APPROVED"
              ? entitlement?.active
                ? (language === "de" ? "Dein Zugang ist aktiv. Entdecke neue Posts, deine freigeschalteten Galerien und persönlichen Benefits." : "Your access is active. Discover new posts, unlocked galleries and personal benefits.")
                : (language === "de" ? "Deine Altersprüfung ist abgeschlossen. Die Free Gallery wartet auf dich." : "Your age review is complete. Your Free Gallery is ready.")
              : (language === "de" ? "Vervollständige deine Altersprüfung, damit dein persönlicher Bereich freigeschaltet werden kann." : "Complete age verification to unlock your personal space.")}</p>
            <div className="member-status-row">
              <span className={entitlement?.active ? "status-chip is-active membership-status-chip" : "status-chip membership-status-chip"}>{entitlement?.active && <MembershipMark tier={entitlement.tier} />}{entitlement?.active ? `Exclusive ${entitlement.tier.replace("EXCLUSIVE_", "")}` : (language === "de" ? "Free Preview" : "Free Preview")}</span>
            </div>
            <div className="hero-actions">
              {ageStatus === "APPROVED" ? <a className="primary-action" href="#member-gallery">{language === "de" ? "Beiträge entdecken" : "Discover posts"}</a> : <button className="primary-action" type="button" onClick={() => setModal("age")}>{language === "de" ? "Verifizierung fortsetzen" : "Continue verification"}</button>}
              <button className="secondary-action" type="button" onClick={() => { setDashboardTab("overview"); setModal("account"); }}>{language === "de" ? "Mein Dashboard" : "My dashboard"}</button>
            </div>
          </div>
        </section>
        <section className="section member-gallery-section" id="member-gallery">
          <div className="member-gallery-heading">
            <div className="section-heading">
              <p className="eyebrow">{language === "de" ? "DEIN ZUGANG. DEINE MOMENTE." : "YOUR ACCESS. YOUR MOMENTS."}</p>
              <h2>{language === "de" ? "Für dich im Schatten" : "Waiting in the shadows"}</h2>
              <p>{language === "de" ? "Deine freigeschalteten Beiträge – persönlich kuratiert und direkt für dich." : "Your unlocked posts — personally curated and ready for you."}</p>
            </div>
            {ageStatus === "APPROVED" && <SensitiveMediaToggle blurred={blurSensitiveMedia} language={language} onToggle={() => setBlurSensitiveMedia((value) => !value)} />}
          </div>
          {notice && <p className="form-notice" role="status">{notice}</p>}
          {gallery.length ? <>
            <div className="gallery-tier-tabs" role="tablist" aria-label={language === "de" ? "Galerie auswählen" : "Choose gallery"}>
              {galleryGroups.map((group) => <button
                className={group.tier === activeGalleryGroup?.tier ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={group.tier === activeGalleryGroup?.tier}
                onClick={() => selectGallery(group.tier)}
                key={group.tier}
              >
                <span>{group.tier !== "FREE" && <MembershipMark tier={group.tier} />}{galleryTierLabel(group.tier, language)}</span>
                <small>{group.items.length}</small>
              </button>)}
            </div>
            {activePost && <div className="post-carousel" aria-roledescription="carousel" aria-label={`${galleryTierLabel(activeGalleryGroup.tier, language)} ${language === "de" ? "Beiträge" : "posts"}`}>
              <div className="post-carousel__navigation">
                <button className="post-carousel__arrow is-previous" type="button" disabled={activeGalleryGroup.items.length < 2} onClick={() => movePost(-1)} aria-label={language === "de" ? "Vorheriger Beitrag" : "Previous post"}><span>←</span></button>
                <div className="post-carousel__progress" aria-live="polite">
                  <span>{galleryTierLabel(activeGalleryGroup.tier, language)}</span>
                  <strong>{normalizedPostIndex + 1} / {activeGalleryGroup.items.length}</strong>
                </div>
                <button className="post-carousel__arrow is-next" type="button" disabled={activeGalleryGroup.items.length < 2} onClick={() => movePost(1)} aria-label={language === "de" ? "Nächster Beitrag" : "Next post"}><span>→</span></button>
              </div>
              <div className="post-carousel__slide" key={activePost.slug}>
                <CreatorPost item={activePost} media={mediaBySlug[activePost.slug]} blurred={blurSensitiveMedia} language={language} />
                <InlineComments
                  item={activePost}
                  comments={comments}
                  commentAccess={commentAccess}
                  commentsLoading={commentsLoading}
                  entitlementTier={entitlement?.active ? entitlement.tier : null}
                  userName={user?.name}
                  language={language}
                  busy={busy}
                  onSubmit={submitComment}
                  onDelete={removeComment}
                />
              </div>
            </div>}
          </> : <div className="member-empty-state"><h3>{ageStatus === "APPROVED" ? ui.noContent : (language === "de" ? "Noch nicht freigeschaltet" : "Not unlocked yet")}</h3><p>{ageStatus === "APPROVED" ? (language === "de" ? "Sobald neue Beiträge veröffentlicht werden, erscheinen sie direkt hier." : "New posts will appear here as soon as they are published.") : ui.ageText}</p></div>}
        </section>
        {!entitlement?.active && <section className="section member-unlock-section"><div className="section-heading"><p className="eyebrow">{language === "de" ? "MEHR WARTET AUF DICH" : "MORE AWAITS"}</p><h2>{language === "de" ? "Öffne die nächste Tür" : "Open the next door"}</h2><p>{language === "de" ? "Wähle deinen persönlichen Zugang zu Basic, Premium oder VIP." : "Choose your personal access to Basic, Premium or VIP."}</p></div><LockedGalleryShowcase language={language} signedIn onAction={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} /></section>}
        {orders.some((order) => order.status === "PENDING") && <section className="section pending-order-strip"><div><p className="eyebrow">{language === "de" ? "ZAHLUNG AUSSTEHEND" : "PAYMENT PENDING"}</p><h2>{language === "de" ? "Dein Auftrag wartet auf Zahlung" : "Your order is awaiting payment"}</h2><p>{language === "de" ? "Die Zahlungsdaten und den Verwendungszweck findest du jederzeit in deinen Bestellungen." : "Payment details and remittance information remain available in your orders."}</p></div><button className="secondary-action" type="button" onClick={() => { setDashboardTab("orders"); setModal("account"); }}>{language === "de" ? "Bestellungen ansehen" : "View orders"}</button></section>}
        <section id="pricing" className="section pricing-section"><div className="section-heading"><p className="eyebrow">{ui.pricingEyebrow}</p><h2>{entitlement?.active ? (language === "de" ? "Noch mehr entdecken" : "Discover more") : ui.pricingTitle}</h2><p>{ui.pricingText}</p></div>{catalogError && <p className="form-notice form-notice--error">{ui.catalogUnavailable}</p>}<div className="pricing-grid">{Object.keys(tierNames).map((tier) => [tier, products.filter((product) => product.tier === tier)]).map(([tier, tierProducts]) => tierProducts.length > 0 && <PricingGroup tier={tier} products={tierProducts} language={language} ui={ui} onChoose={openTierSelection} key={tier} />)}</div></section>
      </> : <>
      <section className="hero adult-hero"><div className="hero-media" aria-hidden="true"><img src="/linktree/uploads/banner.png" alt="" width="1536" height="652" decoding="async" fetchPriority="high" /><div className="hero-media__shade" /></div><div className="hero-content adult-hero__content"><img className="avatar hero-avatar" src="/linktree/uploads/profile.png" alt="Shadow’s Temptation" width="1536" height="1536" decoding="async" /><p className="eyebrow">{t.adultsOnly}</p><h1>{t.heroTitle}</h1><p className="tagline">{t.heroText}</p><div className="hero-actions"><button className="primary-action" type="button" onClick={() => user ? setModal("account") : openAuth("register")}>{user ? t.account : t.register}</button><a className="secondary-action" href="#experience">{t.explore}</a></div><p className="trust-line"><span>18+</span> {t.trustLine}</p></div></section>
      <section id="experience" className="section intro-section"><div className="section-heading"><p className="eyebrow">{t.profileEyebrow}</p><h2>{t.introTitle}</h2><p>{t.bio}</p></div><div className="editorial-grid"><LockedCard t={t} wide /><div className="editorial-copy"><p className="eyebrow">{t.privateLabel}</p><h2>{t.privateTitle}</h2><p>{t.privateText}</p><a href="#membership" className="text-link">{t.discoverAccess} →</a></div></div></section>
      <section id="membership" className="section membership-section"><div className="section-heading"><p className="eyebrow">{t.accessPath}</p><h2>{t.howItWorks}</h2><p>{t.processIntro}</p></div><div className="tier-list"><Tier number="01" title={t.stepAccount} text={t.stepAccountText} /><Tier number="02" title={t.stepVerify} text={t.stepVerifyText} featured /><Tier number="03" title={t.stepAccess} text={t.stepAccessText} /></div></section>
      <section id="pricing" className="section pricing-section"><div className="section-heading"><p className="eyebrow">{ui.pricingEyebrow}</p><h2>{ui.pricingTitle}</h2><p>{ui.pricingText}</p></div>{catalogError && <p className="form-notice form-notice--error">{ui.catalogUnavailable}</p>}<div className="pricing-grid">{groupedProducts.map(([tier, tierProducts]) => tierProducts.length > 0 && <PricingGroup tier={tier} products={tierProducts} language={language} ui={ui} onChoose={openTierSelection} key={tier} />)}</div></section>
      <section id="exclusive" className="section preview-section"><div className="section-heading"><p className="eyebrow">{t.curatedLabel}</p><h2>{t.exclusiveHeading}</h2><p>{ui.galleryText}</p></div><LockedGalleryShowcase language={language} signedIn={false} onAction={() => openAuth("register")} /></section>
      <section id="access" className="section access-section"><div><p className="eyebrow">{t.readyLabel}</p><h2>{t.readyTitle}</h2><p>{t.readyText}</p></div><div className="hero-actions"><button className="primary-action" type="button" onClick={() => user ? setModal("account") : openAuth("register")}>{user ? t.openDashboard : t.createAccount}</button><button className="secondary-action" type="button" onClick={() => user ? setModal("account") : openAuth("login")}>{user ? t.viewStatus : t.login}</button></div></section>
      </>}
    </main>
    <footer id="legal" className="site-footer legal-footer"><div><a className="brand brand--wordmark" href="#top">Shadow’s Temptation</a><p>{language === "de" ? "Private Memberships. Persönlich kuratiert. Ausschließlich für verifizierte Erwachsene." : "Private memberships. Personally curated. Exclusively for verified adults."}</p></div><nav><a href="https://www.instagram.com/shadows.temptation_official/" target="_blank" rel="noopener noreferrer">Instagram</a><a href="/linktree/">Links</a><a href="/legal/">{t.legalLink}</a></nav></footer>

    {modal === "auth" && <Modal
      title={mode === "register" ? t.createAccount : mode === "login" ? t.welcomeBack : t.reset}
      eyebrow={t.secureAccount}
      onClose={() => setModal(null)}
      t={t}
    >
      <div className="auth-tabs">
        {["login", "register", "reset"].map((item) => <button
          type="button"
          className={mode === item ? "is-active" : ""}
          onClick={() => { setMode(item); setNotice(""); }}
          key={item}
        >{t[item]}</button>)}
      </div>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <form className="auth-panel" onSubmit={handleAuth}>
        {mode === "register" && <Field label={t.name} name="name" autoComplete="name" required maxLength="128" />}
        {mode !== "recover" && <Field label={t.emailLabel} name="email" type="email" autoComplete="email" required />}
        {mode !== "reset" && <Field
          label={t.password}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength="6"
          required
        />}
        {mode === "register" && <>
          <label className="field">
            <span>{language === "de" ? "Land des gewöhnlichen Aufenthalts" : "Country of residence"}</span>
            <select
              name="countryCode"
              value={registrationCountry}
              onChange={(event) => {
                setRegistrationCountry(event.target.value);
                if (event.target.value !== "US") setRegistrationRegion("");
              }}
              required
            >
              {registrationCountries.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
            </select>
          </label>
          {registrationCountry === "US" && <label className="field">
            <span>{language === "de" ? "US-Bundesstaat / Territorium" : "U.S. state / territory"}</span>
            <select
              name="regionCode"
              value={registrationRegion}
              onChange={(event) => setRegistrationRegion(event.target.value)}
              required
            >
              <option value="">{language === "de" ? "Bitte auswählen" : "Select state"}</option>
              {usRegions.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
            </select>
          </label>}
          <label className="consent-check privacy-registration-notice">
            <input name="privacyNoticeAccepted" type="checkbox" required />
            <span>{language === "de"
              ? <>Ich bestätige meinen Wohnsitz und habe die <a href={registrationCountry === "US" ? "/legal/us/#privacy" : "/legal/eu/#privacy"} target="_blank" rel="noreferrer">Datenschutzerklärung</a> gelesen.</>
              : <>I confirm my country of residence and have read the <a href={registrationCountry === "US" ? "/legal/us/#privacy" : "/legal/eu/#privacy"} target="_blank" rel="noreferrer">Privacy notice</a>.</>}</span>
          </label>
          {hasGlobalPrivacyControl() && <p className="privacy-gpc-note">
            {language === "de"
              ? "Global Privacy Control erkannt: Werbe-Weitergabe und gezielte Werbung werden vorsorglich deaktiviert."
              : "Global Privacy Control detected: ad-sharing and targeted advertising will be opted out automatically."}
          </p>}
        </>}
        <button className="primary-action" disabled={busy}>{busy ? ui.loading : t[`${mode}Submit`]}</button>
      </form>
    </Modal>}

    {modal === "mfa" && <Modal
      title={language === "de" ? "Anmeldung bestätigen" : "Confirm sign-in"}
      eyebrow={language === "de" ? "ZWEITER SICHERHEITSFAKTOR" : "SECOND SECURITY FACTOR"}
      onClose={() => {
        logout().catch(() => null);
        setMfaChallenge(null);
        setMfaFactor("totp");
        setMode("login");
        setModal("auth");
      }}
      t={t}
    >
      <p className="modal-intro">{mfaFactor === "recovery"
        ? (language === "de"
          ? "Gib einen deiner einmal verwendbaren Wiederherstellungscodes ein."
          : "Enter one of your single-use recovery codes.")
        : (language === "de"
          ? "Öffne deine Authenticator-App und gib den aktuellen sechsstelligen Code ein."
          : "Open your authenticator app and enter the current six-digit code.")}</p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <form className="auth-panel mfa-login" onSubmit={finishMfaSignIn}>
        <Field
          label={mfaFactor === "recovery"
            ? (language === "de" ? "Wiederherstellungscode" : "Recovery code")
            : (language === "de" ? "6-stelliger Sicherheitscode" : "6-digit security code")}
          name="otp"
          type="text"
          inputMode={mfaFactor === "recovery" ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={mfaFactor === "recovery" ? "[A-Za-z0-9-]{6,32}" : "[0-9]{6}"}
          minLength="6"
          maxLength={mfaFactor === "recovery" ? "32" : "6"}
          required
          autoFocus
        />
        <button className="primary-action" disabled={busy}>
          {busy ? ui.loading : (language === "de" ? "Sicher anmelden" : "Sign in securely")}
        </button>
      </form>
      <button
        className="text-button mfa-factor-switch"
        type="button"
        disabled={busy}
        onClick={() => beginMfaSignIn(mfaFactor === "recovery" ? "totp" : "recovery")}
      >
        {mfaFactor === "recovery"
          ? (language === "de" ? "Code aus Authenticator-App verwenden" : "Use authenticator app")
          : (language === "de" ? "Wiederherstellungscode verwenden" : "Use a recovery code")}
      </button>
    </Modal>}

    {modal === "account" && <Modal title={language === "de" ? "Mein Konto" : "My account"} eyebrow={entitlement?.active ? entitlement.tier : ageStatus} onClose={() => setModal(null)} t={t} wide>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {!user ? <button className="primary-action" onClick={() => openAuth("login")}>{t.login}</button> : <div className="account-dashboard">
        <div className="dashboard-tabs" role="tablist" aria-label={language === "de" ? "Kontobereiche" : "Account sections"}>
          {[
            ["overview", language === "de" ? "Übersicht" : "Overview"],
            ["profile", language === "de" ? "Meine Daten" : "My data"],
            ["orders", language === "de" ? "Bestellungen" : "Orders"],
            ["access", language === "de" ? "Zugang & Perks" : "Access & perks"],
            ["devices", language === "de" ? "Geräte" : "Devices"],
            ["security", language === "de" ? "Sicherheit" : "Security"],
            ["privacy", language === "de" ? "Datenschutz" : "Privacy"],
          ].map(([key, label]) => <button type="button" role="tab" aria-selected={dashboardTab === key} className={dashboardTab === key ? "is-active" : ""} onClick={() => setDashboardTab(key)} key={key}>{label}</button>)}
        </div>
        {dashboardTab === "overview" && <div className="dashboard-overview">
          <div className="dashboard-profile-card"><img src="/linktree/uploads/profile.png" alt="" /><div><p className="eyebrow">{language === "de" ? "WILLKOMMEN ZURÜCK" : "WELCOME BACK"}</p><h3>{profile?.displayName || user.name || user.email}</h3><p>{user.email}</p></div></div>
          <div className="dashboard-stat-grid">
            <article><span>{language === "de" ? "Kontostatus" : "Account status"}</span><strong>{profile?.status || "EMAIL_PENDING"}</strong></article>
            <article><span>{language === "de" ? "Altersprüfung" : "Age verification"}</span><strong>{reviewPending ? ui.reviewReady : ageStatus}</strong></article>
            <article><span>{ui.entitlement}</span><strong>{entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "") : ui.noMembership}</strong></article>
          </div>
          {entitlement?.paused && <div className="membership-pause-notice">
            <MembershipMark tier={entitlement.paused.tier} />
            <div><strong>{language === "de" ? "Membership pausiert – Restlaufzeit bleibt erhalten" : "Membership paused — remaining time is preserved"}</strong><p>{language === "de" ? "Wird automatisch fortgesetzt am" : "Automatically resumes on"} {new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(entitlement.paused.resumesAt))}.</p></div>
          </div>}
          {profile && !profile.privacyProfileComplete && <button
            className="privacy-completion-card"
            type="button"
            onClick={() => setDashboardTab("privacy")}
          >
            <span>!</span>
            <div><strong>{language === "de" ? "Datenschutzprofil vervollständigen" : "Complete your privacy profile"}</strong>
              <small>{language === "de"
                ? "Bitte ergänze dein Aufenthaltsland, damit wir die richtigen Datenschutzrechte anwenden."
                : "Add your country of residence so we can apply the correct privacy rights."}</small></div>
          </button>}
          <div className="dashboard-actions">
            {!user.emailVerification && <button className="secondary-action" onClick={() => run(() => resendVerification(language), t.verificationSent)}>{t.resendVerification}</button>}
            <button className="primary-action" disabled={!user.emailVerification || reviewPending || ageStatus === "APPROVED"} onClick={() => { setNotice(""); setModal("age"); }}>{reviewPending ? ui.reviewReady : ageStatus === "APPROVED" ? t.ageAlreadyApproved : t.avsStart}</button>
            {ageStatus === "APPROVED" && <button className="secondary-action" type="button" onClick={openGallery}>{ui.openGallery}</button>}
          </div>
        </div>}
        {dashboardTab === "profile" && <div className="profile-settings">
          <form className="dashboard-form profile-setting-card" onSubmit={saveProfile}>
            <div className="profile-setting-card__heading">
              <span aria-hidden="true">01</span>
              <div>
                <h3>{language === "de" ? "Benutzername" : "Username"}</h3>
                <p>{language === "de"
                  ? "Dein sichtbarer Name für Beiträge und Kommentare."
                  : "Your public name for posts and comments."}</p>
              </div>
            </div>
            <Field
              label={language === "de" ? "Neuer Benutzername" : "New username"}
              name="name"
              key={profile?.displayName || user.name}
              defaultValue={profile?.displayName || user.name || ""}
              autoComplete="nickname"
              required
              minLength="2"
              maxLength="64"
              disabled={!profile?.usernameCanChange}
            />
            <p className="profile-policy-note">
              {!profile
                ? (language === "de" ? "Die Profileinstellungen werden gerade geladen." : "Profile settings are loading.")
                : profile.usernameCanChange
                ? (profile?.usernameChangeCount
                  ? (language === "de" ? "Die Änderung ist jetzt verfügbar." : "You can change it now.")
                  : (language === "de" ? "Deine erste Änderung nach der Registrierung ist sofort möglich." : "Your first change after registration is available immediately."))
                : `${language === "de" ? "Nächste Änderung möglich ab" : "Next change available"} ${new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(profile?.usernameNextChangeAt))}.`}
            </p>
            <button className="primary-action" disabled={busy || !profile?.usernameCanChange}>
              {language === "de" ? "Benutzernamen ändern" : "Change username"}
            </button>
          </form>

          <form className="dashboard-form profile-setting-card" onSubmit={changeEmail}>
            <div className="profile-setting-card__heading">
              <span aria-hidden="true">02</span>
              <div>
                <h3>{language === "de" ? "E-Mail-Adresse" : "Email address"}</h3>
                <p>{language === "de"
                  ? "Für Login, Sicherheitsnachrichten, Bestellungen und Rechnungen."
                  : "Used for sign-in, security messages, orders and invoices."}</p>
              </div>
            </div>
            <div className="current-account-value"><span>{language === "de" ? "Aktuell" : "Current"}</span><strong>{user.email}</strong></div>
            <Field label={language === "de" ? "Neue E-Mail-Adresse" : "New email address"} name="email" type="email" autoComplete="email" required maxLength="320" />
            <Field label={language === "de" ? "Aktuelles Passwort" : "Current password"} name="password" type="password" autoComplete="current-password" required minLength="6" maxLength="128" />
            <p className="profile-policy-note is-security">
              {language === "de"
                ? "Nach der Änderung wird der geschützte Zugang pausiert, bis du die neue Adresse bestätigt hast."
                : "Protected access is paused after the change until you confirm the new address."}
            </p>
            <button className="secondary-action" disabled={busy}>
              {language === "de" ? "E-Mail sicher ändern" : "Securely change email"}
            </button>
          </form>
        </div>}
        {dashboardTab === "orders" && <div className="order-list">
          {orders.length ? orders.map((order) => <article className="order-card" key={order.orderId}>
            <div className="order-card__head"><div><p className="eyebrow">{order.status}</p><h3>{order.productName}</h3></div><strong>{new Intl.NumberFormat(language === "de" ? "de-DE" : "en-IE", { style: "currency", currency: order.currency }).format(order.amountMinor / 100)}</strong></div>
            <dl className="order-facts"><div><dt>{language === "de" ? "Verwendungszweck" : "Remittance information"}</dt><dd className="payment-reference">{order.reference}</dd></div><div><dt>{ui.due}</dt><dd>{new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(order.paymentDueAt))}</dd></div>{order.invoice?.number && <div><dt>{language === "de" ? "Rechnung" : "Invoice"}</dt><dd>{order.invoice.number} · {order.invoice.emailStatus}</dd></div>}</dl>
            {order.status === "PENDING" && <div className="order-actions"><button className="secondary-action" type="button" onClick={() => { setSelectedProduct(products.find((product) => product.sku === order.productSku) || { displayName: order.productName, currency: order.currency, amountMinor: order.amountMinor, durationValue: order.durationValue, durationUnit: order.durationUnit }); setSepaOrder(order); setPaymentView("details"); setModal("payment"); }}>{language === "de" ? "Zahlungsdetails" : "Payment details"}</button><button className="danger-action" type="button" onClick={() => cancelOrder(order)}>{language === "de" ? "Auftrag stornieren" : "Cancel order"}</button></div>}
          </article>) : <div className="member-empty-state"><h3>{language === "de" ? "Noch keine Bestellungen" : "No orders yet"}</h3><p>{language === "de" ? "Deine zukünftigen Zahlungsaufträge erscheinen hier." : "Your future payment orders will appear here."}</p></div>}
        </div>}
        {dashboardTab === "access" && <div className="access-perks">
          <article className="perk-access-card">{entitlement?.active ? <MembershipMark tier={entitlement.tier} /> : <LockIcon />}<div><h3>{entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "Exclusive ") : (language === "de" ? "Free Preview" : "Free Preview")}</h3><p>{entitlement?.expiresAt ? `${ui.expires}: ${new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(entitlement.expiresAt))}` : ui.noMembership}</p></div></article>
          {entitlement?.paused && <article className="perk-access-card is-paused"><MembershipMark tier={entitlement.paused.tier} /><div><h3>{entitlement.paused.tier.replace("EXCLUSIVE_", "Exclusive ")} · {language === "de" ? "Pausiert" : "Paused"}</h3><p>{language === "de" ? "Deine verbleibende Laufzeit geht nicht verloren und beginnt wieder am" : "Your remaining term is preserved and resumes on"} {new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(entitlement.paused.resumesAt))}.</p></div></article>}
          {premiumTelegram && <article className="perk-access-card is-private"><span>↗</span><div><h3>Private Telegram Channel</h3><p>{language === "de" ? "Nur für deine aktive Premium-Laufzeit sichtbar." : "Visible only during your active Premium term."}</p><a className="primary-action" href={premiumTelegram.inviteUrl} target="_blank" rel="noreferrer">{language === "de" ? "Telegram öffnen" : "Open Telegram"}</a></div></article>}
          {vipWhatsapp && <article className="perk-access-card is-vip"><span>VIP</span><div><h3>{language === "de" ? "Meine private WhatsApp-Nummer" : "My private WhatsApp number"}</h3><p>{vipWhatsapp.phoneNumber}</p><a className="primary-action" href={vipWhatsapp.whatsappUrl} target="_blank" rel="noreferrer">{language === "de" ? "WhatsApp öffnen" : "Open WhatsApp"}</a></div></article>}
          {!premiumTelegram && !vipWhatsapp && entitlement?.active && <p className="upload-note">{language === "de" ? "Deine laufzeitabhängigen Benefits werden hier automatisch freigeschaltet." : "Term-specific benefits unlock here automatically."}</p>}
        </div>}
        {dashboardTab === "devices" && <DeviceManager
          language={language}
          onCurrentRevoked={handleLogout}
        />}
        {dashboardTab === "security" && <MfaPanel
          language={language}
          user={user}
          onUserUpdate={setUser}
        />}
        {dashboardTab === "privacy" && <PrivacyPanel
          language={language}
          privacy={privacy}
          loading={privacyLoading}
          busy={busy}
          onSaveLocation={savePrivacyLocation}
          onSaveChoices={savePrivacyChoices}
          onExport={downloadPrivacyData}
          onCreateRequest={submitPrivacyRequest}
          onCancelRequest={withdrawPrivacyRequest}
          onDeleteAccount={deleteAccountFromPrivacyCenter}
        />}
        <div className="dashboard-footer-actions"><a className="secondary-action button-link" href="#pricing" onClick={() => setModal(null)}>{ui.pricingTitle}</a><button className="text-button" onClick={handleLogout}>{ui.logout}</button></div>
      </div>}
    </Modal>}

    {modal === "age" && <Modal
      title={ui.ageTitle}
      eyebrow={ui.ageKicker}
      onClose={() => setModal("account")}
      t={t}
      wide
    >
      <p className="modal-intro verification-lead">{ui.ageText}</p>
      <VerificationJourney ui={ui} activeStep={activeAgeCase?.reviewStatus === "READY_FOR_REVIEW" ? 3 : activeAgeCase?.caseId ? 2 : 1} />
      <VerificationAssurance ui={ui} />
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {!activeAgeCase?.caseId ? <form className="auth-panel verification-start" onSubmit={beginAgeVerification}>
        <label className="form-field">
          <span>{ui.documentType}</span>
          <select value={ageDocumentType} onChange={(event) => setAgeDocumentType(event.target.value)}>
            {ageDocumentOptions(profile?.countryCode, ui).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <VerificationRules ui={ui} />
        <p className="upload-note">{ui.agePrivacy} <a href="/legal/eu/#privacy" target="_blank" rel="noreferrer">{t.privacy}</a></p>
        <label className="consent-check"><input name="consent" type="checkbox" required /><span>{ui.consentText}</span></label>
        <button className="primary-action verification-primary" type="submit" disabled={busy}>{busy ? ui.loading : ui.beginVerification}</button>
      </form> : <form className="auth-panel verification-upload" onSubmit={submitAge}>
        <div className="verification-document-badge"><span>01</span><div><strong>{ui.documentType}</strong><small>{ageDocumentOptions(profile?.countryCode, ui).find((option) => option.value === ageDocumentType)?.label}</small></div></div>
        <p className="eyebrow">{ui.challengeTitle}</p>
        <LivePhotoCapture
          label={ageDocumentType === "PASSPORT" ? ui.passportFront : ui.documentFront}
          complete={activeAgeCase?.evidenceKinds?.includes("DOCUMENT_FRONT")}
          value={documentFront}
          onChange={setDocumentFront}
          ui={ui}
          disabled={busy}
          side="front"
        />
        {(activeAgeCase?.requiredEvidence || []).includes("DOCUMENT_BACK") && <LivePhotoCapture
          label={ui.documentBack}
          complete={activeAgeCase?.evidenceKinds?.includes("DOCUMENT_BACK")}
          value={documentBack}
          onChange={setDocumentBack}
          ui={ui}
          disabled={busy}
          side="back"
        />}
        {activeAgeCase?.evidenceKinds?.includes("VIDEO")
          ? <p className="live-recorder__ready">✓ {ui.videoReady}</p>
          : <LiveVideoRecorder ui={ui} value={liveVideo} onChange={setLiveVideo} disabled={busy} challenge={activeAgeCase?.livenessChallenge || []} challengeCode={activeAgeCase?.livenessCode} language={language} />}
        <button className="primary-action verification-primary" type="submit" disabled={busy}>{busy ? ui.loading : ui.submitAge}</button>
      </form>}
    </Modal>}

    {modal === "membership" && tierSelection.length > 0 && <Modal
      title={tierSelection[0].displayName.replace(/\s[–-].*$/, "")}
      eyebrow={language === "de" ? "WÄHLE DEIN ERLEBNIS" : "CHOOSE YOUR EXPERIENCE"}
      onClose={() => setModal(null)}
      t={t}
      wide
    >
      <p className="modal-intro">{language === "de" ? "Wähle deine Laufzeit mit dem Slider. Alle angezeigten Benefits gelten für jede Laufzeit dieser Stufe." : "Choose your term with the slider. Every benefit shown applies to every term in this tier."}</p>
      <MembershipSelector products={tierSelection} language={language} ui={ui} onChoose={chooseProduct} />
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
        <label className="checkout-confirmation">
          <input type="checkbox" checked={digitalConsentAccepted} onChange={(event) => setDigitalConsentAccepted(event.target.checked)} />
          <span>{ui.digitalConsentText}</span>
        </label>
        <p className="checkout-legal-note">{language === "de" ? <>Es gelten unsere <a href="/legal/eu/#terms" target="_blank" rel="noopener noreferrer">AGB</a>, <a href="/legal/eu/#withdrawal" target="_blank" rel="noopener noreferrer">Widerrufsinformationen</a> und <a href="/legal/eu/#privacy" target="_blank" rel="noopener noreferrer">Datenschutzhinweise</a>.</> : <>Your order is subject to our <a href="/legal/eu/#terms" target="_blank" rel="noopener noreferrer">Terms</a>, <a href="/legal/eu/#withdrawal" target="_blank" rel="noopener noreferrer">withdrawal information</a> and <a href="/legal/eu/#privacy" target="_blank" rel="noopener noreferrer">Privacy notice</a>.</>}</p>
        <button className="primary-action" type="button" disabled={!checkoutAccepted || !digitalConsentAccepted || busy || !billing.name.trim() || !billing.street.trim() || !billing.postalCode.trim() || !billing.city.trim() || !/^[A-Z]{2}$/.test(billing.countryCode)} onClick={() => setCheckoutStep("pay")}>{ui.confirmOrder}</button>
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

  </>;
}
