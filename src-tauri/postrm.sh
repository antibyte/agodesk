#!/bin/sh
# postrm / %postun equivalent for agodesk (deb + rpm)
# Cleanup autostart + desktop database on remove/purge.
# Mirrors NSIS_HOOK_POSTUNINSTALL spirit.

set -e

APP_NAME="agodesk"
AUTOSTART_FILE="/etc/xdg/autostart/${APP_NAME}.desktop"

case "$1" in
  remove|purge|0)
    # Remove autostart entry on uninstall/purge
    if [ -f "$AUTOSTART_FILE" ]; then
      rm -f "$AUTOSTART_FILE" || true
    fi

    # Update desktop database
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database /usr/share/applications || true
    fi
    ;;
esac

exit 0
