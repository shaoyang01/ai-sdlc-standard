#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "find"
require "optparse"
require "set"
require "time"
require "yaml"

DEFAULT_REPORT_DIR = ".sdlc/reports/entry_coverage"
DEFAULT_PROFILE_PATH = ".sdlc/entry-coverage-profile.yaml"
DEFAULT_BUSINESS_DOMAIN_ROOT = ".sdlc/business_domain"
DEFAULT_L4_PATTERN = ".sdlc/business_domain/**/[0-9][0-9][0-9][0-9][0-9][0-9]*.md"

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
  :reverse_evidence_chain,
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
  data_type
  page_fragment
]).freeze

# R13-B3 / R1-P1-5: shared/template JSP-HTML fragments are page fragments, NOT
# standalone business pages (kept in the inventory with an explanation).
#
# A directory named `common`/`include` is WEAK evidence only: a fragment named
# by a pure structural role (header/footer/taglib/tag/inc/fragment) is a page
# fragment unconditionally, but a file under `common/` must additionally look
# like a fragment (no business form / route / data-action structure) — otherwise
# it stays a business entry so a real business page can never be hidden by its
# directory name (R1-P1-5).
PAGE_FRAGMENT_ROLE_PATTERN = %r{/(?:header|footer|taglib[s]?|tag|inc|fragment[s]?)(?:/|[^/]*\.(?:jsp|html|ftl|vm)\z)}i
WEAK_FRAGMENT_DIR_PATTERN = %r{/common(?:/|[^/]*\.(?:jsp|html|ftl|vm)\z)}i
# Structural markers of a REAL business page (form bound to a business action,
# a business route reference, or a data-action/data-page hook).
#
# R2 boundary note (RC-5): the trigger direction is deliberately safe. A
# navigation page that carries a business route literal (e.g. `nav.jsp` under
# `common/`) is reported as a business entry even though a human would call it
# chrome. Trusting the role name instead could hide a real business page behind
# its directory name — the very failure R1-P1-5 exists to prevent — so the audit
# reports the page and leaves the reading to the reviewer rather than widening
# the fragment rule.
BUSINESS_PAGE_MARKERS = %r{(?:<form\b[^>]*action=|<[^>]+(?:data-action|data-page|data-module)=|["'`]/(?:\w+/)+\w+["'`]|\bcontroller\b)}i

def content_based_classification(text, path)
  lowered_path = path.downcase
  return nil if text.nil? || text.empty?

  return ["data_type", "java enum declaration"] if text.match?(/\bpublic\s+(?:strictfp\s+)?enum\s+[A-Z]/)
  return ["data_type", "DTO/VO/entity declaration"] if File.basename(path).match?(/(?:DTO|VO|Entity|Bean)\.(?:java|kt)\z/i) ||
                                                      text.match?(/\b(?:public\s+)?(?:final\s+)?class\s+\w+(?:DTO|VO)\b/)
  if path.match?(/\.(?:jsp|html|ftl|vm)\z/i)
    return ["page_fragment", "shared/template web fragment (structural role name)"] if PAGE_FRAGMENT_ROLE_PATTERN.match?(lowered_path)
    # WEAK signal: a `common/` directory alone is not enough.
    if WEAK_FRAGMENT_DIR_PATTERN.match?(lowered_path)
      return ["page_fragment", "shared web fragment (common/ dir, no business-page structure)"] unless text.match?(BUSINESS_PAGE_MARKERS)
      return ["business_entry", "common/ dir but carries business-page structure (form/route/data-action) — not a fragment"]
    end
  end
  nil
end

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

# Identifier evidence must match on an IDENTIFIER BOUNDARY, never by substring.
# Substring matching made `DeliveryBatchServiceImpl` count as evidence for the
# INDEPENDENT record `BatchServiceImpl` (and `SkuSaleRelationServiceImpl` for
# `SkuSaleRelationService`): the shorter record could be archived — or turned
# into a cross-domain conflict — by a document that never mentions it. Paths
# stay substring-matched (they are long, unique and quoted verbatim by docs).
def identifier_in_text?(text, token)
  token = strip_markdown(token)
  return false if token.empty?

  text.match?(/(?<![A-Za-z0-9_])#{Regexp.escape(token)}(?![A-Za-z0-9_])/i)
end

def basename_without_ext(path)
  File.basename(path).sub(/\.[^.]+\z/, "")
end

# R13-B1 fix: shared matching discipline for doc-vs-record evidence.
# - word-boundary matching (normalized_token is downcased): plain substring
#   containment in either direction (the old token_match?) let the keyword
#   "if" match TaskLifecycleManagerImpl and any symbol containing "noAuth"
#   match a noAuth fragment);
# - control-keyword / reserved-word tokens are never strong evidence on
#   either side;
# - short tokens (< 4 chars after normalisation) only match as whole words,
#   never as substrings.
JAVA_KEYWORDS = %w[
  if else for while switch case break continue return new super this
  try catch finally throw throws static final public private protected
  abstract class interface enum extends implements import package void
  int long short byte char boolean float double null true false
  do default instanceof assert synchronized volatile transient native
  strictfp goto const var let function def const
].freeze

def control_keyword?(token)
  JAVA_KEYWORDS.include?(token)
end

def word_boundary_include?(candidate, token)
  candidate.match?(/(?<![a-z0-9_])#{Regexp.escape(token)}(?![a-z0-9_])/)
end

def token_match?(candidate, tokens)
  candidate = normalized_token(candidate)
  return false if candidate.empty?

  tokens.any? do |token|
    token = normalized_token(token)
    next false if token.empty?

    # control keywords are never strong evidence in either direction
    return false if control_keyword?(candidate) || control_keyword?(token)

    next true if candidate == token
    # short tokens (<4 chars): whole-word match only
    next word_boundary_include?(candidate, token) if token.length < 4

    candidate.include?(token) || word_boundary_include?(candidate, token)
  end
end

# Same discipline as the text channel (identifier_in_text?): an identifier cell
# is evidence only when it names the identifier, never when it merely contains
# it. A `Code Anchor` cell reading `DeliveryOrderServiceImpl` must not archive
# the independent record `OrderServiceImpl` — the table channel carried the same
# substring defect the text channel was fixed for, and it is live wherever a
# document header aliases to a candidate field (e.g. the bilingual
# `代码锚点（Code Anchor）`).
def identifier_token_match?(candidate, tokens)
  candidate = normalized_token(candidate)
  return false if candidate.empty?

  tokens.any? do |token|
    token = normalized_token(token)
    next false if token.empty?
    next false if control_keyword?(candidate) || control_keyword?(token)
    next true if candidate == token

    word_boundary_include?(candidate, token)
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
  # R13-B1 fix: the Java declaration regex captured control-flow keywords
  # (`if (...) {`) and annotation-parameter variables as method names. Guard:
  # a captured name must not be a Java keyword and must not be immediately
  # followed by content suggesting a control-flow statement.
  java_methods = text.scan(
    /(?:public|protected|private|static|\s)+[\w<>\[\],\s?]+\s+([a-zA-Z_]\w*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/
  ).flatten
  names += java_methods.reject { |n| JAVA_KEYWORDS.include?(n) }
  names += text.scan(/(?:function|def)\s+([a-zA-Z_]\w*)\s*\(/).flatten
  names += text.scan(/(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*(?:async\s*)?\(/).flatten
  names += text.scan(/export\s+(?:async\s+)?function\s+([a-zA-Z_]\w*)\s*\(/).flatten
  names += text.scan(/<select[^>]+id=["']([^"']+)["']/i).flatten if path.end_with?(".xml")
  names.uniq
end

# R1-P1-4: typed, owner-contextual reference extraction. A bare method name is
# NEVER evidence on its own — an edge exists only when the referencing file
# names the target TYPE (field/param/local declaration, `new X(`, `extends
# X`, or an import of X). This is what makes
# Controller -> Service -> Manager -> Mapper traversal possible without a
# compiler: each hop is a declared type reference from an OWNER context.
def extract_type_references(text)
  refs = []
  # field / parameter / local declaration: `Foo bar =` / `Foo bar;` / `Foo bar,`
  refs += text.scan(/(?:^|[;{}(,\s])([A-Z][A-Za-z0-9_]*)\s+[a-z][A-Za-z0-9_]*\s*(?:[=;,)]|\s*$)/).flatten
  # instantiation and inheritance
  refs += text.scan(/\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\(/).flatten
  refs += text.scan(/\b(?:extends|implements)\s+([A-Z][A-Za-z0-9_]*)/).flatten
  # import of a concrete type (last path segment)
  refs += text.scan(/^\s*import\s+[\w.]*\.([A-Z][A-Za-z0-9_]*)\s*;/).flatten
  refs.uniq
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
  # 泛化 token 弱证据过滤（NEXT-ROUND-BRIEF §2-1，R3-#176 §6 根因坐实）：mapper
  # XML 的 from/join/into/update/table 扫描会提出通用列名与碎片 token（真实样本
  # 实测 `id`×137、`u_t`×9、`updater`×9、`is_deleted`、`u_u`、`schedule_task_`），
  # 经 text sql 通道以独立词命中几乎所有文档，制造跨域幻影边（R3 量化：冲突边
  # 87.5% 由该族驱动）。SQL 名证据 = 非通用列名 + 非下划线碎片 + （含 `_` 且
  # 长度 ≥5，或长度 ≥8 的实词）；`t_m_sku`、`u_t_order` 一类真实表名全部保留。
  # 记录自身文件名（basename）不受此过滤——它属于记录本体，不是从文本提出的。
  scan_results = text.scan(/\b(?:from|join|into|update|table)\s+([a-zA-Z_][\w.]+)/i).flatten
  names += scan_results.reject { |token| generic_sql_evidence?(token) }
  names.uniq
end

SQL_GENERIC_COLUMN_NAMES = %w[
  id updater is_deleted created_by updated_by created_at updated_at
  create_time update_time del_flag status state type name code level
  version remark value
].freeze

def generic_sql_evidence?(token)
  lowered = token.downcase
  return true if SQL_GENERIC_COLUMN_NAMES.include?(lowered)
  return true if lowered.start_with?("_") || lowered.end_with?("_")

  lowered.include?("_") ? lowered.length < 5 : lowered.length < 8
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
  # R1-P1-4: method-level evidence is only trustworthy when the row ALSO names
  # the owning class/entry (owner context); a bare `Method=save` row matches
  # every class that happens to define save().
  owner_named_in_row = begin
    row_values = row.values.map { |v| v.to_s }.join(" ")
    [record.symbol, record.class_name].compact.any? do |owner|
      next false if owner.to_s.empty?
      row_values.match?(/(?<![A-Za-z0-9_])#{Regexp.escape(owner)}(?![A-Za-z0-9_])/)
    end
  end

  impl_alias = IMPL_ALIAS_FOR[record.path]
  candidates = {
    "path" => [record.path],
    "code_anchor" => record.code_anchors,
    "method" => owner_named_in_row ? record.method_names : [],
    "function" => owner_named_in_row ? record.function_names : [],
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
      # Path cells stay lenient (a cell may carry a line range, e.g.
      # `X.java:94-186`); every other field is an identifier list and must
      # respect identifier boundaries.
      matched = field == "path" ? token_match?(candidate, tokens) : identifier_token_match?(candidate, tokens)
      next unless matched

      strength = strengths[field]
      reason = "table #{field}=#{candidate}"
      best = [strength, reason, row] if best.nil? || strength > best.first
    end
  end

  # 显式实现别名（表半，R2-H1 接线）：row keys only ever come from
  # TABLE_COLUMN_ALIASES, so a synthetic "impl_alias" column can never exist —
  # the alias is tested against the SAME name-level cells (entry_name /
  # code_anchor) instead, at the weakest signal (below every direct field).
  # The row IS carried: under this caliber a row naming the twin documents the
  # same logical unit, so its classification statement applies exactly as it
  # would for a direct naming.
  if impl_alias
    { "entry_name" => 76, "code_anchor" => 75 }.each do |field, strength|
      value = row[field]
      next if value.to_s.empty?

      split_values(value).each do |candidate|
        next unless identifier_token_match?(candidate, [impl_alias])

        best = [strength, "table impl_alias=#{candidate}", row] if best.nil? || strength > best.first
      end
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
  # 泛化方法名 owner 门（NEXT-ROUND-BRIEF §2-2，与表通道 R1-P1-4 同纪律）：
  # process/handle/execute 一类泛化方法名只有在该文档同时点名 owner（符号或类
  # 名）时才是本记录的证据——否则一个 `process` 独立词会命中所有调度类类别的
  # 每个文档，制造 text function 幻影边（R3-#176 量化 60 边）。
  owner_named_in_text = [record.symbol, record.class_name].compact.any? do |owner|
    !owner.to_s.empty? && identifier_in_text?(text, owner)
  end
  text_checks = [
    [record.path, 70, "text path"],
    [File.basename(record.path), 55, "text basename"],
    [record.symbol, 60, "text symbol"],
    [record.class_name, 60, "text class"],
    # 显式实现别名（weakest text signal, below direct symbol/class naming）:
    # naming the unique convention twin covers this record — boundary-checked
    # like every identifier, so `TwoCacheServiceImpl` never aliases
    # `CacheServiceImpl`.
    *([IMPL_ALIAS_FOR[record.path]].compact.map { |twin| [twin, 56, "text impl alias"] }),
    *record.route_paths.map { |route| [route, 64, "text route"] },
    *record.topics.map { |topic| [topic, 62, "text topic"] },
    *record.job_names.map { |job| [job, 62, "text job"] },
    *(owner_named_in_text ? record.function_names.map { |function| [function, 58, "text function"] } : []),
    *record.sql_names.map { |sql| [sql, 58, "text sql"] }
  ]

  text_checks.each do |token, strength, reason|
    next if token.to_s.empty?
    # Paths are matched verbatim; every other token is an identifier and must
    # respect identifier boundaries (see identifier_in_text?).
    matched = reason == "text path" ? text_contains?(text, token) : identifier_in_text?(text, token)
    next unless matched

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

# 显式实现别名口径（R3 §7 建议 (b)，Current User 2026-09-19 授权落地）：
# a document naming the convention twin `XImpl` covers the logical unit `X`
# (and vice versa) under the SAME identifier-boundary discipline as direct
# naming. The alias is live only when the twin symbol exists in the scan
# EXACTLY once — a duplicated `XImpl` simple name across packages (or no twin
# at all) keeps every record independently named (this audit never fabricates
# ownership, same principle as the chain-graph ambiguity rule above). Alias
# evidence is name-level only: the twin's sql/route/method anchors never leak
# through it (see doc_match_for_record / match_row_to_record).
scanned_records = entry_records + layer_records
# Uniqueness counts DISTINCT PATHS per symbol, not records: a self-entry file
# (Dubbo-exposed *ServiceImpl) is scanned once as an entry and once as a layer
# unit — two records, ONE logical unit. The alias is 1:1 only: BOTH the record's
# own symbol and its twin must resolve to exactly one path — a duplicated base
# simple name (two `SkuService` classes) must not let one `SkuServiceImpl`
# citation "cover" both interfaces.
symbol_paths = Hash.new { |h, k| h[k] = Set.new }
scanned_records.each { |record| symbol_paths[record.symbol] << record.path }
impl_alias_for_symbol = lambda do |symbol|
  twin = symbol.end_with?("Impl") ? symbol.sub(/Impl\z/, "") : "#{symbol}Impl"
  return nil if twin.empty?
  return nil if symbol_paths[symbol].size != 1 || symbol_paths[twin].size != 1

  twin
end
IMPL_ALIAS_FOR = scanned_records.to_h { |record| [record.path, impl_alias_for_symbol.call(record.symbol)] }.freeze

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

# R13-B3: content-aware subclassification pass — enum/DTO/VO declarations and
# shared page fragments are data types / page fragments, not business units,
# regardless of their directory (e.g. an enum under a manager/ directory).
(entry_records + layer_records).each do |record|
  text = entry_text_cache[record.path] || code_text_for(record.path)
  subclass = content_based_classification(text, record.path)
  next unless subclass

  record.classification = subclass.first
  record.classification_reason = "content: #{subclass.last}"
end
# R1-P1-4: typed reference graph over the scanned files.
#   - nodes: core units (Service/Manager/Mapper/... layers) plus entries;
#   - edges: a declared TYPE reference from the owner file to the target class
#     (extract_type_references), never a bare string / method-name match;
#   - ambiguous simple names (same class name in several packages) yield an
#     UNCERTAIN edge rather than a guessed one.
core_by_symbol = Hash.new { |h, k| h[k] = [] }
layer_records.each { |r| core_by_symbol[r.symbol] << r }
# Ambiguity (R1-P1-4): the SAME simple name scanned as more than one core
# record. An interface/impl pair (Foo + FooImpl) is ONE logical unit — the
# normal Spring pattern — and is deliberately NOT ambiguous.
ambiguous_symbols = core_by_symbol.select { |_sym, rs| rs.length > 1 }.keys.to_set

all_text_cache = {}
(entry_records + layer_records).each { |r| all_text_cache[r.path] = (entry_text_cache[r.path] || code_text_for(r.path)).to_s }

type_refs = {}
all_text_cache.each { |path, text| type_refs[path] = extract_type_references(text) }

# R1-P1-4: interface/implementation bridging. Real Spring code references the
# INTERFACE (`OrderService`) while the scanned core unit is the impl
# (`OrderServiceImpl`) — or vice versa. Both directions are one logical unit
# (the same convention DEFAULT_LAYER_PATTERNS already encodes), so a type
# reference resolves through the `X` <-> `XImpl` alias pair.
#
# R2 boundary note (RC-4): this covers the `X` <-> `XImpl` convention only. An
# interface with SEVERAL implementations — or one whose impls do not follow the
# naming convention — is deliberately NOT bridged further: a reference to `X`
# does not prove which implementation the entry calls, and this audit never
# fabricates a call edge (same principle as the ambiguity rule below). Such core
# units stay unresolved, hence visible, instead of being counted as covered.
symbol_aliases = lambda do |name|
  base = name.sub(/Impl\z/, "")
  [name, "#{base}Impl", base].uniq
end

# direct typed edges: owner path -> referenced core symbols (excluding self)
out_edges_for = lambda do |record|
  own = record.symbol
  names = type_refs[record.path].to_a - [own]
  targets = names.flat_map { |n| symbol_aliases.call(n) }.uniq - [own]
  owners = targets.select { |n| core_by_symbol.key?(n) }
  owners.flat_map { |n| core_by_symbol[n].map { |r| [n, r] } }
end

# traversal from each entry through core units (BFS, depth-limited)
MAX_CHAIN_DEPTH = 6
reverse_evidence = Hash.new { |h, k| h[k] = [] }   # core path -> [evidence strings]
entry_records.each do |entry|
  visited = {}
  queue = [[entry, 0, nil]]
  until queue.empty?
    current, depth, _ = queue.shift
    break if depth >= MAX_CHAIN_DEPTH

    out_edges_for.call(current).each do |name, target|
      next if target.path == entry.path
      next if visited[target.path]

      visited[target.path] = "#{current.symbol}"
      hop = depth.zero? ? "#{entry.symbol} -> #{name}" : "#{entry.symbol} -> ... -> #{current.symbol} -> #{name}"
      if ambiguous_symbols.include?(name)
        reverse_evidence[target.path] << "AMBIGUOUS(#{name} appears in #{core_by_symbol[name].length} classes): #{hop}"
      else
        reverse_evidence[target.path] << hop
      end
      queue << [target, depth + 1, name]
    end
  end
end

# A core unit reachable ONLY through an ambiguous name gets no trustworthy
# evidence — unresolved, never "covered".
resolve_reverse = lambda do |record|
  ev = reverse_evidence[record.path].uniq
  clean = ev.reject { |e| e.start_with?("AMBIGUOUS(") }
  ambiguous = ev.select { |e| e.start_with?("AMBIGUOUS(") }
  if clean.any?
    ["covered", clean.first(3)]
  elsif ambiguous.any?
    ["unresolved_ambiguous_reference", ambiguous.first(2)]
  else
    ["no_entry_reverse_coverage", []]
  end
end

# Classes that are entries AND layer units (Dubbo-exposed *Service /
# *RPCServiceImpl): they are accounted for once, as entries — see the
# self_entry_coverage branch below.
self_entry_paths = entry_records.map(&:path).to_set

layer_records.each do |record|
  # R13-B2 + R1-P1-4: typed owner-context edges replace the one-hop string
  # search; method names are no longer standalone evidence.
  reverse_status, reverse_chain = resolve_reverse.call(record)
  reverse_entries = reverse_status == "covered" ? [true] : []
  record.reverse_coverage_status =
    if self_entry_paths.include?(record.path)
      # A class can be BOTH an entry (Dubbo-exposed *Service / *RPCServiceImpl via
      # the entry patterns) and a layer unit (the *Service.java / *ServiceImpl.java
      # layer patterns). An entry is a reference ROOT: demanding an inbound chain
      # from another entry kept such classes permanently "unarchived" as core
      # units. They are accounted for once, as entries.
      "self_entry_coverage"
    elsif NON_BLOCKING_CLASSIFICATIONS.include?(record.classification)
      "non_blocking_technical_bridge"
    elsif reverse_entries.empty?
      reverse_status == "unresolved_ambiguous_reference" ? "unresolved_ambiguous_reference" : "no_entry_reverse_coverage"
    elsif record.matched_l2.length > 1
      "multi_domain_warning"
    elsif record.matched_docs.empty?
      "entry_chain_only_unarchived"
    else
      "covered"
    end

  record.reverse_evidence_chain = reverse_chain

  if record.match_reason == "no business-domain match" && !reverse_entries.empty?
    record.match_reason = "reverse entry chain: #{reverse_chain.join(' | ')}"
    record.match_strength = [record.match_strength.to_i, 50].max
  end
end

# R13-B2: distinguish the failure reasons inside unarchived_services —
#   missing_documentation  = no doc match at all
#   unresolved_call_chain  = doc-matched but no reverse entry chain found
#   uncertain              = no docs AND no reverse chain (cannot be proven)
# Uncertain/missing/unresolved all stay on the BLOCKED side (never silently
# promoted to PASS).
missing_documentation_services = layer_records.select do |record|
  !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) &&
    record.reverse_coverage_status != "self_entry_coverage" &&
    record.matched_docs.empty? && record.reverse_coverage_status != "no_entry_reverse_coverage"
end
unresolved_chain_services = layer_records.select do |record|
  !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) &&
    record.reverse_coverage_status != "self_entry_coverage" &&
    record.matched_docs.any? && record.reverse_coverage_status == "no_entry_reverse_coverage"
end
uncertain_services = layer_records.select do |record|
  !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) &&
    record.reverse_coverage_status != "self_entry_coverage" &&
    record.matched_docs.empty? && record.reverse_coverage_status == "no_entry_reverse_coverage"
end

# 显式实现别名 ⑤：X 与 XImpl 是同一逻辑单元——当孪生两侧都横跨多个 L2 域时，
# 这是同一条冲突（同一组文档），按接口名报告一次；Impl 侧行会重复同一事实。
# 去重的前提是接口侧自身具备冲突报告资格（多域且非非阻塞分类，entry/service
# 任一列表可选中）：接口侧是非阻塞分类（data_type/page_fragment 等）时该列表
# 不会报告它，此时去重会把别名口径制造出来的跨域信号静默吞成零行（R2-H2）——
# 保留 Impl 行。
layer_scan = entry_records + layer_records
impl_conflict_dedup = lambda do |record|
  next false unless record.symbol.end_with?("Impl")

  base = record.symbol.sub(/Impl\z/, "")
  next false if base.empty?

  twins = layer_scan.select { |r| r.symbol == base }
  twin_paths = twins.map(&:path).uniq
  next false unless twin_paths.length == 1

  base_record = layer_scan.find { |r| r.path == twin_paths.first }
  base_record.matched_l2.length > 1 &&
    !NON_BLOCKING_CLASSIFICATIONS.include?(base_record.classification)
end
entry_conflicts = entry_records.select { |record| record.matched_l2.length > 1 && !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) && !impl_conflict_dedup.call(record) }
# Self-entry layer records are already covered by entry_conflicts — counting
# them again here would double-report the same class.
service_conflicts = layer_records.select { |record| record.matched_l2.length > 1 && record.reverse_coverage_status != "self_entry_coverage" && !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) && !impl_conflict_dedup.call(record) }
technical_entry_records = entry_records.select { |record| NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
technical_layer_records = layer_records.select { |record| NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
unarchived_entries = entry_records.select { |record| record.matched_docs.empty? && !NON_BLOCKING_CLASSIFICATIONS.include?(record.classification) }
unarchived_services = (missing_documentation_services + unresolved_chain_services + uncertain_services).uniq

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

  ## Reason Breakdown

  | Reason | Count |
  | --- | --- |
  | missing documentation | #{missing_documentation_services.length} |
  | unresolved call chain (doc-matched) | #{unresolved_chain_services.length} |
  | uncertain (no docs, no chain) | #{uncertain_services.length} |
  | (orthogonal) unresolved (ambiguous same-name reference) | #{layer_records.count { |r| r.reverse_coverage_status == "unresolved_ambiguous_reference" }} |

  > 前三个桶互斥且求和等于本表上方 Unarchived Core Units 数（#{(missing_documentation_services + unresolved_chain_services + uncertain_services).uniq.length}）；第四行 `unresolved (ambiguous same-name reference)` 是**正交状态计数**（同名类出现在多个包中），可能与本表其它行重叠计数，不参与求和。
  > 判定依据：`Evidence Chain` 列显示从入口到该核心单元的类型化引用路径（Controller -> Service -> Manager -> Mapper，逐跳均为声明类型引用）。`unresolved_ambiguous_reference` 表示同名类出现在多个包中，按「不伪造调用关系」保留为未解析，不计入 covered。
  > 文档侧口径（显式实现别名）：文档按标识符边界点名唯一孪生 `XImpl` 即视为 `X` 已覆盖，反之亦然；孪生简单名在扫描结果中不唯一（多包同名）或无孪生时别名关闭，逐记录点名。命中别名的记录 `Match Reason` 显示 `table impl_alias=…`（表格名字级单元格）或 `text impl alias=…`（正文），两通道同谓词；表格别名行的分类声明与直接点名同样生效。
  > 弱证据口径（泛化 token 轮）：mapper XML 的 SQL 名证据过滤通用列名与碎片（`id`/`updater`/`is_deleted`/`u_t`/尾随 `_` 碎片等不作为证据；`t_m_sku`、`u_t_order` 一类真实表名保留）；正文方法名（`process`/`execute`/`handle` 族）仅在该文档同时点名 owner（符号或类名）时作为证据。

  ## Blocking / Pending Core Units

  | Kind | Symbol | Path | Classification | Reverse Coverage | Evidence Chain (判定依据) | Match Reason |
  | --- | --- | --- | --- | --- | --- | --- |
  #{unarchived_services.map { |record| "| #{record.kind} | `#{record.symbol}` | `#{record.path}` | #{record.classification} | #{record.reverse_coverage_status} | #{(record.reverse_evidence_chain || []).join(' <br> ')} | #{record.match_reason} |" }.join("\n")}

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
  - Reason breakdown: unarchived services are split into missing documentation /
    unresolved call chain / uncertain (see table above) — an uncertain item is
    never silently promoted to PASS.
  - Next steps: rerun after docs via sdlc-knowledge-sync; route confirmation is
    an Owner action on the domain map; entry audit = THIS script (strict).
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
