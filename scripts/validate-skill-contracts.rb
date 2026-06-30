#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

ROOT = File.expand_path("..", __dir__)
CONTRACT_DIR = File.join(ROOT, "skill-contracts", "known-skills")
SKILL_DIR = File.join(ROOT, "skills")
MANIFEST_PATH = File.join(ROOT, "manifest.yaml")

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

def contract_yaml(path)
  text = File.read(path)
  yaml = text[/```yaml\n(.*?)\n```/m, 1]
  raise "missing fenced yaml metadata" unless yaml

  YAML.safe_load(yaml, permitted_classes: [], aliases: false) || {}
rescue Psych::SyntaxError => e
  raise "invalid yaml metadata: #{e.message}"
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
  end
else
  errors << "missing manifest.yaml"
end

if errors.empty?
  puts "skill contract validation ok"
else
  warn "skill contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
