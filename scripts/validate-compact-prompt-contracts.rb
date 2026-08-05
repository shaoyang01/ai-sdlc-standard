#!/usr/bin/env ruby
# encoding: utf-8
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
# ai-sdlc/compact-prompt-standard.md section 1.4):
#   UNKNOWN_KEY, MISSING_REQUIRED_FIELD, DUPLICATE_KEY, YAML_ALIAS,
#   YAML_ANCHOR, YAML_TAG, YAML_MERGE_KEY, YAML_NULL,
#   YAML_DOCUMENT_COUNT_INVALID, INVALID_SHA, UNSAFE_PATH,
#   MULTIPLE_OBJECTIVES, VALIDATION_UNDERSPECIFIED,
#   VALIDATION_OVERPROVISIONED, MISSING_STOP_CONDITION, FIELD_TYPE_INVALID
# Internal-only codes (not part of the v1 contract taxonomy):
#   YAML_SYNTAX (unparseable YAML), YAML_UNSUPPORTED (root not a mapping).

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
PUSH_MODES = %w[NONE NORMAL_PUSH].freeze
PULL_REQUEST_ACTIONS = %w[NONE CREATE_DRAFT UPDATE_DRAFT].freeze
MAXIMUM_LINES_RANGE = (20..120).freeze

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
  YAML_TAG YAML_MERGE_KEY YAML_NULL YAML_DOCUMENT_COUNT_INVALID INVALID_SHA
  UNSAFE_PATH MULTIPLE_OBJECTIVES VALIDATION_UNDERSPECIFIED
  VALIDATION_OVERPROVISIONED MISSING_STOP_CONDITION FIELD_TYPE_INVALID
].freeze
INTERNAL_CLASSIFICATIONS = %w[YAML_SYNTAX YAML_UNSUPPORTED].freeze
ALL_CLASSIFICATIONS = (PUBLIC_CLASSIFICATIONS + INTERNAL_CLASSIFICATIONS).freeze

# Fixed Codex prompt template section order.
CODEX_PROMPT_SECTIONS = [
  "1. 路由",
  "2. Exact Baseline",
  "3. 唯一目标",
  "4. Delta",
  "5. Scope 与 Acceptance",
  "6. Validation",
  "7. Git 与 PR",
  "8. Forbidden Actions",
  "9. Completion Report",
  "10. Stop Condition"
].freeze

# Public Compact Completion Report fields (standard section 7).
COMPLETION_REPORT_FIELDS = %w[
  result pre_HEAD post_HEAD commit changed_files change_summary
  local_validation remote_branch_HEAD pull_request CI_status
  scope_violation remaining_findings
].freeze

# PCE-01-A task-specific content that must never appear in the public
# Prompt / Completion Report templates (finding F01).
TASK_SPECIFIC_TEMPLATE_STRINGS = %w[
  PCE_01_A contract_assets fixture_summary
  REQUEST_PCE_01_A_SPECIALIZED_REVIEW
  需要第十一个文件 需要修改现有\ validator 需要修改\ CI\ workflow
  CI_status:\ not_waited
].freeze

# Placeholders with no legitimate source (finding F02); must not appear in
# the public prompt template.
LEGACY_PLACEHOLDERS = %w[
  task-branch objective-scope out-of-scope next-phase out-of-scope-tooling
  scope-escalation-code specialized-review-request-line
].freeze

errors = []
prompt_placeholders = nil

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
    return "MISSING_REQUIRED_FIELD" if list.empty?
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
  return "MISSING_REQUIRED_FIELD" if allowed_files.empty?
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
  return "MISSING_REQUIRED_FIELD" if forbidden_actions.empty?
  forbidden_actions.each do |item|
    return "FIELD_TYPE_INVALID" unless nonempty_string?(item)
  end

  report = data["completion_report"]
  return "FIELD_TYPE_INVALID" unless report.is_a?(Hash)
  result = check_exact_keys(report, COMPLETION_REPORT_KEYS)
  return result if result
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(report["recipient"])
  return "MISSING_REQUIRED_FIELD" unless nonempty_string?(report["name"])
  return "FIELD_TYPE_INVALID" unless report["maximum_lines"].is_a?(Integer)
  return "FIELD_TYPE_INVALID" unless MAXIMUM_LINES_RANGE.cover?(report["maximum_lines"])
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
  # Fail closed on document count: exactly one YAML document is required.
  # Zero-document and multi-document inputs are rejected before any later
  # traversal or YAML.safe_load (finding F06).
  documents = stream.children
  return "YAML_DOCUMENT_COUNT_INVALID" unless documents.length == 1
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
  File.read(File.join(ROOT, path), encoding: "UTF-8")
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
  prompt_lines = File.readlines(File.join(ROOT, prompt_template_path), chomp: true, encoding: "UTF-8")
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
  # Finding F01: no task-specific content in the public template.
  TASK_SPECIFIC_TEMPLATE_STRINGS.each do |needle|
    if prompt_text.include?(needle)
      errors << "codex prompt template: task-specific content must not appear (#{needle.inspect})"
    end
  end
  # Finding F02: no placeholders without a legitimate source.
  LEGACY_PLACEHOLDERS.each do |placeholder|
    if prompt_text.include?("<#{placeholder}>")
      errors << "codex prompt template: legacy placeholder without a source must not appear (<#{placeholder}>)"
    end
  end
  prompt_placeholders = prompt_text.scan(/<[^>\n]+>/).uniq
  duplicate_occurrences = prompt_text.scan(/<[^>\n]+>/).tally.select { |_p, count| count > 1 }
  unless duplicate_occurrences.empty?
    errors << "codex prompt template: placeholder(s) appear more than once " \
              "#{duplicate_occurrences.inspect}"
  end
end

report_template_path = "templates/compact-completion-report-template.md"
if File.file?(File.join(ROOT, report_template_path))
  report_text = read_asset(report_template_path)
  %w[target_lines:\ 30-80 minimum_lines:\ 20 hard_limit_lines:\ 120].each do |needle|
    errors << "completion report template: missing budget #{needle}" unless report_text.include?(needle)
  end
  COMPLETION_REPORT_FIELDS.each do |field|
    unless report_text.include?("#{field}:")
      errors << "completion report template: missing required field #{field}"
    end
  end
  TASK_SPECIFIC_TEMPLATE_STRINGS.each do |needle|
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
  { "root" => ROOT_KEYS,
    "routing" => ROUTING_KEYS,
    "baseline" => BASELINE_KEYS,
    "delta" => DELTA_KEYS,
    "scope" => SCOPE_KEYS,
    "git" => GIT_KEYS,
    "completion_report" => COMPLETION_REPORT_KEYS }.each do |group, keys|
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
  PROMPT_MODE_BUDGETS.each do |mode, budget|
    row = "| `#{mode}` | #{budget["hard_limit_lines"]} | #{budget["hard_limit_bytes"]} |"
    unless standard_text.include?(row)
      errors << "standard: prompt mode budget row #{row.inspect} is missing"
    end
  end

  # Five validation profiles (section 3).
  VALIDATION_PROFILES.each do |profile|
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
  CODEX_PROMPT_SECTIONS.each do |section|
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
  PUBLIC_CLASSIFICATIONS.each do |code|
    unless standard_text.include?("| `#{code}` |")
      errors << "standard: public classification #{code} is not documented"
    end
  end

  # Completion report public field set (section 7) must match the template
  # field set exactly (finding F01).
  COMPLETION_REPORT_FIELDS.each do |field|
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
  duplicate_rows = table_placeholders.tally.select { |_p, count| count > 1 }
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
       "#{prompt_placeholders ? prompt_placeholders.length : 0} prompt placeholders closed " \
       "against the Template Value Source Table; " \
       "standard asset statically verified (fields, git enums, budgets, profiles, " \
       "continuation delta-only, completion report budget, sections, single material, " \
       "stop_after_report, public classifications); " \
       "no premature claims)"
else
  warn "compact prompt contract validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
