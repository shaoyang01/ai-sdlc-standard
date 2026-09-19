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
# Covers the explicit impl-alias caliber (R3 §7 option (b), Current User
# authorized 2026-09-19): a document naming the UNIQUE convention twin `XImpl`
# covers `X` (and vice versa); a duplicated twin simple name disables the
# alias; a twin pair spanning two L2 domains reports ONE conflict.
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
mkdir -p "${R}/.sdlc/business_domain/01Domain/0101L2" "${R}/.sdlc/business_domain/01Domain/0102L2" \
  "${R}/src/main/java/com/example/service/impl" "${R}/src/main/java/com/example/service" \
  "${R}/src/main/java/com/example/manager" "${R}/src/main/java/com/example/a" "${R}/src/main/java/com/example/b"

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
for cls in OrderServiceImpl DeliveryOrderServiceImpl SoloServiceImpl OtherServiceImpl TableOnlyServiceImpl; do
  printf 'package com.example.service.impl;\npublic class %s {}\n' "${cls}" \
    > "${R}/src/main/java/com/example/service/impl/${cls}.java"
done

# ---- 显式实现别名矩阵（R3 §7 ①-⑤）的链与孪生面 ----
# ① 接口 X + 唯一实现 XImpl（层内对，实现不在 entry 目录），文档仅点名 XImpl
#    （DocC 文本）；链侧经 TableOnlyServiceImpl 的字段声明。
#    注意不得复用 OrderService/OrderServiceImpl：后者是 R2-1 的"保持未归档"
#    对照记录，没有文档点名它，别名无据可依。
printf 'package com.example.service;\npublic interface ReviewService {}\n' \
  > "${R}/src/main/java/com/example/service/ReviewService.java"
printf 'package com.example.service;\npublic class ReviewServiceImpl implements ReviewService {}\n' \
  > "${R}/src/main/java/com/example/service/ReviewServiceImpl.java"
# ③ 对称方向：文档仅点名接口 StockManager（DocC 表格行），实现经别名归档；
#    链侧经 SoloServiceImpl 的字段声明。
printf 'package com.example.manager;\npublic interface StockManager {}\n' \
  > "${R}/src/main/java/com/example/manager/StockManager.java"
printf 'package com.example.manager;\npublic class StockManagerImpl implements StockManager {}\n' \
  > "${R}/src/main/java/com/example/manager/StockManagerImpl.java"
printf 'package com.example.service.impl;\npublic class SoloServiceImpl { private StockManager stockManager; }\n' \
  > "${R}/src/main/java/com/example/service/impl/SoloServiceImpl.java"
# ④ 唯一性守卫：孪生简单名 WeightServiceImpl 在两个包中重复 → WeightService
#    别名关闭，保持未归档（即便文档点名了 WeightServiceImpl、链侧也存在）。
printf 'package com.example.service;\npublic interface WeightService {}\n' \
  > "${R}/src/main/java/com/example/service/WeightService.java"
printf 'package com.example.a;\npublic class WeightServiceImpl {}\n' \
  > "${R}/src/main/java/com/example/a/WeightServiceImpl.java"
printf 'package com.example.b;\npublic class WeightServiceImpl {}\n' \
  > "${R}/src/main/java/com/example/b/WeightServiceImpl.java"
# ④' 镜像守卫：接口简单名 TwinService 本身在两包重复而 TwinServiceImpl 唯一——
#    一份 Impl 点名不得"同时覆盖"两个接口，别名同样关闭。
printf 'package com.example.a;\npublic interface TwinService {}\n' \
  > "${R}/src/main/java/com/example/a/TwinService.java"
printf 'package com.example.b;\npublic interface TwinService {}\n' \
  > "${R}/src/main/java/com/example/b/TwinService.java"
printf 'package com.example.a;\npublic class TwinServiceImpl implements TwinService {}\n' \
  > "${R}/src/main/java/com/example/a/TwinServiceImpl.java"
printf 'package com.example.service.impl;\npublic class DeliveryOrderServiceImpl { private WeightService weightService; }\n' \
  > "${R}/src/main/java/com/example/service/impl/DeliveryOrderServiceImpl.java"
# ② 对照：孪生对两侧都无文档点名 → 双双未归档（别名不得无中生有）。
printf 'package com.example.service;\npublic interface OrphanPairService {}\n' \
  > "${R}/src/main/java/com/example/service/OrphanPairService.java"
printf 'package com.example.service.impl;\npublic class OrphanPairServiceImpl {}\n' \
  > "${R}/src/main/java/com/example/service/impl/OrphanPairServiceImpl.java"
# 别名边界对抗：文档只出现长标识符 TwoCacheServiceImpl（CacheServiceImpl 的
# 前缀超串）——CacheService/CacheServiceImpl 均不得经别名归档。
printf 'package com.example.service;\npublic interface CacheService {}\n' \
  > "${R}/src/main/java/com/example/service/CacheService.java"
printf 'package com.example.service.impl;\npublic class CacheServiceImpl implements CacheService {}\n' \
  > "${R}/src/main/java/com/example/service/impl/CacheServiceImpl.java"
# ⑤ X 与 XImpl 分属两 L2 域文档 → 合并后按接口名报告一次冲突。
printf 'package com.example.service;\npublic interface AliasPairService {}\n' \
  > "${R}/src/main/java/com/example/service/AliasPairService.java"
printf 'package com.example.service;\npublic class AliasPairServiceImpl implements AliasPairService {}\n' \
  > "${R}/src/main/java/com/example/service/AliasPairServiceImpl.java"
# H2 回归族（A179-R2-H2）：接口内容实为 enum → 内容细分 data_type（非阻塞分类），
# 实现正常——两 L2 域各点名一侧时，去重不得把 Impl 行吞成零行（接口侧无报告资格）。
printf 'package com.example.service;\npublic enum EnumTwinService { VALUE_A, VALUE_B }\n' \
  > "${R}/src/main/java/com/example/service/EnumTwinService.java"
printf 'package com.example.service;\npublic class EnumTwinServiceImpl implements EnumTwinService {}\n' \
  > "${R}/src/main/java/com/example/service/EnumTwinServiceImpl.java"
printf 'package com.example.service.impl;\npublic class TableOnlyServiceImpl { private AliasPairService aliasPairService; private ReviewService reviewService; }\n' \
  > "${R}/src/main/java/com/example/service/impl/TableOnlyServiceImpl.java"

# 文档只点名 DeliveryOrderServiceImpl 与 SoloServiceImpl（按路径 + 符号）
cat > "${R}/.sdlc/business_domain/01Domain/0101L2/010101Fixture(测试).md" <<'EOF'
# Fixture

## Entry Chain

| Layer | Entry / Component | Evidence | Status |
| --- | --- | --- | --- |
| RPC | DeliveryOrderServiceImpl | src/main/java/com/example/service/impl/DeliveryOrderServiceImpl.java | verified-code |
| RPC | SoloServiceImpl | src/main/java/com/example/service/impl/SoloServiceImpl.java | verified-code |
EOF

# 表格通道用例：ASCII 表头别名命中 code_anchor —— 单元格里只出现长标识符，
# 独立记录 OrderServiceImpl 不得被该单元格归档；TableOnlyServiceImpl 仅出现在
# 该单元格，必须仍被归档（防止"修严了导致表通道失效"的反向回归）。
cat > "${R}/.sdlc/business_domain/01Domain/0101L2/010102Table(表格通道).md" <<'EOF'
# Table channel

| Layer | Code Anchor | Evidence |
| --- | --- | --- |
| RPC | DeliveryOrderServiceImpl | src/main/java/com/example/service/impl/DeliveryOrderServiceImpl.java |
| RPC | TableOnlyServiceImpl | src/main/java/com/example/service/impl/TableOnlyServiceImpl.java |
EOF

# 别名通道文档（L2 0101）：表格行仅点名接口 StockManager（③ 正向）；
# 文本仅点名 WeightServiceImpl（④ 守卫面）、TwoCacheServiceImpl（边界对抗）、
# AliasPairService（⑤ 接口侧）。
cat > "${R}/.sdlc/business_domain/01Domain/0101L2/010103Alias(别名通道).md" <<'EOF'
# Alias channel

## Entry Chain

| Layer | Entry Name | Evidence | Status |
| --- | --- | --- | --- |
| Manager | StockManager | src/main/java/com/example/manager/StockManager.java | verified-code |

文本通道点名：WeightServiceImpl / TwoCacheServiceImpl / AliasPairService / ReviewServiceImpl / TwinServiceImpl / EnumTwinService
EOF

# ⑤ 实现侧文档（L2 0102，与接口侧异域）：点名 AliasPairServiceImpl 与
# EnumTwinServiceImpl（后者的接口侧为非阻塞分类，H2 回归形态）。
cat > "${R}/.sdlc/business_domain/01Domain/0102L2/010201AliasPair(跨域别名对).md" <<'EOF'
# AliasPair across domains

## Entry Chain

| Layer | Entry / Component | Evidence | Status |
| --- | --- | --- | --- |
| Service | AliasPairServiceImpl | src/main/java/com/example/service/AliasPairServiceImpl.java | verified-code |
| Service | EnumTwinServiceImpl | src/main/java/com/example/service/EnumTwinServiceImpl.java | verified-code |
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

CASE_NAME="audit R2-1b: table channel respects identifier boundaries too"
assert_contains "${UNARCH_ENTRIES}" '`OrderServiceImpl`' "OrderServiceImpl stays unarchived when only named inside a Code Anchor cell"
assert_not_contains "${UNARCH_ENTRIES}" '`TableOnlyServiceImpl`' "a class cited ONLY by a table cell is still archived (no over-tightening)"

CASE_NAME="audit R2-2: self-entry classes are not reported as unarchived core units"
assert_not_contains "${UNARCH_SERVICES}" '`DeliveryOrderServiceImpl`' "self-entry unit absent from unarchived core units"
assert_not_contains "${UNARCH_SERVICES}" '`SoloServiceImpl`' "self-entry unit absent from unarchived core units"
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

# ---- 显式实现别名矩阵（R3 §7 (b) + 唯一性守卫）----
CASE_NAME="audit R3-①: doc naming the unique twin XImpl covers interface X"
assert_not_contains "${UNARCH_SERVICES}" '`ReviewService`' "interface ReviewService archived via DocC's citation of its unique impl ReviewServiceImpl"
CASE_NAME="audit R3-③: doc naming only the interface covers the unique impl (symmetric)"
assert_not_contains "${UNARCH_SERVICES}" '`StockManager`' "interface StockManager archived by its own citation (control)"
assert_not_contains "${UNARCH_SERVICES}" '`StockManagerImpl`' "impl StockManagerImpl archived via interface citation alias"
CASE_NAME="audit R3-④: duplicated twin simple name disables the alias"
assert_contains "${UNARCH_SERVICES}" '`WeightService`' "WeightService stays unarchived: twin WeightServiceImpl is ambiguous (2 packages)"
assert_contains "${UNARCH_SERVICES}" '`TwinService`' "duplicated base simple name (2 TwinService) also disables the alias despite unique TwinServiceImpl"
CASE_NAME="audit R3-②: an unnamed twin pair stays unarchived on both sides"
assert_contains "${UNARCH_SERVICES}" '`OrphanPairService`' "OrphanPairService (layer) stays unarchived when nothing names the pair"
assert_contains "${UNARCH_ENTRIES}" '`OrphanPairServiceImpl`' "OrphanPairServiceImpl (entry) stays unarchived when nothing names the pair"
CASE_NAME="audit R3-boundary: alias evidence respects identifier boundaries"
assert_contains "${UNARCH_SERVICES}" '`CacheService`' "CacheService not aliased by the prefix-superset TwoCacheServiceImpl"
assert_contains "${UNARCH_ENTRIES}" '`CacheServiceImpl`' "CacheServiceImpl not archived by the prefix-superset TwoCacheServiceImpl"
CASE_NAME="audit R3-⑤: X/XImpl spanning two L2 domains report ONE conflict"
assert_contains "${R}/.sdlc/reports/entry_coverage/cross_domain_conflicts.md" '`AliasPairService`' "pair conflict reported once, under the interface name"
assert_not_contains "${R}/.sdlc/reports/entry_coverage/cross_domain_conflicts.md" '`AliasPairServiceImpl`' "no duplicate Impl-side conflict row"
assert_contains "${R}/.sdlc/reports/entry_coverage/entry_coverage_report.md" "| Cross-Domain Conflicts | 2 |" "conflict count = 1 aliased pair + 1 kept Impl row (H2 family)"
CASE_NAME="audit R2-H2: dedup keeps the Impl row when the interface side is non-blocking"
assert_contains "${R}/.sdlc/reports/entry_coverage/cross_domain_conflicts.md" '`EnumTwinServiceImpl`' "Impl row kept: enum-classified interface has no conflict-report eligibility"
assert_not_contains "${R}/.sdlc/reports/entry_coverage/cross_domain_conflicts.md" '`EnumTwinService`' "non-blocking interface itself still yields no conflict row"
CASE_NAME="audit R2-H1/S3: alias fires on BOTH channels with distinguishable reasons"
STOCK_REASON="$(awk -F'\t' '$2=="StockManagerImpl"{print $9}' "${R}/.sdlc/reports/entry_coverage/service_inventory.tsv")"
REVIEW_REASON="$(awk -F'\t' '$2=="ReviewService"{print $9}' "${R}/.sdlc/reports/entry_coverage/service_inventory.tsv")"
if [[ "${STOCK_REASON}" == "table impl_alias=StockManager" ]]; then
  pass "table-channel alias is live: reason = ${STOCK_REASON}"
else
  fail "table-channel alias reason, got: ${STOCK_REASON}"
fi
if [[ "${REVIEW_REASON}" == "text impl alias=ReviewServiceImpl" ]]; then
  pass "text-channel alias intact: reason = ${REVIEW_REASON}"
else
  fail "text-channel alias reason, got: ${REVIEW_REASON}"
fi

echo ""
echo "==== audit-entry-coverage regression summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed ===="
if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo "ALL GREEN"
  exit 0
fi
exit 1
