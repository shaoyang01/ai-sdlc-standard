# 校验指南

> 本指南说明当前仓库真实存在的校验能力，以及在真实项目试跑前应做的人工检查。

## 当前自动校验脚本

当前仓库提供四个自动校验脚本：

```bash
ruby scripts/validate-skill-contracts.rb
ruby scripts/validate-product-parity-fixtures.rb
ruby scripts/validate-capability-metadata-chain.rb
ruby scripts/validate-gate-runner-scenarios.rb
```

### A. Portable Standard Package validators

- `validate-skill-contracts.rb`：标准包内部契约一致性验证。
- `validate-product-parity-fixtures.rb`：标准包 product parity fixture 回归验证。
- `validate-gate-runner-scenarios.rb`：Gate Runner 两个特殊 Gate 的 validation-only 场景一致性验证。

这三个脚本属于标准包内部契约、product parity 与 Gate Runner scenario 验证，可作为 portable package 开发和验收入口；`manifest.yaml` 继续只管理 Standard Package 的正式入口。

### B. Repository governance validator

`validate-capability-metadata-chain.rb` 服务本仓库的 capability path、migration ledger、root classification、status authority、Current Status fixed baseline 和 historical compatibility 治理。它已在 ci-standards 执行；read-only、deterministic、no network；不创建第二份 migration registry；不属于下游 portable Standard Package 项目必须执行的 runtime 入口；不表示 capability 被批准、启用、执行或 rollout；不证明 external consumers 不存在。

其覆盖范围包括：Matrix Migration Tracking、target paths/root notes、shared inventory paths、root JSON scoped authority、Repository Structure authority model、Current Status exact reviewed baseline、Accepted Root Material Classification、historical snapshot banners、README authority framing。

## Tail Template Static Contract Validation

针对四份 Tail 模板的静态合同校验：

- `templates/gate-result-template.md`
- `templates/artifact-manifest-template.md`
- `templates/business-domain-sync-status-template.yaml`
- `templates/library-driven-sync-decision-template.md`

职责划分：

- `validate-skill-contracts.rb` 负责逐文件精确检查：精确字段、固定 pipe-delimited scalar、精确 heading、唯一性计数与 forbidden regression；Tail Completion owner 精确为 `sdlc-gate-runner`；Manifest 只有一个 canonical Tail 根区段；Sync decision、execution status 与 execution result 分离；Library-driven decision 的 Metadata 唯一；legacy `## Speckit Sync` 不得作为新写 heading 存在。
- expanded parity fixture 负责跨文件语义 parity：`documentation_governance_tail`、`development_path_entry`、`documentation_governance_tail_completion`、`actual_implementation_required` 等跨模板词项及 forbidden 回归。

边界：

- 校验 read-only、deterministic、no network。
- 不运行 Gate Runner，不执行 Sync，不执行 Reconcile，不读取实例 Manifest，不验证真实需求是否完成 Tail。
- runtime enforcement 由后续运行时任务覆盖；Sync/Reconcile 输出消费由后续集成任务覆盖；Pipeline 边界由后续集成任务覆盖；实例级场景由后续场景验证覆盖。

## Gate Runner Scenario Conformance 校验

`fixtures/gate-runner-scenarios/scenarios.yaml` 与 `scripts/validate-gate-runner-scenarios.rb` 组成标准包开发期 validation-only 场景一致性验证 harness：

```text
authority=validation_only
runtime_authority=false
gate_decision_authority=false
implementation_authority=false
merge_authority=false
publication_authority=false
```

边界：

- 该 harness 只读、deterministic、no network；不运行真实 Gate、Manifest、Sync、Reconcile 或 Entry Coverage；不修改真实 Manifest 或 `library/**`。
- 不证明 Pipeline boundary、Topic 07 closure 或 D09；CI success 不是 review PASS。
- 该 harness 不是 `sdlc-gate-runner`、不是正式 Gate artifact、不是 target project runtime input、不是 Manifest / Sync / Reconcile / D09 owner。

### Schema

- fixture root 只允许 `schema_version`、`authority`、`canonical_sources`、`required_coverage_tags`、`scenarios`。
- `schema_version=gate-runner-scenario-conformance-v1`、`authority=validation_only`。
- `canonical_sources` 必须非空、无重复，且均为安全的 repository-relative 普通文件（拒绝绝对路径、反斜杠、`..`、`~`、不存在或非普通文件），至少覆盖 Development Path 标准、Gate Runner Skill/Contract/references 与四份 Tail 模板。
- `required_coverage_tags` 固定 19 个（R1 新增 `precompleted_without_source`）；未知、重复或未覆盖 tag 均失败。
- 每个 scenario 只允许 `id`、`coverage_tags`、`gate_type`、`input`、`expected`；ID 全局唯一，格式 `[A-Z0-9-]+`，最大 64。
- `gate_type` 仅为 `development_path_entry` 或 `documentation_governance_tail_completion`。
- `expected` 只允许 12 个字段；`result` 仅 `PASS|FAIL|PASS_WITH_RISK`；boolean 字段必须为真 boolean，不适用使用 `not_applicable`；`blockers` 不允许重复（重复会先在 schema 层被拒绝）。
- `input` 按 Gate Type 使用独立、递归、fail-closed nested schema：Development Path Entry 顶层精确 9 字段，Tail 顶层精确 16 字段。每层都拒绝未知字段与缺失必填字段、检查 exact enum、要求 true boolean、校验数组元素类型与唯一性，不允许未识别字段被计算逻辑静默忽略。
  - Tail `artifacts` 必须精确包含 3 个元素，item 精确覆盖 `03-实现记录` / `04-代码审核` / `05-测试验收` 且无重复；每个元素只允许 `item` / `status` / `version_matches`。
  - `skipped_items` 每条必须精确包含 `item`、`basis`、`scope`、`reason`、`evidence`、`decision_source`、`decision_owner`、`version_basis`、`stale_condition`；`basis` 仅 `complete|incomplete`；每个 `not_required` / `not_applicable` artifact 必须有唯一对应 skip record。
  - 风险 level 使用 canonical case：仅 `none` / `High` / `Critical`（小写 `high` / `critical` 被拒绝）。
  - Entry Coverage status 仅 `PASS|PENDING|FAILED|BLOCKED|not_applicable`；禁止 `status=current`。
  - `business_domain_sync` 必须包含 `write_authorized`（boolean）；`persistence` 必须包含 `tamper_field`（`none|result|completion_decision_source|version`）。
- YAML alias 与对象反序列化均拒绝（`YAML.safe_load(permitted_classes: [], aliases: false)`）。

### Tail lifecycle（R1）

- 首次正式 Tail Completion Gate 的正常候选状态是 `tail.status=in_progress`：`in_progress` 本身不构成完成证据，但当所有外部 evidence 完整时，不能仅因 `in_progress` 阻止 Stage A provisional PASS；formal PASS 只在 Stage B 写入并回读验证 Gate artifact 后成立，此后才允许 `tail_completion_eligible=true`、`completion_source_established=true` 与 `manifest_completed_recommendation=true`。
- `planned` / `blocked` / `stale` / `not_required` 状态 fail-closed。
- `completed` 不得作为首次完成 Gate 的前置成功条件：当输入 status 已为 `completed` 但没有 current、已绑定的 completion source 时 fail-closed，blocker 明确表示 pre-completed state 缺少 current formal source，且不得重新建议完成（场景 `TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE`）。本轮不实现 existing completed Gate 的重验证成功路径。
- Response-only、write failure 与 read-back mismatch 场景同样从 `in_progress` 开始，证明失败来自 Stage B 边界而不是预完成状态。

### Sync write authorization（R1）

`business_domain_sync.write_authorized` 与 execution 分离：

- `SYNC_REQUIRED` 且尚未执行、`write_authorized=false`：唯一核心 blocker 为 `SYNC_REQUIRED write not authorized`；`professional_skill_execution_requested=false`，不得请求执行未授权写入（场景 `TAIL-D-03-SYNC-NOT-AUTHORIZED`）。
- `SYNC_REQUIRED` 且已授权（`write_authorized=true`）但未执行：blocker 为 `SYNC_REQUIRED execution not complete`；`professional_skill_execution_requested=true`（场景 `TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED`）。
- Sync 已 `done/synced` 时 `write_authorized=true` 表示当前 evidence 记录的原始执行已获授权，不得请求再次执行；当 current/non-stale/scope-matched Pipeline evidence 被复用时不得要求新的写授权、不得重复执行专业 Skill（`reused_existing_evidence=true`、`professional_skill_execution_requested=false`）。不得用 reuse 绕过 stale、scope mismatch 或缺失 evidence。

### 场景组

当前共 25 个场景（22 个 P2 固定场景 + 3 个 R1 新增：`TAIL-D-06-SYNC-AUTHORIZED-NOT-EXECUTED`、`TAIL-G-03-PURE-DOCUMENTATION-MISSING-SKIP-BASIS`、`TAIL-P-07-PRECOMPLETED-WITHOUT-SOURCE`）。

- `DPE-*`：Development Path Entry（direct / speckit / wrong route / blocked revision / blocked unknown / stale decision）。
- `TAIL-D-*`：Direct 路径 Tail（无 sync、sync 已授权、sync 未授权、sync 已授权未执行、Reconcile 不完整、缺 05）。
- `TAIL-S-*`：Speckit 证据复用与 Pipeline result 边界（current 证据复用、Pipeline COMPLETED 不能替代 Tail Gate、stale pipeline evidence）。
- `TAIL-G-*`：纯文档/纯治理任务的 skipped basis——`pure_governance` 与 `pure_documentation` 执行同一套完整 skip-basis 校验（完整通过、不完整失败、pure documentation 缺 skip basis 失败）。
- `TAIL-P-*`：persistence 生命周期与 Tail lifecycle（response-only、write failure 注入、read-back mismatch、PASS_WITH_RISK 边界、风险接受不完整、Critical、pre-completed without source fail-closed）。

Runner 独立计算每个场景的 actual outcome，并与 expected 全字段深比较；marker 只在断言成功后打印。

### Stage B（persistence）

- 每个 persistence 场景在独立 `Dir.mktmpdir` 下模拟稳定路径 `library/<requirement_id>/05-测试验收/<requirement_id>_治理尾段完成门禁.md`。
- 模拟 report 至少包含 Requirement ID、Gate Type、Version、Gate Artifact Version、Status、Reviewed Artifact/Version、Result、completion_evidence、completion_decision_source。
- write failure 为确定性注入，不依赖 OS 权限碰运气。
- read-back mismatch 必须真实改写指定字段后重新读取（真实写盘、真实回读、内容 digest 校验）。
- filename-versioned companion（`_vN.md`）必须被禁止：binding mismatch 均 formal FAIL。
- 只有 authorized + write success + 真实回读 match + 无 companion 才能形成 formal PASS/PASS_WITH_RISK；成功时才建议 Manifest completed。
- 所有临时目录必须清理；清理失败使 runner 失败（`TEMP_CLEANUP_COMPLETE`）。

### Self-test

- 使用内存 deep copy，不修改 repository fixture。
- 真实制造并期待验证失败：expected PASS/FAIL 被篡改、mandatory tag 缺失、重复 scenario ID、未知 root/scenario field、response-only / write failure / read-back mismatch / stale evidence / wrong route / `_v2.md` companion / Critical 被写成通过（均必须被拒绝，禁止通过）、YAML alias、不安全 canonical source path。
- R1 新增负向 self-test：unknown nested input field、missing required nested field、invalid work_kind、invalid freshness、Entry Coverage `status=current`、pure documentation 缺 skip basis 被写成 PASS、duplicate artifact item、missing 03/04/05 item、pre-completed without source 被写成 PASS、`write_authorized=false` 被写成 PASS、SYNC authorized but not executed 被写成 PASS、invalid canonical risk case（小写 `high`）、expected blockers 重复、unexpected exception 不得被当作 expected rejection。
- 每个 self-test 声明 expected diagnostic 或 expected error category：仅当实际 validator 产生预期错误时 self-test 才通过；未知异常、nil error、无关 schema error 或 runner crash 必须使 self-test 失败。

### CI

- `.github/workflows/ci.yml` 仅在 `ci-standards` 增加一次 `ruby scripts/validate-gate-runner-scenarios.rb`；不修改其他 job、trigger、version、permission。

## Pipeline Core Boundary Static Validation

`validate-skill-contracts.rb` 新增 Topic 07-E Pipeline Core Boundary 静态合同校验：

- Pipeline fixed stages 截止 Implement：`Preflight -> Domain Route -> Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement` 是唯一 canonical stage order。
- post-Clarify continuous Core segment 只包含 Plan、Tasks、Analyze、Implement。
- Shared Tail Handoff required（仅当 Pipeline Result=`COMPLETED` 且 Core Completion=true 时）：Implement 后先确定 Pipeline Result，只有 `COMPLETED` 结果输出 Shared Tail Handoff；非 COMPLETED 结果只输出 Core Stop And Route。
- Pipeline result Core-only：`COMPLETED` 只表示 Speckit SDD Core through Implement 完成，不表示 requirement、Shared Tail、Sync、Reconcile、Tail Gate 或 Manifest 完成。
- knowledge permission=false：Pipeline 与 Pipeline Core 不得写 knowledge；知识写入只属于 Shared Tail 中的 `sdlc-speckit-sync`。
- Registry/Contract/Skill 对齐：Contract stage 精确为 Speckit SDD Core through Implement，Registry stage 一致，Contract category 不含 Sync Skill。
- old fixed Sync/Reconcile stage chain 会失败：任何把 Sync 或 Reconcile 保留为 Pipeline runtime stage 的写法都会被静态校验拒绝。
- Pipeline 不要求 Tail write/apply authorization 进入 Core；Tail 专业授权由 Shared Tail 中对应 Skill 在需要时获取。
- Pipeline 不建议 Tail completed，不把自身作为 completion source。
- existing Sync/Reconcile evidence 只能作为 candidate evidence（`candidate_evidence_only=true`）。

边界：

- 校验 read-only、deterministic、no network。
- 不运行真实 Pipeline。
- 不执行 Sync/Reconcile。
- 不运行真实 Tail Gate。
- 不证明任何 target project 完成 Tail。
- 不证明 Topic 07 formal closure。
- 不实施 D09。

## Pipeline Bootstrap Boundary And Tail Entry Eligibility 校验（Topic 07-E R1）

`validate-skill-contracts.rb` 新增 Topic 07-E R1 静态合同校验，覆盖 bootstrap 写权限边界（F-001）与结果/Tail entry eligibility 矩阵（F-002）。

### bootstrap write 不属于 Pipeline

- Pipeline 与 Pipeline Core 不执行 write-mode business-domain bootstrap；`.specify/business_domain/**` 生成不属于 Pipeline，也不是 Preflight side effect。
- 当前 business-domain 知识缺失时，Pipeline 只做只读 readiness inspection（检查 bootstrap config、项目 profile、既有 business-domain 文档的 current/可路由状态），在 Preflight 阻塞并输出固定 blocker `INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED`。
- 实际 bootstrap 位于 Pipeline 外部，需要独立明确授权，不由 Pipeline controller 拥有；独立 bootstrap 完成后必须重新进入 Pipeline Preflight，并重新检查新证据的 freshness、scope 与 ownership。
- 该 blocker 不得路由到 Shared Tail Sync：首次 business-domain bootstrap 是 Core input readiness 问题；Shared Tail Sync 只处理实现后的稳定事实同步，不能被用来绕过缺失的 Core knowledge input。

### dry-run preview 边界

- Pipeline scope 中任何 bootstrap script invocation 必须显式包含 `--dry-run`，不得包含 `--force`。
- preview 是只读 readiness command，不产生 target repository knowledge write，被记录为 preview 而不是 bootstrap execution。
- 缺少 `--dry-run` 的 bootstrap command、或 Pipeline write-mode bootstrap 请求，均属于 Stop Conditions。

### 五行 Result / Tail Entry Eligibility 矩阵

以下矩阵是强制合同，`COMPLETED` 是唯一 Handoff=true 且 Tail Entry=true 的结果：

| Pipeline Result | Core Completion | Shared Tail Handoff Emitted | Tail Entry Eligible | Shared Tail Status | Tail Gate Result | Tail Status Recommendation | Next Step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| COMPLETED | true | true | true | pending | not_evaluated | in_progress | Shared Documentation Governance Tail |
| PARTIAL | false | false | false | not_entered | not_applicable | unchanged | remaining Core work |
| BLOCKED | false | false | false | not_entered | not_applicable | unchanged | earliest affected Core node |
| REGATE_REQUIRED | false | false | false | not_entered | not_applicable | unchanged | required upstream Re-Gate |
| DIRECT_IMPLEMENTATION_RECOMMENDED | false | false | false | not_entered | not_applicable | unchanged | Direct Implementation route |

### 只有 COMPLETED 输出 Shared Tail Handoff

- Shared Tail Handoff section 是 conditional section，只在 `Shared Tail Handoff Emitted=true`（即 Pipeline Result=`COMPLETED`）时输出。
- 非 COMPLETED 结果只输出 `Core Stop And Route` 诊断；该 section 不是 Tail Handoff，不是 Tail evidence。
- 非 COMPLETED 结果不得建议 Tail `in_progress`、不得设置 completion source、不得进入 Shared Tail，按结果返回 Core/Development Path next step（remaining Core work / earliest affected Core node / required upstream Re-Gate / Direct Implementation route）。
- Manifest 建议矩阵同样只对 COMPLETED 建议 Tail status=`in_progress` 与 Tail Gate=`not_evaluated`；非 COMPLETED 保持 Tail status `unchanged`。

### Validator negative self-tests 与 markers

- Validator 使用内存字符串 deep copy 制造负向 self-tests，不修改仓库文件；每个 self-test 绑定预期 diagnostic，未知异常或无关错误不能算成功拒绝。
- 至少拒绝：bootstrap command 移除 `--dry-run`、增加 `--force`、恢复 active bootstrap wording、Stage Sequence 恢复 bootstrap script execution、BLOCKED Handoff=true、REGATE_REQUIRED Tail status=in_progress、PARTIAL Tail Entry=true、DIRECT next step=Shared Tail、COMPLETED Handoff=false、第六个 primary result、恢复 "Every pipeline result must contain Shared Tail Handoff"、generic Tail status 固定为 in_progress。
- 成功时由真实断言输出五个 markers：

```text
PIPELINE_BOUNDARY_BOOTSTRAP_WRITE_FAIL_CLOSED true
PIPELINE_BOUNDARY_BOOTSTRAP_DRY_RUN_ONLY true
PIPELINE_BOUNDARY_RESULT_MATRIX_VALIDATED true
PIPELINE_BOUNDARY_TAIL_ENTRY_ELIGIBILITY_FAIL_CLOSED true
PIPELINE_BOUNDARY_SELFTESTS_PASS true
```

### 边界

- 该静态校验 read-only、deterministic、no network；不执行真实 bootstrap、不运行真实 Pipeline、不执行 Sync/Reconcile、不运行真实 Tail Gate。
- CI success 不是 review PASS；该 R1 校验不独立建立 Topic 07 formal closure，正式 closure 由聚合式 Topic 07 Formal Closure validator 建立；D09 仍未实施。

## Pipeline Active Runtime Conditionality 校验（Topic 07-E R2）

`validate-skill-contracts.rb` 新增 Topic 07-E R2 静态合同校验：active runtime 文字必须严格服从五行 Result / Tail Entry Eligibility 矩阵。矩阵正确但 active wording 与矩阵冲突仍会失败；校验使用 section-scoped 解析，不把全文件出现 `COMPLETED` 当作局部语句已条件化的证明。R2 只扫描五个 active runtime 文件：SKILL.md、Pipeline Contract、`stage-sequence.md`、`side-effect-boundaries.md`、`output-and-manifest.md`。

### Active runtime conditionality（F-003 至 F-006）

- SKILL Core Rules：Tail `in_progress` 建议必须带 `COMPLETED` 条件；禁止无条件 "the Pipeline only recommends Tail status in_progress" 表述；Output Pipeline Result 通用输出列表不得把 Shared Tail Handoff 列为 mandatory。
- Contract Responsibilities / Flow Contract / Output Contract / Gate Requirements：Shared Tail Handoff 表述必须带 `COMPLETED` 条件；禁止 "在 Implement 完成后输出 Shared Tail Handoff"、"只输出 Shared Tail Handoff"、"Core 完成后必须输出 Shared Tail Handoff" 等无条件表述。
- Contract metadata：`output_artifacts` 中 Handoff 必须表达为 conditional Shared Tail Handoff for COMPLETED result only；`side_effects` 中 produce Handoff 同样必须 conditional。
- Stage Sequence Handoff Boundary：Handoff 必须满足四项成功条件（Pipeline Result=`COMPLETED`、Core Completion=true、Implement completed、无 Core blocking item）；禁止 "After Implement, the Pipeline produces a Shared Tail Handoff" 与 "After Implement, hand off the Shared Tail Handoff to the Shared Tail"；`COMPLETED` 是唯一 Tail entry eligible 结果。
- Manifest Side Effects：只有 `COMPLETED` 可建议 Tail `in_progress`；非 `COMPLETED` 保持 `unchanged`；任何结果不得建议 Tail completed；completion source 始终由 Tail Gate 建立。
- Blocking Or Deferred Items：Tail blockers 只有在 Core `COMPLETED` 后才进入 Handoff；Core blocker 导致非 `COMPLETED` 时不得生成 Handoff；不得声称所有 blockers 均携带进 Handoff。

### 通用 Manifest Next Step 必须 result-specific

- 通用 Manifest Update Recommendation 不得固定 "Next Step: Shared Documentation Governance Tail"，必须使用 result-specific next step（COMPLETED → Shared Documentation Governance Tail；PARTIAL → remaining Core work；BLOCKED → earliest affected Core node；REGATE_REQUIRED → required upstream Re-Gate；DIRECT_IMPLEMENTATION_RECOMMENDED → Direct Implementation route）。
- 非 `COMPLETED` 的 next-step 映射必须完整：四个非 COMPLETED 结果全部覆盖。
- 只有 `COMPLETED` 允许输出 Handoff 与建议 Tail `in_progress`；非 `COMPLETED` 保持 Tail status `unchanged` 与 Shared Tail Status `not_entered`。

### R2 negative self-tests 与 markers

Validator 使用内存字符串 deep copy 制造六个 R2 negative self-tests，不修改仓库文件；每个 self-test 绑定预期 diagnostic，未知异常或无关错误不能算成功拒绝：

1. `skill_unconditional_tail_in_progress`：恢复无条件 Tail `in_progress`，必须产生绑定 diagnostic。
2. `side_effect_unconditional_tail_in_progress`：恢复 Manifest Side Effects 无条件 `in_progress`，必须失败。
3. `stage_sequence_unconditional_handoff`：恢复 "After Implement, the Pipeline produces a Shared Tail Handoff"，必须失败。
4. `contract_unconditional_handoff`：恢复无条件 Contract responsibility，必须失败。
5. `generic_manifest_next_step_shared_tail`：通用 Manifest Update Recommendation 固定为 Shared Tail，必须失败。
6. `blocking_items_always_carried_to_handoff`：恢复所有 blockers 均携带进 Handoff，必须失败。

成功时由真实断言输出三个 R2 markers：

```text
PIPELINE_BOUNDARY_ACTIVE_RUNTIME_CONDITIONALITY_VERIFIED true
PIPELINE_BOUNDARY_MANIFEST_NEXT_STEP_MATRIX_VERIFIED true
PIPELINE_BOUNDARY_EQUIVALENT_SEMANTIC_SELFTESTS_PASS true
```

### 边界

- 该静态校验 read-only、deterministic、no network；不运行真实 Pipeline、不执行真实 bootstrap、不执行 Sync/Reconcile、不运行真实 Tail Gate。
- static validation 不运行真实 Pipeline；CI success 不是 review PASS。
- 该 R2 校验不独立建立 Topic 07 formal closure，正式 closure 由聚合式 Topic 07 Formal Closure validator 建立；D09 仍未实施。

## Pipeline Contract Side Effect Conditionality 校验（Topic 07-E R3）

R2 已覆盖 Contract metadata、Responsibilities、Flow Contract、Output Contract、Blocking Conditions 与 Gate Requirements；Contract prose `## Side Effects` 仍含无条件 Handoff bullet，构成合同缺口。R3 补充对该 section 的独立、fail-closed 静态校验。

### Contract prose Side Effects 条件化

- 同文件其他 section（metadata、Responsibilities、Flow、Output、Blocking、Gate）已条件化，不构成 `## Side Effects` 该 section 已条件化；该 section 必须独立满足条件化要求，不得把条件化委托给其他 section。
- Handoff side effect 需要四项成功条件：Pipeline Result=`COMPLETED`、Core Completion=true、Implement 完成、无 Core blocking item。
- 条件满足时：输出 Shared Tail Handoff、转交既有 Sync/Reconcile candidate evidence pointers、`Shared Tail Handoff Emitted=true`、`Tail Entry Eligible=true`。
- 条件不满足（任何非 `COMPLETED` 结果）时：不输出 Shared Tail Handoff、输出 `Core Stop And Route`、`Shared Tail Handoff Emitted=false`、`Tail Entry Eligible=false`、不进入 Shared Tail。
- Handoff 不是 Tail completion evidence；existing Sync/Reconcile 结果只是 candidate evidence。
- 下列旧表述是被禁止的 regression / negative self-test / old invalid wording，不得作为当前有效合同（active Contract `## Side Effects` 必须 fail-closed）：

```text
- 输出 Shared Tail Handoff（含既有 Sync/Reconcile candidate evidence pointers）。
```

### Validator section-scoped 检查

- 独立提取 `## Side Effects`（`extract_section(contract, "## Side Effects")`），只用 section-scoped 内容，不用整个 Contract 文本代替，不以全文件存在 `COMPLETED` 代替局部条件。
- 检查：Handoff conditional bullet 存在且 Handoff 所在逻辑明确包含 `COMPLETED`；包含 Core Completion=true；包含 Implement completed 或等价明确表达（Implement 完成）；包含 no Core blocking item 或等价明确表达（无 Core blocking item）；包含非 `COMPLETED` → Core Stop And Route；不存在无条件 Handoff bullet。
- 以下情况必须失败：Handoff bullet 不含 `COMPLETED`；只写“实现完成后输出 Handoff”或“Core 完成后输出 Handoff”；只在 Responsibilities 或 metadata 中存在 `COMPLETED`/conditional；section 没有非 `COMPLETED` 路由；section 允许所有结果输出 Handoff；使用 ambiguous “when applicable”；把 blocker 一并携带进 Handoff。
- Diagnostic 前缀为 `pipeline-boundary-r3:`，明确区分 section missing / Handoff bullet missing / Handoff bullet unconditional / Core Completion condition missing / Implement completion condition missing / no-blocker condition missing / non-COMPLETED Core Stop route missing，不复用含义模糊的 generic error。

### R3 negative self-test

- self-test ID `contract_side_effect_unconditional_handoff`：只 mutation Contract prose `## Side Effects` 的 Handoff bullet（替换为无条件旧 bullet），不修改 Responsibilities、metadata 或其他 section。
- self-test 调用真实 R3 diagnostic function；expected diagnostic 绑定 Contract prose Side Effects / unconditional Handoff / missing COMPLETED condition。
- mutation 必须真实改变文本（`mutated_text != original_text`）；若 `sub` 未改变文本，self-test 失败并输出明确 diagnostic，不得把 baseline 文本当 mutation 结果。
- 空 diagnostics、nil、无关 diagnostics、未知异常或 parser exception 均不得视为成功拒绝。

### R3 marker

成功时（Contract Side Effects section diagnostic 为空、R3 self-test diagnostic 为空、baseline R1/R2 diagnostics 为空、全局 errors 为空）输出：

```text
PIPELINE_BOUNDARY_CONTRACT_SIDE_EFFECT_CONDITIONALITY_VERIFIED true
```

五个 R1 markers、三个 R2 markers 与 `skill contract validation ok` 继续保留并真实输出。

### 边界

- 该静态校验 read-only、deterministic、no network；不运行真实 Pipeline、不执行真实 bootstrap、不执行 Sync/Reconcile、不运行真实 Tail Gate。
- static validation 不运行真实 Pipeline；CI success 不是 review PASS。
- 该 R3 校验不独立建立 Topic 07 formal closure，正式 closure 由聚合式 Topic 07 Formal Closure validator 建立；D09 仍未实施。

## Topic 07 Formal Closure Validation

`validate-skill-contracts.rb` 新增聚合式、fail-closed 的 Topic 07 Formal Closure validator（`topic07_closure_diagnostics`），对 Topic 07 formal closure 状态建立聚合校验。该 validator 读取 `ai-sdlc/development-path-governance.md` 与 `docs/VALIDATION.md`：

- Topic 07 closure 是聚合式状态校验：四个前置 implemented rows 必须精确匹配且各出现一次——P1 Gate Runner Development Path Entry enforcement、P1 Gate Runner Tail Completion enforcement、P2 Direct / Speckit / Tail 完整场景验证（validation-only scenario conformance）、07-E Speckit Pipeline boundary alignment。
- 五个状态 row（四个前置 + `Topic 07 formal closure`）必须精确匹配且唯一，closure row 说明非空；任何 pending 变体、重复 row、缺失 row 或非 implemented 状态均失败。
- dedicated closure section（`### Topic 07 Formal Closure`）必须存在且唯一，section 内必须包含四项 basis、`validation-only`、Manifest authority、Pipeline result 不能替代 Tail Completion Gate、D09 尚未实施、不代表真实 target-project runtime 执行、不代表真实 requirement Tail completed 等边界；不使用全文件关键词替代 section-scoped 检查，也不允许 section 提升 scenario harness 的 authority。
- D09 必须保持未实施；任何 D09 implemented row 均失败。
- validator 使用 fail-closed diagnostics，前缀 `topic07-formal-closure:`，区分 status matrix missing / prerequisite row missing / prerequisite row not implemented / closure row missing / closure row duplicate / closure row not implemented / closure row explanation empty / closure dedicated section missing / closure section required boundary missing / scenario authority escalated / Manifest authority missing / Pipeline result boundary missing / D09 marked implemented / Validation doc closure section missing 等，不输出 generic failure。
- negative self-tests 使用内存字符串 deep copy（不修改仓库文件），覆盖：closure row 改回 pending、Gate Runner Entry enforcement 改回 pending、Gate Runner Tail Completion enforcement 改回 pending、scenario validation 改回 pending、Pipeline boundary 改回 pending、D09 标记 implemented、dedicated section 被移除、closure row 被复制。
- 每个 self-test 声明 ID、mutation 文件与 expected diagnostic，验证 mutation 真实改变文本（mutation effectiveness 必须检查，baseline 文本不得当作 mutation 结果）；nil、空或无关 diagnostics 不能算成功；未知异常和 parser exception 不能算成功拒绝。
- 成功 marker 为 `TOPIC07_FORMAL_CLOSURE_VALIDATED true`，只在 closure baseline diagnostics 为空、closure self-test diagnostics 为空、全部既有 validator diagnostics 为空且全局 `errors` 为空时输出。

边界：

- scenario harness 单独不能建立 Topic 07 closure；Pipeline validator 单独不能建立 Topic 07 closure；Gate Runner runtime 单独不能建立 Topic 07 closure；closure 只由聚合 validator 建立。
- closure 校验不运行真实 target-project Gate，不执行真实 Pipeline，不执行 Sync/Reconcile，不运行真实 Tail Gate。
- closure 不证明任意 requirement Tail completed，不建立 completion source。
- CI success 不是 implementation review PASS。
- D09 仍未实施。

## D09-A1 Governance Tail Result Contract Validation

`core/loop-governance-tail-result.ts` 与 `tests/loop-governance-tail-result.test.ts` 组成 D09-A1 governance-tail-result contract 验证：

- **Schema**：固定 `loop-governance-tail-result-v1`，root 只允许 19 个字段且顺序固定；`schema`、`status=completed`、`reason_code=GOVERNANCE_TAIL_COMPLETED`、`blocking_items=[]` 为固定值；不接受任何其他 status 或 reason code。
- **只表达 completed**：该 artifact 只表达 Shared Documentation Governance Tail 已正式完成并具备 governed publish 资格；不表达 pending、blocked、failed 或部分完成；它是完成证据聚合结果，不是完成判定 owner——Tail Completion Gate 与 Manifest 仍分别拥有正式完成判定和当前状态权威。
- **Evidence 集合**：docflow 覆盖 `03-实现记录` / `04-代码审核` / `05-测试验收`（review/test 仅 `PASS` 或 `PASS_WITH_RISK`）；`implementation_files` 与 `files` 必须非空、严格升序、无重复且 implementation files 是 files 的子集；所有 Evidence Ref 路径必须出现在 root `files` 中。
- **Conditional decision 矩阵**：business_domain_sync 只允许 `SYNC_REQUIRED`（write_authorized=true、execution_status=completed、evidence）或 `NOT_REQUIRED`（write_authorized=false、execution_status=not_required、完整 Decision Basis）；reconcile 只允许 `required`/`not_required` 两态；entry_coverage 只允许 `PASS`/`not_applicable`；regate 只允许 `PASS`/`not_required`；not-required/not-applicable 状态必须携带完整 Decision Basis（scope/reason/evidence/decision_source/decision_owner/version_basis/stale_condition）。
- **Manifest/Tail Gate 绑定**：manifest 文件名必须为 `manifest.md`，`tail_status=completed`；completion_evidence 必须按 path 排序、无重复且包含 docflow 与全部非 null conditional evidence；Tail Gate 必须 `persisted=true`、`read_back_verified=true`、result 为 `PASS`/`PASS_WITH_RISK`、`reviewed_manifest_version=manifest.version`；manifest 与 tail_gate 的 completion_decision_source 必须精确等于 Tail Gate 文件自身的 path/version/digest；Manifest path 与 Tail Gate path 不得相同。
- **Canonical bytes**：builder 输出 UTF-8、固定 property order、无 BOM、无实际 CR/NUL、精确一个 trailing LF、SHA-256 小写 hex；默认 maxBytes=1048576，超限返回 `too_large`。
- **Parser round-trip equality**：parser 只接受 Uint8Array，先防御性复制有界 bytes，拒绝 BOM/CR/NUL、缺失或多余 trailing LF，fatal UTF-8 解码，JSON parse 失败返回 `invalid_bytes`，调用与 builder 相同的真实 validator，重建 canonical bytes，只有输入 bytes 与重建 bytes byte-identical 才成功；round-trip 拒绝重复 JSON keys、额外 whitespace、错误 property order、非 canonical 数字格式、缺失/额外字段与非 canonical escaping。
- **Adversarial 输入**：exact-key scan、拒绝 symbol key、`__proto__`、accessor、非 plain prototype、sparse array、array 额外 own property；一次 descriptor snapshot 后不再读取原对象；Proxy/revoked Proxy 反射失败 fail-closed；限制数组元素数量、单字符串 UTF-8 字节与总 artifact 字节；未知 exception 不传播，失败 diagnostic 安全、有限长。
- **Artifact Store kind**：`LoopArtifactKind` 与 `LOOP_ARTIFACT_KINDS` 只新增 `governance_tail_result`（canonical ref `loop-artifact:v1:governance_tail_result:sha256:<64hex>`），原十种 D01～D08 kinds 保持不变；新 kind 支持 put/read、idempotent put、blob mode 0600 与并发 put。
- **测试 markers**：`D09_A1_GOVERNANCE_TAIL_RESULT_SCHEMA_VERIFIED`、`D09_A1_GOVERNANCE_TAIL_RESULT_CANONICAL_BYTES_VERIFIED`、`D09_A1_GOVERNANCE_TAIL_RESULT_FAIL_CLOSED`、`D09_A1_ARTIFACT_KIND_VERIFIED`、`D09_A1_D01_D08_REGRESSION_PRESERVED`、`D09_A1_TEMP_CLEANUP_COMPLETE` 只在对应断言全部成功时输出；summary 格式 `D09_A1_GOVERNANCE_TAIL_RESULT_SUMMARY passed=<N> failed=0`。

边界：

- 本模块与测试不运行真实 Shared Tail，不执行真实 Sync、Reconcile、Entry Coverage 或 Tail Gate，不调用 D03/D06/D07，不创建真实 workspace，不执行真实 Git。
- 本任务不创建 commit/push/PR 的生产副作用（验收在 task branch 内完成），不建立 requirement completion，不表示 D09 已实现，不表示 merge 或 publication 授权。
- 跨 artifact 的 identity、digest 与 byte binding 由未来 D09-B 与 D09-A2 执行；A1 只验证 ref 格式。
- A1 不重新判断 `PASS_WITH_RISK` 的业务风险接受；D09-B 在构建 A1 artifact 前要求 Tail 结果状态为 `completed` 并携带 completion package（A1 builder 全量验证 package 与 Tail Completion Gate）。
- CI success 不是 implementation review PASS；D09-B 已通过最终实施审查（D09-B-R1/R2 为历史审查过程）并随 PR #60 合并至事实分支（candidate head `6ac187a`，merge commit `845ff9ee`），post-merge fact-branch verification 通过，D09 Source closure 完成；D10 仍未授权。

## D09-A2 Governed Delivery Publisher Validation

`core/loop-delivery-publisher.ts` 与 `tests/loop-delivery-publisher.test.ts` 组成 D09-A2 governed delivery publish 验证（D09-A2 governed publisher 已进入 Source）：

- **Standalone byte compatibility**：governance ref 缺失时，D07 standalone 行为保持字节级兼容——`loop-publish-intent-v1` intent bytes/SHA-256、commit message、`loop-publish-pr-body-v1` PR body/SHA-256、`loop-publish-result-v1` result bytes、recovery intent、trace stages/顺序、runtime own keys 与 result-store-failure 行为均以编辑前固定常量断言；standalone runtime result 不新增值为 `undefined` 的 own property，standalone body 不调用 governed Markdown escaping helper。
- **A1 parser 复用**：governed 模式从当前 Source 导入 `parseLoopGovernanceTailResultBytes`、`LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES` 与 A1 readonly 类型；不复制 A1 validator；ref 精确匹配 `governance_tail_result` kind；bytes 超限在复制/解析前拒绝；ref digest 与实际 bytes SHA-256 精确相等；parser 失败 fail-closed；只使用 parser 返回的 canonical frozen value；不读取或执行 A1 中的 evidence 文件。
- **Identity/delivery/files/workspace 交叉绑定**：A1 identity 与 request identity 九字段逐项相等；`A1.delivery_result_artifact_ref === request.deliveryResultArtifactRef`；`A1.implementation_files` 与 D06 delivery files 数组长度、顺序、每个 path 精确相等（不允许 subset/排序/去重）；D06 与 A1 workspace provenance 的 `workspace_path`/`task_branch`/`task_head_sha`/`task_has_changes=true` 相等，`status_digest_sha256` 允许不同；A1 `orchestration_result_artifact_ref` 与 `executor_input_artifact_ref` 只作为 governed evidence chain 保存，不读取其 bytes。
- **Effective final workspace**：standalone 为 D06 final workspace，governed 为 A1 final workspace；D03 snapshot 必须与 effective final workspace 精确匹配（path/branch/HEAD/status digest/has-changes）；fresh 与 recovery 模式的 precommit HEAD/status digest 均来自 effective authority。
- **Effective final files**：standalone 为 D06 files，governed 为 A1 files（保持 A1 canonical 顺序，不修改、不追加、不过滤 A1 数组；A1 parser 已保证 implementation_files ⊆ files）。
- **Exact staging**：standalone 以 D06 files、governed 以 A1 files 为 expected set；保留全部既有 staging 门禁（porcelain status、unstaged/cached name-status、untracked、rename/copy/unmerged/malformed token 拒绝、extra/missing path 拒绝、exact `git add -- <effective files>`、post-add 检查、`git diff --cached --check`、`git write-tree`）；不自动清理 workspace，不 stage effective files 之外的内容。
- **Governed intent**：schema 固定 `loop-governed-publish-intent-v1`，21 字段固定顺序（schema/run_id/requirement_id/repository/base_branch/expected_base_sha/task_branch/precommit_head_sha/precommit_status_digest_sha256/staged_tree_sha/orchestration_result_artifact_ref/executor_input_artifact_ref/delivery_result_artifact_ref/governance_tail_result_artifact_ref/implementation_files/files/commit_subject/commit_author_name/commit_author_email/pr_title/pr_body_schema）；仍存为 `workspace_metadata`；recovery intent 必须与重建 governed intent byte-identical；standalone intent 不能恢复 governed 模式，governed intent 不能恢复 standalone 模式，更换 governance ref 后旧 intent 失效。
- **Governed result**：schema 固定 `loop-governed-publish-result-v1`，26 字段固定顺序（含 orchestration/executor/delivery/governance refs、implementation_files、files）；仍存为 `workspace_metadata`；store failure 路径保留 governed 字段集与 commit/push/PR facts，返回 `ARTIFACT_STORE_FAILED`，不退化为 standalone 字段集。
- **Governed commit/recovery**：commit message 固定四行 trailer（Run-Id/Delivery/Governance-Tail/Publish-Intent）且精确一个 trailing LF；recovery 验证 exactly one parent、parent=effective precommit HEAD、tree=staged tree、message/author/commit files/workspace clean；不创建第二个 commit。
- **Governed Draft PR evidence**：body 首行固定 `## LOOP-DELIVERY-09 — Governed Delivery Publish`，八章节固定顺序（Identity And Publish / Artifact Chain / DocFlow Evidence / Conditional Governance Evidence / Manifest And Tail Gate / Implementation Files / Final Governed Files / Governance）；Conditional Governance 只列出 evidence path/version/digest 或 `basis recorded in governance-tail artifact`（不复制 Decision Basis 七个 free-form 字段原文）；Governance 章节固定声明（Draft/Review/Merge/Requirement completion/D09 overall/Exchange/Personal KB），不输出 `D08: not authorized`。
- **Markdown escaping**：只为 governed PR body 做确定性 scalar escaping；拒绝 NUL/CR/LF/C0/DEL/C1；固定转义顺序 `&`→`&amp;`、`\`→`&#92;`、backtick→`&#96;`、`<`→`&lt;`、`>`→`&gt;`；不双重转义；unknown exception、runner stdout/stderr 不写入 body。
- **Real Source invariance**：测试期间 real Source HEAD/status/diff/staging 保持不变（`D09_A2_REAL_SOURCE_UNCHANGED`）。
- **Temp cleanup**：全部临时目录清理成功（`D09_A2_TEMP_CLEANUP_COMPLETE`）。
- **Markers**：`D09_A2_GOVERNED_MODE_VERIFIED`、`D09_A2_STANDALONE_BYTE_COMPATIBILITY_VERIFIED`、`D09_A2_GOVERNANCE_ARTIFACT_BINDING_VERIFIED`、`D09_A2_FINAL_WORKSPACE_AUTHORITY_VERIFIED`、`D09_A2_GOVERNED_STAGING_VERIFIED`、`D09_A2_GOVERNED_INTENT_RESULT_VERIFIED`、`D09_A2_GOVERNED_COMMIT_RECOVERY_VERIFIED`、`D09_A2_GOVERNED_DRAFT_PR_VERIFIED`、`D09_A2_MARKDOWN_ESCAPING_VERIFIED`、`D09_A2_REAL_SOURCE_UNCHANGED`、`D09_A2_TEMP_CLEANUP_COMPLETE` 只在对应真实断言全部成功时输出；负向测试每个 mutation 必须先证明真实生效，未捕获 throw 不算成功拒绝，检查具体 reason 与绑定 diagnostic。

边界：

- 本模块与测试不运行真实 Shared Tail，不产生 A1 artifact，不执行 D09-B，不生成 D09 terminal result，不建立 requirement completion，不 mark Ready，不 merge。
- D09-A2 只实现 governed publish 模式本身；governed 消费已进入 Source 的 A1，不重新判断 Tail Completion Gate。
- CI success 不是 implementation review PASS；D09-B 已通过最终实施审查（D09-B-R1/R2 为历史审查过程）并随 PR #60 合并至事实分支（candidate head `6ac187a`，merge commit `845ff9ee`），post-merge fact-branch verification 通过，D09 Source closure 完成；D10 仍未授权。

## D09-B Production Coordinator Validation

`core/loop-production-coordinator.ts` 与 `tests/loop-production-coordinator.test.ts` 组成 D09-B production coordinator 验证（D09-B 已通过最终实施审查；D09-B-R1/R2 correction rounds 为历史审查过程；PR #60 已合并至事实分支）：

- **唯一根输入**：只接受固定 `loop-artifact:v1:orchestration_result:sha256:<digest>` artifact ref；不接受内存 requirement/design/executor-input 对象、浮动 ref 或调用者声称的 route/status；`executor_input` ref 必须从经过验证的 orchestration artifact 取得；request 不接受 `recoveryPublishIntentArtifactRef`（作为未知字段 fail-closed，D09-B 不承载 publish-intent 跨进程恢复）。
- **Producer-owned parsers（R1）**：四个 canonical parsers 是 D08/D06/D07 的 additive public contracts，随各 producer 的 canonical builder/常量共同演进：`parseLoopOrchestrationResultBytes`/`parseLoopDirectExecutorInputBytes` 在 `loop-requirement-design-orchestrator.ts`（D08），`parseLoopDeliveryResultBytes` 在 `loop-autonomous-delivery-loop.ts`（D06），`parseLoopDeliveryPublishResultBytes` 在 `loop-delivery-publisher.ts`（D07）；coordinator 只 import/consume，不再定义 parser、不再镜像 producer 的 route/status/reason/trace 枚举与字段顺序；均为 bounded defensive copy、strict UTF-8、exact keys、canonical property order、canonical bytes 重建 byte-identical round-trip、artifact-ref/digest/identity/material binding、no-throw、fail-closed；不改变任何既有 artifact bytes，不改变 D08/D06/D07 既有执行结果、公开字段与行为（D07 standalone 与 governed 兼容合同保持，standalone/governed golden bytes 与 digest 不变）。
- **执行链（R1）**：固定 orchestration ref → D08 parser 验证 `direct / DIRECT_READY` → executor-input parser → D03 prepare（base/source/identity binding，drift 一律 blocked）→ **pristine workspace gate**（进入 D06 前必须证明 workspace 仍是初始 pristine pre-implementation 状态：`taskHeadSha === expectedBaseSha`、`taskHasChanges === false`、`taskStatusDigestSha256 === sha256(空 canonical git-status bytes)`；recovered/dirty/advanced workspace 一律 `blocked / WORKSPACE_DRIFT`，D06 禁止重放）→ D06 execute（预算 = min(executor 预算, 共享剩余预算)）→ delivery artifact read-back + parser + 与内存结果 files/final workspace 精确绑定 → 注入式 Shared Documentation Governance Tail（typed dependency；coordinator 不重实现 Gate Runner/Sync/Reconcile/Entry Coverage/完整 Tail）→ **Tail 不可变 snapshot + completed reason 精确绑定**（descriptor-based exact-key snapshot，拒绝 accessor/symbol/`__proto__`/非 plain prototype/Proxy reflection failure；completion package 有界、引用隔离、拒绝循环；`completed ⟺ reasonCode === GOVERNANCE_TAIL_COMPLETED ⟺ completionPackage 存在`；后续只读 snapshot）→ **pre-A1 cross-binding**（A1 builder 与任何 `governance_tail_result` put 之前，Tail completion package 必须与 parsed D06 精确绑定：implementation files 长度/顺序/逐项相等、final workspace path/branch/HEAD 相等、双方 `task_has_changes === true`、files 为 implementation files 超集；仅 status digest 允许因 Shared Tail 写入变化）→ A1 build（真实 builder 全量验证 package）/store descriptor/read-back digest/parse/canonical value comparison → **post-A1 二次 cross-binding defense** → D03 post-Tail inspect 与 A1 final workspace 精确一致 → **publisher factory（R1）**：`LoopDeliveryPublisherFactory.create(maxTotalDurationMs)` 注入，D07 前重新执行 fresh clock gate，`create()` 收到当前共享剩余预算（不足 D07 最小预算时在 create 前 `TOTAL_TIMEOUT`；factory throw / 返回不可信对象 fail-closed）→ D07 governed publish（请求始终携带 `governanceTailResultArtifactRef`，无 standalone fallback）→ publish-result read-back + parser（**全链绑定（R1）**：expectedMode governed + orchestration ref/executor ref/delivery ref/governance ref/implementation files/final files 全部精确绑定；persisted 与内存结果的 status/reasonCode/recoveryStage/refs/commit/push/PR facts 逐项一致，任一不一致 `blocked / PUBLISH_READBACK_AMBIGUOUS`，不重放）。
- **Request/identity 单次 snapshot（R1）**：第一次 clock sample / dependency 调用 / await 之前，request 与 identity 做 descriptor-based exact-key snapshot（拒绝 accessor/symbol/`__proto__`/未知或缺失字段/非 plain prototype/throwing 或 revoked Proxy）；`validateLoopRunIdentity` 在 snapshot 上执行；构建新的 frozen canonical identity；后续所有阶段（D08 parser expected identity、D03、D06、Shared Tail、A1、D07、结果与 trace）只使用 snapshot，调用者原对象不再被读取；`zeroState()` 不重读原 request、不触发 getter。
- **Order-independent typed records（R2 / F-008）**：coordinator 自有 typed records（request、identity、Shared Tail 顶层结果、completion package 根对象）执行**顺序无关 exact-key validation**——调用者属性插入顺序不是公共合同的一部分；descriptor value 按输入实际顺序一次捕获，再按内部固定字段顺序重建 plain snapshot（frozen、零引用共享、后续不再读取原对象）；拒绝未知/缺失字段、accessor、symbol、`__proto__`、non-plain prototype、throwing/revoked Proxy 与 reflection failure；Tail 顶层按已捕获的 `status` 值决定 `completionPackage` 是否存在（completed ⟺ reasonCode === `GOVERNANCE_TAIL_COMPLETED` ⟺ package 存在）；completion package 十二个根字段 exact-key 但顺序任意，嵌套安全 walk（depth/node/array/string bounds、拒绝循环/accessor/symbol/`__proto__`/non-plain prototype/reflection failure、fresh plain rebuild、deep freeze、零引用共享）保持。**Canonical artifact bytes 边界保持**：D08 orchestration/executor-input parser、D06 delivery parser、D07 publish parser 与 A1 governance-tail-result parser 继续 order-sensitive（property order、round-trip、byte-identical 校验不放宽；reordered artifact bytes 仍拒绝；standalone/governed golden bytes 与 digest 不变）。
- **Shared Tail 边界**：pending/in_progress/blocked/failed/throw 不进入 A1 或 D07；恶意 accessor/Proxy/symbol/额外字段/循环引用/不一致 completion package 全部 fail-closed；Tail 依赖不构建或存储 A1、不调用 D07、不 commit/push/PR。
- **A1 ownership**：A1 `implementation_files` 与 D06 files 精确数组相等；A1 `files` 为最终治理文件集合；A1 final workspace 与 post-Tail D03 snapshot 精确一致；Tail Gate `persisted=true`、`read_back_verified=true`、manifest/gate source 精确自绑定；任一验证失败不调用 D07。
- **Recovery 边界**：本轮无 `production_coordinator_state`/`production_coordinator_result` artifact、无新 Artifact Store kind；无法证明 D06/D07 副作用窗口时 blocked（`DELIVERY_READBACK_AMBIGUOUS`/`PUBLISH_READBACK_AMBIGUOUS`），禁止第二次 implementation/fresh replay；D09-B request 不接受 `recoveryPublishIntentArtifactRef`（仅有 D07 publish intent 不足以恢复 D06/Tail/A1，跨进程崩溃恢复完整留给 D10）；不先重跑上游再把旧 publish intent 转发给 D07。
- **Deadline**：deadline = 第一次有效 `execute()` clock sample + `maxTotalDurationMs`（不用 `identity.createdAt`）；所有阶段共享同一 deadline；D06/Shared Tail/D07 只能获得当前剩余预算；clock throw/非有限值/回退 → `CLOCK_INVALID`。
- **测试 markers（保留 + R1/R2 新增）**：`D09_B_PARSERS_VERIFIED`、`D09_B_PRODUCER_OWNED_PARSERS_VERIFIED`、`D09_B_INPUT_FAIL_CLOSED_VERIFIED`、`D09_B_ORCHESTRATION_GATE_VERIFIED`、`D09_B_WORKSPACE_PREPARE_VERIFIED`、`D09_B_RECOVERED_WORKSPACE_NO_REPLAY_VERIFIED`、`D09_B_IDENTITY_SINGLE_SNAPSHOT_VERIFIED`、`D09_B_DELIVERY_READBACK_VERIFIED`、`D09_B_TAIL_BOUNDARY_VERIFIED`、`D09_B_TAIL_FAIL_CLOSED_VERIFIED`、`D09_B_TAIL_SNAPSHOT_AND_REASON_BINDING_VERIFIED`、`D09_B_PRE_A1_BINDING_VERIFIED`、`D09_B_A1_OWNERSHIP_VERIFIED`、`D09_B_FINAL_WORKSPACE_VERIFIED`、`D09_B_PUBLISHER_REMAINING_BUDGET_VERIFIED`、`D09_B_GOVERNED_PUBLISH_VERIFIED`、`D09_B_NO_STANDALONE_FALLBACK_VERIFIED`、`D09_B_AMBIGUOUS_WINDOW_VERIFIED`、`D09_B_PUBLISH_FULL_CHAIN_BINDING_VERIFIED`、`D09_B_DEADLINE_VERIFIED`、`D09_B_ORDER_INDEPENDENT_TYPED_RECORD_SNAPSHOT_VERIFIED`（R2 / F-008：reordered request/identity/completed Tail/non-completed Tail/completion package root 接受、内部 snapshot fixed-order/frozen/reference-isolated、恶意输入继续拒绝、artifact canonical order 仍严格）、`D09_B_CALL_COUNTS_VERIFIED`、`D09_B_NO_READY_MERGE_EXCHANGE_KB_VERIFIED`、`D09_B_REAL_SOURCE_UNCHANGED`、`D09_B_TEMP_CLEANUP_COMPLETE` 只在对应真实断言全部成功时输出；summary 格式 `D09_B_PRODUCTION_COORDINATOR_SUMMARY passed=<N> failed=0`。
- **Dependency call counts**：测试用计数 fake 证明每个副作用阶段（D03 prepare、D06 execute、Shared Tail、A1 put、D03 inspect、publisher factory create、D07 execute）至多调用一次；D09 成功时 trace 顺序固定为 orchestration_verify → executor_input_verify → workspace_prepare → delivery_execute → delivery_readback → governance_tail → a1_build → a1_store_readback → post_tail_inspect → governed_publish → publish_readback → terminal。

边界：

- 本模块与测试不运行真实 Shared Tail、不执行真实 Git/network、不创建真实 workspace；D08 orchestration/executor input 由真实 D08 orchestrator（fake agent/reviewer）与真实 D01 temp store 生成；producer parser 回归在 D08/D06/D07 各自测试文件内（真实 producer artifact byte-identical round-trip、digest 不变、golden compatibility、adversarial bytes）。
- 测试期间 real Source HEAD/status/diff/staging 保持不变（`D09_B_REAL_SOURCE_UNCHANGED`）；全部临时目录清理成功（`D09_B_TEMP_CLEANUP_COMPLETE`）。
- 本任务不产生 commit/push/PR 生产副作用，不 mark Ready，不 merge，不 publish Exchange，不修改 Personal KB；不建立 requirement completion；不表示 merge 或 publication 授权。
- CI success 不是 implementation review PASS；D09-B 已通过最终实施审查（历史审查过程：D09-B-R1 集中修复、D09-B-R2 窄范围修复 F-008 order-independent typed record snapshot），PR #60 已合并至事实分支（candidate head `6ac187ac`，merge commit `845ff9ee`），post-merge fact-branch verification 通过，D09 Source closure 完成。
- CI 可观测性（经 GitHub API 实测）：candidate head `6ac187ac` 的 CI 为 success（workflow run #182，pull_request 事件，check-runs 4 项全部 success）；merge commit `845ff9ee` 的 CI 可独立观测且为 success（workflow run #183，push 事件至 `feature/loop-runtime-v1`，head_sha 精确匹配 merge commit，check-runs 4 项全部 success）；merge SHA 的 legacy commit-status endpoint 无 entries（total_count=0）。
- D09 Source closure 不等于真实单仓 acceptance；D10 仍未授权（D10 checkpoint、完整崩溃恢复、真实 provider binding 与真实单仓硬化均未完成）；D09 success 不等于 requirement completion、Ready、后续 merge 授权或 publication；Exchange 与 Personal KB 未发布。

## validate-skill-contracts.rb 检查什么

当前脚本检查：

```text
1. 每个 skills/sdlc-* 是否有对应 skill-contracts/known-skills/sdlc-*.md。
2. 合同 YAML 元数据是否包含必填字段。
3. 合同 name 是否与文件名一致。
4. category 是否属于允许分类。
5. can_modify_code / can_modify_knowledge_base 是否与 Skill 分类匹配。
6. manifest.yaml 中登记的 skill path 和 contract 是否存在。
7. registry/skill-registry.md 中登记的 Skill 是否与 manifest.yaml 一致。
8. skills/sdlc-* 下是否仍使用 ../../ai-sdlc、../../ess、../../templates、../../skill-contracts 等相对标准路径。
9. 新版 sdlc-* Skill 是否把旧版 .specify/memory、.specify/workflow、.specify/coding_guide 当作正常输入。
10. bootstrap 脚本是否具备 project-context candidate 策略，且不再依赖单一 --force。
11. New-Rail Enhanced Pipeline 是否声明 ProjectWorkflowGuide / ProjectDocumentationGuide、`sdlc-speckit-*` only、development-time fixture、Clarify 边界确认策略和 legacy path no-read/no-write 红线。
12. Frontend Process Products 是否声明并接入 implement / pipeline / reconcile：`specs/{feature}/implementation.md`、`workflow-status.md`、`debug-guide.md`、`observability.md`、`03-实现记录`、`04-交付总结`，且 manifest is status authority。
13. Feature-scoped path consistency 是否通过：当前 runtime 路径必须使用 `specs/{feature}/spec.md`、`specs/{feature}/plan.md`、`specs/{feature}/tasks.md`、`specs/{feature}/route.md`；implement 只能沿用 route artifact，不重新解释 route。
```

成功时输出：

```text
skill contract validation ok
```

失败时输出具体错误并返回非零状态。

## 双轨隔离校验

validator 会扫描 `skills/sdlc-*` 下的 Markdown。

危险语义示例：

```text
read .specify/memory/xxx.md
load .specify/workflow/xxx.md
use .specify/coding_guide/xxx.md as input
```

允许语义示例：

```text
do not read .specify/memory/**
preserve only
preserved_not_runtime_input
preserved_not_read
remain untouched
```

这用于防止新版 `sdlc-*` Skill 把旧版 Speckit 文档当作正常输入。

## bootstrap dry-run 校验

对目标项目执行：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run
```

检查点：

```text
1. 是否预览 .specify/project-governance-profile.yaml。
2. 是否预览 .specify/entry-coverage-profile.yaml。
3. 是否预览 .specify/business-domain-bootstrap.yaml。
4. 是否预览 .specify/project-context/ProjectWorkflowGuide.md。
5. 是否预览 .specify/project-context/ProjectDocumentationGuide.md。
6. 是否预览 .specify/project-context/ProjectCodingGuide.md。
7. 是否预览 .specify/project-context/RepositoryStructure.md。
8. 是否预览 .specify/project-context/ProjectGovernanceOverrides.md。
9. 是否预览 .specify/reports/speckit_generation_report.md。
10. generation report 是否说明旧版文档 runtime action 为 preserved_not_read 或 not_present。
11. 是否不会写文件。
12. 是否不会生成 specs/** 或 .specify/business_domain/**。
```

已有 profile 时，dry-run 应提示真实写入需要 `--force-profiles`，但不应直接失败。

### project type profile 回归样例

对标准包 profile 选择逻辑做结果检验时，可用以下已有仓库形态作为语义样例。该检查是标准包开发期 review，不是目标项目 runtime 必须执行的旧文档对比。

| 样例仓库形态 | 期望 project type profiles | 期望 entry profile 重点 |
| --- | --- | --- |
| 纯后端业务服务，如 `logistics-center` | `backend-business-service` | `controller`、`rpc_provider`、`message_listener`、`scheduled_job`，不得因为普通 `package.json` 或静态资源误判为前端；package.json-only 不能触发 frontend-application。 |
| 后端管理/配置混合系统，如 `pfms` | `admin-mixed-workflow` + `backend-business-service` | `controller`、`worker`、`scheduled_job`、`mcq_consumer`、`oas_event`、`data_console`、`spi`、`rpc_provider`。 |
| React Native / 纯前端应用，如 `pfms-rn` | `frontend-application` | `route`、`page`、`component`、`store_action`、`api_client`、`popup`、`navigation_guard`；Android/iOS native shell 不应触发 Java backend 风格入口。 |
| Spark/Flink/ETL 计算项目，如 `tms-flink-finance` | `data-pipeline-etl` | `spark_job`、`spark_online_etl`、`flink_main`、`flink_process_function`、`mcq_connector`，不应退化成普通 Controller/Service 覆盖模型。 |
| 传统 Java Web 混合项目，如 `wms-monitor` | `frontend-application` + `backend-business-service` | 同时生成 Controller/RPC/MQ/Schedule 入口和 JSP/page/component/API/popup/navigation 等 webapp 入口。 |

Frontend heuristic 不得由 `package.json` 单独触发。只有出现明确前端业务目录或文件时才可选择 `frontend-application`：

```text
src/pages
src/views
src/screens
src/components
src/component
src/router
src/routers
src/routes
src/navigation
src/store
src/stores
src/models
src/actions
src/api
src/services
src/main/webapp
*.jsp / *.ftl / *.vm
```

## bootstrap 正式写入前检查

正式执行前确认：

```text
1. 目标项目是否允许新增 .specify/project-context/**。
2. 目标项目是否允许新增 .specify/reports/**。
3. 目标项目是否允许新增 library/ 并写入 .gitignore 的 /library/。
4. 已有 project-context 是否应生成 .candidate，而不是覆盖。
5. 是否真的需要 --force-profiles。
6. 是否需要保留旧版 Speckit rail。
```

默认不建议直接使用：

```bash
--force-profiles
--force-context
```

除非已经人工确认。

## bootstrap 输出检查

正式执行后检查：

```text
.specify/project-governance-profile.yaml
.specify/entry-coverage-profile.yaml
.specify/business-domain-bootstrap.yaml
.specify/project-context/ProjectWorkflowGuide.md
.specify/project-context/ProjectDocumentationGuide.md
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/RepositoryStructure.md
.specify/project-context/ProjectGovernanceOverrides.md
.specify/reports/speckit_generation_report.md
```

不应生成 legacy inventory 或 pending comparison report；旧版文档只应保留给 legacy rail。

## entry coverage audit 校验

标准 runner：

```bash
scripts/audit-entry-coverage.rb <target-project-path>
```

默认读取：

```text
.specify/entry-coverage-profile.yaml
.specify/business_domain/**
目标代码库
```

默认输出到：

```text
.specify/reports/entry_coverage/
```

必须生成：

```text
entry_inventory.tsv
service_inventory.tsv
entry_chain_evidence.md
unarchived_entries.md
unarchived_services.md
cross_domain_conflicts.md
entry_coverage_report.md
```

阻断式调用使用：

```bash
scripts/audit-entry-coverage.rb <target-project-path> --strict
```

检查点：

```text
1. 无 .specify/business_domain 或无 L4 文档时，仍生成全部报告，并在 summary 中标记 BLOCKED。
2. 有 L4 文档时，entry_inventory.tsv 能区分 archived / unarchived。
3. 同一 entry 命中多个 L2 时，cross_domain_conflicts.md 非空并阻断。
4. 前端、传统 Java Web、后端、ETL、library 项目按 entry profile 的 entry_types 扫描，不按语言硬编码。
5. --strict 在 BLOCKED / PENDING 状态返回非零，供 Sync / Reconcile gate 使用。
6. EntryCoverage table parsing 不再只依赖全文 contains，Markdown 表格中的 Entry Type、Entry Name、Code Anchor、Path、Method、Function、Route、API client、Topic、Job、SQL、Connector、Sink、L4、Status、Evidence、Technical Bridge、Not Applicable 都可作为 evidence。
7. entry_inventory.tsv 必须包含 classification、classification_reason、match_strength、match_reason 或等价字段。
8. service_inventory.tsv 必须包含 classification、classification_reason、reverse_coverage_status 或等价字段。
9. technical bridge、framework bridge、generated/vendor、frontend native shell、abstract/base、annotation/marker、not applicable 必须保留在 inventory 并说明 reason，但不默认成为 blocking unarchived entry。
10. Service / Manager / Mapper reverse coverage 必须检查 entry -> service -> manager -> mapper/repository/client 链路证据；多 L4 命中进入 cross-domain conflict 或 multi-domain warning。
11. ETL core unit reverse coverage 必须支持 spark_job、spark_online_etl、flink_main、flink_process_function、mcq_connector、sink/publisher/downstream handler、SQL lineage、repository、calculator 等 evidence。
12. frontend/RN entry coverage 必须支持 route、page、component、popup/dialog/modal/sheet、store/action/model/reducer、api_client/request/service、navigation_guard、backend/mock boundary。
13. Pods、android/build、ios/build、MainActivity、AppDelegate、node_modules、generated/vendor 等噪声必须按 native_shell 或 generated_or_vendor 分类；只有 profile/evidence 明确纳入业务行为时才作为 business entry 阻断。
14. --requirement-id 或 --feature 传入时，应区分 current_requirement、historical_repository_residue、repository_wide、unmatched scope。
```

## Speckit sync create-if-missing 校验

`sdlc-speckit-sync` 只有在 business_domain 路由已确认时，才允许用 create-if-missing 创建缺失 L4。

必须记录：

```text
Target L1:
Target L2:
Target L4 Id:
Target L4 Document:
Target Owner:
Create-If-Missing Authorization:
Source Evidence:
Entry Coverage Status:
L2 Main Document Index Update:
01DomainCatalog.md Update:
Revision History Update:
```

检查点：

```text
1. 已存在 L4 时，只更新授权目标并保留 source evidence / revision history。
2. 缺失 L4 时，必须确认 L1/L2、owner、create-if-missing 授权和 L4 id reservation。
3. 创建 L4 skeleton 后必须同步更新 L2 main document index 和 01DomainCatalog.md。
4. 前端、后端、ETL、integration、scheduled-job entry fact 都必须说明 entry coverage audit 结果。
5. one-off、未验证、owner 不明确、只服务当前需求的事实不得 create-if-missing。
6. L1/L2 未确认、L4 id 无法保留、business_domain 已有冲突事实或 entry coverage audit 失败时必须 BLOCKED。
7. 不得把缺失目标写入 99PendingConfirmation 当作长期同步结果。
```

## Project-Type L4 Templates 校验

标准包必须提供项目类型化 L4 skeleton 模板：

```text
templates/business-domain-l4/backend-business-service.md
templates/business-domain-l4/admin-mixed-workflow.md
templates/business-domain-l4/frontend-application.md
templates/business-domain-l4/data-pipeline-etl.md
templates/business-domain-l4/library-shared-component.md
```

bootstrap confirmed mode 与 `sdlc-speckit-sync` create-if-missing 必须按 Project Type Profiles 选择模板：

```text
admin-mixed-workflow
data-pipeline-etl
frontend-application
library-shared-component
backend-business-service
```

检查点：

```text
1. backend-business-service L4 必须包含 Entry Chain、Transaction Boundary、Idempotency、Rollback And Compensation、Test Evidence。
2. admin-mixed-workflow L4 必须包含 Configuration Lifecycle、Approval / Audit、Import / Export、Read-Only Query Contract、Concurrency And Rollback。
3. frontend-application L4 必须包含 Route / Page / Component Surface、API And Backend Boundary、Popup / Interaction、State And Visibility、Visual Verification。
4. data-pipeline-etl L4 必须包含 Trigger And Runtime、Input Contract、Output Contract、SQL Lineage、Partition / Window / Checkpoint、Replay And Idempotency、Downstream Consumer Contract。
5. library-shared-component L4 必须包含 Public API、Consumer Scenario、Compatibility、Deprecation / Migration、Test Evidence。
6. `scripts/bootstrap-business-domain.sh --confirmed` 必须从 domain map 或 `.specify/project-governance-profile.yaml` 的 `project_type_profiles` 选择 L4 模板。
7. `sdlc-speckit-sync` create-if-missing 必须从 `specs/{feature}/route.md` 或 Pipeline Domain Route Summary 读取 Project Type Profiles，并记录 Selected L4 Template。
8. 通用 L4 skeleton 不得作为所有项目类型的唯一默认输出；只能在缺少 profile 时记录 conservative backend-business-service fallback。
9. 不得引入 legacy Skill 或 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` runtime dependency。
```

## Frontend Process Products 校验

新轨实现阶段必须有明确过程产物落点，不恢复旧版文件名作为兼容格式。

必须声明：

```text
specs/{feature}/implementation.md
specs/{feature}/workflow-status.md
specs/{feature}/debug-guide.md
specs/{feature}/observability.md
library/{requirement_id}/03-实现记录/{requirement_id}_实现记录.md
library/{requirement_id}/04-交付总结/{requirement_id}_交付总结.md
manifest is status authority
```

检查点：

```text
1. sdlc-speckit-implement 必须知道这些产物的输出边界、生成建议和 stop conditions。
2. sdlc-speckit-pipeline 的 Stage Timeline、Produced Or Reused Artifacts 和 Manifest Recommendation 必须包含过程产物。
3. sdlc-speckit-code-doc-reconcile 必须检查 implementation/workflow/debug/observability 与代码和 manifest 的 drift。
4. workflow-status.md 只能作为机器侧状态快照；manifest 是状态权威源。
5. 旧版文件名只能作为 Legacy Semantic Mapping Source Only 出现在说明中，不得作为 runtime input、output path 或兼容格式。
```

旧版语义映射来源：

```text
implementation-details.md
SDD_WORKFLOW_STATUS.md
API_DEBUG_GUIDE.md
QUICK_DEBUG_REFERENCE.md
LOGGING_IMPLEMENTATION.md
FINAL_SUMMARY.md
```

## Feature-Scoped Path Consistency 校验

当前 new-rail runtime 必须使用 feature-scoped Speckit 路径：

```text
specs/{feature}/route.md
specs/{feature}/spec.md
specs/{feature}/plan.md
specs/{feature}/tasks.md
```

检查点：

```text
1. runtime input、output、前置条件、阻断条件、校验规则不得把 specs/spec.md、specs/plan.md、specs/tasks.md 当作当前主路径。
2. 历史说明、legacy 对比说明或明确反例中可以出现 specs/spec.md、specs/plan.md、specs/tasks.md，但必须说明不是当前 runtime path / not current runtime path。
3. sdlc-speckit-implement 必须读取或继承 specs/{feature}/route.md 或 Analyze Gate route source。
4. Implement 不重新判断 Route Type。
5. Implement 不重新解释 Business Domain Targets。
6. Implement 只沿用 specs/{feature}/route.md、Analyze Gate 和 approved specs/{feature}/tasks.md 的边界执行。
7. 如果 implementation 发现 route 与代码实际边界冲突，必须停止并回到 Analyze / Domain Route / Re-Gate，不得自行改写 route。
8. Validator anchor: Implement does not reinterpret Route Type.
9. Validator anchor: Implement does not reinterpret Business Domain Targets.
10. Validator anchor: Implement executes only inside specs/{feature}/route.md, Analyze Gate, and approved `specs/{feature}/tasks.md` boundaries.
```

## Speckit specify 产品形状校验

`sdlc-speckit-specify` 生成或更新 `specs/{feature}/spec.md` 时，必须保留以下 legacy-critical sections：

```text
## Domain Route / Scope Baseline
## Requirement Type
## Business Domain Targets
## Entry Coverage Target
## Sync Targets
## Representative Data Simulation
## Edge Cases
## Functional Requirements
## Key Entities / Data Contracts
## Success Criteria
## Source Artifact Traceability
## Branch / Repository Boundary
```

检查点：

```text
1. Requirement Type 必须是 existing-change / new-flow / integration-change / data-change / unknown 之一。
2. Business Domain Targets 必须说明目标 L1/L2/L4 或 pending/blocking 原因。
3. Entry Coverage Target 必须来自 .specify/entry-coverage-profile.yaml 或明确说明缺失阻断。
4. Sync Targets 必须列出后续可沉淀的稳定事实，不能直接写入 business_domain。
5. Representative Data Simulation 至少覆盖 normal / empty / missing / exception 数据形态。
6. Source Artifact Traceability 必须能追溯到 01-技术方案、02-方案审核、manifest.md。
7. Branch / Repository Boundary 必须说明目标仓库、分支、模块和跨仓边界。
8. 如果任一章节需要编造事实，Specify 必须 blocked 并回到 DocFlow / Gate。
```

## Speckit route artifact 校验

`sdlc-speckit-pipeline` 在 Domain Route 阶段必须保留 Pipeline `Domain Route Summary`。当 feature id 已确定并进入 full SDD 时，必须物化：

```text
specs/{feature}/route.md
```

`route.md` 必须包含：

```text
Requirement ID
Feature ID
Route Type
Project Type Profiles
Business Domain Targets
Business Knowledge Read Set
Entry Coverage Surface
Sync Targets
Create-If-Missing Decision
Unresolved Questions
Blocking Items
New-Rail Runtime Check
Source Artifacts
Manifest Recommendation
```

检查点：

```text
1. Route Type 必须是 existing-change / new-flow / integration-change / data-change / unknown 之一。
2. Route Type = unknown 时必须阻断进入 Specify，除非用户显式确认 route type、目标 business-domain 文档、entry coverage surface 和 risk owner。
3. Business Domain Targets 必须记录 L1 / L2 / L4、Target Status、Owner、Evidence。
4. Entry Coverage Surface 必须覆盖 backend entries、admin entries、frontend entries、ETL entries、library/shared-component entries，不能按单一后端入口模型退化。
5. Create-If-Missing Decision 必须记录 Target L1、Target L2、Target L4 Id、Owner、Authorization、Entry Coverage Status。
6. New-Rail Runtime Check 必须明确 Runtime child skills: sdlc-speckit-* only、Legacy Skill usage: none、Legacy document runtime input: none、Legacy document write target: none。
7. specs/{feature}/spec.md 必须引用 specs/{feature}/route.md；如果 route 尚未物化，则必须引用 Pipeline Domain Route Summary。
8. Plan / Analyze / Sync / Reconcile 必须把 route.md 或 Pipeline Domain Route Summary 作为统一输入边界，不能各自重新解释 route。
```

## Entry Coverage Profile Bootstrap 校验

PR F-0 的 `scripts/bootstrap-entry-coverage-profile.sh` 是限制性 Entry Coverage Profile Bootstrap。它只用于让目标项目安全获得 entry coverage audit 的最小 profile，不是全量 Speckit bootstrap。

支持两种执行方式：

```bash
Usage: scripts/bootstrap-entry-coverage-profile.sh [target-project-path] [options]

# 从标准包目录执行，显式传入目标项目路径
scripts/bootstrap-entry-coverage-profile.sh <target-project-path> --dry-run

# 从目标项目目录执行，未传 target-project-path 时默认使用 Dir.pwd
$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh --dry-run
```

如果当前目录看起来是 `ai-sdlc-standard` 标准包自身，例如同时存在 `manifest.yaml`、`ai-sdlc/`、`skills/`，且用户没有显式传入 `target-project-path`，脚本必须停止并提示显式传目标路径，避免误初始化标准包仓库。

允许写入的稳定路径只有：

```text
.specify/entry-coverage-profile.yaml
.specify/reports/entry_coverage_profile_bootstrap_report.md
```

当 `.specify/entry-coverage-profile.yaml` 已存在且未提供 `--force-entry-coverage-profile` 时，只能写候选文件：

```text
.specify/entry-coverage-profile.candidate.yaml
```

Restricted Write Boundary 必须禁止写入：

```text
.specify/business_domain/**
specs/**
library/**
.specify/memory/**
.specify/workflow/**
.specify/coding_guide/**
```

运行期隔离要求：

```text
1. 不调用 legacy `speckit-*` Skill。
2. 不读取 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 作为 runtime 输入。
3. 不创建 filename-versioned artifact。
4. dry-run 只能预览 profile 和 `.specify/reports/entry_coverage_profile_bootstrap_report.md`。
```

`project_type_profiles` 来源优先级：

```text
1. .specify/project-governance-profile.yaml
2. 用户参数 --project-type-profile
3. 代码结构启发式检测
4. backend-business-service conservative candidate，并在 report 中标记 pending confirmation
```

生成的 `.specify/entry-coverage-profile.yaml` 必须包含：

```text
version
project_type_profiles
scope.source_roots
scope.include_file_patterns
scope.exclude_file_patterns
scope.document_scope
scope.report_dir
entry_types
layers.service
layers.manager
layers.persistence
```

项目类型 entry_types 检查：

```text
backend-business-service:
  controller / RPC / MQ / schedule / service / manager / mapper

admin-mixed-workflow:
  controller / data_console / worker / schedule / import / export / SPI / RPC

admin-mixed-workflow + backend-business-service:
  backend_controller / backend_RPC / backend_schedule / backend_service / backend_manager / backend_mapper
  admin_controller / admin_RPC / admin_schedule / admin_data_console / admin_worker / admin_import / admin_export / admin_SPI
  复合 profile 不得使用 name-only 去重吞掉 admin/backend 的同名 entry type 语义；至少必须按 [name, evidence_mode] 去重。

frontend-application:
  route / page / component / store / action / api_client / popup / native_shell

data-pipeline-etl:
  spark_job / flink_main / flink_process_function / connector / sink / publisher / sql

library-shared-component:
  public_api / consumer_scenario / adapter / extension_point
```

验收检查：

```text
1. 没有 profile 的目标项目，dry-run 能预览 profile。
2. 正式执行只写 entry coverage profile 和 bootstrap report。
3. 已有 profile 时默认不覆盖稳定路径。
4. 生成 profile 能被 scripts/audit-entry-coverage.rb 读取。
5. ruby scripts/validate-skill-contracts.rb 通过。
6. git diff --check 通过。
```

## Bootstrap Performance / Large Repo Scan Control 校验

PR G 要求 Speckit bootstrap 在大仓中可控、可限时、可采样、可解释。以下两个脚本都必须支持相同扫描控制参数：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run --scan-root service-a --include-root web-a --scan-timeout 60 --max-samples 30
scripts/bootstrap-entry-coverage-profile.sh [target-project-path] --dry-run --scan-root service-a --include-root web-a --scan-timeout 60 --max-samples 30
```

扫描参数语义：

```text
--scan-root PATH
  只扫描指定 target-relative 路径，可重复传入多个。

--include-root PATH
  scan-root 的白名单别名，可与 --scan-root 合并使用。

--scan-timeout SECONDS
  限制扫描阶段耗时。超时后必须报告 timeout / partial scan，不能声称完整成功。

--max-samples N
  限制每类 evidence / file inventory samples 的输出数量，默认值必须保守。
```

dry-run 和正式 report 必须输出 scan summary：

```text
scan started at
scan ended at
scan duration seconds
scanned file count
sampled file count
skipped/excluded count
timeout occurred
partial scan
scan roots
include roots
effective scan roots
exclude patterns
max samples
scan timeout
```

timeout / partial scan 语义：

```text
1. Scan Status 必须是 COMPLETE 或 TIMEOUT / PARTIAL。
2. TIMEOUT / PARTIAL 时不得把 profile、context、source_roots、project_type_profiles 当作 confirmed fact。
3. 报告必须写明 Affected Outputs 和 Recommended Action。
4. project bootstrap 可以继续生成 conservative evidence scaffold，但必须降级为 pending confirmation / needs-user-confirmation-partial-scan。
5. entry coverage profile bootstrap 在 timeout 时默认写 candidate profile，除非显式 --force-entry-coverage-profile。
```

默认 exclude 目录必须覆盖：

```text
.git
target
build
dist
out
node_modules
vendor
coverage
generated
.idea
.gradle
.mvn
.venv
venv
Pods
ios/Pods
android/build
ios/build
fixtures / fixture / test-fixtures / test_fixtures / large-fixtures
__snapshots__ / snapshots / mock-data / mock_data
```

检查点：

```text
1. 两个 bootstrap 都必须先生成一次 bounded file inventory，后续 project type detection、source roots detection、entry profile evidence、report sample 复用 inventory。
2. inventory 至少能解释 relative path、file type / extension、matched include root、included / excluded reason；正式写入时只能落到允许的 .specify/reports/** 或 profile 摘要中。
3. RN native shell、Pods、android/build、ios/build 不得污染 source_roots。
4. pfms 这类大仓必须优先用 --scan-root 限定目标业务模块或服务目录；不知道模块名时不要硬编码，应由使用者选择目标目录。
5. entry coverage profile bootstrap 仍支持从目标目录直接执行：`$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh --dry-run --scan-root . --scan-timeout 60 --max-samples 30`。
6. dry-run 不得写 target repo。
7. 不读取或写入 legacy `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
```

## Delta Change Routing / Supplement Requirement Path 校验

补充需求、规格遗漏、返工或反馈驱动变更不能按完整原需求重新判断 pipeline。

必须识别的输入：

```text
Requirement Supplement
Requirement Change
Rework
Specification Missing
Feedback-Driven Change
已实现后发现遗漏细节
开发过程中发现方案缺口
测试或 Review 暴露规格遗漏
```

同一 requirement_id 下必须区分：

```text
Parent Requirement ID
Intake Classification
Same Requirement Decision
Change Event Type
Aggregate Requirement Scope
Original Implemented / Approved Scope
Current Change Scope / Delta Scope
Out of Delta Scope
Affected Node
Required Re-Gate
Re-Gate Records
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
```

路由规则：

```text
1. Aggregate Requirement Scope 只能作为上下文。
2. Development Path Decision for delta must use Current Change Scope.
3. 原需求复杂度触发因素只能作为 context，不能作为 delta route trigger。
4. package / pipeline route should not use aggregate scope for supplements。
5. 已实现后补充遗漏细节，应回到最早受影响节点 Re-Gate。
6. Delta Scope 简单/中等且方案审核通过后，可以 DIRECT_IMPLEMENTATION after delta Re-Gate。
7. Delta Scope 自身复杂时，才可以 SPECKIT_PIPELINE_REQUIRED。
8. SPECKIT_PIPELINE_REQUIRED only when delta itself is complex。
9. 缺少 Delta Scope 或影响范围不清时，必须 BLOCKED_NEEDS_REVISION。
10. 不得因为原需求是 COMPLEX 就自动要求本次补充走 pipeline。
```

人工语义验收：

```text
场景 A:
原需求很复杂且已经实现。用户说“少了一块细节，在原需求上补一下”。
期望 Same Requirement: yes；Decision Scope: DELTA_CHANGE；Aggregate triggers only context；
如果 delta 简单且方案审核通过，Development Path Decision = DIRECT_IMPLEMENTATION。

场景 B:
原需求已实现，补充内容本身新增 MQ consumer 或 DB schema。
期望 Same Requirement: yes；Decision Scope: DELTA_CHANGE；Delta Complexity = COMPLEX；
Development Path Decision = SPECKIT_PIPELINE_REQUIRED 或 BLOCKED_NEEDS_REVISION，理由来自 delta 本身。

场景 C:
补充内容影响行为但没有技术方案新版本。
期望 BLOCKED_NEEDS_REVISION；Earliest Affected Node = 01-技术方案。

场景 D:
补充内容业务目标已经独立。
期望 New Requirement Needed = yes，不把新需求 Gate 混入原 requirement_id。
```

## Analyze Gate Strengthening 校验

`sdlc-speckit-analyze` 必须把 route artifact、project_type_profiles、
entry coverage reports 和 process products 纳入实现前 Gate。

必需输入：

```text
specs/{feature}/route.md
specs/{feature}/spec.md
specs/{feature}/plan.md
specs/{feature}/tasks.md
.specify/entry-coverage-profile.yaml
.specify/reports/entry_coverage/entry_coverage_report.md
.specify/reports/entry_coverage/entry_inventory.tsv
.specify/reports/entry_coverage/service_inventory.tsv
.specify/reports/entry_coverage/cross_domain_conflicts.md
.specify/reports/entry_coverage/unarchived_entries.md
.specify/reports/entry_coverage/unarchived_services.md
```

缺 `.specify/entry-coverage-profile.yaml` 时 Analyze Gate Result 必须为 `FAIL`，
并记录 `BLOCKED` Blocking Item。
如果只有 `.specify/entry-coverage-profile.candidate.yaml`，Analyze Gate Result
必须为 `FAIL`，Required Action status 为 `PENDING_CONFIRMATION`，Required Action 指向：

```bash
$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh --dry-run
$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh
```

Analyze 不允许因为缺 profile 而跳过 entry coverage audit。

Analyze 必须解析 TSV 字段，不得 grep 整个 markdown 判断 blocker。必须读取：

```text
entry_inventory.tsv:
  classification
  classification_reason
  match_strength
  match_reason
  requirement_scope

service_inventory.tsv:
  reverse_coverage_status
```

不单独阻断的 classifications：

```text
technical_bridge
framework_bridge
generated_or_vendor
native_shell
abstract_or_base
annotation_or_marker
not_applicable
```

必须阻断：

```text
business_entry 未归档
core business unit 未归档
reverse_coverage_status=no_entry_reverse_coverage
未接受的 cross-domain conflict
business_domain L4 missing
```

shared/platform/scheduling/integration L2 重复命中只有在 `specs/{feature}/route.md`
或 `.specify/entry-coverage-profile.yaml` 明确 accepted shared boundary 时才能
降级为 warning。

项目类型检查：

```text
backend-business-service:
  entry -> service -> manager/repository/mapper coverage
  transaction boundary
  rollback path
  transaction / rollback / idempotency / compensation
  API/RPC/MQ/Schedule contract

admin-mixed-workflow:
  controller / worker / schedule / data-console / SPI / RPC
  config lifecycle
  approval/audit
  import/export
  read-only query contract
  concurrency/rollback

frontend-application:
  route/page/component/store/API/popup/navigation
  state and visibility
  backend/mock boundary
  visual verification
  implementation/debug/observability process products when applicable
  native shell technical bridge does not block unless business behavior is explicit

data-pipeline-etl:
  trigger/input/output
  SQL lineage
  partition/window/checkpoint
  replay/idempotency
  downstream consumer
  function/connector/sink coverage

library-shared-component:
  public API
  consumer scenario
  compatibility
  deprecation/migration
  test evidence
```

Analyze 输出必须包含：

```text
Project Type Profile Checks
Entry Coverage Gate
Parsed Entry Inventory Summary
Parsed Service Inventory Summary
Shared-Domain Duplication Decision
Blocking Items
Earliest Affected Node
Re-Gate Recommendation
Manifest Update Recommendation
Next Step
```

## Speckit plan companion artifacts 校验

`sdlc-speckit-plan` 必须生成或显式跳过：

```text
specs/{feature}/plan.md
specs/{feature}/research.md
specs/{feature}/data-model.md
specs/{feature}/contracts/
specs/{feature}/quickstart.md
```

跳过任一 companion artifact 必须记录：

```text
Artifact:
Skip Reason:
Risk:
Impact:
Accepted By:
Re-Gate Required:
```

检查点：

```text
1. plan.md 中必须列出 companion artifact 状态。
2. research.md 记录技术决策、替代方案、依赖约束和未决技术问题，或有完整 skip record。
3. data-model.md 记录实体、状态、持久化副作用、前端 state 或 ETL schema，或有完整 skip record。
4. contracts/ 不能在 API/RPC/MQ、前端 route/page/state/API、ETL input/output 变化时跳过。
5. quickstart.md 记录验证命令、环境、种子数据、代表性用例、回滚检查和预期观察，或有完整 skip record。
6. 缺 companion artifact 且无完整 skip record 时，Plan Gate 必须 BLOCKED。
```

## business_domain bootstrap 校验

对目标项目执行：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --dry-run
```

检查点：

```text
1. 是否预览 00BusinessLandscape.md。
2. 是否预览 00UbiquitousLanguage.md。
3. 是否预览 01DomainCatalog.md。
4. 是否预览 99PendingConfirmation/01CodeEvidence/** 骨架。
5. 是否预览 business_domain_bootstrap_report.md。
6. 已有 business_domain 文件是否写 .candidate，而不是覆盖。
7. 是否不会读取旧版 .specify/memory、workflow、coding_guide。
8. 是否不会生成 specs/**。
```

### confirmed-domain bootstrap 校验

当 `.specify/business-domain-bootstrap.yaml` 含有用户确认的 `confirmed_domains` 时，执行：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --confirmed --dry-run
```

或：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --domain-map .specify/business-domain-bootstrap.yaml --dry-run
```

检查点：

```text
1. 缺少 confirmed_domains 时必须失败，不得退化为猜测生成真实 L1/L2/L4。
2. confirmed_domains 非空时，预览 00BusinessLandscape.md、00UbiquitousLanguage.md、01DomainCatalog.md。
3. 预览 .specify/business_domain/{L1}/{L2}/{L2MainDocument}.md。
4. 预览 .specify/business_domain/{L1}/{L2}/{L4Document}.md。
5. 预览 .specify/business_domain/{L1}/{L2}/{EntryCoverageDocument}.md。
6. 生成 report 时必须标记 Mode 为 confirmed，并记录 Domain Map。
7. 已有文件默认写 .candidate，只有显式 --force 才覆盖。
8. 不得读取 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 作为 domain map。
```

## 真实项目试跑检查项

### 投放层检查

```text
1. 旧版 .specify/memory/** 未被修改。
2. 旧版 .specify/workflow/** 未被修改。
3. 旧版 .specify/coding_guide/** 未被修改。
4. 旧版 Skill 未被覆盖。
5. 新 project-context 文件来自目标代码扫描和占位确认，不复制旧版文档内容。
6. generation report 能说明代码证据、project type semantic profile hint、旧版 runtime action 和待确认事实。
```

### Direct Implementation 流程检查

```text
1. 00-需求资料 是否保留来源信息。
2. 01-技术方案 是否符合 ESS 必填章节。
3. 02-方案审核 是否输出 PASS / FAIL / PASS_WITH_RISK。
4. 方案审核是否输出 DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION。
5. 实现阶段是否没有补造未定义业务规则。
6. Code Review 是否能归一为标准问题类型。
7. 测试反馈是否能分类并反向沉淀。
```

### Speckit Pipeline 检查

```text
1. Pipeline 是否只在方案审核通过后启动。
2. 用户 full SDD 是否没有绕过 01-技术方案 / 02-方案审核。
3. specify 是否复用已审阅 DocFlow 产物。
4. clarify 是否只处理残留问题。
5. plan/tasks 是否没有改变业务行为。
6. implement 是否按 approved tasks 执行。
7. Pipeline fixed Core 是否截止 Implement，不再把 Sync/Reconcile 作为 Pipeline runtime stage。
8. Implement 后是否输出 Shared Tail Handoff，且 Sync/Reconcile/Tail Gate 位于 Pipeline 外部。
9. Clarify 之前是否按节点询问是否进入下一节点。
10. Clarify 之后是否按 Plan -> Tasks -> Analyze -> Implement 连续执行到 Core 截止，不再询问是否进入下一节点。
11. 是否输出 New-Rail Runtime Check 和 Domain Route Summary。
12. 运行期是否没有调用 legacy `speckit-*` Skill，也没有读取或写入 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
```

## 当前校验能力边界

当前自动校验脚本不能证明：

```text
1. 每个 Skill 在真实需求中输出一定正确。
2. business_domain 生成一定准确。
3. ProjectWorkflowGuide、ProjectDocumentationGuide 或 ProjectCodingGuide 中 detected evidence 已经是权威规则。
4. 方案审核一定发现所有业务风险。
5. 测试反馈沉淀一定能自动改进 Checklist。
```

这些必须通过真实项目样例持续验证。

## 推荐校验顺序

```text
1. ruby scripts/validate-skill-contracts.rb
2. scripts/init-standard-home.sh --dry-run
3. scripts/bootstrap-speckit-project.sh <target> --dry-run
4. 人工检查 generation report / project-context / project type semantic profile
5. 测试仓库正式 bootstrap
6. Direct Implementation 小需求闭环
7. Complex Speckit pipeline 闭环
```

## Fixture-Based Product Parity Validator 校验

### 概述

`validate-product-parity-fixtures.rb` 是标准包开发期回归校验器。它使用最小 synthetic fixtures 验证 New-Rail Enhanced Speckit Pipeline 的关键产品语义，防止后续修改破坏已完成能力。

关键约束：

- fixtures 是标准包开发期回归，不是目标项目 runtime 输入（not target project runtime input）。
- 不复制真实项目代码或业务文档。
- validator 不访问真实业务仓库。
- validator 覆盖 route artifact、project-type L4、frontend process products、entry coverage analyze、bootstrap scan control、delta change routing。

### 执行命令

```bash
ruby scripts/validate-product-parity-fixtures.rb
```

### 与 validate-skill-contracts.rb 的关系

| 校验器 | 检查范围 |
| --- | --- |
| `scripts/validate-skill-contracts.rb` | 标准文件和规则锚点是否存在、是否一致 |
| `scripts/validate-product-parity-fixtures.rb` | 跨 PR 语义组合是否仍然成立（development-time fixture） |

`validate-skill-contracts.rb` 检查 contract YAML、manifest 登记、路径一致性、legacy source 红线等。
`validate-product-parity-fixtures.rb` 检查 fixture 目录下的 `fixture.yaml` + `expected.md`，验证 required_standard_files 存在、required_terms 在标准文件中能找到、forbidden_terms 不会作为 runtime dependency 出现。

### Fixture 覆盖

| Fixture 目录 | 产品语义覆盖 |
| --- | --- |
| `backend-business-service/` | Project-type L4: entry→service→manager/mapper chain, transaction, rollback, idempotency, compensation |
| `admin-mixed-workflow/` | Project-type L4: controller/worker/schedule/data-console/SPI/RPC, config lifecycle, approval/audit |
| `frontend-application/` | Project-type L4 + frontend process products: route/page/component/store/API, implementation/debug/observability |
| `data-pipeline-etl/` | Project-type L4: spark/flink entry, SQL lineage, replay/idempotency, connector/sink |
| `library-shared-component/` | Project-type L4: public API, consumer scenario, compatibility, deprecation |
| `route-artifact/` | Route artifact: route type, business domain targets, entry coverage, create-if-missing |
| `entry-coverage-analyze/` | Entry coverage precision + Analyze Gate: TSV parsing, classification, technical bridge, reverse coverage |
| `bootstrap-scan-control/` | Bootstrap performance: --scan-root, --scan-timeout, structured inventory, timeout/partial |
| `delta-change-supplement/` | Delta change routing: Requirement Supplement, Specification Missing, Decision Scope, aggregate vs delta |
| `project-type-contract-matrix/` | Plan contract matrix: companion artifact status table, project-type contract granularity, BLOCKED on missing contracts |

## Project-Type Contract Matrix 校验

Plan 阶段必须按 `project_type_profiles` 输出 contract artifact matrix。Plan Gate 对缺少 companion / contract artifact 且无完整 skip record 的情况必须 BLOCKED。

### Companion Artifact Status Table

Plan 输出必须包含 companion artifact status table:

| Artifact | Status | Path | Skip Reason | Risk | Impact | Accepted By | Re-Gate Required |
| --- | --- | --- | --- | --- | --- | --- | --- |

Status 必须是 `Produced` / `Reused` / `Not Applicable` / `Deferred` 之一。

### Contract Matrix 覆盖

按项目类型定义的 contract matrix（`skills/sdlc-speckit-plan/references/project-type-contract-matrix.md`）:

- **backend-business-service**: API, RPC, MQ, Schedule, DB migration, failure/rollback/idempotency
- **admin-mixed-workflow**: config lifecycle, approval/audit, import/export, read-only query, concurrency/rollback, operator permission
- **frontend-application**: route/page, component/state/store, API client, backend/mock boundary, popup/dialog, visual verification
- **data-pipeline-etl**: trigger, input, output, SQL lineage, partition/window/checkpoint, replay/idempotency, downstream consumer
- **library-shared-component**: public API, consumer scenario, compatibility, deprecation/migration, representative test

### Skip Record

缺少 artifact 时必须包含完整 skip record:

- Artifact
- Project Type Profile
- Skip Reason
- Risk
- Impact
- Accepted By
- Re-Gate Required

### BLOCKED Conditions

- `project_type_profiles` 未知或未识别
- Companion artifact 缺失且无完整 skip record（含 Project Type Profile、Contract Type、Skip Reason、Risk、Impact、Accepted By、Re-Gate Required、Verification Alternative）
- `contracts/` 被跳过但 feature 改变了 contract matrix 中列出的 contract surface
- `Deferred` artifact 无 accepted risk 或无 Re-Gate Required → Plan Gate BLOCKED
- `Deferred` without `Accepted By` → Plan Gate BLOCKED
- Skip Reason 空泛（如 "not needed"）→ Plan Gate BLOCKED

## Rail Routing And Business-Domain Sync 校验

### Rail Routing

- `AGENTS.md` 中 `/speckit.*` 和 `$speckit-*` 仍然走 legacy Speckit rail。
- `sdlc-*`、`sdlc-speckit-*`、`new rail`、`AI SDLC 标准库` 明确进入 new rail。
- 未明确 rail 且涉及 `.specify/business_domain/` 写入时，必须先询问用户。
- New-Rail 不读取/写入 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
- AGENTS.md 不应被自动覆盖，只能生成 addendum 建议。

### Specs Run Lifecycle

- `specs/` 是 run-level artifact，不是 requirement-level artifact。
- 一套 specs 内 rail 必须一致。
- 同一 `requirement_id` 可以有多套 specs（不同 rail、不同迭代）。
- specs 完成 business_domain sync 后可 archive / cleanup。

### Shared Business-Domain Governance

- `.specify/business_domain/` 是 legacy 和 new-rail 共同治理的长期知识库。
- 写入前必须解析 L1/L2/L4。
- 文件命名遵守项目当前 business_domain 命名方式。
- 目标 L4 已存在时，必须 update existing document，不得创建同义重复 L4。
- 每次写入必须记录 rail/source 和 revision record。

### Sync Source Modes

三种 sync source mode：`speckit_driven`、`library_driven`、`hybrid`。

- **speckit_driven sync**: pipeline Sync/Reconcile 后为 authoritative path。
- **library_driven sync**: 不要求 `specs/{feature}/**` 存在。无实现/验证证据时只输出 proposal。
- **hybrid**: 以 manifest freshness 和 pipeline status 决定 source priority。
- 同一事实不允许被两种 mode 重复写入（duplicate sync guard）。

### Library-Driven Sync Validation

- library-driven sync 可以在没有 specs 时运行。
- 最小 readiness：requirement_id 明确、`01-技术方案` 存在、审核通过、实现证据存在、验证证据存在、target 可解析。
- 无实现/验证证据 → 只能 proposal。
- Simple requirement 无 pipeline → library-driven sync evaluation 仍是必选检查项。

### Duplicate Sync Guard

- manifest 记录 `business_domain_sync` 状态。
- `pipeline_sync_executed=true` + `result=synced` → library sync 默认 blocked。
- `library_sync_executed=true` → pipeline sync 必须读 manifest，避免重复写作。

## Business-Domain Naming and Project Shape 校验

### Naming Gate

- business_domain 文档命名必须遵守项目当前 canonical naming convention。
- 常见模式：`{L4_ID}{L4_NAME_EN}({L4_NAME_CN}).md`、`{L4_ID}EntryCoverage({CN}入口覆盖对账).md` 等。
- naming pattern 来源：sibling L4、01DomainCatalog.md、L2 index、governance profile、user confirmation。
- naming pattern 未知 → proposal only，不得直接写。
- create-if-missing 使用 project canonical naming，不使用标准库默认命名。

### Project Shape Gate

- document shape 是项目级不变量（标题格式、Metadata 字段、章节语言、表格结构、修订记录）。
- Target L4 exists → preserve existing shape。不得整体重写为 New-Rail 模板。
- Target L4 missing → 从同 L2 sibling L4 推断 project shape。
- shape confidence：high / medium → 可直接 create-if-missing；low → 需用户确认；unknown → block/proposal。
- 标准库 `templates/business-domain-l4/*.md` 只能作为 new project / no-shape fallback，不得覆盖已有项目 shape。

### Create-If-Missing 规则

- 需要单独授权（不等于 generic write authorization）。
- 使用 project canonical naming + project shape。
- 记录：rail/source_artifacts/naming_pattern_source/shape_profile_source/shape_confidence。
- 必须更新 L2 index + 01DomainCatalog.md + revision record。
- 不得创建同义重复 L4。

### Whole-Document Rewrite 禁止（whole-document rewrite forbidden）

- Update existing → compatible section update，不得整体重写。
- 保留 title format、existing section names、table styles、revision history format。
- 不得为适配 New-Rail 模板新增大段不符合项目 shape 的英文固定章节。

### Library-Driven Inputs Cleanup

- library_driven required inputs 从强制 00/01/02/03/04/05 全部存在改为 readiness gate：
  - 01 + 02 必须存在。
  - 实现证据可来自 03、implementation result、或 code diff。
  - 验证证据可来自 05、04、test result、或 accepted review。
  - Incomplete evidence 只能产生 proposal/not_required/blocked，不能直接 confirmed write。

## PR K Cleanup Validation

- PR K cleanup validates stale template-primary create-if-missing rules are removed.
- PR K cleanup validates `library_driven` reconcile does not require specs.
- PR K cleanup validates standard L4 templates are fallback-only, not create-if-missing primary path.
- `templates/business-domain-l4/` loaded only when standard template fallback is explicitly active.
- Library-driven reconcile in `library_driven` mode: missing specs is expected and must not block.
- Cleanup 2 validates sync SKILL workflow no longer routes create-if-missing through template-primary path.
- Cleanup 2 validates reconcile contract has mode-specific required inputs (speckit_driven / library_driven / hybrid).
- Cleanup 2 validates validator catches workflow-level stale template-primary rules.
- Global Cleanup 1 validates sdlc-speckit-sync mode-specific input contract.
- Global Cleanup 1 validates library_driven sync does not require specs.
- Global Cleanup 1 validates missing specs only blocks speckit_driven or hybrid current source-of-truth.
- Global Cleanup 1 validates target project workflow/coding_guide redline.
- Global Cleanup 2 validates sync description includes library-driven / Direct Implementation.
- Global Cleanup 2 validates sync contract responsibilities are mode-aware.
- Global Cleanup 2 validates shared business-domain target resolution supports library artifacts / manifest.
- Global Cleanup 2 validates Source Priority by Mode is authoritative.
- Global Cleanup 2.1 validates sdlc-speckit-sync frontmatter description indentation and removes residual L4 skeleton wording.

## PR L: Compatible Update and Conflict Proposal 校验

- compatible update validation: existing L4 update preserves shape, facts, and uses safe insertion point.
- update proposal validation: unknown insertion point → proposal, not direct write.
- reconcile proposal validation: fact conflict → reconcile proposal with conflict type classification.
- no whole-document rewrite validation: existing L4 must not be fully replaced.
- no forced New-Rail section injection validation: fixed English sections must not be injected into legacy-shaped L4 by default.
- conflict classification validation: semantic_conflict, code_drift, doc_drift, stale_fact, scope_conflict, duplicate_fact, source_priority_conflict.
- revision/source traceability validation: every update records rail, sync_source_mode, source_artifacts, update_section, evidence.
- implementation/verification evidence validation: no direct update without evidence.
- PR L cleanup validates conflict-and-blocking no longer treats Project Type Profiles / selected L4 template as create-if-missing primary blockers.
- PR L cleanup validates compatible update required files and terms.
- PR L cleanup validates no whole-document rewrite / no forced section injection / no overwrite conflict / no chat source-of-truth guards.

## PR M: Specs Run Lifecycle Metadata and Archive/Cleanup 校验

- specs_run_id / requirement_id / feature_id metadata validation
- manifest lifecycle authority validation (workflow-status.md is snapshot only)
- rail consistency within run validation
- archive gate validation: lifecycle business_domain_synced or superseded, BD sync synced/not_required, not active
- cleanup gate validation: archived/superseded, manifest traceability, owner confirmation
- library_driven no-specs validation: no archive/cleanup required when specs never existed
- no deletion of library/{requirement_id}/** or .specify/business_domain/** validation
- lifecycle/result consistency validation: business_domain_synced only with synced/not_required

## PR N: Library-Driven Sync Runtime Hardening 校验

- library_driven runtime readiness validation
- no specs required validation (specs, specs_run_id not required)
- implementation/verification evidence validation (no direct write without both)
- sync need classification validation (SYNC_REQUIRED/NOT_REQUIRED/PROPOSAL_REQUIRED/BLOCKED/DUPLICATE_SYNC_BLOCKED)
- duplicate sync guard validation (pipeline_sync_executed + result=synced blocks library_driven)
- supplemental sync validation (only when explicitly authorized, no duplicate facts)
- manifest business_domain_sync library_driven validation (source_of_truth, stable_fact_candidates, synced targets)
- PR N cleanup validates sync-inputs references library-driven-sync-runtime.
- PR N cleanup validates output-and-manifest records library_driven business_domain_sync.
- PR N cleanup validates PR N required files/terms and forbidden behavior.
- PR N cleanup validates duplicate sync guard before direct write.

## PR O: Project-Type Contract Artifact Matrix 校验

- project_type_profile matrix validation
- required/optional/not_applicable/deferred validation
- Deferred accepted_by validation
- verification_alternative validation
- Plan Gate BLOCKED validation (missing required, Deferred without fields, Not Applicable without justification)
- no filename-versioned companion artifact validation
- library_driven no-specs validation
- PR O cleanup validates planning-scope references project-type matrix scope.
- PR O cleanup validates plan-inputs records profile/source/reuse/defer/NA inputs.
- PR O cleanup validates output-and-manifest records contract_artifact_matrix.
- PR O cleanup validates old project-type-contract-matrix reference is superseded/shim.
- PR O cleanup validates PR O required terms and forbidden behavior.

## PR P: Expanded Parity Fixture Validation

- expanded parity fixture validation — covers PR J–O rail routing, specs lifecycle, business-domain governance, library-driven runtime, project-type contract matrix
- PR J–O semantic coverage validation
- rail routing parity validation (explicit activation, no legacy fallback)
- business_domain governance parity validation (shared KB, compatible update, no whole-document rewrite)
- specs lifecycle parity validation (run-level, manifest authority, archive/cleanup gate)
- library_driven runtime parity validation (no specs, evidence required, duplicate sync guard)
- project-type contract matrix parity validation (Produced/Reused/NA/Deferred, BLOCKED conditions)
- forbidden behavior guard validation (no legacy input, no forced rewrite, no silent skip)
- PR P cleanup validates expanded fixture required_standard_files coverage.
- PR P cleanup validates expanded fixture required_terms coverage.
- PR P cleanup validates expected.md forbidden_terms guard context.
- PR P cleanup validates skill contracts preserve baseline traceability.
- PR P cleanup 2 validates expanded fixture required_standard_files, required_terms, and forbidden_terms with guard context.
- PR P cleanup 2 validates PR P static terms and forbidden behavior in validate-skill-contracts.rb.
- PR P cleanup 3 validates forbidden_terms guard context across expanded fixture required_standard_files, not only expected.md.

## Final Audit Cleanup

- manifest.yaml includes PR J–P governance docs and templates.
- plan Skill / plan contract explicitly block Deferred without Accepted By and Deferred without Verification Alternative.
- no filename-versioned artifacts validation
- Plan 用 contract artifact 反补未审阅业务规则 → Plan Gate BLOCKED

### 关键术语

- Companion Artifact Status
- Project-Type Contract Matrix
- Contract Skip Records
- `specs/{feature}/research.md`
- `specs/{feature}/data-model.md`
- `specs/{feature}/contracts/`
- `specs/{feature}/quickstart.md`
- Produced / Reused / Not Applicable / Deferred
- Verification Alternative
- Deferred without Accepted By
- Plan Gate BLOCKED

## D10-A Durable Checkpoint Foundation Validation

`core/loop-delivery-checkpoint.ts`、`core/loop-delivery-checkpoint-store.ts` 与 `tests/loop-delivery-checkpoint.test.ts`、`tests/loop-delivery-checkpoint-store.test.ts` 及 `tests/loop-artifact-store.test.ts` 新增段组成 D10-A durable checkpoint foundation 验证（D10-A 已进入 Source，仍为 Draft PR 状态，未 Ready、未 merge）：

- **Schema 与 artifact authority**：固定 `loop-delivery-checkpoint-v1`；32 个根字段与 identity 九字段固定顺序；builder/parser 为 descriptor-based exact-key、fail-closed、UTF-8、无 BOM/CR/NUL、精确一个 trailing LF、无额外 whitespace、SHA-256 小写 hex、默认最大 1 MiB；parser 只接受真实 Uint8Array、先 size gate 再复制、fatal UTF-8、重建 canonical bytes 且 byte-identical 才成功；每次 checkpoint transition 产生一个 immutable `delivery_checkpoint` artifact（`loop-artifact:v1:delivery_checkpoint:sha256:<64hex>`），artifact 是 immutable authority。
- **Current-head locator 非业务权威**：SQLite 单表 `loop_delivery_checkpoint_current_head` 只有四个业务列（run_id/generation/checkpoint_artifact_ref/checkpoint_digest_sha256）；locator row 只是定位最新可信 artifact，任何读取都必须 read-back artifact、解析并交叉验证 digest/generation/runId；row 单独不构成 authority；不存储 raw model output、secret、环境变量、stdout/stderr、prompt、patch bytes 或任意 metadata；不创建第二份 checkpoint business-state table。
- **固定 phase/transition contract**：16 个 phase 固定 vocabulary；非 terminal phase 的 required/nullable facts 矩阵、依赖闭包、workspace observation 矩阵（head/digest/has_changes 允许变化边界）、terminal prefix 规则（blocked/failed 只能携带合法前缀事实、必须携带 canonical terminal reason；completed 为成功 terminal，terminal_status 固定为 `completed` 且 terminal reason 精确绑定 `DELIVERY_COMPLETED` —— null、空字符串、其他 canonical code、自由文本、大小写变体、前后空格、控制字符全部拒绝）；`terminal_reason_code` 必须符合 canonical code 语法 `^[A-Z][A-Z0-9_]{0,63}$`（trimmed、non-empty、无控制字符、固定长度上限、无 silent normalization），non-terminal 时精确为 `null`；显式 forward transition graph，禁止 skip/rollback/nonterminal self-transition/terminal continuation；generation 1 必须 `previous_checkpoint_artifact_ref=null`，generation>1 必须携带。
- **Generation/CAS**：store 自行构建 generation 与 previous ref，不信任调用者；advance 顺序固定（验证 request → 完整验证 expected current → 构建 next → 验证 transition → canonical bytes → Artifact Store put → 验证 descriptor → BEGIN IMMEDIATE → 重读 locator → CAS insert/update → COMMIT → read-back 验证）；WAL、busy_timeout、foreign_keys ON、synchronous FULL；不同 candidate 并发 exactly one `advanced`、其余 `CHECKPOINT_STALE`。
- **Exact retry**：相同请求在未知响应后重试返回 `confirmed`（current 精确等于确定性构建的 candidate generation/ref/digest），不新写 authority；不同 bytes/ref/digest/previous ref/generation/identity/target repository/task branch/deadline origin 一律不算幂等。
- **Fork prevention**：transition validator 要求 `next.previous_checkpoint_artifact_ref` 等于 previous generation 的内容寻址 ref（由 previous canonical bytes 推导）；错误 previous ref、generation skip、immutable binding 变更、既有 fact 变更/消失、workspace path 变更全部拒绝；并发 race 后链保持 generation-linear。
- **Restart/read-back**：关闭第一组 store、以全新 instance 重开同一 control root 与 DB，成功读取同一 current checkpoint 并继续一次合法 transition。
- **Corruption handling**：row generation/ref/digest 非法、ref/digest 不一致、locator/artifact digest 不一致、artifact 缺失/字节损坏/parser 失败全部 `CHECKPOINT_STORE_CORRUPT`；Artifact Store put 在 CAS 前失败 `CHECKPOINT_ARTIFACT_FAILURE`；Artifact Store read 失败按 persisted 链不一致处理为 `CHECKPOINT_STORE_CORRUPT`；SQLite busy `CHECKPOINT_STORE_BUSY`；未知存储错误 sanitized 为 `CHECKPOINT_STORE_FAILURE`（消息 ≤256 字符、无控制字符、不含 dbPath/runId/artifact bytes/raw SQLite text/secret）。
- **Orphan artifact boundary**：artifact 已写入但 CAS 失败时允许留下未被引用的 immutable orphan blob，它不得成为 current authority（测试验证 loser blob 存在但 locator 只指向 winner）。
- **Markers**：`D10_A_CHECKPOINT_SCHEMA_VERIFIED`、`D10_A_CHECKPOINT_CANONICAL_BYTES_VERIFIED`、`D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED`、`D10_A_CHECKPOINT_CAS_VERIFIED`、`D10_A_CHECKPOINT_FORK_PREVENTION_VERIFIED`、`D10_A_CHECKPOINT_RESTART_VERIFIED`、`D10_A_ARTIFACT_KIND_VERIFIED`、`D10_A_D01_D09_REGRESSION_PRESERVED`、`D10_A_REAL_SOURCE_UNCHANGED`、`D10_A_TEMP_CLEANUP_COMPLETE`、`D10_A_COMPLETED_REASON_BINDING_VERIFIED` 只在对应真实断言全部成功时输出；summary 格式 `D10_A_CHECKPOINT_SUMMARY passed=<N> failed=0` 与 `D10_A_CHECKPOINT_STORE_SUMMARY passed=<N> failed=0`；原十一种 artifact kind 名称与顺序精确保持，新 kind 只追加一次，代表性原 kind put/read/ref 行为不变。
- **Targeted commands**：

  ```bash
  npx --no-install tsx tests/loop-delivery-checkpoint.test.ts
  npx --no-install tsx tests/loop-delivery-checkpoint-store.test.ts
  npx --no-install tsx tests/loop-artifact-store.test.ts
  npx --no-install tsx tests/loop-governance-tail-result.test.ts
  ```

- **Full validation commands**：

  ```bash
  npm run typecheck
  npm test
  npm run test:loop-patch-mutations
  ruby scripts/validate-skill-contracts.rb
  ruby scripts/validate-product-parity-fixtures.rb
  ruby scripts/validate-capability-metadata-chain.rb
  ruby scripts/validate-gate-runner-scenarios.rb
  git diff --check
  ```

- **Source invariance**：D10-A targeted suites 前后记录并精确比较 real Source 的 HEAD、status bytes、unstaged diff digest、staged diff digest，证明测试没有污染当前 Source 状态（`D10_A_REAL_SOURCE_UNCHANGED`）。
- **Temp cleanup**：全部临时 SQLite DB/WAL/SHM、temporary repositories、Artifact Store roots、worker-process roots 实际删除并验证，无遗留 message listeners，所有 worker 以 exit code 0 退出（`D10_A_TEMP_CLEANUP_COMPLETE`）。

边界：

- D10-A 不运行真实 provider；不运行 Shared Tail；不修改 D08/D06/D07/D09 与 Runtime/Gateway/Graph；不创建 single-repository coordinator；不创建真实 target branch/commit/push/PR；不建立 D10 overall completion。
- D10-B～D10-F 仍未授权；D10-A 只是 D10-C 跨进程恢复 coordinator 的 checkpoint artifact 与 current-head locator foundation。
- CI success 不等于 implementation review PASS；Draft PR 不等于 Ready 或 merge authorization。
- Exchange 与 Personal Knowledge Base 未发布；Roadmap 与 CURRENT_STATUS 未修改。
