# G4/D-087 + D091 收口：执行与授权记录（2026-09-08）

> 文档性质：收口过程的 Git/PR 操作事实与授权依据登记。区分三类状态：
> 已执行（附授权来源）、未执行（PENDING）、未授权未执行。
> 本文件只登记已发生事实，不创建任何新授权。

## 1. 已执行的 Git/PR 操作与授权来源

| # | 动作 | 仓库 | 目标 | 结果 | 授权依据与覆盖范围 |
| --- | --- | --- | --- | --- | --- |
| 1 | push R9/R10 整改提交（`88a6d71` 为 amend 后结果） | ai-sdlc-standard | `feature/c03-e5-autonomous-acceptance`（G4 工作分支） | 已推送（远端曾短暂为 `f8314a1`，force-with-lease 更新，内容仅报告勘误） | G4 整改任务书指定"在原分支进行"；分支为该任务书的工作分支，复审基线依赖远端可达 |
| 2 | 集成分支创建与推送（merge `8095c6e`：G4 + D091） | ai-sdlc-standard | `integration/loop-v1-d087-closure-d091-corpus` | 已推送 | Current User 2026-09-08 收口指令"合并回主线分支并做项目治理"+ 会话内三步方案确认（"三步全做"）；含 D091 侧预留程序（RESUME §8：一次性集成归 D087 收口场景执行并显式声明） |
| 3 | PR #129 创建并合并（主线 `9990b04` → `31a67ce`） | ai-sdlc-standard | `feature/loop-runtime-v1` | MERGED @ 2026-09-08T07:46:33Z；CI 四 job 绿 | 同上（收口指令覆盖合并回主线）；主线受保护，走 PR + required checks |
| 4 | 已合并分支与 worktree 清理（G4/D091/integration/d04/d06/d07） | ai-sdlc-standard | 本地与远端分支、4 个 worktree | 完成（删除前逐分支验证 0 提交未合并） | Current User 指令"清理吧，现在所有的代码都已经合并到 feature/loop-runtime-v1 吧" |
| 5 | CP STATE 收口更新（gate CLOSED、授权消费、D091 集成记录） | ai-project-control-plane | PR #65 → main（`a48bd82`） | MERGED；validate_state PASS v2 | "三步全做"确认之第三步（Control Plane STATE 更新走分支+PR）；PR 模式同先例 #61/#62 |
| 6 | STATE source_refs 五重重复键去重 | ai-project-control-plane | PR #66 → main（`d988ca9`） | MERGED；重复键扫描 NONE + ajv2020 schema PASS + validate_state PASS v2 | 本会话治理一致性修复（上一轮交付确认范围）；基线经实时验证指向 `31a67ce` |
| 7 | STATE 基线对齐 `53b58fe`（#130 合并后） | ai-project-control-plane | PR #67 → main（`56ef699`） | MERGED；三重校验通过 | 同上（事实基线跟随主线 docs 提交前移） |
| 8 | validate_state.rb 重复键检查固化 + 测试 + state-validation workflow | ai-project-control-plane | PR #68 → main | MERGED；新 workflow `ci-state-validation` 首跑绿 | 本会话"固化 YAML 重复键检查"任务（修复 + 测试 + CI 接线在授权范围内）；CP 此前无任何 workflow，故接线为新增最小 workflow |
| 9 | 决策注记（Decision-087 收口、Decision-091 集成、索引同步；docs-only） | ai-sdlc-standard | PR #130 → `feature/loop-runtime-v1`（`53b58fe`） | MERGED @ 2026-09-08T08:28:29Z；CI 四 job 绿 | 治理一致性任务"对齐产品仓收口记录"；docs-only，无产品代码 |

## 2. 过程性失误登记（如实记录）

- CP 仓 `zcode/state-source-refs-dedup` 分支曾推送一个含 FAIL 校验的中间
  提交（`ed5ac6a`）：提交命令的管道 `| tail -1` 掩盖了 validate_state 的非零
  退出码，导致 commit/push 先于校验失败发生。修正提交在同分支完成，main
  侧经 PR #66 进入的内容为修正后版本；main 全程未受影响。教训：校验命令
  与 git 操作不得串联在掩盖退出码的管道之后。

## 3. 未执行事项与状态分类

| 事项 | 分类 | 说明 |
| --- | --- | --- |
| Exchange Publisher run + current 指针 | **未执行，PENDING** | 需 Owner 建 Issue（正文已备）并加 `exchange-publish` 标签 |
| PKB handoff 归档 + current.md | **未执行，PENDING** | Publisher run 成功后由 PKB-controlled consumer 按五元组验证执行 |
| STATE publication → COMPLETED | **未执行，PENDING** | 以上两者回执核验后回填 |
| D091 业务仓收编执行 | **未授权、未执行** | Decision-091 明确清单：logistics-center 收编、wms-monitor 收编、logistics-master 补生成（wms-portal 的 project-context 扩展收编被 Owner 明确排除于本轮；"四个业务仓"为治理套语，执行轮的精确打包须 Owner 授权时再确认） |
| `pending_confirmation` 语料待确认清单裁决、Decision-091 状态终值改注 | **未授权、待 Owner 裁决** | 依赖业务仓执行结果 |
| G5/G6/run8 | **未授权** | STATE 明文 |

## 4. 已关闭事实（防混写）

- 复审 PASS（R11 @ `a038d2b`）✓
- 已合并集成（PR #129 @ `31a67ce` + PR #130 @ `53b58fe`）✓
- 项目收口（gate CLOSED、GW_VERTICAL_REBUILD 消费）✓
- 业务仓正式执行 ✗（未授权）
- 发布归档 ✗（PENDING，材料已备）
