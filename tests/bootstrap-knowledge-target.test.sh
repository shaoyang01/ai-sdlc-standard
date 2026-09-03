#!/usr/bin/env bash
# D-088-01 regression matrix for scripts/bootstrap-knowledge-target.sh.
# Run: bash tests/bootstrap-knowledge-target.test.sh
# Exit 0 when every case passes.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INITIALIZER="${SCRIPT_DIR}/../scripts/bootstrap-knowledge-target.sh"
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

GOOD_MAP='
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
  for word in 'sdlc-knowledge-sync' 'library/{requirement_id}/' '.specify/business_domain/**'; do
    if grep -qF -- "${word}" "${combined}"; then pass; else fail "${3}: required vocabulary missing: ${word}"; fi
  done
}

# ---------------------------------------------------------------------------
CASE_NAME="1. empty repo dry-run: zero writes"
R="${WORK_ROOT}/t1"; new_repo "${R}"
OUT="${WORK_ROOT}/t1.out"
bash "${INITIALIZER}" "${R}" --dry-run > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -e "${R}/.specify" ]]; then fail ".specify created during dry-run"; else pass; fi

# ---------------------------------------------------------------------------
CASE_NAME="2. empty repo formal: minimal valid knowledge target"
R="${WORK_ROOT}/t2"; new_repo "${R}"
OUT="${WORK_ROOT}/t2.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
for f in knowledge-target.yaml 00BusinessLandscape.md 00UbiquitousLanguage.md 01DomainCatalog.md; do
  if [[ -f "${R}/.specify/business_domain/${f}" ]]; then pass; else fail "missing ${f}"; fi
done
assert_contains "${R}/.specify/business_domain/knowledge-target.yaml" 'status: "awaiting_domain_map"'
assert_contains "${R}/.specify/business_domain/knowledge-target.yaml" 'routable: false'
scan_banned "${R}/.specify" "${OUT}" "${CASE_NAME}"
scan_required "${R}/.specify/business_domain" "${OUT}" "${CASE_NAME}"

# ---------------------------------------------------------------------------
CASE_NAME="3. identical rerun: no-op"
R="${WORK_ROOT}/t3"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
SNAP_BEFORE="$(find "${R}/.specify/business_domain" -type f -exec md5 {} \; | sort)"
OUT="${WORK_ROOT}/t3.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
SNAP_AFTER="$(find "${R}/.specify/business_domain" -type f -exec md5 {} \; | sort)"
assert_eq "${SNAP_BEFORE}" "${SNAP_AFTER}"
if grep -q '^CREATED: *$' "${OUT}"; then pass; else fail "rerun created files: $(grep '^CREATED' "${OUT}")"; fi

# ---------------------------------------------------------------------------
CASE_NAME="4/5. existing root docs (same or different): preserved, never rewritten"
R="${WORK_ROOT}/t4"; new_repo "${R}"
mkdir -p "${R}/.specify/business_domain"
printf '# Business Landscape\n\nOwner-curated content that must survive bootstrap.\n' > "${R}/.specify/business_domain/00BusinessLandscape.md"
BEFORE="$(md5 -q "${R}/.specify/business_domain/00BusinessLandscape.md")"
OUT="${WORK_ROOT}/t4.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
AFTER="$(md5 -q "${R}/.specify/business_domain/00BusinessLandscape.md")"
assert_eq "${BEFORE}" "${AFTER}"
grep -q '00BusinessLandscape.md' <(grep '^PRESERVED' "${OUT}") && pass || fail "landscape not reported preserved"

# ---------------------------------------------------------------------------
CASE_NAME="6. full existing business_domain: untouched"
R="${WORK_ROOT}/t6"; new_repo "${R}"
mkdir -p "${R}/.specify/business_domain/01Order"
printf '# Business Landscape\n\nCurated.\n' > "${R}/.specify/business_domain/00BusinessLandscape.md"
printf '# Domain Catalog\n\nCurated.\n' > "${R}/.specify/business_domain/01DomainCatalog.md"
printf '# Order\n' > "${R}/.specify/business_domain/01Order/01Order.md"
EXISTING_LIST="${WORK_ROOT}/t6-list.txt"
find "${R}/.specify/business_domain" -type f > "${EXISTING_LIST}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 0 $?
CHANGED=0
while IFS= read -r f; do
  if [[ ! -f "${f}" ]]; then CHANGED=1; break; fi
done < "${EXISTING_LIST}"
assert_eq 0 "${CHANGED}"
# legacy vocabulary advisory lands in the report without rewriting the files
REPORT="$(ls "${R}"/.specify/reports/knowledge_target_bootstrap_report.* 2>/dev/null | head -1)"
if [[ -n "${REPORT}" && "${#REPORT}" -gt 0 ]] && grep -q 'Remaining Confirmation' "${REPORT}"; then
  pass
else
  fail "structured report missing"
fi

# ---------------------------------------------------------------------------
CASE_NAME="7. only project-context: knowledge target added, context untouched"
R="${WORK_ROOT}/t7"; new_repo "${R}"
mkdir -p "${R}/.specify/project-context"
printf 'project: t7\napplication_type: web\n' > "${R}/.specify/project-context/profile.yaml"
CTX_BEFORE="$(md5 -q "${R}/.specify/project-context/profile.yaml")"
OUT="${WORK_ROOT}/t7.out"
bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 0 $?
assert_eq "${CTX_BEFORE}" "$(md5 -q "${R}/.specify/project-context/profile.yaml")"
if [[ -f "${R}/.specify/business_domain/knowledge-target.yaml" ]]; then pass; else fail "knowledge target missing"; fi

# ---------------------------------------------------------------------------
CASE_NAME="8. missing git identity: formal fails, dry-run reports"
R="${WORK_ROOT}/t8"
mkdir -p "${R}"
git -C "${R}" init -q   # deliberately no user.name anywhere
SANDBOX_HOME="${WORK_ROOT}/t8-home"; mkdir -p "${SANDBOX_HOME}"
OUT="${WORK_ROOT}/t8.out"
env HOME="${SANDBOX_HOME}" bash "${INITIALIZER}" "${R}" > "${OUT}" 2>&1
assert_exit 1 $?
if [[ -e "${R}/.specify/business_domain" ]]; then fail "files written despite missing identity"; else pass; fi
env HOME="${SANDBOX_HOME}" bash "${INITIALIZER}" "${R}" --dry-run > "${OUT}" 2>&1
assert_exit 0 $?
if grep -q 'git config user.name missing' "${OUT}"; then pass; else fail "dry-run did not report missing identity"; fi

# ---------------------------------------------------------------------------
CASE_NAME="9. confirmed domain map: routable L1/L2/L4 generated"
R="${WORK_ROOT}/t9"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/domain-map.yaml"
OUT="${WORK_ROOT}/t9.out"
bash "${INITIALIZER}" "${R}" --domain-map "domain-map.yaml" --project-type-profile frontend-application > "${OUT}" 2>&1
assert_exit 0 $?
if [[ -f "${R}/.specify/business_domain/01Order/0101SaleOrder/01010001OrderEntry(订单录入).md" ]]; then pass; else fail "L4 doc missing"; fi
if [[ -f "${R}/.specify/business_domain/01Order/0101SaleOrder/0101SaleOrderEntryCoverage(销售订单入口覆盖).md" ]]; then pass; else fail "entry coverage missing"; fi
assert_contains "${R}/.specify/business_domain/knowledge-target.yaml" 'routable: true'
scan_banned "${R}/.specify" "${OUT}" "${CASE_NAME}"
scan_required "${R}/.specify/business_domain" "${OUT}" "${CASE_NAME}"

# ---------------------------------------------------------------------------
for case_desc in "missing field" "duplicate id" "path traversal" "empty array"; do
  CASE_NAME="10. invalid map fail-closed: ${case_desc}"
  R="${WORK_ROOT}/t10-${case_desc// /}"; new_repo "${R}"
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
  esac
  bash "${INITIALIZER}" "${R}" --domain-map "map.yaml" > /dev/null 2>&1
  assert_exit 2 $?
  if [[ -e "${R}/.specify/business_domain/knowledge-target.yaml" ]]; then
    fail "declaration written despite invalid map"
  else
    pass
  fi
done

# ---------------------------------------------------------------------------
CASE_NAME="11. declaration conflict: blocked, --update-declaration overrides"
R="${WORK_ROOT}/t11"; new_repo "${R}"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
printf 'schema_version: "0.9"\nstatus: "mangled"\n' > "${R}/.specify/business_domain/knowledge-target.yaml"
bash "${INITIALIZER}" "${R}" > /dev/null 2>&1
assert_exit 1 $?
assert_eq 'schema_version: "0.9"' "$(head -1 "${R}/.specify/business_domain/knowledge-target.yaml")"
bash "${INITIALIZER}" "${R}" --update-declaration > /dev/null 2>&1
assert_exit 0 $?
assert_contains "${R}/.specify/business_domain/knowledge-target.yaml" 'status: "awaiting_domain_map"'

# ---------------------------------------------------------------------------
CASE_NAME="12. downgrade protection: routed repo without map keeps routed declaration"
R="${WORK_ROOT}/t12"; new_repo "${R}"
printf '%s' "${GOOD_MAP}" > "${R}/domain-map.yaml"
bash "${INITIALIZER}" "${R}" --domain-map "domain-map.yaml" > /dev/null 2>&1
bash "${INITIALIZER}" "${R}" > "${WORK_ROOT}/t12.out" 2>&1
assert_exit 0 $?
assert_contains "${R}/.specify/business_domain/knowledge-target.yaml" 'routable: true'

# ---------------------------------------------------------------------------
echo ""
echo "==== regression summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed ===="
if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo "ALL GREEN"
  exit 0
fi
exit 1
