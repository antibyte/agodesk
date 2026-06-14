; src-tauri/installer.nsh
; Optional NSIS hooks for the agodesk installer (referenced via bundle.windows.nsis.installerHooks if desired).
; See Tauri docs + the generated installer.nsi (after build) for available hooks.
; The default Tauri NSIS template already provides MUI_FINISHPAGE_RUN (optional "Run agodesk" on finish page)
; and desktop shortcut creation. Use this file only for extra post-install logic.

!macro NSIS_HOOK_PREINSTALL
  ; Runs before files are copied / registry / shortcuts.
  ; Example: MessageBox MB_OK "Pre-install hook for agodesk"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Runs after everything (files, registry, shortcuts) is done.
  ; The finish page run checkbox (MUI_FINISHPAGE_RUN) is handled by the main template after this.

  ; Always create desktop shortcut (in addition to the optional finish page "create desktop" button)
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Offer to create autostart entry (run at Windows startup).
  ; Skip the interactive question in silent/passive/update mode (default to create the entry).
  IfSilent auto_start
  IntCmp $PassiveMode 1 auto_start
  IntCmp $UpdateMode 1 auto_start

  MessageBox MB_YESNO|MB_ICONQUESTION "$(autoStartQuestion)" IDYES write_autostart IDNO done_autostart
  Goto done_autostart

  auto_start:
  write_autostart:
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe"

  done_autostart:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Before removal.
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; After removal (e.g. extra cleanup).
!macroend

; --- Custom strings for our installer options (used in POSTINSTALL hook) ---
; These will be used by the MessageBox for offering auto-start.
; We define for English and German (primary languages). For other languages NSIS will
; fall back to the English string.

LangString autoStartQuestion ${LANG_ENGLISH} "Do you want agodesk to start automatically when Windows starts?"
LangString autoStartQuestion ${LANG_GERMAN} "Möchten Sie, dass agodesk automatisch beim Start von Windows gestartet wird?"

; For other languages in our list, fallback will use English definition above.
; (If you want full translations, add proper LangString for LANG_FRENCH etc.)
