#!/usr/bin/env ruby
# frozen_string_literal: true

# Read-only Compact Prompt Contract validator (PCE-01-A).
#
# Boundaries:
#   read_only: true
#   deterministic: true
#   network_access: false
#   filesystem_writes: false
#   shell_execution: false
#
# Verifies the ten PCE-01-A whitelist contract assets, the fixed capsule
# shape, restricted-YAML rejections, exact prompt-mode budgets, exact
# validation-profile semantics, the fixed Codex prompt template section
# order, the completion report template, the centralized fixtures, and that
# manifest / ROADMAP / VALIDATION register facts without premature claims.
#
# Not implemented here: prompt renderer, git operations, command execution
# from capsule content, token counting, project profile resolution, network
# access, file writes.
#
# Public classification codes (contract taxonomy, see
# ai-sdlc/compact-prompt-standard.md):
#   UNKNOWN_KEY, MISSING_REQUIRED_FIELD, DUPLICATE_KEY, YAML_ALIAS,
#   YAML_ANCHOR, YAML_TAG, YAML_MERGE_KEY, YAML_NULL, INVALID_SHA,
#   UNSAFE_PATH, MULTIPLE_OBJECTIVES, VALIDATION_UNDERSPECIFIED,
#   VALIDATION_OVERPROVISIONED, MISSING_STOP_CONDITION
# Internal-only codes (not part of the v1 contract taxonomy):
#   YAML_SYNTAX (unparseable YAML), YAML_UNSUPPORTED (root not a mapping),
#   FIELD_TYPE_INVALID (type or enum violation not covered by a public code).

require "yaml"

ROOT = File.expand_path("..", __dir__)

WHITELIST_ASSETS = %w[
  ai-sdlc/compact-prompt-standard.md
  templates/compact-execution-capsule-template.yaml
  templates/compact-codex-prompt-template.md
  templates/compact-completion-report-template.md
  templates/compact-validation-profiles.yaml
  scripts/validate-compact-prompt-contracts.rb
  fixtures/compact-prompt/contracts.yaml
  manifest.yaml
  ROADMAP.md
  docs/VALIDATION.md
].freeze

# ── Capsule schema ──

ROOT_KEYS = %w[
  task_id prompt_mode routing baseline objective delta scope validation_profile
  git forbidden_actions completion_report
].freeze
ROUTING_KEYS = %w[recipient paste_location report_back_to next_hop_after_report].freeze
BASELINE_KEYS = %w[repository branch head pull_request].freeze
DELTA_KEYS = %w[open_findings required_changes acceptance_criteria preserved_closed_findings].freeze
SCOPE_KEYS = %w[allowed_files maximum_changed_files].freeze
GIT_KEYS = %w[commit_count commit_message push_mode pull_request_action].freeze
COMPLETION_REPORT_KEYS = %w[recipient name maximum_lines stop_after_report].freeze

PROMPT_MODES = %w[MICRO_FIX SESSION_CONTINUATION BOOTSTRAP RECOVERY].freeze
VALIDATION_PROFILES = %w[DOC_ONLY TYPE_ONLY LOCAL_BEHAVIOR PERSISTENCE_CONCURRENCY GLOBAL_CONTRACT].freeze
PUSH_MODES = %w[NORMAL_PUSH NO_PUSH].freeze
PULL_REQUEST_ACTIONS = %w[CREATE_DRAFT NONE].freeze

# Contract-fixed budgets (ai-sdlc/compact-prompt-standard.md section 2).
PROMPT_MODE_BUDGETS = {
  "MICRO_FIX" => { "hard_limit_lines" => 120, "hard_limit_bytes" => 32_768 },
  "SESSION_CONTINUATION" => { "hard_limit_lines" => 220, "hard_limit_bytes" => 65_536 },
  "BOOTSTRAP" => { "hard_limit_lines" => 400, "hard_limit_bytes" => 98_304 },
  "RECOVERY" => { "hard_limit_lines" => 400, "hard_limit_bytes" => 98_304 }
}.freeze

# Contract-fixed validation profile semantics
# (ai-sdlc/compact-prompt-standard.md section 3).
PROFILE_SEMANTICS = {
  "DOC_ONLY" => { "root_npm_test" => "forbidden_by_default" },
  "TYPE_ONLY" => { "require_typecheck" => true },
  "LOCAL_BEHAVIOR" => { "require_focused_tests" => true },
  "PERSISTENCE_CONCURRENCY" => { "require_focused_persistence_and_concurrency_tests" => true },
  "GLOBAL_CONTRACT" => { "allow_full_suite_when_contract_really_shared" => true }
}.freeze

# v1 path-category heuristics (implementation constants, not project profile
# resolution; project-level mapping belongs to PCE-01-B).
DOCUMENTATION_EXTENSIONS = %w[.md .markdown .yaml .yml .json .txt].freeze
CODE_EXTENSIONS = %w[.ts .tsx .js .jsx .rb .py .go .java .sh].freeze

OWNER_NAME_PATTERN = %r{\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\z}
SHA40_PATTERN = /\A[0-9a-f]{40}\z/

PUBLIC_CLASSIFICATIONS = %w[
  UNKNOWN_KEY MISSING_REQUIRED_FIELD DUPLICATE_KEY YAML_ALIAS YAML_ANCHOR
  YAML_TAG YAML_MERGE_KEY YAML_NULL INVALID_SHA UNSAFE_PATH
  MULTIPLE_OBJECTIVES VALIDATION_UNDERSPECIFIED VALIDATION_OVERPROVISIONED
  MISSING_STOP_CONDITION
].freeze
INTERNAL_CLASSIFICATIONS = %w[YAML_SYNTAX YAML_UNSUPPORTED FIELD_TYPE_INVALID].freeze
ALL_CLASSIFICATIONS = (PUBLIC_CLASSIFICATIONS + INTERNAL_CLASSIFICATIONS).freeze

# Fixed Codex prompt template section order.
CODEX_PROMPT_SECTIONS = [
  "1. 路由",
  "2. Exact Baseline",
  "3. 唯一目标",
  "4. Delta",
  "5. Scope 与 Acceptance",
  "6. Validation",
  "7. Git 与 Draft PR",
  "8. Forbidden Actions",
  "9. Completion Report",
  "10. Stop Condition"
].freeze

errors = []

def relative(path)
  path.sub("#{ROOT}/", "")
end

def unsafe_path?(path)
  return true if path.empty?
  return true if path.start_with?("/", "~")
  return true if path.match?(/\A[A-Za-z]:\//) # Windows drive-root absolute path
  return true if path.include?("\\") || path.include?("://")
  path.split("/").include?("..")
end

def path_extension(path)
  File.extname(path.to_s).downcase
end

# ── Restricted-YAML pipeline ──
# Returns [data, classification]. data is the parsed capsule Hash when no
# classification was found, nil otherwise. The pipeline is deterministic and
# performs no I/O beyond reading the caller-provided text.

def analyze_ast(stream)
  # Pass 1: aliases and merge keys. An alias defeats every later check even
  # when the same text also defines an anchor.
  stream.children.each do |document|
    root = document.root
    next if root.nil?
    found = walk_ast_pass1(root)
    return found if found
  end
  # Pass 2: anchors, explicit tags, duplicate keys.
  stream.children.each do |document|
    root = document.root
    next if root.nil?
    found = walk_ast_pass2(root)
    return found if found
  end
  nil
end

def walk_ast_pass1(node)
  case node
  when Psych::Nodes::Alias
    "YAML_ALIAS"
  when Psych::Nodes::Mapping
    node.children.each_slice(2) do |key_node, _value_node|
      if key_node.is_a?(Psych::Nodes::Scalar) && key_node.value == "<<"
        return "YAML_MERGE_KEY"
      end
    end
    node.children.each do |child|
      found = walk_ast_pass1(child)
      return found if found
    end
    nil
  when Psych::Nodes::Sequence
    node.children.each do |child|
      found = walk_ast_pass1(child)
      return found if found
    end
    nil
  when Psych::Nodes::Document
    node.root ? walk_ast_pass1(node.root) : nil
  else
    nil
  end
end

def walk_ast_pass2(node)
  case node
  when Psych::Nodes::Scalar
    return "YAML_ANCHOR" if node.anchor
    return "YAML_TAG" if node.tag
    nil
  when Psych::Nodes::Mapping
    return "YAML_ANCHOR" if node.anchor
    return "YAML_TAG" if node.tag
    keys = []
    node.children.each_slice(2) do |key_node, value_node|
      if key_node.is_a?(Psych::Nodes::Scalar)
        keys << key_node.value
        found = walk_ast_pass2(key_node)
        return found if found
      end
      found = walk_ast_pass2(value_node)
      return found if found
    end
    return "DUPLICATE_KEY" if keys.uniq.length != keys.length
    nil
  when Psych::Nodes::Sequence
    return "YAML_ANCHOR" if node.anchor
    return "YAML_TAG" if node.tag
    node.children.each do |child|
      found = walk_ast_pass2(child)
      return found if found
    end
    nil
  when Psych::Nodes::Document
    node.root ? walk_ast_pass2(node.root) : nil
  else
    nil
  end
end

def reject_nulls(node)
  case node
  when Hash
    node.each_value { |value| return true if reject_nulls(value) }
  when Array
    node.each { |value| return true if reject_nulls(value) }
  when nil
    return true
  end
  false
end

def check_exact_keys(data, allowed)
  unknown = data.keys - allowed
  return "UNKNOWN_KEY" unless unknown.empty?
  missing = allowed - data.keys
  return "MISSING_REQUIRED_FIELD" unless missing.empty?
  nil
end

def nonempty_string?(value)
  value.is_a?(String) && !value.empty?
end

def positive_integer?(value)
  value.is_a?(Integer) && value >= 1
end

# Structural value validation for capsule instances. Returns a classification
# code or nil. Nested key sets are exact; unknown keys, missing required
# fields, unsafe paths, invalid SHAs, multiple objectives and missing stop
# conditions each map to their public classification.
def validate_capsule_structure(data)
  return "YAML_UNSUPPORTED" unless data.is_a?(Hash)

  result = check_exact_keys(data, ROOT_KEYS)
  return result if result

  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(data["task_id"])
  return "FIELD_TYPE_INVALID" unless PROMPT_MODES.include?(data["prompt_mode"])

  routing = data["routing"]
  return "FIELD_TYPE_INVALID" unless routing.is_a?(Hash)
  result = check_exact_keys(routing, ROUTING_KEYS)
  return result if result
  ROUTING_KEYS.each do |key|
    return "MISSING_REQUIRED_FIELD" unless nonempty_string?(routing[key])
  end

  baseline = data["baseline"]
  return "FIELD_TYPE_INVALID" unless baseline.is_a?(Hash)
  result = check_exact_keys(baseline, BASELINE_KEYS)
  return result if result
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(baseline["repository"])
  return "FIELD_TYPE_INVALID" unless baseline["repository"].match?(OWNER_NAME_PATTERN)
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(baseline["branch"])
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(baseline["head"])
  return "INVALID_SHA" unless baseline["head"].match?(SHA40_PATTERN)
  pr = baseline["pull_request"]
  return "FIELD_TYPE_INVALID" unless pr == "none" || (pr.is_a?(Integer) && pr >= 1)

  objective = data["objective"]
  return "MULTIPLE_OBJECTIVES" unless objective.is_a?(String)
  return "MISSING_REQUIRED_FIELD" if objective.empty?

  delta = data["delta"]
  return "FIELD_TYPE_INVALID" unless delta.is_a?(Hash)
  result = check_exact_keys(delta, DELTA_KEYS)
  return result if result

  %w[open_findings preserved_closed_findings].each do |key|
    findings = delta[key]
    return "FIELD_TYPE_INVALID" unless findings.is_a?(Array)
    findings.each do |item|
      return "FIELD_TYPE_INVALID" unless item.is_a?(Hash)
      result = check_exact_keys(item, %w[id status])
      return result if result
      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(item["id"])
      expected_status = key == "open_findings" ? "OPEN" : "CLOSED"
      return "FIELD_TYPE_INVALID" unless item["status"] == expected_status
    end
  end

  %w[required_changes acceptance_criteria].each do |key|
    list = delta[key]
    return "FIELD_TYPE_INVALID" unless list.is_a?(Array)
    list.each do |item|
      return "FIELD_TYPE_INVALID" unless nonempty_string?(item)
    end
  end

  scope = data["scope"]
  return "FIELD_TYPE_INVALID" unless scope.is_a?(Hash)
  result = check_exact_keys(scope, SCOPE_KEYS)
  return result if result
  allowed_files = scope["allowed_files"]
  return "FIELD_TYPE_INVALID" unless allowed_files.is_a?(Array)
  allowed_files.each do |path|
    return "FIELD_TYPE_INVALID" unless nonempty_string?(path)
    return "UNSAFE_PATH" if unsafe_path?(path)
  end
  return "FIELD_TYPE_INVALID" unless positive_integer?(scope["maximum_changed_files"])

  profile = data["validation_profile"]
  return "FIELD_TYPE_INVALID" unless VALIDATION_PROFILES.include?(profile)

  git = data["git"]
  return "FIELD_TYPE_INVALID" unless git.is_a?(Hash)
  result = check_exact_keys(git, GIT_KEYS)
  return result if result
  return "FIELD_TYPE_INVALID" unless git["commit_count"].is_a?(Integer) && [0, 1].include?(git["commit_count"])
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(git["commit_message"])
  return "FIELD_TYPE_INVALID" unless PUSH_MODES.include?(git["push_mode"])
  return "FIELD_TYPE_INVALID" unless PULL_REQUEST_ACTIONS.include?(git["pull_request_action"])

  forbidden_actions = data["forbidden_actions"]
  return "FIELD_TYPE_INVALID" unless forbidden_actions.is_a?(Array)
  forbidden_actions.each do |item|
    return "FIELD_TYPE_INVALID" unless nonempty_string?(item)
  end

  report = data["completion_report"]
  return "FIELD_TYPE_INVALID" unless report.is_a?(Hash)
  result = check_exact_keys(report, COMPLETION_REPORT_KEYS)
  return result if result
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(report["recipient"])
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(report["name"])
  return "FIELD_TYPE_INVALID" unless positive_integer?(report["maximum_lines"])
  return "MISSING_STOP_CONDITION" unless report["stop_after_report"] == true

  # Validation adequacy heuristics (section 3): insufficient level rejected,
  # overprovisioned level rejected, plain documentation tasks never map to a
  # root test suite by default.
  changed_extensions = delta["required_changes"].map { |path| path_extension(path) }
  has_code = changed_extensions.any? { |ext| CODE_EXTENSIONS.include?(ext) }
  case profile
  when "DOC_ONLY"
    return "VALIDATION_UNDERSPECIFIED" if has_code
  when "PERSISTENCE_CONCURRENCY", "GLOBAL_CONTRACT"
    return "VALIDATION_OVERPROVISIONED" unless has_code
  end

  nil
end

# Restricted-YAML stage only: returns the parsed data when clean, otherwise a
# classification String. Templates go through this stage (placeholder values
# are allowed there); capsule instances additionally run
# validate_capsule_structure.
def restricted_yaml_classification(raw_text)
  begin
    stream = Psych.parse_stream(raw_text)
  rescue Psych::SyntaxError
    return "YAML_SYNTAX"
  end
  ast_classification = analyze_ast(stream)
  return ast_classification if ast_classification

  begin
    data = YAML.safe_load(raw_text, permitted_classes: [], aliases: false)
  rescue Psych::BadAlias
    return "YAML_ALIAS"
  rescue Psych::DisallowedClass
    return "YAML_TAG"
  rescue Psych::Exception
    return "YAML_UNSUPPORTED"
  end
  return "YAML_NULL" if reject_nulls(data)
  return "YAML_UNSUPPORTED" if data.nil?

  data
end

# Full capsule pipeline: restricted YAML parsing plus structural validation.
# Returns a classification code or nil when the capsule is valid.
def classify_capsule(raw_text)
  data = restricted_yaml_classification(raw_text)
  return data if data.is_a?(String)

  validate_capsule_structure(data)
end

# Shape-only check for the capsule template: exact key sets plus the two
# contract markers report_back_to and stop_after_report: true. Placeholder
# values are allowed; value rules apply to capsule instances only.
def template_shape_error(data)
  return "template root must be a mapping" unless data.is_a?(Hash)
  result = check_exact_keys(data, ROOT_KEYS)
  return "template root keys must be exactly #{ROOT_KEYS.inspect} (#{result})" if result
  {
    "routing" => ROUTING_KEYS,
    "baseline" => BASELINE_KEYS,
    "delta" => DELTA_KEYS,
    "scope" => SCOPE_KEYS,
    "git" => GIT_KEYS,
    "completion_report" => COMPLETION_REPORT_KEYS
  }.each do |key, allowed|
    section = data[key]
    unless section.is_a?(Hash)
      return "template #{key} must be a mapping"
    end
    result = check_exact_keys(section, allowed)
    if result
      return "template #{key} keys must be exactly #{allowed.inspect} (#{result})"
    end
  end
  unless data["routing"].key?("report_back_to")
    return "template routing must use report_back_to (report_to is forbidden)"
  end
  unless data["completion_report"]["stop_after_report"] == true
    return "template completion_report.stop_after_report must be true"
  end
  nil
end

def check_asset_exists(path)
  errors << "missing whitelist asset #{path}" unless File.file?(File.join(ROOT, path))
end

def read_asset(path)
  File.read(File.join(ROOT, path))
end

# ── Asset checks ──

WHITELIST_ASSETS.each { |path| check_asset_exists(path) }

capsule_template_path = "templates/compact-execution-capsule-template.yaml"
if File.file?(File.join(ROOT, capsule_template_path))
  template_data = restricted_yaml_classification(read_asset(capsule_template_path))
  if template_data.is_a?(String)
    errors << "capsule template: rejected by restricted-YAML rules (#{template_data})"
  else
    shape_error = template_shape_error(template_data)
    errors << "capsule template: #{shape_error}" if shape_error
  end
end

profiles_path = "templates/compact-validation-profiles.yaml"
if File.file?(File.join(ROOT, profiles_path))
  profiles_data = restricted_yaml_classification(read_asset(profiles_path))
  if profiles_data.is_a?(String)
    errors << "validation profiles template: rejected by restricted-YAML rules (#{profiles_data})"
  else
    unless profiles_data.is_a?(Hash) && profiles_data.keys == ["validation_profiles"]
      errors << "validation profiles template: root must contain exactly validation_profiles"
    end
    profiles = profiles_data.is_a?(Hash) ? profiles_data["validation_profiles"] : nil
    unless profiles.is_a?(Hash) && profiles.keys.sort == VALIDATION_PROFILES.sort
      errors << "validation profiles template: profile set must be exactly #{VALIDATION_PROFILES.inspect}"
    end
    if profiles.is_a?(Hash)
      PROFILE_SEMANTICS.each do |name, semantics|
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
if File.file?(File.join(ROOT, prompt_template_path))
  prompt_lines = File.readlines(File.join(ROOT, prompt_template_path), chomp: true)
  headings = prompt_lines.grep(/\A## \d+\. /).map { |line| line.sub(/\A## /, "") }
  if headings != CODEX_PROMPT_SECTIONS
    errors << "codex prompt template: section headings must be exactly " \
              "#{CODEX_PROMPT_SECTIONS.inspect}, found #{headings.inspect}"
  end
  prompt_text = prompt_lines.join("\n")
  delivery_count = prompt_text.scan("delivery_type: CODEX_EXECUTION_PROMPT").length
  errors << "codex prompt template: delivery_type: CODEX_EXECUTION_PROMPT must appear exactly once " \
            "(found #{delivery_count})" unless delivery_count == 1
  errors << "codex prompt template: must generate exactly one CODEX_EXECUTION_PROMPT material" \
    unless prompt_text.scan(/^delivery_type:/).length == 1
  %w[recipient: paste_location: purpose: report_back_to: next_hop_after_report:].each do |needle|
    unless prompt_text.include?(needle)
      errors << "codex prompt template: routing header is missing #{needle}"
    end
  end
  %w[completion_report_recipient: completion_report_name: stop_after_report:\ true].each do |needle|
    unless prompt_text.include?(needle)
      errors << "codex prompt template: footer is missing #{needle}"
    end
  end
  if prompt_text.scan("report_to:").any?
    errors << "codex prompt template: must not use report_to"
  end
end

report_template_path = "templates/compact-completion-report-template.md"
if File.file?(File.join(ROOT, report_template_path))
  report_text = read_asset(report_template_path)
  %w[target_lines:\ 30-80 hard_limit_lines:\ 120].each do |needle|
    errors << "completion report template: missing budget #{needle}" unless report_text.include?(needle)
  end
  %w[
    result: pre_HEAD: post_HEAD: commit: changed_files: contract_assets:
    fixture_summary: local_validation: remote_branch_HEAD: Draft_PR:
    CI_status: scope_violation: remaining_findings:
    REQUEST_PCE_01_A_SPECIALIZED_REVIEW
  ].each do |needle|
    unless report_text.include?(needle)
      errors << "completion report template: missing required field #{needle}"
    end
  end
end

# ── Fixtures ──

fixtures_path = "fixtures/compact-prompt/contracts.yaml"
fixture_count = 0
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
        classification = classify_capsule(capsule_text)
        if category == "valid"
          if classification
            errors << "#{label} #{id}: expected PASS but was rejected as #{classification}"
          else
            fixture_count += 1
          end
        else
          expected = fixture["expected_classification"]
          unless PUBLIC_CLASSIFICATIONS.include?(expected)
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

# ── Documentation registration without premature claims ──

manifest_path = "manifest.yaml"
roadmap_path = "ROADMAP.md"
validation_doc_path = "docs/VALIDATION.md"

{
  manifest_path => %w[
    compact_prompt_standard compact_execution_capsule_template
    compact_codex_prompt_template compact_completion_report_template
    compact_validation_profiles compact_prompt_contract_validator
    compact_prompt_fixtures
  ],
  roadmap_path => %w[
    Compact\ Prompt\ Standard\ and\ Lightweight\ Renderer PCE-01-A PCE-01-B PCE-01-C
  ],
  validation_doc_path => [
    "ruby scripts/validate-compact-prompt-contracts.rb", "read-only", "deterministic", "no network"
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

# Premature claims that must not appear anywhere in the three registration
# documents (PCE-01-A section 13).
FORBIDDEN_PREMATURE_CLAIMS = [
  "Renderer 已实现",
  "renderer implemented",
  "PCE-01 已完成",
  "PCE-01 complete",
  "PCE-01 source_verified",
  "GRP-01 已启动",
  "D10-B 已恢复",
  "PCE-01-B 命令"
].freeze

[manifest_path, roadmap_path, validation_doc_path].each do |path|
  next unless File.file?(File.join(ROOT, path))
  text = read_asset(path)
  FORBIDDEN_PREMATURE_CLAIMS.each do |claim|
    if text.include?(claim)
      errors << "documentation: #{path} contains premature claim #{claim.inspect}"
    end
  end
end

if errors.empty?
  puts "compact prompt contract validation ok " \
       "(#{WHITELIST_ASSETS.length} whitelist assets; #{fixture_count} fixtures verified; " \
       "#{PROMPT_MODES.length} prompt modes with exact budgets; " \
       "#{VALIDATION_PROFILES.length} validation profiles; " \
       "codex prompt template #{CODEX_PROMPT_SECTIONS.length}-section order; " \
       "no premature claims)"
else
  warn "compact prompt contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
