#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "find"
require "optparse"
require "set"
require "date"
require "time"
require "yaml"

SCRIPT_NAME = "scripts/bootstrap-entry-coverage-profile.sh"
DEFAULT_PROFILE_PATH = ".specify/entry-coverage-profile.yaml"
DEFAULT_CANDIDATE_PROFILE_PATH = ".specify/entry-coverage-profile.candidate.yaml"
DEFAULT_REPORT_PATH = ".specify/reports/entry_coverage_profile_bootstrap_report.md"
STANDARD_PACKAGE = File.expand_path("..", __dir__)

FORBIDDEN_WRITE_PATHS = [
  ".specify/business_domain/**",
  "specs/**",
  "library/**",
  ".specify/memory/**",
  ".specify/workflow/**",
  ".specify/coding_guide/**"
].freeze

LEGACY_RUNTIME_INPUTS = [
  ".specify/memory/**",
  ".specify/workflow/**",
  ".specify/coding_guide/**"
].freeze

EXCLUDE_FILE_PATTERNS = [
  "**/target/**",
  "**/build/**",
  "**/dist/**",
  "**/.git/**",
  ".specify/**",
  "**/.specify/**",
  "**/node_modules/**",
  "**/.venv/**",
  "**/venv/**",
  "**/vendor/**",
  "out/**",
  "**/coverage/**",
  "**/generated/**",
  "**/.idea/**",
  "**/.gradle/**",
  "**/.mvn/**",
  "**/ios/Pods/**",
  "**/Pods/**"
].freeze

VALID_PROFILES = %w[
  backend-business-service
  admin-mixed-workflow
  frontend-application
  data-pipeline-etl
  library-shared-component
].freeze

PROFILE_PRECEDENCE = %w[
  project-governance-profile
  user-argument
  code-heuristic
  conservative-candidate
].freeze

EntryType = Struct.new(:name, :description, :patterns, :class_patterns, :evidence_mode, :exclude_when, keyword_init: true)

options = {
  dry_run: false,
  force: false,
  project_type_profiles: []
}

parser = OptionParser.new do |opts|
  opts.banner = "Usage: #{SCRIPT_NAME} <target-project-path> [options]"
  opts.on("--project-type-profile PROFILE", "Add project type profile. Repeatable.") do |value|
    options[:project_type_profiles] << value
  end
  opts.on("--force-entry-coverage-profile", "Overwrite .specify/entry-coverage-profile.yaml when it exists.") do
    options[:force] = true
  end
  opts.on("--dry-run", "Print generated profile and report without writing files.") { options[:dry_run] = true }
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
  expanded = File.expand_path(path)
  root = "#{TARGET_ROOT}/"
  expanded.start_with?(root) ? expanded.delete_prefix(root) : expanded
end

def normalize_rel(path)
  path.to_s.sub(%r{\A\./}, "")
end

def excluded?(relative_path)
  normalized = normalize_rel(relative_path)
  EXCLUDE_FILE_PATTERNS.any? do |pattern|
    File.fnmatch?(pattern, normalized, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
      File.fnmatch?(pattern, normalized, File::FNM_EXTGLOB)
  end
end

def project_files
  files = []
  Find.find(TARGET_ROOT) do |path|
    rel = relative(path)
    if File.directory?(path)
      if rel != "." && excluded?(rel)
        Find.prune
      else
        next
      end
    end

    next unless File.file?(path)
    next if excluded?(rel)

    files << rel
  end
  files.sort
end

def source_roots(files)
  roots = Set.new

  files.each do |rel|
    parts = rel.split("/")
    if (idx = parts.each_cons(3).find_index { |a, b, c| a == "src" && b == "main" && c == "java" })
      roots << parts.first(idx + 3).join("/")
    end

    %w[src app lib packages].each do |root|
      roots << root if rel.start_with?("#{root}/")
    end
  end

  roots << "." if roots.empty?
  roots.to_a.sort
end

def detect_profile_from_governance
  path = File.join(TARGET_ROOT, ".specify/project-governance-profile.yaml")
  return [] unless File.file?(path)

  yaml = YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: true) || {}
  candidates = []
  candidates.concat(Array(yaml.dig("project", "project_type_profiles")))
  candidates.concat(Array(yaml.dig("speckit_semantic_profile", "selected_profiles")))
  candidates.map(&:to_s).select { |item| VALID_PROFILES.include?(item) }.uniq
rescue Psych::SyntaxError
  []
end

def detect_profiles_from_code(files)
  has_frontend = files.any? do |rel|
    rel == "package.json" ||
      rel.match?(%r{\Asrc/(pages|views|screens|components|component|navigation|router|routers|routes|store|stores|models|actions|api|services)/}) ||
      rel.match?(%r{/src/(pages|views|screens|components|component|navigation|router|routers|routes|store|stores|models|actions|api|services)/}) ||
      rel.match?(%r{src/main/webapp/}) ||
      rel.end_with?(".jsp", ".ftl", ".vm")
  end

  has_data_pipeline = files.any? do |rel|
    rel.include?("finance-spark-service/") ||
      rel.include?("finance-flink-service/") ||
      rel.match?(%r{src/main/java/.*/etl/job/}) ||
      rel.match?(%r{src/main/java/.*/func/process/}) ||
      rel.match?(%r{src/main/java/.*/connectors/}) ||
      rel.match?(/(?:Job|Etl|ETL|ProcessFunction|DeserializationSchema|Sink|Publisher)\.java\z/)
  end

  has_java = files.any? { |rel| rel.end_with?(".java") || rel == "pom.xml" }
  has_admin = has_java && (has_frontend || files.any? do |rel|
    rel.match?(%r{src/main/webapp/}) ||
      rel.match?(%r{/oas/}) ||
      rel.match?(%r{/console/}) ||
      rel.match?(/(?:Import|Export|DataConsole|Approval|Audit)\w*\.java\z/)
  end)
  has_library = files.any? { |rel| rel.end_with?("Api.java", "Client.java") || rel.match?(%r{\Asrc/.*/index\.(ts|js)\z}) }

  profiles = []
  profiles << "data-pipeline-etl" if has_data_pipeline
  profiles << "frontend-application" if has_frontend && !has_data_pipeline
  profiles << "admin-mixed-workflow" if has_admin && !has_data_pipeline
  profiles << "backend-business-service" if has_java && profiles.empty?
  profiles << "library-shared-component" if has_library && profiles.empty?
  profiles.uniq
end

def select_profiles(files, user_profiles)
  governance_profiles = detect_profile_from_governance
  return [governance_profiles, "project-governance-profile", false] unless governance_profiles.empty?

  valid_user_profiles = user_profiles.map(&:to_s).select { |item| VALID_PROFILES.include?(item) }.uniq
  return [valid_user_profiles, "user-argument", false] unless valid_user_profiles.empty?

  heuristic_profiles = detect_profiles_from_code(files)
  return [heuristic_profiles, "code-heuristic", false] unless heuristic_profiles.empty?

  [["backend-business-service"], "conservative-candidate", true]
end

def entry_type(name, description, patterns, class_patterns, evidence_mode, exclude_when = [])
  EntryType.new(
    name: name,
    description: description,
    patterns: patterns,
    class_patterns: class_patterns,
    evidence_mode: evidence_mode,
    exclude_when: exclude_when
  )
end

def entry_types_for(profiles)
  entries = []
  composite_backend_admin = profiles.include?("backend-business-service") && profiles.include?("admin-mixed-workflow")
  backend_controller_name = composite_backend_admin ? "backend_controller" : "controller"
  backend_rpc_name = composite_backend_admin ? "backend_RPC" : "RPC"
  backend_mq_name = composite_backend_admin ? "backend_MQ" : "MQ"
  backend_schedule_name = composite_backend_admin ? "backend_schedule" : "schedule"
  backend_service_name = composite_backend_admin ? "backend_service" : "service"
  backend_manager_name = composite_backend_admin ? "backend_manager" : "manager"
  backend_mapper_name = composite_backend_admin ? "backend_mapper" : "mapper"
  admin_controller_name = composite_backend_admin ? "admin_controller" : "controller"
  admin_data_console_name = composite_backend_admin ? "admin_data_console" : "data_console"
  admin_worker_name = composite_backend_admin ? "admin_worker" : "worker"
  admin_schedule_name = composite_backend_admin ? "admin_schedule" : "schedule"
  admin_import_name = composite_backend_admin ? "admin_import" : "import"
  admin_export_name = composite_backend_admin ? "admin_export" : "export"
  admin_spi_name = composite_backend_admin ? "admin_SPI" : "SPI"
  admin_rpc_name = composite_backend_admin ? "admin_RPC" : "RPC"

  if profiles.include?("backend-business-service")
    entries.concat([
      entry_type(backend_controller_name, "Backend HTTP controller entry.", ["**/src/main/java/**/*Controller.java"], ["*Controller"], "business_chain"),
      entry_type(backend_rpc_name, "Backend RPC provider or facade entry.", ["**/src/main/java/**/rpc/**/*.java", "**/src/main/java/**/*Provider.java", "**/src/main/java/**/*Facade.java", "**/src/main/java/**/*RPCService.java", "**/src/main/java/**/*Impl.java"], ["*Provider", "*Facade", "*RPCService", "*Impl"], "business_chain"),
      entry_type(backend_mq_name, "Backend MQ consumer, listener, or processor entry.", ["**/src/main/java/**/*Consumer.java", "**/src/main/java/**/*Listener.java", "**/src/main/java/**/*Processor.java"], ["*Consumer", "*Listener", "*Processor"], "business_chain", ["abstract base classes"]),
      entry_type(backend_schedule_name, "Backend schedule, job, task, or worker entry.", ["**/src/main/java/**/*Schedule.java", "**/src/main/java/**/*Job.java", "**/src/main/java/**/*Task.java", "**/src/main/java/**/*Worker.java"], ["*Schedule", "*Job", "*Task", "*Worker"], "business_chain", ["framework base classes"]),
      entry_type(backend_service_name, "Backend service entry when exposed as application boundary.", ["**/src/main/java/**/*Service.java", "**/src/main/java/**/*ServiceImpl.java"], ["*Service", "*ServiceImpl"], "business_chain"),
      entry_type(backend_manager_name, "Backend manager or domain service entry when directly orchestrating business behavior.", ["**/src/main/java/**/*Manager.java", "**/src/main/java/**/*ManagerImpl.java", "**/src/main/java/**/*DomainService.java"], ["*Manager", "*ManagerImpl", "*DomainService"], "business_chain"),
      entry_type(backend_mapper_name, "Backend mapper, repository, DAO, or persistence boundary.", ["**/src/main/java/**/*Mapper.java", "**/src/main/java/**/*Repository.java", "**/src/main/java/**/*Dao.java", "**/src/main/resources/**/*Mapper.xml"], ["*Mapper", "*Repository", "*Dao"], "business_chain")
    ])
  end

  if profiles.include?("admin-mixed-workflow")
    entries.concat([
      entry_type(admin_controller_name, "Admin controller or view controller entry.", ["**/src/main/java/**/*Controller.java"], ["*Controller"], "admin_workflow_chain"),
      entry_type(admin_data_console_name, "Admin data console action entry.", ["**/src/main/java/**/console/**/*.java", "**/src/main/webapp/**/*"], ["*Console", "*Action", "*Controller"], "admin_workflow_chain"),
      entry_type(admin_worker_name, "Admin background worker entry.", ["**/src/main/java/**/worker/**/*.java", "**/src/main/java/**/*Worker.java"], ["*Worker", "*Processor"], "admin_workflow_chain"),
      entry_type(admin_schedule_name, "Admin schedule, job, or task entry.", ["**/src/main/java/**/*Schedule.java", "**/src/main/java/**/*Job.java", "**/src/main/java/**/*Task.java"], ["*Schedule", "*Job", "*Task"], "admin_workflow_chain"),
      entry_type(admin_import_name, "Admin import operation entry.", ["**/src/main/java/**/*Import*.java", "**/src/main/webapp/**/*import*"], ["*Import*"], "admin_workflow_chain"),
      entry_type(admin_export_name, "Admin export operation entry.", ["**/src/main/java/**/*Export*.java", "**/src/main/webapp/**/*export*"], ["*Export*"], "admin_workflow_chain"),
      entry_type(admin_spi_name, "Admin SPI extension entry.", ["**/src/main/java/**/spi/**/*.java", "**/src/main/java/**/*Spi.java", "**/src/main/java/**/*SPI.java"], ["*Spi", "*SPI", "*Provider"], "admin_workflow_chain"),
      entry_type(admin_rpc_name, "Admin RPC provider or consumer entry.", ["**/src/main/java/**/rpc/**/*.java", "**/src/main/java/**/*Provider.java", "**/src/main/java/**/*Client.java"], ["*Provider", "*Client", "*Impl"], "admin_workflow_chain")
    ])
  end

  if profiles.include?("frontend-application")
    entries.concat([
      entry_type("route", "Frontend route entry.", ["**/src/**/routes/**/*", "**/src/**/router/**/*", "**/src/**/routers/**/*", "**/src/**/navigation/**/*"], ["<route-symbol>"], "frontend_interaction_chain", ["pure route constants with no user-visible behavior"]),
      entry_type("page", "Frontend page, view, or screen entry.", ["**/src/**/pages/**/*", "**/src/**/views/**/*", "**/src/**/screens/**/*", "**/src/main/webapp/**/*.jsp", "**/src/main/webapp/**/*.html"], ["*Page", "*View", "*Screen"], "frontend_interaction_chain"),
      entry_type("component", "Frontend business component entry.", ["**/src/**/components/**/*", "**/src/**/component/**/*"], ["<component-symbol>"], "frontend_interaction_chain", ["pure design-system atom without business behavior"]),
      entry_type("store", "Frontend state store entry.", ["**/src/**/store/**/*", "**/src/**/stores/**/*", "**/src/**/models/**/*"], ["*Store", "<store-symbol>"], "frontend_interaction_chain"),
      entry_type("action", "Frontend action, reducer, or effect entry.", ["**/src/**/actions/**/*", "**/src/**/mobx/action/**/*", "**/src/**/effects/**/*"], ["*Action", "<action-symbol>"], "frontend_interaction_chain"),
      entry_type("api_client", "Frontend API client entry.", ["**/src/**/api/**/*", "**/src/**/services/**/*", "**/src/**/request/**/*"], ["*Api", "*API", "*Service", "<api-client-symbol>"], "frontend_interaction_chain"),
      entry_type("popup", "Frontend popup, modal, dialog, or sheet entry.", ["**/src/**/popup/**/*", "**/src/**/popups/**/*", "**/src/**/modal/**/*", "**/src/**/modals/**/*", "**/src/**/dialog/**/*", "**/src/**/dialogs/**/*", "**/src/**/sheets/**/*"], ["*Popup", "*Modal", "*Dialog", "*Sheet"], "frontend_interaction_chain"),
      entry_type("native_shell", "React Native or native shell bridge entry.", ["**/android/app/src/main/java/**/*.java", "**/ios/**/*.m", "**/ios/**/*.mm", "**/ios/**/*.swift"], ["*Activity", "*Module", "*Manager", "*Bridge"], "frontend_interaction_chain", ["native shell bridge without user-visible business behavior may be non-blocking"])
    ])
  end

  if profiles.include?("data-pipeline-etl")
    entries.concat([
      entry_type("spark_job", "Spark batch job entry.", ["**/finance-spark-service/src/main/java/**/etl/job/**/*.java", "**/src/main/java/**/etl/job/**/*.java"], ["*Job"], "data_pipeline_chain", ["abstract job base classes"]),
      entry_type("flink_main", "Flink main pipeline entry.", ["**/finance-flink-service/src/main/java/**/main/**/*.java", "**/src/main/java/**/main/**/*.java"], ["*Main"], "data_pipeline_chain"),
      entry_type("flink_process_function", "Flink process function or transformation entry.", ["**/finance-flink-service/src/main/java/**/func/process/**/*.java", "**/src/main/java/**/func/process/**/*.java", "**/src/main/java/**/*Function.java"], ["*Function", "*ProcessFunction"], "data_pipeline_chain", ["abstract base functions"]),
      entry_type("connector", "ETL connector, source, repository, or deserializer entry.", ["**/src/main/java/**/connector*/**/*.java", "**/src/main/java/**/connectors/**/*.java", "**/src/main/java/**/*Connector.java", "**/src/main/java/**/*Repository.java", "**/src/main/java/**/*DeserializationSchema.java"], ["*Connector", "*Repository", "*DeserializationSchema"], "data_pipeline_chain"),
      entry_type("sink", "ETL sink or output writer entry.", ["**/src/main/java/**/*Sink.java", "**/src/main/java/**/sink/**/*.java"], ["*Sink"], "data_pipeline_chain"),
      entry_type("publisher", "ETL downstream publisher or message output entry.", ["**/src/main/java/**/*Publisher.java", "**/src/main/java/**/*Producer.java", "**/src/main/java/**/*Mq*.java"], ["*Publisher", "*Producer", "*Mq*"], "data_pipeline_chain"),
      entry_type("sql", "ETL SQL file, SQL builder, or lineage unit.", ["**/src/main/resources/**/*.sql", "**/sql/**/*.sql", "**/src/main/java/**/*Sql*.java", "**/src/main/java/**/*SQL*.java"], ["*Sql*", "*SQL*"], "data_pipeline_chain")
    ])
  end

  if profiles.include?("library-shared-component")
    entries.concat([
      entry_type("public_api", "Shared library public API entry.", ["**/src/main/java/**/*Api.java", "**/src/main/java/**/*API.java", "**/src/**/*.ts", "**/src/**/*.tsx"], ["*Api", "*API", "<exported-symbol>"], "consumer_contract_chain"),
      entry_type("consumer_scenario", "Consumer-facing scenario or sample entry.", ["**/examples/**/*", "**/samples/**/*", "**/test/**/*"], ["<consumer-scenario>"], "consumer_contract_chain"),
      entry_type("adapter", "Library adapter or bridge entry.", ["**/src/main/java/**/*Adapter.java", "**/src/**/adapter/**/*", "**/src/**/adapters/**/*"], ["*Adapter"], "consumer_contract_chain"),
      entry_type("extension_point", "Library SPI or extension point entry.", ["**/src/main/java/**/spi/**/*.java", "**/src/main/java/**/*Extension*.java", "**/src/**/extensions/**/*"], ["*Extension*", "*Spi", "*SPI"], "consumer_contract_chain")
    ])
  end

  entries.uniq { |entry| [entry.name, entry.evidence_mode] }
end

def profile_hash(profiles, files, source_roots, pending_confirmation, profile_source)
  {
    "version" => "0.1.0",
    "schema_version" => "0.1.0",
    "generated_by" => "ai-sdlc-standard #{SCRIPT_NAME}",
    "project_type_profiles" => {
      "selected" => profiles,
      "source" => profile_source,
      "precedence" => PROFILE_PRECEDENCE,
      "pending_confirmation" => pending_confirmation,
      "standard_reference" => "${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-project-type-profiles.md"
    },
    "scope" => {
      "source_roots" => source_roots,
      "include_file_patterns" => ["**/*"],
      "exclude_file_patterns" => EXCLUDE_FILE_PATTERNS,
      "document_scope" => ".specify/business_domain",
      "report_dir" => ".specify/reports/entry_coverage"
    },
    "entry_types" => entry_types_for(profiles).map do |entry|
      {
        "name" => entry.name,
        "description" => entry.description,
        "path_patterns" => entry.patterns,
        "class_name_patterns" => entry.class_patterns,
        "exclude_when" => entry.exclude_when,
        "evidence_mode" => entry.evidence_mode
      }
    end,
    "layers" => {
      "service" => {
        "path_patterns" => ["**/src/main/java/**/*Service.java", "**/src/main/java/**/*ServiceImpl.java", "**/src/**/*Service.ts", "**/src/**/*Service.tsx"],
        "class_name_patterns" => ["*Service", "*ServiceImpl"]
      },
      "manager" => {
        "path_patterns" => ["**/src/main/java/**/*Manager.java", "**/src/main/java/**/*ManagerImpl.java", "**/src/main/java/**/*DomainService.java", "**/src/**/manager/**/*"],
        "class_name_patterns" => ["*Manager", "*ManagerImpl", "*DomainService"]
      },
      "persistence" => {
        "path_patterns" => ["**/src/main/java/**/*Mapper.java", "**/src/main/java/**/*Dao.java", "**/src/main/java/**/*DAO.java", "**/src/main/java/**/*Repository.java", "**/src/main/resources/**/*Mapper.xml"],
        "class_name_patterns" => ["*Mapper", "*Dao", "*DAO", "*Repository"]
      }
    },
    "evidence_chain" => {
      "business_chain" => { "required_layers" => ["entry"], "recommended_layers" => %w[service manager persistence], "allow_missing_layers_with_reason" => true },
      "admin_workflow_chain" => { "required_layers" => ["entry"], "recommended_layers" => %w[service manager persistence audit_or_approval], "allow_missing_layers_with_reason" => true },
      "frontend_interaction_chain" => { "required_layers" => ["route_or_page"], "recommended_layers" => %w[component store_or_action api_client backend_contract], "allow_missing_layers_with_reason" => true },
      "data_pipeline_chain" => { "required_layers" => %w[entry input_contract output_contract], "recommended_layers" => %w[transformation connector_or_repository idempotency_or_replay partition_window_checkpoint], "allow_missing_layers_with_reason" => true },
      "consumer_contract_chain" => { "required_layers" => %w[public_api consumer_contract], "recommended_layers" => %w[compatibility_rule migration_or_deprecation_note test_evidence], "allow_missing_layers_with_reason" => true }
    },
    "domain_matching" => {
      "l4_document_pattern" => ".specify/business_domain/**/[0-9][0-9][0-9][0-9][0-9][0-9]*.md",
      "entry_match_rule" => "entry class, method, path, route, topic, job, function, SQL, connector, or sink appears in an L4 evidence table",
      "allow_entry_in_multiple_l2_domains" => false
    },
    "strict_outputs" => {
      "entry_inventory" => "entry_inventory.tsv",
      "service_inventory" => "service_inventory.tsv",
      "entry_chain_evidence" => "entry_chain_evidence.md",
      "unarchived_entries" => "unarchived_entries.md",
      "unarchived_services" => "unarchived_services.md",
      "cross_domain_conflicts" => "cross_domain_conflicts.md",
      "summary_report" => "entry_coverage_report.md"
    },
    "runtime_redlines" => {
      "forbidden_write_paths" => FORBIDDEN_WRITE_PATHS,
      "legacy_runtime_inputs" => LEGACY_RUNTIME_INPUTS,
      "legacy_skill_usage" => "none"
    },
    "bootstrap_evidence" => {
      "scanned_file_count" => files.size,
      "sample_files" => files.first(20)
    }
  }
end

def report_text(profile_path, report_path, profile_hash, existing_profile, force, dry_run)
  <<~MD
    # Entry Coverage Profile Bootstrap Report

    > **Generated By**: ai-sdlc-standard #{SCRIPT_NAME}
    > **Generated At**: #{Time.now.iso8601}
    > **Target Repository**: #{TARGET_ROOT}

    ## Summary

    | Item | Value |
    | --- | --- |
    | Dry Run | #{dry_run} |
    | Profile Path | #{profile_path} |
    | Report Path | #{report_path} |
    | Existing Stable Profile | #{existing_profile} |
    | Force Stable Profile | #{force} |
    | Project Type Profiles | #{profile_hash.fetch("project_type_profiles").fetch("selected").join(", ")} |
    | Project Type Source | #{profile_hash.fetch("project_type_profiles").fetch("source")} |
    | Pending Confirmation | #{profile_hash.fetch("project_type_profiles").fetch("pending_confirmation")} |

    ## Restricted Write Boundary

    This bootstrap may write only:

    ```text
    .specify/entry-coverage-profile.yaml
    .specify/entry-coverage-profile.candidate.yaml
    .specify/reports/entry_coverage_profile_bootstrap_report.md
    ```

    It must not write:

    ```text
    #{FORBIDDEN_WRITE_PATHS.join("\n")}
    ```

    ## Runtime Isolation

    - Legacy Skill usage: none
    - Legacy document runtime input: none
    - Forbidden legacy read paths:
    #{LEGACY_RUNTIME_INPUTS.map { |path| "  - `#{path}`" }.join("\n")}

    ## Source Roots

    #{profile_hash.dig("scope", "source_roots").map { |root| "- `#{root}`" }.join("\n")}

    ## Entry Types

    | Entry Type | Evidence Mode |
    | --- | --- |
    #{profile_hash.fetch("entry_types").map { |entry| "| #{entry.fetch("name")} | #{entry.fetch("evidence_mode")} |" }.join("\n")}

    ## Next Step

    Review and confirm the profile before enforcing Analyze Gate entry coverage.
    Then run:

    ```bash
    ${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path>
    ```
  MD
end

def write_or_preview(path, content, dry_run)
  if dry_run
    puts "\n--- #{relative(path)} ---"
    puts content
    return
  end

  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content)
end

files = project_files
roots = source_roots(files)
profiles, profile_source, pending_confirmation = select_profiles(files, options[:project_type_profiles])
profile = profile_hash(profiles, files, roots, pending_confirmation, profile_source)

stable_profile_path = File.join(TARGET_ROOT, DEFAULT_PROFILE_PATH)
profile_exists = File.exist?(stable_profile_path)
selected_profile_rel = if profile_exists && !options[:force]
                         DEFAULT_CANDIDATE_PROFILE_PATH
                       else
                         DEFAULT_PROFILE_PATH
                       end
selected_profile_path = File.join(TARGET_ROOT, selected_profile_rel)
report_path = File.join(TARGET_ROOT, DEFAULT_REPORT_PATH)

profile_yaml = YAML.dump(profile)
report = report_text(selected_profile_rel, DEFAULT_REPORT_PATH, profile, profile_exists, options[:force], options[:dry_run])

write_or_preview(selected_profile_path, profile_yaml, options[:dry_run])
write_or_preview(report_path, report, options[:dry_run])

unless options[:dry_run]
  puts "Generated #{selected_profile_rel}"
  puts "Generated #{DEFAULT_REPORT_PATH}"
end
