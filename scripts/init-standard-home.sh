#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/init-standard-home.sh [options]

Options:
  --standard-home <path>  Standard package path. Defaults to the repository containing this script.
  --profile <file>        Shell profile to update. Defaults to ~/.zshrc for zsh, otherwise ~/.bashrc.
  --dry-run               Print the profile update without writing files.
  --print                 Print an export command only.
  --force                 Replace an existing managed block without prompting.
  -h, --help              Show this help.

This script persists:
  export AI_SDLC_STANDARD_HOME="<standard-package-path>"

It updates only a managed block:
  # >>> ai-sdlc-standard >>>
  ...
  # <<< ai-sdlc-standard <<<
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_STANDARD_HOME="$(cd "${SCRIPT_DIR}/.." && pwd)"

STANDARD_HOME="${DEFAULT_STANDARD_HOME}"
PROFILE_PATH=""
DRY_RUN="false"
PRINT_ONLY="false"
FORCE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --standard-home)
      STANDARD_HOME="${2:-}"
      shift 2
      ;;
    --profile)
      PROFILE_PATH="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --print)
      PRINT_ONLY="true"
      shift
      ;;
    --force)
      FORCE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${STANDARD_HOME}" ]]; then
  echo "--standard-home cannot be empty." >&2
  exit 2
fi

if [[ ! -d "${STANDARD_HOME}" ]]; then
  echo "Standard package path does not exist: ${STANDARD_HOME}" >&2
  exit 1
fi

STANDARD_HOME="$(cd "${STANDARD_HOME}" && pwd)"

if [[ ! -f "${STANDARD_HOME}/manifest.yaml" ]]; then
  echo "manifest.yaml not found under standard package path: ${STANDARD_HOME}" >&2
  exit 1
fi

if [[ ! -d "${STANDARD_HOME}/ai-sdlc" ]]; then
  echo "ai-sdlc/ not found under standard package path: ${STANDARD_HOME}" >&2
  exit 1
fi

quote_for_shell() {
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
}

EXPORT_LINE="export AI_SDLC_STANDARD_HOME='$(quote_for_shell "${STANDARD_HOME}")'"

if [[ "${PRINT_ONLY}" == "true" ]]; then
  printf '%s\n' "${EXPORT_LINE}"
  exit 0
fi

if [[ -z "${PROFILE_PATH}" ]]; then
  case "${SHELL:-}" in
    */zsh)
      PROFILE_PATH="${HOME}/.zshrc"
      ;;
    */bash)
      PROFILE_PATH="${HOME}/.bashrc"
      ;;
    *)
      if [[ -f "${HOME}/.zshrc" ]]; then
        PROFILE_PATH="${HOME}/.zshrc"
      else
        PROFILE_PATH="${HOME}/.bashrc"
      fi
      ;;
  esac
fi

PROFILE_DIR="$(dirname "${PROFILE_PATH}")"
if [[ ! -d "${PROFILE_DIR}" ]]; then
  echo "Profile directory does not exist: ${PROFILE_DIR}" >&2
  exit 1
fi

BEGIN_MARKER="# >>> ai-sdlc-standard >>>"
END_MARKER="# <<< ai-sdlc-standard <<<"

MANAGED_BLOCK="$(cat <<EOF
${BEGIN_MARKER}
# Managed by ai-sdlc-standard/scripts/init-standard-home.sh
${EXPORT_LINE}
${END_MARKER}
EOF
)"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "Profile: ${PROFILE_PATH}"
  echo
  printf '%s\n' "${MANAGED_BLOCK}"
  exit 0
fi

touch "${PROFILE_PATH}"

if grep -qF "${BEGIN_MARKER}" "${PROFILE_PATH}" && [[ "${FORCE}" != "true" ]]; then
  echo "Existing ai-sdlc-standard managed block found in ${PROFILE_PATH}."
  echo "Use --force to replace it."
  exit 1
fi

TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/ai-sdlc-profile.XXXXXX")"
awk -v begin="${BEGIN_MARKER}" -v end="${END_MARKER}" '
  $0 == begin { skip = 1; next }
  $0 == end { skip = 0; next }
  skip != 1 { print }
' "${PROFILE_PATH}" > "${TMP_FILE}"

{
  cat "${TMP_FILE}"
  if [[ -s "${TMP_FILE}" ]]; then
    printf '\n'
  fi
  printf '%s\n' "${MANAGED_BLOCK}"
} > "${PROFILE_PATH}"

rm -f "${TMP_FILE}"

echo "AI_SDLC_STANDARD_HOME written to ${PROFILE_PATH}"
echo "Value: ${STANDARD_HOME}"
echo "Run 'source ${PROFILE_PATH}' or open a new shell before using installed sdlc-* skills."
