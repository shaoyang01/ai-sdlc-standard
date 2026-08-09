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

  # Optional root field (PCE_01_PR_ONLY_ZERO_DELTA_F01): `pr_head` is NOT
  # part of the exact ROOT_KEYS set, so existing capsules without it stay
  # valid. It is allowed as a root key and structurally validated only when
  # present (zero-delta CREATE_DRAFT requires it; nonzero delta forbids it).
  OPTIONAL_ROOT_KEYS = %w[pr_head].freeze
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

  # v2 budget contract: logical-line limits stay the secondary safety
  # signal; byte caps are replaced by the compact-envelope caps and a
  # deterministic proxy-token cap is added per mode. Gate order is fixed:
  # canonical output verification → line → byte → proxy token → stdout.
  PROMPT_MODE_BUDGETS = {
    "MICRO_FIX" => { "hard_limit_lines" => 120, "hard_limit_bytes" => 2048, "hard_limit_proxy_tokens" => 512 },
    "SESSION_CONTINUATION" => { "hard_limit_lines" => 220, "hard_limit_bytes" => 4096, "hard_limit_proxy_tokens" => 1024 },
    "BOOTSTRAP" => { "hard_limit_lines" => 400, "hard_limit_bytes" => 8192, "hard_limit_proxy_tokens" => 2048 },
    "RECOVERY" => { "hard_limit_lines" => 400, "hard_limit_bytes" => 8192, "hard_limit_proxy_tokens" => 2048 }
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

  # Legacy v1 production section headings (PCE-01-A contract). Retained as
  # a negative regression constant only: v2 canonical output must never
  # contain any of them. The v1 fixed ten-section production contract is
  # retired; no production renderer emits these headings anymore.
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

  # v2 production output schema (PCE-01 Compact Execution Envelope v2).
  EXECUTION_ENVELOPE_SCHEMA = "compact-execution-envelope-v2".freeze

  # Canonical top-level key order of the v2 envelope (deterministic).
  # scope_extra and allowed_files are mutually exclusive (scope derivation);
  # open_findings / closed_findings / git / forbidden are omitted when
  # their omission rules apply.
  ENVELOPE_TOP_LEVEL_ORDER = %w[
    delivery_type schema recipient paste_location purpose report_back_to
    next_hop_after_report baseline changes scope_extra allowed_files
    max_changed_files accept open_findings closed_findings validation git
    rules forbidden report completion_report_recipient completion_report_name
    stop_after_report
  ].freeze

  # Stable concise rule codes (v2 section: Stable Rules + Task Prohibitions).
  # The agent-visible output sends only these codes; their stable semantics
  # are documented in the standard.
  STABLE_RULES = %w[
    FETCH_VERIFY_EXACT_BASE VERIFY_WORKTREE_SAFE NO_AMEND NO_REBASE NO_SQUASH
    NO_FORCE_PUSH NO_DIRECT_FACT_BRANCH_WRITE NO_READY NO_MERGE NO_AUTO_MERGE
    NO_PUBLICATION STOP_ON_SCOPE_EXPANSION
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

  # PCE_01_PR_ONLY_ZERO_DELTA_F01: exact zero-repository-delta shape is
  # required_changes=[], allowed_files=[], maximum_changed_files=0. Any
  # other combination with empty changes is rejected; nonzero-delta
  # capsules are unaffected.
  def zero_delta?(data)
    return false unless data.is_a?(Hash)
    changes = data.dig("delta", "required_changes")
    allowed = data.dig("scope", "allowed_files")
    max_changed = data.dig("scope", "maximum_changed_files")
    changes.is_a?(Array) && changes.empty? &&
      allowed.is_a?(Array) && allowed.empty? && max_changed == 0
  end

    # Returns a classification code or nil when structurally valid.
    def validate(data)
      return "YAML_UNSUPPORTED" unless data.is_a?(Hash)

      # pr_head is optional and not part of the exact root key set; the
      # exact-key check therefore allows it as the sole extra root key.
      unknown = data.keys - CompactPrompt::ROOT_KEYS - CompactPrompt::OPTIONAL_ROOT_KEYS
      return "UNKNOWN_KEY" unless unknown.empty?
      missing = CompactPrompt::ROOT_KEYS - data.keys
      return "MISSING_REQUIRED_FIELD" unless missing.empty?

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
        # Zero-repository-delta (PCE_01_PR_ONLY_ZERO_DELTA_F01) allows empty
        # required_changes only when allowed_files=[] and
        # maximum_changed_files=0 hold together; acceptance criteria stay
        # non-empty for every shape.
        return "MISSING_REQUIRED_FIELD" if list.empty? && key != "required_changes"
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
      # Zero delta allows an empty allowed_files list; every other shape
      # keeps the non-empty requirement.
      unless zero_delta?(data)
        return "MISSING_REQUIRED_FIELD" if allowed_files.empty?
      end
      allowed_files.each do |path|
        return "FIELD_TYPE_INVALID" unless nonempty_string?(path)
        return "UNSAFE_PATH" if unsafe_path?(path)
      end
      max_changed_files = scope["maximum_changed_files"]
      # Empty changes with nonempty scope or positive max is rejected before
      # the max-value checks: zero delta is only the exact
      # required_changes=[]/allowed_files=[]/maximum_changed_files=0 triple.
      if delta["required_changes"].empty? && !zero_delta?(data)
        return "MISSING_REQUIRED_FIELD"
      end
      if zero_delta?(data)
        # Zero delta fixes maximum_changed_files at exactly 0.
        return "FIELD_TYPE_INVALID" unless max_changed_files.is_a?(Integer) && max_changed_files == 0
      else
        # Every other shape keeps the positive-integer requirement.
        return "FIELD_TYPE_INVALID" unless positive_integer?(max_changed_files)
      end

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

      # Zero-delta git contract: commit_count=0, push_mode=NONE and the
      # Draft-PR execution shape only (pull_request_action must be
      # CREATE_DRAFT); zero delta has no other execution meaning.
      if zero_delta?(data) && (git["commit_count"] != 0 || git["push_mode"] != "NONE" ||
                               git["pull_request_action"] != "CREATE_DRAFT")
        return "FIELD_TYPE_INVALID"
      end

      # Canonical exact PR-head identity (PCE_01_PR_ONLY_ZERO_DELTA_F01):
      # optional root field `pr_head` {branch, sha}; required for the
      # zero-delta CREATE_DRAFT shape, forbidden otherwise.
      pr_head = data["pr_head"]
      if pr_head.nil?
        if zero_delta?(data) && git["pull_request_action"] == "CREATE_DRAFT"
          return "MISSING_REQUIRED_FIELD"
        end
      elsif zero_delta?(data)
        return "FIELD_TYPE_INVALID" unless pr_head.is_a?(Hash)
        result = check_exact_keys(pr_head, %w[branch sha])
        return result if result
        return "FIELD_TYPE_INVALID" unless pr_head["branch"].is_a?(String) && !pr_head["branch"].empty?
        return "FIELD_TYPE_INVALID" unless CompactPrompt::GitNames.valid_branch?(pr_head["branch"])
        # A 40+ digit all-numeric SHA would parse as a YAML Integer; the
        # contract requires a string, so a type check fails closed first.
        return "FIELD_TYPE_INVALID" unless pr_head["sha"].is_a?(String)
        return "MISSING_REQUIRED_FIELD" if pr_head["sha"].empty?
        return "INVALID_SHA" unless pr_head["sha"].match?(CompactPrompt::SHA40_PATTERN)
      else
        return "FIELD_TYPE_INVALID"
      end

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
      # PCE-MR3-M4E4-REVIEW-01: an extensionless required_change's
      # code/non-code outcome is decided against exact baseline-tree
      # evidence. When that outcome can change the selected Profile's
      # applicability it is deferred to the repository-aware stage (after
      # GitBaseline.check) instead of being guessed as non-code here; known
      # extensions keep the fast pure decision exactly as before.
      extensionless_present = delta["required_changes"].any? { |path| path_extension(path).empty? }
      case profile
      when "DOC_ONLY"
        return "VALIDATION_UNDERSPECIFIED" if has_code
        return nil if extensionless_present
      when "PERSISTENCE_CONCURRENCY", "GLOBAL_CONTRACT"
        return "VALIDATION_OVERPROVISIONED" unless has_code || extensionless_present
      end

      nil
    end

    # True exactly when Capsule.validate deferred the applicability
    # decision: the selected Profile performs an applicability check
    # (DOC_ONLY / PERSISTENCE_CONCURRENCY / GLOBAL_CONTRACT), no known code
    # extension is present, and at least one extensionless required_change
    # exists whose baseline-tree entry can flip the outcome.
    def extensionless_applicability_deferred?(data)
      return false unless data.is_a?(Hash)
      profile = data["validation_profile"]
      return false unless %w[DOC_ONLY PERSISTENCE_CONCURRENCY GLOBAL_CONTRACT].include?(profile)
      changes = data.dig("delta", "required_changes")
      return false unless changes.is_a?(Array)
      return false if changes.any? { |path| CompactPrompt::CODE_EXTENSIONS.include?(path_extension(path)) }
      changes.any? { |path| path_extension(path).empty? }
    end

    # Repository-aware applicability completion (PCE-MR3-M4E4-REVIEW-01).
    # Runs only for deferred extensionless paths and only after the
    # GitBaseline exact named-ref gate, so baseline.head is already an
    # exact validated SHA. Each extensionless required_change is queried at
    # that exact commit tree; the sole supplemental code signal is
    # present && type == "blob" && mode == "100755". Absent entries,
    # non-blob entries and every other mode stay non-code. A git/parse
    # failure fails closed to INTERNAL_ERROR. Returns [code, path, message]
    # or nil.
    def repository_aware_applicability(data, git_state, root)
      baseline_head = data.dig("baseline", "head")
      profile = data["validation_profile"]
      code_signal = false
      data.dig("delta", "required_changes").each do |path|
        next unless path_extension(path).empty?
        entry = git_state.tree_entry(root, baseline_head, path)
        unless entry
          return ["INTERNAL_ERROR", "internal", "unexpected internal error; no backtrace emitted"]
        end
        present, type, mode = entry
        code_signal = true if present && type == "blob" && mode == "100755"
      end
      case profile
      when "DOC_ONLY"
        return ["VALIDATION_UNDERSPECIFIED", "capsule", "capsule contract violation"] if code_signal
      when "PERSISTENCE_CONCURRENCY", "GLOBAL_CONTRACT"
        return ["VALIDATION_OVERPROVISIONED", "capsule", "capsule contract violation"] unless code_signal
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
    #
    # PCE-01-C1R staged control flow (single implementation, no copies):
    #   policy root and commands schema
    #   → validation_profiles mapping basic schema (present, mapping,
    #     nonempty subset; missing unselected standard profile is valid)
    #   → unknown Profile key (wins over every later stage)
    #   → declared-profile structure, duplicates, conflicts, DOC_ONLY rules
    #   → selected-profile applicability (resolve_selected_profile, called
    #     by the CLI before template/Git baseline; also reused by the
    #     Renderer defensive path)
    #   → command ID resolution (validate_command_ids) for every declared
    #     profile
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
      return diags unless diags.empty?

      # Stage 2: validation_profiles basic schema. A nonempty subset of the
      # five standard profiles is valid; missing unselected profiles are
      # valid (they mean the project does not support them).
      unless data.key?("validation_profiles")
        diags << ["POLICY_SCHEMA_INVALID", "root", "missing key(s) validation_profiles"]
        return diags
      end
      profiles = data["validation_profiles"]
      unless profiles.is_a?(Hash)
        diags << ["POLICY_SCHEMA_INVALID", "validation_profiles", "must be a mapping"]
        return diags
      end
      if profiles.empty?
        diags << ["POLICY_PROFILE_MAPPING_MISSING", "validation_profiles",
                  "must declare at least one supported profile"]
        return diags
      end

      # Stage 3: unknown Profile key. POLICY_SCHEMA_INVALID wins even when
      # no supported profile is declared alongside it.
      unknown_profiles = profiles.keys - CompactPrompt::VALIDATION_PROFILES
      unless unknown_profiles.empty?
        diags << ["POLICY_SCHEMA_INVALID", "validation_profiles",
                  "unknown profile(s) #{unknown_profiles.join(', ')}; supported profiles are " \
                  "#{CompactPrompt::VALIDATION_PROFILES.join(', ')}"]
        return diags
      end

      # Stage 5: declared-profile structure, duplicates, conflicts and
      # DOC_ONLY rules, iterated in the fixed standard order (not YAML key
      # input order) and only for actually declared profiles.
      CompactPrompt::VALIDATION_PROFILES.each do |name|
        next unless profiles.key?(name)
        profile = profiles[name]
        unless profile.is_a?(Hash)
          diags << ["POLICY_SCHEMA_INVALID", "validation_profiles.#{name}", "profile mapping must be a mapping"]
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

    # ── Stage 6: single selected-profile resolver ──
    # Returns [mapping, nil] on success or [nil, [code, path, message]] when
    # the Capsule-selected profile is not declared by the policy. Called by
    # the CLI before template binding and Git baseline, and reused by the
    # Renderer defensive path. There is no absent → empty-list fallback.
    def resolve_selected_profile(data, profile)
      mapping = data.is_a?(Hash) ? data.dig("validation_profiles", profile) : nil
      if mapping.nil?
        return [nil, ["VALIDATION_PROFILE_UNSUPPORTED", "validation_profile",
                      "project policy does not declare selected profile #{profile}"]]
      end
      [mapping, nil]
    end

    # ── Stage 7: command ID resolution for every declared profile ──
    # Runs only after structural validation and selected-profile resolution
    # both pass. Checks all declared profiles, not just the selected one.
    def validate_command_ids(data)
      diags = []
      profiles = data.is_a?(Hash) ? data["validation_profiles"] : nil
      commands = data.is_a?(Hash) ? data["commands"] : nil
      return diags unless profiles.is_a?(Hash) && commands.is_a?(Hash)
      CompactPrompt::VALIDATION_PROFILES.each do |name|
        profile = profiles[name]
        next unless profile.is_a?(Hash)
        (profile["required_command_ids"].to_a + profile["forbidden_command_ids"].to_a).each do |id|
          unless commands.key?(id)
            diags << ["POLICY_COMMAND_ID_UNKNOWN", "validation_profiles.#{name}",
                      "command id #{id.inspect} is not registered in commands"]
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

    # Exact baseline-tree entry query (PCE-MR3-M4E4-REVIEW-01). Minimal
    # read-only addition used only for extensionless required_changes whose
    # code/non-code outcome can change selected-Profile applicability.
    #
    # Contract:
    #   commit argument is the already-validated exact capsule
    #     baseline.head (40-hex SHA) — never a branch, implicit HEAD or
    #     arbitrary revision expression;
    #   path is a repository-relative literal pathspec (`:(literal)`), so
    #     glob/pathspec magic can never change exact-match semantics; argv
    #     is fixed and never passes through a shell;
    #   no worktree metadata, no File.executable?, no fetch, no network.
    #
    # Returns:
    #   [true, type, mode]  entry present and parseable (type is one of
    #     blob/tree/commit, mode is the raw tree mode such as 100755)
    #   [false, nil, nil]   entry absent from the baseline tree (not a
    #     failure; caller treats it as non-code)
    #   nil                 git failure, unparseable output, multiple
    #     records or path mismatch — caller fails closed (INTERNAL_ERROR)
    def tree_entry(root, baseline_commit_sha, repository_relative_path)
      out, _err, status = Open3.capture3(
        "git", "-C", root, "ls-tree", "-z", baseline_commit_sha, "--",
        ":(literal)#{repository_relative_path}"
      )
      return nil unless status.success?
      records = out.split("\0").reject(&:empty?)
      return [false, nil, nil] if records.empty?
      return nil if records.length > 1 # one literal path can never match twice
      meta, name = records.first.split("\t", 2)
      return nil unless name == repository_relative_path # exact literal identity
      mode, type, = meta.split(" ", 3)
      return nil if mode.nil? || type.nil?
      [true, type, mode]
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

      # Zero-delta Draft-PR head binding (PCE_01_PR_ONLY_ZERO_DELTA_F01_
      # HEAD_BINDING): repository-aware validation requires both exact
      # refs/heads/<pr_head.branch> and refs/remotes/origin/<pr_head.branch>
      # to equal pr_head.sha; missing or mismatch fails closed. This is the
      # compile-time layer of the zero-delta CREATE_DRAFT drift-stop:
      # validate preflights it and compile reverifies it immediately before
      # envelope rendering (so no stale PR-head identity is ever rendered).
      # Mutation-time enforcement is a separate Agent-visible layer
      # (VERIFY_EXACT_PR_HEAD_BEFORE_PR, standard Conditional
      # Execution-Time Rule); the two layers are never conflated.
      if CompactPrompt::Capsule.zero_delta?(capsule) &&
         capsule.dig("git", "pull_request_action") == "CREATE_DRAFT"
        pr_branch = capsule.dig("pr_head", "branch")
        pr_sha = capsule.dig("pr_head", "sha")
        ["refs/heads/#{pr_branch}", "refs/remotes/origin/#{pr_branch}"].each do |ref|
          actual = git_state.exact_ref_head(root, ref)
          return ["PR_HEAD_REF_MISSING", ref, "PR-head ref does not exist"] if actual.nil?
          unless actual == pr_sha
            return ["PR_HEAD_SHA_MISMATCH", ref,
                    "PR-head ref head #{actual} does not equal pr_head.sha #{pr_sha}"]
          end
        end
      end

      nil
    end
  end

  # ── Template binding and conditionals ──
  # ── Template asset contract manifest (v2) ──
  #
  # templates/compact-codex-prompt-template.md is no longer a production
  # placeholder interpolation source. It is a human-readable canonical
  # shape reference / contract manifest for compact-execution-envelope-v2:
  #   schema_marker: compact-execution-envelope-v2
  #   production_placeholders: 0
  #   WHEN_ENDWHEN_blocks: 0
  #   fixed_10_section_contract: false
  # The CLI reads the asset and verifies those manifest properties
  # fail-closed before any validate/compile output; the same shared gate is
  # reused by the contract validator (no duplicated logic).

  module Template
    module_function

    # Placeholder-like token scan (`<...>` fragments, excluding HTML
    # comments). The v1 template-binding vocabulary is fully retired: the
    # v2 asset must contain zero such tokens.
    PLACEHOLDER_PATTERN = /<(?!!--)[^>\n]+>/

    # Shape-only check for the capsule template: exact key sets plus the two
    # contract markers report_back_to and stop_after_report: true.
    # Placeholder values are allowed; value rules apply to instances only.
    def capsule_template_shape_error(data)
      return "template root must be a mapping" unless data.is_a?(Hash)
      # pr_head is optional (PCE_01_PR_ONLY_ZERO_DELTA_F01); the template
      # may declare it, existing templates without it stay valid.
      unknown = data.keys - CompactPrompt::ROOT_KEYS - CompactPrompt::OPTIONAL_ROOT_KEYS
      return "template root keys must be exactly #{CompactPrompt::ROOT_KEYS.inspect} " \
             "plus optional #{CompactPrompt::OPTIONAL_ROOT_KEYS.inspect} (#{unknown.inspect})" unless unknown.empty?
      missing = CompactPrompt::ROOT_KEYS - data.keys
      return "template root keys must be exactly #{CompactPrompt::ROOT_KEYS.inspect} " \
             "plus optional #{CompactPrompt::OPTIONAL_ROOT_KEYS.inspect} " \
             "(missing #{missing.inspect})" unless missing.empty?
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

    # Returns [code, path, message] or nil when the template asset honors
    # the v2 contract manifest. Called by CLI validate, CLI compile and the
    # contract validator — one shared fail-closed gate.
    def contract_manifest_error(text)
      unless text.include?(CompactPrompt::EXECUTION_ENVELOPE_SCHEMA)
        return ["TEMPLATE_CONTRACT_INVALID", "template",
                "template asset must declare schema marker compact-execution-envelope-v2"]
      end
      placeholders = text.scan(PLACEHOLDER_PATTERN)
      unless placeholders.empty?
        return ["TEMPLATE_CONTRACT_INVALID", "template",
                "template asset must contain zero production placeholders " \
                "(found #{placeholders.uniq.sort.join(', ')})"]
      end
      if text.include?("<!-- WHEN") || text.include?("<!-- ENDWHEN")
        return ["TEMPLATE_CONTRACT_INVALID", "template",
                "template asset must contain zero WHEN/ENDWHEN blocks"]
      end
      if text.lines.grep(/\A## \d+\. /).any?
        return ["TEMPLATE_CONTRACT_INVALID", "template",
                "template asset must not declare the fixed ten-section contract"]
      end
      nil
    end
  end

  # ── Deterministic renderer ──
  # ── Deterministic renderer (v2) ──
  #
  # v2 production renderer: builds one canonical
  # compact-execution-envelope-v2 YAML document directly from the
  # normalized execution IR (validated Capsule + project policy + resolved
  # profile mapping). There is no template placeholder interpolation, no
  # WHEN/ENDWHEN expansion and no fixed ten-section Markdown contract. The
  # v1 production renderer is retired; no dual renderer, feature flag or
  # legacy production fallback exists.

  module Renderer
    module_function

    # Deterministic YAML double-quoted scalar. Backslash and double quote
    # use YAML escapes; CR/LF/tab/NUL and other control characters become
    # \r \n \t \0 \xNN; `<`/`>` become \u003C/\u003E so placeholder-like
    # and marker-like user text stays valid YAML and can never form a
    # second delivery_type, schema, key, heading or material. No character
    # is ever silently dropped: YAML.safe_load of the quoted scalar equals
    # the original Capsule/Policy string.
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
          when "\u2028" then "\\u2028"
          when "\u2029" then "\\u2029"
          else
            # C0 controls, DEL and C1 controls (0x80-0x9F) become \xNN so
            # no control byte can reach the output verbatim.
            ch.ord < 0x20 || ch.ord == 0x7f || (ch.ord >= 0x80 && ch.ord <= 0x9f) ? format("\\x%02X", ch.ord) : ch
          end
        end.join
        "\"#{escaped}\""
      end
    end

    # Returns [text, nil] or [nil, [code, path, message]].
    # `resolved_profile_mapping` is the single optional mapping input: the
    # CLI normal path passes the mapping it already resolved (so the
    # renderer never resolves twice); direct-callers without it trigger
    # exactly one defensive resolution through the shared resolver.
    def render(capsule, policy, resolved_profile_mapping: nil)
      action = capsule.dig("git", "pull_request_action")
      pr = capsule.dig("baseline", "pull_request")
      if action == "CREATE_DRAFT" && pr != "none"
        return [nil, ["GIT_ACTION_CONFLICT", "baseline.pull_request",
                      "CREATE_DRAFT requires baseline.pull_request=none"]]
      end
      if action == "UPDATE_DRAFT" && !(pr.is_a?(Integer) && pr >= 1)
        return [nil, ["GIT_ACTION_CONFLICT", "baseline.pull_request",
                      "UPDATE_DRAFT requires baseline.pull_request to be a positive integer"]]
      end

      resolved_mapping = resolved_profile_mapping
      if resolved_mapping.nil?
        # Defensive direct-call path: resolve exactly once through the same
        # resolver the CLI uses; no duplicated applicability logic.
        resolved_mapping, rerr = CompactPrompt::Policy.resolve_selected_profile(
          policy, capsule["validation_profile"]
        )
        return [nil, rerr] if rerr
      end

      text = Envelope.build(capsule, policy, resolved_mapping)
      verr = verify_output(text)
      return [nil, verr] if verr
      [text, nil]
    end

    # Canonical output verifier: valid UTF-8, no CR bytes, exactly one
    # `delivery_type: CODEX_EXECUTION_PROMPT`, exactly one
    # `schema: compact-execution-envelope-v2`, zero legacy ten-section
    # headings, zero placeholder-like / marker-like tokens, exactly one
    # trailing LF, a single restricted-YAML document with the v2 schema and
    # the canonical top-level key order. The budget gate runs on this
    # verified output afterwards (line → byte → proxy token).
    def verify_output(text)
      return ["RENDER_INCOMPLETE", "output", "output is not valid UTF-8"] unless text.valid_encoding?
      return ["RENDER_INCOMPLETE", "output", "output must not contain CR bytes"] if text.include?("\r")
      unless text.scan(/^delivery_type:/).length == 1 &&
             text.scan(/^delivery_type: CODEX_EXECUTION_PROMPT/).length == 1
        return ["RENDER_INCOMPLETE", "output",
                "must contain exactly one delivery_type: CODEX_EXECUTION_PROMPT"]
      end
      unless text.scan(/^schema: compact-execution-envelope-v2/).length == 1
        return ["RENDER_INCOMPLETE", "output",
                "must contain exactly one schema: compact-execution-envelope-v2"]
      end
      legacy = CompactPrompt::CODEX_PROMPT_SECTIONS.select { |section| text.include?(section) }
      unless legacy.empty?
        return ["RENDER_INCOMPLETE", "output", "legacy ten-section heading(s) must not appear"]
      end
      if text.include?("<!--") || text.match?(/<[A-Za-z][A-Za-z0-9_.-]*>/)
        return ["RENDER_INCOMPLETE", "output",
                "placeholder-like or marker-like text must not appear in canonical output"]
      end
      unless text.end_with?("\n") && !text.end_with?("\n\n")
        return ["RENDER_INCOMPLETE", "output", "output must end with exactly one LF"]
      end
      parsed, classification = CompactPrompt::RestrictedYAML.parse(text)
      if classification
        return ["RENDER_INCOMPLETE", "output",
                "output must be a single restricted-YAML document (#{classification})"]
      end
      unless parsed.is_a?(Hash) && parsed["schema"] == CompactPrompt::EXECUTION_ENVELOPE_SCHEMA
        return ["RENDER_INCOMPLETE", "output",
                "output must parse to a mapping with schema compact-execution-envelope-v2"]
      end
      actual_order = []
      text.each_line do |line|
        # 顶层 key 行以字母开头；缩进的嵌套行（`  repository:` 等）自动
        # 跳过，遍历整份文档收集全部顶层 key，而不是在第一个嵌套行 break。
        next unless line.match?(/\A[A-Za-z_][A-Za-z0-9_]*:(\s|\z)/)
        actual_order << line.split(":", 2).first
      end
      expected_order = CompactPrompt::ENVELOPE_TOP_LEVEL_ORDER.select { |key| actual_order.include?(key) }
      unless actual_order == expected_order
        return ["RENDER_INCOMPLETE", "output",
                "top-level key order must be canonical (#{actual_order.inspect})"]
      end
      nil
    end
  end

  # ── Canonical Execution Envelope v2 builder ──
  #
  # Builds the single canonical compact YAML document text from the
  # normalized execution IR (validated Capsule + policy + resolved profile
  # mapping). Explicit canonical serialization: 2-space indent, fixed key
  # order, LF line endings, exactly one trailing LF. YAML.dump is never the
  # byte authority. Fixed contract values render as plain scalars; every
  # Capsule/Policy user string passes through the shared YAML scalar
  # encoder, so single-line injection protection is never weakened.
  #
  # Omission / derivation rules (standard section 5):
  #   baseline.pull_request omitted when "none", rendered when positive;
  #   findings omitted when empty, rendered as id lists (status derived
  #     from the key, OPEN/CLOSED never repeated);
  #   scope derivation: changes only when required == allowed; changes +
  #     scope_extra when both lists are unique and allowed_files is a
  #     strict superset of required_changes (extras keep allowed_files
  #     order); otherwise changes + full allowed_files — scope is never
  #     dropped to compress;
  #   validation.forbid omitted when the forbidden list is empty;
  #   git is a positive-action allowlist: commit/message only when
  #     commit_count == 1; branch/push only when NORMAL_PUSH; pr/pr_base
  #     only for CREATE_DRAFT / UPDATE_DRAFT; the whole git mapping is
  #     omitted when commit_count == 0, push_mode == NONE and PR action
  #     == NONE.

  module Envelope
    module_function

    # 2-space indented `key: <quoted scalar>` line.
    def kv(indent, key, value)
      "#{"  " * indent}#{key}: #{CompactPrompt::Renderer.render_yaml_scalar(value)}\n"
    end

    # 2-space indented `key: <plain value>` line for fixed contract values.
    def kv_plain(indent, key, value)
      "#{"  " * indent}#{key}: #{value}\n"
    end

    # Block-style list of quoted scalars (user data). An empty list renders
    # as the flow `[]` so it parses back as an empty array, never as null
    # (zero-repository-delta shape, PCE_01_PR_ONLY_ZERO_DELTA_F01).
    def kv_list(indent, key, items)
      return "#{"  " * indent}#{key}: []\n" if items.nil? || items.empty?
      out = +"#{"  " * indent}#{key}:\n"
      items.each { |item| out << "#{"  " * (indent + 1)}- #{CompactPrompt::Renderer.render_yaml_scalar(item)}\n" }
      out
    end

    # Block-style list of plain scalars (fixed rule codes).
    def kv_list_plain(indent, key, items)
      out = +"#{"  " * indent}#{key}:\n"
      items.each { |item| out << "#{"  " * (indent + 1)}- #{item}\n" }
      out
    end

    # Flow-style list of plain scalars (fixed completion report fields).
    def kv_flow(indent, key, items)
      "#{"  " * indent}#{key}: [#{items.join(", ")}]\n"
    end

    # Scope derivation block (see module comment).
    def scope_block(capsule)
      required = capsule.dig("delta", "required_changes")
      allowed = capsule.dig("scope", "allowed_files")
      return "" if required == allowed
      if required.uniq == required && allowed.uniq == allowed &&
         required.all? { |change| allowed.include?(change) } && allowed.length > required.length
        extras = allowed.reject { |path| required.include?(path) }
        return kv_list(0, "scope_extra", extras)
      end
      kv_list(0, "allowed_files", allowed)
    end

    def build(capsule, policy, resolved_mapping)
      out = +""
      out << kv_plain(0, "delivery_type", "CODEX_EXECUTION_PROMPT")
      out << kv_plain(0, "schema", CompactPrompt::EXECUTION_ENVELOPE_SCHEMA)
      out << kv(0, "recipient", capsule.dig("routing", "recipient"))
      out << kv(0, "paste_location", capsule.dig("routing", "paste_location"))
      out << kv(0, "purpose", capsule["objective"])
      out << kv(0, "report_back_to", capsule.dig("routing", "report_back_to"))
      out << kv(0, "next_hop_after_report", capsule.dig("routing", "next_hop_after_report"))
      out << "baseline:\n"
      out << kv(1, "repository", capsule.dig("baseline", "repository"))
      out << kv(1, "branch", capsule.dig("baseline", "branch"))
      out << kv(1, "head", capsule.dig("baseline", "head"))
      pr = capsule.dig("baseline", "pull_request")
      out << kv(1, "pull_request", pr) if pr.is_a?(Integer) && pr >= 1
      out << kv_list(0, "changes", capsule.dig("delta", "required_changes"))
      out << scope_block(capsule)
      out << kv(0, "max_changed_files", capsule.dig("scope", "maximum_changed_files"))
      out << kv_list(0, "accept", capsule.dig("delta", "acceptance_criteria"))
      open_findings = capsule.dig("delta", "open_findings")
      closed_findings = capsule.dig("delta", "preserved_closed_findings")
      unless open_findings.empty?
        out << kv_list(0, "open_findings", open_findings.map { |finding| finding["id"] })
      end
      unless closed_findings.empty?
        out << kv_list(0, "closed_findings", closed_findings.map { |finding| finding["id"] })
      end
      out << "validation:\n"
      out << kv_plain(1, "profile", capsule["validation_profile"])
      run_ids = resolved_mapping["required_command_ids"] || []
      forbid_ids = resolved_mapping["forbidden_command_ids"] || []
      out << kv_list(1, "run",
                     run_ids.map { |id| Shellwords.join(policy.dig("commands", id, "argv")) })
      unless forbid_ids.empty?
        out << kv_list(1, "forbid",
                       forbid_ids.map { |id| Shellwords.join(policy.dig("commands", id, "argv")) })
      end
      commit_count = capsule.dig("git", "commit_count")
      push_mode = capsule.dig("git", "push_mode")
      pr_action = capsule.dig("git", "pull_request_action")
      if commit_count == 1 || push_mode == "NORMAL_PUSH" || pr_action != "NONE"
        out << "git:\n"
        if commit_count == 1
          out << kv_plain(1, "commit", 1)
          out << kv(1, "message", capsule.dig("git", "commit_message"))
        end
        if push_mode == "NORMAL_PUSH"
          out << kv_plain(1, "branch", "DERIVE_FROM_FACT_BRANCH")
          out << kv_plain(1, "push", "NORMAL_PUSH")
        end
        case pr_action
        when "CREATE_DRAFT"
          out << kv_plain(1, "pr", "CREATE_DRAFT")
          out << kv_plain(1, "pr_base", "FACT_BRANCH")
          # Canonical exact PR-head identity for the zero-repository-delta
          # Draft-PR shape: the PR head branch and its exact 40-hex SHA are
          # contract values rendered verbatim; baseline stays the exact PR
          # base.
          if CompactPrompt::Capsule.zero_delta?(capsule)
            out << "  pr_head:\n"
            out << kv(2, "branch", capsule.dig("pr_head", "branch"))
            out << kv(2, "sha", capsule.dig("pr_head", "sha"))
          end
        when "UPDATE_DRAFT"
          out << kv_plain(1, "pr", "UPDATE_DRAFT")
        end
      end
      # Stable concise rule codes plus the conditional execution-time rule:
      # for the zero-repository-delta CREATE_DRAFT shape only, the
      # Agent-visible rules additionally include
      # VERIFY_EXACT_PR_HEAD_BEFORE_PR (mutation-time drift-stop, standard
      # section 5.3). Ordinary nonzero-delta output never carries it.
      rules = CompactPrompt::STABLE_RULES.dup
      if CompactPrompt::Capsule.zero_delta?(capsule) &&
         capsule.dig("git", "pull_request_action") == "CREATE_DRAFT"
        rules << "VERIFY_EXACT_PR_HEAD_BEFORE_PR"
      end
      out << kv_list_plain(0, "rules", rules)
      # Task-specific prohibitions: exact duplicates keep only the first
      # occurrence; entries identical to a stable rule code are not
      # repeated (the stable codes are already in rules). No fuzzy NLP or
      # guessed semantic deletion ever happens — a task prohibition that
      # merely looks like a stable rule is never dropped.
      forbidden = capsule["forbidden_actions"].uniq
                  .reject { |action| CompactPrompt::STABLE_RULES.include?(action) }
      out << kv_list(0, "forbidden", forbidden) unless forbidden.empty?
      out << "report:\n"
      out << kv(1, "max_lines", capsule.dig("completion_report", "maximum_lines"))
      out << kv_flow(1, "fields", CompactPrompt::COMPLETION_REPORT_FIELDS)
      out << kv(0, "completion_report_recipient", capsule.dig("completion_report", "recipient"))
      out << kv(0, "completion_report_name", capsule.dig("completion_report", "name"))
      out << kv_plain(0, "stop_after_report", "true")
      out
    end
  end

  # ── PCE_UNICODE_WORDPUNCT_V1 proxy-token metric ──
  #
  # Deterministic proxy metric for prompt size; it is NOT a model-exact
  # token count and no exact-model-token claim is ever made. No Unicode
  # normalization is applied. On valid UTF-8 canonical output the metric
  # is equivalent to scanning with:
  #
  #   /[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]|[\p{L}\p{M}\p{N}_]+|[^\p{Space}]/u
  #
  # with the frozen semantics:
  #   Han/Hiragana/Katakana/Hangul: each code point = 1
  #   other Unicode letter/mark/number/underscore: contiguous run = 1
  #   all other non-whitespace code points: each = 1
  #   whitespace: 0
  #
  # Onigmo's \p{L} class contains Han/Hiragana/Katakana/Hangul, so a plain
  # alternation scan would fold a Han character into a neighbouring
  # letter run (e.g. "A中B" → 1 instead of 3). The implementation below
  # splits CJK code points out first and then scans the remaining
  # fragments with the letter-run alternation, which yields exactly the
  # frozen semantics (the fixture case table is the authority).
  #
  # No tokenizer gem, network access or model dependency is introduced.

  module ProxyToken
    module_function

    CJK_PATTERN = /[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]/u
    RUN_PATTERN = /[\p{L}\p{M}\p{N}_]+|[^\p{Space}]/u

    def count(text)
      text.split(/(#{CJK_PATTERN})/u).sum do |part|
        if part.match?(/\A#{CJK_PATTERN}\z/u)
          1
        else
          part.scan(RUN_PATTERN).length
        end
      end
    end
  end

  # ── Budget gate ──

  module Budget
    module_function

    # Returns [code, path, message] or nil. Deterministic gate order on the
    # verified canonical output: logical line count → UTF-8 byte count →
    # PCE_UNICODE_WORDPUNCT_V1 proxy-token count. There is no silent pass,
    # no automatic constraint deletion, no automatic mode upgrade and no
    # numeric waiver.
    def check(text, mode)
      budget = CompactPrompt::PROMPT_MODE_BUDGETS[mode]
      lines = text.lines.count
      bytes = text.bytesize
      return ["PROMPT_LINE_LIMIT_EXCEEDED", "output",
              "#{lines} lines exceed #{budget['hard_limit_lines']} for #{mode}"] if lines > budget["hard_limit_lines"]
      return ["PROMPT_BYTE_LIMIT_EXCEEDED", "output",
              "#{bytes} bytes exceed #{budget['hard_limit_bytes']} for #{mode}"] if bytes > budget["hard_limit_bytes"]
      tokens = CompactPrompt::ProxyToken.count(text)
      return ["PROMPT_PROXY_TOKEN_LIMIT_EXCEEDED", "output",
              "#{tokens} proxy tokens exceed #{budget['hard_limit_proxy_tokens']} for #{mode}"] if tokens > budget["hard_limit_proxy_tokens"]
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
      "VALIDATION_PROFILE_UNSUPPORTED" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                            "meaning" => "Capsule selected validation profile is not declared by project policy" },
      "DOC_ONLY_ROOT_NPM_TEST_FORBIDDEN" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                              "meaning" => "DOC_ONLY must not require root npm test" },
      "TEMPLATE_FILE_MISSING" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                   "meaning" => "prompt template file not found" },
      "TEMPLATE_CONTRACT_INVALID" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                       "meaning" => "prompt template asset violates the v2 contract manifest" },
      "GIT_ACTION_CONFLICT" => { "exit" => 3, "category" => "CONTRACT_OR_POLICY",
                                 "meaning" => "git.pull_request_action conflicts with baseline.pull_request" },
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
      "PR_HEAD_REF_MISSING" => { "exit" => 4, "category" => "GIT_BASELINE",
                                 "meaning" => "zero-delta PR-head exact ref does not exist" },
      "PR_HEAD_SHA_MISMATCH" => { "exit" => 4, "category" => "GIT_BASELINE",
                                  "meaning" => "zero-delta PR-head exact ref head != pr_head.sha" },
      # exit 5 — RENDER_OR_BUDGET
      "RENDER_INCOMPLETE" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                               "meaning" => "canonical output verification failed" },
      "PROMPT_LINE_LIMIT_EXCEEDED" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                                        "meaning" => "logical line count exceeds mode hard limit" },
      "PROMPT_BYTE_LIMIT_EXCEEDED" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                                        "meaning" => "UTF-8 byte count exceeds mode hard limit" },
      "PROMPT_PROXY_TOKEN_LIMIT_EXCEEDED" => { "exit" => 5, "category" => "RENDER_OR_BUDGET",
                                               "meaning" => "PCE_UNICODE_WORDPUNCT_V1 proxy-token count exceeds mode hard limit" },
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
      # Stage 6: selected-profile applicability (before template binding and
      # Git baseline). Fail closed: no absent → empty-list fallback.
      resolved_mapping, rerr = CompactPrompt::Policy.resolve_selected_profile(
        pdata, data["validation_profile"]
      )
      if rerr
        stderr.write(CompactPrompt::Diagnostics.format(*rerr))
        return Diagnostics.exit_for(rerr[0])
      end
      # Stage 7: command ID resolution for every declared profile.
      cdiags = CompactPrompt::Policy.validate_command_ids(pdata)
      unless cdiags.empty?
        stderr.write(CompactPrompt::Diagnostics.render(cdiags))
        return Diagnostics.exit_for(cdiags.first[0])
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
      # Template asset contract manifest first (v2): the asset must declare
      # the compact-execution-envelope-v2 schema marker, contain zero
      # production placeholders, zero WHEN/ENDWHEN blocks and must not
      # declare the fixed ten-section contract. One shared fail-closed gate
      # for validate, compile and the contract validator.
      terr = CompactPrompt::Template.contract_manifest_error(ttext)
      if terr
        stderr.write(CompactPrompt::Diagnostics.format(*terr))
        return Diagnostics.exit_for(terr[0])
      end

      gerr = CompactPrompt::GitBaseline.check(data, pdata, gs, cwd)
      if gerr
        stderr.write(CompactPrompt::Diagnostics.format(*gerr))
        return Diagnostics.exit_for(gerr[0])
      end

      # PCE-MR3-M4E4-REVIEW-01: complete deferred extensionless
      # applicability against exact baseline-tree evidence (baseline.head
      # already passed Capsule SHA validation and the GitBaseline exact
      # named-ref gate) before any validate/compile output is produced.
      if CompactPrompt::Capsule.extensionless_applicability_deferred?(data)
        aerr = CompactPrompt::Capsule.repository_aware_applicability(data, gs, root)
        if aerr
          stderr.write(CompactPrompt::Diagnostics.format(*aerr))
          return Diagnostics.exit_for(aerr[0])
        end
      end

      if command == "validate"
        stdout.write(VALIDATE_SUCCESS)
        return EXIT_OK
      end

      prompt, rerr = CompactPrompt::Renderer.render(
        data, pdata, resolved_profile_mapping: resolved_mapping
      )
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
