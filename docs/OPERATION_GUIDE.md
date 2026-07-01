# 完整操作指南

> 本指南面向真实业务代码库试跑 AI SDLC Standard，覆盖标准库安装、Skill 同步、目标代码库初始化、第一条真实需求的 DocFlow 闭环。

## 1. 总体流程

```text
安装 ai-sdlc-standard
  ↓
校验标准库
  ↓
初始化 AI_SDLC_STANDARD_HOME
  ↓
同步 skills/sdlc-* 到 Codex / zcode
  ↓
初始化目标业务代码库
  ↓
选择一条单仓低风险真实需求
  ↓
00-需求资料
  ↓
01-技术方案
  ↓
02-方案审核
  ↓
DIRECT_IMPLEMENTATION
  ↓
03-实现记录
  ↓
04-代码审核
  ↓
05-测试验收
```

第一轮验证目标不是覆盖复杂业务，而是确认：

```text
每个节点只有一个稳定产物文件。
版本通过文档 Metadata 的 Version 字段控制。
历史变化进入 ## 修订记录、manifest Change History 和 Git history。
正文只保留当前有效内容。
```

## 2. 安装标准库

```bash
cd <workspace>
git clone git@github.com:shaoyang01/ai-sdlc-standard.git
cd ai-sdlc-standard
git checkout main
git pull
```

如果已经 clone 过：

```bash
cd <workspace>/ai-sdlc-standard
git checkout main
git pull
```

## 3. 校验标准库

```bash
ruby scripts/validate-skill-contracts.rb
```

期望输出：

```text
skill contract validation ok
```

如果失败，先修复标准库问题，不要继续同步 Skill 或初始化业务仓库。

## 4. 初始化 AI_SDLC_STANDARD_HOME

先 dry-run：

```bash
scripts/init-standard-home.sh --dry-run
```

确认输出后执行：

```bash
scripts/init-standard-home.sh
```

新开终端后验证：

```bash
echo "$AI_SDLC_STANDARD_HOME"
ls "$AI_SDLC_STANDARD_HOME/manifest.yaml"
```

`AI_SDLC_STANDARD_HOME` 是 Skill 在目标代码库里解析共享标准的根路径，不应写死为某个用户本地路径。

## 5. 同步 sdlc-* Skill

只同步：

```text
skills/sdlc-*
```

不要同步整个标准库，也不要把标准规则大段复制到 `.codex`、`.claude`、`.agents` 或 `.config`。

示例：

```bash
export AGENT_SKILL_DIR="<codex-or-zcode-skill-dir>"
mkdir -p "$AGENT_SKILL_DIR"
cp -R "$AI_SDLC_STANDARD_HOME"/skills/sdlc-* "$AGENT_SKILL_DIR"/
```

检查：

```bash
ls "$AGENT_SKILL_DIR" | grep '^sdlc-'
```

第一轮验证建议只指定一个 Agent 负责写 `library/{requirement_id}/**` 文件，避免多个 Agent 并发改同一个稳定产物。

## 6. 初始化目标业务代码库

### 6.1 推荐方式：进入目标代码库后使用当前目录 wrapper

进入目标业务代码库：

```bash
cd <target-project-path>
```

先 dry-run：

```bash
bash "$AI_SDLC_STANDARD_HOME/scripts/bootstrap-current-project.sh" --here --dry-run
```

确认输出后正式执行：

```bash
bash "$AI_SDLC_STANDARD_HOME/scripts/bootstrap-current-project.sh" --here
```

`bootstrap-current-project.sh` 只做一件事：把当前目录 `$(pwd)` 作为目标项目路径传给核心脚本 `bootstrap-speckit-project.sh`。它不实现新的 bootstrap 逻辑，因此不会改变核心脚本的生成行为。

### 6.2 传统方式：手动传入目标路径

也可以继续使用原始命令：

```bash
"$AI_SDLC_STANDARD_HOME/scripts/bootstrap-speckit-project.sh" <target-project-path> --dry-run
"$AI_SDLC_STANDARD_HOME/scripts/bootstrap-speckit-project.sh" <target-project-path>
```

### 6.3 生成内容

目标代码库初始化会生成或预览：

```text
.specify/project-governance-profile.yaml
.specify/entry-coverage-profile.yaml
.specify/business-domain-bootstrap.yaml
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/RepositoryStructure.md
.specify/project-context/ProjectGovernanceOverrides.md
.specify/reports/speckit_generation_report.md
library/
.gitignore entry: /library/
```

不会生成：

```text
specs/**
.specify/business_domain/** 内容
业务代码修改
git commit
```

`business_domain` 是长期代码事实文档，使用独立脚本一次性生成骨架：

```bash
"$AI_SDLC_STANDARD_HOME/scripts/bootstrap-business-domain.sh" <target-project-path> --dry-run
"$AI_SDLC_STANDARD_HOME/scripts/bootstrap-business-domain.sh" <target-project-path>
```

该脚本默认不覆盖已有长期事实文档，不读取旧版 Speckit 文档。

### 6.4 检查初始化结果

```bash
ls -la .specify
ls -la .specify/project-context
ls -la .specify/reports
ls -la library
grep -n "/library/" .gitignore
```

`library/` 顶层目录由 bootstrap 创建，具体的 `library/{requirement_id}/00-需求资料/` 等目录在真实需求产物写入时创建。

## 7. 第一条真实需求选择原则

第一条需求必须小而稳：

```text
单代码库
低风险
边界清楚
优先 DIRECT_IMPLEMENTATION
```

推荐：

```text
补一个日志字段
改一个简单校验
修一个明确 bug
补一个返回字段
调整一个非核心配置逻辑
```

暂时不要选：

```text
跨多个代码库
涉及 DB 表结构
涉及 MQ / 定时任务 / RPC 联动
涉及订单、库存、履约核心状态流
需要复杂发布、灰度、回滚、补偿
```

## 8. Requirement ID

推荐格式：

```text
YYYYMMDD-short-name
```

示例：

```text
20260701-order-log-field
20260701-inventory-check-fix
20260701-supplier-arrival-reminder
```

后续产物都放在：

```text
library/{requirement_id}/
```

## 9. 生成 00-需求资料

调用或遵循：

```text
sdlc-requirement-normalizer
```

输入可以是：

```text
一段话
截图说明
飞书文档摘要
Markdown / HTML / PDF 提取内容
聊天记录摘要
```

输出稳定文件：

```text
library/{requirement_id}/00-需求资料/{requirement_id}__需求摘要.md
```

提示词示例：

```text
请调用/遵循 sdlc-requirement-normalizer，为下面这条真实需求生成 00-需求资料。

目标代码库：
<target-project-path>

Requirement ID：
<YYYYMMDD-short-name>

原始需求来源：
<粘贴需求描述 / 飞书摘要 / 截图说明 / 聊天记录摘要>

要求：
1. 只生成 00-需求资料，不生成技术方案，不修改代码。
2. 输出到：
   library/<requirement_id>/00-需求资料/<requirement_id>__需求摘要.md
3. 如 manifest.md 不存在，请创建或给出创建建议。
4. 文档必须使用稳定文件路径，不创建带文件名版本号的副本。
5. 文档 Metadata 必须包含 Version: 1.0.0、Status、Created At、Updated At。
6. 文档底部必须包含 ## 修订记录。
7. 正文只保留当前有效需求信息，不要堆聊天过程全文。
8. 未确认的信息必须放入“待确认事项”，不能写成确定事实。
9. 完成后告诉我生成了哪些文件、manifest 是否更新、下一步是否可以进入 sdlc-specification-writer。
```

## 10. 生成 01-技术方案

调用或遵循：

```text
sdlc-specification-writer
```

输入：

```text
library/{requirement_id}/00-需求资料/{requirement_id}__需求摘要.md
当前代码库事实
```

输出稳定文件：

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
```

提示词示例：

```text
请调用/遵循 sdlc-specification-writer，根据 00-需求资料 和当前代码库生成 01-技术方案。

需求资料：
library/<requirement_id>/00-需求资料/<requirement_id>__需求摘要.md

输出路径：
library/<requirement_id>/01-技术方案/<requirement_id>__技术方案.md

要求：
1. 分析当前代码库，找出相关入口、类、方法、配置、调用链。
2. 技术方案正文只写当前正确方案。
3. 不要在正文里写 v1 怎么做、v2 怎么做。
4. Metadata Version 初始为 1.0.0。
5. 底部必须包含 ## 修订记录。
6. 未确认业务规则必须放到“待确认事项”，不能自行补规则。
7. 更新或建议更新 manifest Artifact Index。
```

## 11. 生成 02-方案审核

调用或遵循：

```text
sdlc-solution-reviewer
```

输出稳定文件：

```text
library/{requirement_id}/02-方案审核/{requirement_id}__方案审核.md
```

提示词示例：

```text
请调用/遵循 sdlc-solution-reviewer，审阅以下技术方案。

目标代码库：
<target-project-path>

技术方案：
library/<requirement_id>/01-技术方案/<requirement_id>__技术方案.md

要求：
1. 结合当前代码库审阅，不要只做文字审阅。
2. 检查类、方法、调用链、数据结构、异常处理、幂等、事务、测试点是否合理。
3. 输出到：
   library/<requirement_id>/02-方案审核/<requirement_id>__方案审核.md
4. Metadata 必须包含：
   - Version
   - Reviewed Artifact
   - Reviewed Artifact Version
   - Gate Artifact Version
   - Result
   - Can Continue
   - Development Path Recommendation
5. Result 只能是 PASS / FAIL / PASS_WITH_RISK。
6. Development Path Recommendation 只能是：
   DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION。
7. 底部必须包含 ## 修订记录。
8. 如果技术方案需要修改，只列 Required Actions，不要直接改技术方案。
```

## 12. 方案返修规则

如果方案审核结果为：

```text
FAIL
BLOCKED_NEEDS_REVISION
```

不要创建新的带文件名版本号副本。

而是更新同一个稳定文件：

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
```

要求：

```text
正文改成当前正确方案。
Metadata Version 升级，例如 1.0.0 -> 1.1.0。
## 修订记录 记录修改原因和 Re-Gate 影响。
重新运行 sdlc-solution-reviewer。
```

## 13. 实现与后续节点

### 13.1 实现

只有当方案审核满足：

```text
Result: PASS
Development Path Recommendation: DIRECT_IMPLEMENTATION
```

才进入实现。

实现提示词：

```text
请严格按照当前通过审核的技术方案实现。

依据：
- 需求资料：library/<requirement_id>/00-需求资料/<requirement_id>__需求摘要.md
- 技术方案：library/<requirement_id>/01-技术方案/<requirement_id>__技术方案.md
- 方案审核：library/<requirement_id>/02-方案审核/<requirement_id>__方案审核.md

要求：
1. 不要实现技术方案之外的功能。
2. 遇到未定义业务规则，停止并说明，不要自行补规则。
3. 实现后调用/遵循 sdlc-implementation-recorder 生成实现记录。
```

### 13.2 生成 03-实现记录

```text
sdlc-implementation-recorder
```

输出：

```text
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
```

### 13.3 生成 04-代码审核

```text
sdlc-code-review-normalizer
```

输出：

```text
library/{requirement_id}/04-代码审核/{requirement_id}__代码审核.md
```

DeepSeek、zcode、Codex、人工都可以提供原始 Review，但最终必须归一到这个稳定文件。

### 13.4 生成 05-测试验收

```text
sdlc-test-feedback-classifier
```

输出：

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试验收.md
```

## 14. 第一轮验证检查

```bash
find library/<requirement_id> -maxdepth 3 -type f | sort
```

期望类似：

```text
library/<requirement_id>/00-需求资料/<requirement_id>__需求摘要.md
library/<requirement_id>/01-技术方案/<requirement_id>__技术方案.md
library/<requirement_id>/02-方案审核/<requirement_id>__方案审核.md
library/<requirement_id>/03-实现记录/<requirement_id>__实现记录.md
library/<requirement_id>/04-代码审核/<requirement_id>__代码审核.md
library/<requirement_id>/05-测试验收/<requirement_id>__测试验收.md
library/<requirement_id>/manifest.md
```

不应出现：

```text
带文件名版本号的 Markdown 副本
带文件名版本号的 HTML 副本
```

检查：

```bash
grep -R "__v[0-9]" library/<requirement_id> || true
grep -R "Version:" library/<requirement_id>
grep -R "## 修订记录" library/<requirement_id>
```

## 15. 常见问题

### 15.1 `library/` 是什么时候生成的？

目标项目 bootstrap 时生成顶层 `library/`。具体需求目录在写入第一份需求产物时生成。

### 15.2 为什么当前目录模式用 wrapper？

为了不改变核心脚本 `bootstrap-speckit-project.sh` 的执行逻辑。当前目录 wrapper 只把 `$(pwd)` 作为目标路径传入核心脚本，其余参数原样转发。

### 15.3 是否支持弹窗选择目录？

核心脚本保持 CLI 可自动化，不内置弹窗。若需要本地交互体验，可以后续新增 macOS picker wrapper，但不应放进核心 bootstrap 逻辑。

### 15.4 第一轮是否要跑 Speckit pipeline？

不建议。第一轮只验证单仓低风险 Direct Implementation 闭环，确认稳定文件、内部版本、修订记录和 manifest 能跑通。
