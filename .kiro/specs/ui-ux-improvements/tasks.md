# Umsetzungsplan: UI/UX-Improvements

## Übersicht

Dieser Umsetzungsplan definiert die konkreten Implementierungsaufgaben für die UI/UX-Verbesserungen von agodesk. Die Aufgaben folgen der Phasenstruktur aus dem Design-Dokument und decken alle 25 Requirements ab.

**Technologie-Stack**: Tauri 2 + Svelte 5 + TypeScript

## Aufgaben

- [ ] 1. Phase 1: Design-Token und Primitives
  - [ ] 1.1 Z-Index-Token in app.css definieren
    - Hinzufügen von `--z-base`, `--z-banner`, `--z-status`, `--z-panel`, `--z-modal`, `--z-toast` mit Werten 0, 10, 20, 30, 40, 50
    - Erstellen einer Dokumentation der Hierarchie in einem Kommentarblock
    - _Requirements: 21.1, 21.2_
  
  - [ ] 1.2 Typografie-Token in app.css definieren
    - Definieren von `--font-size-xs` (0.6875rem), `--font-size-sm` (0.75rem), `--font-size-md` (0.875rem), `--font-size-lg` (1rem), `--font-size-xl` (1.125rem), `--font-size-2xl` (1.25rem)
    - Definieren von `--line-height-tight` (1.25), `--line-height-normal` (1.55), `--line-height-loose` (1.75)
    - _Requirements: 25.1, 25.2_
  
  - [ ] 1.3 Icon-Button-Size-Token in app.css definieren
    - Definieren von `--ui-btn-icon-size: 2.25rem`
    - Sicherstellen, dass alle Icon-Buttons auf dieses Token verweisen
    - _Requirements: 1.1_
  
  - [ ] 1.4 Kontrast-Verbesserungen für Text-Elemente
    - Anpassen der Zeitstempel-Opazität auf ≥ 0.7
    - Anpassen der Footnote-Opazität auf ≥ 0.85
    - Sicherstellen, dass alle Texte WCAG 2.1 AA Kontrastverhältnis erfüllen
    - _Requirements: 2.3, 2.4, 2.5_
  
  - [ ]* 1.5 Property-Test für Z-Index-Hierarchie
    - **Property 4: Z-Index-Hierarchie**
    - **Validates: Requirements 21.1, 21.2, 21.3, 21.4**
    - Test: `z-base < z-banner < z-status < z-panel < z-modal < z-toast`

- [ ] 2. Phase 2: Core Services
  - [ ] 2.1 ToastService implementieren
    - Erstellen von `src/lib/services/toast.ts`
    - Implementieren der `ToastService`-Schnittstelle mit `show()`, `dismiss()`, `dismissAll()`, `subscribe()`
    - FIFO-Warteschlange mit maximal 3 gleichzeitigen Toasts
    - Automatisches Ausblenden nach konfigurierbarer Dauer
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ] 2.2 ToastContainer-Komponente erstellen
    - Erstellen von `src/lib/components/ToastContainer.svelte`
    - Positionierung rechts unten
    - Unterstützung für `role="alert"` (Fehler) und `role="status"` (Info/Success)
    - Animiertes Ein-/Ausblenden
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 2.3 ToastService in bestehende Komponenten integrieren
    - Verwenden für: Einstellungen speichern, Verbindungsverlust, Hotkey-Registrierungs-Fehler, Sprach-Transkriptions-Fehler
    - Entfernen der alten System-Bubbles im Chat
    - _Requirements: 6.6_
  
  - [ ]* 2.4 Property-Tests für ToastService
    - **Property 1: Toast-FIFO-Warteschlange**
    - **Validates: Requirements 6.5**
    - **Property 2: Maximale Toast-Anzahl**
    - **Validates: Requirements 6.5**
  
  - [ ] 2.5 FocusManager implementieren
    - Erstellen von `src/lib/services/focus-manager.ts`
    - Implementieren von `trapFocus()`, `releaseTrap()`, `setTriggerElement()`, `returnFocus()`
    - Implementieren von `createRovingTabindex()` für Menü-Navigation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.5, 4.6_
  
  - [ ] 2.6 FocusManager-Tests schreiben
    - Test der Fokusfalle (Tab-Zirkulation)
    - Test der Fokus-Rückgabe
    - Test des Roving-Tabindex
    - _Requirements: 4.1, 4.5, 4.6_
  
  - [ ] 2.7 IconService implementieren
    - Erstellen von `src/lib/services/icon.ts`
    - Definieren des zentralen Icon-Sets mit einheitlicher Strichstärke (2.0)
    - Implementieren von `register()`, `get()`, `render()`
    - _Requirements: 1.2, 1.3_
  
  - [ ] 2.8 Icon-Komponente erstellen
    - Erstellen von `src/lib/components/Icon.svelte`
    - Unterstützung für `name`, `size`, `class`, `ariaLabel`, `ariaHidden`
    - SVG-Rendering mit konsistenter Strichstärke
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [ ]* 2.9 Property-Test für Icon-Button-Größe
    - **Property 8: Icon-Button-Größe**
    - **Validates: Requirements 1.1**
    - Test: Alle Icon-Buttons haben 2.25rem × 2.25rem

- [ ] 3. Phase 3: Komponenten-Migration
  - [ ] 3.1 Modal-Komponenten mit FocusManager ausstatten
    - `CertificateTrustModal.svelte`: aria-modal, role="dialog", aria-labelledby, Fokusfalle
    - `IntegrationEmbedModal.svelte`: Fokusfalle, Escape-Schließung
    - Fokus auf ersten interaktiven Button beim Öffnen
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 17.1, 17.2, 17.5_
  
  - [ ] 3.2 Header-Panels mit FocusManager ausstatten
    - `ChatHistoryPanel.svelte`: Initialer Fokus, Escape-Schließung, Klick-außerhalb-Schließung
    - `IntegrationsPanel.svelte`: Tastaturnavigation, aria-expanded
    - `SystemWarningsPanel.svelte`: Roving-Tabindex für Warnungsliste
    - _Requirements: 3.4, 3.5, 5.1, 5.2, 5.4_
  
  - [ ] 3.3 OverflowMenu-Tastaturnavigation implementieren
    - Pfeiltasten-Navigation (ArrowUp/ArrowDown)
    - Home/End-Tasten für ersten/letzten Eintrag
    - Escape-Schließung mit Fokus-Rückgabe
    - aria-expanded, role="menu", role="menuitem"
    - _Requirements: 3.3, 5.3, 5.4_
  
  - [ ] 3.4 Icon-Buttons standardisieren
    - Alle Icon-Buttons auf `--ui-btn-icon-size` umstellen
    - Composer: Senden-Button, Stop-Button, Anhang-Button
    - StatusBar: Theme-Toggle, Overflow-Toggle
    - WindowControls: Minimieren, Maximieren, Schließen
    - _Requirements: 1.1_
  
  - [ ] 3.5 Banner-Tonalität korrigieren
    - `SpeechBanner.svelte`: `data-tone="warn"` zu `data-tone="warning"` ändern
    - Sicherstellen, dass alle Banner die korrekten Tonalitäten verwenden
    - Definieren von CSS für alle `data-tone`-Werte
    - _Requirements: 7.5, 18.1_
  
  - [ ] 3.6 PairingBanner-Verbesserungen
    - Augen-Symbol als SVG-Icon mit aria-pressed
    - Token-Eingabefeld mit aria-describedby bei leerem Token
    - Fehlermeldung mit role="alert"
    - Token-Wert beim Unmounten aus DOM entfernen
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_
  
  - [ ] 3.7 Composer (InputBox) verbessern
    - Senden-Button (Kreis) und Stop-Button (Quadrat) unterscheidbar gestalten
    - Strg+Enter / Cmd+Enter zum Senden
    - Backspace/Delete für Anhang-Entfernung
    - Drag-and-Drop-Hervorhebung mit korrektem Counter
    - Zeichen-/Anhangs-Zähler-Hint
    - Deaktiviert-Status mit Grund-Anzeige
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
  
  - [ ] 3.8 MessageBubble-Verbesserungen
    - Zeitstempel-Größe und Opazität anpassen
    - Datums-Trenner mit ausreichendem Kontrast
    - Code-Blöcke mit horizontalem Scroll und Copy-Button
    - Streaming-Markierung und Live-Region
    - _Requirements: 2.3, 9.2, 9.4, 9.5, 9.6_
  
  - [ ] 3.9 SettingsView-Suche implementieren
    - Durchsuchbares Suchfeld hinzufügen
    - Filterung nach i18n-Schlüssel und angezeigter Beschriftung
    - Hervorheben passender Sektionen, Ausblenden nicht passender
    - Dirty-Badge am Speichern-Button
    - Bestätigungs-Modal bei ungespeicherten Änderungen
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  
  - [ ] 3.10 SettingsView-Speech-Tab-Bar implementieren
    - Tab-Bar mit role="tablist", role="tab", role="tabpanel"
    - Pfeiltasten-Navigation zwischen Tabs
    - Speech-Untersektion: provider/asr/tts/tests
    - _Requirements: 14.6_
  
  - [ ] 3.11 HotkeyField-Barrierefreiheit verbessern
    - aria-live="assertive" bei Aufnahmemodus
    - Visueller recording-hint-Hinweis
    - Fehlermeldung für ungültige/reservierte Kombinationen
    - Escape zum Abbrechen ohne Speichern
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [ ] 4. Phase 4: RTL-Unterstützung
  - [ ] 4.1 RTL-Utilities erstellen
    - Erstellen von `src/lib/utils/rtl.ts`
    - Funktion zur Erkennung von RTL-Locales (ar, he, fa, ur)
    - Funktion zum Setzen von `dir="rtl"` auf Wurzelelement
    - _Requirements: 12.2_
  
  - [ ] 4.2 Logische CSS-Properties einführen
    - Ersetzen von `padding-left`/`border-left` durch `padding-inline-start`/`border-inline-start`
    - Ersetzen von `margin-left`/`margin-right` durch `margin-inline-start`/`margin-inline-end`
    - Anpassen aller betroffenen Komponenten
    - _Requirements: 12.2_
  
  - [ ] 4.3 RTL-Tokens für Nachrichtenseite definieren
    - `--message-user-align` und `--message-assistant-align` in `[dir="ltr"]` und `[dir="rtl"]`
    - User-Avatar erscheint auf der „eigenen" Seite des Anwenders
    - _Requirements: 12.3_
  
  - [ ] 4.4 i18n-Integration für RTL
    - Automatisches Setzen von `dir` basierend auf Locale
    - Verwenden von `Intl.DateTimeFormat` und `Intl.NumberFormat`
    - _Requirements: 12.2, 12.4_
  
  - [ ]* 4.5 Property-Test für Locale Round-Trip
    - **Property 6: Locale Round-Trip**
    - **Validates: Requirements 12.5**
    - Test: `parseLocale(serializeLocale(l)) === l`

- [ ] 5. Phase 5: Property-Based Tests
  - [ ] 5.1 Theme-Mode Round-Trip implementieren
    - Funktionen `serializeThemeMode()` und `parseThemeMode()` in `theme.ts`
    - Property-basierter Test mit fast-check
    - _Requirements: 10.4, 10.5_
  
  - [ ]* 5.2 Property-Test für Theme-Mode Round-Trip
    - **Property 5: Theme-Mode Round-Trip**
    - **Validates: Requirements 10.4**
    - Test: `parseThemeMode(serializeThemeMode(m)) === m`
  
  - [ ] 5.3 Hotkey Round-Trip implementieren
    - Funktionen `formatHotkey()` und `parseHotkey()` in `show-window-hotkey.ts`
    - Property-basierter Test mit fast-check
    - _Requirements: 15.5_
  
  - [ ]* 5.4 Property-Test für Hotkey Round-Trip
    - **Property 7: Hotkey Round-Trip**
    - **Validates: Requirements 15.5**
    - Test: `parseHotkey(formatHotkey(h)) === h`
  
  - [ ] 5.5 Volume Round-Trip implementieren
    - Funktionen `serializeVolume()` und `parseVolume()` für Lautstärke-Persistenz
    - Clamp-Werte auf [0, 1]
    - _Requirements: 20.5_
  
  - [ ]* 5.6 Property-Test für Volume Round-Trip
    - Test: `parseVolume(serializeVolume(v)) === clamp(v, 0, 1)`
    - **Validates: Requirements 20.5**
  
  - [ ] 5.7 Markdown Round-Trip-Tests
    - Property-basierter Test für Link-Anzahl-Erhaltung
    - Test: `numberOfLinks(parseMarkdown(m)) === numberOfLinks(parseMarkdown(renderToMarkdown(parseMarkdown(m))))`
    - _Requirements: 24.3, 24.5_

- [ ] 6. Phase 6: Testing und Validierung
  - [ ] 6.1 WCAG 2.1 AA Kontrast-Validierung
    - Automatisierter Test für Kontrastverhältnisse (≥ 4.5:1 für Text, ≥ 3.0:1 für UI-Komponenten)
    - Test aller Text- und UI-Elemente in beiden Themes
    - _Requirements: 2.1, 2.2_
  
  - [ ] 6.2 Tastaturnavigation-Tests
    - Test der Tab-Reihenfolge in allen Sichten
    - Test der Pfeiltasten-Navigation in Menüs
    - Test der Escape-Schließung für Modals und Panels
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [ ] 6.3 Screenreader-Semantik-Tests
    - Test von aria-modal, role="dialog", aria-labelledby
    - Test von aria-expanded, aria-pressed
    - Test von Live-Regions (role="alert", role="status")
    - _Requirements: 4.2, 5.4, 6.2, 6.3_
  
  - [ ] 6.4 Reduced-Motion-Tests
    - Test, dass alle Animationen ≤ 1ms bei `prefers-reduced-motion: reduce`
    - Test, dass fly/slide durch Opazitätsübergänge ersetzt werden
    - Test, dass Hover-Transformationen begrenzt sind
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  
  - [ ] 6.5 Responsive-Layout-Tests
    - Test bei Fensterbreite < 720px (OverflowMenu, zweizeilige StatusBar)
    - Test bei Fensterbreite < 480px (MessageBubble-Breite, Composer einzeilig)
    - Test bei Fensterhöhe < 480px (kompakter Banner)
    - Test, dass keine horizontalen Scrollbars bei ≥ 360px entstehen
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [ ] 6.6 Performance-Tests (Layout-Shift)
    - Test, dass Lazy-Komponenten Skelett-Platzhalter zeigen
    - Test, dass Bilder explizite Dimensionen haben
    - Test, dass Modal-Öffnung keinen Scrollbar-Sprung verursacht
    - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [ ] 7. Checkpoint - Phase 1-2 abgeschlossen
  - Stellen Sie sicher, dass alle Tests bestehen. Fragen Sie den Benutzer bei Fragen.

- [ ] 8. Checkpoint - Phase 3 abgeschlossen
  - Stellen Sie sicher, dass alle Tests bestehen. Fragen Sie den Benutzer bei Fragen.

- [ ] 9. Checkpoint - Phase 4-5 abgeschlossen
  - Stellen Sie sicher, dass alle Tests bestehen. Fragen Sie den Benutzer bei Fragen.

- [ ] 10. Finaler Checkpoint - Phase 6 abgeschlossen
  - Stellen Sie sicher, dass alle Tests bestehen. Fragen Sie den Benutzer bei Fragen.

## Notes

- Aufgaben, die mit `*` markiert sind, sind optional und können für einen schnelleren MVP übersprungen werden
- Jede Aufgabe referenziert spezifische Requirements für Rückverfolgbarkeit
- Checkpoints stellen sicher, dass inkrementelle Validierung erfolgt
- Property-Tests validieren universelle Korrektheitseigenschaften
- Unit-Tests validieren spezifische Beispiele und Randfälle
- Alle Code-Beispiele verwenden TypeScript
- Das Projekt verwendet Svelte 5 Runes ($state, $derived, $effect)

## Requirements-Abdeckung

| Requirement | Aufgaben |
|-------------|----------|
| 1.1, 1.2, 1.3, 1.4, 1.5 | 1.3, 2.7, 2.8, 3.4 |
| 2.1, 2.2, 2.3, 2.4, 2.5 | 1.4, 6.1 |
| 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | 2.5, 3.2, 3.3, 6.2 |
| 4.1, 4.2, 4.3, 4.4, 4.5, 4.6 | 2.5, 3.1, 6.3 |
| 5.1, 5.2, 5.3, 5.4 | 3.2, 3.3 |
| 6.1, 6.2, 6.3, 6.4, 6.5, 6.6 | 2.1, 2.2, 2.3, 6.3 |
| 7.1, 7.2, 7.3, 7.4, 7.5 | 3.5, 6.6 |
| 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7 | 3.7 |
| 9.1, 9.2, 9.3, 9.4, 9.5, 9.6 | 3.8 |
| 10.1, 10.2, 10.3, 10.4, 10.5 | 5.1, 5.2 |
| 11.1, 11.2, 11.3, 11.4 | 6.4 |
| 12.1, 12.2, 12.3, 12.4, 12.5 | 4.1, 4.2, 4.3, 4.4, 4.5 |
| 13.1, 13.2, 13.3, 13.4, 13.5 | 6.5 |
| 14.1, 14.2, 14.3, 14.4, 14.5, 14.6 | 3.9, 3.10 |
| 15.1, 15.2, 15.3, 15.4, 15.5 | 3.11, 5.3, 5.4 |
| 16.1, 16.2, 16.3, 16.4, 16.5 | 3.6 |
| 17.1, 17.2, 17.3, 17.4, 17.5 | 3.1 |
| 18.1, 18.2, 18.3, 18.4, 18.5 | 3.5 |
| 19.1, 19.2, 19.3, 19.4, 19.5 | 3.8, 6.6 |
| 20.1, 20.2, 20.3, 20.4, 20.5 | 5.5, 5.6 |
| 21.1, 21.2, 21.3, 21.4, 21.5 | 1.1, 1.5 |
| 22.1, 22.2, 22.3, 22.4, 22.5 | 3.4 |
| 23.1, 23.2, 23.3, 23.4 | 6.6 |
| 24.1, 24.2, 24.3, 24.4, 24.5 | 5.7 |
| 25.1, 25.2, 25.3, 25.4, 25.5 | 1.2 |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "2.1", "2.5", "2.7"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.6", "2.8", "2.9"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["4.5", "5.1", "5.3", "5.5", "5.7"] },
    { "id": 6, "tasks": ["5.2", "5.4", "5.6"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] }
  ]
}
```
