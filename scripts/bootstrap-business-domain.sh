#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/bootstrap-business-domain.sh <target-project-path> [options]

Options:
  --project-name <name>   Project display name. Defaults to target directory name.
  --confirmed             Generate confirmed routable L1/L2/L4 skeletons from a domain map.
  --domain-map <path>     YAML domain map. Defaults to .specify/business-domain-bootstrap.yaml with --confirmed.
  --force                 Overwrite existing .specify/business_domain files.
  --dry-run               Print generated files without writing.
  -h, --help              Show this help.

Generated files:
  .specify/business_domain/00BusinessLandscape.md
  .specify/business_domain/00UbiquitousLanguage.md
  .specify/business_domain/01DomainCatalog.md
  .specify/business_domain/99PendingConfirmation/01CodeEvidence/01CodeEvidence(待确认代码证据).md
  .specify/business_domain/99PendingConfirmation/01CodeEvidence/990101CodeEvidenceCandidate(待确认代码证据).md
  .specify/business_domain/99PendingConfirmation/01CodeEvidence/990101CodeEvidenceCandidateEntryCoverage(待确认入口覆盖).md
  .specify/reports/business_domain_bootstrap_report.md

This script generates long-term business_domain skeletons from target repository
code evidence and explicit placeholders. It does not read legacy .specify/memory,
.specify/workflow, or .specify/coding_guide documents.

Confirmed mode requires user-confirmed `confirmed_domains` in the domain map.
Confirmed mode may generate {L1}/{L2}/{L2MainDocument}, {L4Document}, and {EntryCoverageDocument}.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STANDARD_PACKAGE_DEFAULT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_PATH=""
PROJECT_NAME=""
CONFIRMED="false"
DOMAIN_MAP=""
FORCE="false"
DRY_RUN="false"
RUN_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
DOC_DATE="$(date '+%Y-%m-%d')"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-name)
      PROJECT_NAME="${2:-}"
      shift 2
      ;;
    --confirmed)
      CONFIRMED="true"
      shift
      ;;
    --domain-map)
      DOMAIN_MAP="${2:-}"
      CONFIRMED="true"
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
BUSINESS_DOMAIN_DIR="${SPECIFY_DIR}/business_domain"
REPORT_DIR="${SPECIFY_DIR}/reports"
STANDARD_PACKAGE="${AI_SDLC_STANDARD_HOME:-${STANDARD_PACKAGE_DEFAULT}}"
DOMAIN_MAP="${DOMAIN_MAP:-${SPECIFY_DIR}/business-domain-bootstrap.yaml}"
PROJECT_PROFILE="${SPECIFY_DIR}/project-governance-profile.yaml"
if [[ -n "${DOMAIN_MAP}" && "${DOMAIN_MAP}" != /* ]]; then
  DOMAIN_MAP="${TARGET_PATH}/${DOMAIN_MAP}"
fi

AUTHOR="$(git -C "${TARGET_PATH}" config --get user.name 2>/dev/null || true)"
if [[ -z "${AUTHOR}" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    AUTHOR="<git config user.name missing>"
  else
    echo "git config user.name is required before writing business_domain documents." >&2
    exit 1
  fi
fi

yaml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
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
  timestamped="${file%.md}.${RUN_TIMESTAMP}.md"
  if [[ -e "${timestamped}" ]]; then
    candidate_path "${timestamped}"
  else
    printf '%s\n' "${timestamped}"
  fi
}

write_or_preview() {
  local file="$1"
  local generator="$2"
  local target="${file}"

  if [[ -e "${file}" && "${FORCE}" != "true" ]]; then
    target="$(candidate_path "${file}")"
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    local preview_file
    preview_file="$(mktemp "${TMPDIR:-/tmp}/business-domain-preview.XXXXXX")"
    printf '\n--- %s ---\n' "${target#${TARGET_PATH}/}"
    "${generator}" "${preview_file}"
    cat "${preview_file}"
    rm -f "${preview_file}"
    return 0
  fi

  mkdir -p "$(dirname "${target}")"
  "${generator}" "${target}"
  echo "Generated ${target#${TARGET_PATH}/}"
}

detect_source_roots() {
  local roots=""
  while IFS= read -r dir; do
    dir="${dir#${TARGET_PATH}/}"
    roots="${roots}${dir}"$'\n'
  done < <(find "${TARGET_PATH}" -maxdepth 6 \
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
    \) -prune -o -path '*/src/main/java' -type d -print 2>/dev/null | sort)

  if [[ -z "${roots}" ]]; then
    while IFS= read -r dir; do
      dir="${dir#${TARGET_PATH}/}"
      roots="${roots}${dir}"$'\n'
    done < <(find "${TARGET_PATH}" -maxdepth 4 \
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
      \) -prune -o -type d \( -name src -o -name app -o -name lib \) -print 2>/dev/null | sort)
  fi

  if [[ -z "${roots}" ]]; then
    printf '.\n'
  else
    printf '%s' "${roots}" | sed '/^$/d'
  fi
}

SOURCE_ROOTS_TEXT="$(detect_source_roots)"
SOURCE_ROOTS=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && SOURCE_ROOTS+=("${line}")
done <<< "${SOURCE_ROOTS_TEXT}"

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

PROJECT_FILES_TEXT="$(collect_project_files)"

count_by_pattern() {
  local pattern="$1"
  local count=0
  local file
  while IFS= read -r file; do
    [[ -z "${file}" ]] && continue
    [[ "${file}" == ${pattern} ]] && count=$((count + 1))
  done <<< "${PROJECT_FILES_TEXT}"
  printf '%s\n' "${count}"
}

sample_by_patterns() {
  local pattern
  local file
  local results=""
  for pattern in "$@"; do
    while IFS= read -r file; do
      [[ -z "${file}" ]] && continue
      [[ "${file}" == ${pattern} ]] && results="${results}${file}"$'\n'
    done <<< "${PROJECT_FILES_TEXT}"
  done
  if [[ -n "${results}" ]]; then
    printf '%s' "${results}" | sort -u | head -n 8
  fi
  return 0
}

markdown_list_or_none() {
  local text="$1"
  if [[ -z "${text}" ]]; then
    printf -- '- <none>\n'
    return 0
  fi
  while IFS= read -r line; do
    [[ -n "${line}" ]] && printf -- '- `%s`\n' "${line}"
  done <<< "${text}"
}

copy_confirmed_staged_file() {
  local output="$1"
  cp "${CONFIRMED_SOURCE_FILE}" "${output}"
}

generate_confirmed_staging() {
  local staging_dir="$1"

  if [[ ! -f "${DOMAIN_MAP}" ]]; then
    echo "Confirmed domain map not found: ${DOMAIN_MAP}" >&2
    exit 2
  fi

  ruby -ryaml -rfileutils -rtime - "${DOMAIN_MAP}" "${staging_dir}" "${PROJECT_NAME}" "${AUTHOR}" "${DOC_DATE}" "${STANDARD_PACKAGE}" "${TARGET_PATH}" "${PROJECT_PROFILE}" "${STANDARD_PACKAGE}/templates/business-domain-l4" <<'RUBY'
domain_map_path, staging_dir, project_name, author, doc_date, standard_package, target_path, project_profile_path, template_dir = ARGV
map = YAML.safe_load(File.read(domain_map_path), permitted_classes: [], aliases: false) || {}
domains = map["confirmed_domains"]

def fail_map(message)
  warn "Invalid confirmed domain map: #{message}"
  exit 2
end

fail_map("confirmed_domains must be a non-empty array") unless domains.is_a?(Array) && !domains.empty?

def required!(hash, key, context)
  value = hash[key]
  fail_map("#{context}.#{key} is required") if value.nil? || value.to_s.strip.empty?
  value.to_s.strip
end

def safe_name(value, context)
  text = value.to_s.strip
  fail_map("#{context} must not contain path separators") if text.include?("/") || text.include?("\\")
  fail_map("#{context} must not contain '..'") if text.include?("..")
  text
end

def l2_prefix(l1_id, l2_id)
  l2_id.length > 2 && l2_id.start_with?(l1_id) ? l2_id : "#{l1_id}#{l2_id}"
end

def l4_full_id(l1_id, l2_id, l4_id)
  prefix = l2_prefix(l1_id, l2_id)
  l4_id.length > prefix.length && l4_id.start_with?(prefix) ? l4_id : "#{prefix}#{l4_id}"
end

def write_file(staging_dir, relative_path, content)
  path = File.join(staging_dir, relative_path)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content)
end

L4_TEMPLATE_PRECEDENCE = [
  "admin-mixed-workflow",
  "data-pipeline-etl",
  "frontend-application",
  "library-shared-component",
  "backend-business-service"
].freeze

def string_list(value)
  Array(value).map(&:to_s).map(&:strip).reject(&:empty?)
end

def load_project_type_profiles(map, project_profile_path)
  candidates = []
  candidates.concat(string_list(map["project_type_profiles"]))
  candidates.concat(string_list(map.dig("project", "project_type_profiles"))) if map["project"].is_a?(Hash)

  if candidates.empty? && File.exist?(project_profile_path)
    profile = YAML.safe_load(File.read(project_profile_path), permitted_classes: [], aliases: false) || {}
    if profile["project"].is_a?(Hash)
      candidates.concat(string_list(profile.dig("project", "project_type_profiles")))
    end
    candidates.concat(string_list(profile["project_type_profiles"]))
  end

  normalized = candidates.map { |item| item.delete("<>").strip }.reject(&:empty?)
  recognized = normalized.select { |item| L4_TEMPLATE_PRECEDENCE.include?(item) }
  recognized.empty? ? ["backend-business-service"] : recognized.uniq
end

def select_l4_template_profile(project_type_profiles)
  L4_TEMPLATE_PRECEDENCE.find { |profile| project_type_profiles.include?(profile) } || "backend-business-service"
end

def evidence_cell(evidence, l4_name_en)
  values = evidence.empty? ? ["<pending-code-anchor>"] : evidence
  values.map { |item| item == "<pending-code-anchor>" ? item : "`#{item}`" }.join("<br>")
end

def render_l4_template(template_dir, profile, vars)
  template_path = File.join(template_dir, "#{profile}.md")
  fail_map("missing L4 template for #{profile}: #{template_path}") unless File.exist?(template_path)
  content = File.read(template_path)
  vars.each do |key, value|
    content = content.gsub("{{#{key}}}", value.to_s)
  end
  unresolved = content.scan(/\{\{[A-Z0-9_]+\}\}/).uniq
  fail_map("unresolved L4 template placeholders: #{unresolved.join(', ')}") unless unresolved.empty?
  content
end

def metadata(title, author, doc_date, status, summary)
  <<~MD
    # #{title}

    > **Metadata**
    > - **Version**: 0.1.0
    > - **Date**: #{doc_date}
    > - **Author**: #{author}
    > - **Status**: #{status}
    > - **Summary**: #{summary}

  MD
end

catalog_rows = []
l4_rows = []
landscape_rows = []
language_rows = []
project_type_profiles = load_project_type_profiles(map, project_profile_path)
l4_template_profile = select_l4_template_profile(project_type_profiles)

domains.each_with_index do |l1, l1_index|
  context = "confirmed_domains[#{l1_index}]"
  fail_map("#{context} must be a map") unless l1.is_a?(Hash)
  l1_id = safe_name(required!(l1, "l1_id", context), "#{context}.l1_id")
  l1_name_en = safe_name(required!(l1, "l1_name_en", context), "#{context}.l1_name_en")
  l1_name_cn = safe_name(required!(l1, "l1_name_cn", context), "#{context}.l1_name_cn")
  l1_dir = "#{l1_id}#{l1_name_en}"
  l2_list = l1["l2"]
  fail_map("#{context}.l2 must be a non-empty array") unless l2_list.is_a?(Array) && !l2_list.empty?

  landscape_rows << "| #{l1_id}#{l1_name_en} | #{l1_name_cn} | Confirmed | user-confirmed domain map | |"
  language_rows << "| #{l1_name_cn} | #{l1_name_en} domain boundary | Confirmed | user-confirmed domain map |"

  l2_list.each_with_index do |l2, l2_index|
    l2_context = "#{context}.l2[#{l2_index}]"
    fail_map("#{l2_context} must be a map") unless l2.is_a?(Hash)
    l2_id = safe_name(required!(l2, "l2_id", l2_context), "#{l2_context}.l2_id")
    l2_name_en = safe_name(required!(l2, "l2_name_en", l2_context), "#{l2_context}.l2_name_en")
    l2_name_cn = safe_name(required!(l2, "l2_name_cn", l2_context), "#{l2_context}.l2_name_cn")
    l2_owner = required!(l2, "owner", l2_context)
    l2_full = l2_prefix(l1_id, l2_id)
    l2_dir = File.join(l1_dir, "#{l2_full}#{l2_name_en}")
    l2_doc_name = "#{l2_full}#{l2_name_en}(#{l2_name_cn}).md"
    entry_doc_name = "#{l2_full}#{l2_name_en}EntryCoverage(#{l2_name_cn}入口覆盖).md"
    l4_list = l2["l4"]
    fail_map("#{l2_context}.l4 must be a non-empty array") unless l4_list.is_a?(Array) && !l4_list.empty?

    catalog_rows << "| #{l1_id}#{l1_name_en} | #{l2_full}#{l2_name_en} | [#{l2_doc_name}](<#{l2_dir}/#{l2_doc_name}>) | Confirmed | Owner: #{l2_owner} |"

    l2_l4_rows = []
    entry_rows = []

    l4_list.each_with_index do |l4, l4_index|
      l4_context = "#{l2_context}.l4[#{l4_index}]"
      fail_map("#{l4_context} must be a map") unless l4.is_a?(Hash)
      l4_id = safe_name(required!(l4, "l4_id", l4_context), "#{l4_context}.l4_id")
      l4_name_en = safe_name(required!(l4, "l4_name_en", l4_context), "#{l4_context}.l4_name_en")
      l4_name_cn = safe_name(required!(l4, "l4_name_cn", l4_context), "#{l4_context}.l4_name_cn")
      l4_owner = required!(l4, "owner", l4_context)
      evidence = Array(l4["evidence"]).map(&:to_s).map(&:strip).reject(&:empty?)
      l4_full = l4_full_id(l1_id, l2_id, l4_id)
      l4_doc_name = "#{l4_full}#{l4_name_en}(#{l4_name_cn}).md"
      l4_relative = File.join(l2_dir, l4_doc_name)

      l2_l4_rows << "| #{l4_full} | [#{l4_doc_name}](<#{l4_doc_name}>) | #{l4_name_cn} | Confirmed | #{l4_owner} |"
      l4_rows << "| #{l4_full} | [#{l4_doc_name}](<#{l4_relative}>) | Confirmed | #{l1_name_cn} / #{l2_name_cn} |"
      if evidence.empty?
        entry_rows << "| #{l4_full} | #{l4_name_en} | <pending-code-anchor> | Confirmed domain; code evidence pending. |"
      else
        evidence.each do |item|
          entry_rows << "| #{l4_full} | #{l4_name_en} | `#{item}` | user-confirmed evidence |"
        end
      end

      write_file(
        staging_dir,
        l4_relative,
        render_l4_template(
          template_dir,
          l4_template_profile,
          {
            "PROJECT_NAME" => project_name,
            "AUTHOR" => author,
            "DOC_DATE" => doc_date,
            "PROJECT_TYPE_PROFILE" => l4_template_profile,
            "PROJECT_TYPE_PROFILES" => project_type_profiles.join(", "),
            "L1_ID" => l1_id,
            "L1_NAME_EN" => l1_name_en,
            "L1_NAME_CN" => l1_name_cn,
            "L2_ID" => l2_full,
            "L2_NAME_EN" => l2_name_en,
            "L2_NAME_CN" => l2_name_cn,
            "L4_ID" => l4_full,
            "L4_NAME_EN" => l4_name_en,
            "L4_NAME_CN" => l4_name_cn,
            "OWNER" => l4_owner,
            "EVIDENCE_LIST" => evidence_cell(evidence, l4_name_en)
          }
        )
      )
    end

    write_file(staging_dir, File.join(l2_dir, l2_doc_name), metadata("#{l2_name_en}(#{l2_name_cn})", author, doc_date, "Confirmed", "Confirmed L2 skeleton for #{l2_name_cn}.") + <<~MD)
      ## Scope

      | Field | Value |
      | --- | --- |
      | L1 | #{l1_id}#{l1_name_en}(#{l1_name_cn}) |
      | L2 | #{l2_full}#{l2_name_en}(#{l2_name_cn}) |
      | Owner | #{l2_owner} |

      ## Included L4 Documents

      | L4 | Document | Business Name | Status | Owner |
      | --- | --- | --- | --- | --- |
      #{l2_l4_rows.join("\n")}

      ## Routing Rule

      Route requirements here only when their business behavior belongs to #{l2_name_cn} and the target L4 is listed above or explicitly reserved.

      ## Revision History

      | Version | Date | Author | Changes |
      | --- | --- | --- | --- |
      | 0.1.0 | #{doc_date} | #{author} | Initial confirmed L2 skeleton. |
    MD

    write_file(staging_dir, File.join(l2_dir, entry_doc_name), metadata("#{l2_name_en} Entry Coverage(#{l2_name_cn}入口覆盖)", author, doc_date, "Confirmed", "Entry coverage skeleton for #{l2_name_cn}.") + <<~MD)
      ## Entry Coverage

      | L4 | Entry Name | Code Anchor | Evidence |
      | --- | --- | --- | --- |
      #{entry_rows.join("\n")}

      ## Strict Gate Note

      Regenerate strict reports with `scripts/audit-entry-coverage.rb` after code or domain routing changes.

      ## Revision History

      | Version | Date | Author | Changes |
      | --- | --- | --- | --- |
      | 0.1.0 | #{doc_date} | #{author} | Initial confirmed entry coverage skeleton. |
    MD
  end
end

write_file(staging_dir, "00BusinessLandscape.md", metadata("Business Landscape", author, doc_date, "Confirmed", "#{project_name} confirmed business-domain landscape skeleton.") + <<~MD)
  ## Purpose

  This document is generated from a user-confirmed domain map for `#{project_name}`.

  It is not copied from another repository and does not read legacy `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**`.

  ## Fact Source Layering

  | Layer | Role | Runtime source |
  | --- | --- | --- |
  | Standard shared rules | Workflow, gate, artifact, sync, and document governance. | `#{standard_package}` |
  | Confirmed domain map | Initial L1/L2/L4 routing. | `#{domain_map_path}` |
  | Project type L4 template | L4 skeleton shape selected from project type profiles: #{project_type_profiles.join(", ")}. | `templates/business-domain-l4/#{l4_template_profile}.md` |
  | Long-term code facts | Stable business facts and code anchors. | `.specify/business_domain/**` |

  ## Business Domains

  | L1 | Chinese Name | Status | Evidence | Owner confirmation |
  | --- | --- | --- | --- | --- |
  #{landscape_rows.join("\n")}

  ## Routing Principle

  Route new requirements to the confirmed L1/L2/L4 documents listed in `01DomainCatalog.md`.

  ## Revision History

  | Version | Date | Author | Changes |
  | --- | --- | --- | --- |
  | 0.1.0 | #{doc_date} | #{author} | Initial confirmed business-domain landscape. |
MD

write_file(staging_dir, "00UbiquitousLanguage.md", metadata("Ubiquitous Language", author, doc_date, "Confirmed", "#{project_name} confirmed glossary skeleton.") + <<~MD)
  ## Terms

  | Term | Meaning | Status | Source |
  | --- | --- | --- | --- |
  #{language_rows.join("\n")}

  ## Wording Rules

  - Add only stable confirmed business terms here.
  - Keep temporary implementation names in `specs/**` until sync confirms they are reusable facts.

  ## Revision History

  | Version | Date | Author | Changes |
  | --- | --- | --- | --- |
  | 0.1.0 | #{doc_date} | #{author} | Initial confirmed glossary skeleton. |
MD

write_file(staging_dir, "01DomainCatalog.md", metadata("Domain Catalog", author, doc_date, "Confirmed", "#{project_name} confirmed domain catalog skeleton.") + <<~MD)
  ## L1/L2 Index

  | L1 | L2 | Main Document | Status | Notes |
  | --- | --- | --- | --- | --- |
  #{catalog_rows.join("\n")}

  ## L4 Index

  | L4 | Document | Status | Purpose |
  | --- | --- | --- | --- |
  #{l4_rows.join("\n")}

  ## Routing Notes

  - Route new work to confirmed domains first.
  - Create new L4 documents only after user or domain-owner confirmation.
  - Do not use legacy `.specify/memory/**` or `.specify/workflow/**` as a domain map.

  ## Revision History

  | Version | Date | Author | Changes |
  | --- | --- | --- | --- |
  | 0.1.0 | #{doc_date} | #{author} | Initial confirmed domain catalog. |
MD
RUBY
}

SOURCE_ROOT_COUNT="${#SOURCE_ROOTS[@]}"
CONTROLLER_COUNT="$(count_by_pattern '*Controller.java')"
RPC_COUNT="$(sample_by_patterns '*/rpc/*.java' '*Provider.java' '*Facade.java' | wc -l | tr -d ' ')"
MESSAGE_COUNT="$(sample_by_patterns '*Listener.java' '*Consumer.java' '*Processor.java' | wc -l | tr -d ' ')"
SCHEDULE_COUNT="$(sample_by_patterns '*Schedule.java' '*Job.java' '*Task.java' '*Worker.java' | wc -l | tr -d ' ')"
FRONTEND_PAGE_COUNT="$(sample_by_patterns '*/pages/*' '*/views/*' '*/screens/*' | wc -l | tr -d ' ')"
FRONTEND_API_COUNT="$(sample_by_patterns '*/api/*' '*/services/*' '*/request/*' | wc -l | tr -d ' ')"
ETL_COUNT="$(sample_by_patterns '*Job.java' '*Etl.java' '*Main.java' '*Function.java' '*DeserializationSchema.java' | wc -l | tr -d ' ')"

CONTROLLER_SAMPLES="$(sample_by_patterns '*Controller.java')"
RPC_SAMPLES="$(sample_by_patterns '*/rpc/*.java' '*Provider.java' '*Facade.java')"
MESSAGE_SAMPLES="$(sample_by_patterns '*Listener.java' '*Consumer.java' '*Processor.java')"
SCHEDULE_SAMPLES="$(sample_by_patterns '*Schedule.java' '*Job.java' '*Task.java' '*Worker.java')"
FRONTEND_SAMPLES="$(sample_by_patterns '*/pages/*' '*/views/*' '*/screens/*' '*/components/*' '*/store/*' '*/stores/*' '*/api/*')"
ETL_SAMPLES="$(sample_by_patterns '*Job.java' '*Etl.java' '*Main.java' '*Function.java' '*DeserializationSchema.java')"

detect_profile_hint() {
  local hints=()
  if [[ "${ETL_COUNT}" -gt 0 ]]; then
    hints+=("data-pipeline-etl")
  fi
  if [[ "${FRONTEND_PAGE_COUNT}" -gt 0 || "${FRONTEND_API_COUNT}" -gt 0 || -f "${TARGET_PATH}/package.json" ]]; then
    hints+=("frontend-application")
  fi
  if [[ "${CONTROLLER_COUNT}" -gt 0 || "${RPC_COUNT}" -gt 0 || "${MESSAGE_COUNT}" -gt 0 || "${SCHEDULE_COUNT}" -gt 0 ]]; then
    hints+=("backend-business-service")
  fi
  if [[ "${#hints[@]}" -eq 0 ]]; then
    hints+=("mixed")
  fi
  printf '%s\n' "${hints[@]}" | awk '!seen[$0]++'
}

PROFILE_HINTS_TEXT="$(detect_profile_hint)"

generate_landscape() {
  local output="$1"
  {
    cat <<EOF
# Business Landscape

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: Draft
> - **Summary**: ${PROJECT_NAME} business-domain landscape skeleton generated from target repository code evidence.

## Purpose

This document is the long-term business-domain entry for \`${PROJECT_NAME}\`.

It is generated by \`scripts/bootstrap-business-domain.sh\` from target repository code evidence and explicit placeholders. It is not copied from another repository and does not read legacy \`.specify/memory/**\`, \`.specify/workflow/**\`, or \`.specify/coding_guide/**\`.

## Fact Source Layering

| Layer | Role | Runtime source |
| --- | --- | --- |
| Standard shared rules | Workflow, gate, artifact, sync, and document governance. | \`${STANDARD_PACKAGE}\` |
| Project private context | Repository structure, local coding guide, governance overrides. | \`.specify/project-context/**\` |
| Short-term feature facts | Temporary Speckit machine artifacts. | \`specs/**\` |
| Long-term code facts | Stable business facts and code anchors. | \`.specify/business_domain/**\` |
| Legacy rail | Existing legacy Skill inputs only. | Preserved, not read by new \`sdlc-*\` Skills. |

## Project Type Hints

$(markdown_list_or_none "${PROFILE_HINTS_TEXT}")

## Code Evidence Summary

| Evidence | Count |
| --- | ---: |
| Source roots | ${SOURCE_ROOT_COUNT} |
| HTTP controllers | ${CONTROLLER_COUNT} |
| RPC/provider samples | ${RPC_COUNT} |
| Message/listener samples | ${MESSAGE_COUNT} |
| Schedule/job samples | ${SCHEDULE_COUNT} |
| Frontend page/API samples | $((FRONTEND_PAGE_COUNT + FRONTEND_API_COUNT)) |
| ETL/pipeline samples | ${ETL_COUNT} |

## Business Domains

| L1 | L2 | Status | Evidence | Owner confirmation |
| --- | --- | --- | --- | --- |
| 99PendingConfirmation | 01CodeEvidence | PendingConfirmation | Code evidence exists, business boundary not confirmed. | Required before promoting to a real domain. |

## Routing Principle

New requirements should route to confirmed L1/L2/L4 business-domain documents. If only pending code evidence exists, stop before long-term sync and ask for owner-confirmed business boundaries.

## Code Anchors

### Source Roots

$(markdown_list_or_none "${SOURCE_ROOTS_TEXT}")

### Representative Entry Evidence

| Type | Examples |
| --- | --- |
| Controller | $(printf '%s' "${CONTROLLER_SAMPLES:-<none>}" | paste -sd ', ' -) |
| RPC / Provider | $(printf '%s' "${RPC_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Message / Listener | $(printf '%s' "${MESSAGE_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Schedule / Job | $(printf '%s' "${SCHEDULE_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Frontend | $(printf '%s' "${FRONTEND_SAMPLES:-<none>}" | paste -sd ', ' -) |
| ETL / Pipeline | $(printf '%s' "${ETL_SAMPLES:-<none>}" | paste -sd ', ' -) |

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial business-domain skeleton. |
EOF
  } > "${output}"
}

generate_language() {
  local output="$1"
  {
    cat <<EOF
# Ubiquitous Language

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: Draft
> - **Summary**: ${PROJECT_NAME} glossary skeleton for long-term business facts.

## Purpose

This document records stable business vocabulary for \`${PROJECT_NAME}\`. Bootstrap does not infer final business terms from package names. Terms below are placeholders until confirmed by product, domain owner, or code-doc reconciliation.

## Terms

| Term | Meaning | Status | Source |
| --- | --- | --- | --- |
| Pending business domain | Business boundary not confirmed yet. | PendingConfirmation | bootstrap skeleton |

## Status Vocabulary

| Status | Meaning | Visible to business | Source |
| --- | --- | --- | --- |
| PendingConfirmation | Generated placeholder awaiting owner confirmation. | yes | bootstrap skeleton |

## Code-Derived Names To Confirm

| Name | Evidence | Decision |
| --- | --- | --- |
| ${PROJECT_NAME} | repository name | Confirm whether this is a business term, system name, or technical name. |

## Wording Rules

- Do not promote package names, class names, table names, route names, or job names into business vocabulary without confirmation.
- Use this document for stable terms only.
- Keep temporary implementation notes in \`specs/**\` or \`library/**\`, not here.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial glossary skeleton. |
EOF
  } > "${output}"
}

generate_catalog() {
  local output="$1"
  {
    cat <<EOF
# Domain Catalog

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: Draft
> - **Summary**: ${PROJECT_NAME} business-domain catalog skeleton.

## Purpose

This catalog is the routing index for long-term business-domain documents.

## L1/L2 Index

| L1 | L2 | Main Document | Status | Notes |
| --- | --- | --- | --- | --- |
| 99PendingConfirmation | 01CodeEvidence | [01CodeEvidence(待确认代码证据).md](<99PendingConfirmation/01CodeEvidence/01CodeEvidence(待确认代码证据).md>) | PendingConfirmation | Code evidence exists but business boundary is not confirmed. |

## L4 Index

| L4 | Document | Status | Purpose |
| --- | --- | --- | --- |
| 990101 | [990101CodeEvidenceCandidate(待确认代码证据).md](<99PendingConfirmation/01CodeEvidence/990101CodeEvidenceCandidate(待确认代码证据).md>) | PendingConfirmation | Holds code evidence until owner confirms real business routing. |
| 990101EntryCoverage | [990101CodeEvidenceCandidateEntryCoverage(待确认入口覆盖).md](<99PendingConfirmation/01CodeEvidence/990101CodeEvidenceCandidateEntryCoverage(待确认入口覆盖).md>) | PendingConfirmation | Holds entry evidence coverage scaffold. |

## Routing Notes

- Route new work to confirmed domains first.
- Do not sync stable facts into pending documents without owner confirmation.
- Promote pending evidence to real L1/L2/L4 only after business boundary approval.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial domain catalog skeleton. |
EOF
  } > "${output}"
}

generate_l2() {
  local output="$1"
  {
    cat <<EOF
# Code Evidence Pending Confirmation

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: PendingConfirmation
> - **Summary**: L2 placeholder for unconfirmed code evidence.

## Scope

This document is a temporary routing bucket for code evidence that has not yet been confirmed as a business domain.

## Included L4 Documents

| L4 | Document | Status |
| --- | --- | --- |
| 990101 | [990101CodeEvidenceCandidate(待确认代码证据).md](<990101CodeEvidenceCandidate(待确认代码证据).md>) | PendingConfirmation |
| 990101EntryCoverage | [990101CodeEvidenceCandidateEntryCoverage(待确认入口覆盖).md](<990101CodeEvidenceCandidateEntryCoverage(待确认入口覆盖).md>) | PendingConfirmation |

## Promotion Rule

Move facts out of this pending bucket only after the target repository owner confirms business boundaries, terms, and lifecycle.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial pending L2 skeleton. |
EOF
  } > "${output}"
}

generate_l4() {
  local output="$1"
  {
    cat <<EOF
# Code Evidence Candidate

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: PendingConfirmation
> - **Summary**: Candidate L4 skeleton generated from code evidence, awaiting business routing confirmation.

## Business Scope

Pending. Bootstrap does not infer business behavior from code names alone.

## Code Evidence

### Source Roots

$(markdown_list_or_none "${SOURCE_ROOTS_TEXT}")

### Entry Samples

| Type | Examples |
| --- | --- |
| Controller | $(printf '%s' "${CONTROLLER_SAMPLES:-<none>}" | paste -sd ', ' -) |
| RPC / Provider | $(printf '%s' "${RPC_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Message / Listener | $(printf '%s' "${MESSAGE_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Schedule / Job | $(printf '%s' "${SCHEDULE_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Frontend | $(printf '%s' "${FRONTEND_SAMPLES:-<none>}" | paste -sd ', ' -) |
| ETL / Pipeline | $(printf '%s' "${ETL_SAMPLES:-<none>}" | paste -sd ', ' -) |

## Required Confirmation

| Question | Required before promotion |
| --- | --- |
| What business capability does this evidence represent? | yes |
| Which owner confirms the domain boundary? | yes |
| Which user-visible or data-visible behavior is stable? | yes |
| Which facts should sync from future specs into long-term docs? | yes |

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial candidate L4 skeleton. |
EOF
  } > "${output}"
}

generate_entry_coverage() {
  local output="$1"
  {
    cat <<EOF
# Code Evidence Candidate Entry Coverage

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: PendingConfirmation
> - **Summary**: Entry coverage scaffold for unconfirmed code evidence.

## Entry Coverage Summary

| Entry Type | Count / Sample Count | Examples |
| --- | ---: | --- |
| Controller | ${CONTROLLER_COUNT} | $(printf '%s' "${CONTROLLER_SAMPLES:-<none>}" | paste -sd ', ' -) |
| RPC / Provider | ${RPC_COUNT} | $(printf '%s' "${RPC_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Message / Listener | ${MESSAGE_COUNT} | $(printf '%s' "${MESSAGE_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Schedule / Job | ${SCHEDULE_COUNT} | $(printf '%s' "${SCHEDULE_SAMPLES:-<none>}" | paste -sd ', ' -) |
| Frontend | $((FRONTEND_PAGE_COUNT + FRONTEND_API_COUNT)) | $(printf '%s' "${FRONTEND_SAMPLES:-<none>}" | paste -sd ', ' -) |
| ETL / Pipeline | ${ETL_COUNT} | $(printf '%s' "${ETL_SAMPLES:-<none>}" | paste -sd ', ' -) |

## Strict Gate Note

This document is only a scaffold. Strict entry coverage should be regenerated by the project entry coverage audit after real L1/L2/L4 routing is confirmed.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial entry coverage scaffold. |
EOF
  } > "${output}"
}

generate_report() {
  local output="$1"
  {
    cat <<EOF
# Business Domain Bootstrap Report

> **Project**: ${PROJECT_NAME}
> **Generated At**: $(date '+%Y-%m-%d %H:%M:%S')
> **Generated By**: ai-sdlc-standard
> **Target Repository**: ${TARGET_PATH}

## Summary

| Item | Value |
| --- | --- |
| Business Domain Root | .specify/business_domain |
| Mode | $([[ "${CONFIRMED}" == "true" ]] && printf 'confirmed' || printf 'pending') |
| Domain Map | $([[ "${CONFIRMED}" == "true" ]] && printf '%s' "${DOMAIN_MAP}" || printf '<not used>') |
| Force Overwrite | ${FORCE} |
| Legacy Docs Read | false |
| Source Roots | ${SOURCE_ROOT_COUNT} |
| Project Type Hints | $(printf '%s' "${PROFILE_HINTS_TEXT}" | paste -sd ', ' -) |

## Generated Intent

This run generates long-term business-domain skeletons only. It does not copy business facts from another repository.

$([[ "${CONFIRMED}" == "true" ]] && printf 'Confirmed mode used user-confirmed `confirmed_domains` to create routable L1/L2/L4 skeletons.' || printf 'Pending mode created only pending code-evidence skeletons because no confirmed domain map was supplied.')

## Next Steps

- Review generated business-domain skeletons.
- Confirm new L1/L2/L4 additions with the project owner before future changes.
- Run entry coverage audit after real routing exists.
EOF
  } > "${output}"
}

if [[ "${CONFIRMED}" == "true" ]]; then
  CONFIRMED_STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/business-domain-confirmed.XXXXXX")"
  generate_confirmed_staging "${CONFIRMED_STAGING_DIR}"
  if [[ "${DRY_RUN}" != "true" ]]; then
    mkdir -p "${BUSINESS_DOMAIN_DIR}"
    mkdir -p "${REPORT_DIR}"
  fi
  while IFS= read -r relative_file; do
    [[ -z "${relative_file}" ]] && continue
    CONFIRMED_SOURCE_FILE="${CONFIRMED_STAGING_DIR}/${relative_file}"
    write_or_preview "${BUSINESS_DOMAIN_DIR}/${relative_file}" copy_confirmed_staged_file
  done < <(cd "${CONFIRMED_STAGING_DIR}" && find . -type f | sed 's#^\./##' | sort)
  write_or_preview "$(report_history_path "${REPORT_DIR}/business_domain_bootstrap_report.md")" generate_report
else
  if [[ "${DRY_RUN}" != "true" ]]; then
    mkdir -p "${BUSINESS_DOMAIN_DIR}/99PendingConfirmation/01CodeEvidence"
    mkdir -p "${REPORT_DIR}"
  fi

  write_or_preview "${BUSINESS_DOMAIN_DIR}/00BusinessLandscape.md" generate_landscape
  write_or_preview "${BUSINESS_DOMAIN_DIR}/00UbiquitousLanguage.md" generate_language
  write_or_preview "${BUSINESS_DOMAIN_DIR}/01DomainCatalog.md" generate_catalog
  write_or_preview "${BUSINESS_DOMAIN_DIR}/99PendingConfirmation/01CodeEvidence/01CodeEvidence(待确认代码证据).md" generate_l2
  write_or_preview "${BUSINESS_DOMAIN_DIR}/99PendingConfirmation/01CodeEvidence/990101CodeEvidenceCandidate(待确认代码证据).md" generate_l4
  write_or_preview "${BUSINESS_DOMAIN_DIR}/99PendingConfirmation/01CodeEvidence/990101CodeEvidenceCandidateEntryCoverage(待确认入口覆盖).md" generate_entry_coverage
  write_or_preview "$(report_history_path "${REPORT_DIR}/business_domain_bootstrap_report.md")" generate_report
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '\nDry run complete. No files were written.\n'
else
  echo "Business domain bootstrap complete for ${PROJECT_NAME}."
  if [[ "${CONFIRMED}" == "true" ]]; then
    echo "Next: run entry coverage audit against confirmed business-domain routing."
  else
    echo "Next: confirm business boundaries before promoting pending evidence to stable domains."
  fi
fi
