# G5-T5 回归 + parity 收口报告（R1–R15 十五轮复审收敛，R15 PASS）

> Date: 2026-09-16
> 结论: **G5-T5 收口**。T5 交付面（YAML 字节矩阵、跨面围栏格式、真实发布器对照、残留回归、`extractManifestYaml`/`wrapManifestYaml` 跨面围栏、manifest readiness preflight 至 terminal projection 的入口接线回归）@ `025ade6`（R14 更正空提交；R15 评审对象）经 R15 收口复核 **PASS——无阻塞项、无新增建议项**，G5 五任务（T1–T5）全部完成，进入 `G5_D09003_COMPLETION_REVIEW`（Current User 完成裁决）。
> R15 报告: /tmp/g5-t5-review-r15 会话记录（判定 PASS；十五轮全过程经九位独立复审轮次交叉验证）
> 编码依据链: 冻结稿 v1.8.0（D-1..D-24、§1–§8）+ 合同 v1.0.0 §6.2 族 + T4 收口（`89e0b95`）

## 1. 评审收敛轨迹（R1 → R15）

| 轮次 | 评审对象 | 判定 | 整改产出 |
| --- | --- | --- | --- |
| R1 | `490275b`（T5 实现） | FAIL（3 阻塞） | → `888089f` |
| R2 | `888089f` | FAIL（6 阻塞；R1 三项 NOT_CLOSED——样例闭合≠类闭合首次裁定） | → `1aa774a` |
| R3 | `1aa774a` | FAIL（B3 坏八进制引号规则 `0[0-7]*[89]`，真实 W2 产物字节漂移） | → `384aeec` |
| R4 | `384aeec` | FAIL（B1 NOT_CLOSED：N1–N4 四残口 + S7/S4） | → `c9d7b91` |
| R5 | `c9d7b91` | FAIL（B1 NOT_CLOSED：B1-Ⅰ~Ⅳ 四精确残口 + S4 边界） | → `b4c2f14` |
| R6 | `b4c2f14` | FAIL（字面块 LS/PS 根 alpha/beta + 同族两缺口） | → `b51fc1c`（PR #161 并入 T5 分支） |
| R7 | `0f3d4e5` | FAIL（读取端行界：glued 吞键 / seq 项块；depth≥3 嵌套） | → `7b6007c`（PR #162） |
| R8 | `7b6007c` | FAIL（链头类型分派；折点列；尾断 LF 族） | → `e0da318`（PR #163） |
| R9 | `e0da318` | FAIL（单阻塞：映射头首值静默丢值/腐化——三头回退链终结） | → `b00ab7e`（PR #164） |
| R10 | `b00ab7e` | FAIL（缺判据二：残留表登记缺口三症状 a/b/c） | → `7001ee4`（PR #165） |
| R11 | `7001ee4` | FAIL（登记忠实性四变体：族 A 假分层、族 B 两分法不穷尽、建议 2 注记缺失） | → `1dc39c3`（PR #166） |
| R12 | `1dc39c3` | FAIL（族 B 边界四处缺陷 + 建议 2 机核缺口 + commit 过度声称） | → `28b86cc`（PR #167） |
| R13 | `28b86cc` | FAIL（(c) 尾随空白边界 + 披露账目失实） | → `b56c12a`（PR #168） |
| R14 | `b56c12a` | FAIL（总结行计数 96 实测 93——一句之改） | → `025ade6`（空提交更正） |
| **R15** | **`025ade6`** | **PASS——无阻塞项、无新增建议项** | 收口 |

## 2. R15 PASS 判定摘要

- **R14 唯一残余闭合**：025ade6 空提交完成计数更正（"88 -> 93 assertions (+5: 3 trailing-flip + 2 space-before-colon)"，与 ls-ps 套件自述实测一致）；建议项 1 补全句（族 A BYTE-EQ 循环经 `rubyDumpFor` 间接触活 ruby）同批落盘；commit message 经逐句审计 **8/8 为真**——"声明与执行"族七次复发后首个通过完整逐句审计的整改提交。
- **纯登记链与零回退**：`core/loop-manifest-yaml.ts` 自 `b00ab7e`（R9）冻结至今，R10–R15 五轮纯登记（恰 1 测试文件）；全量套件 166 文件 / 1767 断言 / 0 失败 + ls-ps 93/93 + tsc 0 + 三 Ruby 校验器 PASS + 变异 harness 口径延续。
- **累积验证面**：R9 矩阵 46 例、相邻形态 49 例、fuzz 572 例（0 裸异常）、286 折行扫掠、153 datetime、306+ 字符串语料、五组 fold×LS 几何扫掠（约 1.2 万例）、6 个真实发布器产物端到端（pubA–F）、四头/五头回退对照、repair 全流程、ACCEPTED 混合 V9——全部与 ruby 运行时对拍或双向实测。

## 3. 收口效力

- **G5 五任务（T1–T5）全部完成**：T1 冻结稿 v1.8.0（R8 PASS）→ T2 投影器 Δ1（R8 PASS）→ T3 出口接线（R1 PASS）→ T4 入口接线（R3 PASS）→ T5 回归 + parity（R15 PASS）。
- 主线 `feature/loop-runtime-v1` 经 fast-forward 纳入 `025ade6` 全部交付（T5 十八提交线性链，含九个 PR 内容）；T5 收口后 G5 进入 `G5_D09003_COMPLETION_REVIEW`（Current User 完成裁决）。
- 本报告不改动任何被评审文件——R15 评审对象与收口对象保持同一 SHA（`025ade6`；本报告为文档-only 增量）。

## 4. 残留移交（豁免清单各项，移交冻结稿后续修订流程；不构成收口障碍）

| 项 | 内容 | 去向 |
| --- | --- | --- |
| 不可达形态残留表 7 条 | keep-chomp 族、N8 三连尾 LF 族、pre-LF 空格族、4a 冒号引号键错切（含 seq-item/链头扩展）、4b 非空映射首值压平双向静默腐化、4c float/null 字面量、族 A 嵌套 null 首元素（自读 fail-closed）、族 B 引号键四类（resolver 敏感 fail-closed / 冒号尾首 fail-closed / 冒号无空格静默腐化 / 含空格键值保真）、建议 2 ruby-same-reject | 冻结稿后续修订流程（`tests/loop-manifest-ls-ps-matrix.test.ts` 可执行残留表为机器可核台账） |
| S2–S6 | 0xA0 转义差、双引多行 n≥2 断折、nested-seq 余量（头部 blockIndent 已修）、title 含 ``` 截断、Psych 自身 NoMethodError | 建议级维持 |
| O-2..O-5 | 配对必要条件冻结稿缺口、producer_execution_id 值语义、游标空洞、读取器宽松 | 观察项维持 |
| D-21/§7.4、跨面 legal lag | T2 交付面无调用点 / 测试头注释显式标注 | 冻结稿后续修订 + 后续任务 |
| D05 纯净守卫偶发 | npm test 并发写文件翻转（断言实际 0 失败） | 已知运维项 |

## 5. 治理状态

- Control Plane STATE 随本收口更新 `source_refs.product_commit` → T5 收口后主线头（分支 + PR 合 main）；`route_state`、`active_work`（D-090-03）、`[G5_MANIFEST_PROJECTION]`（consumed: false，五任务全部交付后于完成评审消费）、`next_transition.target = G5_D09003_COMPLETION_REVIEW` 不变。
- 边界保持：未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径、业务仓、真实 CLI；G6/run8/C03-E 完成判断/C05、D091 业务收编仍不在授权范围。
