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
| **B. logistics-master 知识沉淀** | 业务仓 `logistics-master` `master`，5 个提交已推送：`c64e8fd9` / `8428182f` / `c1585b95` / `55d87880` / `a81cf5cc`（提交信息均为 `fix(support): 知识沉淀#117509 ...`） | 入口未归档已清零；核心单元 382→86；冲突 207→169；**已按用户指示暂停** |

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
