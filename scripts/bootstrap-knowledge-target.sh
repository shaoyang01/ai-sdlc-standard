#!/usr/bin/env bash
# D-088-01: knowledge-target initializer for sdlc-knowledge-sync.
#
# Creates the long-term knowledge TARGET (.specify/business_domain/**) that
# sdlc-knowledge-sync resolves deterministically. This script:
#   - only creates MISSING files; existing knowledge files are never modified;
#   - owns exactly one machine-readable file, knowledge-target.yaml; an
#     unexpected difference there is a conflict unless --update-declaration;
#   - never invents business facts; stable facts are written exclusively by
#     sdlc-knowledge-sync from library/{requirement_id}/ artifacts, code and
#     verification evidence;
#   - produces no pending-confirmation buckets and no temporary feature dirs.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/bootstrap-knowledge-target.sh <target-project-path> [options]

Options:
  --project-name <name>        Project display name. Defaults to target directory name.
  --domain-map <path>          Confirmed domain map YAML. Switches to routed mode and
                               generates routable L1/L2/L4 + entry coverage skeletons.
  --project-type-profile <p>   backend-business-service | frontend-application |
                               data-pipeline-etl | library-shared-component |
                               admin-mixed-workflow. Default: existing declaration
                               value, else frontend-application when package.json
                               exists, else backend-business-service (hint only).
  --update-declaration         Controlled override: replace an existing
                               knowledge-target.yaml that differs from both the
                               awaiting and routed declaration for this run.
  --dry-run                    Print the action plan and file previews; write nothing.
  -h, --help                   Show this help.

Created files (create-if-missing only):
  .specify/business_domain/knowledge-target.yaml      (initializer-owned declaration)
  .specify/business_domain/00BusinessLandscape.md
  .specify/business_domain/00UbiquitousLanguage.md
  .specify/business_domain/01DomainCatalog.md
  routed mode: L1/L2/L4 documents and entry coverage documents from the confirmed map
  .specify/reports/knowledge_target_bootstrap_report.md (timestamped history; never overwrites)

Conflict policy:
  - knowledge files (root/domain/entry documents): missing -> created; existing ->
    preserved untouched (bootstrap never rewrites knowledge content).
  - a generated root skeleton is replaced by its routed version only when it is
    byte-identical to the awaiting skeleton (i.e. still pristine bootstrap output).
  - knowledge-target.yaml: identical -> no-op; awaiting->routed progression or
    pristine awaiting skeleton match -> updated; anything else -> blocked unless
    --update-declaration.

Exit codes: 0 ok/no-op, 1 blocked or missing git identity, 2 usage/validation error.

This initializer serves sdlc-knowledge-sync only. It does not read or write any
other repository, and it generates no run-level working materials.
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

while [[ $# -gt 0 ]]; do
  case "$1" in
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

case "${PROFILE_OVERRIDE}" in
  ""|backend-business-service|frontend-application|data-pipeline-etl|library-shared-component|admin-mixed-workflow) ;;
  *) echo "Unknown --project-type-profile: ${PROFILE_OVERRIDE}" >&2; exit 2 ;;
esac

if [[ -n "${DOMAIN_MAP}" && "${DOMAIN_MAP}" != /* ]]; then
  DOMAIN_MAP="${TARGET_PATH}/${DOMAIN_MAP}"
fi
if [[ -n "${DOMAIN_MAP}" && ! -f "${DOMAIN_MAP}" ]]; then
  echo "Confirmed domain map not found: ${DOMAIN_MAP}" >&2
  exit 2
fi

PROJECT_NAME="${PROJECT_NAME:-$(basename "${TARGET_PATH}")}"
SPECIFY_DIR="${TARGET_PATH}/.specify"
BD_DIR="${SPECIFY_DIR}/business_domain"
REPORT_DIR="${SPECIFY_DIR}/reports"
DECLARATION="${BD_DIR}/knowledge-target.yaml"
STANDARD_PACKAGE="${AI_SDLC_STANDARD_HOME:-${STANDARD_PACKAGE_DEFAULT}}"
RUN_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
DOC_DATE="$(date '+%Y-%m-%d')"

AUTHOR="$(git -C "${TARGET_PATH}" config --get user.name 2>/dev/null || true)"
if [[ -z "${AUTHOR}" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    AUTHOR="<git config user.name missing>"
  else
    echo "BLOCKED: git config user.name is required before writing knowledge-target files." >&2
    exit 1
  fi
fi

# --- profile resolution -------------------------------------------------------
existing_declaration_profiles=""
if [[ -f "${DECLARATION}" ]]; then
  existing_declaration_profiles="$(ruby -ryaml -e '
    begin
      d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
      puts Array(d["project_type_profiles"]).map(&:to_s).reject(&:empty?).join(",")
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

# --- staging ------------------------------------------------------------------
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/knowledge-target-staging.XXXXXX")"
trap 'rm -rf "${STAGING_DIR}"' EXIT

yaml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_staging_file() {
  local rel="$1"
  mkdir -p "${STAGING_DIR}/$(dirname "${rel}")"
  cat > "${STAGING_DIR}/${rel}"
}

generate_declaration() {
  local status="$1" routable="$2" map_ref="$3"
  cat <<EOF
schema_version: "1.0"
governed_by: sdlc-knowledge-sync
target_root: .specify/business_domain
status: "${status}"
routable: ${routable}
project_type_profiles:
$(printf '%s' "${PROJECT_TYPE_PROFILES}" | tr ',' '\n' | sed 's/^/  - "/; s/$/"/')
fact_sources:
  process_evidence: "current requirement library/{requirement_id}/ seven-node artifacts (00-需求资料 .. 06-知识同步)"
  code: "target repository code state"
  verification: "verified test and review evidence"
initializer: "scripts/bootstrap-knowledge-target.sh"
domain_map: ${map_ref}
EOF
}

generate_landscape() {
  local routed_rows="$1"
  cat <<EOF
# Business Landscape

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: Draft
> - **Summary**: ${PROJECT_NAME} long-term business-domain landscape skeleton.

## Purpose

This document is the long-term business-domain entry for \`${PROJECT_NAME}\`.
It is the knowledge target resolved by \`sdlc-knowledge-sync\` (see
\`knowledge-target.yaml\` next to this document).

## Fact Source Layering

| Layer | Role | Source |
| --- | --- | --- |
| Standard shared rules | Workflow, gate, artifact and sync governance. | \`${STANDARD_PACKAGE}\` |
| Process facts (per requirement) | Seven-node artifacts of the current requirement. | \`library/{requirement_id}/\` |
| Long-term stable facts | Verified reusable business knowledge. | \`.specify/business_domain/**\` |

\`sdlc-knowledge-sync\` writes only verified stable facts into this directory,
sourced from \`library/{requirement_id}/\` artifacts, code state and verification
evidence. Bootstrap creates structure only and never invents business facts.

## Business Domains
| L1 | Chinese Name | Status | Owner confirmation |
| --- | --- | --- | --- |
${routed_rows}
## Routing Principle

New requirements route through \`01DomainCatalog.md\` once a confirmed domain map
exists. Until then this target is \`routable: false\` and sync produces proposals only.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial knowledge-target skeleton. |
EOF
}

generate_language() {
  cat <<EOF
# Ubiquitous Language

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: Draft
> - **Summary**: ${PROJECT_NAME} long-term glossary skeleton.

## Terms

| Term | Meaning | Status | Source |
| --- | --- | --- | --- |

## Wording Rules

- Add only stable, owner-confirmed business terms here.
- Do not promote package names, class names, table names or route names into
  business vocabulary without confirmation.
- Terms are synced by \`sdlc-knowledge-sync\` from \`library/{requirement_id}/\`
  artifacts and verification evidence, never invented by bootstrap.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial glossary skeleton. |
EOF
}

generate_catalog() {
  local l1l2_rows="$1" l4_rows="$2"
  cat <<EOF
# Domain Catalog

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: ${DOC_DATE}
> - **Author**: ${AUTHOR}
> - **Status**: Draft
> - **Summary**: ${PROJECT_NAME} routing index for long-term business-domain documents.

## L1/L2 Index
| L1 | L2 | Main Document | Status | Owner |
| --- | --- | --- | --- | --- |
${l1l2_rows}
## L4 Index
| L4 | Document | Business Name | Status |
| --- | --- | --- | --- |
${l4_rows}
## Routing Notes

- No routable domain rows exist until a confirmed domain map is bootstrapped;
  this target then reports \`routable: false\` and sync produces proposals only.
- New L4 documents are created only through create-if-missing authorization
  after owner confirmation.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | ${DOC_DATE} | ${AUTHOR} | Initial domain catalog skeleton. |
EOF
}

ROUTED_L1L2_ROWS=""
ROUTED_L4_ROWS=""
ROUTED_LANDSCAPE_ROWS=""

if [[ -n "${DOMAIN_MAP}" ]]; then
  # Routed mode: validate the confirmed map fail-closed and stage L1/L2/L4 docs.
  L4_TEMPLATE_DIR="${STANDARD_PACKAGE}/templates/business-domain-l4"
  DOMAIN_MAP_REF="'$(yaml_escape "${DOMAIN_MAP#${TARGET_PATH}/}")'"
  if ! ruby -ryaml -rfileutils -rerb - "${DOMAIN_MAP}" "${STAGING_DIR}/business_domain" \
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

    > **Metadata**
    > - **Version**: 0.1.0
    > - **Date**: #{doc_date}
    > - **Author**: #{author}
    > - **Status**: #{status}
    > - **Summary**: #{summary}

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
  l1_id      = safe_name.(req.(l1, "l1_id", ctx), "#{ctx}.l1_id")
  l1_name_en = safe_name.(req.(l1, "l1_name_en", ctx), "#{ctx}.l1_name_en")
  l1_name_cn = safe_name.(req.(l1, "l1_name_cn", ctx), "#{ctx}.l1_name_cn")
  fail_map.call("duplicate l1_id #{l1_id}") if seen_l1[l1_id]
  seen_l1[l1_id] = true
  l1_dir = "#{l1_id}#{l1_name_en}"
  l2_list = l1["l2"]
  fail_map.call("#{ctx}.l2 must be a non-empty array") unless l2_list.is_a?(Array) && !l2_list.empty?
  landscape_rows << "| #{l1_dir} | #{l1_name_cn} | Confirmed | user-confirmed domain map |"

  l2_list.each_with_index do |l2, j|
    l2c = "#{ctx}.l2[#{j}]"
    fail_map.call("#{l2c} must be a map") unless l2.is_a?(Hash)
    l2_id      = safe_name.(req.(l2, "l2_id", l2c), "#{l2c}.l2_id")
    l2_name_en = safe_name.(req.(l2, "l2_name_en", l2c), "#{l2c}.l2_name_en")
    l2_name_cn = safe_name.(req.(l2, "l2_name_cn", l2c), "#{l2c}.l2_name_cn")
    l2_owner   = req.(l2, "owner", l2c)
    l2_full    = l2_prefix.(l1_id, l2_id)
    fail_map.call("duplicate l2_id #{l2_full}") if seen_l2[l2_full]
    seen_l2[l2_full] = true
    l2_dir = File.join(l1_dir, "#{l2_full}#{l2_name_en}")
    l2_doc = "#{l2_full}#{l2_name_en}(#{l2_name_cn}).md"
    entry_doc = "#{l2_full}#{l2_name_en}EntryCoverage(#{l2_name_cn}入口覆盖).md"
    l4_list = l2["l4"]
    fail_map.call("#{l2c}.l4 must be a non-empty array") unless l4_list.is_a?(Array) && !l4_list.empty?

    l2_l4_rows = []
    entry_rows = []

    l4_list.each_with_index do |l4, k|
      l4c = "#{l2c}.l4[#{k}]"
      fail_map.call("#{l4c} must be a map") unless l4.is_a?(Hash)
      l4_id      = safe_name.(req.(l4, "l4_id", l4c), "#{l4c}.l4_id")
      l4_name_en = safe_name.(req.(l4, "l4_name_en", l4c), "#{l4c}.l4_name_en")
      l4_name_cn = safe_name.(req.(l4, "l4_name_cn", l4c), "#{l4c}.l4_name_cn")
      l4_owner   = req.(l4, "owner", l4c)
      l4f        = l4_full.(l1_id, l2_full, l4_id)
      fail_map.call("duplicate l4_id #{l4f}") if seen_l4[l4f]
      seen_l4[l4f] = true
      l4_doc = "#{l4f}#{l4_name_en}(#{l4_name_cn}).md"
      l4_rel = File.join(l2_dir, l4_doc)
      evidence = Array(l4["evidence"]).map(&:to_s).map(&:strip).reject(&:empty?)

      l2_l4_rows << "| #{l4f} | [#{l4_doc}](<#{l4_doc}>) | #{l4_name_cn} | Confirmed |"
      catalog_l4 << "| #{l4f} | [#{l4_rel}](<#{l4_rel}>) | #{l4_name_cn} | Confirmed |"
      if evidence.empty?
        entry_rows << "| #{l4f} | #{l4_name_en} | pending-code-anchor | Confirmed domain; code evidence pending. |"
      else
        evidence.each { |e| entry_rows << "| #{l4f} | #{l4_name_en} | `#{e}` | user-confirmed evidence |" }
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
      metadata.("#{l2_name_en}(#{l2_name_cn})", "Confirmed", "Confirmed L2 skeleton for #{l2_name_cn}.") + <<~MD
        ## Scope

        | Field | Value |
        | --- | --- |
        | L1 | #{l1_id}#{l1_name_en}(#{l1_name_cn}) |
        | L2 | #{l2_full}#{l2_name_en}(#{l2_name_cn}) |
        | Owner | #{l2_owner} |

        ## Included L4 Documents

        | L4 | Document | Business Name | Status |
        | --- | --- | --- | --- |
        #{l2_l4_rows.join("\n")}

        ## Routing Rule

        Route requirements here only when their business behavior belongs to #{l2_name_cn}
        and the target L4 is listed above or explicitly reserved.

        ## Revision History

        | Version | Date | Author | Changes |
        | --- | --- | --- | --- |
        | 0.1.0 | #{doc_date} | #{author} | Initial confirmed L2 skeleton. |
      MD
    )

    write_rel.(File.join(l2_dir, entry_doc),
      metadata.("#{l2_name_en} Entry Coverage(#{l2_name_cn}入口覆盖)", "Confirmed", "Entry coverage skeleton for #{l2_name_cn}.") + <<~MD
        ## Entry Coverage

        | L4 | Entry Name | Code Anchor | Evidence |
        | --- | --- | --- | --- |
        #{entry_rows.join("\n")}

        ## Note

        Code anchors are filled and audited by sdlc-knowledge-sync from verified
        implementation evidence, never invented by bootstrap.

        ## Revision History

        | Version | Date | Author | Changes |
        | --- | --- | --- | --- |
        | 0.1.0 | #{doc_date} | #{author} | Initial entry coverage skeleton. |
      MD
    )

    catalog_l1l2 << "| #{l1_dir} | #{l2_full}#{l2_name_en} | [#{l2_doc}](<#{l2_dir}/#{l2_doc}>) | Confirmed | #{l2_owner} |"
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
  ROUTED_L1L2_ROWS=""
  ROUTED_L4_ROWS=""
  ROUTED_LANDSCAPE_ROWS=""
fi

# --- stage declaration + root skeletons --------------------------------------
if [[ -n "${DOMAIN_MAP}" ]]; then
  STATUS="routed"; ROUTABLE="true"
else
  STATUS="awaiting_domain_map"; ROUTABLE="false"
fi

generate_declaration "${STATUS}" "${ROUTABLE}" "${DOMAIN_MAP_REF}" \
  | write_staging_file "business_domain/knowledge-target.yaml"

# Stage the awaiting declaration + root skeletons for pristine/progression checks.
generate_declaration "awaiting_domain_map" "false" "null" \
  | write_staging_file ".awaiting/knowledge-target.yaml"

generate_landscape "${ROUTED_LANDSCAPE_ROWS}" \
  | write_staging_file "business_domain/00BusinessLandscape.md"
generate_language | write_staging_file "business_domain/00UbiquitousLanguage.md"

if [[ -n "${DOMAIN_MAP}" ]]; then
  generate_landscape "" | write_staging_file ".awaiting/00BusinessLandscape.md"
  generate_catalog "" "" | write_staging_file ".awaiting/01DomainCatalog.md"
  cp "${STAGING_DIR}/business_domain/00UbiquitousLanguage.md" \
     "${STAGING_DIR}/.awaiting/00UbiquitousLanguage.md"
fi

generate_catalog "${ROUTED_L1L2_ROWS}" "${ROUTED_L4_ROWS}" \
  | write_staging_file "business_domain/01DomainCatalog.md"

# --- plan actions (create / update / preserve / blocked) ---------------------
CREATED_FILES=()
UPDATED_FILES=()
PRESERVED_FILES=()
BLOCKED_REASONS=()
NOTICE_LINES=()
PLAN_OK="true"

stage_rel_paths() {
  ( cd "${STAGING_DIR}/business_domain" && find . -type f | sed 's#^\./##' | sort )
}

declare_plan_line() {
  local rel="$1" action="$2"
  case "${action}" in
    create)   CREATED_FILES+=("${rel}") ;;
    update)   UPDATED_FILES+=("${rel}") ;;
    preserve) PRESERVED_FILES+=("${rel}") ;;
  esac
}

# knowledge-target.yaml (initializer-owned machine declaration)
REL="knowledge-target.yaml"
TARGET_FILE="${BD_DIR}/${REL}"
EXISTING_DECL_STATUS="$(ruby -ryaml -e '
  begin
    d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
    puts d["status"].to_s
  rescue StandardError
    puts "unreadable"
  end
' "${DECLARATION}" 2>/dev/null || echo "unreadable")"
if [[ ! -e "${TARGET_FILE}" ]]; then
  declare_plan_line "${REL}" "create"
elif cmp -s "${TARGET_FILE}" "${STAGING_DIR}/business_domain/${REL}"; then
  : # identical declaration -> no-op
elif [[ -n "${DOMAIN_MAP}" && "${EXISTING_DECL_STATUS}" == "awaiting_domain_map" ]] \
     && cmp -s "${TARGET_FILE}" "${STAGING_DIR}/.awaiting/knowledge-target.yaml"; then
  declare_plan_line "${REL}" "update"   # pristine awaiting -> routed progression
elif [[ "${EXISTING_DECL_STATUS}" == "routed" && -z "${DOMAIN_MAP}" ]]; then
  NOTICE_LINES+=("target already routed; declaration preserved (no downgrade to awaiting)")
elif [[ "${UPDATE_DECLARATION}" == "true" ]]; then
  declare_plan_line "${REL}" "update"
else
  BLOCKED_REASONS+=("knowledge-target.yaml exists and differs from the staged declaration for this run; pass --update-declaration to replace it deliberately")
  PLAN_OK="false"
fi

# root documents
for REL in 00BusinessLandscape.md 00UbiquitousLanguage.md 01DomainCatalog.md; do
  TARGET_FILE="${BD_DIR}/${REL}"
  if [[ ! -e "${TARGET_FILE}" ]]; then
    declare_plan_line "${REL}" "create"
  elif cmp -s "${TARGET_FILE}" "${STAGING_DIR}/business_domain/${REL}"; then
    declare_plan_line "${REL}" "preserve"   # exists and untouched -> no-op
  elif [[ -n "${DOMAIN_MAP}" && -f "${STAGING_DIR}/.awaiting/${REL}" ]] \
       && cmp -s "${TARGET_FILE}" "${STAGING_DIR}/.awaiting/${REL}"; then
    declare_plan_line "${REL}" "update"     # pristine awaiting skeleton -> routed version
  else
    declare_plan_line "${REL}" "preserve"
  fi
done

# routed domain documents (from map): create missing; block on conflicting content
if [[ -n "${DOMAIN_MAP}" ]]; then
  while IFS= read -r REL; do
    [[ -z "${REL}" ]] && continue
    TARGET_FILE="${BD_DIR}/${REL}"
    if [[ -e "${TARGET_FILE}" ]]; then
      if cmp -s "${TARGET_FILE}" "${STAGING_DIR}/business_domain/${REL}"; then
        : # identical -> no-op
      else
        BLOCKED_REASONS+=("existing document differs from the confirmed-map skeleton: ${REL}")
        PLAN_OK="false"
      fi
    else
      declare_plan_line "${REL}" "create"
    fi
  done < <( stage_rel_paths | grep -v '^knowledge-target.yaml$' \
            | grep -v '^00BusinessLandscape.md$' | grep -v '^00UbiquitousLanguage.md$' \
            | grep -v '^01DomainCatalog.md$' )
fi

# legacy vocabulary advisory (bounded; file names only, never quoting markers)
LEGACY_MARKER_FILES=""
if [[ -d "${BD_DIR}" ]]; then
  LEGACY_MARKER_FILES="$(grep -ril -e 'speckit' -e '99pendingconfirmation' \
      -e 'dual rail' -e 'legacy rail' -- "${BD_DIR}" 2>/dev/null | sed "s#^${TARGET_PATH}/##" || true)"
fi

# --- dry-run preview ----------------------------------------------------------
if [[ "${DRY_RUN}" == "true" ]]; then
  echo "== DRY RUN (nothing written) =="
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

# --- execute -------------------------------------------------------------------
if [[ "${#CREATED_FILES[@]}" -gt 0 ]]; then
  for REL in "${CREATED_FILES[@]}"; do
    mkdir -p "$(dirname "${BD_DIR}/${REL}")"
    cp "${STAGING_DIR}/business_domain/${REL}" "${BD_DIR}/${REL}"
  done
fi
if [[ "${#UPDATED_FILES[@]}" -gt 0 ]]; then
  for REL in "${UPDATED_FILES[@]}"; do
    mkdir -p "$(dirname "${BD_DIR}/${REL}")"
    cp "${STAGING_DIR}/business_domain/${REL}" "${BD_DIR}/${REL}"
  done
fi

mkdir -p "${REPORT_DIR}"
REPORT_FILE="${REPORT_DIR}/knowledge_target_bootstrap_report.${RUN_TIMESTAMP}.md"
{
  echo "# Knowledge Target Bootstrap Report"
  echo ""
  echo "> **Project**: ${PROJECT_NAME}"
  echo "> **Generated At**: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "> **Generated By**: scripts/bootstrap-knowledge-target.sh (D-088-01)"
  echo "> **Target Repository**: ${TARGET_PATH}"
  echo ""
  echo "| Item | Value |"
  echo "| --- | --- |"
  echo "| Knowledge target | .specify/business_domain |"
  echo "| Declaration | .specify/business_domain/knowledge-target.yaml |"
  echo "| Mode | ${STATUS} |"
  echo "| Routable | ${ROUTABLE} |"
  echo "| Domain map | ${DOMAIN_MAP:-<not used>} |"
  echo "| Git author | ${AUTHOR} |"
  echo ""
  echo "## Created"
  if [[ "${#CREATED_FILES[@]}" -gt 0 ]]; then printf -- '- %s\n' "${CREATED_FILES[@]}"; else echo "- <none>"; fi
  echo "## Updated"
  if [[ "${#UPDATED_FILES[@]}" -gt 0 ]]; then printf -- '- %s\n' "${UPDATED_FILES[@]}"; else echo "- <none>"; fi
  echo "## Preserved (never modified)"
  if [[ "${#PRESERVED_FILES[@]}" -gt 0 ]]; then printf -- '- %s\n' "${PRESERVED_FILES[@]}"; else echo "- <none>"; fi
  echo "## Remaining Confirmation"
  if [[ "${ROUTABLE}" == "false" ]]; then
    echo "- No confirmed domain map yet: target stays routable:false; sync produces proposals only."
    echo "- Provide a confirmed domain map and re-run with --domain-map to become routable."
  fi
  if [[ -n "${LEGACY_MARKER_FILES}" ]]; then
    echo "- Retired vocabulary detected in existing files (bounded migration advisory;"
    echo "  migrate through sdlc-knowledge-sync entries, do not rewrite wholesale):"
    printf -- '  - %s\n' ${LEGACY_MARKER_FILES}
  fi
  echo ""
  echo "## Source Evidence"
  echo "- Process facts: current requirement library/{requirement_id}/ seven-node artifacts."
  echo "- Code and verification evidence: target repository; consumed by sdlc-knowledge-sync."
} > "${REPORT_FILE}"

# --- summary -------------------------------------------------------------------
echo "== knowledge-target bootstrap summary =="
if [[ "${EXISTING_DECL_STATUS}" == "routed" && -z "${DOMAIN_MAP}" ]]; then
  echo "STATE=routed (existing declaration preserved; this run had no confirmed map)"
  echo "ROUTABLE=true"
else
  echo "STATE=${STATUS}"
  echo "ROUTABLE=${ROUTABLE}"
fi
echo "KNOWLEDGE_TARGET=.specify/business_domain"
echo "DECLARATION=.specify/business_domain/knowledge-target.yaml"
echo "CREATED: ${CREATED_FILES[*]:-}"
echo "UPDATED: ${UPDATED_FILES[*]:-}"
echo "PRESERVED: ${PRESERVED_FILES[*]:-}"
if [[ "${#BLOCKED_REASONS[@]}" -gt 0 ]]; then
  echo "BLOCKED: ${BLOCKED_REASONS[*]}"
fi
echo "LEGACY_MARKERS: $([[ -n "${LEGACY_MARKER_FILES}" ]] && printf '%s' "${LEGACY_MARKER_FILES}" | wc -l | tr -d ' ' || echo 0) file(s); bounded migration advisory recorded in the report"
echo "REPORT=${REPORT_FILE#${TARGET_PATH}/}"
echo "REMAINING_CONFIRMATION: $([[ "${ROUTABLE}" == "false" ]] && echo 'confirmed domain map required before routing' || echo 'none')"
echo ""
echo "NOTES:"
echo "- This initializer creates the knowledge TARGET structure only; it never invents business facts."
echo "- Stable facts are written exclusively by sdlc-knowledge-sync into .specify/business_domain/**,"
echo "  sourced from the current requirement library/{requirement_id}/ artifacts, code and verification evidence."
exit 0
