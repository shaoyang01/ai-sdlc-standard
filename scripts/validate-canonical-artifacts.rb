#!/usr/bin/env ruby
# frozen_string_literal: true

# Canonical stable-artifact validator (A9, contract §3.1 / artifact-versioning.md).
# Usage: ruby validate-canonical-artifacts.rb <library_dir_or_requirement_dir> [more dirs...]
# Exit 0 = clean; exit 1 = violations (one line per violation, prefixed by check id).

require "set"
require "pathname"
require "yaml"
require_relative "lib/canonical-artifact-path"

CANONICAL = CanonicalArtifactPath::NODES.transform_values { |v| v[:dir] }.freeze
DIR_TO_NODE = CANONICAL.invert.freeze
NODE_DIRS = CANONICAL.values.freeze
LEGACY_LEDGER = /\A[^\/]+_FindingLedger\.(md|html)\z/.freeze

# R3 suggestion (RC-2): a directory we are not allowed to read is a usage /
# environment error, not a validator verdict — fail closed with exit 2 and a
# one-line message instead of leaking a Ruby backtrace.
class DirectoryUnreadable < StandardError; end

def list_dir(path)
  Dir.children(path)
rescue Errno::EACCES, Errno::EPERM => e
  raise DirectoryUnreadable, "#{path}: #{e.class}"
end

def violations_for(req_dir)
  problems = []
  id = File.basename(req_dir)

  # per-node top-level current files
  NODE_DIRS.each do |node_dir|
    dir = File.join(req_dir, node_dir)
    next unless Dir.exist?(dir)

    tops = list_dir(dir).select { |f| File.file?(File.join(dir, f)) && f =~ /\.(md|html)\z/ }
    tops.each do |f|
      rel = "#{node_dir}/#{f}"
      if CanonicalArtifactPath::FORBIDDEN_SUFFIX.match?(f.sub(/\.(md|html)\z/, ""))
        problems << "A5/A8[forbidden-suffix] #{rel}: 轮次/状态后缀文件不得作为顶层当前文档（迁移至 evidence/history/ 并登记迁移表）"
        next
      end
      if LEGACY_LEDGER.match?(f)
        problems << "A9-12[legacy-ledger] #{rel}: 英文台账路径已废止，当前权威为 #{id}_方案审核问题台账.md（历史件迁 evidence/history/ + 迁移表）"
        next
      end
      # R1-P0-2: the shared decision binds requirement id + node + binding, so a
      # file whose basename carries a different requirement id is rejected here
      # exactly as the publisher rejects it.
      node_name = DIR_TO_NODE[node_dir]
      ok_for_some_binding = CanonicalArtifactPath::NODES[node_name][:suffixes].keys.any? do |b|
        CanonicalArtifactPath.decide(requirement_id: id, node: node_name, binding: b, artifact_path: rel).ok
      end
      unless ok_for_some_binding
        reason = CanonicalArtifactPath.decide(
          requirement_id: id, node: node_name,
          binding: CanonicalArtifactPath::NODES[node_name][:suffixes].keys.first,
          artifact_path: rel,
        ).reason
        problems << "A9-3[non-canonical] #{rel}: 非该节点 canonical 当前文件（#{reason}）"
      end
    end

    # duplicate canonical base: two top-level CURRENT files with the same
    # canonical suffix in one node (the two solution-gate bindings are the only
    # legitimate pair, and they carry DIFFERENT suffixes).
    by_suffix = Hash.new { |h, k| h[k] = [] }
    node_name = DIR_TO_NODE[node_dir]
    tops.each do |f|
      CanonicalArtifactPath::NODES[node_name][:suffixes].each_value do |suffix|
        by_suffix[suffix] << f if f.match?(/\A#{Regexp.escape(id)}_#{Regexp.escape(suffix)}\.(md|html)\z/)
      end
    end
    by_suffix.each do |suffix, files|
      problems << "A9-1[duplicate-canonical] #{node_dir}: 同基名出现多份顶层当前文件（#{suffix}）#{files.join(', ')}" if files.length > 1
    end
  end

  # manifest cross-checks (NEW-B2 + SUG-R3-RC2-1): parse the FIRST fenced yaml
  # block with YAML.safe_load and validate PER ENTRY. The previous regex required
  # `artifact_path:` to sit on the line IMMEDIATELY after `node:`, while
  # publisher products carry `status:` in between — so on real manifests the
  # scan matched 0 rows and A9-5/A9-6 could never fire. Parsing the document
  # (rather than pattern-matching lines) also removes the fence-spelling /
  # key-indent / inline-comment / quoted-scalar evasions.
  manifest = File.join(req_dir, "manifest.md")
  if File.file?(manifest)
    text = File.read(manifest)
    fenced = text[/```yaml\n(.*?)```/m, 1]
    state = nil
    if fenced.nil?
      problems << "A9-9[manifest-unreadable] manifest 缺少 ```yaml 围栏，无法交叉校验"
    else
      begin
        state = YAML.safe_load(fenced, permitted_classes: [Time], aliases: false)
      rescue StandardError => e
        problems << "A9-9[manifest-unreadable] manifest 围栏解析失败（#{e.class}）：无法交叉校验"
      end
    end

    unless state.nil? || !state.is_a?(Hash)
      declared_id = state["requirement_id"].to_s
      if !declared_id.empty? && declared_id != id
        problems << "A9-7[manifest-id-mismatch] manifest 的 requirement_id (#{declared_id}) 与所在目录 (#{id}) 不一致（稳定路径按需求 ID 绑定，二者必须同一需求）"
      end

      Array(state["entries"]).each do |entry|
        next unless entry.is_a?(Hash)

        node_name = entry["node"].to_s
        next unless CanonicalArtifactPath.node?(node_name)

        ap = entry["artifact_path"].to_s.strip
        next if ap.empty? || ap == "null"

        # The manifest current pointer is decided by the SAME shared rule the
        # publisher enforces; solution-gate ONLY accepts the formal verdict.
        bindings = CanonicalArtifactPath::NODES[node_name][:suffixes].keys
        allowed = bindings.select do |b|
          CanonicalArtifactPath.decide(requirement_id: id, node: node_name, binding: b, artifact_path: ap).ok
        end
        if allowed.empty?
          reason = CanonicalArtifactPath.decide(
            requirement_id: id, node: node_name, binding: bindings.first, artifact_path: ap,
          ).reason
          problems << "A9-5[manifest-non-canonical] manifest current 非稳定路径（node #{node_name}）: #{ap} — #{reason}"
        elsif node_name == "solution-gate" && !allowed.include?("formal_verdict")
          problems << "A9-6[gate-pointer] solution-gate manifest current 必须是正式裁决 #{id}_方案审核.md，不得指向对抗扫描台账: #{ap}"
        end
      end
    end
  end

  problems
end

targets = ARGV.dup
if targets.empty?
  warn "usage: validate-canonical-artifacts.rb <library_dir | requirement_dir> [...]"
  exit 2
end
# R2 suggestion (RC-2): a missing or non-directory argument is a usage error and
# must fail closed with a message — never a Ruby backtrace out of Dir.children,
# and never a silent PASS.
not_dirs = targets.reject { |t| File.directory?(t) }
unless not_dirs.empty?
  warn "canonical-artifacts: not a directory: #{not_dirs.join(', ')}"
  exit 2
end

all = []
begin
targets.each do |t|
  req_dirs = if File.basename(t) =~ /\A\d{8}-/ && NODE_DIRS.any? { |n| Dir.exist?(File.join(t, n)) }
    [t]
  else
    list_dir(t).map { |c| File.join(t, c) }.select { |d| Dir.exist?(d) && NODE_DIRS.any? { |n| Dir.exist?(File.join(d, n)) } }
  end
  req_dirs.each { |rd| all += violations_for(rd) }
end
rescue DirectoryUnreadable => e
  warn "canonical-artifacts: directory not readable: #{e.message}"
  exit 2
end

if all.empty?
  puts "canonical-artifacts: PASS (#{targets.join(', ')})"
  exit 0
else
  all.each { |p| puts p }
  puts "canonical-artifacts: FAIL (#{all.length} violation(s))"
  exit 1
end
