#!/bin/sh
# Lockasaur AppImage launcher. Ubuntu 24.04+ restricts unprivileged
# user namespaces to binaries whose AppArmor profile grants "userns"; an
# AppImage cannot ship system policy and its chrome-sandbox cannot be setuid
# root on a FUSE mount, so Chromium's sandbox init aborts with a FATAL. This
# wrapper detects that case before the app starts and offers a one-time,
# pkexec-authorized install of an AppArmor profile scoped to the Lockasaur
# AppImage mount path, then launches the app with its sandbox working.
#
# SECURITY INVARIANT: this wrapper must never pass --no-sandbox or otherwise
# weaken the Chromium sandbox. On refusal or failure it exits with
# instructions instead.
#
# Known limitation: the profile matches the default mount root (/tmp). With a
# custom TMPDIR or --appimage-extract-and-run the binary path differs and the
# restriction still applies; the .deb is the recommended install there.

set -u

APPDIR="${APPDIR:-$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)}"
REAL="$APPDIR/AppRun.orig"

PROFILE_PATH="/etc/apparmor.d/lockasaur-appimage"
# Test hook: the container smoke test fakes the sysctl file, which does not
# exist inside Docker. Pointing this at a different file only changes what is
# read, never what is installed or executed.
USERNS_PROC="${LOCKASAUR_USERNS_PROC:-/proc/sys/kernel/apparmor_restrict_unprivileged_userns}"

restricted=0
if [ -r "$USERNS_PROC" ] && [ "$(cat "$USERNS_PROC" 2>/dev/null)" = "1" ] && [ ! -e "$PROFILE_PATH" ]; then
    restricted=1
fi

if [ "$restricted" = "0" ]; then
    exec "$REAL" "$@"
fi

# The attachment path must match the mounted binary exactly: the AppImage
# runtime mounts at /tmp/.mount_<artifact-name prefix><random>, and
# electron-builder names the Linux executable after the lowercased
# package.json name ("lockasaur"). Keep both in sync with package.json and
# artifactName in electron-builder.config.cjs.
profile_text='abi <abi/4.0>,
include <tunables/global>

profile lockasaur-appimage /tmp/.mount_Locka*/lockasaur flags=(unconfined) {
  userns,

  include if exists <local/lockasaur-appimage>
}'

print_manual_hint() {
    printf '%s\n' "Lockasaur: this system restricts unprivileged user namespaces (Ubuntu 24.04+), so the AppImage cannot start its sandbox without a one-time AppArmor profile." >&2
    printf '%s\n' "Install it manually with:" >&2
    printf '%s\n' "  sudo sh -c 'cat > $PROFILE_PATH' <<'EOF'" >&2
    printf '%s\n' "$profile_text" >&2
    printf '%s\n' "EOF" >&2
    printf '%s\n' "  sudo apparmor_parser -r $PROFILE_PATH" >&2
    printf '%s\n' "Or install the .deb package instead, which sets this up automatically:" >&2
    printf '%s\n' "  https://github.com/sampalest/cryptox/releases" >&2
}

consent=no
if [ -t 0 ] && [ -t 2 ]; then
    printf '%s\n' "Lockasaur needs a one-time AppArmor profile to run sandboxed on this system." >&2
    printf '%s' "Install it now (asks for your password)? [y/N] " >&2
    read -r answer || answer=""
    case "$answer" in
        y|Y|yes|YES) consent=yes ;;
        *) consent=no ;;
    esac
elif command -v zenity >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    if zenity --question --title "Lockasaur" --text "Lockasaur needs a one-time system permission (an AppArmor profile) to run with its security sandbox on this system. Install it now? You will be asked for your password."; then
        consent=yes
    fi
else
    # No terminal and no zenity: pkexec's own authentication dialog is the
    # consent step.
    consent=yes
fi

if [ "$consent" != "yes" ]; then
    print_manual_hint
    exit 1
fi

if ! command -v pkexec >/dev/null 2>&1; then
    print_manual_hint
    exit 1
fi

tmpdir="$(mktemp -d)" || exit 1
trap 'rm -rf "$tmpdir"' EXIT
printf '%s\n' "$profile_text" > "$tmpdir/profile"

# The profile file is passed as a positional argument so no user-controlled
# text is interpolated into the root shell command.
if pkexec /bin/sh -c 'install -D -m 0644 -o root -g root "$1" /etc/apparmor.d/lockasaur-appimage && apparmor_parser -r /etc/apparmor.d/lockasaur-appimage' sh "$tmpdir/profile"; then
    exec "$REAL" "$@"
fi

print_manual_hint
exit 1
