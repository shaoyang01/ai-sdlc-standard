#!/usr/bin/env bash
# Regression matrix for scripts/audit-entry-coverage.rb (entry/core-unit matching).
#
# Covers two R2 defects fixed 2026-09-17:
#   1. identifier evidence must respect IDENTIFIER BOUNDARIES — a document that
#      mentions `DeliveryOrderServiceImpl` must not archive the independent
#      record `OrderServiceImpl` (the old `text.downcase.include?` substring
#      rule did exactly that, and manufactured cross-domain conflicts);
#   2. a class that is BOTH an entry and a layer unit (Dubbo-exposed
#      *ServiceImpl) is accounted for once, as an entry — it must not be
#      reported as an unarchived core unit for lack of an inbound chain.
#
# Run: bash tests/audit-entry-coverage.test.sh

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIT="${SCRIPT_DIR}/../scripts/audit-entry-coverage.rb"
WORK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/audit-coverage.XXXXXX")"
trap 'rm -rf "${WORK_ROOT}"' EXIT

PASS_COUNT=0; FAIL_COUNT=0
pass() { PASS_COUNT=$((PASS_COUNT + 1)); echo "PASS: $*"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); echo "FAIL: $*"; }
assert_contains() { # file needle label
  if grep -qF -- "$2" "$1" 2>/dev/null; then pass "$3"; else fail "$3 (missing: $2)"; fi
}
assert_not_contains() {
  if grep -qF -- "$2" "$1" 2>/dev/null; then fail "$3 (unexpected: $2)"; else pass "$3"; fi
}

R="${WORK_ROOT}/fixture"
mkdir -p "${R}/.sdlc/business_domain/01Domain/0101L2" "${R}/src/main/java/com/example/service/impl"

cat > "${R}/.sdlc/entry-coverage-profile.yaml" <<'EOF'
scope:
  include_patterns: ["**/*.java"]
  exclude_patterns: []
domain_matching:
  l4_document_pattern: .sdlc/business_domain/**/[0-9][0-9][0-9][0-9][0-9][0-9]*.md
  allow_entry_in_multiple_l2_domains: false
entry_types:
  - name: dubbo_rpc_service
    evidence_mode: business_chain
    path_patterns: ["**/service/impl/*ServiceImpl.java"]
layers: {}
EOF

# 四个服务类：DeliveryOrderServiceImpl 是 OrderServiceImpl 的"长标识符超串"
for cls in OrderServiceImpl DeliveryOrderServiceImpl SoloServiceImpl OtherServiceImpl; do
  printf 'package com.example.service.impl;\npublic class %s {}\n' "${cls}" \
    > "${R}/src/main/java/com/example/service/impl/${cls}.java"
done

# 文档只点名 DeliveryOrderServiceImpl 与 SoloServiceImpl（按路径 + 符号）
cat > "${R}/.sdlc/business_domain/01Domain/0101L2/010101Fixture(测试).md" <<'EOF'
# Fixture

## Entry Chain

| Layer | Entry / Component | Evidence | Status |
| --- | --- | --- | --- |
| RPC | DeliveryOrderServiceImpl | src/main/java/com/example/service/impl/DeliveryOrderServiceImpl.java | verified-code |
| RPC | SoloServiceImpl | src/main/java/com/example/service/impl/SoloServiceImpl.java | verified-code |
EOF

ruby "${AUDIT}" --strict "${R}" > "${WORK_ROOT}/run.out" 2>&1
RC=$?
ENTRIES="${R}/.sdlc/reports/entry_coverage/entry_inventory.tsv"
UNARCH_ENTRIES="${R}/.sdlc/reports/entry_coverage/unarchived_entries.md"
UNARCH_SERVICES="${R}/.sdlc/reports/entry_coverage/unarchived_services.md"

CASE_NAME="audit R2-1: identifier evidence respects identifier boundaries"
assert_contains "${UNARCH_ENTRIES}" '`OrderServiceImpl`' "OrderServiceImpl stays unarchived when only DeliveryOrderServiceImpl is named"
assert_not_contains "${UNARCH_ENTRIES}" '`DeliveryOrderServiceImpl`' "DeliveryOrderServiceImpl is archived by its own citation"
assert_not_contains "${UNARCH_ENTRIES}" '`SoloServiceImpl`' "SoloServiceImpl is archived by its own citation"
assert_contains "${UNARCH_ENTRIES}" '`OtherServiceImpl`' "an uncited entry stays unarchived (control: archiving still works)"

CASE_NAME="audit R2-2: self-entry classes are not reported as unarchived core units"
assert_not_contains "${UNARCH_SERVICES}" 'DeliveryOrderServiceImpl' "self-entry unit absent from unarchived core units"
assert_not_contains "${UNARCH_SERVICES}" 'SoloServiceImpl' "self-entry unit absent from unarchived core units"
# Control: a layer unit that is NOT an entry and is cited nowhere must still be reported.
printf 'package com.example.service.impl;\npublic class PlainManagerImpl {}\n' \
  > "${R}/src/main/java/com/example/service/impl/PlainManagerImpl.java"
ruby "${AUDIT}" --strict "${R}" > "${WORK_ROOT}/run2.out" 2>&1
if [[ -f "${UNARCH_SERVICES}" ]] && grep -qF 'PlainManagerImpl' "${UNARCH_SERVICES}"; then
  pass "non-entry layer unit still reported when uncited (control)"
else
  fail "non-entry layer unit should be reported when uncited"
fi

CASE_NAME="audit R2-3: run still exits 0/1 with reports written"
if [[ "${RC}" == "0" || "${RC}" == "1" ]]; then pass "audit exits ${RC} (blocked-or-clean, no crash)"; else fail "unexpected audit exit ${RC}"; fi
[[ -f "${ENTRIES}" ]] && pass "entry inventory written" || fail "entry inventory missing"

echo ""
echo "==== audit-entry-coverage regression summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed ===="
if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo "ALL GREEN"
  exit 0
fi
exit 1
