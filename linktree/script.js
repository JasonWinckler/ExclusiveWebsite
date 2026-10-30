const animatedElements = document.querySelectorAll("[data-animate]");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    });
  }, { threshold: 0.2 });
  animatedElements.forEach((element) => observer.observe(element));
} else {
  animatedElements.forEach((element) => element.classList.add("is-visible"));
}

const languageStorageKey = "jason-shadow-membership-language";
const supportedLanguages = ["de", "en"];
const translations = {
  de: {
    metaTitle: "Jason Shadow | Exklusive Mitgliedschaft & offizielle Links",
    metaDescription: "Musik, Stimme und Community. Jason Shadows Musikwebsite, Unterstützer-Mitgliedschaft und offizielle Links.",
    eyebrow: "Musik · Stimme · Community",
    tagline: "Unterstütze die Musik. Sei Teil der Geschichte.",
    exclusive: "Mitglied werden",
    openSite: "Mitgliedschaft entdecken",
    musicSite: "Musik- und Sprecherwebsite",
    support: "Meine Arbeit unterstützen",
    paypalDonation: "Einmaliger Beitrag über PayPal",
    supportNote: "Ein PayPal-Beitrag unterstützt mein Unternehmen und schaltet keine Mitgliedschaft frei. Er wird nicht als steuerlich abzugsfähige gemeinnützige Spende angeboten.",
    privacy: "Datenschutz",
  },
  en: {
    metaTitle: "Jason Shadow | Exclusive Membership & official links",
    metaDescription: "Music, voice and community. Jason Shadow’s music website, supporter membership and official links.",
    eyebrow: "Music · Voice · Community",
    tagline: "Support the music. Be part of the story.",
    exclusive: "Join the Shadows",
    openSite: "Explore the membership",
    musicSite: "Music & voice website",
    support: "Support my work",
    paypalDonation: "One-time contribution via PayPal",
    supportNote: "A PayPal contribution supports my business and does not activate a membership. It is not offered as a tax-deductible charitable donation.",
    privacy: "Privacy",
  },
};
const storedLanguage = window.localStorage.getItem(languageStorageKey);
const initialLanguage = supportedLanguages.includes(storedLanguage)
  ? storedLanguage
  : (navigator.language.startsWith("de") ? "de" : "en");

const applyTranslations = (language) => {
  const copy = translations[language] || translations.en;
  document.documentElement.lang = language;
  document.title = copy.metaTitle;
  const description = document.querySelector("[data-meta-description]");
  if (description) description.setAttribute("content", copy.metaDescription);
  document.querySelectorAll("[data-linktree-i18n]").forEach((element) => {
    const value = copy[element.dataset.linktreeI18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll("[data-linktree-i18n-aria]").forEach((element) => {
    const value = copy[element.dataset.linktreeI18nAria];
    if (value) element.setAttribute("aria-label", value);
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
};

document.querySelectorAll("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    const language = button.dataset.lang;
    if (!supportedLanguages.includes(language)) return;
    window.localStorage.setItem(languageStorageKey, language);
    applyTranslations(language);
  });
});
applyTranslations(initialLanguage);

const paypalHostedButtonId = "U87BSM6V2TXLC";
const paypalDonationUrl = `https://www.paypal.com/donate/?hosted_button_id=${paypalHostedButtonId}`;
const paypalButton = document.querySelector("[data-paypal-open]");
const paypalPageBlur = document.querySelector("[data-paypal-page-blur]");
let paypalDonationActive = false;
let paypalStartedAt = 0;
let paypalOverlayObserved = false;

const setPaypalDonationActive = (active) => {
  paypalDonationActive = active;
  if (!active) paypalOverlayObserved = false;
  document.body.classList.toggle("paypal-donation-active", active);
  if (paypalPageBlur) paypalPageBlur.hidden = !active;
};

const getOfficialPaypalButton = () => document.querySelector(
  "#donate-button-container #donate-button img, "
  + "#donate-button-container #donate-button input[type='image'], "
  + "#donate-button-container #donate-button button",
);

const renderPaypalDonationButton = () => {
  const container = document.querySelector("#donate-button");
  if (!container) return;

  if (window.PayPal?.Donation?.Button) {
    try {
      window.PayPal.Donation.Button({
        env: "production",
        hosted_button_id: paypalHostedButtonId,
        image: {
          src: "https://www.paypalobjects.com/en_US/DK/i/btn/btn_donateCC_LG.gif",
          alt: "Donate with PayPal button",
          title: "PayPal - The safer, easier way to pay online!",
        },
        onComplete: () => setPaypalDonationActive(false),
      }).render("#donate-button");
    } catch {
      // The visible CTA falls back to PayPal's hosted donation page.
    }
  }
};

const startPaypalDonation = () => {
  if (paypalDonationActive) return;
  const officialButton = getOfficialPaypalButton();
  if (!officialButton) {
    window.location.assign(paypalDonationUrl);
    return;
  }

  paypalStartedAt = Date.now();
  setPaypalDonationActive(true);
  officialButton.click();
};

const clearPaypalBlurAfterReturn = () => {
  if (!paypalDonationActive || Date.now() - paypalStartedAt < 500) return;
  window.setTimeout(() => setPaypalDonationActive(false), 180);
};

window.addEventListener("focus", clearPaypalBlurAfterReturn);
window.addEventListener("pageshow", () => setPaypalDonationActive(false));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") clearPaypalBlurAfterReturn();
});

const paypalOverlayObserver = new MutationObserver(() => {
  const overlayExists = Boolean(document.querySelector(".paypal-checkout-sandbox"));
  if (overlayExists) {
    paypalOverlayObserved = true;
  } else if (paypalDonationActive && paypalOverlayObserved && document.hasFocus()) {
    setPaypalDonationActive(false);
  }
});
paypalOverlayObserver.observe(document.body, { childList: true, subtree: true });

if (window.PayPal?.Donation?.Button || document.readyState === "complete") {
  renderPaypalDonationButton();
} else {
  window.addEventListener("load", renderPaypalDonationButton, { once: true });
}

paypalButton?.addEventListener("click", startPaypalDonation);
