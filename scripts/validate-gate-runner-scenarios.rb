#!/usr/bin/env ruby
# frozen_string_literal: true

# Gate Runner Scenario Conformance Harness (validation-only)
#
# authority=validation_only
# runtime_authority=false
# gate_decision_authority=false
# implementation_authority=false
# merge_authority=false
# publication_authority=false
#
# Deterministic, no-network, validation-only conformance oracle for the two
# special sdlc-gate-runner Gates (development_path_entry and
# documentation_governance_tail_completion). This harness is a standard-package
# development-time oracle. It is NOT sdlc-gate-runner, NOT a formal Gate
# artifact, NOT a target project runtime input, and NOT the owner of Manifest,
# Sync, Reconcile, or D09 semantics. No run here creates real Gate, review,
# merge, or publication facts, and no run writes the real manifest or
# library/**.
#
# The harness loads fixtures/gate-runner-scenarios/scenarios.yaml with
# YAML.safe_load(permitted_classes: [], aliases: false), validates the schema,
# computes the actual outcome of every scenario independently, deep-compares
# every expected field, simulates Stage B persistence inside per-scenario
# tmpdirs (deterministic write-failure injection, real read-back after real
# write, filename-versioned companion rejection), verifies tmpdir cleanup, and
# runs in-memory self-tests that must genuinely expect validation failures.
#
# Success markers are printed only after the corresponding assertions pass.

require "yaml"
require "tmpdir"
require "fileutils"
require "digest"

ROOT = File.expand_path("..", __dir__)
FIXTURE_PATH = File.join(ROOT, "fixtures", "gate-runner-scenarios", "scenarios.yaml")

SCHEMA_VERSION = "gate-runner-scenario-conformance-v1"
AUTHORITY = "validation_only"
NOT_APPLICABLE = "not_applicable"

ALLOWED_ROOT_FIELDS = %w[schema_version authority canonical_sources required_coverage_tags scenarios].freeze
ALLOWED_SCENARIO_FIELDS = %w[id coverage_tags gate_type input expected].freeze
ALLOWED_EXPECTED_FIELDS = %w[
  result can_continue implementation_entry_eligible tail_completion_eligible
  completion_source_established manifest_completed_recommendation route
  earliest_affected_node required_regate blockers reused_existing_evidence
  professional_skill_execution_requested
].freeze
ALLOWED_GATE_TYPES = %w[development_path_entry documentation_governance_tail_completion].freeze
ALLOWED_RESULTS = %w[PASS FAIL PASS_WITH_RISK].freeze

BOOLEAN_EXPECTED_FIELDS = %w[
  can_continue implementation_entry_eligible tail_completion_eligible
  completion_source_established manifest_completed_recommendation required_regate
  reused_existing_evidence professional_skill_execution_requested
].freeze

REQUIRED_COVERAGE_TAGS = %w[
  development_path_direct development_path_speckit development_path_wrong_route
  development_path_blocked development_path_stale direct_tail_no_sync
  direct_tail_sync_authorized direct_tail_sync_unauthorized direct_tail_missing_evidence
  speckit_evidence_reuse pipeline_result_not_gate pure_governance response_only
  persistence_failure readback_mismatch stale_evidence pass_with_risk
  invalid_risk_acceptance precompleted_without_source
].freeze

FIXED_SCENARIO_IDS = %w[
  DPE-01-DIRECT-PASS DPE-02-SPECKIT-PASS DPE-03-WRONG-DIRECT-ROUTE
  DPE-04-BLOCKED-REVISION DPE-05-BLOCKED-UNKNOWN DPE-06-STALE-DECISION
  TAIL-D-01-DIRECT-NO-SYNC TAIL-D-02-DIRECT-SYNCED TAIL-D-03-SYNC-NOT-AUTHORIZED
  TAIL-D-04-RECONCILE-INCOMPLETE TAIL-D-05-MISSING-TEST-ACCEPTANCE
  TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED
  TAIL-S-01-REUSE-CURRENT-EVIDENCE TAIL-S-02-PIPELINE-RESULT-NOT-GATE
  TAIL-S-03-STALE-PIPELINE-EVIDENCE TAIL-G-01-PURE-GOVERNANCE
  TAIL-G-02-INCOMPLETE-SKIP-BASIS TAIL-G-03-PURE-DOCUMENTATION-MISSING-SKIP-BASIS
  TAIL-P-01-RESPONSE-ONLY TAIL-P-02-WRITE-FAILURE
  TAIL-P-03-READBACK-MISMATCH TAIL-P-04-PASS-WITH-RISK TAIL-P-05-INCOMPLETE-RISK-ACCEPTANCE
  TAIL-P-06-CRITICAL-RISK TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE
].freeze

ENTRY_DECISIONS = %w[DIRECT_IMPLEMENTATION SPECKIT_PIPELINE_REQUIRED BLOCKED_NEEDS_REVISION].freeze
ENTRY_SCOPES = %w[FULL_REQUIREMENT DELTA_CHANGE].freeze
ENTRY_COMPLEXITIES = %w[SIMPLE MEDIUM COMPLEX BLOCKED_UNKNOWN].freeze
SYNC_DECISIONS = %w[SYNC_REQUIRED NOT_REQUIRED PROPOSAL_REQUIRED BLOCKED DUPLICATE_SYNC_BLOCKED].freeze
RECONCILE_DECISIONS = %w[required not_required blocked].freeze
ALWAYS_REQUIRED_ARTIFACTS = %w[03-实现记录 04-代码审核 05-测试验收].freeze

# ── R1: strict recursive nested input schema (fail-closed) ──────────────────

ENTRY_INPUT_FIELDS = %w[
  requirement specification_gate development_path reviewed_artifact tail_initial
  blocking_change regate risk requested_route
].freeze
TAIL_INPUT_FIELDS = %w[
  requirement work_kind tail artifacts skipped_items blocking_items
  business_domain_sync reconcile entry_coverage regate risk pipeline reuse
  completion_evidence reviewed_artifact persistence
].freeze
REQUIREMENT_FIELDS = %w[id manifest_present manifest_requirement_match].freeze
SPECIFICATION_GATE_FIELDS = %w[result risk_acceptance].freeze
DEVELOPMENT_PATH_FIELDS = %w[decision decision_scope complexity source_present artifact_present freshness].freeze
REVIEWED_ARTIFACT_FIELDS = %w[path_present version_matches freshness].freeze
TAIL_INITIAL_FIELDS = %w[required_determined scope_determined status_determined].freeze
BLOCKING_CHANGE_FIELDS = %w[present unresolved].freeze
ENTRY_REGATE_FIELDS = %w[required result].freeze
RISK_FIELDS = %w[level acceptance].freeze
TAIL_FIELDS = %w[required scope status completion_source_present completion_source_current].freeze
ARTIFACT_FIELDS = %w[item status version_matches].freeze
SKIP_RECORD_FIELDS = %w[item basis scope reason evidence decision_source decision_owner version_basis stale_condition].freeze
SYNC_FIELDS = %w[decision execution_required execution_status execution_result freshness write_authorized].freeze
RECONCILE_FIELDS = %w[decision execution_required execution_status execution_result freshness].freeze
ENTRY_COVERAGE_FIELDS = %w[applicable status freshness].freeze
TAIL_REGATE_FIELDS = %w[required result freshness].freeze
PIPELINE_FIELDS = %w[status freshness scope_matched].freeze
REUSE_FIELDS = %w[sync_reconcile_current].freeze
COMPLETION_EVIDENCE_FIELDS = %w[present].freeze
PERSISTENCE_FIELDS = %w[authorized mode version tamper_field].freeze

GATE_RESULT_VALUES = %w[PASS FAIL PASS_WITH_RISK].freeze
RISK_ACCEPTANCE_VALUES = %w[none complete incomplete].freeze
FRESHNESS_VALUES = %w[current stale].freeze
WORK_KIND_VALUES = %w[actual_implementation pure_documentation pure_governance].freeze
TAIL_STATUS_VALUES = %w[planned in_progress blocked completed not_required stale].freeze
ARTIFACT_STATUS_VALUES = %w[current missing stale not_required not_applicable].freeze
SKIP_BASIS_VALUES = %w[complete incomplete].freeze
SYNC_EXECUTION_STATUS_VALUES = %w[not_started in_progress done blocked].freeze
SYNC_EXECUTION_RESULT_VALUES = %w[not_run synced proposal partial not_required blocked].freeze
RECONCILE_EXECUTION_RESULT_VALUES = %w[not_run complete not_required blocked].freeze
ENTRY_COVERAGE_STATUS_VALUES = %w[PASS PENDING FAILED BLOCKED not_applicable].freeze
REGATE_RESULT_VALUES = %w[PASS FAIL not_applicable].freeze
RISK_LEVEL_VALUES = %w[none High Critical].freeze
PIPELINE_STATUS_VALUES = %w[COMPLETED PARTIAL BLOCKED not_applicable].freeze
PERSISTENCE_MODE_VALUES = %w[real_write response_only write_failure_injected readback_mismatch_injected companion_injected].freeze
TAMPER_FIELD_VALUES = %w[none result completion_decision_source version].freeze
REQUESTED_ROUTE_VALUES = %w[direct speckit none].freeze

# Risk blockers never make a COMPLETED pipeline result relevant: Pipeline
# result cannot substitute Tail evidence, but a risk-only failure is not an
# evidence-substitution situation.
RISK_BLOCKERS = [
  "High risk without complete acceptance",
  "Critical risk cannot be accepted",
  "risk decision inconsistent"
].freeze

GROUPS = {
  "DPE-" => "GATE_RUNNER_ENTRY_SCENARIOS_PASS",
  "TAIL-D-" => "GATE_RUNNER_DIRECT_TAIL_SCENARIOS_PASS",
  "TAIL-S-" => "GATE_RUNNER_SPECKIT_REUSE_SCENARIOS_PASS",
  "TAIL-G-" => "GATE_RUNNER_GOVERNANCE_SCENARIOS_PASS"
}.freeze

def relative(path)
  path.sub("#{ROOT}/", "")
end

# ── Parsing (safe load) ─────────────────────────────────────────────────────

def parse_fixture_text(text, label)
  data = YAML.safe_load(text, permitted_classes: [], aliases: false)
  raise "#{label}: fixture root must be a Hash" unless data.is_a?(Hash)

  data
rescue Psych::Exception => e
  raise "#{label}: unsafe or invalid YAML (#{e.class}): #{e.message}"
end

def unsafe_canonical_source?(path)
  return true if path.empty?
  return true if path.start_with?("/", "~")
  return true if path.match?(/\A[A-Za-z]:\//)
  return true if path.include?("\\") || path.include?("://")

  path.split("/").include?("..")
end

# ── Schema validation ───────────────────────────────────────────────────────

def validate_root(data, label, errors)
  (data.keys - ALLOWED_ROOT_FIELDS).each do |field|
    errors << "#{label}: unknown root field #{field.inspect}"
  end

  errors << "#{label}: schema_version must be #{SCHEMA_VERSION.inspect}" unless data["schema_version"] == SCHEMA_VERSION
  errors << "#{label}: authority must be #{AUTHORITY.inspect}" unless data["authority"] == AUTHORITY

  sources = data["canonical_sources"]
  unless sources.is_a?(Array) && !sources.empty?
    errors << "#{label}: canonical_sources must be a non-empty array"
  else
    errors << "#{label}: canonical_sources contains duplicates" if sources.uniq.size != sources.size
    sources.each do |source|
      unless source.is_a?(String)
        errors << "#{label}: canonical source must be a string (got #{source.inspect})"
        next
      end
      if unsafe_canonical_source?(source)
        errors << "#{label}: unsafe canonical source path #{source.inspect}"
        next
      end
      abs = File.join(ROOT, source)
      errors << "#{label}: canonical source missing or not a regular file: #{source}" unless File.file?(abs)
    end
  end

  tags = data["required_coverage_tags"]
  unless tags.is_a?(Array) && !tags.empty?
    errors << "#{label}: required_coverage_tags must be a non-empty array"
  else
    errors << "#{label}: required_coverage_tags contains duplicates" if tags.uniq.size != tags.size
    (tags - REQUIRED_COVERAGE_TAGS).each do |tag|
      errors << "#{label}: unknown required coverage tag #{tag.inspect}"
    end
    (REQUIRED_COVERAGE_TAGS - tags).each do |tag|
      errors << "#{label}: missing required coverage tag #{tag.inspect}"
    end
  end

  errors << "#{label}: scenarios must be an array" unless data["scenarios"].is_a?(Array)
end

def validate_expected(expected, id, label, errors)
  (expected.keys - ALLOWED_EXPECTED_FIELDS).each do |field|
    errors << "#{label}: scenario #{id.inspect} expected unknown field #{field.inspect}"
  end

  result = expected["result"]
  unless ALLOWED_RESULTS.include?(result)
    errors << "#{label}: scenario #{id.inspect} expected result must be PASS|FAIL|PASS_WITH_RISK (got #{result.inspect})"
  end

  BOOLEAN_EXPECTED_FIELDS.each do |field|
    value = expected[field]
    unless [true, false, NOT_APPLICABLE].include?(value)
      errors << "#{label}: scenario #{id.inspect} expected #{field} must be a boolean or not_applicable (got #{value.inspect})"
    end
  end

  route = expected["route"]
  unless %w[direct speckit not_applicable].include?(route)
    errors << "#{label}: scenario #{id.inspect} expected route must be direct|speckit|not_applicable (got #{route.inspect})"
  end

  earliest = expected["earliest_affected_node"]
  errors << "#{label}: scenario #{id.inspect} expected earliest_affected_node must be a string" unless earliest.is_a?(String)

  blockers = expected["blockers"]
  if blockers.is_a?(Array) && blockers.all? { |b| b.is_a?(String) }
    errors << "#{label}: scenario #{id.inspect} expected blockers contains duplicates" if blockers.uniq.size != blockers.size
  else
    errors << "#{label}: scenario #{id.inspect} expected blockers must be an array of strings"
  end
end

# ── R1: strict recursive nested input schema helpers ─────────────────────────

def schema_boolean?(value)
  value == true || value == false
end

def validate_exact_fields(errors, hash, allowed, label)
  (hash.keys - allowed).each do |field|
    errors << "#{label} unknown field #{field.inspect}"
  end
  allowed.each do |field|
    errors << "#{label} missing required field #{field.inspect}" unless hash.key?(field)
  end
end

def validate_boolean(errors, value, label, field)
  errors << "#{label} #{field} must be a boolean (got #{value.inspect})" unless schema_boolean?(value)
end

def validate_enum(errors, value, allowed, label, field)
  errors << "#{label} invalid #{field} value #{value.inspect} (allowed: #{allowed.join('|')})" unless allowed.include?(value)
end

def validate_nested_hash(errors, value, label)
  unless value.is_a?(Hash)
    errors << "#{label} must be a Hash"
    return nil
  end
  value
end

def validate_requirement(errors, requirement, label)
  requirement = validate_nested_hash(errors, requirement, label)
  return unless requirement

  validate_exact_fields(errors, requirement, REQUIREMENT_FIELDS, label)
  errors << "#{label} id must be a string" unless requirement["id"].is_a?(String)
  validate_boolean(errors, requirement["manifest_present"], label, "manifest_present")
  validate_boolean(errors, requirement["manifest_requirement_match"], label, "manifest_requirement_match")
end

def validate_risk(errors, risk, label)
  risk = validate_nested_hash(errors, risk, label)
  return unless risk

  validate_exact_fields(errors, risk, RISK_FIELDS, label)
  validate_enum(errors, risk["level"], RISK_LEVEL_VALUES, label, "risk level")
  validate_enum(errors, risk["acceptance"], RISK_ACCEPTANCE_VALUES, label, "risk acceptance")
end

# Development Path Entry input: exact top-level field set and fail-closed
# recursive schema. Unknown nested fields are rejected, never silently ignored.
def validate_entry_input(input, id, label, errors)
  prefix = "#{label}: scenario #{id.inspect} entry input"
  validate_exact_fields(errors, input, ENTRY_INPUT_FIELDS, prefix)

  validate_requirement(errors, input["requirement"], "#{prefix}.requirement")

  specification = input["specification_gate"]
  if (specification = validate_nested_hash(errors, specification, "#{prefix}.specification_gate"))
    validate_exact_fields(errors, specification, SPECIFICATION_GATE_FIELDS, "#{prefix}.specification_gate")
    validate_enum(errors, specification["result"], GATE_RESULT_VALUES, "#{prefix}.specification_gate", "result")
    validate_enum(errors, specification["risk_acceptance"], RISK_ACCEPTANCE_VALUES, "#{prefix}.specification_gate", "risk_acceptance")
  end

  path = input["development_path"]
  if (path = validate_nested_hash(errors, path, "#{prefix}.development_path"))
    validate_exact_fields(errors, path, DEVELOPMENT_PATH_FIELDS, "#{prefix}.development_path")
    validate_enum(errors, path["decision"], ENTRY_DECISIONS, "#{prefix}.development_path", "decision")
    validate_enum(errors, path["decision_scope"], ENTRY_SCOPES, "#{prefix}.development_path", "decision_scope")
    validate_enum(errors, path["complexity"], ENTRY_COMPLEXITIES, "#{prefix}.development_path", "complexity")
    validate_boolean(errors, path["source_present"], "#{prefix}.development_path", "source_present")
    validate_boolean(errors, path["artifact_present"], "#{prefix}.development_path", "artifact_present")
    validate_enum(errors, path["freshness"], FRESHNESS_VALUES, "#{prefix}.development_path", "freshness")
  end

  reviewed = input["reviewed_artifact"]
  if (reviewed = validate_nested_hash(errors, reviewed, "#{prefix}.reviewed_artifact"))
    validate_exact_fields(errors, reviewed, REVIEWED_ARTIFACT_FIELDS, "#{prefix}.reviewed_artifact")
    validate_boolean(errors, reviewed["path_present"], "#{prefix}.reviewed_artifact", "path_present")
    validate_boolean(errors, reviewed["version_matches"], "#{prefix}.reviewed_artifact", "version_matches")
    validate_enum(errors, reviewed["freshness"], FRESHNESS_VALUES, "#{prefix}.reviewed_artifact", "freshness")
  end

  tail_initial = input["tail_initial"]
  if (tail_initial = validate_nested_hash(errors, tail_initial, "#{prefix}.tail_initial"))
    validate_exact_fields(errors, tail_initial, TAIL_INITIAL_FIELDS, "#{prefix}.tail_initial")
    validate_boolean(errors, tail_initial["required_determined"], "#{prefix}.tail_initial", "required_determined")
    validate_boolean(errors, tail_initial["scope_determined"], "#{prefix}.tail_initial", "scope_determined")
    validate_boolean(errors, tail_initial["status_determined"], "#{prefix}.tail_initial", "status_determined")
  end

  change = input["blocking_change"]
  if (change = validate_nested_hash(errors, change, "#{prefix}.blocking_change"))
    validate_exact_fields(errors, change, BLOCKING_CHANGE_FIELDS, "#{prefix}.blocking_change")
    validate_boolean(errors, change["present"], "#{prefix}.blocking_change", "present")
    validate_boolean(errors, change["unresolved"], "#{prefix}.blocking_change", "unresolved")
  end

  regate = input["regate"]
  if (regate = validate_nested_hash(errors, regate, "#{prefix}.regate"))
    validate_exact_fields(errors, regate, ENTRY_REGATE_FIELDS, "#{prefix}.regate")
    validate_boolean(errors, regate["required"], "#{prefix}.regate", "required")
    validate_enum(errors, regate["result"], REGATE_RESULT_VALUES, "#{prefix}.regate", "result")
  end

  validate_risk(errors, input["risk"], "#{prefix}.risk")
  validate_enum(errors, input["requested_route"], REQUESTED_ROUTE_VALUES, prefix, "requested_route")
end

# Shared Documentation Governance Tail input: exact top-level field set and
# fail-closed recursive schema for every nested section.
def validate_tail_input(input, id, label, errors)
  prefix = "#{label}: scenario #{id.inspect} tail input"
  validate_exact_fields(errors, input, TAIL_INPUT_FIELDS, prefix)

  validate_requirement(errors, input["requirement"], "#{prefix}.requirement")
  validate_enum(errors, input["work_kind"], WORK_KIND_VALUES, prefix, "work_kind")

  tail = input["tail"]
  if (tail = validate_nested_hash(errors, tail, "#{prefix}.tail"))
    validate_exact_fields(errors, tail, TAIL_FIELDS, "#{prefix}.tail")
    validate_boolean(errors, tail["required"], "#{prefix}.tail", "required")
    validate_enum(errors, tail["scope"], %w[determined undetermined], "#{prefix}.tail", "scope")
    validate_enum(errors, tail["status"], TAIL_STATUS_VALUES, "#{prefix}.tail", "status")
    validate_boolean(errors, tail["completion_source_present"], "#{prefix}.tail", "completion_source_present")
    validate_boolean(errors, tail["completion_source_current"], "#{prefix}.tail", "completion_source_current")
  end

  artifacts = input["artifacts"]
  unless artifacts.is_a?(Array)
    errors << "#{prefix}.artifacts must be an array"
  else
    errors << "#{prefix}.artifacts must contain exactly #{ALWAYS_REQUIRED_ARTIFACTS.size} elements" unless artifacts.size == ALWAYS_REQUIRED_ARTIFACTS.size
    artifacts.each_with_index do |artifact, index|
      art_label = "#{prefix}.artifacts[#{index}]"
      unless artifact.is_a?(Hash)
        errors << "#{art_label} must be a Hash"
        next
      end
      validate_exact_fields(errors, artifact, ARTIFACT_FIELDS, art_label)
      validate_enum(errors, artifact["item"], ALWAYS_REQUIRED_ARTIFACTS, art_label, "item")
      validate_enum(errors, artifact["status"], ARTIFACT_STATUS_VALUES, art_label, "status")
      validate_boolean(errors, artifact["version_matches"], art_label, "version_matches")
    end
    items = artifacts.select { |a| a.is_a?(Hash) }.map { |a| a["item"] }
    (ALWAYS_REQUIRED_ARTIFACTS - items).each do |item|
      errors << "#{prefix}.artifacts missing artifact item #{item.inspect}"
    end
    items.group_by { |i| i }.each do |item, group|
      errors << "#{prefix}.artifacts duplicate artifact item #{item.inspect}" if item && group.size > 1
    end
  end

  skipped = input["skipped_items"]
  unless skipped.is_a?(Array)
    errors << "#{prefix}.skipped_items must be an array"
  else
    skipped.each_with_index do |skip, index|
      skip_label = "#{prefix}.skipped_items[#{index}]"
      unless skip.is_a?(Hash)
        errors << "#{skip_label} must be a Hash"
        next
      end
      validate_exact_fields(errors, skip, SKIP_RECORD_FIELDS, skip_label)
      errors << "#{skip_label} item must be a string" unless skip["item"].is_a?(String)
      validate_enum(errors, skip["basis"], SKIP_BASIS_VALUES, skip_label, "basis")
      SKIP_RECORD_FIELDS.each do |field|
        next if field == "item" || field == "basis"
        errors << "#{skip_label} #{field} must be a string" unless skip[field].is_a?(String)
      end
    end
    if artifacts.is_a?(Array)
      skip_items = skipped.select { |s| s.is_a?(Hash) }.map { |s| s["item"] }
      artifacts.each do |artifact|
        next unless artifact.is_a?(Hash) && %w[not_required not_applicable].include?(artifact["status"])

        item = artifact["item"]
        count = skip_items.count { |si| si == item }
        errors << "#{prefix}.skipped_items missing skip record for #{item.inspect}" if count.zero?
        errors << "#{prefix}.skipped_items duplicate skip record for #{item.inspect}" if count > 1
      end
    end
  end

  blocking_items = input["blocking_items"]
  if blocking_items.is_a?(Array) && blocking_items.all? { |b| b.is_a?(String) }
    errors << "#{prefix}.blocking_items contains duplicates" if blocking_items.uniq.size != blocking_items.size
  else
    errors << "#{prefix}.blocking_items must be an array of strings"
  end

  sync = input["business_domain_sync"]
  if (sync = validate_nested_hash(errors, sync, "#{prefix}.business_domain_sync"))
    validate_exact_fields(errors, sync, SYNC_FIELDS, "#{prefix}.business_domain_sync")
    validate_enum(errors, sync["decision"], SYNC_DECISIONS, "#{prefix}.business_domain_sync", "decision")
    validate_boolean(errors, sync["execution_required"], "#{prefix}.business_domain_sync", "execution_required")
    validate_enum(errors, sync["execution_status"], SYNC_EXECUTION_STATUS_VALUES, "#{prefix}.business_domain_sync", "execution_status")
    validate_enum(errors, sync["execution_result"], SYNC_EXECUTION_RESULT_VALUES, "#{prefix}.business_domain_sync", "execution_result")
    validate_enum(errors, sync["freshness"], FRESHNESS_VALUES, "#{prefix}.business_domain_sync", "freshness")
    validate_boolean(errors, sync["write_authorized"], "#{prefix}.business_domain_sync", "write_authorized")
  end

  reconcile = input["reconcile"]
  if (reconcile = validate_nested_hash(errors, reconcile, "#{prefix}.reconcile"))
    validate_exact_fields(errors, reconcile, RECONCILE_FIELDS, "#{prefix}.reconcile")
    validate_enum(errors, reconcile["decision"], RECONCILE_DECISIONS, "#{prefix}.reconcile", "decision")
    validate_boolean(errors, reconcile["execution_required"], "#{prefix}.reconcile", "execution_required")
    validate_enum(errors, reconcile["execution_status"], SYNC_EXECUTION_STATUS_VALUES, "#{prefix}.reconcile", "execution_status")
    validate_enum(errors, reconcile["execution_result"], RECONCILE_EXECUTION_RESULT_VALUES, "#{prefix}.reconcile", "execution_result")
    validate_enum(errors, reconcile["freshness"], FRESHNESS_VALUES, "#{prefix}.reconcile", "freshness")
  end

  entry_coverage = input["entry_coverage"]
  if (entry_coverage = validate_nested_hash(errors, entry_coverage, "#{prefix}.entry_coverage"))
    validate_exact_fields(errors, entry_coverage, ENTRY_COVERAGE_FIELDS, "#{prefix}.entry_coverage")
    validate_boolean(errors, entry_coverage["applicable"], "#{prefix}.entry_coverage", "applicable")
    # Entry Coverage accepts PASS/PENDING/FAILED/BLOCKED/not_applicable only;
    # `current` is rejected so it can never be treated as a passed coverage.
    validate_enum(errors, entry_coverage["status"], ENTRY_COVERAGE_STATUS_VALUES, "#{prefix}.entry_coverage", "entry coverage status")
    validate_enum(errors, entry_coverage["freshness"], FRESHNESS_VALUES, "#{prefix}.entry_coverage", "freshness")
  end

  regate = input["regate"]
  if (regate = validate_nested_hash(errors, regate, "#{prefix}.regate"))
    validate_exact_fields(errors, regate, TAIL_REGATE_FIELDS, "#{prefix}.regate")
    validate_boolean(errors, regate["required"], "#{prefix}.regate", "required")
    validate_enum(errors, regate["result"], REGATE_RESULT_VALUES, "#{prefix}.regate", "result")
    validate_enum(errors, regate["freshness"], FRESHNESS_VALUES, "#{prefix}.regate", "freshness")
  end

  validate_risk(errors, input["risk"], "#{prefix}.risk")

  pipeline = input["pipeline"]
  if (pipeline = validate_nested_hash(errors, pipeline, "#{prefix}.pipeline"))
    validate_exact_fields(errors, pipeline, PIPELINE_FIELDS, "#{prefix}.pipeline")
    validate_enum(errors, pipeline["status"], PIPELINE_STATUS_VALUES, "#{prefix}.pipeline", "status")
    validate_enum(errors, pipeline["freshness"], FRESHNESS_VALUES, "#{prefix}.pipeline", "freshness")
    validate_boolean(errors, pipeline["scope_matched"], "#{prefix}.pipeline", "scope_matched")
  end

  reuse = input["reuse"]
  if (reuse = validate_nested_hash(errors, reuse, "#{prefix}.reuse"))
    validate_exact_fields(errors, reuse, REUSE_FIELDS, "#{prefix}.reuse")
    validate_boolean(errors, reuse["sync_reconcile_current"], "#{prefix}.reuse", "sync_reconcile_current")
  end

  completion_evidence = input["completion_evidence"]
  if (completion_evidence = validate_nested_hash(errors, completion_evidence, "#{prefix}.completion_evidence"))
    validate_exact_fields(errors, completion_evidence, COMPLETION_EVIDENCE_FIELDS, "#{prefix}.completion_evidence")
    validate_boolean(errors, completion_evidence["present"], "#{prefix}.completion_evidence", "present")
  end

  reviewed = input["reviewed_artifact"]
  if (reviewed = validate_nested_hash(errors, reviewed, "#{prefix}.reviewed_artifact"))
    validate_exact_fields(errors, reviewed, %w[path version], "#{prefix}.reviewed_artifact")
    errors << "#{prefix}.reviewed_artifact path must be a string" unless reviewed["path"].is_a?(String)
    errors << "#{prefix}.reviewed_artifact version must be a string" unless reviewed["version"].is_a?(String)
  end

  persistence = input["persistence"]
  if (persistence = validate_nested_hash(errors, persistence, "#{prefix}.persistence"))
    validate_exact_fields(errors, persistence, PERSISTENCE_FIELDS, "#{prefix}.persistence")
    validate_boolean(errors, persistence["authorized"], "#{prefix}.persistence", "authorized")
    validate_enum(errors, persistence["mode"], PERSISTENCE_MODE_VALUES, "#{prefix}.persistence", "mode")
    errors << "#{prefix}.persistence version must be a string" unless persistence["version"].is_a?(String)
    validate_enum(errors, persistence["tamper_field"], TAMPER_FIELD_VALUES, "#{prefix}.persistence", "tamper_field")
  end
end

def validate_scenario(scenario, label, errors)
  unless scenario.is_a?(Hash)
    errors << "#{label}: scenario must be a Hash (got #{scenario.inspect})"
    return
  end

  id = scenario["id"]
  (scenario.keys - ALLOWED_SCENARIO_FIELDS).each do |field|
    errors << "#{label}: scenario #{id.inspect} unknown field #{field.inspect}"
  end

  unless id.is_a?(String) && id.match?(/\A[A-Z0-9-]+\z/) && id.length <= 64
    errors << "#{label}: scenario id #{id.inspect} must match [A-Z0-9-]+ with max length 64"
  end

  gate_type = scenario["gate_type"]
  unless ALLOWED_GATE_TYPES.include?(gate_type)
    errors << "#{label}: scenario #{id.inspect} invalid gate_type #{gate_type.inspect}"
  end

  tags = scenario["coverage_tags"]
  unless tags.is_a?(Array) && !tags.empty?
    errors << "#{label}: scenario #{id.inspect} coverage_tags must be a non-empty array"
  else
    errors << "#{label}: scenario #{id.inspect} coverage_tags contains duplicates" if tags.uniq.size != tags.size
    (tags - REQUIRED_COVERAGE_TAGS).each do |tag|
      errors << "#{label}: scenario #{id.inspect} unknown coverage tag #{tag.inspect}"
    end
  end

  input = scenario["input"]
  if input.is_a?(Hash)
    case scenario["gate_type"]
    when "development_path_entry"
      validate_entry_input(input, id, label, errors)
    when "documentation_governance_tail_completion"
      validate_tail_input(input, id, label, errors)
    end
  else
    errors << "#{label}: scenario #{id.inspect} input must be a Hash"
  end

  expected = scenario["expected"]
  unless expected.is_a?(Hash)
    errors << "#{label}: scenario #{id.inspect} expected must be a Hash"
  else
    validate_expected(expected, id, label, errors)
  end
end

def check_duplicate_ids(data, label, errors)
  ids = (data["scenarios"] || []).map { |s| s.is_a?(Hash) ? s["id"] : nil }
  ids.group_by { |i| i }.each do |id, group|
    errors << "#{label}: duplicate scenario id #{id.inspect}" if id && group.size > 1
  end
end

def check_coverage(data, label, errors)
  covered = {}
  (data["scenarios"] || []).each do |scenario|
    Array(scenario["coverage_tags"]).each { |tag| covered[tag] = true }
  end
  (data["required_coverage_tags"] || []).each do |tag|
    errors << "#{label}: coverage tag #{tag.inspect} is not covered by any scenario" unless covered[tag]
  end
end

def check_fixed_ids(data, label, errors)
  ids = (data["scenarios"] || []).map { |s| s.is_a?(Hash) ? s["id"] : nil }
  FIXED_SCENARIO_IDS.each do |fixed_id|
    errors << "#{label}: fixed scenario id #{fixed_id} missing" unless ids.include?(fixed_id)
  end
end

# ── Outcome computation ─────────────────────────────────────────────────────

def default_outcome(gate_type)
  entry = gate_type == "development_path_entry"
  {
    "result" => "FAIL",
    "can_continue" => false,
    "implementation_entry_eligible" => entry ? false : NOT_APPLICABLE,
    "tail_completion_eligible" => entry ? NOT_APPLICABLE : false,
    "completion_source_established" => false,
    "manifest_completed_recommendation" => entry ? NOT_APPLICABLE : false,
    "route" => NOT_APPLICABLE,
    "earliest_affected_node" => NOT_APPLICABLE,
    "required_regate" => false,
    "blockers" => [],
    "reused_existing_evidence" => false,
    "professional_skill_execution_requested" => false
  }
end

# Development Path Entry Gate. Only a PASS or valid PASS_WITH_RISK with a
# correct direct/speckit route may enter implementation. The Entry Gate never
# establishes a Tail completion source.
def entry_outcome(input)
  out = default_outcome("development_path_entry")
  blockers = []
  required_regate = false
  earliest = NOT_APPLICABLE

  requirement = input["requirement"] || {}
  if requirement["manifest_present"] != true
    blockers << "manifest missing or unreadable"
  elsif requirement["manifest_requirement_match"] != true
    blockers << "requirement id mismatch"
  end

  specification = input["specification_gate"] || {}
  case specification["result"]
  when "PASS"
    nil
  when "PASS_WITH_RISK"
    blockers << "specification gate PASS_WITH_RISK without complete risk acceptance" unless specification["risk_acceptance"] == "complete"
  else
    blockers << "specification gate FAIL"
  end

  path = input["development_path"] || {}
  decision = path["decision"]
  blockers << "development path decision missing" unless ENTRY_DECISIONS.include?(decision)
  blockers << "decision scope missing or invalid" unless ENTRY_SCOPES.include?(path["decision_scope"])
  blockers << "complexity missing or invalid" unless ENTRY_COMPLEXITIES.include?(path["complexity"])
  blockers << "decision source missing" unless path["source_present"] == true
  blockers << "decision artifact missing or stale" unless path["artifact_present"] == true
  if path["freshness"] == "stale"
    blockers << "development path decision stale"
    blockers << "stale evidence requires Re-Gate"
    required_regate = true
    earliest = "02-方案审核"
  end

  reviewed = input["reviewed_artifact"] || {}
  if reviewed["path_present"] != true
    blockers << "reviewed artifact missing or stale"
  elsif reviewed["version_matches"] != true
    blockers << "reviewed artifact version mismatch"
    required_regate = true
    earliest = "01-技术方案"
  end
  if reviewed["freshness"] == "stale"
    blockers << "reviewed artifact missing or stale"
    blockers << "stale evidence requires Re-Gate"
    required_regate = true
    earliest = "01-技术方案"
  end

  tail_initial = input["tail_initial"] || {}
  blockers << "tail initial required not determined" unless tail_initial["required_determined"] == true
  blockers << "tail initial scope not determined" unless tail_initial["scope_determined"] == true
  blockers << "tail initial status not determined" unless tail_initial["status_determined"] == true

  change = input["blocking_change"] || {}
  if change["present"] == true && change["unresolved"] == true
    blockers << "unresolved blocking change"
    required_regate = true
    earliest = "01-技术方案" if earliest == NOT_APPLICABLE
  end

  regate = input["regate"] || {}
  if regate["required"] == true
    unless regate["result"] == "PASS"
      blockers << "required Re-Gate missing or not passed"
      required_regate = true
      earliest = "02-方案审核" if earliest == NOT_APPLICABLE
    end
  end

  if decision == "BLOCKED_NEEDS_REVISION"
    blockers << "BLOCKED_NEEDS_REVISION cannot enter implementation"
    required_regate = true
    earliest = "01-技术方案"
  elsif path["complexity"] == "BLOCKED_UNKNOWN"
    blockers << "BLOCKED_UNKNOWN cannot enter implementation"
    earliest = "02-方案审核"
  elsif %w[DIRECT_IMPLEMENTATION SPECKIT_PIPELINE_REQUIRED].include?(decision)
    requested = input["requested_route"]
    if decision == "DIRECT_IMPLEMENTATION" && requested != "direct"
      blockers << "wrong route: DIRECT_IMPLEMENTATION must not enter Speckit path"
      earliest = "02-方案审核" if earliest == NOT_APPLICABLE
    elsif decision == "SPECKIT_PIPELINE_REQUIRED" && requested != "speckit"
      blockers << "wrong route: SPECKIT_PIPELINE_REQUIRED must not enter direct implementation"
      earliest = "02-方案审核" if earliest == NOT_APPLICABLE
    end
  end

  risk = input["risk"] || {}
  case risk["level"]
  when "High"
    if risk["acceptance"] != "complete"
      blockers << "High risk without complete acceptance"
    end
  when "Critical"
    blockers << "Critical risk cannot be accepted"
  end

  if blockers.empty?
    out["result"] = (risk["level"] == "High" && risk["acceptance"] == "complete") ? "PASS_WITH_RISK" : "PASS"
    out["can_continue"] = true
    out["implementation_entry_eligible"] = true
    out["route"] = decision == "DIRECT_IMPLEMENTATION" ? "direct" : "speckit"
  else
    out["result"] = "FAIL"
    out["can_continue"] = false
    out["implementation_entry_eligible"] = false
    out["earliest_affected_node"] = earliest
    out["required_regate"] = required_regate
    out["blockers"] = blockers.uniq
  end
  out
end

# Shared Documentation Governance Tail Completion Gate.
#
# Stage A evaluates external completion evidence and produces an internal
# provisional result. Stage B persists the Gate report into a per-scenario
# tmpdir at the stable path, reads it back from disk, and verifies structure
# and binding before a formal result is established. Response-only output is a
# preview with canonical Result=FAIL.
def compute_tail_outcome(input, tmpdir)
  out = default_outcome("documentation_governance_tail_completion")
  blockers = []
  required_regate = false
  earliest = NOT_APPLICABLE
  reused = false
  professional_requested = false

  requirement = input["requirement"] || {}
  if requirement["manifest_present"] != true
    blockers << "manifest missing or unreadable"
  elsif requirement["manifest_requirement_match"] != true
    blockers << "requirement id mismatch"
  end

  tail = input["tail"] || {}
  blockers << "tail section missing" if tail.empty?
  blockers << "tail required not current" unless tail["required"] == true
  blockers << "tail scope not current" unless tail["scope"] == "determined"
  # R1 Tail lifecycle: the first formal Tail Completion Gate run starts from
  # `in_progress`. `in_progress` alone is never completion evidence, but it must
  # not block Stage A when all external evidence is complete; the formal result
  # is formed only after Stage B writes and reads back the Gate artifact.
  case tail["status"]
  when "in_progress"
    nil
  when "planned", "blocked", "stale", "not_required"
    blockers << "tail status #{tail['status']} cannot complete"
  when "completed"
    current_source = tail["completion_source_present"] == true && tail["completion_source_current"] == true
    if current_source
      # No re-validation success path for an already-completed Tail is
      # implemented this round; a pre-completed input must never re-recommend
      # completion.
      blockers << "tail pre-completed state cannot be re-validated this round"
    else
      # Pre-completed without a current, bound formal completion source is
      # fail-closed: `completed` must not be a precondition of a first-run
      # formal completion.
      blockers << "tail pre-completed state lacks current formal completion source"
    end
  else
    blockers << "tail status not current"
  end

  work_kind = input["work_kind"] || "actual_implementation"
  artifacts_by_item = (input["artifacts"] || []).each_with_object({}) { |a, h| h[a["item"]] = a }
  ALWAYS_REQUIRED_ARTIFACTS.each do |item|
    artifact = artifacts_by_item[item] || {}
    status = artifact["status"]
    if work_kind == "actual_implementation"
      case status
      when "current"
        unless artifact["version_matches"] == true
          blockers << "#{item} version mismatch"
          required_regate = true
          earliest = item if earliest == NOT_APPLICABLE
        end
      when "missing"
        blockers << "#{item} missing"
        earliest = item if earliest == NOT_APPLICABLE
      when "stale"
        blockers << "#{item} stale"
        required_regate = true
        earliest = item if earliest == NOT_APPLICABLE
      when "not_required"
        blockers << "#{item} not_required"
        earliest = item if earliest == NOT_APPLICABLE
      when "not_applicable"
        blockers << "#{item} not_applicable"
        earliest = item if earliest == NOT_APPLICABLE
      else
        blockers << "#{item} missing"
        earliest = item if earliest == NOT_APPLICABLE
      end
    else
      case status
      when "current"
        unless artifact["version_matches"] == true
          blockers << "#{item} version mismatch"
          required_regate = true
          earliest = item if earliest == NOT_APPLICABLE
        end
      when "missing"
        blockers << "#{item} missing"
        earliest = item if earliest == NOT_APPLICABLE
      when "stale"
        blockers << "#{item} stale"
        required_regate = true
        earliest = item if earliest == NOT_APPLICABLE
      when "not_required", "not_applicable"
        nil # skip basis is checked below
      else
        blockers << "#{item} missing"
        earliest = item if earliest == NOT_APPLICABLE
      end
    end
  end

  skipped = input["skipped_items"] || []
  skipped.each do |skip|
    blockers << "skipped items lack complete basis" unless skip["basis"] == "complete"
  end
  # Pure documentation and pure governance must run the same complete skip
  # basis validation: every not_required / not_applicable artifact needs a
  # unique skip record whose basis is complete and whose seven basis fields
  # are non-empty.
  if %w[pure_governance pure_documentation].include?(work_kind)
    ALWAYS_REQUIRED_ARTIFACTS.each do |item|
      artifact = artifacts_by_item[item] || {}
      next unless %w[not_required not_applicable].include?(artifact["status"])

      skip = skipped.find { |s| s["item"] == item }
      basis_complete = skip && skip["basis"] == "complete" &&
                       %w[scope reason evidence decision_source decision_owner version_basis stale_condition].all? do |key|
                         !skip[key].to_s.empty?
                       end
      blockers << "skipped items lack complete basis" unless basis_complete
    end
  end

  blocking_items = input["blocking_items"] || []
  blockers << "unresolved blocking items" unless blocking_items.empty?

  reuse_input = input["reuse"] || {}
  pipeline = input["pipeline"] || {}
  reuse_available = reuse_input["sync_reconcile_current"] == true &&
                    pipeline["freshness"] == "current" &&
                    pipeline["scope_matched"] == true

  sync = input["business_domain_sync"] || {}
  sync_decision = sync["decision"]
  if sync.empty? || !SYNC_DECISIONS.include?(sync_decision)
    blockers << "business_domain_sync decision missing or stale"
  elsif sync["freshness"] == "stale"
    blockers << "business_domain_sync decision stale"
    blockers << "stale evidence requires Re-Gate"
    required_regate = true
    earliest = "02-方案审核"
  else
    case sync_decision
    when "SYNC_REQUIRED"
      executed = sync["execution_required"] == true &&
                 sync["execution_status"] == "done" &&
                 sync["execution_result"] == "synced"
      if executed
        # done/synced: write_authorized=true records that the original
        # execution of the current evidence was authorized; never request
        # re-execution. An executed sync without recorded authorization is
        # inconsistent and fails closed.
        blockers << "SYNC_REQUIRED executed without recorded write authorization" unless sync["write_authorized"] == true
      elsif reuse_available
        # Reused current/non-stale/scope-matched Pipeline evidence must not
        # demand a new write authorization and must not re-run the Sync skill.
        reused = true
      elsif sync["write_authorized"] == true
        blockers << "SYNC_REQUIRED execution not complete"
        professional_requested = true
      else
        # Unauthorized write must not be requested: the unique core blocker is
        # the missing write authorization, not merely incomplete execution.
        blockers << "SYNC_REQUIRED write not authorized"
      end
    when "NOT_REQUIRED"
      unless sync["execution_required"] == false && sync["execution_result"] == "not_required"
        blockers << "NOT_REQUIRED sync execution inconsistent"
      end
    when "PROPOSAL_REQUIRED"
      blockers << "PROPOSAL_REQUIRED cannot complete Tail"
    when "BLOCKED"
      blockers << "BLOCKED sync decision cannot complete Tail"
    when "DUPLICATE_SYNC_BLOCKED"
      blockers << "DUPLICATE_SYNC_BLOCKED cannot complete Tail"
    end
  end

  reconcile = input["reconcile"] || {}
  reconcile_decision = reconcile["decision"]
  if reconcile.empty? || !RECONCILE_DECISIONS.include?(reconcile_decision)
    blockers << "reconcile decision missing or stale"
  elsif reconcile["freshness"] == "stale"
    blockers << "reconcile decision stale"
    blockers << "stale evidence requires Re-Gate"
    required_regate = true
    earliest = "02-方案审核"
  else
    case reconcile_decision
    when "required"
      done = reconcile["execution_required"] == true &&
             reconcile["execution_status"] == "done" &&
             reconcile["execution_result"] == "complete"
      if done
        nil
      elsif reuse_available
        reused = true
      else
        blockers << "reconcile execution incomplete"
        professional_requested = true
      end
    when "not_required"
      unless reconcile["execution_required"] == false && reconcile["execution_result"] == "not_required"
        blockers << "reconcile decision inconsistent"
      end
    when "blocked"
      blockers << "reconcile blocked"
    end
  end

  entry_coverage = input["entry_coverage"] || {}
  if entry_coverage["applicable"] == true
    if entry_coverage["freshness"] == "stale"
      blockers << "entry coverage stale"
      blockers << "stale evidence requires Re-Gate"
      required_regate = true
      earliest = "02-方案审核"
    elsif %w[PENDING FAILED BLOCKED].include?(entry_coverage["status"])
      blockers << "entry coverage #{entry_coverage['status']}"
    elsif entry_coverage["status"] != "PASS"
      blockers << "entry coverage decision inconsistent"
    end
  elsif entry_coverage["status"] != "not_applicable"
    blockers << "entry coverage decision inconsistent"
  end

  regate = input["regate"] || {}
  if regate["required"] == true
    unless regate["result"] == "PASS" && regate["freshness"] == "current"
      blockers << "required Re-Gate missing or not passed"
      required_regate = true
      earliest = "02-方案审核" if earliest == NOT_APPLICABLE
    end
  elsif regate["result"] != "not_applicable"
    blockers << "regate result inconsistent"
  end

  risk = input["risk"] || {}
  provisional = "PASS"
  case risk["level"]
  when "High"
    if risk["acceptance"] == "complete"
      provisional = "PASS_WITH_RISK"
    else
      blockers << "High risk without complete acceptance"
      provisional = "FAIL"
    end
  when "Critical"
    blockers << "Critical risk cannot be accepted"
    provisional = "FAIL"
  when "none"
    nil
  else
    blockers << "risk decision inconsistent"
    provisional = "FAIL"
  end
  provisional = "FAIL" unless blockers.empty?

  completion_evidence = input["completion_evidence"] || {}
  if completion_evidence["present"] != true && blockers.empty?
    blockers << "completion evidence missing"
    provisional = "FAIL"
  end

  # Pipeline result never substitutes missing or stale Tail evidence; the
  # blocker is reported when the gate fails on evidence-class issues while the
  # pipeline claims COMPLETED. Risk-only failures are not substitution
  # situations, and persistence failures happen only after Stage A.
  if pipeline["status"] == "COMPLETED" && blockers.any? { |b| !RISK_BLOCKERS.include?(b) }
    blockers << "pipeline result cannot substitute Tail evidence or Tail Gate"
  end

  # Stage B: persist and confirm.
  persistence = input["persistence"] || {}
  formal = provisional
  if provisional == "FAIL"
    nil # a FAIL report is never formally completed
  elsif persistence["authorized"] != true || (persistence["mode"] || "response_only") == "response_only"
    formal = "FAIL"
    blockers << "response-only cannot formally complete"
    blockers << "persistence not authorized"
  else
    ok, persist_blockers = persist_and_verify(input, tmpdir, provisional)
    if ok
      formal = provisional
    else
      formal = "FAIL"
      blockers.concat(persist_blockers)
    end
  end

  out["result"] = formal
  out["can_continue"] = formal != "FAIL"
  out["tail_completion_eligible"] = formal != "FAIL"
  out["completion_source_established"] = formal != "FAIL"
  out["manifest_completed_recommendation"] = formal != "FAIL"
  out["earliest_affected_node"] = earliest
  out["required_regate"] = required_regate
  out["blockers"] = blockers.uniq
  out["reused_existing_evidence"] = reused
  out["professional_skill_execution_requested"] = professional_requested
  out
end

# ── Stage B persistence simulation (tmpdir only, never the repository) ──────

def build_gate_report(input, provisional_result)
  requirement_id = input.dig("requirement", "id").to_s
  version = input.dig("persistence", "version") || "1.0.0"
  reviewed = input["reviewed_artifact"] || {}
  reviewed_path = reviewed["path"] || "manifest.md"
  reviewed_version = reviewed["version"] || "1.0.0"
  stable_dir = File.join("library", requirement_id, "05-测试验收")
  stable_file = "#{requirement_id}_治理尾段完成门禁.md"
  stable_path = File.join(stable_dir, stable_file)
  status = provisional_result == "FAIL" ? "failed" : "passed"
  report = <<~MD
    # Gate Result: Shared Documentation Governance Tail Completion

    ## Metadata

    - Requirement ID: #{requirement_id}
    - Gate Type: documentation_governance_tail_completion
    - Version: #{version}
    - Gate Artifact Version: #{version}
    - Status: #{status}
    - Reviewed Artifact: #{reviewed_path}
    - Reviewed Artifact Version: #{reviewed_version}

    ## Conclusion

    - Result: #{provisional_result}

    ## Documentation Governance Tail Evidence Check

    - completion_evidence: #{requirement_id}_治理尾段完成门禁.md
    - completion_decision_source: #{stable_path} v#{version}
  MD
  {
    report: report,
    stable_path: stable_path,
    stable_file: stable_file,
    version: version,
    status: status,
    result: provisional_result,
    requirement_id: requirement_id,
    reviewed_path: reviewed_path,
    reviewed_version: reviewed_version
  }
end

def verify_readback(fields, readback)
  errors = []
  errors << "requirement id" unless readback.include?("Requirement ID: #{fields[:requirement_id]}")
  errors << "gate type" unless readback.include?("Gate Type: documentation_governance_tail_completion")
  errors << "version" unless readback.include?("Version: #{fields[:version]}")
  errors << "gate artifact version" unless readback.include?("Gate Artifact Version: #{fields[:version]}")
  errors << "status" unless readback.include?("Status: #{fields[:status]}")
  errors << "reviewed artifact" unless readback.include?("Reviewed Artifact: #{fields[:reviewed_path]}")
  errors << "reviewed artifact version" unless readback.include?("Reviewed Artifact Version: #{fields[:reviewed_version]}")
  errors << "result" unless readback.include?("Result: #{fields[:result]}")
  errors << "completion evidence" unless readback.include?("completion_evidence:")
  errors << "completion decision source" unless readback.include?("completion_decision_source: #{fields[:stable_path]} v#{fields[:version]}")
  errors
end

# Writes the report under tmpdir, reads it back from disk, verifies structure,
# binding, and content digest, and rejects filename-versioned companions.
# Write failure is a deterministic injection; read-back mismatch genuinely
# rewrites the specified field on disk before re-reading.
def persist_and_verify(input, tmpdir, provisional_result)
  persistence = input["persistence"] || {}
  mode = persistence["mode"] || "response_only"
  fields = build_gate_report(input, provisional_result)
  target = File.join(tmpdir, fields[:stable_path])
  FileUtils.mkdir_p(File.dirname(target))

  if mode == "write_failure_injected"
    # Deterministic injected write failure; never depends on OS permissions.
    return [false, ["persistence write failure"]]
  end

  File.write(target, fields[:report])

  if mode == "readback_mismatch_injected"
    tamper_field = persistence["tamper_field"] || "result"
    tampered = File.read(target)
    case tamper_field
    when "result"
      tampered = tampered.sub(/- Result: .*/, "- Result: FAIL")
    when "completion_decision_source"
      tampered = tampered.sub(/- completion_decision_source: .*/, "- completion_decision_source: library/wrong/路径 v9.9.9")
    when "version"
      tampered = tampered.sub(/- Version: .*/, "- Version: 9.9.9")
    end
    File.write(target, tampered)
  end

  if mode == "companion_injected"
    companion = fields[:stable_file].sub(".md", "_v2.md")
    File.write(File.join(File.dirname(target), companion), "# filename-versioned companion\n")
  end

  readback = File.read(target)
  verify_errors = verify_readback(fields, readback)
  expected_digest = Digest::SHA256.hexdigest(fields[:report])
  actual_digest = Digest::SHA256.hexdigest(readback)
  verify_errors << "content digest" unless actual_digest == expected_digest
  return [false, ["read-back verification failure"]] unless verify_errors.empty?

  companions = Dir[File.join(File.dirname(target), "*_v*.md")].reject { |p| File.basename(p) == fields[:stable_file] }
  return [false, ["filename-versioned companion conflict"]] unless companions.empty?

  [true, []]
end

# ── Scenario evaluation ─────────────────────────────────────────────────────

def scenario_group(id)
  %w[DPE- TAIL-D- TAIL-S- TAIL-G- TAIL-P-].each do |prefix|
    return prefix.delete_suffix("-") if id.start_with?(prefix)
  end
  "OTHER"
end

def with_scenario_tmpdir(label, tmpdir_state)
  dir = nil
  begin
    dir = Dir.mktmpdir("gate-runner-scenario-")
    tmpdir_state[:dirs] << dir
    yield dir
  ensure
    if dir
      begin
        FileUtils.remove_entry(dir) if File.exist?(dir)
      rescue StandardError => e
        tmpdir_state[:cleanup_errors] << "#{label}: tmpdir cleanup failed: #{e.message}"
      end
    end
  end
end

def evaluate_scenario(scenario, label, tmpdir_state)
  input = scenario["input"] || {}
  if scenario["gate_type"] == "development_path_entry"
    entry_outcome(input)
  else
    result = nil
    with_scenario_tmpdir(label, tmpdir_state) do |tmpdir|
      result = compute_tail_outcome(input, tmpdir)
    end
    result
  end
end

def outcome_mismatches(actual, expected)
  mismatches = []
  ALLOWED_EXPECTED_FIELDS.each do |field|
    actual_value = actual[field]
    expected_value = expected[field]
    if field == "blockers"
      mismatches << "blockers" unless Array(actual_value).sort == Array(expected_value).sort
    elsif actual_value != expected_value
      mismatches << field
    end
  end
  mismatches
end

# ── Full validation of a parsed fixture structure ───────────────────────────

def validate_schema_only(data, label, errors)
  validate_root(data, label, errors)
  (data["scenarios"] || []).each { |scenario| validate_scenario(scenario, label, errors) }
  check_duplicate_ids(data, label, errors)
  check_coverage(data, label, errors)
  check_fixed_ids(data, label, errors)
end

def evaluate_all(data, label, errors, tmpdir_state)
  results = {}
  group_failed = {}
  (data["scenarios"] || []).each do |scenario|
    id = scenario["id"]
    group = scenario_group(id)
    begin
      outcome = evaluate_scenario(scenario, label, tmpdir_state)
      results[id] = outcome
      mismatches = outcome_mismatches(outcome, scenario["expected"] || {})
      unless mismatches.empty?
        group_failed[group] = true
        mismatches.each do |field|
          errors << "#{label}: scenario #{id} expected.#{field} mismatch: " \
                    "actual=#{outcome[field].inspect} expected=#{(scenario['expected'] || {})[field].inspect}"
        end
      end
    rescue StandardError => e
      group_failed[group] = true
      errors << "#{label}: scenario #{id} evaluation failed: #{e.message}"
    end
  end

  tmpdir_state[:dirs].each do |dir|
    errors << "#{label}: tmpdir cleanup verification failed: #{dir} still exists" if File.exist?(dir)
  end
  tmpdir_state[:cleanup_errors].each { |message| errors << "#{label}: #{message}" }

  [results, group_failed]
end

# ── Self-tests (in-memory deep copies; repository fixture never modified) ───
#
# R1: every negative self-test declares the expected diagnostic or error
# category the validator must produce. A rejection counts only when the actual
# validator produces the expected error; unknown exceptions, nil errors,
# unrelated schema errors, or a runner crash must fail the self-test.

def probe_rejection(label, tampered, expected_diagnostics, failures)
  errs = []
  tmpdir_state = { dirs: [], cleanup_errors: [] }
  begin
    validate_schema_only(tampered, "self-test-#{label}", errs)
    evaluate_all(tampered, "self-test-#{label}", errs, tmpdir_state) if errs.empty?
  rescue StandardError => e
    errs << "self-test-#{label}: UNEXPECTED RAISE #{e.class}: #{e.message}"
  end
  if errs.empty?
    failures << label
    return
  end
  if errs.any? { |m| m.include?("UNEXPECTED RAISE") }
    failures << "#{label}: unexpected exception treated as expected rejection (#{errs.join('; ')})"
    return
  end
  joined = errs.join("\n")
  expected_diagnostics.each do |needle|
    failures << "#{label}: expected diagnostic #{needle.inspect} not produced (got: #{joined})" unless joined.include?(needle)
  end
end

def run_self_tests(original)
  failures = []
  labels = []
  deep_copy = ->(object) { Marshal.load(Marshal.dump(object)) }

  scenario_by_id = lambda do |data, id|
    data["scenarios"].find { |s| s["id"] == id }
  end

  reject = lambda do |label, tampered, expected_diagnostics|
    labels << label
    probe_rejection(label, tampered, expected_diagnostics, failures)
  end

  # 1. Tampered expected PASS/FAIL must be rejected.
  t1 = deep_copy.call(original)
  scenario_by_id.call(t1, "DPE-01-DIRECT-PASS")["expected"]["result"] = "FAIL"
  reject.call("tampered-expected-pass-fail", t1, ["expected.result mismatch"])

  # 2. Mandatory coverage tag removed must be rejected.
  t2 = deep_copy.call(original)
  t2["required_coverage_tags"].delete("pass_with_risk")
  reject.call("missing-mandatory-tag", t2, ["missing required coverage tag"])

  # 3. Duplicate scenario ID must be rejected.
  t3 = deep_copy.call(original)
  duplicated = deep_copy.call(scenario_by_id.call(t3, "TAIL-D-01-DIRECT-NO-SYNC"))
  duplicated["id"] = "TAIL-D-02-DIRECT-SYNCED"
  t3["scenarios"] << duplicated
  reject.call("duplicate-scenario-id", t3, ["duplicate scenario id"])

  # 4a. Unknown root field must be rejected.
  t4 = deep_copy.call(original)
  t4["extra_root_field"] = "boom"
  reject.call("unknown-root-field", t4, ["unknown root field"])

  # 4b. Unknown scenario field must be rejected.
  t5 = deep_copy.call(original)
  scenario_by_id.call(t5, "DPE-01-DIRECT-PASS")["bogus_field"] = true
  reject.call("unknown-scenario-field", t5, ["unknown field"])

  # 5. Response-only written as formal PASS must be rejected.
  t6 = deep_copy.call(original)
  scenario_by_id.call(t6, "TAIL-P-01-RESPONSE-ONLY")["expected"]["result"] = "PASS"
  reject.call("response-only-as-formal-pass", t6, ["expected.result mismatch"])

  # 6. Write failure written as success must be rejected.
  t7 = deep_copy.call(original)
  scenario_by_id.call(t7, "TAIL-P-02-WRITE-FAILURE")["expected"]["result"] = "PASS"
  reject.call("write-failure-as-success", t7, ["expected.result mismatch"])

  # 7. Read-back mismatch written as success must be rejected.
  t8 = deep_copy.call(original)
  scenario_by_id.call(t8, "TAIL-P-03-READBACK-MISMATCH")["expected"]["result"] = "PASS"
  reject.call("readback-mismatch-as-success", t8, ["expected.result mismatch"])

  # 8. Stale evidence written as PASS must be rejected.
  t9 = deep_copy.call(original)
  scenario_by_id.call(t9, "TAIL-S-03-STALE-PIPELINE-EVIDENCE")["expected"]["result"] = "PASS"
  reject.call("stale-evidence-as-pass", t9, ["expected.result mismatch"])

  # 9. Wrong route written as PASS must be rejected.
  t10 = deep_copy.call(original)
  scenario_by_id.call(t10, "DPE-03-WRONG-DIRECT-ROUTE")["expected"]["result"] = "PASS"
  reject.call("wrong-route-as-pass", t10, ["expected.result mismatch"])

  # 10. Filename-versioned companion (TAIL-P-04) written as PASS must be rejected.
  t11 = deep_copy.call(original)
  scenario_by_id.call(t11, "TAIL-P-04-PASS-WITH-RISK")["input"]["persistence"]["mode"] = "companion_injected"
  reject.call("v2-companion-as-pass", t11, ["expected.result mismatch"])

  # 11. Critical risk written as PASS_WITH_RISK must be rejected.
  t12 = deep_copy.call(original)
  scenario_by_id.call(t12, "TAIL-P-06-CRITICAL-RISK")["expected"]["result"] = "PASS_WITH_RISK"
  reject.call("critical-as-pass-with-risk", t12, ["expected.result mismatch"])

  # 12. YAML alias must be rejected at parse time with the declared diagnostic.
  labels << "yaml-alias-rejected"
  begin
    parse_fixture_text("base: &b 1\nchild: *b\n", "self-test-alias")
    failures << "yaml-alias-rejected: alias was not rejected"
  rescue Psych::Exception, RuntimeError => e
    failures << "yaml-alias-rejected: unexpected error #{e.message}" unless e.message.include?("unsafe or invalid YAML")
  end

  # 13. Unsafe canonical source path must be rejected.
  t13 = deep_copy.call(original)
  t13["canonical_sources"] << "../outside-repository/file.md"
  reject.call("unsafe-canonical-source", t13, ["unsafe canonical source path"])

  # 14. Unknown nested input field must be rejected (fail-closed recursive
  # schema; unrecognized fields may never be silently ignored).
  t14 = deep_copy.call(original)
  scenario_by_id.call(t14, "TAIL-D-01-DIRECT-NO-SYNC")["input"]["bogus_nested_field"] = 1
  reject.call("unknown-nested-input-field", t14, ["unknown field"])

  # 15. Missing required nested field must be rejected.
  t15 = deep_copy.call(original)
  scenario_by_id.call(t15, "TAIL-D-01-DIRECT-NO-SYNC")["input"]["pipeline"].delete("scope_matched")
  reject.call("missing-required-nested-field", t15, ["missing required field"])

  # 16. Invalid work_kind must be rejected.
  t16 = deep_copy.call(original)
  scenario_by_id.call(t16, "TAIL-D-01-DIRECT-NO-SYNC")["input"]["work_kind"] = "weird_kind"
  reject.call("invalid-work-kind", t16, ["invalid work_kind"])

  # 17. Invalid freshness must be rejected.
  t17 = deep_copy.call(original)
  scenario_by_id.call(t17, "TAIL-D-01-DIRECT-NO-SYNC")["input"]["pipeline"]["freshness"] = "fresh"
  reject.call("invalid-freshness", t17, ["invalid freshness"])

  # 18. Entry Coverage status=current must be rejected (current is never a
  # passed coverage status).
  t18 = deep_copy.call(original)
  scenario_by_id.call(t18, "TAIL-S-01-REUSE-CURRENT-EVIDENCE")["input"]["entry_coverage"]["status"] = "current"
  reject.call("entry-coverage-status-current", t18, ["invalid entry coverage status"])

  # 19. Pure documentation missing skip basis written as PASS must be rejected.
  t19 = deep_copy.call(original)
  scenario_by_id.call(t19, "TAIL-G-03-PURE-DOCUMENTATION-MISSING-SKIP-BASIS")["expected"]["result"] = "PASS"
  reject.call("pure-doc-missing-skip-basis-as-pass", t19, ["expected.result mismatch"])

  # 20. Duplicate artifact item must be rejected.
  t20 = deep_copy.call(original)
  duplicated_artifact = deep_copy.call(scenario_by_id.call(t20, "TAIL-D-01-DIRECT-NO-SYNC")["input"]["artifacts"][0])
  scenario_by_id.call(t20, "TAIL-D-01-DIRECT-NO-SYNC")["input"]["artifacts"] << duplicated_artifact
  reject.call("duplicate-artifact-item", t20, ["duplicate artifact item"])

  # 21. Missing 03/04/05 item must be rejected.
  t21 = deep_copy.call(original)
  scenario_by_id.call(t21, "TAIL-D-01-DIRECT-NO-SYNC")["input"]["artifacts"].pop
  reject.call("missing-artifact-item", t21, ["missing artifact item"])

  # 22. Pre-completed without source written as PASS must be rejected.
  t22 = deep_copy.call(original)
  scenario_by_id.call(t22, "TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE")["expected"]["result"] = "PASS"
  reject.call("precompleted-without-source-as-pass", t22, ["expected.result mismatch"])

  # 23. write_authorized=false written as PASS must be rejected.
  t23 = deep_copy.call(original)
  scenario_by_id.call(t23, "TAIL-D-03-SYNC-NOT-AUTHORIZED")["expected"]["result"] = "PASS"
  reject.call("write-not-authorized-as-pass", t23, ["expected.result mismatch"])

  # 24. Sync authorized but not executed written as PASS must be rejected.
  t24 = deep_copy.call(original)
  scenario_by_id.call(t24, "TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED")["expected"]["result"] = "PASS"
  reject.call("sync-authorized-not-executed-as-pass", t24, ["expected.result mismatch"])

  # 25. Invalid canonical risk case (lowercase `high`) must be rejected; only
  # `none` / `High` / `Critical` are canonical.
  t25 = deep_copy.call(original)
  scenario_by_id.call(t25, "TAIL-P-04-PASS-WITH-RISK")["input"]["risk"]["level"] = "high"
  reject.call("invalid-canonical-risk-case", t25, ["invalid risk level"])

  # 26. Duplicate expected blockers must be rejected before comparison.
  t26 = deep_copy.call(original)
  scenario_by_id.call(t26, "TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED")["expected"]["blockers"] = [
    "SYNC_REQUIRED execution not complete", "SYNC_REQUIRED execution not complete"
  ]
  reject.call("duplicate-expected-blockers", t26, ["expected blockers contains duplicates"])

  # 27. An unexpected exception must never count as an expected rejection.
  # Probe the rejection harness with nested data that genuinely crashes an
  # unvalidated runner (`123["item"]` raises TypeError). The strict nested
  # schema must reject it cleanly, and the harness must record that the
  # declared diagnostic was not produced instead of silently passing.
  labels << "unexpected-exception-not-rejection"
  crash_tampered = deep_copy.call(original)
  crash_scenario = deep_copy.call(scenario_by_id.call(crash_tampered, "TAIL-D-01-DIRECT-NO-SYNC"))
  crash_scenario["id"] = "CRASH-PROBE-EVAL"
  crash_scenario["input"]["artifacts"] = [123]
  crash_tampered["scenarios"] << crash_scenario
  crash_failures = []
  probe_rejection("crash-probe-eval", crash_tampered, ["expected.result mismatch"], crash_failures)
  failures << "unexpected-exception-treated-as-rejection" if crash_failures.empty?

  [failures, labels]
end

# ── Success markers ─────────────────────────────────────────────────────────

def scenario_input_value(data, id, *path)
  scenario = (data["scenarios"] || []).find { |s| s["id"] == id }
  return nil unless scenario

  scenario.dig("input", *path)
end

def verify_fail_closed_markers(results, data, selftest_failures, selftest_labels, errors)
  checks = {
    "GATE_RUNNER_RESPONSE_ONLY_FAIL_CLOSED" =>
      results["TAIL-P-01-RESPONSE-ONLY"] &&
      results["TAIL-P-01-RESPONSE-ONLY"]["result"] == "FAIL" &&
      results["TAIL-P-01-RESPONSE-ONLY"]["completion_source_established"] == false,
    "GATE_RUNNER_PERSISTENCE_FAILURE_FAIL_CLOSED" =>
      results["TAIL-P-02-WRITE-FAILURE"] &&
      results["TAIL-P-02-WRITE-FAILURE"]["result"] == "FAIL",
    "GATE_RUNNER_READBACK_MISMATCH_FAIL_CLOSED" =>
      results["TAIL-P-03-READBACK-MISMATCH"] &&
      results["TAIL-P-03-READBACK-MISMATCH"]["result"] == "FAIL",
    "GATE_RUNNER_STALE_EVIDENCE_FAIL_CLOSED" =>
      results["DPE-06-STALE-DECISION"] &&
      results["DPE-06-STALE-DECISION"]["result"] == "FAIL" &&
      results["TAIL-S-03-STALE-PIPELINE-EVIDENCE"] &&
      results["TAIL-S-03-STALE-PIPELINE-EVIDENCE"]["result"] == "FAIL",
    "GATE_RUNNER_WRONG_ROUTE_FAIL_CLOSED" =>
      results["DPE-03-WRONG-DIRECT-ROUTE"] &&
      results["DPE-03-WRONG-DIRECT-ROUTE"]["result"] == "FAIL",
    "GATE_RUNNER_PASS_WITH_RISK_BOUNDARY_VERIFIED" =>
      results["TAIL-P-04-PASS-WITH-RISK"] &&
      results["TAIL-P-04-PASS-WITH-RISK"]["result"] == "PASS_WITH_RISK" &&
      results["TAIL-P-04-PASS-WITH-RISK"]["completion_source_established"] == true &&
      results["TAIL-P-05-INCOMPLETE-RISK-ACCEPTANCE"] &&
      results["TAIL-P-05-INCOMPLETE-RISK-ACCEPTANCE"]["result"] == "FAIL" &&
      results["TAIL-P-06-CRITICAL-RISK"] &&
      results["TAIL-P-06-CRITICAL-RISK"]["result"] == "FAIL",
    # R1: first formal Tail completion runs start from `in_progress`, which is
    # never completion evidence by itself; formal PASS is formed only through
    # Stage A evidence + Stage B persistence/read-back. The five fixed PASS
    # scenarios and the three Stage B failure scenarios all start from
    # `in_progress`, so their outcomes come from their own boundary, not from
    # a pre-completed status.
    "GATE_RUNNER_TAIL_IN_PROGRESS_LIFECYCLE_VERIFIED" =>
      %w[
        TAIL-D-01-DIRECT-NO-SYNC TAIL-D-02-DIRECT-SYNCED
        TAIL-S-01-REUSE-CURRENT-EVIDENCE TAIL-G-01-PURE-GOVERNANCE
        TAIL-P-04-PASS-WITH-RISK
      ].all? do |id|
        scenario_input_value(data, id, "tail", "status") == "in_progress" &&
          results[id] && results[id]["result"] != "FAIL"
      end &&
      %w[TAIL-P-01-RESPONSE-ONLY TAIL-P-02-WRITE-FAILURE TAIL-P-03-READBACK-MISMATCH].all? do |id|
        scenario_input_value(data, id, "tail", "status") == "in_progress"
      end,
    "GATE_RUNNER_PRECOMPLETED_WITHOUT_SOURCE_FAIL_CLOSED" =>
      scenario_input_value(data, "TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE", "tail", "status") == "completed" &&
      scenario_input_value(data, "TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE", "tail", "completion_source_present") == false &&
      scenario_input_value(data, "TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE", "tail", "completion_source_current") == false &&
      results["TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE"] &&
      results["TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE"]["result"] == "FAIL" &&
      results["TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE"]["tail_completion_eligible"] == false &&
      results["TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE"]["manifest_completed_recommendation"] == false &&
      results["TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE"]["completion_source_established"] == false,
    # R1: the strict recursive nested schema is verified by the bound
    # self-tests that must reject unknown/missing nested fields, invalid
    # enums, duplicate/missing artifact items, `current` entry coverage, and
    # non-canonical risk case with the declared diagnostics.
    "GATE_RUNNER_NESTED_SCHEMA_FAIL_CLOSED" =>
      selftest_failures.empty? &&
      %w[
        unknown-nested-input-field missing-required-nested-field invalid-work-kind
        invalid-freshness entry-coverage-status-current duplicate-artifact-item
        missing-artifact-item invalid-canonical-risk-case duplicate-expected-blockers
      ].all? { |label| selftest_labels.include?(label) },
    "GATE_RUNNER_PURE_DOCUMENTATION_SKIP_BASIS_VERIFIED" =>
      results["TAIL-G-03-PURE-DOCUMENTATION-MISSING-SKIP-BASIS"] &&
      results["TAIL-G-03-PURE-DOCUMENTATION-MISSING-SKIP-BASIS"]["result"] == "FAIL" &&
      results["TAIL-G-03-PURE-DOCUMENTATION-MISSING-SKIP-BASIS"]["blockers"].include?("skipped items lack complete basis") &&
      selftest_failures.empty? &&
      selftest_labels.include?("pure-doc-missing-skip-basis-as-pass"),
    # R1: Sync write authorization is separated from execution. Unauthorized
    # SYNC_REQUIRED fails with the write-authorization blocker and never
    # requests execution; authorized-but-unexecuted fails with the execution
    # blocker and requests the professional skill.
    "GATE_RUNNER_SYNC_WRITE_AUTHORIZATION_VERIFIED" =>
      scenario_input_value(data, "TAIL-D-03-SYNC-NOT-AUTHORIZED", "business_domain_sync", "write_authorized") == false &&
      results["TAIL-D-03-SYNC-NOT-AUTHORIZED"] &&
      results["TAIL-D-03-SYNC-NOT-AUTHORIZED"]["result"] == "FAIL" &&
      results["TAIL-D-03-SYNC-NOT-AUTHORIZED"]["blockers"].include?("SYNC_REQUIRED write not authorized") &&
      results["TAIL-D-03-SYNC-NOT-AUTHORIZED"]["professional_skill_execution_requested"] == false &&
      scenario_input_value(data, "TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED", "business_domain_sync", "write_authorized") == true &&
      results["TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED"] &&
      results["TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED"]["result"] == "FAIL" &&
      results["TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED"]["blockers"].include?("SYNC_REQUIRED execution not complete") &&
      results["TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED"]["professional_skill_execution_requested"] == true
  }
  checks.each do |marker, ok|
    if ok
      puts "#{marker} true"
    else
      errors << "fixture: #{marker} assertion failed"
    end
  end
end

# ── Main ────────────────────────────────────────────────────────────────────

def main
  errors = []
  tmpdir_state = { dirs: [], cleanup_errors: [] }

  begin
    data = parse_fixture_text(File.read(FIXTURE_PATH), "fixture")
  rescue StandardError => e
    errors << e.message
    data = nil
  end

  results = {}
  group_failed = {}
  schema_passed = false

  if data
    schema_errors = []
    validate_schema_only(data, "fixture", schema_errors)
    if schema_errors.empty?
      puts "GATE_RUNNER_SCENARIO_SCHEMA_VALIDATED true"
      schema_passed = true
      results, group_failed = evaluate_all(data, "fixture", errors, tmpdir_state)
    else
      errors.concat(schema_errors)
    end
  end

  GROUPS.each do |prefix, marker|
    ids = results.keys.select { |id| id.start_with?(prefix) }
    next if ids.empty?

    puts "#{marker} true" unless group_failed[prefix]
  end

  selftest_failures = []
  selftest_labels = []
  if errors.empty? && data
    selftest_failures, selftest_labels = run_self_tests(data)
    errors.concat(selftest_failures)
  end

  if errors.empty? && data
    verify_fail_closed_markers(results, data, selftest_failures, selftest_labels, errors)
  end

  if errors.empty? && data && schema_passed
    puts "GATE_RUNNER_SELFTESTS_PASS true"
    puts "TEMP_CLEANUP_COMPLETE true"
    total = data["scenarios"].size
    puts "GATE_RUNNER_SCENARIO_SUMMARY total=#{total} passed=#{total} failed=0"
    exit 0
  end

  warn "gate runner scenario validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end

main
