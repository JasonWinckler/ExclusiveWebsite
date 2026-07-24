const legalCopy = {
  en: {},
  de: {
    title: 'Rechtliche Hinweise, AGB und Compliance-Hinweise',
    intro: 'Diese Vorlagentexte sind Platzhalter für fachliche Prüfung. Sie begründen keine gesetzliche Zulassung, KJM-Zertifizierung oder produktive Freigabe.',
    termsTitle: 'Allgemeine Geschäftsbedingungen',
    termsText: 'Der Zugang ist auf Erwachsene beschränkt, die Registrierung, E-Mail-Bestätigung, manuelle Altersverifikation, erneute Authentifizierung und etwaige Zahlungsanforderungen erfüllen. Registrierung, AVS, Zahlungen und Adult-Inhalte bleiben bis zur Prüfung deaktiviert. Nutzer dürfen keine rechtswidrigen Inhalte hochladen, Zugangsdaten teilen, Zugriffskontrollen umgehen, Medien auslesen oder Alter bzw. Identität falsch angeben.',
    privacyTitle: 'Datenschutzhinweis',
    privacyText: 'Die Verarbeitung muss Datenminimierung, Zweckbindung, verschlüsselte temporäre AVS-Speicherung, kurze Fristen und Löschung nach Freigabe, Ablehnung, Widerruf oder Ablauf beachten. Es werden keine Analytics, Werbepixel oder unnötigen Cookies verwendet. Produktiv sind DSGVO-Dokumentation, Rechtsgrundlage, Auftragsverarbeitungsverträge und Betroffenenrechte-Workflow erforderlich.',
    consumerTitle: 'Verbraucherinformationen',
    consumerText: 'Geplant ist vorausbezahlter Zugang für 30, 90 oder 365 Tage per manueller SEPA-Überweisung. Betreiber, Gesamtpreis, Laufzeit, Zahlungsanweisungen, Zugangsbeginn, technische Voraussetzungen, Beschwerdekontakt und Beschränkungen digitaler Inhalte müssen vor Bestellung angezeigt werden. Pending-Konten können nicht bezahlen.',
    withdrawalTitle: 'Widerrufsbelehrung',
    withdrawalText: 'Deutsche/EU-Fernabsatzregeln verlangen grundsätzlich klare Widerrufsinformationen und einen Widerrufsweg vor Vertragsschluss. Zugriff auf digitale Inhalte darf erst nach den gesetzlich erforderlichen Zustimmungen und Bestätigungen starten. Die genaue Fassung muss anwaltlich erstellt oder geprüft werden.',
    withdrawalFunctionTitle: 'Elektronische Widerrufsfunktion',
    withdrawalFunctionText: 'Hier ist eine sichtbare Widerrufsfunktion für deutsche/EU-Compliance vorgesehen. Sie muss Vertragskennung, Kontaktdaten und Widerrufsbestätigung erfassen und dauerhaft bestätigen. Sie bleibt bis zum Backend deaktiviert.',
    withdrawalButton: 'Widerrufsfunktion bis zur Backend-Prüfung deaktiviert',
    youthTitle: 'Jugendschutz / Altersverifikation',
    youthText: 'Adult-Inhalte müssen für Minderjährige und ungeprüfte Nutzer vollständig unzugänglich sein. Ein einfacher 18+-Button, Geburtsdatum, Zahlungskarte oder E-Mail-Registrierung gilt nicht als Altersverifikation. Deutschland-spezifische Eignung und rechtliche Prüfung müssen vor Produktivstart abgeschlossen sein.',
    contentTitle: 'Inhaltsrichtlinien',
    contentText: 'Nur rechtmäßige, einvernehmliche Adult-Inhalte mit Erwachsenen dürfen nach Prüfung veröffentlicht werden. Alters- und Rechteunterlagen zu Darstellern sind außerhalb von Git und öffentlichem Speicher zu führen. Rechtswidrige, nicht einvernehmliche, ausbeuterische, minderjährige, tierbezogene, gewalttätige oder sonst verbotene Inhalte sind untersagt.',
    aiTitle: 'Hinweis zu KI-Bearbeitung',
    aiText: 'Profil- und Banner-Werbebilder können digital oder teilweise mit KI bearbeitet sein und werden entsprechend gekennzeichnet. Geschützte Adult-Inhalte müssen real oder korrekt gekennzeichnet sein und dürfen nicht falsch dargestellt werden.',
    usTitle: 'US-rechtlich orientierte Hinweise',
    usText: 'Für US-Verfügbarkeit sind, soweit anwendbar, 18 U.S.C. §2257/§2257A zu Darsteller-Unterlagen, bundes- und bundesstaatliche Altersverifikationsregeln, FTC-Standards gegen unfaire oder irreführende Praktiken, klare Preis-/Erstattungsangaben sowie Datenschutz- und Sicherheitsanforderungen zu berücksichtigen. Bundesstaatliches Recht variiert und kann Geoblocking oder zusätzliche Kontrollen erfordern.',
    deTitle: 'Deutschrechtlich orientierte Hinweise',
    deText: 'Für Deutschland sind Impressum/Anbieterkennzeichnung, DSGVO-Datenschutzhinweise, AGB, Verbraucher- und Widerrufsinformationen, Jugendschutzhinweise, geprüfter geschlossener Adult-Zugang, keine irreführenden Behördenfreigabe-Claims und ein rechtlich geprüftes AVS-Verfahren erforderlich.',
    contactTitle: 'Kontakt und Platzhalter'
  }
};
const storageKey = 'jason-shadow-membership-language';
const language = localStorage.getItem(storageKey) === 'de' ? 'de' : 'en';
document.documentElement.lang = language;
document.querySelectorAll('[data-lang]').forEach((button) => {
  button.classList.toggle('is-active', button.dataset.lang === language);
  button.addEventListener('click', () => { localStorage.setItem(storageKey, button.dataset.lang); location.reload(); });
});
if (language === 'de') {
  document.querySelectorAll('[data-legal]').forEach((element) => {
    const value = legalCopy.de[element.dataset.legal];
    if (value) element.textContent = value;
  });
}
