#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

ROOT = File.expand_path("..", __dir__)
CONTRACT_DIR = File.join(ROOT, "skill-contracts", "known-skills")
SKILL_DIR = File.join(ROOT, "skills")
MANIFEST_PATH = File.join(ROOT, "manifest.yaml")
REGISTRY_PATH = File.join(ROOT, "registry", "skill-registry.md")

ALLOWED_CATEGORIES = [
  "Intake Skill",
  "Producer Skill",
  "Auditor Skill",
  "Reviewer Skill",
  "Executor Skill",
  "Renderer Skill",
  "Publisher Skill",
  "Sync Skill",
  "Workflow Skill"
].freeze

REQUIRED_FIELDS = [
  "name",
  "category",
  "stage",
  "status",
  "input_artifacts",
  "output_artifacts",
  "side_effects",
  "can_modify_code",
  "can_modify_docs",
  "can_modify_knowledge_base",
  "can_execute_commands",
  "blocking_conditions"
].freeze

errors = []

def relative(path)
  path.sub("#{ROOT}/", "")
end

LEGACY_SOURCE_PATH_PATTERN = %r{\.specify/(?:memory|workflow|coding_guide)(?:/|\b)}.freeze
LEGACY_SOURCE_DANGER_PATTERN = /
  required\s+inputs?|
  input_artifacts?|
  load(?:s|ed|ing)?|
  read(?:s|ing)?|
  source\s+from|
  consume(?:s|d|ing)?|
  use(?:s|d|ing)?|
  normal\s+input|
  authoritative|
  workflow\s+rules?
/ix.freeze
LEGACY_SOURCE_ALLOWED_GUARD_PATTERN = /
  do\s+not|
  don't|
  must\s+not|
  never|
  not\s+(?:read|resolve|authoritative|new-rail|copied)|
  preserve(?:d)?(?:\s+only|\s+not\s+read|\s+not\s+runtime\s+input)?|
  preserved_not_runtime_input|
  preserved_not_read|
  reference\s+only|
  exclude(?:d|s)?|
  prohibit(?:ed|s)?|
  forbidden|
  remain\s+untouched|
  legacy\s+rail\s+input
/ix.freeze

FILENAME_VERSION_PATTERN = /
  __v(?:N|\d+|\{version\})(?=\.)|
  \{requirement_id\}__\{artifact_type\}__v|
  v\{version\}\.md|
  vN\.md
/ix.freeze
FILENAME_VERSION_ALLOWED_GUARD_PATTERN = /
  forbidden|
  prohibit(?:ed|s)?|
  do\s+not|
  don't|
  must\s+not|
  never|
  legacy|
  historical|
  history|
  migration|
  example\s+only|
  bad\s+example|
  anti[-\s]?pattern|
  禁止|
  不推荐|
  反例|
  错误示例|
  历史|
  迁移
/ix.freeze

ARTIFACT_TEMPLATE_REQUIRED_PATTERNS = {
  "## Metadata" => /## Metadata/,
  "Version:" => /Version:/,
  "Status:" => /Status:/,
  "## 修订记录" => /## 修订记录/
}.freeze

GATE_REVIEW_REQUIRED_PATTERNS = {
  "Reviewed Artifact" => /Reviewed Artifact:/,
  "Reviewed Artifact Version" => /Reviewed Artifact Version:/
}.freeze

SPECIFY_PRODUCT_SHAPE_REQUIRED_SECTIONS = [
  "Domain Route / Scope Baseline",
  "Requirement Type",
  "Business Domain Targets",
  "Entry Coverage Target",
  "Sync Targets",
  "Representative Data Simulation",
  "Edge Cases",
  "Functional Requirements",
  "Key Entities / Data Contracts",
  "Success Criteria",
  "Source Artifact Traceability",
  "Branch / Repository Boundary"
].freeze

PLAN_COMPANION_REQUIRED_TERMS = [
  "specs/{feature}/plan.md",
  "specs/{feature}/research.md",
  "specs/{feature}/data-model.md",
  "specs/{feature}/contracts/",
  "specs/{feature}/quickstart.md",
  "Artifact:",
  "Skip Reason:",
  "Risk:",
  "Impact:",
  "Accepted By:",
  "Re-Gate Required:"
].freeze

PLAN_CONTRACT_SURFACE_REQUIRED_TERMS = [
  "API/RPC/MQ",
  "page/route behavior",
  "input tables/topics/files",
  "output tables/topics/reports",
  "SQL/data lineage",
  "rerun/replay/idempotency"
].freeze

CONFIRMED_DOMAIN_BOOTSTRAP_REQUIRED_TERMS = [
  "--confirmed",
  "--domain-map",
  "confirmed_domains",
  "project_type_profiles",
  "templates/business-domain-l4",
  "L2MainDocument",
  "L4Document",
  "EntryCoverageDocument"
].freeze

SYNC_CREATE_IF_MISSING_REQUIRED_TERMS = [
  "create-if-missing",
  "L1/L2",
  "owner",
  "L4 id",
  "01DomainCatalog.md",
  "Project Type Profiles",
  "Selected L4 Template",
  "templates/business-domain-l4",
  "entry coverage audit",
  "one-off"
].freeze

BUSINESS_DOMAIN_L4_TEMPLATE_REQUIREMENTS = {
  "templates/business-domain-l4/backend-business-service.md" => [
    "Project Type Profile",
    "backend-business-service",
    "Entry Chain",
    "Transaction Boundary",
    "Idempotency",
    "Rollback And Compensation",
    "Test Evidence"
  ],
  "templates/business-domain-l4/admin-mixed-workflow.md" => [
    "Project Type Profile",
    "admin-mixed-workflow",
    "Configuration Lifecycle",
    "Approval / Audit",
    "Import / Export",
    "Read-Only Query Contract",
    "Concurrency And Rollback"
  ],
  "templates/business-domain-l4/frontend-application.md" => [
    "Project Type Profile",
    "frontend-application",
    "Route / Page / Component Surface",
    "API And Backend Boundary",
    "Popup / Interaction",
    "State And Visibility",
    "Visual Verification"
  ],
  "templates/business-domain-l4/data-pipeline-etl.md" => [
    "Project Type Profile",
    "data-pipeline-etl",
    "Trigger And Runtime",
    "Input Contract",
    "Output Contract",
    "SQL Lineage",
    "Partition / Window / Checkpoint",
    "Replay And Idempotency",
    "Downstream Consumer Contract"
  ],
  "templates/business-domain-l4/library-shared-component.md" => [
    "Project Type Profile",
    "library-shared-component",
    "Public API",
    "Consumer Scenario",
    "Compatibility",
    "Deprecation / Migration",
    "Test Evidence"
  ]
}.freeze

NEW_RAIL_PIPELINE_REQUIRED_TERMS = [
  "New-Rail Enhanced",
  "ProjectWorkflowGuide.md",
  "ProjectDocumentationGuide.md",
  "sdlc-speckit-*",
  "development-time fixture",
  ".specify/memory/**",
  ".specify/workflow/**",
  ".specify/coding_guide/**",
  "Clarify",
  "continuous execution",
  "Domain Route Summary",
  "New-Rail Runtime Check"
].freeze

ROUTE_ARTIFACT_REQUIRED_TERMS = [
  "specs/{feature}/route.md",
  "Route Type",
  "existing-change",
  "new-flow",
  "integration-change",
  "data-change",
  "unknown",
  "Create-If-Missing Decision",
  "Entry Coverage Surface",
  "Business Domain Targets",
  "Legacy Skill usage: none",
  "Legacy document runtime input: none",
  "Legacy document write target: none",
  "Pipeline Domain Route Summary"
].freeze

ROUTE_ARTIFACT_INTEGRATION_TERMS = [
  "specs/{feature}/route.md",
  "Route Type",
  "unknown",
  "Pipeline Domain Route Summary"
].freeze

ROUTE_ARTIFACT_RUNTIME_TERMS = [
  "Legacy Skill usage: none",
  "Legacy document runtime input: none",
  "Legacy document write target: none"
].freeze

FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS = [
  "specs/{feature}/implementation.md",
  "specs/{feature}/workflow-status.md",
  "specs/{feature}/debug-guide.md",
  "specs/{feature}/observability.md",
  "library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md",
  "library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md",
  "manifest is status authority"
].freeze

FRONTEND_PROCESS_PRODUCT_LEGACY_MAPPING_TERMS = [
  "Legacy Semantic Mapping Source Only",
  "implementation-details.md",
  "SDD_WORKFLOW_STATUS.md",
  "API_DEBUG_GUIDE.md",
  "QUICK_DEBUG_REFERENCE.md",
  "LOGGING_IMPLEMENTATION.md",
  "FINAL_SUMMARY.md"
].freeze

FRONTEND_PROCESS_PRODUCT_SCHEMA_TERMS = [
  "File Changes",
  "Key Technical Decisions",
  "Frontend State And Interaction Implementation",
  "Backend Or Mock Boundary",
  "API Debug",
  "Quick Debug Reference",
  "Mock / Real Data Switching",
  "Reproduction Steps",
  "Logging",
  "Metrics",
  "Frontend Analytics",
  "Error State Observation",
  "Debug Logs"
].freeze

FRONTEND_PROCESS_PRODUCT_RECONCILE_TERMS = [
  "Process Product Drift",
  "implementation.md",
  "workflow-status.md",
  "debug-guide.md",
  "observability.md",
  "code diff",
  "manifest"
].freeze

FEATURE_SCOPED_SPECKIT_PATH_TERMS = [
  "specs/{feature}/spec.md",
  "specs/{feature}/plan.md",
  "specs/{feature}/tasks.md",
  "specs/{feature}/route.md"
].freeze

IMPLEMENT_ROUTE_BOUNDARY_TERMS = [
  "Implement does not reinterpret Route Type",
  "Implement does not reinterpret Business Domain Targets",
  "Analyze Gate",
  "approved `specs/{feature}/tasks.md`",
  "Domain Route",
  "Re-Gate"
].freeze

FLAT_SPECKIT_RUNTIME_PATH_PATTERN = %r{specs/(?:spec|plan|tasks)\.md}.freeze
FLAT_SPECKIT_ALLOWED_GUARD_PATTERN = /
  not\s+(?:the\s+)?current\s+runtime\s+path|
  historical|
  history|
  legacy|
  example\s+only|
  anti[-\s]?pattern|
  bad\s+example|
  不是当前\s*runtime\s*path|
  历史|
  反例
/ix.freeze

LEGACY_PROCESS_FILENAME_PATTERN = /
  implementation-details\.md|
  SDD_WORKFLOW_STATUS\.md|
  API_DEBUG_GUIDE\.md|
  QUICK_DEBUG_REFERENCE\.md|
  LOGGING_IMPLEMENTATION\.md|
  FINAL_SUMMARY\.md
/x.freeze

LEGACY_PROCESS_RUNTIME_OUTPUT_DANGER_PATTERN = /
  output(?:s)?|
  output_artifacts?|
  write(?:s|ing)?|
  produce(?:s|d|ing)?|
  create(?:s|d|ing)?|
  generate(?:s|d|ing)?|
  compatibility\s+format|
  runtime\s+output|
  输出|
  写入|
  生成|
  兼容格式
/ix.freeze

LEGACY_PROCESS_ALLOWED_GUARD_PATTERN = /
  Legacy\s+Semantic\s+Mapping\s+Source\s+Only|
  semantic\s+mapping\s+source|
  development-time\s+semantic\s+mapping\s+source|
  do\s+not|
  must\s+not|
  never|
  not\s+(?:as\s+)?(?:runtime|output|input|compatibility)|
  语义映射来源|
  不得作为|
  只能作为
/ix.freeze

ENTRY_COVERAGE_PRECISION_RUNNER_TERMS = [
  "classification",
  "classification_reason",
  "match_strength",
  "match_reason",
  "reverse_coverage_status",
  "parse_markdown_tables",
  "TABLE_COLUMN_ALIASES",
  "technical_bridge",
  "framework_bridge",
  "generated_or_vendor",
  "native_shell",
  "abstract_or_base",
  "annotation_or_marker",
  "not_applicable",
  "doc_match_for_record",
  "match_row_to_record",
  "Service / Manager / Mapper",
  "ETL coverage",
  "Frontend coverage"
].freeze

ENTRY_COVERAGE_PRECISION_DOC_TERMS = [
  "EntryCoverage table parsing",
  "technical bridge",
  "reverse coverage",
  "frontend",
  "ETL",
  "Service / Manager / Mapper",
  "native shell",
  "generated/vendor",
  "match_strength",
  "match_reason"
].freeze

ENTRY_COVERAGE_PROFILE_BOOTSTRAP_SCRIPT_TERMS = [
  "bootstrap-entry-coverage-profile.sh",
  "--project-type-profile",
  "--force-entry-coverage-profile",
  ".specify/entry-coverage-profile.yaml",
  ".specify/entry-coverage-profile.candidate.yaml",
  ".specify/reports/entry_coverage_profile_bootstrap_report.md",
  ".specify/business_domain/**",
  "specs/**",
  "library/**",
  ".specify/memory/**",
  ".specify/workflow/**",
  ".specify/coding_guide/**",
  "project-governance-profile.yaml",
  "conservative-candidate",
  "backend-business-service",
  "admin-mixed-workflow",
  "frontend-application",
  "data-pipeline-etl",
  "library-shared-component",
  "version",
  "project_type_profiles",
  "source_roots",
  "include_file_patterns",
  "exclude_file_patterns",
  "document_scope",
  "report_dir",
  "entry_types",
  "layers",
  "service",
  "manager",
  "persistence",
  "controller",
  "RPC",
  "MQ",
  "schedule",
  "mapper",
  "route",
  "page",
  "component",
  "store",
  "action",
  "api_client",
  "popup",
  "native_shell",
  "spark_job",
  "flink_main",
  "flink_process_function",
  "connector",
  "sink",
  "publisher",
  "sql",
  "data_console",
  "worker",
  "import",
  "export",
  "SPI"
].freeze

ENTRY_COVERAGE_PROFILE_BOOTSTRAP_DOC_TERMS = [
  "Entry Coverage Profile Bootstrap",
  "bootstrap-entry-coverage-profile.sh",
  ".specify/entry-coverage-profile.yaml",
  ".specify/entry-coverage-profile.candidate.yaml",
  ".specify/reports/entry_coverage_profile_bootstrap_report.md",
  "Restricted Write Boundary",
  ".specify/business_domain/**",
  "specs/**",
  "library/**",
  ".specify/memory/**",
  ".specify/workflow/**",
  ".specify/coding_guide/**",
  "--force-entry-coverage-profile",
  "backend-business-service",
  "admin-mixed-workflow",
  "frontend-application",
  "data-pipeline-etl",
  "library-shared-component"
].freeze

BOOTSTRAP_PRIVATE_CONTEXT_REQUIRED_TERMS = [
  "ProjectWorkflowGuide.md",
  "ProjectDocumentationGuide.md",
  "workflow_guides",
  "documentation_guides",
  "generate_project_workflow_guide",
  "generate_project_documentation_guide"
].freeze

CORE_ARTIFACT_TEMPLATES = [
  "templates/technical-specification-template.md",
  "templates/gate-result-template.md",
  "templates/artifact-manifest-template.md"
].freeze

GATE_REVIEW_TEMPLATE_PATH_PATTERNS = [
  %r{templates/gate-result-template\.md\z},
  %r{references/(?:output-report|output-artifact|output-and-manifest)\.md\z},
  %r{references/.*output.*\.md\z}
].freeze

GATE_REVIEW_NAME_PATTERN = /
  gate|
  review|
  审核|
  审查|
  验收|
  feedback|
  sync|
  reconcile
/ix.freeze

def unsafe_legacy_source_references(text)
  lines = text.lines
  unsafe = []

  lines.each_with_index do |line, index|
    next unless line.match?(LEGACY_SOURCE_PATH_PATTERN)

    context = [
      lines[index - 4],
      lines[index - 3],
      lines[index - 2],
      lines[index - 1],
      line,
      lines[index + 1],
      lines[index + 2]
    ].compact.join(" ")

    next if context.match?(LEGACY_SOURCE_ALLOWED_GUARD_PATTERN)
    next unless context.match?(LEGACY_SOURCE_DANGER_PATTERN)

    unsafe << [index + 1, line.strip]
  end

  unsafe
end

def unsafe_filename_version_references(text)
  lines = text.lines
  unsafe = []

  lines.each_with_index do |line, index|
    next unless line.match?(FILENAME_VERSION_PATTERN)

    context = [
      lines[index - 4],
      lines[index - 3],
      lines[index - 2],
      lines[index - 1],
      line,
      lines[index + 1],
      lines[index + 2]
    ].compact.join(" ")

    next if context.match?(FILENAME_VERSION_ALLOWED_GUARD_PATTERN)

    unsafe << [index + 1, line.strip]
  end

  unsafe
end

def unsafe_flat_speckit_runtime_paths(text)
  lines = text.lines
  unsafe = []

  lines.each_with_index do |line, index|
    next unless line.match?(FLAT_SPECKIT_RUNTIME_PATH_PATTERN)

    context = [
      lines[index - 3],
      lines[index - 2],
      lines[index - 1],
      line,
      lines[index + 1],
      lines[index + 2]
    ].compact.join(" ")

    next if context.match?(FLAT_SPECKIT_ALLOWED_GUARD_PATTERN)

    unsafe << [index + 1, line.strip]
  end

  unsafe
end

def unsafe_legacy_process_runtime_outputs(text)
  lines = text.lines
  unsafe = []

  lines.each_with_index do |line, index|
    next unless line.match?(LEGACY_PROCESS_FILENAME_PATTERN)

    context = [
      lines[index - 4],
      lines[index - 3],
      lines[index - 2],
      lines[index - 1],
      line,
      lines[index + 1],
      lines[index + 2]
    ].compact.join(" ")

    next if context.match?(LEGACY_PROCESS_ALLOWED_GUARD_PATTERN)
    next unless context.match?(LEGACY_PROCESS_RUNTIME_OUTPUT_DANGER_PATTERN)

    unsafe << [index + 1, line.strip]
  end

  unsafe
end

def missing_patterns(text, patterns)
  patterns.each_with_object([]) do |(label, pattern), missing|
    missing << label unless text.match?(pattern)
  end
end

def output_reference_path?(path)
  File.basename(path).match?(/output.*\.md\z/) ||
    path.include?("#{File::SEPARATOR}references#{File::SEPARATOR}") &&
      File.basename(path).include?("output")
end

def gate_or_review_template?(path)
  relative_path = relative(path)
  return true if relative_path.match?(GATE_REVIEW_NAME_PATTERN)

  GATE_REVIEW_TEMPLATE_PATH_PATTERNS.any? { |pattern| relative_path.match?(pattern) } &&
    File.read(path).match?(GATE_REVIEW_NAME_PATTERN)
end

def contract_yaml(path)
  text = File.read(path)
  yaml = text[/```yaml\n(.*?)\n```/m, 1]
  raise "missing fenced yaml metadata" unless yaml

  YAML.safe_load(yaml, permitted_classes: [], aliases: false) || {}
rescue Psych::SyntaxError => e
  raise "invalid yaml metadata: #{e.message}"
end

def fenced_yamls(path)
  File.read(path).scan(/```yaml\n(.*?)\n```/m).flatten.map do |yaml|
    YAML.safe_load(yaml, permitted_classes: [], aliases: false) || {}
  rescue Psych::SyntaxError => e
    { "__error__" => "invalid yaml metadata: #{e.message}" }
  end
end

contract_paths = Dir[File.join(CONTRACT_DIR, "sdlc-*.md")].sort
skill_paths = Dir[File.join(SKILL_DIR, "sdlc-*", "SKILL.md")].sort

contract_names = contract_paths.map { |path| File.basename(path, ".md") }
skill_names = skill_paths.map { |path| File.basename(File.dirname(path)) }

(skill_names - contract_names).each do |name|
  errors << "missing contract for skill #{name}"
end

contract_paths.each do |path|
  expected_name = File.basename(path, ".md")
  metadata = contract_yaml(path)

  REQUIRED_FIELDS.each do |field|
    value = metadata[field]
    missing = value.nil? || (value.respond_to?(:empty?) && value.empty?)
    errors << "#{relative(path)} missing required field #{field}" if missing
  end

  name = metadata["name"]
  errors << "#{relative(path)} name #{name.inspect} does not match #{expected_name}" if name && name != expected_name

  categories = metadata["category"].to_s.split("/").map(&:strip).reject(&:empty?)
  unknown = categories - ALLOWED_CATEGORIES
  errors << "#{relative(path)} has unknown categories: #{unknown.join(', ')}" unless unknown.empty?

  if metadata["can_modify_code"] == true && !(categories.include?("Executor Skill") || categories.include?("Workflow Skill"))
    errors << "#{relative(path)} can_modify_code=true requires Executor Skill or Workflow Skill"
  end

  if metadata["can_modify_knowledge_base"] == true && !(categories.include?("Sync Skill") || categories.include?("Workflow Skill"))
    errors << "#{relative(path)} can_modify_knowledge_base=true requires Sync Skill or Workflow Skill"
  end

  if metadata["can_modify_docs"] == true && categories.empty?
    errors << "#{relative(path)} can_modify_docs=true requires an explicit category"
  end

  required_storage = Array(metadata["required_storage"])
  if required_storage.include?("ai-sdlc/artifact-storage.md") &&
     !required_storage.include?("ai-sdlc/artifact-versioning.md")
    errors << "#{relative(path)} references artifact-storage but not ai-sdlc/artifact-versioning.md"
  end
rescue StandardError => e
  errors << "#{relative(path)} #{e.message}"
end

if File.exist?(MANIFEST_PATH)
  manifest = YAML.safe_load(File.read(MANIFEST_PATH), permitted_classes: [], aliases: false) || {}
  manifest_skills_by_name = {}
  manifest.fetch("skills", {}).each do |key, skill|
    skill_path = skill["path"]
    contract_path = skill["contract"]

    if skill_path.nil? || contract_path.nil?
      errors << "manifest skill #{key} must define path and contract"
      next
    end

    path = File.join(ROOT, skill_path)
    contract = File.join(ROOT, contract_path)

    errors << "manifest skill #{key} path missing: #{skill_path}" unless File.exist?(path)
    errors << "manifest skill #{key} contract missing: #{contract_path}" unless File.exist?(contract)
    manifest_skills_by_name[File.basename(File.dirname(path))] = {
      "key" => key,
      "path" => skill_path,
      "contract" => contract_path
    }
  end

  if File.exist?(REGISTRY_PATH)
    registry_entries = fenced_yamls(REGISTRY_PATH)
    registry_entries.each do |entry|
      if entry["__error__"]
        errors << "registry #{entry['__error__']}"
        next
      end

      name = entry["name"]
      next if name.to_s.empty?
      next unless name.start_with?("sdlc-")

      skill_path = Array(entry["skill_path"]).first
      contract_path = Array(entry["contract"]).first
      manifest_skill = manifest_skills_by_name[name]

      if manifest_skill.nil?
        errors << "registry skill #{name} missing from manifest.yaml"
        next
      end

      if skill_path && manifest_skill["path"] != skill_path
        errors << "registry skill #{name} path #{skill_path} does not match manifest #{manifest_skill['path']}"
      end

      if contract_path && manifest_skill["contract"] != contract_path
        errors << "registry skill #{name} contract #{contract_path} does not match manifest #{manifest_skill['contract']}"
      end
    end

    registry_names = registry_entries.map { |entry| entry["name"] }.compact
    (manifest_skills_by_name.keys - registry_names).each do |name|
      errors << "manifest skill #{name} missing from registry/skill-registry.md"
    end
  else
    errors << "missing registry/skill-registry.md"
  end
else
  errors << "missing manifest.yaml"
end

relative_standard_path_pattern = %r{\.\./\.\./(?:\.\./)?(?:ai-sdlc|ess|templates|skill-contracts)/}
Dir[File.join(SKILL_DIR, "sdlc-*", "**", "*.md")].sort.each do |path|
  text = File.read(path)
  if text.match?(relative_standard_path_pattern)
    errors << "#{relative(path)} uses relative standard-package path; use AI_SDLC_STANDARD_HOME"
  end

  unsafe_legacy_source_references(text).each do |line_number, line|
    errors << "#{relative(path)}:#{line_number} treats legacy .specify source as normal sdlc input: #{line}"
  end

  unsafe_legacy_process_runtime_outputs(text).each do |line_number, line|
    errors << "#{relative(path)}:#{line_number} treats legacy process filename as runtime output or compatibility format: #{line}"
  end
end

versioning_scan_paths = [
  Dir[File.join(ROOT, "ai-sdlc", "**", "*.md")],
  Dir[File.join(ROOT, "docs", "**", "*.md")],
  Dir[File.join(ROOT, "templates", "**", "*.md")],
  Dir[File.join(ROOT, "skills", "sdlc-*", "**", "*.md")],
  Dir[File.join(ROOT, "skill-contracts", "**", "*.md")],
  Dir[File.join(ROOT, "registry", "**", "*.md")],
  [File.join(ROOT, "README.md"), File.join(ROOT, "ROADMAP.md")]
].flatten.select { |path| File.file?(path) }.uniq.sort

versioning_scan_paths.each do |path|
  text = File.read(path)
  unsafe_filename_version_references(text).each do |line_number, line|
    errors << "#{relative(path)}:#{line_number} recommends filename-based artifact versioning: #{line}"
  end
end

CORE_ARTIFACT_TEMPLATES.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    missing_patterns(text, ARTIFACT_TEMPLATE_REQUIRED_PATTERNS).each do |label|
      errors << "#{relative_path} missing artifact versioning field #{label}"
    end
  else
    errors << "missing #{relative_path}"
  end
end

template_gate_path = File.join(ROOT, "templates", "gate-result-template.md")
if File.exist?(template_gate_path)
  missing_patterns(File.read(template_gate_path), GATE_REVIEW_REQUIRED_PATTERNS).each do |label|
    errors << "templates/gate-result-template.md missing gate/review field #{label}"
  end
end

specify_product_shape_paths = [
  "templates/technical-specification-template.md",
  "skills/sdlc-speckit-specify/references/spec-sync-mapping.md",
  "skills/sdlc-speckit-specify/references/output-and-manifest.md",
  "skill-contracts/known-skills/sdlc-speckit-specify.md"
].freeze

specify_product_shape_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    SPECIFY_PRODUCT_SHAPE_REQUIRED_SECTIONS.each do |section|
      errors << "#{relative_path} missing required Speckit spec product section #{section}" unless text.include?(section)
    end
  else
    errors << "missing #{relative_path}"
  end
end

plan_companion_paths = [
  "skills/sdlc-speckit-plan/SKILL.md",
  "skills/sdlc-speckit-plan/references/output-and-manifest.md",
  "skills/sdlc-speckit-plan/references/planning-scope.md",
  "skill-contracts/known-skills/sdlc-speckit-plan.md"
].freeze

plan_companion_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    PLAN_COMPANION_REQUIRED_TERMS.each do |term|
      errors << "#{relative_path} missing Plan companion artifact requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

plan_contract_paths = [
  "skills/sdlc-speckit-plan/references/output-and-manifest.md",
  "skill-contracts/known-skills/sdlc-speckit-plan.md"
].freeze

plan_contract_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  next unless File.exist?(path)

  text = File.read(path)
  PLAN_CONTRACT_SURFACE_REQUIRED_TERMS.each do |term|
    errors << "#{relative_path} missing Plan contract surface requirement #{term}" unless text.include?(term)
  end
end

output_reference_paths = Dir[File.join(ROOT, "skills", "sdlc-*", "references", "*.md")]
                         .select { |path| output_reference_path?(path) }
                         .uniq
                         .sort

output_reference_paths.each do |path|
  text = File.read(path)
  missing_patterns(text, ARTIFACT_TEMPLATE_REQUIRED_PATTERNS).each do |label|
    errors << "#{relative(path)} missing artifact versioning field #{label}"
  end

  next unless gate_or_review_template?(path)

  missing_patterns(text, GATE_REVIEW_REQUIRED_PATTERNS).each do |label|
    errors << "#{relative(path)} missing gate/review field #{label}"
  end
end

bootstrap_path = File.join(ROOT, "scripts", "bootstrap-speckit-project.sh")
if File.exist?(bootstrap_path)
  bootstrap = File.read(bootstrap_path)
  errors << "bootstrap script must write project-context candidates when files exist" unless bootstrap.include?("candidate_path")
  errors << "bootstrap script must not rely on single --force for profiles and context" if bootstrap.include?('FORCE="')
  BOOTSTRAP_PRIVATE_CONTEXT_REQUIRED_TERMS.each do |term|
    errors << "bootstrap script missing project private context requirement #{term}" unless bootstrap.include?(term)
  end
else
  errors << "missing scripts/bootstrap-speckit-project.sh"
end

bootstrap_context_paths = {
  "templates/project-governance-profile-template.yaml" => BOOTSTRAP_PRIVATE_CONTEXT_REQUIRED_TERMS.first(4),
  "docs/SPECKIT_BOOTSTRAP.md" => BOOTSTRAP_PRIVATE_CONTEXT_REQUIRED_TERMS.first(2),
  "ai-sdlc/speckit-project-bootstrap.md" => BOOTSTRAP_PRIVATE_CONTEXT_REQUIRED_TERMS.first(2)
}.freeze

bootstrap_context_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing project private context requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

new_rail_pipeline_paths = {
  "ai-sdlc/speckit-skill-product-compatibility.md" => [
    "New-Rail Enhanced",
    "ProjectWorkflowGuide.md",
    "ProjectDocumentationGuide.md",
    "sdlc-speckit-*",
    "development-time fixture",
    "post-Clarify continuous execution"
  ],
  "skills/sdlc-speckit-pipeline/SKILL.md" => NEW_RAIL_PIPELINE_REQUIRED_TERMS,
  "skills/sdlc-speckit-pipeline/references/new-rail-enhanced-pipeline.md" => NEW_RAIL_PIPELINE_REQUIRED_TERMS,
  "skills/sdlc-speckit-pipeline/references/domain-route-artifact.md" => ROUTE_ARTIFACT_REQUIRED_TERMS,
  "skills/sdlc-speckit-pipeline/references/stage-sequence.md" => [
    "sdlc-speckit-*",
    "development-time fixtures",
    "Clarify",
    "continuous execution",
    "Domain Route Summary",
    "New-Rail Runtime Check"
  ],
  "skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md" => [
    "speckit-*",
    ".specify/memory/**",
    ".specify/workflow/**",
    ".specify/coding_guide/**",
    "Clarify",
    "continuous segment"
  ],
  "skills/sdlc-speckit-pipeline/references/output-and-manifest.md" => [
    "New-Rail Runtime Check",
    "Domain Route Summary",
    "Route Artifact",
    "Legacy document write target",
    "sdlc-speckit-*",
    "Legacy rail paths touched"
  ],
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md" => NEW_RAIL_PIPELINE_REQUIRED_TERMS,
  "docs/VALIDATION.md" => [
    "ProjectWorkflowGuide",
    "ProjectDocumentationGuide",
    "sdlc-speckit-*",
    "Clarify",
    "New-Rail Runtime Check",
    "Domain Route Summary",
    "specs/{feature}/route.md",
    ".specify/memory/**",
    ".specify/workflow/**",
    ".specify/coding_guide/**"
  ]
}.freeze

new_rail_pipeline_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing New-Rail pipeline requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

route_artifact_paths = {
  "skills/sdlc-speckit-pipeline/SKILL.md" => ROUTE_ARTIFACT_INTEGRATION_TERMS + [
    "Create-If-Missing",
    "Business Domain Targets",
    "Entry Coverage"
  ],
  "skills/sdlc-speckit-pipeline/references/domain-route-artifact.md" => ROUTE_ARTIFACT_REQUIRED_TERMS,
  "skills/sdlc-speckit-pipeline/references/new-rail-enhanced-pipeline.md" => ROUTE_ARTIFACT_REQUIRED_TERMS,
  "skills/sdlc-speckit-pipeline/references/output-and-manifest.md" => ROUTE_ARTIFACT_INTEGRATION_TERMS + [
    "Create-If-Missing Decision",
    "Business Domain Targets",
    "Entry Coverage Surface"
  ],
  "skills/sdlc-speckit-specify/SKILL.md" => ROUTE_ARTIFACT_INTEGRATION_TERMS,
  "skills/sdlc-speckit-specify/references/spec-sync-mapping.md" => ROUTE_ARTIFACT_INTEGRATION_TERMS + [
    "Business Domain Targets",
    "Entry Coverage Target",
    "Sync Targets"
  ],
  "skills/sdlc-speckit-specify/references/output-and-manifest.md" => ROUTE_ARTIFACT_INTEGRATION_TERMS,
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md" => ROUTE_ARTIFACT_INTEGRATION_TERMS + ROUTE_ARTIFACT_RUNTIME_TERMS + [
    "Create-If-Missing",
    "Business Domain Targets",
    "Entry Coverage"
  ],
  "skill-contracts/known-skills/sdlc-speckit-specify.md" => ROUTE_ARTIFACT_INTEGRATION_TERMS,
  "docs/VALIDATION.md" => ROUTE_ARTIFACT_REQUIRED_TERMS
}.freeze

route_artifact_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing route artifact requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

frontend_process_product_paths = {
  "skills/sdlc-speckit-implement/references/process-products.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS +
    FRONTEND_PROCESS_PRODUCT_LEGACY_MAPPING_TERMS +
    FRONTEND_PROCESS_PRODUCT_SCHEMA_TERMS,
  "skills/sdlc-speckit-implement/SKILL.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS + [
      "process-products.md",
      "Process Products Produced Or Recommended",
      "Stop Conditions"
    ],
  "skills/sdlc-speckit-implement/references/output-and-manifest.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS + [
      "Process Products Produced Or Recommended",
      "Workflow Status Snapshot",
      "Delivery Summary"
    ],
  "skills/sdlc-speckit-implement/references/execution-boundaries.md" => [
    "specs/{feature}/implementation.md",
    "specs/{feature}/workflow-status.md",
    "specs/{feature}/debug-guide.md",
    "specs/{feature}/observability.md",
    "library/{requirement_id}/04-交付总结/*",
    "manifest is status authority",
    "legacy process filenames"
  ],
  "skills/sdlc-speckit-implement/references/verification-and-recording.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS.first(4) + [
      "library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md",
      "manifest.md is the status authority"
    ],
  "skill-contracts/known-skills/sdlc-speckit-implement.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS + [
      "Process Products Produced Or Recommended",
      "Delivery Summary Recommendation"
    ],
  "skills/sdlc-speckit-pipeline/SKILL.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS + [
      "Stage Timeline",
      "Produced Or Reused Artifacts"
    ],
  "skills/sdlc-speckit-pipeline/references/output-and-manifest.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS + [
      "Stage Timeline",
      "Produced Or Reused Artifacts",
      "Process Products",
      "Manifest Update Recommendation"
    ],
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS,
  "skills/sdlc-speckit-code-doc-reconcile/SKILL.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS.first(4) +
    FRONTEND_PROCESS_PRODUCT_RECONCILE_TERMS,
  "skills/sdlc-speckit-code-doc-reconcile/references/reconcile-inputs.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS.first(4) + [
      "library/{requirement_id}/04-交付总结/*",
      "manifest.md is the status authority"
    ],
  "skills/sdlc-speckit-code-doc-reconcile/references/audit-workflow.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS.first(4) +
    FRONTEND_PROCESS_PRODUCT_RECONCILE_TERMS,
  "skills/sdlc-speckit-code-doc-reconcile/references/output-and-manifest.md" =>
    FRONTEND_PROCESS_PRODUCT_RECONCILE_TERMS,
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS.first(4) + [
      "library/{requirement_id}/04-交付总结/*",
      "Process Product Drift",
      "manifest is status authority"
    ],
  "templates/artifact-manifest-template.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS,
  "ai-sdlc/artifact-storage.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS.first(4) + [
      "04-交付总结",
      "manifest 是状态权威源"
    ],
  "docs/VALIDATION.md" =>
    FRONTEND_PROCESS_PRODUCT_REQUIRED_TERMS +
    FRONTEND_PROCESS_PRODUCT_LEGACY_MAPPING_TERMS
}.freeze

frontend_process_product_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing frontend process product requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

implement_feature_scoped_paths = {
  "skill-contracts/known-skills/sdlc-speckit-implement.md" =>
    FEATURE_SCOPED_SPECKIT_PATH_TERMS + IMPLEMENT_ROUTE_BOUNDARY_TERMS,
  "skills/sdlc-speckit-implement/SKILL.md" =>
    FEATURE_SCOPED_SPECKIT_PATH_TERMS + IMPLEMENT_ROUTE_BOUNDARY_TERMS,
  "skills/sdlc-speckit-implement/references/implementation-inputs.md" =>
    FEATURE_SCOPED_SPECKIT_PATH_TERMS + [
      "Route Type",
      "Business Domain Targets",
      "Analyze /",
      "Domain Route",
      "Re-Gate"
    ],
  "skills/sdlc-speckit-implement/references/output-and-manifest.md" =>
    FEATURE_SCOPED_SPECKIT_PATH_TERMS + IMPLEMENT_ROUTE_BOUNDARY_TERMS,
  "skills/sdlc-speckit-implement/references/blocking-and-regate.md" => [
    "specs/{feature}/route.md",
    "Route Type",
    "Business Domain Targets",
    "Domain Route",
    "Re-Gate"
  ],
  "docs/VALIDATION.md" =>
    FEATURE_SCOPED_SPECKIT_PATH_TERMS + IMPLEMENT_ROUTE_BOUNDARY_TERMS + [
      "Feature-Scoped Path Consistency",
      "not current runtime path"
    ]
}.freeze

implement_feature_scoped_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing feature-scoped implement requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

implement_flat_path_scan_paths = [
  "skill-contracts/known-skills/sdlc-speckit-implement.md",
  "skills/sdlc-speckit-implement/SKILL.md",
  "skills/sdlc-speckit-implement/references/implementation-inputs.md",
  "skills/sdlc-speckit-implement/references/output-and-manifest.md",
  "skills/sdlc-speckit-implement/references/blocking-and-regate.md"
].freeze

implement_flat_path_scan_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  next unless File.exist?(path)

  unsafe_flat_speckit_runtime_paths(File.read(path)).each do |line_number, line|
    errors << "#{relative_path}:#{line_number} uses flat Speckit runtime path; use specs/{feature}/...: #{line}"
  end
end

entry_coverage_precision_paths = {
  "scripts/audit-entry-coverage.rb" => ENTRY_COVERAGE_PRECISION_RUNNER_TERMS,
  "docs/VALIDATION.md" => ENTRY_COVERAGE_PRECISION_DOC_TERMS,
  "skills/sdlc-speckit-analyze/references/analyze-gate-check.md" => [
    "entry_inventory.tsv",
    "service_inventory.tsv",
    "classification",
    "match_strength",
    "reverse_coverage_status",
    "technical bridge",
    "generated/vendor",
    "frontend native shell"
  ],
  "skills/sdlc-speckit-sync/references/sync-targets.md" => [
    "business_entry",
    "technical_bridge",
    "generated_or_vendor",
    "native_shell",
    "reverse_coverage_status",
    "create-if-missing",
    "table/code anchor/path/method/route/topic/job/function/SQL/connector/sink"
  ],
  "ai-sdlc/speckit-project-type-profiles.md" => [
    "EntryCoverage table parsing",
    "Service -> Manager -> Mapper/Repository/Client reverse coverage",
    "native shell",
    "generated/vendor",
    "spark_job",
    "flink_process_function",
    "api_client/request/service",
    "current_requirement",
    "historical_repository_residue"
  ]
}.freeze

entry_coverage_precision_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing entry coverage precision requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

entry_coverage_profile_bootstrap_paths = {
  "scripts/bootstrap-entry-coverage-profile.sh" => ENTRY_COVERAGE_PROFILE_BOOTSTRAP_SCRIPT_TERMS,
  "docs/VALIDATION.md" => ENTRY_COVERAGE_PROFILE_BOOTSTRAP_DOC_TERMS
}.freeze

entry_coverage_profile_bootstrap_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing restricted entry coverage profile bootstrap requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

business_domain_bootstrap_paths = [
  "scripts/bootstrap-business-domain.sh",
  "templates/business-domain-bootstrap-template.yaml",
  "docs/SPECKIT_BOOTSTRAP.md",
  "docs/VALIDATION.md",
  "ai-sdlc/speckit-project-bootstrap.md"
].freeze

business_domain_bootstrap_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    CONFIRMED_DOMAIN_BOOTSTRAP_REQUIRED_TERMS.each do |term|
      errors << "#{relative_path} missing confirmed-domain bootstrap requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

BUSINESS_DOMAIN_L4_TEMPLATE_REQUIREMENTS.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing project-type L4 template requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

sync_create_if_missing_paths = [
  "skills/sdlc-speckit-sync/SKILL.md",
  "skills/sdlc-speckit-sync/references/sync-targets.md",
  "skills/sdlc-speckit-sync/references/fact-eligibility.md",
  "skills/sdlc-speckit-sync/references/conflict-and-blocking.md",
  "skill-contracts/known-skills/sdlc-speckit-sync.md",
  "docs/VALIDATION.md"
].freeze

sync_create_if_missing_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    SYNC_CREATE_IF_MISSING_REQUIRED_TERMS.each do |term|
      errors << "#{relative_path} missing Sync create-if-missing requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

if errors.empty?
  puts "skill contract validation ok"
else
  warn "skill contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
