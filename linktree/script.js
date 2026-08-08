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
    supportEyebrow: "Ein kleiner Funke",
    supportTitle: "Shadow’s Temptation unterstützen",
    supportBody: "Mit deiner freiwilligen Unterstützung machst du neue Erlebnisse und besondere Momente möglich.",
    openPaypal: "PayPal öffnen",
    paypalTrust: "Sichere Zahlungsabwicklung durch PayPal.",
    closeDonation: "Spendenfenster schließen",
    donateWithPaypal: "Mit PayPal spenden",
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
    supportEyebrow: "A little spark",
    supportTitle: "Support Shadow’s Temptation",
    supportBody: "Your voluntary support helps create new experiences and special moments.",
    openPaypal: "Open PayPal",
    paypalTrust: "Secure payment processing by PayPal.",
    closeDonation: "Close donation dialog",
    donateWithPaypal: "Donate with PayPal",
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
const paypalButton = document.querySelector("[data-paypal-open]");
const paypalModal = document.querySelector("[data-paypal-modal]");
const paypalDialog = paypalModal?.querySelector("[role='dialog']");
const paypalFallback = document.querySelector("[data-paypal-fallback]");
const paypalCloseButton = paypalModal?.querySelector(".donation-modal__close");
let paypalReturnFocus = null;

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
      }).render("#donate-button");
      const officialButton = container.querySelector("img, input[type='image'], button");
      if (officialButton) {
        officialButton.setAttribute("role", "button");
        officialButton.setAttribute("tabindex", "0");
        officialButton.dataset.linktreeI18nAria = "donateWithPaypal";
        officialButton.setAttribute(
          "aria-label",
          translations[document.documentElement.lang]?.donateWithPaypal || translations.en.donateWithPaypal,
        );
        officialButton.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          officialButton.click();
        });
        if (paypalFallback) paypalFallback.hidden = true;
      }
    } catch {
      if (paypalFallback) paypalFallback.hidden = false;
    }
  }
};

const openPaypalModal = () => {
  if (!paypalModal) return;
  paypalReturnFocus = document.activeElement;
  paypalModal.hidden = false;
  document.body.classList.add("modal-open");
  paypalCloseButton?.focus({ preventScroll: true });
};

const closePaypalModal = () => {
  if (!paypalModal || paypalModal.hidden) return;
  paypalModal.hidden = true;
  document.body.classList.remove("modal-open");
  if (paypalReturnFocus instanceof HTMLElement) paypalReturnFocus.focus({ preventScroll: true });
};

paypalModal?.querySelectorAll("[data-paypal-close]").forEach((element) => {
  element.addEventListener("click", closePaypalModal);
});

paypalModal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closePaypalModal();
    return;
  }
  if (event.key !== "Tab" || !paypalDialog) return;

  const focusable = [...paypalDialog.querySelectorAll(
    "a[href]:not([hidden]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

if (window.PayPal?.Donation?.Button || document.readyState === "complete") {
  renderPaypalDonationButton();
} else {
  window.addEventListener("load", renderPaypalDonationButton, { once: true });
}

paypalButton?.addEventListener("click", openPaypalModal);
