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
  .specify/project-context/ProjectWorkflowGuide.md
  .specify/project-context/ProjectDocumentationGuide.md
  .specify/project-context/ProjectCodingGuide.md
  .specify/project-context/RepositoryStructure.md
  .specify/project-context/ProjectGovernanceOverrides.md
  .specify/reports/speckit_generation_report.md
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

has_java_source_signal() {
  [[ -f "${TARGET_PATH}/pom.xml" ]] && return 0
  find "${TARGET_PATH}" -maxdepth 6 \
    \( \
      -path "*/.git" -o \
      -path "*/target" -o \
      -path "*/build" -o \
      -path "*/dist" -o \
      -path "*/node_modules" -o \
      -path "*/.venv" -o \
      -path "*/venv" -o \
      -path "*/vendor" -o \
      -path "${TARGET_PATH}/out" -o \
      -path "*/coverage" -o \
      -path "*/generated" -o \
      -path "*/.idea" -o \
      -path "*/.gradle" -o \
      -path "*/.mvn" \
    \) -prune -o -path '*/src/main/java' -type d -print -quit 2>/dev/null | grep -q .
}

has_package_frontend_dependency() {
  [[ -f "${TARGET_PATH}/package.json" ]] || return 1
  grep -Eq '"(react-native|react|vue|@angular/core|next|nuxt|vite|umi|dva|mobx|redux|@react-navigation/native)"' "${TARGET_PATH}/package.json"
}

has_frontend_source_signal() {
  has_package_frontend_dependency && return 0
  find "${TARGET_PATH}" -maxdepth 6 \
    \( \
      -path "*/.git" -o \
      -path "*/target" -o \
      -path "*/build" -o \
      -path "*/dist" -o \
      -path "*/node_modules" -o \
      -path "*/.venv" -o \
      -path "*/venv" -o \
      -path "*/vendor" -o \
      -path "${TARGET_PATH}/out" -o \
      -path "*/coverage" -o \
      -path "*/generated" -o \
      -path "*/.idea" -o \
      -path "*/.gradle" -o \
      -path "*/.mvn" \
    \) -prune -o -type d \
    \( \
      -path "*/src/pages" -o \
      -path "*/src/views" -o \
      -path "*/src/screens" -o \
      -path "*/src/components" -o \
      -path "*/src/component" -o \
      -path "*/src/navigation" -o \
      -path "*/src/router" -o \
      -path "*/src/routers" -o \
      -path "*/src/routes" -o \
      -path "*/src/store" -o \
      -path "*/src/stores" -o \
      -path "*/src/models" -o \
      -path "*/src/actions" -o \
      -path "*/src/api" -o \
      -path "*/src/services" \
    \) -print -quit 2>/dev/null | grep -q .
}

has_server_rendered_web_signal() {
  find "${TARGET_PATH}" -maxdepth 7 \
    \( \
      -path "*/.git" -o \
      -path "*/target" -o \
      -path "*/build" -o \
      -path "*/dist" -o \
      -path "*/node_modules" -o \
      -path "*/.venv" -o \
      -path "*/venv" -o \
      -path "*/vendor" -o \
      -path "${TARGET_PATH}/out" -o \
      -path "*/coverage" -o \
      -path "*/generated" -o \
      -path "*/.idea" -o \
      -path "*/.gradle" -o \
      -path "*/.mvn" \
    \) -prune -o \
    \( \
      -path "*/src/main/webapp/WEB-INF/*" -o \
      -path "*/src/main/webapp/js/*" -o \
      -path "*/src/main/webapp/static/*" -o \
      -path "*/src/main/webapp/pages/*" -o \
      -path "*/src/main/webapp/views/*" -o \
      -name "*.jsp" -o \
      -name "*.ftl" -o \
      -name "*.vm" \
    \) -print -quit 2>/dev/null | grep -q .
}

has_user_interface_signal() {
  has_frontend_source_signal || has_server_rendered_web_signal
}

has_data_pipeline_source_signal() {
  find "${TARGET_PATH}" -maxdepth 8 \
    \( \
      -path "*/.git" -o \
      -path "*/target" -o \
      -path "*/build" -o \
      -path "*/dist" -o \
      -path "*/node_modules" -o \
      -path "*/.venv" -o \
      -path "*/venv" -o \
      -path "*/vendor" -o \
      -path "${TARGET_PATH}/out" -o \
      -path "*/coverage" -o \
      -path "*/generated" -o \
      -path "*/.idea" -o \
      -path "*/.gradle" -o \
      -path "*/.mvn" \
    \) -prune -o \
    \( \
      -path "*/finance-spark-service/*" -o \
      -path "*/finance-flink-service/*" -o \
      -path "*/src/main/java/*/etl/job/*" -o \
      -path "*/src/main/java/*/online/*" -o \
      -path "*/src/main/java/*/func/process/*" -o \
      -path "*/src/main/java/*/connectors/mcq/*" -o \
      -name "*Etl.java" -o \
      -name "*Function.java" \
    \) -print -quit 2>/dev/null | grep -q .
}

detect_language() {
  if [[ -n "${LANGUAGE}" ]]; then
    printf '%s\n' "${LANGUAGE}"
  elif has_frontend_source_signal && [[ ! -f "${TARGET_PATH}/pom.xml" ]]; then
    printf 'typescript\n'
  elif has_frontend_source_signal && has_java_source_signal; then
    printf 'mixed\n'
  elif has_java_source_signal; then
    printf 'java\n'
  elif [[ -f "${TARGET_PATH}/package.json" ]] || find "${TARGET_PATH}" -maxdepth 5 \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -type f 2>/dev/null | grep -q .; then
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
  elif has_data_pipeline_source_signal; then
    printf 'batch\n'
  elif has_frontend_source_signal; then
    printf 'frontend\n'
  elif has_server_rendered_web_signal && has_java_source_signal; then
    printf 'fullstack\n'
  elif has_server_rendered_web_signal; then
    printf 'frontend\n'
  elif [[ "${detected_language}" == "java" ]]; then
    printf 'backend\n'
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
  done < <(find "${TARGET_PATH}" -maxdepth 6 \
    \( \
      -path "*/.git" -o \
      -path "*/target" -o \
      -path "*/build" -o \
      -path "*/dist" -o \
      -path "*/node_modules" -o \
      -path "*/.venv" -o \
      -path "*/venv" -o \
      -path "*/vendor" -o \
      -path "${TARGET_PATH}/out" -o \
      -path "*/coverage" -o \
      -path "*/generated" -o \
      -path "*/.idea" -o \
      -path "*/.gradle" -o \
      -path "*/.mvn" \
    \) -prune -o -path '*/src/main/java' -type d -print 2>/dev/null | sort)

  if has_user_interface_signal; then
    while IFS= read -r dir; do
      dir="${dir#${TARGET_PATH}/}"
      roots="${roots}${dir}"$'\n'
    done < <(find "${TARGET_PATH}" -maxdepth 5 \
      \( \
        -path "*/.git" -o \
        -path "*/target" -o \
        -path "*/build" -o \
        -path "*/dist" -o \
        -path "*/node_modules" -o \
        -path "*/.venv" -o \
        -path "*/venv" -o \
        -path "*/vendor" -o \
        -path "${TARGET_PATH}/out" -o \
        -path "*/coverage" -o \
        -path "*/generated" -o \
        -path "*/.idea" -o \
        -path "*/.gradle" -o \
        -path "*/.mvn" \
      \) -prune -o -type d \
      \( \
        -path "*/src" -o \
        -path "*/app" -o \
        -path "*/lib" -o \
        -path "*/src/main/webapp" \
      \) -print 2>/dev/null | sort)
  fi

  if [[ -z "${roots}" ]]; then
    while IFS= read -r dir; do
      dir="${dir#${TARGET_PATH}/}"
      roots="${roots}${dir}"$'\n'
    done < <(find "${TARGET_PATH}" -maxdepth 3 \
      \( \
        -path "*/.git" -o \
        -path "*/target" -o \
        -path "*/build" -o \
        -path "*/dist" -o \
        -path "*/node_modules" -o \
        -path "*/.venv" -o \
        -path "*/venv" -o \
        -path "*/vendor" -o \
        -path "${TARGET_PATH}/out" -o \
        -path "*/coverage" -o \
        -path "*/generated" -o \
        -path "*/.idea" -o \
        -path "*/.gradle" -o \
        -path "*/.mvn" \
      \) -prune -o -type d \( -name src -o -name app -o -name lib \) -print 2>/dev/null | sort)
  fi

  if [[ -z "${roots}" ]]; then
    printf '.\n'
  else
    printf '%s' "${roots}" | sed '/^$/d' | sort -u
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
  done < <(find "${TARGET_PATH}" -mindepth 2 -maxdepth 3 \
    \( \
      -path "*/.git" -o \
      -path "*/target" -o \
      -path "*/build" -o \
      -path "*/dist" -o \
      -path "*/node_modules" -o \
      -path "*/.venv" -o \
      -path "*/venv" -o \
      -path "*/vendor" -o \
      -path "${TARGET_PATH}/out" -o \
      -path "*/coverage" -o \
      -path "*/generated" -o \
      -path "*/.idea" -o \
      -path "*/.gradle" -o \
      -path "*/.mvn" \
    \) -prune -o -path '*/src/main' -type d -print 2>/dev/null | sed 's#/src/main$##' | sort -u)

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
  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    if [[ "${kind}" == "rpc_provider" && "${path}" == *"/rpc/"* && "$(basename "${path}")" == *.java ]]; then
      printf '%s\n' "${path}"
    elif matches_kind "${kind}" "$(basename "${path}")"; then
      printf '%s\n' "${path}"
    fi
  done <<< "${PROJECT_FILES_TEXT}"
}

collect_project_files() {
  local roots=()
  local root
  for root in "${SOURCE_ROOTS[@]}"; do
    if [[ "${root}" == "." ]]; then
      roots=("${TARGET_PATH}")
      break
    fi
    [[ -d "${TARGET_PATH}/${root}" ]] && roots+=("${TARGET_PATH}/${root}")
  done
  if [[ "${#roots[@]}" -eq 0 ]]; then
    roots=("${TARGET_PATH}")
  fi

  find "${roots[@]}" \
    \( \
      -path "*/.git/*" -o -path "*/.git" -o \
      -path "*/target/*" -o -path "*/target" -o \
      -path "*/build/*" -o -path "*/build" -o \
      -path "*/dist/*" -o -path "*/dist" -o \
      -path "*/node_modules/*" -o -path "*/node_modules" -o \
      -path "*/.venv/*" -o -path "*/.venv" -o \
      -path "*/venv/*" -o -path "*/venv" -o \
      -path "*/vendor/*" -o -path "*/vendor" -o \
      -path "${TARGET_PATH}/out/*" -o -path "${TARGET_PATH}/out" -o \
      -path "*/coverage/*" -o -path "*/coverage" -o \
      -path "*/generated/*" -o -path "*/generated" -o \
      -path "*/.idea/*" -o -path "*/.idea" -o \
      -path "*/.gradle/*" -o -path "*/.gradle" -o \
      -path "*/.mvn/*" -o -path "*/.mvn" \
    \) -prune -o -type f -print 2>/dev/null | sed "s#^${TARGET_PATH}/##"
}

count_matching_files() {
  matching_files_for_kind "$1" | wc -l | tr -d ' '
}

sample_matching_files() {
  matching_files_for_kind "$1" | sort | head -n 5
}

PROJECT_FILES_TEXT="$(collect_project_files)"
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

has_project_path() {
  local pattern="$1"
  local path
  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    if [[ "${path}" == ${pattern} || "${TARGET_PATH}/${path}" == ${pattern} ]]; then
      return 0
    fi
  done <<< "${PROJECT_FILES_TEXT}"
  return 1
}

has_backend_execution_signal() {
  [[ "${HTTP_ENTRY_COUNT}" -gt 0 || "${RPC_PROVIDER_COUNT}" -gt 0 || "${MESSAGE_ENTRY_COUNT}" -gt 0 || "${SCHEDULE_ENTRY_COUNT}" -gt 0 ]]
}

has_data_pipeline_execution_signal() {
  has_project_path "finance-spark-service/*" ||
  has_project_path "*/finance-spark-service/*" ||
  has_project_path "finance-flink-service/*" ||
  has_project_path "*/finance-flink-service/*" ||
  has_project_path "src/main/java/*/etl/job/*" ||
  has_project_path "*/src/main/java/*/etl/job/*" ||
  has_project_path "src/main/java/*/online/*" ||
  has_project_path "*/src/main/java/*/online/*" ||
  has_project_path "src/main/java/*/func/process/*" ||
  has_project_path "*/src/main/java/*/func/process/*" ||
  has_project_path "src/main/java/*/connectors/mcq/*" ||
  has_project_path "*/src/main/java/*/connectors/mcq/*" ||
  has_project_path "*Etl.java" ||
  has_project_path "*Function.java"
}

has_admin_mixed_execution_signal() {
  has_project_path "src/main/java/*/data/console/*" ||
  has_project_path "*/src/main/java/*/data/console/*" ||
  has_project_path "src/main/java/*/oas/event/*" ||
  has_project_path "*/src/main/java/*/oas/event/*" ||
  has_project_path "src/main/java/*/spi/*" ||
  has_project_path "*/src/main/java/*/spi/*" ||
  has_project_path "*Approval*Controller.java" ||
  has_project_path "*Audit*Controller.java" ||
  has_project_path "*/src/main/java/*/config/schedule/*Processor.java" ||
  has_project_path "*/src/main/java/*/worker/schedule/*Config*Processor.java" ||
  has_project_path "*/src/main/java/*/worker/schedule/*Month*Processor.java"
}

detect_project_type_profiles() {
  local detected_any="false"
  local selected_data_pipeline="false"
  local selected_frontend="false"

  if has_data_pipeline_execution_signal; then
    printf 'data-pipeline-etl\n'
    detected_any="true"
    selected_data_pipeline="true"
  fi

  if has_user_interface_signal; then
    printf 'frontend-application\n'
    detected_any="true"
    selected_frontend="true"
  fi

  if has_admin_mixed_execution_signal; then
    printf 'admin-mixed-workflow\n'
    detected_any="true"
  fi

  if has_java_source_signal && has_backend_execution_signal && {
    { [[ "${selected_frontend}" != "true" && "${selected_data_pipeline}" != "true" ]]; } ||
    [[ "${HTTP_ENTRY_COUNT}" -gt 0 || "${RPC_PROVIDER_COUNT}" -gt 0 ]]
  }; then
    printf 'backend-business-service\n'
    detected_any="true"
  fi

  if has_java_source_signal && [[ "${detected_any}" == "false" ]]; then
    printf 'backend-business-service\n'
    detected_any="true"
  fi

  if [[ "${DETECTED_APPLICATION_TYPE}" == "library" && "${detected_any}" == "false" ]]; then
    printf 'library-shared-component\n'
    detected_any="true"
  fi

  if [[ "${detected_any}" == "false" ]]; then
    printf 'mixed\n'
  fi
}

PROJECT_TYPE_PROFILES_TEXT="$(detect_project_type_profiles | awk '!seen[$0]++')"
PROJECT_TYPE_PROFILES=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && PROJECT_TYPE_PROFILES+=("${line}")
done <<< "${PROJECT_TYPE_PROFILES_TEXT}"

LEGACY_FILES_TEXT="$(find "${SPECIFY_DIR}" -type f \( -path "${SPECIFY_DIR}/memory/*" -o -path "${SPECIFY_DIR}/workflow/*" -o -path "${SPECIFY_DIR}/coding_guide/*" \) 2>/dev/null | sort | sed "s#^${TARGET_PATH}/##" || true)"
if [[ -n "${LEGACY_FILES_TEXT}" ]]; then
  LEGACY_FOUND="true"
  LEGACY_BOOTSTRAP_ACTION="preserved_not_read"
else
  LEGACY_FOUND="false"
  LEGACY_BOOTSTRAP_ACTION="not_present"
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
    - ai-sdlc/speckit-project-type-profiles.md
    - ai-sdlc/speckit-skill-product-compatibility.md
    - ai-sdlc/speckit-project-bootstrap.md

project:
  name: "$(yaml_escape "${PROJECT_NAME}")"
  repository: "$(yaml_escape "${REMOTE_URL}")"
  primary_language: "$(yaml_escape "${DETECTED_LANGUAGE}")"
  application_type: "$(yaml_escape "${DETECTED_APPLICATION_TYPE}")"
  project_type_profiles:
EOF
    emit_yaml_list "    " "${PROJECT_TYPE_PROFILES[@]}"
    cat <<'EOF'
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
    - ".specify/project-context/ProjectWorkflowGuide.md"
    - ".specify/project-context/ProjectDocumentationGuide.md"
    - ".specify/project-context/ProjectCodingGuide.md"
    - ".specify/project-context/RepositoryStructure.md"
    - ".specify/project-context/ProjectGovernanceOverrides.md"
  legacy:
    memory_files_authoritative: false
    workflow_files_authoritative: false
    notes: "Legacy .specify/memory, .specify/workflow, or .specify/coding_guide files are preserved for legacy workflows and are not runtime inputs for this bootstrap."

speckit_dual_rail:
  enabled: true
  legacy_rail:
    preserved: true
    mutable_by_sdlc: false
    authoritative_for_legacy_skills: true
    role_for_sdlc: "preserved_not_runtime_input"
  sdlc_rail:
    authoritative_for_sdlc_skills: true
    shared_standard_source: "${AI_SDLC_STANDARD_HOME}"
    private_project_sources:
      - ".specify/project-context/ProjectWorkflowGuide.md"
      - ".specify/project-context/ProjectDocumentationGuide.md"
      - ".specify/project-context/ProjectCodingGuide.md"
      - ".specify/project-context/RepositoryStructure.md"
      - ".specify/project-context/ProjectGovernanceOverrides.md"
    must_not_read_legacy_sources: true
  product_artifacts:
    specs_are_products: true
    business_domain_is_product: true
    runtime_legacy_comparison: false

speckit_semantic_profile:
  standard_reference: "${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-project-type-profiles.md"
  product_compatibility_reference: "${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-skill-product-compatibility.md"
  selected_profiles:
EOF
    emit_yaml_list "    " "${PROJECT_TYPE_PROFILES[@]}"
    cat <<'EOF'
  semantic_surface:
    workflow_semantics: "stage order, context resolution, redlines, mandatory artifacts"
    document_semantics: "metadata, revision, naming, splitting, L1/L2/L4, subdocument rules"
    business_domain_semantics: "landscape, glossary, status vocabulary, lifecycle, owners, code anchors"
    entry_coverage_semantics: "project-type entry discovery, evidence chains, strict reports, blockers"
    coding_semantics: "project-type engineering rules, side effects, adapters, implementation redlines"
    sync_semantics: "stable fact eligibility, implementation-to-business-domain sync, drift handling"
    audit_semantics: "governance audit, gate checks, strict blockers, report interpretation"
    artifact_boundary_semantics: "specs, library, project-context, business_domain, reports ownership"
  runtime_source_policy:
    standard_rules: "${AI_SDLC_STANDARD_HOME}/ai-sdlc/**"
    project_facts: "target code plus explicit user-confirmed facts"
    legacy_files: "preserved_not_runtime_input"

project_private_documents:
  workflow_guides:
    - path: ".specify/project-context/ProjectWorkflowGuide.md"
      required: false
      purpose: "Project-specific new-rail pipeline workflow constraints, confirmation policy, release, branch, verification, and rollback rules."
  documentation_guides:
    - path: ".specify/project-context/ProjectDocumentationGuide.md"
      required: false
      purpose: "Project-specific business_domain, L4, EntryCoverage, document index, and documentation shape rules."
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
      purpose: "Preserved for legacy workflows; not read by new-rail bootstrap or normal sdlc-* execution."
    - path: ".specify/workflow/**"
      required: false
      purpose: "Preserved for legacy workflows; not read by new-rail bootstrap or normal sdlc-* execution."

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
    - ".specify/project-context/ProjectWorkflowGuide.md"
    - ".specify/project-context/ProjectDocumentationGuide.md"
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
  legacy_runtime_action: "preserved_not_read"
  project_facts_preserved: []
  unresolved_questions: []
EOF
  } > "${output}"
}

generate_project_workflow_guide() {
  local output="$1"
  {
    cat <<EOF
# Project Workflow Guide

> **Generated By**: ai-sdlc-standard project bootstrap
> **Project**: $(yaml_escape "${PROJECT_NAME}")
> **Status**: Evidence scaffold, not an authoritative local workflow standard

## Purpose

This document records project-specific workflow constraints for the New-Rail Enhanced Pipeline.

Shared lifecycle, Gate, stage order, and artifact rules live in \`${AI_SDLC_STANDARD_HOME:-<AI_SDLC_STANDARD_HOME>}/ai-sdlc/**\` and in the \`sdlc-*\` Skill contracts. Do not copy shared rules into this file.

Use this file only for confirmed local constraints such as branch policy, release windows, verification commands, rollback requirements, and confirmation policy exceptions.

## Pipeline Confirmation Policy

The default pipeline asks for next-stage confirmation before the Clarify boundary only. After Clarify passes, Plan, Tasks, Analyze, Implement, Sync, and Reconcile run in order without stage-by-stage transition prompts.

Any required write authorization must be collected before entering the post-Clarify continuous execution segment.

| Boundary | Default | Project Override | Owner |
| --- | --- | --- | --- |
| Enter full SDD when direct implementation was recommended | Require explicit confirmation |  |  |
| Preflight -> Domain Route | Ask whether to enter next stage |  |  |
| Domain Route -> Specify | Ask whether to enter next stage |  |  |
| Specify -> Clarify | Ask whether to enter next stage |  |  |
| Clarify -> post-Clarify continuous execution | Continue only after required downstream authorization is complete |  |  |
| Enter implementation | Authorize before post-Clarify continuous execution |  |  |
| Write \`.specify/business_domain/**\` through Sync | Authorize target and write before post-Clarify continuous execution |  |  |
| Apply reconcile updates | Authorize before post-Clarify continuous execution when apply is requested |  |  |
| Accept \`PASS_WITH_RISK\` owner change | Confirm before post-Clarify continuous execution when downstream Gates depend on it |  |  |
| Create new L4 / EntryCoverage skeleton | Require user or owner approval |  |  |

## Branch, Release, And Rollback Constraints

List only confirmed local workflow rules.

| Area | Local rule | Evidence / Confirmation | Owner |
| --- | --- | --- | --- |
| Branch |  |  |  |
| Release |  |  |  |
| Rollback |  |  |  |
| Deployment window |  |  |  |

## Verification Constraints

| Scope | Required command or evidence | Notes |
| --- | --- | --- |
| Unit / module validation |  |  |
| Integration validation |  |  |
| Frontend validation |  |  |
| Data / ETL validation |  |  |

## Direct Implementation Switch

When a reviewed solution starts as direct implementation but later needs full SDD, record the local reason and earliest affected node here.

| Requirement | Reason | Earliest affected node | Confirmation |
| --- | --- | --- | --- |
|  |  |  |  |

## Legacy Source Notes

If this project has legacy mixed documents such as \`.specify/workflow/*.md\` or \`.specify/memory/InteractionProtocol.md\`, keep them untouched for legacy workflows. Add workflow facts here only when target code evidence, repository policy, or explicit user confirmation supports them.

New \`sdlc-*\` Skills read this file instead of legacy mixed workflow documents.
EOF
  } > "${output}"
}

generate_project_documentation_guide() {
  local output="$1"
  {
    cat <<EOF
# Project Documentation Guide

> **Generated By**: ai-sdlc-standard project bootstrap
> **Project**: $(yaml_escape "${PROJECT_NAME}")
> **Status**: Evidence scaffold, not an authoritative local documentation standard

## Purpose

This document records project-specific documentation shape rules for business_domain, L4 documents, EntryCoverage, indexes, and local naming exceptions.

Shared Speckit document governance lives in \`${AI_SDLC_STANDARD_HOME:-<AI_SDLC_STANDARD_HOME>}/ai-sdlc/**\`. This file may add repository facts and local document organization rules, but must not redefine shared standards unless the override is declared in \`.specify/project-governance-profile.yaml\`.

## Business Domain Shape

| Item | Local rule | Evidence / Confirmation | Owner |
| --- | --- | --- | --- |
| L1 / L2 split principle |  |  |  |
| L2 main document layout |  |  |  |
| L4 naming exception |  |  |  |
| Status vocabulary source |  |  |  |
| Glossary owner |  |  |  |

## EntryCoverage Shape

| Field | Local rule | Notes |
| --- | --- | --- |
| Entry type |  | HTTP, RPC, MQ, Schedule, page, route, ETL job, connector, or project-specific entry. |
| Entry identifier |  | Stable method, route, topic, job, page, or SQL task identity. |
| Code path |  | Include source path and anchor when stable. |
| Evidence chain |  | Entry -> service/domain logic -> persistence/integration/output. |
| Owning L4 |  | Stop if no confirmed L4 exists. |
| Coverage status |  | covered / partial / missing / not-applicable. |

## Document Index Rules

| Document | Local update rule | Notes |
| --- | --- | --- |
| \`00BusinessLandscape.md\` |  |  |
| \`00UbiquitousLanguage.md\` |  |  |
| \`01DomainCatalog.md\` |  |  |
| L2 main document |  |  |
| L4 document |  |  |
| EntryCoverage document |  |  |

## Sync And Reconcile Update Rules

List local rules for when implementation facts are stable enough to persist.

| Fact type | Stable when | Target document | Confirmation |
| --- | --- | --- | --- |
| Business flow |  |  |  |
| Status / enum |  |  |  |
| Entry coverage |  |  |  |
| Data lineage |  |  |  |

## Legacy Source Notes

If this project has legacy mixed documents such as \`.specify/memory/DocumentationStandard.md\`, keep them untouched for legacy workflows. Add documentation facts here only when target code evidence, generated business_domain, or explicit user confirmation supports them.

New \`sdlc-*\` Skills read this file instead of legacy mixed documentation documents.
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

If this project has legacy mixed documents such as \`.specify/memory/EngineeringStandard.md\` or \`.specify/coding_guide/*.md\`, keep them untouched for legacy workflows. Add facts here only when target code evidence or explicit user confirmation supports them.

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

If this project has legacy mixed documents such as `.specify/memory/DocumentationStandard.md` or `.specify/workflow/*.md`, keep them untouched for legacy workflows. Add structure facts here only when target code evidence or explicit user confirmation supports them.

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

If this project has legacy mixed documents such as \`.specify/memory/AiGovernance.md\`, \`.specify/memory/InteractionProtocol.md\`, or \`.specify/workflow/*.md\`, keep them untouched for legacy workflows. Add overrides here only when the project explicitly confirms a local exception.

New \`sdlc-*\` Skills read this file instead of legacy mixed documents.
EOF
  } > "${output}"
}

generate_entry_profile() {
  local output="$1"
  local emitted_entry_type="false"
  {
    cat <<'EOF'
# Entry Coverage Profile
# Generated by ai-sdlc-standard scripts/bootstrap-speckit-project.sh

schema_version: 0.1.0

project_type_profiles:
  selected:
EOF
    emit_yaml_list "    " "${PROJECT_TYPE_PROFILES[@]}"
    cat <<'EOF'
  standard_reference: "${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-project-type-profiles.md"
  selection_basis:
    - "Generated from target repository code shape; confirm and edit if project execution model differs."

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
    - "out/**"
    - "**/coverage/**"
    - "**/generated/**"
    - "**/.idea/**"
    - "**/.gradle/**"
    - "**/.mvn/**"
  document_scope: ".specify/business_domain"
  report_dir: ".specify/reports/entry_coverage"

entry_types:
EOF
    if printf '%s\n' "${PROJECT_TYPE_PROFILES_TEXT}" | grep -qx 'data-pipeline-etl'; then
        cat <<'EOF'
  - name: "spark_job"
    description: "Spark batch job entry."
    path_patterns:
      - "**/finance-spark-service/src/main/java/**/etl/job/**/*.java"
      - "**/src/main/java/**/etl/job/**/*.java"
    class_name_patterns:
      - "*Job"
    exclude_when:
      - "abstract job base classes"
    evidence_mode: "data_pipeline_chain"
  - name: "spark_online_etl"
    description: "Spark online ETL or calculation entry."
    path_patterns:
      - "**/finance-spark-service/src/main/java/**/online/**/*.java"
      - "**/src/main/java/**/online/**/*.java"
    class_name_patterns:
      - "*Etl"
    exclude_when: []
    evidence_mode: "data_pipeline_chain"
  - name: "flink_main"
    description: "Flink pipeline main entry."
    path_patterns:
      - "**/finance-flink-service/src/main/java/**/main/**/*.java"
      - "**/src/main/java/**/main/**/*.java"
    class_name_patterns:
      - "*Main"
    exclude_when:
      - "utility main methods with no pipeline side effect"
    evidence_mode: "data_pipeline_chain"
  - name: "flink_process_function"
    description: "Flink process function or stream transformation entry."
    path_patterns:
      - "**/finance-flink-service/src/main/java/**/func/process/**/*.java"
      - "**/src/main/java/**/func/process/**/*.java"
    class_name_patterns:
      - "*Function"
      - "*ProcessFunction"
    exclude_when:
      - "abstract base functions"
    evidence_mode: "data_pipeline_chain"
  - name: "mcq_connector"
    description: "Message connector, deserializer, listener, or stream source entry."
    path_patterns:
      - "**/finance-flink-service/src/main/java/**/connectors/mcq/**/*.java"
      - "**/src/main/java/**/connectors/mcq/**/*.java"
      - "**/src/main/java/**/*Consumer.java"
      - "**/src/main/java/**/*Listener.java"
    class_name_patterns:
      - "*Consumer"
      - "*Listener"
      - "*DeserializationSchema"
    exclude_when: []
    evidence_mode: "data_pipeline_chain"
EOF
      emitted_entry_type="true"
    fi
    if printf '%s\n' "${PROJECT_TYPE_PROFILES_TEXT}" | grep -qx 'admin-mixed-workflow'; then
        cat <<'EOF'
  - name: "controller"
    description: "Admin HTTP or view controller entry."
    path_patterns:
      - "**/src/main/java/**/*Controller.java"
    class_name_patterns:
      - "*Controller"
    exclude_when:
      - "view-only routes may be marked as technical_bridge with evidence"
    evidence_mode: "admin_workflow_chain"
  - name: "worker"
    description: "Background worker entry outside scheduler-specific directories."
    path_patterns:
      - "**/src/main/java/**/worker/**/*.java"
    class_name_patterns:
      - "*Worker"
      - "*Processor"
    exclude_when:
      - "worker/schedule entries should use scheduled_job"
      - "abstract base classes"
    evidence_mode: "admin_workflow_chain"
  - name: "scheduled_job"
    description: "Schedule, job, task, or scheduled worker entry."
    path_patterns:
      - "**/src/main/java/**/worker/schedule/**/*.java"
      - "**/src/main/java/**/*Schedule.java"
      - "**/src/main/java/**/*Job.java"
      - "**/src/main/java/**/*Task.java"
    class_name_patterns:
      - "*Schedule"
      - "*Job"
      - "*Task"
      - "*Worker"
    exclude_when:
      - "framework base classes"
    evidence_mode: "admin_workflow_chain"
  - name: "mcq_consumer"
    description: "MCQ, MQ, event, or listener entry."
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
    evidence_mode: "admin_workflow_chain"
  - name: "oas_event"
    description: "OAS event entry."
    path_patterns:
      - "**/src/main/java/**/oas/event/**/*.java"
    class_name_patterns:
      - "*Event"
      - "*Handler"
      - "*Processor"
    exclude_when: []
    evidence_mode: "admin_workflow_chain"
  - name: "data_console"
    description: "Data console operation entry."
    path_patterns:
      - "**/src/main/java/**/data/console/**/*.java"
    class_name_patterns:
      - "*Console"
      - "*Action"
      - "*Processor"
    exclude_when: []
    evidence_mode: "admin_workflow_chain"
  - name: "spi"
    description: "SPI extension entry."
    path_patterns:
      - "**/src/main/java/**/spi/**/*.java"
    class_name_patterns:
      - "*Spi"
      - "*SPI"
      - "*Provider"
    exclude_when: []
    evidence_mode: "admin_workflow_chain"
  - name: "rpc_provider"
    description: "RPC or service-provider entry."
    path_patterns:
      - "**/src/main/java/**/rpc/**/*.java"
      - "**/src/main/java/**/*Provider.java"
    class_name_patterns:
      - "*Provider"
      - "*Impl"
    exclude_when: []
    evidence_mode: "admin_workflow_chain"
EOF
      emitted_entry_type="true"
    fi
    if printf '%s\n' "${PROJECT_TYPE_PROFILES_TEXT}" | grep -qx 'backend-business-service' &&
      ! printf '%s\n' "${PROJECT_TYPE_PROFILES_TEXT}" | grep -qx 'admin-mixed-workflow' &&
      ! printf '%s\n' "${PROJECT_TYPE_PROFILES_TEXT}" | grep -qx 'data-pipeline-etl'; then
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
      emitted_entry_type="true"
    fi
    if printf '%s\n' "${PROJECT_TYPE_PROFILES_TEXT}" | grep -qx 'frontend-application'; then
      cat <<'EOF'
  - name: "route"
    description: "Frontend route entry."
    path_patterns:
      - "**/src/**/routes/**/*"
      - "**/src/**/router/**/*"
      - "**/src/**/routers/**/*"
      - "**/src/main/webapp/WEB-INF/**/*.jsp"
      - "**/src/main/webapp/pages/**/*"
      - "**/src/main/webapp/views/**/*"
    class_name_patterns:
      - "<route-symbol>"
    exclude_when:
      - "pure route constants with no user-visible behavior may be marked as technical_bridge"
    evidence_mode: "frontend_interaction_chain"
  - name: "navigation_guard"
    description: "Navigation guard, router bridge, or visibility gate entry."
    path_patterns:
      - "**/src/**/navigation/**/*"
      - "**/src/**/router/**/*"
      - "**/src/**/routers/**/*"
      - "**/src/**/routes/**/*"
      - "**/src/**/guards/**/*"
      - "**/src/main/webapp/js/**/*"
    class_name_patterns:
      - "<navigation-or-guard-symbol>"
    exclude_when:
      - "pure route constants with no user-visible behavior may be marked as technical_bridge"
    evidence_mode: "frontend_interaction_chain"
  - name: "page"
    description: "User-visible page or screen entry."
    path_patterns:
      - "**/src/**/pages/**/*"
      - "**/src/**/views/**/*"
      - "**/src/**/screens/**/*"
      - "**/src/main/webapp/WEB-INF/**/*.jsp"
      - "**/src/main/webapp/**/*.html"
      - "**/src/main/webapp/**/*.ftl"
      - "**/src/main/webapp/**/*.vm"
    class_name_patterns:
      - "*Page"
      - "*View"
      - "*Screen"
    exclude_when: []
    evidence_mode: "frontend_interaction_chain"
  - name: "component"
    description: "Business component entry."
    path_patterns:
      - "**/src/**/components/**/*"
      - "**/src/main/webapp/js/component/**/*"
      - "**/src/main/webapp/js/components/**/*"
      - "**/src/main/webapp/static/js/component/**/*"
      - "**/src/main/webapp/static/js/components/**/*"
    class_name_patterns:
      - "<component-symbol>"
    exclude_when:
      - "pure design-system atoms with no business behavior"
    evidence_mode: "frontend_interaction_chain"
  - name: "popup"
    description: "Popup, modal, dialog, or sheet entry with user-visible behavior."
    path_patterns:
      - "**/src/**/popups/**/*"
      - "**/src/**/popup/**/*"
      - "**/src/**/modals/**/*"
      - "**/src/**/modal/**/*"
      - "**/src/**/dialogs/**/*"
      - "**/src/**/dialog/**/*"
      - "**/src/**/sheets/**/*"
      - "**/src/main/webapp/**/*dialog*"
      - "**/src/main/webapp/**/*Dialog*"
      - "**/src/main/webapp/**/*modal*"
      - "**/src/main/webapp/**/*Modal*"
    class_name_patterns:
      - "<popup-or-modal-symbol>"
    exclude_when:
      - "pure presentational wrapper with no trigger or state behavior"
    evidence_mode: "frontend_interaction_chain"
  - name: "store_action"
    description: "State store action, model action, or reducer with business side effects."
    path_patterns:
      - "**/src/**/store/**/*"
      - "**/src/**/stores/**/*"
      - "**/src/**/models/**/*"
      - "**/src/**/actions/**/*"
    class_name_patterns:
      - "<action-or-store-symbol>"
    exclude_when: []
    evidence_mode: "frontend_interaction_chain"
  - name: "api_client"
    description: "Frontend API client entry."
    path_patterns:
      - "**/src/**/api/**/*"
      - "**/src/**/services/**/*"
      - "**/src/**/request/**/*"
      - "**/src/main/webapp/js/**/*api*"
      - "**/src/main/webapp/js/**/*request*"
      - "**/src/main/webapp/static/js/**/*api*"
      - "**/src/main/webapp/static/js/**/*request*"
    class_name_patterns:
      - "<api-client-symbol>"
    exclude_when: []
    evidence_mode: "frontend_interaction_chain"
EOF
      emitted_entry_type="true"
    fi
    if printf '%s\n' "${PROJECT_TYPE_PROFILES_TEXT}" | grep -qx 'library-shared-component'; then
      cat <<'EOF'
  - name: "public_api"
    description: "Shared component public API entry."
    path_patterns:
      - "**/src/main/java/**/*Api.java"
      - "**/src/main/java/**/*Client.java"
      - "**/src/**/*.ts"
    class_name_patterns:
      - "*Api"
      - "*Client"
      - "<exported-symbol>"
    exclude_when:
      - "internal-only helper without consumer contract"
    evidence_mode: "consumer_contract_chain"
  - name: "client_method"
    description: "Client or SDK method with consumer-visible behavior."
    path_patterns:
      - "**/src/main/java/**/*Client.java"
      - "**/src/**/client/**/*"
    class_name_patterns:
      - "*Client"
      - "<client-method-symbol>"
    exclude_when: []
    evidence_mode: "consumer_contract_chain"
  - name: "adapter"
    description: "Adapter or bridge entry exposed to consumers."
    path_patterns:
      - "**/src/main/java/**/*Adapter.java"
      - "**/src/**/adapter/**/*"
      - "**/src/**/adapters/**/*"
    class_name_patterns:
      - "*Adapter"
    exclude_when: []
    evidence_mode: "consumer_contract_chain"
  - name: "extension_point"
    description: "Extension point, SPI, or plugin contract entry."
    path_patterns:
      - "**/src/main/java/**/spi/**/*.java"
      - "**/src/main/java/**/*Extension*.java"
      - "**/src/**/extensions/**/*"
    class_name_patterns:
      - "*Extension*"
      - "*Spi"
      - "*SPI"
    exclude_when: []
    evidence_mode: "consumer_contract_chain"
  - name: "configuration_hook"
    description: "Configuration hook that changes shared component behavior."
    path_patterns:
      - "**/src/main/java/**/*Config.java"
      - "**/src/main/java/**/*Configuration.java"
      - "**/src/**/config/**/*"
    class_name_patterns:
      - "*Config"
      - "*Configuration"
    exclude_when: []
    evidence_mode: "consumer_contract_chain"
EOF
      emitted_entry_type="true"
    fi
    if [[ "${emitted_entry_type}" != "true" ]]; then
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
  admin_workflow_chain:
    required_layers:
      - entry
    recommended_layers:
      - service
      - manager
      - persistence
      - audit_or_approval
    allow_missing_layers_with_reason: true
  frontend_interaction_chain:
    required_layers:
      - route_or_page
    recommended_layers:
      - component
      - store_or_action
      - api_client
      - backend_contract
    allow_missing_layers_with_reason: true
  data_pipeline_chain:
    required_layers:
      - entry
      - input_contract
      - output_contract
    recommended_layers:
      - transformation
      - connector_or_repository
      - idempotency_or_replay
      - partition_window_checkpoint
    allow_missing_layers_with_reason: true
  consumer_contract_chain:
    required_layers:
      - public_api
      - consumer_contract
    recommended_layers:
      - compatibility_rule
      - migration_or_deprecation_note
      - test_evidence
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
  generation_script: "${AI_SDLC_STANDARD_HOME}/scripts/bootstrap-business-domain.sh"
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
    preserved_legacy_not_runtime_input:
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
| Project Type Profiles | $(markdown_samples "${PROJECT_TYPE_PROFILES_TEXT}") |
| Legacy Speckit Documents Found | ${LEGACY_FOUND} |
| Legacy Runtime Action | ${LEGACY_BOOTSTRAP_ACTION} |
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
| Whether preserved legacy files are current | Bootstrap does not read legacy files as runtime inputs. | Confirm only if a separate legacy-rail task needs them. |

## Generated Files

| File | Action | Source Basis |
| --- | --- | --- |
| .specify/project-governance-profile.yaml | generated or preflighted | target path, git remote, detected code layout, standard template |
| .specify/entry-coverage-profile.yaml | generated or preflighted | detected language and code layout |
| .specify/business-domain-bootstrap.yaml | generated or preflighted | target code scan configuration |
| .specify/project-context/ProjectWorkflowGuide.md | generated or candidate | project-specific new-rail workflow constraints and confirmation policy placeholders |
| .specify/project-context/ProjectDocumentationGuide.md | generated or candidate | project-specific business_domain, L4, EntryCoverage, and document index placeholders |
| .specify/project-context/ProjectCodingGuide.md | generated or candidate | target code technical convention evidence |
| .specify/project-context/RepositoryStructure.md | generated or candidate | source roots, module globs, entry evidence, and layer evidence |
| .specify/project-context/ProjectGovernanceOverrides.md | generated or candidate | empty unless explicit overrides exist |

## Preserved Legacy Files

Legacy files, when present, were preserved for existing legacy workflows and were not read as runtime inputs for generated new-rail content.

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
write_or_preview "${SPECIFY_DIR}/project-context/ProjectWorkflowGuide.md" generate_project_workflow_guide context
write_or_preview "${SPECIFY_DIR}/project-context/ProjectDocumentationGuide.md" generate_project_documentation_guide context
write_or_preview "${SPECIFY_DIR}/project-context/ProjectCodingGuide.md" generate_project_coding_guide context
write_or_preview "${SPECIFY_DIR}/project-context/RepositoryStructure.md" generate_repository_structure context
write_or_preview "${SPECIFY_DIR}/project-context/ProjectGovernanceOverrides.md" generate_project_governance_overrides context
write_or_preview "${SPECIFY_DIR}/reports/speckit_generation_report.md" generate_generation_report report

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
