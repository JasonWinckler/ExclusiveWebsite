import React, { useEffect, useRef, useState } from "react";
import { getContentItems, fetchContentItem, getContentComments, createContentComment, deleteContentComment, registerCurrentDevice } from "./lib/platform";
import { friendlyErrorMessage } from "./lib/error-messages";
import "../assets/css/vip-private.css";
const VipAgeVerification = React.lazy(() => import("./VipAgeVerification"));

export default function VipPrivateArea({ language, membership, user, readOnly = false, onRefresh }) {
  const de = language === "de";
  const [verifying, setVerifying] = useState(false);
  const verificationPanel = useRef(null);
  const [privateHidden, setPrivateHidden] = useState(false);
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [media, setMedia] = useState(null);
  const [comments, setComments] = useState([]);
  const [canComment, setCanComment] = useState(false);
  const [busy, setBusy] = useState(false);
  const eligible = Boolean(membership?.adultArea?.eligible && membership?.entitlement?.active && membership.entitlement.tier === "EXCLUSIVE_VIP");
  const authorized = eligible && membership?.adultArea?.available === true && membership?.adultArea?.ageVerified === true;
  const available = authorized && !privateHidden;
  const item = items[index % Math.max(items.length, 1)];
  const errorText = (error) => friendlyErrorMessage(error, language, de ? "Der private Bereich konnte nicht geladen werden." : "The private area could not be loaded.");

  useEffect(() => {
    if (verifying) verificationPanel.current?.focus();
  }, [verifying]);

  useEffect(() => {
    let current = true;
    setItems([]); setIndex(0); setNotice("");
    if (!available || readOnly) return;
    setBusy(true);
    (async () => {
      try {
        await registerCurrentDevice();
        const result = await getContentItems("VIP_ADULT");
        if (current) setItems((result.items || []).filter((post) => post.accessible && post.contentScope === "VIP_ADULT"));
      } catch (error) {
        if (current) { setNotice(errorText(error)); Promise.resolve(onRefresh?.()).catch(() => null); }
      } finally { if (current) setBusy(false); }
    })();
    return () => { current = false; };
  }, [available, readOnly, user?.$id, membership?.entitlement?.expiresAt]);

  useEffect(() => {
    let current = true;
    let objectUrl;
    setMedia(null); setComments([]); setCanComment(false);
    if (!available || !item || readOnly) return;
    setBusy(true);
    (async () => {
      try {
        const response = await fetchContentItem(item.slug);
        const blob = await response.blob();
        if (!current) return;
        objectUrl = URL.createObjectURL(blob);
        setMedia({ url: objectUrl, type: response.headers.get("Content-Type") || item.contentType });
        if (item.allowComments) {
          const result = await getContentComments(item.slug);
          if (current) { setComments(result.comments || []); setCanComment(result.canComment === true); }
        }
      } catch (error) {
        if (current) { setMedia(null); setNotice(errorText(error)); Promise.resolve(onRefresh?.()).catch(() => null); }
      } finally { if (current) setBusy(false); }
    })();
    return () => { current = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [available, item?.slug, readOnly, user?.$id]);

  async function comment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") || "").trim();
    if (!body || !item || !canComment) return;
    setBusy(true); setNotice("");
    try {
      await createContentComment(item.slug, body);
      const result = await getContentComments(item.slug);
      setComments(result.comments || []); setCanComment(result.canComment === true); form.reset();
    } catch (error) { setNotice(errorText(error)); }
    finally { setBusy(false); }
  }
  async function removeComment(id) {
    setBusy(true); setNotice("");
    try {
      await deleteContentComment(id);
      const result = await getContentComments(item.slug);
      setComments(result.comments || []);
    } catch (error) { setNotice(errorText(error)); }
    finally { setBusy(false); }
  }

  async function refreshStatus() {
    setBusy(true); setNotice("");
    try { await registerCurrentDevice(); await onRefresh?.(); }
    catch (error) { setNotice(errorText(error)); }
    finally { setBusy(false); }
  }

  if (!eligible) return null;
  return <div className="vip-private-area">
    <header className="vip-private-heading">
      <div><p className="eyebrow">VIP SHADOW · {de ? "NUR FÜR DICH" : "JUST FOR YOU"}</p><h2>Shadow's Temptation</h2></div>
      <span className="vip-private-age" aria-label={de ? "Nur für Erwachsene ab 18 Jahren" : "Adults aged 18 and over only"}>18+</span>
    </header>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    {readOnly ? <p>{de ? "Die Admin-Simulation zeigt diesen Zugang nur zur Orientierung. Private Inhalte und Altersnachweise werden in der Simulation nicht geladen." : "Admin simulation shows this access for orientation only. Private content and age evidence are not loaded in simulation."}</p> : authorized && privateHidden ? <button className="vip-private-teaser" type="button" onClick={() => setPrivateHidden(false)}>{de ? "Private Galerie wieder öffnen" : "Reopen private gallery"}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></button> : !available && membership?.adultArea?.ageVerified ? <><p>{de ? "Dein Alter ist bestätigt. Bitte bestätige dieses Gerät für den privaten Zugriff." : "Your age is verified. Confirm this device for private access."}</p><button className="secondary-action" type="button" disabled={busy} onClick={refreshStatus}>{de ? "Gerät bestätigen" : "Confirm device"}</button></> : !available ? <>
      <p className="vip-private-intro">{de ? "Eine andere Seite von Jason. Ein freiwilliger, privater Bereich für aktive VIP-Mitglieder – ausschließlich ab 18 und nach bestätigter Altersprüfung." : "Another side of Jason. An optional, private space for active VIP members — strictly 18+ and only after approved age verification."}</p>
      {verifying || membership?.ageVerification?.reviewStatus === "READY_FOR_REVIEW" ? <div id="vip-age-verification" ref={verificationPanel} tabIndex={-1} aria-label={de ? "Altersverifikation" : "Age verification"}>
        <p className="upload-note">{de ? "Deine Musik-Mitgliedschaft und der gemeinsame Behind-the-Scenes-Zugang benötigen keine Altersprüfung." : "Your music membership and shared behind-the-scenes access do not require age verification."}</p>
        <React.Suspense fallback={<p role="status">{de ? "Wird geladen …" : "Loading …"}</p>}><VipAgeVerification language={language} ageVerification={membership?.ageVerification} countryCode={membership?.account?.countryCode} onComplete={async () => { await onRefresh?.(); }} onNotice={setNotice} /></React.Suspense>
        <button className="text-button" type="button" disabled={busy} onClick={refreshStatus}>{de ? "Prüfstatus aktualisieren" : "Refresh verification status"}</button>
      </div> : <button className="vip-private-teaser" type="button" onClick={() => setVerifying(true)}>Tempted? Discover my secret side!<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></button>}
    </> : <>
      <div className="vip-private-status"><p className="upload-note">{de ? "Aktive VIP-Mitgliedschaft · Alter bestätigt · Privater Zugriff" : "Active VIP membership · Age verified · Private access"}</p><button className="text-button" type="button" onClick={() => setPrivateHidden(true)}>{de ? "Privaten Bereich ausblenden" : "Hide private area"}</button></div>
      {busy && <p role="status">{de ? "Wird geladen …" : "Loading …"}</p>}
      {item ? <article className="creator-post">
        <div className="post-carousel__navigation"><button className="secondary-action" type="button" disabled={items.length < 2 || busy} aria-label={de ? "Vorheriger Beitrag" : "Previous post"} onClick={() => setIndex((index + items.length - 1) % items.length)}>←</button><span>{index + 1} / {items.length}</span><button className="secondary-action" type="button" disabled={items.length < 2 || busy} aria-label={de ? "Nächster Beitrag" : "Next post"} onClick={() => setIndex((index + 1) % items.length)}>→</button></div>
        <div className="creator-post__copy"><h3>{item.title}</h3>{item.bodyText && <p>{item.bodyText}</p>}</div>
        {media && <div className="creator-post__media">{media.type?.startsWith("video/") ? <video src={media.url} controls playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture /> : <img src={media.url} alt={item.title} draggable="false" />}</div>}
        {item.allowComments && <section className="inline-comments"><h4>{de ? "Kommentare" : "Comments"}</h4>{comments.map((comment) => <article key={comment.id}><strong>{comment.displayName}</strong><p>{comment.body}</p>{comment.own && <button className="text-button" type="button" disabled={busy} onClick={() => removeComment(comment.id)}>{de ? "Löschen" : "Delete"}</button>}</article>)}{canComment && <form onSubmit={comment}><label className="field"><span>{de ? "Dein Kommentar" : "Your comment"}</span><textarea name="body" maxLength={1200} required /></label><button className="secondary-action" disabled={busy}>{de ? "Kommentar veröffentlichen" : "Post comment"}</button></form>}</section>}
      </article> : !busy && !notice && <p>{de ? "In diesem Bereich sind derzeit keine freigegebenen Beiträge verfügbar." : "No reviewed posts are currently available in this area."}</p>}
    </>}
  </div>;
}
