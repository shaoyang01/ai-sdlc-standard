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

if errors.empty?
  puts "capability metadata chain validation ok " \
       "(#{implemented_rows.length} implemented migration rows checked)"
else
  warn "capability metadata chain validation failed:"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
