#!/usr/bin/env bash

# sync-skills.sh — install/refresh the sdlc-* skills into supported agent
# skill directories (Decision-084 tooling).
#
# The kimi model: skills are installed as copies into each agent's own config
# directory, and every cross-repo reference uses
# ${AI_SDLC_STANDARD_HOME}/... so the installed copies stay portable across
# machines. Re-run this script after changing skills/ to re-sync all targets.
#
# Usage:
#   scripts/sync-skills.sh [--check] [agent ...]
#
# Agents: kimi (~/.kimi-code/skills), hermes (~/.hermes/skills).
# Default: sync every detected agent. --check reports drift without writing.

set -eu

agent_root() {
  case "$1" in
    kimi)   echo "${HOME}/.kimi-code/skills" ;;
    hermes) echo "${HOME}/.hermes/skills" ;;
    *) return 1 ;;
  esac
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_SKILLS="$(cd "${SCRIPT_DIR}/../skills" && pwd)"

CHECK=0
AGENTS=""
for arg in "$@"; do
  case "${arg}" in
    --check) CHECK=1 ;;
    kimi|hermes) AGENTS="${AGENTS}${AGENTS:+ }${arg}" ;;
    *) echo "unknown agent: ${arg}" >&2; exit 1 ;;
  esac
done

if [ -z "${AGENTS}" ]; then
  for agent in kimi hermes; do
    root="$(agent_root "${agent}")"
    [ -d "${root}" ] && AGENTS="${AGENTS}${AGENTS:+ }${agent}"
  done
fi

if [ -z "${AGENTS}" ]; then
  echo "no agent skill directory detected (looked for kimi/hermes roots)" >&2
  exit 1
fi

DRIFT_TOTAL=0
for agent in ${AGENTS}; do
  root="$(agent_root "${agent}")"
  if [ ! -d "${root}" ]; then
    echo "${agent}: skill root missing, skip (${root})"
    continue
  fi
  drifted=0
  for src in "${SOURCE_SKILLS}"/sdlc-*/; do
    name="$(basename "${src}")"
    dst="${root}/${name}"
    if [ -d "${dst}" ]; then
      if ! diff -rq "${src}" "${dst}" > /dev/null 2>&1; then
        drifted=1
        if [ "${CHECK}" -eq 1 ]; then
          echo "${agent}/${name}: DRIFTED"
        else
          rm -rf "${dst}"
          cp -R "${src}" "${dst}"
          echo "${agent}/${name}: refreshed"
        fi
      fi
    else
      drifted=1
      if [ "${CHECK}" -eq 1 ]; then
        echo "${agent}/${name}: MISSING"
      else
        cp -R "${src}" "${dst}"
        echo "${agent}/${name}: installed"
      fi
    fi
  done
  if [ "${drifted}" -eq 0 ]; then
    echo "${agent}: in sync"
  fi
  DRIFT_TOTAL=$((DRIFT_TOTAL + drifted))
done

if [ "${CHECK}" -eq 1 ]; then
  echo "(check mode: nothing written)"
fi
if [ "${DRIFT_TOTAL}" -gt 0 ] && [ "${CHECK}" -eq 1 ]; then
  exit 1
fi
exit 0
