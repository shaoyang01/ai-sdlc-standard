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
bash "${PUBLISHER}" "${LIB}" entry-update --node requirement-intake --declaration-seq 2   --artifact-path "00-需求资料/20260905-fixture_需求摘要.md" --version 1.0.0 --digest "${DG_INTAKE}"   > /dev/null 2>&1
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
bash "${PUBLISHER}" "${LIB}" entry-update --node solution-design --declaration-seq 3 \
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
bash "${PUBLISHER}" "${LIB}" entry-update --node solution-gate --declaration-seq 4 \
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
bash "${PUBLISHER}" "${LIB}" entry-update --node task-planning --declaration-seq 5 \
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
bash "${PUBLISHER}" "${LIB}" entry-update --node implementation --declaration-seq 6 \
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
bash "${PUBLISHER}" "${LIB}" entry-update --node code-review --declaration-seq 7 \
  --artifact-path "05-代码审核/20260905-fixture_代码审核.md" --version 1.0.0 --digest "${DG_CR}" \
  > /dev/null 2>&1
assert_exit 0 $?
bash "${PUBLISHER}" "${LIB}" finding-register --finding-id 20260905-fixture-F01 \
  --discovered-at code-review --category implementation-defect --earliest implementation \
  --source-revision REV1 --evidence-ref "05-代码审核/20260905-fixture_代码审核.md#L3" \
  > /dev/null 2>&1
assert_exit 0 $?
assert_contains "${LIB}/manifest.md" "status: OPEN" "finding OPEN in index"
# A4 admission mechanically verified: OPEN finding -> knowledge-sync DENIED
bash "${PUBLISHER}" "${LIB}" check-admission --node knowledge-sync > "${WORK_ROOT}/a4-blocked.out" 2>&1
RC=$?
if [[ "${RC}" == "1" ]]; then pass "A4 DENIED with OPEN finding (mechanical predicate)"; else fail "A4 expected DENIED, got ${RC}"; fi
# earliest=bad-node rejected pre-write (G3-R1-H1)
bash "${PUBLISHER}" "${LIB}" finding-register --finding-id 20260905-fixture-F09 \
  --discovered-at code-review --category x --earliest bad-node \
  --source-revision R1 --evidence-ref e > /dev/null 2>&1
RC=$?
if [[ "${RC}" == "1" ]]; then pass "register earliest=bad-node rejected pre-write"; else fail "register bad-node expected rejection, got ${RC}"; fi

# direct rework (implementation) -> code-review re-verifies RESOLVED (Decision-086, no Gate re-run)
FIXNOTE="05-代码审核/20260905-fixture_代码审核.md#rework-verified"
EVREF="05-代码审核/20260905-fixture_代码审核.md#rework-verified"
EVDG="$(printf 'rework evidence' | shasum -a 256 | awk '{print $1}')"
# closed_by != discovering node rejected (independent closure verification, G3-R1-H1)
bash "${PUBLISHER}" "${LIB}" finding-action --finding-id 20260905-fixture-F01 \
  --action resolve --closed-by implementation --evidence-ref "${EVREF}" --evidence-digest "${EVDG}" \
  --bound-revision-id REV2 > /dev/null 2>&1
RC=$?
if [[ "${RC}" == "1" ]]; then pass "resolve closed_by=implementation rejected (verifier must be discovering node)"; else fail "expected rejection, got ${RC}"; fi
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
if [[ "${RC}" == "1" ]]; then pass "V4/conflicting replay: ACCEPTED on RESOLVED row rejected"; else fail "V4: expected rejection, got ${RC}"; fi

# ---------------------------------------------------------------------------
CASE_NAME="G3-F6: knowledge-sync consumes routed declaration -> final entry-update -> all current"
KS="${LIB}/06-知识同步/20260905-fixture_知识同步结果.md"
cat > "${KS}" <<'EOF'
# 知识同步（fixture）
- 目标：.sdlc/business_domain/export-domain（routed）
- 同步事实：CSV 导出入口 /export/csv
EOF
DG_KS="$(digest_file "${KS}")"
bash "${PUBLISHER}" "${LIB}" entry-update --node knowledge-sync --declaration-seq 8 \
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

# ===========================================================================
# Scenario 2: escalation chain (H4/N8) + PWR accept (H1/H2) + mixed publish (S3)
# ===========================================================================
CASE_NAME="G3-F9: ESCALATED updates requiredDepth + marks design stale in same publish (H4)"
LIB2="${WORK_ROOT}/req-20260905-esc/library/20260905-esc"
mkdir -p "${LIB2}/00-需求资料" "${LIB2}/01-技术方案" "${LIB2}/02-方案审核"
SUM2="${LIB2}/00-需求资料/20260905-esc_需求摘要.md"
echo "# 需求摘要（esc fixture）" > "${SUM2}"
bash "${PUBLISHER}" "${LIB2}" init --requirement-id 20260905-esc \
  --requested-depth STANDARD --depth-basis normalized_proposal --decision-scope FULL_REQUIREMENT > /dev/null 2>&1
assert_exit 0 $?
DG_S2="$(digest_file "${SUM2}")"
bash "${PUBLISHER}" "${LIB2}" entry-update --node requirement-intake --declaration-seq 2 \
  --artifact-path "00-需求资料/20260905-esc_需求摘要.md" --version 1.0.0 --digest "${DG_S2}" > /dev/null 2>&1
assert_exit 0 $?
PLAN2="${LIB2}/01-技术方案/20260905-esc_技术方案.md"
echo "# 方案 STANDARD v1" > "${PLAN2}"
DG_P2="$(digest_file "${PLAN2}")"
bash "${PUBLISHER}" "${LIB2}" entry-update --node solution-design --declaration-seq 3 \
  --artifact-path "01-技术方案/20260905-esc_技术方案.md" --version 1.0.0 --digest "${DG_P2}" > /dev/null 2>&1
assert_exit 0 $?
GATE2="${LIB2}/02-方案审核/20260905-esc_方案审核.md"
cat > "${GATE2}" <<'G3EOF'
# 方案审核（verdict：ESCALATED——发现跨系统接口触发 DEEP）
- Result: PASS_WITH_RISK
- decisionDepth: DEEP
- decisionStatus: ESCALATED
## Depth Coverage Ledger
| 档位要求项 | 方案覆盖 |
| --- | --- |
| 跨系统接口契约 | 未覆盖（升档缺口） |
G3EOF
DG_G2="$(digest_file "${GATE2}")"
bash "${PUBLISHER}" "${LIB2}" entry-update --node solution-gate --declaration-seq 4 \
  --artifact-path "02-方案审核/20260905-esc_方案审核.md" --version 1.0.0 --digest "${DG_G2}" \
  --gate-result PASS_WITH_RISK --decision-depth DEEP --decision-status ESCALATED \
  --stale-nodes solution-design > /dev/null 2>&1
assert_exit 0 $?
assert_contains "${LIB2}/manifest.md" "required_depth: DEEP"
ruby -ryaml -e '
  raw = File.read(ARGV[0])
  s = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false)
  d = s["entries"].find { |e| e["node"] == "solution-design" }
  exit(1) unless d["status"] == "stale"
' "${LIB2}/manifest.md" && pass "design stale in same publish (H4)" || fail "design not stale"

CASE_NAME="G3-F10: Re-Gate CONFIRMED(DEEP) after rework -> A1 eligible via check-admission"
cat > "${PLAN2}" <<'G3EOF'
# 技术方案 v2（DEEP 补强）
## Depth Coverage Ledger
| 档位要求项 | 方案覆盖 |
| --- | --- |
| 跨系统接口契约 | 已覆盖 |
| 状态机/回滚 | 已覆盖 |
G3EOF
DG_P2B="$(digest_file "${PLAN2}")"
bash "${PUBLISHER}" "${LIB2}" entry-update --node solution-design --declaration-seq 5 \
  --artifact-path "01-技术方案/20260905-esc_技术方案.md" --version 2.0.0 --digest "${DG_P2B}" > /dev/null 2>&1
assert_exit 0 $?
cat > "${GATE2}" <<'G3EOF'
# 方案审核 v2（Re-Gate：CONFIRMED/DEEP）
- Result: PASS
- decisionDepth: DEEP
- decisionStatus: CONFIRMED
## Depth Coverage Ledger
| 档位要求项 | 方案覆盖 |
| --- | --- |
| 跨系统接口契约 | 已覆盖 |
| 状态机/回滚 | 已覆盖 |
G3EOF
DG_G2B="$(digest_file "${GATE2}")"
bash "${PUBLISHER}" "${LIB2}" entry-update --node solution-gate --declaration-seq 6 \
  --artifact-path "02-方案审核/20260905-esc_方案审核.md" --version 2.0.0 --digest "${DG_G2B}" \
  --gate-result PASS --decision-depth DEEP --decision-status CONFIRMED > /dev/null 2>&1
assert_exit 0 $?
bash "${PUBLISHER}" "${LIB2}" check-admission --node task-planning > "${WORK_ROOT}/f10.out" 2>&1
assert_exit 0 $?
assert_contains "${WORK_ROOT}/f10.out" "ADMISSION ELIGIBLE: task-planning"

CASE_NAME="G3-F11: merged publish (S3) registers scan finding; PWR accept with ruling revision; replay no-op (V3)"
cat > "${WORK_ROOT}/decl-esc.json" <<'G3EOF'
{
  "declaration_seq": 7,
  "node": "solution-gate",
  "artifact_path": "02-方案审核/20260905-esc_方案审核.md",
  "version": "2.1.0",
  "digest": "PLACEHOLDER",
  "gate_result": "PASS_WITH_RISK",
  "decision_depth": "DEEP",
  "decision_status": "CONFIRMED",
  "finding_registers": [
    {"finding_id": "20260905-esc-F01", "discovered_at": "solution-gate", "root_cause_category": "design-risk", "earliest_affected_node_id": "solution-design", "source_revision": "2.0.0", "evidence_ref": "02-方案审核/20260905-esc_FindingLedger.md#F01"}
  ],
  "finding_actions": []
}
G3EOF
DG_G2C="$(digest_file "${GATE2}")"
python3 - "${WORK_ROOT}/decl-esc.json" "${DG_G2C}" <<'G3PY'
import json, sys
d = json.load(open(sys.argv[1]))
d["digest"] = sys.argv[2]
json.dump(d, open(sys.argv[1], "w"), ensure_ascii=False)
G3PY
bash "${PUBLISHER}" "${LIB2}" publish --declaration-file "${WORK_ROOT}/decl-esc.json" > "${WORK_ROOT}/f11.out" 2>&1
assert_exit 0 $?
assert_contains "${LIB2}/manifest.md" "20260905-esc-F01" "merged publish registered scan finding"
python3 - "${WORK_ROOT}/decl-esc.json" <<'G3PY'
import json, sys
d = json.load(open(sys.argv[1]))
d["declaration_seq"] = 8
d["finding_registers"] = []
d["finding_actions"] = [{"finding_id": "20260905-esc-F01", "action": "accept", "closed_by": "solution-gate", "evidence_ref": "02-方案审核/20260905-esc_方案审核.md#risk-ref", "evidence_digest": "cafe123", "bound_revision_id": "2.1.0"}]
json.dump(d, open(sys.argv[1], "w"), ensure_ascii=False)
G3PY
bash "${PUBLISHER}" "${LIB2}" publish --declaration-file "${WORK_ROOT}/decl-esc.json" > "${WORK_ROOT}/f11b.out" 2>&1
assert_exit 0 $?
ruby -ryaml -e '
  raw = File.read(ARGV[0])
  s = YAML.safe_load(raw[/```yaml\n(.*?)```/m, 1], permitted_classes: [Time], aliases: false)
  f = s["finding_index"].find { |x| x["finding_id"] == "20260905-esc-F01" }
  exit(1) unless f && f["status"] == "ACCEPTED" && f["closed_by"] == "solution-gate" && f["closure_bound_revision_id"] == "2.1.0" && f["closure_evidence_digest"] == "cafe123"
' "${LIB2}/manifest.md" && pass "ACCEPTED with bound ruling revision (H1 closure fields complete)" || fail "ACCEPTED binding incomplete"
bash "${PUBLISHER}" "${LIB2}" finding-action --finding-id 20260905-esc-F01 \
  --action accept --closed-by solution-gate --evidence-ref "02-方案审核/20260905-esc_方案审核.md#risk-ref" \
  --evidence-digest cafe123 --bound-revision-id 2.1.0 > "${WORK_ROOT}/f11c.out" 2>&1
assert_exit 0 $?
assert_contains "${WORK_ROOT}/f11c.out" "NO-OP REPLAY"

CASE_NAME="G3-F12: stable paths (N2/N9) — no derived _R files, no third gate authority"
N2_HITS="$(find "${LIB}" "${LIB2}" -name '*_R[0-9]*' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${N2_HITS}" == "0" ]]; then pass "N2: no derived round-suffix files"; else fail "N2: ${N2_HITS} derived files"; fi
STABLE_COUNT="$(find "${LIB}/02-方案审核" -type f 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${STABLE_COUNT}" == "2" ]]; then pass "N9: exactly two stable gate artifacts in clean chain"; else fail "N9: expected 2 stable gate files, got ${STABLE_COUNT}"; fi
# detection sensitivity: a third authority file IS listable (probe -> count 3 -> remove)
touch "${LIB}/02-方案审核/20260905-fixture_第三权威.md"
N9_PROBE="$(find "${LIB}/02-方案审核" -type f 2>/dev/null | wc -l | tr -d ' ')"
rm -f "${LIB}/02-方案审核/20260905-fixture_第三权威.md"
if [[ "${N9_PROBE}" == "3" ]]; then pass "N9: third-authority file detectable by stable-path listing"; else fail "N9: probe not detectable"; fi

CASE_NAME="G3-F13: A3 consumer-side — implementation binding intact -> code-review ELIGIBLE (M1)"
bash "${PUBLISHER}" "${LIB}" check-admission --node code-review > "${WORK_ROOT}/f13.out" 2>&1
assert_exit 0 $?
assert_contains "${WORK_ROOT}/f13.out" "ADMISSION ELIGIBLE: code-review"

echo ""
echo "==== manual-chain fixture summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed ===="
if [[ "${FAIL_COUNT}" -eq 0 ]]; then
  echo "MANUAL_OPERATIONAL FIXTURE: ALL GREEN"
  exit 0
fi
exit 1
