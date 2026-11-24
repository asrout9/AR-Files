#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo " Installing AR Files on Fedora Workstation"
echo "=========================================="

PREFIX="${HOME}/.local"
BIN_DIR="${PREFIX}/bin"
SHARE_DIR="${PREFIX}/share"
APP_SHARE_DIR="${SHARE_DIR}/ar-files"
UI_DIR="${APP_SHARE_DIR}/ui"
APPS_DIR="${SHARE_DIR}/applications"
ICONS_DIR="${SHARE_DIR}/icons"
METAINFO_DIR="${SHARE_DIR}/metainfo"
DBUS_DIR="${SHARE_DIR}/dbus-1/services"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "--> Creating directories..."
mkdir -p "${BIN_DIR}"
mkdir -p "${UI_DIR}"
mkdir -p "${APPS_DIR}"
mkdir -p "${ICONS_DIR}"
mkdir -p "${METAINFO_DIR}"
mkdir -p "${DBUS_DIR}"
mkdir -p "${SYSTEMD_USER_DIR}"

echo "--> Installing binaries..."
install -m 0755 "${SCRIPT_DIR}/packaging/bin/ar-files" "${BIN_DIR}/ar-files"
install -m 0755 "${SCRIPT_DIR}/target/release/ar-files" "${BIN_DIR}/ar-files-backend"

echo "--> Installing UI assets..."
rm -rf "${UI_DIR:?}"/*
cp -r "${SCRIPT_DIR}/ui/dist/"* "${UI_DIR}/"

echo "--> Installing desktop entry and metainfo..."
install -m 0644 "${SCRIPT_DIR}/packaging/desktop/org.arfiles.ARFiles.desktop" "${APPS_DIR}/org.arfiles.ARFiles.desktop"
install -m 0644 "${SCRIPT_DIR}/packaging/metainfo/org.arfiles.ARFiles.metainfo.xml" "${METAINFO_DIR}/org.arfiles.ARFiles.metainfo.xml"

echo "--> Installing icons..."
cp -r "${SCRIPT_DIR}/packaging/icons/hicolor" "${SHARE_DIR}/icons/"

echo "--> Installing D-Bus service..."
install -m 0644 "${SCRIPT_DIR}/packaging/dbus/org.freedesktop.FileManager1.service" "${DBUS_DIR}/org.freedesktop.FileManager1.service"

echo "--> Installing systemd user unit..."
install -m 0644 "${SCRIPT_DIR}/packaging/systemd/ar-files.service" "${SYSTEMD_USER_DIR}/ar-files.service"

echo "--> Updating desktop database and icon caches..."
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${APPS_DIR}" 2>/dev/null || true
fi

if command -v gtk4-update-icon-cache >/dev/null 2>&1; then
    gtk4-update-icon-cache -q -t -f "${ICONS_DIR}/hicolor" 2>/dev/null || true
elif command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f "${ICONS_DIR}/hicolor" 2>/dev/null || true
fi

if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload 2>/dev/null || true
fi

echo "=========================================="
echo " AR Files successfully installed!"
echo " Location: ${BIN_DIR}/ar-files"
echo " Backend:  ${BIN_DIR}/ar-files-backend"
echo " UI:       ${UI_DIR}"
echo " Desktop:  ${APPS_DIR}/org.arfiles.ARFiles.desktop"
echo "=========================================="
