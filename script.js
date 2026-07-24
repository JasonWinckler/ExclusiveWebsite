const animatedElements = document.querySelectorAll('[data-animate]');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });

  animatedElements.forEach((element) => observer.observe(element));
} else {
  animatedElements.forEach((element) => element.classList.add('is-visible'));
}

const languageStorageKey = 'jason-shadow-membership-language';
const supportedLanguages = ['de', 'en'];

const getInitialLanguage = () => {
  const storedLanguage = window.localStorage.getItem(languageStorageKey);
  if (supportedLanguages.includes(storedLanguage)) return storedLanguage;

  const browserLanguage = navigator.language?.slice(0, 2).toLowerCase();
  return supportedLanguages.includes(browserLanguage) ? browserLanguage : 'en';
};

const applyTranslations = (language) => {
  const translations = window.SiteTranslations?.[language] || window.SiteTranslations?.en || {};
  document.documentElement.lang = language;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (translations[key]) element.textContent = translations[key];
  });

  document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
    element.dataset.i18nAttr.split(',').forEach((instruction) => {
      const [attribute, key] = instruction.split(':').map((part) => part.trim());
      if (attribute && key && translations[key]) element.setAttribute(attribute, translations[key]);
    });
  });

  if (translations.metaTitle) document.title = translations.metaTitle;

  document.querySelectorAll('[data-lang]').forEach((button) => {
    const isActive = button.dataset.lang === language;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
};

document.querySelectorAll('[data-lang]').forEach((button) => {
  button.addEventListener('click', () => {
    const language = button.dataset.lang;
    if (!supportedLanguages.includes(language)) return;
    window.localStorage.setItem(languageStorageKey, language);
    applyTranslations(language);
  });
});

applyTranslations(getInitialLanguage());
