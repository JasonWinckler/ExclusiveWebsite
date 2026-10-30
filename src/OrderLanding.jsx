import React from "react";

const content = {
  en: {
    eyebrow: "THE INNER CIRCLE OF JASON SHADOW",
    lead: "Closer to the music. Part of the story.",
    intro: "Support my work as a singer and speaker. Step behind the scenes, share the journey, and become part of The Order of Shadows.",
    join: "Join the Order of Shadows",
    explore: "Explore memberships",
    assurance: "Your support. Your choice. No automatic renewal.",
    portraitCaption: "JASON SHADOW",
    portraitRole: "Singer · Speaker · Host",
    strip: ["Independent creativity", "Behind-the-scenes access", "A closer connection"],
    experienceEyebrow: "01 / BEYOND THE SPOTLIGHT",
    experienceTitle: "Every performance has a story.",
    experienceIntro: "Come a little closer to the work, the preparation, and the person behind the voice.",
    photoCaption: "On stage at KÖPI am Ring, Rheine",
    benefits: [
      { number: "I", title: "Behind the scenes", text: "Discover members-only photos, videos, and personal updates from my music and speaker work. The moments around the performance, shared with you." },
      { number: "II", title: "A place in the circle", text: "Follow the journey and join the conversation through member comments. Premium and VIP memberships also include the private Telegram community." },
      { number: "III", title: "An even closer connection", text: "VIP includes personal meet-ups by arrangement and private WhatsApp access. A chance to connect beyond the screen, with the details agreed together." },
    ],
    supportEyebrow: "YOUR SUPPORT MAKES A DIFFERENCE",
    supportTitle: "Give the next chapter a voice.",
    supportText: "Your membership supports the creative work behind the music and spoken word. Choose the level that feels right for you, and receive exclusive access as a thank-you for being part of it.",
    supportNote: "A paid supporter membership with benefits. Contributions are not charitable donations.",
    stepsEyebrow: "03 / YOUR PLACE IN THE ORDER",
    stepsTitle: "A simple beginning.",
    steps: [
      { title: "Create your account.", text: "Register, verify your email, and set up your profile. Newsletter subscription is always optional." },
      { title: "Choose your membership.", text: "Select Basic, Premium, or VIP and the term that suits you. Review the full price before ordering." },
      { title: "Support. Connect. Discover.", text: "Pay by SEPA transfer. Your membership becomes active once payment is confirmed. There is no automatic renewal." },
    ],
    faqEyebrow: "A FEW THINGS TO KNOW",
    faqTitle: "Before you step inside.",
    faqs: [
      { q: "What is The Order of Shadows?", a: "The Order of Shadows is Jason Shadow’s supporter community for his music and speaker business. A paid membership gives you behind-the-scenes access and the benefits included in your selected tier." },
      { q: "What is the difference between the memberships?", a: "Basic opens the first collection of behind-the-scenes content. Premium includes Basic and Premium content plus the private Telegram community. VIP includes all content, private WhatsApp access, and personal meet-ups by arrangement. The membership selector lists the full benefits and terms." },
      { q: "How do payment and renewal work?", a: "Choose a fixed term and pay once by SEPA bank transfer using the payment details provided with your order. Access starts after payment is confirmed. Your membership does not renew automatically." },
      { q: "How do VIP meet-ups work?", a: "Personal meet-ups are included with VIP membership and arranged together. Dates, location, availability, and the applicable conditions are agreed in advance. Please read the VIP meet-up details before choosing your membership." },
      { q: "Will I receive a newsletter automatically?", a: "No. The newsletter is optional and requires your separate consent and email confirmation. You can withdraw your consent at any time. Essential account and order emails are separate from the newsletter." },
      { q: "Is this a tax-deductible donation?", a: "No charitable donation receipt is issued. This is a paid membership that supports Jason Shadow’s business and includes membership benefits. Your order provides the price, term, and payment information before you commit." },
    ],
    newsletterEyebrow: "LETTERS FROM THE SHADOWS",
    newsletterTitle: "Keep the connection.",
    newsletterText: "News from the music and speaker journey, if you want it. Create an account and choose whether to subscribe to the newsletter.",
    newsletterAction: "Choose newsletter preferences",
    newsletterNote: "Optional opt-in · Confirm by email · Unsubscribe anytime",
    closingEyebrow: "THERE’S A PLACE FOR YOU HERE",
    closingTitle: "Be part of what comes next.",
    closingText: "The music is the beginning. The connection is what makes it matter.",
  },
  de: {
    eyebrow: "DER INNERE KREIS VON JASON SHADOW",
    lead: "Näher an der Musik. Teil der Geschichte.",
    intro: "Unterstütze meine Arbeit als Sänger und Sprecher. Blicke hinter die Kulissen, begleite meinen Weg und werde Teil von The Order of Shadows.",
    join: "Werde Teil von The Order of Shadows",
    explore: "Mitgliedschaften entdecken",
    assurance: "Deine Unterstützung. Deine Wahl. Keine automatische Verlängerung.",
    portraitCaption: "JASON SHADOW",
    portraitRole: "Sänger · Sprecher · Moderator",
    strip: ["Unabhängige Kreativität", "Einblicke hinter die Kulissen", "Eine persönliche Verbindung"],
    experienceEyebrow: "01 / HINTER DEM SCHEINWERFERLICHT",
    experienceTitle: "Jeder Auftritt hat eine Geschichte.",
    experienceIntro: "Komm näher an die Arbeit, die Vorbereitung und den Menschen hinter der Stimme.",
    photoCaption: "Auf der Bühne im KÖPI am Ring, Rheine",
    benefits: [
      { number: "I", title: "Hinter den Kulissen", text: "Entdecke exklusive Fotos, Videos und persönliche Einblicke in meine Arbeit als Sänger und Sprecher. Die Momente rund um den Auftritt – mit dir geteilt." },
      { number: "II", title: "Dein Platz im Kreis", text: "Begleite meinen Weg und tausche dich in den Mitglieder-Kommentaren aus. Premium und VIP enthalten außerdem den Zugang zur privaten Telegram-Community." },
      { number: "III", title: "Noch persönlicher verbunden", text: "Mit VIP sind persönliche Treffen nach Vereinbarung und mein privater WhatsApp-Kontakt inklusive. Eine Verbindung über den Bildschirm hinaus – die Details stimmen wir gemeinsam ab." },
    ],
    supportEyebrow: "DEINE UNTERSTÜTZUNG BEWEGT ETWAS",
    supportTitle: "Gib dem nächsten Kapitel eine Stimme.",
    supportText: "Deine Mitgliedschaft unterstützt die kreative Arbeit hinter Musik und gesprochenem Wort. Wähle die Stufe, die zu dir passt, und erhalte exklusive Einblicke als Dankeschön für deine Unterstützung.",
    supportNote: "Eine kostenpflichtige Fördermitgliedschaft mit Vorteilen. Die Beiträge sind keine gemeinnützigen Spenden.",
    stepsEyebrow: "03 / DEIN PLATZ IM ORDEN",
    stepsTitle: "Ein einfacher Anfang.",
    steps: [
      { title: "Erstelle dein Konto.", text: "Registriere dich, bestätige deine E-Mail und richte dein Profil ein. Die Newsletter-Anmeldung ist freiwillig." },
      { title: "Wähle deine Mitgliedschaft.", text: "Entscheide dich für Basic, Premium oder VIP und deine gewünschte Laufzeit. Prüfe den Gesamtpreis vor der Bestellung." },
      { title: "Unterstützen. Verbinden. Entdecken.", text: "Bezahle per SEPA-Überweisung. Nach bestätigtem Zahlungseingang wird dein Zugang aktiviert. Es gibt keine automatische Verlängerung." },
    ],
    faqEyebrow: "GUT ZU WISSEN",
    faqTitle: "Bevor du eintrittst.",
    faqs: [
      { q: "Was ist The Order of Shadows?", a: "The Order of Shadows ist die Unterstützer-Community für Jason Shadows Musik- und Sprecher-Business. Mit einer kostenpflichtigen Mitgliedschaft erhältst du Einblicke hinter die Kulissen und die Vorteile deiner gewählten Stufe." },
      { q: "Wie unterscheiden sich die Mitgliedschaften?", a: "Basic eröffnet dir die erste Sammlung von Einblicken hinter die Kulissen. Premium umfasst Basic- und Premium-Inhalte sowie die private Telegram-Community. VIP enthält alle Inhalte, privaten WhatsApp-Kontakt und persönliche Treffen nach Vereinbarung. Alle Vorteile und Laufzeiten findest du in der Mitgliedschaftsauswahl." },
      { q: "Wie funktionieren Zahlung und Verlängerung?", a: "Du wählst eine feste Laufzeit und bezahlst einmalig per SEPA-Überweisung mit den Zahlungsdaten aus deiner Bestellung. Dein Zugang startet nach bestätigtem Zahlungseingang. Deine Mitgliedschaft verlängert sich nicht automatisch." },
      { q: "Wie funktionieren die VIP-Treffen?", a: "Persönliche Treffen sind bei VIP inklusive und werden gemeinsam vereinbart. Termin, Ort, Verfügbarkeit und die geltenden Bedingungen stimmen wir vorab ab. Bitte lies die Hinweise zu VIP-Treffen, bevor du deine Mitgliedschaft auswählst." },
      { q: "Erhalte ich automatisch einen Newsletter?", a: "Nein. Der Newsletter ist freiwillig und erfordert deine separate Einwilligung sowie eine Bestätigung per E-Mail. Du kannst deine Einwilligung jederzeit widerrufen. Notwendige Konto- und Bestellnachrichten sind davon unabhängig." },
      { q: "Ist mein Beitrag eine steuerlich absetzbare Spende?", a: "Es wird keine gemeinnützige Spendenbescheinigung ausgestellt. Du erwirbst eine kostenpflichtige Mitgliedschaft mit Vorteilen und unterstützt damit Jason Shadows Business. Preis, Laufzeit und Zahlungsinformationen siehst du vor deiner verbindlichen Bestellung." },
    ],
    newsletterEyebrow: "LETTERS FROM THE SHADOWS",
    newsletterTitle: "Bleiben wir verbunden.",
    newsletterText: "Neuigkeiten aus meiner Musik- und Sprecherarbeit – wenn du möchtest. Erstelle ein Konto und entscheide selbst, ob du den Newsletter erhalten willst.",
    newsletterAction: "Newsletter-Einstellungen wählen",
    newsletterNote: "Freiwillige Anmeldung · Bestätigung per E-Mail · Jederzeit abmelden",
    closingEyebrow: "HIER IST EIN PLATZ FÜR DICH",
    closingTitle: "Sei Teil des nächsten Kapitels.",
    closingText: "Die Musik ist der Anfang. Die Verbindung macht sie besonders.",
  },
};

const Arrow = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 15 15 4M5 4h10v10" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;

export function OrderLanding({ language = "en", onRegister }) {
  const c = content[language] || content.en;
  return <>
    <section className="order-hero" id="top" aria-labelledby="order-title">
      <div className="order-hero-copy">
        <p className="order-eyebrow"><span aria-hidden="true">✦</span>{c.eyebrow}</p>
        <h1 id="order-title">The Order<br /><em>of Shadows.</em></h1>
        <p className="order-hero-lead">{c.lead}</p>
        <p className="order-hero-intro">{c.intro}</p>
        <div className="order-hero-actions">
          <button type="button" className="order-button order-button--gold" onClick={onRegister}>{c.join}<Arrow /></button>
          <a className="order-text-link" href="#pricing">{c.explore}<span aria-hidden="true">↓</span></a>
        </div>
        <p className="order-assurance">{c.assurance}</p>
      </div>
      <figure className="order-portrait">
        <div className="order-portrait-frame">
          <img src="/assets/music/portrait-800.webp" srcSet="/assets/music/portrait-400.webp 400w, /assets/music/portrait-800.webp 800w, /assets/music/portrait-1023.webp 1023w" sizes="(max-width: 700px) 85vw, 43vw" width="800" height="1202" alt={language === "de" ? "Jason Shadow mit Mikrofon" : "Jason Shadow with a microphone"} fetchPriority="high" />
          <span className="order-portrait-edition" aria-hidden="true">THE HEALING SHADOW</span>
        </div>
        <figcaption><strong>{c.portraitCaption}</strong><span>{c.portraitRole}</span></figcaption>
      </figure>
    </section>

    <div className="order-values" aria-label={language === "de" ? "Dafür steht die Mitgliedschaft" : "What membership stands for"}>
      {c.strip.map((value) => <span key={value}><span aria-hidden="true">✦</span>{value}</span>)}
    </div>

    <section className="order-experience order-section" id="experience" aria-labelledby="experience-title">
      <div className="order-section-heading">
        <p className="order-eyebrow">{c.experienceEyebrow}</p>
        <h2 id="experience-title">{c.experienceTitle}</h2>
        <p>{c.experienceIntro}</p>
      </div>
      <div className="order-experience-grid">
        <figure className="order-stage">
          <img src="/assets/music/performance-poster.webp" width="478" height="570" alt={language === "de" ? "Jason Shadow bei seinem Live-Auftritt im KÖPI am Ring" : "Jason Shadow performing live at KÖPI am Ring"} loading="lazy" />
          <figcaption><span aria-hidden="true">●</span>{c.photoCaption}</figcaption>
        </figure>
        <div className="order-benefits">
          {c.benefits.map((benefit) => <article className="order-benefit" key={benefit.number}>
            <span className="order-benefit-number" aria-hidden="true">{benefit.number}</span>
            <div><h3>{benefit.title}</h3><p>{benefit.text}</p></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="order-support" aria-labelledby="support-title">
      <div className="order-support-mark" aria-hidden="true">✦</div>
      <div><p className="order-eyebrow">{c.supportEyebrow}</p><h2 id="support-title">{c.supportTitle}</h2></div>
      <div className="order-support-copy"><p>{c.supportText}</p><small>{c.supportNote}</small></div>
    </section>
  </>;
}

export function OrderClosing({ language = "en", onRegister, onNewsletter }) {
  const c = content[language] || content.en;
  return <>
    <section className="order-process order-section" aria-labelledby="order-process-title">
      <div className="order-section-heading"><p className="order-eyebrow">{c.stepsEyebrow}</p><h2 id="order-process-title">{c.stepsTitle}</h2></div>
      <ol className="order-steps">{c.steps.map((step, index) => <li key={step.title}>
        <span className="order-step-number" aria-hidden="true">0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p>
      </li>)}</ol>
    </section>
    <section className="order-faq order-section" id="questions" aria-labelledby="order-faq-title">
      <div className="order-section-heading"><p className="order-eyebrow">{c.faqEyebrow}</p><h2 id="order-faq-title">{c.faqTitle}</h2></div>
      <div className="order-faq-list">{c.faqs.map((faq) => <details key={faq.q}><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>)}</div>
    </section>
    <section className="order-newsletter" id="newsletter" aria-labelledby="order-newsletter-title">
      <div><p className="order-eyebrow">{c.newsletterEyebrow}</p><h2 id="order-newsletter-title">{c.newsletterTitle}</h2><p>{c.newsletterText}</p></div>
      <div className="order-newsletter-action"><button type="button" className="order-button order-button--outline" onClick={onNewsletter || onRegister}>{c.newsletterAction}<Arrow /></button><small>{c.newsletterNote}</small></div>
    </section>
    <section className="order-invitation" aria-labelledby="order-invitation-title">
      <span className="order-invitation-star" aria-hidden="true">✦</span>
      <p className="order-eyebrow">{c.closingEyebrow}</p><h2 id="order-invitation-title">{c.closingTitle}</h2><p>{c.closingText}</p>
      <button type="button" className="order-button order-button--gold" onClick={onRegister}>{c.join}<Arrow /></button>
    </section>
  </>;
}

export default OrderLanding;
