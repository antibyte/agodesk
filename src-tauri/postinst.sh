#!/bin/sh
# postinst / %post equivalent for agodesk (deb + rpm)
# Mirrors the spirit of installer.nsh NSIS_HOOK_POSTINSTALL:
# - ensure desktop database is updated
# - install autostart entry (system-wide via /etc/xdg/autostart, like Windows silent/default)
# - the .desktop itself is provided by Tauri (or custom desktopTemplate)

set -e

APP_NAME="agodesk"
DESKTOP_FILE="/usr/share/applications/${APP_NAME}.desktop"
AUTOSTART_DIR="/etc/xdg/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/${APP_NAME}.desktop"

case "$1" in
  configure|1|2)  # deb configure / rpm install(1) or upgrade(2)
    # Update desktop database if available
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database /usr/share/applications || true
    fi

    # Create autostart entry (enable "start at login" by default, matching Windows behavior in silent/non-interactive)
    if [ -f "$DESKTOP_FILE" ]; then
      mkdir -p "$AUTOSTART_DIR"
      cp -f "$DESKTOP_FILE" "$AUTOSTART_FILE" || true
      chmod 644 "$AUTOSTART_FILE" || true
    fi

    echo "agodesk: desktop entry installed. Autostart enabled system-wide (remove $AUTOSTART_FILE to disable per-machine)."
    ;;
esac

exit 0
