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
    metaTitle: "Jason Shadow | Offizielle Links",
    metaDescription: "Jason Shadow — offizielle Links zu Musik, Social Media und Projekten.",
    eyebrow: "Offizielle Links",
    tagline: "Musik, Projekte und offizielle Updates – alles an einem Ort.",
    aiNotice: "Das Profilbild wurde teilweise mit KI-Technologie digital optimiert.",
    website: "Offizielle Website",
    exclusive: "Exclusive Content 🔞",
    openSite: "Website öffnen",
  },
  en: {
    metaTitle: "Jason Shadow | Official Links",
    metaDescription: "Jason Shadow — official music, social and project links.",
    eyebrow: "Official links",
    tagline: "Music, projects and official updates — all in one place.",
    aiNotice: "The profile image was digitally enhanced in part using AI technology.",
    website: "Official website",
    exclusive: "Exclusive Content 🔞",
    openSite: "Open website",
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
