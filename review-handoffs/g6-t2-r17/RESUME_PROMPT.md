# 可复制到明日新会话的提示词

请继续 G6-T2-REVIEW-R17 全量、只读、根因合并式复审。先阅读本分支 `review-handoffs/g6-t2-r17/R17-REQUEST.txt` 与 `README.md`，再按 `SHA256SUMS` 验证证据文件。主审 PR #197，冻结目标 HEAD 为 `7ec2dc6aa353c2aa488543e546ba1cf87cce27d9`，代码数据基线 `2ec9ecb`。先只读重查实时 PR head；若已变化，明确报告漂移，不把旧证据直接套到新提交。遵守原任务的中性措辞、独立副本和只读边界：不改主工作区/产品代码，不提交或推送复审修复，不合并、不改 Control Plane、不运行真实 Agent CLI/run8。

本轮已完成的独立证据请复用，不重复耗时长测：Node v24.12.0、tsc 0；全量 `npm test` 173 文件，仅既定 A′ 行为矩阵文件级红；原审计基线 11/0；R17-H1（stderr 红行）、H2（同数不同 ID 与同数不同文本）、H3（非 JSON 与缺 t 对象）五份完整原审计均退出 1、10/1；旧形态 a/b/c/d 完整审计分别 10/1、5/6、10/1、10/1；R12 四封签、负向 53/54 与 37/38、8 文件存在性删除均已直接失败。证据与变异 diff 在本目录 `evidence/`，具体索引见 README。§5 短探针只标机制推演，不冒称完整审计。

**唯一尚需完成的原任务长测是 R17-H4 的 e/f：**
1. 在另一台电脑从精确 HEAD `7ec2dc6` 建两个新隔离副本；Node 24、Ruby 3.3 前置。不要复用本次被中断的进程/变异副本。
2. e：参照 `evidence/old-c-e/e_49_fake_id.patch` 构造“49 真实场景 + 1 伪造 ID 绿印行”，直接入口应 exit 0、50 绿印行、49 scenario 事件、0 register pin。再运行**未修改的原版** `tests/g6-negative-coverage-audit.test.ts` 完整四入口；必须拿到最终进程 exit、10/1 汇总、产物专属失败行与未改三入口正常值。中断记录 `e_49_fake_id.audit.interrupted.json` 不算结果。
3. f：参照 `evidence/old-f/` 或 `evidence/old-a-b/probe.py` 的 `f_late_red`，捕获负向 handle，在结构性 settle 后调用真实 `h.ok(false, ...)`。直接入口应因 `handle used after settle` 退出 1，54 assert 事件、1 settle，且无补写红事件。再运行原版覆盖审计器完整四入口，取得最终 exit 1、10/1、行为负向专属失败行与未改三入口正常值。已有部分红项不算完整结果。
4. 每个变异结束后 `cmp`/SHA256 确认源文件与冻结 HEAD 字节一致。若 `tsx` 在受限沙箱出现 AF_UNIX `listen EPERM`，该次作废，在允许本地 socket 的环境完整重跑；不要将环境错误算为拒绝。

然后只读重读实时 PR #197 正文与报告 §6.2/§6.4/§9，核对 HEAD、祖先、轮数和措辞；确认 `git diff b8923fc..HEAD` 仅 tests/docs 且 `git diff --check` 为空。当前已有两项独立 FAIL 根因：R17-H6 事件流未全量校验（矛盾双 pin 下原审计仍 11/0 退出 0，完整证据 `evidence/contradictory-pin/pin-v24.*`），R17-H7 PR 正文“十五轮”与自身 R1–R16/报告“十六轮”不一致。已声明的 49+1 一致补写边界不得升格为缺陷。最终输出第一行 PASS 或 FAIL；逐节给 §2 两张清单、§3 H1–H5 与 e/f 结果、§4 回归、§5 元推演；每个新阻塞给机制/位置/修正边界/回归核验四要素。明确区分复审结论、PR 合并授权和 Control Plane 登记。
