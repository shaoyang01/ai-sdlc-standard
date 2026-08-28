#!/usr/bin/env bash
# E2-P Provider Reachability Preflight (C03-E)
#
# Scope (Decision-069): prove that the local Kimi / Codex / Hermes CLIs each
# satisfy the minimal non-interactive automation baseline — executable/version,
# non-interactive start, usable credentials, deterministic output capture —
# by issuing exactly ONE minimal, business-neutral model request per provider.
#
# Evidence type: PROVIDER_REACHABILITY_ONLY. This is NOT an adapter test and
# does NOT imply "adapter ready" / "canonical capability ready" (INV-E13).
#
# Side effects: one minimal model request per provider (network + provider
# billing + server-side audit), nothing else. Runs in an ephemeral isolated
# fixture; no business repo, no product code, no git/remote write.
#
# Sanitization: raw stdout/stderr stay only inside the ephemeral fixture
# (removed on exit); the report prints only byte counts, digests, match counts
# and cost metadata — never raw prompts/outputs/credentials/env values.
#
# Usage:  bash scripts/e2p-provider-reachability.sh
# Re-run is a fresh fact: CLI versions/auth drift over time (E5 re-proves via
# the production gateway/adapter).

set -u

FIX="$(mktemp -d /tmp/e2p-preflight.XXXXXX)"
cleanup(){ rm -rf "$FIX"; }
trap cleanup EXIT

PING='Reply with exactly: E2P-PING-OK and nothing else.'
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "E2P_PROVIDER_REACHABILITY schema=e2p-provider-reachability:v1 ts=$TS fixture=$FIX"

exe_id(){ local p; p="$(command -v "$1" 2>/dev/null)" && { realpath "$p" 2>/dev/null || echo "$p"; } || echo NOT_FOUND; }

# report <name> <exit> <seconds> <stdout-file> <stderr-file> [match-source-file]
report(){
  local name="$1" ec="$2" dt="$3" out="$4" err="$5" src="${6:-$4}"
  local obc ebc od match verdict
  obc=$(wc -c <"$FIX/$out" | tr -d ' ')
  ebc=$(wc -c <"$FIX/$err" | tr -d ' ')
  od=$(shasum -a256 "$FIX/$out" | cut -c1-16)
  match=$(grep -c "E2P-PING-OK" "$FIX/$src" 2>/dev/null | tr -d ' ')
  if [ "$ec" = 0 ] && [ "${match:-0}" != "0" ]; then verdict=PASS; else verdict=BLOCKED; fi
  echo "provider=$name exit=$ec elapsed_s=$dt stdout_bytes=$obc stderr_bytes=$ebc ping_match=${match:-0} stdout_sha256_16=$od match_source=$src verdict=$verdict"
  if [ "$verdict" = BLOCKED ]; then
    echo "  diagnostic_stderr_head:"; head -5 "$FIX/$err" 2>/dev/null | sed 's/^/    | /'
  fi
}

# ---- Kimi: `kimi -p` one-shot non-interactive (stream-json also available) ----
echo "provider=kimi exe=$(exe_id kimi) version=$(kimi --version </dev/null 2>&1 | head -1)"
t0=$(date +%s)
( cd "$FIX" && kimi -p "$PING" </dev/null >kimi.out 2>kimi.err ); ec=$?
report kimi "$ec" $(( $(date +%s)-t0 )) kimi.out kimi.err

# ---- Codex: `codex exec` non-interactive, read-only sandbox, final message via -o ----
echo "provider=codex exe=$(exe_id codex) version=$(codex --version </dev/null 2>&1 | head -1)"
t0=$(date +%s)
( cd "$FIX" && codex exec "$PING" --json -s read-only --skip-git-repo-check -o codex-last.txt </dev/null >codex.out 2>codex.err ); ec=$?
report codex "$ec" $(( $(date +%s)-t0 )) codex.out codex.err codex-last.txt

# ---- Hermes: `hermes -z` oneshot (final text only) + usage report ----
echo "provider=hermes exe=$(exe_id hermes) version=$(hermes --version </dev/null 2>&1 | head -1)"
t0=$(date +%s)
( cd "$FIX" && hermes -z "$PING" --usage-file hermes-usage.json </dev/null >hermes.out 2>hermes.err ); ec=$?
report hermes "$ec" $(( $(date +%s)-t0 )) hermes.out hermes.err
if [ -f "$FIX/hermes-usage.json" ]; then
  echo "hermes_usage=$(grep -E '"(estimated_cost_usd|input_tokens|output_tokens|total_tokens|api_calls|model|provider|completed|failed)"' "$FIX/hermes-usage.json" | tr -d ' \n' | sed 's/""//g')"
fi

echo "NOTE reachability_only=true adapter_ready=false canonical_capability_ready=false"
