import React, { useEffect, useMemo, useState } from "react";
import {
  completeEmailVerification, completePasswordReset, getAgeVerification, getCurrentUser, getMemberProfile,
  login, logout, registerAccount, requestPasswordReset, resendVerification, submitAgeVerification,
} from "./lib/appwrite";

const languageKey = "jason-shadow-membership-language";
const initialLanguage = () => localStorage.getItem(languageKey) || (navigator.language?.startsWith("de") ? "de" : "en");
const messageFor = (error, t) => error?.message === "AGE_REQUIREMENT_NOT_MET" ? t.ageRejected : error?.message === "AGE_REQUEST_EXISTS" ? t.ageExists : (error?.message || t.genericError);

function Field({ label, ...props }) { return <label className="form-field"><span>{label}</span><input {...props} /></label>; }
function Tier({ title, badge, text, featured }) { return <article className={`tier-card${featured ? " tier-card--featured" : ""}`}><h3>{title}</h3><strong>{badge}</strong><p>{text}</p></article>; }
function LockedCard({ t }) { return <article className="locked-card"><div className="locked-preview" aria-hidden="true"><span className="lock-icon">🔒</span></div><h3>{t.lockedTitle}</h3><p>{t.lockedText}</p><a className="primary-action" href="#account">{t.lockedCta}</a></article>; }

function App() {
  const [language, setLanguage] = useState(initialLanguage);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ageRequest, setAgeRequest] = useState(null);
  const [mode, setMode] = useState("login");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const t = useMemo(() => window.SiteTranslations?.[language] || window.SiteTranslations.en, [language]);

  const refresh = async () => {
    const current = await getCurrentUser();
    setUser(current);
    if (current) {
      const [member, age] = await Promise.all([getMemberProfile(current.$id), getAgeVerification(current.$id)]);
      setProfile(member); setAgeRequest(age);
    } else { setProfile(null); setAgeRequest(null); }
  };

  useEffect(() => {
    document.documentElement.lang = language; document.title = t.metaTitle; localStorage.setItem(languageKey, language);
  }, [language, t]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("action"), userId = params.get("userId"), secret = params.get("secret");
    (async () => {
      try {
        if (action === "verify-email" && userId && secret) { await completeEmailVerification(userId, secret); setNotice(t.emailVerified); history.replaceState({}, "", "/#account"); }
        if (action === "recover" && userId && secret) setMode("recover");
        await refresh();
      } catch (error) { setNotice(messageFor(error, t)); } finally { setBusy(false); }
    })();
  }, []);

  const run = async (work, success) => { setBusy(true); setNotice(""); try { await work(); await refresh(); setNotice(success); } catch (error) { setNotice(messageFor(error, t)); } finally { setBusy(false); } };
  const handleAuth = (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === "register") run(() => registerAccount(data), t.registrationSent);
    else if (mode === "reset") run(() => requestPasswordReset(data.email), t.resetSent);
    else if (mode === "recover") { const p = new URLSearchParams(location.search); run(() => completePasswordReset(p.get("userId"), p.get("secret"), data.password), t.passwordChanged); }
    else run(() => login(data.email, data.password), t.loginSuccess);
  };
  const handleAge = (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); run(() => submitAgeVerification(user, data), t.ageSubmitted); };

  const status = ageRequest?.status || profile?.ageVerificationStatus || (user ? "NOT_STARTED" : "SIGNED_OUT");
  return <>
    <div className="ember-field" aria-hidden="true" />
    <header className="exclusive-header"><a className="brand" href="#top">{t.brand}</a><nav className="main-nav desktop-nav" aria-label={t.navigation}><a href="#profile">{t.navProfile}</a><a href="#membership">{t.navExclusive}</a><a href="#account">{t.account}</a><a href="#legal">{t.navLegal}</a></nav><div className="header-actions"><div className="language-switcher">{["de", "en"].map(lang => <button className={`language-button${lang === language ? " is-active" : ""}`} type="button" onClick={() => setLanguage(lang)} key={lang}>{lang.toUpperCase()}</button>)}</div>{user ? <button className="secondary-action header-link" onClick={() => run(logout, t.logoutSuccess)}>{t.logout}</button> : <a className="secondary-action header-link" href="#account">{t.login}</a>}</div></header>
    <main id="top">
      <section id="profile" className="hero adult-hero"><div className="hero-media" aria-hidden="true"><img src="/linktree/uploads/banner.png" alt="" /><div className="hero-media__shade" /></div><div className="hero-content adult-hero__content"><img className="avatar" src="/linktree/uploads/profile.png" alt="Jason Shadow promotional portrait" /><p className="eyebrow">{t.adultsOnly}</p><h1>{t.heroTitle}</h1><p className="tagline">{t.heroText}</p><p className="ai-disclosure">{t.aiNotice}</p><div className="hero-actions"><a className="primary-action" href="#account">{user ? t.account : t.register}</a><a className="secondary-action" href="#membership">{t.viewMembership}</a></div></div></section>
      <section id="backend" className="section backend-section"><div className="section-heading"><p className="eyebrow">APPWRITE · FAIL CLOSED</p><h2>{t.backendLiveHeading}</h2><p>{t.backendLiveText}</p></div><div className="tier-list"><Tier title={t.backendAuthTitle} badge="ACTIVE" text={t.backendAuthLive} /><Tier title={t.backendAvsTitle} badge="MANUAL REVIEW" text={t.backendAvsLive} featured /><Tier title={t.backendPaymentsTitle} badge="DISABLED" text={t.backendPaymentsLive} /></div></section>
      <section id="membership" className="section membership-section"><div className="section-heading"><p className="eyebrow">{t.profileEyebrow}</p><h2>{t.brand}</h2><p>{t.bio}</p></div><div className="tier-list"><Tier title={t.tierFreeTitle} badge="FREE" text={t.tierFreeText} /><Tier title={t.tierExclusiveTitle} badge="30 / 90 / 365" text={t.tierExclusiveText} featured /><Tier title={t.tierSafetyTitle} badge="FAIL CLOSED" text={t.tierSafetyLive} /></div></section>
      <section id="free" className="section preview-section"><div className="section-heading"><p className="eyebrow">FREE ≠ PUBLIC</p><h2>{t.freeHeading}</h2></div><div className="locked-grid"><LockedCard t={t} /><LockedCard t={t} /><LockedCard t={t} /></div></section>
      <section id="exclusive" className="section preview-section"><div className="section-heading"><p className="eyebrow">PAID ACCESS</p><h2>{t.exclusiveHeading}</h2><p>{t.exclusiveText}</p></div><div className="locked-grid locked-grid--wide"><LockedCard t={t} /></div></section>
      <section id="account" className="section pending-section"><div className="section-heading"><p className="eyebrow">{user ? status : t.secureAccount}</p><h2>{user ? t.account : t.accountAccess}</h2><p>{user ? t.accountIntro : t.authIntro}</p></div>{notice && <p className="form-notice" role="status">{notice}</p>}{busy ? <p className="form-notice">{t.loading}</p> : user ? <div className="account-grid"><div className="status-panel"><dl><div><dt>{t.statusLabel}</dt><dd>{profile?.status || "EMAIL_PENDING"}</dd></div><div><dt>{t.emailLabel}</dt><dd>{user.email}</dd></div><div><dt>{t.avsLabel}</dt><dd>{status}</dd></div></dl><div className="hero-actions">{!user.emailVerification && <button className="secondary-action" onClick={() => run(resendVerification, t.verificationSent)}>{t.resendVerification}</button>}</div></div><form className="auth-panel" onSubmit={handleAge}><h3>{t.ageFormTitle}</h3><p>{t.ageFormText}</p><Field label={t.legalName} name="legalName" autoComplete="name" required maxLength="128" /><Field label={t.birthDate} name="birthDate" type="date" required /><Field label={t.country} name="country" required minLength="2" maxLength="2" placeholder="DE" /><label className="check-field"><input type="checkbox" required /> <span>{t.ageDeclaration}</span></label><button className="primary-action" disabled={!user.emailVerification || status === "MANUAL_REVIEW_PENDING"}>{status === "MANUAL_REVIEW_PENDING" ? t.reviewPending : t.avsStart}</button></form></div> : <div className="auth-panel-wrap"><div className="auth-tabs">{["login", "register", "reset"].map(item => <button type="button" className={mode === item ? "is-active" : ""} onClick={() => setMode(item)} key={item}>{t[item]}</button>)}</div><form className="auth-panel" onSubmit={handleAuth}>{mode === "register" && <Field label={t.name} name="name" autoComplete="name" required maxLength="128" />} {mode !== "recover" && <Field label={t.emailLabel} name="email" type="email" autoComplete="email" required />} {mode !== "reset" && <Field label={t.password} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength="8" required />}<button className="primary-action">{t[`${mode}Submit`]}</button></form></div>}</section>
    </main>
    <footer id="legal" className="site-footer legal-footer"><p>{t.footerLive}</p><nav><a href="/legal/">{t.legalLink}</a></nav></footer>
  </>;
}

export default App;
