#!/usr/bin/env bash
# G3-13 MANUAL_OPERATIONAL fixture (D-090-02):
# isolated fixture driving the manual chain intake -> knowledge-sync through the
# frozen contract semantics (manual-runtime-semantic-contract v1.0.0), with the
# publisher as the only manifest writer. No manual patching of flow files.
#
# Run: bash tests/manual-chain-fixture.test.sh

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STANDARD_HOME="$(cd "${SCRIPT_DIR}/.." && pwd)"
PUBLISHER="${STANDARD_HOME}/scripts/publish-requirement-manifest.sh"
WORK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/g3-manual-chain.XXXXXX")"
if [[ "${G3_KEEP:-}" != "1" ]]; then rm -rf "${WORK_ROOT}"; fi

PASS_COUNT=0; FAIL_COUNT=0
pass() { PASS_COUNT=$((PASS_COUNT + 1)); echo "PASS: ${CASE_NAME} -- $*"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); echo "FAIL: ${CASE_NAME} -- $*"; }
assert_exit() { # expected actual
  if [[ "$1" == "$2" ]]; then pass "exit ${2}"; else fail "expected exit ${1}, got ${2}"; fi
}
assert_contains() { # file needle [label]
  local label="${3:-contains: $2}"
  if grep -qF -- "$2" "$1" 2>/dev/null; then pass "${label}"; else fail "${label} (missing: $2)"; fi
}
digest_file() { shasum -a 256 "$1" 2>/dev/null | awk '{print $1}' || md5 -q "$1"; }

# ---------------------------------------------------------------------------
CASE_NAME="G3-F1: intake creates summary + intake.manifest.json + manifest via publisher init"
R="${WORK_ROOT}/req-20260905-fixture"
LIB="${R}/library/20260905-fixture"
mkdir -p "${LIB}/00-需求资料" "${LIB}/01-技术方案" "${LIB}/02-方案审核" "${LIB}/03-任务规划" "${LIB}/04-实现记录" "${LIB}/05-代码审核" "${LIB}/06-知识同步" "${R}/.sdlc/business_domain"
git -C "${R}" init -q && git -C "${R}" config user.name "Manual Chain Fixture"

# routed declaration (knowledge-sync admission A4 precondition)
cat > "${R}/.sdlc/business_domain/knowledge-target.yaml" <<'EOF'
schema_version: "2.1"
governed_by: sdlc-knowledge-sync
target_root: .sdlc/business_domain
status: "routed"
routable: true
EOF

SUMMARY="${LIB}/00-需求资料/20260905-fixture_需求摘要.md"
cat > "${SUMMARY}" <<'EOF'
# 需求摘要（fixture）
- 目标：为导出模块增加 CSV 导出能力
- 范围：单模块 export-service
- 待确认事项：无
EOF
printf '{"schema":"loop-intake-manifest:v1","requirement_id":"20260905-fixture","source":"fixture"}\n' > "${LIB}/00-需求资料/intake.manifest.json"

bash "${PUBLISHER}" "${LIB}" init --requirement-id 20260905-fixture \
  --requested-depth STANDARD --depth-basis normalized_proposal --decision-scope FULL_REQUIREMENT \
  --title "CSV 导出" > "${WORK_ROOT}/f1.out" 2>&1
assert_exit 0 $?
assert_contains "${WORK_ROOT}/f1.out" "INIT OK"
[[ -f "${LIB}/manifest.md" ]] && pass "manifest.md created" || fail "manifest.md missing"
[[ -f "${LIB}/00-需求资料/intake.manifest.json" ]] && pass "intake.manifest.json created" || fail "intake.manifest.json missing"
assert_contains "${LIB}/manifest.md" "requested_depth: STANDARD"
assert_contains "${LIB}/manifest.md" "initial_depth_basis: normalized_proposal"
DG_INTAKE="$(digest_file "${SUMMARY}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node requirement-intake   --artifact-path "00-需求资料/20260905-fixture_需求摘要.md" --version 1.0.0 --digest "${DG_INTAKE}"   > /dev/null 2>&1
assert_exit 0 $?

# ---------------------------------------------------------------------------
CASE_NAME="G3-F2: solution-design produces plan WITHOUT gate precondition (N4), ledger present"
PLAN="${LIB}/01-技术方案/20260905-fixture_技术方案.md"
cat > "${PLAN}" <<'EOF'
# 技术方案（fixture）

## Depth Coverage Ledger
| 档位要求项 | 方案覆盖 | 缺口/备注 |
| --- | --- | --- |
| 架构 | 已覆盖 | |
| 接口 | 已覆盖 | |
| 数据 | 已覆盖 | |
| 异常 | 已覆盖 | |
| 兼容性 | 已覆盖 | |
| 验证 | 已覆盖 | |

## 方案
导出服务新增 CSV writer，接口 /export/csv，异常走统一 handler。
EOF
DG_PLAN="$(digest_file "${PLAN}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node solution-design \
  --artifact-path "01-技术方案/20260905-fixture_技术方案.md" --version 1.0.0 --digest "${DG_PLAN}" \
  > "${WORK_ROOT}/f2.out" 2>&1
assert_exit 0 $?
grep -q "档位未裁决前不产出" "${STANDARD_HOME}/skills/sdlc-solution-design/SKILL.md" && fail "N4: depth-precondition clause still present" || pass "N4: no gate precondition in skill"

# ---------------------------------------------------------------------------
CASE_NAME="G3-F3: solution-gate scan+verdict (CONFIRMED) -> entry-update with gate fields"
LEDGER="${LIB}/02-方案审核/20260905-fixture_FindingLedger.md"
cat > "${LEDGER}" <<'EOF'
# Finding Ledger（adversarial_scan 第 1 轮）
- Version: 1.0.0
- Status: active
（本轮无 blocking finding）
EOF
GATE="${LIB}/02-方案审核/20260905-fixture_方案审核.md"
cat > "${GATE}" <<'EOF'
# 方案审核（formal_verdict）
- Result: PASS
- decisionDepth: STANDARD
- decisionStatus: CONFIRMED
- Scanned Design Version: 1.0.0
- Reviewed Artifact Version: 1.0.0
## Depth Coverage Ledger
| 档位要求项 | 方案覆盖 |
| --- | --- |
| STANDARD 全要素 | 已覆盖 |
EOF
DG_GATE="$(digest_file "${GATE}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node solution-gate \
  --artifact-path "02-方案审核/20260905-fixture_方案审核.md" --version 1.0.0 --digest "${DG_GATE}" \
  --gate-result PASS --decision-depth STANDARD --decision-status CONFIRMED \
  > "${WORK_ROOT}/f3.out" 2>&1
assert_exit 0 $?
assert_contains "${LIB}/manifest.md" "decision_status: CONFIRMED"

# ---------------------------------------------------------------------------
CASE_NAME="G3-F4: task-planning -> implementation (evidence binding) -> entry-updates"
TP="${LIB}/03-任务规划/20260905-fixture_任务计划.md"
cat > "${TP}" <<'EOF'
# 任务计划（fixture）
- T1: 实现 CSV writer（export-service）
EOF
DG_TP="$(digest_file "${TP}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node task-planning \
  --artifact-path "03-任务规划/20260905-fixture_任务计划.md" --version 1.0.0 --digest "${DG_TP}" \
  > /dev/null 2>&1
assert_exit 0 $?
IMPL="${LIB}/04-实现记录/20260905-fixture_实现记录.md"
cat > "${IMPL}" <<'EOF'
# 实现记录（fixture）
- Evidence Binding: baseRevision=BASE, reviewedRevision=REV1, changeDigest=deadbeef
- 验证：单测通过
EOF
DG_IMPL="$(digest_file "${IMPL}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node implementation \
  --artifact-path "04-实现记录/20260905-fixture_实现记录.md" --version 1.0.0 --digest "${DG_IMPL}" \
  > /dev/null 2>&1
assert_exit 0 $?
assert_contains "${IMPL}" "baseRevision=BASE, reviewedRevision=REV1, changeDigest=deadbeef" "evidence binding in implementation record"
IMPL_DIGEST_CHECK="$(ruby -ryaml -e 'raw = File.read(ARGV[0]); s = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false); puts s["entries"].find { |e| e["node"] == "implementation" }["digest"]' "${LIB}/manifest.md")"
[[ "${IMPL_DIGEST_CHECK}" == "${DG_IMPL}" ]] && pass "manifest entry digest matches implementation record" || fail "manifest entry digest drift"

# ---------------------------------------------------------------------------
CASE_NAME="G3-F5: code-review registers HIGH finding (OPEN) -> A4 blocked -> direct rework -> resolve -> unblocked"
CR="${LIB}/05-代码审核/20260905-fixture_代码审核.md"
cat > "${CR}" <<'EOF'
# 代码审核（fixture）
## Findings（本节点登记）
| finding_id | rootCauseCategory | earliestAffectedNodeId | sourceRevision | evidenceRef | status(发现时点) |
| --- | --- | --- | --- | --- | --- |
| 20260905-fixture-F01 | implementation-defect | implementation | REV1 | 05-代码审核/x.md#L3 | OPEN |
EOF
DG_CR="$(digest_file "${CR}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node code-review \
  --artifact-path "05-代码审核/20260905-fixture_代码审核.md" --version 1.0.0 --digest "${DG_CR}" \
  > /dev/null 2>&1
assert_exit 0 $?
bash "${PUBLISHER}" "${LIB}" finding-register --finding-id 20260905-fixture-F01 \
  --discovered-at code-review --category implementation-defect --earliest implementation \
  --source-revision REV1 --evidence-ref "05-代码审核/20260905-fixture_代码审核.md#L3" \
  > /dev/null 2>&1
assert_exit 0 $?
assert_contains "${LIB}/manifest.md" "status: OPEN" "finding OPEN in index (A4 blocked)"

# direct rework (implementation) -> code-review re-verifies RESOLVED (Decision-086, no Gate re-run)
FIXNOTE="05-代码审核/20260905-fixture_代码审核.md#rework-verified"
EVREF="05-代码审核/20260905-fixture_代码审核.md#rework-verified"
EVDG="$(printf 'rework evidence' | shasum -a 256 | awk '{print $1}')"
bash "${PUBLISHER}" "${LIB}" finding-action --finding-id 20260905-fixture-F01 \
  --action resolve --closed-by code-review --evidence-ref "${EVREF}" --evidence-digest "${EVDG}" \
  --bound-revision-id REV2 > "${WORK_ROOT}/f5.out" 2>&1
assert_exit 0 $?
assert_contains "${LIB}/manifest.md" "status: RESOLVED"
assert_contains "${LIB}/manifest.md" "closed_by: code-review"
assert_contains "${LIB}/manifest.md" "closure_bound_revision_id: REV2"

# non-scan source must NOT take ACCEPTED (V4)
bash "${PUBLISHER}" "${LIB}" finding-action --finding-id 20260905-fixture-F01 \
  --action accept --closed-by x --evidence-ref y --evidence-digest z > /dev/null 2>&1
RC=$?
if [[ "${RC}" == "1" ]]; then pass "V4: non-scan ACCEPTED rejected (already-closed also rejected)"; else fail "V4: expected rejection, got ${RC}"; fi

# ---------------------------------------------------------------------------
CASE_NAME="G3-F6: knowledge-sync consumes routed declaration -> final entry-update -> all current"
KS="${LIB}/06-知识同步/20260905-fixture_知识同步结果.md"
cat > "${KS}" <<'EOF'
# 知识同步（fixture）
- 目标：.sdlc/business_domain/export-domain（routed）
- 同步事实：CSV 导出入口 /export/csv
EOF
DG_KS="$(digest_file "${KS}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node knowledge-sync \
  --artifact-path "06-知识同步/20260905-fixture_知识同步结果.md" --version 1.0.0 --digest "${DG_KS}" \
  > /dev/null 2>&1
assert_exit 0 $?
for node in requirement-intake solution-design solution-gate task-planning implementation code-review knowledge-sync; do
  assert_contains "${LIB}/manifest.md" "node: ${node}" "chain entry present: ${node}"
done
ruby -ryaml -e '
  raw = File.read(ARGV[0])
  state = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false)
  cur = state["entries"].count { |e| e["status"] == "current" }
  exit(1) unless cur == 7
' "${LIB}/manifest.md" && pass "all 7 entries current (full chain complete)" || fail "not all 7 entries current"

# ---------------------------------------------------------------------------
CASE_NAME="G3-F7: publishSeq advanced only by declarations; lifecycle actions did not advance it"
SEQ=$(ruby -ryaml -e '
  raw = File.read(ARGV[0])
  state = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false)
  puts state["publish_seq"]
' "${LIB}/manifest.md")
# intake+design+gate+task+impl+review+sync = 7 entry-updates after init -> publishSeq = 8
if [[ "${SEQ}" == "8" ]]; then pass "publishSeq=8 (init + 7 entry-updates; finding actions did not advance)"; else fail "publishSeq expected 8, got ${SEQ}"; fi
PT=$(ruby -ryaml -e '
  raw = File.read(ARGV[0])
  state = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false)
  puts state["projected_through"]
' "${LIB}/manifest.md")
assert_contains "${LIB}/manifest.md" "projected_through: MANUAL" "projectedThrough stays MANUAL"

# ---------------------------------------------------------------------------
CASE_NAME="G3-F8: naive hand-edit (digest not recomputed) -> CORRUPT_STOP; repair rebuilds baseline; publish resumes"
# Manual face boundary (guarantee-A ruling): a hand-edit WITH recomputed digest is
# indistinguishable from a legit publish (no external authority) — that detection is
# the RUNTIME face V6' (G5, store as authority). The manual face catches naive edits.
ruby -ryaml -e '
  raw = File.read(ARGV[0])
  state = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false)
  state["entries"].find { |e| e["node"] == "knowledge-sync" }["digest"] = "tampered"
  File.write(ARGV[0], raw.sub(/```yaml\n.*?```/m, "```yaml\n#{YAML.dump(state)}```"))
' "${LIB}/manifest.md"
bash "${PUBLISHER}" "${LIB}" finding-register --finding-id 20260905-fixture-F02 \
  --discovered-at knowledge-sync --category knowledge-gap --earliest knowledge-sync \
  --source-revision REV2 --evidence-ref "06-知识同步#L2" > /dev/null 2>&1
RC=$?
if [[ "${RC}" == "1" ]]; then pass "naive hand-edit -> MANIFEST_CORRUPT_STOP"; else fail "expected corrupt STOP, got ${RC}"; fi
# repair: rebuild baseline with repair record (repairRecords written before digest), then publish resumes
bash "${PUBLISHER}" "${LIB}" repair --who owner --reason "fixture digest drift repair" > "${WORK_ROOT}/f8.out" 2>&1
assert_exit 0 $?
assert_contains "${LIB}/manifest.md" "fixture digest drift repair"
bash "${PUBLISHER}" "${LIB}" finding-register --finding-id 20260905-fixture-F02 \
  --discovered-at knowledge-sync --category knowledge-gap --earliest knowledge-sync \
  --source-revision REV2 --evidence-ref "06-知识同步#L2" > /dev/null 2>&1
assert_exit 0 $?

# guarantee-A: closure evidence fields survive (no git commit needed anywhere in this fixture)
ruby -ryaml -e '
  raw = File.read(ARGV[0])
  state = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false)
  f = state["finding_index"].find { |x| x["finding_id"] == "20260905-fixture-F01" }
  exit(1) unless f && f["status"] == "RESOLVED" && f["closed_by"] == "code-review" && f["closure_evidence_digest"] && f["closure_bound_revision_id"] == "REV2"
' "${LIB}/manifest.md" && pass "guarantee-A traceability intact without any git commit" || fail "guarantee-A fields lost"

# ---------------------------------------------------------------------------
echo ""
echo "==== manual-chain fixture summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed ===="
if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo "MANUAL_OPERATIONAL FIXTURE: ALL GREEN"
  exit 0
fi
exit 1
