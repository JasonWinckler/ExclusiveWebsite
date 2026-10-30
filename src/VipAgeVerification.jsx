import React, { useEffect, useRef, useState } from "react";
import { createAgeVerificationCase, uploadAgeEvidence, submitAgeVerificationCase } from "./lib/platform";
import { friendlyErrorMessage } from "./lib/error-messages";
import "../assets/css/vip-age.css";

const copy = {
  de: {
    ageTitle: "Sichere Altersverifikation",
    ageText: "Bestätige einmalig, dass du mindestens 18 Jahre alt bist. Deine Nachweise werden persönlich und ausschließlich für diese Entscheidung geprüft.",
    ageKicker: "PRIVATE IDENTITY REVIEW",
    ageAssuranceTitle: "Vertraulich von der Aufnahme bis zur Löschung",
    ageAssuranceText: "Deine Live-Aufnahmen gelangen verschlüsselt in einen privaten EU-Prüfbereich. Zugriff erhält nur der autorisierte Prüfer.",
    ageDeletionText: "Nach der Entscheidung werden alle Nachweise sofort gelöscht, ohne Entscheidung spätestens nach 48 Stunden.",
    ageCloudflareBadge: "Geschützt auf Cloudflare",
    agePrivateBadge: "Privater EU-Speicher",
    ageDeleteBadge: "Nachweis-Löschung ≤ 48h",
    ageSecurityDetails: "Technische Sicherheitsdetails",
    ageSecurityItems: [
      "Verschlüsselte HTTPS-Übertragung direkt an den geschützten Worker.",
      "Separater, nicht öffentlich erreichbarer Cloudflare-R2-Bucket mit EU-Jurisdiktion.",
      "Keine öffentlichen URLs, Freigabelinks, Werbenutzung oder Profilbildung.",
      "Jeder Zugriff im Admin-Bereich ist authentifiziert und wird protokolliert.",
    ],
    ageSteps: ["Dokument wählen", "Live-Challenge aufnehmen", "Persönliche Prüfung"],
    documentType: "Dokumentart",
    nationalId: "Personalausweis / nationale ID",
    passport: "Reisepass",
    drivingLicence: "Führerschein / staatliche Photo-ID",
    passportFront: "Reisepass – Datenseite",
    documentFront: "Ausweis – Vorderseite",
    documentBack: "Ausweis – Rückseite",
    video: "Live-Video mit Gesicht und Ausweis",
    videoInstructions: "Führe die unten angezeigte Einmal-Challenge ohne Unterbrechung aus. Aufnahme: mindestens 10, höchstens 20 Sekunden.",
    cameraStart: "Kamera starten",
    recordStart: "Live-Aufnahme starten",
    recordStop: "Aufnahme beenden",
    recordAgain: "Neu aufnehmen",
    videoReady: "Live-Video ist bereit",
    cameraError: "Die Kamera konnte nicht gestartet werden. Erlaube den Kamerazugriff und nutze einen aktuellen Browser über HTTPS.",
    verificationRules: "So gelingt deine Prüfung auf Anhieb",
    rules: [
      "Nutze deinen eigenen gültigen Lichtbildausweis im Original – keine Kopie oder Bildschirmaufnahme.",
      "Name, Foto, Geburtsdatum, Dokumentart, Ausstellungsland und Gültigkeit müssen lesbar sein. Andere Angaben darfst du abdecken.",
      "Achte auf gleichmäßiges Licht und ein scharfes Bild ohne Spiegelung, Filter oder weitere Personen.",
    ],
    watermarkNote: "Live-Fotos werden ohne Gerätemetadaten verarbeitet und als Kopie ausschließlich für die Altersprüfung gekennzeichnet.",
    livePhotoHint: "Ausschließlich jetzt live fotografieren · bestehende Dateien können nicht ausgewählt werden",
    photoCameraStart: "Live-Kamera öffnen",
    photoCapture: "Foto jetzt aufnehmen",
    photoAgain: "Foto neu aufnehmen",
    photoReady: "Live-Foto aufgenommen",
    photoQualityReady: "Lokale Qualitätsprüfung bestanden · keine Analysedaten gespeichert",
    photoQualityTooSmall: "Die Aufnahme ist zu klein. Halte den Ausweis näher an die Kamera und fotografiere erneut.",
    photoQualityLighting: "Die Aufnahme ist zu dunkel oder überbelichtet. Nutze gleichmäßiges Licht ohne Spiegelung.",
    photoQualityFocus: "Text und Sicherheitsmerkmale sind noch nicht scharf genug. Kamera ruhig halten und erneut fotografieren.",
    captureOnlyNotice: "Aus Sicherheitsgründen ist die Auswahl vorhandener Dateien deaktiviert. Nimm jede erforderliche Dokumentseite jetzt live auf.",
    consentText: "Ich bin mindestens 18 Jahre alt, verwende mein eigenes gültiges Dokument und habe die Datenschutz- und Löschhinweise gelesen.",
    beginVerification: "Sichere Prüfung starten",
    challengeTitle: "Deine persönliche Live-Challenge",
    agePrivacy: "Weitere Informationen zu Zweck, Löschung und deinen Datenschutzrechten:",
    submitAge: "Geschützt übermitteln",
    ageSubmitted: "Deine Nachweise sind sicher eingegangen und warten auf die persönliche Prüfung.",
    reviewReady: "Zur Prüfung eingereicht",
    fileRequired: "Bitte nimm alle erforderlichen Dokumentseiten und das Live-Video vollständig in diesem Prozess auf.",
    loading: "Wird verarbeitet …",
  },
  en: {
    ageTitle: "Secure age verification",
    ageText: "Confirm once that you are at least 18. Your evidence is personally reviewed and processed only for this decision.",
    ageKicker: "PRIVATE IDENTITY REVIEW",
    ageAssuranceTitle: "Confidential from capture to deletion",
    ageAssuranceText: "Your live captures are encrypted and transferred to a private EU review area. Only the authorised reviewer receives access.",
    ageDeletionText: "All evidence is deleted immediately after the decision, or automatically within 48 hours if no decision is made.",
    ageCloudflareBadge: "Protected on Cloudflare",
    agePrivateBadge: "Private EU storage",
    ageDeleteBadge: "Evidence deletion ≤ 48h",
    ageSecurityDetails: "Technical security details",
    ageSecurityItems: [
      "Encrypted HTTPS transfer directly to the protected Worker.",
      "Separate, non-public Cloudflare R2 bucket with EU jurisdiction.",
      "No public URLs, share links, advertising use or profiling.",
      "Every admin access is authenticated and logged.",
    ],
    ageSteps: ["Choose document", "Record live challenge", "Personal review"],
    documentType: "Document type",
    nationalId: "National identity card",
    passport: "Passport",
    drivingLicence: "Driving licence / state photo ID",
    passportFront: "Passport – data page",
    documentFront: "ID – front",
    documentBack: "ID – back",
    video: "Live video with face and ID",
    videoInstructions: "Complete the one-time challenge shown below without interruption. Record for 10 to 20 seconds.",
    cameraStart: "Start camera",
    recordStart: "Start live recording",
    recordStop: "Stop recording",
    recordAgain: "Record again",
    videoReady: "Live video is ready",
    cameraError: "The camera could not be started. Allow camera access and use a current browser over HTTPS.",
    verificationRules: "Get approved on your first attempt",
    rules: [
      "Use your own valid government-issued photo ID in its physical original form—never a copy or screen capture.",
      "Keep your name, portrait, date of birth, document type, issuing country and expiry date readable. You may cover other details.",
      "Use even light and keep the image sharp and glare-free, without filters or other people.",
    ],
    watermarkNote: "Live photos are processed without device metadata and marked as a copy solely for age verification.",
    livePhotoHint: "Live camera capture only · existing files cannot be selected",
    photoCameraStart: "Open live camera",
    photoCapture: "Take photo now",
    photoAgain: "Retake photo",
    photoReady: "Live photo captured",
    photoQualityReady: "Local quality check passed · no analysis data stored",
    photoQualityTooSmall: "The capture is too small. Move the ID closer to the camera and try again.",
    photoQualityLighting: "The capture is too dark or overexposed. Use even lighting without glare.",
    photoQualityFocus: "Text and security features are not sharp enough yet. Hold the camera steady and try again.",
    captureOnlyNotice: "For security, selecting existing files is disabled. Capture every required document side live now.",
    consentText: "I am at least 18, use my own valid document and have read the privacy and deletion information.",
    beginVerification: "Start secure verification",
    challengeTitle: "Your personal live challenge",
    agePrivacy: "More about purpose, deletion and your privacy rights:",
    submitAge: "Submit securely",
    ageSubmitted: "Your evidence arrived securely and is waiting for personal review.",
    reviewReady: "Submitted for review",
    fileRequired: "Please capture every required document side and the live video within this process.",
    loading: "Processing …",
  },
};

const challengeLabels = {
  de: {
    WRITE_AND_SHOW_CODE: "Den persönlichen 6-stelligen Code gut lesbar auf Papier schreiben und in die Kamera halten",
    FACE_CAMERA: "Gesicht frontal und vollständig zeigen",
    HOLD_ID_NEXT_TO_FACE: "Ausweis neben das Gesicht halten",
    SHOW_DOCUMENT_FRONT: "Vorderseite in die Kamera zeigen",
    SHOW_DOCUMENT_BACK: "Rückseite in die Kamera zeigen",
    TILT_DOCUMENT: "Ausweis langsam kippen, damit Sicherheitsmerkmale sichtbar werden",
    TURN_HEAD_LEFT: "Kopf nach links drehen",
    TURN_HEAD_RIGHT: "Kopf nach rechts drehen",
    LOOK_UP: "Nach oben schauen",
    BLINK_TWICE: "Zweimal deutlich blinzeln",
  },
  en: {
    WRITE_AND_SHOW_CODE: "Write the personal 6-digit code clearly on paper and hold it to the camera",
    FACE_CAMERA: "Show the full face from the front",
    HOLD_ID_NEXT_TO_FACE: "Hold the ID beside the face",
    SHOW_DOCUMENT_FRONT: "Show the front to the camera",
    SHOW_DOCUMENT_BACK: "Show the back to the camera",
    TILT_DOCUMENT: "Slowly tilt the ID to show security features",
    TURN_HEAD_LEFT: "Turn the head left",
    TURN_HEAD_RIGHT: "Turn the head right",
    LOOK_UP: "Look up",
    BLINK_TWICE: "Blink clearly twice",
  },
};

async function prepareIdCopy(file, side, language) {
  const bitmap = await createImageBitmap(file);
  try {
    const maximumDimension = 2560;
    const scale = Math.min(1, maximumDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const imageHeight = Math.max(1, Math.round(bitmap.height * scale));
    const bannerHeight = Math.max(72, Math.round(width * 0.07));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = imageHeight + bannerHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("IMAGE_PROCESSING_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, width, imageHeight);
    context.fillStyle = "#1b050a";
    context.fillRect(0, imageHeight, width, bannerHeight);
    context.fillStyle = "#fff5e7";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${Math.max(14, Math.round(width / 42))}px Inter, sans-serif`;
    const sideLabel = language === "de"
      ? side === "front" ? "VORDERSEITE" : "RÜCKSEITE"
      : side === "front" ? "FRONT" : "BACK";
    const purpose = language === "de" ? "KOPIE – NUR ALTERSPRÜFUNG" : "COPY – AGE VERIFICATION ONLY";
    context.fillText(`${purpose} · exclusive.jason-shadow.com · ${new Date().toISOString().slice(0, 10)} · ${sideLabel}`, width / 2, imageHeight + bannerHeight / 2, width - 28);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("IMAGE_PROCESSING_FAILED")),
      "image/jpeg",
      0.92,
    ));
    return new File([blob], `age-id-${side}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
function VerificationRules({ ui }) {
  return <details className="verification-rules">
    <summary><span aria-hidden="true">✓</span><strong>{ui.verificationRules}</strong><small>+</small></summary>
    <div><ol>{ui.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol><p>{ui.watermarkNote}</p></div>
  </details>;
}

function VerificationJourney({ ui, activeStep = 1 }) {
  return <div className="verification-journey" aria-label={ui.ageTitle}>
    {ui.ageSteps.map((step, index) => <div
      className={index + 1 <= activeStep ? "is-active" : ""}
      key={step}
    ><span>{index + 1}</span><strong>{step}</strong></div>)}
  </div>;
}

function VerificationAssurance({ ui }) {
  return <aside className="verification-assurance">
    <div className="verification-assurance__icon" aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M16 3 27 7v8c0 7-4.5 11.5-11 14C9.5 26.5 5 22 5 15V7l11-4Z" /><path d="m11 16 3 3 7-8" /></svg>
    </div>
    <div className="verification-assurance__content">
      <h3>{ui.ageAssuranceTitle}</h3>
      <p>{ui.ageAssuranceText}</p>
      <p className="verification-deletion-notice">{ui.ageDeletionText}</p>
      <div className="verification-trust-badges" aria-label={ui.ageSecurityDetails}>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M8 8h8M9 16h6" /></svg>{ui.ageCloudflareBadge}</span>
        <span>{ui.agePrivateBadge}</span>
        <span>{ui.ageDeleteBadge}</span>
      </div>
      <details className="verification-security-details">
        <summary>{ui.ageSecurityDetails}</summary>
        <ul>{ui.ageSecurityItems.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
    </div>
  </aside>;
}

function LivePhotoCapture({ label, complete, value, onChange, ui, disabled, side }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const cameraRequestRef = useRef(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [qualityPassed, setQualityPassed] = useState(false);

  const stopStream = () => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mountedRef.current) setCameraReady(false);
  };

  useEffect(() => {
    if (!value) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopStream(); };
  }, []);

  const startCamera = async () => {
    setError("");
    setQualityPassed(false);
    onChange(null);
    stopStream();
    const requestId = cameraRequestRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_UNAVAILABLE");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (!mountedRef.current || requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_PREVIEW_UNAVAILABLE");
      video.srcObject = stream;
      setCameraReady(true);
      // Mobile browsers may expire the original tap while showing the
      // permission prompt. Keep the valid stream and let autoplay resume once
      // the preview becomes visible instead of reporting a false denial.
      if (video.readyState < 2) {
        await new Promise((resolve) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          window.setTimeout(resolve, 1_500);
        });
      }
      if (mountedRef.current && requestId === cameraRequestRef.current) {
        void video.play().catch(() => undefined);
      }
    } catch {
      stopStream();
      if (mountedRef.current) setError(ui.cameraError);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, 1920 / video.videoWidth, 1920 / video.videoHeight);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (canvas.width < 960 || canvas.height < 540) {
      setError(ui.photoQualityTooSmall);
      return;
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let squared = 0;
    let sharpness = 0;
    let samples = 0;
    let previous = -1;
    for (let index = 0; index < pixels.length; index += 64) {
      const luminance = .2126 * pixels[index] + .7152 * pixels[index + 1] + .0722 * pixels[index + 2];
      total += luminance;
      squared += luminance * luminance;
      if (previous >= 0) sharpness += Math.abs(luminance - previous);
      previous = luminance;
      samples += 1;
    }
    const mean = total / Math.max(1, samples);
    const contrast = Math.sqrt(Math.max(0, squared / Math.max(1, samples) - mean * mean));
    if (mean < 45 || mean > 220 || contrast < 18) {
      setError(ui.photoQualityLighting);
      return;
    }
    if (sharpness / Math.max(1, samples - 1) < 6) {
      setError(ui.photoQualityFocus);
      return;
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (blob && mountedRef.current) {
      onChange(new File([blob], `live-id-${side}.jpg`, { type: "image/jpeg" }));
      setQualityPassed(true);
      setError("");
      stopStream();
    }
  };

  if (complete) {
    return <div className="live-photo-capture is-complete">
      <div className="live-photo-capture__head"><span aria-hidden="true">✓</span><div><strong>{label}</strong><small>{ui.photoReady}</small></div></div>
    </div>;
  }

  return <div className={`live-photo-capture${value ? " is-complete" : ""}`}>
    <div className="live-photo-capture__head"><span aria-hidden="true">{value ? "✓" : side === "front" ? "01" : "02"}</span><div><strong>{label}</strong><small>{ui.livePhotoHint}</small></div></div>
    {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}
    {qualityPassed && value && <p className="local-quality-pass">✓ {ui.photoQualityReady}</p>}
    <div className="camera-frame" hidden={!cameraReady && !previewUrl}>
      <video ref={videoRef} muted playsInline autoPlay hidden={!cameraReady} />
      {previewUrl && !cameraReady && <img src={previewUrl} alt="" />}
    </div>
    {!cameraReady && !value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.photoCameraStart}</button>}
    {cameraReady && <button className="primary-action" type="button" disabled={disabled} onClick={capturePhoto}>{ui.photoCapture}</button>}
    {value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.photoAgain}</button>}
    <canvas ref={canvasRef} hidden />
  </div>;
}

function ageDocumentOptions(countryCode, ui) {
  if (countryCode === "DE") {
    return [
      { value: "NATIONAL_ID", label: ui.nationalId },
      { value: "PASSPORT", label: ui.passport },
    ];
  }
  if (countryCode === "US") {
    return [
      { value: "DRIVING_LICENCE", label: ui.drivingLicence },
      { value: "PASSPORT", label: ui.passport },
    ];
  }
  return [
    { value: "NATIONAL_ID", label: ui.nationalId },
    { value: "PASSPORT", label: ui.passport },
    { value: "DRIVING_LICENCE", label: ui.drivingLicence },
  ];
}
function LiveVideoRecorder({ ui, value, onChange, disabled, challenge, challengeCode, language }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const cameraRequestRef = useRef(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  const stopStream = () => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mountedRef.current) setCameraReady(false);
  };

  useEffect(() => {
    if (!value) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopStream();
      chunksRef.current = [];
    };
  }, []);

  const startCamera = async () => {
    setError("");
    onChange(null);
    stopStream();
    const requestId = cameraRequestRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("CAMERA_UNAVAILABLE");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!mountedRef.current || requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_PREVIEW_UNAVAILABLE");
      video.srcObject = stream;
      setCameraReady(true);
      setSeconds(0);
      if (video.readyState < 2) {
        await new Promise((resolve) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          window.setTimeout(resolve, 1_500);
        });
      }
      if (mountedRef.current && requestId === cameraRequestRef.current) {
        void video.play().catch(() => undefined);
      }
    } catch {
      stopStream();
      if (mountedRef.current) setError(ui.cameraError);
    }
  };

  const stopRecording = () => {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    try {
      chunksRef.current = [];
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 2_000_000 })
        : new MediaRecorder(streamRef.current, { videoBitsPerSecond: 2_000_000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      const startedAt = Date.now();
      recorder.onstop = () => {
        clearInterval(intervalRef.current);
        clearTimeout(timeoutRef.current);
        if (!mountedRef.current) { chunksRef.current = []; return; }
        if (Date.now() - startedAt < 10_000) {
          chunksRef.current = [];
          setRecording(false);
          setError(ui.videoInstructions);
          stopStream();
          return;
        }
        const contentType = recorder.mimeType.split(";", 1)[0] || "video/webm";
        const extension = contentType === "video/mp4" ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: contentType });
        if (blob.size) onChange(new File([blob], `live-age-verification.${extension}`, { type: contentType }));
        chunksRef.current = [];
        setRecording(false);
        stopStream();
      };
      recorder.start(500);
      setRecording(true);
      setSeconds(0);
      intervalRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
      timeoutRef.current = setTimeout(stopRecording, 20_000);
    } catch {
      if (mountedRef.current) setError(ui.cameraError);
      stopStream();
    }
  };

  return <div className="live-recorder">
    <div className="live-recorder__head"><strong>{ui.video}</strong><span>{recording ? `${seconds}s / 20s` : value ? "✓" : ""}</span></div>
    <p>{ui.videoInstructions}</p>
    {challengeCode && <div className="liveness-code-card">
      <span>{language === "de" ? "DEIN EINMAL-CODE" : "YOUR ONE-TIME CODE"}</span>
      <strong aria-label={challengeCode.split("").join(" ")}>{challengeCode}</strong>
      <p>{language === "de"
        ? "Schreibe diesen Code auf einen Zettel und halte ihn während der ungeschnittenen Aufnahme gut sichtbar in die Kamera."
        : "Write this code on paper and keep it clearly visible during the uncut recording."}</p>
    </div>}
    <ol className="challenge-list">{challenge.map((step) => <li key={step}>{(challengeLabels[language] || challengeLabels.de)[step] || step}</li>)}</ol>
    {error && <p className="form-notice form-notice--error" role="alert">{error}</p>}
    <div className="camera-frame">{previewUrl && !cameraReady ? <video src={previewUrl} controls playsInline /> : <video ref={videoRef} muted playsInline autoPlay />}</div>
    <div className="camera-actions">
      {!cameraReady && !value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.cameraStart}</button>}
      {cameraReady && !recording && <button className="primary-action" type="button" disabled={disabled} onClick={startRecording}>{ui.recordStart}</button>}
      {recording && <button className="danger-action" type="button" disabled={seconds < 10} onClick={stopRecording}>{ui.recordStop}</button>}
      {value && <button className="secondary-action" type="button" disabled={disabled} onClick={startCamera}>{ui.recordAgain}</button>}
    </div>
    {value && <p className="live-recorder__ready">{ui.videoReady}</p>}
  </div>;
}

/** Optional identity review for the separately authorized VIP private area.
 * The parent may render this only for active VIP members. Every API operation
 * independently enforces that entitlement on the server.
 */
export default function VipAgeVerification({
  language = "en", ageVerification = null, countryCode = "DE",
  onComplete, onNotice, busy = false,
}) {
  const ui = copy[language] || copy.en;
  const de = language === "de";
  const [localCase, setLocalCase] = useState(null);
  const [documentType, setDocumentType] = useState(ageVerification?.documentType || (countryCode === "US" ? "DRIVING_LICENCE" : "NATIONAL_ID"));
  const [documentFront, setDocumentFront] = useState(null);
  const [documentBack, setDocumentBack] = useState(null);
  const [liveVideo, setLiveVideo] = useState(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(Date.now);
  const mountedRef = useRef(true);
  const workingRef = useRef(false);
  const latestVerificationRef = useRef(ageVerification);
  const localCaseSourceSnapshotRef = useRef(ageVerification);
  latestVerificationRef.current = ageVerification;
  const activeCase = localCase || ageVerification;
  const approved = activeCase?.status === "APPROVED";
  const pendingReview = activeCase?.status === "PENDING" && activeCase?.reviewStatus === "READY_FOR_REVIEW";
  const uploadDeadline = Date.parse(activeCase?.uploadExpiresAt || "");
  const expired = activeCase?.reviewStatus === "UPLOADING" && Number.isFinite(uploadDeadline) && uploadDeadline <= clock;
  const uploading = activeCase?.caseId && activeCase?.status === "PENDING" && activeCase?.reviewStatus === "UPLOADING" && !expired;
  const disabled = busy || working;
  const requiredKinds = new Set(activeCase?.requiredEvidence || (documentType === "PASSPORT" ? ["DOCUMENT_FRONT", "VIDEO"] : ["DOCUMENT_FRONT", "DOCUMENT_BACK", "VIDEO"]));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(uploadDeadline) || !uploading) return undefined;
    const timer = setTimeout(() => {
      setClock(Date.now());
      setDocumentFront(null); setDocumentBack(null); setLiveVideo(null);
    }, Math.max(0, uploadDeadline - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [uploadDeadline, uploading]);

  useEffect(() => {
    if (!localCase && ageVerification?.documentType) setDocumentType(ageVerification.documentType);
  }, [ageVerification?.documentType, localCase]);

  useEffect(() => {
    // Membership status omits caseId after a case leaves PENDING. A new
    // authoritative snapshot still supersedes our local upload/review state.
    // The snapshot that preceded creation must not cancel a new retry case.
    const terminal = ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED", "RETRY_REQUIRED"].includes(ageVerification?.status);
    const sameCase = ageVerification?.caseId === localCase?.caseId;
    const refreshedWithoutCase = !ageVerification?.caseId && ageVerification !== localCaseSourceSnapshotRef.current;
    if (localCase?.caseId && terminal && (sameCase || refreshedWithoutCase)) {
      setLocalCase(null);
      setDocumentFront(null); setDocumentBack(null); setLiveVideo(null);
      setNotice("");
      onNotice?.("");
    }
  }, [ageVerification, localCase?.caseId, onNotice]);

  const announce = (message) => {
    if (!mountedRef.current) return;
    setNotice(message);
    onNotice?.(message);
  };
  const errorText = (error) => {
    const code = error?.code || error?.message;
    if (["VIP_MEMBERSHIP_REQUIRED", "ACTIVE_VIP_REQUIRED", "VIP_ENTITLEMENT_REQUIRED"].includes(code)) return de ? "Für diesen optionalen Bereich benötigst du eine aktive VIP Shadow Mitgliedschaft." : "This optional area requires an active VIP Shadow membership.";
    if (["AGE_UPLOAD_WINDOW_EXPIRED", "AGE_REVIEW_WINDOW_EXPIRED"].includes(code)) return de ? "Die Frist ist abgelaufen. Bitte aktualisiere deinen Mitgliedschaftsstatus und starte bei Bedarf eine neue Prüfung." : "The review window has expired. Refresh your membership status and start a new review if needed.";
    return friendlyErrorMessage(error, language, de ? "Die Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut." : "The request could not be completed. Please try again.");
  };
  const begin = async (event) => {
    event.preventDefault();
    if (disabled || workingRef.current || !event.currentTarget.reportValidity()) return;
    workingRef.current = true; setWorking(true); announce("");
    try {
      const created = await createAgeVerificationCase({ documentType });
      if (!mountedRef.current) return;
      setDocumentFront(null); setDocumentBack(null); setLiveVideo(null);
      localCaseSourceSnapshotRef.current = latestVerificationRef.current;
      setLocalCase({ ...created, evidenceKinds: created.evidenceKinds || [] });
      setClock(Date.now());
    } catch (error) { announce(errorText(error)); }
    finally { workingRef.current = false; if (mountedRef.current) setWorking(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (disabled || workingRef.current || !uploading || !event.currentTarget.reportValidity()) return;
    const uploaded = new Set(activeCase?.evidenceKinds || []);
    const files = { DOCUMENT_FRONT: documentFront, DOCUMENT_BACK: documentBack, VIDEO: liveVideo };
    if ([...requiredKinds].some((kind) => !uploaded.has(kind) && (!(files[kind] instanceof File) || !files[kind].size))) {
      announce(ui.fileRequired); return;
    }
    workingRef.current = true; setWorking(true); announce("");
    if (!localCase) localCaseSourceSnapshotRef.current = latestVerificationRef.current;
    try {
      for (const kind of requiredKinds) {
        if (uploaded.has(kind)) continue;
        const file = kind === "VIDEO" ? liveVideo : await prepareIdCopy(files[kind], kind === "DOCUMENT_FRONT" ? "front" : "back", language);
        if (!mountedRef.current) return;
        await uploadAgeEvidence(activeCase.caseId, kind, file);
        if (!mountedRef.current) return;
        uploaded.add(kind);
        setLocalCase({ ...activeCase, evidenceKinds: [...uploaded] });
        if (kind === "DOCUMENT_FRONT") setDocumentFront(null);
        if (kind === "DOCUMENT_BACK") setDocumentBack(null);
        if (kind === "VIDEO") setLiveVideo(null);
      }
      if (!mountedRef.current) return;
      const result = await submitAgeVerificationCase(activeCase.caseId);
      if (!mountedRef.current) return;
      setLocalCase({ ...activeCase, ...result, status: "PENDING", reviewStatus: "READY_FOR_REVIEW", evidenceKinds: [...uploaded] });
      setDocumentFront(null); setDocumentBack(null); setLiveVideo(null);
      announce(ui.ageSubmitted);
      // The review was submitted successfully even if a parent refresh fails.
      try { await onComplete?.(result); } catch { announce(ui.ageSubmitted); }
    } catch (error) { announce(errorText(error)); }
    finally { workingRef.current = false; if (mountedRef.current) setWorking(false); }
  };

  return <div className="vip-age-panel" aria-busy={disabled}>
    <p className="vip-age-optional">{de
      ? "Optional für den separaten privaten VIP-Bereich. Deine Musik-Inhalte und übrigen Mitgliedschaftsvorteile bleiben unabhängig von dieser Prüfung verfügbar."
      : "Optional for the separate VIP private area. Your music content and other membership benefits remain available independently of this review."}</p>
    <p className="modal-intro verification-lead">{ui.ageText}</p>
    <VerificationJourney ui={ui} activeStep={approved || pendingReview ? 3 : uploading ? 2 : 1} />
    <VerificationAssurance ui={ui} />
    {notice && <p className="form-notice" role="status">{notice}</p>}
    {approved ? <p className="vip-age-status" role="status">{de ? "Deine Altersprüfung ist abgeschlossen." : "Your age verification is complete."}</p>
      : pendingReview ? <p className="vip-age-status" role="status"><strong>{ui.reviewReady}</strong><span>{ui.ageSubmitted}</span></p>
      : !uploading ? <form className="auth-panel verification-start" onSubmit={begin}>
        {(expired || ["EXPIRED", "REJECTED", "RETRY_REQUIRED", "CANCELLED"].includes(activeCase?.status)) && <p className="upload-note">{de ? "Du kannst eine neue Prüfung starten. Für den neuen Fall benötigst du neue Live-Aufnahmen." : "You can start a new review. A new case requires new live captures."}</p>}
        <label className="form-field"><span>{ui.documentType}</span><select value={documentType} disabled={disabled} onChange={(event) => setDocumentType(event.target.value)}>{ageDocumentOptions(countryCode, ui).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        <VerificationRules ui={ui} />
        <p className="upload-note">{ui.agePrivacy} <a href="/legal/eu/#privacy" target="_blank" rel="noreferrer">{de ? "Datenschutzhinweise" : "Privacy notice"}</a></p>
        <label className="consent-check"><input name="consent" type="checkbox" required disabled={disabled} /><span>{ui.consentText}</span></label>
        <button className="primary-action verification-primary" type="submit" disabled={disabled}>{disabled ? ui.loading : ui.beginVerification}</button>
      </form> : <form className="auth-panel verification-upload" onSubmit={submit}>
        <div className="verification-document-badge"><span>01</span><div><strong>{ui.documentType}</strong><small>{ageDocumentOptions(countryCode, ui).find((option) => option.value === documentType)?.label}</small></div></div>
        <p className="upload-note">{ui.captureOnlyNotice}</p>
        <VerificationRules ui={ui} />
        <p className="eyebrow">{ui.challengeTitle}</p>
        <LivePhotoCapture key={`${activeCase.caseId}-front`} label={documentType === "PASSPORT" ? ui.passportFront : ui.documentFront} complete={activeCase.evidenceKinds?.includes("DOCUMENT_FRONT")} value={documentFront} onChange={setDocumentFront} ui={ui} disabled={disabled} side="front" />
        {requiredKinds.has("DOCUMENT_BACK") && <LivePhotoCapture key={`${activeCase.caseId}-back`} label={ui.documentBack} complete={activeCase.evidenceKinds?.includes("DOCUMENT_BACK")} value={documentBack} onChange={setDocumentBack} ui={ui} disabled={disabled} side="back" />}
        {activeCase.evidenceKinds?.includes("VIDEO") ? <p className="live-recorder__ready">✓ {ui.videoReady}</p> : <LiveVideoRecorder key={`${activeCase.caseId}-video`} ui={ui} value={liveVideo} onChange={setLiveVideo} disabled={disabled} challenge={activeCase.livenessChallenge || []} challengeCode={activeCase.livenessCode} language={language} />}
        <label className="consent-check"><input name="consent" type="checkbox" required disabled={disabled} /><span>{ui.consentText}</span></label>
        <button className="primary-action verification-primary" type="submit" disabled={disabled}>{disabled ? ui.loading : ui.submitAge}</button>
      </form>}
  </div>;
}
