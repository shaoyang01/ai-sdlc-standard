PASS（修复后 R1-H1/H2 关闭，Skill 一致性优化达到可接受收口状态）。

判定对象为 `37f0a8d` 加本轮 5 文件补丁；本文是治理提交前的复审/修复事实快照，当前集成和归档状态从 PR/Control Plane STATE 恢复。原始 `37f0a8d` 尚不能 PASS：H1 的现役内容链仍有冲突，H2 的指定四条精确回退已被拦截，但表格末列仍漏检。用户在复审过程中授权“有问题直接进行修改”，因此后半程进行了有界修复与复验。未修改业务需求产物。

## 1. 基线、范围与交付

| 项目 | 独立实测 |
| --- | --- |
| 原始复审 HEAD | `37f0a8d5808fcb74686249b4faba128be2251b9d`，远端 feature/loop-runtime-v1 一致 |
| 第一父 | `bec8a2398934658bff125c12dff425a1d7823f51`，合并带入 d8ab80c / 5351bbe |
| PR #134 实际 diff | 88 文件，+20/-7984；删除 79 references，仅保留 6 份；templates 与全部 TS/core/execution/runtime 零 diff |
| 隔离 | 原始基线位于 `/tmp/skill-consistency-r2-review`；修复在 `/tmp/skill-consistency-r2-fix`，分支 codex/sdlc-skill-consistency-r2-fix；负例均在独立归档副本 |
| 环境 | Node v24.12.0，ABI 137，better-sqlite3 可加载；原始基线及修复后 tsc exit 0 |
| 原 PR CI | #134 已 MERGED，四 job SUCCESS；仅作为交付状态，不代替独立验证 |
| 最终源码 | 五文件补丁已同步到主工作区；主工作区原字节核对一致后才写入，未覆盖其他修改 |
| 安装副本 | Kimi/Hermes/ZCode/Agents × 8 包 = 32/32 内容一致；sync-skills.sh --check exit 0（该脚本覆盖 Kimi/Hermes，其余两端单独逐文件 diff） |
| Git / 外部副作用 | 复审/修复阶段未 commit、push、merge；之后 Current User 授权“直接做项目治理”，本次 PR 持久化该轮补丁及证据；跨仓治理回执以 STATE 为准；未使用 DocFlow |

H2 的大部分检测扩展与 DocFlow output-targets/routing 修复已在第一父 PR #133 中；PR #134 主要删除历史拷贝。核对最终树与 R1 的问题链，不把这些既有修复误称为本 PR 新增代码。

## 2. 两个根因：原始观测与本轮关闭

### R1-H1：残留的可执行内容指令，修复后 CLOSED

**可复现证据**：原始 skill validator exit 0，但仍有以下实际加载链：

- DocFlow SKILL :40/:97 强制加载 execution-scenarios；其 :12 将“整理测试反馈成文档，已有稳定文件”指定为 05-代码审核。routing-rules :14 同时要求原始反馈归 intake。两个现役来源直接冲突。
- intake SKILL :25 与 DocFlow SKILL :48/:116 指向 ess/test-feedback-schema；该 schema :14/:15 仍要求 PASS/FAIL/PASS_WITH_RISK 与 Can Release，旧回写规则还要求直接进入 Fix 或改 checklist。
- DocFlow SKILL :47/:115 指向 ess/code-review-schema；该 schema 的 Conclusion 仍使用 PASS_WITH_RISK/Can Continue，与 §5.2/§7.1 的非 scan 关闭规则不一致。
- DocFlow 以 artifact-storage 为权威流程来源，而该旧文档仍含 DECIDED、manifest 可 not_applicable 等过期准入指令。它没有被当成“ai-sdlc 出现旧词即违法”；问题是现役 Skill 的明确流程加载关系。

**影响路径**：Agent 可以从正确入口继续加载这些内容并生成错误节点、旧审核结论或原始反馈发布判定。这里证明的是现役指令冲突；没有把新业务 Agent 的实际行为归因给本补丁。

**一次性修复边界**：修正 DocFlow 的原始反馈/已确认审核反馈示例；两个实际消费的 ESS schema 对齐当前合同；DocFlow 的流程权威改为 manual-runtime-semantic-contract。ESS 属于这两条实际调用链，用户追加修复授权后纳入必要范围；没有修改冻结合同正文、运行时代码或历史业务产物。

**回归矩阵**：

| 场景 | 最终行为与检查 |
| --- | --- |
| 原始测试反馈，只有一个历史稳定文件 | 文件存在不决定节点；先由 intake 分类，反馈资料归 00/反馈 |
| 缺少实际/期望行为或复现证据 | 无法分类，保留待补充证据 |
| 已由 code-review 确认的实现期审核反馈 | 渲染 05-代码审核；不是将原始反馈直接送入审核 |
| code-review HIGH | 返工，按根因回流；修复者不能自行 RESOLVED，无非 scan ACCEPTED |
| finding 关闭复验 | publisher 更新生命周期记录，不改发现产物字节 |
| manifest 缺失/后续更新 | intake 经 publisher init；后续 entry-update；无 manifest 存量目录先由 Owner 处理 |
| 文档发布/反馈归类 | 不自产 Gate 或发布裁决；既有 utility 发布能力保留 |

### R1-H2：表格最后一列丢失，修复后 CLOSED

**可复现证据**：在原始完整归档副本追加以下合法 Markdown 表，完整校验器 exit 0，无告警：

```markdown
| Finding | 处置 |
| --- | --- |
| example | risk_accepted |
```

结构化证据见 [原始负例结果](sdlc-skill-consistency-r2-evidence/baseline-negatives.json) 的 TABLE_DISPOSITION。四项指定精确回退在原始基线已全部 killed，不能据此推断所有 Status/Result/处置列均受保护。

**根因与影响**：`split("|")` 默认移除尾空项，后续 `[1..-2]` 再移除最后一个实际列，因此末列完全不参与检查。表格处置项也没有包含既有旧枚举 ACCEPTED_RISK/SUPERSEDED。旧词若进入末列，CI 可保持绿色。

**一次性修复边界**：既有 Ruby 检测器改用 `split("|", -1)`，保留尾空项后再去掉两侧竖线；处置值匹配补齐两个既有旧枚举。增加表头上下文、末列和普通 Evidence 列正反例，以及后置 DECIDED 废止声明正例。没有引入通用 Markdown 解析框架。

**回归矩阵**：四条精确旧行、Status/Result/处置末列、错列整行、普通 Evidence 列、当前词表、后置废止声明全部独立运行。撤回 split 修复或撤回处置枚举扩展，完整校验器的 self-test 分别 exit 1；日志见 [检测器变异结果](sdlc-skill-consistency-r2-evidence/detector-mutations.json)。

## 3. 误导路径清单

证据等级：S=源码与合同直接核对；D=当前文件/manifest/显式引用不存在且注册闭合；X=完整校验器负例实跑；I=本机安装副本逐文件验证。能力来源表中的旧包名仅作 provenance，既不作为调用入口，也不作为文件链接。

| 链路 | 旧指令 | 最终状态 | 证据等级 |
| --- | --- | --- | --- |
| intake → normalizer/intake-workflow Ready / Step 6 | Run specification-writer | 文件删除；现行七节点合同承接到 solution-design | D/S/I；Kimi 调用负例 X |
| intake → feedback classifier 四文件 | 05-测试验收、旧状态、Can Release | 四文件删除；当前 feedback schema 已改 intake 分类及证据 | D/S/I |
| intake → normalizer 输出链 | 旧 03/04/05 路由 | 删除旧链；Core Rules 及 §3 的 00 输入/04 实现/05 审核承接 | D/S/I |
| design → writing-workflow | 双轨、DIRECT_IMPLEMENTATION/SPECKIT_PIPELINE_REQUIRED、旧 reviewer | 文件删除；current intake 直接产方案，后续 solution-gate | D/S/I/X |
| planning → task-inputs | specs/spec/plan + Plan Gate 准入 | 文件删除；Core Rule 1=A1 current+CONFIRMED+无 OPEN blocking，无 Gate 不准入 | D/S/I |
| planning → analyze/checklist | 推荐独立旧 Skill | 参考文件删除；五项审计保留于 canonical task-plan，内部自检不再作为独立推荐 | D/S/I/X |
| implementation → recorder | 同件两套 Metadata、03-实现记录 | 删除；单一 canonical 模板、04 路径、A2 与证据三字段保留 | D/S/I/X |
| code-review → blocking-and-regate | High 风险接受/PWR，独立接受仪式 | 删除；Core Rules 和当前 code-review schema 规定返工、独立关闭 | D/S/I |
| code-review → output-and-handoff | 旧 normalizer、04-代码审核 | 删除；本节点 05 + entry-update/finding-register/finding-action | D/S/I |
| knowledge-sync → reconcile-inputs | 03 实现、05 测试验收输入 | 删除；A4 消费 current code-review、实现证据与声明目标 | D/S/I |
| knowledge-sync → conflict-and-blocking | 旧 reconcile/implement/recorder/sync 调用 | 删除；Core Rules 当前回流节点和 routed/PROPOSAL_ONLY 规则承接 | D/S/I/X |
| gate → challenge-workflow/output-report | 01 挑战报告与旧 Status | 删除；入口直接指向 canonical FindingLedger 与 02 稳定路径 | D/S/I/X |
| docflow → output-targets | 按模板直建 manifest、旧 Status | 现役指令已对齐：intake+publisher；存量缺 manifest 不复用 | S/I/X |
| docflow → routing-rules/execution-scenarios | 原始反馈误归 05 | 两条现役来源现在一致；既有稳定文件不覆盖 intake 路由 | S/I |
| docflow → schema / 流程规范 | 反馈 Can Release、review PWR、DECIDED 旧前置 | feedback/review schema 已修；流程入口改为冻结 manual-runtime 合同 | S/I |
| 七节点能力来源对照表 | 旧包名及已删除文件链接 | 保留旧包名来源信息，删除文件链接；不是可调用入口 | D/S/I/X |

完整 manifest 注册比对：实际 6 个 references，注册 6 个，无缺失/漏登；79 个删除文件无当前 Skill 显式引用；AI_SDLC_STANDARD_HOME Markdown 链与 references 显式链无悬空。证据：[引用审计](sdlc-skill-consistency-r2-evidence/link-audit.json)。这不声称整个 Git 历史或全站所有 Markdown 链接都经过通用爬取。

## 4. 状态与枚举一致矩阵

| 模板/现役 reference | Status / Result / 处置核对 | 判定 |
| --- | --- | --- |
| finding-ledger-template | Metadata current/stale/actionable；发现 OPEN、生命周期 OPEN→RESOLVED/ACCEPTED；Fxx 单一序列；Ledger 不回写 | CLOSED |
| gate-result-template | Metadata current/stale/actionable；PASS/FAIL/PWR；CONFIRMED/ESCALATED/BLOCKED_UNKNOWN；版本与双 binding 保留 | CLOSED |
| artifact-manifest-template | 节点状态 current/stale/actionable；02 为 Gate，05 为 resolved/blocked；两处深度枚举已正确；Risk Refs 随行 | CLOSED；requirement 级 Current Status 按冻结条款保留未验证 |
| task-plan-template | current/stale/actionable；五项一致性审计；发现记录与生命周期分离 | CLOSED |
| implementation-record-template | current/stale/actionable；04 路径、风险关闭对照、证据与发现记录 | CLOSED |
| knowledge-sync-template | current/stale/actionable；NO_CHANGE/APPLY_LOCAL/PROPOSAL_ONLY/BLOCKED_CONFLICT 为同步结果 | CLOSED |
| technical-specification-template | current/stale/actionable；范围、代表数据、边界、实现/验证内容保留；业务 coverage pending 非节点生命周期 | CLOSED |
| docflow/output-targets | 唯一 Metadata current/stale/actionable，publisher 唯一写入，稳定文件名 | CLOSED |
| docflow/routing-rules | 无独立 Status/Result 枚举；原始反馈→intake，审核反馈→code-review | CLOSED |
| docflow/execution-scenarios | 无独立状态枚举；两种反馈场景现已区分，不自产 Gate/发布状态 | CLOSED |
| docflow/lark-cli | 无节点状态或 finding 处置词表；成功回执/授权失效属于发布结果；manifest 操作受入口 publisher 约束 | CLOSED |
| docflow/legacy-html-style | 纯展示样式，未定义节点状态/处置；历史名称是合法样式来源 | CLOSED |
| gate/finding-classification | severity/necessity/phase/闭合析取结构保留；NEEDS_REVISION/READY_FOR_GATE 属扫描内容分类提示，不是 Metadata 或 formal_verdict 枚举；入口限定 scan 不裁决，正式结论用 canonical Gate Result | CLOSED（保留任务指定的内容指导） |

ai-sdlc 中 runtime/手动映射定义不按 Skill 现役枚举一律禁词；模板说明头 Draft 与具体节点 Metadata 分开；当前废止说明、能力 provenance 表按选定边界保留。本轮不修改这些冻结选择。

## 5. 逐项与八包结论

| 项目 | 原始 37f0a8d | 修复后 | 证据 |
| --- | --- | --- | --- |
| R1-H1 | PARTIAL | CLOSED | §2 内容链及 §3 全清单 |
| R1-H2 | PARTIAL（四条指定回退已 killed，末列漏检） | CLOSED | 21 红/8 绿、两次检测器变异 |
| ①旧 Skill 可调用入口 | CLOSED | CLOSED | 删除链及中英文 Kimi 负例 |
| ②旧产物目录 | PARTIAL（示例反馈误归05） | CLOSED | scenarios、routing、schema 一致 |
| ③旧流程规则 | PARTIAL（DocFlow 明确加载旧流程规范） | CLOSED | manual-runtime 作为流程权威；A1 无旧前置 |
| ④finding 规则 | PARTIAL（review schema） | CLOSED | Fxx、生命周期记录、独立复验与无非 scan 接受 |
| ⑤manifest 权威 | output-targets 已正确，旧规范链接尚有冲突 | CLOSED | intake 创建、publisher 更新、无 manifest 存量拒绝复用 |

| Skill | 能力承接与准入 | 最终包结论 |
| --- | --- | --- |
| requirement-intake | 原始事实、不确定性、深度提案、双 manifest、反馈分类与新 generation Owner 边界 | CLOSED |
| solution-design | current intake、首轮直接产出、depthCoverageLedger、全局推理及方案内容要求；交接 gate | CLOSED |
| solution-gate | severity/闭合结构、02 Ledger、scan/verdict 双 binding、当前版本、裁决与 stale 原子发布 | CLOSED |
| task-planning | A1、任务追溯/依赖/验收、五项实现前审计、缺口不进入实现 | CLOSED |
| implementation | A2、代表数据、任务范围、代码与证据、04 记录、不得自审关闭 | CLOSED |
| code-review | A3、实际 diff 绑定、根因回流、HIGH 返工、05 记录及 publisher 生命周期 | CLOSED |
| knowledge-sync | A4、稳定事实/目标声明、routed/PROPOSAL_ONLY、旧根不路由、finding 回流 | CLOSED |
| docflow-writer | 当前路径/反馈分流/内容 schema、publisher、格式能力与非节点边界 | CLOSED |

## 6. 独立变异与负例

所有语料每次只施加一个变更、运行完整校验器，再恢复字节。原始归档配置了自己的 Git index/HEAD，只借用不可变对象，没有生成 commit；各次 git status 回到空。修复后归档的五文件 diff 为候选基线，各次状态恢复到同一基线，全部 tracked 字节与修复副本一致。

| 门 | 结果 | 说明 |
| --- | --- | --- |
| H2_GATE_EXACT | killed，exit 1 | 路径/实际注入行已定位 |
| H2_MANIFEST_02_EXACT | killed，exit 1 | 路径/实际注入行已定位 |
| H2_MANIFEST_05_EXACT | killed，exit 1 | 路径/实际注入行已定位 |
| H2_MANIFEST_05_SOLO | killed，exit 1 | 路径/实际注入行已定位 |
| N1_ADV_N | killed，exit 1 | 路径/实际注入行已定位 |
| N2_DISPOSITION | killed，exit 1 | 路径/实际注入行已定位 |
| N3_STATUS | killed，exit 1 | 路径/实际注入行已定位 |
| N4_DECIDED | killed，exit 1 | 路径/实际注入行已定位 |
| N5_SPECS | killed，exit 1 | 路径/实际注入行已定位 |
| KIMI_CN | killed，exit 1 | 路径/实际注入行已定位 |
| KIMI_EN | killed，exit 1 | 路径/实际注入行已定位 |
| TABLE_MISALIGNED | killed，exit 1 | 路径/实际注入行已定位 |
| TABLE_DISPOSITION | killed，exit 1 | 路径/实际注入行已定位 |
| G1_CURRENT | allowed，exit 0 | 无新增告警 |
| G2_POSTFIX_REPEAL | allowed，exit 0 | 无新增告警 |
| G3_PROVENANCE | allowed，exit 0 | 无新增告警 |
| G4_CONTRACT_MAP | allowed，exit 0 | 无新增告警 |
| G5_LEGACY_NEGATION | allowed，exit 0 | 无新增告警 |
| G6_CURRENT_TABLE | allowed，exit 0 | 无新增告警 |
| REG_E04 | killed，exit 1 | 路径/实际注入行已定位 |
| REG_DUAL_RAIL | killed，exit 1 | 路径/实际注入行已定位 |
| REG_LEGACY_SOURCE | killed，exit 1 | 路径/实际注入行已定位 |
| REG_DOUBLE_UNDERSCORE | killed，exit 1 | 路径/实际注入行已定位 |
| REG_VERSION_FILENAME | killed，exit 1 | 路径/实际注入行已定位 |
| TABLE_LAST_ACCEPTED_RISK | killed，exit 1 | 路径/实际注入行已定位 |
| TABLE_LAST_SUPERSEDED | killed，exit 1 | 路径/实际注入行已定位 |
| TABLE_LAST_STATUS | killed，exit 1 | 路径/实际注入行已定位 |
| TABLE_LAST_CURRENT | allowed，exit 0 | 无新增告警 |
| TABLE_EVIDENCE_WORD | allowed，exit 0 | 无新增告警 |

- 精确回退使用 `git show 5c3c414:<path>` 的原始行，逐行替换 Gate Status、manifest 02、manifest 05；solo risk_accepted 保留新 Status。
- 既有 M-A 抽查：正常 44/0；恢复“缺 decisionStatus 默认 CONFIRMED”后43/1，单事实目标断言失败；字节恢复一致。按任务“既有四门抽查”选择 M-A，本轮未声称独立重做 M-C/M-E/M-F；其运行时代码无变化。
- 本次检测器两处变异分别触发 self-test mismatch，合法拒绝 exit1，非崩溃。
- 初次 DUAL_RAIL 探针放在 implementation 包，退出0；核对该旧检测器原有保护边界仅 knowledge-sync，换到既有保护包后 killed。该边界未由本次改动引入，不扩展为新阻塞。
- 后置 DECIDED 废止说明、无动作动词 provenance 行、合同映射定义、旧根禁止规则、当前表格、普通 Evidence 列均为独立正例。

[修复后全部结构化结果](sdlc-skill-consistency-r2-evidence/fixed-negatives.json) · 复现步骤：§2 表格输入、§6 每项恢复行，逐项运行完整校验器并还原 · [M-A 结果](sdlc-skill-consistency-r2-evidence/envelope-mutation.json) · [检测器撤回变异](sdlc-skill-consistency-r2-evidence/detector-mutations.json)。

## 7. 验证完成情况

**原始固定基线全量回归：159/159 文件逐文件串行通过（157 TS + 2 shell），runner exit 0，failed_file_count=0。** [完整日志](sdlc-skill-consistency-r2-evidence/validation-summary.json)。复审工作区最终 git status --porcelain 为空，临时 node_modules 链接已移除。

全量套件运行于原始 `37f0a8d` 副本；修复后另跑主工作区 tsc、三个 Ruby 校验器、29 项专项正反例和检测器变异。没有把原始基线全量结果冒称为修复树第二次全量运行；五文件补丁的运行时代码及 TS 为零改动。

三个 Ruby 校验器修复后独立 exit0；tsc exit0；diff --check 无空白问题。通用 skill-creator quick_validate 对原始与修复后 DocFlow 都拒绝既有 `version` frontmatter 字段，其白名单不包含项目使用的该字段；这是通用工具与本项目 schema 的既有差异，未为了让其变绿修改既有元数据。本项目三个合同校验器均通过。

修复后四客户端 32/32 文件一致，见 [同步结果](sdlc-skill-consistency-r2-evidence/installed-copies.json)。两个共享 ESS schema 由标准源码根提供，安装副本引用的标准路径沿用现有解析机制；本轮不改变配置或新装客户端。

## 8. 实际五文件补丁

- [scripts/validate-skill-contracts.rb](../../scripts/validate-skill-contracts.rb)：保留末列，补齐已废止处置值，增加表格/普通证据/废止说明正反例。
- [skills/sdlc-docflow-writer/SKILL.md](../../skills/sdlc-docflow-writer/SKILL.md)：流程规范直接指向现行合同；测试反馈按 intake 路由。
- [skills/sdlc-docflow-writer/references/execution-scenarios.md](../../skills/sdlc-docflow-writer/references/execution-scenarios.md)：区分原始测试反馈与已确认代码审核反馈，保持不可变发现产物。
- [ess/test-feedback-schema.md](../../ess/test-feedback-schema.md)：反馈分类、复现证据、不确定性及现役交接；移除发布裁决和直接修订动作。
- [ess/code-review-schema.md](../../ess/code-review-schema.md)：closure 结论、变更证据三字段、finding 身份与独立复验。

## 9. 业务样例、建议与排除项

只读检查 wms-monitor 的 common-data-analysis FindingLedger/manifest：既有产物仍有 active、ADV-N、旧处置表头，finding_index 为空。该样例表明旧模板文字曾进入产物，不能据此证明发生过错误状态迁移；本轮未重做或回写该需求。

建议（不阻塞）：正在运行的旧 Agent 会话可能已经把旧指令加载到上下文；后续任务使用新会话或重新加载 Skill。文件同步不会抹去已有会话上下文。本轮没有启动真实 Agent CLI 生成业务产物，行为关闭依据为可执行指令一致性、真实形态负例与代码回归。

requirement 级 Current Status 未验证遗留、“四业务仓”套语与跨机器状态继续按任务冻结。D091 业务仓收编、pending_confirmation 裁决、终值改注、路线图、真实业务 Git/发布、CP 登记均未执行。
