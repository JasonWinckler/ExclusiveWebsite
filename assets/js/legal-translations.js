(() => {
  const storageKey = "jason-shadow-membership-language";
  const saved = localStorage.getItem(storageKey);
  let language = saved === "de" || saved === "en"
    ? saved
    : (navigator.language || "").toLowerCase().startsWith("de") ? "de" : "en";

  const applyLanguage = (nextLanguage) => {
    language = nextLanguage === "de" ? "de" : "en";
    localStorage.setItem(storageKey, language);
    document.documentElement.lang = language;
    document.querySelectorAll("[data-copy-lang]").forEach((element) => {
      element.hidden = element.dataset.copyLang !== language;
    });
    document.querySelectorAll("[data-lang]").forEach((button) => {
      const active = button.dataset.lang === language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });

  applyLanguage(language);
})();
