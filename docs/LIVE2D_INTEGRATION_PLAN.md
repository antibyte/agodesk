# Live2D Integration Plan (Punkt 3)

**Ziel:** Eine reichhaltige, animierte Live2D-Avatar-Integration (Cubism 5 bevorzugt) für agodesk, die über das aktuelle canvas-basierte `SpeechBackgroundVisualizer` hinausgeht. Alternativ / als erster Schritt: Expression-Mapping direkt auf dem bestehenden Visualizer.

**Hintergrund (aus Open-LLM-VTuber Analyse):**
- LLM wird per System-Prompt instruiert, Emotion-Tags wie `[joy]`, `[anger]` inline in den generierten Text einzubauen.
- Backend/Frontend parst die Tags → triggert Expressions/Motions auf dem Avatar.
- Tags werden für TTS und Chat-Display entfernt (clean text).
- Separate Side-Channel für visuelle Aktionen (DisplayText + Actions).
- User kann auf den Avatar klicken → Hit-Areas triggern gewichtete Motions (tapMotions).
- Idle-Motions, Skalierung, persistente Viewer-State.
- Lip-Sync über Audio-Analyse oder SDK.

**Aktueller Stand in agodesk (Stand der Untersuchung):**
- `SpeechBackgroundVisualizer.svelte`: Sehr ausgereiftes reaktives Canvas (Waveforms, Spectrum-Bars, Particles, Constellation, Shimmer). Getrieben von `speech-visualizer-audio.ts` (AnalyserNode).
- `onAssistantText(text)` in `ChatView.svelte` (via `speech-flow.ts` → `gemini-live.ts`): Fügt Text direkt als Assistant-Message hinzu. Text kommt als Chunks aus `extractAssistantText` (modelTurn.parts oder outputTranscription).
- Audio-Playback: `SpeechAudioPlayback` (PCM-Chunks von Gemini native audio).
- Analyser aktuell primär vom Mic-Capture (`speech-audio.ts` + `getSpeechAudioAnalyser` in speech-flow). Für AI-Voice-Visualisierung wird der Playback-Stream (noch) nicht direkt analysiert.
- Persona-System: `personaState`, `persona-flow.ts`, `persona-asset-fetch.ts`, Assets kommen über WS (`persona.assets`). `PersonaAvatar.svelte` ist nur ein kleines Bild/Label.
- System-Prompts: `speech-tools.ts` (`buildAgentSystemInstruction`, `resolvePersonaInstructionLead`).
- Keine bestehende Expression/Emotion-Logik.
- Tauri + Svelte 5 Webview → Live2D-Web-SDK (Canvas) ist sehr gut integrierbar.
- Realtime Gemini Live Session mit Tool-Calls und nativem Audio-Output.

**Optionen**
1. **Full Live2D** (empfohlen für "Punkt 3"): Echter animierter Charakter mit Expressions, Lip-Sync, Touch-Interaction. Ersetzt oder ergänzt den Visualizer (z.B. zentraler Avatar-Bereich + Visualizer als Background).
2. **Expression-Mapping auf bestehendem Visualizer** (leichter Einstieg / Fallback): Parse Tags → verändere CSS-Vars, Partikel-Verhalten, Farben, Waveform-Intensität etc. pro Emotion. Schnell umsetzbar, keine neuen Dependencies.
3. **Hybrid**: Live2D als primärer "Kopf/Figur", Visualizer als atmosphärischer Background. Live2D kann ein-/ausgeschaltet werden.

**Empfohlene Architektur (Full Path)**
- Neuer Service: `src/lib/services/avatar-expression.ts` (Parser, Event-Emitter für Expressions/Actions, Clean-Text Helper).
- Erweiterung der Persona: `live2dModelName` oder `live2dModelRef` (lokal oder via Assets).
- Neuer Component: `Live2DAvatar.svelte` (Canvas + Live2D SDK Instanz). Props: model, currentExpression, onTap etc.
- Erweiterung `SpeechBackgroundVisualizer` oder neuer Layer: `AvatarLayer.svelte` in `ChatView`.
- Hook in `onAssistantText` (oder besser früher in `gemini-live` Extractor) → `processAssistantText(text)` → emits expressions + cleaned text.
- System-Prompt-Erweiterung in `speech-tools.ts`.
- Asset-Management: Neuer Ordner `public/live2d-models/` (oder `src-tauri/resources`), Model-Definition via `model_dict.json` ähnlich Open-LLM-VTuber (Name, url, emotionMap, tapMotions, scale, idleMotionGroup).
- Lip-Sync: Treibe Mouth-Parameter aus den bestehenden `SpeechAudioMetrics` (energy/mid) oder baue Playback-Analyser auf.
- Events/State: Einfacher Svelte-Store `avatarState` (currentEmotion, isSpeaking, modelInfo) oder direkte Props + Custom Events.
- Interaktion: Avatar-Bereich erhält Pointer-Events → hitTest + random Motion aus tapMotions.
- Config: Settings oder pro Persona (lokal erweiterbar, später Backend-Sync).

**Phasen-Plan**

## Phase 0: Vorbereitung & Research (1-2 Tage)
- [ ] Live2D SDK auswählen und POC:
  - Empfehlung: Offizielles Live2D Cubism SDK für Web + minimaler Pixi oder reines Canvas-Beispiel (siehe Open-LLM-VTuber Migration zu official SDK).
  - Alternative: `pixi-live2d-display` (einfach, aber prüfen auf Cubism 5 Support).
  - Test: Ein einfaches .model3.json + Texturen in `public/live2d-models/shizuku/` laden und auf Canvas rendern (mit Skalierung, idle Motion).
- [ ] Lizenz prüfen (Live2D Free Material License – siehe Open-LLM-VTuber `LICENSE-Live2D.md`).
- [ ] 1-2 Sample-Modelle hinzufügen (Shizuku oder vergleichbar; User können eigene importieren).
- [ ] `model_dict.json` Struktur definieren (kompatibel zu Open-LLM-VTuber wo sinnvoll).
- [ ] Bestehenden Visualizer-Analyser-Flow analysieren (Mic vs. Playback) und entscheiden, ob Playback-Analyser für besseres Lip-Sync hinzugefügt wird.
- [ ] `npm run check` + Tests laufen lassen als Baseline.
- Deliverable: POC-Branch oder temporärer Test-Component, der ein Live2D-Modell rendert und per Button eine Expression triggert.

## Phase 1: Expression-Parsing & Side-Channel (Foundation, 2-3 Tage)
- [ ] Neuen Service `src/lib/services/avatar-expression.ts`:
  - `const EMOTION_TAGS = ['joy', 'anger', 'sadness', 'surprise', 'fear', 'neutral', ...];`
  - `extractEmotions(text: string): number[] | string[]` (ähnlich `live2d_model.extract_emotion`).
  - `stripEmotionTags(text: string): string` (ähnlich `remove_emotion_keywords`).
  - Streaming-fähiger Akkumulator (da Chunks ankommen): `createExpressionStream()` → gibt `{ cleanText, expressions: [] }` bei jedem Chunk oder bei Tag-Abschluss.
  - Event-Emitter oder Svelte-Store für `avatarExpression` (emotion, intensity?, timestamp).
- [ ] In `gemini-live.ts` oder `speech-flow.ts` die `onAssistantText` Pipeline anreichern:
  - `const processed = processAssistantUtterance(rawText);`
  - `emitAvatarExpressions(processed.expressions);`
  - `options.onAssistantText?.(processed.cleanText);` (oder separater Callback).
- [ ] Chat-Message-Handling anpassen (`ChatView.svelte` `onAssistantText`): Verwende den cleaned Text für `addMessage`. Optional: Roh-Text mit Tags in einer separaten "thinking" Spalte speichern (Vorbereitung auf Inner-Thoughts).
- [ ] Erste Tests: Unit-Tests für Parser (`avatar-expression.test.ts`).
- [ ] System-Prompt-Update in `speech-tools.ts`:
  - Füge zu `buildAgentSystemInstruction` (und ggf. `buildTranscription...`) einen Abschnitt hinzu:
    ```
    Verfügbare Avatar-Expressionen (inline in deine Antworten einbauen, z.B. "Super! [joy]"):
    [neutral], [joy], [anger], [sadness], [surprise], ...
    Die Tags steuern den sichtbaren Avatar, werden aber nicht gesprochen.
    ```
  - Persona-spezifisch erweiterbar (später pro Model emotionMap injizieren).
- [ ] Kleiner Store `src/lib/stores/avatar.ts` (currentEmotion, lastEmotions, modelName).
- Deliverable: Tags aus Gemini-Antworten werden erkannt, Chat zeigt clean Text, Expression-Events feuern (kann vorerst console.log + Dummy-UI).

## Phase 2: Visual Layer – Expression-Mapping auf bestehendem Visualizer (Quick Win / Fallback)
- [ ] Erweitere `SpeechBackgroundVisualizer.svelte`:
  - Akzeptiere `emotion?: string` Prop.
  - Mappe Emotion zu:
    - CSS-Vars ( `--speech-accent`, pulse color, shimmer speed/intensity).
    - Particle-Behavior (mehr/weniger, andere Orbit-Geschwindigkeit).
    - Waveform-Amplitude oder Bar-Farben pro Emotion.
  - Übergang: Emotion persistiert kurz, fällt auf neutral zurück nach Ende der Äußerung.
- [ ] Verdrahte in `ChatView.svelte`: `<SpeechBackgroundVisualizer ... emotion={currentEmotion} />`.
- [ ] Optional: Emotion-spezifische "idle" vs. "speaking" States.
- Deliverable: Ohne neue Dependencies reagiert der bestehende schöne Visualizer bereits auf [joy] etc. (Farbe, Intensität). Gut als sofort nutzbarer Teilerfolg und Fallback.

## Phase 3: Full Live2D Component & Integration
- [ ] Dependency hinzufügen (nach POC-Entscheidung), z.B.:
  - `pixi.js` + passendes live2d-display (oder reines Cubism Web Framework).
  - Oder ein dediziertes `live2d-svelte` Wrapper falls verfügbar (sonst eigene Canvas-Komponente).
- [ ] `src/lib/components/Live2DAvatar.svelte`:
  - Props: `modelName`, `emotion`, `speaking`, `metrics?` (für Lip-Sync), `onTap(area?)`.
  - Lädt Model aus `model_dict.json` + Pfad unter `/live2d-models/...`.
  - Rendert auf Canvas (DPR-aware, Resize-Handling wie Visualizer).
  - Setzt Expressions via `model.expression(index or name)`.
  - Startet Idle-Motion-Group.
  - Lip-Sync: Einfach `paramMouthOpenY = energy * factor + speaking ? ...` (später erweitern mit Cubism LipSync oder Audio-Features).
  - Touch: `hitTest(x, y)` → wähle Motion aus `tapMotions[area]` mit Gewichtung (Zufall).
- [ ] Asset-Loading:
  - `public/live2d-models/` (Vite kopiert automatisch).
  - Loader-Klasse analog `Live2dModel` aus Open-LLM-VTuber (`_lookup_model_info`, `emotionMap` normalisieren, `emo_str` für Prompt).
  - Erweiterung des Persona-Systems: `personaState` um `live2dModelName` erweitern oder separater Avatar-Config-Store.
- [ ] Layout in `ChatView.svelte`:
  - Visualizer bleibt Background (z-index 0).
  - Neuer Avatar-Container (zentral oder rechts, z-index 1, pointer-events auto für Interaktion).
  - Toggle: Settings → "Avatar-Modus: Visualizer | Live2D | Hybrid".
- [ ] Persona-Integration:
  - Erweitere `applyPersonaAssets` / Protocol um optionales `live2d_model`.
  - Lokale Fallback-Config: `settings.live2d.defaultModel` + Mapping pro Persona.
- Deliverable: Live2D-Figur erscheint, reagiert auf [joy] etc. aus dem LLM, Lip-Sync rudimentär, Klicks triggern Motions.

## Phase 4: Polishing, Lip-Sync, Interaction, Config
- [ ] Verbessertes Lip-Sync:
  - Erzeuge AnalyserNode auch für den Playback (in `SpeechAudioPlayback` oder separat in `gemini-live`).
  - Expose `getSpeechPlaybackAnalyser()` parallel zum Capture.
  - Nutze für präziseres Mouth-Open (oder nutze die vorhandenen Metrics + separate Mouth-Kurve).
- [ ] Erweiterte Actions:
  - `tapMotions`, `idleMotionGroupName`, `kScale`, `initialX/Yshift` aus Model-Config.
  - Motion-Trigger aus LLM (z.B. `[motion:shake]`) optional.
- [ ] UI:
  - Avatar-Größe per Wheel/Pinch (persist via localStorage, wie in Open-LLM-VTuber).
  - Emotion-Debug-Overlay (optional, nur Dev).
  - Settings: Model-Auswahl, Emotion-Map-Editor (später).
- [ ] Per-Character Config: Erweitere lokale `characters/`-Logik oder Settings-Presets.
- [ ] i18n: Tags bleiben englisch (intern). UI-Texte (z.B. "Avatar-Modell") übersetzen.
- [ ] Performance: DPR cap (2), Canvas-Größe begrenzen, Motion-Updates throttlen.
- Deliverable: Natürliches Gefühl – Figur "lebt", reagiert auf Sprache + Berührung, skaliert/resized sauber.

## Phase 5: Testing, Robustheit, Dokumentation
- [ ] Unit-Tests: Parser, strip, emotion extraction, Model-Loader.
- [ ] Integration: `gemini-live.test.ts` erweitern um Mock-Texte mit Tags.
- [ ] Manuelle Tests: Verschiedene Gemini-Modelle (inkl. Reasoning-Modelle), lange Antworten mit mehreren Tags, schnelle Chunks, Interrupt während Speaking.
- [ ] Edge-Cases: Kein Model verfügbar → Fallback auf Visualizer + PersonaAvatar. Ungültige Tags ignorieren. Model-Lade-Fehler graceful (mit User-Hinweis).
- [ ] `npm run check`, `npm test`, `cargo check` (falls Rust-Änderungen).
- [ ] Dokumentation:
  - Update `README.md` und `docs/`.
  - `docs/LIVE2D_MODELS.md` (wie Modelle hinzufügen, emotionMap konfigurieren, eigene .model3.json).
  - Lizenz-Hinweis.
- [ ] Optional: Erste Backend-Erweiterung (Persona kann Live2D-Ref liefern).

**Abhängigkeiten & Änderungen (ungefähre Liste)**
- Frontend `package.json`: Neue Dev/Prod Deps für Live2D + Pixi (genaue nach POC).
- Neue Dateien:
  - `src/lib/services/avatar-expression.ts` (+ Test)
  - `src/lib/components/Live2DAvatar.svelte`
  - `src/lib/stores/avatar.ts` (optional)
  - `public/live2d-models/...` + `model_dict.json` (Root oder `src/lib/assets/`)
  - `docs/LIVE2D_MODELS.md`
- Geänderte Dateien:
  - `src/lib/components/ChatView.svelte`
  - `src/lib/services/speech-tools.ts` (Prompt)
  - `src/lib/services/speech-flow.ts` / `gemini-live.ts` (Parsing-Hook)
  - `src/lib/services/persona-flow.ts` + `stores/persona.ts` + Protocol (falls Backend-Assets)
  - `SpeechBackgroundVisualizer.svelte` (für Hybrid/Expression-Mapping)
  - `src/lib/services/speech-audio-playback.ts` oder `speech-flow.ts` (besserer Playback-Analyser)
- Tauri-spezifisch: Keine großen Rust-Änderungen nötig (alles Webview). Eventuell Permissions für lokale Model-Dateien falls User-Upload.

**Risiken & Mitigations**
- Performance im Webview (besonders Windows): POC früh + DPR-Limit + Canvas-Größen-Optimierung.
- Lizenz & Model-Bereitstellung: Nur freie Sample-Modelle bundleln, klare Anleitung für User-Modelle.
- Streaming-Chunks + Tags: Guter Akkumulator/Parser ist entscheidend (nicht pro Chunk flushen).
- Gemini native Audio vs. Text: Text-Teile aus modelTurn sind die zuverlässigste Quelle für Tags (nicht nur outputTranscription).
- Kompatibilität mit bestehendem Visualizer & Layout: Immer als Layer denken, nicht ersetzen ohne Toggle.
- i18n/Persona: Tags sind sprachunabhängig (Englisch-Keywords), Persona-Prompts auf Deutsch.

**Fallback-Pfad (Expression-Mapping ohne Live2D)**
Falls Full-Live2D aufwendiger ist als erwartet oder User keine Modelle haben wollen: Phase 2 allein liefert schon spürbaren Mehrwert ("die Figur fühlt sich emotionaler an") und kann später nahtlos auf Live2D erweitert werden.

**Definition of Done (MVP Full)**
- Ein Sample-Live2D-Modell rendert und animiert (idle + eine Expression).
- LLM-Antworten mit `[joy]` etc. verändern die Figur sichtbar.
- Tags werden nicht im Chat-Text und nicht gesprochen.
- Klick auf die Figur triggert eine Motion.
- Rudimentärer Lip-Sync bei AI-Sprache.
- Umschaltbar mit bestehendem Visualizer.
- Alle Checks/Tests grün.
- Kurze Anleitung in den Docs.

**Nächste Schritte nach diesem Plan**
1. Phase 0 POC starten (Live2D rendern + einfacher Button-Trigger).
2. Parser (Phase 1) parallel oder danach implementieren – das ist der größte "Wow"-Effekt mit wenig visuellem Aufwand.
3. User-Feedback einholen (welche Emotionen? Welche Modelle bevorzugt?).
4. Später mit anderen Punkten kombinieren (z.B. Inner Thoughts als separater Text-Layer über dem Avatar).

**Quellen / Inspiration**
- Open-LLM-VTuber: `live2d_model.py`, `websocket_handler.py`, TTSTaskManager, model_dict.json, emotionMap, tapMotions, CLAUDE.md Architektur, Docs.
- Bestehender Code: SpeechBackgroundVisualizer, gemini-live Extractors, speech-tools Prompts, persona-Flow.

Dieser Plan ist so gestaltet, dass er inkrementell umsetzbar ist und jeder Phase einen nutzbaren Fortschritt liefert (auch ohne Full-Live2D).

---

*Erstellt auf Basis der Analyse von Open-LLM-VTuber + Codebase-Exploration von agodesk (Tauri + Svelte Speech/Persona Pipeline).*