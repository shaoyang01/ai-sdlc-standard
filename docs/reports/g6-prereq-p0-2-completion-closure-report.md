# G6 前置治理修复 R1-P0-2 补完收口报告（NEW-B1/NEW-B2 + 四建议，R3 PASS）

> Date: 2026-09-15
> 结论: **G6 前置治理修复 R2 发现项全部闭合，R3 复审 PASS**。评审对象 `5452d59dc2c5137318294aa88a7d029303fb2eb8`（PR #174，base=`feature/loop-runtime-v1`@`5a87f1d`，范围恰 4 文件 +184/−82）。NEW-B1（a–e 全 CLOSED）、NEW-B2（a–d CLOSED；e 按复审章程字面记 NOT_CLOSED——实为 F-4 证据勘误，见 §4）、四条建议（SUG-R3-RC1-1/RC2-1/RC2-2/RC6-1）全部落地。待 Current User 收口裁决（§6）。
> R3 报告: 独立复审会话记录（worktree `/tmp/g6p-r3-wt.NAy0zq`，探针 `/tmp/g6p-r3-probe*`，保留备查）
> 编码依据链: manual-runtime-semantic-contract v1.1.0 §3.1（稳定产物与多轮规则）+ `scripts/lib/canonical-artifact-path.rb` 共享裁决库（R1-P0-2 交付）+ G5 冻结面（`core/*.ts` 冻结于 `b00ab7e`）

## 1. 评审收敛轨迹（R1 → R3）

| 轮次 | 评审对象 | 判定 | 整改产出 |
| --- | --- | --- | --- |
| R1 | G6 前置治理修复首轮交付 | FAIL（6 阻塞：P0-1 `write_managed_file` 绕过 staging 事务、P0-2 canonical gate 缺 requirement_id+binding 绑定、P1-3 契约头滞留 v1.0.0、P1-4 audit 一跳无上下文匹配、P1-5 `common/` 目录遮蔽业务页、P1-6 legacy 自动降级） | 修复并入 `feature/loop-runtime-v1` |
| R2 | R1 修复合入态 | FAIL（NEW-B1 publish 路径绕过 canonical gate——构造声明可把对抗扫描台账安装为 solution-gate current 指针；NEW-B2 validator manifest 交叉校验死正则——行相邻模式在真实产物 0 命中，A9-5/A9-6 形同虚设）+ 四建议 | → `5452d59`（PR #174） |
| **R3** | **`5452d59`** | **PASS**（NEW-B1/NEW-B2 关闭获复审独立探针直接证明；四建议全落地；F-1/F-2/F-3 均为 P3 非阻塞；F-4 证据勘误提请裁决） | 收口 |

## 2. 本轮交付内容（`5452d59`，4 文件）

1. `scripts/publish-requirement-manifest.sh`（NEW-B1）：canonical gate 提升为脚本级共享函数 `canonical_gate()`，`entry-update` 与 `publish` 两路均调用；publish 路自声明 JSON 提取 node/binding/artifact_path 后过同一 gate，拒绝发生于 `load_state`/`check_self_consistency` 之后、任何写入之前。
2. `scripts/validate-canonical-artifacts.rb`（NEW-B2 + RC2-2）：manifest 交叉校验改为首围栏 `YAML.safe_load` + 逐 entry 判定（与 publisher 同一共享库）；A9-5/A9-6 在真实产物上可命中；新增 A9-9（围栏缺失/解析失败，fail-closed）；A9-7 改从解析结果判定；不可读目录经 `list_dir` → `DirectoryUnreadable` → exit 2 单行消息无回溯。
3. `scripts/bootstrap-knowledge-target.sh`（RC1-1）：AUDIT portability 烘焙路径提取 sed → ruby，引号/无引号 `SDLC_HOME=` 两形态均识别。
4. `tests/manual-chain-fixture.test.sh`（G3-F15，11 断言）：publish 拒绝台账/错 ID/轮次后缀、正式裁决合法发布、validator 捕获 A9-6；RC6-1 修正 G3-F14 历史注记（前守卫行为为 `Errno::ENOTDIR` 回溯 rc=1，非静默通过）；`decl-esc.json` 增补 `binding: formal_verdict`。

## 3. R3 PASS 判定摘要（复审独立证据，非实现方证据）

- **NEW-B1 关闭**：七 ACTION 分支逐一枚举，仅 entry-update/publish 能写 `artifact_path`（无第三条未设防写路径）；DECL_* `rescue ""` 四探针（缺 node 键/畸形 JSON/node 非字符串/空串）全部 rc=1 且 manifest digest 前后不变（拒绝先于写入）；四元组拒绝矩阵五连拒 + 正式裁决合法发布 rc=0；CRLF manifest → 空 rid → `decide` fail-closed（entry-update rc=1 "requirement id is required"，publish rc=1 `MANIFEST_CORRUPT_STOP`）；R2 原口径反例（R2 时 rc=0）本轮 rc=1 + `NON_CANONICAL_PATH`。
- **NEW-B2 关闭**：真实产物 validator PASS；轮次后缀 current → A9-5 实测命中；台账 current → A9-6 实测命中（R2 时旧 validator PASS）；A9-9 双路径（围栏缺失/解析失败）rc=1 fail-closed；A9-7 不回归，形态健壮性探针不炸。
- **四建议落地**：RC2-1 四类绕过形态逐一探针（fence 拼写→A9-9、引号标量→无假阳性、行内注释→A9-7 仍命中、键缩进→静默 PASS 定级 P3 并入 F-1）；RC2-2 EACCES rc=2 零回溯、`Dir.children` 无未包装直调残留；RC1-1 四形态提取正确（fail-open 方向定级 P3）；RC6-1 经 `fd4411e^` 实测与注记文字一致。
- **回归独立重跑全绿**（ruby 3.3 口径）：manual-chain **106/0**（原 95/0）、bootstrap **820/0**、t5-parity **32/0**、r3-rework **90/0**、ls-ps **93/0**、tsc **0**；实现方全量自证 166 文件/1767 断言/0 失败。冻结面零越界（`git diff b00ab7e..HEAD -- core/` 空、契约正文/`scripts/lib`/00-需求资料/skills/wms-monitor 零改动）。
- **复审环境备注**：系统 Ruby 2.6 下 gate rid 提取静默置空 → `decide` 拒绝 → 退化为 fail-closed，无 fail-open 风险；项目基线 ruby 3.3.12 + Psych 5.1.2，本报告数字均为 3.3 口径。

## 4. F-4 证据勘误（章程口径适用提请 Current User 明示）

实现方自证（`5452d59` 提交信息）声称 validator 回退实验 **3 红**；R3 复审实测 **2 红**（整段恢复 base 形态）。实现方已在分离 worktree（`5452d59` + validator 恢复 `5a87f1d` 版本）复跑证实：**104 passed / 2 failed**，两条红恰为 G3-F15(d) 的 gate-pointer rc 断言与 `A9-6[gate-pointer]` contains 断言——即 NEW-B2 的直接守卫断言，无遗漏无溢出，守卫敏感性成立。publish 侧回退 8 红双侧实测精确一致。

勘误定谳：**以 2 红为准**；原「3 红」系首轮自证回退补丁形态与「整段恢复 base」口径不一致所致的计数失实。按 R3 复审 prompt 第四条机械口径（「实测红数与声称不符 = 该项 NOT_CLOSED」），NEW-B2(e) 记 NOT_CLOSED 在案；复审与实现方一致认定材料性为零（变红集合即守卫断言本身，代码与测试均无缺口，无需任何改动）。**建议 Current User 裁决：按勘误处理，NEW-B2 维持 CLOSED（证据数字更正为 2 红）**。

## 5. 遗留与处置（R3 全部为 P3 非阻塞，不构成收口障碍）

| 项 | 内容 | 处置建议 |
| --- | --- | --- |
| F-1 | validator 形态盲角：解析成功但形态非状态（非 Hash state / 缺 entries 键 / decoy 首围栏 / 非 Hash entry / 数字·数组 node）五变体同一根因——静默跳过并报 PASS；全部需手改 manifest 引入，publisher 对同份文件必 fail（CORRUPT_STOP），无 publisher 产出可命中 | 挂账后续授权轮次。修复边界已记录：`safe_load` 成功后断言 `state.is_a?(Hash) && state["entries"].is_a?(Array)`，否则记 A9-9；entry 非 Hash 同理；回归矩阵 G3-F14/F15 + 四形态探针。注意：修复触碰刚过审的 validator，落地需再复审 |
| F-2 | `list_dir` 仅救 EACCES/EPERM；扫描中 ENOENT/ENOTDIR 竞态仍回溯 exit 1（无确定性非竞态触发）；ELOOP 在节点目录层被 `Dir.exist?` 吸收 | 章程选定范围，维持；随 F-1 同批可扩 |
| F-3 | RC1-1 提取对单引号/空默认形态返回空 → 可移植性告警缺失（fail-open 仅告警面；单引号形态 shell 语义本即不可用） | 章程选定范围，维持 |
| 复审现场 | `/tmp/g6p-r3-wt.NAy0zq`、`/tmp/g6p-r3-probe*` 保留备查 | 复审方确认后 `git worktree remove` 清理 |

## 6. 收口效力与待裁决事项

- 本报告为文档-only 增量；R3 评审对象与收口对象保持同一 SHA（`5452d59`），被评审四文件零改动。
- 待 Current User 裁决（按序）：
  1. **F-4 章程口径适用**：建议按勘误处理，NEW-B2 维持 CLOSED（§4）；
  2. **F-1/F-2/F-3 P3 处置**：建议挂账后续授权轮次（§5）；
  3. **PR #174 合并授权**（base=`feature/loop-runtime-v1`）；
  4. **合并后事项**：G6 前置治理修复完成裁决、G6 正式启动授权、Control Plane STATE `source_refs.product_commit` 随合并更新（分支 + PR 合 main）。
- 边界保持：改动面限于 G6 前置治理修复授权范围四文件；`00-需求资料/intake.manifest.json`、Skill 面、shadow 路径、业务仓、真实 CLI、`core/*.ts`、契约正文全程零改动。
