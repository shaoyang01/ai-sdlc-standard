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
  The legacy core script (bootstrap-speckit-project.sh) is RETIRED for new
  projects (Decision-088/089). The successor is bootstrap-knowledge-target.sh —
  knowledge-target initialization creates .sdlc/ structure + candidate facts
  without the .specify chain. Legacy-only arguments are rejected with migration
  guidance.

  This wrapper does not implement project bootstrap logic itself. It only resolves
  the current directory and passes it as <target-project-path> to the core script.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEGACY_SCRIPT="${SCRIPT_DIR}/bootstrap-speckit-project.sh"
SUCCESSOR_SCRIPT="${SCRIPT_DIR}/bootstrap-knowledge-target.sh"
TARGET_PATH="$(pwd)"
FORWARDED_ARGS=()

usage() {
  cat <<'USAGE'
Usage:
  scripts/bootstrap-current-project.sh [--here] [options]

Description:
  Convenience wrapper. The legacy core script (bootstrap-speckit-project.sh)
  is RETIRED for new projects (Decision-088/089): the successor for new
  projects is bootstrap-knowledge-target.sh — knowledge-target initialization
  creates .sdlc/ structure + candidate facts WITHOUT the .specify chain.

Options:
  --here                       Explicitly confirm that the current directory is the target project.
  --project-name <name>        Mapped to the successor where semantics match.
  --language <language>        Mapped to the successor where semantics match.
  --force-profiles             Legacy-only: rejected with migration guidance.
  --force-context              Legacy-only: rejected with migration guidance.
  --standard-package <path>    Forwarded (standard package root).
  --dry-run                    Mapped to the successor where semantics match.
  -h, --help                   Show this help.

Examples:
  cd <target-project-path>
  "$AI_SDLC_STANDARD_HOME/scripts/bootstrap-current-project.sh" --here --dry-run

Migration guidance:
  Legacy-only arguments are rejected with guidance instead of silently entering
  the retired .specify initialization chain. The retired chain is reachable ONLY
  through the explicit --legacy-speckit flag; if the successor initializer is
  missing, this entry fails closed (exit 3) rather than auto-degrading.
USAGE
}

# ---- 1. parse arguments (fill FORWARDED_ARGS) ----
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
    --force-profiles|--force-context|--dry-run|--legacy-speckit)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
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

# ---- 2. retirement classification gate (R13-B5) ----
supports_successor_arg() {
  case "$1" in
    --project-name|--language|--standard-package|--dry-run|-h|--help|--legacy-speckit) return 0 ;;
    *) return 1 ;;
  esac
}

legacy_only_args=()
i=0
while [[ ${i} -lt ${#FORWARDED_ARGS[@]} ]]; do
  a="${FORWARDED_ARGS[${i}]}"
  case "${a}" in
    --project-name|--language|--application-type|--standard-package)
      # option with a value: classify the option, skip its value
      if ! supports_successor_arg "${a}"; then
        legacy_only_args+=("${a}")
      fi
      i+=2
      continue
      ;;
  esac
  if ! supports_successor_arg "${a}"; then
    legacy_only_args+=("${a}")
  fi
  i+=1
done

if [[ "${#legacy_only_args[@]}" -gt 0 ]]; then
  echo "bootstrap-current-project: these arguments belong ONLY to the RETIRED" >&2
  echo "  speckit initializer and cannot be mapped to the successor:" >&2
  for a in "${legacy_only_args[@]}"; do echo "  ${a}" >&2; done
  echo "Migration guidance:" >&2
  echo "  New projects: use ${SUCCESSOR_SCRIPT} (knowledge-target initialization)." >&2
  echo "  It creates .sdlc/ structure + candidate facts — no .specify chain." >&2
  echo "  Run it with --help to inspect the successor's own options." >&2
  exit 2
fi

# ---- 3. dispatch (R1-P1-6: FAIL CLOSED) ----
# This convenience entry NEVER auto-degrades to the retired speckit chain. The
# retired initializer is only reachable through the explicit
# `--legacy-speckit` flag (a deliberate, visible opt-in for an existing project
# that still depends on it) — a new project in an incomplete installation must
# stop, not silently enter .specify.
LEGACY_OPT_IN="false"
for a in "${FORWARDED_ARGS[@]:-}"; do
  [[ "${a}" == "--legacy-speckit" ]] && LEGACY_OPT_IN="true"
done

if [[ -x "${SUCCESSOR_SCRIPT}" ]]; then
  echo "bootstrap-current-project: delegating to bootstrap-knowledge-target.sh (successor)." >&2
  echo "  Note: initialization only creates structure and candidate facts —" >&2
  echo "  stable knowledge facts are written later via sdlc-knowledge-sync," >&2
  echo "  then confirmed by the Owner (route confirmation), then audited" >&2
  echo "  via scripts/audit-entry-coverage.sh." >&2
  exec "${SUCCESSOR_SCRIPT}" "${TARGET_PATH}" "${FORWARDED_ARGS[@]:-}"
fi

if [[ "${LEGACY_OPT_IN}" != "true" ]]; then
  echo "bootstrap-current-project: the successor initializer is missing or not executable:" >&2
  echo "  ${SUCCESSOR_SCRIPT}" >&2
  echo "" >&2
  echo "Refusing to fall back to the RETIRED speckit initializer for a new project" >&2
  echo "(fail-closed). To proceed:" >&2
  echo "  1. restore the standard package (scripts/bootstrap-knowledge-target.sh), or" >&2
  echo "  2. if this is an EXISTING project that explicitly depends on the retired" >&2
  echo "     .specify chain, re-run with the explicit flag:" >&2
  echo "       $0 --legacy-speckit <other args>" >&2
  exit 3
fi

if [[ ! -x "${LEGACY_SCRIPT}" ]]; then
  echo "bootstrap-current-project: --legacy-speckit requested but the legacy initializer is not executable:" >&2
  echo "  ${LEGACY_SCRIPT}" >&2
  exit 3
fi

echo "bootstrap-current-project: EXPLICIT legacy opt-in — delegating to the retired" >&2
echo "  speckit initializer. This chain is retired for new projects;" >&2
echo "  prefer bootstrap-knowledge-target.sh." >&2
# strip the opt-in flag before forwarding
LEGACY_FORWARD=()
for a in "${FORWARDED_ARGS[@]:-}"; do
  [[ "${a}" == "--legacy-speckit" ]] && continue
  LEGACY_FORWARD+=("${a}")
done
exec "${LEGACY_SCRIPT}" "${TARGET_PATH}" "${LEGACY_FORWARD[@]:-}"
