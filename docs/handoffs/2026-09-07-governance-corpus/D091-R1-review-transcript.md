# D091-R1 独立复审结论（转录件）

> **来源说明**：本文件为 D091-R1 独立复审结论的**会话转录件**（复审对象 `9e6e0c7..cc10bbb`，
> 即首轮实现）。复审原文由复审会话直接输出在协作会话中，未保留原始文件；本转录逐条
> 保留其判定与证据要点，供溯源。R1 之后各轮的独立复审原文（D091-R2 起）均为原始文件
> 存档（见同目录 `D091-R2-review.md`）。
> 复审对象精确 SHA：`cc10bbb718bb4c169f6f965c5842110c4438fd67`（首轮实现）。

## D091-R1 结论：FAIL，7 项阻塞

复审独立验证：bash -n、git diff --check 通过；完整回归 626 passed 0 failed（原场景 1–51
未修改）；真实语料副本 9 文件收编、21 行 pending 复现；logistics-center 9 行收编计划、
logistics-master dry-run 前后文件指纹一致；另验证生成、routed 幂等、普通文件回滚及
30 个独立参数组合。

公开路径行为核实：参数互斥 exit 2；缺/错 DP1 exit 1 且零写入；--detect 歧义类型判定
但 exit 0；歧义仓其他路径 exit 1；--audit 抑制收编仅补缺；NEW_EMPTY + adoption 不进入
收编继续 INIT。并发交错：目标在检查后出现时，无可靠拒绝覆盖行为。

## 阻塞项（7 项）

1. **[P1] INIT 的"跳过生成"没有传递到计划和执行，导致部分落盘后失败**。
   位置：staging 守卫、PAIR 计划。复现：已有部分 .sdlc + 旧 memory/constitution.md 不启用
   收编，dry-run 同时输出"跳过骨架"与 create；正式执行先写机器件与根文档，随后 staging
   文件缺失 cp 失败退出 1。标准包缺语料模板同样复现。修复边界：staging/计划/执行共享
   create/preserve/skip 结果；跳过项不得进入 CREATED_FILES；提示在正式执行可见。
   回归矩阵：INIT/AUDIT × 普通旧源/悬空源链接/缺模板 × dry-run/apply。

2. **[P1] adoption 安全检查未覆盖真实路径及链接对象，越界修改后还能报告完整回滚**。
   变体：.specify 祖先目录链接仓外（PLAN BLOCKED=0，APPLY 搬走仓外文件）；.sdlc/memory
   链接仓外（收编+骨架写仓外仍成功）；语料文件链接仓内 business.md（转换器跟随改写）；
   随后门禁失败源链接被恢复成普通文件、业务文件改动仍在，报告 FAILED_ROLLED_BACK；
   语料根不可读 → find 错误被吞，空计划成功返回。修复边界：限定语料入口统一验证源/
   祖先/目标父目录 realpath、权限、文件类型；链接不进入跟随写入路径；回滚覆盖实际变更
   对象与链接类型。

3. **[P1] 最终目标缺少完整冲突保护，"已收编"分支会覆盖历史归档**。
   复现：新面孔内容与转换后源一致 + 归档位置已有 HISTORICAL OWNER DATA → PLAN 仍 RETIRE、
   APPLY exit 0 覆盖历史归档。变体：悬空目标链接被当不存在替换；move 前另一写入者创建
   目标被覆盖，报告 COMPLETED。修复边界：对最终落点完整冲突判断 + 不覆盖后来者的发布
   方式；失败回滚不删其他写入者数据。

4. **[P2] 首次 TRANSFORM 没有持久保存原始语料，报告的原件归档声明不成立**。
   复现：真实 9 文件收编成功后旧源已移除、.sdlc/legacy 无原件，原始字节只在随机临时
   备份目录，报告未登记位置却声明原件已归档。修复边界：首次转换建立持久、受冲突保护
   的原件归档，报告绑定原件位置与摘要，与转换共同纳入事务。

5. **[P2] 转换器前六条规则会重新转换归档地址，rule 9 保护无法补救**。
   复现：输入 `.sdlc/legacy/.specify/memory/item.md` 输出 `.sdlc/legacy/.sdlc/memory/item.md`。
   根因：前面 memory/workflow/templates 替换先命中归档地址内部旧根。修复边界：所有相关
   规则一致的路径上下文识别，保护完整归档地址。

6. **[P2] 残留扫描豁免范围超出真正归档地址**。
   复现：活动文档引用 `.sdlc/business_domain/legacy/.specify/active.md`，迁移成功且
   AUDIT residue=0。根因：模式只检查紧邻 legacy/，未验证完整 `.sdlc/legacy/` 前缀。
   修复边界：保留归档地址豁免策略，收紧为完整路径上下文。

7. **[P2] pending 扫描没有覆盖已承诺的旧阶段链和角色矩阵正文**。
   复现：仅含 `Specify -> Clarify -> ... -> Sync` 与角色矩阵的文件收编成功但
   pending_confirmation=[]。Decision-091 决策 1 要求这些段落逐行进入待确认清单。

## 建议项

- S1（PARTIAL）：新增转换日志未在失败路径清理（EXIT 守卫漏 archive TSV；归档失败漏 log/TSV）。
- S2（PARTIAL）：同步行为规格和帮助文本（C11/C12 编号扩展已授权非缺陷；AUDIT"唯一写入
  机器件"、双根限制及 adoption 组合语义需同步）。
- S3：模板值按字面替换（`--project-name 'A\&B'` 被 Ruby 字符串替换解释为反向引用），
  三处占位符统一块替换并补反斜杠值测试。

## 逐项关闭判定摘要

A-a PARTIAL / A-b CLOSED / A-c NOT_CLOSED（阻塞 1）/ A-d CLOSED / A-e CLOSED /
B-a PARTIAL（不可读目录漏过）/ B-b PARTIAL（归档地址重映射）/ B-c NOT_CLOSED（阻塞 3）/
B-d CLOSED / B-e PARTIAL（链接场景）/ B-f PARTIAL（原件与正文漏报）/ C-a CLOSED /
C-b PARTIAL（实际路径可越界）/ C-c CLOSED / C-d CLOSED / D-a NOT_CLOSED（阻塞 6）/
D-b CLOSED / D-c CLOSED / E-a CLOSED / E-b PARTIAL（skip 进入 CREATED）/ E-c PARTIAL
（链接与交错缺口）/ E-d CLOSED。

复审要求：先修复上述阻塞项再对固定新提交复审；626 条回归全绿不足以关闭已复现路径。
