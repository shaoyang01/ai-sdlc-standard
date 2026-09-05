# D-088-01 v3 行为规格：四类项目一站式初始化与迁移

> Version: 1.1.0
> Status: ACCEPTED（2026-09-05 接受并冻结为 G1 验收基线；同日 v1.1.0 勘误：A10/A13/A14 经 Current User 裁决改注为双根拒绝格，验收语义以 §2.2/§2.3 为准，无行为变更）
> 上游: Decision-090 决策 3 · [冻结执行计划](decision-090-c03e-prerun-governance-plan.md) §3/§4/G1 · [需求拆分](decision-090-c03e-prerun-requirement-decomposition.md) §3（R01–R27）
> 候选基线: 产品仓 `a626335`（v2 双模式实现 + R1/R2 修复，35 测试场景）
> 授权声明: 本规格不授权任何代码修改；实施需 Current User 显式授权。

## 0. 定位与继承

初始化器是 `sdlc-knowledge-sync` 的唯一目标解析来源，服务单轨 7+1 流程。v3 = v2 双模式（INIT 代码驱动填充 / AUDIT 体检）**加上**四类输入判定与存量迁移执行面。继承不变量（全部保留，违者即缺陷）：

- I1 create-if-missing：知识文件永不覆盖；人工改写为权威。
- I2 声明唯一所有权：初始化器只拥有 `knowledge-target.yaml`；状态机 `absent → candidate_pending_confirmation (routable:false) → routed`；非 routed 一律 PROPOSAL_ONLY。
- I3 业务语义零虚构：候选文档只写代码可验证事实；业务规则/术语留空标待沉淀。
- I4 检测零内容读取：类型判定只使用文件存在性、路径形态与名称模式，不读取 legacy 知识内容（机械迁移的 move 与治理 YAML 的固定字段解析除外，见 §4.4）。
- I5 幂等：任何输入场景重复执行为 no-op；`--dry-run` 零写入。
- I6 业务仓零接触：只写目标仓 `.sdlc/**`；不触碰仓外路径与其他业务仓。
- I7 正式执行需 git user.name；单仓范围；禁词门禁（`speckit`/`.specify`/`99PendingConfirmation`/`dual rail`/`legacy rail`）约束活动治理表面（体检报告引用残留清单豁免）。
- I8 I8a 治理 YAML 无 YAML aliases；I8b 报告原子独占创建、不覆盖；I8c domain-map containment 与 fingerprint fail-closed（R2-H2/H3 语义不变）。

## 1. CLI 合同

```text
scripts/bootstrap-knowledge-target.sh <target-path> [options]
  --detect                      仅输出四类判定（含多信号与依据），零写入
  --audit                       强制体检模式（v2 语义不变）
  --plan                        显式迁移计划模式：输出分类计划与 plan digest，零写入
                                （等价 --dry-run 的迁移面；对无迁移场景与 dry-run 输出一致）
  --apply --confirm-migration-plan <sha256>
                                执行迁移+初始化；含 TRANSFORM/RETIRE 的计划必须携带
                                与最近一次 PLAN 输出一致的 plan digest（DP1，§4.5）
  --dry-run                     打印计划与预览，零写入（兼容保留）
  --domain-map / --project-type-profile / --update-declaration / --project-name
                                v2 语义不变
Exit codes: 0 ok/no-op/audit-findings；1 blocked（含类型歧义、确认缺失/不匹配、
迁移失败已回滚）；2 usage/validation。
```

模式选择（v3 重排）：`--detect` → 仅判定；否则判定器先行（§2）→ `BLOCKED_AMBIGUOUS` 直接阻断（exit 1，零写入）→ `NEW_EMPTY/EXISTING_*` 进 v2 INIT/AUDIT 流（无迁移面，无需 DP1 确认）→ `LEGACY_*` 进迁移流程（§4–§6），完成后接 v2 INIT 补新表面件。

## 2. DETECT 规格（R01–R05）

### 2.1 信号表（全部为存在性/路径形态，I4）

| # | 信号 | 判定用 |
| --- | --- | --- |
| S1 | `.sdlc/` 根存在 | 新表面存在 |
| S2 | `.sdlc/business_domain/` 三根文档（00BusinessLandscape/00UbiquitousLanguage/01DomainCatalog）计数 | 骨架 empty(0)/partial(1-2)/complete(3) |
| S3 | `.sdlc/business_domain/knowledge-target.yaml` 存在 | 声明状态读取（仅新表面） |
| S4 | 代码树信号：`pom.xml`/`src/main/java`/`package.json`/`go.mod` 等项目级标志 | NEW vs EXISTING |
| S5 | `.specify/` 根存在 | legacy 根存在 |
| S6 | `.specify/templates/**`（plan/spec/tasks 类 SDD 模板） | LEGACY_SDD 特征 |
| S7 | `.specify/scripts/bash/{check-prerequisites,create-new-feature,setup-plan,update-agent-context,common}.sh` | LEGACY_SDD 特征 |
| S8 | `.specify/workflow/{SDDWorkflow,WorkflowIndex}.md` | LEGACY_SDD 特征 |
| S9 | `.specify/business_domain/` 存在（旧根知识目录） | legacy 知识本体 |
| S10 | `.specify/business_domain/knowledge-target.yaml` 存在 | **LEGACY_SDLC_SDD 强特征** |
| S11 | 旧位治理 YAML 任一：`.specify/{project-governance-profile,entry-coverage-profile}.yaml` 或 S10 | **LEGACY_SDLC_SDD 强特征** |
| S12 | 活动 `specs/**` 目录（与新 `.sdlc` 并存的旧 rail） | 双轨残留特征 |
| S13 | S1 与 S5 同时存在 | 类型歧义候选（§2.3） |

### 2.2 判定决策表（按序求值，首条命中即输出）

| 序 | 条件 | 类型 |
| --- | --- | --- |
| D1 | S1∧S5，且 S9/S10/S11 任一存在（新旧治理件重叠） | `BLOCKED_AMBIGUOUS`（新旧根同时承载治理语义） |
| D2 | S1∧S5（其余情况） | `BLOCKED_AMBIGUOUS`（双根并存无法机械归属时按 §2.3 逐信号复核，复核后仍双根活动 → 阻断） |
| D3 | ¬S1 ∧ (S10∨S11) | `LEGACY_SDLC_SDD` |
| D4 | ¬S1 ∧ (S5∨S6∨S7∨S8∨S12) | `LEGACY_SDD` |
| D5 | S1 ∧ S2=complete | `EXISTING`（complete；进 AUDIT/体检路径） |
| D6 | S1 ∧ S2∈{0,1,2} ∧ S4 | `EXISTING_CODE_NO_KNOWLEDGE`（partial/empty；进 INIT 补齐） |
| D7 | S1 ∧ ¬S4 | `NEW_EMPTY`（纯骨架仓/文档仓） |
| D8 | ¬S1 ∧ S4 | `EXISTING_CODE_NO_KNOWLEDGE`（从未治理） |
| D9 | ¬S1 ∧ ¬S4 | `NEW_EMPTY` |

- 多信号并存（R04）：D3/D4 命中时继续收集全部命中信号，输出 `signals[]` 与 `type`；技术栈 profile hint（v2 `detect_profile_hint`）照旧独立输出，两者不混淆。
- 判定输出（`--detect`）：`type`、`signals[]`（信号 id + 命中路径）、`skeleton_state`、`declaration_state`（S3 存在时读新表面声明）、`ambiguous_files[]`（§2.3）、`tech_profiles[]`。确定性输出顺序（信号表序）。
- 幂等（R05）：判定为文件系统状态的纯函数；同一状态重复执行输出逐字节一致。

### 2.3 BLOCKED_AMBIGUOUS 语义（R03）

类型级：D1/D2 命中 → 全场景阻断，exit 1，零写入，输出判定依据与逐信号清单。文件级：PLAN 阶段发现单文件同时承载知识本体与旧流程语义且无机械分离规则（§4.3 无命中）→ 该文件 `BLOCKED_AMBIGUOUS`，**整个迁移 APPLY 阻断**（零部分升级），清单列入计划与报告。

## 3. 目标形态断言（R19–R21，冻结计划 §3 表的规格化）

| 输入类型 | 迁移面 | 初始化结果断言 | 后续 sync | 允许自动猜测 |
| --- | --- | --- | --- | --- |
| NEW_EMPTY | 无 | 三根文档 + 三 YAML + map 模板 + audit wrapper；声明 `candidate_pending_confirmation`，routable:false | 未确认前 PROPOSAL_ONLY | 否 |
| EXISTING_CODE_NO_KNOWLEDGE | 无 | 上者 + 入口事实、候选域、xx99 EntryCoverage；缺件补齐（partial） | 未确认前 PROPOSAL_ONLY | 只允许代码可验证事实 |
| LEGACY_SDD | §4 全退 RETIRE/ADD | 新表面全件 + `.sdlc/legacy/**` 归档树；旧根无活动残留 | 仅新 `.sdlc` 活动目标可路由 | 否 |
| LEGACY_SDLC_SDD | §4 含 TRANSFORM | 同上；旧治理 YAML 职能并入新机器件；旧 rail/owner 不再生效 | 同上 | 否 |
| BLOCKED_AMBIGUOUS | 阻断 | 零写入 + 逐文件清单 | 不可 routed | 否 |
| 共同 | — | 声明状态机落位正确（R21）；迁移后 `--detect` 幂等重判 | journal 机器恢复权威不变 | — |

## 4. PLAN 规格（R06–R10）

### 4.1 分类动词

| 动词 | 语义 | 落盘行为 |
| --- | --- | --- |
| `ADD` | 新建新表面件 | create-if-missing 写入 `.sdlc/**` |
| `PRESERVE` | 原位不动（不属于旧流程、归属不明的用户文件） | 零操作，列入报告 |
| `TRANSFORM` | 内容迁移进新表面（知识本体迁位、治理 YAML 固定字段并入） | 新位置 create-if-missing + 原件移入 `.sdlc/legacy/<原相对路径>`（不删除） |
| `RETIRE` | 旧流程承载件退役 | 移入 `.sdlc/legacy/<原相对路径>`（不物理删除；git 历史与归档树双保留） |
| `BLOCKED_AMBIGUOUS` | 无机械分离规则的知识+流程混合件 | APPLY 整体阻断 |

### 4.2 LEGACY 原型分类基线表（判定规则枚举，逐文件按首个命中规则）

| 规则 | 文件形态 | 动词 | 理由模板 |
| --- | --- | --- | --- |
| C1 | `.specify/business_domain/**` 知识文档（.md） | TRANSFORM | 知识本体迁入 `.sdlc/business_domain/`（保内容，I1/I3 不变） |
| C2 | 旧治理 YAML（S10/S11 命中件） | TRANSFORM | 固定字段并入新 `.sdlc` 机器件（§4.4），原件归档 |
| C3 | `.specify/templates/**` SDD 模板 | RETIRE | 标准包 templates 已承接 |
| C4 | `.specify/scripts/bash/` speckit 脚本 | RETIRE | 旧流程脚本，活动面禁止保留 |
| C5 | `.specify/workflow/**`（SDDWorkflow/WorkflowIndex 等） | RETIRE | 旧流程权威，Decision-090 禁止继续活动 |
| C6 | 活动 `specs/**`（S12） | RETIRE | 旧 rail 退役；`.sdlc/legacy/specs/**` 归档 |
| C7 | `.specify/reports/**` 运行产物 | RETIRE | 随归档树保留，不进新表面 |
| C8 | `.specify/` 下其余用户文件（含 project-context、非 SDD 资料） | PRESERVE | 非旧流程所有，原位不动 |
| C9 | 以上均不命中且文件同时含知识正文与流程语义（启发：知识目录内嵌入 workflow/模板 front-matter） | BLOCKED_AMBIGUOUS | 无机械分离规则，人工裁决后另行授权 |
| C10 | 无法读取（权限）/越界（containment 外）/symlink 指向仓外 | BLOCKED_AMBIGUOUS | R12/R13 边界，零部分升级 |

### 4.3 计划 artifact（R09）

- 路径：stdout 规范输出 + `.sdlc/migration/plan.json`（apply 成功后与 report 一起落盘）。
- schema 要点：`{type, signals[], generated_at, plan_sha256, files:[{path, verb, target, rule, rationale}], add_only: bool, blocked_files[]}`。
- `plan_sha256` = 计划 JSON 规范化文本（键排序、固定字段序）的 SHA-256；dry-run/plan 模式打印；apply 时校验。
- dry-run/plan 模式对目标仓**零写入**（plan.json 也在 apply 成功后才落盘）。

### 4.4 TRANSFORM 的机械合并边界（I4 例外）

治理 YAML 并入仅允许**固定字段映射**（旧 knowledge-target 的域声明字段 → 新 map 模板候选区；旧 profile 的 profile/gate 字段 → 新 profile 对应键），逐字段列出映射表并写入报告；legacy 知识文档的**业务正文永不进入候选文档**（候选文档仍走 v2 代码驱动填充；迁移的知识文档是已有资产原样迁位）。

### 4.5 DP1 确认语义（R10，2026-09-05 裁决）

- `add_only=true`（NEW_EMPTY/EXISTING_*）：无需确认，`--apply` 直接执行。
- 含 `TRANSFORM` 或 `RETIRE`（LEGACY_*）：`--apply` 必须携带 `--confirm-migration-plan <sha256>` 且等于最近一次 PLAN 输出的 `plan_sha256`；缺失或不匹配 → exit 1（blocked: confirmation required / plan drift），零写入。重新 PLAN 后原 digest 即失效（计划变更必须重新确认）。
- 同一项目确认并成功 apply 后，幂等 re-run 不再要求确认（迁移已完成，重判为 EXISTING 路径）。

## 5. PREFLIGHT 规格（R11–R13）

1. git user.name 存在（正式执行；dry-run/plan/detect 豁免，输出 `<missing>` 占位）。
2. 目标仓可写（`.sdlc` 父目录 create 权限探测）。
3. 逐文件安全分类（进入 PLAN 前）：symlink（含 dangling）、不可读、resolve 后越出目标仓 → 对应文件 `BLOCKED_AMBIGUOUS`（C10）；不崩溃、不静默跳过。
4. 写入面断言：apply 前收集全部目标路径，任一不在 `<target>/.sdlc/**` 内 → exit 1（零接触违例，零写入）。

## 6. APPLY 规格（R14–R18）

执行顺序（事务性）：

1. **备份**：将被 move/rewrite 的每个文件复制到系统临时备份目录，记录 pre-digest 清单。
2. **迁移执行**：按计划逐条执行 TRANSFORM/RETIRE（move 到 `.sdlc/legacy/**` 与新表面位置）、ADD（create-if-missing）；任何一条失败（权限/磁盘/existence 冲突）→ 立即停止后续动作。
3. **回滚（R17）**：失败时按 pre-digest 清单逆序恢复全部已动文件（从备份复原 move 与 rewrite），删除备份目录后 exit 1 并输出失败报告（已回滚断言：全部 pre-digest 复核一致）。成功路径：复核 post-digest 后删除备份目录。
4. **残留门禁（R18）**：迁移后对活动治理表面（`.sdlc/**` 排除 `.sdlc/legacy/**` 与 reports 的残留引用章节）执行禁词/旧根引用扫描（复用 v2 R2-H6 扫描器 + 语义豁免规则）；命中 → 视为迁移失败，触发回滚。
5. **收尾**：写 `plan.json`、迁移报告（md + machine json）、迁移完成标记（`migration.completed_at` 入 plan.json）；随后接 v2 INIT/AUDIT 补齐新表面件；`--detect` 重判必须为 EXISTING_*。

## 7. REPORT 规格（R22）

- 人读：`.sdlc/reports/migration_report.<ts>.md`（原子独占创建，不覆盖）——判定结果与信号、逐文件分类表（动词/规则/理由/前后 digest）、确认引用（plan digest）、跳过与 blocked 清单、回滚记录（如有）、迁移后 `--detect` 重判结果。
- 机器：`.sdlc/reports/migration_report.<ts>.json`——上列字段的结构化投影；schema 固定键集，校验器可断言（不得自述成功：digest 与实际文件状态可复核）。
- v2 的 bootstrap/audit 报告语义不变。

## 8. 验收矩阵（R23–R25 / DP2 裁决）

### 8.1 主矩阵轴

四类（NEW_EMPTY / EXISTING_CODE_NO_KNOWLEDGE / LEGACY_SDD / LEGACY_SDLC_SDD）× 骨架（empty / partial / complete）× map 状态（absent / candidate / routed）× 执行（dry-run / apply / re-run）。

### 8.2 执行分层（DP2 裁决落地）

- **dry-run 层全组合**：4×3×3×3=108 组，table-driven fixture 生成器覆盖；断言计划正确性 + 零写入。
- **apply/re-run 代表组合（16 个，冻结如下；改动需修订本规格）**：

| # | 组合 | 覆盖目的 |
| --- | --- | --- |
| A1 | NEW × empty × absent × apply | 基线全 ADD |
| A2 | NEW × empty × absent × re-run | 幂等基线 |
| A3 | EXISTING × empty × absent × apply | 首治 |
| A4 | EXISTING × partial × absent × apply | 缺件补齐 |
| A5 | EXISTING × empty × absent × re-run | 双次 apply no-op |
| A6 | EXISTING × partial × candidate × apply | 候选声明共存 |
| A7 | EXISTING × complete × routed × apply | 降档保护（routed 保持） |
| A8 | EXISTING × complete × routed × re-run | 跨 run 幂等（同 map fingerprint） |
| A9 | LEGACY_SDD × empty × absent × plan→confirm→apply | 纯 RETIRE+ADD，DP1 全流程 |
| A10 | LEGACY_SDD × partial × absent × apply | **双根拒绝格（v1.1 勘误）**：partial 意味着 `.sdlc` 已存在，与 LEGACY 根并存 → D1/D2 阻断零写入；"RETIRE 与补齐叠加"不可达 |
| A11 | LEGACY_SDD × empty × absent × apply（无确认） | DP1 拒绝路径 blocked |
| A12 | LEGACY_SDLC_SDD × empty × absent × apply | TRANSFORM 治理 YAML 并入 + RETIRE |
| A13 | LEGACY_SDLC_SDD × partial × candidate × apply | **双根拒绝格（v1.1 勘误）**：D1/D2 阻断零写入；"知识迁位与候选声明共存"不可达 |
| A14 | LEGACY_SDLC_SDD × complete × routed × apply | **双根拒绝格（v1.1 勘误）**：D1/D2 阻断零写入；"迁入已 routed 表面"不可达 |
| A15 | LEGACY_* 任一 × apply 中途注入失败 | 回滚到 pre-digest 基线（R17） |
| A16 | LEGACY_* 迁移后 × `--detect` 重判 | 迁移后类型/幂等（§6.5） |

- **A10/A13/A14 勘误（2026-09-05 Current User 裁决）**：三格描述的"向已有 `.sdlc` 表面迁移"在决策表 D1/D2 下不可达——partial/complete/candidate 均意味着 `.sdlc` 已存在，与 LEGACY 根并存即双治理根，按 §2.3 阻断零写入（场景 39 承载该拒绝语义的验收）。维持阻断语义不变；若未来真实业务仓频繁出现该状态且人工处置成本显著，再做针对性规格修订（需明确冲突优先级、知识保留与 routed 声明处理）。
- **边界用例（独立，不进直积）**：B1 dangling legacy symlink（已有）；B2 map `../` 越界（已有）；B3 仓内 symlink 越界（已有）；B4 人工改写根文档原子阻断（已有）；B5 两位 L4 模板拒绝（已有）；B6 不可读文件 → C10 阻断；B7 重复/并发报告不覆盖（已有）；B8 plan digest 漂移拒绝；B9 迁移后残留命中 → 回滚；B10 双根并存 BLOCKED_AMBIGUOUS 零写入。

### 8.3 旧 findings 重归因（R26）与差距审查（R27）

R1/R2 全部 findings（R1 H1–H8、R2 H1–H6）按本规格重新归因；候选差距审查见配套报告 `d088-01-v3-gap-review.md`。

## 9. 联动合同（保持不变量）

- `sdlc-knowledge-sync`：仅消费 routed 声明；迁移场景中旧根声明（S10）自迁移起不再可路由；single-rail 契约（R1-H7）不变。
- `validate-skill-contracts.rb`：新增迁移动词、plan schema、确认语义的负向矩阵校验（Ruby 2.6 兼容延续）。
- `bootstrap-entry-coverage-profile.sh`：角色不变（最小骨架 + 详细扫描）。

## 变更记录

- 1.1.0（2026-09-05）：Current User 裁决维持 D1/D2 双根阻断语义，A10/A13/A14 改注为双根拒绝格（验收=阻断零写入，场景 39）；向已治理表面迁移的支持推迟至真实需求出现时做针对性修订。无实现行为变更。
- 1.0.0（2026-09-05）：Current User 审查接受，冻结为 G1 实施与验收基线。
