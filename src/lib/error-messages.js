const messages = {
  de: {
    user_invalid_credentials: "E-Mail-Adresse oder Passwort ist nicht korrekt.",
    user_password_mismatch: "Das eingegebene Passwort ist nicht korrekt.",
    user_blocked: "Dieses Konto ist derzeit gesperrt. Bitte wende dich an den Support.",
    user_already_exists: "Für diese E-Mail-Adresse besteht bereits ein Konto.",
    user_session_already_exists: "Du bist bereits angemeldet.",
    user_session_not_found: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
    general_rate_limit_exceeded: "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.",
    general_argument_invalid: "Mindestens eine Eingabe ist ungültig. Bitte prüfe deine Angaben.",
    INVALID_OR_EXPIRED_IDENTITY: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
    ANONYMOUS_OR_DISABLED_IDENTITY: "Dieses Konto ist nicht aktiv oder die Sitzung ist abgelaufen.",
    VALID_BEARER_TOKEN_REQUIRED: "Bitte melde dich an, um diese Aktion auszuführen.",
    EMAIL_NOT_VERIFIED: "Bitte bestätige zuerst deine E-Mail-Adresse.",
    ACCOUNT_NOT_ACTIVE: "Dieses Konto ist derzeit nicht aktiv.",
    INVALID_EMAIL: "Bitte gib eine gültige E-Mail-Adresse ein.",
    INVALID_PASSWORD: "Das Passwort erfüllt die Sicherheitsanforderungen nicht.",
    AUTH_EMAIL_TOKEN_EXPIRED_OR_USED: "Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.",
    INVALID_AUTH_EMAIL_TOKEN: "Dieser Bestätigungslink ist ungültig.",
    AUTH_EMAIL_RATE_LIMITED: "Eine Nachricht wurde bereits angefordert. Bitte warte kurz, bevor du es erneut versuchst.",
    AUTH_EMAIL_DELIVERY_FAILED: "Die E-Mail konnte gerade nicht versendet werden. Bitte versuche es später erneut.",
    DELETION_REASON_REQUIRED: "Bitte gib einen kurzen Grund oder Hinweis zur Kontolöschung ein.",
    ACCOUNT_DELETION_CONFIRMATION_REQUIRED: "Bitte bestätige die Kontolöschung vollständig.",
    DELETION_BLOCKED_ADMINISTRATIVE_HOLD: "Die Löschung ist wegen einer rechtlich erforderlichen Sperre derzeit nicht möglich. Bitte kontaktiere den Support.",
    DELETION_BLOCKED_DELETION_JOB_HOLD: "Die Löschung wird bereits bearbeitet und kann momentan nicht erneut gestartet werden.",
    DELETION_BLOCKED_ALREADY_DELETED: "Dieses Konto wurde bereits gelöscht.",
    PROFILE_NOT_FOUND: "Die zugehörigen Kontodaten wurden nicht gefunden.",
    PRIVACY_PROFILE_REQUIRED: "Bitte vervollständige zuerst deine Datenschutz- und Wohnsitzangaben.",
    PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED: "Bitte bestätige zuerst die Datenschutzhinweise.",
    INVALID_PRIVACY_CHOICES: "Mindestens eine Datenschutzeinstellung ist ungültig.",
    PRIVACY_REQUEST_NOTE_REQUIRED: "Bitte beschreibe dein Anliegen etwas genauer.",
    PRIVACY_REQUEST_NOT_CANCELLABLE: "Diese Datenschutzanfrage kann nicht mehr zurückgezogen werden.",
    AGE_VERIFICATION_NOT_CONFIGURED: "Die Altersprüfung ist momentan nicht verfügbar. Bitte versuche es später erneut.",
    AGE_NOT_APPROVED: "Die Altersprüfung muss zuerst erfolgreich abgeschlossen werden.",
    AGE_ALREADY_APPROVED: "Deine Altersprüfung ist bereits abgeschlossen.",
    AGE_CASE_ALREADY_OPEN: "Es besteht bereits eine offene Altersprüfung.",
    REQUIRED_EVIDENCE_MISSING: "Bitte reiche alle für die gewählte Dokumentart erforderlichen Nachweise vollständig ein.",
    INVALID_AGE_DOCUMENT_TYPE: "Bitte wähle eine unterstützte Dokumentart.",
    AGE_DOCUMENT_TYPE_NOT_AVAILABLE_FOR_COUNTRY: "Diese Dokumentart ist für dein hinterlegtes Land nicht verfügbar.",
    EVIDENCE_KIND_NOT_REQUIRED: "Diese zusätzliche Dokumentseite wird für deine gewählte Dokumentart nicht benötigt.",
    EVIDENCE_SIZE_MISMATCH: "Die hochgeladene Datei konnte nicht vollständig verarbeitet werden. Bitte lade sie erneut hoch.",
    UNSUPPORTED_EVIDENCE_MEDIA_TYPE: "Dieses Dateiformat wird für die Altersprüfung nicht unterstützt.",
    AGE_UPLOAD_WINDOW_EXPIRED: "Das Upload-Zeitfenster ist abgelaufen. Bitte starte die Altersprüfung erneut.",
    EVIDENCE_STORAGE_UNAVAILABLE: "Die Prüfdateien konnten gerade nicht sicher gespeichert werden. Bitte versuche es später erneut.",
    INVALID_PRODUCT: "Die gewählte Membership ist nicht verfügbar.",
    PRODUCT_NOT_AVAILABLE: "Die gewählte Membership ist momentan nicht verfügbar.",
    MANUAL_MEMBERSHIP_USER_NOT_ELIGIBLE: "Eine Membership kann erst nach aktiver E-Mail- und Altersverifikation manuell vergeben werden.",
    PRODUCT_PURCHASE_LIMIT_REACHED: "Dieses Angebot kann pro Konto nur einmal gekauft werden.",
    CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED: "Bitte bestätige die Bestellbedingungen und Hinweise zu digitalen Inhalten.",
    INVALID_BILLING_DETAILS: "Bitte prüfe Namen und vollständige Rechnungsanschrift.",
    PAYMENT_ORDER_NOT_FOUND: "Der Zahlungsauftrag wurde nicht gefunden.",
    PAYMENT_ORDER_NOT_CANCELLABLE: "Dieser Zahlungsauftrag kann nicht mehr storniert werden.",
    ORDER_CREATION_INCOMPLETE: "Der Auftrag konnte nicht vollständig angelegt werden. Es wurde kein Zugang freigeschaltet.",
    INVOICE_TAX_IDENTIFIER_NOT_CONFIGURED: "Die Rechnung kann derzeit nicht rechtssicher erstellt werden. Bitte kontaktiere den Support.",
    SEPA_TRANSFER_NOT_CONFIGURED: "SEPA-Zahlungen sind momentan nicht verfügbar.",
    DEVICE_LIMIT_EXCEEDED: "Die maximale Anzahl registrierter Geräte ist erreicht.",
    DEVICE_CREDENTIAL_REVOKED: "Dieses Gerät wurde widerrufen. Bitte registriere ein anderes Gerät.",
    PAID_MEMBERSHIP_REQUIRED: "Diese Funktion ist ausschließlich für Exclusive Member verfügbar.",
    COMMENTS_DISABLED: "Kommentare sind für diesen Beitrag deaktiviert.",
    INVALID_COMMENT: "Bitte gib einen gültigen Kommentar ein.",
    CONTENT_NOT_FOUND: "Der gewünschte Beitrag wurde nicht gefunden.",
    RATE_LIMITED: "Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.",
    REQUEST_BODY_TOO_LARGE: "Die ausgewählte Datei oder Anfrage ist zu groß.",
    JSON_CONTENT_TYPE_REQUIRED: "Die Anfrage konnte technisch nicht verarbeitet werden.",
    INVALID_JSON: "Die übermittelten Daten konnten nicht verarbeitet werden.",
    ORIGIN_NOT_ALLOWED: "Diese Aktion ist von der aktuellen Website-Adresse nicht erlaubt.",
    MEMBERSHIP_API_NOT_CONFIGURED: "Der Mitgliederbereich ist momentan nicht erreichbar.",
    ADMIN_API_NOT_CONFIGURED: "Der Admin-Bereich ist momentan nicht erreichbar.",
    MEMBERSHIP_DATABASE_UNAVAILABLE: "Die Kontodaten sind momentan nicht erreichbar. Bitte versuche es später erneut.",
    IDENTITY_PROVIDER_UNAVAILABLE: "Die Anmeldung ist momentan nicht erreichbar. Bitte versuche es später erneut.",
    API_REQUEST_FAILED: "Die Anfrage konnte nicht abgeschlossen werden.",
    INVALID_API_RESPONSE: "Der Server hat keine gültige Antwort geliefert. Bitte versuche es erneut.",
    INTERNAL_ERROR: "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später erneut.",
  },
  en: {
    user_invalid_credentials: "The email address or password is incorrect.",
    user_password_mismatch: "The password you entered is incorrect.",
    user_blocked: "This account is currently restricted. Please contact support.",
    user_already_exists: "An account already exists for this email address.",
    user_session_already_exists: "You are already signed in.",
    user_session_not_found: "Your session has expired. Please sign in again.",
    general_rate_limit_exceeded: "Too many attempts. Please wait a moment and try again.",
    general_argument_invalid: "At least one entry is invalid. Please review your details.",
    INVALID_OR_EXPIRED_IDENTITY: "Your session has expired. Please sign in again.",
    ANONYMOUS_OR_DISABLED_IDENTITY: "This account is not active or the session has expired.",
    VALID_BEARER_TOKEN_REQUIRED: "Please sign in to perform this action.",
    EMAIL_NOT_VERIFIED: "Please confirm your email address first.",
    ACCOUNT_NOT_ACTIVE: "This account is currently not active.",
    INVALID_EMAIL: "Please enter a valid email address.",
    INVALID_PASSWORD: "The password does not meet the security requirements.",
    AUTH_EMAIL_TOKEN_EXPIRED_OR_USED: "This link has expired or has already been used. Please request a new link.",
    INVALID_AUTH_EMAIL_TOKEN: "This confirmation link is invalid.",
    AUTH_EMAIL_RATE_LIMITED: "A message was already requested. Please wait before trying again.",
    AUTH_EMAIL_DELIVERY_FAILED: "The email could not be sent right now. Please try again later.",
    DELETION_REASON_REQUIRED: "Please provide a short reason or note for the account deletion.",
    ACCOUNT_DELETION_CONFIRMATION_REQUIRED: "Please complete the account-deletion confirmation.",
    DELETION_BLOCKED_ADMINISTRATIVE_HOLD: "Deletion is currently unavailable because of a legally required hold. Please contact support.",
    DELETION_BLOCKED_DELETION_JOB_HOLD: "Deletion is already being processed and cannot be started again.",
    DELETION_BLOCKED_ALREADY_DELETED: "This account has already been deleted.",
    PROFILE_NOT_FOUND: "The associated account data could not be found.",
    PRIVACY_PROFILE_REQUIRED: "Please complete your privacy and residence information first.",
    PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED: "Please acknowledge the privacy notice first.",
    INVALID_PRIVACY_CHOICES: "At least one privacy setting is invalid.",
    PRIVACY_REQUEST_NOTE_REQUIRED: "Please describe your request in a little more detail.",
    PRIVACY_REQUEST_NOT_CANCELLABLE: "This privacy request can no longer be withdrawn.",
    AGE_VERIFICATION_NOT_CONFIGURED: "Age verification is currently unavailable. Please try again later.",
    AGE_NOT_APPROVED: "Age verification must be completed successfully first.",
    AGE_ALREADY_APPROVED: "Your age verification is already complete.",
    AGE_CASE_ALREADY_OPEN: "An age-verification request is already open.",
    REQUIRED_EVIDENCE_MISSING: "Please provide every item required for the selected document type.",
    INVALID_AGE_DOCUMENT_TYPE: "Please choose a supported document type.",
    AGE_DOCUMENT_TYPE_NOT_AVAILABLE_FOR_COUNTRY: "This document type is not available for your registered country.",
    EVIDENCE_KIND_NOT_REQUIRED: "This additional document side is not required for the selected document type.",
    EVIDENCE_SIZE_MISMATCH: "The uploaded file could not be processed completely. Please upload it again.",
    UNSUPPORTED_EVIDENCE_MEDIA_TYPE: "This file format is not supported for age verification.",
    AGE_UPLOAD_WINDOW_EXPIRED: "The upload window has expired. Please restart age verification.",
    EVIDENCE_STORAGE_UNAVAILABLE: "The verification files could not be stored securely right now. Please try again later.",
    INVALID_PRODUCT: "The selected membership is unavailable.",
    PRODUCT_NOT_AVAILABLE: "The selected membership is currently unavailable.",
    MANUAL_MEMBERSHIP_USER_NOT_ELIGIBLE: "A membership can only be granted after active email and age verification.",
    PRODUCT_PURCHASE_LIMIT_REACHED: "This offer can only be purchased once per account.",
    CHECKOUT_LEGAL_ACCEPTANCE_REQUIRED: "Please accept the order terms and digital-content notices.",
    INVALID_BILLING_DETAILS: "Please review the name and complete billing address.",
    PAYMENT_ORDER_NOT_FOUND: "The payment order could not be found.",
    PAYMENT_ORDER_NOT_CANCELLABLE: "This payment order can no longer be cancelled.",
    ORDER_CREATION_INCOMPLETE: "The order could not be created completely. No access was activated.",
    INVOICE_TAX_IDENTIFIER_NOT_CONFIGURED: "A compliant invoice cannot currently be created. Please contact support.",
    SEPA_TRANSFER_NOT_CONFIGURED: "SEPA payments are currently unavailable.",
    DEVICE_LIMIT_EXCEEDED: "The maximum number of registered devices has been reached.",
    DEVICE_CREDENTIAL_REVOKED: "This device has been revoked. Please register another device.",
    PAID_MEMBERSHIP_REQUIRED: "This feature is available exclusively to Exclusive Members.",
    COMMENTS_DISABLED: "Comments are disabled for this post.",
    INVALID_COMMENT: "Please enter a valid comment.",
    CONTENT_NOT_FOUND: "The requested post could not be found.",
    RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
    REQUEST_BODY_TOO_LARGE: "The selected file or request is too large.",
    JSON_CONTENT_TYPE_REQUIRED: "The request could not be processed.",
    INVALID_JSON: "The submitted data could not be processed.",
    ORIGIN_NOT_ALLOWED: "This action is not permitted from the current website address.",
    MEMBERSHIP_API_NOT_CONFIGURED: "The member area is currently unavailable.",
    ADMIN_API_NOT_CONFIGURED: "The admin area is currently unavailable.",
    MEMBERSHIP_DATABASE_UNAVAILABLE: "Account data is currently unavailable. Please try again later.",
    IDENTITY_PROVIDER_UNAVAILABLE: "Sign-in is currently unavailable. Please try again later.",
    API_REQUEST_FAILED: "The request could not be completed.",
    INVALID_API_RESPONSE: "The server returned an invalid response. Please try again.",
    INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
  },
};

const statusMessages = {
  de: {
    400: "Bitte prüfe deine Eingaben und versuche es erneut.",
    401: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
    403: "Du bist für diese Aktion nicht berechtigt.",
    404: "Die angeforderten Daten wurden nicht gefunden.",
    409: "Die Aktion kann im aktuellen Zustand nicht ausgeführt werden.",
    413: "Die ausgewählte Datei oder Anfrage ist zu groß.",
    415: "Das verwendete Dateiformat wird nicht unterstützt.",
    429: "Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.",
    500: "Der Dienst ist momentan nicht verfügbar. Bitte versuche es später erneut.",
  },
  en: {
    400: "Please review your entries and try again.",
    401: "Your session has expired. Please sign in again.",
    403: "You are not permitted to perform this action.",
    404: "The requested data could not be found.",
    409: "This action cannot be performed in the current state.",
    413: "The selected file or request is too large.",
    415: "The file format you used is not supported.",
    429: "Too many requests. Please wait a moment and try again.",
    500: "The service is currently unavailable. Please try again later.",
  },
};

function errorCode(error) {
  if (typeof error?.code === "string") return error.code;
  if (typeof error?.type === "string") return error.type;
  if (typeof error?.message === "string" && /^[A-Za-z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return null;
}

function errorStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (Number.isInteger(error?.code)) return error.code;
  return 0;
}

export function friendlyErrorMessage(error, language = "de", fallback = "") {
  const locale = language === "en" ? "en" : "de";
  const code = errorCode(error);
  const status = errorStatus(error);
  const statusKey = status >= 500 ? 500 : status;
  const base = (code && messages[locale][code])
    || statusMessages[locale][statusKey]
    || fallback
    || messages[locale].INTERNAL_ERROR;
  const requestId = typeof error?.requestId === "string"
    && /^[A-Za-z0-9._:-]{6,128}$/.test(error.requestId)
    ? error.requestId
    : null;
  if (!requestId || status < 500) return base;
  return `${base} ${locale === "de" ? "Referenz" : "Reference"}: ${requestId}`;
}
