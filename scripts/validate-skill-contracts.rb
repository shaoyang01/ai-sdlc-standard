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
  inventory(?:\s+only)?|
  parity(?:[-\s]+reference)?(?:[-\s]+only)?|
  legacy_reference_only|
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

def unsafe_legacy_source_references(text)
  lines = text.lines
  unsafe = []

  lines.each_with_index do |line, index|
    next unless line.match?(LEGACY_SOURCE_PATH_PATTERN)

    context = [
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

bootstrap_path = File.join(ROOT, "scripts", "bootstrap-speckit-project.sh")
if File.exist?(bootstrap_path)
  bootstrap = File.read(bootstrap_path)
  errors << "bootstrap script must write project-context candidates when files exist" unless bootstrap.include?("candidate_path")
  errors << "bootstrap script must not rely on single --force for profiles and context" if bootstrap.include?('FORCE="')
else
  errors << "missing scripts/bootstrap-speckit-project.sh"
end

if errors.empty?
  puts "skill contract validation ok"
else
  warn "skill contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
