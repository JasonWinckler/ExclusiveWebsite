import React, { useEffect, useMemo, useState } from "react";
import { verifyAppwriteConnection } from "./lib/appwrite";

const languageKey = "jason-shadow-membership-language";
const initialLanguage = () => {
  const stored = localStorage.getItem(languageKey);
  if (["de", "en"].includes(stored)) return stored;
  return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
};

function Tier({ title, badge, text, featured = false, children }) {
  return <article className={`tier-card${featured ? " tier-card--featured" : ""}`}><h3>{title}</h3><strong>{badge}</strong><p>{text}</p>{children}</article>;
}

function LockedCard({ t, exclusive = false }) {
  return <article className="locked-card">
    <div className={`locked-preview${exclusive ? " locked-preview--exclusive" : ""}`} aria-hidden="true"><span className="lock-icon">🔒</span></div>
    <h3>{t.lockedTitle}</h3><p>{exclusive ? t.exclusiveText : t.lockedText}</p>
    {exclusive ? <div className="hero-actions"><a className="primary-action" href="#pending">{t.register}</a><a className="secondary-action" href="#membership">{t.viewMembership}</a></div> : <a className="primary-action" href="#pending">{t.lockedCta}</a>}
  </article>;
}

function App() {
  const [language, setLanguage] = useState(initialLanguage);
  const t = useMemo(() => window.SiteTranslations?.[language] ?? window.SiteTranslations.en, [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.metaTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", t.metaDescription);
    localStorage.setItem(languageKey, language);
  }, [language, t]);

  useEffect(() => {
    verifyAppwriteConnection();
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll("[data-animate]");
    if (!("IntersectionObserver" in window)) { elements.forEach((el) => el.classList.add("is-visible")); return undefined; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: 0.16 });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return <>
    <div className="ember-field" aria-hidden="true" />
    <header className="exclusive-header" data-animate="rise">
      <a className="brand" href="#top">{t.brand}</a>
      <nav className="main-nav desktop-nav" aria-label="Site navigation"><a href="#profile">{t.navProfile}</a><a href="#free">{t.navFree}</a><a href="#exclusive">{t.navExclusive}</a><a href="#pending">{t.navPending}</a><a href="#legal">{t.navLegal}</a></nav>
      <div className="header-actions"><div className="language-switcher" aria-label="Language selector">{["de", "en"].map((lang) => <button className={`language-button${language === lang ? " is-active" : ""}`} type="button" aria-pressed={language === lang} onClick={() => setLanguage(lang)} key={lang}>{lang.toUpperCase()}</button>)}</div><a className="secondary-action header-link" href="#pending">{t.login}</a><a className="header-cta" href="#exclusive">{t.heroCta}</a></div>
    </header>
    <main id="top">
      <section id="profile" className="hero adult-hero" data-animate="rise"><div className="hero-media" aria-hidden="true"><img src="/linktree/uploads/banner.png" width="1536" height="652" alt="" fetchPriority="high" /><div className="hero-media__shade" /></div><div className="hero-content adult-hero__content"><img className="avatar" src="/linktree/uploads/profile.png" width="1536" height="1536" alt="Jason Shadow promotional portrait" /><p className="eyebrow">{t.adultsOnly}</p><h1>{t.heroTitle}</h1><p className="tagline">{t.heroText}</p><p className="ai-disclosure">{t.aiNotice}</p><div className="hero-actions"><a className="primary-action" href="#pending">{t.register}</a><a className="secondary-action" href="#membership">{t.viewMembership}</a></div><div className="hero-lock-showcase" aria-label="Locked exclusive content preview"><div className="locked-preview locked-preview--hero locked-preview--alt"><span className="lock-icon">🔒</span></div><div><h2>{t.exclusiveHeading}</h2><p>{t.exclusiveText}</p></div></div></div></section>
      <section id="backend" className="section backend-section" data-animate="rise"><div className="section-heading"><p className="eyebrow">BACKEND READY · FAIL CLOSED</p><h2>{t.backendHeading}</h2><p>{t.backendText}</p></div><div className="tier-list"><Tier title={t.backendAuthTitle} badge="USER / ADMIN" text={t.backendAuthText} /><Tier title={t.backendAvsTitle} badge="DISABLED" text={t.backendAvsText} featured /><Tier title={t.backendPaymentsTitle} badge="PREPARED" text={t.backendPaymentsText} /></div></section>
      <section id="membership" className="section membership-section" data-animate="rise"><div className="section-heading"><p className="eyebrow">{t.profileEyebrow}</p><h2>{t.brand}</h2><p>{t.bio}</p></div><div className="tier-list"><Tier title={t.tierFreeTitle} badge="FREE" text={t.tierFreeText} /><Tier title={t.tierExclusiveTitle} badge="30 / 90 / 365" text={t.tierExclusiveText} featured><a className="primary-action" href="#pending">{t.viewMembership}</a></Tier><Tier title={t.tierSafetyTitle} badge="FAIL CLOSED" text={t.tierSafetyText} /></div></section>
      <section id="free" className="section preview-section" data-animate="rise"><div className="section-heading"><p className="eyebrow">FREE ≠ PUBLIC</p><h2>{t.freeHeading}</h2></div><div className="locked-grid"><LockedCard t={t} /><LockedCard t={t} /><LockedCard t={t} /></div></section>
      <section id="exclusive" className="section preview-section" data-animate="rise"><div className="section-heading"><p className="eyebrow">PAID ACCESS</p><h2>{t.exclusiveHeading}</h2><p>{t.exclusiveText}</p></div><div className="locked-grid locked-grid--wide"><LockedCard t={t} exclusive /></div></section>
      <section id="pending" className="section pending-section" data-animate="rise"><div className="section-heading"><p className="eyebrow">EMAIL_PENDING → PENDING_AGE_VERIFICATION</p><h2>{t.pendingHeading}</h2><p>{t.pendingMain}</p><p>{t.pendingSub}</p></div><div className="status-panel"><dl><div><dt>{t.statusLabel}</dt><dd>{t.statusValue}</dd></div><div><dt>{t.emailLabel}</dt><dd>pending@example.invalid</dd></div><div><dt>{t.avsLabel}</dt><dd>{t.avsValue}</dd></div></dl><div className="hero-actions"><button className="primary-action" disabled>{t.avsStart}</button><button className="secondary-action" disabled>{t.avsContinue}</button><button className="secondary-action" disabled>{t.cancelRequest}</button></div></div></section>
    </main>
    <footer id="legal" className="site-footer legal-footer"><p>{t.footerNotice}</p><nav aria-label="Legal links"><a href="/legal/">{t.legalLink}</a></nav></footer>
  </>;
}

export default App;
