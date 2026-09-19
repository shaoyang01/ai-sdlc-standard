# 审计匹配口径修复 + logistics-master 知识沉淀 · 跨机交接（2026-09-18 冻结现场）

> Date: 2026-09-18 · Author: AI_SDLC_PROJECT_CONTROLLER（实施会话）
> 用途：换机恢复现场。新会话**先读本文件**，再按其 §6 复现命令与 §4 待裁决项推进。
> 本文件随主线入库——`git fetch --all` 后即可见，无需搬运任何本地材料。

## 0. 一分钟恢复（新机器，先读这段）

```
git fetch --all --prune
git checkout feature/loop-runtime-v1 && git pull      # 本文件所在分支
npm ci                                               # 若无 node_modules
npx tsc --noEmit                                     # 应 0
bash tests/audit-entry-coverage.test.sh              # 应 11 passed / 0 failed
```

## 1. 两条工作线（精确锚点）

| 线 | 位置 | 状态 |
| --- | --- | --- |
| **A. 审计脚本匹配口径修复** | 产品仓 PR **#176**，分支 `fix/audit-entry-coverage-matching-boundaries`，head **`aa39206`**，base `feature/loop-runtime-v1`（主线 `af5509e`） | **未合并**；CI 4/4 绿（run 35250605409）；`mergeState=CLEAN`；R2 复审 FAIL 已整改，**待 R3 复审** |
| **B. logistics-master 知识沉淀** | 业务仓 `logistics-master` `master`，提交 `c64e8fd9` / `8428182f` / `c1585b95` / `55d87880` / `a81cf5cc` + `53251a99`（2026-09-18 下午恢复轮，见 §8） | 入口未归档 0；核心单元 382→86→**20**；冲突 207→169→**150**；文档侧可收敛面已尽，残余属审计口径面（§8） |

## 2. A 线：审计脚本改了什么（PR #176）

两条**判定口径缺陷**（改动面仅 `scripts/audit-entry-coverage.rb` + 新增 `tests/audit-entry-coverage.test.sh`）：

1. **符号证据按子串匹配 → 改标识符边界匹配（两条通道都要改，这是 R2 的驳回点）**
   - 文本通道 `doc_match_for_record` 原用 `text.downcase.include?`；表格通道 `match_row_to_record → token_match?` 对 ≥4 字符 token 用 `candidate.include?`。
   - 后果：文档写 `DeliveryOrderServiceImpl` 会命中独立记录 `OrderServiceImpl`（同理 `BatchServiceImpl` ← `DeliveryBatchServiceImpl`）→ 短记录被"别人的文档"**误归档**，或在两域文档各被点名时**制造假跨域冲突**。
   - 修复：`identifier_in_text?`（文本通道）+ `identifier_token_match?`（表格通道），identifier 类证据一律按 `(?<![A-Za-z0-9_])token(?![A-Za-z0-9_])`（大小写不敏感）匹配；**path 字段两条通道均保持宽松匹配**（表格单元格可带行号区间 `X.java:94-186`）。
   - 真实实例（复审在 wms-monitor 发现，该样本**不作为验收样板**）：双语表头 `代码锚点（Code Anchor）` 别名命中 `codeanchor` → 表格通道在该样本是活的，5 条记录仅靠该残留归档。
2. **入口 / 核心单元双重分类**：`*Service` / `*RPCServiceImpl` 同时命中入口模式与层模式（`*Service.java` / `*ServiceImpl.java`），作为核心单元被要求"入口入站链"——而它自身就是入口，永久计入未归档（logistics-master 134 个残留里 117 个属此类）。修复：新增 `self_entry_coverage`（按入口侧计一次），并从 missing/unresolved/uncertain 三桶与 `service_conflicts` 排除，避免重复计数。

**证据（确定性 fixture 的三级判别力，不依赖任何真实仓状态）**：

| 被测脚本 | 结果 |
| --- | --- |
| base `af5509e` | 7 passed / **4 failed** |
| 仅修文本通道 `6d2f111` | 9 passed / **2 failed**（两条均为表格通道） |
| 本 PR `aa39206` | **11 passed / 0 failed** |

**真实样本只用 logistics-master**（本机只读副本内执行）：未归档入口 `0 → 0`、未归档核心单元 `134 → 86`、跨域冲突 `217 → 169`。

**复审链**：R1（实施方自证）→ **R2 独立复审 FAIL**（仅 RC-1 未闭合：表格通道残留同一根因；RC-2/3/4 均 CLOSED 且数字精确复现）→ 整改 `aa39206`（表通道 + ASCII 表头用例 + 反向对照 + 建议 1「Reason Breakdown 正交标注」+ 建议 4「PR 描述措辞更正」）→ **待 R3 复审**。

## 3. B 线：logistics-master 知识沉淀（已完成部分）

起因：办公机按代码重做知识沉淀后，审计 BLOCKED（52 未归档入口 / 382 未归档核心单元 / 207 跨域冲突），文档里存在成批「**归属待 Owner 对账**」注记。裁决原则（用户明确）：**实施方依代码证据判断归属，不向用户抛业务问题**；文档状态保持 Candidate 待用户确认。

已做（三轮对账 + 一轮挂接 + 一轮冲突清理）：

| 轮次 | 提交 | 内容 |
| --- | --- | --- |
| 1 | `c64e8fd9` | 库存批次族 → 新增 L4 `030303InventoryBatchMaster`；配送批次族 → 新增 L4 `040204DeliveryBatchMaster` |
| 2 | `8428182f` | 打印族 `060103`、Pop 商家 `080103`、权限菜单 `080104`、SKU 通用名/国际码/售卖关系 `010105`/`010106`/`010107`；另 4 处归入既有 L4 |
| 3 | `c1585b95` | 控制编码 `030105`、加工配置 `020103`、业务规则与审批 `050103`；另 6 处归入既有 L4（**入口未归档清零**） |
| 4 | `55d87880` | 300 个下游单元（Service/Manager/Mapper/XML）按族挂接到归属文档（+「下游单元」表，符号+完整路径） |
| 5 | `a81cf5cc` | 过期跨域注记改指针式引用（避免形成第二归属） |

当前审计态（`0 / 86 / 169`）：剩余 86 个核心单元 = `missing documentation 69` + `unresolved call chain 17`；剩余 169 条冲突为**真实的多域重复点名**（需文档侧把非归属文档改指针式引用）。

## 4. 待 Current User 裁决（按序，均未开工）

1. **`X` ↔ `XImpl` 口径张力**（R2 复审建议 3）：脚本的**反向链图**把接口与实现视为同一逻辑单元，而**文档匹配**把两者当独立记录——本次数字上升的主力即此类（wms 18/19、logistics 约 64/69）。选项：(a) 保持现口径（逐记录点名，数字维持上升后水平）；(b) **显式实现别名口径**（文档点名 `XImpl` 即视为接口 `X` 已覆盖，并写入口径说明）——**实施方建议 (b)**，理由是现"严格"是子串匹配被修掉后的副产品、且与链图自洽。
2. **数字重登记**：本修复会改变既有登记口径，需重跑重登记的目标为 **PR #171 描述**中的表（`未归档入口 12|30`、`未归档核心单元 165|100`、`跨域冲突 306|234`）与 **PKB 归档 `2026-09-16-g6-prereq-governance-repair.md`**（同一组数字）。用户已明确 **wms-monitor 不作为样板**（该仓自身有待处理问题）——建议重登记以**确定性 fixture** 或健康样本为准。
3. **是否恢复知识沉淀**：剩余 ①86 个核心单元（补文档）与 ②169 条冲突（文档侧指针化）。用户此前指示「先暂停知识沉淀，先改脚本」，脚本已改完待复审。
4. **挂账项**：R2 复审建议 2（泛化短 token 如 sql 名 `id` 的弱证据噪音）保留后续处理。

## 5. 环境与工具链前置（换机必读）

- Node **v24.x / ABI 137**（`require('better-sqlite3')` 必须通过）；v22 下 store 测试的 `STORE_FAILURE` 是 ABI 不匹配，不是代码缺陷。
- **ruby 3.3.12 + Psych 5.1.2**。
- ⚠️ **`tests/audit-entry-coverage.test.sh`、`tests/bootstrap-knowledge-target.test.sh`、`tests/manual-chain-fixture.test.sh` 均不在 CI**，必须手动跑（CI 只跑 tsc / npm test / 三 Ruby 校验器 / 变异 harness）。
- **`wms-monitor` 只读，且不作为验收样板**（用户指示）；真实样本审计一律在临时副本内执行（`cp -cR` CoW 克隆瞬时完成）。
- `tests/loop-codex-implementation-adapter.test.ts` 的 D05 全仓纯净守卫在并发写文件时会翻转为 file-level 失败（已知运维项）。

## 6. 复现与验证命令（照抄可跑）

```bash
# A 线：审计脚本回归测试（应 11 passed / 0 failed）
bash tests/audit-entry-coverage.test.sh

# A 线：判别力回退实验（base 应 7/4；仅修文本通道的 6d2f111 应 9/2）
mkdir -p /tmp/prefix/scripts /tmp/prefix/tests
git show af5509e:scripts/audit-entry-coverage.rb > /tmp/prefix/scripts/audit-entry-coverage.rb
cp tests/audit-entry-coverage.test.sh /tmp/prefix/tests/
bash /tmp/prefix/tests/audit-entry-coverage.test.sh

# B 线：logistics-master 审计复跑（只读副本或直接在工作树跑；报告写入 .sdlc/reports/entry_coverage/）
cd <logistics-master>
AI_SDLC_STANDARD_HOME=<本产品仓绝对路径> ./.sdlc/scripts/bash/audit-entry-coverage.sh --strict .
grep -E "^\| (Unarchived Entries|Unarchived Core Units|Cross-Domain Conflicts) \|" .sdlc/reports/entry_coverage/entry_coverage_report.md
```

## 7. 本次交接刻意未做（冻结声明）

- **未合并 PR #176**、**未出 R3 复审 prompt**（用户指示：先不做任何改动或复审）。
- 未写 Control Plane STATE、未写 PKB（本轮为修复轮，非 closure event）。
- 未改任何业务仓（除 B 线已推送的 5 个提交，且均已 `git push` 到 `origin/master`）。
- 未做任何 review；未触碰 G5 冻结面、合同冻结语义。

## 8. 2026-09-18 下午更新（公司机会话：B 线恢复 + 发布勘误 + R3 已出）

### A 线
- 无代码变化；PR #176 仍 OPEN @ `aa39206` **待 R3**。R3 复审 prompt 已于会话内交付
  Current User（2026-09-18）。要点（若 prompt 文本遗失可据此重建）：RC-1 表格通道闭合
  验证（词边界 + 双语/ASCII 表头探针）→ 三级判别回退实验（base 7/4 → 6d2f111 9/2 →
  aa39206 11/0）→ 真实样本 logistics-master 0/86/169（wms-monitor 只读不作样板）→
  **幻影冲突机制裁决必答**（path/text 宽松通道遗留，实例 DeliveryBatchMapper⊂BatchMapper、
  PrintSchemeWarehouseService⊃WarehouseService，报告在 logistics-master
  .sdlc/reports/entry_coverage/cross_domain_conflicts.md）→ X↔XImpl 口径技术建议
  （(a) 保持现口径 / (b) 显式实现别名，实施方仍荐 (b)，量化占比后给推荐）。

### B 线（§4-③ 沉淀恢复，用户指令「继续推进」）
- 三组收敛：04/05/06 与 07/08 两 agent + 01/02/03 会话直做。非归属跨域引用改指针式
  （「最详细引用=归属」，拿不准注记「归属待 Owner 复核」）；约 50 个孪生符号
  （接口/Manager/Mapper ← 已文档化 Impl）按 implements/注入关系挂接归属 L4
  「下游单元」表（`| 层 | 符号 | 代码路径 |` 格式，路径全 find 验证）。
- **origin/master @ `53251a99`**（56 文件 +262/−74）。审计（aa39206 口径）：
  入口 0 维持、核心单元 86→**20**、冲突 169→**150**。
- 残留定性：20 未归档 ≈ 文档已含 token 但严格匹配仍计 + 待 Owner 复核归属项
  （DiplomacyService 四域共享基类、BatchManager 族 0303 主档 vs 0503 延误写路径、
  UserWarehouseService、WarehouseSkuPurchaseRelationService）；150 冲突主体 =
  path/text 宽松匹配幻影（**text_contains? 裸子串残留为本 PR 未覆盖的脚本口径面**，
  R3 第三节已列为裁决必答）。

### 发布勘误（G5 完成评审 Exchange v1 缺消费元数据头）
- v1 run `20260917T092316Z` handoff.md 缺 G6P 式元数据头（正文无缺失；PKB 归档
  front matter 齐备不受影响）。经用户授权发布修正 v2 run `20260918T024331Z`
  （run `a03043d` / 指针 `47ccaa6`，PR #128/#129）；CP STATE publication 重定向
  PR #87（`e994381`）；PKB 勘误注记 + current.md 第 3 条（`339e455`）。v1 不可变保留。

### 待办（换机后）
- 用户回贴 R3 复审报告 → PASS 则请合并授权（#176）→ 按 §4-② 数字重登记
  （确定性 fixture 或健康样本口径）→ 按 §4-① 落地 X↔XImpl 口径 → §4-③ 残余是否续推
  （20/150 属脚本口径面，文档侧已尽）→ §4-④ 挂账项维持。
- 环境：node v24（ABI 137）/ ruby 3.3.12+Psych 5.1.2 / 三 shell 套件手动跑 / 本机
  logistics-master 工作区如被切回 master 记得 pull（origin/master 头 53251a99）。

## 9. 2026-09-19 更新（家用机会话：A 线两轮闭环 + 泛化轮立项）

### A 线 #176（边界口径）
- R3 复审 PASS（零阻塞）→ 用户授权合并；BEHIND 保护触发 update branch（`ffc41b2`）
  后合并，merge commit **`93377d1`**。§4-①/② 随之可执行。

### 数字重登记（健康样本口径，wms-monitor 不作样板）
- PR #171 描述勘误块 + PKB 勘误 `dbb7cda`（audits/2026-09-19-correction-g6-prereq-
  audit-matching-caliber.md + current.md 第 4 条）：logistics-master @ `53251a99`
  旧口径 0/134/192 → 边界口径（93377d1）0/20/150，同树双口径实测。

### A 线 #179（别名口径，X↔XImpl (b) + 唯一性守卫）
- R1 自证 → R2 独立复审 **FAIL**（H1 表通道 impl_alias 合成列结构性不可达死代码
  + 分类覆盖不对等；H2 非阻塞孪生被去重吞成零行）→ 整改 **`0c9e0fd`**（接线
  entry_name/code_anchor 76/75 + 别名行携带分类覆盖；dedup 加接口侧资格判定）→
  R3 收束确认 **PASS** → 用户授权合并，merge commit **`7f3ffd7`**（主线现口径）。
- 关键数字（同树双口径，两轮独立复审零漂移）：logistics @ `53251a99`
  0/20/150 → **0/18/153**（−2 去重 + 5 真实跨域新可见 + 6 行翻转）；wms（信息性）
  33/115/179 → 33/79/177。三级判别 15/12→18/9→27/0、fixture 27/0。
- 复审 prompt 按 `docs/handoffs/2026-09-09-g5-t1/review-request.md` 模板
  （全量、只读、深度根因合并式）出具；R2/R3 探针资产留档 `/tmp/a179-probes/`。

### S1 二次登记（合并后）
- PR #171 描述二次勘误块 + PKB **`06792d5`**（勘误文件二次登记节 + current.md
  第 5 条）：别名口径（7f3ffd7）**0/18/153**；上一节 0/20/150 标注为边界口径
  历史登记。

### S2 泛化 token 轮立项（未开工，等授权）
- 见本目录 **`NEXT-ROUND-BRIEF.md`**：根因已坐实（sql 泛化碎片 1993 边 +
  function 泛化方法名 60 边）、修复边界与回归矩阵已备；增量裁决三项
  （J-1 跨通道 Reason 展示策略 / J-2 ImplImpl 机械别名 / J-3 中文表头映射惰性）
  随授权一并定夺。

### B 线残余（未动，待 Current User）
- 18 未归档 = 1 missing（DiplomacyService）+ 17 unresolved（text path 点名无链）；
  153 冲突中 5 行真实跨域重复待文档侧收敛；4 项归属待用户复核：
  DiplomacyService、BatchManager 族、UserWarehouseService、
  WarehouseSkuPurchaseRelationService。
- 卫生项：`53251a99` 树内审计报告为提交前陈旧副本（86/169），下次 B 线触碰时
  重生成提交。

## 10. 2026-09-19 更新（续）：#181 泛化 token 轮闭环 + 锚点卫生轮立项

### A 线 #181（弱证据过滤口径）
- NEXT-ROUND-BRIEF 立项 → 实施 **`0769b8f`**（SQL 三重门 denylist+碎片+长度门、
  文本通道 function owner 门、口径说明；J-1/J-2/J-3 按 brief 条款未捆绑）→
  R2 独立复审 **PASS** 零阻塞（被撤 1845 边 100% 程序化归因 0 例未解释；A179-R3
  探针组新头复现）→ 用户授权合并，merge commit **`84e0a20`**（主线现口径）。
- 关键数字（同树，wms 信息性非样板）：logistics @ `53251a99` 0/18/153 →
  **0/18/59**（−94 幻影消肿；未归档面集合级不变，838 记录零翻转）；wms
  33/79/177 → **141/81/65**（+108 入口为 `text sql`@58 泛化 token 误归档撤除的
  方向性回落——渠道归因按 R2 §3.4 修正，非初报的 code_anchor@90）。
- 三级判别 17/13→29/1→30/0、fixture 30/0、全量全绿。教训追加：方向性预告面
  本身可不全（本轮入口回落未被预告），逐行机制归因才是验收标准。

### S1 登记链（三轮口径）
- 一次：PR #171 勘误块 + PKB `dbb7cda`（0/20/150，边界口径）
- 二次：PR #171 二次勘误块 + PKB `06792d5`（0/18/153，别名口径）
- 三次：PR #171 三次勘误块 + PKB **`4be706d`**（**0/18/59**，弱证据过滤口径，
  现行；wms 141/81/65 按 R2 修正渠道口径）；前序数字均已标注为历史口径。

### 锚点卫生轮立项（未开工，等授权）
- 见本目录 **`NEXT-ROUND-BRIEF-ANCHOR-HYGIENE.md`**：AH-1 表通道 code_anchor 的
  method/function 成分补 owner 门（R2-S3①，双仓零发生的既有面）+ AH-2
  `text function` 死检查处置（R2-S3②，实施方建议删除）+ J-1/J-2/J-3 维持现状
  口径说明明示收口。预期 logistics 零漂移。

### B 线残余（未动，待 Current User）
- 现态：18 未归档（1 missing + 17 unresolved）+ 59 冲突（#181-R2 复核幸存行
  零伪边，含 5 行真实跨域重复待文档侧指针化）；4 项归属复核仍待用户：
  DiplomacyService、BatchManager 族、UserWarehouseService、
  WarehouseSkuPurchaseRelationService。卫生项：`53251a99` 树内报告陈旧副本
  下次 B 线触碰时重生成。
