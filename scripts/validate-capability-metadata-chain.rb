#!/usr/bin/env ruby
# frozen_string_literal: true

# Read-only capability metadata-chain validator.
#
# docs/CAPABILITY-REFERENCE-MATRIX.md Migration Tracking is the sole current
# migration/path ledger. This script verifies consistency between that ledger,
# the main Matrix table, and on-disk artifacts. It does not create a second
# metadata index, does not access the network, and does not write to the
# filesystem.

require "json"

ROOT = File.expand_path("..", __dir__)
MATRIX_PATH = File.join(ROOT, "docs/CAPABILITY-REFERENCE-MATRIX.md")

errors = []

def repo_file?(relative_path)
  File.file?(File.join(ROOT, relative_path))
end

def normalize_header(name)
  name.to_s.gsub(/\s+/, " ").strip
end

# Strip backtick quoting used by Matrix table cells.
def clean_path(raw)
  raw.to_s.gsub("`", "").strip
end

def unsafe_path?(path)
  return true if path.empty?
  return true if path.start_with?("/", "~")
  return true if path.match?(/\A[A-Za-z]:\//) # Windows drive-root absolute path
  return true if path.include?("\\") || path.include?("://")
  path.split("/").include?("..")
end

# Parse consecutive Markdown tables from a list of lines. Each returned table
# has :header (normalized names), :rows (cells with line numbers), and :line.
def parse_tables(lines, section_label, errors)
  tables = []
  current = nil
  lines.each_with_index do |line, index|
    if line.strip.start_with?("|")
      raw_cells = line.strip.split("|", -1)
      raw_cells = raw_cells[1..-2] || []
      cells = raw_cells.map { |cell| cell.to_s.strip }
      separator = !cells.empty? && cells.all? { |cell| cell.match?(/\A:?-{3,}:?\z/) }
      if current.nil?
        current = { header: cells, rows: [], line: index + 1 }
      elsif !separator
        current[:rows] << { cells: cells, line: index + 1 }
      end
    else
      tables << current unless current.nil?
      current = nil
    end
  end
  tables << current unless current.nil?

  tables.each do |table|
    normalized = table[:header].map { |name| normalize_header(name) }
    counts = Hash.new(0)
    normalized.each { |name| counts[name] += 1 }
    duplicates = counts.select { |_name, count| count > 1 }.keys
    unless duplicates.empty?
      errors << "#{section_label}: ambiguous duplicate header(s) #{duplicates.inspect} in table at line #{table[:line]}"
    end
    table[:header] = normalized
  end
  tables
end

def section_lines(all_lines, heading)
  start_index = all_lines.index { |line| line.strip == heading }
  return nil if start_index.nil?
  rest = all_lines[(start_index + 1)..] || []
  stop_offset = rest.index { |line| line.start_with?("## ") } || rest.length
  rest[0...stop_offset]
end

def row_map(table, row, section_label, errors)
  if row[:cells].length != table[:header].length
    errors << "#{section_label}: malformed row at line #{row[:line]} " \
              "(#{row[:cells].length} cells, expected #{table[:header].length})"
    return nil
  end
  table[:header].zip(row[:cells]).to_h
end

# Evidence-scoped traversal: a value is inspected as evidence only when its
# object key is exactly "evidence". Every evidence value must be an array of
# strings. Strings anywhere else in the document are ignored.
def collect_evidence_strings(node, errors, acc = [])
  case node
  when Array
    node.each { |value| collect_evidence_strings(value, errors, acc) }
  when Hash
    node.each do |key, value|
      if key == "evidence"
        unless value.is_a?(Array)
          errors << "system-capability-review.json: evidence value must be an array"
          next
        end
        value.each do |element|
          unless element.is_a?(String)
            errors << "system-capability-review.json: evidence array element must be a string"
            next
          end
          acc << element
        end
      else
        collect_evidence_strings(value, errors, acc)
      end
    end
  end
  acc
end

unless File.file?(MATRIX_PATH)
  errors << "missing docs/CAPABILITY-REFERENCE-MATRIX.md"
end

implemented_rows = []

if errors.empty?
  matrix_lines = File.readlines(MATRIX_PATH, chomp: true)

  tracking_lines = section_lines(matrix_lines, "## Migration Tracking")
  errors << "missing ## Migration Tracking section" if tracking_lines.nil?

  main_lines = section_lines(matrix_lines, "## Matrix")
  errors << "missing ## Matrix section" if main_lines.nil?

  main_current_paths = Hash.new(0)
  if main_lines
    main_tables = parse_tables(main_lines, "Matrix", errors)
    main_tables.each do |table|
      unless table[:header].include?("Current Path")
        errors << "Matrix: table at line #{table[:line]} is missing required header Current Path"
        next
      end
      table[:rows].each do |row|
        map = row_map(table, row, "Matrix", errors)
        next if map.nil?
        main_current_paths[clean_path(map["Current Path"])] += 1
      end
    end
  end

  if tracking_lines
    required_common = [
      "Baseline Root Path",
      "Root Reference Note",
      "Batch",
      "Compatibility Strategy",
      "Migration Status"
    ].freeze

    tracking_tables = parse_tables(tracking_lines, "Migration Tracking", errors)
    errors << "Migration Tracking: no tables found" if tracking_tables.empty?

    seen_baselines = Hash.new(0)
    seen_targets = Hash.new(0)
    seen_notes = Hash.new(0)

    tracking_tables.each do |table|
      missing = required_common - table[:header]
      has_new = table[:header].include?("New Content Path")
      has_archived = table[:header].include?("Archived Content Path")
      unless missing.empty?
        errors << "Migration Tracking: table at line #{table[:line]} missing required header(s) #{missing.inspect}"
        next
      end
      if has_new == has_archived
        errors << "Migration Tracking: table at line #{table[:line]} must have exactly one of " \
                  "New Content Path / Archived Content Path"
        next
      end
      target_header = has_new ? "New Content Path" : "Archived Content Path"

      table[:rows].each do |row|
        map = row_map(table, row, "Migration Tracking", errors)
        next if map.nil?
        next unless map["Migration Status"].to_s.include?("implemented")

        implemented_rows << row[:line]

        baseline = clean_path(map["Baseline Root Path"])
        target = clean_path(map[target_header])
        note = clean_path(map["Root Reference Note"])
        label = "Migration Tracking line #{row[:line]}"

        errors << "#{label}: unsafe Baseline Root Path #{baseline.inspect}" if unsafe_path?(baseline)
        errors << "#{label}: unsafe #{target_header} #{target.inspect}" if unsafe_path?(target)
        if note != "none" && unsafe_path?(note)
          errors << "#{label}: unsafe Root Reference Note #{note.inspect}"
        end
        next if unsafe_path?(baseline) || unsafe_path?(target) || (note != "none" && unsafe_path?(note))

        seen_baselines[baseline] += 1
        seen_targets[target] += 1
        seen_notes[note] += 1 if note != "none"

        errors << "#{label}: target content file #{target} does not exist" unless repo_file?(target)

        if note == "none"
          if repo_file?(baseline)
            errors << "#{label}: baseline root path #{baseline} still present after direct move"
          end
          expected_current = target
        else
          unless note == baseline
            errors << "#{label}: Root Reference Note #{note} does not equal Baseline Root Path #{baseline}"
          end
          unless repo_file?(note)
            errors << "#{label}: root reference note #{note} does not exist"
          end
          if repo_file?(note)
            content = File.read(File.join(ROOT, note))
            {
              "historical status" => "historical",
              "non-authoritative authority" => "non-authoritative",
              "exact archive link" => target,
              "temporary compatibility reference language" => "temporary compatibility reference",
              "minimum 30-day retention language" => "at least 30 days",
              "separate-governance removal language" => "separate governance decision"
            }.each do |description, needle|
              unless content.include?(needle)
                errors << "#{label}: root reference note #{note} missing #{description}"
              end
            end
          end
          expected_current = note
        end

        count = main_current_paths[expected_current]
        if count != 1
          errors << "#{label}: expected exactly one main Matrix row with Current Path " \
                    "#{expected_current}, found #{count}"
        end
      end
    end

    seen_baselines.each do |path, count|
      errors << "Migration Tracking: duplicate Baseline Root Path #{path} (#{count} rows)" if count > 1
    end
    seen_targets.each do |path, count|
      errors << "Migration Tracking: duplicate target path #{path} (#{count} rows)" if count > 1
    end
    seen_notes.each do |path, count|
      errors << "Migration Tracking: duplicate Root Reference Note #{path} (#{count} rows)" if count > 1
    end
  end
end

# ── Exact shared-inventory checks ──

OLD_ROOT_JSON = ["existing-skills-inventory.json", "skill-flow-inventory.json"].freeze
SHARED_SKILL_JSON = "metadata/capabilities/shared/existing-skills-inventory.json"
SHARED_FLOW_JSON = "metadata/capabilities/shared/skill-flow-inventory.json"
ARCHIVED_FLOW_REPORT = "docs/reports/archive/capabilities/SKILL_FLOW_INVENTORY_REPORT.md"
OLD_EVIDENCE_PATHS = [
  "existing-skills-inventory.json",
  "skill-flow-inventory.json",
  "SKILL_FLOW_INVENTORY_REPORT.md"
].freeze

OLD_ROOT_JSON.each do |path|
  errors << "shared-inventory: root #{path} must be absent" if repo_file?(path)
end

parsed = {}
[SHARED_SKILL_JSON, SHARED_FLOW_JSON].each do |path|
  if repo_file?(path)
    begin
      parsed[path] = JSON.parse(File.read(File.join(ROOT, path)))
    rescue JSON::ParserError => e
      errors << "shared-inventory: #{path} does not parse as JSON (#{e.message})"
    end
  else
    errors << "shared-inventory: #{path} must exist"
  end
end

{
  "core/repository-capability-inventory.ts" =>
    'filePath = "metadata/capabilities/shared/existing-skills-inventory.json"',
  "core/skill-flow-inventory.ts" =>
    'filePath = "metadata/capabilities/shared/skill-flow-inventory.json"'
}.each do |path, needle|
  if repo_file?(path)
    unless File.read(File.join(ROOT, path)).include?(needle)
      errors << "shared-inventory: #{path} is missing accepted default path #{needle.inspect}"
    end
  else
    errors << "shared-inventory: #{path} must exist"
  end
end

if parsed[SHARED_FLOW_JSON].is_a?(Hash)
  unless parsed[SHARED_FLOW_JSON]["source_report"] == ARCHIVED_FLOW_REPORT
    errors << "shared-inventory: #{SHARED_FLOW_JSON} source_report must equal #{ARCHIVED_FLOW_REPORT}"
  end
end

if repo_file?("runtime-capabilities.json")
  begin
    runtime = JSON.parse(File.read(File.join(ROOT, "runtime-capabilities.json")))
    skills = runtime.is_a?(Hash) ? runtime["skills"] : nil
    expected = {
      "skill_registry_canonical_flow_source" => SHARED_FLOW_JSON,
      "canonical_skill_source" => SHARED_SKILL_JSON,
      "canonical_flow_source" => SHARED_FLOW_JSON
    }
    expected.each do |key, value|
      actual = skills.is_a?(Hash) ? skills[key] : nil
      unless actual == value
        errors << "shared-inventory: runtime-capabilities.json skills.#{key} must equal #{value} (got #{actual.inspect})"
      end
    end
  rescue JSON::ParserError => e
    errors << "shared-inventory: runtime-capabilities.json does not parse as JSON (#{e.message})"
  end
else
  errors << "shared-inventory: runtime-capabilities.json must exist"
end

if repo_file?("system-capability-review.json")
  begin
    review = JSON.parse(File.read(File.join(ROOT, "system-capability-review.json")))
    evidence_strings = collect_evidence_strings(review, errors)
    [SHARED_FLOW_JSON, ARCHIVED_FLOW_REPORT].each do |path|
      unless evidence_strings.include?(path)
        errors << "shared-inventory: system-capability-review.json evidence is missing accepted path #{path}"
      end
    end
    OLD_EVIDENCE_PATHS.each do |old_path|
      if evidence_strings.include?(old_path)
        errors << "shared-inventory: system-capability-review.json evidence still contains old root path #{old_path}"
      end
    end
  rescue JSON::ParserError => e
    errors << "shared-inventory: system-capability-review.json does not parse as JSON (#{e.message})"
  end
else
  errors << "shared-inventory: system-capability-review.json must exist"
end

# ── Layered status authority model checks ──

def file_includes(relative_path, needle)
  path = File.join(ROOT, relative_path)
  File.file?(path) && File.read(path).include?(needle)
end

AUTHORITY_COMMON = {
  "model" => "layered_status_authority_v1",
  "human_status_index" => "docs/CURRENT_STATUS.md",
  "implementation_fact_precedence" => "git_tests_pr_ci",
  "global_project_status_authority" => false,
  "planning_authority" => false,
  "authorization_authority" => false,
  "operator_authority" => false,
  "rollout_authority" => false,
  "publication_authority" => false,
  "legacy_recommended_next_pr_authority" => "compatibility_reference_only"
}.freeze

AUTHORITY_ROLES = {
  "runtime-capabilities.json" => {
    "role" => "canonical_machine_runtime_capability_registry",
    "scope" => "runtime_capability_metadata_for_tests_and_tooling"
  },
  "system-capability-review.json" => {
    "role" => "scoped_system_capability_evidence_review_dataset",
    "scope" => "system_capability_evidence_and_review"
  },
  "real-agent-adapter-capability-matrix.json" => {
    "role" => "scoped_adapter_request_type_evidence_matrix",
    "scope" => "adapter_and_execution_request_type_evidence"
  }
}.freeze

AUTHORITY_ROLES.each do |path, role_scope|
  full = File.join(ROOT, path)
  unless File.file?(full)
    errors << "authority: #{path} must exist"
    next
  end
  begin
    data = JSON.parse(File.read(full))
  rescue JSON::ParserError => e
    errors << "authority: #{path} does not parse as JSON (#{e.message})"
    next
  end
  authority = data.is_a?(Hash) ? data["authority"] : nil
  unless authority.is_a?(Hash)
    errors << "authority: #{path} is missing the authority object"
    next
  end
  AUTHORITY_COMMON.merge(role_scope).each do |key, expected|
    actual = authority[key]
    unless actual == expected
      errors << "authority: #{path} authority.#{key} must equal #{expected.inspect} (got #{actual.inspect})"
    end
  end
end

EXPECTED_CURRENT_STATUS_SOURCE_COMMIT = "05b064dcce688f0d7f8dbf41f049052534faab54"
CURRENT_STATUS_AS_OF_PATTERN = /\A- As-of source commit：`([0-9a-f]{40})`\z/

current_status_path = File.join(ROOT, "docs/CURRENT_STATUS.md")
if File.file?(current_status_path)
  as_of_shas = []
  File.readlines(current_status_path, chomp: true).each do |line|
    match = CURRENT_STATUS_AS_OF_PATTERN.match(line)
    as_of_shas << match[1] if match
  end
  if as_of_shas.empty?
    errors << "authority: docs/CURRENT_STATUS.md is missing the As-of source commit line " \
              "(expected exactly 1, found 0)"
  elsif as_of_shas.length > 1
    errors << "authority: docs/CURRENT_STATUS.md has duplicate As-of source commit lines " \
              "(expected exactly 1, found #{as_of_shas.length})"
  elsif as_of_shas.first != EXPECTED_CURRENT_STATUS_SOURCE_COMMIT
    errors << "authority: docs/CURRENT_STATUS.md As-of source commit mismatch: " \
              "expected #{EXPECTED_CURRENT_STATUS_SOURCE_COMMIT}, actual #{as_of_shas.first}"
  end
else
  errors << "authority: docs/CURRENT_STATUS.md must exist"
end

structure_path = File.join(ROOT, "docs/REPOSITORY-STRUCTURE.md")
if File.file?(structure_path)
  structure = File.read(structure_path)
  unless structure.include?("layered_status_authority_v1")
    errors << "authority: docs/REPOSITORY-STRUCTURE.md is missing the layered status authority model"
  end
  if structure.include?("Single source of truth for status documents")
    errors << "authority: docs/REPOSITORY-STRUCTURE.md still contains the unresolved " \
              "Single source of truth for status documents decision"
  end
else
  errors << "authority: docs/REPOSITORY-STRUCTURE.md must exist"
end

{
  "docs/CURRENT_STATUS.md" => [
    "canonical human-readable current repository status/index",
    "feature/loop-runtime-v1",
    "`requirement-summary`",
    "`tech-design`",
    "`solution-challenge`",
    "`review`",
    "`implementation`",
    "`validation`",
    "canonical_machine_runtime_capability_registry",
    "scoped_system_capability_evidence_review_dataset",
    "scoped_adapter_request_type_evidence_matrix",
    "planning_authority: false",
    "authorization_authority: false",
    "operator_authority: false",
    "rollout_authority: false",
    "publication_authority: false",
    "recommended_next_pr",
    "Project Controller sequencing",
    "stage_boundary_reviewed_snapshot",
    "update_every_commit: false",
    "Source implementation facts",
    "Project Controller governance state",
    "not implementation fact",
    "PR #31",
    "PR #32",
    "PR #33",
    "PR #34",
    "PR #35",
    "controlled_rollout_plan_exists: true",
    "controlled_rollout_plan_status: plan_only",
    "task_c_gateway_wiring: false",
    "task_c_runtime_wiring: false",
    "real_canary_executed: false",
    "rollout_executed: false",
    "phase_3_executed: false",
    "new_capability_migration_required_for_closure: false",
    "external_consumer_risk: unknown",
    "topic_09_status: frozen",
    "task_d_status: hold",
    "document_governance_stage_closed: false",
    "project_mainline_return_status: pending_document_governance_closure"
  ],
  "SYSTEM_STATUS.md" => [
    "HISTORICAL SNAPSHOT — NON-AUTHORITATIVE",
    "[docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)",
    "[runtime-capabilities.json](runtime-capabilities.json)"
  ],
  "SYSTEM_CAPABILITY_REVIEW.md" => [
    "HISTORICAL SNAPSHOT — NON-AUTHORITATIVE",
    "[docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)",
    "[runtime-capabilities.json](runtime-capabilities.json)"
  ],
  "README.md" => [
    "Standard Package Release Summary",
    "docs/CURRENT_STATUS.md",
    "docs/REPOSITORY-STRUCTURE.md"
  ],
  "docs/CAPABILITY-REFERENCE-MATRIX.md" => [
    "| `runtime-capabilities.json` | shared/system | registry | scoped machine registry |",
    "| `system-capability-review.json` | shared/system | review | scoped evidence/review |",
    "| `real-agent-adapter-capability-matrix.json` | shared/system | matrix | scoped adapter evidence |",
    "accepted canonical machine runtime capability registry for tests and tooling; " \
      "no global planning or execution authority",
    "accepted scoped system capability evidence/review dataset; " \
      "no global planning or execution authority",
    "accepted scoped adapter and ExecutionRequestType evidence authority; " \
      "no global planning or execution authority"
  ]
}.each do |path, needles|
  needles.each do |needle|
    unless file_includes(path, needle)
      errors << "authority: #{path} is missing required content #{needle.inspect}"
    end
  end
end

# ── Accepted Root Material Classification checks ──

CLASSIFICATION_HEADING = "## Accepted Root Material Classification"

EXPECTED_ROOT_CLASSIFICATIONS = {
  "KEEP_ROOT_CANONICAL" => [
    "README.md",
    "manifest.yaml",
    "ROADMAP.md",
    "PORTABILITY.md",
    "AI_CHANGE_GUARDRAILS.md",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "runtime-capabilities.json",
    "system-capability-review.json",
    "real-agent-adapter-capability-matrix.json"
  ].freeze,
  "KEEP_ROOT_COMPATIBILITY" => [
    "CONTROL_PLANE_AUDIT.md",
    "GLOBAL_SYSTEM_CAPABILITY_REVIEW_BEFORE_KIMI_GATEWAY.md",
    "PROJECT_FILE_INVENTORY.md",
    "REAL_AGENT_ADAPTER_INTEGRATION_PLAN.md",
    "SYSTEM_REVIEW.md",
    "REPOSITORY_CAPABILITY_INVENTORY.md",
    "SKILL_FLOW_INVENTORY_REPORT.md",
    "SYSTEM_STATUS.md",
    "SYSTEM_CAPABILITY_REVIEW.md"
  ].freeze,
  "DEFER_WITH_EXPLICIT_REASON" => [
    "CAPABILITY_ARTIFACT_DIRECTORY_CLEANUP_PLAN.md",
    "HERMES_PHASE_2_CONSOLIDATION.md"
  ].freeze
}.freeze

if File.file?(MATRIX_PATH)
  matrix_all_lines = File.readlines(MATRIX_PATH, chomp: true)
  heading_count = matrix_all_lines.count { |line| line.strip == CLASSIFICATION_HEADING }
  if heading_count != 1
    errors << "classification: expected exactly 1 #{CLASSIFICATION_HEADING.inspect} section, " \
              "found #{heading_count}"
  end

  classification_lines = section_lines(matrix_all_lines, CLASSIFICATION_HEADING)
  if classification_lines.nil?
    errors << "classification: missing #{CLASSIFICATION_HEADING.inspect} section content"
  else
    # Parse "### <letter>. <CLASSIFICATION_NAME>" sub-sections and collect the
    # backticked file names listed under each.
    actual_classification = Hash.new { |hash, key| hash[key] = [] }
    current_name = nil
    classification_lines.each do |line|
      if line.start_with?("### ")
        header_match = line.match(/\A###\s+[A-Z]\.\s+([A-Z_]+)\s*\z/)
        current_name = header_match ? header_match[1] : nil
        next
      end
      bullet_match = line.match(/\A-\s+`([^`]+)`/)
      if bullet_match && current_name
        actual_classification[current_name] << bullet_match[1]
      end
    end

    EXPECTED_ROOT_CLASSIFICATIONS.each do |name, expected_files|
      actual_files = actual_classification[name]
      if actual_files.length != expected_files.length || actual_files.sort != expected_files.sort
        missing = expected_files - actual_files
        extra = actual_files - expected_files
        errors << "classification: #{name} must list exactly #{expected_files.length} file(s); " \
                  "missing #{missing.inspect}, unexpected #{extra.inspect}"
      end
    end

    # Every listed file must appear exactly once across the whole section.
    all_listed = actual_classification.values.flatten
    EXPECTED_ROOT_CLASSIFICATIONS.values.flatten.each do |file|
      count = all_listed.count(file)
      if count != 1
        errors << "classification: #{file} must appear exactly once in the classification " \
                  "section, found #{count}"
      end
    end

    section_text = classification_lines.join("\n")
    {
      "MOVE_TO_FAMILY_DIRECTORY empty classification" => "MOVE_TO_FAMILY_DIRECTORY`: none",
      "ARCHIVE_WITH_REFERENCE_NOTE empty classification" => "ARCHIVE_WITH_REFERENCE_NOTE`: none_new",
      "REMOVE_REFERENCE_NOTE empty classification" => "REMOVE_REFERENCE_NOTE`: none",
      "External Risk unknown retention" => "External Risk remains `unknown`",
      "non-blocking residual risk acceptance" => "non-blocking residual risk",
      "no automatic deletion" => "no automatic deletion",
      "separate governance decision" => "separate governance decision",
      "first eligibility review date" => "2026-08-11T17:12:18Z",
      "second eligibility review date" => "2026-08-18T12:48:51Z",
      "eligibility review is not a deletion date" => "not a deletion date"
    }.each do |description, needle|
      unless section_text.include?(needle)
        errors << "classification: section is missing #{description} (#{needle.inspect})"
      end
    end
  end
end

if errors.empty?
  puts "capability metadata chain validation ok " \
       "(#{implemented_rows.length} implemented migration rows checked; " \
       "layered status authority v1 verified; " \
       "current status stage-boundary snapshot #{EXPECTED_CURRENT_STATUS_SOURCE_COMMIT} verified; " \
       "accepted root material classification verified)"
else
  warn "capability metadata chain validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
