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
  _v(?:N|\d+|\{version\})(?=\.)|
  \{requirement_id\}_\{artifact_type\}_v|
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

DOCFLOW_DOUBLE_UNDERSCORE_PATH_PATTERN = /
  library\/[^\s`|]*__[^\s`|]*|
  \{requirement_id\}__[^\s`|]*|
  <requirement_id>__[^\s`|]*|
  REQ-\d+__[^\s`|]*|
  20\d{6}[A-Za-z0-9._-]*__[^\s`|]*
/x.freeze

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
  "API contract",
  "RPC contract",
  "MQ producer/consumer contract",
  "route/page contract",
  "component/state/store contract",
  "trigger contract",
  "input contract",
  "output contract",
  "SQL lineage contract",
  "replay/idempotency contract"
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
  "library/{requirement_id}/03-实现记录/{requirement_id}_实现记录.md",
  "library/{requirement_id}/04-交付总结/{requirement_id}_交付总结.md",
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
  "require \"date\"",
  "[target-project-path]",
  "Dir.pwd",
  "standard_package_root?",
  "manifest.yaml",
  "ai-sdlc",
  "skills",
  "package.json is auxiliary evidence only",
  "explicit frontend business files",
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
  "SPI",
  "composite_backend_admin",
  "backend_controller",
  "admin_controller",
  "backend_RPC",
  "admin_RPC",
  "backend_schedule",
  "admin_schedule",
  "[entry.name, entry.evidence_mode]"
].freeze

ENTRY_COVERAGE_PROFILE_BOOTSTRAP_DOC_TERMS = [
  "Entry Coverage Profile Bootstrap",
  "bootstrap-entry-coverage-profile.sh",
  "[target-project-path]",
  "Dir.pwd",
  "$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh --dry-run",
  "manifest.yaml",
  "ai-sdlc/",
  "skills/",
  "package.json-only",
  "src/pages",
  "src/views",
  "src/screens",
  "src/components",
  "src/component",
  "src/router",
  "src/routers",
  "src/routes",
  "src/navigation",
  "src/store",
  "src/stores",
  "src/models",
  "src/actions",
  "src/api",
  "src/services",
  "src/main/webapp",
  "*.jsp / *.ftl / *.vm",
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
  "admin-mixed-workflow + backend-business-service",
  "backend_controller",
  "admin_controller",
  "backend_RPC",
  "admin_RPC",
  "backend_schedule",
  "admin_schedule",
  "[name, evidence_mode]",
  "frontend-application",
  "data-pipeline-etl",
  "library-shared-component"
].freeze

ANALYZE_GATE_STRENGTHENING_TERMS = [
  "specs/{feature}/route.md",
  "specs/{feature}/spec.md",
  "specs/{feature}/plan.md",
  "specs/{feature}/tasks.md",
  ".specify/entry-coverage-profile.yaml",
  ".specify/entry-coverage-profile.candidate.yaml",
  ".specify/reports/entry_coverage/entry_coverage_report.md",
  ".specify/reports/entry_coverage/entry_inventory.tsv",
  ".specify/reports/entry_coverage/service_inventory.tsv",
  ".specify/reports/entry_coverage/cross_domain_conflicts.md",
  ".specify/reports/entry_coverage/unarchived_entries.md",
  ".specify/reports/entry_coverage/unarchived_services.md",
  "scripts/bootstrap-entry-coverage-profile.sh",
  "TSV",
  "classification",
  "classification_reason",
  "match_strength",
  "match_reason",
  "requirement_scope",
  "reverse_coverage_status",
  "no_entry_reverse_coverage",
  "technical_bridge",
  "framework_bridge",
  "generated_or_vendor",
  "native_shell",
  "abstract_or_base",
  "annotation_or_marker",
  "not_applicable",
  "business_entry",
  "business_domain L4 missing",
  "cross-domain conflict",
  "accepted shared boundary",
  "Project Type Profile Checks",
  "Entry Coverage Gate",
  "Parsed Entry Inventory Summary",
  "Parsed Service Inventory Summary",
  "Shared-Domain Duplication Decision",
  "Blocking Items",
  "Earliest Affected Node",
  "Re-Gate Recommendation",
  "Manifest Update Recommendation",
  "Next Step",
  "backend-business-service",
  "admin-mixed-workflow",
  "frontend-application",
  "data-pipeline-etl",
  "library-shared-component"
].freeze

ANALYZE_PROJECT_TYPE_CHECK_TERMS = [
  "backend-business-service",
  "entry -> service -> manager/repository/mapper coverage",
  "transaction boundary",
  "rollback path",
  "idempotency",
  "compensation",
  "API/RPC/MQ/Schedule contract",
  "admin-mixed-workflow",
  "controller / worker / schedule / data-console / SPI / RPC",
  "config lifecycle",
  "approval/audit",
  "import/export",
  "read-only query contract",
  "concurrency/rollback",
  "frontend-application",
  "route/page/component/store/API/popup/navigation",
  "state and visibility",
  "backend/mock boundary",
  "visual verification",
  "implementation/debug/observability process products",
  "native shell technical bridge does not block",
  "data-pipeline-etl",
  "trigger/input/output",
  "SQL lineage",
  "partition/window/checkpoint",
  "replay/idempotency",
  "downstream consumer",
  "function/connector/sink coverage",
  "library-shared-component",
  "public API",
  "consumer scenario",
  "compatibility",
  "deprecation/migration",
  "test evidence"
].freeze

BOOTSTRAP_PRIVATE_CONTEXT_REQUIRED_TERMS = [
  "ProjectWorkflowGuide.md",
  "ProjectDocumentationGuide.md",
  "workflow_guides",
  "documentation_guides",
  "generate_project_workflow_guide",
  "generate_project_documentation_guide"
].freeze

BOOTSTRAP_PERFORMANCE_SCRIPT_TERMS = [
  "--scan-root",
  "--include-root",
  "--scan-timeout",
  "--max-samples",
  "scan_duration_seconds",
  "timeout_occurred",
  "partial_scan",
  "TIMEOUT / PARTIAL",
  "scan_roots",
  "include_roots",
  "max_samples",
  "android/build",
  "ios/build",
  "node_modules",
  "large-fixtures",
  "__snapshots__",
  "mock-data"
].freeze

BOOTSTRAP_PERFORMANCE_DOC_TERMS = [
  "Bootstrap Performance / Large Repo Scan Control",
  "--scan-root",
  "--include-root",
  "--scan-timeout",
  "--max-samples",
  "scan duration",
  "timeout",
  "partial scan",
  "TIMEOUT / PARTIAL",
  "scan roots",
  "exclude patterns",
  "pfms",
  "android/build",
  "ios/build"
].freeze

DELTA_CHANGE_COMMON_TERMS = [
  "Delta Scope",
  "Current Change Scope",
  "Aggregate Requirement Scope",
  "Decision Scope",
  "DELTA_CHANGE",
  "FULL_REQUIREMENT",
  "Same Requirement Decision",
  "Requirement Supplement",
  "Specification Missing",
  "Re-Gate Records",
  "Earliest Affected Node"
].freeze

DELTA_CHANGE_SOLUTION_REVIEWER_TERMS = [
  "Delta Complexity",
  "Aggregate Complexity: reference only",
  "Ignored Aggregate Triggers",
  "Development Path Decision must be based on Delta Scope",
  "Do not route by aggregate complexity for requirement supplements"
].freeze

DELTA_CHANGE_REQUIREMENT_NORMALIZER_TERMS = [
  "Requirement Supplement",
  "Same Requirement",
  "Parent Requirement ID",
  "Current Change Scope",
  "New Requirement Needed"
].freeze

DELTA_CHANGE_SPECIFICATION_WRITER_TERMS = [
  "Change Event",
  "Current Change Scope",
  "Original Scope Context",
  "Delta Impact Analysis",
  "Out of Delta Scope"
].freeze

DELTA_CHANGE_VALIDATION_TERMS = [
  "Delta Change Routing",
  "package / pipeline route should not use aggregate scope for supplements",
  "DIRECT_IMPLEMENTATION after delta Re-Gate",
  "SPECKIT_PIPELINE_REQUIRED only when delta itself is complex"
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
  Dir[File.join(ROOT, "docs", "**", "*.md")].reject { |p| p.include?("docs/reports/archive/") },
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
  text.lines.each_with_index do |line, index|
    next unless line.match?(DOCFLOW_DOUBLE_UNDERSCORE_PATH_PATTERN)

    errors << "#{relative(path)}:#{index + 1} uses double underscore DocFlow runtime path: #{line.strip}"
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

entry_bootstrap_path = File.join(ROOT, "scripts", "bootstrap-entry-coverage-profile.sh")
if File.exist?(entry_bootstrap_path)
  entry_bootstrap = File.read(entry_bootstrap_path)
  errors << "entry coverage profile bootstrap must keep Dir.pwd fallback" unless entry_bootstrap.include?("Dir.pwd")
  errors << "entry coverage profile bootstrap must keep standard package self-protection" unless entry_bootstrap.include?("standard_package_root?")
else
  errors << "missing scripts/bootstrap-entry-coverage-profile.sh"
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

bootstrap_performance_paths = {
  "scripts/bootstrap-speckit-project.sh" => BOOTSTRAP_PERFORMANCE_SCRIPT_TERMS,
  "scripts/bootstrap-entry-coverage-profile.sh" => BOOTSTRAP_PERFORMANCE_SCRIPT_TERMS,
  "docs/VALIDATION.md" => BOOTSTRAP_PERFORMANCE_DOC_TERMS,
  "docs/SPECKIT_BOOTSTRAP.md" => BOOTSTRAP_PERFORMANCE_DOC_TERMS - ["Bootstrap Performance / Large Repo Scan Control"],
  "ai-sdlc/speckit-project-bootstrap.md" => BOOTSTRAP_PERFORMANCE_DOC_TERMS - ["Bootstrap Performance / Large Repo Scan Control", "pfms"]
}.freeze

bootstrap_performance_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing large-repo scan control requirement #{term}" unless text.include?(term)
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
      "library/{requirement_id}/04-交付总结/{requirement_id}_交付总结.md",
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

analyze_gate_strengthening_paths = {
  "skills/sdlc-speckit-analyze/SKILL.md" => ANALYZE_GATE_STRENGTHENING_TERMS,
  "skills/sdlc-speckit-analyze/references/analyze-gate-check.md" => ANALYZE_GATE_STRENGTHENING_TERMS,
  "skills/sdlc-speckit-analyze/references/analyze-inputs.md" => ANALYZE_GATE_STRENGTHENING_TERMS.first(13) + [
    "PENDING_CONFIRMATION",
    "Do not approve Analyze readiness by treating a missing profile as \"not applicable\""
  ],
  "skills/sdlc-speckit-analyze/references/output-and-manifest.md" => ANALYZE_GATE_STRENGTHENING_TERMS.values_at(32, 33, 34, 35, 36, 37, 38, 39, 40),
  "skills/sdlc-speckit-analyze/references/project-type-checks.md" => ANALYZE_PROJECT_TYPE_CHECK_TERMS,
  "skill-contracts/known-skills/sdlc-speckit-analyze.md" => ANALYZE_GATE_STRENGTHENING_TERMS + ANALYZE_PROJECT_TYPE_CHECK_TERMS,
  "docs/VALIDATION.md" => ANALYZE_GATE_STRENGTHENING_TERMS + ANALYZE_PROJECT_TYPE_CHECK_TERMS
}.freeze

analyze_gate_strengthening_paths.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing Analyze Gate strengthening requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

bootstrap_entry_profile_script = File.join(ROOT, "scripts/bootstrap-entry-coverage-profile.sh")
if File.exist?(bootstrap_entry_profile_script)
  text = File.read(bootstrap_entry_profile_script)
  package_json_frontend_heuristic_patterns = [
    /rel\s*==\s*["']package\.json["']/,
    /rel\.end_with\?\(["']package\.json["']\)/,
    /files\.include\?\(["']package\.json["']\)[^\n]*frontend/,
    /has_frontend\s*=.*package\.json/m,
    /package\.json[^\n]*frontend-application/
  ].freeze
  package_json_frontend_heuristic_patterns.each do |pattern|
    if text.match?(pattern)
      errors << "scripts/bootstrap-entry-coverage-profile.sh must not let package.json-only trigger frontend-application"
    end
  end
end

analyze_inputs_path = File.join(ROOT, "skills/sdlc-speckit-analyze/references/analyze-inputs.md")
if File.exist?(analyze_inputs_path)
  text = File.read(analyze_inputs_path)
  duplicate_sentence = 'Do not approve Analyze readiness by treating a missing profile as "not applicable".'
  count = text.scan(duplicate_sentence).size
  errors << "skills/sdlc-speckit-analyze/references/analyze-inputs.md repeats missing-profile not applicable sentence" unless count == 1
end

analyze_status_paths = [
  "skills/sdlc-speckit-analyze/references/analyze-gate-check.md",
  "skills/sdlc-speckit-analyze/references/analyze-inputs.md",
  "skills/sdlc-speckit-analyze/references/output-and-manifest.md",
  "skill-contracts/known-skills/sdlc-speckit-analyze.md",
  "docs/VALIDATION.md"
].freeze

analyze_status_forbidden_patterns = [
  /Analyze Gate is\s+`FAIL`\s*\/\s*`BLOCKED`/i,
  /Analyze Gate is\s+`PENDING_CONFIRMATION`/i,
  /Analyze Gate 必须\s*`BLOCKED`/,
  /Analyze Gate 必须\s*`PENDING_CONFIRMATION`/,
  /Analyze Gate 必须\s*\n`PENDING_CONFIRMATION`/,
  /Analyze Gate 必须\s*\n`PENDING_CONFIRMATION` 或 `BLOCKED`/
].freeze

analyze_status_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  next unless File.exist?(path)

  text = File.read(path)
  analyze_status_forbidden_patterns.each do |pattern|
    if text.match?(pattern)
      errors << "#{relative_path} treats BLOCKED or PENDING_CONFIRMATION as final Analyze Gate Result"
    end
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

delta_change_common_paths = [
  "ai-sdlc/change-control.md",
  "ai-sdlc/complexity-routing.md",
  "templates/artifact-manifest-template.md",
  "docs/VALIDATION.md"
].freeze

delta_change_common_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    DELTA_CHANGE_COMMON_TERMS.each do |term|
      errors << "#{relative_path} missing Delta Change Routing requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

delta_change_solution_reviewer_paths = [
  "skills/sdlc-solution-reviewer/references/development-path-decision.md",
  "skills/sdlc-solution-reviewer/references/review-workflow.md",
  "skills/sdlc-solution-reviewer/references/output-report.md",
  "skill-contracts/known-skills/sdlc-solution-reviewer.md"
].freeze

delta_change_solution_reviewer_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    (DELTA_CHANGE_COMMON_TERMS + DELTA_CHANGE_SOLUTION_REVIEWER_TERMS).each do |term|
      errors << "#{relative_path} missing Delta solution reviewer requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

delta_change_requirement_normalizer_paths = [
  "skills/sdlc-requirement-normalizer/references/intake-workflow.md",
  "skills/sdlc-requirement-normalizer/references/conflict-and-blocking.md",
  "skill-contracts/known-skills/sdlc-requirement-normalizer.md"
].freeze

delta_change_requirement_normalizer_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    (DELTA_CHANGE_COMMON_TERMS + DELTA_CHANGE_REQUIREMENT_NORMALIZER_TERMS).each do |term|
      errors << "#{relative_path} missing Delta requirement normalizer requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

delta_change_specification_writer_paths = [
  "skills/sdlc-specification-writer/references/writing-workflow.md",
  "skills/sdlc-specification-writer/references/output-artifact.md",
  "skill-contracts/known-skills/sdlc-specification-writer.md"
].freeze

delta_change_specification_writer_paths.each do |relative_path|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    (DELTA_CHANGE_COMMON_TERMS + DELTA_CHANGE_SPECIFICATION_WRITER_TERMS).each do |term|
      errors << "#{relative_path} missing Delta specification writer requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
  end
end

validation_path = File.join(ROOT, "docs/VALIDATION.md")
if File.exist?(validation_path)
  text = File.read(validation_path)
  DELTA_CHANGE_VALIDATION_TERMS.each do |term|
    errors << "docs/VALIDATION.md missing Delta validation requirement #{term}" unless text.include?(term)
  end
else
  errors << "missing docs/VALIDATION.md"
end

# PR I: Fixture-Based Product Parity Validator
PRODUCT_PARITY_FIXTURE_DIRS = [
  "backend-business-service",
  "admin-mixed-workflow",
  "frontend-application",
  "data-pipeline-etl",
  "library-shared-component",
  "route-artifact",
  "entry-coverage-analyze",
  "bootstrap-scan-control",
  "delta-change-supplement",
  "project-type-contract-matrix",
  "rail-routing-business-domain-sync"
].freeze

PRODUCT_PARITY_VALIDATION_DOC_TERMS = [
  "Fixture-Based Product Parity Validator",
  "validate-product-parity-fixtures.rb",
  "development-time fixture",
  "not target project runtime input",
  "route artifact",
  "project-type L4",
  "frontend process products",
  "entry coverage",
  "bootstrap scan control",
  "delta change routing"
].freeze

validator_path = File.join(ROOT, "scripts", "validate-product-parity-fixtures.rb")
if File.exist?(validator_path)
  errors << "validate-product-parity-fixtures.rb must be executable" unless File.executable?(validator_path)
else
  errors << "missing scripts/validate-product-parity-fixtures.rb"
end

fixture_root = File.join(ROOT, "fixtures", "speckit-product-parity")
if File.directory?(fixture_root)
  PRODUCT_PARITY_FIXTURE_DIRS.each do |dir|
    full_dir = File.join(fixture_root, dir)
    unless File.directory?(full_dir)
      errors << "missing fixture directory fixtures/speckit-product-parity/#{dir}"
    end
    yaml_path = File.join(full_dir, "fixture.yaml")
    expected_path = File.join(full_dir, "expected.md")
    errors << "missing fixture file fixtures/speckit-product-parity/#{dir}/fixture.yaml" unless File.exist?(yaml_path)
    errors << "missing fixture file fixtures/speckit-product-parity/#{dir}/expected.md" unless File.exist?(expected_path)
  end
else
  errors << "missing fixtures/speckit-product-parity/"
end

if File.exist?(validation_path)
  text = File.read(validation_path)
  PRODUCT_PARITY_VALIDATION_DOC_TERMS.each do |term|
    errors << "docs/VALIDATION.md missing product parity validator requirement #{term}" unless text.include?(term)
  end
end

# PR J: Project-Type Contract Artifact Matrix
PROJECT_TYPE_CONTRACT_MATRIX_SCRIPT_TERMS = [
  "project-type-contract-matrix",
  "Companion Artifact Status",
  "Project-Type Contract Matrix",
  "Contract Skip Records",
  "Produced",
  "Reused",
  "Not Applicable",
  "Deferred",
  "Skip Reason",
  "Project Type Profile",
  "Accepted By",
  "Re-Gate Required",
  "Verification Alternative",
  "Deferred without Accepted By",
  "Plan Gate BLOCKED",
  "backend-business-service",
  "admin-mixed-workflow",
  "frontend-application",
  "data-pipeline-etl",
  "library-shared-component",
  "API contract",
  "RPC contract",
  "MQ producer / consumer contract",
  "route / page contract",
  "trigger contract",
  "SQL lineage contract",
  "public API contract",
  "specs/{feature}/research.md",
  "specs/{feature}/data-model.md",
  "specs/{feature}/contracts/",
  "specs/{feature}/quickstart.md"
].freeze

PROJECT_TYPE_CONTRACT_MATRIX_DOC_TERMS = [
  "Project-Type Contract Matrix",
  "companion artifact status table",
  "Produced",
  "Reused",
  "Not Applicable",
  "Deferred",
  "Project Type Profile",
  "contract matrix",
  "project-type-contract-matrix",
  "Verification Alternative",
  "Deferred without Accepted By",
  "Plan Gate BLOCKED"
].freeze

contract_matrix_path = File.join(ROOT, "skills", "sdlc-speckit-plan", "references", "project-type-contract-matrix.md")
if File.exist?(contract_matrix_path)
  matrix_text = File.read(contract_matrix_path)
  PROJECT_TYPE_CONTRACT_MATRIX_SCRIPT_TERMS.each do |term|
    errors << "project-type-contract-matrix.md missing required term #{term}" unless matrix_text.include?(term)
  end
else
  errors << "missing skills/sdlc-speckit-plan/references/project-type-contract-matrix.md"
end

plan_refs = {
  "skills/sdlc-speckit-plan/SKILL.md" => ["project-type-contract-matrix", "Project Type Profile", "Contract Type", "Verification Alternative", "Companion Artifact Status"],
  "skills/sdlc-speckit-plan/references/plan-inputs.md" => ["project-type-contract-matrix", "Contract Matrix"],
  "skills/sdlc-speckit-plan/references/output-and-manifest.md" => ["Companion Artifact Status", "Project-Type Contract Matrix", "Contract Skip Records", "project-type-contract-matrix", "Produced / Reused / Not Applicable / Deferred"],
  "skills/sdlc-speckit-plan/references/planning-scope.md" => ["Project Type Profile", "project-type-contract-matrix", "contract matrix"],
  "skills/sdlc-speckit-plan/references/plan-gate-check.md" => ["Project Type Profile", "project-type-contract-matrix", "Deferred", "contract matrix"],
  "skill-contracts/known-skills/sdlc-speckit-plan.md" => ["project-type-contract-matrix", "Project Type Profile"],
  "docs/VALIDATION.md" => PROJECT_TYPE_CONTRACT_MATRIX_DOC_TERMS
}.freeze

plan_refs.each do |rel_path, terms|
  path = File.join(ROOT, rel_path)
  if File.exist?(path)
    text = File.read(path)
    terms.each do |term|
      errors << "#{rel_path} missing project-type contract matrix requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{rel_path}"
  end
end

# PR J: Rail Routing and Business-Domain Sync Source Modes
RAIL_ROUTING_REQUIRED_FILES = [
  "ai-sdlc/agents-rail-routing.md",
  "ai-sdlc/specs-run-lifecycle.md",
  "ai-sdlc/shared-business-domain-governance.md",
  "ai-sdlc/business-domain-sync-source-modes.md",
  "templates/agents-rail-routing-addendum.md",
  "templates/business-domain-sync-status-template.yaml"
].freeze

RAIL_ROUTING_REQUIRED_TERMS = [
  "speckit_driven",
  "library_driven",
  "hybrid",
  "duplicate sync guard",
  "business_domain_sync",
  "run-level artifact",
  "shared long-term knowledge base",
  "legacy_speckit",
  "new_rail_sdlc",
  "addendum",
  "New-Rail 不读取",
  "speckit_driven sync",
  "library_driven sync",
  "sync source mode"
].freeze

RAIL_ROUTING_FILE_TERMS = {
  "ai-sdlc/agents-rail-routing.md" => ["legacy_speckit", "new_rail_sdlc", "addendum", "/speckit.*", "sdlc-speckit-*", "Ambiguous Rail", "Activation Rule"],
  "ai-sdlc/specs-run-lifecycle.md" => ["run-level artifact", "requirement_id", "Rail consistency", "archive", "Specs Metadata"],
  "ai-sdlc/shared-business-domain-governance.md" => ["shared long-term knowledge base", "existing document", "rail", "source", "Conflict Handling"],
  "ai-sdlc/business-domain-sync-source-modes.md" => ["speckit_driven", "library_driven", "hybrid", "duplicate sync guard", "pipeline_sync_executed", "library_sync_executed"],
  "templates/agents-rail-routing-addendum.md" => ["/speckit.*", "sdlc-*", "new rail", "shared long-term knowledge base", "run-level"],
  "templates/business-domain-sync-status-template.yaml" => ["business_domain_sync", "speckit_driven", "library_driven", "hybrid", "duplicate_sync_guard"],
  "skills/sdlc-speckit-pipeline/SKILL.md" => ["speckit_driven", "agents-rail-routing", "shared-business-domain-governance", "business-domain-sync-source-modes"],
  "skills/sdlc-speckit-sync/references/sync-inputs.md" => ["Sync Source Mode", "speckit_driven", "library_driven", "hybrid", "Library-Driven Readiness"],
  "skills/sdlc-speckit-sync/references/sync-targets.md" => ["shared long-term knowledge base", "library_driven mode", "existing document", "naming convention"],
  "skills/sdlc-speckit-sync/references/conflict-and-blocking.md" => ["Duplicate sync risk", "Unknown sync source mode", "Unknown business_domain naming pattern"],
  "skills/sdlc-speckit-code-doc-reconcile/references/audit-workflow.md" => ["library_driven", "Library-Driven Reconcile", "business_domain_sync", "duplicate_sync_guard"],
  "skill-contracts/known-skills/sdlc-speckit-sync.md" => ["duplicate sync risk", "sync source mode", "library_driven mode"],
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md" => ["duplicate sync", "library_driven"],
  "docs/VALIDATION.md" => ["speckit_driven", "library_driven", "hybrid", "duplicate sync guard", "business_domain_sync", "run-level", "长期知识库", "legacy Speckit", "new rail", "addendum", "New-Rail 不读取", "sync source mode", "library_driven sync", "speckit_driven sync"]
}.freeze

RAIL_ROUTING_REQUIRED_FILES.each do |rel_path|
  path = File.join(ROOT, rel_path)
  errors << "missing #{rel_path}" unless File.exist?(path)
end

RAIL_ROUTING_FILE_TERMS.each do |rel_path, terms|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  terms.each do |term|
    errors << "#{rel_path} missing rail routing / sync mode requirement #{term}" unless text.include?(term)
  end
end

# PR K: Business-Domain Naming and Project-Shape Create-If-Missing
PR_K_REQUIRED_FILES = [
  "ai-sdlc/business-domain-naming-and-shape.md",
  "templates/business-domain-governance-profile-template.yaml",
  "templates/business-domain-sync-proposal-template.md",
  "fixtures/speckit-product-parity/business-domain-naming-shape/fixture.yaml",
  "fixtures/speckit-product-parity/business-domain-naming-shape/expected.md"
].freeze

PR_K_FILE_TERMS = {
  "ai-sdlc/business-domain-naming-and-shape.md" => ["canonical naming", "current naming convention", "project shape", "preserve existing shape", "Create-if-missing authorization", "naming_pattern_source", "shape_profile_source", "shape confidence", "sibling L4", "duplicate L4 candidate", "whole-document rewrite", "standard template fallback", "Shape Confidence", "Update Existing Rules"],
  "templates/business-domain-governance-profile-template.yaml" => ["canonical_naming", "shape_profile", "create_if_missing", "standard_template_fallback_allowed", "preserve_existing_shape", "whole_document_rewrite_allowed"],
  "templates/business-domain-sync-proposal-template.md" => ["Sync Proposal", "Naming Pattern Source", "Shape Profile Source", "Shape Confidence", "Required User Confirmations"],
  "skills/sdlc-speckit-sync/references/sync-inputs.md" => ["incomplete evidence can only produce", "Library-Driven Readiness", "Naming pattern must be identifiable"],
  "skills/sdlc-speckit-sync/references/sync-targets.md" => ["Naming Pattern Source", "Shape Profile Source", "Shape Confidence", "Standard Template Fallback Allowed", "canonical naming", "project shape"],
  "skills/sdlc-speckit-sync/references/conflict-and-blocking.md" => ["Canonical naming unknown", "naming_pattern_source missing", "shape_profile_source missing", "Shape confidence", "Whole-document rewrite", "Duplicate semantic L4 candidate", "Standard template fallback"],
  "skills/sdlc-speckit-code-doc-reconcile/references/audit-workflow.md" => ["naming drift", "shape drift", "duplicate L4 drift", "catalog/index drift", "source traceability drift"],
  "skills/sdlc-speckit-sync/SKILL.md" => ["business-domain-naming-and-shape", "canonical naming", "project shape"],
  "skills/sdlc-speckit-code-doc-reconcile/SKILL.md" => ["business-domain-naming-and-shape", "naming drift"],
  "skill-contracts/known-skills/sdlc-speckit-sync.md" => ["canonical naming", "shape confidence", "whole-document rewrite", "duplicate L4 candidate", "naming/shape gate"],
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md" => ["naming drift", "shape drift", "duplicate L4 drift", "catalog/index drift", "whole-document rewrite"],
  "docs/VALIDATION.md" => ["canonical naming", "project shape", "shape confidence", "Naming Gate", "Project Shape Gate", "whole-document rewrite", "Library-Driven Inputs Cleanup"]
}.freeze

PR_K_REQUIRED_FILES.each do |rel_path|
  path = File.join(ROOT, rel_path)
  errors << "missing #{rel_path}" unless File.exist?(path)
end

PR_K_FILE_TERMS.each do |rel_path, terms|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  terms.each do |term|
    errors << "#{rel_path} missing naming/shape requirement #{term}" unless text.include?(term)
  end
end

# Also check fixture dirs updated
if File.directory?(fixture_root)
  fixture_dirs_list = PRODUCT_PARITY_FIXTURE_DIRS + ["business-domain-naming-shape"]
  fixture_dirs_list.each do |dir|
    full_dir = File.join(fixture_root, dir)
    unless File.directory?(full_dir)
      errors << "missing fixture directory fixtures/speckit-product-parity/#{dir}"
    end
  end
end

# PR K Cleanup: anti-regression guard — forbid stale template-primary create-if-missing rules
PR_K_FORBIDDEN_PATTERNS = {
  "skills/sdlc-speckit-sync/SKILL.md" => [
    "select the matching `templates/business-domain-l4/{profile}.md` skeleton",
    "select the matching templates/business-domain-l4",
    "For create-if-missing, read `specs/{feature}/route.md` Project Type Profiles and select",
    "select the matching L4 template under",
    "Record `Selected L4 Template` in the Create-If-Missing Decision",
    "Create the project-type L4 skeleton",
    "Project Type Profiles are missing or cannot select a matching L4 template for create-if-missing",
    "Require current spec, plan, tasks, implementation result, and DocFlow artifacts"
  ],
  "skill-contracts/known-skills/sdlc-speckit-sync.md" => [
    "create-if-missing cannot resolve Project Type Profiles or selected L4 template",
    "缺少 Project Type Profiles 或 selected L4 template 时停止",
    "create authorized missing L4 business-domain documents from project-type L4 templates",
    "缺失 L4 时必须能从 route artifact 的 Project Type Profiles 选择项目类型化 L4 skeleton",
    "创建缺失的 L4 骨架"
  ],
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md" => [
    "缺少 `specs/**` 时停止并建议回到相应 Speckit 阶段"
  ],
  "skills/sdlc-speckit-sync/references/sync-targets.md" => [
    "Coding guides or workflow notes"
  ],
  "skills/sdlc-speckit-sync/references/conflict-and-blocking.md" => [
    "Project Type Profiles are missing or cannot select an L4 skeleton for create-if-missing",
    "Project Type Profiles from",
    "Selected L4 Template is missing or the selected",
    "selected templates/business-domain-l4/{profile}.md skeleton is missing",
    "L4 skeleton for create-if-missing"
  ]
}.freeze

# Global Cleanup 1: sync_source_mode consistency
GLOBAL_SYNC_MODE_TERMS = {
  "skills/sdlc-speckit-sync/SKILL.md" => ["sync_source_mode", "speckit_driven", "library_driven", "hybrid", "library_driven mode", "missing specs", "must not block", "proposal/not_required/blocked", "Direct Implementation", "library-only DocFlow", "Implementation evidence may come from", "code diff with accepted implementation record"],
  "skill-contracts/known-skills/sdlc-speckit-sync.md" => ["Required Inputs (speckit_driven)", "Required Inputs (library_driven)", "Required Inputs (hybrid)", "is not required", "Missing specs is expected and must not block", "Without implementation and verification evidence, output proposal/not_required/blocked only", "In speckit_driven mode, read specs", "In library_driven mode, read library", "implementation evidence and verification evidence exist for the selected sync_source_mode", "In library_driven mode, missing implementation evidence outputs proposal/not_required/blocked"],
  "ai-sdlc/shared-business-domain-governance.md" => ["library artifacts / manifest", "01DomainCatalog.md", "L2 main document index", "In library_driven mode"]
}.freeze

GLOBAL_SYNC_MODE_TERMS.each do |rel_path, terms|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  terms.each do |term|
    errors << "#{rel_path} missing global sync_source_mode consistency term #{term}" unless text.include?(term)
  end
end

PR_K_FORBIDDEN_PATTERNS.each do |rel_path, patterns|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  patterns.each do |pattern|
    if text.include?(pattern)
      errors << "#{rel_path} contains stale template-primary create-if-missing rule: #{pattern}"
    end
  end
end

# PR K Cleanup: verify fallback-only semantics exist
PR_K_FALLBACK_TERMS = {
  "skills/sdlc-speckit-sync/SKILL.md" => ["standard template fallback", "fallback-only", "project canonical naming", "project shape", "naming_pattern_source", "shape_profile_source", "shape_confidence", "standard template fallback is explicitly active"],
  "skill-contracts/known-skills/sdlc-speckit-sync.md" => ["standard template fallback", "project canonical naming", "project shape", "naming_pattern_source", "shape_profile_source"],
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md" => ["Required Inputs (speckit_driven)", "Required Inputs (library_driven)", "Required Inputs (hybrid)", "missing specs is expected", "must not block"],
  "skills/sdlc-speckit-code-doc-reconcile/references/reconcile-inputs.md" => ["speckit_driven", "library_driven", "hybrid", "absence of specs is not a blocker"],
  "docs/VALIDATION.md" => ["PR K cleanup", "standard L4 templates are fallback-only"]
}.freeze

PR_K_FALLBACK_TERMS.each do |rel_path, terms|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  terms.each do |term|
    errors << "#{rel_path} missing PR K cleanup fallback semantic #{term}" unless text.include?(term)
  end
end

# Global Cleanup 2.1: frontmatter indentation + residual skeleton wording
sync_skill_path = File.join(ROOT, "skills", "sdlc-speckit-sync", "SKILL.md")
if File.exist?(sync_skill_path)
  text = File.read(sync_skill_path)
  # Check for unindented bullet lines after description: |
  if text =~ /^description: \|/ && text =~ /^-(?: after| library-driven)/
    errors << "skills/sdlc-speckit-sync/SKILL.md has unindented bullet in frontmatter description"
  end
end

# PR L: Compatible Update — required files, terms, and forbidden behavior
PR_L_REQUIRED_FILES = [
  "ai-sdlc/business-domain-compatible-update.md",
  "templates/business-domain-update-proposal-template.md",
  "templates/business-domain-reconcile-proposal-template.md",
  "fixtures/speckit-product-parity/business-domain-compatible-update/fixture.yaml",
  "fixtures/speckit-product-parity/business-domain-compatible-update/expected.md"
].freeze

PR_L_REQUIRED_TERMS = [
  "compatible update", "preserve existing shape", "preserve existing facts",
  "safe insertion point", "update proposal", "reconcile proposal",
  "semantic_conflict", "code_drift", "doc_drift", "stale_fact",
  "scope_conflict", "duplicate_fact", "source_priority_conflict",
  "no whole-document rewrite", "no forced New-Rail section injection",
  "DIRECT_UPDATE", "UPDATE_PROPOSAL", "RECONCILE_PROPOSAL", "BLOCKED",
  "implementation evidence", "verification evidence", "sync_source_mode"
].freeze

PR_L_TERM_FILES = [
  "ai-sdlc/business-domain-compatible-update.md",
  "skills/sdlc-speckit-sync/SKILL.md",
  "skills/sdlc-speckit-code-doc-reconcile/SKILL.md",
  "skills/sdlc-speckit-sync/references/sync-targets.md",
  "skills/sdlc-speckit-sync/references/conflict-and-blocking.md",
  "skills/sdlc-speckit-code-doc-reconcile/references/audit-workflow.md",
  "skill-contracts/known-skills/sdlc-speckit-sync.md",
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md",
  "docs/VALIDATION.md"
].freeze

PR_L_FORBIDDEN_PATTERNS = [
  "rewrite existing L4 to New-Rail template",
  "inject Entry Chain into legacy-shaped doc by default",
  "overwrite conflicting business facts",
  "delete existing facts without explicit supersession",
  "use chat as source of truth"
].freeze

PR_L_REQUIRED_FILES.each do |rel_path|
  errors << "missing #{rel_path}" unless File.exist?(File.join(ROOT, rel_path))
end

PR_L_TERM_FILES.each do |rel_path|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  term_found = false
  PR_L_REQUIRED_TERMS.each do |term|
    term_found = true if text.include?(term)
  end
  errors << "#{rel_path} missing all PR L compatible update terms" unless term_found
end

# Forbidden behavior check (skip fixture dirs)
PR_L_FORBIDDEN_CHECK_FILES = PR_L_TERM_FILES.reject { |f| f.include?("fixtures/") }
PR_L_FORBIDDEN_CHECK_FILES.each do |rel_path|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  PR_L_FORBIDDEN_PATTERNS.each do |pattern|
    if text.include?(pattern)
      errors << "#{rel_path} contains forbidden permissive wording: #{pattern}"
    end
  end
end

# PR M: Specs Run Lifecycle — required files and terms
PR_M_REQUIRED_FILES = [
  "ai-sdlc/specs-run-metadata-and-archive.md",
  "templates/specs-run-metadata-template.yaml",
  "templates/specs-archive-cleanup-proposal-template.md",
  "fixtures/speckit-product-parity/specs-run-lifecycle/fixture.yaml",
  "fixtures/speckit-product-parity/specs-run-lifecycle/expected.md"
].freeze

PR_M_REQUIRED_TERMS = [
  "specs_run_id", "requirement_id", "feature_id", "run-level artifact",
  "rail consistency within run", "lifecycle authority",
  "machine-side snapshot", "business_domain_sync",
  "specs_runs", "business_domain_synced", "archived", "superseded",
  "cleaned", "archive_allowed", "cleanup_allowed",
  "synced_business_domain_targets", "source_artifacts",
  "may have no specs", "must not delete library",
  "no filename-versioned artifacts"
].freeze

PR_M_FORBIDDEN_PATTERNS = [
  "specs is requirement-level artifact",
  "cleanup deletes library/{requirement_id}",
  "cleanup deletes .specify/business_domain",
  "workflow-status is lifecycle authority",
  "archive active specs by default",
  "cleanup pending sync specs"
].freeze

PR_M_CHECK_FILES = [
  "ai-sdlc/specs-run-metadata-and-archive.md",
  "skills/sdlc-speckit-sync/SKILL.md",
  "skills/sdlc-speckit-code-doc-reconcile/SKILL.md",
  "skill-contracts/known-skills/sdlc-speckit-sync.md",
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md",
  "docs/VALIDATION.md"
].freeze

PR_M_REQUIRED_FILES.each { |f| errors << "missing #{f}" unless File.exist?(File.join(ROOT, f)) }

# PR M terms: each term must appear in at least one check file
PR_M_CHECK_FILES.each do |rel_path|
  path = File.join(ROOT, rel_path)
  next unless File.exist?(path)
  text = File.read(path)
  PR_M_FORBIDDEN_PATTERNS.each do |pattern|
    if text.include?(pattern)
      errors << "#{rel_path} contains forbidden PR M wording: #{pattern}"
    end
  end
end

combined_pr_m = PR_M_CHECK_FILES.map { |f| File.exist?(File.join(ROOT, f)) ? File.read(File.join(ROOT, f)) : "" }.join
PR_M_REQUIRED_TERMS.each do |term|
  errors << "missing PR M term #{term} across checked files" unless combined_pr_m.include?(term)
end

# lifecycle/result consistency check
metadata_path = File.join(ROOT, "ai-sdlc/specs-run-metadata-and-archive.md")
if File.exist?(metadata_path)
  meta_text = File.read(metadata_path)
  ["synced` or `not_required", "pending", "proposal", "blocked", "cleanup is not allowed", "invalid"].each do |term|
    errors << "specs-run-metadata-and-archive.md missing lifecycle/result term #{term}" unless meta_text.include?(term)
  end
end

# Also add fixture dir check
fixture_dirs_14th = File.join(fixture_root, "specs-run-lifecycle")
errors << "missing fixture specs-run-lifecycle" unless File.directory?(fixture_dirs_14th)

# PR N: Library-Driven Sync Runtime — required files and terms
["ai-sdlc/library-driven-sync-runtime.md", "templates/library-driven-sync-decision-template.md",
 "fixtures/speckit-product-parity/library-driven-sync-runtime/fixture.yaml",
 "fixtures/speckit-product-parity/library-driven-sync-runtime/expected.md"].each do |f|
  errors << "missing #{f}" unless File.exist?(File.join(ROOT, f))
end

prn_files = ["ai-sdlc/library-driven-sync-runtime.md", "skills/sdlc-speckit-sync/SKILL.md",
  "skills/sdlc-speckit-sync/references/sync-inputs.md", "skills/sdlc-speckit-sync/references/output-and-manifest.md",
  "skills/sdlc-speckit-sync/references/conflict-and-blocking.md",
  "skill-contracts/known-skills/sdlc-speckit-sync.md", "docs/VALIDATION.md"]
prn_combined = prn_files.map { |f| File.exist?(File.join(ROOT, f)) ? File.read(File.join(ROOT, f)) : "" }.join
["DUPLICATE_SYNC_BLOCKED", "supplemental sync", "Sync Need Classification",
 "library_driven sync runtime", "library-driven-sync-runtime"].each do |t|
  errors << "missing PR N term #{t}" unless prn_combined.include?(t)
end
prn_forbidden = ["require specs in library_driven mode", "missing specs blocks library_driven",
  "direct write without verification evidence", "duplicate sync allowed by default",
  "library is long-term knowledge base", "use chat as source of truth"]
prn_files.reject { |f| f.include?("fixtures/") }.each do |f|
  path = File.join(ROOT, f)
  next unless File.exist?(path)
  text = File.read(path)
  prn_forbidden.each { |p| errors << "#{f} contains forbidden PR N wording: #{p}" if text.include?(p) }
end

# PR O: Project-Type Contract Artifact Matrix
["ai-sdlc/project-type-contract-artifact-matrix.md", "templates/project-type-contract-artifact-matrix-template.yaml"].each do |f|
  errors << "missing #{f}" unless File.exist?(File.join(ROOT, f))
end
pro_combined = ["ai-sdlc/project-type-contract-artifact-matrix.md", "skills/sdlc-speckit-plan/SKILL.md", "skill-contracts/known-skills/sdlc-speckit-plan.md"].map { |f| File.exist?(File.join(ROOT, f)) ? File.read(File.join(ROOT, f)) : "" }.join
["Deferred without Accepted By", "Deferred without Verification Alternative", "project-type justification", "Project-Type Contract Artifact Matrix"].each do |t|
  errors << "missing PR O term #{t}" unless pro_combined.include?(t)
end

# PR O: old reference shim check
old_matrix_path = File.join(ROOT, "skills/sdlc-speckit-plan/references/project-type-contract-matrix.md")
if File.exist?(old_matrix_path)
  old_text = File.read(old_matrix_path)
  ["superseded", "project-type-contract-artifact-matrix.md", "not authoritative"].each do |t|
    errors << "old project-type-contract-matrix.md missing shim term #{t}" unless old_text.include?(t)
  end
end

# PR P: expanded parity validator static checks
prp_files = ["ai-sdlc/agents-rail-routing.md", "ai-sdlc/specs-run-lifecycle.md",
  "ai-sdlc/shared-business-domain-governance.md",
  "skill-contracts/known-skills/sdlc-speckit-sync.md",
  "skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md",
  "skill-contracts/known-skills/sdlc-speckit-plan.md", "docs/VALIDATION.md"]
prp_combined = prp_files.map { |f| File.exist?(File.join(ROOT, f)) ? File.read(File.join(ROOT, f)) : "" }.join
["legacy_speckit", "new_rail_sdlc", "sync_source_mode", "project canonical naming",
  "compatible update", "specs_run_id", "library_driven sync runtime",
  "Project-Type Contract Artifact Matrix", "lifecycle authority",
  "no filename-versioned artifacts", "baseline traceability",
  "spec/plan/task/sync/reconcile traceability"].each do |t|
  errors << "missing PR P term #{t}" unless prp_combined.include?(t)
end

prp_forbidden = ["legacy Skill fallback in New-Rail", "read .specify/memory as New-Rail runtime input",
  "library is legacy protected directory",
  "specs is requirement-level artifact", "require specs in library_driven mode",
  "workflow-status is lifecycle authority", "Plan Gate PASS with missing required artifact"]
prp_guard = [/must\s+not/i, /forbidden/i, /prohibited/i, /not\s+allowed/i, /\bno\b/i, /cannot/i, /不得/, /禁止/, /不允许/, /不能/]
prp_files.reject { |f| f.include?("fixtures/") }.each do |f|
  path = File.join(ROOT, f)
  next unless File.exist?(path)
  text = File.read(path)
  prp_forbidden.each do |p|
    next unless text.include?(p)
    lines = text.lines
    lines.each_with_index do |line, i|
      next unless line.include?(p)
      ctx = [lines[i-1], line, lines[i+1]].compact.join(" ")
      unless prp_guard.any? { |g| ctx.match?(g) }
        errors << "#{f}:#{i+1} contains forbidden PR P wording without guard: #{p}"
      end
    end
  end
end

# Final Audit Guard: manifest entrypoints + plan Deferred hardening
manifest_text = File.read(File.join(ROOT, "manifest.yaml"))
["ai-sdlc/agents-rail-routing.md", "ai-sdlc/business-domain-naming-and-shape.md",
  "ai-sdlc/business-domain-compatible-update.md", "ai-sdlc/specs-run-metadata-and-archive.md",
  "ai-sdlc/library-driven-sync-runtime.md", "ai-sdlc/project-type-contract-artifact-matrix.md",
  "templates/library-driven-sync-decision-template.md",
  "templates/project-type-contract-artifact-matrix-template.yaml"].each do |e|
  errors << "manifest.yaml missing entry #{e}" unless manifest_text.include?(e)
end
plan_guard = File.read(File.join(ROOT, "skills/sdlc-speckit-plan/SKILL.md"))
["Deferred without Accepted By", "Deferred without Verification Alternative"].each do |t|
  errors << "plan SKILL missing #{t}" unless plan_guard.include?(t)
end
plan_contract_guard = File.read(File.join(ROOT, "skill-contracts/known-skills/sdlc-speckit-plan.md"))
["accepted_by", "verification_alternative"].each do |t|
  errors << "plan contract missing #{t}" unless plan_contract_guard.include?(t)
end

# ── Tail Template Contract Validation ──
# Static per-file contract checks for the four Task 07-B1 tail templates.
# Read-only, deterministic, no network. Every violation enters `errors` and
# fails the script; no warnings-only paths.

def tail_template_text(relative_path)
  path = File.join(ROOT, relative_path)
  unless File.file?(path)
    return nil
  end
  File.read(path)
end

def tail_require(errors, text, needle, label)
  errors << "tail-template: #{label} missing #{needle.inspect}" unless text.include?(needle)
end

# A. Gate Result Template
gate_template = tail_template_text("templates/gate-result-template.md")
if gate_template.nil?
  errors << "tail-template: templates/gate-result-template.md must exist"
else
  [
    "Gate Name:", "Gate Type:", "development_path_entry", "documentation_governance_tail_completion",
    "Manifest Path:", "Gate Basis:", "Development Path Decision:", "Decision Scope:", "Complexity:",
    "Development Path Decision Source:", "Development Path Decision Artifact:",
    "Tail Required:", "Tail Scope:", "Tail Status:",
    "## Development Path Check", "## Documentation Governance Tail Evidence Check",
    "required_artifacts", "completed_artifacts", "skipped_items", "blocking_items",
    "business_domain_sync_decision", "reconcile_decision", "entry_coverage_result", "regate_result",
    "completion_evidence", "completion_decision_source",
    "## Tail Completion Decision", "Tail Completion Eligible:", "`sdlc-gate-runner` 只检查和判定证据",
    "不生成 `03-实现记录`、`04-代码审核`、`05-测试验收`",
    "不执行 Sync 或 Reconcile",
    "不修改生产代码或知识材料",
    "PASS / FAIL / PASS_WITH_RISK"
  ].each { |needle| tail_require(errors, gate_template, needle, "gate-result-template") }
  if gate_template.include?("Gate Runner 只检查和判定证据")
    errors << "tail-template: gate-result-template must not use the generic Gate Runner owner phrase"
  end
  {
    /^## Development Path Check\s*$/ => 1,
    /^## Documentation Governance Tail Evidence Check\s*$/ => 1
  }.each do |pattern, expected_count|
    actual_count = gate_template.scan(pattern).size
    unless actual_count == expected_count
      errors << "tail-template: gate-result-template #{pattern.inspect} count must be #{expected_count} (got #{actual_count})"
    end
  end
  [
    "| 03-实现记录 | actual_implementation_required |",
    "| 04-代码审核 | actual_implementation_required |",
    "| 05-测试验收 | actual_implementation_required |"
  ].each { |needle| tail_require(errors, gate_template, needle, "gate-result-template") }
end

# B. Artifact Manifest Template
manifest_template = tail_template_text("templates/artifact-manifest-template.md")
if manifest_template.nil?
  errors << "tail-template: templates/artifact-manifest-template.md must exist"
else
  if manifest_template.scan(/^## Documentation Governance Tail\s*$/).size != 1
    errors << "tail-template: manifest must have exactly one ## Documentation Governance Tail heading"
  end
  if manifest_template.scan(/^Canonical Field: `documentation_governance_tail`\s*$/).size != 1
    errors << "tail-template: manifest must declare Canonical Field: `documentation_governance_tail` exactly once"
  end
  tail_heading_index = manifest_template.lines.index { |line| line.match?(/^## Documentation Governance Tail\s*$/) }
  if tail_heading_index.nil?
    errors << "tail-template: manifest tail root section not found"
  else
    tail_section_lines = []
    manifest_template.lines[(tail_heading_index + 1)..].each do |line|
      break if line.start_with?("## ")
      tail_section_lines << line
    end
    tail_section_text = tail_section_lines.join
    status_count = tail_section_text.scan(/^- status: planned \/ in_progress \/ blocked \/ completed \/ not_required \/ stale\s*$/).size
    unless status_count == 1
      errors << "tail-template: manifest tail root section status enum line must appear exactly once (got #{status_count})"
    end
  end
  [
    "- required: yes/no", "- scope:", "required_artifacts", "completed_artifacts",
    "skipped_items", "blocking_items", "documentation_governance_tail.business_domain_sync",
    "business_domain_sync_decision: SYNC_REQUIRED / NOT_REQUIRED / PROPOSAL_REQUIRED / BLOCKED / DUPLICATE_SYNC_BLOCKED",
    "current_sync_owner: sdlc-speckit-sync / none",
    "execution_status: not_started / in_progress / done / blocked",
    "execution_result: not_run / synced / proposal / partial / not_required / blocked",
    "reconcile_decision", "documentation_governance_tail.entry_coverage_result",
    "current / stale", "PENDING", "FAILED", "BLOCKED", "regate_result",
    "completion_evidence", "completion_decision_source", "Tail Completion Gate"
  ].each { |needle| tail_require(errors, manifest_template, needle, "artifact-manifest-template") }
  [
    "| 03 实现记录 | actual_implementation_required |",
    "| 04 代码审核 | actual_implementation_required |",
    "| 05 测试验收 | actual_implementation_required |",
    "| 04 交付总结 | recommended |"
  ].each { |needle| tail_require(errors, manifest_template, needle, "artifact-manifest-template") }
  tail_require(errors, manifest_template, "它不是 Gate", "artifact-manifest-template")
  tail_require(errors, manifest_template, "compatibility read", "artifact-manifest-template")
  if manifest_template.include?("completion_status")
    errors << "tail-template: manifest must not define a second completion state (completion_status)"
  end
  if manifest_template.include?("library-driven-sync")
    errors << "tail-template: manifest must not reference forbidden owner library-driven-sync"
  end
  if manifest_template.match?(/^## Speckit Sync\s*$/)
    errors << "tail-template: manifest must not contain a new-write ## Speckit Sync heading"
  end
  if manifest_template.include?("| 03 实现记录 | recommended |")
    errors << "tail-template: 03 实现记录 must not regress to recommended"
  end
  if manifest_template.include?("| 04 代码审核 | conditional |")
    errors << "tail-template: 04 代码审核 must not regress to conditional"
  end
  if manifest_template.include?("| 05 测试验收 | conditional |")
    errors << "tail-template: 05 测试验收 must not regress to conditional"
  end

  # entry_coverage_result subsection: fields and semantics must live inside
  # the dedicated subsection, not anywhere else in the document.
  entry_heading_pattern = /^### entry_coverage_result\s*$/
  entry_heading_count = manifest_template.scan(entry_heading_pattern).size
  unless entry_heading_count == 1
    errors << "tail-template: manifest ### entry_coverage_result heading count must be 1 (got #{entry_heading_count})"
  end
  if entry_heading_count == 1
    manifest_lines = manifest_template.lines
    entry_heading_index = manifest_lines.index { |line| line.match?(entry_heading_pattern) }
    entry_subsection_lines = []
    manifest_lines[(entry_heading_index + 1)..].each do |line|
      break if line.start_with?("## ") || line.start_with?("### ")
      entry_subsection_lines << line
    end
    entry_subsection_text = entry_subsection_lines.join
    {
      "Manifest Field: `documentation_governance_tail.entry_coverage_result`" => 1,
      "- status:" => 1,
      "- artifact:" => 1,
      "- scope:" => 1,
      "- evidence:" => 1,
      "- blocking_items:" => 1,
      "- current / stale:" => 1
    }.each do |field, expected_count|
      actual_count = entry_subsection_lines.count { |line| line.strip == field }
      unless actual_count == expected_count
        errors << "tail-template: entry_coverage_result subsection #{field.inspect} count must be #{expected_count} (got #{actual_count})"
      end
    end
    ["PENDING", "FAILED", "BLOCKED", "不能支持 Tail completion"].each do |needle|
      unless entry_subsection_text.include?(needle)
        errors << "tail-template: entry_coverage_result subsection missing #{needle.inspect}"
      end
    end
  end
end

# C. Business Domain Sync YAML Template
sync_yaml_path = File.join(ROOT, "templates/business-domain-sync-status-template.yaml")
unless File.file?(sync_yaml_path)
  errors << "tail-template: templates/business-domain-sync-status-template.yaml must exist"
end
if File.file?(sync_yaml_path)
  sync_yaml_text = File.read(sync_yaml_path)
  begin
    sync_yaml = YAML.safe_load(sync_yaml_text, permitted_classes: [], aliases: false)
    unless sync_yaml.is_a?(Hash)
      errors << "tail-template: sync status template root must be a Hash"
    end
    sync_root = sync_yaml.is_a?(Hash) ? sync_yaml["business_domain_sync"] : nil
    unless sync_root.is_a?(Hash)
      errors << "tail-template: sync status template business_domain_sync must be a Hash"
    end
    if sync_root.is_a?(Hash)
      expected_scalars = {
        "manifest_mapping" => "documentation_governance_tail.business_domain_sync",
        "decision" => "SYNC_REQUIRED | NOT_REQUIRED | PROPOSAL_REQUIRED | BLOCKED | DUPLICATE_SYNC_BLOCKED",
        "mode" => "none | speckit_driven | library_driven | hybrid",
        "current_sync_owner" => "sdlc-speckit-sync | none",
        "execution_status" => "not_started | in_progress | done | blocked",
        "execution_result" => "not_run | synced | proposal | partial | not_required | blocked",
        "duplicate_sync_guard" => "active",
        "tail_item_status" => "planned | in_progress | blocked | completed | not_required | stale"
      }
      expected_scalars.each do |key, expected|
        actual = sync_root[key]
        unless actual == expected
          errors << "tail-template: sync status template #{key} must equal #{expected.inspect} (got #{actual.inspect})"
        end
      end
    end
  rescue Psych::Exception => e
    errors << "tail-template: sync status template YAML parse failed (#{e.message})"
  end
  if sync_yaml_text.include?("library-driven-sync")
    errors << "tail-template: sync status template must not reference forbidden owner library-driven-sync"
  end
end

# D. Library-Driven Sync Decision Template
library_template = tail_template_text("templates/library-driven-sync-decision-template.md")
if library_template.nil?
  errors << "tail-template: templates/library-driven-sync-decision-template.md must exist"
else
  {
    /^## Metadata\s*$/ => 1,
    /^## Decision Metadata\s*$/ => 0,
    /^- Requirement ID:/ => 1,
    /^- Generated By:/ => 1,
    /^- Date:/ => 1
  }.each do |pattern, expected_count|
    actual_count = library_template.scan(pattern).size
    unless actual_count == expected_count
      errors << "tail-template: library-driven template #{pattern.inspect} count must be #{expected_count} (got #{actual_count})"
    end
  end
  [
    "Sync Source Mode: library_driven", "Decision Owner: sdlc-speckit-sync",
    "Decision Source:", "Decision Artifact:", "Reviewed Artifact:",
    "Reviewed Artifact Version:", "Gate Artifact Version:",
    "Sync Need Classification", "SYNC_REQUIRED", "NOT_REQUIRED", "PROPOSAL_REQUIRED",
    "BLOCKED", "DUPLICATE_SYNC_BLOCKED", "Duplicate Sync Guard",
    "Execution Status", "not_started / in_progress / done / blocked",
    "Execution Result", "not_run / synced / proposal / partial / not_required / blocked",
    "Manifest Mapping", "documentation_governance_tail.business_domain_sync",
    "Shared Tail Item Status", "Completion Eligibility"
  ].each { |needle| tail_require(errors, library_template, needle, "library-driven-sync-decision-template") }
  tail_require(errors, library_template, "不要求 `specs/**` 或 `specs_run_id`", "library-driven-sync-decision-template")
  if library_template.include?("library-driven-sync")
    errors << "tail-template: library-driven template must not reference forbidden owner library-driven-sync"
  end
end

# ── Gate Runner Tail Enforcement Contract (Topic 07-P1) ──
# Static assertions for Development Path Entry Gate and Shared Documentation
# Governance Tail Completion Gate enforcement across the nine-file scope.
# Read-only, deterministic, no network. Violations enter `errors` and fail
# the script; no warnings-only paths.

def gate_runner_require(errors, text, needle, label)
  errors << "gate-runner: #{label} missing #{needle.inspect}" unless text.include?(needle)
end

# Topic 07-P1 R1: expected full stable paths and two-stage lifecycle markers.
# The constants are expectations only; the content checks below must verify
# each target file's actual text, not just compare constant strings.
TOPIC07_P1_DEVELOPMENT_PATH_ENTRY_STABLE_PATH =
  "library/{requirement_id}/02-方案审核/{requirement_id}_开发路径准入门禁.md".freeze
TOPIC07_P1_TAIL_COMPLETION_STABLE_PATH =
  "library/{requirement_id}/05-测试验收/{requirement_id}_治理尾段完成门禁.md".freeze
TOPIC07_P1_STABLE_PATH_TARGET_FILES = [
  "skills/sdlc-gate-runner/SKILL.md",
  "skills/sdlc-gate-runner/references/gate-workflow.md",
  "skills/sdlc-gate-runner/references/output-report.md"
].freeze
TOPIC07_P1_TWO_STAGE_MARKERS = [
  "Evidence Evaluation",
  "Provisional Evidence Result",
  "Persist And Confirm",
  "Read Back And Verify",
  "Formal Gate Result"
].freeze
TOPIC07_P1_TWO_STAGE_SEMANTIC_NEEDLES = [
  "response-only",
  "Result=FAIL",
  "Tail Completion Eligible=no",
  "pre-evaluation failure",
  "authorized persistence failure",
  "read-back failure",
  "read-back success establishes",
  "after the formal Gate result"
].freeze
TOPIC07_P1_TWO_STAGE_FORBIDDEN_NEEDLES = [
  "persisted Gate artifact must already exist",
  "first run must fail",
  "response-only can formal PASS",
  "read-back verification can be skipped",
  "Manifest can be completed before read-back",
  "completion_decision_source can be established when the write failed"
].freeze
TOPIC07_P1_FILENAME_VERSION_VARIANT_PATTERN =
  %r{library/\{requirement_id\}/(?:02-方案审核|05-测试验收)/[^\s`|]*_v(?:N|\d+)\.md}.freeze

gate_runner_scope_paths = [
  "ai-sdlc/development-path-governance.md",
  "skills/sdlc-gate-runner/SKILL.md",
  "skill-contracts/known-skills/sdlc-gate-runner.md",
  "skills/sdlc-gate-runner/references/gate-workflow.md",
  "skills/sdlc-gate-runner/references/gate-matrix.md",
  "skills/sdlc-gate-runner/references/risk-and-regate.md",
  "skills/sdlc-gate-runner/references/output-report.md",
  "registry/skill-registry.md",
  "scripts/validate-skill-contracts.rb"
].freeze

gate_runner_scope_text = {}
gate_runner_scope_paths.each do |rel|
  path = File.join(ROOT, rel)
  if File.file?(path)
    gate_runner_scope_text[rel] = File.read(path)
  else
    errors << "gate-runner: missing scope file #{rel}"
  end
end
# The validator's own source must not be scanned for content needles.
gate_runner_combined = gate_runner_scope_text.reject { |rel, _| rel == "scripts/validate-skill-contracts.rb" }.values.join("\n")

# A. Canonical development-path-governance.md current integration matrix.
#    Topic 07 formal closure must be implemented; pending is a closure
#    regression. D09 must remain not implemented.
devpath_text = gate_runner_scope_text["ai-sdlc/development-path-governance.md"]
if devpath_text
  [
    "## 当前集成状态边界",
    "状态矩阵",
    "状态矩阵只是描述",
    "当前 Git/PR/CI 高于该矩阵",
    "| canonical standard baseline | implemented |",
    "| Gate Result Template convergence | implemented |",
    "| Artifact Manifest Template convergence | implemented |",
    "| Solution Reviewer Development Path alignment | implemented |",
    "| Solution Reviewer initial Tail recommendation | implemented |",
    "| Sync public-tail metadata 与 library_driven support | implemented |",
    "| Reconcile public-tail metadata 与 library_driven support | implemented |",
    "| Gate Runner Development Path Entry enforcement | implemented |",
    "| Gate Runner Tail Completion enforcement | implemented |",
    "| Speckit Pipeline boundary alignment | implemented |",
    "| Direct / Speckit / Tail 完整场景验证 | implemented |",
    "| Topic 07 formal closure | implemented |",
    "不实施 D09",
    "D09 尚未实施"
  ].each { |needle| gate_runner_require(errors, devpath_text, needle, "development-path-governance") }
  [
    "| Speckit Pipeline boundary alignment | pending |",
    "| Topic 07 formal closure | pending |",
    "| D09 | implemented |"
  ].each do |forbidden|
    errors << "gate-runner: development-path-governance contains forbidden matrix status: #{forbidden}" if devpath_text.include?(forbidden)
  end
end

# B. Gate Runner SKILL.md
skill_text = gate_runner_scope_text["skills/sdlc-gate-runner/SKILL.md"]
if skill_text
  [
    "ai-sdlc/development-path-governance.md",
    "ai-sdlc/artifact-versioning.md",
    "development_path_entry",
    "documentation_governance_tail_completion",
    "third special value",
    "Determine the Gate Type",
    "DIRECT_IMPLEMENTATION",
    "SPECKIT_PIPELINE_REQUIRED",
    "BLOCKED_NEEDS_REVISION",
    "BLOCKED_UNKNOWN",
    "FULL_REQUIREMENT",
    "DELTA_CHANGE",
    "03-实现记录",
    "04-代码审核",
    "05-测试验收",
    "business_domain_sync decision",
    "Reconcile decision",
    "Entry Coverage",
    "Re-Gate",
    "completion_decision_source",
    "persisted Gate artifact",
    "response-only",
    "preview",
    "Tail status authority",
    "开发路径准入门禁",
    "治理尾段完成门禁"
  ].each { |needle| gate_runner_require(errors, skill_text, needle, "gate-runner SKILL") }
  if skill_text.include?("completion_status")
    errors << "gate-runner: SKILL must not define a second Tail status (completion_status)"
  end
end

# C. Gate Runner contract
contract_text = gate_runner_scope_text["skill-contracts/known-skills/sdlc-gate-runner.md"]
if contract_text
  [
    "Development Path Decision artifact",
    "03-实现记录",
    "04-代码审核",
    "05-测试验收",
    "Sync decision artifact",
    "Reconcile decision artifact",
    "Entry Coverage artifact",
    "Re-Gate artifact",
    "templates/gate-result-template.md",
    "templates/artifact-manifest-template.md",
    "ai-sdlc/development-path-governance.md",
    "ai-sdlc/phase-gates.md",
    "ai-sdlc/artifact-storage.md",
    "ai-sdlc/artifact-versioning.md",
    "ai-sdlc/change-control.md",
    "Development Path Entry enforcement",
    "Tail Completion enforcement",
    "persisted completion-source verification",
    "missing or stale Development Path evidence",
    "invalid route",
    "missing Tail section",
    "missing or blocked Sync decision",
    "missing or blocked Reconcile decision",
    "incomplete required conditional execution",
    "required Entry Coverage pending, failed, or blocked",
    "required Re-Gate missing",
    "provisional evidence evaluation",
    "authorized persistence",
    "read-back verification",
    "formal result establishment",
    "response-only cannot formally complete",
    "persistence not authorized for formal completion",
    "authorized persistence failed",
    "persisted artifact read-back failed",
    "persisted artifact binding invalid",
    "formal completion source cannot be established after persistence",
    "unresolved blocking item"
  ].each { |needle| gate_runner_require(errors, contract_text, needle, "gate-runner contract") }
end

# D. gate-workflow.md
workflow_text = gate_runner_scope_text["skills/sdlc-gate-runner/references/gate-workflow.md"]
if workflow_text
  [
    "Gate Type",
    "generic",
    "development_path_entry",
    "documentation_governance_tail_completion",
    "development-path-governance.md",
    "Tail status authority",
    "stable path",
    "内部 Version",
    "not stale",
    "Replaced Artifact Paths",
    "Change History",
    "Re-Gate Records",
    "风险接受",
    "templates/gate-result-template.md",
    "DIRECT_IMPLEMENTATION",
    "SPECKIT_PIPELINE_REQUIRED",
    "BLOCKED_NEEDS_REVISION",
    "BLOCKED_UNKNOWN",
    "03-实现记录",
    "04-代码审核",
    "05-测试验收",
    "decision and execution result are separated",
    "required execution",
    "Entry Coverage",
    "blocking items",
    "persisted completion source",
    "response-only",
    "preview"
  ].each { |needle| gate_runner_require(errors, workflow_text, needle, "gate-workflow") }
end

# E. gate-matrix.md
matrix_text = gate_runner_scope_text["skills/sdlc-gate-runner/references/gate-matrix.md"]
if matrix_text
  [
    "| Development Path Entry Gate | Implementation path |",
    "Specification Gate",
    "Development Path Decision",
    "Decision Scope",
    "Complexity",
    "decision source/artifact",
    "Tail required/scope/status",
    "missing/stale/invalid decision",
    "BLOCKED_NEEDS_REVISION",
    "BLOCKED_UNKNOWN",
    "wrong route",
    "missing Re-Gate",
    "| Shared Documentation Governance Tail Completion Gate | Tail completed |",
    "Manifest Tail",
    "03/04/05 when actual implementation",
    "Sync decision",
    "Reconcile decision",
    "required conditional execution",
    "applicable Entry Coverage",
    "required Re-Gate",
    "Evidence inputs",
    "Gate output confirmation",
    "read-back verification",
    "completion source establishment",
    "response-only formal completion",
    "persistence not authorized",
    "write failure",
    "read-back failure",
    "invalid persisted binding",
    "unresolved external evidence failure",
    "| Development Path Entry Gate | `02-方案审核/` |",
    "| Tail Completion Gate | `05-测试验收/` |",
    "Missing always-required Tail evidence",
    "Required Tail evidence is stale",
    "Invalid Development Path route"
  ].each { |needle| gate_runner_require(errors, matrix_text, needle, "gate-matrix") }
end

# F. risk-and-regate.md
risk_text = gate_runner_scope_text["skills/sdlc-gate-runner/references/risk-and-regate.md"]
if risk_text
  [
    "不能被风险接受绕过",
    "缺少 always-required external evidence",
    "stale required external evidence",
    "缺少正式 persisted completion source",
    "authorized persistence failure",
    "read-back verification failure",
    "formal completion source 无法在阶段 B 建立",
    "required Sync execution 未完成",
    "required Reconcile execution 未完成",
    "required Entry Coverage 未通过",
    "required Re-Gate 未通过",
    "Critical blocking item",
    "只适用于有完整接受记录的 eligible High risk",
    "不适用于 Critical",
    "不得豁免 evidence",
    "不得豁免 persistence",
    "不得豁免 Re-Gate",
    "不得豁免 required conditional execution",
    "Development Path Decision",
    "Decision Scope",
    "Tail Scope",
    "implementation files",
    "03/04/05 Version",
    "Sync decision/result",
    "Reconcile decision/result",
    "Entry Coverage",
    "Manifest Tail status",
    "completion source"
  ].each { |needle| gate_runner_require(errors, risk_text, needle, "risk-and-regate") }
end

# G. output-report.md: single canonical template authority
output_text = gate_runner_scope_text["skills/sdlc-gate-runner/references/output-report.md"]
if output_text
  [
    "唯一 canonical output structure",
    "Gate Type",
    "development_path_entry",
    "documentation_governance_tail_completion",
    "开发路径准入门禁",
    "治理尾段完成门禁",
    "## Development Path Check",
    "## Documentation Governance Tail Evidence Check",
    "## Tail Completion Decision",
    "not_applicable",
    "不得从 canonical template 删除字段",
    "Response-only 输出只能是 preview",
    "不得声称已存在 current persisted Gate artifact",
    "不得虚构 artifact path",
    "不得虚构 Version",
    "不得将 Manifest Tail 标为 completed",
    "不得成为 completion_decision_source",
    "不得输出正式 Tail completion PASS claim",
    "persistence absence",
    "Tail Completion Eligible=no",
    "Tail Completion Eligible=yes",
    "completion_decision_source",
    "Current / stale"
  ].each { |needle| gate_runner_require(errors, output_text, needle, "output-report") }
  if output_text.include?("## Markdown Template")
    errors << "gate-runner: output-report must not maintain a second complete canonical template (## Markdown Template)"
  end
  if output_text.match?(/^# Gate Result: <Gate Name>/)
    errors << "gate-runner: output-report must not define a competing full Gate template"
  end
end

# H. Registry sdlc-gate-runner entry
registry_text = gate_runner_scope_text["registry/skill-registry.md"]
if registry_text
  [
    "generic Gate checker",
    "Development Path Entry owner",
    "Tail Completion owner",
    "does not replace specialized reviewers",
    "does not perform professional Tail work",
    "manifest is the Tail status authority",
    "formal completion requires a persisted current Gate artifact"
  ].each { |needle| gate_runner_require(errors, registry_text, needle, "gate-runner registry entry") }
  sync_entries = registry_text.scan(/^name: sdlc-speckit-sync\s*$/).size
  reconcile_entries = registry_text.scan(/^name: sdlc-speckit-code-doc-reconcile\s*$/).size
  errors << "gate-runner: duplicate Sync skill entry in registry (got #{sync_entries})" unless sync_entries == 1
  errors << "gate-runner: duplicate Reconcile skill entry in registry (got #{reconcile_entries})" unless reconcile_entries == 1
end

# I. Cross-file invariants
if TOPIC07_P1_DEVELOPMENT_PATH_ENTRY_STABLE_PATH == TOPIC07_P1_TAIL_COMPLETION_STABLE_PATH
  errors << "gate-runner: the two special stable Gate path expectations must differ"
end
if File.basename(TOPIC07_P1_DEVELOPMENT_PATH_ENTRY_STABLE_PATH) == File.basename(TOPIC07_P1_TAIL_COMPLETION_STABLE_PATH)
  errors << "gate-runner: the two special stable Gate basenames must differ"
end
unless gate_runner_combined.include?(TOPIC07_P1_DEVELOPMENT_PATH_ENTRY_STABLE_PATH)
  errors << "gate-runner: Development Path Entry full stable path must exist in scope"
end
unless gate_runner_combined.include?(TOPIC07_P1_TAIL_COMPLETION_STABLE_PATH)
  errors << "gate-runner: Tail Completion full stable path must exist in scope"
end
if gate_runner_combined.include?("completion_status")
  errors << "gate-runner: no second Tail status (completion_status) may be introduced in scope"
end
if gate_runner_combined.include?("D09 已实施")
  errors << "gate-runner: D09 must remain not implemented"
end

# J. R1: two-stage lifecycle, per-file marker order, and full stable path checks
TOPIC07_P1_STABLE_PATH_TARGET_FILES.each do |rel|
  text = gate_runner_scope_text[rel]
  next unless text

  entry_occurrences = text.scan(TOPIC07_P1_DEVELOPMENT_PATH_ENTRY_STABLE_PATH)
  tail_occurrences = text.scan(TOPIC07_P1_TAIL_COMPLETION_STABLE_PATH)

  unless entry_occurrences.size == 1
    errors << "gate-runner: #{rel} must contain the Development Path Entry full stable path exactly once (got #{entry_occurrences.size})"
  end
  unless tail_occurrences.size == 1
    errors << "gate-runner: #{rel} must contain the Tail Completion full stable path exactly once (got #{tail_occurrences.size})"
  end

  if entry_occurrences.size == 1
    entry_path = entry_occurrences.first
    errors << "gate-runner: #{rel} Development Path Entry path must contain /02-方案审核/" unless entry_path.include?("/02-方案审核/")
    errors << "gate-runner: #{rel} Development Path Entry basename must be the 准入门禁 file" unless entry_path.include?("{requirement_id}_开发路径准入门禁.md")
  end
  if tail_occurrences.size == 1
    tail_path = tail_occurrences.first
    errors << "gate-runner: #{rel} Tail Completion path must contain /05-测试验收/" unless tail_path.include?("/05-测试验收/")
    errors << "gate-runner: #{rel} Tail Completion basename must be the 完成门禁 file" unless tail_path.include?("{requirement_id}_治理尾段完成门禁.md")
  end

  if text.match?(TOPIC07_P1_FILENAME_VERSION_VARIANT_PATTERN)
    errors << "gate-runner: #{rel} contains a filename-versioned variant of a stable Gate path"
  end

  marker_positions = TOPIC07_P1_TWO_STAGE_MARKERS.map { |marker| text.index(marker) }
  TOPIC07_P1_TWO_STAGE_MARKERS.each_with_index do |marker, index|
    if marker_positions[index].nil?
      errors << "gate-runner: #{rel} missing two-stage marker #{marker.inspect}"
    end
  end
  marker_positions.compact.each_cons(2) do |previous, current|
    errors << "gate-runner: #{rel} two-stage markers are out of order" unless previous < current
  end

  TOPIC07_P1_TWO_STAGE_SEMANTIC_NEEDLES.each do |needle|
    errors << "gate-runner: #{rel} missing two-stage semantic requirement #{needle.inspect}" unless text.include?(needle)
  end

  TOPIC07_P1_TWO_STAGE_FORBIDDEN_NEEDLES.each do |needle|
    errors << "gate-runner: #{rel} contains forbidden two-stage regression #{needle.inspect}" if text.include?(needle)
  end
end

# ── Gate Runner Scenario Conformance Wiring (Topic 07-P2) ──
# Static wiring checks for the validation-only scenario harness. The harness
# itself computes scenario outcomes; this validator only checks that the
# fixture, runner, docs, CI, and governance matrix stay wired and fail-closed.
# It does not duplicate the scenario algorithm and does not execute the runner.
# Read-only, deterministic, no network.

def gate_scenario_require(errors, text, needle, label)
  errors << "gate-scenario: #{label} missing #{needle.inspect}" unless text.include?(needle)
end

GATE_SCENARIO_FIXTURE = "fixtures/gate-runner-scenarios/scenarios.yaml".freeze
GATE_SCENARIO_RUNNER = "scripts/validate-gate-runner-scenarios.rb".freeze

GATE_SCENARIO_COVERAGE_TAGS = %w[
  development_path_direct development_path_speckit development_path_wrong_route
  development_path_blocked development_path_stale direct_tail_no_sync
  direct_tail_sync_authorized direct_tail_sync_unauthorized direct_tail_missing_evidence
  speckit_evidence_reuse pipeline_result_not_gate pure_governance response_only
  persistence_failure readback_mismatch stale_evidence pass_with_risk
  invalid_risk_acceptance precompleted_without_source
].freeze

GATE_SCENARIO_FIXED_IDS = %w[
  DPE-01-DIRECT-PASS DPE-02-SPECKIT-PASS DPE-03-WRONG-DIRECT-ROUTE
  DPE-04-BLOCKED-REVISION DPE-05-BLOCKED-UNKNOWN DPE-06-STALE-DECISION
  TAIL-D-01-DIRECT-NO-SYNC TAIL-D-02-DIRECT-SYNCED TAIL-D-03-SYNC-NOT-AUTHORIZED
  TAIL-D-04-RECONCILE-INCOMPLETE TAIL-D-05-MISSING-TEST-ACCEPTANCE
  TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED
  TAIL-S-01-REUSE-CURRENT-EVIDENCE TAIL-S-02-PIPELINE-RESULT-NOT-GATE
  TAIL-S-03-STALE-PIPELINE-EVIDENCE TAIL-G-01-PURE-GOVERNANCE
  TAIL-G-02-INCOMPLETE-SKIP-BASIS TAIL-G-03-PURE-DOCUMENTATION-MISSING-SKIP-BASIS
  TAIL-P-01-RESPONSE-ONLY TAIL-P-02-WRITE-FAILURE
  TAIL-P-03-READBACK-MISMATCH TAIL-P-04-PASS-WITH-RISK TAIL-P-05-INCOMPLETE-RISK-ACCEPTANCE
  TAIL-P-06-CRITICAL-RISK TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE
].freeze

GATE_SCENARIO_MARKERS = %w[
  GATE_RUNNER_SCENARIO_SCHEMA_VALIDATED
  GATE_RUNNER_ENTRY_SCENARIOS_PASS
  GATE_RUNNER_DIRECT_TAIL_SCENARIOS_PASS
  GATE_RUNNER_SPECKIT_REUSE_SCENARIOS_PASS
  GATE_RUNNER_GOVERNANCE_SCENARIOS_PASS
  GATE_RUNNER_RESPONSE_ONLY_FAIL_CLOSED
  GATE_RUNNER_PERSISTENCE_FAILURE_FAIL_CLOSED
  GATE_RUNNER_READBACK_MISMATCH_FAIL_CLOSED
  GATE_RUNNER_STALE_EVIDENCE_FAIL_CLOSED
  GATE_RUNNER_WRONG_ROUTE_FAIL_CLOSED
  GATE_RUNNER_PASS_WITH_RISK_BOUNDARY_VERIFIED
  GATE_RUNNER_TAIL_IN_PROGRESS_LIFECYCLE_VERIFIED
  GATE_RUNNER_PRECOMPLETED_WITHOUT_SOURCE_FAIL_CLOSED
  GATE_RUNNER_NESTED_SCHEMA_FAIL_CLOSED
  GATE_RUNNER_PURE_DOCUMENTATION_SKIP_BASIS_VERIFIED
  GATE_RUNNER_SYNC_WRITE_AUTHORIZATION_VERIFIED
  GATE_RUNNER_SELFTESTS_PASS
  TEMP_CLEANUP_COMPLETE
  GATE_RUNNER_SCENARIO_SUMMARY
].freeze

gate_scenario_fixture_text = tail_template_text(GATE_SCENARIO_FIXTURE)
if gate_scenario_fixture_text.nil?
  errors << "gate-scenario: fixtures/gate-runner-scenarios/scenarios.yaml must exist"
else
  [
    "schema_version: gate-runner-scenario-conformance-v1",
    "authority: validation_only",
    "authority=validation_only",
    "runtime_authority=false",
    "gate_decision_authority=false",
    "implementation_authority=false",
    "merge_authority=false",
    "publication_authority=false",
    "canonical_sources:",
    "required_coverage_tags:",
    "scenarios:",
    "ai-sdlc/development-path-governance.md",
    "skills/sdlc-gate-runner/SKILL.md",
    "skill-contracts/known-skills/sdlc-gate-runner.md",
    "skills/sdlc-gate-runner/references/gate-workflow.md",
    "skills/sdlc-gate-runner/references/gate-matrix.md",
    "skills/sdlc-gate-runner/references/risk-and-regate.md",
    "skills/sdlc-gate-runner/references/output-report.md",
    "templates/gate-result-template.md",
    "templates/artifact-manifest-template.md",
    "templates/business-domain-sync-status-template.yaml",
    "templates/library-driven-sync-decision-template.md",
    "development_path_entry",
    "documentation_governance_tail_completion"
  ].each { |needle| gate_scenario_require(errors, gate_scenario_fixture_text, needle, "scenarios.yaml") }
  GATE_SCENARIO_COVERAGE_TAGS.each do |tag|
    gate_scenario_require(errors, gate_scenario_fixture_text, "- #{tag}", "scenarios.yaml")
  end
  GATE_SCENARIO_FIXED_IDS.each do |fixed_id|
    gate_scenario_require(errors, gate_scenario_fixture_text, "- id: #{fixed_id}", "scenarios.yaml")
  end
end

gate_scenario_runner_text = tail_template_text(GATE_SCENARIO_RUNNER)
if gate_scenario_runner_text.nil?
  errors << "gate-scenario: scripts/validate-gate-runner-scenarios.rb must exist"
else
  unless File.executable?(File.join(ROOT, GATE_SCENARIO_RUNNER))
    errors << "gate-scenario: scripts/validate-gate-runner-scenarios.rb must be executable"
  end
  [
    'require "yaml"',
    'require "tmpdir"',
    'require "fileutils"',
    'require "digest"',
    "aliases: false",
    "permitted_classes: []",
    "Dir.mktmpdir",
    "Digest::SHA256",
    "authority=validation_only",
    "runtime_authority=false",
    "gate_decision_authority=false",
    "implementation_authority=false",
    "merge_authority=false",
    "publication_authority=false"
  ].each { |needle| gate_scenario_require(errors, gate_scenario_runner_text, needle, "runner") }
  GATE_SCENARIO_MARKERS.each do |marker|
    gate_scenario_require(errors, gate_scenario_runner_text, marker, "runner")
  end
  if gate_scenario_runner_text.match?(/Net::HTTP|OpenURI|open-uri|URI\.open|TCPSocket|Socket\.tcp/)
    errors << "gate-scenario: runner must not access the network"
  end
end

gate_scenario_validation_doc = tail_template_text("docs/VALIDATION.md")
if gate_scenario_validation_doc.nil?
  errors << "gate-scenario: docs/VALIDATION.md must exist"
else
  [
    "四个自动校验脚本",
    "ruby scripts/validate-gate-runner-scenarios.rb",
    "Gate Runner Scenario Conformance 校验",
    "gate-runner-scenarios",
    "authority=validation_only",
    "runtime_authority=false",
    "gate_decision_authority=false",
    "implementation_authority=false",
    "merge_authority=false",
    "publication_authority=false",
    "Dir.mktmpdir",
    "不运行真实 Gate",
    "不证明 Pipeline boundary",
    "ci-standards",
    "YAML.safe_load(permitted_classes: [], aliases: false)"
  ].each { |needle| gate_scenario_require(errors, gate_scenario_validation_doc, needle, "docs/VALIDATION.md") }
end

gate_scenario_ci = tail_template_text(".github/workflows/ci.yml")
if gate_scenario_ci.nil?
  errors << "gate-scenario: .github/workflows/ci.yml must exist"
else
  occurrence_count = gate_scenario_ci.scan("ruby scripts/validate-gate-runner-scenarios.rb").size
  unless occurrence_count == 1
    errors << "gate-scenario: ci.yml must run the scenario validator exactly once (got #{occurrence_count})"
  end
  gate_scenario_require(errors, gate_scenario_ci, "name: ci-standards", "ci.yml")
end

gate_scenario_devpath = tail_template_text("ai-sdlc/development-path-governance.md")
if gate_scenario_devpath.nil?
  errors << "gate-scenario: ai-sdlc/development-path-governance.md must exist"
else
  gate_scenario_require(errors, gate_scenario_devpath, "| Direct / Speckit / Tail 完整场景验证 | implemented |", "development-path-governance")
  gate_scenario_require(errors, gate_scenario_devpath, "| Topic 07 formal closure | implemented |", "development-path-governance")
  gate_scenario_require(errors, gate_scenario_devpath, "validation-only harness", "development-path-governance")
  gate_scenario_require(errors, gate_scenario_devpath, "不运行真实 Gate", "development-path-governance")
  [
    "| Topic 07 formal closure | pending |",
    "| D09 | implemented |"
  ].each do |forbidden|
    errors << "gate-scenario: development-path-governance closure regression or D09 implemented: #{forbidden}" if gate_scenario_devpath.include?(forbidden)
  end
end

# ── Gate Runner Scenario R1 Correction Wiring (Topic 07-P2 R1) ──
# Static wiring checks for the R1 correction: Tail lifecycle, strict recursive
# nested schema, pure documentation skip basis, and Sync write authorization.
# Read-only, deterministic, no network; no scenario algorithm is copied here
# and the scenario runner is never executed from this validator.

if gate_scenario_fixture_text
  [
    "completion_source_present",
    "completion_source_current",
    "write_authorized",
    "tamper_field",
    "status: in_progress",
    "status: completed"
  ].each { |needle| gate_scenario_require(errors, gate_scenario_fixture_text, needle, "scenarios.yaml") }
end

if gate_scenario_runner_text
  [
    "ENTRY_INPUT_FIELDS",
    "TAIL_INPUT_FIELDS",
    "TAIL_STATUS_VALUES",
    "completion_source_present",
    "completion_source_current",
    "write_authorized",
    "SYNC_REQUIRED write not authorized",
    "tail pre-completed state lacks current formal completion source",
    "invalid entry coverage status",
    "expected diagnostic",
    "UNEXPECTED RAISE",
    'when "High"',
    'when "Critical"'
  ].each { |needle| gate_scenario_require(errors, gate_scenario_runner_text, needle, "runner") }
  # Risk enums must use the canonical case only; lowercase must not reappear.
  ['when "high"', 'when "critical"'].each do |forbidden|
    if gate_scenario_runner_text.include?(forbidden)
      errors << "gate-scenario: runner uses non-canonical risk case #{forbidden}"
    end
  end
end

if gate_scenario_validation_doc
  [
    "这三个脚本",
    "Tail lifecycle",
    "in_progress",
    "pre-completed",
    "nested schema",
    "write authorization",
    "pure documentation",
    "precompleted_without_source"
  ].each { |needle| gate_scenario_require(errors, gate_scenario_validation_doc, needle, "docs/VALIDATION.md") }
end

# ── Pipeline Core Boundary Static Validation (Topic 07-E) ──
# Static assertions that the Speckit Pipeline runtime boundary converges to
# Speckit SDD Core through Implement, with Sync / Reconcile / Tail Completion
# Gate outside the Pipeline and a Shared Tail Handoff after Implement.
# Read-only, deterministic, no network. It never executes the Pipeline, Sync,
# Reconcile, or the Tail Completion Gate, and it does not copy the full Tail
# algorithm or modify any file.

def pipeline_boundary_require(errors, text, needle, label)
  errors << "pipeline-boundary: #{label} missing #{needle.inspect}" unless text.include?(needle)
end

PIPELINE_BOUNDARY_CORE_ORDER = "Preflight, Domain Route, Specify, Clarify, Plan, Tasks, Analyze, Implement".freeze

PIPELINE_BOUNDARY_SCOPE_PATHS = [
  "skills/sdlc-speckit-pipeline/SKILL.md",
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md",
  "skills/sdlc-speckit-pipeline/references/activation-and-inputs.md",
  "skills/sdlc-speckit-pipeline/references/new-rail-enhanced-pipeline.md",
  "skills/sdlc-speckit-pipeline/references/stage-sequence.md",
  "skills/sdlc-speckit-pipeline/references/gate-and-regate.md",
  "skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md",
  "skills/sdlc-speckit-pipeline/references/output-and-manifest.md",
  "registry/skill-registry.md",
  "ai-sdlc/development-path-governance.md",
  "docs/VALIDATION.md"
].freeze

pipeline_boundary_scope_text = {}
PIPELINE_BOUNDARY_SCOPE_PATHS.each do |rel|
  path = File.join(ROOT, rel)
  if File.file?(path)
    pipeline_boundary_scope_text[rel] = File.read(path)
  else
    errors << "pipeline-boundary: missing scope file #{rel}"
  end
end

pipeline_skill_text = pipeline_boundary_scope_text["skills/sdlc-speckit-pipeline/SKILL.md"]
pipeline_contract_text = pipeline_boundary_scope_text["skill-contracts/known-skills/sdlc-speckit-pipeline.md"]
pipeline_new_rail_text = pipeline_boundary_scope_text["skills/sdlc-speckit-pipeline/references/new-rail-enhanced-pipeline.md"]
pipeline_stage_text = pipeline_boundary_scope_text["skills/sdlc-speckit-pipeline/references/stage-sequence.md"]
pipeline_gate_text = pipeline_boundary_scope_text["skills/sdlc-speckit-pipeline/references/gate-and-regate.md"]
pipeline_side_text = pipeline_boundary_scope_text["skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md"]
pipeline_output_text = pipeline_boundary_scope_text["skills/sdlc-speckit-pipeline/references/output-and-manifest.md"]
pipeline_registry_text = pipeline_boundary_scope_text["registry/skill-registry.md"]
pipeline_devpath_text = pipeline_boundary_scope_text["ai-sdlc/development-path-governance.md"]
pipeline_validation_doc_text = pipeline_boundary_scope_text["docs/VALIDATION.md"]

pipeline_boundary_combined = PIPELINE_BOUNDARY_SCOPE_PATHS.map do |rel|
  pipeline_boundary_scope_text[rel].to_s
end.join("\n")

# A. Pipeline SKILL: Core stage order ends exactly at Implement.
if pipeline_skill_text
  pipeline_boundary_require(errors, pipeline_skill_text, PIPELINE_BOUNDARY_CORE_ORDER, "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "Speckit SDD Core ends exactly at Implement", "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "Produce Shared Tail Handoff", "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "Result Scope: Speckit SDD Core", "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "Tail Completion Gate Result: not_evaluated", "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "Completion Source Established: false", "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "candidate_evidence_only=true", "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "are not Core prerequisites", "pipeline SKILL")
  pipeline_boundary_require(errors, pipeline_skill_text, "Next step: Shared Documentation Governance Tail", "pipeline SKILL")
  ["Implement, Sync, Reconcile", "Implement, Sync, and Reconcile", "Analyze, Implement, Sync, and Reconcile"].each do |forbidden|
    if pipeline_skill_text.include?(forbidden)
      errors << "pipeline-boundary: pipeline SKILL keeps Sync/Reconcile in the Core chain: #{forbidden}"
    end
  end
  if pipeline_skill_text.include?("Execute Sync And Reconcile")
    errors << "pipeline-boundary: pipeline SKILL still has Execute Sync And Reconcile runtime step"
  end
end

# B. Pipeline contract: exact Core-through-Implement stage, no Sync Skill category,
#    no knowledge write permission, no Tail write/apply authorization prerequisites.
if pipeline_contract_text
  pipeline_contract_meta = contract_yaml(File.join(ROOT, "skill-contracts/known-skills/sdlc-speckit-pipeline.md"))
  unless pipeline_contract_meta["stage"] == "Speckit SDD Core through Implement"
    errors << "pipeline-boundary: contract stage must be Speckit SDD Core through Implement"
  end
  pipeline_contract_categories = pipeline_contract_meta["category"].to_s.split("/").map(&:strip).reject(&:empty?)
  if pipeline_contract_categories.include?("Sync Skill")
    errors << "pipeline-boundary: contract category must not include Sync Skill"
  end
  unless pipeline_contract_meta["can_modify_knowledge_base"] == false
    errors << "pipeline-boundary: contract can_modify_knowledge_base must be false"
  end
  pipeline_boundary_require(errors, pipeline_contract_text, "Shared Tail Handoff", "pipeline contract")
  pipeline_boundary_require(errors, pipeline_contract_text, "Sync 目标和写授权、Reconcile apply 授权不作为 Core 前置要求", "pipeline contract")
  pipeline_boundary_require(errors, pipeline_contract_text, "candidate evidence pointers", "pipeline contract")
  if pipeline_contract_text.include?("-> Sync\n-> Reconcile")
    errors << "pipeline-boundary: contract flow still contains Sync and Reconcile stages"
  end
end

# C. new-rail-enhanced-pipeline.md: Post-Clarify Core execution ends at Implement
#    and does not pre-collect Tail write/apply authorization.
if pipeline_new_rail_text
  pipeline_boundary_require(errors, pipeline_new_rail_text, "| Post-Clarify Core execution | Plan, Tasks, Analyze, Implement |", "new-rail-enhanced-pipeline")
  pipeline_boundary_require(errors, pipeline_new_rail_text, "Sync, Reconcile, and the Shared Documentation Governance Tail are outside the Pipeline", "new-rail-enhanced-pipeline")
  pipeline_boundary_require(errors, pipeline_new_rail_text, "are not Core prerequisites and are not collected at the Clarify boundary", "new-rail-enhanced-pipeline")
  pipeline_boundary_require(errors, pipeline_new_rail_text, "does not decide in advance on behalf of the Tail owner", "new-rail-enhanced-pipeline")
  if pipeline_new_rail_text.include?("| Post-Clarify continuous execution | Plan, Tasks, Analyze, Implement, Sync, Reconcile |")
    errors << "pipeline-boundary: new-rail-enhanced-pipeline keeps Sync/Reconcile in the continuous segment"
  end
end

# D. stage-sequence.md: no Sync/Reconcile rows in the runtime stage mapping,
#    continuous execution ends at Implement, Shared Tail Handoff is the exit.
if pipeline_stage_text
  pipeline_boundary_require(errors, pipeline_stage_text, "| Implement | `sdlc-speckit-implement` | Modify code for approved tasks. |", "stage-sequence")
  pipeline_boundary_require(errors, pipeline_stage_text, "## Shared Tail Handoff Boundary", "stage-sequence")
  pipeline_boundary_require(errors, pipeline_stage_text, "Do not ask whether to enter a Pipeline-internal Sync or Reconcile stage", "stage-sequence")
  pipeline_boundary_require(errors, pipeline_stage_text, "candidate_evidence_only=true", "stage-sequence")
  pipeline_boundary_require(errors, pipeline_stage_text, "decided by the Manifest current state and the Tail Completion Gate", "stage-sequence")
  ["| Sync | `sdlc-speckit-sync` |", "| Reconcile | `sdlc-speckit-code-doc-reconcile` |"].each do |forbidden|
    if pipeline_stage_text.include?(forbidden)
      errors << "pipeline-boundary: stage-sequence keeps Pipeline child-stage mapping #{forbidden}"
    end
  end
end

# E. gate-and-regate.md: Tail blockers route to the Shared Tail Handoff and
#    never masquerade a completed Core as unexecuted.
if pipeline_gate_text
  pipeline_boundary_require(errors, pipeline_gate_text, "## Shared Tail Handoff Routes", "gate-and-regate")
  pipeline_boundary_require(errors, pipeline_gate_text, "`core_completion`", "gate-and-regate")
  pipeline_boundary_require(errors, pipeline_gate_text, "`tail_completion`", "gate-and-regate")
  pipeline_boundary_require(errors, pipeline_gate_text, "earliest affected Core node", "gate-and-regate")
  pipeline_boundary_require(errors, pipeline_gate_text, "Tail next owner", "gate-and-regate")
  pipeline_boundary_require(errors, pipeline_gate_text, "must not make a completed Core look unexecuted", "gate-and-regate")
  ["| Stable knowledge is missing | `sdlc-speckit-sync` |", "| Code and documents drift | `sdlc-speckit-code-doc-reconcile` |"].each do |forbidden|
    if pipeline_gate_text.include?(forbidden)
      errors << "pipeline-boundary: gate-and-regate keeps Sync/Reconcile as Pipeline child-stage routes: #{forbidden}"
    end
  end
end

# F. side-effect-boundaries.md: Pipeline and Pipeline Core never write knowledge;
#    Reconcile belongs to the Shared Tail; Manifest recommendation is in_progress only.
if pipeline_side_text
  pipeline_boundary_require(errors, pipeline_side_text, "The Pipeline and its Pipeline Core must not write knowledge", "side-effect-boundaries")
  pipeline_boundary_require(errors, pipeline_side_text, "belong only to `sdlc-speckit-sync` inside the Shared Tail", "side-effect-boundaries")
  pipeline_boundary_require(errors, pipeline_side_text, "The Pipeline does not execute Reconcile audit or apply", "side-effect-boundaries")
  pipeline_boundary_require(errors, pipeline_side_text, "recommend Tail status=`in_progress`", "side-effect-boundaries")
  pipeline_boundary_require(errors, pipeline_side_text, "must not set a completion source", "side-effect-boundaries")
end

# G. output-and-manifest.md: Core-only report shape, Handoff required, COMPLETED is
#    Core-only, Manifest recommendation never suggests Tail completed.
if pipeline_output_text
  pipeline_boundary_require(errors, pipeline_output_text, "Result Scope: Speckit SDD Core", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "## Shared Tail Handoff", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "Tail Completion Gate Result: not_evaluated", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "Completion Source Established: false", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "candidate_evidence_only=true", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "Speckit SDD Core through Implement completed without a Core blocking item", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "Pipeline `COMPLETED` must never be interpreted as", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "Tail completed.", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "Do not recommend", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "Pipeline report as Tail Gate", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "## Existing Sync / Reconcile Evidence", "output-and-manifest")
  pipeline_boundary_require(errors, pipeline_output_text, "automatically decide `NOT_REQUIRED`", "output-and-manifest")
  if pipeline_output_text.include?("`CORE_COMPLETED`")
    errors << "pipeline-boundary: output-and-manifest must not introduce a CORE_COMPLETED enum"
  end
  if pipeline_output_text.include?("implementation, required sync, and reconcile completed")
    errors << "pipeline-boundary: output-and-manifest COMPLETED must not require sync and reconcile"
  end
end

# H. Registry: stage, knowledge permission, and Tail-external notes.
if pipeline_registry_text
  pipeline_registry_entry = fenced_yamls(File.join(ROOT, "registry/skill-registry.md"))
                             .find { |entry| entry["name"] == "sdlc-speckit-pipeline" }
  if pipeline_registry_entry.nil?
    errors << "pipeline-boundary: registry missing sdlc-speckit-pipeline entry"
  else
    unless pipeline_registry_entry["stage"] == "Speckit SDD Core through Implement"
      errors << "pipeline-boundary: registry stage must be Speckit SDD Core through Implement"
    end
    unless pipeline_registry_entry["can_modify_knowledge_base"] == false
      errors << "pipeline-boundary: registry can_modify_knowledge_base must be false"
    end
  end
  pipeline_boundary_require(errors, pipeline_registry_text, "Shared Tail (Sync / Reconcile / Tail Completion Gate) is outside the Pipeline", "registry")
  pipeline_boundary_require(errors, pipeline_registry_text, "Pipeline result cannot replace the Tail Completion Gate", "registry")
end

# I. Development Path matrix: boundary alignment implemented, Topic 07 formal
#    closure implemented as aggregate state, D09 still not implemented.
if pipeline_devpath_text
  pipeline_boundary_require(errors, pipeline_devpath_text, "| Speckit Pipeline boundary alignment | implemented |", "development-path-governance")
  pipeline_boundary_require(errors, pipeline_devpath_text, "| Topic 07 formal closure | implemented |", "development-path-governance")
  pipeline_boundary_require(errors, pipeline_devpath_text, "D09 尚未实施", "development-path-governance")
  pipeline_boundary_require(errors, pipeline_devpath_text, "Pipeline fixed Core ends at Implement", "development-path-governance")
  pipeline_boundary_require(errors, pipeline_devpath_text, "Implement 后输出 Shared Tail Handoff", "development-path-governance")
  pipeline_boundary_require(errors, pipeline_devpath_text, "Sync/Reconcile/Tail Gate 位于 Pipeline 外部", "development-path-governance")
  pipeline_boundary_require(errors, pipeline_devpath_text, "不代表 Topic 07 formal closure", "development-path-governance")
  pipeline_boundary_require(errors, pipeline_devpath_text, "不代表 D09 implemented", "development-path-governance")
end

# J. docs/VALIDATION.md: Pipeline Core Boundary Static Validation documented.
if pipeline_validation_doc_text
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "## Pipeline Core Boundary Static Validation", "docs/VALIDATION.md")
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "Pipeline fixed stages 截止 Implement", "docs/VALIDATION.md")
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "Shared Tail Handoff required", "docs/VALIDATION.md")
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "knowledge permission=false", "docs/VALIDATION.md")
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "old fixed Sync/Reconcile stage chain", "docs/VALIDATION.md")
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "不运行真实 Pipeline", "docs/VALIDATION.md")
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "不执行 Sync/Reconcile", "docs/VALIDATION.md")
  pipeline_boundary_require(errors, pipeline_validation_doc_text, "不运行真实 Tail Gate", "docs/VALIDATION.md")
end

# K. Cross-file invariants: no CORE_COMPLETED enum, no legacy Pipeline stage chain
#    anywhere in the Pipeline scope, no Tail completion claim.
if pipeline_boundary_combined.include?("CORE_COMPLETED")
  errors << "pipeline-boundary: CORE_COMPLETED enum must not be introduced in the Pipeline scope"
end
[
  "-> Implement\n-> Sync",
  "Implement -> Sync -> Reconcile",
  "Analyze -> Implement -> Sync",
  "Plan, Tasks, Analyze, Implement, Sync, Reconcile"
].each do |forbidden|
  if pipeline_boundary_combined.include?(forbidden)
    errors << "pipeline-boundary: Pipeline scope contains legacy Core chain #{forbidden.inspect}"
  end
end

# ── Pipeline Bootstrap Boundary And Tail Entry Eligibility (Topic 07-E R1) ──
# Static assertions for the R1 correction:
#   F-001: write-mode business-domain bootstrap stays outside the Pipeline; the
#          Pipeline only performs read-only readiness inspection, blocks at
#          Preflight with INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED, and
#          re-enters Preflight after an independently authorized bootstrap.
#   F-002: Shared Tail Handoff emission and Tail entry eligibility are strictly
#          bound to Core completion; only COMPLETED may emit a Handoff, be Tail
#          entry eligible, and recommend Tail in_progress.
# Read-only, deterministic, no network. The negative self-tests use in-memory
# string deep copies and never modify repository files. Unknown exceptions or
# unrelated errors never count as successful rejection.

PIPELINE_R1_BOOTSTRAP_SCOPE_PATHS = [
  "skills/sdlc-speckit-pipeline/SKILL.md",
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md",
  "skills/sdlc-speckit-pipeline/references/activation-and-inputs.md",
  "skills/sdlc-speckit-pipeline/references/stage-sequence.md",
  "skills/sdlc-speckit-pipeline/references/gate-and-regate.md",
  "skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md",
  "skills/sdlc-speckit-pipeline/references/output-and-manifest.md"
].freeze

PIPELINE_R1_SCOPE_PATHS = (PIPELINE_R1_BOOTSTRAP_SCOPE_PATHS + ["docs/VALIDATION.md"]).freeze

PIPELINE_R1_BOOTSTRAP_WRITE_REQUIRED = {
  "skills/sdlc-speckit-pipeline/SKILL.md" => [
    "INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED",
    "stop at Preflight",
    "independent bootstrap",
    "re-enter Preflight",
    "write-mode business-domain bootstrap"
  ],
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md" => [
    "INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED",
    "独立授权",
    "重新运行 Preflight",
    "--dry-run",
    "write-mode business-domain bootstrap"
  ],
  "skills/sdlc-speckit-pipeline/references/activation-and-inputs.md" => [
    "INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED",
    "readiness input",
    "independent bootstrap",
    "Re-run Preflight",
    "outside the Pipeline",
    "--dry-run"
  ],
  "skills/sdlc-speckit-pipeline/references/stage-sequence.md" => [
    "INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED",
    "Read-only readiness inspection"
  ],
  "skills/sdlc-speckit-pipeline/references/gate-and-regate.md" => [
    "INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED",
    "## Preflight Blocker Route",
    "Tail Entry Eligible",
    "independent bootstrap outside the Pipeline",
    "must not be used to bypass"
  ],
  "skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md" => [
    "write-mode business-domain bootstrap",
    "INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED",
    "--dry-run",
    "must not be used to bypass"
  ]
}.freeze

PIPELINE_R1_FORBIDDEN_BOOTSTRAP_ACTIVE_WORDING = [
  "so they can be generated before knowledge routing",
  "先执行 business-domain bootstrap",
  "controller plus standard-package bootstrap/audit scripts",
  "bootstrap scripts 作为 Pipeline 执行器"
].freeze

BOOTSTRAP_SCRIPT_PATTERN = /bootstrap-[a-z-]+\.sh/.freeze
PIPELINE_R1_FORCE_GUARD = /
  must\s+not|
  must\s+never|
  without\s+--force|
  no\s+--force|
  never\s+include|
  not\s+include|
  禁止|
  不得|
  不能
/ix.freeze

PIPELINE_RESULT_MATRIX_HEADER = [
  "Pipeline Result", "Core Completion", "Shared Tail Handoff Emitted",
  "Tail Entry Eligible", "Shared Tail Status", "Tail Gate Result",
  "Tail Status Recommendation", "Next Step"
].freeze

PIPELINE_RESULT_MATRIX = {
  "COMPLETED" => {
    "Core Completion" => "true",
    "Shared Tail Handoff Emitted" => "true",
    "Tail Entry Eligible" => "true",
    "Shared Tail Status" => "pending",
    "Tail Gate Result" => "not_evaluated",
    "Tail Status Recommendation" => "in_progress",
    "Next Step" => "Shared Documentation Governance Tail"
  },
  "PARTIAL" => {
    "Core Completion" => "false",
    "Shared Tail Handoff Emitted" => "false",
    "Tail Entry Eligible" => "false",
    "Shared Tail Status" => "not_entered",
    "Tail Gate Result" => "not_applicable",
    "Tail Status Recommendation" => "unchanged",
    "Next Step" => "remaining Core work"
  },
  "BLOCKED" => {
    "Core Completion" => "false",
    "Shared Tail Handoff Emitted" => "false",
    "Tail Entry Eligible" => "false",
    "Shared Tail Status" => "not_entered",
    "Tail Gate Result" => "not_applicable",
    "Tail Status Recommendation" => "unchanged",
    "Next Step" => "earliest affected Core node"
  },
  "REGATE_REQUIRED" => {
    "Core Completion" => "false",
    "Shared Tail Handoff Emitted" => "false",
    "Tail Entry Eligible" => "false",
    "Shared Tail Status" => "not_entered",
    "Tail Gate Result" => "not_applicable",
    "Tail Status Recommendation" => "unchanged",
    "Next Step" => "required upstream Re-Gate"
  },
  "DIRECT_IMPLEMENTATION_RECOMMENDED" => {
    "Core Completion" => "false",
    "Shared Tail Handoff Emitted" => "false",
    "Tail Entry Eligible" => "false",
    "Shared Tail Status" => "not_entered",
    "Tail Gate Result" => "not_applicable",
    "Tail Status Recommendation" => "unchanged",
    "Next Step" => "Direct Implementation route"
  }
}.freeze

PIPELINE_R1_TAIL_ENTRY_REQUIRED = {
  "skills/sdlc-speckit-pipeline/SKILL.md" => [
    "Shared Tail Handoff Emitted",
    "Tail Entry Eligible",
    "Core Stop And Route",
    "Tail Status Recommendation"
  ],
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md" => [
    "Shared Tail Handoff Emitted",
    "Core Stop And Route"
  ],
  "skills/sdlc-speckit-pipeline/references/output-and-manifest.md" => [
    "Shared Tail Handoff Emitted",
    "Tail Entry Eligible",
    "## Core Stop And Route",
    "conditional section",
    "only when `Shared Tail Handoff Emitted=true`",
    "never recommends Tail `in_progress`"
  ]
}.freeze

PIPELINE_R1_TAIL_ENTRY_FORBIDDEN = [
  "Every pipeline result must contain",
  "carry the applicable Tail Handoff state",
  "- Shared Tail Status: in_progress",
  "所有结果固定 Tail `in_progress`"
].freeze

def pipeline_r1_bootstrap_write_diagnostics(scope)
  diags = []
  PIPELINE_R1_BOOTSTRAP_WRITE_REQUIRED.each do |rel, needles|
    text = scope[rel].to_s
    needles.each do |needle|
      unless text.include?(needle)
        diags << "pipeline-boundary-r1: #{rel} missing bootstrap write boundary requirement #{needle.inspect}"
      end
    end
  end
  PIPELINE_R1_FORBIDDEN_BOOTSTRAP_ACTIVE_WORDING.each do |phrase|
    scope.each do |rel, text|
      next unless PIPELINE_R1_BOOTSTRAP_SCOPE_PATHS.include?(rel)
      if text.include?(phrase)
        diags << "pipeline-boundary-r1: #{rel} keeps active bootstrap wording that lets the Pipeline bootstrap business-domain: #{phrase}"
      end
    end
  end
  begin
    pipeline_r1_contract_meta = contract_yaml(File.join(ROOT, "skill-contracts/known-skills/sdlc-speckit-pipeline.md"))
    unless pipeline_r1_contract_meta["can_modify_knowledge_base"] == false
      diags << "pipeline-boundary-r1: contract can_modify_knowledge_base must remain false"
    end
  rescue StandardError => e
    diags << "pipeline-boundary-r1: contract metadata unreadable: #{e.message}"
  end
  diags
end

def pipeline_r1_bootstrap_dry_run_diagnostics(scope)
  diags = []
  scope.each do |rel, text|
    next unless PIPELINE_R1_BOOTSTRAP_SCOPE_PATHS.include?(rel)
    text.lines.each_with_index do |line, index|
      next unless line.match?(BOOTSTRAP_SCRIPT_PATTERN)
      if line.include?("--force") && !line.match?(PIPELINE_R1_FORCE_GUARD)
        diags << "pipeline-boundary-r1: #{rel}:#{index + 1} bootstrap invocation must not include --force: #{line.strip}"
      end
      unless line.include?("--dry-run")
        diags << "pipeline-boundary-r1: #{rel}:#{index + 1} bootstrap invocation must include --dry-run: #{line.strip}"
      end
    end
  end
  diags
end

def parse_pipeline_result_matrix(text)
  lines = text.lines
  header_index = lines.index { |line| line.start_with?("| Pipeline Result |") }
  return nil unless header_index

  header = lines[header_index].split("|").map(&:strip).reject(&:empty?)
  return nil unless header == PIPELINE_RESULT_MATRIX_HEADER

  labels = []
  rows = {}
  ((header_index + 1)...lines.length).each do |i|
    line = lines[i].strip
    break unless line.start_with?("|") && line.end_with?("|")

    cells = line.split("|").map(&:strip).reject(&:empty?)
    next if cells.empty? || cells.length != header.length
    next if cells.all? { |cell| cell.match?(/\A:?-{1,}:?\z/) }

    labels << cells[0]
    rows[cells[0]] = header.each_with_index.to_h { |col, idx| [col, cells[idx]] }
  end
  return nil if rows.empty?

  { "labels" => labels, "rows" => rows }
end

def result_matrix_diagnostics(parsed, label)
  diags = []
  if parsed.nil? || parsed["rows"].empty?
    diags << "pipeline-boundary-r1: #{label} missing the five-row Pipeline Result / Tail entry eligibility matrix"
    return diags
  end

  rows = parsed["rows"]
  labels = parsed["labels"]
  expected_labels = PIPELINE_RESULT_MATRIX.keys

  (expected_labels - labels.uniq).each do |missing_label|
    diags << "pipeline-boundary-r1: #{label} result matrix missing primary label #{missing_label}"
  end
  labels.uniq.each do |result|
    next if expected_labels.include?(result)
    diags << "pipeline-boundary-r1: #{label} result matrix must not add extra primary label #{result}"
  end
  if rows.key?("CORE_COMPLETED")
    diags << "pipeline-boundary-r1: #{label} result matrix must not introduce CORE_COMPLETED"
  end
  expected_labels.each do |result|
    count = labels.count(result)
    unless count == 1
      diags << "pipeline-boundary-r1: #{label} result matrix label #{result} must appear exactly once (got #{count})"
    end
    row = rows[result]
    next unless row
    PIPELINE_RESULT_MATRIX[result].each do |col, expected|
      actual = row[col]
      unless actual == expected
        diags << "pipeline-boundary-r1: #{label} matrix cell #{result}.#{col} must be #{expected.inspect} (got #{actual.inspect})"
      end
    end
  end

  completed = rows["COMPLETED"]
  if completed
    if completed["Shared Tail Handoff Emitted"] == "true" && completed["Tail Entry Eligible"] != "true"
      diags << "pipeline-boundary-r1: #{label} COMPLETED with Handoff=true must also be Tail Entry Eligible=true"
    end
    unless completed["Next Step"] == "Shared Documentation Governance Tail"
      diags << "pipeline-boundary-r1: #{label} COMPLETED must route to the Shared Documentation Governance Tail as next step"
    end
  end

  (expected_labels - ["COMPLETED"]).each do |result|
    row = rows[result]
    next unless row
    if row["Shared Tail Handoff Emitted"] == "true" || row["Tail Entry Eligible"] == "true"
      diags << "pipeline-boundary-r1: #{label} non-COMPLETED result #{result} must not emit Shared Tail Handoff or be Tail entry eligible"
    end
    if row["Tail Status Recommendation"] == "in_progress"
      diags << "pipeline-boundary-r1: #{label} non-COMPLETED result #{result} must not recommend Tail in_progress"
    end
    if row["Next Step"] == "Shared Documentation Governance Tail"
      diags << "pipeline-boundary-r1: #{label} non-COMPLETED result #{result} must not route to the Shared Tail as next step"
    end
  end
  diags
end

def pipeline_r1_tail_entry_diagnostics(scope)
  diags = []
  PIPELINE_R1_TAIL_ENTRY_REQUIRED.each do |rel, needles|
    text = scope[rel].to_s
    needles.each do |needle|
      unless text.include?(needle)
        diags << "pipeline-boundary-r1: #{rel} missing Tail entry eligibility requirement #{needle.inspect}"
      end
    end
  end
  [
    "skills/sdlc-speckit-pipeline/SKILL.md",
    "skill-contracts/known-skills/sdlc-speckit-pipeline.md",
    "skills/sdlc-speckit-pipeline/references/output-and-manifest.md"
  ].each do |rel|
    text = scope[rel].to_s
    PIPELINE_R1_TAIL_ENTRY_FORBIDDEN.each do |phrase|
      if text.include?(phrase)
        diags << "pipeline-boundary-r1: #{rel} contains forbidden Tail entry eligibility regression #{phrase.inspect}"
      end
    end
  end
  diags
end

# Negative self-tests: every mutation must be rejected by the real assertion
# functions with the expected diagnostic. Mutations operate on in-memory deep
# copies; unknown exceptions or unrelated errors never count as rejection.
PIPELINE_R1_MATRIX_FILE = "skills/sdlc-speckit-pipeline/references/output-and-manifest.md".freeze

PIPELINE_R1_SELFTESTS = [
  {
    id: "bootstrap_dry_run_removed",
    desc: "bootstrap command without --dry-run",
    scope_file: "skills/sdlc-speckit-pipeline/references/activation-and-inputs.md",
    mutate: ->(text) { text.sub("--dry-run", "") },
    run: ->(scope) { pipeline_r1_bootstrap_dry_run_diagnostics(scope) },
    expect: "bootstrap invocation must include --dry-run"
  },
  {
    id: "bootstrap_force_added",
    desc: "bootstrap command with --force",
    scope_file: "skills/sdlc-speckit-pipeline/references/activation-and-inputs.md",
    mutate: ->(text) { text + "\nRun: scripts/bootstrap-business-domain.sh --force\n" },
    run: ->(scope) { pipeline_r1_bootstrap_dry_run_diagnostics(scope) },
    expect: "bootstrap invocation must not include --force"
  },
  {
    id: "bootstrap_active_wording",
    desc: "active wording lets the Pipeline write bootstrap",
    scope_file: "skills/sdlc-speckit-pipeline/SKILL.md",
    mutate: ->(text) { text + "\nso they can be generated before knowledge routing\n" },
    run: ->(scope) { pipeline_r1_bootstrap_write_diagnostics(scope) },
    expect: "active bootstrap wording"
  },
  {
    id: "stage_sequence_bootstrap_executor",
    desc: "stage sequence restores bootstrap script execution",
    scope_file: "skills/sdlc-speckit-pipeline/references/stage-sequence.md",
    mutate: ->(text) { text.sub("Read-only readiness inspection", "controller plus standard-package bootstrap/audit scripts") },
    run: ->(scope) { pipeline_r1_bootstrap_write_diagnostics(scope) },
    expect: "controller plus standard-package bootstrap/audit scripts"
  },
  {
    id: "matrix_blocked_handoff_true",
    desc: "BLOCKED Shared Tail Handoff Emitted changed to true",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text.sub("| BLOCKED | false | false | false |", "| BLOCKED | false | true | false |") },
    run: ->(scope) { result_matrix_diagnostics(parse_pipeline_result_matrix(scope[PIPELINE_R1_MATRIX_FILE]), "self-test") },
    expect: "BLOCKED.Shared Tail Handoff Emitted"
  },
  {
    id: "matrix_regate_in_progress",
    desc: "REGATE_REQUIRED Tail Status Recommendation changed to in_progress",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text.sub("| REGATE_REQUIRED | false | false | false | not_entered | not_applicable | unchanged |", "| REGATE_REQUIRED | false | false | false | not_entered | not_applicable | in_progress |") },
    run: ->(scope) { result_matrix_diagnostics(parse_pipeline_result_matrix(scope[PIPELINE_R1_MATRIX_FILE]), "self-test") },
    expect: "REGATE_REQUIRED.Tail Status Recommendation"
  },
  {
    id: "matrix_partial_tail_entry_true",
    desc: "PARTIAL Tail Entry Eligible changed to true",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text.sub("| PARTIAL | false | false | false |", "| PARTIAL | false | false | true |") },
    run: ->(scope) { result_matrix_diagnostics(parse_pipeline_result_matrix(scope[PIPELINE_R1_MATRIX_FILE]), "self-test") },
    expect: "PARTIAL.Tail Entry Eligible"
  },
  {
    id: "matrix_direct_next_step_shared_tail",
    desc: "DIRECT_IMPLEMENTATION_RECOMMENDED next step changed to Shared Tail",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text.sub("| DIRECT_IMPLEMENTATION_RECOMMENDED | false | false | false | not_entered | not_applicable | unchanged | Direct Implementation route |", "| DIRECT_IMPLEMENTATION_RECOMMENDED | false | false | false | not_entered | not_applicable | unchanged | Shared Documentation Governance Tail |") },
    run: ->(scope) { result_matrix_diagnostics(parse_pipeline_result_matrix(scope[PIPELINE_R1_MATRIX_FILE]), "self-test") },
    expect: "DIRECT_IMPLEMENTATION_RECOMMENDED.Next Step"
  },
  {
    id: "matrix_completed_handoff_false",
    desc: "COMPLETED Shared Tail Handoff Emitted changed to false",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text.sub("| COMPLETED | true | true | true |", "| COMPLETED | true | false | true |") },
    run: ->(scope) { result_matrix_diagnostics(parse_pipeline_result_matrix(scope[PIPELINE_R1_MATRIX_FILE]), "self-test") },
    expect: "COMPLETED.Shared Tail Handoff Emitted"
  },
  {
    id: "matrix_sixth_primary_result",
    desc: "a sixth primary Pipeline result is added",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text.sub("| DIRECT_IMPLEMENTATION_RECOMMENDED | false | false | false | not_entered | not_applicable | unchanged | Direct Implementation route |", "| DIRECT_IMPLEMENTATION_RECOMMENDED | false | false | false | not_entered | not_applicable | unchanged | Direct Implementation route |\n| NEW_RESULT | false | false | false | not_entered | not_applicable | unchanged | remaining Core work |") },
    run: ->(scope) { result_matrix_diagnostics(parse_pipeline_result_matrix(scope[PIPELINE_R1_MATRIX_FILE]), "self-test") },
    expect: "extra primary label NEW_RESULT"
  },
  {
    id: "every_result_contains_handoff",
    desc: "every pipeline result must contain Shared Tail Handoff wording restored",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text + "\nEvery pipeline result must contain Shared Tail Handoff\n" },
    run: ->(scope) { pipeline_r1_tail_entry_diagnostics(scope) },
    expect: "Every pipeline result must contain"
  },
  {
    id: "generic_tail_status_in_progress",
    desc: "generic Tail status fixed to in_progress",
    scope_file: PIPELINE_R1_MATRIX_FILE,
    mutate: ->(text) { text + "\n- Shared Tail Status: in_progress\n" },
    run: ->(scope) { pipeline_r1_tail_entry_diagnostics(scope) },
    expect: "- Shared Tail Status: in_progress"
  }
].freeze

def pipeline_r1_self_test_diagnostics(scope)
  diags = []
  PIPELINE_R1_SELFTESTS.each do |test|
    text = scope[test[:scope_file]]
    if text.nil?
      diags << "pipeline-boundary-r1: self-test #{test[:id]} cannot run: missing scope file #{test[:scope_file]}"
      next
    end
    begin
      mutated_scope = scope.dup
      mutated_scope[test[:scope_file]] = test[:mutate].call(text.dup)
      produced = test[:run].call(mutated_scope)
      unless produced.any? { |d| d.include?(test[:expect]) }
        diags << "pipeline-boundary-r1: self-test #{test[:id]} (#{test[:desc]}) must be rejected with a diagnostic containing #{test[:expect].inspect}; produced #{produced.inspect}"
      end
    rescue StandardError => e
      diags << "pipeline-boundary-r1: self-test #{test[:id]} (#{test[:desc]}) raised unexpected error #{e.class}: #{e.message}; unexpected exceptions do not count as successful rejection"
    end
  end
  diags
end

pipeline_r1_scope = {}
PIPELINE_R1_SCOPE_PATHS.each do |rel|
  path = File.join(ROOT, rel)
  if File.file?(path)
    pipeline_r1_scope[rel] = File.read(path)
  else
    errors << "pipeline-boundary-r1: missing scope file #{rel}"
  end
end

r1_bootstrap_write_diags = []
r1_bootstrap_dry_run_diags = []
r1_matrix_diags = []
r1_tail_entry_diags = []
r1_selftest_diags = []

if PIPELINE_R1_SCOPE_PATHS.all? { |rel| File.file?(File.join(ROOT, rel)) }
  r1_bootstrap_write_diags = pipeline_r1_bootstrap_write_diagnostics(pipeline_r1_scope)
  r1_bootstrap_dry_run_diags = pipeline_r1_bootstrap_dry_run_diagnostics(pipeline_r1_scope)
  %w[skills/sdlc-speckit-pipeline/references/output-and-manifest.md docs/VALIDATION.md].each do |rel|
    parsed = parse_pipeline_result_matrix(pipeline_r1_scope[rel].to_s)
    r1_matrix_diags.concat(result_matrix_diagnostics(parsed, rel))
  end
  r1_tail_entry_diags = pipeline_r1_tail_entry_diagnostics(pipeline_r1_scope)
  r1_selftest_diags = pipeline_r1_self_test_diagnostics(pipeline_r1_scope)
end

errors.concat(r1_bootstrap_write_diags)
errors.concat(r1_bootstrap_dry_run_diags)
errors.concat(r1_matrix_diags)
errors.concat(r1_tail_entry_diags)
errors.concat(r1_selftest_diags)

# ── Pipeline Active Runtime Conditionality (Topic 07-E R2) ──
# Static assertions for the R2 correction. Every active runtime statement in
# the five active files must strictly obey the five-row Result / Tail Entry
# Eligibility matrix; a correct matrix never excuses conflicting active
# wording. Checks are section-scoped: the bare presence of `COMPLETED`
# somewhere in a file never proves a local statement is conditional.
#   F-003: SKILL Core Rule recommends Tail in_progress only when Pipeline
#          Result=COMPLETED and Core Completion=true; the unconditional
#          "the Pipeline only recommends Tail status in_progress" wording is
#          forbidden; the generic Output Pipeline Result list must not make the
#          Shared Tail Handoff a mandatory output.
#   F-004: Contract Handoff responsibilities, metadata output_artifacts /
#          side_effects, Flow Contract, Output Contract, Blocking Conditions,
#          and Gate Requirements are conditional on COMPLETED; non-COMPLETED
#          results output Core Stop And Route.
#   F-005: Stage Sequence Handoff requires the four success gates
#          (COMPLETED / Core Completion / Implement completed / no Core
#          blocking item); unconditional After-Implement Handoff wording is
#          forbidden.
#   F-006: Manifest Side Effects Tail recommendation is conditional on
#          COMPLETED; generic Manifest Next Step is result-specific; Tail
#          blockers enter the Handoff only when Core is COMPLETED; blockers are
#          never claimed to always ride into the Handoff.
# Read-only, deterministic, no network. Negative self-tests use in-memory
# string deep copies and never modify repository files; unknown exceptions or
# unrelated errors never count as successful rejection.

PIPELINE_R2_ACTIVE_PATHS = [
  "skills/sdlc-speckit-pipeline/SKILL.md",
  "skill-contracts/known-skills/sdlc-speckit-pipeline.md",
  "skills/sdlc-speckit-pipeline/references/stage-sequence.md",
  "skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md",
  "skills/sdlc-speckit-pipeline/references/output-and-manifest.md"
].freeze

PIPELINE_R2_STAGE_FOUR_GATES = [
  "Pipeline Result = `COMPLETED`",
  "Core Completion = true",
  "Implement completed",
  "No Core blocking item"
].freeze

PIPELINE_R2_GENERIC_NEXT_STEP_FIXED = /\A-\s*Next Step: Shared Documentation Governance Tail\.?\z/.freeze
PIPELINE_R2_ONLY_RECOMMENDS_TAIL_STATUS = /only\s+recommends\s+Tail\s+status/i.freeze
PIPELINE_R2_MAY_ONLY_RECOMMEND_TAIL_STATUS = /may\s+only\s+recommend\s+Tail\s+status/i.freeze
PIPELINE_R2_BLOCKERS_RIDE_INTO_HANDOFF = /(?:also|always)\s+carried\s+into\s+the\s+Shared\s+Tail\s+Handoff/i.freeze

PIPELINE_R2_GLOBAL_FORBIDDEN_ACTIVE_WORDING = [
  "After Core completion, output the Shared Tail Handoff",
  "After Implement, output the Shared Tail Handoff",
  "After Implement, the Pipeline produces a Shared Tail Handoff",
  "After Implement, hand off the Shared Tail Handoff to the Shared Tail",
  "在 Implement 完成后输出 Shared Tail Handoff",
  "只输出 Shared Tail Handoff",
  "Core 完成后必须输出 Shared Tail Handoff",
  "只能进入 Shared Tail Handoff"
].freeze

PIPELINE_R2_RESULT_NEXT_STEPS = [
  "Shared Documentation Governance Tail",
  "remaining Core work",
  "earliest affected Core node",
  "required upstream Re-Gate",
  "Direct Implementation route"
].freeze

PIPELINE_R2_NON_COMPLETED_NEXT_STEPS = PIPELINE_R2_RESULT_NEXT_STEPS - ["Shared Documentation Governance Tail"]

def extract_section(text, heading)
  lines = text.to_s.lines
  start = lines.index { |line| line.strip == heading }
  return "" unless start

  section = []
  ((start + 1)...lines.length).each do |i|
    line = lines[i]
    break if line.match?(/^##+\s+\S/) || line.strip == "```"
    section << line
  end
  section.join
end

def extract_yaml_metadata_fence(text)
  text.to_s[/```yaml\n(.*?)\n```/m, 1].to_s
end

def pipeline_r2_active_conditionality_diagnostics(scope)
  diags = []
  skill = scope["skills/sdlc-speckit-pipeline/SKILL.md"].to_s
  contract = scope["skill-contracts/known-skills/sdlc-speckit-pipeline.md"].to_s
  stage = scope["skills/sdlc-speckit-pipeline/references/stage-sequence.md"].to_s
  side = scope["skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md"].to_s
  output = scope["skills/sdlc-speckit-pipeline/references/output-and-manifest.md"].to_s

  PIPELINE_R2_GLOBAL_FORBIDDEN_ACTIVE_WORDING.each do |phrase|
    [skill, contract, stage, side, output].each_with_index do |text, idx|
      next unless text.include?(phrase)
      diags << "pipeline-boundary-r2: #{PIPELINE_R2_ACTIVE_PATHS[idx]} keeps unconditional active wording #{phrase.inspect}"
    end
  end

  # F-003: SKILL Core Rules Tail in_progress must be conditional on COMPLETED.
  core_rules = extract_section(skill, "## Core Rules")
  if core_rules.match?(PIPELINE_R2_ONLY_RECOMMENDS_TAIL_STATUS)
    diags << "pipeline-boundary-r2: SKILL Core Rules keep unconditional \"the Pipeline only recommends Tail status in_progress\" wording"
  end
  core_rules.lines.each_with_index do |line, index|
    next unless line.include?("Tail status") && line.include?("in_progress")
    next if line.include?("`COMPLETED`")
    diags << "pipeline-boundary-r2: SKILL Core Rules line #{index + 1} recommends Tail in_progress without a COMPLETED condition: #{line.strip}"
  end

  # F-003: SKILL Output Pipeline Result must not list the Handoff as a
  # mandatory generic output.
  step_six = extract_section(skill, "### 6. Output Pipeline Result")
  step_six.lines.each_with_index do |line, index|
    next unless line.include?("Shared Tail Handoff")
    next if line.include?("`COMPLETED`") || line.include?("conditional")
    diags << "pipeline-boundary-r2: SKILL Output Pipeline Result line #{index + 1} lists the Shared Tail Handoff as unconditional output: #{line.strip}"
  end

  # F-004: Contract metadata output_artifacts / side_effects Handoff must be
  # conditional on COMPLETED.
  contract_meta_text = extract_yaml_metadata_fence(contract)
  contract_meta_text.lines.each_with_index do |line, index|
    next unless line.include?("Shared Tail Handoff")
    next if line.include?("`COMPLETED`") || line.include?("conditional")
    diags << "pipeline-boundary-r2: contract metadata line #{index + 1} lists Shared Tail Handoff without a COMPLETED condition: #{line.strip}"
  end

  # F-004: Contract Responsibilities Handoff responsibility must be conditional
  # on COMPLETED.
  responsibilities = extract_section(contract, "## Responsibilities")
  if responsibilities.include?("在 Implement 完成后输出 Shared Tail Handoff")
    diags << "pipeline-boundary-r2: contract Responsibilities keep unconditional \"在 Implement 完成后输出 Shared Tail Handoff\" responsibility"
  end
  responsibilities.lines.each_with_index do |line, index|
    next unless line.include?("Shared Tail Handoff")
    next if line.include?("`COMPLETED`")
    diags << "pipeline-boundary-r2: contract Responsibilities line #{index + 1} mentions Shared Tail Handoff without a COMPLETED condition: #{line.strip}"
  end

  # F-004: Contract Flow Contract Handoff must be conditional on COMPLETED.
  flow = extract_section(contract, "## Flow Contract")
  flow.lines.each_with_index do |line, index|
    next unless line.include?("Shared Tail Handoff")
    next if line.include?("`COMPLETED`")
    diags << "pipeline-boundary-r2: contract Flow Contract line #{index + 1} mentions Shared Tail Handoff without a COMPLETED condition: #{line.strip}"
  end

  # F-004: Contract Output Contract must not make the Handoff mandatory.
  output_contract = extract_section(contract, "## Output Contract")
  output_contract.lines.each_with_index do |line, index|
    next unless line.include?("Shared Tail Handoff")
    next if line.include?("`COMPLETED`") || line.include?("仅当")
    diags << "pipeline-boundary-r2: contract Output Contract line #{index + 1} lists Shared Tail Handoff as unconditional output: #{line.strip}"
  end

  # F-004: Contract Blocking Conditions must not mask Core blockers via the
  # Handoff.
  blocking = extract_section(contract, "## Blocking Conditions")
  unless blocking.include?("`COMPLETED` 时才能进入 Shared Tail Handoff")
    diags << "pipeline-boundary-r2: contract Blocking Conditions must allow Tail blockers into the Handoff only when Core is COMPLETED"
  end
  unless blocking.include?("不得生成 Handoff")
    diags << "pipeline-boundary-r2: contract Blocking Conditions must forbid a Handoff when a Core blocker makes the result non-COMPLETED"
  end

  # F-004: Contract Gate Requirements Handoff must be conditional on COMPLETED.
  gate_reqs = extract_section(contract, "## Gate Requirements")
  gate_reqs.lines.each_with_index do |line, index|
    next unless line.include?("Shared Tail Handoff")
    next if line.include?("`COMPLETED`")
    diags << "pipeline-boundary-r2: contract Gate Requirements line #{index + 1} mentions Shared Tail Handoff without a COMPLETED condition: #{line.strip}"
  end

  # F-005: Stage Sequence Handoff Boundary must require the four success gates.
  boundary = extract_section(stage, "## Shared Tail Handoff Boundary")
  PIPELINE_R2_STAGE_FOUR_GATES.each do |needle|
    unless boundary.include?(needle)
      diags << "pipeline-boundary-r2: stage-sequence Shared Tail Handoff Boundary missing success gate #{needle.inspect}"
    end
  end
  unless boundary.include?("Core Stop And Route")
    diags << "pipeline-boundary-r2: stage-sequence Shared Tail Handoff Boundary must route non-COMPLETED results to Core Stop And Route"
  end
  unless boundary.include?("only Tail entry eligible result")
    diags << "pipeline-boundary-r2: stage-sequence Shared Tail Handoff Boundary must state COMPLETED is the only Tail entry eligible result"
  end

  # F-006: Manifest Side Effects Tail recommendation must be conditional on
  # COMPLETED.
  manifest_effects = extract_section(side, "## Manifest Side Effects")
  if manifest_effects.match?(PIPELINE_R2_MAY_ONLY_RECOMMEND_TAIL_STATUS)
    diags << "pipeline-boundary-r2: Manifest Side Effects keep unconditional \"The Pipeline may only recommend Tail status=in_progress\" wording"
  end
  manifest_effects.lines.each_with_index do |line, index|
    next unless line.include?("in_progress")
    next if line.include?("`COMPLETED`")
    diags << "pipeline-boundary-r2: Manifest Side Effects line #{index + 1} mentions Tail in_progress without a COMPLETED condition: #{line.strip}"
  end

  # F-006: Blocking Or Deferred Items must not claim blockers always ride into
  # the Handoff and must not carry Tail blockers before Core COMPLETED.
  blocking_items = extract_section(output, "## Blocking Or Deferred Items")
  if blocking_items.match?(PIPELINE_R2_BLOCKERS_RIDE_INTO_HANDOFF)
    diags << "pipeline-boundary-r2: Blocking Or Deferred Items claims blockers always ride into the Shared Tail Handoff"
  end
  unless blocking_items.include?("only when Core is `COMPLETED`")
    diags << "pipeline-boundary-r2: Blocking Or Deferred Items must allow Tail blockers into the Handoff only when Core is COMPLETED"
  end
  unless blocking_items.include?("never produces a Handoff")
    diags << "pipeline-boundary-r2: Blocking Or Deferred Items must state a Core blocker that makes the result non-COMPLETED never produces a Handoff"
  end

  # F-006: The Shared Tail Handoff section must remain a conditional section,
  # never a mandatory generic output.
  handoff_section = extract_section(output, "## Shared Tail Handoff")
  unless handoff_section.include?("conditional section")
    diags << "pipeline-boundary-r2: Shared Tail Handoff section must be described as a conditional section"
  end

  diags
end

def pipeline_r2_manifest_next_step_diagnostics(scope)
  diags = []
  output = scope["skills/sdlc-speckit-pipeline/references/output-and-manifest.md"].to_s
  side = scope["skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md"].to_s

  # F-006: generic Manifest Update Recommendation must be result-specific and
  # must never be fixed to the Shared Tail.
  manifest_recommendation = extract_section(output, "## Manifest Update Recommendation")
  if manifest_recommendation.lines.any? { |line| line.strip.match?(PIPELINE_R2_GENERIC_NEXT_STEP_FIXED) }
    diags << "pipeline-boundary-r2: generic Manifest Update Recommendation must not fix Next Step to Shared Documentation Governance Tail"
  end
  unless manifest_recommendation.include?("result-specific")
    diags << "pipeline-boundary-r2: generic Manifest Update Recommendation must be result-specific"
  end
  unless manifest_recommendation.include?("Result And Tail Entry Eligibility Matrix")
    diags << "pipeline-boundary-r2: generic Manifest Update Recommendation must reference the Result And Tail Entry Eligibility Matrix"
  end

  # F-006: the non-COMPLETED next-step mapping must be complete.
  PIPELINE_R2_NON_COMPLETED_NEXT_STEPS.each do |needle|
    unless manifest_recommendation.include?(needle)
      diags << "pipeline-boundary-r2: generic Manifest Update Recommendation missing non-COMPLETED next step #{needle.inspect}"
    end
  end

  # F-006: Manifest Side Effects must carry the full result-specific Manifest
  # Next Step mapping.
  manifest_effects = extract_section(side, "## Manifest Side Effects")
  PIPELINE_R2_RESULT_NEXT_STEPS.each do |needle|
    unless manifest_effects.include?(needle)
      diags << "pipeline-boundary-r2: Manifest Side Effects missing result-specific Manifest Next Step #{needle.inspect}"
    end
  end

  diags
end

# R2 negative self-tests: every mutation must be rejected by the real
# assertion functions with the expected diagnostic. Mutations operate on
# in-memory deep copies; unknown exceptions or unrelated errors never count as
# rejection.
PIPELINE_R2_SELFTESTS = [
  {
    id: "skill_unconditional_tail_in_progress",
    desc: "SKILL Core Rule restored to unconditional Tail in_progress",
    scope_file: "skills/sdlc-speckit-pipeline/SKILL.md",
    mutate: ->(text) { text.sub("The Pipeline recommends Tail status `in_progress` only when Pipeline Result=`COMPLETED` and Core Completion=true", "The Pipeline only recommends Tail status `in_progress`") },
    run: ->(scope) { pipeline_r2_active_conditionality_diagnostics(scope) },
    expect: "SKILL Core Rules keep unconditional"
  },
  {
    id: "side_effect_unconditional_tail_in_progress",
    desc: "Manifest Side Effects restored to unconditional in_progress",
    scope_file: "skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md",
    mutate: ->(text) { text.sub(/Only Pipeline Result=`COMPLETED` \(Core Completion=true\) may recommend Tail\s+status=`in_progress`/, "The Pipeline may only recommend Tail status=`in_progress`") },
    run: ->(scope) { pipeline_r2_active_conditionality_diagnostics(scope) },
    expect: "Manifest Side Effects keep unconditional"
  },
  {
    id: "stage_sequence_unconditional_handoff",
    desc: "Stage Sequence restored to unconditional After-Implement Handoff",
    scope_file: "skills/sdlc-speckit-pipeline/references/stage-sequence.md",
    mutate: ->(text) { text.sub("A Shared Tail Handoff is produced only when all four success conditions hold:", "After Implement, the Pipeline produces a Shared Tail Handoff:") },
    run: ->(scope) { pipeline_r2_active_conditionality_diagnostics(scope) },
    expect: "After Implement, the Pipeline produces a Shared Tail Handoff"
  },
  {
    id: "contract_unconditional_handoff",
    desc: "Contract responsibility restored to unconditional Handoff",
    scope_file: "skill-contracts/known-skills/sdlc-speckit-pipeline.md",
    mutate: ->(text) { text.sub("只有 Pipeline Result=`COMPLETED`、Core Completion=true、Implement 完成且无 Core blocking item 时输出 Shared Tail Handoff", "在 Implement 完成后输出 Shared Tail Handoff") },
    run: ->(scope) { pipeline_r2_active_conditionality_diagnostics(scope) },
    expect: "contract Responsibilities keep unconditional"
  },
  {
    id: "generic_manifest_next_step_shared_tail",
    desc: "generic Manifest Update Recommendation fixed to Shared Tail",
    scope_file: "skills/sdlc-speckit-pipeline/references/output-and-manifest.md",
    mutate: ->(text) { text.sub(/^- Next Step: result-specific next step from the Result And Tail Entry Eligibility Matrix.*$/, "- Next Step: Shared Documentation Governance Tail") },
    run: ->(scope) { pipeline_r2_manifest_next_step_diagnostics(scope) },
    expect: "must not fix Next Step to Shared Documentation Governance Tail"
  },
  {
    id: "blocking_items_always_carried_to_handoff",
    desc: "all blockers claimed to ride into the Handoff",
    scope_file: "skills/sdlc-speckit-pipeline/references/output-and-manifest.md",
    mutate: ->(text) { text.sub(/may be carried into the Shared Tail Handoff only when Core is\s+`COMPLETED`/, "are always carried into the Shared Tail Handoff") },
    run: ->(scope) { pipeline_r2_active_conditionality_diagnostics(scope) },
    expect: "always ride into the Shared Tail Handoff"
  }
].freeze

def pipeline_r2_self_test_diagnostics(scope)
  diags = []
  PIPELINE_R2_SELFTESTS.each do |test|
    text = scope[test[:scope_file]]
    if text.nil?
      diags << "pipeline-boundary-r2: self-test #{test[:id]} cannot run: missing scope file #{test[:scope_file]}"
      next
    end
    begin
      mutated_scope = scope.dup
      mutated_scope[test[:scope_file]] = test[:mutate].call(text.dup)
      produced = test[:run].call(mutated_scope)
      unless produced.any? { |d| d.include?(test[:expect]) }
        diags << "pipeline-boundary-r2: self-test #{test[:id]} (#{test[:desc]}) must be rejected with a diagnostic containing #{test[:expect].inspect}; produced #{produced.inspect}"
      end
    rescue StandardError => e
      diags << "pipeline-boundary-r2: self-test #{test[:id]} (#{test[:desc]}) raised unexpected error #{e.class}: #{e.message}; unexpected exceptions do not count as successful rejection"
    end
  end
  diags
end

pipeline_r2_scope = {}
PIPELINE_R2_ACTIVE_PATHS.each do |rel|
  path = File.join(ROOT, rel)
  if File.file?(path)
    pipeline_r2_scope[rel] = File.read(path)
  else
    errors << "pipeline-boundary-r2: missing scope file #{rel}"
  end
end

r2_active_diags = []
r2_next_step_diags = []
r2_selftest_diags = []

if PIPELINE_R2_ACTIVE_PATHS.all? { |rel| File.file?(File.join(ROOT, rel)) }
  r2_active_diags = pipeline_r2_active_conditionality_diagnostics(pipeline_r2_scope)
  r2_next_step_diags = pipeline_r2_manifest_next_step_diagnostics(pipeline_r2_scope)
  r2_selftest_diags = pipeline_r2_self_test_diagnostics(pipeline_r2_scope)
end

errors.concat(r2_active_diags)
errors.concat(r2_next_step_diags)
errors.concat(r2_selftest_diags)

# ── Pipeline Contract Side Effect Conditionality (Topic 07-E R3) ──
# Static assertions for the R3 correction: the prose `## Side Effects` section
# of the Pipeline Contract must itself be conditional. Other sections of the
# same file being conditional (metadata, Responsibilities, Flow, Output,
# Blocking, Gate) never excuses an unconditional Handoff bullet in this
# section. Checks are section-scoped via extract_section; the bare presence of
# `COMPLETED` elsewhere in the contract is not evidence for this section.
# Read-only, deterministic, no network. The negative self-test uses an
# in-memory string deep copy, verifies the mutation actually changed the text,
# and never counts unknown exceptions or unrelated errors as rejection.

PIPELINE_R3_CONTRACT_PATH = "skill-contracts/known-skills/sdlc-speckit-pipeline.md".freeze
PIPELINE_R3_HANDOFF_AMBIGUOUS_PATTERN = /when\s+applicable/i.freeze
PIPELINE_R3_BLOCKERS_CARRIED_PATTERN = /
  (?:carried|携带).{0,60}Shared\s+Tail\s+Handoff|
  Shared\s+Tail\s+Handoff.{0,60}(?:carried|携带)
/ix.freeze

def pipeline_r3_side_effect_diagnostics(scope)
  diags = []
  contract = scope[PIPELINE_R3_CONTRACT_PATH].to_s
  contract_side_effects = extract_section(contract, "## Side Effects")
  if contract_side_effects.empty?
    diags << "pipeline-boundary-r3: contract ## Side Effects section is missing"
    return diags
  end

  handoff_lines = contract_side_effects.lines.select { |line| line.include?("Shared Tail Handoff") }
  if handoff_lines.empty?
    diags << "pipeline-boundary-r3: contract ## Side Effects Handoff bullet is missing"
    return diags
  end

  handoff_lines.each do |line|
    next if line.include?("`COMPLETED`")
    diags << "pipeline-boundary-r3: contract ## Side Effects Handoff bullet is unconditional (missing COMPLETED condition): #{line.strip}"
  end

  unless contract_side_effects.include?("Core Completion=true")
    diags << "pipeline-boundary-r3: contract ## Side Effects must include the Core Completion=true success condition"
  end
  unless contract_side_effects.include?("Implement 完成")
    diags << "pipeline-boundary-r3: contract ## Side Effects must include the Implement completed success condition"
  end
  unless contract_side_effects.include?("无 Core blocking item")
    diags << "pipeline-boundary-r3: contract ## Side Effects must include the no Core blocking item success condition"
  end
  unless contract_side_effects.include?("非 `COMPLETED`")
    diags << "pipeline-boundary-r3: contract ## Side Effects must include the non-COMPLETED Core Stop route"
  end
  unless contract_side_effects.include?("Core Stop And Route")
    diags << "pipeline-boundary-r3: contract ## Side Effects must route non-COMPLETED results to Core Stop And Route"
  end
  if contract_side_effects.match?(PIPELINE_R3_HANDOFF_AMBIGUOUS_PATTERN)
    diags << "pipeline-boundary-r3: contract ## Side Effects uses ambiguous \"when applicable\" Handoff conditionality"
  end
  if contract_side_effects.match?(PIPELINE_R3_BLOCKERS_CARRIED_PATTERN)
    diags << "pipeline-boundary-r3: contract ## Side Effects carries blockers into the Shared Tail Handoff"
  end
  diags
end

# R3 negative self-test: the mutation must actually change the section text.
# Only the `## Side Effects` Handoff bullet is replaced; Responsibilities,
# metadata, and every other section stay untouched. The self-test must be
# rejected by the real R3 diagnostic function with a diagnostic bound to the
# Contract prose Side Effects / unconditional Handoff / missing COMPLETED
# condition; empty diagnostics, nil, unrelated diagnostics, unknown exceptions,
# or parser exceptions never count as successful rejection.
PIPELINE_R3_SELFTESTS = [
  {
    id: "contract_side_effect_unconditional_handoff",
    desc: "Contract ## Side Effects Handoff bullet restored to the unconditional old bullet",
    scope_file: PIPELINE_R3_CONTRACT_PATH,
    mutate: ->(text) {
      text.sub(
        /^- 仅当 Pipeline Result=`COMPLETED`、Core Completion=true、Implement 完成且无 Core blocking item 时输出 Shared Tail Handoff.*$/,
        "- 输出 Shared Tail Handoff（含既有 Sync/Reconcile candidate evidence pointers）。"
      )
    },
    run: ->(scope) { pipeline_r3_side_effect_diagnostics(scope) },
    expect: "Handoff bullet is unconditional"
  }
].freeze

def pipeline_r3_self_test_diagnostics(scope)
  diags = []
  PIPELINE_R3_SELFTESTS.each do |test|
    text = scope[test[:scope_file]]
    if text.nil?
      diags << "pipeline-boundary-r3: self-test #{test[:id]} cannot run: missing scope file #{test[:scope_file]}"
      next
    end
    begin
      mutated_text = test[:mutate].call(text.dup)
      if mutated_text == text
        diags << "pipeline-boundary-r3: self-test #{test[:id]} (#{test[:desc]}) mutation did not change the text; baseline text must not be treated as mutation output"
        next
      end
      mutated_scope = scope.dup
      mutated_scope[test[:scope_file]] = mutated_text
      produced = test[:run].call(mutated_scope)
      unless produced.any? { |d| d.include?(test[:expect]) }
        diags << "pipeline-boundary-r3: self-test #{test[:id]} (#{test[:desc]}) must be rejected with a diagnostic containing #{test[:expect].inspect}; produced #{produced.inspect}"
      end
    rescue StandardError => e
      diags << "pipeline-boundary-r3: self-test #{test[:id]} (#{test[:desc]}) raised unexpected error #{e.class}: #{e.message}; unexpected exceptions do not count as successful rejection"
    end
  end
  diags
end

pipeline_r3_scope = {}
pipeline_r3_contract_file = File.join(ROOT, PIPELINE_R3_CONTRACT_PATH)
if File.file?(pipeline_r3_contract_file)
  pipeline_r3_scope[PIPELINE_R3_CONTRACT_PATH] = File.read(pipeline_r3_contract_file)
else
  errors << "pipeline-boundary-r3: missing scope file #{PIPELINE_R3_CONTRACT_PATH}"
end

r3_side_effect_diags = []
r3_selftest_diags = []
if File.file?(pipeline_r3_contract_file)
  r3_side_effect_diags = pipeline_r3_side_effect_diagnostics(pipeline_r3_scope)
  r3_selftest_diags = pipeline_r3_self_test_diagnostics(pipeline_r3_scope)
end

errors.concat(r3_side_effect_diags)
errors.concat(r3_selftest_diags)

# ── Topic 07 Formal Closure Aggregate Validation (TOPIC-07-FORMAL-CLOSURE) ──
# Aggregate, fail-closed validator for the Topic 07 formal closure state. It
# reads ai-sdlc/development-path-governance.md and docs/VALIDATION.md, parses
# the current integration status matrix rows, checks the dedicated closure
# section, and verifies D09 stays unimplemented. The scenario harness, the
# Pipeline validator, and the Gate Runner runtime each individually cannot
# establish the closure; only this aggregate validator can. Negative
# self-tests use in-memory string deep copies and never modify repository
# files; unknown exceptions or unrelated errors never count as successful
# rejection.

TOPIC07_CLOSURE_DEVPATH = "ai-sdlc/development-path-governance.md".freeze
TOPIC07_CLOSURE_VALIDATION_DOC = "docs/VALIDATION.md".freeze
TOPIC07_CLOSURE_SECTION_HEADING = "### Topic 07 Formal Closure".freeze
TOPIC07_CLOSURE_VALIDATION_HEADING = "## Topic 07 Formal Closure Validation".freeze

TOPIC07_CLOSURE_PREREQUISITE_ROWS = [
  "| Gate Runner Development Path Entry enforcement | implemented |",
  "| Gate Runner Tail Completion enforcement | implemented |",
  "| Speckit Pipeline boundary alignment | implemented |",
  "| Direct / Speckit / Tail 完整场景验证 | implemented |"
].freeze

TOPIC07_CLOSURE_PREREQUISITE_PENDING_ROWS = [
  "| Gate Runner Development Path Entry enforcement | pending |",
  "| Gate Runner Tail Completion enforcement | pending |",
  "| Speckit Pipeline boundary alignment | pending |",
  "| Direct / Speckit / Tail 完整场景验证 | pending |"
].freeze

TOPIC07_CLOSURE_ROW_IMPLEMENTED = "| Topic 07 formal closure | implemented |".freeze
TOPIC07_CLOSURE_ROW_PENDING = "| Topic 07 formal closure | pending |".freeze
TOPIC07_CLOSURE_ROW_PATTERN = /^\|\s*Topic 07 formal closure\s*\|/.freeze
TOPIC07_CLOSURE_ROW_PARSE = /
  ^\|\s*Topic\s+07\s+formal\s+closure\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|
/x.freeze
TOPIC07_CLOSURE_D09_IMPLEMENTED_PATTERN = /^\|\s*D09[^|]*\|\s*implemented\s*\|/.freeze

# Section-scoped boundary needles: the bare presence of a keyword elsewhere in
# the file never satisfies a section boundary requirement.
TOPIC07_CLOSURE_SECTION_REQUIRED = {
  "closure status implemented" => "implemented",
  "Gate Runner Entry basis" => "Gate Runner Development Path Entry enforcement",
  "Gate Runner Tail Completion basis" => "Gate Runner Tail Completion enforcement",
  "scenario validation basis" => "scenario conformance",
  "Pipeline boundary basis" => "Speckit Pipeline boundary alignment",
  "scenario authority validation-only" => "validation-only",
  "Manifest authority" => "Manifest 仍是",
  "Pipeline result boundary" => "Pipeline result 仍不能替代 Tail Completion Gate",
  "D09 not implemented" => "D09 尚未实施",
  "no runtime execution fact" => "不代表真实 target-project runtime 执行",
  "no requirement completion fact" => "不代表真实 requirement Tail completed"
}.freeze

TOPIC07_CLOSURE_SECTION_FORBIDDEN_ESCALATION = [
  "runtime_authority=true",
  "gate_decision_authority=true",
  "implementation_authority=true",
  "merge_authority=true",
  "publication_authority=true",
  "scenario harness 获得 runtime authority"
].freeze

TOPIC07_CLOSURE_VALIDATION_DOC_FORBIDDEN_PENDING = "Topic 07 formal closure 仍 pending".freeze

def topic07_closure_diagnostics(scope)
  diags = []
  devpath = scope[TOPIC07_CLOSURE_DEVPATH]
  validation_doc = scope[TOPIC07_CLOSURE_VALIDATION_DOC]

  if devpath.nil?
    diags << "topic07-formal-closure: development-path-governance.md missing"
  end
  if validation_doc.nil?
    diags << "topic07-formal-closure: docs/VALIDATION.md missing"
  end
  return diags if devpath.nil?

  unless devpath.include?("状态矩阵") && devpath.include?("| 接入项 | 状态 | 说明 |")
    diags << "topic07-formal-closure: status matrix missing"
  end

  TOPIC07_CLOSURE_PREREQUISITE_ROWS.each do |row|
    count = devpath.scan(Regexp.new(Regexp.escape(row))).size
    if count.zero?
      diags << "topic07-formal-closure: prerequisite row missing: #{row}"
    elsif count > 1
      diags << "topic07-formal-closure: prerequisite row duplicate: #{row}"
    end
  end
  TOPIC07_CLOSURE_PREREQUISITE_PENDING_ROWS.each do |row|
    if devpath.include?(row)
      diags << "topic07-formal-closure: prerequisite row not implemented: #{row}"
    end
  end

  closure_count = devpath.scan(Regexp.new(Regexp.escape(TOPIC07_CLOSURE_ROW_IMPLEMENTED))).size
  if closure_count.zero?
    diags << "topic07-formal-closure: closure row missing"
  elsif closure_count > 1
    diags << "topic07-formal-closure: closure row duplicate"
  end
  if devpath.include?(TOPIC07_CLOSURE_ROW_PENDING)
    diags << "topic07-formal-closure: closure row not implemented"
  end
  devpath.lines.select { |line| line.match?(TOPIC07_CLOSURE_ROW_PATTERN) }.each do |line|
    match = line.match(TOPIC07_CLOSURE_ROW_PARSE)
    next unless match

    status = match[1].to_s.strip
    explanation = match[2].to_s.strip
    unless status == "implemented"
      diags << "topic07-formal-closure: closure row not implemented (status=#{status})"
    end
    if status == "implemented" && explanation.empty?
      diags << "topic07-formal-closure: closure row explanation empty"
    end
  end

  if devpath.match?(TOPIC07_CLOSURE_D09_IMPLEMENTED_PATTERN)
    diags << "topic07-formal-closure: D09 marked implemented"
  end

  heading_count = devpath.scan(TOPIC07_CLOSURE_SECTION_HEADING).size
  if heading_count.zero?
    diags << "topic07-formal-closure: closure dedicated section missing"
  elsif heading_count > 1
    diags << "topic07-formal-closure: closure dedicated section duplicate"
  else
    section = extract_section(devpath, TOPIC07_CLOSURE_SECTION_HEADING)
    TOPIC07_CLOSURE_SECTION_REQUIRED.each do |label, needle|
      unless section.include?(needle)
        diags << "topic07-formal-closure: closure section required boundary missing: #{label}"
      end
    end
    TOPIC07_CLOSURE_SECTION_FORBIDDEN_ESCALATION.each do |phrase|
      if section.include?(phrase)
        diags << "topic07-formal-closure: closure section scenario authority escalated: #{phrase}"
      end
    end
  end

  unless validation_doc.to_s.include?(TOPIC07_CLOSURE_VALIDATION_HEADING)
    diags << "topic07-formal-closure: Validation doc closure section missing"
  end
  if validation_doc.to_s.include?(TOPIC07_CLOSURE_VALIDATION_DOC_FORBIDDEN_PENDING)
    diags << "topic07-formal-closure: Validation doc keeps stale pending closure wording"
  end

  diags
end

# Negative self-tests: every mutation must be rejected by the real closure
# diagnostics with the expected diagnostic. Mutations operate on in-memory
# deep copies; the mutation must actually change the text; unknown exceptions
# or unrelated errors never count as rejection.
TOPIC07_CLOSURE_SELFTESTS = [
  {
    id: "closure_row_reverted_to_pending",
    desc: "closure row reverted to pending",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text.sub(TOPIC07_CLOSURE_ROW_IMPLEMENTED, TOPIC07_CLOSURE_ROW_PENDING) },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "closure row not implemented"
  },
  {
    id: "entry_enforcement_reverted_to_pending",
    desc: "Gate Runner Entry enforcement reverted to pending",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text.sub("| Gate Runner Development Path Entry enforcement | implemented |", "| Gate Runner Development Path Entry enforcement | pending |") },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "prerequisite row not implemented"
  },
  {
    id: "tail_enforcement_reverted_to_pending",
    desc: "Gate Runner Tail Completion enforcement reverted to pending",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text.sub("| Gate Runner Tail Completion enforcement | implemented |", "| Gate Runner Tail Completion enforcement | pending |") },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "prerequisite row not implemented"
  },
  {
    id: "scenario_validation_reverted_to_pending",
    desc: "Direct / Speckit / Tail scenario validation reverted to pending",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text.sub("| Direct / Speckit / Tail 完整场景验证 | implemented |", "| Direct / Speckit / Tail 完整场景验证 | pending |") },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "prerequisite row not implemented"
  },
  {
    id: "pipeline_boundary_reverted_to_pending",
    desc: "Speckit Pipeline boundary alignment reverted to pending",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text.sub("| Speckit Pipeline boundary alignment | implemented |", "| Speckit Pipeline boundary alignment | pending |") },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "prerequisite row not implemented"
  },
  {
    id: "d09_marked_implemented",
    desc: "D09 marked implemented",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text + "\n| D09 | implemented | D09 已实施 |\n" },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "D09 marked implemented"
  },
  {
    id: "closure_section_removed",
    desc: "dedicated Topic 07 Formal Closure section removed",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text.sub(TOPIC07_CLOSURE_SECTION_HEADING, "") },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "closure dedicated section missing"
  },
  {
    id: "closure_row_duplicated",
    desc: "second closure row added",
    scope_file: TOPIC07_CLOSURE_DEVPATH,
    mutate: ->(text) { text + "\n| Topic 07 formal closure | implemented | duplicate closure row |\n" },
    run: ->(scope) { topic07_closure_diagnostics(scope) },
    expect: "closure row duplicate"
  }
].freeze

def topic07_closure_self_test_diagnostics(scope)
  diags = []
  TOPIC07_CLOSURE_SELFTESTS.each do |test|
    text = scope[test[:scope_file]]
    if text.nil?
      diags << "topic07-formal-closure: self-test #{test[:id]} cannot run: missing scope file #{test[:scope_file]}"
      next
    end
    begin
      mutated_text = test[:mutate].call(text.dup)
      if mutated_text == text
        diags << "topic07-formal-closure: self-test #{test[:id]} (#{test[:desc]}) mutation did not change the text; baseline text must not be treated as mutation output"
        next
      end
      mutated_scope = scope.dup
      mutated_scope[test[:scope_file]] = mutated_text
      produced = test[:run].call(mutated_scope)
      unless produced.any? { |d| d.include?(test[:expect]) }
        diags << "topic07-formal-closure: self-test #{test[:id]} (#{test[:desc]}) must be rejected with a diagnostic containing #{test[:expect].inspect}; produced #{produced.inspect}"
      end
    rescue StandardError => e
      diags << "topic07-formal-closure: self-test #{test[:id]} (#{test[:desc]}) raised unexpected error #{e.class}: #{e.message}; unexpected exceptions do not count as successful rejection"
    end
  end
  diags
end

topic07_closure_scope = {}
[TOPIC07_CLOSURE_DEVPATH, TOPIC07_CLOSURE_VALIDATION_DOC].each do |rel|
  path = File.join(ROOT, rel)
  topic07_closure_scope[rel] = File.read(path) if File.file?(path)
end

topic07_closure_baseline_diags = topic07_closure_diagnostics(topic07_closure_scope)
topic07_closure_selftest_diags = []
if topic07_closure_scope.key?(TOPIC07_CLOSURE_DEVPATH)
  topic07_closure_selftest_diags = topic07_closure_self_test_diagnostics(topic07_closure_scope)
end

errors.concat(topic07_closure_baseline_diags)
errors.concat(topic07_closure_selftest_diags)

# ── GRP-01 Goal-Anchored Global Reasoning Contract Validation ──
# Read-only, deterministic, no network. Locks the five shared bindings
# (Specification Writer, Solution Challenger, Solution Reviewer, Speckit
# Analyze, Code Review Excellence) against the single shared reference and
# the obvious ordering / impact / consolidation / non-fail-fast / bounded /
# minimum-sufficient regressions. It does not attempt to prove model
# intelligence; it only locks document contract terms.

GRP01_SHARED_REFERENCE = "ai-sdlc/goal-anchored-global-reasoning.md"

GRP01_SHARED_TERMS = %w[
  anchor global-first impact\ closure root-cause bounded fail-worthy fail-fast
].freeze

# Every binding file must carry its exact goal-anchored terms; missing terms
# are contract regressions (ordering, impact closure, consolidation,
# non-fail-fast, bounded continuation, minimum-sufficient preservation).
GRP01_BINDINGS = {
  "skills/sdlc-specification-writer/SKILL.md" => %w[global\ model whole-model\ impact\ self-check],
  "skills/sdlc-specification-writer/references/writing-workflow.md" => %w[global\ model whole-model\ impact],
  "skill-contracts/known-skills/sdlc-specification-writer.md" => %w[goal-anchored-global-reasoning whole-model\ impact\ self-check],
  "skills/sdlc-solution-challenger/SKILL.md" => %w[global-before-local direct\ impacts fail-worthy],
  "skills/sdlc-solution-challenger/references/challenge-workflow.md" => %w[global-before-local fail-worthy],
  "skill-contracts/known-skills/sdlc-solution-challenger.md" => %w[goal-anchored-global-reasoning minimum-sufficient],
  "skills/sdlc-solution-reviewer/SKILL.md" => %w[material\ scan does\ not\ end\ discovery],
  "skills/sdlc-solution-reviewer/references/review-workflow.md" => %w[current-goal\ global/material\ scan does\ not\ end\ discovery],
  "skill-contracts/known-skills/sdlc-solution-reviewer.md" => %w[goal-anchored-global-reasoning FAIL\ eligibility],
  "skills/sdlc-speckit-analyze/SKILL.md" => %w[material\ blockers hard-stop],
  "skills/sdlc-speckit-analyze/references/analyze-inputs.md" => %w[material\ blocker],
  "skills/sdlc-speckit-analyze/references/consistency-scope.md" => %w[bounded\ continuation hard-stop],
  "skill-contracts/known-skills/sdlc-speckit-analyze.md" => %w[goal-anchored-global-reasoning material\ blockers],
  "skills/sdlc-code-review-excellence/SKILL.md" => %w[direct\ impacts root\ cause],
  "skills/sdlc-code-review-excellence/references/review-workflow.md" => %w[impact\ closure root\ cause],
  "skill-contracts/known-skills/sdlc-code-review-excellence.md" => %w[goal-anchored-global-reasoning root\ cause]
}.freeze

def grp01_diagnostics(scope)
  diags = []
  shared = scope[GRP01_SHARED_REFERENCE]
  if shared.nil?
    diags << "GRP-01: shared reference missing #{GRP01_SHARED_REFERENCE}"
  else
    GRP01_SHARED_TERMS.each do |term|
      diags << "GRP-01: shared reference missing term #{term.inspect}" unless shared.downcase.include?(term.downcase)
    end
  end
  GRP01_BINDINGS.each do |rel, terms|
    text = scope[rel]
    if text.nil?
      diags << "GRP-01: binding file missing #{rel}"
      next
    end
    terms.each do |term|
      diags << "GRP-01: #{rel} missing binding term #{term.inspect}" unless text.downcase.include?(term.downcase)
    end
  end
  diags
end

grp01_scope = {}
[GRP01_SHARED_REFERENCE, *GRP01_BINDINGS.keys].each do |rel|
  path = File.join(ROOT, rel)
  grp01_scope[rel] = File.read(path) if File.file?(path)
end

grp01_baseline_diags = grp01_diagnostics(grp01_scope)
grp01_selftest_diags = []

# Negative self-tests: deleting one exact binding term per skill must be
# rejected by the real closure (in-memory deep copies only, no file writes).
GRP01_SELFTEST_MUTATIONS = {
  "skills/sdlc-specification-writer/SKILL.md" => "whole-model impact self-check",
  "skills/sdlc-solution-challenger/SKILL.md" => "global-before-local",
  "skills/sdlc-solution-reviewer/SKILL.md" => "does not end discovery",
  "skills/sdlc-speckit-analyze/SKILL.md" => "material blockers",
  "skills/sdlc-code-review-excellence/SKILL.md" => "direct impacts"
}.freeze

GRP01_SELFTEST_MUTATIONS.each do |rel, term|
  base = grp01_scope[rel]
  if base.nil?
    grp01_selftest_diags << "GRP-01: self-test #{rel} cannot run: missing scope file"
    next
  end
  mutated = base.gsub(term, "REMOVED")
  if mutated == base
    grp01_selftest_diags << "GRP-01: self-test #{rel} mutation did not change the text; " \
                            "baseline text must not be treated as mutation output"
    next
  end
  produced = grp01_diagnostics(grp01_scope.merge(rel => mutated))
  unless produced.any? { |d| d.include?(rel) && d.include?(term) }
    grp01_selftest_diags << "GRP-01: self-test #{rel} must be rejected with a diagnostic " \
                            "containing #{term.inspect}; produced #{produced.inspect}"
  end
end

errors.concat(grp01_baseline_diags)
errors.concat(grp01_selftest_diags)


# ── GRP-01 R1/R2 regression checks ──
# R1 (GRP01-R1-ANALYZE-NON-FAIL-FAST-NOT-CLOSED): Analyze hard-stop is
# limited to unreadable/missing required source, fundamentally
# indeterminable scope, or invented-behavior requirement; readiness/Gate
# blockers (undefined behavior, unapproved Scope change, conflicting
# artifacts, unresolved Blocking items, ...) are recorded, reliably
# scanned, then FAIL/Re-Gate. Fail-fast constructs are rejected, including
# the historical Analyze Core Rule 9 contradiction.
# R2 (GRP01-R2-GLOBAL-FIRST-CONTRACT-NOT-FULLY-OPERATIONALIZED): the shared
# reference lists the frozen generic 12-surface vocabulary and permits
# NOT_APPLICABLE without creating an output schema; Solution Reviewer
# builds Goal/Scope + Global Model after source reading and before detailed
# review; Writer/Challenger local examples defer to shared surfaces and
# never narrow them.
# Production closure: grp01_r1_r2_diagnostics(scope) is the single closure
# used by both the baseline check and every negative self-test.

GRP01_R1_ANALYZE_FILES = %w[
  skills/sdlc-speckit-analyze/SKILL.md
  skills/sdlc-speckit-analyze/references/analyze-inputs.md
  skills/sdlc-speckit-analyze/references/consistency-scope.md
].freeze

# Frozen generic 12-surface vocabulary (GRP01-R2).
GRP01_R1_R2_12_SURFACES = %w[
  main_flow entry_points_or_actors inputs direct_callers_or_dependencies
  outputs_and_consumers state data_or_persistence external_effects
  failure_propagation compatibility observability acceptance_and_verification
].freeze

def grp01_r1_r2_diagnostics(scope)
  diags = []
  GRP01_R1_ANALYZE_FILES.each do |rel|
    text = scope[rel]
    if text.nil?
      diags << "GRP-01: R1 analyze file missing #{rel}"
      next
    end
    if text.include?("Continue only when")
      diags << "GRP-01: R1 #{rel} must not use the fail-fast construct 'Continue only when'"
    end
    if text.include?("Stop instead of approving implementation readiness when")
      diags << "GRP-01: R1 #{rel} must not treat readiness/Gate blockers as hard-stop"
    end
  end
  analyze_skill = scope["skills/sdlc-speckit-analyze/SKILL.md"]
  if analyze_skill
    if analyze_skill.include?("Stop when analysis reveals")
      diags << "GRP-01: R1 skills/sdlc-speckit-analyze/SKILL.md Analyze Core Rule 9 must not " \
               "hard-stop on undefined behavior / unapproved Scope change / conflicting artifacts " \
               "(reject 'Stop when analysis reveals')"
    end
    # Effective hard-stop check: capture the list body after the blank line
    # that follows the heading; readiness/Gate blockers must never appear
    # inside the hard-stop list.
    hard_stop_block = analyze_skill[/Hard-stop instead of continuing the scan when:\n\n(.*?)(?:\n\n|\z)/m, 1].to_s
    if hard_stop_block.include?("Blocking items")
      diags << "GRP-01: R1 skills/sdlc-speckit-analyze/SKILL.md hard-stop list must not include " \
               "readiness/Gate blockers (Blocking items)"
    end
  end
  shared_ref = scope[GRP01_SHARED_REFERENCE]
  if shared_ref.nil?
    diags << "GRP-01: R2 shared reference missing"
  else
    diags << "GRP-01: R2 shared reference must freeze applicable material surfaces" \
      unless shared_ref.include?("Frozen Applicable Material Surfaces")
    diags << "GRP-01: R2 shared reference must permit NOT_APPLICABLE without an output schema" \
      unless shared_ref.include?("NOT_APPLICABLE")
    GRP01_R1_R2_12_SURFACES.each do |surface|
      diags << "GRP-01: R2 #{GRP01_SHARED_REFERENCE} missing frozen surface #{surface.inspect}" \
        unless shared_ref.include?(surface)
    end
  end
  reviewer_wf = scope["skills/sdlc-solution-reviewer/references/review-workflow.md"]
  if reviewer_wf.nil?
    diags << "GRP-01: R2 reviewer workflow missing"
  else
    global_model_pos = reviewer_wf.index("Build Goal/Scope and Global Model")
    schema_pos = reviewer_wf.index("Schema Coverage")
    diags << "GRP-01: R2 skills/sdlc-solution-reviewer/references/review-workflow.md " \
             "must build Goal/Scope + Global Model after source reading" \
      if global_model_pos.nil?
    if global_model_pos && (schema_pos.nil? || global_model_pos > schema_pos)
      diags << "GRP-01: R2 skills/sdlc-solution-reviewer/references/review-workflow.md " \
               "must build Global Model before detailed review"
    end
  end
  %w[
    skills/sdlc-specification-writer/references/writing-workflow.md
    skills/sdlc-solution-challenger/references/challenge-workflow.md
  ].each do |rel|
    text = scope[rel]
    if text.nil?
      diags << "GRP-01: R2 local example file missing #{rel}"
      next
    end
    if text.include?("caller/callee or dependency, consumer, state/data")
      diags << "GRP-01: R2 #{rel} must defer to shared surfaces, " \
               "not re-list the direct-impact dimensions locally"
    end
  end
  diags
end

grp01_r1_r2_baseline_diags = grp01_r1_r2_diagnostics(grp01_scope)
errors.concat(grp01_r1_r2_baseline_diags)

# Negative self-tests: each mutated scope is run through the SAME
# production closure (grp01_r1_r2_diagnostics), never a parallel probe.
GRP01_R1_R2_SELFTEST_DIAGS = []
[
  ["skills/sdlc-speckit-analyze/SKILL.md", "R1 rule9 contradiction",
   ->(base) { base.sub("9. Record undefined behavior", "9. Stop when analysis reveals undefined behavior") },
   "Stop when analysis reveals"],  ["skills/sdlc-speckit-analyze/references/analyze-inputs.md", "R1 fail-fast",
   ->(base) { base.sub("## Readiness Checks", "## Readiness Checks\n\nContinue only when:") },
   "Continue only when"],
  ["skills/sdlc-speckit-analyze/SKILL.md", "R1 hard-stop list",
   ->(base) { base.sub("Hard-stop instead of continuing the scan when:",
                       "Hard-stop instead of continuing the scan when:\n\n- `sdlc-speckit-tasks` has unresolved Blocking items.") },
   "Blocking items"],
  ["ai-sdlc/goal-anchored-global-reasoning.md", "R2 12-surface",
   ->(base) { base.gsub("main_flow", "zzzz_removed_flow") },
   "main_flow"],
  ["skills/sdlc-solution-reviewer/references/review-workflow.md", "R2 ordering",
   lambda do |base|
     block = base[/## Step 3: Build Goal\/Scope and Global Model.*?(?=## Step 4: Schema Coverage)/m]
     block.nil? ? base : base.sub(block, "") + "\n" + block
   end,
   "Global Model"],
  ["skills/sdlc-specification-writer/references/writing-workflow.md", "R2 narrowing",
   ->(base) { base + "\ncaller/callee or dependency, consumer, state/data (local list)\n" },
   "must defer to shared surfaces"]
].each do |rel, tag, mutator, expected_diag_fragment|
  base = grp01_scope[rel]
  if base.nil?
    GRP01_R1_R2_SELFTEST_DIAGS << "GRP-01: R1/R2 self-test cannot run: missing scope file #{rel}"
    next
  end
  mutated = mutator.call(base)
  if mutated == base
    GRP01_R1_R2_SELFTEST_DIAGS << "GRP-01: R1/R2 self-test #{rel} (#{tag}) mutation did not change the text"
    next
  end
  produced = grp01_r1_r2_diagnostics(grp01_scope.merge(rel => mutated))
  unless produced.any? { |d| d.include?(rel) && d.include?(expected_diag_fragment) }
    GRP01_R1_R2_SELFTEST_DIAGS << "GRP-01: R1/R2 self-test #{rel} (#{tag}) must be rejected by the " \
                                  "production closure with a diagnostic containing " \
                                  "#{expected_diag_fragment.inspect}; produced #{produced.inspect}"
  end
end
errors.concat(GRP01_R1_R2_SELFTEST_DIAGS)

if errors.empty?
  puts "TOPIC07_FORMAL_CLOSURE_VALIDATED true" if topic07_closure_baseline_diags.empty? && topic07_closure_selftest_diags.empty?
  puts "GRP01_BINDINGS_VALIDATED true" if grp01_baseline_diags.empty? && grp01_selftest_diags.empty?
  puts "PIPELINE_BOUNDARY_BOOTSTRAP_WRITE_FAIL_CLOSED true" if r1_bootstrap_write_diags.empty?
  puts "PIPELINE_BOUNDARY_BOOTSTRAP_DRY_RUN_ONLY true" if r1_bootstrap_dry_run_diags.empty?
  puts "PIPELINE_BOUNDARY_RESULT_MATRIX_VALIDATED true" if r1_matrix_diags.empty?
  puts "PIPELINE_BOUNDARY_TAIL_ENTRY_ELIGIBILITY_FAIL_CLOSED true" if r1_tail_entry_diags.empty?
  puts "PIPELINE_BOUNDARY_SELFTESTS_PASS true" if r1_selftest_diags.empty?
  puts "PIPELINE_BOUNDARY_ACTIVE_RUNTIME_CONDITIONALITY_VERIFIED true" if r2_active_diags.empty?
  puts "PIPELINE_BOUNDARY_MANIFEST_NEXT_STEP_MATRIX_VERIFIED true" if r2_next_step_diags.empty?
  puts "PIPELINE_BOUNDARY_EQUIVALENT_SEMANTIC_SELFTESTS_PASS true" if r2_selftest_diags.empty?
  puts "PIPELINE_BOUNDARY_CONTRACT_SIDE_EFFECT_CONDITIONALITY_VERIFIED true" if r3_side_effect_diags.empty? && r3_selftest_diags.empty?
  puts "skill contract validation ok"
else
  warn "skill contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
