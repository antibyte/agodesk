#!/usr/bin/env bash
#
# Build the full Linux packages for agodesk (deb + AppImage + rpm).
# Chains frontend build + sidecar worker + tauri build targeting deb,appimage,rpm + computer-use-sidecar feature.
# Intended for local Linux dev/CI (or WSL with caveats). Produces the distributable bundles.
# Mirrors scripts/build-windows-installer.ps1 exactly in structure and intent.
#
# EXAMPLE
#   bash scripts/build-linux-installer.sh
#   # or with clean
#   bash scripts/build-linux-installer.sh --clean
#
set -euo pipefail

CLEAN=0
if [[ "${1:-}" == "--clean" || "${1:-}" == "-c" ]]; then
  CLEAN=1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if (( CLEAN )); then
  echo "Cleaning target..."
  if [[ -d "src-tauri/target" ]]; then
    rm -rf "src-tauri/target"
  fi
fi

echo "Running full Linux bundle build via npm run build:linux ..."
npm run build:linux

BUNDLE_DIR="src-tauri/target/release/bundle"
echo ""
if [[ -d "$BUNDLE_DIR/deb" || -d "$BUNDLE_DIR/appimage" || -d "$BUNDLE_DIR/rpm" ]]; then
  echo "SUCCESS: Linux packages ready under $BUNDLE_DIR"
  echo ""
  echo "=== deb ==="
  ls -l "$BUNDLE_DIR/deb/"*.deb 2>/dev/null || echo "(no .deb)"
  echo ""
  echo "=== AppImage ==="
  ls -l "$BUNDLE_DIR/appimage/"*.AppImage 2>/dev/null || echo "(no .AppImage)"
  echo ""
  echo "=== rpm ==="
  ls -l "$BUNDLE_DIR/rpm/"*.rpm 2>/dev/null || echo "(no .rpm)"
else
  echo "WARNING: Expected bundle subdirs (deb/appimage/rpm) not found under $BUNDLE_DIR; check build logs."
fi

echo ""
echo "Tip: On Ubuntu/Debian: sudo dpkg -i <deb>"
echo "     AppImage: chmod +x <AppImage> && ./<AppImage>  (may need libfuse2 or fuse3)"
echo "     Fedora/RHEL: sudo rpm -i <rpm>"
