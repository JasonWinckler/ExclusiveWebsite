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
    metaTitle: "Shadow’s Temptation | Offizielle Creator Links",
    metaDescription: "Shadow’s Temptation — Verlangen, Versuchung und alle offiziellen Creator Links an einem Ort.",
    eyebrow: "Offizielle Creator Links",
    tagline: "Wo Verlangen zur Versuchung wird.",
    exclusive: "Exclusive Content 🔞",
    openSite: "Website öffnen",
    support: "Unterstützen & spenden",
    paypalDonation: "PayPal-Spende",
  },
  en: {
    metaTitle: "Shadow’s Temptation | Official Creator Links",
    metaDescription: "Shadow’s Temptation — desire, temptation and all official creator links in one place.",
    eyebrow: "Official creator links",
    tagline: "Where desire becomes temptation.",
    exclusive: "Exclusive Content 🔞",
    openSite: "Open website",
    support: "Support & donate",
    paypalDonation: "PayPal donation",
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

const paypalButton = document.querySelector("[data-paypal-open]");
const paypalHostedButtonId = "U87BSM6V2TXLC";
const paypalDonationUrl = `https://www.paypal.com/donate/?hosted_button_id=${paypalHostedButtonId}`;

const openPaypalDonation = () => {
  const popupWidth = Math.min(560, window.screen.availWidth || 560);
  const popupHeight = Math.min(760, window.screen.availHeight || 760);
  const left = Math.max(0, Math.round(((window.screen.availWidth || popupWidth) - popupWidth) / 2));
  const top = Math.max(0, Math.round(((window.screen.availHeight || popupHeight) - popupHeight) / 2));
  const donationPopup = window.open(
    "about:blank",
    "shadowTemptationPaypalDonation",
    `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top}`,
  );
  if (!donationPopup) {
    window.location.assign(paypalDonationUrl);
    return;
  }
  donationPopup.opener = null;
  donationPopup.location.replace(paypalDonationUrl);
  donationPopup.focus();
};

paypalButton?.addEventListener("click", openPaypalDonation);
