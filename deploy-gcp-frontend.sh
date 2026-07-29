#!/usr/bin/env bash
# deploy-gcp-frontend.sh — deploy tee-laac-ui and/or watchmate-ui to GCP
# watchmate GPU VMs, then run deploy_frontend_with_prefix.sh.
#
# Usage:
#   deploy-gcp-frontend.sh [options] <vm-prefix> [<vm-prefix> ...]
#
#   VM prefixes are short names like w1-3, w1-1, w1-0. Each maps to a GCP
#   instance anumana-watchmate-gpu-new-<prefix> (override with --instance-prefix).
#
# Options:
#   --tee-laac-branch <branch>   Optional branch to checkout in tee-laac-ui
#   --watchmate-branch <branch>  Optional branch to checkout in watchmate-ui
#   --zone <zone>                GCP zone (default: asia-south1-c)
#   --project <project>          GCP project (default: anumana-sd)
#   --instance-prefix <prefix>   Instance name prefix (default: anumana-watchmate-gpu-new-)
#   --env-file <path>            Path to .env with credentials (default: alongside this script)
#   -h, --help
#
# At least one of --tee-laac-branch or --watchmate-branch is required.
#
# Credentials (read from --env-file):
#   ANUMANA_PASSWORD   password for `su anumana` on the VM
#   GITHUB_USER_NAME   GitHub username for git fetch
#   GITHUB_TOKEN       GitHub token for git fetch
#
# Example:
#   ./deploy-gcp-frontend.sh --tee-laac-branch dev w1-3
#
#   ./deploy-gcp-frontend.sh --tee-laac-branch dev --watchmate-branch main w1-3 w1-1
#
#   ./deploy-gcp-frontend.sh --watchmate-branch main w1-3
#
# Requires: gcloud (Google Cloud SDK), expect
# If gcloud is not on PATH, set GCLOUD_BIN or install to ~/google-cloud-sdk

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "error: $*" >&2; exit 1; }

usage() {
  sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

resolve_gcloud() {
  local candidate

  if [[ -n "${GCLOUD_BIN:-}" && -x "$GCLOUD_BIN" ]]; then
    printf '%s' "$GCLOUD_BIN"
    return 0
  fi

  if command -v gcloud >/dev/null 2>&1; then
    command -v gcloud
    return 0
  fi

  for candidate in \
    "${HOME}/google-cloud-sdk/bin/gcloud" \
    "/opt/homebrew/share/google-cloud-sdk/bin/gcloud" \
    "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud" \
    "/usr/local/google-cloud-sdk/bin/gcloud"; do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done

  die "gcloud not found. Install Google Cloud SDK or set GCLOUD_BIN to its path."
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || die "env file not found: $file"

  # shellcheck disable=SC1090
  set -a
  source "$file"
  set +a

  [[ -n "${ANUMANA_PASSWORD:-}" ]] || die "ANUMANA_PASSWORD not set in $file"
  [[ -n "${GITHUB_USER_NAME:-}" ]] || die "GITHUB_USER_NAME not set in $file"
  [[ -n "${GITHUB_TOKEN:-}" ]] || die "GITHUB_TOKEN not set in $file"
}

GCP_ZONE="asia-south1-c"
GCP_PROJECT="anumana-sd"
INSTANCE_PREFIX="anumana-watchmate-gpu-new-"
ENV_FILE="${SCRIPT_DIR}/.env"
TEE_LAAC_BRANCH=""
WATCHMATE_BRANCH=""
VM_PREFIXES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tee-laac-branch) TEE_LAAC_BRANCH="$2"; shift 2 ;;
    --watchmate-branch)   WATCHMATE_BRANCH="$2"; shift 2 ;;
    --zone)            GCP_ZONE="$2"; shift 2 ;;
    --project)         GCP_PROJECT="$2"; shift 2 ;;
    --instance-prefix) INSTANCE_PREFIX="$2"; shift 2 ;;
    --env-file)        ENV_FILE="$2"; shift 2 ;;
    -h|--help)         usage ;;
    --)                shift; VM_PREFIXES+=("$@"); break ;;
    -*)                die "unknown option: $1" ;;
    *)
      VM_PREFIXES+=("$1")
      shift
      ;;
  esac
done

[[ -n "$TEE_LAAC_BRANCH" || -n "$WATCHMATE_BRANCH" ]] \
  || die "at least one of --tee-laac-branch or --watchmate-branch is required"
[[ ${#VM_PREFIXES[@]} -gt 0 ]] || die "at least one VM prefix is required (e.g. w1-3)"

for prefix in "${VM_PREFIXES[@]}"; do
  [[ "$prefix" =~ ^[a-zA-Z0-9._-]+$ ]] \
    || die "invalid VM prefix '$prefix' (use simple names like w1-3)"
done

GCLOUD_CMD="$(resolve_gcloud)"
require_cmd expect
load_env_file "$ENV_FILE"

export PATH="$(dirname "$GCLOUD_CMD"):$PATH"
export GCLOUD_CMD

TEE_LAAC_DIR="/home/anumana/deployments/staging_deployment/frontend/tee-laac-ui"
WATCHMATE_DIR="/home/anumana/deployments/staging_deployment/frontend/watchmate-ui"
DEPLOY_ROOT="/home/anumana/deployments/staging_deployment"

# Inline git credential helper — credentials stay on the remote shell one-liner.
git_with_creds() {
  printf 'git -c credential.helper=%q' \
    "!f() { echo username=${GITHUB_USER_NAME}; echo password=${GITHUB_TOKEN}; }; f"
}

deploy_to_vm() {
  local vm_prefix="$1"
  local instance="${INSTANCE_PREFIX}${vm_prefix}"
  local git_cmd
  git_cmd="$(git_with_creds)"

  echo ">> VM:       ${vm_prefix} (${instance})"
  echo ">> zone:     ${GCP_ZONE}"
  echo ">> project:  ${GCP_PROJECT}"
  if [[ -n "$TEE_LAAC_BRANCH" ]]; then
    echo ">> tee-laac:  ${TEE_LAAC_BRANCH}"
  else
    echo ">> tee-laac:  (skipped)"
  fi
  if [[ -n "$WATCHMATE_BRANCH" ]]; then
    echo ">> watchmate: ${WATCHMATE_BRANCH}"
  else
    echo ">> watchmate: (skipped)"
  fi

  export ANUMANA_PASSWORD GITHUB_USER_NAME GITHUB_TOKEN
  export vm_prefix instance GCP_ZONE GCP_PROJECT
  export TEE_LAAC_BRANCH WATCHMATE_BRANCH
  export TEE_LAAC_DIR WATCHMATE_DIR DEPLOY_ROOT git_cmd

  # Credentials come from .env (exported above). Do not pass them as expect argv —
  # macOS expect treats the first bare argument as a script file path.
  expect <<'EXPECT_SCRIPT'
set anumana_password $env(ANUMANA_PASSWORD)
set github_user      $env(GITHUB_USER_NAME)
set github_token     $env(GITHUB_TOKEN)

set timeout -1

set vm_prefix        $env(vm_prefix)
set instance         $env(instance)
set zone             $env(GCP_ZONE)
set project          $env(GCP_PROJECT)
set tee_laac_branch  $env(TEE_LAAC_BRANCH)
set watchmate_branch $env(WATCHMATE_BRANCH)
set tee_laac_dir     $env(TEE_LAAC_DIR)
set watchmate_dir    $env(WATCHMATE_DIR)
set deploy_root      $env(DEPLOY_ROOT)
set git_cmd          $env(git_cmd)
set gcloud_cmd       $env(GCLOUD_CMD)

proc wait_for_shell {} {
  expect {
    -re {(?:\[.*@.*\]|)\s*[$#%]\s*$} { return }
    -re {\]\$\s*$} { return }
    timeout {
      puts stderr "timeout waiting for shell prompt"
      exit 1
    }
  }
}

proc run_cmd {cmd} {
  send -- "$cmd\r"
  wait_for_shell
}

puts ">> connecting via gcloud compute ssh..."
spawn $gcloud_cmd compute ssh --zone $zone $instance --tunnel-through-iap --project $project
wait_for_shell

puts ">> switching to anumana user (password from .env)..."
send "su - anumana\r"
expect {
  -re {(?i)(?:password|passwort)(?:\s+for\s+\S+)?\s*:?\s*$} {}
  -re {(?i)(?:password|passwort)(?:\s+for\s+\S+)?\s*:?\s*} {}
  timeout {
    puts stderr "timeout waiting for su password prompt"
    exit 1
  }
}
send -- "$anumana_password\r"

expect {
  -re {(?i)(authentication failure|su: authentication failure|su: incorrect password)} {
    puts stderr "su failed: bad ANUMANA_PASSWORD in .env"
    exit 1
  }
  -re {(?:\[.*@.*\]|)\s*[$#%]\s*$} {}
  -re {\]\$\s*$} {}
  timeout {
    puts stderr "timeout after sending su password"
    exit 1
  }
}

if {$tee_laac_branch ne ""} {
  puts ">> updating tee-laac-ui..."
  run_cmd "cd $tee_laac_dir"
  run_cmd "$git_cmd fetch origin"
  run_cmd "$git_cmd checkout $tee_laac_branch"
}

if {$watchmate_branch ne ""} {
  puts ">> updating watchmate-ui..."
  run_cmd "cd $watchmate_dir"
  run_cmd "$git_cmd fetch origin"
  run_cmd "$git_cmd checkout $watchmate_branch"
}

puts ">> running deploy_frontend_with_prefix.sh..."
run_cmd "cd $deploy_root"
run_cmd "NEW_WM_PREFIX_ENDPOINTS=$vm_prefix ./deploy_frontend_with_prefix.sh"

puts ">> done on $instance"
send "exit\r"
wait_for_shell
send "exit\r"
expect eof
EXPECT_SCRIPT
}

for vm_prefix in "${VM_PREFIXES[@]}"; do
  echo "========================================"
  deploy_to_vm "$vm_prefix"
  echo ">> finished: ${vm_prefix}"
  echo
done

echo ">> all deployments complete"
