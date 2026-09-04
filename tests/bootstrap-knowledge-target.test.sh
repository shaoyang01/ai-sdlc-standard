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

snapshot() { # $1 = dir -> md5 manifest on stdout
  find "$1" -type f -exec md5 {} \; | sort
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
          - l4_id: "0001"
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
CURATED_MD5="$(md5 -q "${CURATED}")"
rm "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"
OUT="${WORK_ROOT}/t4.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -f "${R}/.sdlc/business_domain/00UbiquitousLanguage.md" ]]; then pass; else fail "missing root doc not refilled"; fi
assert_eq "${CURATED_MD5}" "$(md5 -q "${CURATED}")"
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
CASE_NAME="6. legacy knowledge root: auto-audit, legacy untouched, migration advisory"
R="${WORK_ROOT}/t6"; new_repo "${R}"
mkdir -p "${R}/.specify/business_domain/01Order"
printf '# Business Landscape\n\nLegacy curated content.\n' > "${R}/.specify/business_domain/00BusinessLandscape.md"
printf '# Order\n' > "${R}/.specify/business_domain/01Order/0101Order.md"
LEGACY_SNAP_BEFORE="$(snapshot "${R}/.specify")"
OUT="${WORK_ROOT}/t6.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
assert_eq "${LEGACY_SNAP_BEFORE}" "$(snapshot "${R}/.specify")"
if [[ -f "${R}/.sdlc/entry-coverage-profile.yaml" ]]; then pass; else fail "machine artifacts not filled under .sdlc"; fi
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
if [[ -f "${R}/.sdlc/business_domain/01Order/0101SaleOrder/01010001OrderEntry(订单录入).md" ]]; then pass; else fail "6-digit L4 doc missing"; fi
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
RESIDUE_MD5="$(md5 -q "${RESIDUE_DOC}")"
OUT="${WORK_ROOT}/t15.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
assert_contains "${OUT}" 'AUDIT_RESULT=FINDINGS'
AUDIT_REPORT="$(ls "${R}"/.sdlc/reports/knowledge_target_audit_report.* 2>/dev/null | head -1)"
assert_contains "${AUDIT_REPORT}" '退役词汇/旧根路径残留'
assert_contains "${AUDIT_REPORT}" '00BusinessLandscape.md'
assert_eq "${RESIDUE_MD5}" "$(md5 -q "${RESIDUE_DOC}")"

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
MAP_MD5="$(md5 -q "${R}/.sdlc/business-domain-map.yaml")"
rm "${R}/.sdlc/business_domain/00UbiquitousLanguage.md"   # force a later init pass
bash "${INITIALIZER}" "${R}" > "${WORK_ROOT}/t18.out" 2>&1
assert_exit 0 $?
assert_eq "${MAP_MD5}" "$(md5 -q "${R}/.sdlc/business-domain-map.yaml")"
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
CTX_BEFORE="$(md5 -q "${R}/.sdlc/project-context/profile.yaml")"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
assert_eq "${CTX_BEFORE}" "$(md5 -q "${R}/.sdlc/project-context/profile.yaml")"
if [[ -f "${R}/.sdlc/business_domain/knowledge-target.yaml" ]]; then pass; else fail "knowledge target missing"; fi

# ---------------------------------------------------------------------------
echo ""
echo "==== regression summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed ===="
if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo "ALL GREEN"
  exit 0
fi
exit 1
