# frozen_string_literal: true

# Canonical stable-artifact decision — the SINGLE source of truth shared by the
# publisher hard gate (scripts/publish-requirement-manifest.sh) and the
# post-write validator (scripts/validate-canonical-artifacts.rb).
#
# R1-P0-2 fix: the earlier gate matched only the file SHAPE, so any requirement
# ID was accepted and the adversarial-scan ledger could be registered as the
# solution-gate current pointer. The decision now binds FOUR facts together:
#   requirement_id + node + binding + artifact_path
#
# Contract: manual-runtime-semantic-contract §3 / §3.1, artifact-versioning.md.
module CanonicalArtifactPath
  # node => {dir, binding => basename suffix}
  NODES = {
    "requirement-intake" => { dir: "00-需求资料", suffixes: { nil => "需求摘要" } },
    "solution-design" => { dir: "01-技术方案", suffixes: { nil => "技术方案" } },
    # solution-gate is the ONLY two-file node: two isolated bindings.
    "solution-gate" => { dir: "02-方案审核", suffixes: { "adversarial_scan" => "方案审核问题台账", "formal_verdict" => "方案审核" } },
    "task-planning" => { dir: "03-任务规划", suffixes: { nil => "任务计划" } },
    "implementation" => { dir: "04-实现记录", suffixes: { nil => "实现记录" } },
    "code-review" => { dir: "05-代码审核", suffixes: { nil => "代码审核" } },
    "knowledge-sync" => { dir: "06-知识同步", suffixes: { nil => "知识同步结果" } },
  }.freeze

  FORBIDDEN_SUFFIX = /
    _v\d+\z | _R\d+\z | -R\d+\z | _round\d+\z |
    _第\d+轮\z | _第N轮\z |
    _对抗扫描\z | _闭环复核\z | _再次复核\z | _正式裁决\z |
    _复验\z | _再次复验\z | _准入修正\z | _最终复验\z |
    _最终版\z | _最新版\z
  /x.freeze

  LEGACY_LEDGER_BASENAME = /_FindingLedger\.(md|html)\z/.freeze

  Result = Struct.new(:ok, :reason, keyword_init: true)

  def self.node?(node)
    NODES.key?(node)
  end

  # binding for a node: explicit for solution-gate, nil (single-binding) elsewhere.
  def self.binding_for(node, binding)
    return binding if node == "solution-gate"

    # single-binding nodes: an explicit non-nil binding is a mistake
    binding.nil? ? nil : :reject
  end

  def self.expected_dir(node)
    NODES.dig(node, :dir)
  end

  def self.suffix_for(node, binding)
    NODES.dig(node, :suffixes, binding)
  end

  # Decide whether artifact_path is the CURRENT canonical artifact for
  # (requirement_id, node, binding).
  def self.decide(requirement_id:, node:, binding:, artifact_path:)
    unless node?(node)
      return Result.new(ok: false, reason: "unknown node #{node.inspect}")
    end

    resolved = binding_for(node, binding)
    if resolved == :reject
      return Result.new(ok: false, reason: "node #{node} has a single binding; --binding #{binding.inspect} is not allowed")
    end

    suffix = suffix_for(node, resolved)
    if suffix.nil?
      want = NODES.dig(node, :suffixes).keys.compact
      return Result.new(ok: false, reason: "node #{node} requires --binding (#{want.join('|')}); got #{binding.inspect}")
    end

    if requirement_id.nil? || requirement_id.to_s.empty?
      return Result.new(ok: false, reason: "requirement id is required to resolve the canonical name")
    end

    path = artifact_path.to_s
    return Result.new(ok: false, reason: "artifact path is empty") if path.empty?

    dir = expected_dir(node)
    actual_dir = path.split("/")[0..-2].join("/")
    unless actual_dir == dir
      return Result.new(ok: false, reason: "#{path.inspect} is not under #{dir}/ for node #{node}")
    end

    basename = File.basename(path)
    if LEGACY_LEDGER_BASENAME.match?(basename)
      return Result.new(ok: false, reason: "#{basename.inspect} is the retired English ledger name; use #{requirement_id}_方案审核问题台账.md")
    end
    if FORBIDDEN_SUFFIX.match?(basename.sub(/\.(md|html)\z/, ""))
      return Result.new(ok: false, reason: "#{basename.inspect} carries a round/status suffix (contract §3.1 forbids it)")
    end

    pattern = /\A#{Regexp.escape(requirement_id)}_#{Regexp.escape(suffix)}\.(md|html)\z/
    unless pattern.match?(basename)
      return Result.new(ok: false, reason: "#{basename.inspect} does not match #{requirement_id}_#{suffix}.md for node #{node}#{resolved ? " binding #{resolved}" : ''} (requirement id must match the manifest)")
    end

    Result.new(ok: true, reason: nil)
  end

  # solution-gate manifest current pointer: ONLY the formal verdict file.
  def self.formal_verdict_path?(requirement_id, artifact_path)
    decide(requirement_id: requirement_id, node: "solution-gate", binding: "formal_verdict", artifact_path: artifact_path).ok
  end

  # Ledger binding path (recorded, never the manifest current pointer).
  def self.ledger_path?(requirement_id, artifact_path)
    decide(requirement_id: requirement_id, node: "solution-gate", binding: "adversarial_scan", artifact_path: artifact_path).ok
  end
end
