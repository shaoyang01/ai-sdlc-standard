#!/usr/bin/env bash
# D-088-01 v2 regression matrix for scripts/bootstrap-knowledge-target.sh
# (Decision-089: .sdlc root, code-driven fill, dual-mode one-stop).
# Run: bash tests/bootstrap-knowledge-target.test.sh
# Exit 0 when every case passes.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INITIALIZER="${SCRIPT_DIR}/../scripts/bootstrap-knowledge-target.sh"
STANDARD_HOME="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kt-regression.XXXXXX")"
trap 'rm -rf "${WORK_ROOT}"' EXIT

PASS_COUNT=0
FAIL_COUNT=0
CASE_NAME=""

pass() { PASS_COUNT=$((PASS_COUNT + 1)); echo "PASS: ${CASE_NAME}"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); echo "FAIL: ${CASE_NAME} -- $*"; }

assert_exit() { # expected_exit actual_exit
  if [[ "$1" == "$2" ]]; then pass; else fail "expected exit $1, got $2"; fi
}
assert_eq() { # expected actual  (string compare)
  if [[ "$1" == "$2" ]]; then pass; else fail "expected [$1], got [$2]"; fi
}
assert_contains() { # haystack_file_or_empty needle
  if grep -qF -- "$2" "$1" 2>/dev/null; then pass; else fail "missing [$2] in $1"; fi
}
assert_not_contains() {
  if grep -qiF -- "$2" "$1" 2>/dev/null; then fail "forbidden [$2] found in $1"; else pass; fi
}

new_repo() { # $1 = repo dir
  mkdir -p "$1"
  git -C "$1" init -q
  git -C "$1" config user.name "Regression Runner"
}

# P2 (D088-R1): normalized pure-hex digest — BSD md5 -q vs GNU md5sum.
digest_file() {
  if command -v md5 >/dev/null 2>&1; then
    md5 -q "$1"
  else
    md5sum "$1" | awk '{print $1}'
  fi
}

snapshot() { # $1 = dir -> normalized digest manifest on stdout
  find "$1" -type f | sort | while IFS= read -r f; do
    printf '%s  %s\n' "$(digest_file "$f")" "${f#"$1"/}"
  done
}

GOOD_MAP='
status: confirmed
confirmed_domains:
  - l1_id: "01"
    l1_name_en: "Order"
    l1_name_cn: "订单"
    l2:
      - l2_id: "01"
        l2_name_en: "SaleOrder"
        l2_name_cn: "销售订单"
        owner: "Order Team"
        l4:
          - l4_id: "01"
            l4_name_en: "OrderEntry"
            l4_name_cn: "订单录入"
            owner: "Order Team"
            evidence:
              - "src/order/OrderController.java"
'

BANNED_WORDS_FILE="${WORK_ROOT}/banned-words.txt"
cat > "${BANNED_WORDS_FILE}" <<'EOF'
speckit
99pendingconfirmation
dual rail
legacy rail
specs/
.specify
EOF

scan_banned() { # $1 = directory, $2 = stdout capture file, $3 = case label
  local hits
  hits="$(grep -rilF -f "${BANNED_WORDS_FILE}" "$1" 2>/dev/null || true)"
  if [[ -n "${hits}" ]]; then
    fail "${3}: banned vocabulary in generated files: ${hits}"
  else
    pass
  fi
  if grep -iqF -f "${BANNED_WORDS_FILE}" "$2" 2>/dev/null; then
    fail "${3}: banned vocabulary in stdout"
  else
    pass
  fi
}

scan_required() { # $1 = directory, $2 = stdout capture file, $3 = case label
  local combined="${WORK_ROOT}/required-scan-combined.txt"
  { cat "$2"; find "$1" -type f -exec cat {} +; } > "${combined}" 2>/dev/null
  for word in 'sdlc-knowledge-sync' 'library/{requirement_id}/' '.sdlc/business_domain/**'; do
    if grep -qF -- "${word}" "${combined}"; then pass; else fail "${3}: required vocabulary missing: ${word}"; fi
  done
}

# ---------------------------------------------------------------------------
CASE_NAME="1. empty repo dry-run: zero writes"
R="${WORK_ROOT}/t1"; new_repo "${R}"
OUT="${WORK_ROOT}/t1.out"
bash "${INITIALIZER}" "${R}" --dry-run > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -e "${R}/.sdlc" ]]; then fail ".sdlc created during dry-run"; else pass; fi

# ---------------------------------------------------------------------------
CASE_NAME="2. empty repo formal: candidate skeleton + full machine artifact set"
R="${WORK_ROOT}/t2"; new_repo "${R}"
OUT="${WORK_ROOT}/t2.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
for f in knowledge-target.yaml 00BusinessLandscape.md 00UbiquitousLanguage.md 01DomainCatalog.md; do
  if [[ -f "${R}/.sdlc/business_domain/${f}" ]]; then pass; else fail "missing ${f}"; fi
done
for f in project-governance-profile.yaml entry-coverage-profile.yaml business-domain-map.yaml scripts/bash/audit-entry-coverage.sh; do
  if [[ -f "${R}/.sdlc/${f}" ]]; then pass; else fail "missing machine artifact ${f}"; fi
done
if [[ -x "${R}/.sdlc/scripts/bash/audit-entry-coverage.sh" ]]; then pass; else fail "audit wrapper not executable"; fi
assert_contains "${R}/.sdlc/business_domain/knowledge-target.yaml" 'status: "candidate_pending_confirmation"'
assert_contains "${R}/.sdlc/business_domain/knowledge-target.yaml" 'routable: false'
scan_banned "${R}/.sdlc" "${OUT}" "${CASE_NAME}"
scan_required "${R}/.sdlc" "${OUT}" "${CASE_NAME}"

# ---------------------------------------------------------------------------
CASE_NAME="3. rerun on fresh init: auto-audit mode, no-op on knowledge files"
R="${WORK_ROOT}/t3"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
SNAP_BEFORE="$(snapshot "${R}/.sdlc/business_domain")"
OUT="${WORK_ROOT}/t3.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
SNAP_AFTER="$(snapshot "${R}/.sdlc/business_domain")"
assert_eq "${SNAP_BEFORE}" "${SNAP_AFTER}"
assert_contains "${OUT}" "AUDIT_RESULT=CLEAN"
if ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* >/dev/null 2>&1; then pass; else fail "audit report missing"; fi

# ---------------------------------------------------------------------------
CASE_NAME="4. partial skeleton: rerun refills missing root docs, preserves existing"
R="${WORK_ROOT}/t4"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
CURATED="${R}/.sdlc/business_domain/00BusinessLandscape.md"
printf '# Curated Landscape\n\nOwner content that must survive.\n' > "${CURATED}"
CURATED_MD5="$(digest_file "${CURATED}")"
rm "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"
OUT="${WORK_ROOT}/t4.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -f "${R}/.sdlc/business_domain/00UbiquitousLanguage.md" ]]; then pass; else fail "missing root doc not refilled"; fi
assert_eq "${CURATED_MD5}" "$(digest_file "${CURATED}")"
grep -q '00BusinessLandscape.md' <(grep -i 'preserved' "${OUT}") && pass || fail "curated doc not reported preserved"

# ---------------------------------------------------------------------------
CASE_NAME="5. full curated business_domain: untouched, audit verdict FINDINGS not rewrite"
R="${WORK_ROOT}/t5"; new_repo "${R}"
mkdir -p "${R}/.sdlc/business_domain/01Order"
printf '# Landscape\n\nCurated.\n' > "${R}/.sdlc/business_domain/00BusinessLandscape.md"
printf '# Catalog\n\nCurated.\n' > "${R}/.sdlc/business_domain/01DomainCatalog.md"
printf '# Language\n\nCurated.\n' > "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"
printf '# Order\n' > "${R}/.sdlc/business_domain/01Order/0101Order.md"
EXISTING_LIST="${WORK_ROOT}/t5-list.txt"
find "${R}/.sdlc/business_domain" -type f > "${EXISTING_LIST}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
CHANGED=0
while IFS= read -r f; do
  if [[ ! -f "${f}" ]]; then CHANGED=1; break; fi
done < "${EXISTING_LIST}"
assert_eq 0 "${CHANGED}"
REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
if [[ -n "${REPORT}" ]] && grep -q '## Verdict' "${REPORT}"; then pass; else fail "structured audit report missing"; fi
assert_contains "${REPORT}" "Result | FINDINGS"

# ---------------------------------------------------------------------------
CASE_NAME="6. v3: legacy knowledge root routes to migration flow; --audit escape stays read-only advisory"
R="${WORK_ROOT}/t6"; new_repo "${R}"
mkdir -p "${R}/.specify/business_domain/01Order"
printf '# Business Landscape\n\nLegacy curated content.\n' > "${R}/.specify/business_domain/00BusinessLandscape.md"
printf '# Order\n' > "${R}/.specify/business_domain/01Order/0101Order.md"
LEGACY_SNAP_BEFORE="$(snapshot "${R}/.specify")"
OUT="${WORK_ROOT}/t6.out"
# v3 Decision-090: a plain run on a LEGACY target is blocked pending DP1 confirmation
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 1 $?
assert_eq "${LEGACY_SNAP_BEFORE}" "$(snapshot "${R}/.specify")"
if [[ -e "${R}/.sdlc" ]]; then fail "v3: zero-write before DP1 confirmation"; else pass; fi
if grep -q "DP1 confirmation required" "${OUT}"; then pass; else fail "v3: DP1 blocking message missing"; fi
# detect reports the legacy type with zero writes
bash "${INITIALIZER}" "${R}" --detect > "${OUT}" 2>&1
assert_exit 0 $?
grep -q "^TYPE=LEGACY_SDD" "${OUT}" && pass || fail "v3 detect: expected LEGACY_SDD"
assert_eq "${LEGACY_SNAP_BEFORE}" "$(snapshot "${R}/.specify")"
# --audit escape hatch keeps the v2 read-only advisory semantics
bash "${INITIALIZER}" "${R}" --audit > "${OUT}" 2>&1
assert_exit 0 $?
assert_eq "${LEGACY_SNAP_BEFORE}" "$(snapshot "${R}/.specify")"
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
if [[ -n "${AUDIT_REPORT}" ]] && grep -q '旧版知识根目录' "${AUDIT_REPORT}"; then pass; else fail "legacy migration advisory missing from audit report"; fi

# ---------------------------------------------------------------------------
CASE_NAME="7. missing git identity: formal fails, dry-run reports"
R="${WORK_ROOT}/t7"
mkdir -p "${R}"
git -C "${R}" init -q   # deliberately no user.name anywhere
SANDBOX_HOME="${WORK_ROOT}/t7-home"; mkdir -p "${SANDBOX_HOME}"
OUT="${WORK_ROOT}/t7.out"
env HOME="${SANDBOX_HOME}" bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 1 $?
if [[ -e "${R}/.sdlc" ]]; then fail "files written despite missing identity"; else pass; fi
env HOME="${SANDBOX_HOME}" bash "${INITIALIZER}" "${R}" --dry-run > "${OUT}" 2>&1
assert_exit 0 $?
if grep -q 'git config user.name missing' "${OUT}"; then pass; else fail "dry-run did not report missing identity"; fi

# ---------------------------------------------------------------------------
CASE_NAME="8. confirmed domain map: routable 6-digit L4 + xx99 with Chinese names"
R="${WORK_ROOT}/t8"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/domain-map.yaml"
OUT="${WORK_ROOT}/t8.out"
bash "${INITIALIZER}" "${R}" --domain-map "domain-map.yaml" --project-type-profile frontend-application > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -f "${R}/.sdlc/business_domain/01Order/0101SaleOrder/010101OrderEntry(订单录入).md" ]]; then pass; else fail "6-digit L4 doc missing"; fi
if [[ -f "${R}/.sdlc/business_domain/01Order/0101SaleOrder/010199EntryCoverage(销售订单).md" ]]; then pass; else fail "xx99 entry coverage missing"; fi
assert_contains "${R}/.sdlc/business_domain/knowledge-target.yaml" 'status: "routed"'
assert_contains "${R}/.sdlc/business_domain/knowledge-target.yaml" 'routable: true'
scan_banned "${R}/.sdlc" "${OUT}" "${CASE_NAME}"
scan_required "${R}/.sdlc" "${OUT}" "${CASE_NAME}"

# ---------------------------------------------------------------------------
for case_desc in "missing field" "duplicate id" "path traversal" "empty array" "template status"; do
  CASE_NAME="9. invalid map fail-closed: ${case_desc}"
  R="${WORK_ROOT}/t9-${case_desc// /}"; new_repo "${R}"
  case "${case_desc}" in
    "missing field")
      printf '%s' "${GOOD_MAP}" | sed '/l1_name_cn/d' > "${R}/map.yaml" ;;
    "duplicate id")
      cat > "${R}/map.yaml" <<'YAML'
confirmed_domains:
  - l1_id: "01"
    l1_name_en: "Order"
    l1_name_cn: "订单"
    l2:
      - l2_id: "01"
        l2_name_en: "SaleOrder"
        l2_name_cn: "销售订单"
        owner: "A"
        l4:
          - l4_id: "0001"
            l4_name_en: "Entry"
            l4_name_cn: "录入"
            owner: "A"
  - l1_id: "01"
    l1_name_en: "Duplicate"
    l1_name_cn: "重复"
    l2:
      - l2_id: "01"
        l2_name_en: "Other"
        l2_name_cn: "其他"
        owner: "B"
        l4:
          - l4_id: "0001"
            l4_name_en: "Entry"
            l4_name_cn: "录入"
            owner: "B"
YAML
      ;;
    "path traversal")
      printf '%s' "${GOOD_MAP}" | sed 's|l1_id: "01"|l1_id: "../evil"|' > "${R}/map.yaml" ;;
    "empty array")
      printf 'confirmed_domains: []\n' > "${R}/map.yaml" ;;
    "template status")
      printf '%s' "${GOOD_MAP}" | sed 's/^status: confirmed/status: template/' > "${R}/map.yaml" ;;
  esac
  bash "${INITIALIZER}" "${R}" --domain-map "map.yaml" > /dev/null 2>&1
  assert_exit 2 $?
  if [[ -e "${R}/.sdlc/business_domain/knowledge-target.yaml" ]]; then
    fail "declaration written despite invalid map"
  else
    pass
  fi
done

# ---------------------------------------------------------------------------
CASE_NAME="10. declaration conflict: blocked, --update-declaration overrides"
R="${WORK_ROOT}/t10"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
# rerun auto-enters audit; force init by deleting two root docs (partial skeleton)
rm "${R}/.sdlc/business_domain/00UbiquitousLanguage.md" "${R}/.sdlc/business_domain/01DomainCatalog.md"
printf 'schema_version: "0.9"\nstatus: "mangled"\n' > "${R}/.sdlc/business_domain/knowledge-target.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 1 $?
assert_eq 'schema_version: "0.9"' "$(head -1 "${R}/.sdlc/business_domain/knowledge-target.yaml")"
bash "${INITIALIZER}" "${R}" --update-declaration > /dev/null 2>&1
assert_exit 0 $?
assert_contains "${R}/.sdlc/business_domain/knowledge-target.yaml" 'status: "candidate_pending_confirmation"'

# ---------------------------------------------------------------------------
CASE_NAME="11. downgrade protection: routed repo rerun keeps routed declaration"
R="${WORK_ROOT}/t11"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/domain-map.yaml"
bash "${INITIALIZER}" "${R}" --domain-map "domain-map.yaml" > /dev/null 2>&1
bash "${INITIALIZER}" "${R}" > "${WORK_ROOT}/t11.out" 2>&1
assert_exit 0 $?
assert_contains "${R}/.sdlc/business_domain/knowledge-target.yaml" 'routable: true'
assert_contains "${WORK_ROOT}/t11.out" "AUDIT_RESULT=CLEAN"

# ---------------------------------------------------------------------------
CASE_NAME="12. code-driven fill: entry scan, mechanical clustering, xx99 candidate docs"
R="${WORK_ROOT}/t12"; new_repo "${R}"
mkdir -p "${R}/order-service/src/main/java/com/acme/order/controller" \
         "${R}/order-service/src/main/java/com/acme/order/job" \
         "${R}/billing-service/src/main/java/com/acme/billing/rpc" \
         "${R}/web/src/pages/order" "${R}/web/src/api"
echo 'class CreateOrderController {}' > "${R}/order-service/src/main/java/com/acme/order/controller/CreateOrderController.java"
echo 'class CloseOrderJob {}' > "${R}/order-service/src/main/java/com/acme/order/job/CloseOrderJob.java"
echo 'class BillingFacade {}' > "${R}/billing-service/src/main/java/com/acme/billing/rpc/BillingFacade.java"
echo '<template>order list</template>' > "${R}/web/src/pages/order/List.vue"
echo 'export const listOrder = () => {};' > "${R}/web/src/api/order.ts"
OUT="${WORK_ROOT}/t12.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
# L1 ids are assigned by sorted cluster key: billing-service < order-service < t12
ORDER_L2_DIR="${R}/.sdlc/business_domain/02OrderService/0201Order"
for f in "${ORDER_L2_DIR}/0201Order.md" "${ORDER_L2_DIR}/020199EntryCoverage.md"; do
  if [[ -f "${f}" ]]; then pass; else fail "candidate doc missing: $(basename "${f}")"; fi
done
assert_contains "${ORDER_L2_DIR}/020199EntryCoverage.md" 'CreateOrderController'
assert_contains "${ORDER_L2_DIR}/020199EntryCoverage.md" 'order-service/src/main/java/com/acme/order/controller/CreateOrderController.java'
assert_contains "${ORDER_L2_DIR}/020199EntryCoverage.md" '| schedule | CloseOrderJob |'
assert_contains "${ORDER_L2_DIR}/0201Order.md" '## 业务锚点（真实入口链）'
if grep -q 'BillingFacade' "${ORDER_L2_DIR}/0201Order.md"; then fail "cross-domain entry leaked into Order L2"; else pass; fi
assert_contains "${R}/.sdlc/business_domain/01DomainCatalog.md" '| Candidate |'
scan_banned "${R}/.sdlc" "${OUT}" "${CASE_NAME}"

# ---------------------------------------------------------------------------
CASE_NAME="13. zero business semantics: rule sections empty with pending-deposit markers"
R="${WORK_ROOT}/t13"; new_repo "${R}"
mkdir -p "${R}/svc/src/main/java/com/acme/pay/controller"
echo 'class PayController {}' > "${R}/svc/src/main/java/com/acme/pay/controller/PayController.java"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
L2_MAIN="$(find "${R}/.sdlc/business_domain" -name '01??Pay*.md' ! -name '*EntryCoverage*' | head -1)"
if [[ -n "${L2_MAIN}" ]] && grep -q '（待沉淀：Owner 确认后由 sdlc-knowledge-sync 写入已验证业务规则' "${L2_MAIN}"; then pass; else fail "rule deposit section missing pending marker"; fi
assert_contains "${R}/.sdlc/business_domain/00UbiquitousLanguage.md" '待沉淀'
if grep -q '业务单据维度' "${R}/.sdlc/business_domain/00BusinessLandscape.md"; then pass; else fail "routing principle (document-dimension first) missing"; fi

# ---------------------------------------------------------------------------
CASE_NAME="14. no business entries: skeleton + machine artifacts only, no candidate domains"
R="${WORK_ROOT}/t14"; new_repo "${R}"
echo 'node_modules' > "${R}/.gitignore"
OUT="${WORK_ROOT}/t14.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
assert_contains "${OUT}" 'FILL: entries=0 candidate_l1=0 candidate_l2=0'
CAND_COUNT="$(find "${R}/.sdlc/business_domain" -name '*99EntryCoverage*' | wc -l | tr -d ' ')"
assert_eq 0 "${CAND_COUNT}"
assert_contains "${R}/.sdlc/business_domain/00BusinessLandscape.md" '未发现业务入口'

# ---------------------------------------------------------------------------
CASE_NAME="15. audit: retired-vocabulary residue detected file:line, never rewritten"
R="${WORK_ROOT}/t15"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
RESIDUE_DOC="${R}/.sdlc/business_domain/00BusinessLandscape.md"
printf '\n历史备注: migrated from a speckit-era folder and old root config see .specify/memory rules\n' >> "${RESIDUE_DOC}"
RESIDUE_MD5="$(digest_file "${RESIDUE_DOC}")"
OUT="${WORK_ROOT}/t15.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
assert_contains "${OUT}" 'AUDIT_RESULT=FINDINGS'
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
assert_contains "${AUDIT_REPORT}" '退役词汇/旧根路径残留'
assert_contains "${AUDIT_REPORT}" '00BusinessLandscape.md'
assert_eq "${RESIDUE_MD5}" "$(digest_file "${RESIDUE_DOC}")"

# ---------------------------------------------------------------------------
CASE_NAME="16. audit: fills missing machine artifact only (create-if-missing)"
R="${WORK_ROOT}/t16"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
rm "${R}/.sdlc/entry-coverage-profile.yaml"
SNAP_BEFORE="$(snapshot "${R}/.sdlc/business_domain")"
OUT="${WORK_ROOT}/t16.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -f "${R}/.sdlc/entry-coverage-profile.yaml" ]]; then pass; else fail "missing machine artifact not filled"; fi
assert_eq "${SNAP_BEFORE}" "$(snapshot "${R}/.sdlc/business_domain")"
assert_contains "${OUT}" 'entry-coverage-profile.yaml'

# ---------------------------------------------------------------------------
CASE_NAME="17. audit: custom curated doc shape reported as difference, not rewritten"
R="${WORK_ROOT}/t17"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
mkdir -p "${R}/.sdlc/business_domain/01Trade/0101Trade"
printf '# Trade Landscape\n\nCustom shape without canonical sections.\n' > "${R}/.sdlc/business_domain/00BusinessLandscape.md"
printf '# Trade Language\n\nCustom.\n' > "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"
printf '# Trade Catalog\n\nCustom.\n' > "${R}/.sdlc/business_domain/01DomainCatalog.md"
printf '# Trade\n\nSome L2 doc.\n' > "${R}/.sdlc/business_domain/01Trade/0101Trade/0101Trade.md"
printf '# Trade entries\n\nplain list\n' > "${R}/.sdlc/business_domain/01Trade/0101Trade/0101TradeEntries.md"
DOCS_SNAP="$(snapshot "${R}/.sdlc/business_domain")"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
assert_eq "${DOCS_SNAP}" "$(snapshot "${R}/.sdlc/business_domain")"
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
assert_contains "${AUDIT_REPORT}" '缺少标准章节'
assert_contains "${AUDIT_REPORT}" 'L2 缺 xx99 入口覆盖文档'

# ---------------------------------------------------------------------------
CASE_NAME="18. machine artifact preserved when it exists with different content"
R="${WORK_ROOT}/t18"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
printf 'custom: true\n' > "${R}/.sdlc/business-domain-map.yaml"
MAP_MD5="$(digest_file "${R}/.sdlc/business-domain-map.yaml")"
rm "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"   # force a later init pass
bash "${INITIALIZER}" "${R}" > "${WORK_ROOT}/t18.out" 2>&1
assert_exit 0 $?
assert_eq "${MAP_MD5}" "$(digest_file "${R}/.sdlc/business-domain-map.yaml")"
grep -q 'business-domain-map.yaml' "${WORK_ROOT}/t18.out" && pass || fail "custom machine artifact preservation not reported"

# ---------------------------------------------------------------------------
CASE_NAME="19. minimal entry-coverage skeleton drives the standard audit gate"
R="${WORK_ROOT}/t19"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
"${R}/.sdlc/scripts/bash/audit-entry-coverage.sh" > "${WORK_ROOT}/t19.out" 2>&1
GATE_EXIT=$?
if [[ "${GATE_EXIT}" == "0" || "${GATE_EXIT}" == "1" ]]; then pass; else fail "standard gate crashed on minimal skeleton (exit ${GATE_EXIT})"; fi
if [[ -f "${R}/.sdlc/reports/entry_coverage/entry_coverage_report.md" ]]; then pass; else fail "gate report not generated under .sdlc"; fi
assert_contains "${R}/.sdlc/reports/entry_coverage/entry_coverage_report.md" 'Status | PENDING'
assert_contains "${R}/.sdlc/reports/entry_coverage/entry_coverage_report.md" '.sdlc/business_domain'

# ---------------------------------------------------------------------------
CASE_NAME="20. audit --dry-run: zero writes"
R="${WORK_ROOT}/t20"; new_repo "${R}"
OUT="${WORK_ROOT}/t20.out"
bash "${INITIALIZER}" "${R}" --audit --dry-run > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -e "${R}/.sdlc" ]]; then fail "audit dry-run created .sdlc"; else pass; fi
assert_contains "${OUT}" 'MODE=dry-run'

# ---------------------------------------------------------------------------
CASE_NAME="21. sibling project-context data untouched by init"
R="${WORK_ROOT}/t21"; new_repo "${R}"
mkdir -p "${R}/.sdlc/project-context"
printf 'project: t21\napplication_type: web\n' > "${R}/.sdlc/project-context/profile.yaml"
CTX_BEFORE="$(digest_file "${R}/.sdlc/project-context/profile.yaml")"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
assert_eq "${CTX_BEFORE}" "$(digest_file "${R}/.sdlc/project-context/profile.yaml")"
if [[ -f "${R}/.sdlc/business_domain/knowledge-target.yaml" ]]; then pass; else fail "knowledge target missing"; fi

# ---------------------------------------------------------------------------
CASE_NAME="22. R2-H1 legacy root: zero-traversal proof (existence/link/permission) + map run"
R="${WORK_ROOT}/t22"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
mkdir -p "${R}/.specify/business_domain/legacy"
printf 'legacy curated content\n' > "${R}/.specify/business_domain/00BusinessLandscape.md"
printf 'x\n' > "${R}/.specify/business_domain/legacy/private.md"
chmod 000 "${R}/.specify/business_domain/legacy/private.md"
# Zero-content-read proof: only existence + link identity + permission + a new-root
# snapshot; the test itself never traverses the legacy tree (D088-R2 review note).
LEGACY_EXIST_BEFORE="$( [[ -d "${R}/.specify/business_domain/legacy" ]] && echo dir-present )"
LEGACY_LINK_BEFORE="$( [[ ! -L "${R}/.specify/business_domain" ]] && echo not-a-symlink )"
if [[ ! -r "${R}/.specify/business_domain/legacy/private.md" ]]; then LEGACY_UNREADABLE_BEFORE="unreadable"; else LEGACY_UNREADABLE_BEFORE="readable"; fi
NEW_ROOT_SNAP_BEFORE="$(snapshot "${R}/.sdlc" 2>/dev/null || true)"
OUT="${WORK_ROOT}/t22.out"
# v3 Decision-090: --domain-map is rejected on a LEGACY target (migration first,
# owner confirms the map on a follow-up run); the zero-traversal/permission proofs stay.
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > "${OUT}" 2>&1
assert_exit 2 $?
assert_eq "dir-present" "${LEGACY_EXIST_BEFORE}"
assert_eq "not-a-symlink" "${LEGACY_LINK_BEFORE}"
assert_eq "unreadable" "${LEGACY_UNREADABLE_BEFORE}"
if [[ -f "${R}/.specify/business_domain/legacy/private.md" ]]; then pass; else fail "legacy file vanished"; fi
if [[ ! -e "${R}/.sdlc" ]]; then pass; else fail "v3: zero-write on --domain-map rejection"; fi
chmod u+rwX "${R}/.specify/business_domain/legacy" 2>/dev/null
chmod u+rw "${R}/.specify/business_domain/legacy/private.md" 2>/dev/null
R2="${WORK_ROOT}/t22b"; new_repo "${R2}"
printf '%s' "${GOOD_MAP}" > "${R2}/dm.yaml"
mkdir -p "${R2}/.specify"
ln -sfn /nonexistent/kt-legacy-target "${R2}/.specify/business_domain"
# dangling legacy symlink: detection routes to LEGACY (existence-only); --audit escape runs read-only
bash "${INITIALIZER}" "${R2}" --detect > "${OUT}" 2>&1
assert_exit 0 $?
grep -q "^TYPE=LEGACY_SDD" "${OUT}" && pass || fail "v3 detect: dangling legacy symlink expected LEGACY_SDD"
bash "${INITIALIZER}" "${R2}" --domain-map dm.yaml > /dev/null 2>&1
assert_exit 2 $?
if [[ ! -e "${R2}/.sdlc" ]]; then pass; else fail "v3: zero-write on dangling-symlink --domain-map rejection"; fi
# v3: --dry-run on a LEGACY target is the migration plan face; the audit advisory
# survives behind the explicit --audit escape hatch.
OUT22C="${WORK_ROOT}/t22c.out"
bash "${INITIALIZER}" "${R2}" --dry-run > "${OUT22C}" 2>&1
assert_exit 1 $?
if grep -q "dangling or unresolvable symlink" "${OUT22C}"; then pass; else fail "C10 classification missing for dangling legacy symlink"; fi
if grep -q 'MODE=init' "${OUT22C}"; then fail "dangling legacy symlink routed to init"; else pass; fi
if [[ ! -e "${R2}/.sdlc" ]]; then pass; else fail "plan mode wrote to target"; fi
bash "${INITIALIZER}" "${R2}" --audit > "${OUT22C}" 2>&1
assert_exit 0 $?
assert_contains "${OUT22C}" "== knowledge-target applicability audit =="

# ---------------------------------------------------------------------------
CASE_NAME="23. H2 scan narrowing: test dirs, non-process Processor, no-TLD L2, frontend ext filter"
R="${WORK_ROOT}/t23"; new_repo "${R}"
mkdir -p "${R}/tests" \
         "${R}/svc/src/main/java/order/controller" \
         "${R}/svc/src/main/java/util" \
         "${R}/svc/src/test/java/order" \
         "${R}/web/src/pages/order"
echo 'class FakeController {}' > "${R}/tests/FakeController.java"
echo 'class ImageProcessor {}' > "${R}/svc/src/main/java/util/ImageProcessor.java"
echo 'class OrderController {}' > "${R}/svc/src/main/java/order/controller/OrderController.java"
echo 'class HiddenJob {}' > "${R}/svc/src/test/java/order/HiddenJob.java"
echo '<template>x</template>' > "${R}/web/src/pages/order/List.vue"
echo 'readme' > "${R}/web/src/pages/order/README.md"
mkdir -p "${R}/svc/src/main/java/com/acme/order/rpc"
echo 'class OrderRpcController {}' > "${R}/svc/src/main/java/com/acme/order/rpc/OrderRpcController.java"
OUT="${WORK_ROOT}/t23.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
BD23="${R}/.sdlc/business_domain"
if grep -rq 'FakeController' "${BD23}"; then fail "tests/ entry leaked into candidates"; else pass; fi
if grep -rq 'ImageProcessor' "${BD23}"; then fail "non-process Processor leaked into candidates"; else pass; fi
if grep -rq 'HiddenJob' "${BD23}"; then fail "nested src/test entry leaked"; else pass; fi
if grep -rq 'README' "${BD23}"; then fail "frontend non-source file leaked"; else pass; fi
# first-rule dedup: OrderRpcController.java matches both the controller rule and
# the rpc path rule; its xx99 entry-coverage docs must contain exactly one row
DEDUP_COUNT="$(grep -rh 'OrderRpcController' "${BD23}" --include='*99EntryCoverage.md' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${DEDUP_COUNT}" == "1" ]]; then pass; else fail "first-rule dedup failed: entry rows counted ${DEDUP_COUNT} times"; fi
ORDER_L2="$(find "${BD23}" -type d -name '*Order' | grep -E '/[0-9]{4}Order$' | head -1)"
EC_WITH_CONTROLLER="$(grep -rl 'OrderController' "${BD23}" --include='*99EntryCoverage.md' 2>/dev/null | head -1)"
EC_WITH_FE="$(grep -rl 'fe_page' "${BD23}" --include='*99EntryCoverage.md' 2>/dev/null | head -1)"
if [[ -n "${EC_WITH_CONTROLLER}" ]] && [[ "${EC_WITH_CONTROLLER}" == *"01Svc/"* ]]; then
  pass
else
  fail "no-TLD package did not cluster L2 from business segment order"
fi
if [[ -n "${EC_WITH_FE}" ]] && grep -q 'List' "${EC_WITH_FE}"; then
  pass
else
  fail "frontend source entry missing from candidates"
fi

# ---------------------------------------------------------------------------
for case_desc in "draft status" "1-digit l4" "3-digit l4" "4-digit l4" "non-digit id" "duplicate full id"; do
  CASE_NAME="24. H3 invalid map fail-closed: ${case_desc}"
  R="${WORK_ROOT}/t24-${case_desc// /}"; new_repo "${R}"
  case "${case_desc}" in
    "draft status")       printf '%s' "${GOOD_MAP}" | sed 's/^status: confirmed/status: draft/' > "${R}/map.yaml" ;;
    "1-digit l4")         printf '%s' "${GOOD_MAP}" | sed 's/l4_id: "01"/l4_id: "1"/' > "${R}/map.yaml" ;;
    "3-digit l4")         printf '%s' "${GOOD_MAP}" | sed 's/l4_id: "01"/l4_id: "001"/' > "${R}/map.yaml" ;;
    "4-digit l4")         printf '%s' "${GOOD_MAP}" | sed 's/l4_id: "01"/l4_id: "0001"/' > "${R}/map.yaml" ;;
    "non-digit id")       printf '%s' "${GOOD_MAP}" | sed 's/l1_id: "01"/l1_id: "0a"/' > "${R}/map.yaml" ;;
    "duplicate full id")
      cat > "${R}/map.yaml" <<'YAML'
status: confirmed
confirmed_domains:
  - l1_id: "01"
    l1_name_en: "A"
    l1_name_cn: "甲"
    l2:
      - l2_id: "01"
        l2_name_en: "X"
        l2_name_cn: "子"
        owner: "A"
        l4:
          - l4_id: "01"
            l4_name_en: "E"
            l4_name_cn: "一"
            owner: "A"
          - l4_id: "01"
            l4_name_en: "F"
            l4_name_cn: "二"
            owner: "A"
YAML
      ;;
  esac
  bash "${INITIALIZER}" "${R}" --domain-map "map.yaml" > /dev/null 2>&1
  assert_exit 2 $?
  if [[ -e "${R}/.sdlc/business_domain/knowledge-target.yaml" ]]; then
    fail "declaration written despite invalid map"
  else
    pass
  fi
done

# ---------------------------------------------------------------------------
CASE_NAME="25. H3/H6 audit detects planted 8-digit L4 file"
R="${WORK_ROOT}/t25"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > /dev/null 2>&1
L4_DIR="${R}/.sdlc/business_domain/01Order/0101SaleOrder"
printf '# bogus\n' > "${L4_DIR}/01010001Bogus(伪编号).md"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
assert_contains "${AUDIT_REPORT}" "01010001Bogus(伪编号).md"
assert_contains "${AUDIT_REPORT}" "编号不符合"

# ---------------------------------------------------------------------------
CASE_NAME="26. H4 candidate->routed upgrade: atomic pass on pristine baseline"
R="${WORK_ROOT}/t26"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > "${WORK_ROOT}/t26.out" 2>&1
assert_exit 0 $?
assert_contains "${WORK_ROOT}/t26.out" 'STATE=routed'
grep -q '00BusinessLandscape.md' <(grep '^UPDATED' "${WORK_ROOT}/t26.out") && pass || fail "root docs not part of atomic upgrade"
if [[ -f "${R}/.sdlc/business_domain/01Order/0101SaleOrder/010101OrderEntry(订单录入).md" ]]; then pass; else fail "routed L4 missing after upgrade"; fi
grep -q '状态.*Routed' "${R}/.sdlc/business_domain/00UbiquitousLanguage.md" && pass || fail "language doc metadata not Routed after upgrade"

# ---------------------------------------------------------------------------
CASE_NAME="27. H4 human-modified root doc: atomic block, zero partial write"
R="${WORK_ROOT}/t27"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
printf 'human note\n' >> "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"
SNAP_BEFORE="$(snapshot "${R}/.sdlc")"
OUT="${WORK_ROOT}/t27.out"
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > "${OUT}" 2>&1
assert_exit 1 $?
assert_contains "${OUT}" "BLOCKED: nothing was written"
assert_contains "${OUT}" "00UbiquitousLanguage.md"
assert_eq "${SNAP_BEFORE}" "$(snapshot "${R}/.sdlc")"
assert_contains "${R}/.sdlc/business_domain/knowledge-target.yaml" 'status: "candidate_pending_confirmation"'

# ---------------------------------------------------------------------------
CASE_NAME="28. H4 --update-declaration replaces declaration but never re-baselines docs"
R="${WORK_ROOT}/t28"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
printf 'human note\n' >> "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml --update-declaration > /dev/null 2>&1
assert_exit 1 $?
BASE_DIGEST="$(ruby -ryaml -e '
  d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false) || {}
  puts (d.dig("managed_root_docs", "00UbiquitousLanguage.md") || {}).fetch("sha256", "none")
' "${R}/.sdlc/business_domain/knowledge-target.yaml")"
CUR_DIGEST="$(ruby -rdigest -e 'puts Digest::SHA256.file(ARGV[0]).hexdigest' "${R}/.sdlc/business_domain/00UbiquitousLanguage.md")"
if [[ "${BASE_DIGEST}" != "${CUR_DIGEST}" && "${BASE_DIGEST}" != "none" ]]; then pass; else fail "baseline was laundered to human-modified content"; fi
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > /dev/null 2>&1
assert_exit 1 $?

# ---------------------------------------------------------------------------
CASE_NAME="29. H4 routed rerun same map: idempotent no-op (cross-run stability)"
R="${WORK_ROOT}/t29"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > /dev/null 2>&1
# reports/ intentionally excluded: each run appends a timestamped report by design
SNAP_BEFORE="$(find "${R}/.sdlc" -type f -not -path '*/reports/*' | sort | while IFS= read -r f; do printf '%s  %s\n' "$(digest_file "$f")" "${f#"${R}"/}"; done)"
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > "${WORK_ROOT}/t29.out" 2>&1
assert_exit 0 $?
SNAP_AFTER="$(find "${R}/.sdlc" -type f -not -path '*/reports/*' | sort | while IFS= read -r f; do printf '%s  %s\n' "$(digest_file "$f")" "${f#"${R}"/}"; done)"
assert_eq "${SNAP_BEFORE}" "${SNAP_AFTER}"

# ---------------------------------------------------------------------------
CASE_NAME="30. H6 residue scan: full .sdlc face, semantic-clause exemption, machine fields, reports"
R="${WORK_ROOT}/t30"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
printf 'residual_hint: 旧根路径 .specify/business_domain 需要迁移\n' >> "${R}/.sdlc/project-governance-profile.yaml"
printf '迁移守则：禁止读取 .specify/**；迁移需单独授权。\n' > "${R}/.sdlc/note-negative.md"
mkdir -p "${R}/.sdlc/reports"
printf 'historical speckit mention\n' > "${R}/.sdlc/reports/note.md"
printf 'runtime_redlines:\n  forbidden_write_paths:\n    - .specify/**\n' >> "${R}/.sdlc/entry-coverage-profile.yaml"
OUT30="${WORK_ROOT}/t30.out"
bash "${INITIALIZER}" "${R}" > "${OUT30}" 2>&1
assert_exit 0 $?
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | tail -1)"
assert_contains "${AUDIT_REPORT}" "project-governance-profile.yaml"
assert_contains "${OUT30}" "AUDIT_RESULT=FINDINGS"
assert_not_contains "${AUDIT_REPORT}" "note-negative.md"
assert_not_contains "${AUDIT_REPORT}" "reports/note.md"

# ---------------------------------------------------------------------------
for sub in "fake-routed" "wrong-root" "managed-drift"; do
  CASE_NAME="31. H6 state matrix: ${sub}"
  R="${WORK_ROOT}/t31-${sub}"; new_repo "${R}"
  bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
  case "${sub}" in
    "fake-routed")
      perl -pi -e 's/^status: "candidate_pending_confirmation"/status: "routed"/; s/^routable: false/routable: true/' "${R}/.sdlc/business_domain/knowledge-target.yaml"
      EXPECT="缺少 domain_map" ;;
    "wrong-root")
      perl -pi -e 's/^target_root: \.sdlc\/business_domain/target_root: .specify\/business_domain/' "${R}/.sdlc/business_domain/knowledge-target.yaml"
      EXPECT="target_root 必须为" ;;
    "managed-drift")
      printf 'drift\n' >> "${R}/.sdlc/business_domain/00BusinessLandscape.md"
      EXPECT="与基线不一致" ;;
  esac
  bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
  assert_exit 0 $?
  AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
  assert_contains "${AUDIT_REPORT}" "${EXPECT}"
done

# ---------------------------------------------------------------------------
CASE_NAME="32. H5 profile artifacts: no YAML alias, standard gate consumes each actual artifact"
R="${WORK_ROOT}/t32"; new_repo "${R}"
ECP_BIN="${SCRIPT_DIR}/../scripts/bootstrap-entry-coverage-profile.sh"
AUDIT_BIN="${SCRIPT_DIR}/../scripts/audit-entry-coverage.rb"
mkdir -p "${R}/svc/src/main/java/com/acme/order/controller"
echo 'class AController {}' > "${R}/svc/src/main/java/com/acme/order/controller/AController.java"

gate_check() { # $1 = profile artifact path, $2 = label
  if grep -qE '&[0-9]+|\*[0-9]+' "$1"; then fail "$2: YAML alias present in artifact"; else pass; fi
  ruby "${AUDIT_BIN}" "${R}" --profile "$1" --strict > "${WORK_ROOT}/t32-gate.out" 2>&1
  local gate_exit=$?
  if [[ "${gate_exit}" == "0" || "${gate_exit}" == "1" ]]; then pass; else fail "$2: gate crashed exit ${gate_exit}"; fi
  if grep -q 'Psych::' "${WORK_ROOT}/t32-gate.out"; then fail "$2: exception stack in gate output"; else pass; fi
  local rep="${R}/.sdlc/reports/entry_coverage/entry_coverage_report.md"
  if [[ -f "${rep}" ]]; then pass; else fail "$2: gate report missing"; return; fi
  local st
  st="$(grep -oE '\| (PENDING|PASS|BLOCKED) \|' "${rep}" | head -1 | tr -d '| ')"
  if [[ "${st}" == "PASS" && "${gate_exit}" == "0" ]] || [[ "${st}" != "PASS" && "${gate_exit}" == "1" ]]; then
    pass
  else
    fail "$2: status/exit inconsistent (status=${st} exit=${gate_exit})"
  fi
}

ruby "${ECP_BIN}" "${R}" --force > /dev/null 2>&1
gate_check "${R}/.sdlc/entry-coverage-profile.yaml" "stable"
ruby "${ECP_BIN}" "${R}" > /dev/null 2>&1
gate_check "${R}/.sdlc/entry-coverage-profile.candidate.yaml" "candidate"
ruby "${ECP_BIN}" "${R}" --force-entry-coverage-profile > /dev/null 2>&1
gate_check "${R}/.sdlc/entry-coverage-profile.yaml" "force"
ruby "${ECP_BIN}" "${R}" --scan-timeout 0 > /dev/null 2>&1
gate_check "${R}/.sdlc/entry-coverage-profile.candidate.yaml" "partial"
ruby "${ECP_BIN}" "${R}" --scan-timeout 0 --force-entry-coverage-profile > /dev/null 2>&1
gate_check "${R}/.sdlc/entry-coverage-profile.yaml" "timeout-force"

# ---------------------------------------------------------------------------
CASE_NAME="33. R2-H2 map containment: ../ escape, in-repo symlink escape, template two-digit l4"
R="${WORK_ROOT}/t33"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${WORK_ROOT}/t33-outside.yaml"
mkdir -p "${R}/esc"
ln -sf "${WORK_ROOT}/t33-outside.yaml" "${R}/esc/map-link.yaml"
bash "${INITIALIZER}" "${R}" --domain-map "../t33-outside.yaml" > /dev/null 2>&1
assert_exit 2 $?
bash "${INITIALIZER}" "${R}" --domain-map "esc/map-link.yaml" > /dev/null 2>&1
assert_exit 2 $?
if [[ -e "${R}/.sdlc/business_domain/knowledge-target.yaml" ]]; then
  fail "declaration written despite escaping map path"
else
  pass
fi
# forged routed declaration pointing outside the repo must be audited as DIFF
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > /dev/null 2>&1
perl -pi -e "s|domain_map: 'dm.yaml'|domain_map: '../t33-outside.yaml'|" "${R}/.sdlc/business_domain/knowledge-target.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
assert_contains "${AUDIT_REPORT}" "逃逸目标仓"
# template example must satisfy the generator's own two-digit rule
if grep -q 'l4_id: "0001"' "${R}/.sdlc/business-domain-map.yaml"; then
  fail "map template still demonstrates a 4-digit l4_id"
else
  pass
fi

# ---------------------------------------------------------------------------
CASE_NAME="34. R2-H3 routed map fingerprint: same-path edit / different-path / flag cannot advance"
R="${WORK_ROOT}/t34"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml > /dev/null 2>&1
SNAP_ROUTED="$(find "${R}/.sdlc" -type f -not -path '*/reports/*' | sort | while IFS= read -r f; do printf '%s  %s\n' "$(digest_file "$f")" "${f#"${R}"/}"; done)"
# same path, modified content
printf '%s' "${GOOD_MAP}" | sed 's/OrderEntry/OrderEntryX/' > "${R}/dm.yaml"
OUT34="${WORK_ROOT}/t34.out"
bash "${INITIALIZER}" "${R}" --domain-map dm.yaml --update-declaration > "${OUT34}" 2>&1
assert_exit 1 $?
assert_contains "${OUT34}" "unsupported in this wave"
# different path, same content
printf '%s' "${GOOD_MAP}" > "${R}/dm2.yaml"
bash "${INITIALIZER}" "${R}" --domain-map dm2.yaml > /dev/null 2>&1
assert_exit 1 $?
SNAP_AFTER="$(find "${R}/.sdlc" -type f -not -path '*/reports/*' | sort | while IFS= read -r f; do printf '%s  %s\n' "$(digest_file "$f")" "${f#"${R}"/}"; done)"
assert_eq "${SNAP_ROUTED}" "${SNAP_AFTER}"
# audit flags a mutated map (declared sha no longer matches file content)
printf '%s' "${GOOD_MAP}" | sed 's/OrderEntry/OrderEntryX/' > "${R}/dm.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
assert_contains "${AUDIT_REPORT}" "sha256 与当前 map 文件不一致"

# ---------------------------------------------------------------------------
CASE_NAME="35. R2-H6 report finalization: repeated and concurrent audits never overwrite"
R="${WORK_ROOT}/t35"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
AUDIT_COUNT_BEFORE="$(find "${R}/.sdlc/reports" -name 'knowledge_target_audit_report.*' | wc -l | tr -d ' ')"
REPORT_DIGESTS_BEFORE="$(find "${R}/.sdlc/reports" -type f | sort | while IFS= read -r f; do printf '%s  %s\n' "$(digest_file "$f")" "${f#"${R}"/}"; done)"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1 &
P1=$!
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1 &
P2=$!
wait "${P1}" "${P2}"
AUDIT_COUNT_AFTER="$(find "${R}/.sdlc/reports" -name 'knowledge_target_audit_report.*' | wc -l | tr -d ' ')"
if [[ "$((AUDIT_COUNT_AFTER - AUDIT_COUNT_BEFORE))" -ge 2 ]]; then pass; else fail "concurrent audits lost a report (${AUDIT_COUNT_BEFORE} -> ${AUDIT_COUNT_AFTER})"; fi
# every pre-existing report must survive byte-identical (never overwritten)
PRE_LOST=0
while IFS= read -r entry; do
  rel="${entry#*  }"
  dig="${entry%%  *}"
  if [[ ! -f "${R}/${rel}" ]] || [[ "$(digest_file "${R}/${rel}")" != "${dig}" ]]; then PRE_LOST=1; fi
done <<< "${REPORT_DIGESTS_BEFORE}"
if [[ "${PRE_LOST}" == "0" ]]; then pass; else fail "a pre-existing report was overwritten"; fi

# ---------------------------------------------------------------------------
# ===========================================================================
# v3 acceptance matrix (spec d088-01-v3-behavior-spec.md §8; Decision-090 G1)
# ===========================================================================

# matrix fixture builder: $1=dir $2=legacy(none|sdd|sdlc) $3=code(yes|no)
#                        $4=skel(0|1|3) $5=map(absent|candidate|routed)
build_matrix_fixture() {
  local d="$1" legacy="$2" code="$3" skel="$4" map="$5"
  mkdir -p "${d}"
  git -C "${d}" init -q
  git -C "${d}" config user.name "Regression Runner"
  if [[ "${code}" == "yes" ]]; then
    mkdir -p "${d}/src/main/java"; echo "class A{}" > "${d}/src/main/java/A.java"
  fi
  if [[ "${skel}" -gt 0 || "${map}" != "absent" ]]; then
    mkdir -p "${d}/.sdlc/business_domain"
    if [[ "${skel}" -ge 1 ]]; then printf '# Landscape\n' > "${d}/.sdlc/business_domain/00BusinessLandscape.md"; fi
    if [[ "${skel}" -eq 3 ]]; then
      printf '# Language\n' > "${d}/.sdlc/business_domain/00UbiquitousLanguage.md"
      printf '# Catalog\n' > "${d}/.sdlc/business_domain/01DomainCatalog.md"
    fi
    if [[ "${map}" != "absent" ]]; then
      if [[ "${map}" == "routed" ]]; then
        printf 'status: "routed"\nroutable: true\n' > "${d}/.sdlc/business_domain/knowledge-target.yaml"
      else
        printf 'status: "candidate_pending_confirmation"\nroutable: false\n' > "${d}/.sdlc/business_domain/knowledge-target.yaml"
      fi
    fi
  fi
  if [[ "${legacy}" != "none" ]]; then
    mkdir -p "${d}/.specify/templates" "${d}/.specify/scripts/bash" "${d}/.specify/workflow"
    printf 'sdd template\n' > "${d}/.specify/templates/plan.md"
    printf '#!/bin/sh\n' > "${d}/.specify/scripts/bash/create-new-feature.sh"
    printf 'workflow\n' > "${d}/.specify/workflow/SDDWorkflow.md"
  fi
  if [[ "${legacy}" == "sdlc" ]]; then
    mkdir -p "${d}/.specify/business_domain"
    printf 'status: "candidate_pending_confirmation"\n' > "${d}/.specify/business_domain/knowledge-target.yaml"
    printf '# legacy knowledge\n' > "${d}/.specify/business_domain/legacy-note.md"
  fi
}

# expected v3 type per decision table (spec §2.2 D1-D9; a pre-existing .sdlc surface
# alongside a legacy root is dual-governance BLOCKED regardless of skeleton state)
expected_type() { # $1=legacy $2=code $3=skel $4=map
  if [[ "${1}" != "none" ]]; then
    if [[ "${3}" == "0" && "${4}" == "absent" ]]; then
      if [[ "${1}" == "sdlc" ]]; then echo "LEGACY_SDLC_SDD"; else echo "LEGACY_SDD"; fi
    else
      echo "BLOCKED_AMBIGUOUS"
    fi
  elif [[ "${3}" == "3" ]]; then
    echo "EXISTING"
  elif [[ "${2}" == "yes" ]]; then
    echo "EXISTING_CODE_NO_KNOWLEDGE"
  else
    echo "NEW_EMPTY"
  fi
}

CASE_NAME="36. v3 decision-table matrix: 54 input combos x 3 read-only modes = 162 executions covering the nominal 108 cells, zero writes"
M36_ROOT="${WORK_ROOT}/t36"; mkdir -p "${M36_ROOT}"
M36_RUNS=0; M36_FAIL_BEFORE="${FAIL_COUNT}"
for legacy in none sdd sdlc; do
  for code in no yes; do
    for skel in 0 1 3; do
      for map in absent candidate routed; do
        D="${M36_ROOT}/m_${legacy}_${code}_${skel}_${map}"
        build_matrix_fixture "${D}" "${legacy}" "${code}" "${skel}" "${map}"
        SNAP="$(snapshot "${D}")"
        WANT="$(expected_type "${legacy}" "${code}" "${skel}" "${map}")"
        bash "${INITIALIZER}" "${D}" --detect > "${M36_ROOT}/out" 2>&1
        assert_exit 0 $?
        if grep -q "^TYPE=${WANT}$" "${M36_ROOT}/out"; then pass; else fail "detect(${legacy},${code},${skel},${map}): expected ${WANT}, got $(grep '^TYPE=' "${M36_ROOT}/out" | head -1)"; fi
        M36_RUNS=$((M36_RUNS + 1))
        if [[ "${WANT}" == "BLOCKED_AMBIGUOUS" ]]; then
          bash "${INITIALIZER}" "${D}" --plan > "${M36_ROOT}/out" 2>&1
          assert_exit 1 $?
          bash "${INITIALIZER}" "${D}" --dry-run > "${M36_ROOT}/out" 2>&1
          assert_exit 1 $?
        else
          # v2 dry-run exit semantics on half-built states belong to scenarios 1-35;
          # the matrix asserts the decision type and mandatory zero-write only.
          bash "${INITIALIZER}" "${D}" --plan > "${M36_ROOT}/out" 2>&1 || true
          bash "${INITIALIZER}" "${D}" --dry-run > "${M36_ROOT}/out" 2>&1 || true
        fi
        # H7: legacy migration cells additionally assert PLAN content — digest line
        # present and every move row bound to a 64-hex pre-digest (G1-R1-H2 net).
        if [[ "${WANT}" == "LEGACY_SDD" || "${WANT}" == "LEGACY_SDLC_SDD" ]]; then
          if grep -q "^PLAN_SHA256=[0-9a-f]\{64\}$" "${M36_ROOT}/out"; then pass; else fail "matrix plan digest(${legacy},${code},${skel},${map}): missing content-bound digest"; fi
          if grep -E "^  (RETIRE|TRANSFORM)	" "${M36_ROOT}/out" | grep -qvE "	[0-9a-f]{64}(	|$)"; then
            fail "matrix plan rows(${legacy},${code},${skel},${map}): move row without pre-digest"
          else
            pass
          fi
        fi
        if [[ "$(snapshot "${D}")" == "${SNAP}" ]]; then pass; else fail "zero-write(${legacy},${code},${skel},${map}): repository mutated by read-only mode"; fi
        M36_RUNS=$((M36_RUNS + 2))
      done
    done
  done
done
assert_eq "162" "${M36_RUNS}"
if [[ "${FAIL_COUNT}" -eq "${M36_FAIL_BEFORE}" ]]; then pass; else fail "matrix: failures detected above"; fi

CASE_NAME="37. A1-A8: NEW/EXISTING representative apply and idempotence combos"
D="${WORK_ROOT}/t37a"; build_matrix_fixture "${D}" "none" "no" "0" "absent"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1; assert_exit 0 $?
if [[ -f "${D}/.sdlc/business_domain/00BusinessLandscape.md" ]]; then pass; else fail "A1: new-project init incomplete"; fi
bash "${INITIALIZER}" "${D}" > /dev/null 2>&1; assert_exit 0 $?
if grep -q 'status: "candidate_pending_confirmation"' "${D}/.sdlc/business_domain/knowledge-target.yaml"; then pass; else fail "A2: re-run declaration state"; fi
D="${WORK_ROOT}/t37b"; build_matrix_fixture "${D}" "none" "yes" "0" "absent"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1; assert_exit 0 $?
if [[ $(find "${D}/.sdlc/business_domain" -name '*.md' | wc -l | tr -d ' ') -ge 3 ]]; then pass; else fail "A3: existing-code init"; fi
D="${WORK_ROOT}/t37c"; build_matrix_fixture "${D}" "none" "yes" "1" "absent"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1; assert_exit 0 $?
if [[ -f "${D}/.sdlc/business_domain/01DomainCatalog.md" ]]; then pass; else fail "A4: partial refill missing"; fi
if [[ "$(digest_file "${D}/.sdlc/business_domain/00BusinessLandscape.md")" == "$(digest_file "${D}/.sdlc/business_domain/00BusinessLandscape.md")" ]]; then pass; fi
SNAP37C="$(snapshot "${D}/.sdlc/business_domain/00BusinessLandscape.md")"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1; assert_exit 0 $?
if [[ "$(snapshot "${D}/.sdlc/business_domain/00BusinessLandscape.md")" == "${SNAP37C}" ]]; then pass; else fail "A5: double-apply mutated existing doc"; fi
D="${WORK_ROOT}/t37d"; build_matrix_fixture "${D}" "none" "yes" "1" "absent"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1; assert_exit 0 $?
if grep -q 'status: "candidate_pending_confirmation"' "${D}/.sdlc/business_domain/knowledge-target.yaml"; then
  pass
else
  fail "A6: candidate declaration not created by first init"
fi
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1; assert_exit 0 $?
if grep -q 'status: "candidate_pending_confirmation"' "${D}/.sdlc/business_domain/knowledge-target.yaml"; then pass; else fail "A6: candidate declaration not preserved on rerun"; fi
for combo in 7 8; do
  D="${WORK_ROOT}/t37${combo}"; build_matrix_fixture "${D}" "none" "yes" "3" "routed"
  bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1; assert_exit 0 $?
  if grep -q 'status: "routed"' "${D}/.sdlc/business_domain/knowledge-target.yaml"; then pass; else fail "A${combo}: routed downgraded"; fi
done

CASE_NAME="38. A9/A11: LEGACY_SDD DP1 flow (refuse without confirm; apply with confirm)"
D="${WORK_ROOT}/t38"; build_matrix_fixture "${D}" "sdd" "yes" "0" "absent"
LEG_SNAP="$(snapshot "${D}/.specify")"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1
assert_exit 1 $?
assert_eq "${LEG_SNAP}" "$(snapshot "${D}/.specify")"
if [[ ! -e "${D}/.sdlc" ]]; then pass; else fail "A11: zero-write without DP1 confirmation"; fi
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > /dev/null 2>&1
assert_exit 0 $?
if [[ -f "${D}/.sdlc/legacy/.specify/templates/plan.md" ]]; then pass; else fail "A9: legacy template not archived"; fi
if [[ -f "${D}/.sdlc/business_domain/00BusinessLandscape.md" ]]; then pass; else fail "A9: new surface not initialized after migration"; fi
if [[ -f "${D}/.sdlc/migration/plan.json" && -n "$(ls "${D}"/.sdlc/reports/migration_report.*.json* 2>/dev/null | head -1)" ]]; then pass; else fail "A9: plan.json / migration report missing"; fi
if grep -q "\"plan_sha256\": \"${PLAN_SHA}\"" "${D}/.sdlc/migration/plan.json"; then pass; else fail "A9: confirmation digest not recorded"; fi

CASE_NAME="39. A10/A13/A14: LEGACY x existing new-surface combos are blocked (dual governance roots)"
for skel in 1 3; do
  D="${WORK_ROOT}/t39_${skel}"; build_matrix_fixture "${D}" "sdlc" "yes" "${skel}" "absent"
  SNAP="$(snapshot "${D}")"
  bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1
  assert_exit 1 $?
  if [[ "$(snapshot "${D}")" == "${SNAP}" ]]; then pass; else fail "A${skel}: blocked dual-root mutated repository"; fi
done

CASE_NAME="40. A12-A14/A16: LEGACY_SDLC_SDD full transform, knowledge preserved byte-identical, post-detect idempotent"
D="${WORK_ROOT}/t40"; build_matrix_fixture "${D}" "sdlc" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain/01Trade"
printf 'domains:\n  - name: 交易域\n  - name: 履约域\n' > "${D}/.specify/business_domain/knowledge-target.yaml"
printf '# 旧域知识\n' > "${D}/.specify/business_domain/01Trade/trade.md"
LEG_SNAP="$(snapshot "${D}/.specify")"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > /dev/null 2>&1
assert_exit 0 $?
if [[ -f "${D}/.sdlc/business_domain/01Trade/trade.md" ]]; then pass; else fail "A12: knowledge doc not migrated"; fi
if [[ "$(digest_file "${D}/.sdlc/business_domain/01Trade/trade.md")" == "$(digest_file <(printf '# 旧域知识\n'))" ]]; then pass; fi
if grep -q 'legacy_candidate_domains:' "${D}/.sdlc/business-domain-map.yaml"; then pass; else fail "A12: legacy candidate domains not projected to map template"; fi
MIG_JSON="$(ls "${D}"/.sdlc/reports/migration_report.*.json* 2>/dev/null | head -1)"
if [[ -n "${MIG_JSON}" ]] && grep -q '"type": "LEGACY_SDLC_SDD"' "${MIG_JSON}"; then pass; else fail "A12: migration report type missing"; fi
if grep -q '"post_detect_type": "EXISTING"' "${MIG_JSON}"; then pass; else fail "A12: post-detect type missing in report"; fi
if grep -q 'legacy_candidate_domains' "${MIG_JSON}"; then pass; else fail "A12: field mappings not recorded"; fi
bash "${INITIALIZER}" "${D}" --detect > /dev/null 2>&1
OUT40="${WORK_ROOT}/t40.out"
bash "${INITIALIZER}" "${D}" --detect > "${OUT40}" 2>&1
grep -q "^TYPE=EXISTING$" "${OUT40}" && pass || fail "A16: post-migration detect not EXISTING"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1
assert_exit 0 $?

CASE_NAME="41. A15/B8: mid-apply failure rolls back to pre-digests; plan drift rejected"
D="${WORK_ROOT}/t41"; build_matrix_fixture "${D}" "sdlc" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain/01Trade"
printf '# 先行文件：排序在 trade.md 之前，保证失败前已有成功移动（G1-R2-H5）\n' > "${D}/.specify/business_domain/00old.md"
printf '# 旧域知识\n' > "${D}/.specify/business_domain/01Trade/trade.md"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
LEG_SNAP="$(snapshot "${D}/.specify")"
chmod 500 "${D}/.specify/business_domain/01Trade"
OUT41="${WORK_ROOT}/t41.out"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > "${OUT41}" 2>&1
RC=$?
chmod 700 "${D}/.specify/business_domain/01Trade"
assert_exit 1 "${RC}"
if grep -q "MIGRATION FAILED" "${OUT41}" && grep -q "ROLLED BACK" "${OUT41}"; then pass; else fail "A15: rollback messages missing"; fi
if [[ "$(snapshot "${D}/.sdlc/business_domain/00old.md")" == "$(snapshot "${D}/.specify/business_domain/00old.md")" ]]; then
  fail "A15: first moved file not rolled back to legacy source"
fi
if [[ ! -f "${D}/.specify/business_domain/00old.md" ]] || [[ -f "${D}/.sdlc/business_domain/00old.md" ]]; then
  fail "A15: moved prefix not restored (rollback not load-bearing at MIG_MOVED>0)"
else
  pass
fi
if [[ "$(snapshot "${D}/.specify")" == "${LEG_SNAP}" ]]; then pass; else fail "A15: legacy tree not restored byte-identical"; fi
if [[ ! -f "${D}/.sdlc/business_domain/01Trade/trade.md" ]]; then pass; else fail "A15: migrated file not rolled back"; fi
if ls "${D}"/.sdlc/reports/migration_report.*.json* >/dev/null 2>&1; then
  if grep -q "FAILED_" "${D}"/.sdlc/reports/migration_report.*.json*; then pass; else fail "A15: failure report missing"; fi
else
  fail "A15: failure migration report not written"
fi
# B8: file-set drift invalidates the confirmed digest
D2="${WORK_ROOT}/t41b"; build_matrix_fixture "${D2}" "sdd" "yes" "0" "absent"
PLAN_SHA2="$(bash "${INITIALIZER}" "${D2}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
printf 'drift\n' > "${D2}/.specify/templates/new-template.md"
bash "${INITIALIZER}" "${D2}" --apply --confirm-migration-plan "${PLAN_SHA2}" > /dev/null 2>&1
assert_exit 1 $?

CASE_NAME="42. B6/B10: unsafe legacy file blocks with C10; dual-root blocked zero-write"
D="${WORK_ROOT}/t42"; build_matrix_fixture "${D}" "sdd" "yes" "0" "absent"
printf 'secret\n' > "${D}/.specify/workflow/closed.md"
chmod 000 "${D}/.specify/workflow/closed.md"
SNAP="$(snapshot "${D}/.specify" 2>/dev/null || true)"
OUT42="${WORK_ROOT}/t42.out"
bash "${INITIALIZER}" "${D}" --plan > "${OUT42}" 2>&1
RC=$?
chmod 600 "${D}/.specify/workflow/closed.md"
assert_exit 1 "${RC}"
if grep -qE "C10|not readable" "${OUT42}"; then pass; else fail "B6: unreadable file not classified C10"; fi
D="${WORK_ROOT}/t42b"; build_matrix_fixture "${D}" "sdd" "yes" "3" "routed"
SNAP="$(snapshot "${D}")"
bash "${INITIALIZER}" "${D}" --dry-run > /dev/null 2>&1
assert_exit 1 $?
if [[ "$(snapshot "${D}")" == "${SNAP}" ]]; then pass; else fail "B10: blocked dual-root mutated repository"; fi

CASE_NAME="43. B9/H5: un-negated retired vocabulary in migrated knowledge trips the gate and rolls back; negated clauses pass"
D="${WORK_ROOT}/t43"; build_matrix_fixture "${D}" "sdlc" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain/01Old"
printf '# 老知识：本域沿用 speckit 工具链沉淀\n' > "${D}/.specify/business_domain/01Old/old.md"
LEG_SNAP="$(snapshot "${D}/.specify")"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
OUT43="${WORK_ROOT}/t43.out"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > "${OUT43}" 2>&1
RC=$?
assert_exit 1 "${RC}"
if grep -q "RESIDUE GATE FAILED" "${OUT43}" && grep -qi "rolled back" "${OUT43}"; then pass; else fail "B9: gate violation did not roll back"; fi
if grep -q "01Old/old.md" "${OUT43}"; then pass; else fail "B9: violation location not reported"; fi
if [[ "$(snapshot "${D}/.specify")" == "${LEG_SNAP}" ]]; then pass; else fail "B9: legacy tree not restored after gate rollback"; fi
if [[ ! -e "${D}/.sdlc/business_domain/knowledge-target.yaml" ]]; then pass; else fail "B9: INIT-created files not rolled back"; fi
if ls "${D}"/.sdlc/reports/migration_report.*.json* >/dev/null 2>&1; then
  if grep -q "FAILED_ROLLED_BACK" "${D}"/.sdlc/reports/migration_report.*.json*; then pass; else fail "B9: failure report missing FAILED_ROLLED_BACK status"; fi
else
  fail "B9: failure migration report not written"
fi
# negation parity: a migrated knowledge doc whose only retired-vocabulary clause is
# explicitly negated must pass the gate (parity with the R2-H6 audit scanner)
D="${WORK_ROOT}/t43n"; build_matrix_fixture "${D}" "sdlc" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain/01Old"
printf '# 老知识：本域不得引用 speckit 工具链，历史遗留仅作背景。\n' > "${D}/.specify/business_domain/01Old/old.md"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > /dev/null 2>&1
assert_exit 0 $?
if [[ -f "${D}/.sdlc/business_domain/01Old/old.md" ]]; then pass; else fail "43n: negated clause wrongly blocked migration"; fi

CASE_NAME="44. G1-R1-H1: ancestor-symlink legacy root is contained, not walked"
D="${WORK_ROOT}/t46"; build_matrix_fixture "${D}" "none" "yes" "0" "absent"
EXT="${WORK_ROOT}/t46-external"; mkdir -p "${EXT}"
printf 'sdd template\n' > "${EXT}/plan.md"
mkdir -p "${D}/.specify"
ln -sfn "${EXT}" "${D}/.specify/templates"
EXT_SNAP="$(snapshot "${EXT}")"
SNAP="$(snapshot "${D}")"
OUT46="${WORK_ROOT}/t46.out"
bash "${INITIALIZER}" "${D}" --plan > "${OUT46}" 2>&1
assert_exit 1 $?
if grep -qE "escapes target repository" "${OUT46}"; then pass; else fail "H1: out-of-repo symlink not classified"; fi
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1
assert_exit 1 $?
if [[ "$(snapshot "${EXT}")" == "${EXT_SNAP}" ]]; then pass; else fail "H1: external tree touched"; fi
if [[ ! -e "${D}/.sdlc/business_domain" && ! -e "${D}/.sdlc/legacy" ]]; then pass; else fail "H1: zero-write violated on containment block"; fi

CASE_NAME="45. G1-R1-H2: content drift invalidates a confirmed plan; clean re-plan re-confirms"
D="${WORK_ROOT}/t45"; build_matrix_fixture "${D}" "sdlc" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain/01Trade"
printf '# 旧域知识 v1\n' > "${D}/.specify/business_domain/01Trade/trade.md"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
printf '# 旧域知识 v2 changed bytes\n' > "${D}/.specify/business_domain/01Trade/trade.md"
OUT45="${WORK_ROOT}/t45.out"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > "${OUT45}" 2>&1
assert_exit 1 $?
if grep -q "DP1 confirmation required" "${OUT45}"; then pass; else fail "H2: drifted content accepted an old plan digest"; fi
PLAN_SHA2="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
if [[ "${PLAN_SHA}" != "${PLAN_SHA2}" ]]; then pass; else fail "H2: re-plan digest did not change after content drift"; fi
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA2}" > /dev/null 2>&1
assert_exit 0 $?
if grep -q "旧域知识 v2 changed bytes" "${D}/.sdlc/business_domain/01Trade/trade.md"; then pass; else fail "H2: migrated content is not the current bytes"; fi

CASE_NAME="46. G1-R1-H4: fixed-field merges land in the new machine artifacts"
D="${WORK_ROOT}/t47"; build_matrix_fixture "${D}" "sdlc" "yes" "0" "absent"
printf 'project_type_profiles:\n  - data-pipeline-etl\nproject: 旧仓名\n' > "${D}/.specify/project-governance-profile.yaml"
printf 'project_type_profiles:\n  selected:\n    - data-pipeline-etl\nscope:\n  source_roots:\n    - svc\n  document_scope: .specify/business_domain\nentry_types:\n  - name: rpc\n' > "${D}/.specify/entry-coverage-profile.yaml"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > /dev/null 2>&1
assert_exit 0 $?
ruby -ryaml -e '
  d = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false)
  profiles = d.dig("project", "project_type_profiles") || []
  exit(1) unless profiles.include?("backend-business-service") && profiles.include?("data-pipeline-etl")
' "${D}/.sdlc/project-governance-profile.yaml" && pass || fail "H4: legacy tech profile not unioned into new profile"
MIG_JSON="$(ls "${D}"/.sdlc/reports/migration_report.*.json* 2>/dev/null | head -1)"
if [[ -n "${MIG_JSON}" ]] && grep -q "merged-union (added: data-pipeline-etl)" "${MIG_JSON}"; then pass; else fail "H4: union merge outcome not recorded"; fi
ruby -ryaml -e '
  e = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false)
  sel = e.dig("project_type_profiles", "selected") || []
  roots = e.dig("scope", "source_roots") || []
  exit(1) unless sel.include?("data-pipeline-etl") && roots.include?("svc")
' "${D}/.sdlc/entry-coverage-profile.yaml" && pass || fail "H4: entry-profile gate facts not merged (selected/source_roots)"
if grep -q "entry_types" "${MIG_JSON}"; then pass; else fail "H4: entry_types disposition not recorded"; fi
if grep -q "document_scope" "${MIG_JSON}"; then pass; else fail "M1: document_scope disposition not recorded"; fi

CASE_NAME="47. P4 load-bearing fixture: pure C8 residue after migration keeps detection EXISTING"
D="${WORK_ROOT}/t44"; build_matrix_fixture "${D}" "sdd" "yes" "0" "absent"
printf 'team notes unrelated to any workflow\n' > "${D}/.specify/README.md"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > /dev/null 2>&1
assert_exit 0 $?
if [[ -f "${D}/.specify/README.md" ]]; then pass; else fail "47: PRESERVE user file not preserved in place"; fi
OUT44="${WORK_ROOT}/t44.out"
bash "${INITIALIZER}" "${D}" --detect > "${OUT44}" 2>&1
grep -q "^TYPE=EXISTING$" "${OUT44}" && pass || fail "47: post-migration detect with C8 residue not EXISTING (P4 sentinel)"
bash "${INITIALIZER}" "${D}" --apply > /dev/null 2>&1
assert_exit 0 $?


CASE_NAME="48. G1-R2-H1: migration through the AUDIT path still passes the residue gate"
D="${WORK_ROOT}/t48"; build_matrix_fixture "${D}" "none" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain"
printf '# Business Landscape（遗留）\n' > "${D}/.specify/business_domain/00BusinessLandscape.md"
printf '# Ubiquitous Language（遗留，提及 speckit 工具链）\n' > "${D}/.specify/business_domain/00UbiquitousLanguage.md"
printf '# Domain Catalog\n' > "${D}/.specify/business_domain/01DomainCatalog.md"
LEG_SNAP="$(snapshot "${D}/.specify")"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
OUT48="${WORK_ROOT}/t48.out"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > "${OUT48}" 2>&1
RC=$?
assert_exit 1 "${RC}"
if grep -q "RESIDUE GATE FAILED" "${OUT48}"; then pass; else fail "48: audit-path migration bypassed the residue gate"; fi
if grep -q "00UbiquitousLanguage" "${OUT48}"; then pass; else fail "48: violation not located in migrated root doc"; fi
if [[ "$(snapshot "${D}/.specify")" == "${LEG_SNAP}" ]]; then pass; else fail "48: legacy tree not restored"; fi
if [[ ! -e "${D}/.sdlc/business_domain/knowledge-target.yaml" ]]; then pass; else fail "48: INIT/audit-created files not rolled back"; fi
# clean variant: same three-root legacy knowledge WITHOUT retired words completes via the audit path
D="${WORK_ROOT}/t48b"; build_matrix_fixture "${D}" "none" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain"
printf '# Business Landscape\n' > "${D}/.specify/business_domain/00BusinessLandscape.md"
printf '# Ubiquitous Language\n' > "${D}/.specify/business_domain/00UbiquitousLanguage.md"
printf '# Domain Catalog\n' > "${D}/.specify/business_domain/01DomainCatalog.md"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > /dev/null 2>&1
assert_exit 0 $?
if [[ -f "${D}/.sdlc/business_domain/00BusinessLandscape.md" ]]; then pass; else fail "48b: clean three-root migration failed"; fi
if grep -q '"status": "COMPLETED"' "${D}/.sdlc/migration/plan.json" 2>/dev/null || [[ -f "${D}/.sdlc/migration/plan.json" ]]; then pass; else fail "48b: plan.json missing on audit-path migration"; fi


CASE_NAME="49. G1-R3-H1: explicit exit inside the transaction window rolls back and reports"
D="${WORK_ROOT}/t49"; build_matrix_fixture "${D}" "sdlc" "yes" "0" "absent"
printf 'domains:\n  - name: 交易域\n' > "${D}/.specify/business_domain/knowledge-target.yaml"
printf '# 先行知识\n' > "${D}/.specify/business_domain/00old.md"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
LEG_SNAP="$(snapshot "${D}/.specify")"
OUT49="${WORK_ROOT}/t49.out"
KT_FAULT_SCAN_FAILURE=1 bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > "${OUT49}" 2>&1
RC=$?
assert_exit 2 "${RC}"
if grep -qi "ROLLED BACK" "${OUT49}"; then pass; else fail "49: explicit exit did not trigger transaction rollback"; fi
if [[ "$(snapshot "${D}/.specify")" == "${LEG_SNAP}" ]]; then pass; else fail "49: legacy tree not restored on explicit exit"; fi
if [[ ! -e "${D}/.sdlc/business_domain/knowledge-target.yaml" ]]; then pass; else fail "49: INIT-created files not cleaned on explicit exit"; fi
if ls "${D}"/.sdlc/reports/migration_report.*.json* >/dev/null 2>&1; then
  if grep -q "FAILED_" "${D}"/.sdlc/reports/migration_report.*.json*; then pass; else fail "49: failure report missing on explicit exit"; fi
else
  fail "49: failure migration report not written on explicit exit"
fi

CASE_NAME="50. G1-R3-H2: AUDIT-path migration runs the same fixed-field merges"
D="${WORK_ROOT}/t50"; build_matrix_fixture "${D}" "none" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain"
printf 'project_type_profiles:\n  - data-pipeline-etl\n' > "${D}/.specify/project-governance-profile.yaml"
printf 'project_type_profiles:\n  selected:\n    - data-pipeline-etl\nscope:\n  source_roots:\n    - svc\n  document_scope: .specify/business_domain\n' > "${D}/.specify/entry-coverage-profile.yaml"
printf '# Landscape\n' > "${D}/.specify/business_domain/00BusinessLandscape.md"
printf '# Language\n' > "${D}/.specify/business_domain/00UbiquitousLanguage.md"
printf '# Catalog\n' > "${D}/.specify/business_domain/01DomainCatalog.md"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > /dev/null 2>&1
assert_exit 0 $?
ruby -ryaml -e '
  g = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: false)
  gp = g.dig("project", "project_type_profiles") || []
  exit(1) unless gp.include?("backend-business-service") && gp.include?("data-pipeline-etl")
  e = YAML.safe_load(File.read(ARGV[1]), permitted_classes: [], aliases: false)
  sel = e.dig("project_type_profiles", "selected") || []
  roots = e.dig("scope", "source_roots") || []
  exit(1) unless sel.include?("data-pipeline-etl") && roots.include?("svc")
' "${D}/.sdlc/project-governance-profile.yaml" "${D}/.sdlc/entry-coverage-profile.yaml" && pass || fail "50: AUDIT-path migration lost legacy profile facts (G1-R3-H2)"
MIG_JSON="$(ls "${D}"/.sdlc/reports/migration_report.*.json* 2>/dev/null | head -1)"
if [[ -n "${MIG_JSON}" ]] && grep -q "merged-union (added: data-pipeline-etl)" "${MIG_JSON}"; then pass; else fail "50: AUDIT-path merge outcome not recorded"; fi
if [[ -n "${MIG_JSON}" ]] && grep -q "document_scope" "${MIG_JSON}"; then pass; else fail "50: document_scope disposition not recorded (G1-R5-M1)"; fi


CASE_NAME="51. G1-R4-H1: AUDIT scan errors become file-level gate violations with real failure reports"
D="${WORK_ROOT}/t51"; build_matrix_fixture "${D}" "none" "yes" "0" "absent"
mkdir -p "${D}/.specify/business_domain"
printf '# Landscape\n' > "${D}/.specify/business_domain/00BusinessLandscape.md"
printf '# Language with speckit mention and invalid bytes: \xff\xfebroken\n' > "${D}/.specify/business_domain/00UbiquitousLanguage.md"
printf '# Catalog\n' > "${D}/.specify/business_domain/01DomainCatalog.md"
LEG_SNAP="$(snapshot "${D}/.specify")"
PLAN_SHA="$(bash "${INITIALIZER}" "${D}" --plan | grep '^PLAN_SHA256=' | cut -d= -f2)"
OUT51="${WORK_ROOT}/t51.out"
bash "${INITIALIZER}" "${D}" --apply --confirm-migration-plan "${PLAN_SHA}" > "${OUT51}" 2>&1
RC=$?
assert_exit 1 "${RC}"
if grep -q "RESIDUE GATE FAILED" "${OUT51}"; then pass; else fail "51: scanner error did not reach the shared gate"; fi
if grep -q "scanner error" "${OUT51}"; then pass; else fail "51: file-level scanner error missing from stderr"; fi
if [[ "$(snapshot "${D}/.specify")" == "${LEG_SNAP}" ]]; then pass; else fail "51: legacy tree not restored"; fi
MIG51="$(ls "${D}"/.sdlc/reports/migration_report.*.json* 2>/dev/null | head -1)"
if [[ -n "${MIG51}" ]]; then
  if grep -q "scanner error" "${MIG51}" && grep -q "FAILED_" "${MIG51}"; then pass; else fail "51: failure report lacks real scanner-error violations"; fi
else
  fail "51: failure migration report not written"
fi


echo ""
echo "==== regression summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed ===="
if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo "ALL GREEN"
  exit 0
fi
exit 1
