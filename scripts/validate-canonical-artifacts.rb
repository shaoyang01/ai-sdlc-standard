#!/usr/bin/env ruby
# frozen_string_literal: true

# Canonical stable-artifact validator (A9, contract §3.1 / artifact-versioning.md).
# Usage: ruby validate-canonical-artifacts.rb <library_dir_or_requirement_dir> [more dirs...]
# Exit 0 = clean; exit 1 = violations (one line per violation, prefixed by check id).

require "set"
require "pathname"
require_relative "lib/canonical-artifact-path"

CANONICAL = CanonicalArtifactPath::NODES.transform_values { |v| v[:dir] }.freeze
DIR_TO_NODE = CANONICAL.invert.freeze
NODE_DIRS = CANONICAL.values.freeze
LEGACY_LEDGER = /\A[^\/]+_FindingLedger\.(md|html)\z/.freeze

def violations_for(req_dir)
  problems = []
  id = File.basename(req_dir)

  # per-node top-level current files
  NODE_DIRS.each do |node_dir|
    dir = File.join(req_dir, node_dir)
    next unless Dir.exist?(dir)

    tops = Dir.children(dir).select { |f| File.file?(File.join(dir, f)) && f =~ /\.(md|html)\z/ }
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

  # manifest cross-checks
  manifest = File.join(req_dir, "manifest.md")
  if File.file?(manifest)
    text = File.read(manifest)
    text.scan(/node:\s*(\S+)\s*$\s*artifact_path:\s*([^\s\n]+)/).each do |node_name, ap|
      ap = ap.to_s.strip
      next if ap.empty? || ap == "null"
      next unless CanonicalArtifactPath.node?(node_name)

      # R1-P0-2: the manifest current pointer is decided by the SAME shared
      # rule the publisher enforces. solution-gate ONLY accepts the formal
      # verdict file — the ledger binding never becomes the current pointer.
      bindings = CanonicalArtifactPath::NODES[node_name][:suffixes].keys
      allowed = bindings.select do |b|
        CanonicalArtifactPath.decide(requirement_id: id, node: node_name, binding: b, artifact_path: ap).ok
      end
      if allowed.empty?
        reason = CanonicalArtifactPath.decide(requirement_id: id, node: node_name, binding: bindings.first, artifact_path: ap).reason
        problems << "A9-5[manifest-non-canonical] manifest current 非稳定路径（node #{node_name}）: #{ap} — #{reason}"
      elsif node_name == "solution-gate" && !allowed.include?("formal_verdict")
        problems << "A9-6[gate-pointer] solution-gate manifest current 必须是正式裁决 #{id}_方案审核.md，不得指向对抗扫描台账: #{ap}"
      end
    end
    # R2 suggestion (RC-2): cross-check the manifest's own requirement_id against
    # the library directory it lives in. Every node-level check compares file
    # names against the DIRECTORY basename, so a manifest copied from another
    # requirement — or a renamed directory — would otherwise pass whenever the
    # node dirs do not contradict it.
    fenced = text[/```yaml\n(.*?)```/m, 1]
    declared_id = fenced && fenced[/^requirement_id:\s*(\S+)\s*$/, 1]
    if declared_id && declared_id != id
      problems << "A9-7[manifest-id-mismatch] manifest 的 requirement_id (#{declared_id}) 与所在目录 (#{id}) 不一致（稳定路径按需求 ID 绑定，二者必须同一需求）"
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
targets.each do |t|
  req_dirs = if File.basename(t) =~ /\A\d{8}-/ && NODE_DIRS.any? { |n| Dir.exist?(File.join(t, n)) }
    [t]
  else
    Dir.children(t).map { |c| File.join(t, c) }.select { |d| Dir.exist?(d) && NODE_DIRS.any? { |n| Dir.exist?(File.join(d, n)) } }
  end
  req_dirs.each { |rd| all += violations_for(rd) }
end

if all.empty?
  puts "canonical-artifacts: PASS (#{targets.join(', ')})"
  exit 0
else
  all.each { |p| puts p }
  puts "canonical-artifacts: FAIL (#{all.length} violation(s))"
  exit 1
end
