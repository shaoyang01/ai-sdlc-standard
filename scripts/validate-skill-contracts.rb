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
  "entry coverage audit",
  "one-off"
].freeze

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
