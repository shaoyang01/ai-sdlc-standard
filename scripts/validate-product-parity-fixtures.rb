#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

ROOT = File.expand_path("..", __dir__)
FIXTURE_ROOT = File.join(ROOT, "fixtures", "speckit-product-parity")

ALLOWED_FORBIDDEN_GUARD_PATTERNS = [
  /forbidden/i,
  /must\s+not/i,
  /not\s+runtime\s+input/i,
  /preserved_not_runtime_input/i,
  /preserved_not_read/i,
  /development-time\s+fixture/i,
  /Legacy\s+Skill\s+usage:\s*none/i,
  /Legacy\s+document\s+runtime\s+input:\s*none/i,
  /Legacy\s+document\s+write\s+target:\s*none/i
].freeze

errors = []

def relative(path)
  path.sub("#{ROOT}/", "")
end

unless File.directory?(FIXTURE_ROOT)
  puts "product parity fixture validation ok (no fixtures directory)"
  exit 0
end

fixture_dirs = Dir[File.join(FIXTURE_ROOT, "*")].select { |d| File.directory?(d) }.sort

if fixture_dirs.empty?
  puts "product parity fixture validation ok (no fixtures found)"
  exit 0
end

results = { pass: [], fail: [] }

fixture_dirs.each do |dir|
  fixture_name = File.basename(dir)
  yaml_path = File.join(dir, "fixture.yaml")
  expected_path = File.join(dir, "expected.md")

  unless File.exist?(yaml_path)
    errors << "#{relative(dir)} missing fixture.yaml"
    results[:fail] << fixture_name
    next
  end

  unless File.exist?(expected_path)
    errors << "#{relative(dir)} missing expected.md"
    results[:fail] << fixture_name
    next
  end

  fixture = YAML.safe_load(File.read(yaml_path), permitted_classes: [], aliases: false) || {}
  expected_text = File.read(expected_path)

  fixture_name_yaml = fixture["name"]
  if fixture_name_yaml && fixture_name_yaml != fixture_name
    errors << "#{relative(dir)} fixture name #{fixture_name_yaml.inspect} does not match directory #{fixture_name}"
  end

  # Check required_standard_files exist
  Array(fixture["required_standard_files"]).each do |rel_path|
    abs_path = File.join(ROOT, rel_path)
    unless File.exist?(abs_path)
      errors << "#{relative(dir)} required standard file missing: #{rel_path}"
    end
  end

  # Check required_terms found in standard files or expected.md
  combined_text = expected_text.dup
  Array(fixture["required_standard_files"]).each do |rel_path|
    abs_path = File.join(ROOT, rel_path)
    combined_text << File.read(abs_path) if File.exist?(abs_path)
  end

  Array(fixture["required_terms"]).each do |term|
    unless combined_text.include?(term)
      errors << "#{relative(dir)} missing required term: #{term}"
    end
  end

  # Check forbidden_terms
  guard_words = [/must\s+not/i, /must\s+never/i, /forbidden/i, /prohibited/i, /not\s+allowed/i, /\bno\b/i, /cannot/i, /\bdo\s+not\b/i, /不得/, /禁止/, /不允许/, /不能/]
  Array(fixture["forbidden_terms"]).each do |term|
    # Check expected.md for forbidden terms (must have guard context)
    if expected_text.include?(term)
      lines = expected_text.lines
      lines.each_with_index do |line, index|
        next unless line.include?(term)
        context = [lines[index - 1], line, lines[index + 1]].compact.join(" ")
        unless guard_words.any? { |gw| context.match?(gw) } || ALLOWED_FORBIDDEN_GUARD_PATTERNS.any? { |pat| context.match?(pat) }
          errors << "#{relative(dir)}/#{relative(expected_path)}:#{index + 1} forbidden term without guard: #{term}"
        end
      end
    end

    # Check required_standard_files for forbidden terms (guard context required)
    # Only for the expanded parity fixture to avoid false positives from
    # standard files that describe legacy rail behavior descriptively.
    next unless fixture_name == "legacy-new-rail-product-parity-expanded"
    Array(fixture["required_standard_files"]).each do |rel_path|
      abs_path = File.join(ROOT, rel_path)
      next unless File.exist?(abs_path)
      next if rel_path.start_with?("scripts/") || rel_path.include?("fixtures/")
      text = File.read(abs_path)
      next unless text.include?(term)
      lines = text.lines
      lines.each_with_index do |line, index|
        next unless line.include?(term)
        context = [lines[index - 1], line, lines[index + 1]].compact.join(" ")
        unless guard_words.any? { |gw| context.match?(gw) } || ALLOWED_FORBIDDEN_GUARD_PATTERNS.any? { |pat| context.match?(pat) }
          errors << "#{relative(dir)}/#{rel_path}:#{index + 1} forbidden term in standard file without guard: #{term}"
        end
      end
    end
  end

  if errors.empty? || errors.none? { |e| e.include?(relative(dir)) }
    results[:pass] << fixture_name
  else
    results[:fail] << fixture_name
  end
end

results[:pass].each do |name|
  puts "  PASS  #{name}"
end

results[:fail].each do |name|
  puts "  FAIL  #{name}"
end

if errors.empty?
  puts "product parity fixture validation ok (#{results[:pass].size} fixtures)"
  exit 0
else
  warn "product parity fixture validation failed (#{results[:fail].size} failed, #{results[:pass].size} passed):"
  errors.each { |error| warn "- #{error}" }
  exit 1
end
