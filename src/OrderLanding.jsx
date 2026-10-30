import React from "react";

const content = {
  en: {
    eyebrow: "JASON SHADOW · THE HEALING SHADOW",
    heroFirst: "Exclusive",
    heroSecond: "Membership.",
    community: "The community: Order of Shadows",
    lead: "Your support. A personal connection.",
    intro: "Support my music and voice services for private celebrations and corporate events. Every membership includes the same behind-the-scenes access, with additional benefits to suit you.",
    join: "Join the Shadows",
    explore: "Explore memberships",
    assurance: "Your support. Your choice. No automatic renewal.",
    portraitCaption: "JASON SHADOW",
    portraitRole: "Singer · Speaker · Host",
    strip: ["Support a personal business", "Behind-the-scenes access", "A closer connection"],
    experienceEyebrow: "01 / BEHIND THE PREPARATION",
    experienceTitle: "Personal occasions. Thoughtful preparation.",
    experienceIntro: "Discover the preparation, choices and craft behind music and voice services tailored to private and business occasions.",
    photoCaption: "JASON SHADOW · MUSIC & VOICE SERVICES",
    benefits: [
      { number: "I", title: "Behind the scenes", text: "See how music and voice projects take shape, from preparation to selected project insights. Every paid tier shares the same collection. Ask questions and exchange ideas beneath posts where comments are enabled." },
      { number: "II", title: "Benefits beyond the content", text: "Premium Shadow and VIP Shadow include 15% off all Jason Shadow services, including private celebrations and corporate events. Your membership supports my work even when you are not planning a booking." },
      { number: "III", title: "An even closer connection", text: "VIP Shadow includes direct WhatsApp contact for questions and arrangements, plus personal meet-ups agreed together. A more personal way to stay in touch." },
    ],
    supportEyebrow: "YOUR SUPPORT MAKES A DIFFERENCE",
    supportTitle: "Support the work behind special occasions.",
    supportText: "Your membership supports my work as a music and voice service provider. It helps make room for careful preparation and developing my craft. Choose the support level that suits you; the shared behind-the-scenes access is my thank-you.",
    supportNote: "A paid supporter membership with benefits. Contributions are not charitable donations.",
    stepsEyebrow: "03 / YOUR MEMBERSHIP",
    stepsTitle: "A simple beginning.",
    steps: [
      { title: "Create your account.", text: "Register, verify your email, and set up your profile. Newsletter subscription is always optional." },
      { title: "Choose your membership.", text: "Select Basic Shadow, Premium Shadow or VIP Shadow and the term that suits you. Review the full price before ordering." },
      { title: "Support. Connect. Discover.", text: "Pay by SEPA transfer. Your membership becomes active once payment is confirmed. There is no automatic renewal." },
    ],
    faqEyebrow: "A FEW THINGS TO KNOW",
    faqTitle: "Before you step inside.",
    faqs: [
      { q: "What is the Exclusive Membership?", a: "It is paid support for Jason Shadow’s music and voice services for private celebrations and corporate events. Order of Shadows is the community name. Every paid tier includes the same behind-the-scenes content; additional personal benefits differ." },
      { q: "What is the difference between the memberships?", a: "Basic Shadow includes all music behind-the-scenes posts, questions and member conversation. Premium Shadow adds 15% off all Jason Shadow services. VIP Shadow also includes direct WhatsApp contact, meet-ups by arrangement and an optional separate 18+ area after approved age verification." },
      { q: "How does the 15% service discount work?", a: "Premium Shadow and VIP Shadow receive 15% off all services offered by Jason Shadow. Mention your active membership when requesting a quote. The service, date and discounted total are agreed before booking." },
      { q: "How do payment and renewal work?", a: "Choose a fixed term and pay once by SEPA bank transfer using the payment details provided with your order. Access starts after payment is confirmed. Your membership does not renew automatically." },
      { q: "How do VIP meet-ups work?", a: "Personal meet-ups are included with VIP Shadow membership and arranged together. Dates, location, availability, and the applicable conditions are agreed in advance. Please read the VIP meet-up details before choosing your membership." },
      { q: "Will I receive a newsletter automatically?", a: "No. The newsletter is optional and requires your separate consent and email confirmation. You can withdraw your consent at any time. Essential account and order emails are separate from the newsletter." },
      { q: "Is there a separate optional VIP area?", a: "Yes. An optional private 18+ area is available only to active VIP Shadow members who separately complete age verification. It is separate from the shared music content and is not required to use the music membership." },
      { q: "Is this a tax-deductible donation?", a: "No charitable donation receipt is issued. This is a paid membership that supports Jason Shadow’s business and includes membership benefits. Your order provides the price, term, and payment information before you commit." },
    ],
    newsletterEyebrow: "LETTERS FROM THE SHADOWS",
    newsletterTitle: "Keep the connection.",
    newsletterText: "Selected updates from my music and voice work, if you want them. Create an account and choose whether to subscribe to the newsletter.",
    newsletterAction: "Choose newsletter preferences",
    newsletterNote: "Optional opt-in · Confirm by email · Unsubscribe anytime",
    closingEyebrow: "THERE’S A PLACE FOR YOU HERE",
    closingTitle: "Be part of what comes next.",
    closingText: "For the preparation, the craft and the personal moments that follow.",
  },
  de: {
    eyebrow: "JASON SHADOW · THE HEALING SHADOW",
    heroFirst: "Exklusive",
    heroSecond: "Mitgliedschaft.",
    community: "Die Community: Order of Shadows",
    lead: "Deine Unterstützung. Persönlich verbunden.",
    intro: "Unterstütze meine Musik- und Sprecherdienstleistungen für private Feiern und Firmenevents. Jede Mitgliedschaft enthält dieselben Einblicke hinter die Kulissen und zusätzliche Vorteile, die zu dir passen.",
    join: "Mitglied werden",
    explore: "Mitgliedschaften entdecken",
    assurance: "Deine Unterstützung. Deine Wahl. Keine automatische Verlängerung.",
    portraitCaption: "JASON SHADOW",
    portraitRole: "Sänger · Sprecher · Moderator",
    strip: ["Persönliche Arbeit unterstützen", "Einblicke hinter die Kulissen", "Eine persönliche Verbindung"],
    experienceEyebrow: "01 / HINTER DER VORBEREITUNG",
    experienceTitle: "Persönliche Anlässe. Sorgfältig vorbereitet.",
    experienceIntro: "Entdecke die Vorbereitung, Entscheidungen und das Handwerk hinter Musik und Stimme für private und geschäftliche Anlässe.",
    photoCaption: "JASON SHADOW · MUSIK & SPRECHERARBEIT",
    benefits: [
      { number: "I", title: "Hinter den Kulissen", text: "Erlebe, wie Musik- und Sprecherprojekte entstehen: von der Vorbereitung bis zu ausgewählten Projekteinblicken. Alle bezahlten Stufen erhalten dieselbe Sammlung. Stelle Fragen und tausche Ideen unter Beiträgen mit freigeschalteten Kommentaren aus." },
      { number: "II", title: "Vorteile über die Inhalte hinaus", text: "Premium Shadow und VIP Shadow erhalten 15 % Rabatt auf alle Dienstleistungen von Jason Shadow, auch für private Feiern und Firmenevents. Deine Mitgliedschaft unterstützt meine Arbeit auch dann, wenn du gerade keine Buchung planst." },
      { number: "III", title: "Noch persönlicher verbunden", text: "VIP Shadow bietet direkten WhatsApp-Kontakt für Fragen und Absprachen sowie persönliche Treffen nach gemeinsamer Vereinbarung. So bleiben wir noch persönlicher verbunden." },
    ],
    supportEyebrow: "DEINE UNTERSTÜTZUNG BEWEGT ETWAS",
    supportTitle: "Unterstütze die Arbeit hinter besonderen Anlässen.",
    supportText: "Deine Mitgliedschaft unterstützt meine Arbeit als Musik- und Sprecherdienstleister. Sie schafft Raum für sorgfältige Vorbereitung und die Weiterentwicklung meines Handwerks. Wähle den Beitrag, der zu dir passt; die gemeinsamen Einblicke sind mein Dankeschön.",
    supportNote: "Eine kostenpflichtige Fördermitgliedschaft mit Vorteilen. Die Beiträge sind keine gemeinnützigen Spenden.",
    stepsEyebrow: "03 / DEINE MITGLIEDSCHAFT",
    stepsTitle: "Ein einfacher Anfang.",
    steps: [
      { title: "Erstelle dein Konto.", text: "Registriere dich, bestätige deine E-Mail und richte dein Profil ein. Die Newsletter-Anmeldung ist freiwillig." },
      { title: "Wähle deine Mitgliedschaft.", text: "Entscheide dich für Basic Shadow, Premium Shadow oder VIP Shadow und deine gewünschte Laufzeit. Prüfe den Gesamtpreis vor der Bestellung." },
      { title: "Unterstützen. Verbinden. Entdecken.", text: "Bezahle per SEPA-Überweisung. Nach bestätigtem Zahlungseingang wird dein Zugang aktiviert. Es gibt keine automatische Verlängerung." },
    ],
    faqEyebrow: "GUT ZU WISSEN",
    faqTitle: "Bevor du eintrittst.",
    faqs: [
      { q: "Was ist die exklusive Mitgliedschaft?", a: "Damit unterstützt du Jason Shadows Musik- und Sprecherdienstleistungen für private Feiern und Firmenevents. Order of Shadows ist der Community-Name. Alle bezahlten Stufen enthalten dieselben Behind-the-Scenes-Inhalte; die zusätzlichen persönlichen Vorteile unterscheiden sich." },
      { q: "Wie unterscheiden sich die Mitgliedschaften?", a: "Basic Shadow enthält alle Musik-Behind-the-Scenes-Beiträge, Fragen und Austausch im Mitgliederbereich. Premium Shadow ergänzt 15 % Rabatt auf alle Dienstleistungen von Jason Shadow. VIP Shadow bietet zusätzlich direkten WhatsApp-Kontakt, Treffen nach Vereinbarung und einen optionalen separaten 18+-Bereich nach bestätigter Altersprüfung." },
      { q: "Wie funktioniert der 15-%-Rabatt auf Dienstleistungen?", a: "Premium Shadow und VIP Shadow erhalten 15 % Rabatt auf alle Dienstleistungen von Jason Shadow. Nenne deine aktive Mitgliedschaft bei deiner Anfrage. Leistung, Termin und rabattierter Gesamtpreis werden vor der Buchung vereinbart." },
      { q: "Wie funktionieren Zahlung und Verlängerung?", a: "Du wählst eine feste Laufzeit und bezahlst einmalig per SEPA-Überweisung mit den Zahlungsdaten aus deiner Bestellung. Dein Zugang startet nach bestätigtem Zahlungseingang. Deine Mitgliedschaft verlängert sich nicht automatisch." },
      { q: "Wie funktionieren die VIP-Treffen?", a: "Persönliche Treffen sind bei VIP Shadow inklusive und werden gemeinsam vereinbart. Termin, Ort, Verfügbarkeit und die geltenden Bedingungen stimmen wir vorab ab. Bitte lies die Hinweise zu VIP-Treffen, bevor du deine Mitgliedschaft auswählst." },
      { q: "Erhalte ich automatisch einen Newsletter?", a: "Nein. Der Newsletter ist freiwillig und erfordert deine separate Einwilligung sowie eine Bestätigung per E-Mail. Du kannst deine Einwilligung jederzeit widerrufen. Notwendige Konto- und Bestellnachrichten sind davon unabhängig." },
      { q: "Gibt es einen separaten optionalen VIP-Bereich?", a: "Ja. Der freiwillige private Bereich ab 18 ist nur für aktive VIP-Shadow-Mitglieder nach gesonderter Altersprüfung zugänglich. Er ist von den gemeinsamen Musik-Inhalten getrennt und keine Voraussetzung für die Musik-Mitgliedschaft." },
      { q: "Ist mein Beitrag eine steuerlich absetzbare Spende?", a: "Es wird keine gemeinnützige Spendenbescheinigung ausgestellt. Du erwirbst eine kostenpflichtige Mitgliedschaft mit Vorteilen und unterstützt damit Jason Shadows Business. Preis, Laufzeit und Zahlungsinformationen siehst du vor deiner verbindlichen Bestellung." },
    ],
    newsletterEyebrow: "LETTERS FROM THE SHADOWS",
    newsletterTitle: "Bleiben wir verbunden.",
    newsletterText: "Neuigkeiten aus meiner Musik- und Sprecherarbeit – wenn du möchtest. Erstelle ein Konto und entscheide selbst, ob du den Newsletter erhalten willst.",
    newsletterAction: "Newsletter-Einstellungen wählen",
    newsletterNote: "Freiwillige Anmeldung · Bestätigung per E-Mail · Jederzeit abmelden",
    closingEyebrow: "HIER IST EIN PLATZ FÜR DICH",
    closingTitle: "Sei Teil des nächsten Kapitels.",
    closingText: "Für die Vorbereitung, das Handwerk und die persönlichen Momente danach.",
  },
};

const Arrow = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 15 15 4M5 4h10v10" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;

export function OrderLanding({ language = "en", onRegister }) {
  const c = content[language] || content.en;
  return <>
    <section className="order-hero" id="top" aria-labelledby="order-title">
      <div className="order-hero-copy">
        <p className="order-eyebrow"><span aria-hidden="true">✦</span>{c.eyebrow}</p>
        <h1 id="order-title">{c.heroFirst}<br /><em>{c.heroSecond}</em></h1>
        <p className="order-community-name">{c.community}</p>
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
          <img src="/assets/music/portrait-400.webp" width="400" height="601" alt={language === "de" ? "Jason Shadow, Sänger und Sprecher für persönliche Anlässe" : "Jason Shadow, singer and speaker for personal occasions"} loading="lazy" />
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
