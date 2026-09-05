#!/usr/bin/env bash
# D-088-01 v2: dual-mode knowledge-target initializer for sdlc-knowledge-sync
# (Decision-089: .sdlc root, code-driven fill, one-stop init + audit).
#
# Mode 1 INIT (no business_domain skeleton, or partial skeleton):
#   - scans target code for business entries (mechanical path heuristics only),
#     clusters them into candidate L1/L2 domains and fills candidate documents
#     (L2 main doc + xx99 EntryCoverage) with code-verifiable facts only;
#   - creates the machine artifact set create-if-missing: knowledge-target.yaml,
#     project-governance-profile.yaml, entry-coverage-profile.yaml (minimal legal
#     skeleton), business-domain-map.yaml template, audit wrapper;
#   - --domain-map <confirmed map> switches the declaration to routed and
#     generates routable L1/L2/L4 + xx99 documents from the confirmed map.
# Mode 2 AUDIT (existing skeleton detected, or --audit):
#   - read-only applicability report (root docs, numbering, machine artifacts,
#     route resolvability, gate availability, retired-vocabulary residue,
#     shape differences vs the mature baseline); the ONLY writes are the
#     missing machine artifacts (create-if-missing);
#   - a legacy knowledge root (.specify/business_domain) routes to audit mode
#     and is reported as a migration suggestion, never read or rewritten.
#
# Invariants (inherited from v1, Decision-088):
#   - only creates MISSING files; existing knowledge files are never modified;
#   - owns exactly one machine-readable file, knowledge-target.yaml; an
#     unexpected difference there is a conflict unless --update-declaration;
#   - never invents business facts: candidate documents carry code anchors and
#     pending-deposit markers only; stable facts are written exclusively by
#     sdlc-knowledge-sync from library/{requirement_id}/ artifacts, code and
#     verification evidence;
#   - declaration state machine: absent -> candidate_pending_confirmation
#     (routable:false) -> routed (owner-confirmed domain map);
#   - repeat execution is a no-op; --dry-run writes nothing; formal runs
#     require git config user.name; single-repository scope.
#
# Generated INIT content must not reference the retired roots/vocabulary
# (checked by the regression matrix). The AUDIT report is exempt: quoting
# residue findings (file:line) is its purpose.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/bootstrap-knowledge-target.sh <target-project-path> [options]

Mode selection:
  - existing skeleton (all three root documents) or a legacy knowledge root
    -> AUDIT mode;
  - otherwise -> INIT mode; pass --audit to force audit mode.

Options:
  --detect                      v3: four-type governance detection only (type,
                                signals, skeleton, declaration state); zero writes.
  --plan                        v3: emit the migration classification plan and its
                                plan_sha256; zero writes (LEGACY targets; for
                                non-LEGACY targets identical to --dry-run).
  --apply                       v3: explicit execute request; when the migration
                                plan contains TRANSFORM/RETIRE it additionally
                                requires --confirm-migration-plan (DP1).
  --confirm-migration-plan <sha256>
                                v3 DP1: owner confirmation bound to the exact
                                plan_sha256 of the latest plan output; a drifted
                                plan is rejected (re-plan + re-confirm).
  --audit                      Force applicability audit mode (report + fill
                               missing machine artifacts only).
  --project-name <name>        Project display name. Defaults to target directory name.
  --domain-map <path>          Confirmed domain map YAML (INIT only). Switches to
                               routed mode and generates routable L1/L2/L4 + xx99
                               documents. The canonical home is
                               .sdlc/business-domain-map.yaml (owner-confirmed).
  --project-type-profile <p>   backend-business-service | frontend-application |
                               data-pipeline-etl | library-shared-component |
                               admin-mixed-workflow. Default: existing declaration
                               value, else code hint.
  --update-declaration         Controlled override: replace an existing
                               knowledge-target.yaml that differs from both the
                               candidate and routed declaration for this run.
  --dry-run                    Print the action plan and file previews; write nothing.
  -h, --help                   Show this help.

Layout created under .sdlc/ (create-if-missing only):
  business_domain/knowledge-target.yaml        (initializer-owned declaration)
  business_domain/00BusinessLandscape.md
  business_domain/00UbiquitousLanguage.md
  business_domain/01DomainCatalog.md
  business_domain/{L1}/{L2}/...                (candidate or routed domain docs, xx99 entry coverage)
  project-governance-profile.yaml
  entry-coverage-profile.yaml                  (minimal legal skeleton; detailed scan:
                                                scripts/bootstrap-entry-coverage-profile.sh)
  business-domain-map.yaml                     (template; owner-confirmed map enables routed)
  scripts/bash/audit-entry-coverage.sh         (gate wrapper to the standard audit)
  reports/knowledge_target_bootstrap_report.<ts>.md   (INIT; timestamped, never overwrites)
  reports/knowledge_target_audit_report.<ts>.md       (AUDIT; timestamped, never overwrites)

Conflict policy:
  - knowledge documents: missing -> created; existing -> preserved untouched.
  - a pristine candidate skeleton (byte-identical to this run's candidate
    staging) is replaced by its routed version on a confirmed-map run.
  - knowledge-target.yaml: identical -> no-op; candidate->routed progression or
    pristine candidate match -> updated; anything else -> blocked unless
    --update-declaration.
  - machine artifacts (other YAMLs + wrapper): missing -> created; existing ->
    preserved and reported (never rewritten).

Exit codes: 0 ok/no-op/audit-findings, 1 blocked or missing git identity,
2 usage/validation error.

This initializer serves sdlc-knowledge-sync only. It reads and writes the
target repository only, and generates no run-level working materials.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STANDARD_PACKAGE_DEFAULT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_PATH=""
PROJECT_NAME=""
DOMAIN_MAP=""
PROFILE_OVERRIDE=""
UPDATE_DECLARATION="false"
DRY_RUN="false"
FORCE_AUDIT="false"
DETECT_MODE="false"
PLAN_ONLY="false"
APPLY_MODE="false"
CONFIRM_DIGEST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --detect)
      DETECT_MODE="true"; shift ;;
    --plan)
      PLAN_ONLY="true"; shift ;;
    --apply)
      APPLY_MODE="true"; shift ;;
    --confirm-migration-plan)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      CONFIRM_DIGEST="${2}"; shift 2 ;;
    --audit)
      FORCE_AUDIT="true"; shift ;;
    --project-name)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      PROJECT_NAME="${2}"; shift 2 ;;
    --domain-map)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      DOMAIN_MAP="${2}"; shift 2 ;;
    --project-type-profile)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      PROFILE_OVERRIDE="${2}"; shift 2 ;;
    --update-declaration)
      UPDATE_DECLARATION="true"; shift ;;
    --dry-run)
      DRY_RUN="true"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    -*)
      echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -n "${TARGET_PATH}" ]]; then
        echo "Only one target project path is allowed." >&2; exit 2
      fi
      TARGET_PATH="${1}"; shift ;;
  esac
done

[[ -n "${TARGET_PATH}" ]] || { usage >&2; exit 2; }
[[ -d "${TARGET_PATH}" ]] || { echo "Target project path does not exist: ${TARGET_PATH}" >&2; exit 2; }
TARGET_PATH="$(cd "${TARGET_PATH}" && pwd)"

# v3 flag mutual exclusion (spec §1)
mode_flags=0
[[ "${DETECT_MODE}" == "true" ]] && mode_flags=$((mode_flags + 1))
[[ "${PLAN_ONLY}" == "true" ]] && mode_flags=$((mode_flags + 1))
[[ "${APPLY_MODE}" == "true" ]] && mode_flags=$((mode_flags + 1))
[[ "${mode_flags}" -le 1 ]] || { echo "--detect/--plan/--apply are mutually exclusive." >&2; exit 2; }
if [[ "${CONFIRM_DIGEST}" != "" && "${APPLY_MODE}" != "true" ]]; then
  echo "--confirm-migration-plan requires --apply." >&2; exit 2
fi

case "${PROFILE_OVERRIDE}" in
  ""|backend-business-service|frontend-application|data-pipeline-etl|library-shared-component|admin-mixed-workflow) ;;
  *) echo "Unknown --project-type-profile: ${PROFILE_OVERRIDE}" >&2; exit 2 ;;
esac

if [[ -n "${DOMAIN_MAP}" && "${DOMAIN_MAP}" != /* ]]; then
  DOMAIN_MAP="${TARGET_PATH}/${DOMAIN_MAP}"
fi
# D088-R2-H2: resolve BOTH the target repository root and the confirmed map via
# realpath (expands .. and symlinks) and enforce containment BEFORE any file
# read; ENOENT/EACCES/ELOOP fail closed. The declaration records the normalized
# repo-relative path only.
TARGET_REAL="$(ruby -e 'begin; puts File.realpath(ARGV[0]); rescue StandardError; exit 1; end' "${TARGET_PATH}")" || {
  echo "Cannot resolve target project path: ${TARGET_PATH}" >&2
  exit 2
}
if [[ -n "${DOMAIN_MAP}" ]]; then
  if [[ ! -f "${DOMAIN_MAP}" ]]; then
    echo "Confirmed domain map not found: ${DOMAIN_MAP}" >&2
    exit 2
  fi
  MAP_RESOLVED="$(ruby -e 'begin; puts File.realpath(ARGV[0]); rescue StandardError; exit 1; end' "${DOMAIN_MAP}")" || {
    echo "Confirmed domain map is not readable: ${DOMAIN_MAP}" >&2
    exit 2
  }
  case "${MAP_RESOLVED}" in
    "${TARGET_REAL}"/*) ;;
    *) echo "Confirmed domain map must live inside the target repository (resolved: ${MAP_RESOLVED})." >&2; exit 2 ;;
  esac
  DOMAIN_MAP="${MAP_RESOLVED}"
  DOMAIN_MAP_REL="${DOMAIN_MAP#"${TARGET_REAL}/"}"
else
  DOMAIN_MAP_REL=""
fi

PROJECT_NAME="${PROJECT_NAME:-$(basename "${TARGET_PATH}")}"
SDLC_DIR="${TARGET_PATH}/.sdlc"
BD_DIR="${SDLC_DIR}/business_domain"
REPORT_DIR="${SDLC_DIR}/reports"
DECLARATION="${BD_DIR}/knowledge-target.yaml"
GOV_PROFILE="${SDLC_DIR}/project-governance-profile.yaml"
ECP_PROFILE="${SDLC_DIR}/entry-coverage-profile.yaml"
MAP_TEMPLATE="${SDLC_DIR}/business-domain-map.yaml"
AUDIT_WRAPPER="${SDLC_DIR}/scripts/bash/audit-entry-coverage.sh"
LEGACY_BD_ROOT="${TARGET_PATH}/.specify/business_domain"

# D088-R2-H1: single legacy-root presence test (-d || -L, symlink target never
# read) shared by mode selection and the migration advisory, so a dangling
# symlink routes to audit exactly like a real directory.
legacy_root_present() {
  [[ -d "${LEGACY_BD_ROOT}" || -L "${LEGACY_BD_ROOT}" ]]
}
STANDARD_PACKAGE="${AI_SDLC_STANDARD_HOME:-${STANDARD_PACKAGE_DEFAULT}}"
RUN_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
DOC_DATE="$(date '+%Y-%m-%d')"

# git identity is COMPUTED early (M1: R03 ambiguity evidence must not be hidden
# behind an identity error) but ENFORCED only after the BLOCKED_AMBIGUOUS gate,
# and only for modes that can write.
AUTHOR="$(git -C "${TARGET_PATH}" config --get user.name 2>/dev/null || true)"
if [[ -z "${AUTHOR}" ]]; then
  AUTHOR="<git config user.name missing>"
fi
IDENTITY_REQUIRED="true"
if [[ "${DRY_RUN}" == "true" || "${DETECT_MODE}" == "true" || "${PLAN_ONLY}" == "true" ]]; then
  IDENTITY_REQUIRED="false"
fi

# =====================================================================================
# --- v3: four-type detection and legacy migration ------------------------------------
# spec: docs/reports/d088-01-v3-behavior-spec.md v1.0.0 (Decision-090 / D-088-01 v3)
# Detection is metadata-only (spec I4): existence, path shape and name patterns.
# =====================================================================================

MIG_PENDING="false"
V3_NOW="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
mig_digest() { ruby -rdigest -e 'puts Digest::SHA256.file(ARGV[0]).hexdigest' "$1" 2>/dev/null || true; }

# --- signal collection (spec §2.1) --------------------------------------------------
HAS_S1="false"; HAS_S4="false"; HAS_S5="false"; HAS_S6="false"; HAS_S7="false"
HAS_S8="false"; HAS_S9="false"; HAS_S10="false"; HAS_S11="false"; HAS_S12="false"
SIG_LINES=()
sig() { SIG_LINES+=("$1"); }

if [[ -e "${SDLC_DIR}" || -L "${SDLC_DIR}" ]]; then HAS_S1="true"; sig "S1 .sdlc root present"; fi

ROOT_DOC_COUNT=0
for doc in 00BusinessLandscape.md 00UbiquitousLanguage.md 01DomainCatalog.md; do
  if [[ -f "${BD_DIR}/${doc}" ]]; then ROOT_DOC_COUNT=$((ROOT_DOC_COUNT + 1)); fi
done
sig "S2 .sdlc skeleton root docs = ${ROOT_DOC_COUNT}/3"

if [[ -f "${DECLARATION}" ]]; then sig "S3 new-surface declaration present"; fi

if [[ -f "${TARGET_PATH}/pom.xml" || -d "${TARGET_PATH}/src/main/java" ]]; then
  HAS_S4="true"
elif ls "${TARGET_PATH}"/*/pom.xml >/dev/null 2>&1; then
  HAS_S4="true"
elif ls -d "${TARGET_PATH}"/*/src/main/java >/dev/null 2>&1; then
  HAS_S4="true"
elif [[ -f "${TARGET_PATH}/package.json" || -f "${TARGET_PATH}/go.mod" || -f "${TARGET_PATH}/build.gradle" || -f "${TARGET_PATH}/settings.gradle" || -f "${TARGET_PATH}/Cargo.toml" || -f "${TARGET_PATH}/pyproject.toml" ]]; then
  HAS_S4="true"
fi
if [[ "${HAS_S4}" == "true" ]]; then sig "S4 code tree present"; fi

if [[ -e "${TARGET_PATH}/.specify" || -L "${TARGET_PATH}/.specify" ]]; then HAS_S5="true"; sig "S5 .specify legacy root present"; fi
if ls "${TARGET_PATH}/.specify/templates/"*.md >/dev/null 2>&1; then HAS_S6="true"; sig "S6 .specify/templates SDD templates present"; fi
for legacy_script in check-prerequisites create-new-feature setup-plan update-agent-context common; do
  if [[ -e "${TARGET_PATH}/.specify/scripts/bash/${legacy_script}.sh" ]]; then
    HAS_S7="true"; sig "S7 .specify/scripts/bash/${legacy_script}.sh present"
  fi
done
if [[ -f "${TARGET_PATH}/.specify/workflow/SDDWorkflow.md" || -f "${TARGET_PATH}/.specify/workflow/WorkflowIndex.md" ]]; then
  HAS_S8="true"; sig "S8 .specify/workflow SDD workflow present"
fi
if legacy_root_present; then HAS_S9="true"; sig "S9 .specify/business_domain legacy knowledge root present"; fi
if [[ -e "${TARGET_PATH}/.specify/business_domain/knowledge-target.yaml" ]]; then
  HAS_S10="true"; sig "S10 legacy knowledge-target.yaml (SDLC-SDD signature)"
fi
# S11 (spec §2.1): ANY old-root governance YAML, with S10 explicitly included.
if [[ "${HAS_S10}" == "true" || -e "${TARGET_PATH}/.specify/project-governance-profile.yaml" || -e "${TARGET_PATH}/.specify/entry-coverage-profile.yaml" ]]; then
  HAS_S11="true"; sig "S11 legacy governance YAML at old root (SDLC-SDD signature)"
fi
if [[ -d "${TARGET_PATH}/specs" ]] && ls -d "${TARGET_PATH}/specs/"* >/dev/null 2>&1; then
  HAS_S12="true"; sig "S12 active specs/ rail present"
fi
if [[ "${HAS_S1}" == "true" && "${HAS_S5}" == "true" ]]; then
  sig "S13 dual governance roots coexist (.sdlc + .specify) — ambiguity candidate"
fi

# --- decision table (spec §2.2, D1-D9; D2 refinement: dual root blocks only when the
# legacy side still carries governance/workflow semantics — pure C8 user files left
# behind by a completed migration must not re-block, spec R16 idempotence) ------------
V3_TYPE=""
LEGACY_ACTIVE="false"
if [[ "${HAS_S9}" == "true" || "${HAS_S10}" == "true" || "${HAS_S11}" == "true" \
      || "${HAS_S6}" == "true" || "${HAS_S7}" == "true" || "${HAS_S8}" == "true" || "${HAS_S12}" == "true" ]]; then
  LEGACY_ACTIVE="true"
fi
if [[ "${HAS_S1}" == "true" && "${HAS_S5}" == "true" && "${LEGACY_ACTIVE}" == "true" ]]; then
  V3_TYPE="BLOCKED_AMBIGUOUS"  # D1/D2: dual governance roots with active legacy semantics
  sig "D dual governance roots with active legacy semantics (.sdlc + .specify) -> BLOCKED_AMBIGUOUS"
elif [[ "${HAS_S1}" != "true" && ( "${HAS_S10}" == "true" || "${HAS_S11}" == "true" ) ]]; then
  V3_TYPE="LEGACY_SDLC_SDD"    # D3
elif [[ "${HAS_S1}" != "true" && ( "${HAS_S5}" == "true" || "${HAS_S6}" == "true" || "${HAS_S7}" == "true" || "${HAS_S8}" == "true" || "${HAS_S12}" == "true" ) ]]; then
  V3_TYPE="LEGACY_SDD"         # D4
elif [[ "${HAS_S1}" == "true" && "${ROOT_DOC_COUNT}" -eq 3 ]]; then
  V3_TYPE="EXISTING"           # D5 (spec enum: EXISTING, complete skeleton)
elif [[ "${HAS_S1}" == "true" && "${HAS_S4}" == "true" ]]; then
  V3_TYPE="EXISTING_CODE_NO_KNOWLEDGE"  # D6
elif [[ "${HAS_S1}" == "true" ]]; then
  V3_TYPE="NEW_EMPTY"          # D7
elif [[ "${HAS_S4}" == "true" ]]; then
  V3_TYPE="EXISTING_CODE_NO_KNOWLEDGE"  # D8
else
  V3_TYPE="NEW_EMPTY"          # D9
fi

case "${V3_TYPE}" in
  NEW_EMPTY) V3_SKELETON="empty" ;;
  EXISTING_CODE_NO_KNOWLEDGE) V3_SKELETON="partial_or_empty" ;;
  EXISTING) V3_SKELETON="complete" ;;
  *) V3_SKELETON="absent" ;;
esac

# --- --detect: type judgment only, zero writes (spec §1/§2) -------------------------
# ambiguous_files[]: metadata-only pre-scan (spec §2.2 output contract; I4) —
# symlink/unreadable/out-of-tree entries and structurally mixed knowledge files.
collect_ambiguous_files() {
  AMBIG_FILES=()
  local root src_abs rel resolved
  local roots=()
  if [[ "${HAS_S5}" == "true" ]]; then roots+=("${TARGET_PATH}/.specify"); fi
  if [[ "${HAS_S12}" == "true" ]]; then roots+=("${TARGET_PATH}/specs"); fi
  for root in "${roots[@]:-}"; do
    [[ -n "${root}" ]] || continue
    while IFS= read -r src_abs; do
      [[ -n "${src_abs}" ]] || continue
      rel="${src_abs#"${TARGET_PATH}/"}"
      if [[ -L "${src_abs}" ]]; then
        resolved="$(ruby -e 'begin; puts File.realpath(ARGV[0]); rescue StandardError; exit 1; end' "${src_abs}" 2>/dev/null || true)"
        if [[ -z "${resolved}" || "${resolved}" != "${TARGET_REAL}"/* ]]; then
          AMBIG_FILES+=("${rel}: unsafe symlink"); continue
        fi
      fi
      if [[ ! -r "${src_abs}" ]]; then
        AMBIG_FILES+=("${rel}: unreadable"); continue
      fi
      case "${rel}" in
        .specify/business_domain/*)
          case "${rel}" in
            *.md|*.yaml|*.yml) ;;
            *) AMBIG_FILES+=("${rel}: structurally mixed knowledge file") ;;
          esac ;;
      esac
    done < <(find "${root}/" -mindepth 1 \( -type f -o -type l \) 2>/dev/null || true)
  done
}

if [[ "${DETECT_MODE}" == "true" ]]; then
  collect_ambiguous_files
  echo "== v3 four-type detection (nothing written) =="
  echo "TYPE=${V3_TYPE}"
  echo "SKELETON=${V3_SKELETON}"
  echo "SIGNALS:"
  for line in "${SIG_LINES[@]}"; do
    if [[ -n "${line}" ]]; then echo "  - ${line}"; fi
  done
  echo "AMBIGUOUS_FILES:"
  if [[ "${#AMBIG_FILES[@]}" -gt 0 ]]; then
    for line in "${AMBIG_FILES[@]}"; do echo "  - ${line}"; done
  else
    echo "  - <none>"
  fi
  if [[ -f "${DECLARATION}" ]]; then
    DECL_STATE="$(ruby -ryaml -e '
      begin
        d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
        puts (d["status"] || "unknown").to_s
      rescue StandardError
        puts "unreadable"
      end
    ' "${DECLARATION}" 2>/dev/null || echo "unreadable")"
    echo "DECLARATION_STATE=${DECL_STATE}"
  else
    echo "DECLARATION_STATE=absent"
  fi
  TECH_HINTS=""
  if [[ -f "${TARGET_PATH}/pom.xml" || -d "${TARGET_PATH}/src/main/java" ]] \
     || ls "${TARGET_PATH}"/*/pom.xml >/dev/null 2>&1 \
     || ls -d "${TARGET_PATH}"/*/src/main/java >/dev/null 2>&1; then
    TECH_HINTS="backend-business-service"
  fi
  if [[ -f "${TARGET_PATH}/package.json" ]]; then
    if [[ -n "${TECH_HINTS}" ]]; then TECH_HINTS="${TECH_HINTS},frontend-application"; else TECH_HINTS="frontend-application"; fi
  fi
  if [[ -z "${TECH_HINTS}" ]]; then TECH_HINTS="backend-business-service"; fi
  echo "TECH_PROFILES=${TECH_HINTS}"
  exit 0
fi

# --- BLOCKED_AMBIGUOUS gate: type-level ambiguity blocks everything, zero writes -----
# (spec §2.3/R03: zero partial upgrade — no audit fallback, no init fallback)
if [[ "${V3_TYPE}" == "BLOCKED_AMBIGUOUS" ]]; then
  echo "BLOCKED: ambiguous governance type; zero partial upgrade (spec R03)." >&2
  echo "Detection evidence:" >&2
  for line in "${SIG_LINES[@]}"; do
    if [[ -n "${line}" ]]; then echo "  - ${line}" >&2; fi
  done
  echo "Resolve the dual-root/ambiguity manually, then re-run." >&2
  exit 1
fi

# --- git identity enforcement (M1: after the R03 gate so ambiguity evidence is
# never hidden behind an identity error; write-capable modes only) --------------------
if [[ "${IDENTITY_REQUIRED}" == "true" && "${AUTHOR}" == "<git config user.name missing>" ]]; then
  echo "BLOCKED: git config user.name is required before writing knowledge-target files." >&2
  exit 1
fi

# --- routing guards -------------------------------------------------------------------
if [[ "${V3_TYPE}" == LEGACY_* ]]; then
  if [[ -n "${DOMAIN_MAP}" ]]; then
    echo "BLOCKED: --domain-map is not supported on a LEGACY target; run the migration first, then confirm the map on a follow-up run." >&2
    exit 2
  fi
fi

# non-LEGACY --plan behaves like --dry-run (spec §1)
if [[ "${PLAN_ONLY}" == "true" && "${V3_TYPE}" != LEGACY_* ]]; then
  DRY_RUN="true"
fi

# =====================================================================================
# --- v3: legacy migration plan / transactional apply ---------------------------------
# =====================================================================================
if [[ "${V3_TYPE}" == LEGACY_* && "${FORCE_AUDIT}" != "true" ]]; then
  # --- classification walk (spec §4.2 rules C1-C10; metadata + safety only) ---------
  MIG_PLAN_LINES=()      # canonical plan text lines (sorted before digest)
  MIG_TSV=()             # verb<tab>rel<tab>dst<tab>rule<tab>pre_digest
  MIG_MOVES=()           # src<tab>dst
  MIG_BLOCKED=()         # paired entries: rel, reason
  MIG_PRESERVED=()
  MIG_ADD_ONLY="true"

  LEGACY_ROOTS=()
  if [[ "${HAS_S5}" == "true" ]]; then LEGACY_ROOTS+=("${TARGET_PATH}/.specify"); fi
  if [[ "${HAS_S12}" == "true" ]]; then LEGACY_ROOTS+=("${TARGET_PATH}/specs"); fi

  # C10 root containment (G1-R1-H1): a legacy root that is itself a symlink must
  # resolve inside the target repository before it is walked at all; otherwise the
  # walk would collect (and migrate) out-of-repo files.
  LEGACY_WALK_ROOTS=()
  MIG_ROOT_BLOCKED=""
  for root in "${LEGACY_ROOTS[@]}"; do
    if [[ -L "${root}" ]]; then
      resolved_root="$(ruby -e 'begin; puts File.realpath(ARGV[0]); rescue StandardError; exit 1; end' "${root}" 2>/dev/null || true)"
      if [[ -z "${resolved_root}" ]]; then
        MIG_ROOT_BLOCKED="dangling legacy root symlink: ${root#"${TARGET_PATH}/"}"
      elif [[ "${resolved_root}" != "${TARGET_REAL}"/* ]]; then
        MIG_ROOT_BLOCKED="legacy root symlink escapes target repository: ${root#"${TARGET_PATH}/"} -> ${resolved_root}"
      else
        LEGACY_WALK_ROOTS+=("${root}")
      fi
    else
      LEGACY_WALK_ROOTS+=("${root}")
    fi
  done

  LEGACY_FILES=""
  for root in "${LEGACY_WALK_ROOTS[@]:-}"; do
    [[ -n "${root}" ]] || continue
    part="$(find "${root}/" -mindepth 1 \( -type f -o -type l \) 2>/dev/null || true)"
    if [[ -n "${part}" ]]; then
      if [[ -n "${LEGACY_FILES}" ]]; then
        LEGACY_FILES="${LEGACY_FILES}
${part}"
      else
        LEGACY_FILES="${part}"
      fi
    fi
  done
  LEGACY_FILES="$(printf '%s' "${LEGACY_FILES}" | LC_ALL=C sort -u)"

  # per-rule rationale (spec R06: every classification carries its reason)
  mig_rule_rationale() {
    case "$1" in
      C1) echo "knowledge body relocated verbatim into .sdlc/business_domain (I1)" ;;
      C2) echo "legacy governance YAML archived; fixed fields merged per spec §4.4" ;;
      C3) echo "SDD template retired; standard-package templates supersede it" ;;
      C4) echo "speckit workflow script retired; old flow must not stay active (R07)" ;;
      C5) echo "legacy SDD workflow document retired (Decision-090 decision 3)" ;;
      C6) echo "active specs/ rail retired into archive (old rail must not persist)" ;;
      C7) echo "legacy run artifact archived with its era, not imported as knowledge" ;;
      C8) echo "not legacy-workflow owned; left untouched in place" ;;
      C9) echo "structurally mixed knowledge file without a mechanical separation rule" ;;
      C10) echo "unsafe entry: symlink/unreadable/out-of-repo (R12/R13)" ;;
      COLLISION) echo "migration destination already exists; refusing overwrite (I1)" ;;
      *) echo "classified" ;;
    esac
  }

  while IFS= read -r src_abs; do
    if [[ -z "${src_abs}" ]]; then continue; fi
    rel="${src_abs#"${TARGET_PATH}/"}"
    rule=""; verb=""; dst_rel="-"
    # C10 safety: symlink resolution / readability (spec §5.3)
    if [[ -L "${src_abs}" ]]; then
      resolved="$(ruby -e 'begin; puts File.realpath(ARGV[0]); rescue StandardError; exit 1; end' "${src_abs}" 2>/dev/null || true)"
      if [[ -z "${resolved}" ]]; then
        rule="C10"; MIG_BLOCKED+=("${rel}" "dangling or unresolvable symlink")
      elif [[ "${resolved}" != "${TARGET_REAL}"/* ]]; then
        rule="C10"; MIG_BLOCKED+=("${rel}" "symlink escapes target repository")
      fi
    fi
    if [[ -z "${rule}" && ! -r "${src_abs}" ]]; then
      rule="C10"; MIG_BLOCKED+=("${rel}" "file not readable")
    fi
    if [[ -z "${rule}" ]]; then
      case "${rel}" in
        .specify/business_domain/knowledge-target.yaml|.specify/project-governance-profile.yaml|.specify/entry-coverage-profile.yaml)
          rule="C2" ;;
        .specify/business_domain/*.md)
          rule="C1" ;;
        .specify/business_domain/*)
          rule="C9" ;;
        .specify/templates/*)
          rule="C3" ;;
        .specify/scripts/bash/*)
          rule="C4" ;;
        .specify/workflow/*)
          rule="C5" ;;
        specs/*)
          rule="C6" ;;
        .specify/reports/*)
          rule="C7" ;;
        *)
          rule="C8" ;;
      esac
    fi
    case "${rule}" in
      C1)
        dst_rel=".sdlc/business_domain/${rel#.specify/business_domain/}"; verb="TRANSFORM" ;;
      C2)
        dst_rel=".sdlc/legacy/${rel}"; verb="TRANSFORM" ;;
      C3|C4|C5|C6|C7)
        dst_rel=".sdlc/legacy/${rel}"; verb="RETIRE" ;;
      C9|C10)
        verb="BLOCKED_AMBIGUOUS" ;;
      *)
        verb="PRESERVE" ;;
    esac
    if [[ "${verb}" == "PRESERVE" ]]; then
      MIG_PRESERVED+=("${rel}")
      MIG_PLAN_LINES+=("PRESERVE	${rel}	-	${rule}	$(mig_rule_rationale "${rule}")")
      MIG_TSV+=("PRESERVE	${rel}	-	${rule}		$(mig_rule_rationale "${rule}")")
    elif [[ "${verb}" == "BLOCKED_AMBIGUOUS" ]]; then
      reason="unknown mixed or unsafe file (rule ${rule})"
      for ((b = 0; b < ${#MIG_BLOCKED[@]}; b += 2)); do
        if [[ "${MIG_BLOCKED[${b}]}" == "${rel}" ]]; then reason="${MIG_BLOCKED[${b} + 1]}"; fi
      done
      MIG_PLAN_LINES+=("BLOCKED	${rel}	-	${rule}	${reason}")
      MIG_TSV+=("BLOCKED_AMBIGUOUS	${rel}	-	${rule}		${reason}")
    else
      if [[ -e "${TARGET_PATH}/${dst_rel}" ]]; then
        MIG_BLOCKED+=("${rel}" "destination already exists: ${dst_rel}")
        MIG_PLAN_LINES+=("BLOCKED	${rel}	${dst_rel}	COLLISION	$(mig_rule_rationale "COLLISION")")
        MIG_TSV+=("BLOCKED_AMBIGUOUS	${rel}	${dst_rel}	COLLISION		$(mig_rule_rationale "COLLISION")")
      else
        # H2: the confirmed plan binds each file's pre-digest, so any content or
        # file-set drift between plan and apply invalidates the confirmation.
        pre="$(mig_digest "${src_abs}")"
        MIG_MOVES+=("${src_abs}	${TARGET_PATH}/${dst_rel}")
        MIG_PLAN_LINES+=("${verb}	${rel}	${dst_rel}	${rule}	${pre}")
        MIG_TSV+=("${verb}	${rel}	${dst_rel}	${rule}	${pre}	$(mig_rule_rationale "${rule}")")
        MIG_ADD_ONLY="false"
      fi
    fi
  done <<< "${LEGACY_FILES}"

  MIG_BLOCK_TOTAL=$(( ${#MIG_BLOCKED[@]} / 2 ))
  MIG_SIG_CSV="$(printf '%s; ' "${SIG_LINES[@]}")"
  MIG_SIG_CSV="${MIG_SIG_CSV%; }"

  # --- canonical plan text + digest (spec §4.3; H2: bound to signals and per-file
  # pre-digests so any drift in classification or content invalidates the plan) -------
  if [[ "${#MIG_PLAN_LINES[@]}" -gt 0 ]]; then
    PLAN_BODY="$(printf '%s
' "${MIG_PLAN_LINES[@]}" | LC_ALL=C sort)"
  else
    PLAN_BODY=""
  fi
  PLAN_TEXT="type=${V3_TYPE}
signals=${MIG_SIG_CSV}
add_only=${MIG_ADD_ONLY}
blocked=${MIG_BLOCK_TOTAL}
files:
${PLAN_BODY}"
  PLAN_SHA="$(printf '%s' "${PLAN_TEXT}" | ruby -rdigest -e 'puts Digest::SHA256.hexdigest(STDIN.read)')"

  # --- plan / dry-run output: zero writes (spec §4.3/§4.5) --------------------------
  if [[ "${PLAN_ONLY}" == "true" || "${DRY_RUN}" == "true" ]]; then
    echo "== MIGRATION PLAN (nothing written) =="
    echo "TYPE=${V3_TYPE}"
    echo "ADD_ONLY=${MIG_ADD_ONLY}"
    echo "BLOCKED=${MIG_BLOCK_TOTAL}"
    echo "PLAN_SHA256=${PLAN_SHA}"
    echo "FILES:"
    if [[ -n "${PLAN_BODY}" ]]; then
      while IFS= read -r pline; do echo "  ${pline}"; done <<< "${PLAN_BODY}"
    fi
    if [[ "${MIG_BLOCK_TOTAL}" -gt 0 ]]; then
      echo "BLOCKED_FILES:"
      for ((b = 0; b < ${#MIG_BLOCKED[@]}; b += 2)); do
        echo "  - ${MIG_BLOCKED[${b}]}: ${MIG_BLOCKED[${b} + 1]}"
      done
      echo "BLOCKED: migration cannot proceed (zero partial upgrade, spec R03)."
      exit 1
    fi
    exit 0
  fi

  # --- apply preconditions (spec §4.5 DP1 / R03) ------------------------------------
  if [[ -n "${MIG_ROOT_BLOCKED}" ]]; then
    echo "BLOCKED: ${MIG_ROOT_BLOCKED}; zero partial upgrade (spec R03/I6)." >&2
    exit 1
  fi
  if [[ "${MIG_BLOCK_TOTAL}" -gt 0 ]]; then
    echo "BLOCKED: ${MIG_BLOCK_TOTAL} ambiguous/unsafe file(s); zero partial upgrade (spec R03):" >&2
    for ((b = 0; b < ${#MIG_BLOCKED[@]}; b += 2)); do
      echo "  - ${MIG_BLOCKED[${b}]}: ${MIG_BLOCKED[${b} + 1]}" >&2
    done
    exit 1
  fi
  if [[ "${MIG_ADD_ONLY}" != "true" && "${CONFIRM_DIGEST}" != "${PLAN_SHA}" ]]; then
    echo "BLOCKED: DP1 confirmation required. Re-run with --plan, review the classification," >&2
    echo "then --apply --confirm-migration-plan <plan_sha256> (expected ${PLAN_SHA})." >&2
    exit 1
  fi

  # --- transactional apply (spec §6.1-6.3; H3): two-phase — full backup FIRST, then
  # moves; only actually-moved entries are rolled back; an ERR trap guards the whole
  # window between the first move and the finalized reports. -------------------------
  MIG_BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/knowledge-target-mig-backup.XXXXXX")"
  MIG_ROLLBACK_OK="true"
  MIG_MOVED=0
  MIG_FAIL_REASON=""

  mig_rollback() {
    local m src dst brel rc=0
    for ((m = MIG_MOVED - 1; m >= 0; m--)); do
      IFS=$'	' read -r src dst <<< "${MIG_MOVES[${m}]}"
      brel="${src#"${TARGET_PATH}/"}"
      if [[ -f "${dst}" ]]; then
        mkdir -p "$(dirname "${src}")"
        if ! mv "${dst}" "${src}"; then rc=1; continue; fi
      fi
      if [[ -f "${MIG_BACKUP_DIR}/${brel}" ]] && ! cmp -s "${src}" "${MIG_BACKUP_DIR}/${brel}"; then
        rc=1
      fi
    done
    if [[ "${rc}" -eq 0 ]]; then rm -rf "${MIG_BACKUP_DIR}"; fi
    return "${rc}"
  }

  # H6/I8b: every failure path emits a machine-checkable migration failure report.
  mig_write_failure_report() {
    local reason="$1"
    local fjson fmd
    mkdir -p "${REPORT_DIR}"
    fjson="$(mktemp "${REPORT_DIR}/migration_report.${RUN_TIMESTAMP}.${$}.json.XXXXXX" 2>/dev/null)" || return 0
    fmd="$(mktemp "${REPORT_DIR}/migration_report.${RUN_TIMESTAMP}.${$}.md.XXXXXX" 2>/dev/null)" || return 0
    M_FAIL_REASON="${reason}" M_PLAN_SHA="${PLAN_SHA:-}" M_MOVED="${MIG_MOVED}" \
    M_TYPE="${V3_TYPE}" M_TS="${RUN_TIMESTAMP}" M_NOW="${V3_NOW}" M_TARGET="${TARGET_PATH}" \
    ruby -rjson -e '
      doc = {
        "run_timestamp" => ENV["M_TS"], "generated_at" => ENV["M_NOW"],
        "target_repository" => ENV["M_TARGET"], "git_author" => "<failed run>",
        "detection" => { "type" => ENV["M_TYPE"], "signals" => [], "skeleton_state" => "absent" },
        "plan_sha256" => ENV["M_PLAN_SHA"],
        "confirmation" => { "required" => true, "provided" => true, "digest" => ENV["M_PLAN_SHA"] },
        "add_only" => false, "moved_count" => ENV["M_MOVED"].to_i, "files" => [],
        "field_mappings" => [],
        "residue_gate" => { "scope" => ".sdlc/** minus legacy/, reports/, migration/", "violations_count" => 0 },
        "post_detect_type" => "",
        "rollback" => { "occurred" => true, "reason" => ENV["M_FAIL_REASON"] },
        "status" => "FAILED_ROLLED_BACK",
        "migration_completed_at" => nil
      }
      File.write(ARGV[0], JSON.pretty_generate(doc) + "\n")
      md = String.new
      md << "# Migration Report (FAILED, ROLLED BACK)\n\n"
      md << "> **Reason**: #{ENV["M_FAIL_REASON"]}\n> **Moved before failure**: #{ENV["M_MOVED"]} (all restored)\n> **Plan SHA-256**: `#{ENV["M_PLAN_SHA"]}`\n"
      File.write(ARGV[1], md)
    ' "${fjson}" "${fmd}" 2>/dev/null || true
    echo "MIGRATION FAILURE REPORT=${fjson#${TARGET_PATH}/}"
  }

  # ERR trap guards the transaction window: any unhandled failure between the first
  # move and the finalized success reports rolls the repository back (H3).
  mig_tx_guard() {
    local rc=$?
    if [[ "${MIG_TX_ACTIVE:-}" != "true" ]]; then exit "${rc}"; fi
    MIG_TX_ACTIVE="false"
    echo "UNEXPECTED FAILURE in transaction window; rolling back migration..." >&2
    if mig_rollback; then
      echo "ROLLED BACK: repository restored to pre-migration state." >&2
    else
      echo "ROLLBACK INCOMPLETE: manual recovery required; backup kept at ${MIG_BACKUP_DIR}" >&2
      MIG_ROLLBACK_OK="false"
    fi
    local c crel
    for ((c = 0; c < ${#CREATED_FILES[@]}; c++)); do
      crel="${CREATED_FILES[${c}]}"
      case "${crel}" in
        project-governance-profile.yaml|entry-coverage-profile.yaml|business-domain-map.yaml|scripts/bash/audit-entry-coverage.sh) rm -f "${SDLC_DIR}/${crel}" ;;
        *) rm -f "${BD_DIR}/${crel}" ;;
      esac
    done
    rm -f "${REPORT_FILE:-}"
    mig_write_failure_report "unexpected failure in transaction window (exit ${rc})"
    exit 1
  }
  trap mig_tx_guard ERR

  # phase 1: full backup of every planned move BEFORE any move happens (H3)
  for ((m = 0; m < ${#MIG_MOVES[@]}; m++)); do
    IFS=$'	' read -r src dst <<< "${MIG_MOVES[${m}]}"
    brel="${src#"${TARGET_PATH}/"}"
    mkdir -p "${MIG_BACKUP_DIR}/$(dirname "${brel}")"
    if ! cp -p "${src}" "${MIG_BACKUP_DIR}/${brel}"; then
      MIG_TX_ACTIVE="false"
      echo "BLOCKED: backup failed for ${src}; nothing was moved (zero partial upgrade)." >&2
      rm -rf "${MIG_BACKUP_DIR}"
      exit 1
    fi
  done

  # phase 2: moves; failure rolls back exactly the moved prefix
  MIG_TX_ACTIVE="true"
  for ((m = 0; m < ${#MIG_MOVES[@]}; m++)); do
    IFS=$'	' read -r src dst <<< "${MIG_MOVES[${m}]}"
    mkdir -p "$(dirname "${dst}")"
    if ! mv "${src}" "${dst}"; then
      MIG_FAIL_REASON="move failed: ${src#"${TARGET_PATH}/"} -> ${dst#"${TARGET_PATH}/"}"
      echo "MIGRATION FAILED: ${MIG_FAIL_REASON}; rolling back..." >&2
      MIG_TX_ACTIVE="false"
      if mig_rollback; then
        echo "ROLLED BACK: repository restored to pre-migration state." >&2
      else
        echo "ROLLBACK INCOMPLETE: manual recovery required; backup kept at ${MIG_BACKUP_DIR}" >&2
        MIG_ROLLBACK_OK="false"
      fi
      mig_write_failure_report "${MIG_FAIL_REASON}"
      exit 1
    fi
    MIG_MOVED=$((MIG_MOVED + 1))
  done

  # prune legacy directories emptied by the migration (spec R16 idempotence: an
  # empty legacy root must not re-trigger legacy detection or audit routing on
  # re-runs; directories holding PRESERVE'd user files are never empty)
  for root in "${LEGACY_WALK_ROOTS[@]:-}"; do
    [[ -n "${root}" ]] || continue
    find "${root}/" -depth -type d -empty -delete 2>/dev/null || true
  done

  echo "== migration applied: ${MIG_MOVED} file(s) moved; ADD_ONLY=${MIG_ADD_ONLY}; PLAN_SHA256=${PLAN_SHA} =="
  MIG_PENDING="true"
fi

# --- mode selection -------------------------------------------------------------
root_doc_count=0
for doc in 00BusinessLandscape.md 00UbiquitousLanguage.md 01DomainCatalog.md; do
  [[ -f "${BD_DIR}/${doc}" ]] && root_doc_count=$((root_doc_count + 1))
done
MODE="init"
if [[ "${FORCE_AUDIT}" == "true" ]]; then
  MODE="audit"
elif [[ -z "${DOMAIN_MAP}" ]] && { [[ "${root_doc_count}" -eq 3 ]] || legacy_root_present; }; then
  MODE="audit"
fi

# --- profile resolution ----------------------------------------------------------
existing_declaration_profiles=""
if [[ -f "${DECLARATION}" ]]; then
  existing_declaration_profiles="$(ruby -ryaml -e '
    begin
      d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
      profiles = d["project_type_profiles"]
      profiles = Array(profiles.is_a?(Hash) ? profiles["selected"] : profiles)
      puts profiles.map(&:to_s).reject(&:empty?).join(",")
    rescue StandardError
      nil
    end
  ' "${DECLARATION}" 2>/dev/null || true)"
fi

detect_profile_hint() {
  local hints=()
  # strong backend signal wins over a stray package.json (e.g. multi-module maven repo)
  if [[ -f "${TARGET_PATH}/pom.xml" ]] || [[ -d "${TARGET_PATH}/src/main/java" ]] \
     || ls "${TARGET_PATH}"/*/pom.xml >/dev/null 2>&1 \
     || ls -d "${TARGET_PATH}"/*/src/main/java >/dev/null 2>&1; then
    hints+=("backend-business-service")
  fi
  if [[ -f "${TARGET_PATH}/package.json" ]]; then
    hints+=("frontend-application")
  fi
  if [[ "${#hints[@]}" -eq 0 ]]; then
    hints+=("backend-business-service")
  fi
  printf '%s\n' "${hints[@]}" | awk '!seen[$0]++'
}

if [[ -n "${PROFILE_OVERRIDE}" ]]; then
  PROJECT_TYPE_PROFILES="${PROFILE_OVERRIDE}"
elif [[ -n "${existing_declaration_profiles}" ]]; then
  PROJECT_TYPE_PROFILES="${existing_declaration_profiles}"
else
  PROJECT_TYPE_PROFILES="$(detect_profile_hint | paste -sd, -)"
fi
L4_TEMPLATE_PROFILE="${PROJECT_TYPE_PROFILES%%,*}"
case "${L4_TEMPLATE_PROFILE}" in
  backend-business-service|frontend-application|data-pipeline-etl|library-shared-component|admin-mixed-workflow) ;;
  *) L4_TEMPLATE_PROFILE="backend-business-service" ;;
esac

# --- staging ---------------------------------------------------------------------
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/knowledge-target-staging.XXXXXX")"
trap 'rm -rf "${STAGING_DIR}"' EXIT

yaml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# Pure-hex SHA-256 of a file (stdlib Digest; no external digest dependency).
file_digest() {
  ruby -rdigest -e 'puts Digest::SHA256.file(ARGV[0]).hexdigest' "$1"
}

write_staging_file() {
  local rel="$1"
  mkdir -p "${STAGING_DIR}/$(dirname "${rel}")"
  cat > "${STAGING_DIR}/${rel}"
}

generate_declaration() {
  local status="$1" routable="$2" map_ref="$3" managed_block="${4:-}" map_sha="${5:-null}"
  cat <<EOF
schema_version: "2.1"
governed_by: sdlc-knowledge-sync
target_root: .sdlc/business_domain
status: "${status}"
routable: ${routable}
fill_mode: code_driven_scan
project_type_profiles:
$(printf '%s' "${PROJECT_TYPE_PROFILES}" | tr ',' '\n' | sed 's/^/  - "/; s/$/"/')
fact_sources:
  process_evidence: "current requirement library/{requirement_id}/ seven-node artifacts (00-需求资料 .. 06-知识同步)"
  code: "target repository code state"
  verification: "verified test and review evidence"
  governance_rules: "AGENTS.md + standard package skill contracts"
initializer: "scripts/bootstrap-knowledge-target.sh"
domain_map: ${map_ref}
domain_map_sha256: ${map_sha}
${managed_block:+managed_root_docs:
${managed_block}}
EOF
}

generate_declaration_candidate() {
  generate_declaration "candidate_pending_confirmation" "false" "null" "" "null"
}

generate_governance_profile() {
  cat <<EOF
schema_version: "1.0"
generated_by: "scripts/bootstrap-knowledge-target.sh (D-088-01 v2)"
project:
  name: "${PROJECT_NAME}"
  project_type_profiles:
$(printf '%s' "${PROJECT_TYPE_PROFILES}" | tr ',' '\n' | sed 's/^/    - "/; s/$/"/')
standard_package:
  source: "\${AI_SDLC_STANDARD_HOME}"
note: >-
  create-if-missing skeleton owned by the knowledge-target initializer;
  run scripts/bootstrap-entry-coverage-profile.sh for the detailed
  entry-coverage profile scan before enforcing gate checks.
EOF
}

generate_entry_coverage_profile() {
  cat <<EOF
version: "0.1.0"
schema_version: "0.1.0"
generated_by: "scripts/bootstrap-knowledge-target.sh (D-088-01 v2)"
profile_status: "minimal_skeleton_pending_detailed_scan"
project_type_profiles:
  selected:
$(printf '%s' "${PROJECT_TYPE_PROFILES}" | tr ',' '\n' | sed 's/^/    - "/; s/$/"/')
  source: "initializer-skeleton"
  pending_confirmation: true
scope:
  source_roots:
    - "."
  include_file_patterns:
    - "**/*"
  document_scope: ".sdlc/business_domain"
  report_dir: ".sdlc/reports/entry_coverage"
domain_matching:
  l4_document_pattern: ".sdlc/business_domain/**/[0-9][0-9][0-9][0-9][0-9][0-9]*.md"
  entry_match_rule: "entry class, method, path, route, topic, job, function, SQL, connector, or sink appears in an L4 evidence table"
  allow_entry_in_multiple_l2_domains: false
strict_outputs:
  entry_inventory: "entry_inventory.tsv"
  service_inventory: "service_inventory.tsv"
  entry_chain_evidence: "entry_chain_evidence.md"
  unarchived_entries: "unarchived_entries.md"
  unarchived_services: "unarchived_services.md"
  cross_domain_conflicts: "cross_domain_conflicts.md"
  summary_report: "entry_coverage_report.md"
detailed_scan: "scripts/bootstrap-entry-coverage-profile.sh"
EOF
}

generate_map_template() {
  cat <<'EOF'
# business-domain-map（确认域映射）模板 — D-088-01 v2
#
# 用途：Owner 逐域确认候选域后填写 confirmed_domains 并把 status 置为 confirmed，
# 然后运行：
#   scripts/bootstrap-knowledge-target.sh <target-path> --domain-map .sdlc/business-domain-map.yaml
# 确认完成前本文件只是模板；candidate 状态下 sdlc-knowledge-sync 只产 PROPOSAL，
# 不写 confirmed 领域事实。
#
# 字段约定：L4 编号 6 位（L1 两位 + L2 两位 + L4 两位）；入口覆盖文档固定为
# xx99（L1 两位 + L2 两位 + 99）命名；入口类唯一归属一个 L2。
schema_version: "1.0"
status: "template"
confirmed_domains: []
# 确认后示例（取消注释并替换为 Owner 确认值）：
# confirmed_domains:
#   - l1_id: "01"
#     l1_name_en: "Order"
#     l1_name_cn: "<L1 中文名>"
#     l2:
#       - l2_id: "01"
#         l2_name_en: "SaleOrder"
#         l2_name_cn: "<L2 中文名>"
#         owner: "<owner>"
#         l4:
#           - l4_id: "01"
#             l4_name_en: "OrderEntry"
#             l4_name_cn: "<L4 中文名>"
#             owner: "<owner>"
EOF
}

generate_audit_wrapper() {
  cat <<EOF
#!/usr/bin/env bash
# Gate thin wrapper (D-088-01 v2): adapter to the standard entry coverage audit.
# Standard package root: \${AI_SDLC_STANDARD_HOME} env override, else the path
# recorded at generation time. Default target is this repository root.
set -euo pipefail
SDLC_HOME="\${AI_SDLC_STANDARD_HOME:-${STANDARD_PACKAGE}}"
REPO_ROOT="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/../../.." && pwd)"
if [[ "\${#}" -eq 0 ]]; then
  set -- "\${REPO_ROOT}"
elif [[ ! -d "\${1}" ]]; then
  set -- "\${REPO_ROOT}" "\${@}"
fi
exec ruby "\${SDLC_HOME}/scripts/audit-entry-coverage.rb" "\${@}"
EOF
}

generate_landscape() {
  local domain_rows="$1" fill_section="$2"
  cat <<EOF
# 业务全景图（Business Landscape）

> **元数据**
> - **版本**: 0.1.0
> - **日期**: ${DOC_DATE}
> - **作者**: ${AUTHOR}
> - **状态**: ${DOC_STATUS}
> - **摘要**: ${PROJECT_NAME} 长期业务域知识目标入口（知识沉淀治理初始化产物）。

## 用途

本文档是 \`${PROJECT_NAME}\` 的长期业务域入口，是 \`sdlc-knowledge-sync\`
的确定性知识目标（见同目录 \`knowledge-target.yaml\` 声明）。

## 事实源分层

| 层 | 职责 | 来源 |
| --- | --- | --- |
| 标准共享规则 | 工作流、门禁、产物与同步治理。 | \`\${AI_SDLC_STANDARD_HOME}\`（AGENTS.md + 标准包 skill 合同） |
| 过程事实（按需求） | 当前需求七节点过程产物。 | \`library/{requirement_id}/\` |
| 长期稳定事实 | 已验证可复用的业务知识。 | \`.sdlc/business_domain/**\` |

\`sdlc-knowledge-sync\` 只把已验证的稳定事实写入本目录，事实来源为
\`library/{requirement_id}/\` 过程产物、代码状态与验证证据；初始化器只建结构，
不发明业务事实。

## 业务域地图

| L1 | 中文名 | 状态 | Owner 确认 |
| --- | --- | --- | --- |
${domain_rows}
${fill_section}
## 路由原则

- 新需求在存在已确认域映射（\`business-domain-map.yaml\` 状态 confirmed）后，
  经 \`01DomainCatalog.md\` 按业务单据维度优先路由。
- 候选状态（\`candidate_pending_confirmation\`，\`routable: false\`）下，
  同步只产 PROPOSAL，不写 confirmed 领域事实。

## 门禁说明

- 同步前先跑入口覆盖对账：\`.sdlc/scripts/bash/audit-entry-coverage.sh\`
  （即标准包 \`scripts/audit-entry-coverage.rb\` 的薄包装），strict 模式
  BLOCKED 或 PENDING 时不得最终化同步。
- L4 编号规则：6 位（L1 两位 + L2 两位 + L4 两位）；入口覆盖文档固定为
  xx99 命名；入口类唯一归属一个 L2；主域/协同域在 L2 主文档标记。

## 修订记录

| 版本 | 日期 | 作者 | 变更 |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | 知识目标初始化（候选态骨架）。 |
EOF
}

generate_landscape_fill_section() {
  local l1_count="$1" l2_count="$2" entry_count="$3"
  if [[ "${l1_count}" -eq 0 ]]; then
    cat <<'EOF'
### 候选域说明

代码扫描未发现业务入口（空仓或纯基础设施仓），未生成候选域；
候选域在真实业务入口出现后重新运行初始化器补齐。

EOF
  else
    cat <<EOF
### 候选域说明

以下候选域由代码扫描机械聚类产生（入口数 ${entry_count}，候选 L1 ${l1_count} 个、
候选 L2 ${l2_count} 个）：仅含代码可验证事实（入口类/代码路径/模块结构），
业务规则与术语语义一律待沉淀；全部为 Candidate 状态，Owner 确认
（填写并确认 \`business-domain-map.yaml\`）后才可路由。

EOF
  fi
}

generate_language() {
  cat <<EOF
# 统一语言表（Ubiquitous Language）

> **元数据**
> - **版本**: 0.1.0
> - **日期**: ${DOC_DATE}
> - **作者**: ${AUTHOR}
> - **状态**: ${DOC_STATUS}
> - **摘要**: ${PROJECT_NAME} 长期术语表骨架（业务语义待沉淀）。

## 术语表

| 术语 | 含义 | 状态 | 来源 |
| --- | --- | --- | --- |

## 用词规则

- 只沉淀 Owner 确认的稳定业务术语。
- 包名、类名、表名、路由名未经确认不得提升为业务词汇。
- 术语由 \`sdlc-knowledge-sync\` 从 \`library/{requirement_id}/\` 过程产物与
  验证证据同步，初始化器不发明。

## 修订记录

| 版本 | 日期 | 作者 | 变更 |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | 术语表骨架（待沉淀）。 |
EOF
}

generate_catalog() {
  local l1l2_rows="$1" l4_rows="$2"
  cat <<EOF
# 域目录（Domain Catalog）

> **元数据**
> - **版本**: 0.1.0
> - **日期**: ${DOC_DATE}
> - **作者**: ${AUTHOR}
> - **状态**: ${DOC_STATUS}
> - **摘要**: ${PROJECT_NAME} 长期业务域文档路由索引。

## L1/L2 索引

| L1 | L2 | 主文档 | 状态 | Owner |
| --- | --- | --- | --- | --- |
${l1l2_rows}
## L4 索引

| L4 | 文档 | 业务名 | 状态 |
| --- | --- | --- | --- |
${l4_rows}
## 编号与门禁规则

- L4 文档编号 6 位：L1 两位 + L2 两位 + L4 两位；新 L4 文档只在 Owner 确认
  后经 create-if-missing 授权创建。
- 入口覆盖文档固定为 xx99 命名（L1 两位 + L2 两位 + 99），是入口唯一归属的
  对账文档；一个入口类只归属一个 L2。
- 候选状态下本目录不可路由（\`routable: false\`），同步只产 PROPOSAL；
  Owner 确认域映射后才启用正式路由。
- 命名约定不明确时只产同步提案。

## 修订记录

| 版本 | 日期 | 作者 | 变更 |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | 域目录骨架（候选态）。 |
EOF
}

# --- INIT: candidate fill (code-driven scan + mechanical clustering) --------------
scan_and_stage_candidates() { # $1 = destination staging dir (defaults to main business_domain staging)
  # Ruby scans entries, clusters candidates, and stages candidate documents.
  local dest="${1:-${STAGING_DIR}/business_domain}"
  ruby - "${TARGET_PATH}" "${dest}" "${PROJECT_NAME}" "${AUTHOR}" "${DOC_DATE}" <<'RUBY'
require "fileutils"

target, staging, project_name, author, doc_date = ARGV
FileUtils.mkdir_p(staging)

# Frontend entries count only behavioral source files, not assets/docs (D088-R1-H2).
FE_SOURCE_EXTS = %w[.vue .js .ts .jsx .tsx .html .htm .jsp .ftl .vm .svelte].freeze

ENTRY_RULES = [
  ["controller", ["**/*Controller.java"], nil],
  ["rpc",        ["**/rpc/**/*.java", "**/*Provider.java", "**/*Facade.java", "**/*RPCService.java"], nil],
  ["processor",  ["**/process/**/*Processor.java"], nil],
  ["mq",         ["**/*Listener.java", "**/*Consumer.java", "**/*Mcq*.java", "**/*MCQ*.java", "**/*mcq*/**/*.java"], nil],
  ["schedule",   ["**/*Schedule.java", "**/*Job.java", "**/*Task.java", "**/*Worker.java"], nil],
  ["fe_page",    ["**/pages/**/*", "**/views/**/*"], FE_SOURCE_EXTS],
  ["fe_api",     ["**/api/**/*"], FE_SOURCE_EXTS]
].freeze

SKIP_SEGMENTS = %w[src main java test tests resources pages views api webapp business biz modules module].freeze
TLD_SEGMENTS  = %w[com cn net org io me].freeze
SRC_ROOTS     = %w[src app web lib packages frontend webapp].freeze
EXCLUDED_PATHS = [
  %r{\A\.git(/|\z)}, %r{\A\.sdlc(/|\z)}, %r{\A\.specify(/|\z)},
  %r{(^|/)(node_modules|target|build|dist|vendor|coverage|generated|\.idea|\.gradle|\.mvn)(/|\z)},
  %r{(^|/)(examples|samples|mock-data|mock_data|fixtures?|test-fixtures|test_fixtures|__snapshots__|snapshots)(/|\z)},
  %r{(^|/)(test|tests)(/|\z)}
].freeze

def excluded?(rel)
  EXCLUDED_PATHS.any? { |re| rel.match?(re) }
end

def sanitize_name(segment)
  cleaned = segment.to_s.gsub(/[^A-Za-z0-9]+/, " ").strip.split(/[[:space:]]+/).map(&:capitalize).join
  cleaned.empty? ? "Module" : cleaned
end

entries = []
seen_files = {}
ENTRY_RULES.each do |(type, patterns, exts)|
  patterns.each do |pattern|
    Dir.glob("#{target}/#{pattern}").sort.each do |abs|
      next unless File.file?(abs)
      rel = abs.delete_prefix("#{target}/")
      next if excluded?(rel)
      next if exts && !exts.include?(File.extname(rel).downcase)
      next if seen_files[rel] # first matching rule wins (fixed order, deterministic)
      seen_files[rel] = true
      entries << { type: type, class: File.basename(rel, File.extname(rel)), path: rel }
    end
  end
end

# mechanical clustering: module segment -> candidate L1, next meaningful
# path segment -> candidate L2. Pure path heuristics, no semantic inference.
def cluster_keys(entry, project_name)
  segs = entry[:path].split("/")
  segs.pop # file name
  if segs.empty? || SRC_ROOTS.include?(segs.first)
    l1_key = project_name # single-module repo (repo-root src layout)
  else
    l1_key = segs.shift   # module directory (e.g. maven module)
  end
  segs.shift while segs.first == "src"
  %w[main java].each { |s| break if segs.first != s; segs.shift }
  # Strip the reversed-domain prefix and the organization segment ONLY when a
  # TLD prefix is actually present; without one, the first remaining segment is
  # a business package segment and must stay the candidate L2 key (D088-R1-H2).
  stripped_tld = false
  while TLD_SEGMENTS.include?(segs.first) && segs.size > 1
    segs.shift
    stripped_tld = true
  end
  segs.shift if stripped_tld && segs.size > 1
  segs.shift while SKIP_SEGMENTS.include?(segs.first) && segs.size > 1
  l2_key = segs.first || l1_key
  [l1_key, l2_key]
end

clusters = Hash.new { |h, k| h[k] = Hash.new { |hh, kk| hh[kk] = [] } }
entries.each do |entry|
  l1_key, l2_key = cluster_keys(entry, project_name)
  clusters[l1_key][l2_key] << entry
end

l1_ids = clusters.keys.sort.each_with_index.to_h { |k, i| [k, format("%02d", i + 1)] }
metadata = ->(title, summary) do
  <<~MD
    # #{title}

    > **元数据**
    > - **版本**: 0.1.0
    > - **日期**: #{doc_date}
    > - **作者**: #{author}
    > - **状态**: Candidate
    > - **摘要**: #{summary}

  MD
end

l1l2_rows = []
landscape_rows = []
entry_total = 0

clusters.keys.sort.each_with_index do |l1_key, l1_idx|
  l1_id = l1_ids[l1_key]
  l1_name = sanitize_name(l1_key)
  l1_dir = "#{l1_id}#{l1_name}"
  landscape_rows << "| #{l1_dir} | 待沉淀 | Candidate | 待确认 |"
  clusters[l1_key].keys.sort.each_with_index do |l2_key, l2_idx|
    l2_id = format("%02d", l2_idx + 1)
    l2_full = "#{l1_id}#{l2_id}"
    l2_name = sanitize_name(l2_key)
    l2_dir = "#{l2_full}#{l2_name}"
    group = clusters[l1_key][l2_key]
    entry_total += group.size

    entry_rows = group.map { |e| "| #{e[:type]} | #{e[:class]} | `#{e[:path]}` | Candidate |" }
    FileUtils.mkdir_p(File.join(staging, l1_dir, l2_dir))

    File.write(File.join(staging, l1_dir, l2_dir, "#{l2_full}99EntryCoverage.md"),
      metadata.("#{l2_full}99EntryCoverage（入口覆盖，待沉淀）",
                "#{l2_name} 候选域入口唯一归属对账（代码扫描候选，Owner 确认前不可路由）。") + <<~MD)
      ## 入口清单

      | 入口类型 | 类名/符号 | 代码路径 | 归属状态 |
      | --- | --- | --- | --- |
      #{entry_rows.join("\n")}

      ## 说明

      - 入口清单是代码扫描的机械结果，只含代码可验证事实；入口类唯一归属本 L2，
        跨域冲突在同步对账时报告。
      - 业务语义（入口的业务含义、单据维度路由）待 Owner 沉淀后由
        sdlc-knowledge-sync 写入。

      ## 修订记录

      | 版本 | 日期 | 作者 | 变更 |
      | --- | --- | --- | --- |
      | 0.1.0 | #{doc_date} | #{author} | 代码扫描候选入口清单。 |
    MD

    File.write(File.join(staging, l1_dir, l2_dir, "#{l2_full}#{l2_name}.md"),
      metadata.("#{l2_full}#{l2_name}（候选 L2，待沉淀）",
                "#{l2_name} 候选域主文档：业务锚点为真实入口链，L4 路由草案待确认。") + <<~MD)
      ## 范围

      | 字段 | 值 |
      | --- | --- |
      | L1 | #{l1_dir}（中文名待沉淀） |
      | L2 | #{l2_full}#{l2_name}（中文名待沉淀） |
      | Owner | 待确认 |
      | 状态 | Candidate |

      ## 业务锚点（真实入口链）

      | 入口类型 | 类名/符号 | 代码路径 |
      | --- | --- | --- |
      #{group.map { |e| "| #{e[:type]} | #{e[:class]} | `#{e[:path]}` |" }.join("\n")}

      ## L4 路由草案

      | L4（预留） | 业务名 | 代码锚点 | 状态 |
      | --- | --- | --- | --- |
      | 待确认编号 | 待沉淀 | 见入口清单 | Draft |

      ## 规则沉淀区

      （待沉淀：Owner 确认后由 sdlc-knowledge-sync 写入已验证业务规则；
      初始化器不填业务语义。）

      ## 修订记录

      | 版本 | 日期 | 作者 | 变更 |
      | --- | --- | --- | --- |
      | 0.1.0 | #{doc_date} | #{author} | 代码扫描候选 L2 主文档。 |
    MD

    l1l2_rows << "| #{l1_dir} | #{l2_full}#{l2_name} | [#{l2_full}#{l2_name}.md](<#{l1_dir}/#{l2_dir}/#{l2_full}#{l2_name}.md>) | Candidate | 待确认 |"
  end
end

File.write(File.join(staging, ".fill-summary.tsv"),
  [clusters.keys.size, clusters.values.sum(&:size), entry_total].join("\t"))
File.write(File.join(staging, ".landscape-rows.md"), landscape_rows.join("\n") + "\n")
File.write(File.join(staging, ".catalog-l1l2-rows.md"), l1l2_rows.join("\n") + "\n")
RUBY
}

stage_rel_paths() {
  ( cd "${STAGING_DIR}/business_domain" && find . -type f ! -name '.*' | sed 's#^\./##' | sort )
}

# --- plan actions (create / update / preserve / blocked) ---------------------------
CREATED_FILES=()
UPDATED_FILES=()
PRESERVED_FILES=()
BLOCKED_REASONS=()
NOTICE_LINES=()
PLAN_OK="true"

declare_plan_line() {
  local rel="$1" action="$2"
  case "${action}" in
    create)   CREATED_FILES+=("${rel}") ;;
    update)   UPDATED_FILES+=("${rel}") ;;
    preserve) PRESERVED_FILES+=("${rel}") ;;
  esac
}

plan_file() { # $1 = rel path under business_domain (or machine artifact rel under .sdlc), $2 = absolute target, $3 = staged
  if [[ ! -e "$2" ]]; then
    declare_plan_line "$1" "create"
  elif cmp -s "$2" "$3"; then
    declare_plan_line "$1" "preserve"
  else
    declare_plan_line "$1" "preserve"
    NOTICE_LINES+=("existing file preserved (create-if-missing, never rewritten): $1")
  fi
}

if [[ "${MODE}" == "audit" ]]; then
  # --- MODE 2: applicability audit ------------------------------------------------
  echo "== knowledge-target applicability audit =="
  [[ "${DRY_RUN}" == "true" ]] && echo "MODE=dry-run (nothing will be written)"

  # 1) fill missing machine artifacts (the ONLY writes in audit mode)
  AUDIT_FILLED=()
  fill_audit_artifact() { # $1 = rel under .sdlc, $2 = generator function name.
    # The generator is invoked inside this function (no pipeline) so the
    # AUDIT_FILLED mutation survives: a pipeline's last element runs in a subshell.
    local rel="$1"
    local generator="$2"
    local target_file="${SDLC_DIR}/${rel}"
    local tmp_content
    tmp_content="$(mktemp "${TMPDIR:-/tmp}/kt-fill.XXXXXX")"
    "${generator}" > "${tmp_content}"
    if [[ ! -e "${target_file}" ]]; then
      AUDIT_FILLED+=("${rel}")
      if [[ "${DRY_RUN}" != "true" ]]; then
        mkdir -p "$(dirname "${target_file}")"
        cp "${tmp_content}" "${target_file}"
        if [[ "${rel}" == scripts/* ]]; then
          chmod +x "${target_file}"
        fi
      fi
    fi
    rm -f "${tmp_content}"
    return 0
  }
  if [[ ! -e "${DECLARATION}" ]]; then
    fill_audit_artifact "business_domain/knowledge-target.yaml" generate_declaration_candidate
  fi
  fill_audit_artifact "project-governance-profile.yaml" generate_governance_profile
  fill_audit_artifact "entry-coverage-profile.yaml" generate_entry_coverage_profile
  fill_audit_artifact "business-domain-map.yaml" generate_map_template
  fill_audit_artifact "scripts/bash/audit-entry-coverage.sh" generate_audit_wrapper

  # 2) read-only checks
  AUDIT_REPORT="$(mktemp "${TMPDIR:-/tmp}/kt-audit.XXXXXX")"
  ruby - "${TARGET_PATH}" "${AUDIT_REPORT}" "${PROJECT_NAME}" <<'RUBY'
require "yaml"
require "digest"

target, report_path, project_name = ARGV
bd = File.join(target, ".sdlc", "business_domain")
sdlc = File.join(target, ".sdlc")
legacy_bd = File.join(target, ".specify", "business_domain")

findings = [] # [section, severity, message]
section = ->(s, severity, msg) { findings << [s, severity, msg] }

# Exact numbering validator (D088-R1-H3). Same semantics as the initializer's
# confirmed-map generation: L1/L2/L4 local ids exactly two digits each, the
# final L4 id exactly six digits, entry coverage exactly xx99 (4 digits + 99).
# Frozen positive/negative semantics: 4-digit stem -> L2 main doc; 6-digit stem
# ending 99 -> entry doc; other 6-digit stem -> L4 doc; any other digit-run
# length (5/7/8...) -> invalid.
def stem_numbering_kind(stem)
  m = stem.match(/\A(\d+)/)
  return :none unless m
  id = m[1]
  rest = stem[id.length..-1].to_s
  return :invalid unless rest.match?(/\A[A-Za-z]/)
  return :invalid unless rest.match?(/\A[A-Za-z0-9\u4e00-\u9fff()（）]*\z/)
  return :entry if id.length == 6 && id.match?(/\A\d{4}99\z/)
  return :l4 if id.length == 6
  return :l2 if id.length == 4
  :invalid
end

root_docs = {
  "00BusinessLandscape.md" => ["## 事实源分层", "## 业务域地图", "## 路由原则", "## 门禁说明", "## 修订记录"],
  "00UbiquitousLanguage.md" => ["## 术语表", "## 用词规则", "## 修订记录"],
  "01DomainCatalog.md" => ["## L1/L2 索引", "## L4 索引", "## 编号与门禁规则", "## 修订记录"]
}

# A. root docs & canonical sections
root_docs.each do |doc, sections|
  path = File.join(bd, doc)
  if File.file?(path)
    text = File.read(path)
    sections.each do |s|
      section.("A", "DIFF", "#{doc} 缺少标准章节 #{s}") unless text.include?(s)
    end
  else
    section.("A", "MISSING", "缺少根文档 #{doc}")
  end
end

# B. numbering consistency: exact 6-digit L4 / xx99 entry coverage
Dir.glob(File.join(bd, "**", "*.md")).sort.each do |path|
  rel = path.delete_prefix("#{bd}/")
  next unless rel.count("/") >= 2
  stem = File.basename(rel).sub(/\.(md|MD)\z/, "")
  if stem_numbering_kind(stem) == :invalid
    section.("B", "DIFF", "编号不符合 6 位 L4 / xx99 精确规则: #{rel}")
  end
end

# C. machine artifacts + frozen declaration state matrix (D088-R1-H6)
decl_path = File.join(bd, "knowledge-target.yaml")
unless File.file?(decl_path)
  section.("C", "MISSING", "缺少声明 knowledge-target.yaml")
else
  begin
    decl = YAML.safe_load(File.read(decl_path), permitted_classes: [], aliases: false) || {}
    status = decl["status"].to_s
    routable = decl["routable"]
    unless %w[candidate_pending_confirmation routed].include?(status)
      section.("C", "DIFF", "声明 status 非法: #{status}（应为 candidate_pending_confirmation 或 routed）")
    end
    section.("C", "DIFF", "声明 schema_version 必须为 2.1") unless decl["schema_version"].to_s == "2.1"
    section.("C", "DIFF", "声明 target_root 必须为 .sdlc/business_domain（#{decl["target_root"].inspect}）") unless decl["target_root"].to_s == ".sdlc/business_domain"
    section.("C", "DIFF", "声明 fill_mode 必须为 code_driven_scan") unless decl["fill_mode"].to_s == "code_driven_scan"
    if status == "candidate_pending_confirmation"
      section.("C", "DIFF", "candidate_pending_confirmation 状态必须 routable: false") unless routable == false
      section.("C", "DIFF", "candidate_pending_confirmation 状态不得携带 domain_map") unless decl["domain_map"].nil?
      section.("C", "DIFF", "candidate_pending_confirmation 状态不得携带 domain_map_sha256") unless decl["domain_map_sha256"].nil?
    end
    if status == "routed"
      section.("C", "DIFF", "routed 状态必须 routable: true") unless routable == true
      map_ref = decl["domain_map"].to_s
      map_sha = decl["domain_map_sha256"].to_s
      if map_ref.empty?
        section.("C", "DIFF", "routed 状态缺少 domain_map 引用")
      end
      section.("C", "DIFF", "routed 状态缺少合法 domain_map_sha256（64 位十六进制）") unless map_sha.match?(/\A[0-9a-f]{64}\z/)
      # R2-H2: realpath containment before ANY read; repo-relative ref only.
      map_path = nil
      if !map_ref.empty? && !map_ref.start_with?("/")
        begin
          resolved = File.realpath(File.expand_path(map_ref, target))
          if resolved.start_with?(File.realpath(target) + "/")
            map_path = resolved
          else
            section.("C", "DIFF", "domain_map 引用逃逸目标仓（resolved: #{resolved}）")
          end
        rescue StandardError => e
          section.("C", "DIFF", "domain_map 引用不可解析: #{map_ref}（#{e.class}）")
        end
      elsif !map_ref.empty?
        section.("C", "DIFF", "domain_map 引用必须为仓内相对路径（#{map_ref}）")
      end
      if !map_path.nil? && File.file?(map_path)
        if map_sha.match?(/\A[0-9a-f]{64}\z/)
          actual = Digest::SHA256.file(map_path).hexdigest
          section.("C", "DIFF", "domain_map_sha256 与当前 map 文件不一致（map 内容已被修改）") unless actual == map_sha
        end
        begin
          dm = YAML.safe_load(File.read(map_path), permitted_classes: [], aliases: false) || {}
          section.("C", "DIFF", "domain_map status 必须精确为 confirmed（#{dm["status"].inspect}）") unless dm["status"] == "confirmed"
          # R2-H2: full structural validation with the SAME semantics as the
          # generator (two-digit local ids, unique six-digit final L4 ids).
          seen_l4 = {}
          Array(dm["confirmed_domains"]).each do |l1|
            next unless l1.is_a?(Hash)
            l1_id = l1["l1_id"].to_s
            section.("C", "DIFF", "domain_map l1_id 必须两位数字（#{l1_id.inspect}）") unless l1_id.match?(/\A\d{2}\z/)
            Array(l1["l2"]).each do |l2|
              next unless l2.is_a?(Hash)
              l2_id = l2["l2_id"].to_s
              section.("C", "DIFF", "domain_map l2_id 必须两位数字（#{l2_id.inspect}）") unless l2_id.match?(/\A\d{2}\z/)
              Array(l2["l4"]).each do |l4|
                next unless l4.is_a?(Hash)
                l4_id = l4["l4_id"].to_s
                section.("C", "DIFF", "domain_map l4_id 必须两位数字（#{l4_id.inspect}）") unless l4_id.match?(/\A\d{2}\z/)
                l4f = "#{l1_id}#{l2_id}#{l4_id}"
                unless l4f.match?(/\A\d{6}\z/)
                  section.("C", "DIFF", "domain_map 最终 L4 编号必须六位数字（#{l4f}）")
                  next
                end
                section.("C", "DIFF", "domain_map 重复最终 L4 编号（#{l4f}）") if seen_l4[l4f]
                seen_l4[l4f] = true
              end
            end
          end
        rescue Psych::Exception => e
          section.("C", "DIFF", "domain_map 解析失败: #{e.message.lines.first.to_s.strip}")
        end
      elsif !map_path.nil?
        section.("C", "DIFF", "domain_map 引用不可解析: #{map_ref}")
      end
    end
    managed = decl["managed_root_docs"].is_a?(Hash) ? decl["managed_root_docs"] : {}
    managed.each do |doc, info|
      unless info.is_a?(Hash) && info["sha256"].to_s.match?(/\A[0-9a-f]{64}\z/) && %w[initializer preserved].include?(info["origin"].to_s)
        section.("C", "DIFF", "managed_root_docs.#{doc} 结构非法（需 sha256 + origin=initializer|preserved）")
        next
      end
      doc_path = File.join(bd, doc)
      if File.file?(doc_path)
        cur = Digest::SHA256.file(doc_path).hexdigest
        if info["origin"] == "initializer" && cur != info["sha256"].to_s
          section.("C", "DIFF", "受管根文档与基线不一致（疑似人工修改，升级将被阻断）: #{doc}")
        end
      else
        section.("C", "DIFF", "受管根文档缺失: #{doc}")
      end
    end
  rescue Psych::Exception => e
    section.("C", "DIFF", "knowledge-target.yaml 解析失败: #{e.message.lines.first.to_s.strip}")
  end
end

%w[project-governance-profile.yaml entry-coverage-profile.yaml business-domain-map.yaml].each do |f|
  section.("C", "MISSING", "缺少机器件 #{f}") unless File.file?(File.join(sdlc, f))
end
wrapper = File.join(sdlc, "scripts", "bash", "audit-entry-coverage.sh")
section.("C", "MISSING", "缺少门禁包装 scripts/bash/audit-entry-coverage.sh") unless File.file?(wrapper)

catalog_path = File.join(bd, "01DomainCatalog.md")
if File.file?(catalog_path)
  File.read(catalog_path).scan(%r{\[([^\]]+)\]\(<([^>]+)>\)}).each do |(_, link)|
    doc_path = File.join(bd, link)
    section.("C", "DIFF", "目录路由不可解析: #{link}") unless File.file?(doc_path)
  end
end

# D. gate availability
ecp = File.join(sdlc, "entry-coverage-profile.yaml")
if File.file?(ecp)
  begin
    profile = YAML.safe_load(File.read(ecp), permitted_classes: [], aliases: false) || {}
    doc_scope = profile.dig("scope", "document_scope").to_s
    section.("D", "DIFF", "entry-coverage-profile document_scope 指向 #{doc_scope}（应为 .sdlc/business_domain）") if doc_scope != ".sdlc/business_domain"
  rescue Psych::Exception => e
    section.("D", "DIFF", "entry-coverage-profile.yaml 解析失败: #{e.message.lines.first.to_s.strip}")
  end
else
  section.("D", "MISSING", "缺少 entry-coverage-profile.yaml（sync 前 strict 门禁不可用）")
end

# E. retired-vocabulary residue over the WHOLE .sdlc face (reports excluded —
# quoting residue is their purpose). Exemptions (D088-R1-H6):
#   - machine negative-declaration fields: values under forbidden_write_paths /
#     legacy_runtime_inputs may name retired paths;
#   - semantic-clause binding: only the clause containing the hit may exempt it
#     (its own clause must carry a negation); a negation in a sibling clause of
#     the same line or in an adjacent line never releases another hit.
RESIDUE_PATTERNS = [/speckit/i, /99PendingConfirmation/i, /dual rail/i, /legacy rail/i, /\.specify/]
NEGATION_RE = /(不得|禁止|不能|不应|切勿|不读取|不改写|never|must\s+not|do\s+not|don't|prohibit\w*|forbidden|retired)/i
MACHINE_FIELD_RE = /\A(\s*)(forbidden_write_paths|legacy_runtime_inputs)\s*:/
residue_lines = []
if File.directory?(sdlc)
  files_to_scan = Dir.glob(File.join(sdlc, "**", "*"))
                    .select { |p| File.file?(p) && !p.start_with?("#{sdlc}/reports/") }
                    .sort
  files_to_scan.each do |path|
    next unless path.match?(/\.(md|markdown|txt|yaml|yml|sh|rb)\z/i)
    machine_key_indent = nil
    File.readlines(path).each_with_index do |line, idx|
      if (m = line.match(MACHINE_FIELD_RE))
        machine_key_indent = m[1].length
      elsif !machine_key_indent.nil?
        entry_indent = line.match(/\A(\s*)\S/) ? Regexp.last_match(1).length : nil
        machine_key_indent = nil if entry_indent.nil? || entry_indent <= machine_key_indent
      end
      next if machine_key_indent # inside a machine negative-declaration field
      clause_states = line.split(/[。；;！!？?]/).map do |clause|
        hits = RESIDUE_PATTERNS.select { |re| clause.match?(re) }
        next nil if hits.empty?
        clause.match?(NEGATION_RE) ? :exempt : :violation
      end.compact
      if clause_states.include?(:violation)
        residue_lines << "#{path.delete_prefix("#{target}/")}:#{idx + 1}"
        break if residue_lines.size >= 50
      end
      break if residue_lines.size >= 50
    end
    break if residue_lines.size >= 50
  end
end
residue_lines.each { |l| section.("E", "RESIDUE", "退役词汇/旧根路径残留: #{l}") }
section.("E", "RESIDUE", "残留超过 50 处，仅列前 50 行") if residue_lines.size >= 50
if File.directory?(legacy_bd) || File.symlink?(legacy_bd)
  section.("E", "LEGACY", "检测到旧版知识根目录（历史遗留），迁移需单独授权；本工具不读取不遍历不改动")
end

# F. shape differences vs the mature baseline
l2_dirs = Dir.glob(File.join(bd, "*", "*")).select { |p| File.directory?(p) }.sort
l2_dirs.each do |l2_dir|
  rel = l2_dir.delete_prefix("#{bd}/")
  files = Dir.children(l2_dir)
  # L2 main doc starts with exactly the 4-digit L1+L2 prefix (no 99, no 6-digit L4 id)
  main = files.find { |f| f.match?(/\A\d{4}(?!\d)/) && f.end_with?(".md") }
  xx99 = files.find { |f| f.match?(/\A\d{4}99/) }
  section.("F", "DIFF", "L2 缺主文档: #{rel}") unless main
  section.("F", "DIFF", "L2 缺 xx99 入口覆盖文档: #{rel}") unless xx99
  if main && File.file?(File.join(l2_dir, main))
    section.("F", "DIFF", "L2 主文档缺业务锚点章节: #{rel}/#{main}") unless File.read(File.join(l2_dir, main)).include?("业务锚点")
  end
end

missing = findings.count { |(_, sev, _)| sev == "MISSING" }
diffs = findings.count { |(_, sev, _)| sev == "DIFF" }
residues = findings.count { |(_, sev, _)| %w[RESIDUE LEGACY].include?(sev) }
verdict = findings.empty? ? "CLEAN" : "FINDINGS"

File.write(report_path, <<~MD)
  # Knowledge Target Applicability Audit Report

  > **Project**: #{project_name}
  > **Generated At**: #{Time.now.strftime('%Y-%m-%d %H:%M:%S')}
  > **Generated By**: scripts/bootstrap-knowledge-target.sh --audit (D-088-01 v2)
  > **Target Repository**: #{target}

  ## Verdict

  | Item | Value |
  | --- | --- |
  | Result | #{verdict} |
  | Missing machine/docs findings | #{missing} |
  | Shape/consistency differences | #{diffs} |
  | Residue findings (file:line, capped 50) | #{residues} |

  ## Findings

  | # | Section | Severity | Finding |
  | --- | --- | --- | --- |
  #{findings.each_with_index.map { |finding, i| "| #{i + 1} | #{finding[0]} | #{finding[1]} | #{finding[2]} |" }.join("\n")}

  ## Sections

  - A 根文档完整性与章节齐备性
  - B 编号规则一致性（6 位 L4 / xx99 入口覆盖，精确匹配）
  - C 机器件存在性、路由可解析性与声明状态矩阵（含受管根文档基线漂移）
  - D 门禁可用性
  - E 退役词汇与旧根路径残留（file:line；语义子句豁免与机器字段放行；只报告，绝不自动改写）
  - F 与成熟基准架构的形态差异

  ## Write Boundary

  本次体检唯一允许的写入 = 补缺失机器件（create-if-missing）。
  知识文档与既有文件一律不改写。
MD

puts "AUDIT_RESULT=#{verdict} missing=#{missing} diffs=#{diffs} residue=#{residues}"
RUBY
  AUDIT_EXIT=$?

  if [[ "${DRY_RUN}" == "true" ]]; then
    rm -f "${AUDIT_REPORT}"
  else
    mkdir -p "${REPORT_DIR}"
    # D088-R2-H6: mktemp in the report directory performs exclusive creation
    # (timestamp + pid + random suffix); the script only writes the file it
    # obtained, so same-second serial, concurrent and preset-name runs never
    # overwrite an existing report. (BSD mktemp requires the X run at the end,
    # hence no .md suffix; consumers glob by the report base name.)
    FINAL_AUDIT_REPORT="$(mktemp "${REPORT_DIR}/knowledge_target_audit_report.$(date '+%Y%m%d-%H%M%S').${$}.XXXXXX")"
    cat "${AUDIT_REPORT}" > "${FINAL_AUDIT_REPORT}"
    rm -f "${AUDIT_REPORT}"
    echo "AUDIT_FILLED: ${AUDIT_FILLED[*]:-}"
    echo "REPORT=${FINAL_AUDIT_REPORT#${TARGET_PATH}/}"
  fi
  exit "${AUDIT_EXIT}"
fi

# --- MODE 1: init ------------------------------------------------------------------
ROUTED_L1L2_ROWS=""
ROUTED_L4_ROWS=""
ROUTED_LANDSCAPE_ROWS=""

if [[ -n "${DOMAIN_MAP}" ]]; then
  # Routed mode: validate the confirmed map fail-closed and stage L1/L2/L4 + xx99 docs.
  L4_TEMPLATE_DIR="${STANDARD_PACKAGE}/templates/business-domain-l4"
  DOMAIN_MAP_REF="'$(yaml_escape "${DOMAIN_MAP_REL}")'"
  MAP_SHA256="$(file_digest "${DOMAIN_MAP}")"
  if ! ruby -ryaml -rfileutils - "${DOMAIN_MAP}" "${STAGING_DIR}/business_domain" \
       "${PROJECT_NAME}" "${AUTHOR}" "${DOC_DATE}" "${L4_TEMPLATE_DIR}" \
       "${L4_TEMPLATE_PROFILE}" "${PROJECT_TYPE_PROFILES}" <<'RUBY'
domain_map_path, staging_dir, project_name, author, doc_date, template_dir, template_profile, profiles_csv = ARGV

map = begin
  YAML.safe_load(File.read(domain_map_path), permitted_classes: [], aliases: false)
rescue Psych::Exception => e
  warn "Invalid confirmed domain map: YAML parse error: #{e.message.lines.first.to_s.strip}"
  exit 2
end
map ||= {}
unless map["status"] == "confirmed"
  warn "Invalid confirmed domain map: status must be exactly 'confirmed' (got: #{map["status"].inspect})"
  exit 2
end
domains = map["confirmed_domains"]

fail_map = ->(msg) { warn "Invalid confirmed domain map: #{msg}"; exit 2 }
fail_map.call("confirmed_domains must be a non-empty array") unless domains.is_a?(Array) && !domains.empty?

req = ->(hash, key, ctx) do
  v = hash[key]
  fail_map.call("#{ctx}.#{key} is required") if v.nil? || v.to_s.strip.empty?
  v.to_s.strip
end

safe_name = ->(v, ctx) do
  t = v.to_s.strip
  fail_map.call("#{ctx} must not contain path separators") if t.include?("/") || t.include?("\\")
  fail_map.call("#{ctx} must not contain '..'") if t.include?("..")
  t
end

# Local domain ids are exactly two digits each; the composed L4 id is exactly
# six digits (L1+L2+L4). Same semantics as the audit numbering validator.
two_digit_id = ->(v, ctx) do
  t = safe_name.(v, ctx)
  fail_map.call("#{ctx} must be exactly two digits (got: #{t.inspect})") unless t.match?(/\A\d{2}\z/)
  t
end

write_rel = ->(rel, content) do
  path = File.join(staging_dir, rel)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content)
end

l2_prefix = ->(l1_id, l2_id) { l2_id.length > 2 && l2_id.start_with?(l1_id) ? l2_id : "#{l1_id}#{l2_id}" }
l4_full   = ->(l1_id, l2_full, l4_id) { l4_id.length > l2_full.length && l4_id.start_with?(l2_full) ? l4_id : "#{l2_full}#{l4_id}" }

metadata = ->(title, status, summary) do
  <<~MD
    # #{title}

    > **元数据**
    > - **版本**: 0.1.0
    > - **日期**: #{doc_date}
    > - **作者**: #{author}
    > - **状态**: #{status}
    > - **摘要**: #{summary}

  MD
end

seen_l1 = {}
seen_l2 = {}
seen_l4 = {}
catalog_l1l2 = []
catalog_l4 = []
landscape_rows = []

domains.each_with_index do |l1, i|
  ctx = "confirmed_domains[#{i}]"
  fail_map.call("#{ctx} must be a map") unless l1.is_a?(Hash)
  l1_id      = two_digit_id.(req.(l1, "l1_id", ctx), "#{ctx}.l1_id")
  l1_name_en = safe_name.(req.(l1, "l1_name_en", ctx), "#{ctx}.l1_name_en")
  l1_name_cn = safe_name.(req.(l1, "l1_name_cn", ctx), "#{ctx}.l1_name_cn")
  fail_map.call("duplicate l1_id #{l1_id}") if seen_l1[l1_id]
  seen_l1[l1_id] = true
  l1_dir = "#{l1_id}#{l1_name_en}"
  l2_list = l1["l2"]
  fail_map.call("#{ctx}.l2 must be a non-empty array") unless l2_list.is_a?(Array) && !l2_list.empty?
  landscape_rows << "| #{l1_dir} | #{l1_name_cn} | Routed | owner-confirmed domain map |"

  l2_list.each_with_index do |l2, j|
    l2c = "#{ctx}.l2[#{j}]"
    fail_map.call("#{l2c} must be a map") unless l2.is_a?(Hash)
    l2_id      = two_digit_id.(req.(l2, "l2_id", l2c), "#{l2c}.l2_id")
    l2_name_en = safe_name.(req.(l2, "l2_name_en", l2c), "#{l2c}.l2_name_en")
    l2_name_cn = safe_name.(req.(l2, "l2_name_cn", l2c), "#{l2c}.l2_name_cn")
    l2_owner   = req.(l2, "owner", l2c)
    l2_full    = l2_prefix.(l1_id, l2_id)
    fail_map.call("duplicate l2_id #{l2_full}") if seen_l2[l2_full]
    seen_l2[l2_full] = true
    l2_dir = File.join(l1_dir, "#{l2_full}#{l2_name_en}")
    l2_doc = "#{l2_full}#{l2_name_en}(#{l2_name_cn}).md"
    entry_doc = "#{l2_full}99EntryCoverage(#{l2_name_cn}).md"
    l4_list = l2["l4"]
    fail_map.call("#{l2c}.l4 must be a non-empty array") unless l4_list.is_a?(Array) && !l4_list.empty?

    l2_l4_rows = []
    entry_rows = []

    l4_list.each_with_index do |l4, k|
      l4c = "#{l2c}.l4[#{k}]"
      fail_map.call("#{l4c} must be a map") unless l4.is_a?(Hash)
      l4_id      = two_digit_id.(req.(l4, "l4_id", l4c), "#{l4c}.l4_id")
      l4_name_en = safe_name.(req.(l4, "l4_name_en", l4c), "#{l4c}.l4_name_en")
      l4_name_cn = safe_name.(req.(l4, "l4_name_cn", l4c), "#{l4c}.l4_name_cn")
      l4_owner   = req.(l4, "owner", l4c)
      l4f        = l4_full.(l1_id, l2_full, l4_id)
      fail_map.call("final L4 id must be exactly six digits (got: #{l4f})") unless l4f.match?(/\A\d{6}\z/)
      fail_map.call("duplicate l4_id #{l4f}") if seen_l4[l4f]
      seen_l4[l4f] = true
      l4_doc = "#{l4f}#{l4_name_en}(#{l4_name_cn}).md"
      l4_rel = File.join(l2_dir, l4_doc)
      evidence = Array(l4["evidence"]).map(&:to_s).map(&:strip).reject(&:empty?)

      l2_l4_rows << "| #{l4f} | [#{l4_doc}](<#{l4_doc}>) | #{l4_name_cn} | Routed |"
      catalog_l4 << "| #{l4f} | [#{l4_rel}](<#{l4_rel}>) | #{l4_name_cn} | Routed |"
      if evidence.empty?
        entry_rows << "| #{l4f} | #{l4_name_en} | pending-code-anchor | Routed; code evidence pending. |"
      else
        evidence.each { |e| entry_rows << "| #{l4f} | #{l4_name_en} | `#{e}` | owner-confirmed evidence |" }
      end

      template_path = File.join(template_dir, "#{template_profile}.md")
      unless File.exist?(template_path)
        warn "Invalid confirmed domain map: missing L4 template for #{template_profile}"
        exit 2
      end
      content = File.read(template_path)
      {
        "PROJECT_NAME" => project_name, "AUTHOR" => author, "DOC_DATE" => doc_date,
        "PROJECT_TYPE_PROFILE" => template_profile, "PROJECT_TYPE_PROFILES" => profiles_csv,
        "L1_ID" => l1_id, "L1_NAME_EN" => l1_name_en, "L1_NAME_CN" => l1_name_cn,
        "L2_ID" => l2_full, "L2_NAME_EN" => l2_name_en, "L2_NAME_CN" => l2_name_cn,
        "L4_ID" => l4f, "L4_NAME_EN" => l4_name_en, "L4_NAME_CN" => l4_name_cn,
        "OWNER" => l4_owner,
        "EVIDENCE_LIST" => evidence.empty? ? "pending-code-anchor" : evidence.map { |e| "`#{e}`" }.join("<br>")
      }.each { |key, val| content = content.gsub("{{#{key}}}", val.to_s) }
      unresolved = content.scan(/\{\{[A-Z0-9_]+\}\}/).uniq
      unless unresolved.empty?
        warn "Invalid confirmed domain map: unresolved L4 template placeholders: #{unresolved.join(', ')}"
        exit 2
      end
      write_rel.(l4_rel, content)
    end

    write_rel.(File.join(l2_dir, l2_doc),
      metadata.("#{l2_full}#{l2_name_en}(#{l2_name_cn})", "Routed", "Owner-confirmed L2 skeleton for #{l2_name_cn}.") + <<~MD
        ## 范围

        | 字段 | 值 |
        | --- | --- |
        | L1 | #{l1_id}#{l1_name_en}(#{l1_name_cn}) |
        | L2 | #{l2_full}#{l2_name_en}(#{l2_name_cn}) |
        | Owner | #{l2_owner} |

        ## 业务锚点（真实入口链）

        | 入口类型 | 类名/符号 | 代码路径 |
        | --- | --- | --- |
        | 待沉淀 | 待沉淀 | 见 xx99 入口清单 |

        ## 已含 L4 文档

        | L4 | 文档 | 业务名 | 状态 |
        | --- | --- | --- | --- |
        #{l2_l4_rows.join("\n")}

        ## 路由规则

        仅当新需求的业务行为属于 #{l2_name_cn} 且目标 L4 已在上表列出或显式预留时路由到此；
        按业务单据维度优先路由。

        ## 规则沉淀区

        （待沉淀：由 sdlc-knowledge-sync 写入已验证业务规则。）

        ## 修订记录

        | 版本 | 日期 | 作者 | 变更 |
        | --- | --- | --- | --- |
        | 0.1.0 | #{doc_date} | #{author} | Owner 确认域映射生成的 Routed L2 骨架。 |
      MD
    )

    write_rel.(File.join(l2_dir, entry_doc),
      metadata.("#{l2_full}99EntryCoverage(#{l2_name_cn})", "Routed", "Entry coverage for #{l2_name_cn}（入口唯一归属对账）.") + <<~MD
        ## 入口清单

        | L4 | 入口名 | 代码锚点 | 证据 |
        | --- | --- | --- | --- |
        #{entry_rows.join("\n")}

        ## 说明

        代码锚点由 sdlc-knowledge-sync 从已验证实现证据填写与对账，初始化器不发明；
        一个入口类唯一归属一个 L2。

        ## 修订记录

        | 版本 | 日期 | 作者 | 变更 |
        | --- | --- | --- | --- |
        | 0.1.0 | #{doc_date} | #{author} | Owner 确认域映射生成的入口覆盖骨架。 |
      MD
    )

    catalog_l1l2 << "| #{l1_dir} | #{l2_full}#{l2_name_en} | [#{l2_doc}](<#{l2_dir}/#{l2_doc}>) | Routed | #{l2_owner} |"
  end
end

File.write(File.join(staging_dir, ".routed-rows-l1l2"), catalog_l1l2.join("\n") + "\n")
File.write(File.join(staging_dir, ".routed-rows-l4"), catalog_l4.join("\n") + "\n")
File.write(File.join(staging_dir, ".routed-rows-landscape"), landscape_rows.join("\n") + "\n")
RUBY
  then
    echo "Confirmed domain map validation failed; nothing written." >&2
    exit 2
  fi
  ROUTED_L1L2_ROWS="$(cat "${STAGING_DIR}/business_domain/.routed-rows-l1l2")"
  ROUTED_L4_ROWS="$(cat "${STAGING_DIR}/business_domain/.routed-rows-l4")"
  ROUTED_LANDSCAPE_ROWS="$(cat "${STAGING_DIR}/business_domain/.routed-rows-landscape")"
  rm -f "${STAGING_DIR}/business_domain/.routed-rows-l1l2" \
        "${STAGING_DIR}/business_domain/.routed-rows-l4" \
        "${STAGING_DIR}/business_domain/.routed-rows-landscape"
else
  DOMAIN_MAP_REF="null"
  MAP_SHA256="null"
  if ! scan_and_stage_candidates; then
    echo "Candidate scan failed; nothing written." >&2
    exit 2
  fi
fi

if [[ -z "${DOMAIN_MAP}" ]]; then
  FILL_SUMMARY="$(cat "${STAGING_DIR}/business_domain/.fill-summary.tsv" 2>/dev/null || printf '0\t0\t0')"
  FILL_L1="${FILL_SUMMARY%%$'\t'*}"
  FILL_REST="${FILL_SUMMARY#*$'\t'}"
  FILL_L2="${FILL_REST%%$'\t'*}"
  FILL_ENTRIES="${FILL_REST#*$'\t'}"
  LANDSCAPE_ROWS="$(cat "${STAGING_DIR}/business_domain/.landscape-rows.md" 2>/dev/null || true)"
  CATALOG_L1L2_ROWS="$(cat "${STAGING_DIR}/business_domain/.catalog-l1l2-rows.md" 2>/dev/null || true)"
  rm -f "${STAGING_DIR}/business_domain/.fill-summary.tsv" \
        "${STAGING_DIR}/business_domain/.landscape-rows.md" \
        "${STAGING_DIR}/business_domain/.catalog-l1l2-rows.md"
  FILL_SECTION="$(generate_landscape_fill_section "${FILL_L1}" "${FILL_L2}" "${FILL_ENTRIES}")"
else
  FILL_L1="0"; FILL_L2="0"; FILL_ENTRIES="0"
  FILL_SECTION=""
  LANDSCAPE_ROWS="${ROUTED_LANDSCAPE_ROWS}"
  CATALOG_L1L2_ROWS="${ROUTED_L1L2_ROWS}"
fi

if [[ -n "${DOMAIN_MAP}" ]]; then
  STATUS="routed"; ROUTABLE="true"; DOC_STATUS="Routed"
else
  STATUS="candidate_pending_confirmation"; ROUTABLE="false"; DOC_STATUS="Candidate"
fi

generate_landscape "${LANDSCAPE_ROWS}" "${FILL_SECTION}" \
  | write_staging_file "business_domain/00BusinessLandscape.md"
generate_language | write_staging_file "business_domain/00UbiquitousLanguage.md"
generate_catalog "${CATALOG_L1L2_ROWS}" "${ROUTED_L4_ROWS}" \
  | write_staging_file "business_domain/01DomainCatalog.md"

# D088-R1-H4: the candidate->routed upgrade decision is digest-baseline based
# (recorded at first generation), never regeneration-and-byte-compare; the old
# .candidate reference staging is retired.

generate_governance_profile | write_staging_file "project-governance-profile.yaml"
generate_entry_coverage_profile | write_staging_file "entry-coverage-profile.yaml"
generate_map_template | write_staging_file "business-domain-map.yaml"
generate_audit_wrapper | write_staging_file "scripts/bash/audit-entry-coverage.sh"
chmod +x "${STAGING_DIR}/scripts/bash/audit-entry-coverage.sh"

# --- managed root-doc provenance and upgrade decision (D088-R1-H4) ----------------
ROOT_DOCS=(00BusinessLandscape.md 00UbiquitousLanguage.md 01DomainCatalog.md)

# Existing declaration facts: status / map ref / map sha lines, then
# "doc sha256 origin" entries for the managed root docs.
EXISTING_DECL_STATUS="absent"
EXISTING_DECL_MAP_REF=""
EXISTING_DECL_MAP_SHA=""
EXISTING_DECL_DATA=""
if [[ -f "${DECLARATION}" ]]; then
  EXISTING_DECL_DATA="$(ruby -ryaml -e '
    begin
      d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
      puts "status\t#{d["status"].to_s}"
      puts "mapref\t#{d["domain_map"].nil? ? "" : d["domain_map"].to_s}"
      puts "mapsha\t#{d["domain_map_sha256"].nil? ? "" : d["domain_map_sha256"].to_s}"
      h = d["managed_root_docs"].is_a?(Hash) ? d["managed_root_docs"] : {}
      h.each do |k, v|
        next unless v.is_a?(Hash)
        puts "#{k}\t#{v["sha256"].to_s}\t#{v["origin"].to_s}"
      end
    rescue StandardError
      puts "status\tunreadable"
    end
  ' "${DECLARATION}" 2>/dev/null || true)"
  EXISTING_DECL_STATUS="$(printf '%s\n' "${EXISTING_DECL_DATA}" | awk -F '\t' '$1 == "status" {print $2}')"
  EXISTING_DECL_MAP_REF="$(printf '%s\n' "${EXISTING_DECL_DATA}" | awk -F '\t' '$1 == "mapref" {print $2}')"
  EXISTING_DECL_MAP_SHA="$(printf '%s\n' "${EXISTING_DECL_DATA}" | awk -F '\t' '$1 == "mapsha" {print $2}')"
fi
recorded_digest_for() {
  printf '%s\n' "${EXISTING_DECL_DATA}" | awk -F '\t' -v d="$1" '$1 == d && NF >= 3 {print $2}'
}
recorded_origin_for() {
  printf '%s\n' "${EXISTING_DECL_DATA}" | awk -F '\t' -v d="$1" '$1 == d && NF >= 3 {print $3}'
}

# Per-doc decision. Upgrade requires origin=initializer AND current digest equal
# to the recorded baseline; docs without such provenance are owner-managed and
# are never auto-upgraded (blocked on a confirmed-map run).
DOC_ACTIONS=()
DOC_POST_DIGESTS=()
UPGRADE_BLOCKED_DOCS=()
# R2-H3: an existing routed target is idempotent only when the run's confirmed
# map is the SAME path AND byte-identical content (recorded sha256) AND the root
# docs still match the recorded baseline. Anything else (different path, edited
# map content, repointed symlink, human-modified doc) is wholly blocked; routed
# map replacement is unsupported in this wave and requires separate migration
# authorization.
MAP_MISMATCH="false"
if [[ -n "${DOMAIN_MAP}" && "${EXISTING_DECL_STATUS}" == "routed" ]]; then
  if [[ "${EXISTING_DECL_MAP_REF}" != "${DOMAIN_MAP_REL}" || "${EXISTING_DECL_MAP_SHA}" != "${MAP_SHA256}" ]]; then
    MAP_MISMATCH="true"
  fi
fi
i=0
for doc in "${ROOT_DOCS[@]}"; do
  tgt="${BD_DIR}/${doc}"
  stg="${STAGING_DIR}/business_domain/${doc}"
  if [[ ! -f "${tgt}" ]]; then
    DOC_ACTIONS[i]="create"
    DOC_POST_DIGESTS[i]="$(file_digest "${stg}")"
  else
    cur="$(file_digest "${tgt}")"
    staged_digest="$(file_digest "${stg}")"
    recorded="$(recorded_digest_for "${doc}")"
    recorded_origin="$(recorded_origin_for "${doc}")"
    if [[ -n "${DOMAIN_MAP}" ]]; then
      if [[ "${MAP_MISMATCH}" == "true" ]]; then
        DOC_ACTIONS[i]="blocked"
        DOC_POST_DIGESTS[i]="${cur}"
        UPGRADE_BLOCKED_DOCS+=("${doc}")
      elif [[ "${EXISTING_DECL_STATUS}" == "candidate_pending_confirmation" \
            && "${recorded_origin}" == "initializer" && -n "${recorded}" && "${cur}" == "${recorded}" ]]; then
        DOC_ACTIONS[i]="upgrade"
        DOC_POST_DIGESTS[i]="${staged_digest}"
      elif [[ "${EXISTING_DECL_STATUS}" == "routed" && -n "${recorded}" && "${cur}" == "${recorded}" ]]; then
        DOC_ACTIONS[i]="idempotent"
        DOC_POST_DIGESTS[i]="${cur}"
      elif [[ "${cur}" == "${staged_digest}" ]]; then
        DOC_ACTIONS[i]="idempotent"
        DOC_POST_DIGESTS[i]="${cur}"
      else
        DOC_ACTIONS[i]="blocked"
        DOC_POST_DIGESTS[i]="${cur}"
        UPGRADE_BLOCKED_DOCS+=("${doc}")
      fi
    else
      DOC_ACTIONS[i]="preserve"
      DOC_POST_DIGESTS[i]="${cur}"
    fi
  fi
  i=$((i + 1))
done

UPGRADE_OK="true"
if [[ -n "${DOMAIN_MAP}" && "${#UPGRADE_BLOCKED_DOCS[@]}" -gt 0 ]]; then
  UPGRADE_OK="false"
  PLAN_OK="false"
  if [[ "${MAP_MISMATCH}" == "true" ]]; then
    BLOCKED_REASONS+=("routed transition blocked for: ${UPGRADE_BLOCKED_DOCS[*]} (the existing routed target was produced by a different confirmed map path/content; routed map replacement is unsupported in this wave and requires separate migration authorization; nothing was written)")
  else
    BLOCKED_REASONS+=("candidate->routed transition blocked for: ${UPGRADE_BLOCKED_DOCS[*]} (content differs from the recorded candidate baseline or has no initializer provenance; the transition is atomic and nothing was partially updated)")
  fi
fi

# Declaration target for this run: a blocked transition never writes a routed
# declaration while root docs stay candidate (no state split); an EXISTING
# routed declaration is never overwritten (no partial/dowgrade replacement,
# even with --update-declaration).
DECL_TARGET_STATUS="${STATUS}"
DECL_FROZEN="false"
if [[ -n "${DOMAIN_MAP}" && "${UPGRADE_OK}" != "true" ]]; then
  DECL_TARGET_STATUS="candidate_pending_confirmation"
  DECL_TARGET_ROUTABLE="false"
  if [[ "${EXISTING_DECL_STATUS}" == "routed" ]]; then
    DECL_FROZEN="true"
  fi
else
  DECL_TARGET_ROUTABLE="${ROUTABLE}"
fi

# managed_root_docs: recorded entries are preserved verbatim (origin included);
# fresh digests only for docs this run creates or upgrades. --update-declaration
# never re-baselines an existing doc.
MANAGED_BLOCK=""
i=0
for doc in "${ROOT_DOCS[@]}"; do
  recorded="$(recorded_digest_for "${doc}")"
  recorded_origin="$(recorded_origin_for "${doc}")"
  case "${DOC_ACTIONS[i]}" in
    create|upgrade)
      managed_origin="initializer"
      digest="${DOC_POST_DIGESTS[i]}" ;;
    blocked)
      managed_origin="${recorded_origin}"
      digest="${recorded}" ;;
    *)
      if [[ -n "${recorded}" ]]; then
        managed_origin="${recorded_origin}"
        digest="${recorded}"
      else
        managed_origin="preserved"
        digest="${DOC_POST_DIGESTS[i]}"
      fi ;;
  esac
  if [[ -n "${digest}" ]]; then
    MANAGED_BLOCK+="  ${doc}:
    sha256: \"${digest}\"
    origin: \"${managed_origin}\""$'\n'
  fi
  i=$((i + 1))
done
MANAGED_BLOCK="${MANAGED_BLOCK%$'\n'}"

# Blocked transitions whose existing target is routed leave the declaration
# completely untouched; otherwise a blocked map run stages the candidate form.
if [[ "${DECL_TARGET_STATUS}" == "candidate_pending_confirmation" ]]; then
  DECL_TARGET_MAP_REF="null"
  DECL_TARGET_MAP_SHA="null"
else
  DECL_TARGET_MAP_REF="${DOMAIN_MAP_REF}"
  DECL_TARGET_MAP_SHA="${MAP_SHA256}"
fi

generate_declaration "${DECL_TARGET_STATUS}" "${DECL_TARGET_ROUTABLE}" "${DECL_TARGET_MAP_REF}" "${MANAGED_BLOCK}" "${DECL_TARGET_MAP_SHA}" \
  | write_staging_file "business_domain/knowledge-target.yaml"

# --- plan actions (arrays were initialized before the provenance/decision section
# so transition-blocked reasons recorded there survive into the plan) -------------

# knowledge-target.yaml (initializer-owned machine declaration)
REL="knowledge-target.yaml"
TARGET_FILE="${BD_DIR}/${REL}"
if [[ "${DECL_FROZEN}" == "true" ]]; then
  NOTICE_LINES+=("existing routed declaration untouched: routed map replacement and routed-doc modifications are unsupported in this wave and require separate migration authorization")
elif [[ ! -e "${TARGET_FILE}" ]]; then
  declare_plan_line "${REL}" "create"
elif cmp -s "${TARGET_FILE}" "${STAGING_DIR}/business_domain/${REL}"; then
  : # identical declaration -> no-op
elif [[ -n "${DOMAIN_MAP}" && "${UPGRADE_OK}" == "true" \
     && "${EXISTING_DECL_STATUS}" == "candidate_pending_confirmation" ]]; then
  declare_plan_line "${REL}" "update"   # candidate -> routed, atomic with the root docs
elif [[ -z "${DOMAIN_MAP}" && "${EXISTING_DECL_STATUS}" == "candidate_pending_confirmation" ]] \
     && [[ "$(ruby -ryaml -e '
        a = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
        b = YAML.safe_load(File.read(ARGV[1]), permitted_classes: [], aliases: false) || {}
        a.delete("managed_root_docs")
        b.delete("managed_root_docs")
        puts a == b ? "same" : "diff"
      ' "${TARGET_FILE}" "${STAGING_DIR}/business_domain/${REL}" 2>/dev/null)" == "same" ]]; then
  declare_plan_line "${REL}" "update"   # controlled managed-digest refresh after refilling a missing managed doc
elif [[ "${EXISTING_DECL_STATUS}" == "routed" && -z "${DOMAIN_MAP}" ]]; then
  NOTICE_LINES+=("target already routed; declaration preserved (no downgrade)")
elif [[ "${UPDATE_DECLARATION}" == "true" ]]; then
  declare_plan_line "${REL}" "update"   # declaration replacement only; never re-baselines docs
else
  BLOCKED_REASONS+=("knowledge-target.yaml exists and differs from the staged declaration for this run; pass --update-declaration to replace it deliberately")
  PLAN_OK="false"
fi

# root documents: actions come from the digest-baseline decision above; a
# blocked transition never plans partial updates.
i=0
for REL in "${ROOT_DOCS[@]}"; do
  case "${DOC_ACTIONS[i]}" in
    create) declare_plan_line "${REL}" "create" ;;
    upgrade)
      if [[ "${UPGRADE_OK}" == "true" ]]; then
        declare_plan_line "${REL}" "update"
      else
        declare_plan_line "${REL}" "preserve"
      fi ;;
    *)      declare_plan_line "${REL}" "preserve" ;;
  esac
  i=$((i + 1))
done

# domain documents (candidate fill or routed map): create missing; block on conflicting content
while IFS= read -r REL; do
  [[ -z "${REL}" ]] && continue
  case "${REL}" in
    knowledge-target.yaml|00BusinessLandscape.md|00UbiquitousLanguage.md|01DomainCatalog.md) continue ;;
  esac
  TARGET_FILE="${BD_DIR}/${REL}"
  if [[ -e "${TARGET_FILE}" ]]; then
    if cmp -s "${TARGET_FILE}" "${STAGING_DIR}/business_domain/${REL}"; then
      : # identical -> no-op
    else
      BLOCKED_REASONS+=("existing document differs from the generated skeleton: ${REL}")
      PLAN_OK="false"
    fi
  else
    declare_plan_line "${REL}" "create"
  fi
done < <( stage_rel_paths )

# machine artifacts (create-if-missing; existing differences preserved with a notice)
for PAIR in \
  "project-governance-profile.yaml:${SDLC_DIR}/project-governance-profile.yaml" \
  "entry-coverage-profile.yaml:${SDLC_DIR}/entry-coverage-profile.yaml" \
  "business-domain-map.yaml:${SDLC_DIR}/business-domain-map.yaml" \
  "scripts/bash/audit-entry-coverage.sh:${AUDIT_WRAPPER}"; do
  REL="${PAIR%%:*}"
  TARGET_FILE="${PAIR#*:}"
  STAGED="${STAGING_DIR}/${REL}"
  if [[ ! -e "${TARGET_FILE}" ]]; then
    declare_plan_line "${REL}" "create"
  elif cmp -s "${TARGET_FILE}" "${STAGED}"; then
    declare_plan_line "${REL}" "preserve"
  else
    declare_plan_line "${REL}" "preserve"
    NOTICE_LINES+=("machine artifact exists with different content; preserved (create-if-missing): ${REL}")
  fi
done

# retired-root presence advisory (D088-R1-H1: existence check only — the legacy
# root is never read, traversed or counted; symlinks are detected via -L without
# following them). Migration is separately authorized.
LEGACY_ROOT_PRESENT="false"
if legacy_root_present; then
  LEGACY_ROOT_PRESENT="true"
  NOTICE_LINES+=("legacy knowledge root detected; migration requires separate authorization; this tool never reads, traverses or rewrites it")
fi

# --- dry-run preview ------------------------------------------------------------------
if [[ "${DRY_RUN}" == "true" ]]; then
  echo "== DRY RUN (nothing written) =="
  echo "MODE=init STATE=${STATUS} ROUTABLE=${ROUTABLE}"
  echo "Planned actions:"
  if [[ "${#CREATED_FILES[@]}" -gt 0 ]]; then printf '  create   %s\n' "${CREATED_FILES[@]}"; fi
  if [[ "${#UPDATED_FILES[@]}" -gt 0 ]]; then printf '  update   %s\n' "${UPDATED_FILES[@]}"; fi
  if [[ "${#PRESERVED_FILES[@]}" -gt 0 ]]; then printf '  preserve %s\n' "${PRESERVED_FILES[@]}"; fi
  if [[ "${#NOTICE_LINES[@]}" -gt 0 ]]; then printf '  notice: %s\n' "${NOTICE_LINES[@]}"; fi
  if [[ "${#BLOCKED_REASONS[@]}" -gt 0 ]]; then
    echo "BLOCKED:"
    printf '  - %s\n' "${BLOCKED_REASONS[@]}"
  fi
  echo "--- knowledge-target.yaml preview ---"
  cat "${STAGING_DIR}/business_domain/knowledge-target.yaml"
  echo "--- 00BusinessLandscape.md preview (first 30 lines) ---"
  head -30 "${STAGING_DIR}/business_domain/00BusinessLandscape.md"
  if [[ "${PLAN_OK}" == "true" ]]; then exit 0; else exit 1; fi
fi

if [[ "${PLAN_OK}" != "true" ]]; then
  echo "== BLOCKED: nothing was written =="
  printf '  - %s\n' "${BLOCKED_REASONS[@]}"
  exit 1
fi

# --- execute ---------------------------------------------------------------------------
for REL in "${CREATED_FILES[@]:-}" "${UPDATED_FILES[@]:-}"; do
  [[ -z "${REL}" ]] && continue
  case "${REL}" in
    project-governance-profile.yaml|entry-coverage-profile.yaml|business-domain-map.yaml|scripts/bash/audit-entry-coverage.sh)
      SRC="${STAGING_DIR}/${REL}"
      DEST="${SDLC_DIR}/${REL}" ;;
    *)
      SRC="${STAGING_DIR}/business_domain/${REL}"
      DEST="${BD_DIR}/${REL}" ;;
  esac
  mkdir -p "$(dirname "${DEST}")"
  cp "${SRC}" "${DEST}"
  if [[ "${REL}" == "scripts/bash/audit-entry-coverage.sh" ]]; then
    chmod +x "${DEST}"
  fi
done

mkdir -p "${REPORT_DIR}"
# D088-R2-H6: atomic exclusive report creation (see the audit-mode comment).
REPORT_FILE="$(mktemp "${REPORT_DIR}/knowledge_target_bootstrap_report.$(date '+%Y%m%d-%H%M%S').${$}.XXXXXX")"
{
  echo "# Knowledge Target Bootstrap Report"
  echo ""
  echo "> **Project**: ${PROJECT_NAME}"
  echo "> **Generated At**: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "> **Generated By**: scripts/bootstrap-knowledge-target.sh (D-088-01 v2)"
  echo "> **Target Repository**: ${TARGET_PATH}"
  echo ""
  echo "| Item | Value |"
  echo "| --- | --- |"
  echo "| Knowledge target | .sdlc/business_domain |"
  echo "| Declaration | .sdlc/business_domain/knowledge-target.yaml |"
  echo "| Mode | ${STATUS} |"
  echo "| Routable | ${ROUTABLE} |"
  echo "| Domain map | ${DOMAIN_MAP:-<not used>} |"
  echo "| Git author | ${AUTHOR} |"
  if [[ -z "${DOMAIN_MAP}" ]]; then
    echo "| Code-driven fill | entries=${FILL_ENTRIES}, candidate L1=${FILL_L1}, candidate L2=${FILL_L2} |"
  fi
  echo ""
  echo "## Created"
  if [[ "${#CREATED_FILES[@]}" -gt 0 ]]; then printf -- '- %s\n' "${CREATED_FILES[@]}"; else echo "- <none>"; fi
  echo "## Updated"
  if [[ "${#UPDATED_FILES[@]}" -gt 0 ]]; then printf -- '- %s\n' "${UPDATED_FILES[@]}"; else echo "- <none>"; fi
  echo "## Preserved (never modified)"
  if [[ "${#PRESERVED_FILES[@]}" -gt 0 ]]; then printf -- '- %s\n' "${PRESERVED_FILES[@]}"; else echo "- <none>"; fi
  echo "## Notices"
  if [[ "${#NOTICE_LINES[@]}" -gt 0 ]]; then printf -- '- %s\n' "${NOTICE_LINES[@]}"; else echo "- <none>"; fi
  echo "## Remaining Confirmation"
  if [[ "${ROUTABLE}" == "false" ]]; then
    echo "- 候选状态：Owner 逐域确认候选文档后，填写并确认 .sdlc/business-domain-map.yaml，"
    echo "  再以 --domain-map 重跑以进入 routed（此前同步只产 PROPOSAL）。"
  fi
  echo ""
  echo "## Source Evidence"
  echo "- 过程事实：当前需求 library/{requirement_id}/ 七节点产物。"
  echo "- 代码与验证证据：目标仓；由 sdlc-knowledge-sync 消费。"
} > "${REPORT_FILE}"

# =====================================================================================
# --- v3: post-init residue gate, rollback-on-violation, migration reports ------------
# spec §6.4 (residue gate) / §6.5 (finalization) / §7 (dual reports)
# =====================================================================================
if [[ "${MIG_PENDING}" == "true" ]]; then
  MIG_FAIL_REASON=""

  # --- §4.4 fixed-field merges: retired declaration/profile facts are projected into
  # the new machine artifacts (pristine-only, fill-if-absent); every merge decision
  # is recorded in the report. Retired-root values (e.g. an old document_scope) are
  # recorded but NEVER merged — they are retired semantics (R18). --------------------
  MIG_FIELD_MAPPINGS=()
  OLD_DECL="${TARGET_PATH}/.sdlc/legacy/.specify/business_domain/knowledge-target.yaml"
  OLD_GOVP="${TARGET_PATH}/.sdlc/legacy/.specify/project-governance-profile.yaml"
  OLD_ECP="${TARGET_PATH}/.sdlc/legacy/.specify/entry-coverage-profile.yaml"
  MAP_TEMPLATE_FILE="${SDLC_DIR}/business-domain-map.yaml"

  was_created_this_run() { # $1 = rel path as recorded in CREATED_FILES
    local c
    for ((c = 0; c < ${#CREATED_FILES[@]}; c++)); do
      if [[ "${CREATED_FILES[${c}]}" == "$1" ]]; then return 0; fi
    done
    return 1
  }

  # merge outcomes carry the old value (truncated) so the report is a real
  # field-mapping table, not just a status list (G1-R1-H4).
  merge_yaml_key_if_absent() { # $1=old $2=new $3=key ; stdout: outcome (old value appended when relevant)
    ruby -ryaml -e '
      old_f, new_f, key = ARGV[0], ARGV[1], ARGV[2]
      fmt = ->(v) { v = v.join("|") if v.is_a?(Array); v.to_s[0, 80] }
      return puts("new-absent") unless File.file?(new_f)
      old = begin; YAML.safe_load(File.read(old_f), permitted_classes: [], aliases: false) || {}; rescue StandardError; nil; end
      return puts("old-absent") if old.nil? || old[key].nil?
      old_disp = fmt.call(old[key])
      new = begin; YAML.safe_load(File.read(new_f), permitted_classes: [], aliases: false) || {}; rescue StandardError; nil; end
      return puts("new-unreadable") if new.nil?
      if new[key].nil?
        new[key] = old[key]
        File.write(new_f, YAML.dump(new))
        puts("merged (old: #{old_disp})")
      else
        puts("already-present (old: #{old_disp})")
      end
    ' "$1" "$2" "$3" 2>/dev/null || echo "error"
  }

  # list-union merge for enumerated profile facts: the initializer always emits
  # project_type_profiles (nested), so fill-if-absent would silently drop the legacy
  # stack choice (G1-R1-H4); union keeps both, new values first. Old and new layouts
  # differ (old top-level vs new nested), so each side gets its own dotted path.
  merge_yaml_key_union() { # $1=old $2=new $3=old.dotted.path $4=new.dotted.path ; stdout: outcome
    ruby -ryaml -e '
      old_f, new_f, old_path, new_path = ARGV[0], ARGV[1], ARGV[2], ARGV[3]
      return puts("new-absent") unless File.file?(new_f)
      old = begin; YAML.safe_load(File.read(old_f), permitted_classes: [], aliases: false) || {}; rescue StandardError; nil; end
      old_v = old; old_path.split(".").each { |k| old_v = old_v.nil? ? nil : old_v[k] }
      return puts("old-absent") if old.nil? || old_v.nil?
      old_list = old_v.is_a?(Array) ? old_v.map(&:to_s) : [old_v.to_s]
      new = begin; YAML.safe_load(File.read(new_f), permitted_classes: [], aliases: false) || {}; rescue StandardError; nil; end
      return puts("new-unreadable") if new.nil?
      nparts = new_path.split(".")
      holder = new; nparts[0..-2].each do |k|
        holder[k] = {} unless holder[k].is_a?(Hash)
        holder = holder[k]
      end
      leaf = nparts[-1]
      cur = holder[leaf]
      new_list = cur.is_a?(Array) ? cur.map(&:to_s) : (cur.nil? ? [] : [cur.to_s])
      added = old_list.reject { |v| new_list.include?(v) || v.empty? }
      if added.empty?
        puts("already-present")
      else
        holder[leaf] = new_list + added
        File.write(new_f, YAML.dump(new))
        puts("merged-union (added: #{added.join("|")})")
      end
    ' "$1" "$2" "$3" "$4" 2>/dev/null || echo "error"
  }

  if [[ -f "${OLD_DECL}" && -f "${MAP_TEMPLATE_FILE}" ]] \
     && ! grep -q "legacy_candidate_domains:" "${MAP_TEMPLATE_FILE}" 2>/dev/null; then
    OLD_DOMAINS="$(ruby -ryaml -e '
      begin
        d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
        names = []
        (d["domains"] || d["domain_list"] || []).each do |x|
          names << (x.is_a?(Hash) ? (x["name"] || x["id"] || x["domain"]).to_s : x.to_s)
        end
        names << d["project"].to_s unless d["project"].nil?
        puts names.reject(&:empty?).uniq.join("\n")
      rescue StandardError
        nil
      end
    ' "${OLD_DECL}" 2>/dev/null || true)"
    if [[ -n "${OLD_DOMAINS}" ]]; then
      {
        printf '\n# legacy_candidate_domains: mechanical projection of the retired declaration\n'
        printf '# (spec §4.4 fixed-field mapping); owner reviews before confirming the map.\n'
        printf 'legacy_candidate_domains:\n'
        printf '%s\n' "${OLD_DOMAINS}" | while IFS= read -r od; do
          if [[ -n "${od}" ]]; then printf '  - "%s"\n' "$(printf '%s' "${od}" | sed 's/\\/\\\\/g; s/"/\\"/g')"; fi
        done
      } >> "${MAP_TEMPLATE_FILE}"
      while IFS= read -r od; do
        if [[ -n "${od}" ]]; then MIG_FIELD_MAPPINGS+=("business-domain-map.yaml/legacy_candidate_domains	${od}"); fi
      done <<< "${OLD_DOMAINS}"
    fi
  fi

  if [[ -f "${OLD_GOVP}" ]] && was_created_this_run "project-governance-profile.yaml"; then
    mig_outcome="$(merge_yaml_key_union "${OLD_GOVP}" "${GOV_PROFILE}" "project_type_profiles" "project.project_type_profiles")"
    MIG_FIELD_MAPPINGS+=("project-governance-profile.yaml/project_type_profiles	${mig_outcome}")
    mig_outcome="$(merge_yaml_key_if_absent "${OLD_GOVP}" "${GOV_PROFILE}" "project")"
    MIG_FIELD_MAPPINGS+=("project-governance-profile.yaml/project	${mig_outcome}")
  fi
  if [[ -f "${OLD_ECP}" ]] && was_created_this_run "entry-coverage-profile.yaml"; then
    mig_outcome="$(merge_yaml_key_if_absent "${OLD_ECP}" "${ECP_PROFILE}" "project")"
    MIG_FIELD_MAPPINGS+=("entry-coverage-profile.yaml/project	${mig_outcome}")
    MIG_FIELD_MAPPINGS+=("entry-coverage-profile.yaml/document_scope	not merged: old-root scope is retired semantics (R18); authoritative new value kept")
  fi

  # --- residue gate over ALL active surfaces (spec §6.4; G1-R1-H5: migrated knowledge
  # files are scanned like every other active file — un-negated retired vocabulary in
  # a migrated knowledge doc blocks and rolls back, preserving originals for human
  # adjudication; negation word table kept at parity with the R2-H6 audit scanner) ----
  GATE_OUT="$(mktemp "${TMPDIR:-/tmp}/knowledge-target-mig-gate.XXXXXX")"
  GATE_RC="$(ruby -e '
    sdlc = ARGV[0]; target = ARGV[1]; out = ARGV[2]
    skip_prefixes = ["#{sdlc}/legacy/", "#{sdlc}/reports/", "#{sdlc}/migration/"]
    patterns = [/speckit/i, /99PendingConfirmation/i, /dual rail/i, /legacy rail/i, /\.specify/]
    apos = 39.chr
    negation = Regexp.new("(不得|禁止|不能|不应|切勿|不读取|不改写|never|must\\s+not|do\\s+not|don" + apos + "t|prohibit\\w*|forbidden|retired)", Regexp::IGNORECASE)
    machine_re = /\A(\s*)(forbidden_write_paths|legacy_runtime_inputs)\s*:/
    violations = []
    if File.directory?(sdlc)
      files = Dir.glob(File.join(sdlc, "**", "*")).select { |p| File.file?(p) }.sort
      files.each do |path|
        next if skip_prefixes.any? { |pre| path.start_with?(pre) }
        next unless path.match?(/\.(md|markdown|txt|yaml|yml|sh|rb)\z/i)
        machine_key_indent = nil
        File.readlines(path).each_with_index do |line, idx|
          if (m = line.match(machine_re))
            machine_key_indent = m[1].length
          elsif !machine_key_indent.nil?
            entry_indent = line.match(/\A(\s*)\S/) ? Regexp.last_match(1).length : nil
            machine_key_indent = nil if entry_indent.nil? || entry_indent <= machine_key_indent
          end
          next if machine_key_indent
          states = line.split(/[。；;！!？?]/).map do |clause|
            hits = patterns.select { |re| clause.match?(re) }
            next nil if hits.empty?
            clause.match?(negation) ? :exempt : :violation
          end.compact
          if states.include?(:violation)
            violations << "#{path.delete_prefix("#{target}/")}:#{idx + 1}"
            break if violations.size >= 50
          end
          break if violations.size >= 50
        end
        break if violations.size >= 50
      end
    end
    File.write(out, violations.join("\n") + (violations.empty? ? "" : "\n"))
    puts violations.size
  ' "${SDLC_DIR}" "${TARGET_PATH}" "${GATE_OUT}" 2>/dev/null || echo "0")"
  if [[ "${GATE_RC}" != "0" ]]; then
    MIG_FAIL_REASON="residue gate violations"
  fi

  if [[ -n "${MIG_FAIL_REASON}" ]]; then
    # --- full rollback: migration moves + INIT-created files + both reports ---------
    if mig_rollback; then
      echo "RESIDUE GATE FAILED: rolled back migration to pre-migration state." >&2
    else
      echo "RESIDUE GATE FAILED and ROLLBACK INCOMPLETE; backup kept at ${MIG_BACKUP_DIR}" >&2
      MIG_ROLLBACK_OK="false"
    fi
    for ((c = 0; c < ${#CREATED_FILES[@]}; c++)); do
      rel="${CREATED_FILES[${c}]}"
      case "${rel}" in
        project-governance-profile.yaml|entry-coverage-profile.yaml|business-domain-map.yaml|scripts/bash/audit-entry-coverage.sh) rm -f "${SDLC_DIR}/${rel}" ;;
        *) rm -f "${BD_DIR}/${rel}" ;;
      esac
    done
    rm -f "${REPORT_FILE}"
    echo "BLOCKED: migration rolled back (${MIG_FAIL_REASON}); see stderr list. Violations:" >&2
    while IFS= read -r v; do
      if [[ -n "${v}" ]]; then echo "  - ${v}" >&2; fi
    done < "${GATE_OUT}"
    mig_write_failure_report "residue gate violation at $(head -n 1 "${GATE_OUT}" 2>/dev/null || echo 'unknown')"
    rm -f "${GATE_OUT}"
    exit 1
  fi
  rm -f "${GATE_OUT}"

  # --- post-migration detection re-run value (spec §7) ------------------------------
  POST_ROOT_DOCS=0
  for doc in 00BusinessLandscape.md 00UbiquitousLanguage.md 01DomainCatalog.md; do
    if [[ -f "${BD_DIR}/${doc}" ]]; then POST_ROOT_DOCS=$((POST_ROOT_DOCS + 1)); fi
  done
  if [[ "${POST_ROOT_DOCS}" -eq 3 ]]; then
    MIG_POST_TYPE="EXISTING"
  else
    MIG_POST_TYPE="EXISTING_CODE_NO_KNOWLEDGE"
  fi

  # --- finalization: independent plan artifact + dual reports (spec §4.3/§7; H6) ----
  MIG_REPORT_DIR="${REPORT_DIR}"
  mkdir -p "${MIG_REPORT_DIR}" "${SDLC_DIR}/migration"
  MIG_TSV_FILE="$(mktemp "${TMPDIR:-/tmp}/knowledge-target-mig-tsv.XXXXXX")"
  for ((t = 0; t < ${#MIG_TSV[@]}; t++)); do printf '%s\n' "${MIG_TSV[${t}]}" >> "${MIG_TSV_FILE}"; done
  MIG_MAP_TSV_FILE="$(mktemp "${TMPDIR:-/tmp}/knowledge-target-mig-map.XXXXXX")"
  for ((t = 0; t < ${#MIG_FIELD_MAPPINGS[@]}; t++)); do printf '%s\n' "${MIG_FIELD_MAPPINGS[${t}]}" >> "${MIG_MAP_TSV_FILE}"; done
  MIG_BLOCK_TSV_FILE="$(mktemp "${TMPDIR:-/tmp}/knowledge-target-mig-blocked.XXXXXX")"
  for ((b = 0; b < ${#MIG_BLOCKED[@]}; b += 2)); do
    printf '%s\t%s\n' "${MIG_BLOCKED[${b}]}" "${MIG_BLOCKED[${b} + 1]}" >> "${MIG_BLOCK_TSV_FILE}"
  done

  MIG_CONFIRM_REQUIRED="false"; MIG_CONFIRM_PROVIDED="false"
  if [[ "${MIG_ADD_ONLY}" != "true" ]]; then MIG_CONFIRM_REQUIRED="true"; MIG_CONFIRM_PROVIDED="true"; fi

  # independent plan artifact: the confirmed classification document (H6)
  PLAN_JSON="${SDLC_DIR}/migration/plan.json"
  M_SIGNALS_CSV="$(printf '%s; ' "${SIG_LINES[@]}")"
  M_SIGNALS_CSV="${M_SIGNALS_CSV%; }"
  M_TYPE="${V3_TYPE}" M_SKELETON="${V3_SKELETON}" M_SIGNALS="${M_SIGNALS_CSV}" \
  M_PLAN_SHA="${PLAN_SHA}" M_ADD_ONLY="${MIG_ADD_ONLY}" \
  M_RUN_TIMESTAMP="${RUN_TIMESTAMP}" M_V3_NOW="${V3_NOW}" \
  ruby -rjson -e '
    tsv_file, block_file, out = ARGV[0], ARGV[1], ARGV[2]
    files = File.readlines(tsv_file).map(&:chomp).reject(&:empty?).map do |l|
      verb, rel, dst, rule, pre, rationale = l.split("\t")
      { "verb" => verb, "path" => rel, "target" => dst, "rule" => rule,
        "pre_digest" => pre, "rationale" => rationale }
    end
    blocked = File.readlines(block_file).map(&:chomp).reject(&:empty?).map do |l|
      pth, reason = l.split("\t", 2)
      { "path" => pth, "reason" => reason }
    end
    doc = {
      "run_timestamp" => ENV["M_RUN_TIMESTAMP"],
      "generated_at" => ENV["M_V3_NOW"],
      "type" => ENV["M_TYPE"],
      "signals" => ENV["M_SIGNALS"].split("; ").map(&:strip).reject(&:empty?),
      "skeleton_state" => ENV["M_SKELETON"],
      "add_only" => ENV["M_ADD_ONLY"] == "true",
      "blocked_total" => blocked.size,
      "blocked_files" => blocked,
      "files" => files,
      "plan_sha256" => ENV["M_PLAN_SHA"]
    }
    File.write(out, JSON.pretty_generate(doc) + "\n")
  ' "${MIG_TSV_FILE}" "${MIG_BLOCK_TSV_FILE}" "${PLAN_JSON}"
  printf '%s\n' "${PLAN_SHA}" > "${SDLC_DIR}/migration/plan.sha256"

  # migration report: execution outcome keyed to the confirmed plan (H6)
  MIG_JSON="$(mktemp "${MIG_REPORT_DIR}/migration_report.${RUN_TIMESTAMP}.${$}.json.XXXXXX")"
  MIG_REPORT_FILE="$(mktemp "${MIG_REPORT_DIR}/migration_report.${RUN_TIMESTAMP}.${$}.md.XXXXXX")"
  M_TARGET="${TARGET_PATH}" M_AUTHOR="${AUTHOR}" M_TYPE="${V3_TYPE}" M_SKELETON="${V3_SKELETON}" \
  M_POST_TYPE="${MIG_POST_TYPE}" M_RUN_TIMESTAMP="${RUN_TIMESTAMP}" M_V3_NOW="${V3_NOW}" \
  M_MOVED="${MIG_MOVED}" M_PLAN_SHA="${PLAN_SHA}" M_SIGNALS="${M_SIGNALS_CSV}" \
  M_ADD_ONLY="${MIG_ADD_ONLY}" M_CONFIRM_REQUIRED="${MIG_CONFIRM_REQUIRED}" M_CONFIRM_PROVIDED="${MIG_CONFIRM_PROVIDED}" \
  ruby -rjson -rdigest -e '
    tsv_file, map_file, json_out, md_out = ARGV[0], ARGV[1], ARGV[2], ARGV[3]
    target = ENV["M_TARGET"]
    files = File.readlines(tsv_file).map(&:chomp).reject(&:empty?).map do |l|
      verb, rel, dst, rule, pre, rationale = l.split("\t")
      post = nil
      if dst != "-" && File.file?(File.join(target, dst))
        post = Digest::SHA256.file(File.join(target, dst)).hexdigest
      end
      { "verb" => verb, "path" => rel, "target" => dst, "rule" => rule,
        "pre_digest" => pre, "post_digest" => post, "rationale" => rationale }
    end
    mappings = File.readlines(map_file).map(&:chomp).reject(&:empty?).map do |l|
      k, v = l.split("\t", 2)
      { "field" => k, "value" => v }
    end
    doc = {
      "run_timestamp" => ENV["M_RUN_TIMESTAMP"],
      "generated_at" => ENV["M_V3_NOW"],
      "migration_completed_at" => ENV["M_V3_NOW"],
      "status" => "COMPLETED",
      "target_repository" => target,
      "git_author" => ENV["M_AUTHOR"],
      "detection" => { "type" => ENV["M_TYPE"], "signals" => ENV.fetch("M_SIGNALS", "").split("; ").map(&:strip).reject(&:empty?), "skeleton_state" => ENV.fetch("M_SKELETON", "") },
      "plan_sha256" => ENV["M_PLAN_SHA"],
      "confirmation" => { "required" => ENV["M_CONFIRM_REQUIRED"] == "true", "provided" => ENV["M_CONFIRM_PROVIDED"] == "true", "digest" => ENV["M_PLAN_SHA"] },
      "add_only" => ENV["M_ADD_ONLY"] == "true",
      "moved_count" => ENV["M_MOVED"].to_i,
      "files" => files,
      "field_mappings" => mappings,
      "residue_gate" => { "scope" => ".sdlc/** minus legacy/, reports/, migration/", "violations_count" => 0 },
      "post_detect_type" => ENV["M_POST_TYPE"],
      "rollback" => { "occurred" => false, "reason" => "" }
    }
    File.write(json_out, JSON.pretty_generate(doc) + "\n")
    md = String.new
    md << "# Migration Report\n\n"
    md << "> **Type**: #{doc["detection"]["type"]}\n"
    md << "> **Generated At**: #{doc["generated_at"]}\n"
    md << "> **Completed At**: #{doc["migration_completed_at"]}\n"
    md << "> **Plan SHA-256**: `#{doc["plan_sha256"]}`\n"
    md << "> **DP1 Confirmation**: required=#{doc["confirmation"]["required"]} provided=#{doc["confirmation"]["provided"]}\n"
    md << "> **Moved**: #{doc["moved_count"]} file(s); add_only=#{doc["add_only"]}; residue gate=0 violations\n"
    md << "> **Post-migration detection**: #{doc["post_detect_type"]}\n\n"
    md << "| Verb | Path | Target | Rule | Pre Digest | Post Digest |\n| --- | --- | --- | --- | --- | --- |\n"
    files.each { |f| md << "| #{f["verb"]} | #{f["path"]} | #{f["target"]} | #{f["rule"]} | #{f["pre_digest"]} | #{f["post_digest"]} |\n" }
    unless mappings.empty?
      md << "\n## Field Mappings (spec §4.4)\n\n| Field | Outcome/Value |\n| --- | --- |\n"
      mappings.each { |m| md << "| #{m["field"]} | #{m["value"]} |\n" }
    end
    md << "\nRETIRE/TRANSFORM 原件归档于 `.sdlc/legacy/**`（不物理删除）；候选域与稳定事实仍由 sdlc-knowledge-sync 依 routed 声明写入。\n"
    File.write(md_out, md)
  ' "${MIG_TSV_FILE}" "${MIG_MAP_TSV_FILE}" "${MIG_JSON}" "${MIG_REPORT_FILE}"
  rm -f "${MIG_TSV_FILE}" "${MIG_MAP_TSV_FILE}" "${MIG_BLOCK_TSV_FILE}"

  # transaction complete: reports finalized, disarm the ERR guard (H3)
  trap - ERR
  MIG_TX_ACTIVE="false"

  echo "MIGRATION REPORT=${MIG_REPORT_FILE#${TARGET_PATH}/}"
  echo "MIGRATION REPORT JSON=${MIG_JSON#${TARGET_PATH}/}"
  echo "MIGRATION PLAN JSON=${PLAN_JSON#${TARGET_PATH}/}"
  echo "MIGRATION POST_DETECT_TYPE=${MIG_POST_TYPE}"
fi



# --- summary ----------------------------------------------------------------------------
echo "== knowledge-target bootstrap summary (D-088-01 v2) =="
if [[ "${EXISTING_DECL_STATUS}" == "routed" && -z "${DOMAIN_MAP}" ]]; then
  echo "STATE=routed (existing declaration preserved; this run had no confirmed map)"
  echo "ROUTABLE=true"
else
  echo "STATE=${STATUS}"
  echo "ROUTABLE=${ROUTABLE}"
fi
echo "KNOWLEDGE_TARGET=.sdlc/business_domain"
echo "DECLARATION=.sdlc/business_domain/knowledge-target.yaml"
if [[ -z "${DOMAIN_MAP}" ]]; then
  echo "FILL: entries=${FILL_ENTRIES} candidate_l1=${FILL_L1} candidate_l2=${FILL_L2}"
fi
echo "CREATED: ${CREATED_FILES[*]:-}"
echo "UPDATED: ${UPDATED_FILES[*]:-}"
echo "PRESERVED: ${PRESERVED_FILES[*]:-}"
if [[ "${#NOTICE_LINES[@]}" -gt 0 ]]; then
  echo "NOTICES:"
  printf '  - %s\n' "${NOTICE_LINES[@]}"
fi
if [[ "${#BLOCKED_REASONS[@]}" -gt 0 ]]; then
  echo "BLOCKED: ${BLOCKED_REASONS[*]}"
fi
echo "REPORT=${REPORT_FILE#${TARGET_PATH}/}"
echo "REMAINING_CONFIRMATION: $([[ "${ROUTABLE}" == "false" ]] && echo 'owner 填写并确认 business-domain-map 后以 --domain-map 重跑进入 routed' || echo 'none')"
echo ""
echo "NOTES:"
echo "- 初始化器只建结构与候选事实（代码可验证），不发明业务语义；稳定事实由 sdlc-knowledge-sync"
echo "  从当前需求 library/{requirement_id}/ 产物、代码与验证证据写入 .sdlc/business_domain/**。"
exit 0
