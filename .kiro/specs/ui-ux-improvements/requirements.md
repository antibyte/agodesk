# Requirements Document

## Introduction

agodesk ist eine Tauri-2-/Svelte-5-Desktop-Anwendung mit Chat, Pairing, Einstellungen, Integrationen, Sprachausgabe/-eingabe (Gemini Live, lokale ASR/TTS), Persona-Darstellung, Remote-Steuerung und 16 Sprachen. Das bestehende UI besitzt ein solides Designtoken-System (Light/Dark, Glaspaneele, Fokus-Ring, Reduced-Motion), zeigt aber eine Reihe von UX-Schwächen, die in dieser Spec adressiert werden:

- Inkonsistente Iconographie (gemischte Stroke-Weiten, Unicode-Glyphen ◉/◎/⚠ neben SVG, abweichende Icon-Button-Größen 2.25 rem vs. 2.625 rem),
- Lückenhafte Barrierefreiheit (Modal ohne Fokusfalle und ohne Fokus-Rückkehr, fehlendes `aria-modal`, Statuspunkt nur als `<span>` mit `aria-label`, Backdrops als Buttons ohne semantische Dialog-Region),
- Geringe Kontrastwerte bei sekundärem Text (Zeitstempel `opacity: 0.55` auf 0.6875 rem, Footnote `opacity: 0.75`),
- Fehlende globale Toast-/Live-Region für ephemere Rückmeldungen außerhalb des Chats,
- LTR-only-Layout (CSS nutzt `padding-left`/`border-left` statt logischer Eigenschaften),
- Lade-Skelette nicht durchgängig genutzt (Lazy Modals zeigen Klartext „Settings"),
- Defekt erscheinende Banner-Tonalität (`data-tone="warn"` im SpeechBanner trifft kein CSS, da nur `warning` definiert ist),
- Inkonsistente Modal-Z-Index-Schichten (21 für Cert-Modal, 30 für Header-Panels, 2 für Statusleiste),
- Fehlende Tastaturnavigation in Overflow-Menü, Verlauf-Panel und Integrations-Panel (keine Pfeiltasten, kein Roving-Tabindex),
- Kein einheitliches Verhalten beim Schließen (Klick außerhalb, ESC, Backdrop) über Modal/Panel/Settings hinweg,
- Composer mit zwei sehr ähnlich gefärbten Buttons (Stop rot, Senden Akzent) – schlechte Unterscheidbarkeit bei Farbsehschwäche.

Ziel dieser Spec ist ein konkreter, umsetzbarer Plan für deutliche UI/UX-Verbesserungen, der Konsistenz, Barrierefreiheit (WCAG 2.1 AA), Internationalisierung (inkl. RTL), responsives Verhalten, Lade-/Leer-/Fehlerzustände, Mikro-Interaktionen und die Auffindbarkeit zentraler Funktionen messbar verbessert.

## Glossary

- **App**: Die agodesk-Tauri-Anwendung (Frontend + Rust-Backend).
- **UI_Shell**: Wurzel-Komponente `App.svelte` inklusive Statusleiste, Bannerstapel, Chat- und Eingabebereich.
- **StatusBar**: Komponente `StatusBar.svelte`, oberer Header mit Verbindungs-Pill, Toggle-Buttons und Fenstersteuerung.
- **ChatView**: Komponente `ChatView.svelte`, dirigiert Header-Panels, Banner, Nachrichtenliste und Composer.
- **MessageList**: Komponente `MessageList.svelte`, scrollbare Nachrichtenliste inkl. Empty-State und Scroll-zum-Ende-FAB.
- **MessageBubble**: Komponente `MessageBubble.svelte`, einzelne Nachrichtenblase (User/Assistant/System).
- **Composer**: Komponente `InputBox.svelte`, Eingabefeld inkl. Anhang-Pills, Sprach-Toggle, Stop- und Senden-Button.
- **Modal**: Bildschirmfüllendes Dialogfenster (z. B. `CertificateTrustModal`, `IntegrationEmbedModal`).
- **HeaderPanel**: Aufklappbares, oben verankertes Panel (`ChatHistoryPanel`, `IntegrationsPanel`, `SystemWarningsPanel`).
- **Banner**: Schmaler Hinweisstreifen im Banner-Stack (`PairingBanner`, `RemoteControlBanner`, `SpeechBanner`).
- **DesignToken**: Eine in `src/app.css` definierte CSS-Custom-Property (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--transition-*`, `--focus-ring`, `--blur*`).
- **ThemeMode**: Wert aus `{"system", "light", "dark"}` (siehe `src/lib/services/theme.ts`).
- **Locale**: Zweistelliger Sprach-Code aus `APP_LOCALES` (16 Sprachen, plus `"system"`).
- **RtlLocale**: Eine `Locale`, deren Schreibrichtung „rechts-nach-links" ist (z. B. `ar`, `he`, `fa`, `ur`).
- **FocusRing**: Sichtbarer Outline-Ring gemäß CSS-Variable `--focus-ring`.
- **ReducedMotion**: Browser-Präferenz `prefers-reduced-motion: reduce`.
- **ContrastRatio**: Verhältnis der relativen Luminanz nach WCAG 2.1 (Werte ≥ 4.5 für normalen Text, ≥ 3.0 für Großtext und UI-Komponenten).
- **LiveRegion**: ARIA-Region (`role="status"` oder `role="alert"`) zur akustischen/assistiven Bekanntgabe.
- **ToastService**: Neuer, globaler Dienst zur Anzeige kurzzeitiger Hinweise (Erfolg/Warnung/Fehler) außerhalb des Chats.
- **HotkeyField**: Komponente `HotkeyField.svelte` zur Aufzeichnung systemweiter Tastenkürzel.
- **Hotkey**: Normalisierte Tastenkürzel-Zeichenkette wie `"Alt+Shift+G"` (siehe `services/show-window-hotkey.ts`).
- **OverflowMenu**: Kompakt-Variante der Statusleisten-Aktionen, getriggert über `aria-haspopup="menu"`-Button.

## Requirements

### Requirement 1: Konsistente Iconographie und Designsystem-Primitive

**User Story:** Als Anwender möchte ich ein optisch konsistentes Erscheinungsbild aller interaktiven Elemente, damit ich Funktionen schneller erkenne und mich nicht an ungleichen Buttongrößen, Strichstärken oder Symbolstilen störe.

#### Acceptance Criteria

1. THE App SHALL alle Icon-Buttons mit derselben Mindestgröße von 2.25 rem × 2.25 rem (`--ui-btn-icon-size`) rendern, sodass `Composer`, `StatusBar`, `WindowControls` und Header-Panels identische Trefferflächen besitzen.
2. THE App SHALL für alle Inline-SVG-Icons eine einheitliche Strichstärke (`stroke-width`) von 2.0 verwenden.
3. THE App SHALL alle ikonischen Glyphen (z. B. Augen-Symbole im `PairingBanner`, Warn-Glyphe „⚠" im `SpeechBanner`) durch SVG-Icons aus einem zentralen Icon-Set ersetzen.
4. WHEN ein Icon-Button keinen sichtbaren Text trägt, THE App SHALL ein nicht-leeres `aria-label` und ein `title`-Attribut über `i18n` bereitstellen.
5. THE App SHALL die Brand-Marke in der Statusleiste als SVG-Logo anstelle eines reinen Buchstabens „A" rendern.

### Requirement 2: Barrierefreiheit nach WCAG 2.1 AA – Kontrast und Textlesbarkeit

**User Story:** Als Anwender mit eingeschränkter Sehkraft möchte ich, dass Text und UI-Komponenten klar erkennbar sind, damit ich die App ohne Anstrengung benutzen kann.

#### Acceptance Criteria

1. THE App SHALL für jeden Textinhalt eine `ContrastRatio` von mindestens 4.5 zur dahinterliegenden festen Hintergrundfarbe (Light- und Dark-Theme) erreichen.
2. THE App SHALL für UI-Komponenten und Großtext (≥ 18.66 px regulär oder ≥ 14 px fett) eine `ContrastRatio` von mindestens 3.0 erreichen.
3. THE App SHALL Zeitstempel in `MessageBubble` mit einer Mindestschriftgröße von 0.75 rem und einer Opazität ≥ 0.7 rendern.
4. THE App SHALL die Fußnote im `Composer` mit einer Opazität ≥ 0.85 oder einer eigenen Farbtoken-Variable rendern, die WCAG 2.1 AA erfüllt.
5. WHERE ein `Banner` oder `Glaspaneel` einen halbtransparenten Hintergrund verwendet, THE App SHALL eine zusätzliche solide Hintergrundschicht mit einer Mindest-Opazität von 0.85 unter dem Text rendern.

### Requirement 3: Sichtbarer Fokus und Tastaturnavigation

**User Story:** Als Tastatur-Benutzer möchte ich jederzeit erkennen, welches Element fokussiert ist und alle Funktionen ohne Maus erreichen, damit ich die App effizient bedienen kann.

#### Acceptance Criteria

1. THE App SHALL für jedes interaktive Element (`button`, `a`, `input`, `textarea`, `select`, `[role="button"]`, `[role="menuitem"]`, `[tabindex="0"]`) einen sichtbaren Fokus-Indikator gemäß `--focus-ring` mit einer Mindest-Außenmaß-Stärke von 2 px rendern.
2. THE App SHALL eine logische Tab-Reihenfolge in jeder Sicht (`ChatView`, `SettingsView`, jede `Modal`-Instanz) einhalten, die der visuellen Reihenfolge von oben-links nach unten-rechts (bzw. der `Locale`-spezifischen Schreibrichtung) folgt.
3. WHEN ein `OverflowMenu` geöffnet ist, THE App SHALL die Pfeiltasten `ArrowUp`/`ArrowDown` zur Navigation zwischen Menüeinträgen unterstützen und mit `Home`/`End` zum ersten/letzten Eintrag springen.
4. WHEN ein `HeaderPanel` geöffnet ist, THE App SHALL den Tastatur-Fokus initial auf das erste interaktive Element des Panels setzen.
5. WHEN ein `HeaderPanel` oder `Modal` geschlossen wird, THE App SHALL den Fokus auf das Trigger-Element zurücksetzen, das das Öffnen ausgelöst hat.
6. IF ein interaktives Element keinen sichtbaren Text-Label besitzt, THEN THE App SHALL ein nicht-leeres `aria-label` über `i18n` setzen.

### Requirement 4: Modal-Verhalten – Fokusfalle, Semantik und Schließwege

**User Story:** Als Anwender möchte ich Modale konsistent und barrierefrei bedienen können, damit ich nicht versehentlich aus dem Dialog herausnavigiere oder Aktionen blockiert sehe.

#### Acceptance Criteria

1. WHEN ein `Modal` geöffnet ist, THE App SHALL den Tabulatorfokus auf das Modal beschränken (Fokusfalle), sodass `Tab` und `Shift+Tab` ausschließlich zwischen den fokussierbaren Elementen des Modals zirkulieren.
2. WHEN ein `Modal` geöffnet wird, THE App SHALL `aria-modal="true"` und `role="dialog"` (oder `role="alertdialog"` bei Fehlern) setzen sowie eine `aria-labelledby`-Referenz auf den Modaltitel definieren.
3. WHEN der Anwender `Escape` drückt UND ein `Modal` geöffnet ist, THE App SHALL ausschließlich das oberste `Modal` schließen.
4. WHEN der Anwender außerhalb des Modal-Inhaltsbereichs auf den Backdrop klickt, THE App SHALL das `Modal` schließen, sofern das `Modal` nicht den Datenverlust riskiert (kein offener Schreibvorgang).
5. WHILE ein `Modal` geöffnet ist, THE App SHALL das darunterliegende UI per `inert`-Attribut (oder `aria-hidden="true"`) für assistive Technologien deaktivieren.
6. WHEN ein `Modal` geschlossen wird, THE App SHALL den Fokus auf das Trigger-Element zurücksetzen, das das Modal geöffnet hat.

### Requirement 5: Schließverhalten von Header-Panels und Overflow-Menü

**User Story:** Als Anwender erwarte ich, dass Panels und Menüs auf dieselbe Weise schließen wie Modale, damit ich mein mentales Modell der App nicht ständig anpassen muss.

#### Acceptance Criteria

1. WHEN der Anwender `Escape` drückt UND mindestens ein `HeaderPanel` geöffnet ist, THE App SHALL alle geöffneten `HeaderPanels` schließen.
2. WHEN der Anwender außerhalb eines geöffneten `HeaderPanel`s klickt, THE App SHALL alle geöffneten `HeaderPanels` schließen.
3. WHEN ein `OverflowMenu` geöffnet ist UND der Anwender `Escape` drückt, THE App SHALL das `OverflowMenu` schließen UND den Fokus auf den Overflow-Toggle-Button zurücksetzen.
4. THE App SHALL für ein `HeaderPanel` und ein `OverflowMenu` jeweils `aria-expanded` am Trigger-Button und – im Fall des Menüs – `role="menu"` bzw. `role="menuitem"` setzen.

### Requirement 6: Globale Live-Regionen und Toast-Service

**User Story:** Als Anwender möchte ich kurze Erfolgs-, Warn- und Fehlermeldungen sehen, ohne den Chatverlauf damit zu fluten oder zu verpassen, wenn ich gescrollt habe.

#### Acceptance Criteria

1. THE App SHALL einen `ToastService` bereitstellen, der ephemere Nachrichten in einer globalen, visuell stabilen Region (rechts unten) anzeigt.
2. WHEN ein `ToastService`-Toast vom Typ „error" angezeigt wird, THE App SHALL diesen in einer Region mit `role="alert"` rendern.
3. WHEN ein `ToastService`-Toast vom Typ „info" oder „success" angezeigt wird, THE App SHALL diesen in einer Region mit `role="status"` und `aria-live="polite"` rendern.
4. THE App SHALL jeden Toast nach einer Standard-Anzeigedauer von 5000 ms automatisch ausblenden, sofern der Toast nicht den Typ „error" mit manuellem Abschluss besitzt.
5. THE App SHALL maximal 3 gleichzeitig sichtbare Toasts darstellen und ältere Toasts in eine FIFO-Warteschlange überführen.
6. THE App SHALL den `ToastService` für die folgenden bestehenden Ereignisse verwenden, anstatt System-Bubbles im Chat zu erzeugen: erfolgreiches Speichern von Einstellungen, Verbindungsverlust, Hotkey-Registrierungs-Fehler, Sprach-Transkriptions-Fehler.

### Requirement 7: Lade-, Leer- und Fehlerzustände

**User Story:** Als Anwender möchte ich jederzeit erkennen, ob die App lädt, leer ist oder ein Problem hat, damit ich nicht im Ungewissen warte.

#### Acceptance Criteria

1. WHEN eine `Lazy`-Komponente (Settings, Cert-Modal, Embed-Modal, Speech-Visualizer) geladen wird, THE App SHALL einen Skelett-Platzhalter (`.ui-skeleton`) mit derselben Außenform wie die Zielkomponente rendern.
2. WHEN die `MessageList` keine Nachrichten enthält UND keine Verbindung besteht, THE App SHALL einen erklärenden Empty-State mit primärer Aktion „Verbindung herstellen" oder „Gerät koppeln" rendern.
3. WHEN eine asynchrone Aktion (Speichern, Reconnect, Pairing, Cert-Probe) länger als 250 ms dauert, THE App SHALL den auslösenden Button mit `aria-busy="true"` und einem Spinner rendern.
4. IF eine asynchrone Aktion fehlschlägt, THEN THE App SHALL eine lokalisierte Fehlermeldung über den `ToastService` anzeigen UND eine erneute Auslösung erlauben.
5. THE App SHALL eine konsistente Fehler-„Tonalität" (`data-tone="danger"`) für alle Fehler-Banner verwenden; abweichende Werte wie `"warn"` SHALL durch den definierten Wert `"warning"` ersetzt werden.

### Requirement 8: Composer-Verbesserungen (InputBox)

**User Story:** Als Anwender möchte ich klare, gut unterscheidbare Aktionen im Eingabefeld und eine zuverlässige Anzeige meiner Anhänge, damit ich Nachrichten ohne Fehlbedienung sende.

#### Acceptance Criteria

1. THE Composer SHALL den Senden-Button und den Stop-Button mit unterschiedlicher Form (Senden: Kreis, Stop: Quadrat mit Stop-Glyphe) UND unterschiedlicher Farbtoken-Tonalität (`accent` vs. `danger`) rendern.
2. WHEN ein Stop-Button sichtbar ist, THE Composer SHALL den Senden-Button ausblenden und nur einen primären „Aktiv"-Button anzeigen.
3. WHEN der Anwender `Strg+Enter` (Windows/Linux) bzw. `Cmd+Enter` (macOS) drückt, THE Composer SHALL die Nachricht senden, sofern `canSend` zutrifft.
4. WHILE ein Anhang-Pill den Fokus besitzt, THE Composer SHALL `Backspace` oder `Delete` zum Entfernen des Anhangs unterstützen.
5. THE Composer SHALL die Drag-and-Drop-Hervorhebung mit korrektem `dragenter`/`dragleave`-Counter implementieren, sodass das Verlassen eines Kindelements die Hervorhebung nicht fälschlich beendet.
6. THE Composer SHALL einen Zeichen-/Anhangs-Zähler-Hint („n von max") in unmittelbarer Nähe der Anhang-Pills rendern, der die `attachmentLimits.max_files_per_message` und `attachmentLimits.max_total_bytes_per_message` widerspiegelt.
7. WHILE der `Composer` deaktiviert ist, THE Composer SHALL den Grund (z. B. „Keine Verbindung", „Kopplung erforderlich") direkt im Hint-Text mit der lokalisierten Variante anzeigen.

### Requirement 9: Chat-Lesbarkeit und Nachrichtenfluss

**User Story:** Als Anwender möchte ich Nachrichten leicht überfliegen, neue Inhalte erkennen und lange Konversationen ohne visuelle Ermüdung verfolgen können.

#### Acceptance Criteria

1. THE MessageList SHALL bei einer Bildschirmbreite ≥ 1024 px eine maximale Lesebreite der Bubbles von 720 px verwenden.
2. THE MessageBubble SHALL bei aufeinanderfolgenden Nachrichten desselben Absenders Avatar und Zeitstempel nur am Anfang bzw. Ende der Gruppe anzeigen (bestehendes Verhalten) UND in jeder Gruppe ein einheitliches vertikales Mindestabstandsmaß von `var(--space-2)` einhalten.
3. THE MessageList SHALL bei neuen Nachrichten, die außerhalb des sichtbaren Bereichs eintreffen, das Scroll-FAB mit Zähler-Badge anzeigen und beim Klick den Scroll an das Listenende ohne sichtbares Springen (animiert ≤ 220 ms) ausführen.
4. WHEN eine Streaming-Nachricht aktiv ist, THE MessageBubble SHALL eine sichtbare „Streaming"-Markierung (Akzentrand) UND eine Live-Region mit `aria-live="polite"` für den aktuell hinzugefügten Text bereitstellen.
5. THE MessageBubble SHALL Code-Blöcke (`<pre>`/`<code>`) mit horizontalem Scroll und einem Copy-Button rendern.
6. THE MessageBubble SHALL Datums-Trenner („Heute", „Gestern", lokalisiertes Datum) gemäß `formatDayLabel` mit ausreichendem Kontrast (siehe Requirement 2) rendern.

### Requirement 10: Theme-System – Light, Dark, System und Persistenz

**User Story:** Als Anwender möchte ich ein konsistentes Theme, das meiner Systemeinstellung folgt und meinen Wunsch über App-Neustarts hinweg behält.

#### Acceptance Criteria

1. WHEN der Anwender den Theme-Toggle in der `StatusBar` betätigt, THE App SHALL den nächsten `ThemeMode` aus `["system", "light", "dark"]` zyklisch auswählen, persistieren und den geänderten Wert im selben Frame visuell übernehmen.
2. WHILE `ThemeMode` `"system"` aktiv ist, THE App SHALL Änderungen der Browser-/OS-Präferenz `prefers-color-scheme` ohne Neustart übernehmen.
3. THE App SHALL für jedes Designtoken aus `:root[data-theme="light"]` ein äquivalentes Token in `:root[data-theme="dark"]` definieren (kein fehlender Schlüssel).
4. THE App SHALL eine Funktion `themeModeRoundTrip` bereitstellen, sodass für jeden `ThemeMode` `m` gilt: `parseThemeMode(serializeThemeMode(m)) === m` (Round-Trip-Eigenschaft).
5. IF `ThemeMode` einen ungültigen persistierten Wert besitzt, THEN THE App SHALL auf `"system"` zurückfallen und den korrigierten Wert speichern.

### Requirement 11: Bewegung, Animation und Reduced-Motion

**User Story:** Als Anwender mit Bewegungsempfindlichkeit möchte ich animationsfreie oder stark reduzierte Bewegungen erleben, damit mir nicht schwindlig wird.

#### Acceptance Criteria

1. WHILE `ReducedMotion` aktiv ist, THE App SHALL alle Animationen und Übergänge mit einer Dauer ≤ 1 ms durchführen (bestehende Regel beibehalten).
2. WHILE `ReducedMotion` aktiv ist, THE App SHALL `fly`/`slide`-Transitions in Bannern und Toasts durch reine Opazitätsübergänge ersetzen.
3. THE App SHALL keine ungesteuerten Endlos-Animationen (z. B. „pulse", „glow", „bounce") gleichzeitig auf mehr als 2 Elementen je Sicht ausführen, um Ablenkung zu minimieren.
4. WHEN ein Hover-Transform größer als `translateY(2px)` oder `scale(1.06)` definiert ist, THE App SHALL den Wert auf maximal `translateY(2px)` bzw. `scale(1.04)` begrenzen.

### Requirement 12: Internationalisierung – Vollständigkeit und RTL

**User Story:** Als Anwender in einer der unterstützten Sprachen möchte ich alle UI-Texte in meiner Sprache sehen und in RTL-Sprachen ein gespiegeltes Layout erleben.

#### Acceptance Criteria

1. THE App SHALL für jeden in der Code-Basis verwendeten `MessageKey` in jeder `Locale` einen nicht-leeren Übersetzungs-String bereitstellen.
2. WHEN eine `Locale` der Menge `RtlLocale` aktiv ist, THE App SHALL `dir="rtl"` auf dem Wurzelelement setzen UND alle Layout-Eigenschaften mit logischen CSS-Properties (`padding-inline-*`, `margin-inline-*`, `border-inline-*`, `inset-inline-*`) statt physikalischer Properties (`padding-left` etc.) verwenden.
3. WHEN eine `Locale` der Menge `RtlLocale` aktiv ist, THE App SHALL die Nachrichtenseite („User rechts, Assistant links") gespiegelt rendern, sodass der User-Avatar weiterhin auf der „eigenen" Seite des Anwenders erscheint.
4. THE App SHALL Datums-, Zeit- und Zahlformatierungen über `Intl.DateTimeFormat` bzw. `Intl.NumberFormat` mit der aktiven `Locale` durchführen.
5. THE App SHALL eine Funktion `localeRoundTrip` bereitstellen, sodass für jede gültige `Locale` `l` gilt: `parseLocale(serializeLocale(l)) === l`.

### Requirement 13: Responsives Layout für schmale Fenster

**User Story:** Als Anwender mit kleiner Fensterbreite möchte ich, dass die App ohne abgeschnittene Bedienelemente nutzbar bleibt.

#### Acceptance Criteria

1. WHILE die Fensterbreite kleiner als 720 px ist, THE App SHALL die `StatusBar`-Aktionen ins `OverflowMenu` verschieben (bestehendes Verhalten beibehalten) UND die Statuszeile auf eine zweizeilige Darstellung (Verbindungsstatus oben, URL untern) ohne Abschneiden umbrechen.
2. WHILE die Fensterbreite kleiner als 480 px ist, THE App SHALL die `MessageBubble` mit einer Maximalbreite von 92 % der `MessageList`-Breite rendern und Avatare auf `size="xs"` reduzieren.
3. WHILE die Fensterbreite kleiner als 480 px ist, THE App SHALL den `Composer` einzeilig mit ausgeblendeten Footnote-Texten und einer Mindesthöhe von 2.5 rem darstellen.
4. WHEN die Fensterhöhe kleiner als 480 px ist, THE App SHALL den Banner-Stack auf einen einzigen, kompakten Banner mit `compact`-Variante reduzieren.
5. THE App SHALL keine horizontalen Scrollbars im Hauptlayout erzeugen, solange die Fensterbreite ≥ 360 px beträgt.

### Requirement 14: Settings – Auffindbarkeit und Konsistenz

**User Story:** Als Anwender möchte ich Einstellungen schnell finden, da die App viele Bereiche (Verbindung, Gerät, Erscheinung, Sprache, Desktop, Dateien, Sprache, Über) bietet.

#### Acceptance Criteria

1. THE App SHALL in der `SettingsView` ein durchsuchbares Suchfeld bereitstellen, das Einträge anhand des `i18n`-Schlüssels und der angezeigten Beschriftung filtert.
2. WHEN der Anwender eine Suche eingibt, THE App SHALL Sektionen mit ≥ 1 Treffer hervorheben UND nicht passende Sektionen ausblenden.
3. THE App SHALL bei jedem Eingabewert in `SettingsView` einen sichtbaren „Geänderte Einstellungen"-Indikator (Dirty-Badge) am Speichern-Button anzeigen, solange `dirty === true`.
4. WHEN der Anwender die `SettingsView` mit ungespeicherten Änderungen verlässt, THE App SHALL eine Bestätigungs-Modal mit den Optionen „Speichern", „Verwerfen" und „Abbrechen" anzeigen.
5. THE App SHALL für jeden Settings-Eintrag eine kurze Hilfetext-Beschreibung in der `Locale` des Anwenders anzeigen.
6. THE App SHALL die Speech-Untersektion (`provider`/`asr`/`tts`/`tests`) durch eine Tab-Bar mit `role="tablist"`, `role="tab"`, `role="tabpanel"` und Pfeiltasten-Navigation ersetzen.

### Requirement 15: Hotkey-Aufzeichnung

**User Story:** Als Anwender möchte ich Tastenkürzel zuverlässig aufzeichnen, korrigieren und zurücksetzen, ohne ungültige oder reservierte Kombinationen zu speichern.

#### Acceptance Criteria

1. WHEN der Anwender das `HotkeyField` per Klick oder `Space`/`Enter` aktiviert, THE App SHALL in den Aufnahmemodus wechseln UND einen visuellen Hinweis (`recording-hint`) plus `aria-live="assertive"`-Statusmeldung ausgeben.
2. WHEN der Anwender im Aufnahmemodus eine Tastenkombination drückt, THE App SHALL die normalisierte `Hotkey`-Zeichenkette anzeigen.
3. IF die aufgezeichnete Kombination ungültig oder reserviert ist, THEN THE App SHALL eine lokalisierte Fehlermeldung anzeigen und im Aufnahmemodus bleiben.
4. WHEN der Anwender im Aufnahmemodus `Escape` drückt, THE App SHALL den Aufnahmemodus ohne Speichern verlassen.
5. THE App SHALL eine Funktion `hotkeyRoundTrip` bereitstellen, sodass für jeden gültigen `Hotkey` `h` gilt: `parseHotkey(formatHotkeyLabel(h)) === h` (Round-Trip-Eigenschaft).

### Requirement 16: Pairing-Flow

**User Story:** Als Anwender möchte ich mein Gerät einfach koppeln, den Token sicher eingeben und Fehler verständlich gemeldet bekommen.

#### Acceptance Criteria

1. WHEN der `PairingBanner` sichtbar wird, THE App SHALL den Fokus auf das Token-Eingabefeld setzen, sobald `focusRequest` inkrementiert wird (bestehendes Verhalten beibehalten und um initialen Fokus bei erstem Sichtbarwerden erweitern).
2. THE App SHALL einen Augen-Toggle (`show/hide token`) als SVG-Icon-Button mit eindeutigem `aria-pressed`-Zustand rendern.
3. WHEN der Token leer ist, THE App SHALL den „Koppeln"-Button mit `disabled`-Status UND einer Erklärung im `aria-describedby`-Attribut rendern.
4. WHEN das Pairing fehlschlägt, THE App SHALL die Fehlermeldung im `Banner` mit `role="alert"` ausgeben und den Token-Wert beibehalten, sodass der Anwender ihn korrigieren kann.
5. THE App SHALL den Token-Wert beim Verlassen des Banners (Komponente unmount) niemals im Klartext im DOM hinterlassen.

### Requirement 17: Zertifikatsvertrauensdialog

**User Story:** Als Anwender möchte ich verstehen, warum eine TLS-Verbindung fehlschlägt, und gezielt entscheiden, ob ich dem Zertifikat vertraue.

#### Acceptance Criteria

1. WHEN das `CertificateTrustModal` öffnet, THE App SHALL `aria-modal="true"`, `role="dialog"` und `aria-labelledby="cert-title"` setzen.
2. WHEN das `CertificateTrustModal` öffnet, THE App SHALL den Fokus auf den primären „Vertrauen"-Button setzen, sofern eine `CertificateProbeResult` geladen ist; andernfalls auf „Abbrechen".
3. THE App SHALL die Zertifikatsdetails (Subject, Issuer, ValidUntil, Fingerprint) mit kopierfähigem Text anzeigen.
4. WHEN der Anwender den Fingerprint-Wert anklickt, THE App SHALL den Wert in die Zwischenablage kopieren und einen kurzen Toast-Hinweis ausgeben.
5. WHEN das `CertificateTrustModal` geschlossen wird, THE App SHALL den Fokus auf den Reconnect- bzw. Settings-Button zurückgeben, der den Dialog ausgelöst hat.

### Requirement 18: Sprache (Speech) UX – Banner, Visualizer, Status

**User Story:** Als Anwender möchte ich beim Sprechen klare visuelle und akustische Rückmeldungen erhalten, damit ich weiß, ob die App mich aufnimmt, transkribiert oder antwortet.

#### Acceptance Criteria

1. THE SpeechBanner SHALL für jeden Banner-Zustand (`vadLoading`, `vadError`, `errorMessage`, `partialTranscript`, `speechActive`) einen eindeutig definierten `data-tone` aus `{"info", "warning", "danger", "accent", "success"}` setzen; der Wert `"warn"` SHALL nicht verwendet werden.
2. WHEN ein partielles Transkript verfügbar ist, THE SpeechBanner SHALL den Text als Live-Region (`aria-live="polite"`) mit Truncation-Ellipsis bei Überlänge rendern.
3. WHILE die Sprachsitzung aktiv ist, THE App SHALL den `SpeechBackgroundVisualizer` nur dann rendern, wenn der Anwender ihn nicht über Settings deaktiviert hat.
4. THE App SHALL einen Settings-Eintrag „Hintergrund-Visualizer aktivieren" mit Standardwert `true` bereitstellen.
5. WHEN die Sprachsitzung beendet wird, THE App SHALL den Visualizer-Canvas innerhalb von 500 ms entfernen und keine weiteren `requestAnimationFrame`-Tasks belegen.

### Requirement 19: Persona und Avatare

**User Story:** Als Anwender erwarte ich, dass Persona-Bilder konsistent dargestellt werden und nie zu unangenehmen Ladeeffekten führen.

#### Acceptance Criteria

1. THE PersonaAvatar SHALL alle Größen-Varianten (`xs`, `sm`, `md`, `lg`) in einem zentralen Token-Set definieren und keine harten Pixelwerte in einzelnen Komponenten verwenden.
2. WHILE ein Persona-Bild lädt, THE PersonaAvatar SHALL einen Skelett-Placeholder mit derselben Außenform (rund) rendern.
3. IF ein Persona-Bild fehlschlägt zu laden, THEN THE PersonaAvatar SHALL ein Fallback-Bild rendern UND keine kaputten `img alt`-Texte zeigen.
4. THE MessageBubble SHALL bei gruppierten Nachrichten denselben Avatar-Spacer verwenden (Breite identisch zur Avatar-`size`), sodass Bubbles bündig ausgerichtet bleiben.
5. WHEN sich die `Persona` während einer aktiven Konversation ändert, THE App SHALL den Avatar mit einem Crossfade-Übergang von 200 ms (oder ohne Übergang bei `ReducedMotion`) ersetzen.

### Requirement 20: Mikro-Interaktionen, Sounds und Haptik

**User Story:** Als Anwender möchte ich subtile, optionale Sound-Hinweise zu wichtigen Ereignissen, ohne dass die App laut wird.

#### Acceptance Criteria

1. THE App SHALL einen Settings-Eintrag „UI-Sounds aktivieren" mit Standardwert gemäß `DEFAULT_UI_SOUND_SETTINGS` bereitstellen.
2. WHEN UI-Sounds aktiviert sind, THE App SHALL für die Ereignisse `send`, `receive`, `notice`, `error` einen jeweils unterschiedlichen, kurzen Klang abspielen.
3. WHILE UI-Sounds deaktiviert sind, THE App SHALL keinen Audio-Kontext erzeugen oder offen halten.
4. WHEN die `ReducedMotion`-Präferenz aktiv ist, THE App SHALL Hover-Transformationen entfernen, jedoch keine Sounds automatisch deaktivieren.
5. THE App SHALL einen Settings-Eintrag „Lautstärke" mit Werten in `[0, 1]` bereitstellen UND die Lautstärke-Persistenz mit Round-Trip-Eigenschaft erfüllen: `parseVolume(serializeVolume(v)) === clamp(v, 0, 1)`.

### Requirement 21: Z-Index-Hierarchie und Schichtung

**User Story:** Als Anwender erwarte ich, dass Modale immer über Panels und Panels immer über der Statusleiste liegen, ohne Flackern oder Klick-Abfangen.

#### Acceptance Criteria

1. THE App SHALL eine zentrale `z-index`-Token-Skala in `app.css` definieren (`--z-base`, `--z-banner`, `--z-status`, `--z-panel`, `--z-modal`, `--z-toast`) mit aufsteigenden Werten.
2. THE App SHALL alle Komponenten ausschließlich auf diese Tokens referenzieren; Hardcodierungen wie `z-index: 21` oder `z-index: 30` SHALL entfernt werden.
3. WHEN ein `Modal` geöffnet ist, THE App SHALL den `Modal`-Layer mit höherem `z-index` als jeden `HeaderPanel`-Layer rendern.
4. THE App SHALL `Toast`-Layer immer über `Modal`-Layer rendern, damit Bestätigungen sichtbar bleiben.
5. THE App SHALL den Backdrop eines `HeaderPanel`s als interaktives `<button>` mit korrektem `aria-label` UND nicht-leerem sichtbaren Treffbereich rendern.

### Requirement 22: Fenstersteuerung und Tauri-Drag-Region

**User Story:** Als Anwender möchte ich das Fenster zuverlässig per Drag bewegen, minimieren und schließen können, ohne dass interaktive Elemente die Drag-Erkennung stören.

#### Acceptance Criteria

1. THE App SHALL die Tauri-Drag-Region (`data-tauri-drag-region`) ausschließlich auf nicht-interaktiven Bereichen der `StatusBar` aktivieren.
2. WHEN der Anwender auf die Drag-Region doppelklickt, THE App SHALL das Fenster zwischen „normal" und „maximiert" umschalten.
3. THE WindowControls SHALL drei Buttons (Minimieren, Maximieren/Wiederherstellen, Schließen) bereitstellen, sofern `isDesktopShell()` zutrifft.
4. WHEN `minimizeToTray` aktiv ist UND der Anwender den Schließen-Button betätigt, THE App SHALL die Anwendung in den Tray minimieren statt zu beenden.
5. THE WindowControls SHALL die Buttons in einer rechts-bündigen Reihenfolge nach Plattformkonvention darstellen (Windows/Linux: Minimieren, Maximieren, Schließen; macOS: Schließen, Minimieren, Maximieren – falls Tauri-Plattform macOS ist).

### Requirement 23: Performance – Layout-Shift und Lazy-Loading

**User Story:** Als Anwender möchte ich beim Öffnen schwerer Komponenten keinen sichtbaren Sprung erleben.

#### Acceptance Criteria

1. WHEN die `SettingsView` lazy geladen wird, THE App SHALL einen Skelett-Platzhalter mit identischer Höhe und Breite des Settings-Containers rendern.
2. WHEN ein `Modal` öffnet, THE App SHALL den Body-Scroll mittels `overflow: hidden` sperren, ohne dass die Layoutbreite („Scrollbar-Wegfall-Sprung") springt.
3. THE App SHALL für `MessageBubble`-Bilder und Persona-Bilder explizite `width`/`height`- bzw. `aspect-ratio`-Attribute setzen, um Layout-Shifts zu vermeiden.
4. THE App SHALL das initiale Bundling der Speech- und Visualizer-Module ausschließlich bei Aktivierung der Sprachsitzung laden (bestehendes Lazy-Loading beibehalten).

### Requirement 24: Markdown-Rendering – Round-Trip und Sicherheit

**User Story:** Als Anwender möchte ich, dass Assistenten-Nachrichten mit Markdown korrekt formatiert und sicher dargestellt werden, ohne XSS-Risiken.

#### Acceptance Criteria

1. THE App SHALL Markdown-Eingabe in `ChatMessageBody` über einen sanitizierten Renderer verarbeiten, der `<script>`, `on*`-Attribute und `javascript:`-URLs entfernt.
2. THE App SHALL für jede unterstützte Markdown-Konstrukt-Klasse (Überschrift, Liste, Code-Block, Inline-Code, Link, Bild, Tabelle) eine separate CSS-Klasse mit konsistenten Token rendern.
3. THE App SHALL einen Round-Trip-Test bereitstellen: für jede gültige Markdown-Eingabe `m` SHALL `parseMarkdown(m)` denselben AST liefern wie `parseMarkdown(renderToMarkdown(parseMarkdown(m)))` (semantische Round-Trip-Eigenschaft).
4. WHEN ein Markdown-Link auf eine externe URL verweist, THE App SHALL beim Klick `openExternalUrl` aufrufen und nicht innerhalb der Tauri-WebView navigieren.
5. THE App SHALL eine Property-basierte Eigenschaft erfüllen: `numberOfLinks(parseMarkdown(m)) === numberOfLinks(parseMarkdown(renderToMarkdown(parseMarkdown(m))))` für alle gültigen `m`.

### Requirement 25: Visuelle Hierarchie – Typografie

**User Story:** Als Anwender möchte ich eine klare typografische Hierarchie, die mir das schnelle Erfassen der Inhalte erleichtert.

#### Acceptance Criteria

1. THE App SHALL eine modulare Typografie-Skala (`--font-size-xs`, `-sm`, `-md`, `-lg`, `-xl`) und eine Zeilenhöhen-Skala (`--line-height-tight`, `-normal`, `-loose`) als Designtokens definieren.
2. THE App SHALL alle Schriftgrößen ausschließlich aus diesen Tokens beziehen; literale rem-/px-Werte für `font-size` SHALL nicht direkt in Komponenten verwendet werden, mit Ausnahme dokumentierter Sonderfälle.
3. THE App SHALL Überschriften (`h1` … `h4`) mit jeweils mindestens 1.125-fachem Größenfaktor zwischen den Stufen rendern.
4. THE App SHALL die Anzahl gleichzeitig sichtbarer Schriftgrößen pro Komponente auf maximal 4 begrenzen.
5. THE App SHALL `font-feature-settings: "tnum"` für tabellarische Zahlen (Zeitstempel, Zähler, Versionsnummer) aktivieren.
