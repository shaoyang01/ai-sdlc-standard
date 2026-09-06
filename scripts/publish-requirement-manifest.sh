#!/usr/bin/env bash
# publish-requirement-manifest.sh — D-090-02 / G3 (C10): manual-face self-attesting
# requirement-manifest publisher implementing manual-runtime-semantic-contract v1.0.0 §6.2.
#
# Actions:
#   init             requirement-intake creates the manifest on a FRESH library dir
#                    (existing manifest -> blocked; node artifact dirs present without
#                    manifest -> BLOCKED_AMBIGUOUS legacy reuse per DP4)
#   entry-update     node completion declaration with --declaration-seq (replayable:
#                    identical replay -> no-op success; conflicting replay -> STOP;
#                    ESCALATED updates depth.required_depth in the same publish)
#   publish          merged declaration (JSON file): entry fields + finding registers +
#                    finding actions in ONE atomic publish (contract §6.2 mixed-input rule)
#   finding-register register a discovered finding (OPEN) — validated before write
#   finding-action   lifecycle migration on an OPEN finding: resolve | accept
#                    (pre-seal validation: closure verifier = discovering node;
#                     accept: scan source + PASS_WITH_RISK verdict + bound ruling revision;
#                     identical replay of an effective action -> no-op success)
#   check-admission  mechanically evaluate the A1–A4 admission predicate for a node
#                    (includes actual artifact digest integrity verification)
#   repair           manual repair: verify artifact digests, record correctedEntries,
#                    rebuild trusted baseline (repairRecords written before final digest)
#
# Exit codes: 0 ok / no-op replay, 1 blocked (MANIFEST_CORRUPT_STOP / ADMISSION_DENIED /
# validation), 2 usage error.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/publish-requirement-manifest.sh <library-dir> init --requirement-id <id> \
      --requested-depth <LIGHT|STANDARD|DEEP> --depth-basis <user_requested|normalized_proposal|PROVISIONAL_STANDARD> \
      --decision-scope <FULL_REQUIREMENT|DELTA_CHANGE> [--title <title>]

  scripts/publish-requirement-manifest.sh <library-dir> entry-update --node <node> \
      --declaration-seq <n> --artifact-path <rel> --version <semver> --digest <sha256> \
      [--source-ref <ref>] [--gate-result <PASS|FAIL|PASS_WITH_RISK>] \
      [--decision-depth <d>] [--decision-status <CONFIRMED|ESCALATED|BLOCKED_UNKNOWN>] \
      [--stale-nodes <node,node,...>]

  scripts/publish-requirement-manifest.sh <library-dir> publish --declaration-file <json>
      # JSON: {"declaration_seq":N,"node":"...","artifact_path":"...","version":"...",
      #        "digest":"...","source_ref":"...","gate_result":"...","decision_depth":"...",
      #        "decision_status":"...","stale_nodes":[...],
      #        "finding_registers":[{finding_id,discovered_at,root_cause_category,earliest_affected_node_id,source_revision,evidence_ref}],
      #        "finding_actions":[{finding_id,action,closed_by,evidence_ref,evidence_digest,bound_revision_id}]}

  scripts/publish-requirement-manifest.sh <library-dir> finding-register --finding-id <id> \
      --discovered-at <node> --category <category> --earliest <node> \
      --source-revision <rev> --evidence-ref <ref>

  scripts/publish-requirement-manifest.sh <library-dir> finding-action --finding-id <id> \
      --action <resolve|accept> --closed-by <who> --evidence-ref <ref> --evidence-digest <sha256> \
      --bound-revision-id <id>

  scripts/publish-requirement-manifest.sh <library-dir> check-admission --node <node>

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
now_utc() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --*) k="$(opt_key "${1#--}")"
         [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
         export "OPT_${k}=$2"; shift 2 ;;
    *) echo "Unexpected argument: $1" >&2; exit 2 ;;
  esac
done

# --- level 1: load manifest -> state json (self-digest) -------------------------------
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
check_self_consistency() {
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
        if f["closed_by"].nil? || f["closure_evidence_ref"].nil? || f["closure_evidence_digest"].nil? || f["closure_bound_revision_id"].nil?
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

# --- seal + atomic publish --------------------------------------------------------------
seal_and_publish() {
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
      echo "BLOCKED: manifest already exists at ${MANIFEST} (init is intake-only)." >&2
      exit 1
    fi
    # DP4 (G3-R1-M2): node artifact dirs with content but no manifest = legacy reuse -> BLOCKED_AMBIGUOUS
    for d in "01-技术方案" "02-方案审核" "03-任务规划" "04-实现记录" "05-代码审核" "06-知识同步"; do
      if [[ -d "${LIB_DIR}/${d}" ]] && [[ -n "$(find "${LIB_DIR}/${d}" -type f -print -quit 2>/dev/null)" ]]; then
        echo "BLOCKED_AMBIGUOUS: directory ${d} contains artifacts but no manifest — legacy/unknown state reuse is forbidden (DP4); manual adjudication required." >&2
        exit 1
      fi
    done
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
        "declaration_log" => [],
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
    DSEQ="$(req_opt declaration-seq)"
    case "${NODE}" in requirement-intake|solution-design|solution-gate|task-planning|implementation|code-review|knowledge-sync) ;; *) echo "Unknown node: ${NODE}" >&2; exit 2 ;; esac
    case "${DSEQ}" in ''|*[!0-9]*) echo "Invalid --declaration-seq: must be a positive integer" >&2; exit 2 ;; esac
    load_state
    check_self_consistency "${STATE_FILE}"
    NOW="$(now_utc)"
    GATE="$(opt_or_empty gate-result)"; DDEPTH="$(opt_or_empty decision-depth)"; DSTATUS="$(opt_or_empty decision-status)"
    STALE="$(opt_or_empty stale-nodes)"; SREF="$(opt_or_empty source-ref)"
    case "${DSTATUS}" in ""|CONFIRMED|ESCALATED|BLOCKED_UNKNOWN) ;; *) echo "Invalid --decision-status: ${DSTATUS}" >&2; exit 2 ;; esac
    if [[ "${DSTATUS}" == "ESCALATED" ]]; then
      [[ "${DDEPTH}" != "" ]] || { echo "ESCALATED requires --decision-depth (new requiredDepth)" >&2; exit 2; }
    fi
    # G3-R2-H2: declaration_log — full-input replay discrimination (identity by input digest)
    INPUT_DIGEST="$(printf '%s' "entry|${NODE}|${APATH}|${VER}|${DG}|${GATE}|${DDEPTH}|${DSTATUS}|${STALE}|${SREF}" | ruby -rdigest -e 'puts Digest::SHA256.hexdigest(STDIN.read)')"
    REPLAY_MARKER="$(mktemp "${TMPDIR:-/tmp}/req-manifest-replay.XXXXXX")"
    DSEQ="${DSEQ}" INPUT_DIGEST="${INPUT_DIGEST}" REPLAY_MARKER="${REPLAY_MARKER}" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      seq = ENV["DSEQ"].to_i
      if seq <= state["publish_seq"]
        entry_in_log = (state["declaration_log"] || []).find { |d| d["seq"] == seq }
        if entry_in_log && entry_in_log["input_digest"] == ENV["INPUT_DIGEST"]
          warn "NO-OP REPLAY: declaration seq #{seq} with identical input digest; nothing changed"
          File.write(ENV["REPLAY_MARKER"], "replay")
          exit 0
        end
        warn "ADMISSION_DENIED: declaration seq #{seq} replay with DIFFERENT input (conflicting replay is rejected)"
        exit 1
      end
      if seq > state["publish_seq"] + 1
        warn "ADMISSION_DENIED: declaration gap (seq #{seq} > publish_seq+1=#{state["publish_seq"] + 1})"
        exit 1
      end
    ' || exit 1
    if [[ -s "${REPLAY_MARKER}" ]]; then
      rm -f "${REPLAY_MARKER}" "${STATE_FILE}"
      echo "ENTRY-UPDATE NO-OP REPLAY: seq ${DSEQ} identical; nothing changed"
      exit 0
    fi
    rm -f "${REPLAY_MARKER}"
    NODE="${NODE}" APATH="${APATH}" VER="${VER}" DG="${DG}" NOW="${NOW}" GATE="${GATE}" DDEPTH="${DDEPTH}" DSTATUS="${DSTATUS}" STALE="${STALE}" SREF="${SREF}" DSEQ="${DSEQ}" INPUT_DIGEST="${INPUT_DIGEST}" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      node = ENV["NODE"]; now = ENV["NOW"]; seq = ENV["DSEQ"].to_i
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
      # ESCALATED updates downstream-consumed requiredDepth in the SAME publish (G3-R1-H4)
      if ENV["DSTATUS"] == "ESCALATED"
        state["depth"]["required_depth"] = ENV["DDEPTH"]
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
      state["publish_seq"] = seq
      state["updated_at"] = now
      state["declaration_log"] = (state["declaration_log"] || [])
      state["declaration_log"] << { "seq" => seq, "kind" => "entry-update", "input_digest" => ENV["INPUT_DIGEST"] }
      File.write(ENV["STATE_FILE"], JSON.generate(state))
    ' || exit 1
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "ENTRY-UPDATE OK: node=${NODE} current seq=${DSEQ}"
    ;;

  publish)
    DECL="$(req_opt declaration-file)"
    [[ -f "${DECL}" ]] || { echo "Declaration file not found: ${DECL}" >&2; exit 2; }
    load_state
    check_self_consistency "${STATE_FILE}"
    NOW="$(now_utc)"
    DECL="${DECL}" NOW="${NOW}" STATE_FILE="${STATE_FILE}" ruby -rjson -rdigest -e '
      decl = JSON.parse(File.read(ENV["DECL"]))
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      now = ENV["NOW"]
      known = %w[requirement-intake solution-design solution-gate task-planning implementation code-review knowledge-sync]
      seq = decl["declaration_seq"].to_i
      if seq <= state["publish_seq"]
        warn "NO-OP REPLAY: declaration seq #{seq} already covered"
        exit 0
      end
      if seq > state["publish_seq"] + 1
        warn "ADMISSION_DENIED: declaration gap"
        exit 1
      end
      node = decl["node"]
      errors = []
      known.include?(node) || (errors << "unknown node: #{node}")
      entry = node ? state["entries"].find { |e| e["node"] == node } : nil
      errors << "entry missing for #{node}" if node && entry.nil?
      registers = decl["finding_registers"] || []
      registers.each do |r|
        errors << "finding_id already registered: #{r["finding_id"]}" if (state["finding_index"] || []).any? { |f| f["finding_id"] == r["finding_id"] }
        errors << "register earliest unknown: #{r["earliest_affected_node_id"]}" unless known.include?(r["earliest_affected_node_id"])
        errors << "register discovered unknown: #{r["discovered_at"]}" unless known.include?(r["discovered_at"])
      end
      actions = decl["finding_actions"] || []
      # batch-internal duplicate register detection (G3-R2-H1)
      reg_ids = registers.map { |r| r["finding_id"] }
      if reg_ids.uniq.size != reg_ids.size
        errors << "batch-internal duplicate finding_id in registers"
      end
      # candidate state: apply gate fields to a copy BEFORE validating accept actions
      candidate = JSON.parse(JSON.generate(state))
      if node && entry && decl["gate_result"]
        entry_c = candidate["entries"].find { |e| e["node"] == node }
        entry_c["gate_result"] = decl["gate_result"]
        entry_c["decision_depth"] = decl["decision_depth"]
        entry_c["decision_status"] = decl["decision_status"]
      end
      actions.each do |a|
        row = (candidate["finding_index"] || []).find { |f| f["finding_id"] == a["finding_id"] }
        if row.nil?
          # may be registered in the same batch
          row = registers.find { |r| r["finding_id"] == a["finding_id"] }
          if row
            row = { "finding_id" => row["finding_id"], "discovered_at" => row["discovered_at"],
                    "status" => "OPEN", "closed_by" => nil, "closure_evidence_ref" => nil,
                    "closure_evidence_digest" => nil, "closure_bound_revision_id" => nil }
          end
        end
        if row.nil?
          errors << "finding not registered: #{a["finding_id"]}"
          next
        end
        if row["status"] != "OPEN"
          same = row["status"] == (a["action"] == "accept" ? "ACCEPTED" : "RESOLVED") &&
                 row["closed_by"] == a["closed_by"] && row["closure_evidence_ref"] == a["evidence_ref"] &&
                 row["closure_evidence_digest"] == a["evidence_digest"]
          errors << "finding #{a["finding_id"]}: conflicting replay" unless same
          next
        end
        # per-action role rules (G3-R2-H1)
        if a["action"] == "resolve"
          errors << "closed_by (#{a["closed_by"]}) must be the discovering node (#{row["discovered_at"]})" unless a["closed_by"] == row["discovered_at"]
          errors << "resolve requires bound_revision_id" if a["bound_revision_id"].to_s.empty?
        else
          errors << "ACCEPTED only for scan source" unless row["discovered_at"] == "solution-gate"
          errors << "closed_by (#{a["closed_by"]}) must be formal_verdict — the PWR adjudicator" unless a["closed_by"] == "formal_verdict"
          # validate against CANDIDATE gate state (G3-R2-H1: FAIL→PWR in same publish is legal)
          ge_c = candidate["entries"].find { |e| e["node"] == "solution-gate" }
          if ge_c.nil? || ge_c["gate_result"].nil?
            errors << "accept requires a published solution-gate verdict"
          elsif ge_c["gate_result"] == "FAIL"
            errors << "accept rejected: candidate verdict is FAIL"
          elsif ge_c["gate_result"] != "PASS_WITH_RISK"
            errors << "accept requires candidate gate_result=PASS_WITH_RISK (got #{ge_c["gate_result"]})"
          end
          errors << "accept requires bound_revision_id (PWR ruling revision)" if a["bound_revision_id"].to_s.empty?
          # real ruling-revision verification
          if a["bound_revision_id"] && ge_c && ge_c["version"] && a["bound_revision_id"] != ge_c["version"]
            errors << "bound_revision_id (#{a["bound_revision_id"]}) must match verdict artifact version (#{ge_c["version"]})"
          end
        end
        errors << "evidence_digest missing" if a["evidence_digest"].to_s.empty?
      end
      unless errors.empty?
        warn "ADMISSION_DENIED: merged declaration validation failed:"
        errors.each { |x| warn "  - #{x}" }
        exit 1
      end
      entry["status"] = "current"
      entry["artifact_path"] = decl["artifact_path"]
      entry["version"] = decl["version"]
      entry["digest"] = decl["digest"]
      entry["updated_at"] = now
      entry["source_event_ref"] = decl["source_ref"]
      if decl["gate_result"]
        entry["gate_result"] = decl["gate_result"]
        entry["decision_depth"] = decl["decision_depth"]
        entry["decision_status"] = decl["decision_status"]
      end
      if decl["decision_status"] == "ESCALATED"
        state["depth"]["required_depth"] = decl["decision_depth"]
      end
      (decl["stale_nodes"] || []).each do |sn|
        se = state["entries"].find { |e| e["node"] == sn }
        se["status"] = "stale"; se["updated_at"] = now
      end
      registers.each do |r|
        state["finding_index"] << {
          "finding_id" => r["finding_id"], "discovered_at" => r["discovered_at"],
          "root_cause_category" => r["root_cause_category"], "earliest_affected_node_id" => r["earliest_affected_node_id"],
          "source_revision" => r["source_revision"], "evidence_ref" => r["evidence_ref"], "status" => "OPEN",
          "closed_by" => nil, "closure_evidence_ref" => nil, "closure_evidence_digest" => nil, "closure_bound_revision_id" => nil
        }
      end
      actions.each do |a|
        row = state["finding_index"].find { |f| f["finding_id"] == a["finding_id"] }
        next unless row["status"] == "OPEN"
        row["status"] = a["action"] == "accept" ? "ACCEPTED" : "RESOLVED"
        row["closed_by"] = a["closed_by"]
        row["closure_evidence_ref"] = a["evidence_ref"]
        row["closure_evidence_digest"] = a["evidence_digest"]
        row["closure_bound_revision_id"] = a["bound_revision_id"]  # resolve=fix revision; accept=PWR ruling revision
      end
      state["publish_seq"] = seq
      state["updated_at"] = now
      state["declaration_log"] = (state["declaration_log"] || [])
      state["declaration_log"] << { "seq" => seq, "kind" => "merged-publish", "input_digest" => Digest::SHA256.hexdigest(JSON.generate(decl)) }
      File.write(ENV["STATE_FILE"], JSON.generate(state))
    ' || exit 1
    check_self_consistency "${STATE_FILE}"
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "MERGED PUBLISH OK: declaration applied atomically"
    ;;

  finding-register)
    FID="$(req_opt finding-id)"; DISC="$(req_opt discovered-at)"; CAT="$(req_opt category)"; EARL="$(req_opt earliest)"; SREV="$(req_opt source-revision)"; EREF="$(req_opt evidence-ref)"
    load_state
    check_self_consistency "${STATE_FILE}"
    NOW="$(now_utc)"
    FID="${FID}" DISC="${DISC}" EARL="${EARL}" EREF="${EREF}" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      known = %w[requirement-intake solution-design solution-gate task-planning implementation code-review knowledge-sync]
      errors = []
      errors << "discovered node unknown: #{ENV["DISC"]}" unless known.include?(ENV["DISC"])
      errors << "earliest node unknown: #{ENV["EARL"]}" unless known.include?(ENV["EARL"])
      errors << "evidence_ref missing" if ENV["EREF"].to_s.empty?
      if (state["finding_index"] || []).any? { |f| f["finding_id"] == ENV["FID"] }
        errors << "finding_id already registered: #{ENV["FID"]}"
      end
      unless errors.empty?
        warn "ADMISSION_DENIED: register validation failed (pre-write):"
        errors.each { |x| warn "  - #{x}" }
        exit 1
      end
    ' || exit 1
    FID="${FID}" DISC="${DISC}" CAT="${CAT}" EARL="${EARL}" SREV="${SREV}" EREF="${EREF}" NOW="$(now_utc)" STATE_FILE="${STATE_FILE}" ruby -rjson -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      state["finding_index"] = [] unless state["finding_index"].is_a?(Array)
      state["finding_index"] << {
        "finding_id" => ENV["FID"], "discovered_at" => ENV["DISC"], "root_cause_category" => ENV["CAT"],
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
    # G3-R2-H1/H2: per-action role rules + full-binding replay discrimination +
    # declaration_log. Single ruby block: validate -> replay-check -> apply.
    INPUT_DIGEST="$(printf '%s' "action|${FID}|${ACT}|${CBY}|${EREF}|${EDG}|${BOUND}" | ruby -rdigest -e 'puts Digest::SHA256.hexdigest(STDIN.read)')"
    REPLAY_MARKER="$(mktemp "${TMPDIR:-/tmp}/req-manifest-replay.XXXXXX")"
    FID="${FID}" ACT="${ACT}" CBY="${CBY}" EREF="${EREF}" EDG="${EDG}" BOUND="${BOUND}" \
      INPUT_DIGEST="${INPUT_DIGEST}" REPLAY_MARKER="${REPLAY_MARKER}" STATE_FILE="${STATE_FILE}" ruby -rjson -rdigest -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      fid = ENV["FID"]
      row = (state["finding_index"] || []).find { |f| f["finding_id"] == fid }
      if row.nil?
        warn "ADMISSION_DENIED: finding not registered: #{fid}"
        exit 1
      end
      errors = []
      # per-action responsibility (G3-R2-H1): resolve -> discovering node; accept -> formal_verdict
      if ENV["ACT"] == "resolve"
        errors << "closed_by (#{ENV["CBY"]}) must be the discovering node (#{row["discovered_at"]}) — independent closure verification (contract §5.2)" unless ENV["CBY"] == row["discovered_at"]
        errors << "resolve requires --bound-revision-id (current ACTIVE revision)" if ENV["BOUND"].to_s.empty?
      else
        errors << "ACCEPTED only applies to scan source (discoveredAt=solution-gate)" unless row["discovered_at"] == "solution-gate"
        errors << "closed_by (#{ENV["CBY"]}) must be formal_verdict — the PWR adjudicator (contract §7.1)" unless ENV["CBY"] == "formal_verdict"
        ge = (state["entries"] || []).find { |e| e["node"] == "solution-gate" }
        if ge.nil? || ge["gate_result"].nil?
          errors << "accept requires a published solution-gate verdict"
        elsif ge["gate_result"] == "FAIL"
          errors << "accept rejected: latest verdict is FAIL (ADMISSION_DENIED)"
        elsif ge["gate_result"] != "PASS_WITH_RISK"
          errors << "accept requires gate_result=PASS_WITH_RISK (got #{ge["gate_result"]})"
        end
        errors << "accept requires --bound-revision-id (PWR ruling evidence revision)" if ENV["BOUND"].to_s.empty?
        # real ruling-revision verification: bound revision must be the verdict artifact version
        if ENV["BOUND"] && ge && ge["version"] && ENV["BOUND"] != ge["version"]
          errors << "bound_revision_id (#{ENV["BOUND"]}) must match the verdict artifact version (#{ge["version"]})"
        end
      end
      errors << "evidence_digest missing" if ENV["EDG"].to_s.empty?
      # idempotent replay: full closure binding equality -> no-op (G3-R2-H2)
      if errors.empty? && row["status"] != "OPEN"
        target = ENV["ACT"] == "accept" ? "ACCEPTED" : "RESOLVED"
        if row["status"] == target && row["closed_by"] == ENV["CBY"] &&
           row["closure_evidence_ref"] == ENV["EREF"] && row["closure_evidence_digest"] == ENV["EDG"] &&
           (row["closure_bound_revision_id"] == ENV["BOUND"] || (ENV["ACT"] == "accept" && row["closure_bound_revision_id"].nil? && ENV["BOUND"].to_s.empty?))
          warn "NO-OP REPLAY: finding #{fid} already #{row["status"]} with identical closure binding"
          File.write(ENV["REPLAY_MARKER"], "replay")
          exit 0
        end
        errors << "finding #{fid} is #{row["status"]}, not OPEN; identical effective replays are no-op, conflicting replays are rejected"
      end
      unless errors.empty?
        warn "ADMISSION_DENIED: lifecycle action validation failed:"
        errors.each { |x| warn "  - #{x}" }
        exit 1
      end
      # apply
      row["status"] = ENV["ACT"] == "accept" ? "ACCEPTED" : "RESOLVED"
      row["closed_by"] = ENV["CBY"]
      row["closure_evidence_ref"] = ENV["EREF"]
      row["closure_evidence_digest"] = ENV["EDG"]
      row["closure_bound_revision_id"] = ENV["BOUND"]
      state["updated_at"] = Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ")
      File.write(ENV["STATE_FILE"], JSON.generate(state))
    ' || exit 1
    if [[ -s "${REPLAY_MARKER}" ]]; then
      rm -f "${REPLAY_MARKER}" "${STATE_FILE}"
      echo "FINDING-ACTION NO-OP REPLAY: ${FID} already migrated with identical binding"
      exit 0
    fi
    rm -f "${REPLAY_MARKER}"
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "FINDING-ACTION OK: ${FID} -> ${ACT}"
    ;;

  check-admission)
    NODE="$(req_opt node)"
    case "${NODE}" in requirement-intake|solution-design|solution-gate|task-planning|implementation|code-review|knowledge-sync) ;; *) echo "Unknown node: ${NODE}" >&2; exit 2 ;; esac
    load_state
    NODE="${NODE}" LIB_DIR="${LIB_DIR}" STATE_FILE="${STATE_FILE}" ruby -rjson -rdigest -e '
      state = JSON.parse(File.read(ENV["STATE_FILE"]))
      node = ENV["NODE"]
      gate = state["entries"].find { |e| e["node"] == "solution-gate" }
      design = state["entries"].find { |e| e["node"] == "solution-design" }
      tp = state["entries"].find { |e| e["node"] == "task-planning" }
      impl = state["entries"].find { |e| e["node"] == "implementation" }
      cr = state["entries"].find { |e| e["node"] == "code-review" }
      all_findings = (state["finding_index"] || [])
      open_findings = all_findings.select { |f| f["status"] == "OPEN" }
      reasons = []
      # G3-R2-M1: proper blocking scope — a finding blocks node X only if X is
      # earliestAffectedNodeId or downstream in canonical order (contract §5.2)
      order = %w[requirement-intake solution-design solution-gate task-planning implementation code-review knowledge-sync]
      blocked_by = lambda do |target|
        open_findings.select do |f|
          ei = order.index(f["earliest_affected_node_id"])
          ti = order.index(target)
          ei && ti && ti >= ei
        end
      end
      binding_complete = lambda do |f|
        f["closed_by"] && f["closure_evidence_ref"] && f["closure_evidence_digest"] &&
          (f["status"] == "ACCEPTED" || f["closure_bound_revision_id"])
      end
      intact = lambda do |e|
        if e.nil? || e["status"] != "current"
          false
        elsif e["artifact_path"].nil?
          reasons << "#{e["node"]}: no artifact recorded"
          false
        else
          path = File.join(ENV["LIB_DIR"], e["artifact_path"])
          if !File.file?(path)
            reasons << "#{e["node"]}: artifact file missing"
            false
          elsif Digest::SHA256.file(path).hexdigest != e["digest"]
            reasons << "#{e["node"]}: artifact digest drift"
            false
          else
            true
          end
        end
      end
      gate_ok = gate && gate["status"] == "current" && intact.call(gate)
      blocking_for = ->(target) {
        bf = blocked_by.call(target)
        bf.empty? ? nil : "OPEN blocking findings (scoped): #{bf.map { |f| f["finding_id"] }.join(",")}"
      }
      case node
      when "task-planning"
        reasons << "Gate Result not current/intact" unless gate_ok
        reasons << "decisionStatus=#{gate["decision_status"].inspect} not CONFIRMED" if gate_ok && gate["decision_status"] != "CONFIRMED"
        reasons << "gateResult=#{gate["gate_result"].inspect} not in PASS/PASS_WITH_RISK" if gate_ok && !%w[PASS PASS_WITH_RISK].include?(gate["gate_result"])
        if (r = blocking_for.call(node))
          reasons << r
        end
        reasons << "solution-design not current/intact" unless design && design["status"] == "current" && intact.call(design)
      when "implementation"
        reasons << "task plan not current/intact" unless tp && tp["status"] == "current" && intact.call(tp)
        if (r = blocking_for.call(node))
          reasons << r
        end
      when "code-review"
        reasons << "implementation record not current/intact" unless impl && impl["status"] == "current" && intact.call(impl)
        if (r = blocking_for.call(node))
          reasons << r
        end
        if impl && impl["artifact_path"]
          rec = File.join(ENV["LIB_DIR"], impl["artifact_path"])
          if File.file?(rec)
            content = File.read(rec)
            # G3-R2-M1: field VALUES must be non-empty, not just field names present
            missing = []
            %w[baseRevision reviewedRevision changeDigest].each do |k|
              m = content.match(/#{k}=([^\s\n]+)/)
              missing << k if m.nil? || m[1].strip.empty? || m[1] == "PENDING"
            end
            reasons << "implementation record evidence binding incomplete/empty: #{missing.join(",")}" unless missing.empty?
          end
        end
      when "knowledge-sync"
        reasons << "code-review report not current/intact" unless cr && cr["status"] == "current" && intact.call(cr)
        if (r = blocking_for.call(node))
          reasons << r
        end
        # A4: routed declaration check (G3-R2-M1)
        kt = File.join(ENV["LIB_DIR"], "..", ".sdlc", "business_domain", "knowledge-target.yaml")
        if File.file?(kt)
          kt_content = File.read(kt)
          unless kt_content.match?(/status:\s*"routed"/) || kt_content.match?(/status:\s*routed/)
            reasons << "knowledge-target not routed (PROPOSAL_ONLY mode)"
          end
        else
          reasons << "knowledge-target declaration missing (BLOCKED: run initializer first)"
        end
      when "solution-gate"
        reasons << "solution-design not current/intact" unless design && design["status"] == "current" && intact.call(design)
      end
      unless reasons.empty?
        warn "ADMISSION_DENIED: #{node}"
        reasons.each { |x| warn "  - #{x}" }
        exit 1
      end
      puts "ADMISSION ELIGIBLE: #{node}"
    ' || exit 1
    rm -f "${STATE_FILE}"
    ;;

  repair)
    WHO="$(req_opt who)"; REASON="$(req_opt reason)"
    STATE_FILE="$(mktemp "${TMPDIR:-/tmp}/req-manifest-repair.json.XXXXXX")"
    MANIFEST="${MANIFEST}" STATE_FILE="${STATE_FILE}" LIB_DIR="${LIB_DIR}" WHO="${WHO}" REASON="${REASON}" ruby -ryaml -rjson -rdigest -e '
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
      corrected = []
      unresolvable = []
      # G3-R2-H3: verify ALL entries with artifact bindings (current AND stale)
      (state["entries"] || []).each do |e|
        next if e["artifact_path"].nil? || e["digest"].nil?
        path = File.join(ENV["LIB_DIR"], e["artifact_path"])
        unless File.file?(path)
          unresolvable << { "node" => e["node"], "issue" => "artifact file missing", "recorded_digest" => e["digest"] }
          next
        end
        actual = Digest::SHA256.file(path).hexdigest
        if actual != e["digest"]
          corrected << { "node" => e["node"], "issue" => "digest drift corrected from actual artifact", "recorded_digest" => e["digest"], "corrected_digest" => actual }
          e["digest"] = actual
        end
      end
      unless unresolvable.empty?
        warn "ADMISSION_DENIED: repair cannot rebuild trusted baseline — unresolvable artifact bindings:"
        unresolvable.each { |c| warn "  - #{c["node"]}: #{c["issue"]}" }
        warn "MANIFEST_CORRUPT_STOP: repair aborted; manual artifact recovery required before baseline rebuild"
        exit 1
      end
      state["corrections"] = corrected
      state["repair_records"] = (state["repair_records"] || [])
      state["repair_records"] << {
        "seq" => state["repair_records"].size + 1,
        "who" => ENV["WHO"],
        "when" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reason" => ENV["REASON"],
        "corrected_entries" => corrected,
        "baseline_reset" => "self-digest recomputed from verified current content"
      }
      File.write(ENV["STATE_FILE"], JSON.generate(state))
      puts "REPAIR: baseline rebuilt; #{corrected.size} correction(s) recorded; verify artifacts before continuing."
    ' || exit 1
    seal_and_publish "${STATE_FILE}"
    rm -f "${STATE_FILE}"
    echo "REPAIR OK: trusted baseline rebuilt (who=${WHO})"
    ;;

  *)
    echo "Unknown action: ${ACTION}" >&2
    usage >&2
    exit 2
    ;;
esac
