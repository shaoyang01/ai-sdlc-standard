# Decision-085：codex profile sandbox 修正——read-only → workspace-write + 启用 Shell

## 状态

Accepted（2026-09-02，Current User 授权实施。根因经 codex 自身诊断确认）

## 背景

- run4 implementation 节点（codex）runtime 层面 succeeded，但 spruce 仓库
  零改动。codex 自身诊断确认：**LOOP 派发时 profile 硬编码了
  `--sandbox read-only` + `-c features.shell_tool=false`**，导致 codex 只能
  产文本，不能读/写文件、不能执行 shell（含 mvn/git）。
- 该限制源自 E1-E4 时期的安全基线（当时仅做确定性测试，不做真实派发）。
  E5/冒烟已真实派发后，此限制与 implementation 节点"修改代码"的合同产生
  不可调和的矛盾。
- codex 的 `contentTransport: "stdin"` 与 `--json` 输出格式不受影响——
  实施前 codex 的 envelope 是合法的（P-A 修复已保证可读性），问题仅在于
  它没有文件写入能力。

## 问题

1. implementation 节点要求 codex 修改 spruce 仓库的 Java 代码，但
   `--sandbox read-only` 禁止一切写入；
2. `-c features.shell_tool=false` 禁用了 Shell 工具，codex 无法运行
   `mvn compile` 或 `mvn test`；
3. 这两个限制使得实现节点在真实派发下永远只能产出"计划了但没做"的文本。

## 决策

1. **codex profile sandbox 修正**：
   - `--sandbox read-only` → `--sandbox workspace-write`
   - 移除 `-c features.shell_tool=false`（启用 Shell 工具）
   - 保留 `--json --ephemeral --skip-git-repo-check`（非交互 + 无状态）
2. **边界**：
   - 只修改 codex profile；kimi 和 hermes 不动（它们已有各自的文件操作能
     力且运行正常）
   - workspace-write 允许在 attempt worktree 内读写文件和运行本地命令
     （mvn compile / mvn test），但不授权 commit/push/PR（人工 Git 边界
     不变）
3. **测试**：resume run4 验证 implementation 节点能真实修改 spruce 代码。

## 原因

- `workspace-write` 是 codex 官方推荐的非交互实现模式：允许工作区内读写
  和本地命令执行，同时保持网络隔离和 Git 目录保护；
- 相比 `danger-full-access`，`workspace-write` 的风险边界更清晰（仅限
  attempt worktree 目录树），符合最小权限原则；
- 不改 kimi/hermes profile——它们的执行模式已经在 run4 中验证通过。

## 影响

- codex 在 implementation 节点将能真实读写 spruce 仓库文件并运行 mvn；
- kimi/hermes profile 不变；
- 后续如需为其他 agent 做类似调整，另行裁决。

## 实现状态

- 产品仓：本 Decision + 索引 + 台账回填（本 commit）；四仓传播随即执行；
- codex profile 修改：治理落账后立即实施，然后 resume run4。

## 依据

- codex 自身诊断报告（Current User 2026-09-02 转交）
- 台账 §3 P-L/返工轮回填块（`9da7f9a`/`0166ca3`/`f445b2c`）
- `core/loop-codex-implementation-adapter.ts:537` 同源限制
- `execution/agent-cli-profile.ts:252-275` codex profile
