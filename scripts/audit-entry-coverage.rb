#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "find"
require "optparse"
require "set"
require "time"
require "yaml"

DEFAULT_REPORT_DIR = ".specify/reports/entry_coverage"
DEFAULT_PROFILE_PATH = ".specify/entry-coverage-profile.yaml"
DEFAULT_BUSINESS_DOMAIN_ROOT = ".specify/business_domain"
DEFAULT_L4_PATTERN = ".specify/business_domain/**/[0-9][0-9][0-9][0-9][0-9][0-9]*.md"

DEFAULT_EXCLUDE_PATTERNS = [
  "**/target/**",
  "**/build/**",
  "**/dist/**",
  "**/.git/**",
  "**/node_modules/**",
  "**/.venv/**",
  "**/venv/**",
  "**/vendor/**",
  "out/**",
  "**/coverage/**",
  "**/generated/**",
  "**/.idea/**",
  "**/.gradle/**",
  "**/.mvn/**"
].freeze

DEFAULT_LAYER_PATTERNS = {
  "service" => ["*Service.java", "*ServiceImpl.java", "*Service.ts", "*Service.tsx"],
  "manager" => ["*Manager.java", "*ManagerImpl.java", "*DomainService.java"],
  "persistence" => ["*Mapper.java", "*Dao.java", "*DAO.java", "*Repository.java", "*Mapper.xml"]
}.freeze

OUTPUT_KEYS = {
  "entry_inventory" => "entry_inventory.tsv",
  "service_inventory" => "service_inventory.tsv",
  "entry_chain_evidence" => "entry_chain_evidence.md",
  "unarchived_entries" => "unarchived_entries.md",
  "unarchived_services" => "unarchived_services.md",
  "cross_domain_conflicts" => "cross_domain_conflicts.md",
  "summary_report" => "entry_coverage_report.md"
}.freeze

Record = Struct.new(
  :kind,
  :entry_type,
  :evidence_mode,
  :symbol,
  :path,
  :module_name,
  :matched_docs,
  :matched_l2,
  :requirement_scope,
  keyword_init: true
)

options = {
  strict: false,
  dry_run: false,
  requirement_id: nil,
  feature: nil,
  manifest: nil,
  profile: nil,
  output_dir: nil
}

parser = OptionParser.new do |opts|
  opts.banner = "Usage: scripts/audit-entry-coverage.rb <target-project-path> [options]"
  opts.on("--profile PATH", "Use an explicit entry coverage profile path.") { |value| options[:profile] = value }
  opts.on("--output-dir PATH", "Write reports to an explicit output directory.") { |value| options[:output_dir] = value }
  opts.on("--requirement-id ID", "Classify coverage for a current requirement id.") { |value| options[:requirement_id] = value }
  opts.on("--feature PATH", "Optional specs/{feature} path or id for current requirement scope.") { |value| options[:feature] = value }
  opts.on("--manifest PATH", "Optional artifact manifest path for report context.") { |value| options[:manifest] = value }
  opts.on("--strict", "Exit non-zero when strict blocking conditions are found.") { options[:strict] = true }
  opts.on("--dry-run", "Print report previews without writing files.") { options[:dry_run] = true }
  opts.on("-h", "--help", "Show help.") do
    puts opts
    exit 0
  end
end

parser.parse!

target_arg = ARGV.shift
unless target_arg
  warn parser.to_s
  exit 2
end

TARGET_ROOT = File.expand_path(target_arg)
unless Dir.exist?(TARGET_ROOT)
  warn "Target project path does not exist: #{TARGET_ROOT}"
  exit 2
end

def relative(path)
  PathnameSafe.relative_path(path, TARGET_ROOT)
end

module PathnameSafe
  module_function

  def relative_path(path, root)
    expanded = File.expand_path(path)
    prefix = "#{File.expand_path(root)}/"
    expanded.start_with?(prefix) ? expanded.delete_prefix(prefix) : expanded
  end
end

def placeholder?(value)
  value.to_s.include?("<") || value.to_s.include?(">")
end

def compact_list(value)
  Array(value).compact.map(&:to_s).map(&:strip).reject(&:empty?).reject { |item| placeholder?(item) }
end

def normalize_rel(path)
  path.to_s.sub(%r{\A\./}, "")
end

def excluded?(relative_path, exclude_patterns)
  normalized = normalize_rel(relative_path)
  exclude_patterns.any? do |pattern|
    File.fnmatch?(pattern, normalized, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
      File.fnmatch?(pattern, normalized, File::FNM_EXTGLOB)
  end
end

def included?(relative_path, include_patterns)
  return true if include_patterns.empty? || include_patterns == ["**/*"]

  normalized = normalize_rel(relative_path)
  include_patterns.any? do |pattern|
    File.fnmatch?(pattern, normalized, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
      File.fnmatch?(pattern, normalized, File::FNM_EXTGLOB)
  end
end

def project_files(exclude_patterns, include_patterns)
  files = []
  Find.find(TARGET_ROOT) do |path|
    rel = PathnameSafe.relative_path(path, TARGET_ROOT)
    if File.directory?(path)
      if rel != "." && excluded?(rel, exclude_patterns)
        Find.prune
      else
        next
      end
    end

    next unless File.file?(path)
    next if excluded?(rel, exclude_patterns)
    next unless included?(rel, include_patterns)

    files << rel
  end
  files.sort
end

def files_for_pattern(pattern, all_files)
  return [] if placeholder?(pattern)

  normalized = normalize_rel(pattern)
  all_files.select do |rel|
    File.fnmatch?(normalized, rel, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
      File.fnmatch?(normalized, rel, File::FNM_EXTGLOB)
  end
end

def symbol_for(path)
  File.basename(path).sub(/\.(java|kt|groovy|scala|ts|tsx|js|jsx|vue|jsp|html|ftl|vm|xml|sql)\z/i, "")
end

def module_for(path, source_roots)
  source_root = source_roots.find { |root| path.start_with?("#{normalize_rel(root)}/") }
  return source_root if source_root

  parts = path.split("/")
  parts.length > 1 ? parts.first : "."
end

def l2_for(doc_path, business_domain_root)
  rel = PathnameSafe.relative_path(doc_path, File.join(TARGET_ROOT, business_domain_root))
  parts = rel.split("/")
  return "." if parts.length <= 1

  parts.first(parts.length - 1).join("/")
end

def read_text(path)
  File.read(path, encoding: "UTF-8")
rescue ArgumentError
  File.read(path, encoding: "UTF-8", invalid: :replace, undef: :replace)
end

def doc_mentions_record?(text, record)
  text.include?(record.symbol) || text.include?(record.path) || text.include?(File.basename(record.path))
end

def requirement_scope_for(matched_docs, requirement_id, feature)
  return "repository_wide" if requirement_id.to_s.empty? && feature.to_s.empty?
  return "unmatched" if matched_docs.empty?

  tokens = [requirement_id, feature].compact.map(&:to_s).reject(&:empty?)
  return "repository_wide" if tokens.empty?

  matched_docs.any? { |path| tokens.any? { |token| path.include?(token) } } ? "current_requirement" : "historical_repository_residue"
end

def tsv_escape(value)
  value.to_s.gsub("\t", " ").gsub("\n", " ")
end

def markdown_list(items)
  return "- <none>\n" if items.empty?

  items.map { |item| "- #{item}" }.join("\n") + "\n"
end

profile_path = File.expand_path(options[:profile] || File.join(TARGET_ROOT, DEFAULT_PROFILE_PATH))
unless File.file?(profile_path)
  warn "Entry coverage profile not found: #{profile_path}"
  exit 2
end

profile = YAML.safe_load(File.read(profile_path), permitted_classes: [], aliases: false) || {}
scope = profile.fetch("scope", {})
domain_matching = profile.fetch("domain_matching", {})
strict_outputs = OUTPUT_KEYS.merge(profile.fetch("strict_outputs", {}) || {})

source_roots = compact_list(scope["source_roots"])
source_roots = ["."] if source_roots.empty?
include_patterns = compact_list(scope["include_file_patterns"])
include_patterns = ["**/*"] if include_patterns.empty?
exclude_patterns = (DEFAULT_EXCLUDE_PATTERNS + compact_list(scope["exclude_file_patterns"])).uniq
business_domain_root = normalize_rel(scope["document_scope"] || DEFAULT_BUSINESS_DOMAIN_ROOT)
report_dir = File.expand_path(options[:output_dir] || File.join(TARGET_ROOT, scope["report_dir"] || DEFAULT_REPORT_DIR))
l4_pattern = normalize_rel(domain_matching["l4_document_pattern"] || DEFAULT_L4_PATTERN)

all_files = project_files(exclude_patterns, include_patterns)

entry_records = []
Array(profile["entry_types"]).each do |entry_type|
  next unless entry_type.is_a?(Hash)

  name = entry_type["name"].to_s
  next if name.empty? || placeholder?(name)

  evidence_mode = entry_type["evidence_mode"].to_s.empty? ? "business_chain" : entry_type["evidence_mode"].to_s
  path_patterns = compact_list(entry_type["path_patterns"])
  matched_paths = path_patterns.flat_map { |pattern| files_for_pattern(pattern, all_files) }.uniq.sort

  matched_paths.each do |path|
    entry_records << Record.new(
      kind: "entry",
      entry_type: name,
      evidence_mode: evidence_mode,
      symbol: symbol_for(path),
      path: path,
      module_name: module_for(path, source_roots),
      matched_docs: [],
      matched_l2: [],
      requirement_scope: "unmatched"
    )
  end
end

layer_records = []
layers = profile.fetch("layers", {})
DEFAULT_LAYER_PATTERNS.each do |kind, defaults|
  layer = layers.fetch(kind, {})
  path_patterns = compact_list(layer["path_patterns"])
  class_patterns = compact_list(layer["class_name_patterns"])
  effective_patterns = path_patterns.empty? ? defaults : path_patterns

  matched_paths = effective_patterns.flat_map { |pattern| files_for_pattern("**/#{pattern}", all_files) + files_for_pattern(pattern, all_files) }.uniq
  if matched_paths.empty? && !class_patterns.empty?
    matched_paths = all_files.select do |path|
      class_patterns.any? do |pattern|
        next false if placeholder?(pattern)

        File.fnmatch?(pattern, symbol_for(path), File::FNM_EXTGLOB) ||
          File.fnmatch?(pattern, File.basename(path), File::FNM_EXTGLOB)
      end
    end
  end

  matched_paths.sort.each do |path|
    layer_records << Record.new(
      kind: kind,
      entry_type: kind,
      evidence_mode: "#{kind}_chain",
      symbol: symbol_for(path),
      path: path,
      module_name: module_for(path, source_roots),
      matched_docs: [],
      matched_l2: [],
      requirement_scope: "unmatched"
    )
  end
end

l4_docs = Dir[File.join(TARGET_ROOT, l4_pattern)].select { |path| File.file?(path) }.sort
doc_texts = l4_docs.to_h { |path| [path, read_text(path)] }

(entry_records + layer_records).each do |record|
  doc_texts.each do |doc_path, text|
    next unless doc_mentions_record?(text, record)

    record.matched_docs << PathnameSafe.relative_path(doc_path, TARGET_ROOT)
    record.matched_l2 << l2_for(doc_path, business_domain_root)
  end
  record.matched_docs.uniq!
  record.matched_l2.uniq!
  record.requirement_scope = requirement_scope_for(record.matched_docs, options[:requirement_id], options[:feature])
end

entry_conflicts = entry_records.select { |record| record.matched_l2.length > 1 }
unarchived_entries = entry_records.select { |record| record.matched_docs.empty? }
unarchived_services = layer_records.select { |record| record.matched_docs.empty? }

business_domain_missing = !Dir.exist?(File.join(TARGET_ROOT, business_domain_root)) || l4_docs.empty?
status =
  if entry_records.empty?
    "PENDING"
  elsif business_domain_missing || !entry_conflicts.empty? || !unarchived_entries.empty?
    "BLOCKED"
  elsif !unarchived_services.empty?
    "BLOCKED"
  else
    "PASS"
  end

generated_at = Time.now.iso8601

reports = {}

reports[strict_outputs["entry_inventory"]] = [
  %w[entry_type evidence_mode symbol path module archived matched_l2 matched_docs requirement_scope].join("\t"),
  *entry_records.map do |record|
    [
      record.entry_type,
      record.evidence_mode,
      record.symbol,
      record.path,
      record.module_name,
      record.matched_docs.empty? ? "false" : "true",
      record.matched_l2.join(","),
      record.matched_docs.join(","),
      record.requirement_scope
    ].map { |value| tsv_escape(value) }.join("\t")
  end
].join("\n") + "\n"

reports[strict_outputs["service_inventory"]] = [
  %w[kind symbol path module archived matched_l2 matched_docs requirement_scope].join("\t"),
  *layer_records.map do |record|
    [
      record.kind,
      record.symbol,
      record.path,
      record.module_name,
      record.matched_docs.empty? ? "false" : "true",
      record.matched_l2.join(","),
      record.matched_docs.join(","),
      record.requirement_scope
    ].map { |value| tsv_escape(value) }.join("\t")
  end
].join("\n") + "\n"

entry_type_counts = entry_records.group_by(&:entry_type).transform_values(&:length)
entry_type_archived = entry_records.group_by(&:entry_type).transform_values { |items| items.count { |record| !record.matched_docs.empty? } }

reports[strict_outputs["entry_chain_evidence"]] = <<~MARKDOWN
  # Entry Chain Evidence

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  ## Summary

  | Entry Type | Total | Archived | Unarchived |
  | --- | ---: | ---: | ---: |
  #{entry_type_counts.keys.sort.map { |type| "| #{type} | #{entry_type_counts[type]} | #{entry_type_archived[type] || 0} | #{entry_type_counts[type] - (entry_type_archived[type] || 0)} |" }.join("\n")}

  ## Evidence Rows

  | Entry Type | Evidence Mode | Symbol | Path | Status | Matched Docs |
  | --- | --- | --- | --- | --- | --- |
  #{entry_records.map { |record| "| #{record.entry_type} | #{record.evidence_mode} | `#{record.symbol}` | `#{record.path}` | #{record.matched_docs.empty? ? "UNARCHIVED" : "ARCHIVED"} | #{record.matched_docs.empty? ? "<none>" : record.matched_docs.join("<br>")} |" }.join("\n")}
MARKDOWN

reports[strict_outputs["unarchived_entries"]] = <<~MARKDOWN
  # Unarchived Entries

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  Status: #{unarchived_entries.empty? ? "CLEAR" : "BLOCKING"}

  #{business_domain_missing ? "Business-domain L4 documents are missing or empty, so entry coverage is pending and blocking.\n" : ""}
  | Entry Type | Symbol | Path | Evidence Mode |
  | --- | --- | --- | --- |
  #{unarchived_entries.map { |record| "| #{record.entry_type} | `#{record.symbol}` | `#{record.path}` | #{record.evidence_mode} |" }.join("\n")}
MARKDOWN

reports[strict_outputs["unarchived_services"]] = <<~MARKDOWN
  # Unarchived Core Units

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  Status: #{unarchived_services.empty? ? "CLEAR" : "BLOCKING"}

  | Kind | Symbol | Path |
  | --- | --- | --- |
  #{unarchived_services.map { |record| "| #{record.kind} | `#{record.symbol}` | `#{record.path}` |" }.join("\n")}
MARKDOWN

reports[strict_outputs["cross_domain_conflicts"]] = <<~MARKDOWN
  # Cross Domain Conflicts

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  Status: #{entry_conflicts.empty? ? "CLEAR" : "BLOCKING"}

  | Entry Type | Symbol | Path | Matched L2 Domains | Matched Docs |
  | --- | --- | --- | --- | --- |
  #{entry_conflicts.map { |record| "| #{record.entry_type} | `#{record.symbol}` | `#{record.path}` | #{record.matched_l2.join(", ")} | #{record.matched_docs.join("<br>")} |" }.join("\n")}
MARKDOWN

blocking_reasons = []
blocking_reasons << "business_domain L4 documents missing or empty" if business_domain_missing
blocking_reasons << "#{unarchived_entries.length} entries have no L4 match" unless unarchived_entries.empty?
blocking_reasons << "#{unarchived_services.length} core units have no business-domain match" unless unarchived_services.empty?
blocking_reasons << "#{entry_conflicts.length} entries map to multiple L2 domains" unless entry_conflicts.empty?
blocking_reasons << "no entries matched profile patterns" if entry_records.empty?

reports[strict_outputs["summary_report"]] = <<~MARKDOWN
  # Entry Coverage Report

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  ## Result

  | Field | Value |
  | --- | --- |
  | Status | #{status} |
  | Target | `#{TARGET_ROOT}` |
  | Profile | `#{PathnameSafe.relative_path(profile_path, TARGET_ROOT)}` |
  | Business Domain Root | `#{business_domain_root}` |
  | L4 Documents | #{l4_docs.length} |
  | Entries | #{entry_records.length} |
  | Core Units | #{layer_records.length} |
  | Unarchived Entries | #{unarchived_entries.length} |
  | Unarchived Core Units | #{unarchived_services.length} |
  | Cross-Domain Conflicts | #{entry_conflicts.length} |
  | Requirement ID | #{options[:requirement_id] || "<not scoped>"} |
  | Feature | #{options[:feature] || "<not scoped>"} |
  | Manifest | #{options[:manifest] || "<not provided>"} |

  ## Blocking Reasons

  #{markdown_list(blocking_reasons)}

  ## Generated Reports

  #{markdown_list(strict_outputs.values_at(*OUTPUT_KEYS.keys).map { |name| File.join(PathnameSafe.relative_path(report_dir, TARGET_ROOT), name) })}
MARKDOWN

if options[:dry_run]
  reports.each do |name, text|
    puts "\n--- #{File.join(PathnameSafe.relative_path(report_dir, TARGET_ROOT), name)} ---"
    puts text
  end
else
  FileUtils.mkdir_p(report_dir)
  reports.each do |name, text|
    File.write(File.join(report_dir, name), text)
  end
  puts "Generated entry coverage reports in #{PathnameSafe.relative_path(report_dir, TARGET_ROOT)}"
  puts "Entry coverage status: #{status}"
end

exit(status == "PASS" || !options[:strict] ? 0 : 1)
