# AI-SDLC 项目长期约定（Current User 明确指示）

- **复审 prompt 不落文件**（2026-08-30）：聚焦复审 prompt 一律在会话中直接输出，用户复制给外部 agent。不写 `docs/reports/`、不 commit、不 push。
- **handoff 不落产品仓**（2026-08-30 裁决）：handoff 归 PKB（C-T2 写入 `10-projects/ai-sdlc-standard/handoffs/`）。产品仓台账（c03-e-e1e4-task-set-and-gate-audit.md）是实施事实唯一权威，恢复上下文 = 台账 + CP condition_ref。已提交的 handoff/prompt 文件保留不删、不再新增。
- **CP pass-state PR 直接合并**（2026-08-30 常设授权）：gh 身份 = shaoyang01（owner/admin），合并后汇报即可。Exchange Issue/标签与 PKB push 仍需显式授权。
- **单链推进规则**（2026-08-30）：一次只推进一条链、只问当前节点那件事。B 链（Exchange/PKB 归档）只在 C-T2 触发时提问。
- **PKB 事实分支 = `feature/knowledge-base-v1`**，`main` 不动（既有实践，已裁决固化）。
- **归档策略**（已裁决）：W1–W6b5 逐波不补发 Exchange run，C-T2 一次性收口 run（须声明覆盖全部波次并指向逐波台账）。
- **反向探针纪律**：只在临时 `git worktree` 跑，主树不留痕；探针验证新测试时必须把未提交的测试文件复制进探针 worktree。
- W7（C-T1）已完成（C-T1 CLOSED 零阻塞，C-T2 已执行，E1–E4 实施链闭合）。
- **E5 已开工（2026-08-30 授权，Decision-075，分层推进）**：L1 负向矩阵映射 ✅ PASS with gaps（缺口 G-S05 重试预算缺失、G-S09 截断证据链断裂＝中级；G-S08/G-WINDOW＝口径项；G-P1 承接 C-T1 P1）；台账 `docs/reports/c03-e5-task-set-and-acceptance-audit.md`。**停驻点：等用户确认 E5-G1 缺口修复范围（G-P1 并入与否）→ 缺口闭合后 L2 canary 触发前仍须一次显式放行（真实 CLI 前再确认 + 三 CLI 登录态复查）**。E5 PASS 后才可请求真实业务 C05。
