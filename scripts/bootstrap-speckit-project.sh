#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/bootstrap-speckit-project.sh <target-project-path> [options]

Options:
  --project-name <name>          Project display name. Defaults to target directory name.
  --language <language>          java|typescript|python|go|mixed|other. Auto-detected when omitted.
  --application-type <type>      backend|frontend|fullstack|batch|library|mixed|other. Auto-detected when omitted.
  --standard-package <location>  Path or git URL for ai-sdlc-standard. Defaults to this repository path.
  --force-profiles               Overwrite generated profile files when they already exist.
  --force-context                Overwrite project-context files. Defaults to writing .candidate files.
  --dry-run                      Print generated files without writing.
  -h, --help                     Show this help.

Generated files:
  .specify/project-governance-profile.yaml
  .specify/entry-coverage-profile.yaml
  .specify/business-domain-bootstrap.yaml
  .specify/project-context/ProjectCodingGuide.md
  .specify/project-context/RepositoryStructure.md
  .specify/project-context/ProjectGovernanceOverrides.md
  .specify/reports/speckit_generation_report.md
  .specify/reports/legacy_speckit_source_inventory.md when legacy files exist
  .specify/reports/speckit_equivalence_report.pending.md when legacy files exist but comparable outputs are not ready
  .specify/reports/
  library/
  .gitignore entry: /library/

This script does not generate or copy .specify/business_domain/** content.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STANDARD_PACKAGE_DEFAULT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_PATH=""
PROJECT_NAME=""
LANGUAGE=""
APPLICATION_TYPE=""
STANDARD_PACKAGE="${STANDARD_PACKAGE_DEFAULT}"
FORCE_PROFILES="false"
FORCE_CONTEXT="false"
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-name)
      PROJECT_NAME="${2:-}"
      shift 2
      ;;
    --language)
      LANGUAGE="${2:-}"
      shift 2
      ;;
    --application-type)
      APPLICATION_TYPE="${2:-}"
      shift 2
      ;;
    --standard-package)
      STANDARD_PACKAGE="${2:-}"
      shift 2
      ;;
    --force-profiles)
      FORCE_PROFILES="true"
      shift
      ;;
    --force-context)
      FORCE_CONTEXT="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "${TARGET_PATH}" ]]; then
        echo "Only one target project path is allowed." >&2
        exit 2
      fi
      TARGET_PATH="$1"
      shift
      ;;
  esac
done

if [[ -z "${TARGET_PATH}" ]]; then
  usage >&2
  exit 2
fi

if [[ ! -d "${TARGET_PATH}" ]]; then
  echo "Target project path does not exist: ${TARGET_PATH}" >&2
  exit 1
fi

TARGET_PATH="$(cd "${TARGET_PATH}" && pwd)"
PROJECT_NAME="${PROJECT_NAME:-$(basename "${TARGET_PATH}")}"
SPECIFY_DIR="${TARGET_PATH}/.specify"
RUN_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"

if [[ -d "${STANDARD_PACKAGE}" ]]; then
  STANDARD_PACKAGE="$(cd "${STANDARD_PACKAGE}" && pwd)"
fi

git_remote() {
  git -C "${TARGET_PATH}" config --get remote.origin.url 2>/dev/null || true
}

detect_language() {
  if [[ -n "${LANGUAGE}" ]]; then
    printf '%s\n' "${LANGUAGE}"
  elif [[ -f "${TARGET_PATH}/pom.xml" ]] || find "${TARGET_PATH}" -maxdepth 6 -path '*/src/main/java' -type d 2>/dev/null | grep -q .; then
    printf 'java\n'
  elif [[ -f "${TARGET_PATH}/package.json" ]] || find "${TARGET_PATH}" -maxdepth 5 -name '*.ts' -type f 2>/dev/null | grep -q .; then
    printf 'typescript\n'
  elif [[ -f "${TARGET_PATH}/go.mod" ]]; then
    printf 'go\n'
  elif [[ -f "${TARGET_PATH}/pyproject.toml" ]] || [[ -f "${TARGET_PATH}/requirements.txt" ]]; then
    printf 'python\n'
  else
    printf 'mixed\n'
  fi
}

detect_application_type() {
  local detected_language="$1"
  if [[ -n "${APPLICATION_TYPE}" ]]; then
    printf '%s\n' "${APPLICATION_TYPE}"
  elif [[ "${detected_language}" == "java" ]]; then
    printf 'backend\n'
  elif [[ -f "${TARGET_PATH}/package.json" ]]; then
    if grep -Eq '"(react|vue|next|vite|angular)"' "${TARGET_PATH}/package.json"; then
      printf 'frontend\n'
    else
      printf 'mixed\n'
    fi
  else
    printf 'mixed\n'
  fi
}

yaml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

is_git_url() {
  case "$1" in
    http://*|https://*|git@*|ssh://*|*.git)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

standard_package_runtime_resolvable() {
  if [[ -d "${STANDARD_PACKAGE}" && -f "${STANDARD_PACKAGE}/manifest.yaml" ]]; then
    printf 'true\n'
  else
    printf 'false\n'
  fi
}

candidate_path() {
  local file="$1"
  local candidate="${file}.candidate"
  local index=1
  while [[ -e "${candidate}" ]]; do
    candidate="${file}.candidate.${index}"
    index=$((index + 1))
  done
  printf '%s\n' "${candidate}"
}

report_history_path() {
  local file="$1"
  local timestamped

  if [[ "${file}" == *.md ]]; then
    timestamped="${file%.md}.${RUN_TIMESTAMP}.md"
  else
    timestamped="${file}.${RUN_TIMESTAMP}"
  fi

  if [[ -e "${timestamped}" ]]; then
    candidate_path "${timestamped}"
  else
    printf '%s\n' "${timestamped}"
  fi
}

emit_yaml_list() {
  local indent="$1"
  shift
  if [[ $# -eq 0 ]]; then
    printf '%s- "<fill-me>"\n' "${indent}"
    return 0
  fi
  local item
  for item in "$@"; do
    printf '%s- "%s"\n' "${indent}" "$(yaml_escape "${item}")"
  done
}

detect_source_roots() {
  local roots=""
  while IFS= read -r dir; do
    dir="${dir#${TARGET_PATH}/}"
    roots="${roots}${dir}"$'\n'
  done < <(find "${TARGET_PATH}" -maxdepth 6 -path '*/src/main/java' -type d 2>/dev/null | sort)

  if [[ -z "${roots}" ]]; then
    while IFS= read -r dir; do
      dir="${dir#${TARGET_PATH}/}"
      roots="${roots}${dir}"$'\n'
    done < <(find "${TARGET_PATH}" -maxdepth 3 -type d \( -name src -o -name app -o -name lib \) 2>/dev/null | sort)
  fi

  if [[ -z "${roots}" ]]; then
    printf '.\n'
  else
    printf '%s' "${roots}" | sed '/^$/d'
  fi
}

detect_module_globs() {
  local modules=""
  while IFS= read -r dir; do
    local rel
    rel="${dir#${TARGET_PATH}/}"
    if [[ "${rel}" == "." || "${rel}" == "${dir}" ]]; then
      continue
    fi
    modules="${modules}${rel}"$'\n'
  done < <(find "${TARGET_PATH}" -mindepth 2 -maxdepth 3 -path '*/src/main' -type d 2>/dev/null | sed 's#/src/main$##' | sort -u)

  if [[ -z "${modules}" ]]; then
    printf '.\n'
  else
    printf '%s' "${modules}" | sed '/^$/d'
  fi
}

check_profile_target() {
  local file="$1"
  if [[ -e "${file}" && "${FORCE_PROFILES}" != "true" ]]; then
    if [[ "${DRY_RUN}" == "true" ]]; then
      echo "Existing profile detected: ${file}" >&2
      echo "Would require --force-profiles to overwrite in write mode." >&2
      return 0
    fi
    echo "Refusing to overwrite existing file: ${file}" >&2
    echo "Use --force-profiles to overwrite profile files, or edit it manually." >&2
    exit 1
  fi
}

write_or_preview() {
  local file="$1"
  local generator="$2"
  local mode="${3:-profile}"
  local output_file="${file}"

  if [[ "${mode}" == "context" && -e "${file}" && "${FORCE_CONTEXT}" != "true" ]]; then
    output_file="$(candidate_path "${file}")"
  elif [[ "${mode}" == "report" && -e "${file}" ]]; then
    output_file="$(report_history_path "${file}")"
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    local preview_file
    preview_file="$(mktemp "${TMPDIR:-/tmp}/speckit-bootstrap-preview.XXXXXX")"
    "${generator}" "${preview_file}"
    if [[ "${output_file}" != "${file}" && "${mode}" == "report" ]]; then
      printf '\n--- %s (timestamped history for existing %s) ---\n' "${output_file#${TARGET_PATH}/}" "${file#${TARGET_PATH}/}"
    elif [[ "${output_file}" != "${file}" ]]; then
      printf '\n--- %s (candidate for existing %s) ---\n' "${output_file#${TARGET_PATH}/}" "${file#${TARGET_PATH}/}"
    else
      printf '\n--- %s ---\n' "${file#${TARGET_PATH}/}"
    fi
    cat "${preview_file}"
    rm -f "${preview_file}"
  else
    "${generator}" "${output_file}"
    if [[ "${output_file}" != "${file}" && "${mode}" == "report" ]]; then
      echo "Generated ${output_file#${TARGET_PATH}/} because ${file#${TARGET_PATH}/} already exists"
    elif [[ "${output_file}" != "${file}" ]]; then
      echo "Generated ${output_file#${TARGET_PATH}/} because ${file#${TARGET_PATH}/} already exists"
    else
      echo "Generated ${file#${TARGET_PATH}/}"
    fi
  fi
}

preflight_profile_targets() {
  check_profile_target "${SPECIFY_DIR}/project-governance-profile.yaml"
  check_profile_target "${SPECIFY_DIR}/entry-coverage-profile.yaml"
  check_profile_target "${SPECIFY_DIR}/business-domain-bootstrap.yaml"
}

ensure_gitignore_entry() {
  local gitignore_file="${TARGET_PATH}/.gitignore"
  local entry="/library/"

  if [[ -f "${gitignore_file}" ]] && grep -qxF "${entry}" "${gitignore_file}"; then
    echo ".gitignore already contains ${entry}"
    return 0
  fi

  if [[ ! -f "${gitignore_file}" ]]; then
    printf '%s\n' "${entry}" > "${gitignore_file}"
    echo "Generated .gitignore with ${entry}"
    return 0
  fi

  if [[ -s "${gitignore_file}" ]]; then
    local last_hex
    last_hex="$(tail -c 1 "${gitignore_file}" 2>/dev/null | od -An -t x1 | tr -d ' \n')"
    if [[ "${last_hex}" != "0a" ]]; then
      printf '\n' >> "${gitignore_file}"
    fi
  fi

  printf '%s\n' "${entry}" >> "${gitignore_file}"
  echo "Updated .gitignore with ${entry}"
}

preview_gitignore_entry() {
  local gitignore_file="${TARGET_PATH}/.gitignore"
  local entry="/library/"

  printf '\n--- .gitignore update ---\n'
  if [[ -f "${gitignore_file}" ]] && grep -qxF "${entry}" "${gitignore_file}"; then
    echo ".gitignore already contains ${entry}; no change."
  elif [[ -f "${gitignore_file}" ]]; then
    echo "Would append ${entry} to .gitignore."
  else
    echo "Would create .gitignore with ${entry}."
  fi
}

DETECTED_LANGUAGE="$(detect_language)"
DETECTED_APPLICATION_TYPE="$(detect_application_type "${DETECTED_LANGUAGE}")"
REMOTE_URL="$(git_remote)"
REMOTE_URL="${REMOTE_URL:-<git-url-or-repo-name>}"
SOURCE_ROOTS_TEXT="$(detect_source_roots)"
MODULE_GLOBS_TEXT="$(detect_module_globs)"
SOURCE_ROOTS=()
MODULE_GLOBS=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && SOURCE_ROOTS+=("${line}")
done <<< "${SOURCE_ROOTS_TEXT}"
while IFS= read -r line; do
  [[ -n "${line}" ]] && MODULE_GLOBS+=("${line}")
done <<< "${MODULE_GLOBS_TEXT}"
STANDARD_RUNTIME_RESOLVABLE="$(standard_package_runtime_resolvable)"
if is_git_url "${STANDARD_PACKAGE}" || [[ "${STANDARD_RUNTIME_RESOLVABLE}" != "true" ]]; then
  STANDARD_LOCAL_RESOLUTION_REQUIRED="true"
else
  STANDARD_LOCAL_RESOLUTION_REQUIRED="false"
fi

matches_kind() {
  local kind="$1"
  local name="$2"
  case "${kind}" in
    http_entry)
      [[ "${name}" == *Controller.java ]]
      ;;
    rpc_provider)
      [[ "${name}" == *Provider.java || "${name}" == *Facade.java ]]
      ;;
    message_entry)
      [[ "${name}" == *Listener.java || "${name}" == *Consumer.java || "${name}" == *Processor.java ]]
      ;;
    schedule_entry)
      [[ "${name}" == *Schedule.java || "${name}" == *Job.java || "${name}" == *Task.java || "${name}" == *Worker.java ]]
      ;;
    service)
      [[ "${name}" == *Service.java || "${name}" == *ServiceImpl.java ]]
      ;;
    manager)
      [[ "${name}" == *Manager.java || "${name}" == *ManagerImpl.java || "${name}" == *DomainService.java ]]
      ;;
    persistence)
      [[ "${name}" == *Mapper.java || "${name}" == *Dao.java || "${name}" == *DAO.java || "${name}" == *Repository.java || "${name}" == *Mapper.xml ]]
      ;;
    mq)
      [[ "${name}" == *Listener.java || "${name}" == *Consumer.java || "${name}" == *Producer.java || "${name}" == *Message*.java ]]
      ;;
    schedule)
      [[ "${name}" == *Schedule.java || "${name}" == *Job.java || "${name}" == *Task.java || "${name}" == *Worker.java ]]
      ;;
    test)
      [[ "${name}" == *Test.java || "${name}" == *Tests.java || "${name}" == *.spec.ts || "${name}" == *.test.ts || "${name}" == test_*.py ]]
      ;;
    config)
      [[ "${name}" == *Config.java || "${name}" == *Configuration.java || "${name}" == *.yml || "${name}" == *.yaml || "${name}" == *.properties ]]
      ;;
    cache_lock)
      [[ "${name}" == *Cache*.java || "${name}" == *Lock*.java || "${name}" == *Redis*.java ]]
      ;;
    *)
      return 1
      ;;
  esac
}

matching_files_for_kind() {
  local kind="$1"
  local path
  find "${TARGET_PATH}" \
    \( \
      -path "*/.git/*" -o \
      -path "*/target/*" -o \
      -path "*/build/*" -o \
      -path "*/dist/*" -o \
      -path "*/node_modules/*" -o \
      -path "*/.venv/*" -o \
      -path "*/venv/*" -o \
      -path "*/vendor/*" -o \
      -path "*/out/*" -o \
      -path "*/coverage/*" -o \
      -path "*/generated/*" -o \
      -path "*/.idea/*" -o \
      -path "*/.gradle/*" -o \
      -path "*/.mvn/*" \
    \) -prune -o -type f -print 2>/dev/null | while IFS= read -r path; do
    if [[ "${kind}" == "rpc_provider" && "${path#${TARGET_PATH}/}" == *"/rpc/"* && "$(basename "${path}")" == *.java ]]; then
      printf '%s\n' "${path#${TARGET_PATH}/}"
    elif matches_kind "${kind}" "$(basename "${path}")"; then
      printf '%s\n' "${path#${TARGET_PATH}/}"
    fi
  done
}

count_matching_files() {
  matching_files_for_kind "$1" | wc -l | tr -d ' '
}

sample_matching_files() {
  matching_files_for_kind "$1" | sort | head -n 5
}

SOURCE_ROOT_COUNT="${#SOURCE_ROOTS[@]}"
MODULE_COUNT="${#MODULE_GLOBS[@]}"
HTTP_ENTRY_COUNT="$(count_matching_files http_entry)"
RPC_PROVIDER_COUNT="$(count_matching_files rpc_provider)"
MESSAGE_ENTRY_COUNT="$(count_matching_files message_entry)"
SCHEDULE_ENTRY_COUNT="$(count_matching_files schedule_entry)"
TOTAL_ENTRY_COUNT=$((HTTP_ENTRY_COUNT + RPC_PROVIDER_COUNT + MESSAGE_ENTRY_COUNT + SCHEDULE_ENTRY_COUNT))
SERVICE_COUNT="$(count_matching_files service)"
MANAGER_COUNT="$(count_matching_files manager)"
PERSISTENCE_COUNT="$(count_matching_files persistence)"
MQ_COUNT="$(count_matching_files mq)"
SCHEDULE_COUNT="$(count_matching_files schedule)"
TEST_COUNT="$(count_matching_files test)"
CONFIG_COUNT="$(count_matching_files config)"
CACHE_LOCK_COUNT="$(count_matching_files cache_lock)"

HTTP_ENTRY_SAMPLES="$(sample_matching_files http_entry)"
RPC_PROVIDER_SAMPLES="$(sample_matching_files rpc_provider)"
MESSAGE_ENTRY_SAMPLES="$(sample_matching_files message_entry)"
SCHEDULE_ENTRY_SAMPLES="$(sample_matching_files schedule_entry)"
SERVICE_SAMPLES="$(sample_matching_files service)"
MANAGER_SAMPLES="$(sample_matching_files manager)"
PERSISTENCE_SAMPLES="$(sample_matching_files persistence)"
MQ_SAMPLES="$(sample_matching_files mq)"
SCHEDULE_SAMPLES="$(sample_matching_files schedule)"
TEST_SAMPLES="$(sample_matching_files test)"
CONFIG_SAMPLES="$(sample_matching_files config)"
CACHE_LOCK_SAMPLES="$(sample_matching_files cache_lock)"

LEGACY_FILES_TEXT="$(find "${SPECIFY_DIR}" -type f \( -path "${SPECIFY_DIR}/memory/*" -o -path "${SPECIFY_DIR}/workflow/*" -o -path "${SPECIFY_DIR}/coding_guide/*" \) 2>/dev/null | sort | sed "s#^${TARGET_PATH}/##" || true)"
if [[ -n "${LEGACY_FILES_TEXT}" ]]; then
  LEGACY_FOUND="true"
  PARITY_CHECK_RESULT="not-ready"
else
  LEGACY_FOUND="false"
  PARITY_CHECK_RESULT="skipped"
fi

case "${DETECTED_APPLICATION_TYPE}" in
  backend|fullstack|batch)
    if [[ "${SOURCE_ROOT_COUNT}" -gt 0 && "${TOTAL_ENTRY_COUNT}" -gt 0 ]]; then
      CODE_EVIDENCE_RESULT="passed"
    else
      CODE_EVIDENCE_RESULT="needs-user-confirmation"
    fi
    ;;
  library)
    LIBRARY_EVIDENCE_COUNT=$((SERVICE_COUNT + MANAGER_COUNT + PERSISTENCE_COUNT + TEST_COUNT + CONFIG_COUNT + CACHE_LOCK_COUNT))
    if [[ "${SOURCE_ROOT_COUNT}" -gt 0 && "${LIBRARY_EVIDENCE_COUNT}" -gt 0 ]]; then
      CODE_EVIDENCE_RESULT="passed"
    else
      CODE_EVIDENCE_RESULT="needs-user-confirmation"
    fi
    ;;
  *)
    CODE_EVIDENCE_RESULT="needs-user-confirmation"
    ;;
esac

generate_project_profile() {
  local output="$1"
  {
    cat <<EOF
# Project Governance Profile
# Generated by ai-sdlc-standard scripts/bootstrap-speckit-project.sh

schema_version: 0.1.0

standard_package:
  name: ai-sdlc-standard
  version: 0.1.0
  source:
    type: local_or_git
    location: "$(yaml_escape "${STANDARD_PACKAGE}")"
    runtime_resolvable: ${STANDARD_RUNTIME_RESOLVABLE}
    local_resolution_required: ${STANDARD_LOCAL_RESOLUTION_REQUIRED}
  shared_rules:
    - ai-sdlc/lifecycle.md
    - ai-sdlc/artifact-storage.md
    - ai-sdlc/change-control.md
    - ai-sdlc/complexity-routing.md
    - ai-sdlc/standard-package-resolution.md
    - ai-sdlc/speckit-generation-source-model.md
    - ai-sdlc/speckit-dual-rail-isolation.md
    - ai-sdlc/speckit-document-generation-spec.md
    - ai-sdlc/speckit-document-governance.md
    - ai-sdlc/speckit-project-bootstrap.md

project:
  name: "$(yaml_escape "${PROJECT_NAME}")"
  repository: "$(yaml_escape "${REMOTE_URL}")"
  primary_language: "$(yaml_escape "${DETECTED_LANGUAGE}")"
  application_type: "$(yaml_escape "${DETECTED_APPLICATION_TYPE}")"
  owners:
    business: []
    engineering: []
    qa: []

paths:
  specify_root: ".specify"
  specs_root: "specs"
  library_root: "library"
  business_domain_root: ".specify/business_domain"
  reports_root: ".specify/reports"
  source_roots:
EOF
    emit_yaml_list "    " "${SOURCE_ROOTS[@]}"
    cat <<EOF
  module_globs:
EOF
    emit_yaml_list "    " "${MODULE_GLOBS[@]}"
    cat <<'EOF'

local_files:
  required:
    - ".specify/project-governance-profile.yaml"
    - ".specify/entry-coverage-profile.yaml"
    - ".specify/business-domain-bootstrap.yaml"
  optional:
    - ".specify/project-context/ProjectCodingGuide.md"
    - ".specify/project-context/RepositoryStructure.md"
    - ".specify/project-context/ProjectGovernanceOverrides.md"
  legacy:
    memory_files_authoritative: false
    workflow_files_authoritative: false
    notes: "Legacy .specify/memory or .specify/workflow files are project overrides only when explicitly listed below."

speckit_dual_rail:
  enabled: true
  legacy_rail:
    preserved: true
    mutable_by_sdlc: false
    authoritative_for_legacy_skills: true
    role_for_sdlc: "inventory_or_same_project_parity_reference_only"
  sdlc_rail:
    authoritative_for_sdlc_skills: true
    shared_standard_source: "${AI_SDLC_STANDARD_HOME}"
    private_project_sources:
      - ".specify/project-context/ProjectCodingGuide.md"
      - ".specify/project-context/RepositoryStructure.md"
      - ".specify/project-context/ProjectGovernanceOverrides.md"
    must_not_read_legacy_sources: true
  product_artifacts:
    specs_are_products: true
    business_domain_is_product: true
    require_output_equivalence_check_when_legacy_reference_exists: true

project_private_documents:
  coding_guides:
    - path: ".specify/project-context/ProjectCodingGuide.md"
      required: false
      purpose: "Project-specific coding rules, framework adapters, utility classes, and naming exceptions."
  architecture_guides:
    - path: ".specify/project-context/RepositoryStructure.md"
      required: false
      purpose: "Project-specific module boundaries, layering, deployment shape, and integration topology."
  repository_structure:
    - path: ".specify/project-context/RepositoryStructure.md"
      required: false
      purpose: "Project-specific module list, source roots, generated-code locations, and excluded paths."
  governance_overrides:
    - path: ".specify/project-context/ProjectGovernanceOverrides.md"
      required: false
      purpose: "Explicit local override for a shared standard rule."
  legacy_inputs:
    - path: ".specify/memory/**"
      required: false
      purpose: "Legacy local input only; not authoritative unless listed under project_overrides."
    - path: ".specify/workflow/**"
      required: false
      purpose: "Legacy local input only; not authoritative unless listed under project_overrides."

project_overrides:
  enabled: false
  files:
    - path: "<override-doc-path>"
      overrides_standard_rule: "<standard-rule-id-or-path>"
      reason: "<why this project needs a local exception>"
      owner: "<owner>"
  rules:
    - id: "<project-override-id>"
      standard_rule: "<standard-rule-id-or-path>"
      local_rule: "<project-specific rule>"
      reason: "<why this override is valid>"

business_domain:
  generation_timing: "post_project_bootstrap"
  structure: "physical_l2_logical_l4"
  root_docs:
    business_landscape: ".specify/business_domain/00BusinessLandscape.md"
    ubiquitous_language: ".specify/business_domain/00UbiquitousLanguage.md"
    domain_catalog: ".specify/business_domain/01DomainCatalog.md"
  routing_principle: "<business-lifecycle|business-capability|bounded-context|other>"
  l1_l2_naming: "{two_digit_number}{EnglishName}"
  l4_naming: "{L1}{L2}{L4}{EnglishName}({ChineseName}).md"
  entry_coverage_doc_suffix: "EntryCoverage"

knowledge_routing:
  existing_change:
    read:
      - "00BusinessLandscape.md"
      - "00UbiquitousLanguage.md"
      - "01DomainCatalog.md"
      - "matched L2 main document"
      - "matched L4 documents"
  new_flow:
    required_before_write:
      - "choose L1/L2"
      - "reserve L4 id"
      - "create L4 skeleton after user or owner approval"

read_order:
  before_speckit_stage:
    - "${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md"
    - "standard package shared rules"
    - ".specify/project-governance-profile.yaml"
    - ".specify/project-context/** documents required for the current stage"
    - ".specify/business_domain root documents when generated"
    - "matched L1/L2/L4 business-domain documents"
  conflict_policy:
    default_precedence: "standard_package"
    project_override_requires_profile_entry: true
    stop_on_undeclared_conflict: true
    business_facts_precedence: "target_repository_business_domain"

sync_policy:
  sync_required_for_complexity:
    - COMPLEX
  sync_targets:
    - ".specify/business_domain/**"
  sync_requires_entry_coverage: true
  allow_shared_rule_updates_from_project: false

generated_documents:
  project_bootstrap_generates:
    - ".specify/project-governance-profile.yaml"
    - ".specify/entry-coverage-profile.yaml"
    - ".specify/business-domain-bootstrap.yaml"
    - ".specify/project-context/ProjectCodingGuide.md"
    - ".specify/project-context/RepositoryStructure.md"
    - ".specify/project-context/ProjectGovernanceOverrides.md"
  business_domain_bootstrap_generates:
    - ".specify/business_domain/00BusinessLandscape.md"
    - ".specify/business_domain/00UbiquitousLanguage.md"
    - ".specify/business_domain/01DomainCatalog.md"
  generate_only_if_needed:
    - ".specify/coding_guide/** legacy documents remain untouched"
    - ".specify/memory/** legacy documents remain untouched"
    - ".specify/workflow/** legacy documents remain untouched"

bootstrap_status:
  state: "draft"
  generated_by: "ai-sdlc-standard"
  legacy_files_reviewed: []
  project_facts_preserved: []
  unresolved_questions: []
EOF
  } > "${output}"
}

generate_project_coding_guide() {
  local output="$1"
  {
    cat <<EOF
# Project Coding Guide

> **Generated By**: ai-sdlc-standard project bootstrap
> **Project**: $(yaml_escape "${PROJECT_NAME}")
> **Status**: Evidence scaffold, not an authoritative local coding standard

## Purpose

This document contains project-specific coding rule placeholders and detected code evidence.

Shared workflow, gate, checklist, and generic engineering rules live in \`${AI_SDLC_STANDARD_HOME:-<AI_SDLC_STANDARD_HOME>}/ai-sdlc/**\` and must not be copied here.

Detected evidence is not authoritative until reviewed and confirmed by the project owner. Treat the tables below as scan results that may guide confirmation; do not treat them as confirmed local rules by themselves.

## Local Implementation Rules

Add confirmed project-level coding rules here after review.

- Project-specific framework adapters:
- Project-specific utility classes:
- Project-specific package naming rules:
- Project-specific DTO/entity/model conversion rules:
- Project-specific cache, lock, MQ, RPC, or config conventions:

## Detected Technical Conventions

| Type | Evidence | Notes |
| --- | --- | --- |
| MQ / Event | $(markdown_samples "${MQ_SAMPLES}") | Count: ${MQ_COUNT}; confirm whether each example is business-facing or technical plumbing. |
| RPC | $(markdown_samples "${RPC_PROVIDER_SAMPLES}") | Count: ${RPC_PROVIDER_COUNT}; provider-like classes are evidence, not automatic business-domain boundaries. |
| Schedule / Job | $(markdown_samples "${SCHEDULE_ENTRY_SAMPLES}") | Count: ${SCHEDULE_ENTRY_COUNT}; confirm scheduling ownership before documenting lifecycle rules. |
| Cache / Lock | $(markdown_samples "${CACHE_LOCK_SAMPLES}") | Count: ${CACHE_LOCK_COUNT}; confirm runtime behavior before documenting consistency guarantees. |
| Config | $(markdown_samples "${CONFIG_SAMPLES}") | Count: ${CONFIG_COUNT}; configuration files are evidence of conventions, not final environment policy. |
| Tests | $(markdown_samples "${TEST_SAMPLES}") | Count: ${TEST_COUNT}; use as validation evidence only when tests match current behavior. |
| Persistence | $(markdown_samples "${PERSISTENCE_SAMPLES}") | Count: ${PERSISTENCE_COUNT}; mapper/repository names are structural evidence, not business vocabulary by themselves. |

## Local Exceptions

List only repository-specific implementation exceptions here.

| Rule | Local exception | Reason | Owner |
| --- | --- | --- | --- |
|  |  |  |  |

## Legacy Source Notes

If this project has legacy mixed documents such as \`.specify/memory/EngineeringStandard.md\` or \`.specify/coding_guide/*.md\`, treat them as inventory or same-project parity references only. Add facts here only when target code evidence or explicit user confirmation supports them.

New \`sdlc-*\` Skills read this file instead of legacy mixed documents.
EOF
  } > "${output}"
}

generate_repository_structure() {
  local output="$1"
  {
    cat <<EOF
# Repository Structure

> **Generated By**: ai-sdlc-standard project bootstrap
> **Project**: $(yaml_escape "${PROJECT_NAME}")

## Purpose

This document contains repository-specific structure and architecture facts.

Shared Speckit workflow and document governance rules live in \`${AI_SDLC_STANDARD_HOME:-<AI_SDLC_STANDARD_HOME>}/ai-sdlc/**\`.

## Source Roots

EOF
    emit_yaml_list "" "${SOURCE_ROOTS[@]}"
    cat <<EOF

## Module Globs

EOF
    emit_yaml_list "" "${MODULE_GLOBS[@]}"
    cat <<EOF

## Detected Entry Evidence

| Type | Count | Examples |
| --- | ---: | --- |
| HTTP Controller | ${HTTP_ENTRY_COUNT} | $(markdown_samples "${HTTP_ENTRY_SAMPLES}") |
| RPC Provider | ${RPC_PROVIDER_COUNT} | $(markdown_samples "${RPC_PROVIDER_SAMPLES}") |
| Message Listener | ${MESSAGE_ENTRY_COUNT} | $(markdown_samples "${MESSAGE_ENTRY_SAMPLES}") |
| Schedule / Job | ${SCHEDULE_ENTRY_COUNT} | $(markdown_samples "${SCHEDULE_ENTRY_SAMPLES}") |

## Detected Layer Evidence

| Layer | Count | Examples |
| --- | ---: | --- |
| Service | ${SERVICE_COUNT} | $(markdown_samples "${SERVICE_SAMPLES}") |
| Manager / Domain Service | ${MANAGER_COUNT} | $(markdown_samples "${MANAGER_SAMPLES}") |
| Persistence | ${PERSISTENCE_COUNT} | $(markdown_samples "${PERSISTENCE_SAMPLES}") |
| Tests | ${TEST_COUNT} | $(markdown_samples "${TEST_SAMPLES}") |

EOF
    cat <<'EOF'

## Module Boundaries

| Module | Responsibility | Notes |
| --- | --- | --- |
|  |  |  |

## Entry Locations

| Entry type | Path pattern | Notes |
| --- | --- | --- |
|  |  |  |

## Generated Or Excluded Paths

| Path | Reason |
| --- | --- |
|  |  |

## Legacy Source Notes

If this project has legacy mixed documents such as `.specify/memory/DocumentationStandard.md` or `.specify/workflow/*.md`, treat them as inventory or same-project parity references only. Add structure facts here only when target code evidence or explicit user confirmation supports them.

New `sdlc-*` Skills read this file instead of legacy mixed documents.
EOF
  } > "${output}"
}

generate_project_governance_overrides() {
  local output="$1"
  {
    cat <<EOF
# Project Governance Overrides

> **Generated By**: ai-sdlc-standard project bootstrap
> **Project**: $(yaml_escape "${PROJECT_NAME}")

## Purpose

This document records explicit local overrides to shared AI SDLC Standard rules.

Keep this file empty unless the project intentionally needs a local exception. Shared rules remain authoritative unless an override is listed here and mirrored in \`.specify/project-governance-profile.yaml\` under \`project_overrides\`.

## Overrides

| Override ID | Standard rule path/id | Local rule | Reason | Owner |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Legacy Source Notes

If this project has legacy mixed documents such as \`.specify/memory/AiGovernance.md\`, \`.specify/memory/InteractionProtocol.md\`, or \`.specify/workflow/*.md\`, treat them as inventory or same-project parity references only. Add overrides here only when the project explicitly confirms a local exception.

New \`sdlc-*\` Skills read this file instead of legacy mixed documents.
EOF
  } > "${output}"
}

generate_entry_profile() {
  local output="$1"
  {
    cat <<'EOF'
# Entry Coverage Profile
# Generated by ai-sdlc-standard scripts/bootstrap-speckit-project.sh

schema_version: 0.1.0

scope:
  source_roots:
EOF
    emit_yaml_list "    " "${SOURCE_ROOTS[@]}"
    cat <<'EOF'
  module_globs:
EOF
    emit_yaml_list "    " "${MODULE_GLOBS[@]}"
    cat <<'EOF'
  include_file_patterns:
    - "**/*"
  exclude_file_patterns:
    - "**/target/**"
    - "**/build/**"
    - "**/dist/**"
    - "**/.git/**"
    - "**/node_modules/**"
    - "**/.venv/**"
    - "**/venv/**"
    - "**/vendor/**"
    - "**/out/**"
    - "**/coverage/**"
    - "**/generated/**"
    - "**/.idea/**"
    - "**/.gradle/**"
    - "**/.mvn/**"
  document_scope: ".specify/business_domain"
  report_dir: ".specify/reports/entry_coverage"

entry_types:
EOF
    if [[ "${DETECTED_LANGUAGE}" == "java" ]]; then
      cat <<'EOF'
  - name: "controller"
    description: "HTTP or view controller entry."
    path_patterns:
      - "**/src/main/java/**/*Controller.java"
    class_name_patterns:
      - "*Controller"
    exclude_when:
      - "view-only routes may be marked as technical_bridge with evidence"
    evidence_mode: "business_chain"
  - name: "rpc_provider"
    description: "RPC or service-provider entry."
    path_patterns:
      - "**/src/main/java/**/*Impl.java"
      - "**/src/main/java/**/rpc/**/*.java"
    class_name_patterns:
      - "*Impl"
    exclude_when: []
    evidence_mode: "business_chain"
  - name: "message_listener"
    description: "MQ, event, or listener entry."
    path_patterns:
      - "**/src/main/java/**/*Listener.java"
      - "**/src/main/java/**/*Consumer.java"
      - "**/src/main/java/**/*Processor.java"
    class_name_patterns:
      - "*Listener"
      - "*Consumer"
      - "*Processor"
    exclude_when:
      - "abstract base classes"
    evidence_mode: "business_chain"
  - name: "scheduled_job"
    description: "Schedule, job, task, or worker entry."
    path_patterns:
      - "**/src/main/java/**/*Schedule.java"
      - "**/src/main/java/**/*Job.java"
      - "**/src/main/java/**/*Task.java"
      - "**/src/main/java/**/*Worker.java"
    class_name_patterns:
      - "*Schedule"
      - "*Job"
      - "*Task"
      - "*Worker"
    exclude_when:
      - "framework base classes"
    evidence_mode: "business_chain"
EOF
    else
      cat <<'EOF'
  - name: "<entry-type-name>"
    description: "<what this entry type means in this repository>"
    path_patterns:
      - "<regex-or-glob>"
    class_name_patterns:
      - "<regex-or-suffix-rule>"
    exclude_when:
      - "<optional-exclusion-rule>"
    evidence_mode: "business_chain"
EOF
    fi
    cat <<'EOF'

layers:
  entry:
    class_name_patterns:
      - "<EntryClassPattern>"
  service:
    path_patterns:
      - "<service-path-pattern>"
    class_name_patterns:
      - "*Service"
      - "*ServiceImpl"
  manager:
    path_patterns:
      - "<manager-or-domain-operation-path-pattern>"
    class_name_patterns:
      - "*Manager"
      - "*ManagerImpl"
      - "*DomainService"
  persistence:
    path_patterns:
      - "<mapper-or-dao-path-pattern>"
    class_name_patterns:
      - "*Mapper"
      - "*Dao"
      - "*DAO"
      - "*Repository"

evidence_chain:
  business_chain:
    required_layers:
      - entry
    recommended_layers:
      - service
      - manager
      - persistence
    allow_missing_layers_with_reason: true
  technical_bridge:
    allowed: true
    markers:
      - "ViewRouteOnly"
      - "ApplicationListener"
      - "Client"
      - "Template"
      - "Invoker"
      - "Adapter"
    required_reason: true

domain_matching:
  l4_document_pattern: ".specify/business_domain/**/[0-9][0-9][0-9][0-9][0-9][0-9]*.md"
  entry_match_rule: "entry class name appears in an L4 evidence table"
  allow_entry_in_multiple_l2_domains: false

strict_outputs:
  entry_inventory: "entry_inventory.tsv"
  service_inventory: "service_inventory.tsv"
  entry_chain_evidence: "entry_chain_evidence.md"
  unarchived_entries: "unarchived_entries.md"
  unarchived_services: "unarchived_services.md"
  cross_domain_conflicts: "cross_domain_conflicts.md"
  summary_report: "entry_coverage_report.md"

strict_blocking_conditions:
  - "entry has no L4 match"
  - "entry layer is missing and the entry is not an accepted technical bridge"
  - "recommended service, manager, or persistence evidence is missing without a reason"
  - "core service is not hit by an archived entry and no project-specific reason is recorded"
  - "entry is mapped to multiple L2 domains without explicit conflict handling"

notes:
  - "Do not put shared governance rules in this profile."
  - "Do not copy values from another repository unless they match this repository's code structure."
  - "The Java entry -> service -> manager -> persistence chain is a recommended default, not a universal hard requirement."
EOF
  } > "${output}"
}

generate_business_domain_bootstrap() {
  local output="$1"
  {
    cat <<'EOF'
# Business Domain Bootstrap Profile
# Generated by ai-sdlc-standard scripts/bootstrap-speckit-project.sh

schema_version: 0.1.0

generation_scope:
  project_bootstrap_includes_business_domain_content: false
  generate_after_project_bootstrap: true
  output_root: ".specify/business_domain"
  required_root_documents:
    - "00BusinessLandscape.md"
    - "00UbiquitousLanguage.md"
    - "01DomainCatalog.md"

inputs:
  code:
    source_roots:
EOF
    emit_yaml_list "      " "${SOURCE_ROOTS[@]}"
    cat <<'EOF'
    include_patterns:
      - "**/*"
    exclude_patterns:
      - "**/target/**"
      - "**/build/**"
      - "**/dist/**"
      - "**/.git/**"
      - "**/node_modules/**"
      - "**/.venv/**"
      - "**/venv/**"
      - "**/vendor/**"
      - "**/out/**"
      - "**/coverage/**"
      - "**/generated/**"
      - "**/.idea/**"
      - "**/.gradle/**"
      - "**/.mvn/**"
  existing_docs:
    include:
      - "<optional-current-project-doc-path-confirmed-by-user>"
    exclude:
      - ".specify/memory/**"
      - ".specify/workflow/**"
      - ".specify/coding_guide/**"
    legacy_reference_only:
      - ".specify/memory/**"
      - ".specify/workflow/**"
      - ".specify/coding_guide/**"
  user_supplied_context:
    required_when_business_domain_cannot_be_inferred: true
    examples:
      - "business domain names"
      - "main lifecycle or capability split"
      - "domain owners"

domain_discovery:
  strategy: "<business-lifecycle|business-capability|bounded-context|user-provided>"
  must_not_use_package_names_only: true
  require_human_confirmation_before_creating_new_l1_l2: true
  root_document_expectations:
    business_landscape:
      includes:
        - "repository business purpose"
        - "fact-source layering"
        - "routing principle"
        - "main business domains"
        - "code anchors"
    ubiquitous_language:
      includes:
        - "domain terms"
        - "status vocabulary"
        - "entity names"
        - "cross-team wording rules"
    domain_catalog:
      includes:
        - "L1/L2 domain index"
        - "main document paths"
        - "planned L4 count or maturity"
        - "routing notes"

skeleton_rules:
  structure: "physical_l2_logical_l4"
  l1_l2_directory_naming: "{two_digit_number}{EnglishName}"
  l2_main_document_naming: "{L2Number}{EnglishName}({ChineseName}).md"
  l4_document_naming: "{L1Number}{L2Number}{L4Number}{EnglishName}({ChineseName}).md"
  entry_coverage_document_suffix: "EntryCoverage"
  create_l4_only_when:
    - "observed from code and confirmed by routing"
    - "approved by user or domain owner"

outputs:
  required:
    - ".specify/business_domain/00BusinessLandscape.md"
    - ".specify/business_domain/00UbiquitousLanguage.md"
    - ".specify/business_domain/01DomainCatalog.md"
  optional:
    - "L1/L2 directories"
    - "L2 main documents"
    - "L4 skeleton documents"
    - "EntryCoverage documents"

validation:
  must_check:
    - "root documents exist"
    - "domain catalog links point to existing documents"
    - "new L1/L2/L4 names follow naming rules"
    - "business domains are based on code evidence or user-approved boundaries"
    - "no business_domain content was copied from another repository"
  stop_when:
    - "domain split cannot be inferred"
    - "code evidence conflicts with user-provided business boundary"
    - "generation would require guessing business meaning"
EOF
  } > "${output}"
}

markdown_samples() {
  local text="$1"
  if [[ -z "${text}" ]]; then
    printf '<none>'
    return 0
  fi
  printf '%s' "${text}" | paste -sd ', ' -
}

generate_generation_report() {
  local output="$1"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S')"
  {
    cat <<EOF
# Speckit Generation Report

> **Project**: $(yaml_escape "${PROJECT_NAME}")
> **Generated At**: ${generated_at}
> **Generated By**: ai-sdlc-standard
> **Target Repository**: ${TARGET_PATH}

## Summary

| Item | Value |
| --- | --- |
| Standard Package | $(yaml_escape "${STANDARD_PACKAGE}") |
| Runtime Resolvable | ${STANDARD_RUNTIME_RESOLVABLE} |
| Local Resolution Required | ${STANDARD_LOCAL_RESOLUTION_REQUIRED} |
| Language | $(yaml_escape "${DETECTED_LANGUAGE}") |
| Application Type | $(yaml_escape "${DETECTED_APPLICATION_TYPE}") |
| Legacy Speckit Documents Found | ${LEGACY_FOUND} |
| Parity Check | ${PARITY_CHECK_RESULT} |
| Code Evidence Completeness Check | ${CODE_EVIDENCE_RESULT} |

## Code Evidence

| Evidence Type | Count | Examples |
| --- | ---: | --- |
| Source roots | ${SOURCE_ROOT_COUNT} | $(markdown_samples "${SOURCE_ROOTS_TEXT}") |
| Modules | ${MODULE_COUNT} | $(markdown_samples "${MODULE_GLOBS_TEXT}") |
| HTTP controllers | ${HTTP_ENTRY_COUNT} | $(markdown_samples "${HTTP_ENTRY_SAMPLES}") |
| RPC providers | ${RPC_PROVIDER_COUNT} | $(markdown_samples "${RPC_PROVIDER_SAMPLES}") |
| Message listeners | ${MESSAGE_ENTRY_COUNT} | $(markdown_samples "${MESSAGE_ENTRY_SAMPLES}") |
| Schedules / jobs | ${SCHEDULE_ENTRY_COUNT} | $(markdown_samples "${SCHEDULE_ENTRY_SAMPLES}") |
| Total entries | ${TOTAL_ENTRY_COUNT} | Derived from HTTP + RPC + message + schedule evidence. |
| Services | ${SERVICE_COUNT} | $(markdown_samples "${SERVICE_SAMPLES}") |
| Managers / domain services | ${MANAGER_COUNT} | $(markdown_samples "${MANAGER_SAMPLES}") |
| Persistence | ${PERSISTENCE_COUNT} | $(markdown_samples "${PERSISTENCE_SAMPLES}") |
| MQ / events | ${MQ_COUNT} | $(markdown_samples "${MQ_SAMPLES}") |
| Schedule-like files | ${SCHEDULE_COUNT} | $(markdown_samples "${SCHEDULE_SAMPLES}") |
| Cache / lock | ${CACHE_LOCK_COUNT} | $(markdown_samples "${CACHE_LOCK_SAMPLES}") |
| Config | ${CONFIG_COUNT} | $(markdown_samples "${CONFIG_SAMPLES}") |
| Tests | ${TEST_COUNT} | $(markdown_samples "${TEST_SAMPLES}") |

## User-Confirmed Facts

No user-confirmed project facts were supplied to this bootstrap run.

## Not Inferred From Code

| Missing Fact | Why Code Is Insufficient | Required Confirmation |
| --- | --- | --- |
| Business domain names | Package and class names are evidence, not authoritative business boundaries. | Confirm L1/L2/L4 split before generating business_domain. |
| Business-visible statuses | Code enums may include technical and legacy states. | Confirm visible status vocabulary before long-term sync. |
| Whether legacy files are current | Legacy files are optional parity references only. | Confirm before treating them as same-project parity references. |

## Generated Files

| File | Action | Source Basis |
| --- | --- | --- |
| .specify/project-governance-profile.yaml | generated or preflighted | target path, git remote, detected code layout, standard template |
| .specify/entry-coverage-profile.yaml | generated or preflighted | detected language and code layout |
| .specify/business-domain-bootstrap.yaml | generated or preflighted | target code scan configuration |
| .specify/project-context/ProjectCodingGuide.md | generated or candidate | target code technical convention evidence |
| .specify/project-context/RepositoryStructure.md | generated or candidate | source roots, module globs, entry evidence, and layer evidence |
| .specify/project-context/ProjectGovernanceOverrides.md | generated or candidate | empty unless explicit overrides exist |

## Legacy Reference

Legacy files, when present, are inventory or same-project parity references only. They were not used as primary generated content.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| No legacy primary source | pass | New project-private documents are generated from standard templates and target code scan metadata. |
| No legacy files modified | pass | Bootstrap does not write .specify/memory, .specify/workflow, or .specify/coding_guide. |
| Project-context overwrite avoided | pass | Existing project-context files are written as .candidate unless --force-context is explicit. |
| Code evidence completeness | ${CODE_EVIDENCE_RESULT} | Business boundaries still require confirmation before business_domain generation. |
| Runtime standard package resolution | ${STANDARD_RUNTIME_RESOLVABLE} | local_resolution_required=${STANDARD_LOCAL_RESOLUTION_REQUIRED}. |

## Next Steps

- Review generated profiles and project-context files.
- Confirm business domain boundaries before generating .specify/business_domain/**.
- If legacy files exist, treat the pending equivalence report as not-ready until comparable \`specs/**\` or \`.specify/business_domain/**\` outputs exist.
EOF
  } > "${output}"
}

generate_legacy_inventory() {
  local output="$1"
  {
    cat <<EOF
# Legacy Speckit Source Inventory

> **Project**: $(yaml_escape "${PROJECT_NAME}")
> **Role**: inventory and optional same-project parity reference only

Legacy files are not primary content sources for the new AI SDLC Speckit rail.

| Legacy Path | Role | Modified |
| --- | --- | --- |
EOF
    if [[ -z "${LEGACY_FILES_TEXT}" ]]; then
      printf '| <none> | not applicable | no |\n'
    else
      local legacy_file
      while IFS= read -r legacy_file; do
        [[ -n "${legacy_file}" ]] && printf '| %s | parity-reference-only | no |\n' "${legacy_file}"
      done <<< "${LEGACY_FILES_TEXT}"
    fi
  } > "${output}"
}

generate_equivalence_report() {
  local output="$1"
  {
    cat <<EOF
# Speckit Equivalence Report

> **Project**: $(yaml_escape "${PROJECT_NAME}")
> **Scope**: Same-project legacy/new workflow product comparison

## Summary

| Item | Value |
| --- | --- |
| Legacy Output | legacy Speckit files detected |
| New Output | project bootstrap profiles and context documents |
| Semantic Equivalence | not-ready |
| Structural Differences | not-started |
| Conclusion | not-started |

This report is not a PASS artifact. Bootstrap only inventories legacy files and generated project-private context; semantic comparison requires comparable \`specs/**\` or \`.specify/business_domain/**\` outputs for the same scope.

## Legacy Output

| Path | Role | Notes |
| --- | --- | --- |
EOF
    local legacy_file
    while IFS= read -r legacy_file; do
      [[ -n "${legacy_file}" ]] && printf '| %s | parity reference only | content not copied |\n' "${legacy_file}"
    done <<< "${LEGACY_FILES_TEXT}"
    cat <<'EOF'

## New Output

| Path | Source Basis | Notes |
| --- | --- | --- |
| .specify/project-governance-profile.yaml | target repository metadata and standard template | generated by bootstrap |
| .specify/entry-coverage-profile.yaml | target code scan and standard defaults | generated by bootstrap |
| .specify/project-context/** | target code scan and user-confirmed facts when supplied | generated or candidate |

## Semantic Comparison

Semantic comparison must be completed after the new rail produces comparable \`specs/**\` or \`.specify/business_domain/**\` outputs for the same project and scope.

## Conclusion

Not started. Legacy files were inventoried only; no legacy content was copied into new generated files.
EOF
  } > "${output}"
}

preflight_profile_targets

if [[ "${DRY_RUN}" != "true" ]]; then
  mkdir -p "${SPECIFY_DIR}/reports"
  mkdir -p "${SPECIFY_DIR}/project-context"
  mkdir -p "${TARGET_PATH}/library"
fi

write_or_preview "${SPECIFY_DIR}/project-governance-profile.yaml" generate_project_profile profile
write_or_preview "${SPECIFY_DIR}/entry-coverage-profile.yaml" generate_entry_profile profile
write_or_preview "${SPECIFY_DIR}/business-domain-bootstrap.yaml" generate_business_domain_bootstrap profile
write_or_preview "${SPECIFY_DIR}/project-context/ProjectCodingGuide.md" generate_project_coding_guide context
write_or_preview "${SPECIFY_DIR}/project-context/RepositoryStructure.md" generate_repository_structure context
write_or_preview "${SPECIFY_DIR}/project-context/ProjectGovernanceOverrides.md" generate_project_governance_overrides context
write_or_preview "${SPECIFY_DIR}/reports/speckit_generation_report.md" generate_generation_report report

if [[ "${LEGACY_FOUND}" == "true" ]]; then
  write_or_preview "${SPECIFY_DIR}/reports/legacy_speckit_source_inventory.md" generate_legacy_inventory report
  write_or_preview "${SPECIFY_DIR}/reports/speckit_equivalence_report.pending.md" generate_equivalence_report report
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '\n--- .specify/project-context/ ---\n'
  echo "Would create project-context/ for split project-private documents."
  printf '\n--- library/ ---\n'
  echo "Would create library/ for human handoff artifacts."
  preview_gitignore_entry
else
  echo "Generated library/"
  ensure_gitignore_entry
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '\nDry run complete. No files were written.\n'
else
  echo "Generated .specify/reports/"
  echo "Project bootstrap complete for ${PROJECT_NAME}."
  echo "Next: generate .specify/business_domain/** from this target repository; do not copy it from another repository."
fi
