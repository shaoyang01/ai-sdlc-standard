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
  --force                        Overwrite generated profile files when they already exist.
  --dry-run                      Print generated files without writing.
  -h, --help                     Show this help.

Generated files:
  .specify/project-governance-profile.yaml
  .specify/entry-coverage-profile.yaml
  .specify/business-domain-bootstrap.yaml
  .specify/project-context/ProjectCodingGuide.md
  .specify/project-context/RepositoryStructure.md
  .specify/project-context/ProjectGovernanceOverrides.md
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
FORCE="false"
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
    --force)
      FORCE="true"
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

check_writable_target() {
  local file="$1"
  if [[ -e "${file}" && "${FORCE}" != "true" ]]; then
    echo "Refusing to overwrite existing file: ${file}" >&2
    echo "Use --force to overwrite, or edit it manually." >&2
    exit 1
  fi
}

write_or_preview() {
  local file="$1"
  local generator="$2"
  if [[ "${DRY_RUN}" == "true" ]]; then
    local preview_file
    preview_file="$(mktemp "${TMPDIR:-/tmp}/speckit-bootstrap-preview.XXXXXX")"
    "${generator}" "${preview_file}"
    printf '\n--- %s ---\n' "${file#${TARGET_PATH}/}"
    cat "${preview_file}"
    rm -f "${preview_file}"
  else
    check_writable_target "${file}"
    "${generator}" "${file}"
    echo "Generated ${file#${TARGET_PATH}/}"
  fi
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
  shared_rules:
    - ai-sdlc/lifecycle.md
    - ai-sdlc/artifact-storage.md
    - ai-sdlc/change-control.md
    - ai-sdlc/complexity-routing.md
    - ai-sdlc/standard-package-resolution.md
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

## Purpose

This document contains project-specific coding rules only.

Shared workflow, gate, checklist, and generic engineering rules live in \`${AI_SDLC_STANDARD_HOME:-<AI_SDLC_STANDARD_HOME>}/ai-sdlc/**\` and must not be copied here.

## Local Implementation Rules

- Project-specific framework adapters:
- Project-specific utility classes:
- Project-specific package naming rules:
- Project-specific DTO/entity/model conversion rules:
- Project-specific cache, lock, MQ, RPC, or config conventions:

## Local Exceptions

List only repository-specific implementation exceptions here.

| Rule | Local exception | Reason | Owner |
| --- | --- | --- | --- |
|  |  |  |  |

## Legacy Source Notes

If this project has legacy mixed documents such as \`.specify/memory/EngineeringStandard.md\` or \`.specify/coding_guide/*.md\`, extract only project-specific facts into this file during a one-time split task.

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

If this project has legacy mixed documents such as `.specify/memory/DocumentationStandard.md` or `.specify/workflow/*.md`, extract only repository-specific structure facts into this file during a one-time split task.

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

If this project has legacy mixed documents such as \`.specify/memory/AiGovernance.md\`, \`.specify/memory/InteractionProtocol.md\`, or \`.specify/workflow/*.md\`, extract only explicit project-specific overrides into this file during a one-time split task.

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
      - service
      - manager
      - persistence
    allow_missing_layers_with_reason: false
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
  - "entry has no required evidence chain and is not an accepted technical bridge"
  - "core service is not hit by an archived entry"
  - "entry is mapped to multiple L2 domains without explicit conflict handling"

notes:
  - "Do not put shared governance rules in this profile."
  - "Do not copy values from another repository unless they match this repository's code structure."
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
  existing_docs:
    include:
      - "<optional-existing-project-doc-path>"
    exclude:
      - ".specify/memory/**"
      - ".specify/workflow/**"
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

if [[ "${DRY_RUN}" != "true" ]]; then
  mkdir -p "${SPECIFY_DIR}/reports"
  mkdir -p "${SPECIFY_DIR}/project-context"
  mkdir -p "${TARGET_PATH}/library"
fi

write_or_preview "${SPECIFY_DIR}/project-governance-profile.yaml" generate_project_profile
write_or_preview "${SPECIFY_DIR}/entry-coverage-profile.yaml" generate_entry_profile
write_or_preview "${SPECIFY_DIR}/business-domain-bootstrap.yaml" generate_business_domain_bootstrap
write_or_preview "${SPECIFY_DIR}/project-context/ProjectCodingGuide.md" generate_project_coding_guide
write_or_preview "${SPECIFY_DIR}/project-context/RepositoryStructure.md" generate_repository_structure
write_or_preview "${SPECIFY_DIR}/project-context/ProjectGovernanceOverrides.md" generate_project_governance_overrides

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
