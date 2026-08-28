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

# v2 (Decision-044/045) DocFlow artifact requirements for the canonical
# artifact-manifest template and the artifact-storage standard: the seven-node
# chain (00-06) plus C03 Delivery Tail (07), with the manifest as the DocFlow
# status authority.
V2_MANIFEST_TEMPLATE_TERMS = [
  "03 任务规划",
  "04 实现记录",
  "05 代码审核",
  "06 知识同步",
  "07 交付总结",
  "不映射节点能力",
  "NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT"
].freeze

V2_ARTIFACT_STORAGE_TERMS = [
  "03-任务规划",
  "04-实现记录",
  "05-代码审核",
  "06-知识同步",
  "07-交付总结",
  "不映射节点能力",
  "是需求目录的索引和状态视图"
].freeze

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

    # C03-B R2-H1c: manifest references existence check.
    # INV4 requires zero dangling references; the validator previously only
    # checked path and contract, allowing references to drift to deleted files
    # without failing standards.
    Array(skill["references"]).each do |ref_path|
      ref = File.join(ROOT, ref_path)
      errors << "manifest skill #{key} reference missing: #{ref_path}" unless File.exist?(ref)
    end

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

{
  "templates/artifact-manifest-template.md" => V2_MANIFEST_TEMPLATE_TERMS,
  "ai-sdlc/artifact-storage.md" => V2_ARTIFACT_STORAGE_TERMS
}.each do |relative_path, required_terms|
  path = File.join(ROOT, relative_path)
  if File.exist?(path)
    text = File.read(path)
    required_terms.each do |term|
      errors << "#{relative_path} missing v2 artifact standard requirement #{term}" unless text.include?(term)
    end
  else
    errors << "missing #{relative_path}"
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
  "docs/SPECKIT_BOOTSTRAP.md" => BOOTSTRAP_PRIVATE_CONTEXT_REQUIRED_TERMS.first(2)
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
  "docs/SPECKIT_BOOTSTRAP.md" => BOOTSTRAP_PERFORMANCE_DOC_TERMS - ["Bootstrap Performance / Large Repo Scan Control"]
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

# PR I: Fixture-Based Product Parity Validator — RETIRED
# C03-B (Decision-052, INV8): validate-product-parity-fixtures.rb and
# fixtures/speckit-product-parity/ were New-Rail Enhanced Speckit Pipeline
# regression fixtures. The Speckit rail was retired in Decision-044 single-rail
# rebaseline; the referenced legacy skill files were removed in C03-B b4.
# Archive copy survives at docs/reports/archive/c02-wp3-5-single-rail-retired/.
# Active validator and fixtures removed; this block intentionally left empty.

# Rail Routing and Business-Domain Sync Source Modes (v2 rebaseline,
# Decision-044/045: agents-rail-routing / specs-run-lifecycle /
# business-domain-sync-source-modes are archived; only the surviving
# governance files are required)
RAIL_ROUTING_REQUIRED_FILES = [
  "ai-sdlc/shared-business-domain-governance.md",
  "templates/agents-rail-routing-addendum.md",
  "templates/business-domain-sync-status-template.yaml"
].freeze

RAIL_ROUTING_FILE_TERMS = {
  "ai-sdlc/shared-business-domain-governance.md" => ["shared long-term knowledge base", "existing document", "rail", "source", "Conflict Handling"],
  "templates/agents-rail-routing-addendum.md" => ["/speckit.*", "sdlc-*", "new rail", "shared long-term knowledge base", "run-level"],
  "templates/business-domain-sync-status-template.yaml" => ["business_domain_sync", "speckit_driven", "library_driven", "hybrid", "duplicate_sync_guard"],
  "docs/VALIDATION.md" => ["speckit_driven", "library_driven", "hybrid", "duplicate sync guard", "business_domain_sync", "run-level", "长期知识库", "sync source mode", "library_driven sync", "speckit_driven sync"]
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

# Final Audit Guard: manifest entrypoints (v2 rebaseline: agents-rail-routing.md,
# specs-run-metadata-and-archive.md, library-driven-sync-runtime.md, and
# library-driven-sync-decision-template.md are archived and must no longer be
# required as manifest entrypoints)
manifest_text = File.read(File.join(ROOT, "manifest.yaml"))
["ai-sdlc/business-domain-naming-and-shape.md", "ai-sdlc/business-domain-compatible-update.md",
  "ai-sdlc/project-type-contract-artifact-matrix.md",
  "templates/project-type-contract-artifact-matrix-template.yaml"].each do |e|
  errors << "manifest.yaml missing entry #{e}" unless manifest_text.include?(e)
end

# ── Tail Template Contract Validation ──
# Static per-file contract checks for the tail templates.
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
# v2 (Decision-044/045): the template is the canonical authority for the
# solution-gate formal verdict only — Design Depth Decision + Finding Ledger
# Reference. Dual-rail fields (Development Path Check, Documentation
# Governance Tail Evidence Check, Tail Completion Decision) are retired and
# must not be required; their reappearance is a regression.
gate_template = tail_template_text("templates/gate-result-template.md")
if gate_template.nil?
  errors << "tail-template: templates/gate-result-template.md must exist"
else
  [
    "Gate Name:", "Gate Type:", "Manifest Path:", "Gate Basis:",
    "Result: PASS / FAIL / PASS_WITH_RISK", "Can Continue: yes/no",
    "## Design Depth Decision", "## Finding Ledger Reference",
    "Depth: LIGHT / STANDARD / DEEP", "Decision Status: DECIDED / BLOCKED_UNKNOWN",
    "Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE", "BLOCKED_UNKNOWN",
    "adversarial_scan", "formal_verdict", "Earliest Affected Node",
    "Current / Stale:", "Finding Ledger Artifact:", "Scan Executor Binding",
    "Verdict Executor Binding", "## Re-Gate Check", "## Risk Acceptance",
    "PASS_WITH_RISK", "Reviewed Artifact:", "Reviewed Artifact Version:",
    "Gate Artifact Version:"
  ].each { |needle| tail_require(errors, gate_template, needle, "gate-result-template") }
  {
    /^## Design Depth Decision/ => 1,
    /^## Finding Ledger Reference/ => 1
  }.each do |pattern, expected_count|
    actual_count = gate_template.scan(pattern).size
    unless actual_count == expected_count
      errors << "tail-template: gate-result-template #{pattern.inspect} count must be #{expected_count} (got #{actual_count})"
    end
  end
  [
    "## Development Path Check", "## Documentation Governance Tail Evidence Check",
    "## Tail Completion Decision", "Tail Completion Eligible",
    "development_path_entry", "documentation_governance_tail_completion"
  ].each do |forbidden|
    if gate_template.include?(forbidden)
      errors << "tail-template: gate-result-template restores retired dual-rail field: #{forbidden}"
    end
  end
end

# B. Artifact Manifest Template
# v2 (Decision-044/045): the manifest is the DocFlow status authority for the
# canonical seven-node chain (00-06) plus the C03 Delivery Tail (07), with
# Design Depth Decision, v2 change-control fields, knowledge-sync decision
# values, and external evidence references. The retired Documentation
# Governance Tail section and its fields must not be required; their
# reappearance is a regression.
manifest_template = tail_template_text("templates/artifact-manifest-template.md")
if manifest_template.nil?
  errors << "tail-template: templates/artifact-manifest-template.md must exist"
else
  {
    /^## Design Depth Decision\s*$/ => 1,
    /^## Artifact Index\s*$/ => 1,
    /^## Delivery Tail/ => 1,
    /^## External Evidence References\s*$/ => 1
  }.each do |pattern, expected_count|
    actual_count = manifest_template.scan(pattern).size
    unless actual_count == expected_count
      errors << "tail-template: artifact-manifest-template #{pattern.inspect} count must be #{expected_count} (got #{actual_count})"
    end
  end
  [
    "| 00 需求资料 |", "| 01 技术方案 |", "| 02 方案审核 |",
    "| 03 任务规划 |", "| 04 实现记录 |", "| 05 代码审核 |", "| 06 知识同步 |"
  ].each { |needle| tail_require(errors, manifest_template, needle, "artifact-manifest-template") }
  [
    "07 交付总结", "不映射节点能力", "NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT",
    "external_evidence_references", "Decision Scope", "Delta Scope",
    "Aggregate Requirement Scope", "Same Requirement Decision", "Earliest Affected Node",
    "Finding Ledger Reference", "## Re-Gate Records", "## Change History",
    "## 修订记录"
  ].each { |needle| tail_require(errors, manifest_template, needle, "artifact-manifest-template") }
  if manifest_template.match?(/^## Documentation Governance Tail\s*$/)
    errors << "tail-template: manifest must not restore the retired ## Documentation Governance Tail section"
  end
  if manifest_template.include?("documentation_governance_tail")
    errors << "tail-template: manifest must not restore documentation_governance_tail fields"
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
        "current_sync_owner" => "sdlc-knowledge-sync | none",
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

# ── C03-A canonical topology (LOOP-CORE-C03-PLAN §6 A4/A5; Decision-045) ──
# The seven canonical node skills must exist as authored packages with a
# known-skills contract each. Name alignment against the runtime
# NODE_CAPABILITY_IDS is enforced IN THIS FILE by extracting the constant
# from loop/types/index.ts (see RUNTIME_NODE_IDS below) — there is no
# external test performing this comparison. docflow-writer is a non-node
# utility: it must exist but is asserted NOT to claim node membership.
CANONICAL_NODE_SKILLS = [
  "sdlc-requirement-intake",
  "sdlc-solution-design",
  "sdlc-solution-gate",
  "sdlc-task-planning",
  "sdlc-implementation",
  "sdlc-code-review",
  "sdlc-knowledge-sync"
].freeze

NON_NODE_UTILITY_SKILLS = ["sdlc-docflow-writer"].freeze

canonical_errors = []
CANONICAL_NODE_SKILLS.each do |name|
  skill_md = File.join(SKILL_DIR, name, "SKILL.md")
  contract = File.join(CONTRACT_DIR, "#{name}.md")
  canonical_errors << "canonical skill #{name} missing #{relative(skill_md)}" unless File.exist?(skill_md)
  canonical_errors << "canonical skill #{name} missing #{relative(contract)}" unless File.exist?(contract)
  next unless File.exist?(skill_md)

  body = File.read(skill_md)
  canonical_errors << "canonical skill #{name} lacks the capability source trace table" unless body.include?("能力来源对照表")
  # R4/B-4: negation-aware authority-claim detection. A line counts as a
  # claim only when it pairs an ownership verb with Gate adjudication AND
  # carries no negation marker anywhere in the same line.
  claim_line = body.lines.find do |ln|
    ln =~ /Gate\s*裁决/ && ln =~ /拥有|承载|具备|持有/ && ln !~ /不|无|未|非|排除|禁止|不得/
  end
  canonical_errors << "canonical skill #{name} must not claim Gate adjudication authority (line: #{claim_line.strip})" if claim_line
end

# Self-test for the negation-aware detector (red/green pinned).
begin
  detector = lambda do |text|
    text.lines.any? { |ln| ln =~ /Gate\s*裁决/ && ln =~ /拥有|承载|具备|持有/ && ln !~ /不|无|未|非|排除|禁止|不得/ }
  end
  raise "self-test F1: negation must NOT be flagged" if detector.call("本包不拥有 Gate 裁决权。\n")
  raise "self-test F2: 无 wording must NOT be flagged" if detector.call("无 Gate 裁决权威。\n")
  raise "self-test F3: bare claim MUST be flagged" unless detector.call("本包拥有 Gate 裁决权。\n")
  puts "CANONICAL_AUTHORITY_DETECTOR_SELF_TEST_VERIFIED true"
rescue StandardError => e
  errors << "C03-A canonical topology: #{e.message}"
end

canonical_errors << "non-node utility sdlc-docflow-writer missing non-node boundary declaration" unless
  File.exist?(File.join(SKILL_DIR, "sdlc-docflow-writer", "SKILL.md")) &&
  File.read(File.join(SKILL_DIR, "sdlc-docflow-writer", "SKILL.md")).include?("非节点边界")

sg = File.join(SKILL_DIR, "sdlc-solution-gate", "SKILL.md")
if File.exist?(sg)
  sg_body = File.read(sg)
  %w[adversarial_scan formal_verdict].each do |role|
    canonical_errors << "solution-gate dual-role firewall clause missing #{role}" unless sg_body.include?(role)
  end
  canonical_errors << "solution-gate dual-role firewall must bind the two roles to different Agent bindings" unless
    sg_body =~ /不同\s*Agent|different Agent/i
end

# B-5: extract NODE_CAPABILITY_IDS from the runtime source of truth
# (loop/types/index.ts) by slicing between the constant declaration and the
# closing "] as const" — the prefix itself contains "[]" so a naive regex on
# brackets would misfire.
TYPES_SOURCE = File.join(ROOT, "loop", "types", "index.ts")
runtime_node_ids = []
types_text = File.exist?(TYPES_SOURCE) ? File.read(TYPES_SOURCE) : ""
decl_idx = types_text.index("NODE_CAPABILITY_IDS")
if decl_idx.nil?
  canonical_errors << "unable to locate NODE_CAPABILITY_IDS in #{relative(TYPES_SOURCE)}"
else
  close_idx = types_text.index("] as const", decl_idx)
  if close_idx.nil?
    canonical_errors << "unable to locate the NODE_CAPABILITY_IDS closing bracket"
  else
    # Runtime constants carry BARE capability names ("requirement-intake");
    # plan-side canonical skills are the same names with the "sdlc-" package
    # prefix. Compare on the stripped form.
    runtime_node_ids = types_text[decl_idx..close_idx].scan(/"([a-z][a-z-]+)"/).flatten
    if runtime_node_ids.empty?
      canonical_errors << "NODE_CAPABILITY_IDS extraction yielded no capability ids"
    else
      plan_capability_names = CANONICAL_NODE_SKILLS.map { |n| n.sub(/\Asdlc-/, "") }
      if runtime_node_ids.sort != plan_capability_names.sort
        canonical_errors << "NODE_CAPABILITY_IDS drift: runtime=#{runtime_node_ids.sort.inspect} plan=#{plan_capability_names.sort.inspect}"
      end
    end
  end
end

# B-6: mechanically link the solution-gate dual-role firewall clause to the
# Q1 BindingRegistry. Since W1 (Decision-073) INITIAL returns the Q1 slot map
# directly (the former runtime swap patch was removed), three facts coexist:
#   (a) loop/types declares BOTH execution-role literals;
#   (b) the Q1 slot map in core/agent-capability-bindings.ts assigns
#       adversarial_scan->codex and formal_verdict->hermes (different agents),
#       and createRuntimeBindingRegistry returns INITIAL directly with no
#       replaceBinding verdict-swap patch;
#   (c) the solution-gate SKILL.md carries the dual-role firewall clause.
roles_declared = types_text.include?("\"adversarial_scan\"") && types_text.include?("\"formal_verdict\"")
bindings_source_path = File.join(ROOT, "core", "agent-capability-bindings.ts")
bindings_text = File.exist?(bindings_source_path) ? File.read(bindings_source_path) : ""
q1_scan_codex = bindings_text.include?("\"solution-gate:adversarial_scan\": \"codex\"")
q1_verdict_hermes = bindings_text.include?("\"solution-gate:formal_verdict\": \"hermes\"")
runtime_source_path = File.join(ROOT, "runtime.ts")
runtime_text = File.exist?(runtime_source_path) ? File.read(runtime_source_path) : ""
runtime_returns_initial = runtime_text.include?("return INITIAL_BINDING_REGISTRY")
runtime_has_no_swap = !runtime_text.include?("replaceBinding")
dual_agent_bound = q1_scan_codex && q1_verdict_hermes && runtime_returns_initial && runtime_has_no_swap
sg_skill_path = File.join(SKILL_DIR, "sdlc-solution-gate", "SKILL.md")
sg_skill = File.exist?(sg_skill_path) ? File.read(sg_skill_path) : ""
contract_firewall = sg_skill.include?("adversarial_scan") && sg_skill.include?("formal_verdict") &&
                    sg_skill =~ /不同\s*Agent|different Agent/i
unless roles_declared && dual_agent_bound && contract_firewall
  canonical_errors << "solution-gate dual-role firewall not mechanically linked to Q1 BindingRegistry " \
                      "(roles_declared=#{!!roles_declared}, q1_scan_codex=#{!!q1_scan_codex}, " \
                      "q1_verdict_hermes=#{!!q1_verdict_hermes}, runtime_returns_initial=#{!!runtime_returns_initial}, " \
                      "runtime_has_no_swap=#{!!runtime_has_no_swap}, contract_firewall=#{!!contract_firewall})"
end

errors.concat(canonical_errors.map { |e| "C03-A canonical topology: #{e}" })

# ── C03-B R2 closure validation (H1-d / H1-e) ──
# H1-d: category-guide ↔ known-skills contract exact consistency.
# Round 2 found 3/8 category mismatches that the validator did not catch.
# The example table in skill-category-guide.md must exactly match the
# category frontmatter of each of the 8 canonical contracts.
CATEGORY_GUIDE_PATH = File.join(ROOT, "skill-contracts", "skill-category-guide.md")
if File.exist?(CATEGORY_GUIDE_PATH)
  cg_text = File.read(CATEGORY_GUIDE_PATH)
  cg_categories = {}
  in_example_table = false
  cg_text.lines.each do |line|
    if line.include?("| Skill | Category | Reason |")
      in_example_table = true
      next
    end
    if in_example_table
      if line.match?(/^\s*\|[\s-]+\|/)
        next # separator
      end
      if line.match?(/^\s*\|/)
        cells = line.split("|").map(&:strip)
        # cells: ["", skill, category, reason, ""]
        if cells.size >= 4
          skill_match = cells[1].match(/`([^`]+)`/)
          skill_id = skill_match ? skill_match[1] : cells[1]
          cg_categories[skill_id] = cells[2]
        end
      else
        in_example_table = false if cg_categories.any?
      end
    end
  end

  (CANONICAL_NODE_SKILLS + NON_NODE_UTILITY_SKILLS).each do |name|
    contract_path = File.join(CONTRACT_DIR, "#{name}.md")
    next unless File.exist?(contract_path)
    contract_text = File.read(contract_path)
    contract_category = contract_text[/^category:\s*(.+)$/, 1]
    guide_category = cg_categories[name]
    if guide_category.nil?
      errors << "C03-B closure: category-guide missing example row for #{name}"
    elsif contract_category && guide_category != contract_category
      errors << "C03-B closure: category-guide #{name} category #{guide_category.inspect} does not match contract #{contract_category.inspect}"
    end
  end
else
  errors << "C03-B closure: missing skill-contracts/skill-category-guide.md"
end

# H1-e: active manifest entrypoints must not contain retired skill IDs in
# active (non-archive) context. INV8 / F row 8: "old IDs have no public
# entry point." Archive context is exempt when explicitly marked.
RETROIRED_SKILL_IDS = %w[
  sdlc-requirement-normalizer sdlc-specification-writer sdlc-solution-reviewer
  sdlc-solution-challenger sdlc-implementation-recorder sdlc-code-review-normalizer
  sdlc-code-review-excellence sdlc-test-feedback-classifier sdlc-test-feedback-sync
  sdlc-gate-runner sdlc-speckit-pipeline sdlc-speckit-specify sdlc-speckit-clarify
  sdlc-speckit-plan sdlc-speckit-tasks sdlc-speckit-analyze sdlc-speckit-implement
  sdlc-speckit-sync sdlc-speckit-code-doc-reconcile sdlc-speckit-checklist
].freeze

# C03-B R3-F1b: archive exemption precision.
# GLOBAL_ARCHIVE_BANNERS — only [HISTORICAL — pre-C03-B] in the first N lines
# triggers whole-document exemption. This is a document-level banner meaning the
# entire document is historical archive. [RETIRED — C03-B] is NOT a global trigger
# because it is typically a section/line-level annotation (e.g. VALIDATION.md :19
# marks a specific retired validator, not the whole document); putting it in the
# global set would inertize any document that happens to mention a retired item
# in its header region.
# LINE_ARCHIVE_MARKERS — used for per-line and section-heading exemption. Includes
# both [HISTORICAL] and [RETIRED] plus broad context terms. A non-heading line
# with a marker exempts ONLY that line (non-sticky); a `## ` heading with a marker
# exempts the section until the next heading.
GLOBAL_ARCHIVE_BANNERS = [
  "[HISTORICAL — pre-C03-B]"
].freeze

LINE_ARCHIVE_MARKERS = (GLOBAL_ARCHIVE_BANNERS + [
  "[RETIRED — C03-B]", "能力来源对照表", "Decision-0", "历史档案", "archive"
]).freeze

if File.exist?(MANIFEST_PATH)
  manifest = YAML.safe_load(File.read(MANIFEST_PATH), permitted_classes: [], aliases: false) || {}
  entrypoints = manifest.fetch("entrypoints", {})
  entrypoints.each do |ep_name, ep_rel_path|
    ep_path = File.join(ROOT, ep_rel_path)
    next unless File.exist?(ep_path)
    # Retired-ID scan targets documentation/templates only; skip code files
    # (the validator itself carries RETROIRED_SKILL_IDS as a constant definition).
    next if ep_rel_path.end_with?(".rb", ".ts", ".js", ".py", ".sh")
    ep_text = File.read(ep_path)

    # Global archive exemption: only square-bracket banners in first 30 lines.
    header = ep_text.lines.first(30).join
    next if GLOBAL_ARCHIVE_BANNERS.any? { |banner| header.include?(banner) }

    # Section-level exemption: `## ` heading with any LINE_ARCHIVE_MARKERS
    # exempts the section until next heading. Non-heading line with a marker
    # exempts ONLY that line (non-sticky).
    # Document-level archive start: a standalone blockquote line ("> ")
    # containing [HISTORICAL — pre-C03-B] marks everything after it as
    # archive context. This lets a document declare "from here onward is
    # historical archive" without needing per-section markers.
    in_archive_section = false
    in_archive_from_here = false
    ep_text.lines.each_with_index do |line, idx|
      if line.match?(/^>\s/) && line.include?("[HISTORICAL — pre-C03-B]")
        in_archive_from_here = true
        next
      end
      next if in_archive_from_here

      if line.match?(/^##+\s/)
        in_archive_section = LINE_ARCHIVE_MARKERS.any? { |marker| line.include?(marker) }
        next
      end
      # Non-sticky line-level exemption: this line only.
      line_exempt = LINE_ARCHIVE_MARKERS.any? { |marker| line.include?(marker) }
      next if in_archive_section || line_exempt

      RETROIRED_SKILL_IDS.each do |old_id|
        if line.include?(old_id)
          errors << "C03-B closure: entrypoint #{ep_name} (#{ep_rel_path}:#{idx + 1}) contains retired skill ID #{old_id} in active context"
        end
      end
    end
  end
end

# ── C03-E E0.4: extended retired-path-term closure scan ──
# E0 active-contract preflight: the retired-ID scan above covers only
# manifest entrypoints. E0.4 extends the closure to all active
# (non-archive) contract, skill, and metadata files, and adds retired
# path-decision terms (Direct/Speckit dual-rail artifacts) that must not
# appear in active contracts. Archive context and explicit historical
# markers are exempt, matching the precision model above.
RETIRED_PATH_TERMS = %w[
  DIRECT_IMPLEMENTATION
  SPECKIT_PIPELINE_REQUIRED
  BLOCKED_NEEDS_REVISION
  Development\ Path\ Decision
  Full\ SDD\ Override
  direct_implementation_path
  speckit_pipeline
  sdlc-speckit-pipeline
  sdlc-speckit-specify
  sdlc-speckit-clarify
  sdlc-speckit-plan
  sdlc-speckit-tasks
  sdlc-speckit-analyze
  sdlc-speckit-implement
  sdlc-speckit-sync
  sdlc-speckit-code-doc-reconcile
  sdlc-speckit-checklist
].freeze

E0_ACTIVE_SCAN_ROOTS = [
  File.join(ROOT, "skill-contracts", "known-skills"),
  File.join(ROOT, "metadata", "capabilities")
].freeze

E0_SCAN_EXTENSIONS = %w[.md .json .yaml .yml].freeze

# Also scan all SKILL.md files (active skill definitions), but NOT their
# references/ subdirectories — those are covered by per-skill E-gate
# cleanup stages, not the E0 active-contract preflight.
E0_SKILL_MD_FILES = Dir.glob(File.join(ROOT, "skills", "sdlc-*", "SKILL.md")).freeze

def e0_archive_exempt?(text)
  header = text.lines.first(30).join
  return true if GLOBAL_ARCHIVE_BANNERS.any? { |banner| header.include?(banner) }

  in_archive_section = false
  in_archive_from_here = false
  text.lines.each do |line|
    if line.match?(/^>\s/) && line.include?("[HISTORICAL — pre-C03-B]")
      in_archive_from_here = true
      next
    end
    next if in_archive_from_here

    if line.match?(/^##+\s/)
      in_archive_section = LINE_ARCHIVE_MARKERS.any? { |marker| line.include?(marker) }
      next
    end
    return false unless in_archive_section
  end
  true
end

E0_ACTIVE_SCAN_FILES = (
  E0_ACTIVE_SCAN_ROOTS.flat_map do |root|
    next [] unless File.directory?(root)
    Dir.glob(File.join(root, "**", "*")).select do |path|
      File.file?(path) && E0_SCAN_EXTENSIONS.include?(File.extname(path))
    end
  end + E0_SKILL_MD_FILES
).uniq.sort.freeze

E0_ACTIVE_SCAN_FILES.each do |path|
  # Skip this validator itself and the retired-IDs constant definition.
  next if path == __FILE__
  # Skip archive directories.
  next if path.include?("docs/reports/archive/")
  next if path.include?("/archive/")

  text = File.read(path)

  # Global archive exemption: only square-bracket banners in first 30 lines.
  header = text.lines.first(30).join
  next if GLOBAL_ARCHIVE_BANNERS.any? { |banner| header.include?(banner) }

  # Section-level exemption (matching the retired-ID scan above):
  # `## ` heading with any LINE_ARCHIVE_MARKERS exempts the section until
  # next heading. Non-heading line with a marker exempts ONLY that line.
  # Document-level archive start: a standalone blockquote line containing
  # [HISTORICAL — pre-C03-B] marks everything after it.
  in_archive_section = false
  in_archive_from_here = false
  text.lines.each_with_index do |line, idx|
    if line.match?(/^>\s/) && line.include?("[HISTORICAL — pre-C03-B]")
      in_archive_from_here = true
      next
    end
    next if in_archive_from_here

    if line.match?(/^##+\s/)
      in_archive_section = LINE_ARCHIVE_MARKERS.any? { |marker| line.include?(marker) }
      next
    end
    # Non-sticky line-level exemption: this line only.
    line_exempt = LINE_ARCHIVE_MARKERS.any? { |marker| line.include?(marker) }
    next if in_archive_section || line_exempt

    RETIRED_PATH_TERMS.each do |term|
      if line.include?(term)
        errors << "E0.4 closure: #{relative(path)}:#{idx + 1} contains retired path-decision term #{term.inspect} in active context"
      end
    end
  end
end

if errors.empty?
  puts "skill contract validation ok"
else
  warn "skill contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
