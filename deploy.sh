#!/usr/bin/env bash
# deploy-personal.sh — personal-staging variant of deploy.sh.
#
# Same flow as scripts/deploy.sh, but targets /var/www/html/staging and keeps
# multiple versioned builds side-by-side, with a stable symlink (e.g. samd,
# tee-laac-ui) that points at the currently-active one.
#
# Usage:
#   deploy-personal.sh <symlink-name> <path/to/artifact.tgz> --host <ip> --user <user> \
#     [--dest <remote-web-root>]
#
#   --dest defaults to /var/www/html/staging
#
# Example:
#   ./scripts/deploy-personal.sh samd ~/test-dev-setup/watchmate-ui-1.0.18.tgz \
#     --host 10.10.4.67 --user rohit
#
#   ./scripts/deploy-personal.sh tee-laac-ui ./tee-laac-ui-2.0.0.tgz \
#     --host 10.10.4.67 --user rohit --dest /var/www/html/custom-staging
#
# Auth — you will be prompted THREE times (no multiplexing, no sshpass):
#   1. scp's SSH login prompt
#   2. ssh's SSH login prompt  (separate connection)
#   3. sudo -i's password prompt on the remote pty
#   All prompts are handled by OpenSSH / sudo directly; the script never
#   captures or relays a password.
#
# What it does on the remote (web root: REMOTE_DEST, default /var/www/html/staging):
#   Given an artifact named e.g. `watchmate-ui-1.0.18.tgz`, derive
#   VERSION_DIR = "watchmate-ui-1.0.18" (the basename without .tgz / .tar.gz).
#
#   1. scp the tgz to /tmp
#   2. ssh + sudo -i, then:
#        a. mv /tmp/<tgz> <REMOTE_DEST>/
#        b. rm -rf ./package && tar -xzf <tgz>       (creates ./package/)
#        c. find package -exec touch "{}" +          (refresh mtimes)
#        d. rm -rf ./<VERSION_DIR>
#           mv package/dist ./<VERSION_DIR>
#           rm -rf ./package
#        e. ln -sfn <VERSION_DIR> ./<symlink-name>
#        f. nginx -t && systemctl reload nginx
#
# The build step is NOT handled here — build with `npm pack` inside the app
# directory first. See docs/DEPLOY.md for details.

set -euo pipefail

DEFAULT_REMOTE_DEST="/var/www/html/staging"

die() { echo "error: $*" >&2; exit 1; }

usage() {
  sed -n '2,37p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

TARGET_DIR="${1:-}"
ARTIFACT="${2:-}"
[[ -z "$TARGET_DIR" || -z "$ARTIFACT" ]] && usage
shift 2 || true

[[ "$TARGET_DIR" != */* && "$TARGET_DIR" != *..* ]] \
  || die "symlink name must be a simple folder name (got '$TARGET_DIR')"

[[ -f "$ARTIFACT" ]] || die "artifact not found: $ARTIFACT"

REMOTE_USER=""
REMOTE_HOST=""
REMOTE_DEST="$DEFAULT_REMOTE_DEST"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) REMOTE_USER="$2"; shift 2 ;;
    --host|--ip) REMOTE_HOST="$2"; shift 2 ;;
    --dest) REMOTE_DEST="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ -n "$REMOTE_USER" ]] || die "remote user not set (--user <name>)"
[[ -n "$REMOTE_HOST" ]] || die "remote host not set (--host <ip-or-hostname>)"
[[ "$REMOTE_DEST" == /* && "$REMOTE_DEST" != *..* ]] \
  || die "remote dest must be an absolute path without '..' (got '$REMOTE_DEST')"

ARTIFACT_FILE="$(basename "$ARTIFACT")"
REMOTE_TMP="/tmp/${ARTIFACT_FILE}"

# Strip a trailing .tgz or .tar.gz from the artifact filename to form the
# versioned directory name we'll store the extracted build under.
VERSION_DIR="${ARTIFACT_FILE%.tgz}"
VERSION_DIR="${VERSION_DIR%.tar.gz}"
[[ "$VERSION_DIR" != "$ARTIFACT_FILE" ]] \
  || die "artifact must end in .tgz or .tar.gz (got '$ARTIFACT_FILE')"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)

echo ">> symlink:  ${TARGET_DIR} -> ${VERSION_DIR}"
echo ">> artifact: $ARTIFACT"
echo ">> dest:     $REMOTE_DEST"
echo ">> remote:   ${REMOTE_USER}@${REMOTE_HOST}"

# ----- step 1: scp the tarball (1st SSH login prompt) ----------------------
echo ">> [1/2] scp — OpenSSH will prompt for your login password"
scp "${SSH_OPTS[@]}" "$ARTIFACT" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_TMP}"

# ----- step 2: ssh + sudo -i (2nd SSH login prompt, then sudo prompt) ------
# Build the remote script. Variable bindings are emitted via `printf %q` so
# filenames/paths with spaces or special chars can't break the quoting. The
# body itself is a single-quoted heredoc so no extra escaping is needed.
REMOTE_SCRIPT=$(
  printf 'ARTIFACT_FILE=%q\n' "$ARTIFACT_FILE"
  printf 'REMOTE_TMP=%q\n'    "$REMOTE_TMP"
  printf 'VERSION_DIR=%q\n'   "$VERSION_DIR"
  printf 'TARGET_DIR=%q\n'    "$TARGET_DIR"
  printf 'REMOTE_DEST=%q\n'   "$REMOTE_DEST"
  cat <<'REMOTE'
set -euo pipefail

mkdir -p "$REMOTE_DEST"
cd "$REMOTE_DEST"

# 1. Bring the tarball in under its original name.
mv -f "$REMOTE_TMP" "$REMOTE_DEST/$ARTIFACT_FILE"

# 2. Extract fresh — npm pack archives always unpack to ./package/.
rm -rf "$REMOTE_DEST/package"
tar -xzf "$REMOTE_DEST/$ARTIFACT_FILE"

# 3. Refresh mtimes (npm pack preserves old timestamps).
find "$REMOTE_DEST/package" -exec touch "{}" +

# 4. Promote package/dist -> <VERSION_DIR>, then tidy up.
rm -rf "$REMOTE_DEST/$VERSION_DIR"
mv    "$REMOTE_DEST/package/dist" "$REMOTE_DEST/$VERSION_DIR"
rm -rf "$REMOTE_DEST/package"

# 5. Flip the stable symlink to the new version.
#    -sfn = symbolic, force-replace, no-deref-target (atomic even when the
#    current link already points at a directory).
ln -sfn "$VERSION_DIR" "$REMOTE_DEST/$TARGET_DIR"

echo "   deployed: $REMOTE_DEST/$VERSION_DIR"
echo "   symlink:  $REMOTE_DEST/$TARGET_DIR -> $VERSION_DIR"

# 6. Validate nginx config and reload. `nginx -t` exits non-zero on a bad
#    config, so `set -e` aborts before the reload — the site stays up.
echo "   reloading nginx..."
nginx -t
systemctl reload nginx
echo "   nginx reloaded"
REMOTE
)

# Ship the script as a base64 blob to sidestep any local-shell → remote-shell
# quoting issues. Remote decodes and pipes into `sudo -i bash`, which prompts
# once on the pty (ssh -tt guarantees a pty) and then runs as root.
SCRIPT_B64=$(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n')

echo ">> [2/2] ssh + sudo -i — OpenSSH will prompt again, then sudo will prompt for its password"
ssh -tt "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
  "echo '${SCRIPT_B64}' | base64 -d | sudo -i bash"

echo ">> done"
