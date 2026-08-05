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
          duplicates = list.tally.select { |_id, count| count > 1 }.keys
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

    def ref_head(root, ref)
      out, _err, status = Open3.capture3("git", "-C", root, "rev-parse", "--verify", "--quiet", ref)
      status.success? ? out.strip : nil
    end
  end

  module GitBaseline
    module_function

    GITHUB_ORIGIN_PATTERNS = [
      %r{\Ahttps://github\.com/([^/]+)/([^/]+?)(?:\.git)?\z},
      %r{\Agit@github\.com:([^/]+)/([^/]+?)(?:\.git)?\z},
      %r{\Assh://git@github\.com/([^/]+)/([^/]+?)(?:\.git)?\z}
    ].freeze

    def normalize_origin(url)
      GITHUB_ORIGIN_PATTERNS.each do |pattern|
        match = url.match(pattern)
        return [match[1], match[2]] if match
      end
      nil
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
      identity = normalize_origin(origin)
      if identity.nil?
        return ["REPOSITORY_IDENTITY_MISMATCH", "remote.origin.url",
                "origin url is not a supported github.com url (https/git@/ssh://git@github.com)"]
      end
      capsule_repo = capsule.dig("baseline", "repository").to_s
      unless identity.map(&:downcase) == capsule_repo.downcase.split("/")
        return ["REPOSITORY_IDENTITY_MISMATCH", "remote.origin.url",
                "origin identity #{identity.join('/')} does not match capsule baseline.repository #{capsule_repo}"]
      end

      capsule_branch = capsule.dig("baseline", "branch")
      unless capsule_branch == policy["fact_branch"]
        return ["FACT_BRANCH_MISMATCH", "baseline.branch",
                "capsule baseline.branch #{capsule_branch.inspect} must equal policy fact_branch #{policy['fact_branch'].inspect}"]
      end

      expected_head = capsule.dig("baseline", "head")
      ["refs/heads/#{capsule_branch}", "refs/remotes/origin/#{capsule_branch}"].each do |ref|
        actual = git_state.ref_head(root, ref)
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

    WHEN_PATTERN = /<!-- WHEN ([a-z][a-z0-9_.]*)=([A-Z0-9_]+) -->/
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

    def placeholder_counts(text)
      text.scan(PLACEHOLDER_PATTERN).tally
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

    # Returns [code, path, message] or nil when the conditional structure is
    # exactly one non-nested block per legal value with no cross-section
    # blocks and no unbalanced markers.
    def conditional_error(text)
      tokens = []
      text.to_enum(:scan, /<!-- WHEN [^>]+ -->|<!-- ENDWHEN -->/).each do
        tokens << [Regexp.last_match.begin(0), Regexp.last_match[0]]
      end

      depth = 0
      blocks = []
      tokens.each_with_index do |(pos, token), index|
        if token.start_with?("<!-- WHEN")
          return ["TEMPLATE_CONDITIONAL_INVALID", "template", "conditional blocks must not nest"] if depth.positive?
          match = token.match(WHEN_PATTERN)
          unless match
            return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                    "malformed WHEN marker #{token.inspect} (expected <!-- WHEN <field>=<value> -->)"]
          end
          field = match[1]
          value = match[2]
          unless CONDITIONAL_FIELDS.key?(field) && CONDITIONAL_FIELDS[field].include?(value)
            return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                    "conditional #{field}=#{value} is not an allowed field/value"]
          end
          end_pos = tokens[index + 1] ? tokens[index + 1][0] : text.length
          body = text[(pos + token.length)...end_pos]
          if body.match?(/^## /)
            return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                    "conditional #{field}=#{value} must not span sections"]
          end
          blocks << [field, value]
          depth += 1
        else
          return ["TEMPLATE_CONDITIONAL_INVALID", "template", "ENDWHEN without matching WHEN"] if depth.zero?
          depth -= 1
        end
      end
      return ["TEMPLATE_CONDITIONAL_INVALID", "template", "WHEN without matching ENDWHEN"] unless depth.zero?

      counts = blocks.tally
      CONDITIONAL_FIELDS.each do |field, values|
        values.each do |value|
          next if counts[[field, value]] == 1
          return ["TEMPLATE_CONDITIONAL_INVALID", "template",
                  "conditional #{field}=#{value} must appear exactly once (found #{counts[[field, value]] || 0})"]
        end
      end
      nil
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

    def render_list(values)
      return "  none" if values.nil? || values.empty?
      values.map do |item|
        case item
        when Hash
          "  - #{item['id']} (#{item['status']})"
        else
          "  - #{item}"
        end
      end.join("\n")
    end

    def render_command_list(argv_list)
      return "  none" if argv_list.nil? || argv_list.empty?
      argv_list.map { |argv| "  - #{Shellwords.join(argv)}" }.join("\n")
    end

    def render_scalar(value)
      case value
      when Integer
        value.to_s
      when true, false
        value.to_s
      else
        value.to_s
      end
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

      profile = capsule["validation_profile"]
      Template.placeholders(expanded).each do |placeholder|
        source, path = CompactPrompt::PLACEHOLDER_SOURCES[placeholder]
        unless source
          return [nil, ["TEMPLATE_PLACEHOLDER_UNKNOWN", "template", "unknown placeholder #{placeholder}"]]
        end
        if source == "CAPSULE_FIELD"
          value = dig_path(capsule, path)
          return [nil, ["TEMPLATE_SOURCE_BINDING_MISMATCH", path, "capsule field not resolvable for #{placeholder}"]] if value.nil?
          replacement = value.is_a?(Array) ? render_list(value) : render_scalar(value)
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

    def verify_output(text)
      return ["RENDER_INCOMPLETE", "output", "must contain exactly one delivery_type: CODEX_EXECUTION_PROMPT"] \
        unless text.scan(/^delivery_type: CODEX_EXECUTION_PROMPT/).length == 1
      return ["RENDER_INCOMPLETE", "output", "unresolved placeholder(s) remain"] \
        if text.match?(Template::PLACEHOLDER_PATTERN)
      if text.include?("<!-- WHEN") || text.include?("<!-- ENDWHEN")
        return ["RENDER_INCOMPLETE", "output", "conditional markers remain after rendering"]
      end
      headings = text.lines.grep(/\A## \d+\. /).map { |line| line.sub(/\A## /, "").strip }
      unless headings == CompactPrompt::CODEX_PROMPT_SECTIONS
        return ["RENDER_INCOMPLETE", "output",
                "section order must be exactly #{CompactPrompt::CODEX_PROMPT_SECTIONS.inspect}"]
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

  # ── Diagnostics ──

  module Diagnostics
    module_function

    def format(code, path, message)
      "#{code}\t#{path}\t#{message}\n"
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
    EXIT_CLI_OR_INPUT = 2
    EXIT_CONTRACT_OR_POLICY = 3
    EXIT_GIT_BASELINE = 4
    EXIT_RENDER_OR_BUDGET = 5

    TEMPLATE_REL_PATH = "templates/compact-codex-prompt-template.md".freeze
    POLICY_REL_PATH = ".ai-sdlc/prompt-policy.yaml".freeze
    VALIDATE_SUCCESS = "compact execution capsule valid\n".freeze

    # Entry point used by scripts/ai-sdlc-prompt.rb. Injectable parameters
    # (git_state, capsule_text, policy_text, template_text) exist so the
    # contract validator can run fixtures with synthetic git state and
    # in-memory text without any filesystem writes.
    def main(argv, cwd:, stdout:, stderr:, git_state: nil,
             capsule_text: nil, policy_text: nil, template_text: nil)
      unless argv.length == 2 && %w[validate compile].include?(argv[0])
        stderr.write(Diagnostics.format("CLI_USAGE_INVALID", "argv",
                                        "usage: ai-sdlc-prompt.rb validate|compile <capsule.yaml>"))
        return EXIT_CLI_OR_INPUT
      end
      command, capsule_path = argv

      text = capsule_text
      if text.nil?
        full = File.expand_path(capsule_path, cwd)
        unless File.file?(full)
          stderr.write(Diagnostics.format("INPUT_FILE_INVALID", capsule_path, "capsule file not found"))
          return EXIT_CLI_OR_INPUT
        end
        begin
          text = File.read(full, encoding: "UTF-8")
        rescue ArgumentError, EncodingError
          stderr.write(Diagnostics.format("INPUT_ENCODING_INVALID", capsule_path, "capsule file is not valid UTF-8"))
          return EXIT_CLI_OR_INPUT
        end
      end
      unless text.valid_encoding?
        stderr.write(Diagnostics.format("INPUT_ENCODING_INVALID", capsule_path, "capsule text is not valid UTF-8"))
        return EXIT_CLI_OR_INPUT
      end

      data, classification = CompactPrompt::RestrictedYAML.parse(text)
      if classification
        stderr.write(Diagnostics.format(classification, "capsule", "restricted YAML rejection"))
        return EXIT_CONTRACT_OR_POLICY
      end
      code = CompactPrompt::Capsule.validate(data)
      if code
        stderr.write(Diagnostics.format(code, "capsule", "capsule contract violation"))
        return EXIT_CONTRACT_OR_POLICY
      end

      gs = git_state || CompactPrompt::GitAdapter.new
      root = gs.repository_root(cwd)
      if root.nil?
        stderr.write(Diagnostics.format("GIT_REPOSITORY_NOT_FOUND", "git", "cwd is not inside a git repository"))
        return EXIT_GIT_BASELINE
      end

      ptext = policy_text
      if ptext.nil?
        policy_path = File.join(root, POLICY_REL_PATH)
        unless File.file?(policy_path)
          stderr.write(Diagnostics.format("POLICY_FILE_MISSING", POLICY_REL_PATH, "policy file not found"))
          return EXIT_CONTRACT_OR_POLICY
        end
        begin
          ptext = File.read(policy_path, encoding: "UTF-8")
        rescue ArgumentError, EncodingError
          stderr.write(Diagnostics.format("POLICY_SCHEMA_INVALID", POLICY_REL_PATH, "policy file is not valid UTF-8"))
          return EXIT_CONTRACT_OR_POLICY
        end
      end
      unless ptext.valid_encoding?
        stderr.write(Diagnostics.format("POLICY_SCHEMA_INVALID", POLICY_REL_PATH, "policy text is not valid UTF-8"))
        return EXIT_CONTRACT_OR_POLICY
      end
      pdata, pclass = CompactPrompt::RestrictedYAML.parse(ptext)
      if pclass
        stderr.write(Diagnostics.format("POLICY_SCHEMA_INVALID", POLICY_REL_PATH, "policy rejected: #{pclass}"))
        return EXIT_CONTRACT_OR_POLICY
      end
      pdiags = CompactPrompt::Policy.validate(pdata)
      unless pdiags.empty?
        stderr.write(CompactPrompt::Diagnostics.render(pdiags))
        return EXIT_CONTRACT_OR_POLICY
      end

      ttext = template_text
      if ttext.nil?
        template_path = File.join(CompactPrompt::ROOT, TEMPLATE_REL_PATH)
        unless File.file?(template_path)
          stderr.write(Diagnostics.format("TEMPLATE_FILE_MISSING", TEMPLATE_REL_PATH, "template file not found"))
          return EXIT_CONTRACT_OR_POLICY
        end
        ttext = File.read(template_path, encoding: "UTF-8")
      end
      unknown_placeholders = CompactPrompt::Template.placeholders(ttext) -
                             CompactPrompt::PLACEHOLDER_SOURCES.keys
      unless unknown_placeholders.empty?
        stderr.write(Diagnostics.format("TEMPLATE_PLACEHOLDER_UNKNOWN", "template",
                                        "unknown placeholder(s) #{unknown_placeholders.join(', ')}"))
        return EXIT_CONTRACT_OR_POLICY
      end
      cerr = CompactPrompt::Template.conditional_error(ttext)
      if cerr
        stderr.write(CompactPrompt::Diagnostics.format(*cerr))
        return EXIT_CONTRACT_OR_POLICY
      end

      gerr = CompactPrompt::GitBaseline.check(data, pdata, gs, cwd)
      if gerr
        stderr.write(CompactPrompt::Diagnostics.format(*gerr))
        return EXIT_GIT_BASELINE
      end

      if command == "validate"
        stdout.write(VALIDATE_SUCCESS)
        return EXIT_OK
      end

      prompt, rerr = CompactPrompt::Renderer.render(data, pdata, ttext)
      if rerr
        stderr.write(CompactPrompt::Diagnostics.format(*rerr))
        return EXIT_RENDER_OR_BUDGET
      end
      berr = CompactPrompt::Budget.check(prompt, data["prompt_mode"])
      if berr
        stderr.write(CompactPrompt::Diagnostics.format(*berr))
        return EXIT_RENDER_OR_BUDGET
      end

      stdout.write(prompt)
      EXIT_OK
    rescue StandardError
      # Fail closed: never emit a backtrace or unstable environment text.
      stderr.write(Diagnostics.format("INTERNAL_ERROR", "internal",
                                      "unexpected internal error; no backtrace emitted"))
      EXIT_RENDER_OR_BUDGET
    end
  end
end
