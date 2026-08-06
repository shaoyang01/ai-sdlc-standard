#!/usr/bin/env ruby
# encoding: utf-8
# frozen_string_literal: true

# Compact Prompt CLI (PCE-01-B).
#
# Thin executable: argv, real file reads, stdout/stderr and exit codes only.
# All contract logic lives in scripts/lib/compact_prompt.rb.
#
# Usage:
#   ruby scripts/ai-sdlc-prompt.rb validate <capsule.yaml>
#   ruby scripts/ai-sdlc-prompt.rb compile <capsule.yaml>
#
# Exit codes: 0 success; 2 CLI_OR_INPUT; 3 CONTRACT_OR_POLICY;
# 4 GIT_BASELINE; 5 RENDER_OR_BUDGET.

require_relative "lib/compact_prompt"

exit CompactPrompt::CLI.main(ARGV, cwd: Dir.pwd, stdout: $stdout, stderr: $stderr)
