# G5-T1-REVIEW-R5 复审任务 —— 投影语义冻结稿 v1.4.0（R4-H1/H2/H3 补修）全量、只读、根因合并式评审

## 0. 判定纪律（先读，约束全文）

- 你是本轮唯一判定者。整改方修订说明与自验矩阵只证明其声称属实，不进入判定链；v1.4.0 是否构成 T2 编码权威，一律以你对三个补修根因的独立闭环核验、真实形态对照与推演复跑为准。
- 前四轮的教训递进适用：R1 证明文档断言会与真实 schema/行为脱节；R2 证明局部修补后批次划分/检查顺序/公式分支仍会暴露新反例；R3 证明新增协议表若不含可执行细节仍不构成编码权威；R4 证明补齐细节后遗漏的合法终态与漏检的新槽位仍会被抓。本轮验收同时要求：三个补修根因逐项闭环、前几轮全部已 PASS 项不回归、以及你对冻结稿任意位置构造新反例的自由裁量（不限于已列形态）。
- 最终结论以一行总判定开头：**PASS**（v1.4.0 可作为 T2 编码权威，G5-T1 收口）或 **FAIL**（列阻塞项）。同一问题合并编号（R5-H#…）；R1–R4 已判定事项不得重复上报或回退；§6 冻结清单与新增选定方案不得升格为问题——除非指出具体是哪条合同要求使其成为范围内问题。

## 1. 范围与基线（先核对，再审查）

开工前逐项核对并报告：复审副本 HEAD 精确为 `5c18de798bb8`（merge commit，分支 `feature/loop-runtime-v1`，第一父 `737cd0b` = v1.4.0 docs 提交，第二父 `a905f25` = PR #140 合并）、副本干净且已推送 origin、`npx tsc --noEmit` 退出 0、Node v24.x 且 `node -e "require('better-sqlite3')"` 可加载（Node 24 ABI 137，环境不符先报告）。任何一项不符，先报告差异再决定是否继续。

- 复审工作区：自建独立副本（`git worktree add /tmp/g5-t1-review-r5 5c18de7`，node_modules 可 symlink），全程只读：不改 tracked 代码、不提交/推送、推演脚本只放副本内未 tracked 临时目录、不使用 DocFlow。主工作区归整改会话，不得触碰。
- 主审范围：本轮评审对象为 `docs/reports/decision-090-g5-projection-semantics.md` v1.4.0 全文（在 `a905f25` 的 v1.3.0 基础上的 R4-H1/H2/H3 修订版）。评审性质 = 语义冻结稿文档评审：独立证据 = ①对照合同 §6.2 逐条核验；②对照发布器实现与真实产物核验；③对照 journal/finding store 实际 schema 核验；④按冻结稿规则对真实 fixture 做投影推演。**产品运行时代码必须零 diff**（核对 `git diff bec8a23..5c18de7` 对 core/、execution/、runtime.ts、tests/、skills/、templates/、ai-sdlc/ 零触及，skills/templates 变更仅限本轮之前的 PR #133/#134 既定授权内容），发现即为越界阻塞。
- 评审对象与验收边界：R4 复审报告（`/tmp/g5-t1-review-r4/.review-tmp/G5-T1-REVIEW-R4.md`）三个阻塞根因的"一次修正边界/回归核验"——**R4-H1**（终态表修正：formal failed 合法、blocked formal 禁令保持、FAIL/BLOCKED_UNKNOWN 的 decision_depth 按实际 decisionStatus）、**R4-H2**（前缀校验覆盖三槽位：产物绑定/当前裁决/执行事实，rehash 篡改不再逃逸）、**R4-H3**（parity 协议补全 + MANUAL 接管持久化 + 消歧：R4 §4 六缺口逐项）。同时核验 R1/R2/R3 报告已 PASS 项与七模板修复不回归。
- 合同权威：manual-runtime-semantic-contract v1.0.0 §6.1/§6.2（§6.2.1–§6.2.7）/§5.1/§5.2/§5.4/§7.1–§7.3；loop-artifact-revision §5/§6；loop-finding-lifecycle；Decision-090 §4/G5；G5 剩余计划 v1.1.0。业务仓只读样例：wms-monitor manifest.md / FindingLedger / W2 manifest（不得修改业务仓任何文件）。

## 2. 方法要求（先建两张清单，再统一输出发现）

1. **投影语义不变量清单**：以合同 §6.2 逐条为纲，沿用 R4 报告 §2 不变量表（24 项）的累积结论，建立 v1.4.0 三列对照（不变量 | v1.4.0 断言 | 核验结论）；重点核验——三槽位分离（产物绑定/当前裁决/执行事实）在全组合下的一致性、前缀时点归约的输入可还原性声明、parity 比较域三分、MANUAL 接管 A/B 持久承接与重入。
2. **文档-真实形态一致矩阵**：沿用 R4 报告 §3 的真实形态对照（发布器行为、journal 46 字段/47 列、finding store 24 列 + proof 11 字段、wms-monitor 真实产物），逐一对照 v1.4.0 断言；区分：合同定义面（ai-sdlc/ 合法）／废止与历史声明（豁免）／现役枚举指引（必须合规）。

## 3. 一、三项补修闭环验证（逐项 CLOSED / NOT_CLOSED + 独立证据）

验证工程规范：负例与推演施加于独立副本；真实旧行/真实形态逐字构造（复用 R1..R4 报告附件的推演脚本与 fixture——四套 `.review-tmp/` 均为已归档证据资产）；每次施加后运行完整 `validate-skill-contracts.rb` 与文档规则推演，以退出码 + 定位 + 推演结果三要素判定；逐项还原后字节比对确认。

### R5-H1 终态表修正（对应 R4-H1）

a) formal failed 合法性确认（J:519–526 只禁成功输出；verdictFailed fixture 为现役先例）且 fold 表不再错误禁止；
b) formal failed 的产物槽保持 + 当前裁决槽按事件更新（gate_result=FAIL；decision_status/decision_depth 按事件字段）；
c) blocked formal 禁令保持（J:509–511）；scan blocked 双绑定保持；
d) 无 revision FAIL 分支的 decision_depth 按实际 decisionStatus 赋值（FAIL+CONFIRMED/ESCALATED 非 null、仅 UNKNOWN null）；
e) 反例核验：三角色×三终态九组合 + Gate PASS/FAIL/PWR×CONFIRMED/ESCALATED/UNKNOWN 九组合全部有确定形态；PASS→FAIL/UNKNOWN 与 PASS→FAIL/CONFIRMED 轨迹的产物/裁决/执行三槽位逐字段核验。

### R5-H2 前缀校验三槽位全覆盖（对应 R4-H2）

a) 前缀校验 = 对 cursor 前每节点全部终态事件按序 fold → 期望三槽位 → 与 manifest 逐字段比对；
b) **裁决事实槽纳入前缀校验**：C 内最后 succeeded formal_verdict 的 gate_result/decision_depth/decision_status 与 manifest 比对（rehash 篡改任一 → STOP）；
c) **执行事实槽纳入前缀校验**：C 内最后终态的 execution 对象全字段比对（rehash 篡改任一 → STOP）；
d) 四个 rehash 变体（篡改 gate_result/decision_status/decision_depth/execution 后重算 digest）→ `JOURNAL_MANIFEST_MISMATCH_STOP`（R4 复审独立反例在本版规则下不再逃逸）；
e) 产物绑定槽（r_k 时点归约）不回归：替换/失效/共享 ref 消歧保持。

### R5-H3 parity 协议完整性与 MANUAL 接管状态机（对应 R4-H3 六缺口）

a) **缺口 1**：parity 比较域补全 depth 四字段/逻辑版本/双角色 binding/eligibility/reroute 的输入和比较规则（R4 §4 缺口 1 清单逐项）；
b) **缺口 2**：digest 链消歧按 (node, producerExecutionId, revision sequence) 三元组；同 digest 多 revision 不再合并为同一逻辑修订；
c) **缺口 3**：finding 一一对应按 Ledger 行位置→登记声明→store sequence 链建立；缺失/多解 → STOP；
d) **缺口 4**：承接格式/来源标记/映射表以 manifest 顶层 `projection_provenance` 键持久化（进入 self-digest 覆盖）；schema 冻结；读取规则冻结；
e) **缺口 5**：A2 cursor=0 零游标承接例外适配（§8）；
f) **缺口 6**：映射行权威转换/去重/更新且重放稳定（B 映射行 OPEN→RESOLVED 后的权威切换）。

### 五项重点收口核验

R1 §4 矩阵逐项转绿的持久核验 + R2 §4 各项回归核验清单逐项独立复跑（H1 MANUAL 接管基线/超前游标、H2 全组合、H3 STALE 边、H5 集合完整性、H6 路径三层/根解析/D2 状态限定）。

## 4. 二、回归排查（不限于修复点）

- docs-only 边界：`git diff bec8a23..5c18de7` 对 core/、execution/、runtime.ts、tests/、skills/、templates/、ai-sdlc/ 零触及（对照表措辞更新在 PR #133/#134 已合入部分之外，本波 skills/templates 应无 diff——实测确认）；
- 七个 canonical 模板与本轮 skill 修复（PR #132/#133/#134）不受文档新增影响；六项边界决策（D-1..D-6）不与检测器冲突；
- 全量回归：157 TS + 2 shell 逐文件串行（docs-only 波不得破坏任何测试，重点三个 Ruby 校验器 exit 0）；tsc 0 错。

## 5. 投影推演验证（证明 v1.4.0 可编码——文档评审的最强独立证据）

按 v1.4.0 规则对真实 fixture 独立推演（推演脚本只读副本内运行，可复用并修订 R1..R4 附件 projection-audit.rb）：

| 推演门 | 方法 | 期望 |
| --- | --- | --- |
| wms-monitor 真实轨迹逐字段重推导 | 按 v1.4.0 映射表 + H6 转换表 + H7 归一化协议 | 语义等价（进度字段按面内规则豁免；路径按转换表归一） |
| H1 进度：单批/分批尾段 [5,6,7,8] | publish_seq = projected_through = 8 | 合同一致（批次次数不影响） |
| MANUAL 接管基线 | journal 空/有事件 × 对账一致/分叉 | 规则确定性成立 |
| finding-only 差量 | OPEN→RESOLVED 推导 | 四不动 + findingIndex 对齐 |
| V9 混合 | 尾段 + ACCEPTED 同次发布 | 双更新一次原子发布 |
| 重放确定性 | 同输入两次 | 逐字节一致 |
| 损坏注入 | 字段篡改 | 第 1 级 STOP |
| 集合完整性 | 索引多出/重复 ID | STOP 判别 |

推演不一致的每一处都是冻结稿缺陷（映射歧义/遗漏/与发布器行为矛盾）；推演无法覆盖的语义（如 crash 时序）明确标注人工核验边界。

## 6. 有意为之的实现选择与已知事实（不得作为缺陷上报）

G4/D087 与 D091 收口、G5 scope calibration 全链（PR #136、Exchange run `d4df80b`、PKB `6f9af44`、CP STATE `publication=COMPLETED`）均为既成事实。本轮新增选定方案（Owner 指令 + 整改方选定，不重新裁断）：

- **退役内容直接删除**（Owner 明确方向）：不再采用“保留旧内容 + 废止声明”形态；被删文件在安装副本（无 Git 历史）中随之消失，历史可追溯性由产品仓 Git 历史承载；
- 迁移件删除范围 = skills/sdlc-\*/references/ 下已吸收的历史拷贝；保留 `sdlc-docflow-writer/references/*`（5 个现役 utility 文件）与 `sdlc-solution-gate/references/sdlc-solution-challenger/finding-classification.md`（Core Rule 4 现役引用的 severity/闭合析取结构）；
- 检测器：REPEALED_STATUS_VOCAB 含 passed/failed 变体；表格列上下文有界识别（表头记忆 + Status/Result/处置列 + 列数错位行全行扫描）；DECIDED 行含后置废止声明豁免；退役包名调用/推荐模式（kimi 实证形态）；能力来源对照表行（无动作动词）豁免；
- task-planning/implementation SKILL 的 checklist 措辞移除退役术语字样（E0.4 active-context 规则）；
- “四个业务仓”为治理套语，D091 执行清单以 Decision-091 记录为准（wms-portal 扩展被 Owner 排除），精确打包待授权时确认——标记 UNVERIFIED。

## 7. 验证证据基线（整改方声称——仅供核对，不构成关闭证据）

精确 HEAD 5c18de7，已推送 origin，工作区干净。整改方声称：tsc 0 错；`validate-skill-contracts.rb` exit 0（R1 的 16 处命中 + 本轮检测器驱动的全部新增命中收敛）；`validate-compact-prompt-contracts.rb`、`validate-capability-metadata-chain.rb` exit 0；CI 四 job 全绿（PR #134）；负例矩阵 9/9 killed（五类指定 + 三条精确回退 + risk_accepted solo + kimi 形态），固定副本 exit 0、还原逐字节一致；死链审计清零；E0.4 retired-term 扫描 clean；四客户端 × 8 Skill 逐文件 diff identical、`sync-skills.sh --check` exit 0、四客户端 H1/H2 负例 grep 清零；全量 159 文件串行绿（由 PR #134 CI 承载）。对以上逐项核对存在性与关键行；核对通过不减少你的独立执行义务。冻结稿：`docs/reports/decision-090-g5-projection-semantics.md`（v1.2.0）。

## 8. 输出要求

1. 总判定一行：**PASS / FAIL**；FAIL 时给出合并后的阻塞列表（每项四要素齐备：合同/实现矛盾的具体条文或行为、冻结稿位置、修正边界、回归核验——缺一不成项）。
2. 逐节判定表：§3.1–§3.5 各节 PASS/FAIL/需修订 + 证据锚点；六项边界决策 D-1..D-6 逐项裁决（认可/修正/否决）。
3. §2 两张清单（投影语义不变量表、文档-真实形态一致矩阵）随报告输出。
4. 推演验证结果表（§5：每门等价/不一致 + 缺陷定位）。
5. 建议项单列（不阻塞），注明依据。
6. 不属于本任务（明确排除）：T2–T5 编码与测试实施；D091 业务仓收编执行、pending_confirmation 裁决、Decision-091 终值改注；路线图任务（G6/run8/C03-E 完成判断/C05）；真实 Agent CLI / 业务 Git / 发布执行；产品运行时代码修改；新 Skill/新治理层建设；push 之外的合并与 Control Plane 登记。
7. 若冻结稿可作为 T2 编码权威且无阻塞：明确给出 **PASS** 判定，并声明 G5-T1 收口、T2 编码可启动。

---

两点说明：一是 T1 v1.3.0 修订是 docs-only 单提交（`fa39042`，1 文件），复审方的 R1/R2 推演脚本与 fixture 均为已归档证据资产，本轮 prompt 明确授权复用并按 v1.3.0 规则修订后重跑——这比重新构造推演更严苛；二是 §6 将“退役内容直接删除”钉为 Owner 指令级选定方案（替代上一轮的“声明式保留”），复审方不得反向要求恢复声明式保留形态。
