#!/usr/bin/env ruby
# encoding: utf-8
# frozen_string_literal: true

# Compact Prompt shared library (PCE-01-B).
#
# Single implementation for: PCE-01-A contract constants, restricted YAML,
# capsule / project policy / template validation, checkout-independent
# read-only Git adapter, deterministic renderer, prompt budget gate,
# stable diagnostics and the CLI service layer.
#
# Boundaries:
#   read_only: true (when git_state is injected; the default GitAdapter
#     shells out to `git` with fixed argv via Open3, no shell, no network)
#   deterministic: true
#   network_access: false
#   git_fetch_performed: false
#   live_GitHub_HEAD_guaranteed: false
#
# The CLI executable (`scripts/ai-sdlc-prompt.rb`) is responsible only for
# argv, real file reads, stdout/stderr and exit codes; all contract logic
# lives here. `scripts/validate-compact-prompt-contracts.rb` requires this
# library and must not duplicate schema, budget, enum, placeholder or
# renderer logic.

require "yaml"
require "shellwords"
require "open3"

module CompactPrompt
  ROOT = File.expand_path("../..", __dir__).freeze

  # ── PCE-01-A contract constants ──

  # Contract asset existence list checked by the validator (A ten assets
  # plus the PCE-01-B shared library, CLI, renderer fixtures, project
  # policy, PORTABILITY doc and CI workflow).
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
    scripts/lib/compact_prompt.rb
    scripts/ai-sdlc-prompt.rb
    fixtures/compact-prompt/renderer.yaml
    .ai-sdlc/prompt-policy.yaml
    PORTABILITY.md
    .github/workflows/ci.yml
  ].freeze

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

  PROMPT_MODE_BUDGETS = {
    "MICRO_FIX" => { "hard_limit_lines" => 120, "hard_limit_bytes" => 32_768 },
    "SESSION_CONTINUATION" => { "hard_limit_lines" => 220, "hard_limit_bytes" => 65_536 },
    "BOOTSTRAP" => { "hard_limit_lines" => 400, "hard_limit_bytes" => 98_304 },
    "RECOVERY" => { "hard_limit_lines" => 400, "hard_limit_bytes" => 98_304 }
  }.freeze

  PROFILE_SEMANTICS = {
    "DOC_ONLY" => { "root_npm_test" => "forbidden_by_default" },
    "TYPE_ONLY" => { "require_typecheck" => true },
    "LOCAL_BEHAVIOR" => { "require_focused_tests" => true },
    "PERSISTENCE_CONCURRENCY" => { "require_focused_persistence_and_concurrency_tests" => true },
    "GLOBAL_CONTRACT" => { "allow_full_suite_when_contract_really_shared" => true }
  }.freeze

  DOCUMENTATION_EXTENSIONS = %w[.md .markdown .yaml .yml .json .txt].freeze
  CODE_EXTENSIONS = %w[.ts .tsx .js .jsx .rb .py .go .java .sh].freeze

  OWNER_NAME_PATTERN = %r{\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\z}
  SHA40_PATTERN = /\A[0-9a-f]{40}\z/
  COMMAND_ID_PATTERN = /\A[A-Z][A-Z0-9_]{0,63}\z/

  PUBLIC_CLASSIFICATIONS = %w[
    UNKNOWN_KEY MISSING_REQUIRED_FIELD DUPLICATE_KEY YAML_ALIAS YAML_ANCHOR
    YAML_TAG YAML_MERGE_KEY YAML_NULL YAML_DOCUMENT_COUNT_INVALID INVALID_SHA
    UNSAFE_PATH MULTIPLE_OBJECTIVES VALIDATION_UNDERSPECIFIED
    VALIDATION_OVERPROVISIONED MISSING_STOP_CONDITION FIELD_TYPE_INVALID
  ].freeze
  INTERNAL_CLASSIFICATIONS = %w[YAML_SYNTAX YAML_UNSUPPORTED].freeze
  ALL_CLASSIFICATIONS = (PUBLIC_CLASSIFICATIONS + INTERNAL_CLASSIFICATIONS).freeze

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

  COMPLETION_REPORT_FIELDS = %w[
    result pre_HEAD post_HEAD commit changed_files change_summary
    local_validation remote_branch_HEAD pull_request CI_status
    scope_violation remaining_findings
  ].freeze

  TASK_SPECIFIC_TEMPLATE_STRINGS = %w[
    PCE_01_A contract_assets fixture_summary
    REQUEST_PCE_01_A_SPECIALIZED_REVIEW
    需要第十一个文件 需要修改现有\ validator 需要修改\ CI\ workflow
    CI_status:\ not_waited
  ].freeze

  LEGACY_PLACEHOLDERS = %w[
    task-branch objective-scope out-of-scope next-phase out-of-scope-tooling
    scope-escalation-code specialized-review-request-line
  ].freeze

  # Template Value Source Table (standard section 6): every public prompt
  # placeholder binds to exactly one source.
  PLACEHOLDER_SOURCES = {
    "<recipient>" => ["CAPSULE_FIELD", "routing.recipient"],
    "<paste-location>" => ["CAPSULE_FIELD", "routing.paste_location"],
    "<purpose>" => ["CAPSULE_FIELD", "objective"],
    "<report-back-to>" => ["CAPSULE_FIELD", "routing.report_back_to"],
    "<next-hop-after-report>" => ["CAPSULE_FIELD", "routing.next_hop_after_report"],
    "<repository>" => ["CAPSULE_FIELD", "baseline.repository"],
    "<fact-branch>" => ["CAPSULE_FIELD", "baseline.branch"],
    "<fact-head>" => ["CAPSULE_FIELD", "baseline.head"],
    "<pull-request>" => ["CAPSULE_FIELD", "baseline.pull_request"],
    "<objective>" => ["CAPSULE_FIELD", "objective"],
    "<open-findings>" => ["CAPSULE_FIELD", "delta.open_findings"],
    "<required-changes>" => ["CAPSULE_FIELD", "delta.required_changes"],
    "<acceptance-criteria>" => ["CAPSULE_FIELD", "delta.acceptance_criteria"],
    "<preserved-closed-findings>" => ["CAPSULE_FIELD", "delta.preserved_closed_findings"],
    "<allowed-files>" => ["CAPSULE_FIELD", "scope.allowed_files"],
    "<maximum-changed-files>" => ["CAPSULE_FIELD", "scope.maximum_changed_files"],
    "<validation-profile>" => ["CAPSULE_FIELD", "validation_profile"],
    "<required-commands>" => ["PCE_01_B_PROJECT_MAPPING", "validation_profiles.<profile>.required_command_ids"],
    "<forbidden-commands>" => ["PCE_01_B_PROJECT_MAPPING", "validation_profiles.<profile>.forbidden_command_ids"],
    "<commit-count>" => ["CAPSULE_FIELD", "git.commit_count"],
    "<commit-message>" => ["CAPSULE_FIELD", "git.commit_message"],
    "<push-mode>" => ["CAPSULE_FIELD", "git.push_mode"],
    "<pull-request-action>" => ["CAPSULE_FIELD", "git.pull_request_action"],
    "<forbidden-actions>" => ["CAPSULE_FIELD", "forbidden_actions"],
    "<completion-report-name>" => ["CAPSULE_FIELD", "completion_report.name"],
    "<completion-report-maximum-lines>" => ["CAPSULE_FIELD", "completion_report.maximum_lines"],
    "<completion-report-recipient>" => ["CAPSULE_FIELD", "completion_report.recipient"]
  }.freeze

  # ── Restricted YAML ──

  module RestrictedYAML
    module_function

    # Returns [data, nil] when the text is a single clean restricted-YAML
    # document, or [nil, classification] otherwise. The document-count check
    # runs first: zero and multi-document inputs are rejected before any
    # traversal or YAML.safe_load.
    def parse(raw_text)
      begin
        stream = Psych.parse_stream(raw_text)
      rescue Psych::SyntaxError
        return [nil, "YAML_SYNTAX"]
      end
      documents = stream.children
      return [nil, "YAML_DOCUMENT_COUNT_INVALID"] unless documents.length == 1
      ast_classification = analyze_ast(stream)
      return [nil, ast_classification] if ast_classification
      begin
        data = YAML.safe_load(raw_text, permitted_classes: [], aliases: false)
      rescue Psych::BadAlias
        return [nil, "YAML_ALIAS"]
      rescue Psych::DisallowedClass
        return [nil, "YAML_TAG"]
      rescue Psych::Exception
        return [nil, "YAML_UNSUPPORTED"]
      end
      return [nil, "YAML_NULL"] if reject_nulls(data)
      return [nil, "YAML_UNSUPPORTED"] if data.nil?
      [data, nil]
    end

    def analyze_ast(stream)
      stream.children.each do |document|
        root = document.root
        next if root.nil?
        found = walk_pass1(root)
        return found if found
      end
      stream.children.each do |document|
        root = document.root
        next if root.nil?
        found = walk_pass2(root)
        return found if found
      end
      nil
    end

    def walk_pass1(node)
      case node
      when Psych::Nodes::Alias
        "YAML_ALIAS"
      when Psych::Nodes::Mapping
        node.children.each_slice(2) do |key_node, _value_node|
          return "YAML_MERGE_KEY" if key_node.is_a?(Psych::Nodes::Scalar) && key_node.value == "<<"
        end
        node.children.each do |child|
          found = walk_pass1(child)
          return found if found
        end
        nil
      when Psych::Nodes::Sequence
        node.children.each do |child|
          found = walk_pass1(child)
          return found if found
        end
        nil
      when Psych::Nodes::Document
        node.root ? walk_pass1(node.root) : nil
      else
        nil
      end
    end

    def walk_pass2(node)
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
            found = walk_pass2(key_node)
            return found if found
          end
          found = walk_pass2(value_node)
          return found if found
        end
        return "DUPLICATE_KEY" if keys.uniq.length != keys.length
        nil
      when Psych::Nodes::Sequence
        return "YAML_ANCHOR" if node.anchor
        return "YAML_TAG" if node.tag
        node.children.each do |child|
          found = walk_pass2(child)
          return found if found
        end
        nil
      when Psych::Nodes::Document
        node.root ? walk_pass2(node.root) : nil
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
  end

  # ── Capsule structural validation (PCE-01-A) ──

  module Capsule
    module_function

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

    def unsafe_path?(path)
      return true if path.empty?
      return true if path.start_with?("/", "~")
      return true if path.match?(/\A[A-Za-z]:\//)
      return true if path.include?("\\") || path.include?("://")
      path.split("/").include?("..")
    end

    def path_extension(path)
      File.extname(path.to_s).downcase
    end

    # Returns a classification code or nil when structurally valid.
    def validate(data)
      return "YAML_UNSUPPORTED" unless data.is_a?(Hash)

      result = check_exact_keys(data, CompactPrompt::ROOT_KEYS)
      return result if result

      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(data["task_id"])
      return "FIELD_TYPE_INVALID" unless CompactPrompt::PROMPT_MODES.include?(data["prompt_mode"])

      routing = data["routing"]
      return "FIELD_TYPE_INVALID" unless routing.is_a?(Hash)
      result = check_exact_keys(routing, CompactPrompt::ROUTING_KEYS)
      return result if result
      CompactPrompt::ROUTING_KEYS.each do |key|
        return "MISSING_REQUIRED_FIELD" unless nonempty_string?(routing[key])
      end

      baseline = data["baseline"]
      return "FIELD_TYPE_INVALID" unless baseline.is_a?(Hash)
      result = check_exact_keys(baseline, CompactPrompt::BASELINE_KEYS)
      return result if result
      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(baseline["repository"])
      return "FIELD_TYPE_INVALID" unless baseline["repository"].match?(CompactPrompt::OWNER_NAME_PATTERN)
      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(baseline["branch"])
      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(baseline["head"])
      return "INVALID_SHA" unless baseline["head"].match?(CompactPrompt::SHA40_PATTERN)
      pr = baseline["pull_request"]
      return "FIELD_TYPE_INVALID" unless pr == "none" || (pr.is_a?(Integer) && pr >= 1)

      objective = data["objective"]
      return "MULTIPLE_OBJECTIVES" unless objective.is_a?(String)
      return "MISSING_REQUIRED_FIELD" if objective.empty?

      delta = data["delta"]
      return "FIELD_TYPE_INVALID" unless delta.is_a?(Hash)
      result = check_exact_keys(delta, CompactPrompt::DELTA_KEYS)
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
      result = check_exact_keys(scope, CompactPrompt::SCOPE_KEYS)
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
      return "FIELD_TYPE_INVALID" unless CompactPrompt::VALIDATION_PROFILES.include?(profile)

      git = data["git"]
      return "FIELD_TYPE_INVALID" unless git.is_a?(Hash)
      result = check_exact_keys(git, CompactPrompt::GIT_KEYS)
      return result if result
      return "FIELD_TYPE_INVALID" unless git["commit_count"].is_a?(Integer) && [0, 1].include?(git["commit_count"])
      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(git["commit_message"])
      return "FIELD_TYPE_INVALID" unless CompactPrompt::PUSH_MODES.include?(git["push_mode"])
      return "FIELD_TYPE_INVALID" unless CompactPrompt::PULL_REQUEST_ACTIONS.include?(git["pull_request_action"])

      forbidden_actions = data["forbidden_actions"]
      return "FIELD_TYPE_INVALID" unless forbidden_actions.is_a?(Array)
      return "MISSING_REQUIRED_FIELD" if forbidden_actions.empty?
      forbidden_actions.each do |item|
        return "FIELD_TYPE_INVALID" unless nonempty_string?(item)
      end

      report = data["completion_report"]
      return "FIELD_TYPE_INVALID" unless report.is_a?(Hash)
      result = check_exact_keys(report, CompactPrompt::COMPLETION_REPORT_KEYS)
      return result if result
      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(report["recipient"])
      return "MISSING_REQUIRED_FIELD" unless nonempty_string?(report["name"])
      return "FIELD_TYPE_INVALID" unless report["maximum_lines"].is_a?(Integer)
      return "FIELD_TYPE_INVALID" unless CompactPrompt::MAXIMUM_LINES_RANGE.cover?(report["maximum_lines"])
      return "MISSING_STOP_CONDITION" unless report["stop_after_report"] == true

      changed_extensions = delta["required_changes"].map { |path| path_extension(path) }
      has_code = changed_extensions.any? { |ext| CompactPrompt::CODE_EXTENSIONS.include?(ext) }
      case profile
      when "DOC_ONLY"
        return "VALIDATION_UNDERSPECIFIED" if has_code
      when "PERSISTENCE_CONCURRENCY", "GLOBAL_CONTRACT"
        return "VALIDATION_OVERPROVISIONED" unless has_code
      end

      nil
    end
  end

  # ── Project policy validation (PCE-01-B) ──

  module Policy
    module_function

    POLICY_ROOT_KEYS = %w[schema project_id repository fact_branch commands validation_profiles].freeze
    PROFILE_KEYS = %w[required_command_ids forbidden_command_ids].freeze

    # Returns an array of [code, path, message] diagnostics; empty = valid.
    def validate(data)
      diags = []
      return [["POLICY_SCHEMA_INVALID", "root", "policy root must be a mapping"]] unless data.is_a?(Hash)

      unknown = data.keys - POLICY_ROOT_KEYS
      diags << ["POLICY_SCHEMA_INVALID", "root", "unknown key(s) #{unknown.join(', ')}"] unless unknown.empty?
      missing = POLICY_ROOT_KEYS - data.keys
      diags << ["POLICY_SCHEMA_INVALID", "root", "missing key(s) #{missing.join(', ')}"] unless missing.empty?
      return diags unless diags.empty?

      unless data["schema"] == "compact-prompt-project-policy-v1"
        diags << ["POLICY_SCHEMA_INVALID", "schema", "schema must be compact-prompt-project-policy-v1"]
      end
      unless CompactPrompt::Capsule.nonempty_string?(data["project_id"])
        diags << ["POLICY_SCHEMA_INVALID", "project_id", "must be a non-empty string"]
      end
      unless data["repository"].is_a?(String) && data["repository"].match?(CompactPrompt::OWNER_NAME_PATTERN)
        diags << ["POLICY_SCHEMA_INVALID", "repository", "must be owner/name"]
      end
      branch = data["fact_branch"]
      unless branch.is_a?(String) && !branch.empty? && !branch.match?(/[\s~^:?*\[\\]/) && !branch.start_with?("-", "/") && !branch.end_with?("/") && !branch.include?("..") && branch != "@"
        diags << ["POLICY_SCHEMA_INVALID", "fact_branch", "must be a valid git branch name"]
      end

      commands = data["commands"]
      unless commands.is_a?(Hash)
        diags << ["POLICY_SCHEMA_INVALID", "commands", "must be a mapping"]
        return diags
      end
      commands.each do |id, spec|
        unless id.is_a?(String) && id.match?(CompactPrompt::COMMAND_ID_PATTERN)
          diags << ["POLICY_SCHEMA_INVALID", "commands", "command id #{id.inspect} must match [A-Z][A-Z0-9_]{0,63}"]
          next
        end
        unless spec.is_a?(Hash) && spec.keys == ["argv"]
          diags << ["POLICY_SCHEMA_INVALID", "commands.#{id}", "must be exactly {argv: [...]}"]
          next
        end
        argv = spec["argv"]
        unless argv.is_a?(Array) && !argv.empty?
          diags << ["POLICY_SCHEMA_INVALID", "commands.#{id}.argv", "must be a non-empty array of strings"]
          next
        end
        argv.each_with_index do |arg, index|
          unless arg.is_a?(String) && !arg.empty? && !arg.match?(/[\x00\r\n]/)
            diags << ["POLICY_SCHEMA_INVALID", "commands.#{id}.argv[#{index}]",
                      "must be a non-empty single-line string without NUL/CR/LF"]
          end
        end
      end

      profiles = data["validation_profiles"]
      unless profiles.is_a?(Hash)
        diags << ["POLICY_SCHEMA_INVALID", "validation_profiles", "must be a mapping"]
        return diags
      end
      missing_profiles = CompactPrompt::VALIDATION_PROFILES - profiles.keys
      unless missing_profiles.empty?
        diags << ["POLICY_PROFILE_MAPPING_MISSING", "validation_profiles",
                  "missing profile(s) #{missing_profiles.join(', ')}"]
      end
      unknown_profiles = profiles.keys - CompactPrompt::VALIDATION_PROFILES
      unless unknown_profiles.empty?
        diags << ["POLICY_SCHEMA_INVALID", "validation_profiles",
                  "unknown profile(s) #{unknown_profiles.join(', ')}"]
      end

      CompactPrompt::VALIDATION_PROFILES.each do |name|
        profile = profiles[name]
        unless profile.is_a?(Hash)
          diags << ["POLICY_PROFILE_MAPPING_MISSING", "validation_profiles.#{name}", "profile mapping missing"]
          next
        end
        unless profile.keys.all? { |key| key.is_a?(String) } && profile.keys.sort == PROFILE_KEYS.sort
          diags << ["POLICY_SCHEMA_INVALID", "validation_profiles.#{name}",
                    "must have exactly required_command_ids and forbidden_command_ids"]
          next
        end
        required = profile["required_command_ids"]
        forbidden = profile["forbidden_command_ids"]
        unless required.is_a?(Array) && !required.empty?
          diags << ["POLICY_PROFILE_MAPPING_MISSING", "validation_profiles.#{name}.required_command_ids",
                    "must be a non-empty array of registered command ids"]
          next
        end
        unless forbidden.is_a?(Array)
          diags << ["POLICY_SCHEMA_INVALID", "validation_profiles.#{name}.forbidden_command_ids",
                    "must be an array of registered command ids"]
          next
        end
        %w[required_command_ids forbidden_command_ids].each do |list_key|
          list = profile[list_key]
          next unless list.is_a?(Array)
          # Ruby 2.6-compatible occurrence count (Array#tally is 2.7+).
          list_counts = list.each_with_object(Hash.new(0)) { |id, h| h[id] += 1 }
          duplicates = list_counts.select { |_id, count| count > 1 }.keys
          unless duplicates.empty?
            diags << ["POLICY_COMMAND_CONFLICT", "validation_profiles.#{name}.#{list_key}",
                      "duplicate id(s) #{duplicates.join(', ')}"]
          end
        end
        overlap = required & forbidden
        unless overlap.empty?
          diags << ["POLICY_COMMAND_CONFLICT", "validation_profiles.#{name}",
                    "required/forbidden overlap #{overlap.join(', ')}"]
        end
        (required + forbidden).each do |id|
          unless commands.key?(id)
            diags << ["POLICY_COMMAND_ID_UNKNOWN", "validation_profiles.#{name}",
                      "command id #{id.inspect} is not registered in commands"]
          end
        end
        if name == "DOC_ONLY"
          if required.include?("ROOT_NPM_TEST")
            diags << ["DOC_ONLY_ROOT_NPM_TEST_FORBIDDEN", "validation_profiles.DOC_ONLY.required_command_ids",
                      "DOC_ONLY must not require ROOT_NPM_TEST"]
          end
          required.each do |id|
            argv = commands[id].is_a?(Hash) ? commands[id]["argv"] : nil
            if argv == ["npm", "test"] || argv == ["npm", "run", "test"]
              diags << ["DOC_ONLY_ROOT_NPM_TEST_FORBIDDEN", "validation_profiles.DOC_ONLY.required_command_ids",
                        "DOC_ONLY must not resolve to root npm test (command #{id})"]
            end
          end
        end
      end

      diags
    end
  end

  # ── Injection-safe single-line encoding (finding F06) ──
  #
  # Every Capsule/Policy user string that enters a rendered prompt passes
  # through Safety.encode first. The encoding is deterministic, preserves
  # semantics (never silently drops characters) and renders CR, LF, tab,
  # NUL, other control characters plus `<`, `>`, `&` as visible escapes so
  # no second delivery_type, heading/YAML control line, extra material,
  # placeholder, WHEN/ENDWHEN marker or raw CR byte can be injected.

  module Safety
    module_function

    # Deterministic visible single-line escape:
    #   CR -> \r  LF -> \n  TAB -> \t  NUL -> \0
    #   other C0 controls and DEL -> \xNN (uppercase hex)
    #   < -> \<  > -> \>  & -> \&
    def encode(value)
      value.to_s.each_char.map do |ch|
        case ch
        when "\r" then "\\r"
        when "\n" then "\\n"
        when "\t" then "\\t"
        when "\0" then "\\0"
        when "<" then "\\<"
        when ">" then "\\>"
        when "&" then "\\&"
        else
          ch.ord < 0x20 || ch.ord == 0x7f ? format("\\x%02X", ch.ord) : ch
        end
      end.join
    end
  end

  # ── Git branch-name rules (finding F04) ──
  #
  # Deterministic pure-Ruby approximation of git check-ref-format core
  # rules. The real GitAdapter shells out to `git check-ref-format --branch`
  # (the authority); synthetic git state used by renderer fixtures applies
  # these same rules so branch validity is expressed identically without a
  # git binary. Exact full-ref lookup is a separate concern
  # (`exact_ref_head` / show-ref).

  module GitNames
    module_function

    def valid_branch?(name)
      return false unless name.is_a?(String) && !name.empty?
      return false if name.start_with?("/") || name.end_with?("/")
      return false if name.include?("//") || name.include?("..") || name.include?("@{")
      return false if name.end_with?(".") || name.end_with?(".lock")
      return false if name == "@"
      return false if name.match?(/[\x00-\x1f\x7f ~^:?*\[\\]/)
      true
    end
  end

  # ── Checkout-independent read-only Git adapter ──

  class GitAdapter
    # All invocations use fixed argv with Open3.capture3 (no shell, no
    # network, no fetch, no ls-remote). Remote-tracking refs are only a
    # locally pre-fetched cache; this adapter never claims online freshness.
    def repository_root(cwd)
      out, _err, status = Open3.capture3("git", "-C", cwd, "rev-parse", "--show-toplevel")
      status.success? ? out.strip : nil
    end

    def origin_url(root)
      out, _err, status = Open3.capture3("git", "-C", root, "config", "--get", "remote.origin.url")
      status.success? ? out.strip : nil
    end

    def tracked?(root, rel_path)
      _out, _err, status = Open3.capture3("git", "-C", root, "ls-files", "--error-unmatch", "--", rel_path)
      status.success?
    end

    # Branch-name validity is decided by `git check-ref-format --branch`
    # with a fixed argv (no shell, no network, no reflog/revision
    # expression interpretation). `git rev-parse <ref>` is never used as a
    # named-ref authority (finding F04).
    def branch_valid?(name)
      out, _err, status = Open3.capture3("git", "check-ref-format", "--branch", name)
      status.success? && out.strip == name
    end

    # Exact full-ref lookup only: `git show-ref --verify --hash` resolves
    # refs/heads/<branch> and refs/remotes/origin/<branch> as literal refs,
    # never as revision expressions (finding F04).
    def exact_ref_head(root, ref)
      out, _err, status = Open3.capture3("git", "-C", root, "show-ref", "--verify", "--hash", ref)
      status.success? && out.strip.match?(CompactPrompt::SHA40_PATTERN) ? out.strip : nil
    end
  end

  module GitBaseline
    module_function

    # Locked origin forms (finding F03): only these three github.com forms
    # with an optional trailing `.git` are accepted. Owner and repo are
    # restricted to GitHub's character set, which excludes `?`, `#`, `@`,
    # `:`, `/`, whitespace and all control characters, so userinfo, query,
    # fragment, extra path segments, file URLs, custom SSH aliases and
    # ambiguous scp-like URLs cannot reach identity extraction.
    GITHUB_ORIGIN_PATTERNS = [
      %r{\Ahttps://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)\.git\z},
      %r{\Ahttps://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)\z},
      %r{\Agit@github\.com:([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)\.git\z},
      %r{\Agit@github\.com:([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)\z},
      %r{\Assh://git@github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)\.git\z},
      %r{\Assh://git@github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)\z}
    ].freeze

    # Fixed generic message: never echoes the URL, suspect segments,
    # username, password, token, query or fragment (finding F03).
    ORIGIN_UNSUPPORTED_MESSAGE =
      "origin url is not a supported github.com url (https://github.com/<owner>/<repo>[.git], " \
      "git@github.com:<owner>/<repo>[.git], ssh://git@github.com/<owner>/<repo>[.git])"

    # Fixed generic message for the three-way closure; no concrete identity
    # values are echoed (finding F02/F03).
    IDENTITY_MISMATCH_MESSAGE =
      "capsule baseline.repository, policy repository and normalized origin identity must agree"

    # Returns [owner, repo] or nil. Control characters are rejected before
    # any pattern matching; the anchored patterns then guarantee that the
    # extracted identity can never contain a URL part.
    def parse_origin(url)
      return nil unless url.is_a?(String) && !url.empty?
      return nil if url.match?(/[\x00-\x1f\x7f]/)
      GITHUB_ORIGIN_PATTERNS.each do |pattern|
        match = url.match(pattern)
        return [match[1], match[2]] if match
      end
      nil
    end

    # GitHub owner/repo identity comparison is case-insensitive
    # (finding F02). `repo` is validated as owner/name upstream in both
    # Capsule and Policy validation.
    def identity_match?(identity, repo)
      repo.is_a?(String) && !repo.empty? &&
        identity.map(&:downcase) == repo.downcase.split("/", 2)
    end

    # Returns [code, path, message] or nil when the baseline preflight passes.
    def check(capsule, policy, git_state, cwd)
      root = git_state.repository_root(cwd)
      return ["GIT_REPOSITORY_NOT_FOUND", "git", "cwd is not inside a git repository"] if root.nil?

      unless git_state.tracked?(root, ".ai-sdlc/prompt-policy.yaml")
        return ["POLICY_NOT_TRACKED", ".ai-sdlc/prompt-policy.yaml", "policy file is not tracked by git"]
      end

      origin = git_state.origin_url(root)
      return ["REPOSITORY_IDENTITY_MISMATCH", "remote.origin.url", "origin url is missing"] if origin.nil?
      identity = parse_origin(origin)
      if identity.nil?
        return ["REPOSITORY_IDENTITY_MISMATCH", "remote.origin.url", ORIGIN_UNSUPPORTED_MESSAGE]
      end

      # Three-way closure (finding F02): normalized origin identity ==
      # capsule baseline.repository == policy.repository.
      capsule_repo = capsule.dig("baseline", "repository").to_s
      policy_repo = policy["repository"].to_s
      unless identity_match?(identity, capsule_repo) && identity_match?(identity, policy_repo)
        return ["REPOSITORY_IDENTITY_MISMATCH", "repository", IDENTITY_MISMATCH_MESSAGE]
      end

      capsule_branch = capsule.dig("baseline", "branch")
      unless capsule_branch == policy["fact_branch"]
        return ["FACT_BRANCH_MISMATCH", "baseline.branch",
                "capsule baseline.branch #{capsule_branch.inspect} must equal policy fact_branch #{policy['fact_branch'].inspect}"]
      end

      # Exact named-ref gate (finding F04): branch validity comes from
      # check-ref-format and heads from exact full-ref show-ref lookups;
      # rev-parse is never an authority here.
      branch = policy["fact_branch"]
      unless git_state.branch_valid?(branch)
        return ["FACT_BRANCH_INVALID", "policy.fact_branch",
                "fact_branch is not a valid git branch name (git check-ref-format)"]
      end

      expected_head = capsule.dig("baseline", "head")
      ["refs/heads/#{branch}", "refs/remotes/origin/#{branch}"].each do |ref|
        actual = git_state.exact_ref_head(root, ref)
        return ["BASELINE_REF_MISSING", ref, "ref does not exist"] if actual.nil?
        unless actual == expected_head
          return ["BASELINE_HEAD_MISMATCH", ref,
                  "ref head #{actual} does not equal capsule baseline.head #{expected_head}"]
        end
      end

      nil
    end
  end

  # ── Template binding and conditionals ──

  module Template
    module_function

    ENDWHEN_MARKER = "<!-- ENDWHEN -->"
    BLOCK_PATTERN = /<!-- WHEN ([a-z][a-z0-9_.]*)=([A-Z0-9_]+) -->(.*?)<!-- ENDWHEN -->/m
    # Placeholder extraction excludes HTML-comment markers (WHEN/ENDWHEN).
    PLACEHOLDER_PATTERN = /<(?!!--)[^>\n]+>/

    CONDITIONAL_FIELDS = {
      "git.commit_count" => %w[0 1],
      "git.push_mode" => %w[NONE NORMAL_PUSH],
      "git.pull_request_action" => %w[NONE CREATE_DRAFT UPDATE_DRAFT]
    }.freeze

    def placeholders(text)
      text.scan(PLACEHOLDER_PATTERN).uniq
    end

    # Ruby 2.6-compatible occurrence count (Array#tally is 2.7+).
    def placeholder_counts(text)
      text.scan(PLACEHOLDER_PATTERN).each_with_object(Hash.new(0)) { |placeholder, counts| counts[placeholder] += 1 }
    end

    # Shape-only check for the capsule template: exact key sets plus the two
    # contract markers report_back_to and stop_after_report: true.
    # Placeholder values are allowed; value rules apply to instances only.
    def capsule_template_shape_error(data)
      return "template root must be a mapping" unless data.is_a?(Hash)
      result = CompactPrompt::Capsule.check_exact_keys(data, CompactPrompt::ROOT_KEYS)
      return "template root keys must be exactly #{CompactPrompt::ROOT_KEYS.inspect} (#{result})" if result
      {
        "routing" => CompactPrompt::ROUTING_KEYS,
        "baseline" => CompactPrompt::BASELINE_KEYS,
        "delta" => CompactPrompt::DELTA_KEYS,
        "scope" => CompactPrompt::SCOPE_KEYS,
        "git" => CompactPrompt::GIT_KEYS,
        "completion_report" => CompactPrompt::COMPLETION_REPORT_KEYS
      }.each do |key, allowed|
        section = data[key]
        unless section.is_a?(Hash)
          return "template #{key} must be a mapping"
        end
        result = CompactPrompt::Capsule.check_exact_keys(section, allowed)
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

    # Returns [code, path, message] or nil when the placeholder set is
    # exactly the 27 registered PLACEHOLDER_SOURCES, each placeholder
    # appears exactly once and no unknown, missing, duplicate or
    # source-set drift exists (finding F05). This is the single
    # template-binding validator shared by CLI validate, CLI compile and
    # the contract validator.
    def binding_error(text)
      present = placeholders(text)
      unknown = present - CompactPrompt::PLACEHOLDER_SOURCES.keys
      unless unknown.empty?
        return ["TEMPLATE_PLACEHOLDER_UNKNOWN", "template",
                "unknown placeholder(s) not in the source table #{unknown.sort.join(', ')}"]
      end
      missing = CompactPrompt::PLACEHOLDER_SOURCES.keys - present
      unless missing.empty?
        return ["TEMPLATE_PLACEHOLDER_MISSING", "template",
                "placeholder(s) missing from the template #{missing.sort.join(', ')}"]
      end
      duplicates = placeholder_counts(text).select { |_placeholder, count| count > 1 }
      unless duplicates.empty?
        return ["TEMPLATE_PLACEHOLDER_DUPLICATE", "template",
                "placeholder(s) appear more than once #{duplicates.keys.sort.join(', ')}"]
      end
      nil
    end

    # ── Template structure gate (finding F05) ──
    #
    # One shared fail-closed gate for the fixed ten-section shape, the
    # single line-start `delivery_type: CODEX_EXECUTION_PROMPT` and the
    # complete strict WHEN/ENDWHEN marker scan. Called by CLI validate,
    # CLI compile and the contract validator — the logic is never
    # duplicated across the CLI and the validator.

    # Fixed ten sections, exact order, no missing/duplicate/extra numbered
    # section.
    def section_error(text)
      headings = text.lines.grep(/\A## \d+\. /).map { |line| line.sub(/\A## /, "").strip }
      unknown = headings - CompactPrompt::CODEX_PROMPT_SECTIONS
      unless unknown.empty?
        return ["TEMPLATE_STRUCTURE_INVALID", "template",
                "numbered section(s) not in the fixed ten-section list #{unknown.inspect}"]
      end
      missing = CompactPrompt::CODEX_PROMPT_SECTIONS - headings
      unless missing.empty?
        return ["TEMPLATE_STRUCTURE_INVALID", "template",
                "fixed section(s) missing from the template #{missing.inspect}"]
      end
      counts = headings.each_with_object(Hash.new(0)) { |heading, h| h[heading] += 1 }
      duplicates = counts.select { |_heading, count| count > 1 }
      unless duplicates.empty?
        return ["TEMPLATE_STRUCTURE_INVALID", "template",
                "section heading(s) appear more than once #{duplicates.keys.inspect}"]
      end
      unless headings == CompactPrompt::CODEX_PROMPT_SECTIONS
        return ["TEMPLATE_STRUCTURE_INVALID", "template",
                "section order must be exactly #{CompactPrompt::CODEX_PROMPT_SECTIONS.inspect}"]
      end
      nil
    end

    # Exactly one line starting with `delivery_type:` and its value must be
    # precisely `CODEX_EXECUTION_PROMPT`.
    def delivery_type_error(text)
      lines = text.lines.grep(/\Adelivery_type:/)
      unless lines.length == 1
        return ["TEMPLATE_STRUCTURE_INVALID", "template",
                "template must contain exactly one line starting with delivery_type: (found #{lines.length})"]
      end
      unless lines.first.strip == "delivery_type: CODEX_EXECUTION_PROMPT"
        return ["TEMPLATE_STRUCTURE_INVALID", "template",
                "the single delivery_type line must be exactly `delivery_type: CODEX_EXECUTION_PROMPT`"]
      end
      nil
    end

    # Complete strict scan of every WHEN/ENDWHEN-bearing HTML comment
    # (finding F05-B). The scanner consumes full comments `<!-- ... -->`;
    # a plain `>` inside a comment body never ends the fragment, malformed
    # closings, WHENX-like tokens, unknown fields and unbalanced markers
    # can never be silently ignored because they fail the legal-token
    # regex.
    def marker_error(text)
      # Scans every complete HTML comment (finding F05-B): a fragment ends
      # at the first full `-->`, never at a plain `>` inside the comment
      # body, so `<!-- malformed > WHEN ... -->` cannot be truncated into
      # silence. A comment with no closing `-->` scans to EOF and fails
      # closed. Adjacent independent comments are matched one at a time;
      # each comment's body is then checked for WHEN/ENDWHEN and must be an
      # exact legal marker — malformed, unknown field/value, unpaired,
      # nested, duplicate and cross-section markers all fail closed, and
      # the seven legal blocks cannot mask an extra malformed marker.
      tokens = []
      text.to_enum(:scan, /<!--.*?(?:-->|\z)/m).each do
        tokens << [Regexp.last_match.begin(0), Regexp.last_match[0]]
      end

      # Marker pairing uses only marker-bearing comments (finding F05-C):
      # ordinary comments stay inert and never participate in pairing, but
      # they remain inside a WHEN block's body text. A WHEN block's body
      # runs from the matched WHEN comment's end to its paired ENDWHEN
      # comment's start, so an ordinary comment placed between them cannot
      # shorten the cross-section scan.
      markers = tokens.select { |_pos, token| token.include?("WHEN") || token.include?("ENDWHEN") }

      depth = 0
      when_stack = [] # [body_start, field, value]
      blocks = []
      markers.each do |pos, token|
        if token.include?("ENDWHEN")
          unless token == ENDWHEN_MARKER
            return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                    "malformed ENDWHEN marker #{token.inspect} (expected exactly #{ENDWHEN_MARKER.inspect})"]
          end
          if depth.zero? || when_stack.empty?
            return ["TEMPLATE_CONDITIONAL_INVALID", "template", "ENDWHEN without matching WHEN"]
          end
          body_start, field, value = when_stack.pop
          depth -= 1
          body = text[body_start...pos]
          if body.match?(/^## /)
            return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                    "conditional #{field}=#{value} must not span sections"]
          end
        else
          return ["TEMPLATE_CONDITIONAL_INVALID", "template", "conditional blocks must not nest"] if depth.positive?
          match = token.match(/\A<!-- WHEN ([a-z][a-z0-9_.]*)=([A-Z0-9_]+) -->\z/)
          unless match
            return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                    "malformed WHEN marker #{token.inspect} (expected exactly <!-- WHEN <field>=<value> -->)"]
          end
          field = match[1]
          value = match[2]
          unless CONDITIONAL_FIELDS.key?(field) && CONDITIONAL_FIELDS[field].include?(value)
            return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                    "conditional #{field}=#{value} is not an allowed field/value"]
          end
          when_stack << [pos + token.length, field, value]
          blocks << [field, value]
          depth += 1
        end
      end
      return ["TEMPLATE_CONDITIONAL_INVALID", "template", "WHEN without matching ENDWHEN"] unless depth.zero?

      # A template with no conditional blocks at all still fails closed:
      # every legal field/value must appear exactly once.
      counts = blocks.each_with_object(Hash.new(0)) { |block, h| h[block] += 1 }
      CONDITIONAL_FIELDS.each do |field, values|
        values.each do |value|
          next if counts[[field, value]] == 1
          return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                  "conditional #{field}=#{value} must appear exactly once (found #{counts[[field, value]] || 0})"]
        end
      end
      nil
    end

    # Single shared template-structure gate: section shape, delivery_type
    # identity and the strict marker scan, in that order.
    def structure_error(text)
      section_error(text) || delivery_type_error(text) || marker_error(text)
    end

    # Backwards-compatible conditional gate: the strict marker scan is the
    # single implementation, reused by the structure gate and by
    # Renderer.render's defensive pre-check.
    def conditional_error(text)
      marker_error(text)
    end

    # Expands conditional blocks: each group keeps only the block whose value
    # matches the capsule git field; all markers are removed and runs of 3+
    # newlines left by removed blocks collapse to a single blank line.
    def render_conditionals(text, capsule)
      selection = {
        "git.commit_count" => capsule.dig("git", "commit_count").to_s,
        "git.push_mode" => capsule.dig("git", "push_mode").to_s,
        "git.pull_request_action" => capsule.dig("git", "pull_request_action").to_s
      }
      text.gsub(BLOCK_PATTERN) do
        match = Regexp.last_match
        selection[match[1]] == match[2] ? match[3] : ""
      end.gsub(/\n{3,}/, "\n\n")
    end
  end

  # ── Deterministic renderer ──

  module Renderer
    module_function

    def dig_path(data, path)
      path.split(".").reduce(data) { |acc, key| acc.is_a?(Hash) ? acc[key] : nil }
    end

    # Context-safe renderers (finding F06): the renderer is split by output
    # context so one scalar encoder is never reused for every context.
    #
    #   render_yaml_scalar — values inside fenced YAML blocks (routing /
    #     baseline / git / footer): deterministic double-quoted YAML scalar
    #     that round-trips through YAML.safe_load to the exact original
    #     Capsule value; integers/booleans render bare to keep YAML typing,
    #     the string "none" stays quoted so it never parses as null.
    #   render_prose_scalar — single-line strings in the template body
    #     outside YAML blocks (visible Safety.encode, no second material /
    #     heading / placeholder / marker can form).
    #   render_list_item — one string bullet inside a prose list.
    #   render_finding — one finding bullet (id + status).
    #
    # Every Capsule/Policy user string still passes through Safety or the
    # YAML encoder first, so single-line injection protection is never
    # weakened.

    YAML_FENCE_OPEN = /\A```yaml\s*\z/
    YAML_FENCE_CLOSE = /\A```\s*\z/

    # Maps every template placeholder to :yaml (inside a fenced YAML block)
    # or :prose (template body), based on the raw template text. Placeholder
    # lines never sit inside conditional blocks, so the map is stable.
    def placeholder_contexts(template_text)
      contexts = {}
      in_yaml = false
      template_text.each_line do |line|
        if YAML_FENCE_OPEN.match?(line)
          in_yaml = true
          next
        elsif YAML_FENCE_CLOSE.match?(line)
          in_yaml = false
          next
        end
        CompactPrompt::PLACEHOLDER_SOURCES.keys.each do |placeholder|
          contexts[placeholder] = in_yaml ? :yaml : :prose if line.include?(placeholder)
        end
      end
      contexts
    end

    # Deterministic YAML double-quoted scalar. Backslash and double quote
    # use YAML escapes; CR/LF/tab/NUL and other control characters become
    # \r \n \t \0 \xNN; `<`/`>` become \u003C/\u003E so placeholder-like
    # and conditional-marker-like text stays valid YAML and can never form
    # a second delivery_type, heading or material. No character is ever
    # silently dropped: YAML.safe_load of the quoted scalar equals the
    # original Capsule string.
    def render_yaml_scalar(value)
      case value
      when Integer, TrueClass, FalseClass
        value.to_s
      else
        escaped = value.to_s.each_char.map do |ch|
          case ch
          when "\\" then "\\\\"
          when '"' then '\\"'
          when "\r" then "\\r"
          when "\n" then "\\n"
          when "\t" then "\\t"
          when "\0" then "\\0"
          when "<" then "\\u003C"
          when ">" then "\\u003E"
          else
            # C0 controls, DEL and C1 controls (0x80-0x9F) become \xNN so
            # no control byte can reach the output verbatim.
            ch.ord < 0x20 || ch.ord == 0x7f || (ch.ord >= 0x80 && ch.ord <= 0x9f) ? format("\\x%02X", ch.ord) : ch
          end
        end.join
        "\"#{escaped}\""
      end
    end

    # Prose context: single-line visible escape, identical to Safety.encode.
    def render_prose_scalar(value)
      CompactPrompt::Safety.encode(value)
    end

    # One string bullet inside a prose list (single-line visible escape).
    def render_list_item(item)
      CompactPrompt::Safety.encode(item)
    end

    # One finding bullet: `id (status)`, both single-line visible escapes.
    def render_finding(id, status)
      "#{CompactPrompt::Safety.encode(id)} (#{CompactPrompt::Safety.encode(status)})"
    end

    def render_list(values)
      return "  none" if values.nil? || values.empty?
      values.map do |item|
        case item
        when Hash
          "  - #{render_finding(item['id'], item['status'])}"
        else
          "  - #{render_list_item(item)}"
        end
      end.join("\n")
    end

    def render_command_list(argv_list)
      return "  none" if argv_list.nil? || argv_list.empty?
      argv_list.map { |argv| "  - #{render_list_item(Shellwords.join(argv))}" }.join("\n")
    end

    # Returns [text, nil] or [nil, [code, path, message]].
    def render(capsule, policy, template_text)
      cerr = Template.conditional_error(template_text)
      return [nil, cerr] if cerr

      action = capsule.dig("git", "pull_request_action")
      pr = capsule.dig("baseline", "pull_request")
      if action == "CREATE_DRAFT" && pr != "none"
        return [nil, ["TEMPLATE_CONDITIONAL_INVALID", "baseline.pull_request",
                      "CREATE_DRAFT requires baseline.pull_request=none"]]
      end
      if action == "UPDATE_DRAFT" && !(pr.is_a?(Integer) && pr >= 1)
        return [nil, ["TEMPLATE_CONDITIONAL_INVALID", "baseline.pull_request",
                      "UPDATE_DRAFT requires baseline.pull_request to be a positive integer"]]
      end

      expanded = Template.render_conditionals(template_text, capsule)

      contexts = placeholder_contexts(template_text)
      profile = capsule["validation_profile"]
      Template.placeholders(expanded).each do |placeholder|
        source, path = CompactPrompt::PLACEHOLDER_SOURCES[placeholder]
        unless source
          return [nil, ["TEMPLATE_PLACEHOLDER_UNKNOWN", "template", "unknown placeholder #{placeholder}"]]
        end
        if source == "CAPSULE_FIELD"
          value = dig_path(capsule, path)
          return [nil, ["TEMPLATE_SOURCE_BINDING_MISMATCH", path, "capsule field not resolvable for #{placeholder}"]] if value.nil?
          replacement =
            if value.is_a?(Array)
              render_list(value)
            elsif contexts[placeholder] == :yaml
              render_yaml_scalar(value)
            else
              render_prose_scalar(value)
            end
          expanded = expanded.gsub(placeholder) { replacement }
        elsif source == "PCE_01_B_PROJECT_MAPPING"
          list_key = path.include?("required") ? "required_command_ids" : "forbidden_command_ids"
          ids = policy.dig("validation_profiles", profile, list_key) || []
          argv_list = ids.map { |id| policy.dig("commands", id, "argv") }
          replacement = render_command_list(argv_list)
          expanded = expanded.gsub(placeholder) { replacement }
        else
          return [nil, ["TEMPLATE_SOURCE_BINDING_MISMATCH", path, "unsupported source #{source}"]]
        end
      end

      verr = verify_output(expanded)
      return [nil, verr] if verr
      [expanded, nil]
    end

    # Canonical output verifier (finding F06): the rendered text must be
    # valid UTF-8, free of CR bytes, contain exactly one `^delivery_type:`
    # with value CODEX_EXECUTION_PROMPT, keep the fixed ten sections, have
    # zero unresolved placeholders and zero conditional markers, and end
    # with exactly one trailing LF. The budget gate runs on this canonical
    # output afterwards.
    def verify_output(text)
      return ["RENDER_INCOMPLETE", "output", "output is not valid UTF-8"] unless text.valid_encoding?
      return ["RENDER_INCOMPLETE", "output", "output must not contain CR bytes"] if text.include?("\r")
      delivery_lines = text.scan(/^delivery_type:/)
      unless delivery_lines.length == 1 &&
             text.scan(/^delivery_type: CODEX_EXECUTION_PROMPT/).length == 1
        return ["RENDER_INCOMPLETE", "output",
                "must contain exactly one delivery_type: CODEX_EXECUTION_PROMPT"]
      end
      # A leftover placeholder is one of the 27 registered template inputs
      # still present verbatim; user text is escaped to `\<...\>` so it can
      # never match. Conditional markers must not appear unescaped either
      # (`\<!-- ...` from encoded user text is inert).
      unresolved = CompactPrompt::PLACEHOLDER_SOURCES.keys.select { |p| text.include?(p) }
      unless unresolved.empty?
        return ["RENDER_INCOMPLETE", "output", "unresolved placeholder(s) remain"]
      end
      if text.match?(/(?<!\\)<!-- WHEN/) || text.match?(/(?<!\\)<!-- ENDWHEN/)
        return ["RENDER_INCOMPLETE", "output", "conditional markers remain after rendering"]
      end
      headings = text.lines.grep(/\A## \d+\. /).map { |line| line.sub(/\A## /, "").strip }
      unless headings == CompactPrompt::CODEX_PROMPT_SECTIONS
        return ["RENDER_INCOMPLETE", "output",
                "section order must be exactly #{CompactPrompt::CODEX_PROMPT_SECTIONS.inspect}"]
      end
      unless text.end_with?("\n") && !text.end_with?("\n\n")
        return ["RENDER_INCOMPLETE", "output", "output must end with exactly one LF"]
      end
      nil
    end
  end

  # ── Budget gate ──

  module Budget
    module_function

    # Returns [code, path, message] or nil. Both logical line count and
    # UTF-8 byte count are checked against the prompt-mode hard limits.
    def check(text, mode)
      budget = CompactPrompt::PROMPT_MODE_BUDGETS[mode]
      lines = text.lines.count
      bytes = text.bytesize
      return ["PROMPT_LINE_LIMIT_EXCEEDED", "output",
              "#{lines} lines exceed #{budget['hard_limit_lines']} for #{mode}"] if lines > budget["hard_limit_lines"]
      return ["PROMPT_BYTE_LIMIT_EXCEEDED", "output",
              "#{bytes} bytes exceed #{budget['hard_limit_bytes']} for #{mode}"] if bytes > budget["hard_limit_bytes"]
      nil
    end
  end

  # ── Diagnostics registry and shape (finding F07) ──
  #
  # Single registry of every public B diagnostic code with its exit
  # category and stable meaning. All CLI failure exits resolve through
  # Diagnostics.exit_for, so the exit map cannot drift from the registry.

  module Diagnostics
    module_function

    # code => { "exit" => int, "category" => string, "meaning" => string }
    REGISTRY = {
      # exit 2 — CLI_OR_INPUT
      "CLI_USAGE_INVALID" => { "exit" => 2, "category" => "CLI_OR_INPUT",
                               "meaning" => "argv is not validate|compile <capsule.yaml>" },
      "INPUT_FILE_INVALID" => { "exit" => 2, "category" => "CLI_OR_INPUT",
                                "meaning" => "capsule file does not exist or is not a file" },
      "INPUT_ENCODING_INVALID" => { "exit" => 2, "category" => "CLI_OR_INPUT",
                                    "meaning" => "capsule text is not valid UTF-8" },
      # exit 3 — CONTRACT_OR_POLICY (capsule public classifications,
      # restricted-YAML rejections, policy and template binding failures)
      "UNKNOWN_KEY" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                         "meaning" => "contract-undefined key present" },
      "MISSING_REQUIRED_FIELD" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                    "meaning" => "required field missing, empty scalar or empty array" },
      "DUPLICATE_KEY" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                           "meaning" => "duplicate key in the same mapping" },
      "YAML_ALIAS" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                        "meaning" => "YAML alias (*name) present" },
      "YAML_ANCHOR" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                         "meaning" => "YAML anchor (&name) present" },
      "YAML_TAG" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                      "meaning" => "explicit YAML tag present" },
      "YAML_MERGE_KEY" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                            "meaning" => "merge key (<<) present" },
      "YAML_NULL" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                       "meaning" => "null / ~ / empty scalar value present" },
      "YAML_DOCUMENT_COUNT_INVALID" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                         "meaning" => "restricted YAML is not exactly one document" },
      "YAML_SYNTAX" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                         "meaning" => "restricted YAML does not parse" },
      "YAML_UNSUPPORTED" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                              "meaning" => "restricted YAML rejected by safe-load" },
      "INVALID_SHA" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                         "meaning" => "baseline.head is not a 40-hex lowercase SHA" },
      "UNSAFE_PATH" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                         "meaning" => "path is absolute, backslashed, .., ~ or empty" },
      "MULTIPLE_OBJECTIVES" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                 "meaning" => "objective is not a single non-empty scalar" },
      "VALIDATION_UNDERSPECIFIED" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                       "meaning" => "validation level insufficient for changes" },
      "VALIDATION_OVERPROVISIONED" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                        "meaning" => "validation level overprovisioned for changes" },
      "MISSING_STOP_CONDITION" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                    "meaning" => "completion_report.stop_after_report is not true" },
      "FIELD_TYPE_INVALID" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                "meaning" => "field type or enum out of range" },
      "POLICY_FILE_MISSING" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                 "meaning" => "policy file not found at git root" },
      "POLICY_SCHEMA_INVALID" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                   "meaning" => "policy schema, key, type or enum violation" },
      "POLICY_PROFILE_MAPPING_MISSING" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                            "meaning" => "validation profile mapping missing or empty" },
      "POLICY_COMMAND_ID_UNKNOWN" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                       "meaning" => "command id not registered in commands" },
      "POLICY_COMMAND_CONFLICT" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                     "meaning" => "duplicate or required/forbidden overlap in profile" },
      "DOC_ONLY_ROOT_NPM_TEST_FORBIDDEN" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                              "meaning" => "DOC_ONLY must not require root npm test" },
      "TEMPLATE_FILE_MISSING" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                   "meaning" => "prompt template file not found" },
      "TEMPLATE_PLACEHOLDER_UNKNOWN" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                          "meaning" => "template placeholder has no source row" },
      "TEMPLATE_PLACEHOLDER_MISSING" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                          "meaning" => "registered placeholder absent from template" },
      "TEMPLATE_PLACEHOLDER_DUPLICATE" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                            "meaning" => "registered placeholder appears more than once" },
      "TEMPLATE_SOURCE_BINDING_MISMATCH" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                              "meaning" => "placeholder source not resolvable" },
      "TEMPLATE_STRUCTURE_INVALID" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                        "meaning" => "template section shape or delivery_type identity violation" },
      "TEMPLATE_CONDITIONAL_INVALID" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                          "meaning" => "conditional block missing, duplicate, nested or malformed" },
      # exit 4 — GIT_BASELINE
      "GIT_REPOSITORY_NOT_FOUND" => { "exit" => 4, "category" => "GIT_BASELINE",
                                      "meaning" => "cwd is not inside a git repository" },
      "POLICY_NOT_TRACKED" => { "exit" => 4, "category" => "GIT_BASELINE",
                                "meaning" => "policy file is not tracked by git" },
      "REPOSITORY_IDENTITY_MISMATCH" => { "exit" => 4, "category" => "GIT_BASELINE",
                                          "meaning" => "origin/capsule/policy repository identity not closed" },
      "FACT_BRANCH_MISMATCH" => { "exit" => 4, "category" => "GIT_BASELINE",
                                  "meaning" => "capsule baseline.branch != policy fact_branch" },
      "FACT_BRANCH_INVALID" => { "exit" => 4, "category" => "GIT_BASELINE",
                                 "meaning" => "fact_branch fails git check-ref-format" },
      "BASELINE_REF_MISSING" => { "exit" => 4, "category" => "GIT_BASELINE",
                                  "meaning" => "exact full ref does not exist" },
      "BASELINE_HEAD_MISMATCH" => { "exit" => 4, "category" => "GIT_BASELINE",
                                    "meaning" => "exact ref head != capsule baseline.head" },
      # exit 5 — RENDER_OR_BUDGET
      "RENDER_INCOMPLETE" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                               "meaning" => "canonical output verification failed" },
      "PROMPT_LINE_LIMIT_EXCEEDED" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                                        "meaning" => "logical line count exceeds mode hard limit" },
      "PROMPT_BYTE_LIMIT_EXCEEDED" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                                        "meaning" => "UTF-8 byte count exceeds mode hard limit" },
      "INTERNAL_ERROR" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                            "meaning" => "fail-closed internal/render error; no backtrace emitted" }
    }.freeze

    def registered_codes
      REGISTRY.keys
    end

    # Every failure exit resolves through the registry; an unregistered
    # code fails closed to INTERNAL_ERROR's exit (5).
    def exit_for(code)
      entry = REGISTRY[code]
      entry ? entry["exit"] : REGISTRY.fetch("INTERNAL_ERROR")["exit"]
    end

    # Deterministic visible escape for diagnostic fields: tab, CR, LF, NUL
    # and other control characters become \t \r \n \0 \xNN so the strict
    # three-field tab-separated shape always holds (finding F07).
    def escape_field(value)
      value.to_s.each_char.map do |ch|
        case ch
        when "\t" then "\\t"
        when "\n" then "\\n"
        when "\r" then "\\r"
        when "\0" then "\\0"
        else
          ch.ord < 0x20 || ch.ord == 0x7f ? format("\\x%02X", ch.ord) : ch
        end
      end.join
    end

    def format(code, path, message)
      "#{escape_field(code)}\t#{escape_field(path)}\t#{escape_field(message)}\n"
    end

    # Multiple diagnostics are sorted by code, path, message; never include
    # secrets, credentials, backtraces or unstable environment text.
    def render(diags)
      diags.map { |code, path, message| format(code, path, message) }.sort.join
    end
  end

  # ── CLI service layer ──

  module CLI
    module_function

    EXIT_OK = 0
    # All failure exits resolve through Diagnostics.exit_for(REGISTRY);
    # no other exit constants exist so the exit map cannot drift.

    TEMPLATE_REL_PATH = "templates/compact-codex-prompt-template.md".freeze
    POLICY_REL_PATH = ".ai-sdlc/prompt-policy.yaml".freeze
    VALIDATE_SUCCESS = "compact execution capsule valid\n".freeze

    # Entry point used by scripts/ai-sdlc-prompt.rb. Injectable parameters
    # (git_state, capsule_text, policy_text, template_text, template_path)
    # exist so the contract validator can run fixtures with synthetic git
    # state and in-memory text without any filesystem writes.
    def main(argv, cwd:, stdout:, stderr:, git_state: nil,
             capsule_text: nil, policy_text: nil, template_text: nil, template_path: nil)
      unless argv.length == 2 && %w[validate compile].include?(argv[0])
        stderr.write(Diagnostics.format("CLI_USAGE_INVALID", "argv",
                                        "usage: ai-sdlc-prompt.rb validate|compile <capsule.yaml>"))
        return Diagnostics.exit_for("CLI_USAGE_INVALID")
      end
      command, capsule_path = argv

      text = capsule_text
      if text.nil?
        full = File.expand_path(capsule_path, cwd)
        unless File.file?(full)
          stderr.write(Diagnostics.format("INPUT_FILE_INVALID", capsule_path, "capsule file not found"))
          return Diagnostics.exit_for("INPUT_FILE_INVALID")
        end
        begin
          text = File.read(full, encoding: "UTF-8")
        rescue ArgumentError, EncodingError
          stderr.write(Diagnostics.format("INPUT_ENCODING_INVALID", capsule_path, "capsule file is not valid UTF-8"))
          return Diagnostics.exit_for("INPUT_ENCODING_INVALID")
        end
      end
      unless text.valid_encoding?
        stderr.write(Diagnostics.format("INPUT_ENCODING_INVALID", capsule_path, "capsule text is not valid UTF-8"))
        return Diagnostics.exit_for("INPUT_ENCODING_INVALID")
      end

      data, classification = CompactPrompt::RestrictedYAML.parse(text)
      if classification
        stderr.write(Diagnostics.format(classification, "capsule", "restricted YAML rejection"))
        return Diagnostics.exit_for(classification)
      end
      code = CompactPrompt::Capsule.validate(data)
      if code
        stderr.write(Diagnostics.format(code, "capsule", "capsule contract violation"))
        return Diagnostics.exit_for(code)
      end

      gs = git_state || CompactPrompt::GitAdapter.new
      root = gs.repository_root(cwd)
      if root.nil?
        stderr.write(Diagnostics.format("GIT_REPOSITORY_NOT_FOUND", "git", "cwd is not inside a git repository"))
        return Diagnostics.exit_for("GIT_REPOSITORY_NOT_FOUND")
      end

      ptext = policy_text
      if ptext.nil?
        policy_path = File.join(root, POLICY_REL_PATH)
        unless File.file?(policy_path)
          stderr.write(Diagnostics.format("POLICY_FILE_MISSING", POLICY_REL_PATH, "policy file not found"))
          return Diagnostics.exit_for("POLICY_FILE_MISSING")
        end
        begin
          ptext = File.read(policy_path, encoding: "UTF-8")
        rescue ArgumentError, EncodingError
          stderr.write(Diagnostics.format("POLICY_SCHEMA_INVALID", POLICY_REL_PATH, "policy file is not valid UTF-8"))
          return Diagnostics.exit_for("POLICY_SCHEMA_INVALID")
        end
      end
      unless ptext.valid_encoding?
        stderr.write(Diagnostics.format("POLICY_SCHEMA_INVALID", POLICY_REL_PATH, "policy text is not valid UTF-8"))
        return Diagnostics.exit_for("POLICY_SCHEMA_INVALID")
      end
      pdata, pclass = CompactPrompt::RestrictedYAML.parse(ptext)
      if pclass
        stderr.write(Diagnostics.format("POLICY_SCHEMA_INVALID", POLICY_REL_PATH, "policy rejected: #{pclass}"))
        return Diagnostics.exit_for("POLICY_SCHEMA_INVALID")
      end
      pdiags = CompactPrompt::Policy.validate(pdata)
      unless pdiags.empty?
        stderr.write(CompactPrompt::Diagnostics.render(pdiags))
        return Diagnostics.exit_for(pdiags.first[0])
      end

      ttext = template_text
      if ttext.nil?
        template_path = File.join(CompactPrompt::ROOT, TEMPLATE_REL_PATH) if template_path.nil?
        unless File.file?(template_path)
          stderr.write(Diagnostics.format("TEMPLATE_FILE_MISSING", TEMPLATE_REL_PATH, "template file not found"))
          return Diagnostics.exit_for("TEMPLATE_FILE_MISSING")
        end
        ttext = File.read(template_path, encoding: "UTF-8")
      end
      # Template structure first (fixed ten sections, single
      # delivery_type, complete strict WHEN/ENDWHEN marker scan), then the
      # single template-binding validator shared by validate, compile and the
      # contract validator (finding F05): exact 27-placeholder set,
      # exactly-once occurrences, no unknown/missing/duplicate drift.
      serr = CompactPrompt::Template.structure_error(ttext)
      if serr
        stderr.write(CompactPrompt::Diagnostics.format(*serr))
        return Diagnostics.exit_for(serr[0])
      end
      berr = CompactPrompt::Template.binding_error(ttext)
      if berr
        stderr.write(CompactPrompt::Diagnostics.format(*berr))
        return Diagnostics.exit_for(berr[0])
      end

      gerr = CompactPrompt::GitBaseline.check(data, pdata, gs, cwd)
      if gerr
        stderr.write(CompactPrompt::Diagnostics.format(*gerr))
        return Diagnostics.exit_for(gerr[0])
      end

      if command == "validate"
        stdout.write(VALIDATE_SUCCESS)
        return EXIT_OK
      end

      prompt, rerr = CompactPrompt::Renderer.render(data, pdata, ttext)
      if rerr
        stderr.write(CompactPrompt::Diagnostics.format(*rerr))
        return Diagnostics.exit_for(rerr[0])
      end
      berr = CompactPrompt::Budget.check(prompt, data["prompt_mode"])
      if berr
        stderr.write(CompactPrompt::Diagnostics.format(*berr))
        return Diagnostics.exit_for(berr[0])
      end

      stdout.write(prompt)
      EXIT_OK
    rescue StandardError
      # Fail closed: never emit a backtrace or unstable environment text.
      stderr.write(Diagnostics.format("INTERNAL_ERROR", "internal",
                                      "unexpected internal error; no backtrace emitted"))
      Diagnostics.exit_for("INTERNAL_ERROR")
    end
  end
end
