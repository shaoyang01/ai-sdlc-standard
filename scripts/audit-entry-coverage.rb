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
  :class_name,
  :method_names,
  :route_paths,
  :api_client_names,
  :topics,
  :job_names,
  :function_names,
  :sql_names,
  :code_anchors,
  :matched_docs,
  :matched_l2,
  :match_strength,
  :match_reason,
  :classification,
  :classification_reason,
  :reverse_coverage_status,
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

TABLE_COLUMN_ALIASES = {
  "entrytype" => "entry_type",
  "type" => "entry_type",
  "surface" => "entry_type",
  "entryname" => "entry_name",
  "entry" => "entry_name",
  "name" => "entry_name",
  "codeanchor" => "code_anchor",
  "code" => "code_anchor",
  "anchor" => "code_anchor",
  "path" => "path",
  "codepath" => "path",
  "sourcepath" => "path",
  "method" => "method",
  "function" => "function",
  "handler" => "method",
  "route" => "route",
  "api" => "api_client",
  "apiclient" => "api_client",
  "topic" => "topic",
  "consumer" => "topic",
  "listener" => "topic",
  "job" => "job",
  "sql" => "sql",
  "connector" => "connector",
  "sink" => "sink",
  "l4" => "l4",
  "owningl4" => "l4",
  "domain" => "l4",
  "coveragestatus" => "status",
  "status" => "status",
  "evidence" => "evidence",
  "sourceevidence" => "evidence",
  "technicalbridge" => "technical_bridge",
  "bridge" => "technical_bridge",
  "notapplicable" => "not_applicable",
  "classification" => "classification",
  "reason" => "reason"
}.freeze

NON_BLOCKING_CLASSIFICATIONS = Set.new(%w[
  technical_bridge
  framework_bridge
  generated_or_vendor
  native_shell
  abstract_or_base
  annotation_or_marker
  not_applicable
]).freeze

def canonical_header(value)
  value.to_s.downcase.gsub(/[^a-z0-9]+/, "")
end

def split_table_row(line)
  line.to_s.strip.sub(/\A\|/, "").sub(/\|\z/, "").split("|", -1).map(&:strip)
end

def markdown_separator?(line)
  cells = split_table_row(line)
  return false if cells.empty?

  cells.all? { |cell| cell.match?(/\A:?-{3,}:?\z/) }
end

def parse_markdown_tables(text)
  rows = []
  lines = text.lines.map(&:chomp)
  index = 0

  while index < lines.length - 1
    header_line = lines[index]
    separator_line = lines[index + 1]
    unless header_line.include?("|") && markdown_separator?(separator_line)
      index += 1
      next
    end

    headers = split_table_row(header_line).map do |header|
      TABLE_COLUMN_ALIASES[canonical_header(header)]
    end
    index += 2

    while index < lines.length && lines[index].include?("|")
      values = split_table_row(lines[index])
      break if values.empty?

      row = { "__raw" => lines[index] }
      headers.each_with_index do |field, column_index|
        next if field.to_s.empty?

        value = values[column_index].to_s.strip
        next if value.empty?

        row[field] = [row[field], value].compact.reject(&:empty?).join(" ")
      end
      rows << row unless row.keys == ["__raw"]
      index += 1
    end
  end

  rows
end

def strip_markdown(value)
  value.to_s
       .gsub(/`([^`]*)`/, "\\1")
       .gsub(/\[([^\]]+)\]\([^)]+\)/, "\\1")
       .gsub(/<br\s*\/?>/i, "\n")
       .strip
end

def split_values(value)
  strip_markdown(value)
    .split(/[,;，；\n]+/)
    .map(&:strip)
    .reject(&:empty?)
end

def normalized_token(value)
  strip_markdown(value).downcase
end

def text_contains?(text, token)
  token = strip_markdown(token)
  return false if token.empty?

  text.downcase.include?(token.downcase)
end

def basename_without_ext(path)
  File.basename(path).sub(/\.[^.]+\z/, "")
end

def token_match?(candidate, tokens)
  candidate = normalized_token(candidate)
  return false if candidate.empty?

  tokens.any? do |token|
    token = normalized_token(token)
    next false if token.empty?

    candidate == token || candidate.include?(token) || token.include?(candidate)
  end
end

def code_text_for(relative_path)
  full_path = File.join(TARGET_ROOT, relative_path)
  return "" unless File.file?(full_path)

  read_text(full_path)
rescue StandardError
  ""
end

def extract_method_names(text, path)
  names = []
  names += text.scan(/(?:public|protected|private|static|\s)+[\w<>\[\],\s?]+\s+([a-zA-Z_]\w*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/).flatten
  names += text.scan(/(?:function|def)\s+([a-zA-Z_]\w*)\s*\(/).flatten
  names += text.scan(/(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*(?:async\s*)?\(/).flatten
  names += text.scan(/export\s+(?:async\s+)?function\s+([a-zA-Z_]\w*)\s*\(/).flatten
  names += text.scan(/<select[^>]+id=["']([^"']+)["']/i).flatten if path.end_with?(".xml")
  names.uniq
end

def extract_route_paths(text)
  text.scan(/["'`]((?:\/|#\/)[A-Za-z0-9_{}:.*?&=%\/.-]+)["'`]/).flatten.uniq
end

def extract_topics(text)
  names = []
  names += text.scan(/(?:topic|queue|consumer|listener)\s*[:=]\s*["'`]([^"'`]+)["'`]/i).flatten
  names += text.scan(/@(?:KafkaListener|RabbitListener|McqConsumer|JmsListener)\s*\([^)]*["'`]([^"'`]+)["'`]/i).flatten
  names.uniq
end

def extract_sql_names(text, path)
  names = []
  names << basename_without_ext(path) if path.match?(/\.(sql|xml)\z/i)
  names += text.scan(/\b(?:from|join|into|update|table)\s+([a-zA-Z_][\w.]+)/i).flatten
  names.uniq
end

def extract_record_anchors(path, symbol)
  text = code_text_for(path)
  class_name = symbol
  method_names = extract_method_names(text, path)
  route_paths = extract_route_paths(text)
  topics = extract_topics(text)
  sql_names = extract_sql_names(text, path)

  api_client_names = []
  api_client_names << symbol if symbol.match?(/(?:Api|Client|Request|Service)\z/i)

  job_names = []
  job_names << symbol if symbol.match?(/(?:Job|Etl|ETL|Main|Function|Connector|Sink|Publisher|Handler|Calculator)\z/)

  function_names = method_names.select { |name| name.match?(/(?:process|handle|map|flatMap|sink|publish|calculate|execute|run)/i) }

  code_anchors = ([symbol, class_name, File.basename(path), path] + method_names + route_paths + topics + sql_names + api_client_names + job_names + function_names).uniq

  {
    class_name: class_name,
    method_names: method_names,
    route_paths: route_paths,
    api_client_names: api_client_names.uniq,
    topics: topics,
    job_names: job_names.uniq,
    function_names: function_names.uniq,
    sql_names: sql_names,
    code_anchors: code_anchors
  }
end

def classify_record(kind, entry_type, symbol, path)
  normalized_path = path.downcase
  basename = File.basename(path)

  return ["native_shell", "native shell or mobile build path"] if normalized_path.match?(%r{(^|/)(pods|ios/build|android/build)(/|$)}) ||
                                                                  basename.match?(/\A(MainActivity|AppDelegate)\.(java|kt|swift|m|mm)\z/)
  return ["generated_or_vendor", "generated/vendor dependency path"] if normalized_path.match?(%r{(^|/)(generated|target/generated|build/generated|vendor|node_modules)(/|$)})
  return ["abstract_or_base", "abstract/base class or file"] if symbol.match?(/\A(?:Abstract|Base).+/) ||
                                                               basename.match?(/(?:Base|Abstract)\.(java|kt|ts|tsx|js|jsx)\z/)
  return ["annotation_or_marker", "annotation or marker type"] if basename.match?(/Annotation\.java\z/) ||
                                                                  normalized_path.include?("/annotation/") ||
                                                                  symbol.match?(/Marker\z/)
  if symbol.match?(/(?:Adapter|Bridge|Invoker|Template|Bootstrap|RouteConstants|Configuration|Config)\z/) &&
     entry_type.to_s !~ /api[-_]?client/i
    return ["technical_bridge", "technical bridge naming pattern"]
  end
  return ["framework_bridge", "framework bootstrap/configuration"] if symbol.match?(/(?:Application|FrameworkBootstrap)\z/) &&
                                                                      kind != "entry"

  kind == "entry" ? ["business_entry", "profile entry pattern"] : ["business_entry", "core business unit pattern"]
end

def build_record(kind:, entry_type:, evidence_mode:, path:, source_roots:)
  symbol = symbol_for(path)
  anchors = extract_record_anchors(path, symbol)
  classification, classification_reason = classify_record(kind, entry_type, symbol, path)

  Record.new(
    kind: kind,
    entry_type: entry_type,
    evidence_mode: evidence_mode,
    symbol: symbol,
    path: path,
    module_name: module_for(path, source_roots),
    class_name: anchors[:class_name],
    method_names: anchors[:method_names],
    route_paths: anchors[:route_paths],
    api_client_names: anchors[:api_client_names],
    topics: anchors[:topics],
    job_names: anchors[:job_names],
    function_names: anchors[:function_names],
    sql_names: anchors[:sql_names],
    code_anchors: anchors[:code_anchors],
    matched_docs: [],
    matched_l2: [],
    match_strength: 0,
    match_reason: "",
    classification: classification,
    classification_reason: classification_reason,
    reverse_coverage_status: "not_checked",
    requirement_scope: "unmatched"
  )
end

def row_classification(row)
  raw = [
    row["classification"],
    row["technical_bridge"],
    row["not_applicable"],
    row["status"],
    row["reason"],
    row["evidence"]
  ].compact.join(" ")

  normalized = raw.downcase
  return nil if normalized.empty?
  return "not_applicable" if normalized.match?(/not\s*applicable|n\/a|不适用/)
  return "generated_or_vendor" if normalized.match?(/generated|vendor|node_modules/)
  return "native_shell" if normalized.match?(/native\s*shell|android|ios|pods/)
  return "abstract_or_base" if normalized.match?(/abstract|base/)
  return "annotation_or_marker" if normalized.match?(/annotation|marker/)
  return "framework_bridge" if normalized.match?(/framework\s*bridge|bootstrap|config/)
  return "technical_bridge" if normalized.match?(/technical\s*bridge|bridge/)
  return "business_entry" if normalized.match?(/business|archived|covered/)

  nil
end

def match_row_to_record(row, record)
  candidates = {
    "path" => [record.path],
    "code_anchor" => record.code_anchors,
    "method" => record.method_names,
    "function" => record.function_names,
    "route" => record.route_paths,
    "api_client" => record.api_client_names,
    "topic" => record.topics,
    "job" => record.job_names,
    "sql" => record.sql_names,
    "connector" => record.code_anchors,
    "sink" => record.code_anchors,
    "entry_name" => [record.symbol, record.class_name]
  }

  strengths = {
    "path" => 95,
    "code_anchor" => 90,
    "method" => 85,
    "function" => 85,
    "route" => 88,
    "api_client" => 84,
    "topic" => 84,
    "job" => 84,
    "sql" => 82,
    "connector" => 82,
    "sink" => 82,
    "entry_name" => 78
  }

  best = nil
  candidates.each do |field, tokens|
    value = row[field]
    next if value.to_s.empty?

    split_values(value).each do |candidate|
      next unless token_match?(candidate, tokens)

      strength = strengths[field]
      reason = "table #{field}=#{candidate}"
      best = [strength, reason, row] if best.nil? || strength > best.first
    end
  end

  best
end

def doc_match_for_record(doc_info, record)
  best = nil

  doc_info[:tables].each do |row|
    match = match_row_to_record(row, record)
    best = match if match && (best.nil? || match.first > best.first)
  end

  text = doc_info[:text]
  text_checks = [
    [record.path, 70, "text path"],
    [File.basename(record.path), 55, "text basename"],
    [record.symbol, 60, "text symbol"],
    [record.class_name, 60, "text class"],
    *record.route_paths.map { |route| [route, 64, "text route"] },
    *record.topics.map { |topic| [topic, 62, "text topic"] },
    *record.job_names.map { |job| [job, 62, "text job"] },
    *record.function_names.map { |function| [function, 58, "text function"] },
    *record.sql_names.map { |sql| [sql, 58, "text sql"] }
  ]

  text_checks.each do |token, strength, reason|
    next if token.to_s.empty?
    next unless text_contains?(text, token)

    best = [strength, "#{reason}=#{token}", nil] if best.nil? || strength > best.first
  end

  best
end

def requirement_scope_for(record, matched_docs, requirement_id, feature, scope_texts)
  return "repository_wide" if requirement_id.to_s.empty? && feature.to_s.empty?
  return "unmatched" if matched_docs.empty?

  tokens = [requirement_id, feature].compact.map(&:to_s).reject(&:empty?)
  return "repository_wide" if tokens.empty?

  anchors = record.code_anchors + [record.path, record.symbol]
  return "current_requirement" if matched_docs.any? { |path| tokens.any? { |token| path.include?(token) } }
  return "current_requirement" if scope_texts.any? { |text| anchors.any? { |anchor| text_contains?(text, anchor) } }

  matched_docs.any? ? "historical_repository_residue" : "unmatched"
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
    entry_records << build_record(
      kind: "entry",
      entry_type: name,
      evidence_mode: evidence_mode,
      path: path,
      source_roots: source_roots
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
    layer_records << build_record(
      kind: kind,
      entry_type: kind,
      evidence_mode: "#{kind}_chain",
      path: path,
      source_roots: source_roots
    )
  end
end

l4_docs = Dir[File.join(TARGET_ROOT, l4_pattern)].select { |path| File.file?(path) }.sort
doc_texts = l4_docs.to_h do |path|
  text = read_text(path)
  [path, { text: text, tables: parse_markdown_tables(text) }]
end

feature_tokens = [options[:feature], options[:requirement_id]].compact.map(&:to_s).reject(&:empty?)
scope_candidate_paths = []
feature_tokens.each do |token|
  scope_candidate_paths += [
    File.join(TARGET_ROOT, "specs", token, "route.md"),
    File.join(TARGET_ROOT, "specs", token, "spec.md"),
    File.join(TARGET_ROOT, token.to_s)
  ]
end
scope_texts = scope_candidate_paths.uniq.select { |path| File.file?(path) }.map { |path| read_text(path) }

(entry_records + layer_records).each do |record|
  doc_texts.each do |doc_path, doc_info|
    match = doc_match_for_record(doc_info, record)
    next unless match

    record.matched_docs << PathnameSafe.relative_path(doc_path, TARGET_ROOT)
    record.matched_l2 << l2_for(doc_path, business_domain_root)
    if match.first > record.match_strength.to_i
      record.match_strength = match.first
      record.match_reason = match[1]
    end

    table_classification = match[2] && row_classification(match[2])
    next unless table_classification

    record.classification = table_classification
    record.classification_reason = "table classification: #{table_classification}"
  end
  record.matched_docs.uniq!
  record.matched_l2.uniq!
  record.requirement_scope = requirement_scope_for(record, record.matched_docs, options[:requirement_id], options[:feature], scope_texts)
  record.match_reason = "no business-domain match" if record.match_reason.to_s.empty?
end

entry_text_cache = entry_records.to_h { |record| [record.path, code_text_for(record.path)] }
layer_records.each do |record|
  reverse_entries = entry_records.select do |entry|
    entry_text = entry_text_cache[entry.path].to_s
    text_contains?(entry_text, record.symbol) ||
      record.method_names.any? { |method| text_contains?(entry_text, method) } ||
      record.code_anchors.any? { |anchor| text_contains?(entry_text, anchor) && anchor != record.path }
  end

  record.reverse_coverage_status =
    if NON_BLOCKING_CLASSIFICATIONS.include?(record.classification)
      "non_blocking_technical_bridge"
    elsif reverse_entries.empty?
      "no_entry_reverse_coverage"
    elsif record.matched_l2.length > 1
      "multi_domain_warning"
    elsif record.matched_docs.empty?
      "entry_chain_only_unarchived"
    else
      "covered"
    end

  if record.match_reason == "no business-domain match" && !reverse_entries.empty?
    record.match_reason = "reverse entry chain: #{reverse_entries.map(&:symbol).uniq.join(', ')}"
    record.match_strength = [record.match_strength.to_i, 50].max
  end
end

entry_conflicts = entry_records.select { |record| record.matched_l2.length > 1 && !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
service_conflicts = layer_records.select { |record| record.matched_l2.length > 1 && !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
technical_entry_records = entry_records.select { |record| NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
technical_layer_records = layer_records.select { |record| NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
unarchived_entries = entry_records.select { |record| record.matched_docs.empty? && !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
unarchived_services = layer_records.select do |record|
  !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) &&
    (record.matched_docs.empty? || record.reverse_coverage_status == "no_entry_reverse_coverage")
end

business_domain_missing = !Dir.exist?(File.join(TARGET_ROOT, business_domain_root)) || l4_docs.empty?
status =
  if entry_records.empty?
    "PENDING"
  elsif business_domain_missing || !entry_conflicts.empty? || !service_conflicts.empty? || !unarchived_entries.empty?
    "BLOCKED"
  elsif !unarchived_services.empty?
    "BLOCKED"
  else
    "PASS"
  end

generated_at = Time.now.iso8601

reports = {}

reports[strict_outputs["entry_inventory"]] = [
  %w[entry_type evidence_mode symbol path module archived classification classification_reason match_strength match_reason matched_l2 matched_docs requirement_scope].join("\t"),
  *entry_records.map do |record|
    [
      record.entry_type,
      record.evidence_mode,
      record.symbol,
      record.path,
      record.module_name,
      record.matched_docs.empty? ? "false" : "true",
      record.classification,
      record.classification_reason,
      record.match_strength,
      record.match_reason,
      record.matched_l2.join(","),
      record.matched_docs.join(","),
      record.requirement_scope
    ].map { |value| tsv_escape(value) }.join("\t")
  end
].join("\n") + "\n"

reports[strict_outputs["service_inventory"]] = [
  %w[kind symbol path module archived classification classification_reason match_strength match_reason reverse_coverage_status matched_l2 matched_docs requirement_scope].join("\t"),
  *layer_records.map do |record|
    [
      record.kind,
      record.symbol,
      record.path,
      record.module_name,
      record.matched_docs.empty? ? "false" : "true",
      record.classification,
      record.classification_reason,
      record.match_strength,
      record.match_reason,
      record.reverse_coverage_status,
      record.matched_l2.join(","),
      record.matched_docs.join(","),
      record.requirement_scope
    ].map { |value| tsv_escape(value) }.join("\t")
  end
].join("\n") + "\n"

entry_type_counts = entry_records.group_by(&:entry_type).transform_values(&:length)
entry_type_archived = entry_records.group_by(&:entry_type).transform_values { |items| items.count { |record| !record.matched_docs.empty? } }
classification_counts = (entry_records + layer_records).group_by(&:classification).transform_values(&:length)

reports[strict_outputs["entry_chain_evidence"]] = <<~MARKDOWN
  # Entry Chain Evidence

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  ## Summary

  | Entry Type | Total | Archived | Unarchived |
  | --- | ---: | ---: | ---: |
  #{entry_type_counts.keys.sort.map { |type| "| #{type} | #{entry_type_counts[type]} | #{entry_type_archived[type] || 0} | #{entry_type_counts[type] - (entry_type_archived[type] || 0)} |" }.join("\n")}

  ## Classification Summary

  | Classification | Count |
  | --- | ---: |
  #{classification_counts.keys.compact.sort.map { |classification| "| #{classification} | #{classification_counts[classification]} |" }.join("\n")}

  ## Evidence Rows

  | Entry Type | Evidence Mode | Symbol | Path | Classification | Match Strength | Match Reason | Status | Matched Docs |
  | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
  #{entry_records.map { |record| "| #{record.entry_type} | #{record.evidence_mode} | `#{record.symbol}` | `#{record.path}` | #{record.classification} | #{record.match_strength} | #{record.match_reason} | #{record.matched_docs.empty? ? "UNARCHIVED" : "ARCHIVED"} | #{record.matched_docs.empty? ? "<none>" : record.matched_docs.join("<br>")} |" }.join("\n")}

  ## Technical Bridge / Non-Blocking Entries

  | Classification | Symbol | Path | Reason |
  | --- | --- | --- | --- |
  #{technical_entry_records.map { |record| "| #{record.classification} | `#{record.symbol}` | `#{record.path}` | #{record.classification_reason} |" }.join("\n")}
MARKDOWN

reports[strict_outputs["unarchived_entries"]] = <<~MARKDOWN
  # Unarchived Entries

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  Status: #{unarchived_entries.empty? ? "CLEAR" : "BLOCKING"}

  #{business_domain_missing ? "Business-domain L4 documents are missing or empty, so entry coverage is pending and blocking.\n" : ""}
  ## Blocking / Pending Business Entries

  | Entry Type | Symbol | Path | Evidence Mode | Classification | Match Reason |
  | --- | --- | --- | --- | --- | --- |
  #{unarchived_entries.map { |record| "| #{record.entry_type} | `#{record.symbol}` | `#{record.path}` | #{record.evidence_mode} | #{record.classification} | #{record.match_reason} |" }.join("\n")}

  ## Non-Blocking Technical Entries

  Technical bridge, framework bridge, generated/vendor, native shell, abstract/base, annotation/marker, and not-applicable entries remain visible here but do not by themselves block strict mode.

  | Classification | Symbol | Path | Reason |
  | --- | --- | --- | --- |
  #{technical_entry_records.select { |record| record.matched_docs.empty? }.map { |record| "| #{record.classification} | `#{record.symbol}` | `#{record.path}` | #{record.classification_reason} |" }.join("\n")}
MARKDOWN

reports[strict_outputs["unarchived_services"]] = <<~MARKDOWN
  # Unarchived Core Units

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  Status: #{unarchived_services.empty? ? "CLEAR" : "BLOCKING"}

  ## Blocking / Pending Core Units

  | Kind | Symbol | Path | Classification | Reverse Coverage | Match Reason |
  | --- | --- | --- | --- | --- | --- |
  #{unarchived_services.map { |record| "| #{record.kind} | `#{record.symbol}` | `#{record.path}` | #{record.classification} | #{record.reverse_coverage_status} | #{record.match_reason} |" }.join("\n")}

  ## Non-Blocking Technical Core Units

  | Kind | Classification | Symbol | Path | Reason |
  | --- | --- | --- | --- | --- |
  #{technical_layer_records.map { |record| "| #{record.kind} | #{record.classification} | `#{record.symbol}` | `#{record.path}` | #{record.classification_reason} |" }.join("\n")}
MARKDOWN

reports[strict_outputs["cross_domain_conflicts"]] = <<~MARKDOWN
  # Cross Domain Conflicts

  > Generated by `scripts/audit-entry-coverage.rb` at #{generated_at}

  Status: #{(entry_conflicts + service_conflicts).empty? ? "CLEAR" : "BLOCKING"}

  | Kind | Entry Type | Symbol | Path | Matched L2 Domains | Match Reason | Matched Docs |
  | --- | --- | --- | --- | --- | --- | --- |
  #{(entry_conflicts + service_conflicts).map { |record| "| #{record.kind} | #{record.entry_type} | `#{record.symbol}` | `#{record.path}` | #{record.matched_l2.join(", ")} | #{record.match_reason} | #{record.matched_docs.join("<br>")} |" }.join("\n")}
MARKDOWN

blocking_reasons = []
blocking_reasons << "business_domain L4 documents missing or empty" if business_domain_missing
blocking_reasons << "#{unarchived_entries.length} entries have no L4 match" unless unarchived_entries.empty?
blocking_reasons << "#{unarchived_services.length} core units have no business-domain match" unless unarchived_services.empty?
blocking_reasons << "#{entry_conflicts.length} entries map to multiple L2 domains" unless entry_conflicts.empty?
blocking_reasons << "#{service_conflicts.length} core units map to multiple L2 domains" unless service_conflicts.empty?
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
  | Business Entries | #{entry_records.count { |record| record.classification == "business_entry" }} |
  | Technical Bridges | #{(entry_records + layer_records).count { |record| NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }} |
  | Core Units | #{layer_records.length} |
  | Unarchived Entries | #{unarchived_entries.length} |
  | Unarchived Core Units | #{unarchived_services.length} |
  | Cross-Domain Conflicts | #{entry_conflicts.length + service_conflicts.length} |
  | Requirement ID | #{options[:requirement_id] || "<not scoped>"} |
  | Feature | #{options[:feature] || "<not scoped>"} |
  | Manifest | #{options[:manifest] || "<not provided>"} |

  ## Precision Semantics

  - Markdown table parsing: enabled for Entry Type, Entry Name, Code Anchor, Path, Method, Function, Route, API client, Topic, Job, SQL, Connector, Sink, L4, Status, Evidence, Technical Bridge, and Not Applicable columns.
  - Match strength: table path/code anchor/method/route/topic/job/function/SQL evidence is stronger than plain text contains.
  - Technical bridge handling: technical_bridge, framework_bridge, generated_or_vendor, native_shell, abstract_or_base, annotation_or_marker, and not_applicable remain visible in inventory but do not by themselves block strict mode.
  - Reverse coverage: Service / Manager / Mapper core units are checked against L4 evidence and entry-to-core code references.
  - ETL coverage: job/function/connector/sink/SQL names participate in evidence matching.
  - Frontend coverage: route/page/component/store/API/popup/native shell distinctions participate in evidence matching and classification.

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
