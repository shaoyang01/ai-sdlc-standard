#!/usr/bin/env bash
# publish-requirement-manifest.sh — D-090-02 / G3 (C10): manual-face self-attesting
# requirement-manifest publisher implementing manual-runtime-semantic-contract v1.0.0 §6.2.
#
# Actions:
#   init             requirement-intake creates the manifest (absent -> created; exists -> blocked)
#   entry-update     node completion declaration: set entry current, optional stale marking,
#                    optional Gate fields (gate-result / decision-depth / decision-status)
#   finding-register register a discovered finding (OPEN) into the finding index
#   finding-action   lifecycle migration on an OPEN finding: resolve | accept
#                    (accept: scan source only — discoveredAt must be solution-gate)
#   repair           manual repair: rebuild state from current file, append repair record,
#                    recompute final self-digest (repairRecords written BEFORE digest)
#
# Protocol (contract §6.2, manual face):
#   - manifest.md carries one embedded YAML block (head + entries + finding_index +
#     repair_records) and manifestDigest = sha256(canonical YAML without the digest field).
#   - Level 1: self-digest mismatch or parse failure -> MANIFEST_CORRUPT_STOP (exit 1).
#   - Level 2: manual face = self-consistency (rows complete, transitions legal,
#     non-scan sources never ACCEPTED). Journal prefix steps skipped (no journal).
#   - Level 3: apply the action deterministically; atomic rename (tmp -> mv); same input
#     replays byte-identical. publishSeq advances only on init/entry-update (manual
#     declarations); finding lifecycle actions update findingIndex only.
#   - Status migrations never touch product artifacts or the Gate Ledger (two-carrier
#     separation); entry digests are provided by the caller from the actual artifact.
#
# Exit codes: 0 ok, 1 blocked (MANIFEST_CORRUPT_STOP / validation), 2 usage error.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/publish-requirement-manifest.sh <library-dir> init --requirement-id <id> \
      --requested-depth <LIGHT|STANDARD|DEEP> --depth-basis <user_requested|normalized_proposal|PROVISIONAL_STANDARD> \
      --decision-scope <FULL_REQUIREMENT|DELTA_CHANGE> [--title <title>]

  scripts/publish-requirement-manifest.sh <library-dir> entry-update --node <node> \
      --artifact-path <rel> --version <semver> --digest <sha256> [--source-ref <ref>] \
      [--gate-result <PASS|FAIL|PASS_WITH_RISK>] [--decision-depth <d>] [--decision-status <s>] \
      [--stale-nodes <node,node,...>]

  scripts/publish-requirement-manifest.sh <library-dir> finding-register --finding-id <id> \
      --discovered-at <node> --category <category> --earliest <node> \
      --source-revision <rev> --evidence-ref <ref>

  scripts/publish-requirement-manifest.sh <library-dir> finding-action --finding-id <id> \
      --action <resolve|accept> --closed-by <who> --evidence-ref <ref> --evidence-digest <sha256> \
      [--bound-revision-id <id>]

  scripts/publish-requirement-manifest.sh <library-dir> repair --who <who> --reason <reason>

Nodes: requirement-intake solution-design solution-gate task-planning implementation code-review knowledge-sync
USAGE
}

[[ $# -ge 2 ]] || { usage >&2; exit 2; }
LIB_DIR="$1"; shift
ACTION="$1"; shift

case "${LIB_DIR}" in
  /*) ;;
  *) LIB_DIR="$(cd "$(dirname "${LIB_DIR}")" && pwd)/$(basename "${LIB_DIR}")" ;;
esac
MANIFEST="${LIB_DIR}/manifest.md"

# --- key=value option parser (bash 3.2 compatible: no associative arrays) -------------
# --key value  ->  export OPT_<key with - replaced by _>
opt_key() { printf '%s' "${1//-/_}"; }
req_opt() {
  local k; k="$(opt_key "$1")"
  local v=""; eval "v=\${OPT_${k}-}"
  [[ -n "${v}" ]] || { echo "Missing required option: --$1" >&2; exit 2; }
  printf '%s' "${v}"
}
opt_or_empty() {
  local k; k="$(opt_key "$1")"
  eval "printf '%s' \"\${OPT_${k}:-}\"" 2>/dev/null || true
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --*) k="$(opt_key "${1#--}")"
         [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
         export "OPT_${k}=$2"; shift 2 ;;
    *) echo "Unexpected argument: $1" >&2; exit 2 ;;
  esac
done
now_utc() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# --- load manifest -> state json (level 1: self-digest) --------------------------------
load_state() {
  [[ -f "${MANIFEST}" ]] || { echo "MANIFEST_CORRUPT_STOP: manifest missing at ${MANIFEST}" >&2; exit 1; }
  STATE_FILE="$(mktemp "${TMPDIR:-/tmp}/req-manifest-state.json.XXXXXX")"
  MANIFEST="${MANIFEST}" STATE_FILE="${STATE_FILE}" ruby -ryaml -rjson -rdigest -e '
    raw = File.read(ENV["MANIFEST"])
    block = raw[/```yaml\n(.*?)```/m, 1]
    if block.nil?
      warn "MANIFEST_CORRUPT_STOP: no embedded yaml block"
      exit 1
    end
    begin
      state = YAML.safe_load(block, permitted_classes: [Time], aliases: false)
    rescue StandardError => e
      warn "MANIFEST_CORRUPT_STOP: parse failure (#{e.class})"
      exit 1
    end
    if !state.is_a?(Hash) || state["manifest_digest"].nil?
      warn "MANIFEST_CORRUPT_STOP: missing manifest_digest"
      exit 1
    end
    claimed = state.delete("manifest_digest")
    actual = "sha256:#{Digest::SHA256.hexdigest(YAML.dump(state))}"
    if claimed != actual
      warn "MANIFEST_CORRUPT_STOP: self-digest mismatch (claimed #{claimed}, actual #{actual}); use repair to rebuild the baseline explicitly"
      exit 1
    end
    File.write(ENV["STATE_FILE"], JSON.generate(state))
  ' || exit 1
}

# --- level 2: manual-face self-consistency --------------------------------------------
check_self_consistency() { # $1 = state file
  STATE_FILE="$1" ruby -rjson -e '
    state = JSON.parse(File.read(ENV["STATE_FILE"]))
    problems = []
    known = %w[requirement-intake solution-design solution-gate task-planning implementation code-review knowledge-sync]
    (state["entries"] || []).each do |e|
      problems << "entry node unknown: #{e["node"]}" unless known.include?(e["node"])
      if e["status"] == "current" && (e["artifact_path"].nil? || e["version"].nil? || e["digest"].nil?)
        problems << "entry #{e["node"]}: current but missing artifact_path/version/digest"
      end
    end
    (state["finding_index"] || []).each do |f|
      fid = f["finding_id"]
      problems << "finding #{fid}: unknown earliest node #{f["earliest_affected_node_id"]}" unless known.include?(f["earliest_affected_node_id"])
      problems << "finding #{fid}: missing evidence_ref" if f["evidence_ref"].nil? || f["evidence_ref"].empty?
      unless %w[OPEN RESOLVED ACCEPTED].include?(f["status"])
        problems << "finding #{fid}: illegal status #{f["status"]}"
      end
      if f["status"] == "RESOLVED"
        if f["closed_by"].nil? || f["closure_evidence_ref"].nil? || f["closure_evidence_digest"].nil? || f["closure_bound_revision_id"].nil?
          problems << "finding #{fid}: RESOLVED row missing closure fields"
        end
      end
      if f["status"] == "ACCEPTED"
        unless f["discovered_at"] == "solution-gate"
          problems << "finding #{fid}: non-scan source ACCEPTED (discovered_at=#{f["discovered_at"]})"
        end
        if f["closed_by"].nil? || f["closure_evidence_ref"].nil? || f["closure_evidence_digest"].nil?
          problems << "finding #{fid}: ACCEPTED row missing closure fields"
        end
      end
    end
    unless problems.empty?
      warn "MANIFEST_CORRUPT_STOP: self-consistency failures:"
      problems.each { |x| warn "  - #{x}" }
      exit 1
    end
  ' || exit 1
}

# --- seal + atomic publish -------------------------------------------------------------
seal_and_publish() { # $1 = state file
  local tmp="$(mktemp "${LIB_DIR}/manifest.final.XXXXXX.md")"
  STATE_FILE="$1" TMP_OUT="${tmp}" ruby -ryaml -rjson -rdigest -e '
    state = JSON.parse(File.read(ENV["STATE_FILE"]))
    canon = YAML.dump(state)
    digest = Digest::SHA256.hexdigest(canon)
    state["manifest_digest"] = "sha256:#{digest}"
    sealed = YAML.dump(state)
    md = String.new
    md << "# Requirement Manifest: #{state["requirement_id"]}\n\n"
    md << "<!-- manual-runtime-semantic-contract v1.0.0 \xC2\xA76.2 self-attesting projection; -->\n"
    md << "<!-- generated by scripts/publish-requirement-manifest.sh; hand edits require repair. -->\n\n"
    md << "```yaml\n#{sealed}```\n"
    File.write(ENV["TMP_OUT"], md)
  ' || exit 1
  mv "${tmp}" "${MANIFEST}"
  echo "PUBLISHED=${MANIFEST}"
}

# --- actions ---------------------------------------------------------------------------
case "${ACTION}" in
  init)
    RID="$(req_opt requirement-id)"; DEPTH="$(req_opt requested-depth)"; BASIS="$(req_opt depth-basis)"; SCOPE="$(req_opt decision-scope)"
    TITLE="$(opt_or_empty title)"
    case "${DEPTH}" in LIGHT|STANDARD|DEEP) ;; *) echo "Invalid --requested-depth: ${DEPTH}" >&2; exit 2 ;; esac
    case "${BASIS}" in user_requested|normalized_proposal|PROVISIONAL_STANDARD) ;; *) echo "Invalid --depth-basis: ${BASIS}" >&2; exit 2 ;; esac
    case "${SCOPE}" in FULL_REQUIREMENT|DELTA_CHANGE) ;; *) echo "Invalid --decision-scope: ${SCOPE}" >&2; exit 2 ;; esac
    if [[ -e "${MANIFEST}" ]]; then
      echo "BLOCKED: manifest already exists at ${MANIFEST} (init is intake-only; existing-requirement reuse is governed by DP4)." >&2
      exit 1
    fi
    mkdir -p "${LIB_DIR}"
    NOW="$(now_utc)"
    STATE_FILE="$(mktemp "${TMPDIR:-/tmp}/req-manifest-init.json.XXXXXX")"
    RID="${RID}" DEPTH="${DEPTH}" BASIS="${BASIS}" SCOPE="${SCOPE}" TITLE="${TITLE}" NOW="${NOW}" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      nodes = %w[requirement-intake solution-design solution-gate task-planning implementation code-review knowledge-sync]
      state = {
        "schema_version" => "1.0",
        "requirement_id" => ENV["RID"],
        "title" => ENV["TITLE"],
        "publish_seq" => 1,
        "projected_through" => "MANUAL",
        "updated_at" => ENV["NOW"],
        "depth" => {
          "decision_scope" => ENV["SCOPE"],
          "requested_depth" => ENV["DEPTH"],
          "initial_depth_basis" => ENV["BASIS"],
          "required_depth" => ENV["DEPTH"]
        },
        "entries" => nodes.map { |n| { "node" => n, "status" => "pending", "artifact_path" => nil, "version" => nil, "digest" => nil, "updated_at" => nil, "source_event_ref" => nil } },
        "finding_index" => [],
        "repair_records" => []
      }
      File.write(ENV["STATE_FILE"], JSON.generate(state))
    ' || exit 1
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "INIT OK: requirement=${RID} requestedDepth=${DEPTH} basis=${BASIS} scope=${SCOPE}"
    ;;

  entry-update)
    NODE="$(req_opt node)"; APATH="$(req_opt artifact-path)"; VER="$(req_opt version)"; DG="$(req_opt digest)"
    case "${NODE}" in requirement-intake|solution-design|solution-gate|task-planning|implementation|code-review|knowledge-sync) ;; *) echo "Unknown node: ${NODE}" >&2; exit 2 ;; esac
    load_state
    check_self_consistency "${STATE_FILE}"
    NOW="$(now_utc)"
    GATE="$(opt_or_empty gate-result)"; DDEPTH="$(opt_or_empty decision-depth)"; DSTATUS="$(opt_or_empty decision-status)"
    STALE="$(opt_or_empty stale-nodes)"; SREF="$(opt_or_empty source-ref)"
    NODE="${NODE}" APATH="${APATH}" VER="${VER}" DG="${DG}" NOW="${NOW}" GATE="${GATE}" DDEPTH="${DDEPTH}" DSTATUS="${DSTATUS}" STALE="${STALE}" SREF="${SREF}" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      node = ENV["NODE"]; now = ENV["NOW"]
      entry = state["entries"].find { |e| e["node"] == node }
      if entry.nil?
        warn "BLOCKED: unknown node #{node}"
        exit 1
      end
      entry["status"] = "current"
      entry["artifact_path"] = ENV["APATH"]
      entry["version"] = ENV["VER"]
      entry["digest"] = ENV["DG"]
      entry["updated_at"] = now
      entry["source_event_ref"] = ENV["SREF"] == "" ? nil : ENV["SREF"]
      if ENV["GATE"] != ""
        entry["gate_result"] = ENV["GATE"]
        entry["decision_depth"] = ENV["DDEPTH"] == "" ? nil : ENV["DDEPTH"]
        entry["decision_status"] = ENV["DSTATUS"] == "" ? nil : ENV["DSTATUS"]
      end
      ENV["STALE"].split(",").each do |sn|
        se = state["entries"].find { |e| e["node"] == sn }
        if se.nil?
          warn "BLOCKED: stale node unknown: #{sn}"
          exit 1
        end
        se["status"] = "stale"
        se["updated_at"] = now
      end
      state["publish_seq"] = state["publish_seq"].to_i + 1
      state["updated_at"] = now
      File.write(ENV["STATE_FILE"], JSON.generate(state))
    ' || exit 1
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "ENTRY-UPDATE OK: node=${NODE} current"
    ;;

  finding-register)
    FID="$(req_opt finding-id)"; DISC="$(req_opt discovered-at)"; CAT="$(req_opt category)"; EARL="$(req_opt earliest)"; SREV="$(req_opt source-revision)"; EREF="$(req_opt evidence-ref)"
    load_state
    check_self_consistency "${STATE_FILE}"
    NOW="$(now_utc)"
    FID="${FID}" DISC="${DISC}" CAT="${CAT}" EARL="${EARL}" SREV="${SREV}" EREF="${EREF}" NOW="${NOW}" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      fid = ENV["FID"]
      state["finding_index"] = [] unless state["finding_index"].is_a?(Array)
      if state["finding_index"].any? { |f| f["finding_id"] == fid }
        warn "BLOCKED: finding_id already registered: #{fid}"
        exit 1
      end
      state["finding_index"] << {
        "finding_id" => fid, "discovered_at" => ENV["DISC"], "root_cause_category" => ENV["CAT"],
        "earliest_affected_node_id" => ENV["EARL"], "source_revision" => ENV["SREV"],
        "evidence_ref" => ENV["EREF"], "status" => "OPEN",
        "closed_by" => nil, "closure_evidence_ref" => nil,
        "closure_evidence_digest" => nil, "closure_bound_revision_id" => nil
      }
      state["updated_at"] = ENV["NOW"]
      File.write(ENV["STATE_FILE"], JSON.generate(state))
    ' || exit 1
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "FINDING-REGISTER OK: ${FID} OPEN"
    ;;

  finding-action)
    FID="$(req_opt finding-id)"; ACT="$(req_opt action)"; CBY="$(req_opt closed-by)"; EREF="$(req_opt evidence-ref)"; EDG="$(req_opt evidence-digest)"
    BOUND="$(opt_or_empty bound-revision-id)"
    case "${ACT}" in resolve|accept) ;; *) echo "Invalid --action: ${ACT}" >&2; exit 2 ;; esac
    load_state
    check_self_consistency "${STATE_FILE}"
    FID="${FID}" ACT="${ACT}" CBY="${CBY}" EREF="${EREF}" EDG="${EDG}" BOUND="${BOUND}" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      fid = ENV["FID"]
      row = (state["finding_index"] || []).find { |f| f["finding_id"] == fid }
      if row.nil?
        warn "BLOCKED: finding not registered: #{fid}"
        exit 1
      end
      if row["status"] != "OPEN"
        warn "BLOCKED: finding #{fid} is #{row["status"]}, not OPEN; re-migration is rejected (not idempotent-accepted)"
        exit 1
      end
      if ENV["ACT"] == "accept"
        unless row["discovered_at"] == "solution-gate"
          warn "BLOCKED: ACCEPTED only applies to scan source (discoveredAt=solution-gate); #{fid} discovered at #{row["discovered_at"]}"
          exit 1
        end
        row["closure_bound_revision_id"] = nil
      else
        if ENV["BOUND"].to_s.empty?
          warn "BLOCKED: resolve requires --bound-revision-id (current ACTIVE revision of the earliest-affected or downstream node)"
          exit 1
        end
        row["closure_bound_revision_id"] = ENV["BOUND"]
      end
      row["status"] = ENV["ACT"] == "accept" ? "ACCEPTED" : "RESOLVED"
      row["closed_by"] = ENV["CBY"]
      row["closure_evidence_ref"] = ENV["EREF"]
      row["closure_evidence_digest"] = ENV["EDG"]
      File.write(ENV["STATE_FILE"], JSON.generate(state))
    ' || exit 1
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "FINDING-ACTION OK: ${FID} -> ${ACT}"
    ;;

  repair)
    WHO="$(req_opt who)"; REASON="$(req_opt reason)"
    STATE_FILE="$(mktemp "${TMPDIR:-/tmp}/req-manifest-repair.json.XXXXXX")"
    MANIFEST="${MANIFEST}" STATE_FILE="${STATE_FILE}" WHO="${WHO}" REASON="${REASON}" ruby -ryaml -rjson -rdigest -e '
      raw = File.read(ENV["MANIFEST"])
      block = raw[/```yaml\n(.*?)```/m, 1]
      if block.nil?
        warn "MANIFEST_CORRUPT_STOP: no embedded yaml block; nothing to repair"
        exit 1
      end
      state = YAML.safe_load(block, permitted_classes: [Time], aliases: false)
      unless state.is_a?(Hash)
        warn "MANIFEST_CORRUPT_STOP: unparseable state"
        exit 1
      end
      state.delete("manifest_digest")
      state["repair_records"] = (state["repair_records"] || [])
      state["repair_records"] << {
        "seq" => state["repair_records"].size + 1,
        "who" => ENV["WHO"],
        "when" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reason" => ENV["REASON"]
      }
      File.write(ENV["STATE_FILE"], JSON.generate(state))
      puts "REPAIR: state rebuilt from current file; digest recomputed at publish; verify artifact digests before continuing."
    ' || exit 1
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "REPAIR OK: baseline rebuilt (who=${WHO})"
    ;;

  *)
    echo "Unknown action: ${ACTION}" >&2
    usage >&2
    exit 2
    ;;
esac
