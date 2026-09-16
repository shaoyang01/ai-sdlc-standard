# 下一轮工作项全文：R1-P0-2 补完（NEW-B1 / NEW-B2）+ 四条非阻塞建议

> Date: 2026-09-17 · 状态：**未开工，等 Current User 授权**
> 来源：G6 前置治理修复 · R2 建议项收口复审报告 §7（复审对象 `fd4411e`，已合并 `0b3fa7f`）
> 归口：G6 前置治理修复的 R1-P0-2 补完；复审结论为「不阻塞 #172，但**阻塞 G6 readiness**」

## 1. 两条阻塞（均 pre-existing，base `df94eb6` 逐字存在）

### NEW-B1 — `publish` 路径没有 canonical 门禁，台账可被发布为 solution-gate 的 current 指针

R1-P0-2 的硬门只加在 `entry-update` 路径；`publish`（合并声明）路径未接共享判定库，因此一份精心构造的 declaration JSON 可以把 `02-方案审核/{id}_方案审核问题台账.md`（对抗扫描绑定）发布成 solution-gate 的 **manifest current 指针**。

**本机实测（2026-09-17，on `fd4411e`）**：构造 `{"declaration_seq":2,"node":"solution-gate","binding":"adversarial_scan","artifact_path":"02-方案审核/…_方案审核问题台账.md", …}` → **rc=0**，manifest 落定 `status: current` + 台账路径；同一动作走 `entry-update` 路径被正确拒绝（rc=1）。

**复现命令**（完整、可重建）：
```bash
R=/tmp/nb1/lib/20260101-NB1; mkdir -p "$R/02-方案审核"
bash scripts/publish-requirement-manifest.sh "$R" init --requirement-id 20260101-NB1 \
  --requested-depth STANDARD --depth-basis user_requested --decision-scope FULL_REQUIREMENT
printf '# 台账\n\n- finding: F1\n' > "$R/02-方案审核/20260101-NB1_方案审核问题台账.md"
D="sha256:$(shasum -a 256 "$R/02-方案审核/20260101-NB1_方案审核问题台账.md" | awk '{print $1}')"
printf '{"declaration_seq":2,"node":"solution-gate","binding":"adversarial_scan","artifact_path":"02-方案审核/20260101-NB1_方案审核问题台账.md","version":"1.0.0","digest":"%s","source_ref":"fixture","gate_result":"PASS","decision_depth":1,"decision_status":"CONFIRMED","stale_nodes":[]}' "$D" > /tmp/decl.json
bash scripts/publish-requirement-manifest.sh "$R" publish --declaration-file /tmp/decl.json   # 期望拒绝，实测 rc=0
awk '/node: solution-gate/,/source_event_ref:/' "$R/manifest.md"                               # 实测 status: current + 台账路径
```

### NEW-B2 — validator 的 manifest 交叉检查对真实产物永不触发（A9-5/A9-6 全死）

`validate-canonical-artifacts.rb` 的 manifest 扫描正则要求 `artifact_path:` **紧邻** `node:` 行，而 publisher 产物中间隔着 `status:` 行。

**本机实测（2026-09-17）**：真实 manifest 上当前正则**命中 0 条**，宽容形态（中间可隔行）命中 **7 条**（七个节点全数）；把 NEW-B1 造出的「台账当 current」manifest 交给 validator → **PASS (rc=0)**，A9-6 未触发。且无任何测试断言过 A9-5/A9-6。

**复现命令**：
```bash
ruby -e 'text=File.read(ARGV[0]); puts text.scan(/node:\s*(\S+)\s*$\s*artifact_path:\s*([^\s\n]+)/).length' <manifest.md>   # -> 0
ruby scripts/validate-canonical-artifacts.rb <NEW-B1 的 lib 目录>   # -> PASS（应有 A9-6 违规）
```

## 2. 复审给出的最小修复边界

1. **publish 路径**：对 `(node, binding, artifact_path)` 复用 `scripts/lib/canonical-artifact-path.rb` 的 `CanonicalArtifactPath.decide` 同一判定；solution-gate 强制 binding，且**拒绝 `adversarial_scan` 作为 current**（与 `entry-update` 同规则；台账仍是 binding 记录）。
2. **validator**：改为解析 manifest 的 fenced YAML 后**逐 entry**校验（与键序无关），或重写为按 entry 块匹配；A9-5/A9-6 必须能在真实 publisher 产物上触发。
3. **回归测试**：① publish 把台账发布为 current 被拒；② validator 抓住 NEW-B1 形态的 manifest（两者都要能在回退修复时变红——参照上一轮的回退实验口径）。

## 3. 四条非阻塞建议（建议同轮一并处理）

| 编号 | 内容 | 备注 |
| --- | --- | --- |
| SUG-R3-RC2-1 | `A9-7` 的围栏提取/id 比较由 regex 改为 `YAML.safe_load` 解析首个 ```yaml 围栏 | 可一并消除围栏拼写变体（```yml/```YAML/尾随空格/缩进）、键缩进与行内注释规避、引号标量假阳性；**与 NEW-B2 的修法天然重合，建议合并实现** |
| SUG-R3-RC2-2 | validator 对 `Dir.children` 的 `Errno::EACCES` 未兜底（权限拒绝目录仍抛 Ruby 栈，rc=1） | base 行为相同、非上轮引入；建议 rescue → exit 2 + 消息 |
| SUG-R3-RC1-1 | AUDIT portability 段的 sed 提取只匹配带引号形态 `SDLC_HOME="${AI_SDLC_STANDARD_HOME:-…}"` | 手工去引号变体会漏报；可放宽为可选引号 |
| SUG-R3-RC6-1 | `tests/manual-chain-fixture.test.sh` G3-F14 注释「a file argument … used to pass silently」与史实不符 | base 实为 `ENOTDIR` 回溯；装饰性，顺手改对 |

## 4. 验收要求（沿用既有口径）

- 先**实测复现**再修（NEW-B1/NEW-B2 均已有可重跑的复现命令）。
- 定向：`tests/manual-chain-fixture.test.sh`（含新增 publish/validator 回归）、`tests/bootstrap-knowledge-target.test.sh`。
- 全量：`npx tsc --noEmit` = 0；`npm test` = 166 文件 / 1767 断言 / 0 失败（数字随新增测试增长时如实更新）；两个 shell 套件全绿；三 Ruby 校验器 PASS；`git diff --check` clean。
- 越界零 diff：G5 冻结面（`core/loop-manifest-yaml.ts`、G5 残留表）、`wms-monitor` 真实仓、合同冻结语义（§4–§8.2）均不动；真实样本审计仍在临时副本内执行。
- PR base **必须是 `feature/loop-runtime-v1`**（否则 CI 不触发、保护规则会挡住合并）。
- 完成后交**独立复审**（全量、只读、深度根因合并式），复审 PASS 才合并。

## 5. 边界

- 本工作项**不启动 G6**、不做 run8、不做 C03-E 完成判断/C05、不做 D091 业务收编。
- 不因 NEW-B1/NEW-B2 重开 R1/R2 已 CLOSED 项；两条阻塞按「R1-P0-2 补完」归口。
- 若需放宽 RC-4/RC-5 的判定方向（多实现桥接 / 导航页片段化），属语义变更，须 Current User 单独授权，且会改变审计数字口径（现为未归档入口 30 / 未归档核心单元 100 / 跨域冲突 234）。
