# Decision-084：P-L 收口波立项——节点 canonical 文档模板统一补齐（紧急）

## 状态

Accepted（2026-09-02，Current User 裁决：sdlc-* skills 是当前手动驱动主干的
生产基础，模板缺口为现役漏洞，**立即解决**——P-L 从「随交付尾波缓行」提升
为独立紧急收口波；先治理后实施）

## 背景

- Current User 日常以手动唤醒各节点 sdlc-* skill 的方式使用本标准（LOOP 主
  链尚未正式投产），skill 合并后节点文档模板缺口即为**现役生产漏洞**（P-L，
  台账 §3 续四，`9da7f9a`，只读核验完成）。
- 缺口：task-planning / implementation / knowledge-sync / adversarial_scan
  四类有内容合同、无 v2 对齐的 canonical 文档模板；旧迁移模板仍指向已废弃
  的 specs/** 目标。
- Current User 倾向已明确：按统一标准**一次收口四类**，不单独补
  task-planning。

## 问题

1. 四类节点的 library/ 人读产物无格式权威——跨 agent/跨 run 漂移；
2. 旧迁移模板指向 specs/{feature}（v1 事实源），与新 canonical 路径并存造成
   双权威；
3. E3 envelope 层完整不受影响，但人读文档层是 Current User 现行用法的主要
   交付物。

## 决策

1. **立项 P-L 收口波（本 Decision 即授权）**，统一在 `templates/` 新增四份
   canonical 文档模板（与 gate-result-template / technical-specification-
   template 同层同风格）：
   - `templates/task-plan-template.md`（03-任务规划：任务清单唯一 ID/范围/
     依赖/来源追溯/验证方法 + 依赖顺序 + 失败回滚测试覆盖 + 一致性审计结
     论，对齐 node-capability-contract 4.4 与 artifact-flow Task Plan 要求）；
   - `templates/implementation-record-template.md`（04-实现记录：实现内容 +
     diff/测试输出/journal 事件证据引用 + ADV 关闭对照）；
   - `templates/knowledge-sync-template.md`（06-知识同步：decision/事实/目
     标/diff-proposal/风险）；
   - `templates/finding-ledger-template.md`（adversarial_scan Finding
     Ledger：finding 唯一 ID/severity/message/cause + 状态与关闭对照）。
2. **各节点 SKILL.md 增补 canonical 模板引用**（与既有 ess/schema 引用同格
   式），使手动唤醒与 LOOP 派发产出同一格式。
3. **旧迁移模板废弃标注**：sdlc-speckit-tasks/output-and-manifest.md 等
   specs/** 目标模板加废弃声明（不删除——迁移参考价值保留）。
4. **00-需求资料 评估**：requirement-intake 需求摘要迁移模板对 v2 路径的适
   用性复核，结论写入台账（如需 canonical 化同波补齐）。
5. **验证口径**：模板逐字段对照 node-capability-contract 4.1～4.7 的
   outputArtifact 稳定路径与内容要求、artifact-flow 各节点必备项；不涉及
   runtime 代码与 E3 校验器。
6. **边界**：不改变 E3 envelope、不改 runtime、不动 H1/schema；P-K-d（方案
   C 实施）暂停现场保留（两个类型文件改动保留未提交，待本波收口后继续）；
   D2 挂账、E5-L3 冻结、零远程 Git 副作用。

## 原因

- 现役用法在生产缺口上，等待 = 持续产出漂移文档；四类一次收口避免四轮治
  理往返；
- 模板是人读文档层的格式权威，也是未来 P-C 物化器的输入契约——现在补齐同
  时为交付尾波清障。

## 影响

- 本波交付 = 四份模板 + SKILL 引用 + 废弃标注 + 00-需求资料 评估结论 +
  台账回填；四仓传播随收口执行；
- P-K-d 现场（两个类型文件未提交改动 + run4 fixture）保持冻结，本波收口后
  续作。

## 实现状态

- 产品仓：本 Decision + 索引 + 台账（本 commit）；四仓传播随即执行；
- 实施：治理落账后立即开工（本 Decision 授权）。

## 依据

- 台账 §3 P-L 发现块（`9da7f9a`，含 Current User 审计与本会话独立核验）
- node-capability-contract 4.1～4.7；artifact-flow 各节点必备项
- 既有模板风格基准：templates/gate-result-template.md、
  templates/technical-specification-template.md
