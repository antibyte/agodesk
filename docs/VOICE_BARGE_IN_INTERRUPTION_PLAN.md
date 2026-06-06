# Robuste Voice Interruption (Barge-in) ohne Kopfhörer – Implementierungsplan

**Ziel:** Der User soll die KI **natürlich unterbrechen** können, während sie spricht — auch ohne Kopfhörer (also wenn die Lautsprecher die eigene Stimme in das Mikrofon zurückspielen). Die Unterbrechung soll **sofort** (lokal) erfolgen und zuverlässig funktionieren.

Dies ist eines der wichtigsten "natürlich wirkt"-Features für eine Voice-Companion-App (siehe Open-LLM-VTuber Analyse).

---

## Aktueller Stand in agodesk (Analyse)

**Was bereits gut funktioniert:**
- `SpeechAudioPlayback.interrupt()` existiert und leert die PCM-Queue + schließt den AudioContext (sofortiges Stoppen der KI-Stimme).
- Gemini Live Protokoll unterstützt `serverContent.interrupted: boolean`.
- In `gemini-live.ts`:
  - `handleModelAudioOutput`: Bei `interrupted` → `audioPlayback.interrupt()`.
  - `processInputTranscription`: Behandelt `interrupted` (setzt Partial-Transcript zurück).
- Mic-Capture (`SpeechAudioCapture` in `speech-audio.ts`):
  - `getUserMedia` mit `echoCancellation: true, noiseSuppression: true, autoGainControl: true`.
  - Kontinuierliches Senden von 16kHz PCM-Chunks via `sendAudio()` an Gemini.
- Wenn Gemini serverseitig eine Unterbrechung erkennt (User-Sprache im Input-Stream während der Generierung), signalisiert es `interrupted` → Playback stoppt.
- `voiceResponses: true` (native Audio-Modelle wie gemini-2.5-flash-native-audio) → KI spricht direkt PCM.

**Probleme bei "ohne Kopfhörer":**
- **Keine client-seitige VAD** (Voice Activity Detection). Die Erkennung hängt komplett von Gemini ab.
- Das Mikrofon nimmt die laute KI-Stimme aus den Lautsprechern auf → der an Gemini gesendete Audio-Stream enthält Echo der eigenen Stimme.
- Echo-Cancellation hilft, ist aber bei lauten Speakern + empfindlichem Mic oft unzureichend. Gemini "hört sich selbst" und erkennt User-Barge-in unzuverlässig oder verzögert.
- Kein **sofortiger lokaler Interrupt** bei User-Sprache (man muss warten, bis der Server roundtrip `interrupted` zurückschickt).
- Audio wird weiterhin an Gemini gesendet, während die KI spricht → verschmutzt den Kontext.
- Kein separater VAD-Pfad (im Gegensatz zu Open-LLM-VTuber mit Silero VAD auf `raw-audio-data`).
- `getSpeechAudioAnalyser()` liefert aktuell nur den **Input**-Analyser (Mic). Es gibt keinen direkten Analyser für den Playback (KI-Stimme).
- Kein Zustand "AI is currently speaking / playback active" der von einem VAD-Wächter genutzt werden kann.

**Zusammenfassung:** Barge-in funktioniert derzeit nur "gut mit Kopfhörern" oder wenn Gemini zufällig starkes Echo trotz AEC erkennt.

---

## Ziel-Architektur (inspiriert von Open-LLM-VTuber)

1. **Client-seitiger VAD** (unabhängig von Gemini).
2. Während KI spricht (`voiceResponses && audioPlayback aktiv`):
   - VAD läuft aggressiv auf dem Mic-Stream.
   - Bei Erkennung von User-Sprache:
     - **Sofort** lokales `audioPlayback.interrupt()` (kein Roundtrip, <50ms Feedback).
     - Optional: Audio-Upload pausieren oder markieren.
     - Gemini den neuen User-Sprach-Stream schicken lassen → Gemini unterbricht seine Generierung (oder wir senden explizit ein Signal).
3. Separate Verarbeitungspfade:
   - Normaler Capture-Pfad für die KI (wie jetzt).
   - Dedizierter VAD-Pfad (kann dieselben Rohdaten nutzen oder einen zweiten ScriptProcessor/AudioWorklet).
4. Gute Echo-Handhabung:
   - Bestehende AEC + gute Thresholds.
   - Optional später: Playback-Signal als Referenz für Acoustic Echo Cancellation (AEC) im VAD (bekanntes Playback-Signal subtrahieren).
5. Klare Zustände:
   - `aiSpeaking` / `playbackActive`.
   - VAD nur im "Barge-Watch"-Modus aktiv, wenn KI spricht.

**VAD-Technologie-Empfehlungen (Browser/Tauri):**
- **Stark empfohlen für Robustheit:** Silero VAD via ONNX Runtime Web (WASM). Genau dasselbe Modell wie in vielen modernen Systemen (Open-LLM-VTuber verwendet ähnliche sherpa-onnx/Silero).
  - Bibliotheken: `@ricky0123/vad-web`, `vad` Pakete, oder eigenes onnxruntime-web + silero_vad.onnx.
- **Schneller Einstieg / Fallback:** Energy-basiertes VAD auf Basis des **bereits vorhandenen** `createSpeechAudioSampler` + `SpeechAudioMetrics` (energy, speaking, mid etc.). Gut für POC.
- Hybrid: Energy-VAD als Trigger + Silero für Bestätigung.
- Alternative (Tauri-spezifisch): Kleiner Rust-Sidecar mit Silero, aber für Mic-Latenz ist reines Web besser.

**Wichtige Stellen im Code, die erweitert werden müssen:**
- `SpeechAudioPlayback.interrupt()` (bereits gut).
- `gemini-live.ts`: `handleModelAudioOutput`, `sendAudio`, neue Methode z. B. `signalBargeIn()`.
- `speech-audio.ts`: `SpeechAudioCapture` — VAD-Integration oder separater VAD-Listener.
- `speech-flow.ts`: Session-Management, neue Optionen für VAD-Callbacks.
- `speech-visualizer-audio.ts`: Bestehende Metrics können wiederverwendet werden.
- `speechState` / neuer `speechPlaybackState`.
- `ChatView.svelte` / SpeechControl für UI-Feedback ("Unterbrochen").

---

## Phasen-Plan (inkrementell, jede Phase liefert Wert)

### Phase 0: Analyse & POC (1–2 Tage)
- [ ] Detaillierte Aufnahme des aktuellen Audio-Pfads während `voiceResponses`:
  - Wann wird `audioPlayback` erzeugt?
  - Wie fließen PCM-Chunks (Gemini → enqueue)?
  - Wie läuft der Mic-Stream parallel (Capture → sendAudio)?
- [ ] Testen des aktuellen Verhaltens ohne Kopfhörer (User spricht laut während KI spricht).
- [ ] POC 1: Energy-basierter Barge-Detector.
  - Erweitere `createSpeechAudioSampler` oder baue `createBargeInDetector(metricsProvider, onBargeIn)` .
  - Aktiviere ihn nur, wenn `aiIsSpeaking` (Playback aktiv + letzte Audio-Chunks < X ms her).
  - Bei Detection: Sofort `audioPlayback.interrupt()` aufrufen (aus dem Session-Kontext).
- [ ] POC 2 (optional parallel): Silero VAD WASM minimal einbinden und auf Mic-Stream laufen lassen (Thresholds kalibrieren).
- [ ] Definiere klare "AI is speaking"-Zustände (siehe unten).
- Deliverable: POC, bei dem man ohne Kopfhörer die KI durch Sprechen unterbrechen kann und sie sofort verstummt (auch wenn Gemini noch nicht reagiert hat).

### Phase 1: "AI is Speaking" State + Lokaler Sofort-Interrupt (2–3 Tage)
- [ ] Erweitere `SpeechAudioPlayback`:
  - Füge `isPlaying` / `onPlaybackStart` / `onPlaybackEnd` Events oder Observable hinzu.
  - Besser: `getIsActive()` oder ein kleines internes Flag + Callback.
- [ ] Neuen oder erweiterten State:
  - In `speechState` (oder separatem `playbackState` Store): `aiSpeaking: boolean`, `lastPlaybackTime`.
  - Oder direkt in der `GeminiLiveSession` verwalten (da dort `audioPlayback` lebt).
- [ ] In `gemini-live.ts`:
  - `handleModelAudioOutput`: Setze "speaking" State beim ersten Audio-Chunk.
  - Bei `interrupted` oder Ende der Chunks: State zurücksetzen + `audioPlayback.interrupt()` (falls nicht schon).
  - Neue Methode: `signalUserBargeIn()` (kann später erweitert werden).
- [ ] In `speech-flow.ts`:
  - Expose `getAiSpeaking()` oder reagiere auf Callbacks.
  - Neue Option in `SpeechSessionOptions`: `onBargeIn?: () => void`.
- [ ] Verdrahtung in `ChatView.svelte` (im `toggleSpeechSession` Aufruf):
  - Wenn Barge-In erkannt → lokale Aktionen (z. B. Status auf "listening" setzen, Partial-Transcript löschen, neue User-Turn starten).
- [ ] Sofort-Interrupt-Logik:
  ```ts
  if (aiIsSpeaking && userVADDetected) {
    audioPlayback.interrupt();
    session.signalBargeIn?.();
    // Optional: capture.pauseSendingForBarge() oder einfach weiterlaufen lassen
  }
  ```
- Deliverable: KI verstummt **sofort lokal**, sobald User spricht (auch bevor Gemini `interrupted` schickt). State ist korrekt.

### Phase 2: Dedizierter VAD-Pfad & Barge-Watch-Modus (3–5 Tage)
- [ ] Entscheide VAD-Stack:
  - **Empfehlung MVP:** Erweitere den bestehenden Analyser-basierten Sampler zu einem vollwertigen `BargeInDetector`.
  - **Robust:** Füge Silero VAD hinzu (`vad-web` oder custom onnxruntime-web + Modell). Modell kann gebündelt werden (klein, ~ few MB).
- [ ] Erweiterung von `SpeechAudioCapture`:
  - Optionaler Modus: `enableVad(onSpeechStart, onSpeechEnd)` oder separater VAD-Node.
  - Wichtig: VAD läuft **immer** auf dem Mic-Stream (auch während KI spricht).
  - Während `aiSpeaking === true`: Schärfere Thresholds oder dedizierte "barge" Logik (kürzere Hold-Time).
- [ ] Separater VAD-Handler (ähnlich Open-LLM-VTuber `raw-audio-data`):
  - `rawAudioForVad` oder einfach im gleichen Capture-Prozessor.
  - Bei Speech-Start im Barge-Modus:
    - `audioPlayback.interrupt()`
    - `callbacks.onBargeIn?.()` oder direkt Status-Update.
    - Optional: Kurze Pause des Chunk-Sendens oder Senden eines "barge" Markers (falls Gemini es unterstützt — aktuell reicht der Sprach-Stream).
- [ ] Integration mit Gemini:
  - Nach lokalem Interrupt den laufenden Mic-Stream weiter an Gemini senden.
  - Gemini sollte (durch die neue User-Sprache) selbst `interrupted` senden oder die Generierung abbrechen.
  - Bei Bedarf: Nach Barge-In kurz die Session in einen "user turn" Zustand versetzen.
- [ ] Echo-Mitigation:
  - Dokumentiere aktuelle AEC.
  - POC: Während KI spricht, die bekannten Playback-Samples als Referenz nutzen (einfache Subtraktion im Zeitbereich oder adaptive Filter — fortgeschritten).
- Deliverable: Zuverlässiges Barge-in ohne Kopfhörer in typischen Desktop-Setups (Laptop-Lautsprecher + Built-in Mic).

### Phase 3: Polishing, State-Machine, UX & Edge-Cases (2–3 Tage)
- [ ] Vollständige State-Machine für Speech:
  - `idle | listening | aiSpeaking | interrupted | processing`.
  - Visuelles Feedback (z. B. im `SpeechBanner` oder Visualizer: "Unterbrochen" oder schneller Übergang zurück zu "listening").
- [ ] UI:
  - Sofortiges Stoppen der Visualizer-Animationen / Shimmer beim Interrupt.
  - Optional: Kurzer "Barge-In" Sound oder Haptic (falls später).
- [ ] Umgang mit False-Positives:
  - Debounce / Hold-Time (z. B. 150–300ms Sprachaktivität bevor Interrupt).
  - "KI spricht gerade" → VAD muss deutlich lauter/anders als das Echo sein.
- [ ] Interaktion mit anderen Features:
  - AgentMode + Tools: Interrupt soll Tool-Calls nicht kaputt machen.
  - Group-ähnliche Szenarien (falls später).
  - `stopSpeechSession` muss sauber aufräumen (VAD deaktivieren).
- [ ] Non-voiceResponses-Modus: Auch hier Barge-in unterstützen (über Text-Generierung).
- [ ] Performance: VAD nicht in jedem Audio-Process-Event teuer rechnen (throttlen oder in AudioWorklet auslagern — ScriptProcessor ist deprecated).
- Deliverable: Solides, getestetes Feature mit guter UX.

### Phase 4: Testing, Robustheit, Dokumentation
- [ ] Manuelle Tests (kritisch):
  - Mit Kopfhörern (sollte weiterhin perfekt funktionieren).
  - Ohne Kopfhörer (Laptop Speaker + Mic, externe Speaker, verschiedene Lautstärken).
  - Schnelles Hin-und-Her (User unterbricht, spricht weiter, KI reagiert auf den Rest).
  - Stille Phasen, Hintergrundgeräusche, lautes Tippen.
- [ ] Automatisierte Tests:
  - Erweitere `gemini-live.test.ts` mit `interrupted` Szenarien.
  - Neue Tests für `BargeInDetector` / VAD-Logik (mit Mock-Analyser oder Mock-Audio-Buffer).
- [ ] Fehlerbehandlung:
  - VAD-Fehler → Fallback auf reines Gemini-`interrupted`.
  - AudioContext-Probleme nach vielen Interrupts.
- [ ] Dokumentation:
  - Update Settings-Hilfe-Texte ("Barge-in funktioniert jetzt auch ohne Kopfhörer dank lokaler Spracherkennung").
  - `docs/VOICE_BARGE_IN.md` mit Erklärung des Mechanismus und bekannten Limitationen.
- [ ] Optional: Einstellung "Barge-in Sensitivität" (low / medium / high) in den Speech-Settings.

---

## Technische Umsetzungsdetails (wichtige Dateien)

**Neue / stark erweiterte Dateien:**
- `src/lib/services/speech-vad.ts` (oder `barge-in-detector.ts`) — Detector-Klasse mit `startWatching(aiSpeakingProvider)`, `onBargeIn`.
- Erweiterung `src/lib/services/speech-audio.ts` (VAD-Modus in `SpeechAudioCapture`).
- `src/lib/services/speech-audio-playback.ts` — bessere Events für "isActive".
- `src/lib/stores/speech.ts` — `aiSpeaking` Flag (oder in Session kapseln).

**Zentrale Änderungen:**
- `src/lib/services/gemini-live.ts`:
  - `handleModelAudioOutput` erweitern (State + sofortiger lokaler Interrupt).
  - `sendAudio` optional pausierbar machen.
  - Neue öffentliche Methode `requestInterrupt()` oder `handleClientBargeIn()`.
- `src/lib/services/speech-flow.ts`:
  - VAD-Callbacks durchreichen.
  - `getSpeechPlaybackAnalyser()` (für besseren Lip-Sync später + VAD).
- `src/lib/components/ChatView.svelte`:
  - Barge-In-Handler im Session-Setup.
- `src/lib/services/speech-visualizer-audio.ts`:
  - Metrics wiederverwenden oder erweitern für VAD.

**Abhängigkeiten (bei Silero-Pfad):**
- `onnxruntime-web` + Silero-Modell (klein, kann in `public/models/` liegen).
- Alternativ ein fertiges `vad` npm-Paket (prüfen auf Bundle-Größe und Lizenz).

---

## Risiken & Mitigation

- **Echo / False Positives:** Gute Thresholds + Hold-Time + hybrider Detector (Energy + Silero). Später echte AEC mit Playback-Referenz.
- **Latenz:** Client-seitiger Interrupt ist der große Gewinn (lokal < 50ms). Server-Roundtrip bleibt für die semantische Reaktion der KI.
- **Deprecated Audio-APIs:** ScriptProcessorNode → langfristig zu AudioWorklet migreren (kann parallel zum VAD-Work geschehen).
- **Gemini-spezifisch:** Verlass dich nicht nur auf `interrupted`. Der Client-Interrupt ist unabhängig und robust.
- **Performance auf schwachen Geräten:** VAD nur aktivieren, wenn `voiceResponses && aiSpeaking`. Silero-Modell ist klein.
- **Kompatibilität mit bestehendem Flow:** Immer Fallback auf aktuelles Gemini-`interrupted` Verhalten.

---

## Definition of Done (MVP)

- User kann die KI während des Sprechens durch normales Reden unterbrechen.
- Die Stimme stoppt **sofort lokal** (auch ohne Internet/ Server-Reaktion).
- Funktioniert ohne Kopfhörer in typischen Setups.
- Keine Regression bei Kopfhörer-Nutzung.
- Saubere Zustände und UI-Feedback.
- `npm run check` + relevante Tests grün.
- Kurze Dokumentation.

---

## Nächste Schritte nach diesem Plan

1. Phase 0 POC starten (Energy-basiert + lokaler Interrupt aus dem bestehenden Analyser).
2. "aiSpeaking" State sauber in die GeminiLiveSession bringen.
3. Entscheidung Silero vs. Energy-Only treffen (Energy reicht für ersten guten Effekt).
4. Mit dem Live2D-Plan (Punkt 3) kombinieren: Während KI spricht → Avatar reagiert; bei Barge-In → Avatar unterbricht und hört zu.

Dieses Feature hat extrem hohen "Wow"- und Natürlichkeits-Faktor und ist relativ isoliert umsetzbar.

---

*Erstellt auf Basis der Codebase-Untersuchung (gemini-live.ts, SpeechAudioPlayback, SpeechAudioCapture, visualizer Metrics) + Open-LLM-VTuber Barge-in Muster (Silero VAD, raw-audio-path, sofortiger lokaler Interrupt).*