# G6-T2 R17 只读复审交接（2026-09-27）

本目录只传输 R17 复审证据与续跑说明。复审目标是 PR #197 的冻结 HEAD `7ec2dc6aa353c2aa488543e546ba1cf87cce27d9`，代码数据基线 `2ec9ecb`（相对 `b8923fc` 为 64 笔提交；HEAD 为 65 笔，末笔仅文档）。本证据分支不修改 PR #197 的分支、主线或产品运行时代码。原任务全文见 `R17-REQUEST.txt`，可直接复制给明日会话的提示词见 `RESUME_PROMPT.md`。

## 当前结论与完成状态

- 已有独立的 FAIL 证据。新增根因 R17-H6：产物入口在真实 50/0 后追加同名但 `ok:false,size:0` 的注册 pin；事件流第 1 行为通过 pin、第 52 行为相互矛盾的失败 pin，原审计器仍退出 0、11/0。见 `evidence/contradictory-pin/pin-v24.*`，源码锚点 `tests/g6-negative-coverage-audit.test.ts:201-225,263-267,317-329`。未知标签被目标入口审计记为通过、场景 id/msg 矛盾有直接入口与独立复算；两者未取得完整审计总计，仅作辅助证据。
- 新增文档项 R17-H7：实时 PR #197 正文写“十五轮外部独立复审”，同段列出 R1–R16；报告 §6.4/§9 写十六轮。R16-H5 原有的提交祖先、边界措辞和 diff --check 三项仍独立判已修复。
- R17-H1、H2-ID、H2-text、H3-非 JSON、H3-缺 t 五份指定新形态，原版完整审计各退出 1、10/1，源字节均已还原。见 `evidence/new-probes/*-rerun/` 的 `result.json` 和审计日志。
- R17-H4 旧形态 a/b/c/d 已各自完整审计拒绝：a 10/1、b 5/6、c 10/1、d 10/1。e/f 的直接入口证据有效，但完整审计应用户要求在最后未改行为矩阵阶段受控中断（exit 130），**无最终审计判定，明日须补**。e 证据在 `evidence/old-c-e/e_49_fake_id.*`，f 在 `evidence/old-f/`；变异源均已字节还原。
- 基线 Node v24.12.0，`npx tsc --noEmit` 退出 0；全量并行 `npm test` 173 文件，唯一文件级失败为已知 A′ 设计红的行为矩阵，覆盖审计器未变异基线 11/0。完整日志 `evidence/baseline/npm-test-escalated.stdout`。最初沙箱内 `tsx` AF_UNIX EPERM 运行无效，勿当作项目失败。
- R12 四类封签变异、两负向各删一条（53/54、37/38，settle 缺失）、8 个仪器存在性删除，均在直接入口失败；见 `evidence/ledger-and-presence/`。§5 停流、改松、handle、路径隔离是短探针/机制复算，见 `evidence/meta-short-probes/`；49+1 一致补写属于已声明边界，见 `evidence/consistent-supplement/`。

## 证据等级与复跑纪律

`*-rerun/audit.*` 加 `result.json` 中的最终 exit 才是完整审计证据。`evidence/old-c-e/e_49_fake_id.audit.interrupted.json`、`evidence/old-f/interruption.json`、未知标签的中断审计仅是部分痕迹，不得写成完整通过或拒绝。`evidence/baseline/` 的沙箱首跑同样排除。明日只补 e/f 的完整原版审计；如实时 PR head 已变，先报告漂移并重新判定新增差异。

本目录的文件校验和在 `SHA256SUMS`。复制到另一台电脑后可执行 `shasum -a 256 -c SHA256SUMS`。
