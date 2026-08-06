#!/usr/bin/env ruby
# encoding: utf-8
# frozen_string_literal: true

# Read-only Compact Prompt Contract validator (PCE-01-A contracts + PCE-01-B
# renderer fixtures).
#
# Boundaries:
#   read_only: true
#   deterministic: true
#   network_access: false
#   filesystem_writes: false
#   shell_execution: false
#
# Verifies the compact prompt contract assets, the fixed capsule shape,
# restricted-YAML rejections, exact prompt-mode budgets, exact
# validation-profile semantics, the fixed Codex prompt template section
# order and conditional blocks, the completion report template, the
# centralized A contract fixtures, the B renderer fixtures (with injected
# synthetic git state and in-memory text), and that manifest / ROADMAP /
# VALIDATION / PORTABILITY register facts without premature claims.
#
# This file requires scripts/lib/compact_prompt.rb and must not duplicate
# schema, budget, enum, placeholder or renderer logic.
#
# Not implemented here: prompt renderer execution, git operations, command
# execution from capsule content, token counting, project profile
# resolution, network access, file writes.

require_relative "lib/compact_prompt"

ROOT = CompactPrompt::ROOT

errors = []
prompt_placeholders = nil
fixture_count = 0
renderer_fixture_count = 0
renderer_assertion_count = 0

def relative(path)
  path.sub("#{ROOT}/", "")
end

def check_asset_exists(path)
  errors << "missing whitelist asset #{path}" unless File.file?(File.join(ROOT, path))
end

def read_asset(path)
  File.read(File.join(ROOT, path), encoding: "UTF-8")
end

# ── Asset checks ──

CompactPrompt::WHITELIST_ASSETS.each { |path| check_asset_exists(path) }

capsule_template_path = "templates/compact-execution-capsule-template.yaml"
if File.file?(File.join(ROOT, capsule_template_path))
  template_data, classification = CompactPrompt::RestrictedYAML.parse(read_asset(capsule_template_path))
  if classification
    errors << "capsule template: rejected by restricted-YAML rules (#{classification})"
  else
    shape_error = CompactPrompt::Template.capsule_template_shape_error(template_data)
    errors << "capsule template: #{shape_error}" if shape_error
  end
end

profiles_path = "templates/compact-validation-profiles.yaml"
if File.file?(File.join(ROOT, profiles_path))
  profiles_data, classification = CompactPrompt::RestrictedYAML.parse(read_asset(profiles_path))
  if classification
    errors << "validation profiles template: rejected by restricted-YAML rules (#{classification})"
  else
    unless profiles_data.is_a?(Hash) && profiles_data.keys == ["validation_profiles"]
      errors << "validation profiles template: root must contain exactly validation_profiles"
    end
    profiles = profiles_data.is_a?(Hash) ? profiles_data["validation_profiles"] : nil
    unless profiles.is_a?(Hash) && profiles.keys.sort == CompactPrompt::VALIDATION_PROFILES.sort
      errors << "validation profiles template: profile set must be exactly #{CompactPrompt::VALIDATION_PROFILES.inspect}"
    end
    if profiles.is_a?(Hash)
      CompactPrompt::PROFILE_SEMANTICS.each do |name, semantics|
        profile = profiles[name]
        if profile.is_a?(Hash) && profile.keys.sort == semantics.keys.sort
          semantics.each do |key, expected|
            unless profile[key] == expected
              errors << "validation profiles template: #{name}.#{key} must equal #{expected.inspect} " \
                        "(got #{profile[key].inspect})"
            end
          end
        else
          errors << "validation profiles template: #{name} must have exactly #{semantics.keys.inspect}"
        end
      end
    end
  end
end

prompt_template_path = "templates/compact-codex-prompt-template.md"
prompt_template_text = nil
if File.file?(File.join(ROOT, prompt_template_path))
  headings = File.readlines(File.join(ROOT, prompt_template_path), chomp: true, encoding: "UTF-8")
              .grep(/\A## \d+\. /).map { |line| line.sub(/\A## /, "") }
  if headings != CompactPrompt::CODEX_PROMPT_SECTIONS
    errors << "codex prompt template: section headings must be exactly " \
              "#{CompactPrompt::CODEX_PROMPT_SECTIONS.inspect}, found #{headings.inspect}"
  end
  prompt_template_text = read_asset(prompt_template_path)
  delivery_count = prompt_template_text.scan("delivery_type: CODEX_EXECUTION_PROMPT").length
  errors << "codex prompt template: delivery_type: CODEX_EXECUTION_PROMPT must appear exactly once " \
            "(found #{delivery_count})" unless delivery_count == 1
  errors << "codex prompt template: must generate exactly one CODEX_EXECUTION_PROMPT material" \
    unless prompt_template_text.scan(/^delivery_type:/).length == 1
  %w[recipient: paste_location: purpose: report_back_to: next_hop_after_report:].each do |needle|
    unless prompt_template_text.include?(needle)
      errors << "codex prompt template: routing header is missing #{needle}"
    end
  end
  %w[completion_report_recipient: completion_report_name: stop_after_report:\ true].each do |needle|
    unless prompt_template_text.include?(needle)
      errors << "codex prompt template: footer is missing #{needle}"
    end
  end
  if prompt_template_text.scan("report_to:").any?
    errors << "codex prompt template: must not use report_to"
  end
  # Finding F01: no task-specific content in the public template.
  CompactPrompt::TASK_SPECIFIC_TEMPLATE_STRINGS.each do |needle|
    if prompt_template_text.include?(needle)
      errors << "codex prompt template: task-specific content must not appear (#{needle.inspect})"
    end
  end
  # Finding F02: no placeholders without a legitimate source.
  CompactPrompt::LEGACY_PLACEHOLDERS.each do |placeholder|
    if prompt_template_text.include?("<#{placeholder}>")
      errors << "codex prompt template: legacy placeholder without a source must not appear (<#{placeholder}>)"
    end
  end
  prompt_placeholders = CompactPrompt::Template.placeholders(prompt_template_text)
  # Finding F05: single template-structure gate shared with the CLI —
  # fixed ten sections in exact order, exactly one line-start
  # delivery_type: CODEX_EXECUTION_PROMPT, and the complete strict
  # WHEN/ENDWHEN marker scan (malformed / unknown / unpaired / nested /
  # duplicate / cross-section all fail closed; WHEN-like text that does not
  # match the legal-token regex is never silently ignored).
  structure_error = CompactPrompt::Template.structure_error(prompt_template_text)
  if structure_error
    errors << "codex prompt template: #{structure_error[2]}"
  end
  # Finding F05: single template-binding validator shared with the CLI —
  # exact 27-placeholder set, exactly-once occurrences, no unknown,
  # missing, duplicate or source-set drift. The non-nil result must be
  # appended to errors so the shared gate really blocks the contract
  # validator (finding F05-A) — never call-and-ignore.
  binding_error = CompactPrompt::Template.binding_error(prompt_template_text)
  if binding_error
    errors << "codex prompt template: #{binding_error[2]}"
  end
  unknown_placeholders = prompt_placeholders - CompactPrompt::PLACEHOLDER_SOURCES.keys
  unless unknown_placeholders.empty?
    errors << "codex prompt template: unknown placeholder(s) not in the source table #{unknown_placeholders.inspect}"
  end
end

report_template_path = "templates/compact-completion-report-template.md"
if File.file?(File.join(ROOT, report_template_path))
  report_text = read_asset(report_template_path)
  %w[target_lines:\ 30-80 minimum_lines:\ 20 hard_limit_lines:\ 120].each do |needle|
    errors << "completion report template: missing budget #{needle}" unless report_text.include?(needle)
  end
  CompactPrompt::COMPLETION_REPORT_FIELDS.each do |field|
    unless report_text.include?("#{field}:")
      errors << "completion report template: missing required field #{field}"
    end
  end
  CompactPrompt::TASK_SPECIFIC_TEMPLATE_STRINGS.each do |needle|
    if report_text.include?(needle)
      errors << "completion report template: task-specific content must not appear (#{needle.inspect})"
    end
  end
end

# ── Standard asset static validation (finding F05) ──
# The validator must not merely check that the standard file exists; it
# statically verifies the contract facts the standard declares, then checks
# cross-asset drift against the capsule/prompt/completion-report/validation
# profiles templates, validator constants and fixtures.

standard_path = "ai-sdlc/compact-prompt-standard.md"
standard_text = File.file?(File.join(ROOT, standard_path)) ? read_asset(standard_path) : nil
if standard_text
  # Capsule root fields and all nested fields (section 1.2), derived from the
  # validator constants so the two cannot drift apart.
  { "root" => CompactPrompt::ROOT_KEYS,
    "routing" => CompactPrompt::ROUTING_KEYS,
    "baseline" => CompactPrompt::BASELINE_KEYS,
    "delta" => CompactPrompt::DELTA_KEYS,
    "scope" => CompactPrompt::SCOPE_KEYS,
    "git" => CompactPrompt::GIT_KEYS,
    "completion_report" => CompactPrompt::COMPLETION_REPORT_KEYS }.each do |group, keys|
    keys.each do |key|
      unless standard_text.include?("#{key}:")
        errors << "standard: #{group} field #{key.inspect} is not declared"
      end
    end
  end

  # Git enums (finding F04): exact NONE/NORMAL_PUSH and
  # NONE/CREATE_DRAFT/UPDATE_DRAFT; NO_PUSH must be fully gone.
  unless standard_text.include?("NONE | NORMAL_PUSH")
    errors << "standard: push_mode enum NONE | NORMAL_PUSH is not declared"
  end
  unless standard_text.include?("NONE | CREATE_DRAFT | UPDATE_DRAFT")
    errors << "standard: pull_request_action enum NONE | CREATE_DRAFT | UPDATE_DRAFT is not declared"
  end
  if standard_text.include?("NO_PUSH")
    errors << "standard: NO_PUSH must be fully removed (finding F04)"
  end

  # Four prompt modes with exact budgets (section 2).
  CompactPrompt::PROMPT_MODE_BUDGETS.each do |mode, budget|
    row = "| `#{mode}` | #{budget["hard_limit_lines"]} | #{budget["hard_limit_bytes"]} |"
    unless standard_text.include?(row)
      errors << "standard: prompt mode budget row #{row.inspect} is missing"
    end
  end

  # Five validation profiles (section 3).
  CompactPrompt::VALIDATION_PROFILES.each do |profile|
    unless standard_text.include?("| `#{profile}` |")
      errors << "standard: validation profile #{profile} is not declared"
    end
  end

  # Continuation delta-only (section 4).
  unless standard_text.include?("continuation 只携带当前 delta")
    errors << "standard: continuation delta-only rule is missing"
  end

  # Completion report 20-120 line constraint (section 7).
  %w[minimum_lines:\ 20 hard_limit_lines:\ 120].each do |needle|
    unless standard_text.include?(needle)
      errors << "standard: completion report budget #{needle} is missing"
    end
  end

  # Ten fixed prompt section headings (section 5).
  CompactPrompt::CODEX_PROMPT_SECTIONS.each do |section|
    unless standard_text.include?("#{section}\n")
      errors << "standard: fixed prompt section #{section.inspect} is missing"
    end
  end

  # One execution material per delivery (section 8).
  unless standard_text.include?("一次只能交付一份执行材料")
    errors << "standard: single-material delivery rule is missing"
  end

  # stop_after_report: true (section 1.2).
  unless standard_text.include?("stop_after_report: true")
    errors << "standard: stop_after_report: true contract marker is missing"
  end

  # Template Value Source Table (section 6, finding F02).
  unless standard_text.include?("## 6. Template Value Source Table")
    errors << "standard: Template Value Source Table section is missing"
  end

  # Public classification table (section 1.4) must cover every public code.
  CompactPrompt::PUBLIC_CLASSIFICATIONS.each do |code|
    unless standard_text.include?("| `#{code}` |")
      errors << "standard: public classification #{code} is not documented"
    end
  end

  # Completion report public field set (section 7) must match the template
  # field set exactly (finding F01).
  CompactPrompt::COMPLETION_REPORT_FIELDS.each do |field|
    unless standard_text.include?("#{field}:")
      errors << "standard: completion report field #{field} is not declared"
    end
  end

  # Template Value Source Table consistency with the prompt template
  # (finding F02): every placeholder has exactly one source row, the table
  # and the template placeholder sets are identical, no unknown or leftover
  # placeholders, no duplicate rows.
  table_rows = standard_text.scan(
    /^\| `?<([^>`]+)>`? \| (CAPSULE_FIELD|STANDARD_CONSTANT|PCE_01_B_PROJECT_MAPPING)/
  )
  table_placeholders = table_rows.map { |row| "<#{row[0]}>" }
  table_placeholder_set = table_placeholders.uniq
  unless standard_text.include?("| `delivery_type` | STANDARD_CONSTANT")
    errors << "standard: source table must bind delivery_type to STANDARD_CONSTANT"
  end
  unless standard_text.include?("STANDARD_CONSTANT") && standard_text.include?("PCE_01_B_PROJECT_MAPPING")
    errors << "standard: source table must declare STANDARD_CONSTANT and PCE_01_B_PROJECT_MAPPING sources"
  end
  # Ruby 2.6-compatible occurrence count (Array#tally is 2.7+).
  table_counts = table_placeholders.each_with_object(Hash.new(0)) { |p, h| h[p] += 1 }
  duplicate_rows = table_counts.select { |_p, count| count > 1 }
  unless duplicate_rows.empty?
    errors << "standard: source table placeholder row(s) duplicated #{duplicate_rows.inspect}"
  end
  if prompt_placeholders
    unknown = prompt_placeholders - table_placeholder_set
    unless unknown.empty?
      errors << "source table: template placeholder(s) without a source row #{unknown.inspect}"
    end
    leftover = table_placeholder_set - prompt_placeholders
    unless leftover.empty?
      errors << "source table: placeholder row(s) not present in the template #{leftover.inspect}"
    end
  else
    errors << "source table: prompt template placeholders were not extracted (template missing?)"
  end
end

# ── A contract fixtures ──

fixtures_path = "fixtures/compact-prompt/contracts.yaml"
if File.file?(File.join(ROOT, fixtures_path))
  begin
    fixtures_data = YAML.safe_load(read_asset(fixtures_path), permitted_classes: [], aliases: false)
    unless fixtures_data.is_a?(Hash) && fixtures_data.keys.sort == %w[authority fixtures schema_version].sort
      errors << "fixtures: root keys must be exactly schema_version/authority/fixtures"
    end
    if fixtures_data.is_a?(Hash)
      unless fixtures_data["schema_version"] == "compact-prompt-contracts-v1"
        errors << "fixtures: schema_version must be compact-prompt-contracts-v1"
      end
      unless fixtures_data["authority"] == "validation_only"
        errors << "fixtures: authority must be validation_only"
      end
    end
    fixtures = fixtures_data.is_a?(Hash) ? fixtures_data["fixtures"] : nil
    unless fixtures.is_a?(Array)
      errors << "fixtures: fixtures must be an array"
    else
      seen_ids = Hash.new(0)
      fixtures.each_with_index do |fixture, index|
        label = "fixtures[#{index}]"
        unless fixture.is_a?(Hash)
          errors << "#{label}: must be a mapping"
          next
        end
        allowed_fixture_keys = %w[id category description capsule expected_classification]
        unknown = fixture.keys - allowed_fixture_keys
        errors << "#{label}: unknown key(s) #{unknown.inspect}" unless unknown.empty?
        id = fixture["id"]
        unless id.is_a?(String) && id.match?(/\A[A-Z0-9-]+\z/) && id.length <= 64
          errors << "#{label}: id must match [A-Z0-9-]+ up to 64 chars"
          next
        end
        seen_ids[id] += 1
        category = fixture["category"]
        unless %w[valid negative].include?(category)
          errors << "#{label} #{id}: category must be valid or negative"
          next
        end
        capsule_text = fixture["capsule"]
        unless capsule_text.is_a?(String) && !capsule_text.empty?
          errors << "#{label} #{id}: capsule must be a non-empty raw YAML string"
          next
        end
        data, classification = CompactPrompt::RestrictedYAML.parse(capsule_text)
        if classification.nil?
          classification = CompactPrompt::Capsule.validate(data)
        end
        if category == "valid"
          if classification
            errors << "#{label} #{id}: expected PASS but was rejected as #{classification}"
          else
            fixture_count += 1
          end
        else
          expected = fixture["expected_classification"]
          unless CompactPrompt::PUBLIC_CLASSIFICATIONS.include?(expected)
            errors << "#{label} #{id}: expected_classification must be a public classification " \
                      "(got #{expected.inspect})"
            next
          end
          if classification == expected
            fixture_count += 1
          elsif classification.nil?
            errors << "#{label} #{id}: expected #{expected} but the capsule passed"
          else
            errors << "#{label} #{id}: expected #{expected} but was rejected as #{classification}"
          end
        end
      end
      duplicates = seen_ids.select { |_id, count| count > 1 }.keys
      unless duplicates.empty?
        errors << "fixtures: duplicate fixture id(s) #{duplicates.inspect}"
      end
    end
  rescue Psych::Exception => e
    errors << "fixtures: file does not parse as restricted YAML (#{e.class})"
  end
end

# ── B renderer fixtures ──
# Fixtures run the CLI service with injected synthetic git state and
# in-memory capsule/policy/template text; no filesystem writes, no shell, no
# network. Compile-success fixtures are run twice to prove byte-identical
# deterministic output.

require "stringio"

class RendererFixtureGitState
  def initialize(spec)
    @root = spec["root"] || "/synthetic/repo"
    @origin_url = spec["origin_url"]
    @refs = spec["refs"] || {}
    @tracked = spec["tracked"] || []
    @branch_valid = spec["branch_valid"]
    @raise_on = spec["raise_on"] || []
  end

  def repository_root(_cwd)
    @root
  end

  def origin_url(_root)
    raise "injected internal failure" if @raise_on.include?("origin_url")
    @origin_url
  end

  def tracked?(_root, path)
    @tracked.include?(path)
  end

  # Synthetic branch validity (finding F04): explicit `branch_valid: false`
  # overrides, otherwise the same deterministic GitNames rules the adapter
  # approximates with `git check-ref-format --branch`.
  def branch_valid?(name)
    return false if @branch_valid == false
    CompactPrompt::GitNames.valid_branch?(name)
  end

  # Synthetic exact full-ref lookup (finding F04): only literal full refs,
  # never revision expressions.
  def exact_ref_head(_root, ref)
    @refs[ref]
  end
end

def run_renderer_fixture(fixture, default_policy, real_template)
  command = fixture["command"]
  capsule_text = fixture["capsule"]
  policy_text = fixture["policy"] || default_policy
  template_text = fixture["template"] || (fixture["template_path"] ? nil : real_template)
  template_path = fixture["template_path"]
  git_state = RendererFixtureGitState.new(fixture["git_state"] || {})

  out = StringIO.new
  err = StringIO.new
  exit_code = CompactPrompt::CLI.main(
    [command, "capsule.yaml"],
    cwd: "/synthetic/repo",
    stdout: out,
    stderr: err,
    git_state: git_state,
    capsule_text: capsule_text,
    policy_text: policy_text,
    template_text: template_text,
    template_path: template_path
  )
  [exit_code, out.string, err.string]
end

def assert_renderer_fixture(id, exit_code, out, err, expected, errors, counts)
  counts[:assertions] += 1
  expected_exit = expected["exit"]
  if exit_code != expected_exit
    errors << "renderer fixture #{id}: expected exit #{expected_exit} but got #{exit_code} " \
              "(stderr: #{err.inspect})"
    return
  end
  stdout_mode = expected["stdout"] || "empty"
  stderr_mode = expected["stderr"] || "empty"
  case stdout_mode
  when "exact"
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: stdout mismatch expected #{expected['stdout_exact'].inspect} " \
              "got #{out.inspect}" unless out == expected["stdout_exact"]
  when "empty"
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: stdout must be empty, got #{out.inspect}" unless out.empty?
  when "prompt"
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: prompt stdout must end with a single LF" \
      unless out.end_with?("\n") && !out.end_with?("\n\n")
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: prompt stdout must be valid UTF-8" unless out.valid_encoding?
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: prompt stdout must not contain CR" if out.include?("\r")
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: prompt stdout must contain exactly one delivery_type line" \
      unless out.scan(/^delivery_type:/).length == 1
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: prompt stdout must contain exactly one delivery_type" \
      unless out.scan(/^delivery_type: CODEX_EXECUTION_PROMPT/).length == 1
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: prompt stdout must have zero unresolved placeholders" \
      if CompactPrompt::PLACEHOLDER_SOURCES.keys.any? { |p| out.include?(p) }
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: prompt stdout must have zero conditional markers" \
      if out.match?(/(?<!\\)<!-- WHEN/) || out.match?(/(?<!\\)<!-- ENDWHEN/)
    counts[:assertions] += 1
    headings = out.lines.grep(/\A## \d+\. /).map { |line| line.sub(/\A## /, "").strip }
    errors << "renderer fixture #{id}: prompt stdout section order mismatch #{headings.inspect}" \
      unless headings == CompactPrompt::CODEX_PROMPT_SECTIONS
  else
    errors << "renderer fixture #{id}: unknown stdout mode #{stdout_mode.inspect}"
  end
  case stderr_mode
  when "exact"
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: stderr mismatch expected #{expected['stderr_exact'].inspect} " \
              "got #{err.inspect}" unless err == expected["stderr_exact"]
  when "empty"
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: stderr must be empty, got #{err.inspect}" unless err.empty?
  when "contains"
    counts[:assertions] += 1
    expected["stderr_contains"].each do |needle|
      errors << "renderer fixture #{id}: stderr must contain #{needle.inspect}, got #{err.inspect}" \
        unless err.include?(needle)
    end
  else
    errors << "renderer fixture #{id}: unknown stderr mode #{stderr_mode.inspect}"
  end
end

# Finding F06: every fenced YAML block of a successful compile output is
# extracted in order and parsed with `YAML.safe_load(permitted_classes: [],
# aliases: false)`. The parsed field values and types must match the
# declared Capsule/Standard expectations exactly — the fixture never merely
# checks that escaped text is present.
def assert_yaml_blocks(id, out, yaml_blocks, errors, counts)
  blocks = []
  buffer = nil
  out.each_line do |line|
    if buffer.nil? && line.match?(/\A```yaml\s*\z/)
      buffer = +""
    elsif buffer && line.match?(/\A```\s*\z/)
      blocks << buffer
      buffer = nil
    elsif buffer
      buffer << line
    end
  end
  counts[:assertions] += 1
  if blocks.length != yaml_blocks.length
    errors << "renderer fixture #{id}: expected #{yaml_blocks.length} fenced yaml block(s) " \
              "but found #{blocks.length}"
    return
  end
  yaml_blocks.each_with_index do |(name, spec), index|
    raw = blocks[index]
    if raw.nil?
      errors << "renderer fixture #{id}: yaml block #{name} not found"
      next
    end
    begin
      parsed = YAML.safe_load(raw, permitted_classes: [], aliases: false)
    rescue Psych::Exception => e
      errors << "renderer fixture #{id}: yaml block #{name} does not parse (#{e.class})"
      next
    end
    counts[:assertions] += 1
    unless parsed.is_a?(Hash)
      errors << "renderer fixture #{id}: yaml block #{name} must parse to a mapping"
      next
    end
    fields = spec["fields"]
    counts[:assertions] += 1
    errors << "renderer fixture #{id}: yaml block #{name} key set must be exactly " \
              "#{fields.keys.sort.inspect} got #{parsed.keys.sort.inspect}" \
      unless parsed.keys.sort == fields.keys.sort
    fields.each do |key, expectations|
      counts[:assertions] += 1
      if parsed[key] != expectations["value"]
        errors << "renderer fixture #{id}: yaml block #{name}.#{key} value mismatch expected " \
                  "#{expectations['value'].inspect} got #{parsed[key].inspect}"
        next
      end
      next unless expectations.key?("type")
      counts[:assertions] += 1
      actual_type = case parsed[key]
                    when String then "string"
                    when Integer then "integer"
                    when TrueClass, FalseClass then "boolean"
                    when NilClass then "null"
                    when Array then "array"
                    when Hash then "mapping"
                    else "unknown"
                    end
      if actual_type != expectations["type"]
        errors << "renderer fixture #{id}: yaml block #{name}.#{key} type mismatch expected " \
                  "#{expectations['type']} got #{actual_type}"
      end
    end
  end
end

renderer_fixtures_path = "fixtures/compact-prompt/renderer.yaml"
if File.file?(File.join(ROOT, renderer_fixtures_path))
  begin
    rf_data = YAML.safe_load(read_asset(renderer_fixtures_path), permitted_classes: [], aliases: false)
    unless rf_data.is_a?(Hash) && rf_data.keys.sort == %w[authority default_policy fixtures schema_version].sort
      errors << "renderer fixtures: root keys must be exactly " \
                "schema_version/authority/default_policy/fixtures"
    end
    if rf_data.is_a?(Hash)
      unless rf_data["schema_version"] == "compact-prompt-renderer-fixtures-v1"
        errors << "renderer fixtures: schema_version must be compact-prompt-renderer-fixtures-v1"
      end
      unless rf_data["authority"] == "validation_only"
        errors << "renderer fixtures: authority must be validation_only"
      end
      unless rf_data["default_policy"].is_a?(String) && !rf_data["default_policy"].empty?
        errors << "renderer fixtures: default_policy must be a non-empty raw YAML string"
      end
    end
    default_policy = rf_data.is_a?(Hash) ? rf_data["default_policy"] : nil
    fixtures = rf_data.is_a?(Hash) ? rf_data["fixtures"] : nil
    unless fixtures.is_a?(Array)
      errors << "renderer fixtures: fixtures must be an array"
    else
      seen_ids = Hash.new(0)
      fixtures.each_with_index do |fixture, index|
        label = "renderer fixtures[#{index}]"
        unless fixture.is_a?(Hash)
          errors << "#{label}: must be a mapping"
          next
        end
        allowed_fixture_keys = %w[
          id category description command capsule policy git_state expected template template_path yaml_blocks
        ]
        unknown = fixture.keys - allowed_fixture_keys
        errors << "#{label}: unknown key(s) #{unknown.inspect}" unless unknown.empty?
        if fixture.key?("yaml_blocks")
          yaml_blocks = fixture["yaml_blocks"]
          unless yaml_blocks.is_a?(Hash) && !yaml_blocks.empty?
            errors << "#{label} #{id}: yaml_blocks must be a non-empty mapping"
            next
          end
          yaml_blocks.each do |name, spec|
            unless name.is_a?(String) && name.match?(/\A[a-z][a-z0-9_-]*\z/)
              errors << "#{label} #{id}: yaml_blocks key #{name.inspect} must be a lowercase identifier"
            end
            unless spec.is_a?(Hash) && spec["fields"].is_a?(Hash) && !spec["fields"].empty?
              errors << "#{label} #{id}: yaml_blocks.#{name} must declare non-empty fields"
              next
            end
            spec["fields"].each do |key, expectations|
              unless expectations.is_a?(Hash) && expectations.keys.include?("value")
                errors << "#{label} #{id}: yaml_blocks.#{name}.#{key} must declare a value"
                next
              end
              if expectations.key?("type") &&
                 !%w[string integer boolean null].include?(expectations["type"])
                errors << "#{label} #{id}: yaml_blocks.#{name}.#{key} type must be " \
                          "string|integer|boolean|null"
              end
            end
          end
        end
        id = fixture["id"]
        unless id.is_a?(String) && id.match?(/\A[A-Z0-9-]+\z/) && id.length <= 64
          errors << "#{label}: id must match [A-Z0-9-]+ up to 64 chars"
          next
        end
        seen_ids[id] += 1
        category = fixture["category"]
        unless %w[valid negative].include?(category)
          errors << "#{label} #{id}: category must be valid or negative"
          next
        end
        command = fixture["command"]
        unless %w[validate compile].include?(command)
          errors << "#{label} #{id}: command must be validate or compile"
          next
        end
        capsule_text = fixture["capsule"]
        unless capsule_text.is_a?(String) && !capsule_text.empty?
          errors << "#{label} #{id}: capsule must be a non-empty raw YAML string"
          next
        end
        expected = fixture["expected"]
        unless expected.is_a?(Hash)
          errors << "#{label} #{id}: expected must be a mapping"
          next
        end
        allowed_expected_keys = %w[exit stdout stdout_exact stderr stderr_exact stderr_contains]
        unknown = expected.keys - allowed_expected_keys
        errors << "#{label} #{id}: expected unknown key(s) #{unknown.inspect}" unless unknown.empty?
        unless expected.keys.include?("exit") && expected.keys.include?("stdout") && expected.keys.include?("stderr")
          errors << "#{label} #{id}: expected must have exit/stdout/stderr"
          next
        end
        unless expected["exit"].is_a?(Integer) && [0, 2, 3, 4, 5].include?(expected["exit"])
          errors << "#{label} #{id}: expected.exit must be 0|2|3|4|5"
          next
        end
        if expected["stdout"] == "exact" && !expected["stdout_exact"].is_a?(String)
          errors << "#{label} #{id}: stdout mode exact requires stdout_exact"
          next
        end
        if expected["stderr"] == "contains" &&
           (!expected["stderr_contains"].is_a?(Array) || expected["stderr_contains"].empty?)
          errors << "#{label} #{id}: stderr mode contains requires non-empty stderr_contains"
          next
        end

        exit_code, out, err = run_renderer_fixture(fixture, default_policy, prompt_template_text)
        counts = { assertions: 0 }
        assert_renderer_fixture(id, exit_code, out, err, expected, errors, counts)
        renderer_assertion_count += counts[:assertions]

        # Determinism: compile-success fixtures must be byte-identical on a
        # second run with the same inputs.
        if category == "valid" && command == "compile" && exit_code.zero?
          _exit2, out2, _err2 = run_renderer_fixture(fixture, default_policy, prompt_template_text)
          renderer_assertion_count += 1
          unless out == out2
            errors << "renderer fixture #{id}: repeated compile must be byte-identical"
          end
        end

        # Finding F06: successful compile outputs with declared yaml_blocks
        # must yield fenced YAML blocks that safe_load with preserved
        # values and types.
        if category == "valid" && command == "compile" && exit_code.zero? &&
           fixture.key?("yaml_blocks")
          ycounts = { assertions: 0 }
          assert_yaml_blocks(id, out, fixture["yaml_blocks"], errors, ycounts)
          renderer_assertion_count += ycounts[:assertions]
        end
        renderer_fixture_count += 1
      end
      duplicates = seen_ids.select { |_id, count| count > 1 }.keys
      unless duplicates.empty?
        errors << "renderer fixtures: duplicate fixture id(s) #{duplicates.inspect}"
      end
    end
  rescue Psych::Exception => e
    errors << "renderer fixtures: file does not parse as YAML (#{e.class})"
  end
end

# ── C1R backward-compatibility proofs ──
# The actual SDLC all-five project policy must keep working and must be
# tuple-equivalent to a selected-only subset policy for the same Capsule.
# Each proof counts as one assertion in the renderer assertion total.

def run_cli_tuple(command, capsule_text, policy_text, git_state, template_text)
  out = StringIO.new
  err = StringIO.new
  exit_code = CompactPrompt::CLI.main(
    [command, "capsule.yaml"],
    cwd: "/synthetic/repo",
    stdout: out,
    stderr: err,
    git_state: git_state,
    capsule_text: capsule_text,
    policy_text: policy_text,
    template_text: template_text
  )
  [exit_code, out.string.bytesize, err.string.bytesize]
end

actual_policy_path = ".ai-sdlc/prompt-policy.yaml"
if File.file?(File.join(ROOT, actual_policy_path)) && prompt_template_text
  actual_policy_text = read_asset(actual_policy_path)
  actual_policy, pclass = CompactPrompt::RestrictedYAML.parse(actual_policy_text)
  if pclass || !actual_policy.is_a?(Hash)
    errors << "compatibility proof: actual SDLC policy does not parse as restricted YAML (#{pclass || 'not a mapping'})"
  else
    # Proof 1: the actual policy declares exactly the five standard profiles.
    renderer_assertion_count += 1
    unless actual_policy["validation_profiles"].is_a?(Hash) &&
           actual_policy["validation_profiles"].keys.sort == CompactPrompt::VALIDATION_PROFILES.sort
      errors << "compatibility proof: actual SDLC policy profile key set must be exactly " \
                "#{CompactPrompt::VALIDATION_PROFILES.inspect}"
    end

    # Proof 2: the actual policy passes revised schema, declared mapping and
    # command resolution, and a supported selected profile resolves.
    renderer_assertion_count += 1
    proof2_diags = CompactPrompt::Policy.validate(actual_policy) +
                   CompactPrompt::Policy.validate_command_ids(actual_policy)
    resolved2, rerr2 = CompactPrompt::Policy.resolve_selected_profile(actual_policy, "LOCAL_BEHAVIOR")
    unless proof2_diags.empty? && rerr2.nil? && resolved2.is_a?(Hash)
      errors << "compatibility proof: actual SDLC policy must pass revised schema/mapping/resolution " \
                "(diags #{proof2_diags.inspect}, resolver #{rerr2.inspect})"
    end

    # Selected-only subset policy: same commands, only LOCAL_BEHAVIOR declared.
    subset_policy = actual_policy.dup
    subset_policy["validation_profiles"] = { "LOCAL_BEHAVIOR" => actual_policy["validation_profiles"]["LOCAL_BEHAVIOR"] }
    subset_text = YAML.dump(subset_policy)

    proof_capsule = <<~CAPSULE
      task_id: c1r-compat-proof
      prompt_mode: MICRO_FIX
      routing:
        recipient: Codex
        paste_location: "acme/widgets 新执行会话"
        report_back_to: "owner-session"
        next_hop_after_report: "owner-session 复核实施报告"
      baseline:
        repository: #{actual_policy["repository"]}
        branch: #{actual_policy["fact_branch"]}
        head: a76775ed54a7d8361eeb57e304af62f854094ebf
        pull_request: none
      objective: "C1R 兼容性证明"
      delta:
        open_findings: []
        required_changes:
          - docs/VALIDATION.md
        acceptance_criteria:
          - "tuple 等价"
        preserved_closed_findings: []
      scope:
        allowed_files:
          - docs/VALIDATION.md
        maximum_changed_files: 1
      validation_profile: LOCAL_BEHAVIOR
      git:
        commit_count: 1
        commit_message: "c1r compat proof"
        push_mode: NORMAL_PUSH
        pull_request_action: CREATE_DRAFT
      forbidden_actions:
        - "rebase"
      completion_report:
        recipient: "owner-session"
        name: "C1R-COMPAT Report"
        maximum_lines: 80
        stop_after_report: true
    CAPSULE

    proof_git = RendererFixtureGitState.new(
      "origin_url" => "https://github.com/#{actual_policy["repository"]}.git",
      "refs" => {
        "refs/heads/#{actual_policy["fact_branch"]}" => "a76775ed54a7d8361eeb57e304af62f854094ebf",
        "refs/remotes/origin/#{actual_policy["fact_branch"]}" => "a76775ed54a7d8361eeb57e304af62f854094ebf"
      },
      "tracked" => [".ai-sdlc/prompt-policy.yaml"]
    )

    # Proof 3: validate tuple equivalence (exit, stdout bytes, stderr bytes).
    renderer_assertion_count += 1
    tuple_all_five = run_cli_tuple("validate", proof_capsule, actual_policy_text, proof_git, prompt_template_text)
    tuple_subset = run_cli_tuple("validate", proof_capsule, subset_text, proof_git, prompt_template_text)
    unless tuple_all_five == tuple_subset
      errors << "compatibility proof: validate tuple must be identical for all-five vs subset policy " \
                "(all-five #{tuple_all_five.inspect}, subset #{tuple_subset.inspect})"
    end

    # Proof 4: compile tuple equivalence.
    renderer_assertion_count += 1
    tuple_all_five = run_cli_tuple("compile", proof_capsule, actual_policy_text, proof_git, prompt_template_text)
    tuple_subset = run_cli_tuple("compile", proof_capsule, subset_text, proof_git, prompt_template_text)
    unless tuple_all_five == tuple_subset
      errors << "compatibility proof: compile tuple must be identical for all-five vs subset policy " \
                "(all-five #{tuple_all_five.inspect}, subset #{tuple_subset.inspect})"
    end
  end
end

# ── F07 diagnostics registry static proof ──
# The registry is the single source of truth for B diagnostic codes, exit
# categories and stable meanings. This block proves:
#   a) every registered code has at least one literal emit site in the
#      shared library (the implementation can actually emit all codes);
#   b) every literal code emitted from the library is registered (no
#      unregistered branch reaches an exit);
#   c) the standard's section 14 table and the registry agree in both
#      directions (code set and exit numbers);
#   d) the CLI has no bare failure-return constant — EXIT_OK is the only
#      exit constant, all failure exits resolve via Diagnostics.exit_for.

lib_text = read_asset("scripts/lib/compact_prompt.rb")
registry = CompactPrompt::Diagnostics::REGISTRY

emit_sites = lib_text.scan(
  /Diagnostics\.(?:format|exit_for)\("([A-Z][A-Z0-9_]{2,})"|\["([A-Z][A-Z0-9_]{2,})",|return "([A-Z][A-Z0-9_]{2,})"|return \[nil, "([A-Z][A-Z0-9_]{2,})"/
).flatten.compact.uniq - %w[CAPSULE_FIELD PCE_01_B_PROJECT_MAPPING STANDARD_CONSTANT]
missing_emit_sites = registry.keys - emit_sites
unless missing_emit_sites.empty?
  errors << "diagnostics: registered code(s) without a literal emit site in the shared library " \
            "#{missing_emit_sites.inspect}"
end
unregistered_emits = emit_sites - registry.keys
unless unregistered_emits.empty?
  errors << "diagnostics: literal code(s) emitted without a registry entry #{unregistered_emits.inspect}"
end

bare_returns = lib_text.scan(/return EXIT_[A-Z_]+/).uniq - ["return EXIT_OK"]
unless bare_returns.empty?
  errors << "diagnostics: bare failure-return constant(s) #{bare_returns.inspect} bypass the registry"
end
exit_constants = lib_text.scan(/EXIT_[A-Z_]+ = /).uniq
unless exit_constants == ["EXIT_OK = "]
  errors << "diagnostics: unexpected exit constant(s) #{exit_constants.inspect}"
end

if standard_text
  standard_table = standard_text.scan(
    /^\| `([A-Z][A-Z0-9_]{2,})` \| ([0-5]) \|/
  ).to_h
  registry.each do |code, entry|
    row_exit = standard_table[code]
    unless row_exit
      errors << "standard: registered diagnostic #{code} is missing from the section 14 table"
      next
    end
    unless row_exit.to_i == entry["exit"]
      errors << "standard: #{code} table exit #{row_exit} does not match registry exit #{entry['exit']}"
    end
  end
  (standard_table.keys - registry.keys).each do |code|
    errors << "standard: diagnostic #{code} in the section 14 table is not registered"
  end
end

# ── Documentation registration without premature claims ──

manifest_path = "manifest.yaml"
roadmap_path = "ROADMAP.md"
validation_doc_path = "docs/VALIDATION.md"
portability_doc_path = "PORTABILITY.md"

{
  manifest_path => %w[
    compact_prompt_standard compact_execution_capsule_template
    compact_codex_prompt_template compact_completion_report_template
    compact_validation_profiles compact_prompt_contract_validator
    compact_prompt_fixtures compact_prompt_shared_library
    compact_prompt_cli compact_prompt_renderer_fixtures
    compact_prompt_project_policy
  ],
  roadmap_path => %w[
    Compact\ Prompt\ Standard\ and\ Lightweight\ Renderer PCE-01-A PCE-01-B PCE-01-C
  ],
  validation_doc_path => [
    "ruby scripts/validate-compact-prompt-contracts.rb", "read-only", "deterministic", "no network"
  ],
  portability_doc_path => %w[
    compact prompt no\ network portable
  ]
}.each do |path, needles|
  next unless File.file?(File.join(ROOT, path))
  text = read_asset(path)
  needles.each do |needle|
    unless text.include?(needle)
      errors << "documentation: #{path} is missing required registration #{needle.inspect}"
    end
  end
end

# Premature claims that must not appear anywhere in the registration
# documents. PCE-01-B may declare the renderer implemented, but must not
# claim PCE-01-C, personal-knowledge-base integration, PCE-01 overall
# completion, source_verified, GRP-01 start or D10-B recovery.
FORBIDDEN_PREMATURE_CLAIMS = [
  "PCE-01 已完成",
  "PCE-01 complete",
  "PCE-01 source_verified",
  "PCE-01-C 已完成",
  "PCE-01-C 已实现",
  "GRP-01 已启动",
  "D10-B 已恢复",
  "PCE-01-B 命令"
].freeze

[manifest_path, roadmap_path, validation_doc_path, portability_doc_path].each do |path|
  next unless File.file?(File.join(ROOT, path))
  text = read_asset(path)
  FORBIDDEN_PREMATURE_CLAIMS.each do |claim|
    if text.include?(claim)
      errors << "documentation: #{path} contains premature claim #{claim.inspect}"
    end
  end
end

# ── F05-A binding-gate blocking proof ──
# The contract validator must not merely call the shared template-binding
# gate and ignore its result. Two in-memory proofs (no files, no shell, no
# template mutation): a duplicated registered placeholder makes the shared
# gate return TEMPLATE_PLACEHOLDER_DUPLICATE, and the validator source
# itself appends the non-nil binding_error to errors — a future
# call-and-ignore regression is statically caught.
binding_dup_template = prompt_template_text && prompt_template_text.sub("<recipient>", "<recipient><recipient>")
binding_dup_error = binding_dup_template &&
                    CompactPrompt::Template.binding_error(binding_dup_template)
if binding_dup_template.nil?
  # Prompt template file missing: the main flow already reports it; do not
  # emit a misleading duplicate-placeholder message here.
elsif !(binding_dup_error && binding_dup_error[0] == "TEMPLATE_PLACEHOLDER_DUPLICATE")
  errors << "F05-A guard: duplicated registered placeholder must yield " \
            "TEMPLATE_PLACEHOLDER_DUPLICATE from the shared binding gate"
end
validator_source = read_asset("scripts/validate-compact-prompt-contracts.rb")
unless validator_source.match?(
  /binding_error = CompactPrompt::Template\.binding_error\(prompt_template_text\)\n\s+if binding_error\n\s+errors <</
)
  errors << "F05-A guard: contract validator must append binding_error to errors " \
            "(call-and-ignore regression detected)"
end

if errors.empty?
  puts "compact prompt contract validation ok " \
       "(#{CompactPrompt::WHITELIST_ASSETS.length} whitelist assets; " \
       "#{fixture_count} contract fixtures; #{renderer_fixture_count} renderer fixtures " \
       "(#{renderer_assertion_count} assertions); " \
       "#{CompactPrompt::PROMPT_MODES.length} prompt modes with exact budgets; " \
       "#{CompactPrompt::VALIDATION_PROFILES.length} validation profiles; " \
       "#{CompactPrompt::Diagnostics::REGISTRY.length} registered diagnostics; " \
       "codex prompt template #{CompactPrompt::CODEX_PROMPT_SECTIONS.length}-section order " \
       "with #{CompactPrompt::Template::CONDITIONAL_FIELDS.values.flatten.length} conditional blocks; " \
       "#{prompt_placeholders ? prompt_placeholders.length : 0} prompt placeholders closed " \
       "against the Template Value Source Table; " \
       "standard asset statically verified (fields, git enums, budgets, profiles, " \
       "continuation delta-only, completion report budget, sections, single material, " \
       "stop_after_report, public classifications); " \
       "diagnostics registry/emit-site/section-14 closed; " \
       "no premature claims)"
else
  warn "compact prompt contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
