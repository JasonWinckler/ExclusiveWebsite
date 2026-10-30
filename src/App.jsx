import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import OrderLanding, { OrderClosing } from "./OrderLanding";
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
  createPremiumTelegramClaim,
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
  updateProfileEmail,
  updateProfileName,
  updatePrivacyProfile,
  subscribeNewsletter,
  unsubscribeNewsletter,
  recordAnalyticsEvent,
  cancelPaymentOrder,
  createPrivacyRequest,
  fetchPrivacyExport,
  endAdminSession,
  exitAdminSimulation,
  getAdminSimulationRole,
  startAdminSimulation,
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
const AdminPortal = React.lazy(() => import("./AdminPortal"));

function simulatedMemberUser(administrator, role) {
  if (role === "GUEST") return null;
  const tierLabel = role.startsWith("EXCLUSIVE_") ? role.replace("EXCLUSIVE_", "") : role;
  return {
    ...administrator,
    name: role === "REGISTERED" ? "New Member" : `Preview ${tierLabel}`,
    email: "simulation@exclusive.jason-shadow.com",
    emailVerification: role !== "REGISTERED",
    labels: [
      ...(role.startsWith("EXCLUSIVE_") ? [`active_${tierLabel.toLowerCase()}`] : []),
    ],
    mfa: false,
  };
}

const copy = {
  de: {
    pricingEyebrow: "THE ORDER OF SHADOWS",
    pricingTitle: "Dein Platz im Orden.",
    pricingText: "Einmalige Laufzeit, keine automatische Verlängerung. Freischaltung erfolgt erst nach dem bestätigten SEPA-Zahlungseingang.",
    basic: "Order Basic",
    premium: "Order Premium",
    vip: "Order VIP",
    basicText: "Unterstütze Musik und Sprecherarbeit. Erhalte Einblicke hinter die Kulissen.",
    premiumText: "Noch näher dran: Basic- und Premium-Inhalte sowie die private Community.",
    vipText: "Alle Inhalte, persönlicher Kontakt und inklusive VIP-Meet-ups nach Absprache.",
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
    gallery: "Galerie",
    openGallery: "Beiträge entdecken",
    galleryText: "Free Preview sowie freigeschaltete Basic-, Premium- und VIP-Inhalte.",
    noContent: "In dieser Galerie ist noch kein Content veröffentlicht.",
    lockedTier: "Für deinen aktuellen Zugang gesperrt",
    deviceNote: "Dieser Browser wird beim ersten Öffnen als persönliches Gerät registriert.",
    entitlement: "Mitgliedschaft",
    expires: "Gültig bis",
    noMembership: "Keine aktive Mitgliedschaft",
    adminRedirect: "Admin-Zugang wird geöffnet…",
    logout: "Abmelden",
    loading: "Wird verarbeitet…",
  },
  en: {
    pricingEyebrow: "THE ORDER OF SHADOWS",
    pricingTitle: "Find your place in the Order.",
    pricingText: "Fixed term, no automatic renewal. Access is activated only after the SEPA payment has been confirmed.",
    basic: "Order Basic",
    premium: "Order Premium",
    vip: "Order VIP",
    basicText: "Support the music and voice work. Discover the stories behind the scenes.",
    premiumText: "Go deeper with Basic and Premium content and the private community.",
    vipText: "Every content tier, personal connection and included VIP meet-ups by arrangement.",
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
    gallery: "Gallery",
    openGallery: "Explore the feed",
    galleryText: "Free Preview plus unlocked Basic, Premium and VIP content.",
    noContent: "No content has been published in this gallery yet.",
    lockedTier: "Locked for your current access",
    deviceNote: "This browser is registered as a personal device when the gallery is first opened.",
    entitlement: "Membership",
    expires: "Valid until",
    noMembership: "No active membership",
    adminRedirect: "Opening admin access…",
    logout: "Log out",
    loading: "Processing…",
  },
};

const tierNames = {
  EXCLUSIVE_BASIC: "basic",
  EXCLUSIVE_PREMIUM: "premium",
  EXCLUSIVE_VIP: "vip",
};

function Field({ label, ...props }) {
  return <label className="form-field"><span>{label}</span><input {...props} /></label>;
}

function PasswordField({ label, showLabel, hideLabel, ...props }) {
  const [isVisible, setIsVisible] = useState(false);
  const generatedId = useId();
  const inputId = props.id || generatedId;

  return <div className="form-field password-field">
    <label htmlFor={inputId}>{label}</label>
    <span className="password-input-wrap">
      <input {...props} id={inputId} type={isVisible ? "text" : "password"} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={isVisible ? hideLabel : showLabel}
        aria-pressed={isVisible}
        aria-controls={inputId}
        title={isVisible ? hideLabel : showLabel}
        onClick={() => setIsVisible((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.75" />
          {!isVisible && <path d="m4 4 16 16" />}
        </svg>
      </button>
    </span>
  </div>;
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
      <p className="eyebrow">{key === "vip" ? "SIGNATURE ACCESS" : key === "premium" ? "A CLOSER CONNECTION" : "THE FIRST CHAPTER"}</p>
      <h3>{ui[key]}</h3>
      <p>{ui[`${key}Text`]}</p>
      <div className="showcase-price"><strong>{formatCurrency(showcase, language)}</strong><span>{durationLabel(showcase, language)}</span></div>
    </div>
    <ul className="membership-perks">
      {(showcasePerks.length ? showcasePerks : [{ title: ui[`${key}Text`] }]).slice(0, key === "vip" ? 5 : 4).map((perk) => {
        const meeting = key === "vip" && /treffen|meeting/i.test(`${perk.title} ${perk.description || ""}`);
        return <li key={perk.id || perk.title}><span>✓</span><div><strong>{perk.title}</strong>{meeting && perk.description ? <small>{perk.description}</small> : null}{meeting ? <a className="perk-legal-link" href={language === "de" ? "/legal/eu/#vip-meeting" : "/legal/eu/#vip-meeting-en"} target="_blank" rel="noreferrer">{language === "de" ? "Hinweise" : "Details"}</a> : null}</div></li>;
      })}
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
        {tierPerks.map((perk) => {
          const meeting = /treffen|meeting/i.test(`${perk.title} ${perk.description || ""}`);
          return <li key={perk.id || perk.title}>
            <span>✓</span><div><strong>{perk.title}</strong>{perk.description && <small>{perk.description}</small>}{meeting ? <a className="perk-legal-link" href={language === "de" ? "/legal/eu/#vip-meeting" : "/legal/eu/#vip-meeting-en"} target="_blank" rel="noreferrer">{language === "de" ? "Hinweise" : "Details"}</a> : null}</div>
          </li>;
        })}
      </ul>
    </section>

    <button className="primary-action membership-selector__cta" type="button" onClick={() => onChoose(selected)}>
      {language === "de" ? `${durationLabel(selected, language)} wählen und fortfahren` : `Choose ${durationLabel(selected, language)} and continue`}
    </button>
  </div>;
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
  language,
  viewerMark,
}) {
  const accessible = item.accessible !== false;
  const mediaClass = "creator-post__media";
  const deterDownload = (event) => {
    if (accessible) event.preventDefault();
  };
  return <article className={`creator-post${accessible ? "" : " is-locked"}`} onContextMenu={deterDownload} onDragStart={deterDownload}>
    <header className="creator-post__header">
      <img src="/assets/music/portrait-400.webp" alt="" draggable="false" />
      <div>
        <strong>The Order of Shadows</strong>
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
        ? <div className="creator-post__locked"><span>MEMBERS</span><strong>{language === "de" ? "Mit passender Membership freischalten" : "Unlock with the matching membership"}</strong></div>
        : media?.error
          ? <div className="creator-post__locked"><span>!</span><strong>{language === "de" ? "Medium konnte nicht geladen werden" : "Media could not be loaded"}</strong></div>
          : media?.url
            ? item.contentType.startsWith("video/")
              ? <video src={media.url} controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline preload="metadata" />
              : <img src={media.url} alt={item.title} loading="eager" draggable="false" />
            : <div className="creator-post__loading" aria-label={language === "de" ? "Medium wird geladen" : "Loading media"}><span /></div>}
      {accessible && viewerMark && <span className="creator-post__viewer-mark" aria-hidden="true">The Order of Shadows · {viewerMark}</span>}
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
  readOnly = false,
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
          {comment.own && !readOnly && <button className="text-button" type="button" onClick={() => onDelete(comment.id)}>{language === "de" ? "Löschen" : "Delete"}</button>}
        </article>)}</div>
        : <p className="upload-note">{language === "de" ? "Sei der Erste, der diesen Beitrag kommentiert." : "Be the first to comment on this post."}</p>}
    {commentAccess.canComment
      ? <form className="comment-composer" onSubmit={onSubmit}>
        <label>
          <span>{language === "de" ? "Dein Kommentar" : "Your comment"}</span>
          <textarea name="comment" rows="3" maxLength="1200" required disabled={readOnly} placeholder={readOnly ? (language === "de" ? "In der Simulation schreibgeschützt" : "Read-only in simulation") : (language === "de" ? "Was löst dieser Beitrag bei dir aus?" : "What does this post make you feel?")} />
        </label>
        <div>
          <small>{language === "de" ? "Respektvoll bleiben. Deine Kommentare sind nur für berechtigte Mitglieder sichtbar." : "Keep it respectful. Comments are visible only to eligible members."}</small>
          <button className="primary-action" disabled={busy || readOnly}>{readOnly ? (language === "de" ? "Simulation · nur ansehen" : "Simulation · view only") : (language === "de" ? "Kommentar veröffentlichen" : "Post comment")}</button>
        </div>
      </form>
      : commentAccess.allowComments && <div className="paid-comment-teaser">
        <strong>{language === "de" ? "Order member benefit" : "Order member benefit"}</strong>
        <p>{language === "de" ? "Mitglieder des Ordens können direkt unter Beiträgen kommentieren." : "Order members can comment directly below posts."}</p>
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
  const [newsletterIntent, setNewsletterIntent] = useState(false);
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
  const [comments, setComments] = useState([]);
  const [commentAccess, setCommentAccess] = useState({ allowComments: false, canComment: false });
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [activeGalleryTier, setActiveGalleryTier] = useState("FREE");
  const [activePostIndex, setActivePostIndex] = useState(0);
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
  const [simulationAdmin, setSimulationAdmin] = useState(null);
  const initialized = useRef(false);
  const mediaBySlugRef = useRef({});
  const mediaRequestsRef = useRef(new Map());
  const mediaGenerationRef = useRef(0);
  const analyticsEventsRef = useRef(new Set());
  const t = useMemo(() => window.SiteTranslations?.[language] || window.SiteTranslations.en, [language]);
  const ui = copy[language] || copy.de;
  const registrationCountries = useMemo(() => countryOptions(language), [language]);
  const simulationRole = getAdminSimulationRole();
  const isAdminSimulation = Boolean(simulationRole && simulationAdmin);
  const administrator = simulationAdmin || (user?.labels?.includes("admin") ? user : null);
  const isAdmin = Boolean(administrator);
  const profile = membership?.account || null;
  const entitlement = membership?.entitlement || null;
  const membershipReady = Boolean(user?.emailVerification && profile?.status === "ACTIVE");
  const galleryGroups = useMemo(() => galleryTierOrder
    .map((tier) => ({ tier, items: gallery.filter((item) => item.tier === tier) }))
    .filter((group) => group.items.length > 0), [gallery]);
  const activeGalleryGroup = galleryGroups.find((group) => group.tier === activeGalleryTier) || galleryGroups[0] || null;
  const normalizedPostIndex = activeGalleryGroup?.items.length
    ? activePostIndex % activeGalleryGroup.items.length
    : 0;
  const activePost = activeGalleryGroup?.items[normalizedPostIndex] || null;

  const trackConversion = (eventName) => {
    if (isAdminSimulation) return;
    if (analyticsEventsRef.current.has(eventName)) return;
    analyticsEventsRef.current.add(eventName);
    recordAnalyticsEvent(eventName, language).catch(() => null);
  };

  const connectTelegram = async () => {
    const telegramWindow = window.open("about:blank", "shadows-telegram-access");
    if (telegramWindow) telegramWindow.opener = null;
    setBusy(true);
    setNotice("");
    try {
      const result = await createPremiumTelegramClaim();
      setPremiumTelegram(result);
      if (result.active) {
        telegramWindow?.close();
        setNotice(language === "de"
          ? "Dein Telegram-Zugang ist bereits aktiv."
          : "Your Telegram access is already active.");
        return;
      }
      const telegramUrl = new URL(result.botUrl);
      if (telegramUrl.protocol !== "https:" || telegramUrl.hostname !== "t.me") {
        throw new Error("INVALID_TELEGRAM_LINK");
      }
      if (telegramWindow) telegramWindow.location.replace(telegramUrl.toString());
      else window.location.assign(telegramUrl.toString());
      setNotice(language === "de"
        ? "Telegram wurde geöffnet. Starte den Bot und folge dort deinem persönlichen Einmal-Link."
        : "Telegram has opened. Start the bot and follow your personal one-time link there.");
    } catch (error) {
      telegramWindow?.close();
      setNotice(friendlyErrorMessage(error, language, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (sessionUser = null) => {
    const current = sessionUser || await getCurrentUser();
    if (
      simulationRole &&
      current?.labels?.includes("admin") &&
      current.mfa === true
    ) {
      const simulatedUser = simulatedMemberUser(current, simulationRole);
      setSimulationAdmin(current);
      setUser(simulatedUser);
      setBilling((previous) => ({ ...previous, name: previous.name || simulatedUser?.name || "" }));
      const nextMembership = await getMembershipStatus();
      setMembership(simulatedUser ? nextMembership : null);
      setOrders([]);
      const tier = nextMembership?.entitlement?.active ? nextMembership.entitlement.tier : null;
      setPremiumTelegram(["EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP"].includes(tier)
        ? { available: true, simulated: true }
        : null);
      setVipWhatsapp(tier === "EXCLUSIVE_VIP"
        ? { available: true, simulated: true }
        : null);
      setPrivacy(null);
      return simulatedUser;
    }
    if (simulationRole) {
      const url = new URL(location.href);
      url.searchParams.delete("admin-simulation");
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setSimulationAdmin(null);
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
      setPremiumTelegram(["EXCLUSIVE_PREMIUM", "EXCLUSIVE_VIP"].includes(tier)
        ? await getPremiumTelegramPerk().catch(() => null)
        : null);
      setVipWhatsapp(tier === "EXCLUSIVE_VIP"
        ? await getVipWhatsappPerk().catch(() => null)
        : null);
    } catch {
      setMembership({ account: { status: "BACKEND_UNAVAILABLE" }, entitlement: { active: false } });
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
    if (!premiumTelegram || premiumTelegram.simulated || !entitlement?.active) return undefined;
    const refreshTelegramStatus = () => {
      if (document.visibilityState !== "visible") return;
      getPremiumTelegramPerk().then(setPremiumTelegram).catch(() => undefined);
    };
    window.addEventListener("focus", refreshTelegramStatus);
    document.addEventListener("visibilitychange", refreshTelegramStatus);
    return () => {
      window.removeEventListener("focus", refreshTelegramStatus);
      document.removeEventListener("visibilitychange", refreshTelegramStatus);
    };
  }, [premiumTelegram?.simulated, entitlement?.active]);

  useEffect(() => {
    if (!getAdminSimulationRole()) recordAnalyticsEvent("page_view", language).catch(() => null);
  }, []);

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
        if (parameters.get("action") === "new-drop") {
          history.replaceState({}, "", "/");
          if (current) {
            window.setTimeout(() => document.getElementById("member-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
          } else {
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
    if (isAdmin && !isAdminSimulation && location.pathname !== "/admin") {
      history.replaceState({}, "", "/admin");
    }
  }, [isAdmin, isAdminSimulation]);

  useEffect(() => {
    if (["privacy", "newsletter"].includes(dashboardTab) && user && !isAdmin) loadPrivacy();
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
    if (!user || !membershipReady) {
      setGallery([]);
      return;
    }
    let current = true;
    (async () => {
      try {
        if (!isAdminSimulation) await registerCurrentDevice();
        const result = await getContentItems();
        if (current) setGallery((result.items || []).filter((item) => item.accessible));
      } catch {
        if (current) setGallery([]);
      }
    })();
    return () => { current = false; };
  }, [user?.$id, membershipReady, entitlement?.tier, entitlement?.expiresAt, isAdminSimulation, simulationRole]);

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
    if (!activePost || !user || !membershipReady) {
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
        canComment: Boolean(commentResult.canComment || (
          isAdminSimulation && entitlement?.active && commentResult.allowComments
        )),
      });
    }).finally(() => {
      if (current) setCommentsLoading(false);
    });
    return () => { current = false; };
  }, [activePost?.slug, user?.$id, membershipReady, isAdminSimulation, entitlement?.active]);

  const openAuth = (nextMode) => {
    if (nextMode === "register") trackConversion("registration_started");
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

  const run = async (work, success, nextModal, onSuccess) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await work();
      if (onSuccess) await onSuccess(result);
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
      if (nextModal === "account" && newsletterIntent) setDashboardTab("newsletter");
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
    }), t.registrationSent, "account", () => trackConversion("registration_completed"));
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
    if (isAdminSimulation) {
      exitAdminSimulation();
      return;
    }
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

  const openTierSelection = (tierProducts) => {
    setTierSelection(tierProducts);
    setNotice("");
    setModal("membership");
  };

  const chooseProduct = (product) => {
    setNotice("");
    if (!user) return openAuth("register");
    if (!user.emailVerification || !membershipReady) {
      setNotice(!user.emailVerification
        ? (t.emailRequired || (language === "de" ? "Bitte bestätige zuerst deine E-Mail-Adresse." : "Please verify your email address first."))
        : (language === "de" ? "Dein Konto ist derzeit nicht für Bestellungen freigeschaltet." : "Your account is not currently available for orders."));
      setModal("account");
      return;
    }
    setSelectedProduct(product);
    setSepaOrder(null);
    setCheckoutStep("review");
    setCheckoutAccepted(false);
    setDigitalConsentAccepted(false);
    setPaymentView("qr");
    trackConversion("checkout_started");
    setModal("payment");
  };

  const startPayment = async () => {
    setBusy(true);
    setNotice("");
    try {
      const order = await createSepaOrder(selectedProduct.sku, billing, language, {
        termsVersion: "ORDER-2026-10-30-V1",
        digitalContentConsent: digitalConsentAccepted,
        withdrawalAcknowledgement: digitalConsentAccepted,
      });
      trackConversion("order_created");
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
      if (!isAdminSimulation) await registerCurrentDevice();
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
      await updateProfileEmail(email, password, language, profile?.email || email);
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

  const subscribeToNewsletter = async () => {
    const successful = await privacyAction(
      () => subscribeNewsletter(language),
      language === "de"
        ? "Fast geschafft: Bitte bestätige den Newsletter über den Link in deiner E-Mail."
        : "Almost there: confirm the newsletter through the link in your email.",
    );
    if (successful) trackConversion("newsletter_opt_in");
    return successful;
  };

  const unsubscribeFromNewsletter = () => privacyAction(
    () => unsubscribeNewsletter(),
    language === "de"
      ? "Du erhältst keine weiteren Newsletter."
      : "You will not receive further newsletters.",
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

  if (isAdmin && !isAdminSimulation && administrator?.mfa !== true) return <main className="admin-mfa-gate">
    <section className="admin-mfa-gate__panel">
      <div className="admin-mfa-gate__intro">
        <img src="/assets/music/portrait-400.webp" alt="The Order of Shadows" width="1536" height="1536" />
        <div>
          <p className="eyebrow">{language === "de" ? "ADMIN SECURITY" : "ADMIN SECURITY"}</p>
          <h1>{language === "de" ? "Schütze deinen Admin-Zugang" : "Protect your admin access"}</h1>
          <p>{language === "de"
            ? "Für den Zugriff auf sensible Verwaltungsfunktionen ist eine Authenticator-App verpflichtend. Die Einrichtung dauert nur wenige Minuten."
            : "An authenticator app is required before sensitive administration features can be accessed. Setup only takes a few minutes."}</p>
        </div>
      </div>
      <MfaPanel language={language} user={administrator} onUserUpdate={setUser} required />
      <button className="secondary-action" type="button" disabled={busy} onClick={handleAdminLogout}>
        {language === "de" ? "Abmelden" : "Sign out"}
      </button>
    </section>
  </main>;
  if (isAdmin && !isAdminSimulation) return <React.Suspense fallback={<p className="app-loading">{ui.adminRedirect}</p>}>
    <AdminPortal user={administrator} language={language} setLanguage={setLanguage} onLogout={handleAdminLogout} />
  </React.Suspense>;
  if (busy && !user && location.pathname === "/admin") return <p className="app-loading">{ui.adminRedirect}</p>;

  const groupedProducts = Object.keys(tierNames).map((tier) => [tier, products.filter((product) => product.tier === tier)]);

  return <>
    <div className="ember-field" aria-hidden="true" />
    {isAdminSimulation && <aside className="admin-simulation-toolbar" role="status">
      <div><span>ADMIN · {language === "de" ? "SCHREIBGESCHÜTZTE PRODUKTIVANSICHT" : "READ-ONLY PRODUCTION VIEW"}</span><strong>{simulationRole.replace("EXCLUSIVE_", "Order ")}</strong></div>
      <label><span>{language === "de" ? "Perspektive" : "Perspective"}</span><select value={simulationRole} onChange={(event) => startAdminSimulation(event.target.value)}><option value="GUEST">Guest</option><option value="REGISTERED">Registered · Email pending</option><option value="FREE">Verified email · Free Preview</option><option value="EXCLUSIVE_BASIC">Exclusive Basic</option><option value="EXCLUSIVE_PREMIUM">Exclusive Premium</option><option value="EXCLUSIVE_VIP">Exclusive VIP</option></select></label>
      <button className="secondary-action" type="button" onClick={exitAdminSimulation}>{language === "de" ? "Zurück zum Adminbereich" : "Back to admin"}</button>
    </aside>}
    <a className="order-skip-link" href="#main">{language === "de" ? "Zum Inhalt" : "Skip to content"}</a>
    <header className={`order-header${isAdminSimulation ? " admin-simulation-header" : ""}`}>
      <a className="order-brand" href="https://jason-shadow.com/" aria-label="Jason Shadow — music website"><span className="order-brand-symbol"><img src="/assets/music/logo.png" width="1774" height="887" alt="" /></span><span className="order-brand-copy">Jason Shadow<small>THE ORDER OF SHADOWS</small></span></a>
      <nav className="order-nav" aria-label={t.navigation}><a href={user ? "#member-gallery" : "#experience"}>{language === "de" ? (user ? "Beiträge" : "Der Orden") : (user ? "Member feed" : "The Order")}</a><a href="#pricing">{language === "de" ? "Mitgliedschaften" : "Memberships"}</a>{!user && <a href="#questions">FAQ</a>}</nav>
      <div className="order-header-actions"><div className="language-switcher" aria-label={language === "de" ? "Sprache" : "Language"}>{["de", "en"].map((lang) => <button className={`language-button${lang === language ? " is-active" : ""}`} aria-pressed={lang === language} type="button" onClick={() => setLanguage(lang)} key={lang}>{lang.toUpperCase()}</button>)}</div><button className="secondary-action header-link" type="button" onClick={() => user ? setModal("account") : openAuth("login")}>{user ? t.account : t.login}</button></div>
    </header>
    <main id="main" className="order-main">
      {user ? <>
        <section className="hero adult-hero member-hero">
          <div className="hero-media" aria-hidden="true"><img src="/assets/music/portrait-800.webp" alt="" width="1536" height="652" decoding="async" fetchPriority="high" /><div className="hero-media__shade" /></div>
          <div className="hero-content adult-hero__content">
            <img className="avatar hero-avatar" src="/assets/music/portrait-400.webp" alt="The Order of Shadows" width="1536" height="1536" decoding="async" />
            <p className="eyebrow">{language === "de" ? "DEIN PRIVATER BEREICH" : "YOUR PRIVATE SPACE"}</p>
            <h1>{language === "de" ? `Willkommen, ${user.name || "du"}` : `Welcome, ${user.name || "you"}`}</h1>
            <p className="tagline">{membershipReady ? (entitlement?.active ? (language === "de" ? "Danke, dass du meine Musik und Sprecherarbeit unterstützt. Deine Beiträge und Vorteile warten auf dich." : "Thank you for supporting my music and voice work. Explore your posts and membership benefits.") : (language === "de" ? "Dein Platz im Orden beginnt hier. Entdecke die Beiträge und wähle deine Mitgliedschaft." : "Your place in the Order starts here. Explore the feed and choose your membership.")) : (language === "de" ? "Bestätige deine E-Mail-Adresse, um deine Mitgliedschaft zu starten." : "Verify your email address to get your membership started.")}</p>
            <div className="member-status-row">
              <span className={entitlement?.active ? "status-chip is-active membership-status-chip" : "status-chip membership-status-chip"}>{entitlement?.active && <MembershipMark tier={entitlement.tier} />}{entitlement?.active ? `Order ${entitlement.tier.replace("EXCLUSIVE_", "")}` : (language === "de" ? "Free Preview" : "Free Preview")}</span>
            </div>
            <div className="hero-actions">
              {membershipReady ? <a className="primary-action" href="#member-gallery">{language === "de" ? "Beiträge entdecken" : "Discover posts"}</a> : <button className="primary-action" type="button" onClick={() => run(() => resendVerification(language), t.verificationSent)}>{t.resendVerification}</button>}
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
            {activePost && <div className={`post-carousel${activeGalleryGroup.tier === "FREE" ? "" : " paid-membership-gallery"}`} aria-roledescription="carousel" aria-label={`${galleryTierLabel(activeGalleryGroup.tier, language)} ${language === "de" ? "Beiträge" : "posts"}`}>
              <div className="post-carousel__navigation">
                <button className="post-carousel__arrow is-previous" type="button" disabled={activeGalleryGroup.items.length < 2} onClick={() => movePost(-1)} aria-label={language === "de" ? "Vorheriger Beitrag" : "Previous post"}><span>←</span></button>
                <div className="post-carousel__progress" aria-live="polite">
                  <span>{galleryTierLabel(activeGalleryGroup.tier, language)}</span>
                  <strong>{normalizedPostIndex + 1} / {activeGalleryGroup.items.length}</strong>
                </div>
                <button className="post-carousel__arrow is-next" type="button" disabled={activeGalleryGroup.items.length < 2} onClick={() => movePost(1)} aria-label={language === "de" ? "Nächster Beitrag" : "Next post"}><span>→</span></button>
              </div>
              <div className="post-carousel__slide" key={activePost.slug}>
                <CreatorPost item={activePost} media={mediaBySlug[activePost.slug]} language={language} viewerMark={activeGalleryGroup.tier === "FREE" ? null : String(user?.$id || user?.id || "member").slice(0, 8)} />
                <InlineComments
                  item={activePost}
                  comments={comments}
                  commentAccess={commentAccess}
                  commentsLoading={commentsLoading}
                  entitlementTier={entitlement?.active ? entitlement.tier : null}
                  userName={user?.name}
                  language={language}
                  busy={busy}
                  readOnly={isAdminSimulation}
                  onSubmit={submitComment}
                  onDelete={removeComment}
                />
              </div>
            </div>}
          </> : <div className="member-empty-state"><h3>{membershipReady ? ui.noContent : (language === "de" ? "Noch nicht freigeschaltet" : "Not unlocked yet")}</h3><p>{membershipReady ? (language === "de" ? "Sobald neue Beiträge veröffentlicht werden, erscheinen sie direkt hier." : "New posts will appear here as soon as they are published.") : (language === "de" ? "Bitte bestätige zuerst deine E-Mail-Adresse." : "Please verify your email address first.")}</p></div>}
        </section>
        {!entitlement?.active && <section className="section member-unlock-section"><div className="section-heading"><p className="eyebrow">{language === "de" ? "MEHR WARTET AUF DICH" : "MORE AWAITS"}</p><h2>{language === "de" ? "Öffne die nächste Tür" : "Open the next door"}</h2><p>{language === "de" ? "Wähle deinen persönlichen Zugang zu Basic, Premium oder VIP." : "Choose your personal access to Basic, Premium or VIP."}</p></div><LockedGalleryShowcase language={language} signedIn onAction={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} /></section>}
        {orders.some((order) => order.status === "PENDING") && <section className="section pending-order-strip"><div><p className="eyebrow">{language === "de" ? "ZAHLUNG AUSSTEHEND" : "PAYMENT PENDING"}</p><h2>{language === "de" ? "Dein Auftrag wartet auf Zahlung" : "Your order is awaiting payment"}</h2><p>{language === "de" ? "Die Zahlungsdaten und den Verwendungszweck findest du jederzeit in deinen Bestellungen." : "Payment details and remittance information remain available in your orders."}</p></div><button className="secondary-action" type="button" onClick={() => { setDashboardTab("orders"); setModal("account"); }}>{language === "de" ? "Bestellungen ansehen" : "View orders"}</button></section>}
        <section id="pricing" className="section pricing-section"><div className="section-heading"><p className="eyebrow">{ui.pricingEyebrow}</p><h2>{entitlement?.active ? (language === "de" ? "Noch mehr entdecken" : "Discover more") : ui.pricingTitle}</h2><p>{ui.pricingText}</p></div>{catalogError && <p className="form-notice form-notice--error">{ui.catalogUnavailable}</p>}<div className="pricing-grid">{Object.keys(tierNames).map((tier) => [tier, products.filter((product) => product.tier === tier)]).map(([tier, tierProducts]) => tierProducts.length > 0 && <PricingGroup tier={tier} products={tierProducts} language={language} ui={ui} onChoose={openTierSelection} key={tier} />)}</div></section>
      </> : <>
      <OrderLanding language={language} onRegister={() => openAuth("register")} />
      <section id="pricing" className="section pricing-section"><div className="section-heading"><p className="eyebrow">{ui.pricingEyebrow}</p><h2>{ui.pricingTitle}</h2><p>{ui.pricingText}</p></div>{catalogError && <p className="form-notice form-notice--error" role="status">{ui.catalogUnavailable}</p>}<div className="pricing-grid">{groupedProducts.map(([tier, tierProducts]) => tierProducts.length > 0 && <PricingGroup tier={tier} products={tierProducts} language={language} ui={ui} onChoose={openTierSelection} key={tier} />)}{products.length === 0 && ["basic", "premium", "vip"].map((key) => <article className={`pricing-group pricing-group--${key}`} key={key}><p className="eyebrow">{key === "vip" ? "THE INNER CIRCLE" : key === "premium" ? "A CLOSER CONNECTION" : "THE FIRST CHAPTER"}</p><h3>{ui[key]}</h3><p>{ui[`${key}Text`]}</p><p className="order-price-status">{language === "de" ? "Aktuelle Preise werden beim Laden des Katalogs angezeigt." : "Current prices appear when the catalog is available."}</p><button className="membership-card-cta" type="button" onClick={() => openAuth("register")}><span>{language === "de" ? "Kostenloses Konto erstellen" : "Create a free account"}</span><strong>→</strong></button></article>)}</div><p className="order-pricing-note">{language === "de" ? "Deine Mitgliedschaft unterstützt Jasons Musik- und Sprecherarbeit. Sie ist eine bezahlte Mitgliedschaft mit Vorteilen; eine steuerliche Spendenbescheinigung wird nicht ausgestellt." : "Your membership supports Jason’s music and voice work. It is a paid membership with benefits; no charitable donation receipt is issued."}</p></section>
      <OrderClosing language={language} onRegister={() => openAuth("register")} onNewsletter={() => { setNewsletterIntent(true); openAuth("register"); }} />
      </>}
    </main>
    <footer id="legal" className="order-footer"><div><a href="https://jason-shadow.com/" className="order-footer-logo"><img src="/assets/music/logo.png" width="1774" height="887" alt="Jason Shadow — The Healing Shadow" loading="lazy" /></a><p>{language === "de" ? "Musik. Worte. Und die Menschen dahinter." : "Music. Words. And the people behind them."}</p></div><nav aria-label={language === "de" ? "Weitere Informationen" : "More information"}><a href="https://jason-shadow.com/">{language === "de" ? "Zur Musikwebsite" : "Music website"} ↗</a><a href="/linktree/">Links</a><a href="/legal/">{t.legalLink}</a><a href="/datenschutz/">{t.privacy}</a></nav><p className="order-copyright">© {new Date().getFullYear()} Jason Shadow · The Order of Shadows</p></footer>

    {modal === "auth" && <Modal
      title={mode === "register" ? t.createAccount : mode === "login" ? t.welcomeBack : t.reset}
      eyebrow={t.secureAccount}
      onClose={() => setModal(null)}
      t={t}
    >
      {newsletterIntent && <p className="form-notice">{language === "de" ? "Erstelle dein Konto. Den Musik-Newsletter kannst du anschließend unter Newsletter freiwillig abonnieren und per E-Mail bestätigen. Die Registrierung allein meldet dich nicht an." : "Create your account, then choose the music newsletter in Newsletter and confirm it by email. Registering alone does not subscribe you."}</p>}
      <div className="auth-tabs">
        {["login", "register"].map((item) => <button
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
        {mode !== "reset" && <PasswordField
          label={t.password}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
          name="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength="6"
          maxLength="128"
          required
        />}
        {mode === "login" && <button
          className="auth-reset-link"
          type="button"
          onClick={() => { setMode("reset"); setNotice(""); }}
        >{t.forgotPassword}</button>}
        {mode === "register" && <>
          <label className="field">
            <span>{language === "de" ? "Land des gewöhnlichen Aufenthalts" : "Country of residence"}</span>
            <select
              aria-label={language === "de" ? "Land des gewöhnlichen Aufenthalts" : "Country of residence"}
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
              aria-label={language === "de" ? "US-Bundesstaat / Territorium" : "U.S. state / territory"}
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
        {mode === "reset" && <button
          className="auth-back-link"
          type="button"
          onClick={() => { setMode("login"); setNotice(""); }}
        >← {t.backToLogin}</button>}
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

    {modal === "account" && <Modal title={language === "de" ? "Mein Konto" : "My account"} eyebrow={entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "ORDER · ") : "THE ORDER OF SHADOWS"} onClose={() => setModal(null)} t={t} wide>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {isAdminSimulation && <div className="simulation-readonly-note"><strong>{language === "de" ? "Admin-Simulation · schreibgeschützt" : "Admin simulation · read-only"}</strong><span>{language === "de" ? "Kontospezifische Sicherheits- und Datenschutzaktionen sind in dieser Rollenansicht ausgeblendet." : "Account-specific security and privacy actions are hidden in this role view."}</span></div>}
      {!user ? <button className="primary-action" onClick={() => openAuth("login")}>{t.login}</button> : <div className="account-dashboard">
        <div className="dashboard-tabs" role="tablist" aria-label={language === "de" ? "Kontobereiche" : "Account sections"}>
          {[
            ["overview", language === "de" ? "Übersicht" : "Overview"],
            ["profile", language === "de" ? "Meine Daten" : "My data"],
            ["orders", language === "de" ? "Bestellungen" : "Orders"],
            ["access", language === "de" ? "Zugang & Vorteile" : "Access & perks"],
            ["newsletter", "Newsletter"],
            ["devices", language === "de" ? "Geräte" : "Devices"],
            ["security", language === "de" ? "Sicherheit" : "Security"],
            ["privacy", language === "de" ? "Datenschutz" : "Privacy"],
          ].filter(([key]) => !isAdminSimulation || ["overview", "orders", "access"].includes(key)).map(([key, label]) => <button type="button" role="tab" aria-selected={dashboardTab === key} className={dashboardTab === key ? "is-active" : ""} onClick={() => setDashboardTab(key)} key={key}>{label}</button>)}
        </div>
        {dashboardTab === "overview" && <div className="dashboard-overview">
          <div className="dashboard-profile-card"><img src="/assets/music/portrait-400.webp" alt="" /><div><p className="eyebrow">{language === "de" ? "WILLKOMMEN ZURÜCK" : "WELCOME BACK"}</p><h3>{profile?.displayName || user.name || user.email}</h3><p>{user.email}</p></div></div>
          <div className="dashboard-stat-grid">
            <article><span>{language === "de" ? "Kontostatus" : "Account status"}</span><strong>{profile?.status || "EMAIL_PENDING"}</strong></article>
            <article><span>{language === "de" ? "E-Mail-Adresse" : "Email address"}</span><strong>{user.emailVerification ? (language === "de" ? "Bestätigt" : "Verified") : (language === "de" ? "Bestätigung ausstehend" : "Verification pending")}</strong></article>
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
            {membershipReady && <button className="secondary-action" type="button" onClick={openGallery}>{ui.openGallery}</button>}
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
            <PasswordField label={language === "de" ? "Aktuelles Passwort" : "Current password"} showLabel={t.showPassword} hideLabel={t.hidePassword} name="password" autoComplete="current-password" required minLength="6" maxLength="128" />
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
            <dl className="order-facts"><div><dt>{language === "de" ? "Verwendungszweck" : "Remittance information"}</dt><dd className="payment-reference">{order.reference}</dd></div><div><dt>{ui.due}</dt><dd>{new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(order.paymentDueAt))}</dd></div>{order.invoice?.number && <div><dt>{language === "de" ? "Rechnung" : "Invoice"}</dt><dd>{order.invoice.number} · {order.invoice.emailStatus}{order.invoice.copyUrl ? <> · <a href={order.invoice.copyUrl} target="_blank" rel="noreferrer">{language === "de" ? "Kopie öffnen" : "Open copy"}</a></> : null}</dd></div>}</dl>
            {order.status === "PENDING" && <div className="order-actions"><button className="secondary-action" type="button" onClick={() => { setSelectedProduct(products.find((product) => product.sku === order.productSku) || { displayName: order.productName, currency: order.currency, amountMinor: order.amountMinor, durationValue: order.durationValue, durationUnit: order.durationUnit }); setSepaOrder(order); setPaymentView("details"); setModal("payment"); }}>{language === "de" ? "Zahlungsdetails" : "Payment details"}</button><button className="danger-action" type="button" onClick={() => cancelOrder(order)}>{language === "de" ? "Auftrag stornieren" : "Cancel order"}</button></div>}
          </article>) : <div className="member-empty-state"><h3>{language === "de" ? "Noch keine Bestellungen" : "No orders yet"}</h3><p>{language === "de" ? "Deine zukünftigen Zahlungsaufträge erscheinen hier." : "Your future payment orders will appear here."}</p></div>}
        </div>}
        {dashboardTab === "access" && <div className="access-perks">
          <article className="perk-access-card">{entitlement?.active ? <MembershipMark tier={entitlement.tier} /> : <LockIcon />}<div><h3>{entitlement?.active ? entitlement.tier.replace("EXCLUSIVE_", "Order ") : (language === "de" ? "Free Preview" : "Free Preview")}</h3><p>{entitlement?.expiresAt ? `${ui.expires}: ${new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(entitlement.expiresAt))}` : ui.noMembership}</p></div></article>
          {entitlement?.paused && <article className="perk-access-card is-paused"><MembershipMark tier={entitlement.paused.tier} /><div><h3>{entitlement.paused.tier.replace("EXCLUSIVE_", "Order ")} · {language === "de" ? "Pausiert" : "Paused"}</h3><p>{language === "de" ? "Deine verbleibende Laufzeit geht nicht verloren und beginnt wieder am" : "Your remaining term is preserved and resumes on"} {new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(entitlement.paused.resumesAt))}.</p></div></article>}
          {premiumTelegram && <article className="perk-access-card is-private telegram-access-card"><span>↗</span><div><div className="telegram-access-card__heading"><h3>{language === "de" ? "Dein privater Telegram-Kanal" : "Your private Telegram channel"}</h3>{!premiumTelegram.simulated && <span className={`order-status order-status--${String(premiumTelegram.connectionStatus || "not-linked").toLowerCase().replaceAll("_", "-")}`}>{premiumTelegram.active ? (language === "de" ? "AKTIV" : "ACTIVE") : String(premiumTelegram.connectionStatus || "NOT_LINKED").replaceAll("_", " ")}</span>}</div><p>{language === "de" ? "Verbinde dein Telegram-Konto sicher mit deiner aktiven Premium- oder VIP-Membership. Der persönliche Kanal-Link wird erst im Bot erstellt, an genau dein Telegram-Konto gebunden und direkt nach dem Beitritt entwertet." : "Securely link your Telegram account to your active Premium or VIP membership. Your personal channel link is created only inside the bot, bound to your Telegram account and revoked immediately after you join."}</p>{premiumTelegram.simulated ? <small className="simulation-perk-state">{language === "de" ? "In der Produktivansicht für diese Membership freigeschaltet. Geheimwerte werden nicht simuliert." : "Unlocked for this membership in the production view. Secret values are not simulated."}</small> : <><p className="telegram-privacy-note">{language === "de" ? "Datensparsam: gespeichert werden nur Telegram-Konto-ID, Zugangsstatus und notwendige Zeitpunkte – keine Chats, Profilbilder oder Telegram-Benutzernamen." : "Data-minimised: only the Telegram account ID, access status and required timestamps are stored—never chats, profile photos or Telegram usernames."}</p>{premiumTelegram.active ? <small className="simulation-perk-state">{language === "de" ? "Sicher verbunden. Bei Ablauf deiner Membership wird der Kanalzugang automatisch entfernt." : "Securely connected. Channel access is removed automatically when your membership ends."}</small> : <button className="primary-action" type="button" disabled={busy || premiumTelegram.connectionStatus === "ADMIN_SUSPENDED"} onClick={connectTelegram}>{premiumTelegram.linked ? (language === "de" ? "Zugang in Telegram öffnen" : "Open access in Telegram") : (language === "de" ? "Telegram sicher verbinden" : "Securely connect Telegram")}</button>}</>}</div></article>}
          {vipWhatsapp && <article className="perk-access-card is-vip"><span>VIP</span><div><h3>{language === "de" ? "Meine private WhatsApp-Nummer" : "My private WhatsApp number"}</h3>{vipWhatsapp.simulated ? <small className="simulation-perk-state">{language === "de" ? "In der VIP-Produktivansicht freigeschaltet; Geheimwerte werden in der Simulation nicht ausgegeben." : "Unlocked in the VIP production view; secret values are not exposed in simulation."}</small> : <><p>{vipWhatsapp.phoneNumber}</p><a className="primary-action" href={vipWhatsapp.whatsappUrl} target="_blank" rel="noreferrer">{language === "de" ? "WhatsApp öffnen" : "Open WhatsApp"}</a></>}</div></article>}
          {!premiumTelegram && !vipWhatsapp && entitlement?.active && <p className="upload-note">{language === "de" ? "Deine laufzeitabhängigen Vorteile werden hier automatisch freigeschaltet." : "Term-specific benefits unlock here automatically."}</p>}
        </div>}
        {dashboardTab === "newsletter" && <section className="privacy-card privacy-card--newsletter">
          <p className="eyebrow">THE ORDER OF SHADOWS · NEWSLETTER</p><h3>{language === "de" ? "Post aus meiner Musikwelt." : "A note from my world of music."}</h3>
          <p>{language === "de" ? "Musik, Sprecherprojekte und Einblicke hinter die Kulissen — nur wenn du sie möchtest. Deine Mitgliedschaft und dein Newsletter-Abo sind unabhängig voneinander." : "Music, voice projects and stories behind the scenes — only if you want them. Your membership and newsletter subscription are independent."}</p>
          <p role="status">{privacyLoading ? (language === "de" ? "Einstellungen werden geladen …" : "Loading preferences …") : privacy?.newsletter?.status === "SUBSCRIBED" ? (language === "de" ? "Aktiv und per E-Mail bestätigt" : "Subscribed and confirmed by email") : privacy?.newsletter?.status === "PENDING" ? (language === "de" ? "Deine E-Mail-Bestätigung steht noch aus." : "Your email confirmation is still pending.") : (language === "de" ? "Nicht abonniert" : "Not subscribed")}</p>
          {!privacyLoading && (privacy?.newsletter?.status === "SUBSCRIBED" ? <button className="secondary-action" type="button" disabled={busy} onClick={unsubscribeFromNewsletter}>{language === "de" ? "Newsletter abbestellen" : "Unsubscribe"}</button> : <button className="primary-action" type="button" disabled={busy || !user.emailVerification || !privacy?.profile?.complete} onClick={subscribeToNewsletter}>{privacy?.newsletter?.status === "PENDING" ? (language === "de" ? "Bestätigung erneut anfordern" : "Resend confirmation") : (language === "de" ? "Musik-Newsletter abonnieren" : "Subscribe to the music newsletter")}</button>)}
          {!privacyLoading && !privacy?.profile?.complete && <p>{language === "de" ? "Vervollständige zuerst dein Datenschutzprofil." : "Complete your privacy profile first."} <button className="text-button" type="button" onClick={() => setDashboardTab("privacy")}>{language === "de" ? "Einstellungen öffnen" : "Open settings"}</button></p>}
          <p className="privacy-fineprint">{language === "de" ? "Mit deiner Anmeldung forderst du eine Bestätigungs-E-Mail an. Erst mit dem Bestätigungslink wird dein Abo aktiv. Abmelden kannst du dich jederzeit über den Link in jeder Ausgabe." : "Subscribing requests a confirmation email. Your subscription starts only after you click its confirmation link. Unsubscribe at any time using the link in every edition."}</p>
        </section>}
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
          onSubscribeNewsletter={subscribeToNewsletter}
          onUnsubscribeNewsletter={unsubscribeFromNewsletter}
          onExport={downloadPrivacyData}
          onCreateRequest={submitPrivacyRequest}
          onCancelRequest={withdrawPrivacyRequest}
          onDeleteAccount={deleteAccountFromPrivacyCenter}
        />}
        <div className="dashboard-footer-actions"><a className="secondary-action button-link" href="#pricing" onClick={() => setModal(null)}>{ui.pricingTitle}</a><button className="text-button" onClick={handleLogout}>{isAdminSimulation ? (language === "de" ? "Simulation beenden" : "Exit simulation") : ui.logout}</button></div>
      </div>}
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
