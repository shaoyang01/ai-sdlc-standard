#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/bootstrap-current-project.sh [--here] [options]

Description:
  Convenience wrapper for scripts/bootstrap-speckit-project.sh.
  It always bootstraps the current working directory and delegates all generation
  behavior to the core bootstrap script.

Options:
  --here                       Explicitly confirm that the current directory is the target project.
  --project-name <name>        Forwarded to bootstrap-speckit-project.sh.
  --language <language>        Forwarded to bootstrap-speckit-project.sh.
  --application-type <type>    Forwarded to bootstrap-speckit-project.sh.
  --standard-package <path>    Forwarded to bootstrap-speckit-project.sh.
  --force-profiles             Forwarded to bootstrap-speckit-project.sh.
  --force-context              Forwarded to bootstrap-speckit-project.sh.
  --dry-run                    Forwarded to bootstrap-speckit-project.sh.
  -h, --help                   Show this help.

Examples:
  cd <target-project-path>
  "$AI_SDLC_STANDARD_HOME/scripts/bootstrap-current-project.sh" --here --dry-run
  "$AI_SDLC_STANDARD_HOME/scripts/bootstrap-current-project.sh" --here

Notes:
  This wrapper does not implement project bootstrap logic itself. It only resolves
  the current directory and passes it as <target-project-path> to the core script.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_SCRIPT="${SCRIPT_DIR}/bootstrap-speckit-project.sh"
TARGET_PATH="$(pwd)"
FORWARDED_ARGS=()

if [[ ! -x "${CORE_SCRIPT}" ]]; then
  echo "Core bootstrap script is not executable: ${CORE_SCRIPT}" >&2
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --here)
      shift
      ;;
    --project-name|--language|--application-type|--standard-package)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for option: $1" >&2
        usage >&2
        exit 2
      fi
      FORWARDED_ARGS+=("$1" "$2")
      shift 2
      ;;
    --force-profiles|--force-context|--dry-run)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      # Preserve core-script behavior for unknown options by forwarding them.
      FORWARDED_ARGS+=("$1")
      shift
      ;;
    *)
      echo "This wrapper always uses the current directory as the target project path." >&2
      echo "Do not pass a positional target path here; cd into the target project first." >&2
      exit 2
      ;;
  esac
done

exec "${CORE_SCRIPT}" "${TARGET_PATH}" "${FORWARDED_ARGS[@]}"
