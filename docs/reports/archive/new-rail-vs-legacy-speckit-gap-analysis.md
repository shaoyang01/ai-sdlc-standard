`W  `   # New-Rail vs Legacy Speckit 全面差距分析

> **Date**: 2026-07-03
> **Purpose**: 对比新版 `sdlc-speckit-*` 技能与旧版 Speckit pipeline，分析语义覆盖、产物格式兼容性、双轨隔离完整性。
> **Scope**: logistics-center、pfms、pfms-rn、tms-flink-finance 四个真实项目。

---

## 一、项目基线

| 维度 | logistics-center | pfms | pfms-rn | tms-flink-finance |
|------|:--:|:--:|:--:|:--:|
| 项目类型 | backend-business-service | admin-mixed-workflow | frontend-application | data-pipeline-etl |
| 语言 | Java | Java | TypeScript (RN) | Java (Spark/Flink) |
| 旧版 specs 格式 | feature-scoped | feature-scoped | 扁平 | 扁平 |
| business_domain 文档数 | 26 | 44 | 29 | 38 |
| EntryCoverage 文档 | ✅ 有 | ✅ 有 | ❌ 无 | ✅ 有 |
| .specify/memory/ | 6 个文件 | 6 个文件 | 无 (domains/) | 6 个文件 |
| .specify/workflow/ | 5 个文件 | 无 | 无 | 5 个文件 |
| .specify/coding_guide/ | 3 个文件 | 3 个文件 | 1 个文件 | 3 个文件 |

---

## 二、双轨隔离设计验证

### 2.1 输入文档隔离

| 旧版 skill 读取 | 新版 skill 读取 | 隔离状态 |
|---|---|---|
| `.specify/memory/constitution.md` | `.specify/project-context/ProjectWorkflowGuide.md` | ✅ 完全隔离 |
| `.specify/memory/AiGovernance.md` | `.specify/project-context/ProjectDocumentationGuide.md` | ✅ 完全隔离 |
| `.specify/memory/InteractionProtocol.md` | `.specify/project-context/ProjectCodingGuide.md` | ✅ 完全隔离 |
| `.specify/memory/EngineeringStandard.md` | `.specify/project-context/RepositoryStructure.md` | ✅ 完全隔离 |
| `.specify/workflow/SDDWorkflow.md` | `.specify/project-context/ProjectGovernanceOverrides.md` | ✅ 完全隔离 |
| `.specify/coding_guide/*.md` | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/**` | ✅ 完全隔离 |

新版 pipeline 已明确红线（`new-rail-enhanced-pipeline.md`）：
- 禁止读取 `.specify/memory/**`
- 禁止读取 `.specify/workflow/**`
- 禁止读取 `.specify/coding_guide/**`

**结论：输入隔离 100% 完成。**

### 2.2 产出文档路径——共享目录

| 产出 | 路径 | 旧版写 | 新版写 | 冲突风险 |
|------|------|:--:|:--:|:--:|
| business_domain L4 | `.specify/business_domain/` | ✅ | ✅ | ⚠️ 格式不兼容 |
| EntryCoverage | `.specify/business_domain/` | ✅ | ✅ | ⚠️ 格式不兼容 |
| specs | `specs/{feature}/` | ✅ | ✅ | ⚠️ 格式不兼容 |
| library | `library/{req_id}/` | ✅ | ✅ | ⚠️ 格式不兼容 |

**结论：输入已隔离，但产出写入同一目录。如果新版产出格式与旧版不同，会导致同一目录下存在两种格式的文档，破坏一致性。**

---

## 三、阶段覆盖对比

| 旧版 SDD Workflow | 新版 sdlc-speckit-* | 覆盖状态 |
|---|---|---|
| (无) | **Preflight** | ✅ 新增 |
| Domain Route（隐式） | **Domain Route** → `specs/{feature}/route.md`（显式） | ✅ 覆盖 + 增强 |
| Specify → `spec.md` | **Specify** → `spec.md` | ✅ 覆盖 |
| Clarify → `clarification.md` | **Clarify** | ✅ 覆盖 |
| Plan → `plan.md` + 4 companion artifacts | **Plan** + contract matrix | ✅ 覆盖 + 增强 |
| Tasks → `tasks.md` | **Tasks** | ✅ 覆盖 |
| Analyze → 入口覆盖审计 | **Analyze** + TSV + project-type checks | ✅ 覆盖 + 增强 |
| Implement → 代码 | **Implement** + 4 process products | ✅ 覆盖 + 增强 |
| Sync → `business_domain/**` | **Sync** + create-if-missing | ⚠️ 覆盖但格式不同 |
| (无) | **Reconcile** | ✅ 新增 |
| Checklists | **Checklist** | ✅ 覆盖 |

**阶段覆盖：10/10，无缺失。**

---

## 四、产物覆盖对比

| 旧版产物 | 新版产物 | 状态 |
|---|---|---|
| `spec.md` | `spec.md`（12 个 product shape sections） | ✅ 覆盖 |
| `plan.md` | `plan.md`（Companion Artifact Status + Contract Matrix） | ✅ 覆盖 |
| `research.md` | `research.md` | ✅ 覆盖 |
| `data-model.md` | `data-model.md` | ✅ 覆盖 |
| `contracts/` | `contracts/`（36 contract types / project-type matrix） | ✅ 覆盖 |
| `quickstart.md` | `quickstart.md` | ✅ 覆盖 |
| `tasks.md` | `tasks.md` | ✅ 覆盖 |
| `checklists/*.md` | Checklist stage | ✅ 覆盖 |
| (无) | `route.md` | ✅ 新增 |
| (无) | `implementation.md` | ✅ 新增 |
| (无) | `workflow-status.md` | ✅ 新增 |
| (无) | `debug-guide.md` | ✅ 新增 |
| (无) | `observability.md` | ✅ 新增 |
| L4 文档 | L4 文档（create-if-missing） | ⚠️ 覆盖但格式不同 |
| EntryCoverage | EntryCoverage | ⚠️ 覆盖但格式不同 |
| `03-实现记录` | `03-实现记录` | ✅ 覆盖 |
| `04-交付总结` | `04-交付总结` | ✅ 覆盖 |

**产物覆盖：17/17 类型覆盖 + 4 新增类型。**

---

## 五、文档格式差异——核心差距

### 5.1 L4 文档格式对比

**旧版格式**（logistics-center，26 个文档均为此格式）：

```markdown
# 010104StraightOrderOutboundReceipt (直送出库回执)     ← L4_ID + EN + CN 三段式标题

> **Metadata**
> - **Version**: 1.0.1
> - **Date**: 2026-06-15
> - **Author**: shaoyang01
> - **Summary**: ...

## 1. 背景与范围                                          ← 中文自由章节名

自由文本，包含业务规则描述。

## 2. 入口与主链路                                        ← 自定义表结构
| 层级 | 稳定入口 | 说明 |                              ← 3 列，列名自定义
| :--- | :--- | :--- |
| RPC Provider | LcOrderRPCServiceImpl#receiveStraightOrderOutbound | ... |
| Service | LcOrderServiceImpl#receiveStraightOrderOutbound | ... |

## 3. 业务规则                                            ← 大段自由文本

## 4. 生命周期节点                                        ← 2 列表格，列名自定义
| 字段 | 口径 |
| :--- | :--- |
| node_type | 1140，直送出库 |

## 修订记录                                              ← 文末固定章节
| 日期 | 版本 | 修订者 | 变更描述 |
```

**新版模板**（`templates/business-domain-l4/backend-business-service.md`）：

```markdown
# {{L4_NAME_EN}}({{L4_NAME_CN}})                         ← 无 L4_ID 前缀，两段式

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: {{DOC_DATE}}
> - **Author**: {{AUTHOR}}
> - **Status**: Confirmed                                    ← 多出字段
> - **Project Type Profile**: backend-business-service       ← 多出字段
> - **Summary**: ...

## Business Scope                                         ← 英文固定章节名
| Level | Value |                                            ← 固定表结构
## Entry Chain
| Layer | Entry / Component | Evidence | Status |            ← 固定 4 列表格
## Transaction Boundary
| Operation | Transaction Owner | Data Written | Consistency Rule |
## Idempotency
| Trigger | Idempotency Key | Duplicate Behavior | Evidence |
## Rollback And Compensation
| Scenario | Rollback Path | Compensation Path | Owner |
## Stable Business Facts
| Fact | Status | Source |
## Test Evidence
| Verification | Required Coverage | Evidence |
                                                            ← 无修订记录
```

**差异明细：**

| 维度 | 旧版 | 新版 | 兼容？ |
|------|------|------|:--:|
| 标题 | `# L4_ID+EN(CN)` 三段式 | `# EN(CN)` 两段式 | ❌ |
| 章节语言 | 中文（背景与范围、入口与主链路） | 英文（Business Scope、Entry Chain） | ❌ |
| 章节结构 | 自由格式：可混合文本 + 任意表格 | 固定：7 个英文 section + 固定表结构 | ❌ |
| 表格定义 | 自由定义列名、列数、内容 | 固定列名、列数 | ❌ |
| Metadata 字段 | Version, Date, Author, Summary | +Status, +Project Type Profile | ⚠️ |
| 修订记录 | ✅ 文末 `## 修订记录` | ❌ 无 | ❌ |

### 5.2 spec.md 格式对比

**旧版格式**（pfms 样例）：

```markdown
# Feature Specification: <Title>
**Feature Branch**: ...
**Created**: ...
**Status**: Draft

## Route Summary                                          ← 路由摘要
- Requirement Type: existing-change
- Primary Domain: ...
- Sync Target: ...

## User Scenarios & Testing                               ← 用户场景
### User Story 1 - ... (Priority: P1)
**Acceptance Scenarios**: ...

## Simulated Data Before Coding                           ← 模拟数据
| Case | Input | Existing Data | Expected Result |

## Requirements                                           ← 需求列表
```

**新版模板**（`templates/technical-specification-template.md`）：

```markdown
# Technical Specification: <Title>
## Metadata
## Domain Route / Scope Baseline                          ← 英文
## Requirement Type                                       ← 结构化表格
| Type | Selected | Evidence |
## Business Domain Targets                                ← 结构化表格
## Entry Coverage Target
## Sync Targets
```

**差异明细：**

| 维度 | 旧版 | 新版 | 兼容？ |
|------|------|------|:--:|
| 路由章节 | Route Summary（自由文本） | Domain Route + 结构化表格 | ❌ |
| 用户场景 | User Scenarios & Testing（Gherkin 风格） | 无对等章节 | ❌ |
| 模拟数据 | Simulated Data Before Coding（表格） | 无对等章节 | ❌ |
| 章节语言 | 中英混合 | 全英文 | ❌ |

### 5.3 EntryCoverage 格式对比

**旧版格式**（logistics-center）：

```markdown
# L4_ID+EntryCoverage (L4_Name_CN + 入口覆盖对账)
## 1. 入口覆盖清单
| 入口类型 | 入口类 | 代码路径 |
| :--- | :--- | :--- |
| rpc_provider | LcOrderRPCServiceImpl | logistics-center-biz/.../LcOrderRPCServiceImpl.java |

## 2. RPC 方法覆盖
## 3. 关联 ServiceImpl 覆盖
## 4. <业务特定覆盖点>
```

**新版期望格式**：由 `audit-entry-coverage.rb` 生成 TSV 报告，无固定 EntryCoverage markdown 模板。

**差异：**
- 旧版是手写/半自动生成的 markdown 文档
- 新版是自动生成的 TSV + Gate 报告
- 输出格式完全不兼容

### 5.4 plan.md 格式对比

**旧版**：Summary → Technical Context → Constitution Check → Project Structure（自由格式）
**新版**：Companion Artifact Status Table → Contract Matrix → Contract Skip Records → Plan Gate Result（高度结构化）
**差异：章节结构、表格格式均不兼容。**

---

## 六、新版语义增强（格式差异之外的新增能力）

| 能力 | 旧版 | 新版 |
|------|:--:|:--:|
| Route Artifact（`route.md`） | ❌ | ✅ 显式路由记录 |
| Project-Type Profiles | ❌ | ✅ 5 种 profile 驱动 |
| Contract Matrix（36 contract types） | ❌ | ✅ 按项目类型定义 |
| Delta Change Routing | ❌ | ✅ Specification Missing, Decision Scope |
| Process Products（4 个） | ❌ | ✅ implementation/debug/observability |
| Entry Coverage Precision（12 分类） | ❌ | ✅ TSV + classification |
| Bootstrap Scan Control | ❌ | ✅ --scan-root, --scan-timeout |
| Fixture-Based Validator | ❌ | ✅ 10 fixture 类别 |
| Reconcile Stage | ❌ | ✅ 代码-文档一致性审计 |

---

## 七、项目级迁移差距

| 优先级 | 差距 | 影响项目 |
|:--:|------|------|
| P0 | 未执行 bootstrap 生成 project-context | pfms、pfms-rn、tms-flink-finance |
| P1 | 扁平 specs 路径 vs 新版 feature-scoped | pfms-rn、tms-flink-finance |
| P1 | pfms-rn 无 EntryCoverage 文档 | pfms-rn |
| P1 | 旧版 `audit-entry-coverage.sh` 路径需替换 | logistics-center、pfms、tms-flink-finance |
| P2 | 旧版 `.specify/specs/` 下 companion artifacts 路径不同 | pfms |
| P2 | `audit-entry-coverage.rb` 未在前端/ETL 项目实测 | pfms-rn、tms-flink-finance |

---

## 八、总结

### 8.1 已完成

- ✅ **阶段覆盖**：10/10，无缺失，新增 Preflight + Reconcile 两个阶段
- ✅ **产物类型覆盖**：17/17 类型覆盖 + 4 个新增产物类型
- ✅ **输入隔离**：新版完全不读取 `.specify/memory|workflow|coding_guide`
- ✅ **语义增强**：9 项旧版不具备的能力（route artifact、contract matrix、delta change 等）
- ✅ **旧版完全保留**：旧版 skill 和旧版文档完全不受新版影响，可继续独立运行

### 8.2 核心差距：文档格式不兼容

**新版 skill 能产出语义等价的内容，但文档格式与旧版不兼容。**

| 文档类型 | 格式差异点 |
|------|------|
| L4 文档 | 标题缺 L4_ID 前缀、章节名中→英、固定表结构 vs 自由格式、缺修订记录 |
| spec.md | 路由章节结构化表格 vs 自由文本、缺 User Scenarios、缺 Simulated Data |
| EntryCoverage | 自动 TSV vs 手写 markdown |
| plan.md | 结构化表格 vs 自由格式 |

**影响**：如果新版 skill 往同一 `.specify/business_domain/` 目录写入文档，会与旧版已有的 26~44 个文档产生格式不一致。例如一份 L2 主文档索引下，一半 L4 是旧版中文自由格式，一半是新版英文固定表格格式。

### 8.3 建议

1. **方案 A（推荐）**：将新版 L4/spec/EntryCoverage 模板改造为与旧版兼容的格式——恢复 L4_ID 前缀标题、中文章节名、自由表格、修订记录章节。
2. **方案 B**：保持当前格式差异，但确保新版只在新项目（未跑过旧版 pipeline）中使用，不覆盖已有旧版文档。
3. **方案 C**：新版 skill 生成文档到独立目录（如 `.specify/sdlc-business_domain/`），与旧版完全隔离。

### 8.4 当前总体评估

```
语义覆盖：  ████████████████████ 100%（10/10 阶段，17/17 产物）
语义增强：  ██████████░░░░░░░░░░ +9 项旧版无
输入隔离：  ████████████████████ 100%
格式兼容：  ████░░░░░░░░░░░░░░░░ ~20%（所有产出文档格式不同）
整体就绪度：██████████░░░░░░░░░░ ~70%（语义齐全，格式待适配）
```
