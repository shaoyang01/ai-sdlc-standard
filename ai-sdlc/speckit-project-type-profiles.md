# Speckit Project Type Semantic Profiles

## Purpose

This guide defines reusable project-type Speckit semantic profiles for AI SDLC Standard.

Existing repositories such as backend services, admin/config systems, frontend applications, and ETL computation projects may be used as semantic gold fixtures while developing this standard. Runtime bootstrap must not copy their documents or compare against their legacy outputs. It selects or generates a project-local profile from the target repository code shape and explicit user-confirmed facts.

## Profile Model

Every project type profile must define the complete Speckit semantic surface, not just entry coverage:

| Field | Meaning |
| --- | --- |
| `profile_id` | Stable project-type id used by project profiles and `.specify/entry-coverage-profile.yaml`. |
| `workflow_semantics` | Stage order, redlines, preconditions, context resolution, and mandatory artifacts. |
| `document_semantics` | Metadata, revision, link, naming, split, L1/L2/L4, and subdocument rules. |
| `business_domain_semantics` | Domain layering, glossary, status vocabulary, lifecycle, business anchors, and owner confirmation rules. |
| `entry_types` | Executable, user-facing, operator-facing, or data-pipeline entry categories that must be covered. |
| `evidence_chain` | The expected path from an entry to business behavior, state, data, or side effect. |
| `coding_semantics` | Project-type engineering rules, local adapter expectations, side-effect boundaries, and implementation redlines. |
| `sync_semantics` | When specs, implementation facts, API/data changes, and stable business rules must sync to `.specify/business_domain/**`. |
| `audit_semantics` | Required checks, strict reports, blocker rules, and report interpretation. |
| `required_artifacts` | Documents or reports that prove coverage. |
| `strict_blocking_conditions` | Conditions that block a gate until resolved or explicitly waived by project profile. |
| `allowed_technical_bridges` | Technical entry points that may be accepted when they have a recorded reason and downstream evidence. |

Profiles are defaults, not repository facts. Concrete paths, class patterns, package names, route names, API files, job names, terminology, statuses, owners, and local exceptions belong in target repository profiles or generated business-domain documents.

## Complete Semantic Surface

The standard must preserve these old-Speckit semantic categories when generating new-rail documents:

| Semantic category | New-rail representation | Runtime source |
| --- | --- | --- |
| Workflow and SDD process | Standard workflow rules plus project profile selected semantic profile. | Standard package and target profile. |
| Document governance | Shared metadata, revision, naming, split, link, and L4 subdocument rules. | Standard package. |
| Project-specific document shape | `.specify/project-context/**`, `.specify/entry-coverage-profile.yaml`, `.specify/business-domain-bootstrap.yaml`. | Target code and explicit user-confirmed facts. |
| Business-domain knowledge | `.specify/business_domain/**` root/L1/L2/L4 documents. | Target code evidence and owner-confirmed business facts. |
| Entry and behavior coverage | `.specify/entry-coverage-profile.yaml` plus regenerated strict reports. | Target code and current business-domain docs. |
| Coding guide semantics | `ProjectCodingGuide.md` for local rules; standard coding guidance for shared rules. | Target code evidence and explicit local rules. |
| Sync and reconciliation | Speckit sync rules, fact eligibility, drift classification, and blocking behavior. | Specs, implementation evidence, target business-domain docs. |
| Gate and audit semantics | Gate runner, validation, entry coverage, and governance checks. | Generated local reports and standard gate rules. |
| Artifact boundary semantics | `specs/**`, `library/**`, `.specify/project-context/**`, `.specify/reports/**` ownership. | Standard package and target profile. |
| Legacy rail isolation | Preserve old `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**` for legacy workflows only. | Preserve-only runtime action. |

## Standard Profiles

### Backend Business Service

Use for Java or service-oriented repositories whose behavior is mainly exposed through RPC, HTTP, message consumers, schedules, or service-layer business operations.

| Area | Standard expectation |
| --- | --- |
| Example fixture type | Pure backend business service. |
| Workflow semantics | Domain route before write, specify/clarify/plan/tasks/analyze/implement/sync order for complex work, no implementation before required artifacts, implementation evidence recorded after code. |
| Document semantics | Business-domain L1/L2/L4, EntryCoverage/API/Impl/Test subdocuments when needed, code anchor tables, compact revision history. |
| Business-domain semantics | Business lifecycle and bounded-context routing, service/RPC/MQ terminology, status and state-machine vocabulary, idempotency and compensation facts. |
| Typical entries | `rpc-provider`, `http-controller`, `schedule-job`, `mq-consumer`, `application-listener`, `service-operation`. |
| Evidence chain | `Entry -> Service -> Manager/DomainService -> Repository/Mapper -> External/MQ/Cache when relevant`. |
| Coding semantics | Entry delegates, service orchestrates, manager owns domain transitions when present, persistence has no hidden business decision, transaction and remote-call boundaries explicit. |
| Sync semantics | Stable changes to RPC/API/MQ, status, state machine, persistence contract, idempotency, rollback, or business rule sync to matched L4 documents. |
| Audit semantics | Strict entry coverage, reverse core-service coverage, cross-domain conflict check, no undocumented business-facing entry. |
| Required artifacts | Entry inventory, entry-chain evidence, unarchived entries, unarchived core services, cross-domain conflicts, summary report. |
| Strict blocks | Entry has no L4 match; core service has no archived entry; business chain lacks required reason; entry maps to multiple L2 domains without conflict handling. |
| Technical bridges | `Client`, `Template`, `Invoker`, `Adapter`, `Listener`, framework bootstrap classes with downstream evidence. |
| Precision evidence | EntryCoverage table parsing, code anchor, path, method, route/topic/job/function evidence, and Service -> Manager -> Mapper/Repository/Client reverse coverage. |

### Admin Mixed Workflow

Use for repositories that mix admin pages, controllers, background workers, schedules, data consoles, SPI extensions, RPC providers, and configuration workflows.

| Area | Standard expectation |
| --- | --- |
| Example fixture type | Backend/admin mixed system with salary/config/workflow operations. |
| Workflow semantics | Standard SDD stages plus admin/config lifecycle checks; implementation touching worker/schedule/config/write path must update affected L4 and contracts. |
| Document semantics | L4 docs must capture UI/API contracts, background task behavior, import/export, approval, monthly copy, audit, and read/write separation when relevant. |
| Business-domain semantics | Configuration lifecycle, salary/settlement rules, approval boundaries, effective month/version, owner and operator-visible status vocabulary. |
| Typical entries | `controller`, `worker`, `schedule`, `mcq-consumer`, `oas-event`, `data-console`, `spi`, `rpc-provider`, `admin-page-action`. |
| Evidence chain | `Entry -> Application/Service -> Manager/Processor -> Repository/Mapper -> Audit/Approval/Import/Export/Copy task when relevant`. |
| Coding semantics | Controller/page action cannot be the only documented path; workers and schedules need explicit trigger, retry, idempotency, and data range semantics. |
| Sync semantics | Changes to config tabs, write path, copy task, approval/audit behavior, import/export columns, and generated data must sync to business-domain docs. |
| Audit semantics | Entry coverage must be grouped by all admin/background entry types, not only HTTP controllers; write/read paths and operator impacts must be visible. |
| Required artifacts | Entry inventory by entry type, UI/API contract table, background task matrix, write-path and read-path evidence, configuration lifecycle notes. |
| Strict blocks | Controller-only coverage while workers or schedules exist; data-console or SPI entry missing domain ownership; write path lacks approval/audit/import/export/copy boundary; duplicated entry type without routing reason. |
| Technical bridges | `PageAction`, `DataConsole`, `Processor`, `MonthCopy`, `ImportExport`, `ApprovalAdapter`, `SpiAdapter`. |
| Precision evidence | Table/code-anchor matching must distinguish business admin workflow entries from framework bridge, config-only adapter, generated/vendor residue, and historical repository residue. |

### Frontend Application

Use for web, mobile, RN, or pure frontend repositories whose behavior is mainly expressed through routes, pages, components, state actions, API clients, and popups.

| Area | Standard expectation |
| --- | --- |
| Example fixture type | Pure frontend mobile or web application. |
| Workflow semantics | Context resolution, feature branch/spec artifact preconditions, dependency pre-check, visual self-correction, impact analysis, no code before required docs for complex work. |
| Document semantics | L4 main docs include core entry mapping, feature alignment, business spec, technical architecture, key implementation, legacy dependency/bridge notes; Arch/API/Spec/Popups split when needed. |
| Business-domain semantics | User-visible page flow, interaction state, popup trigger, permission/visibility rules, backend contract vocabulary, frontend-only state side effects. |
| Typical entries | `route`, `page`, `view`, `component`, `store-action`, `api-client`, `popup`, `navigation-guard`. |
| Evidence chain | `Route/Page -> Component -> Store/Action -> API Client -> Backend contract or local state side effect`. |
| Coding semantics | Component/store/API responsibilities explicit; visual and dependency self-check required when UI changes; mock/bridge/deprecated paths documented. |
| Sync semantics | Changes to route/page behavior, popup trigger, API client contract, state transition, visibility, or user-facing text sync to L4 docs. |
| Audit semantics | Coverage focuses on user-visible routes/pages and interaction behavior, not backend class suffixes. |
| Required artifacts | Core entry mapping, component/state/API mapping, popup and navigation map, visual/dependency self-check notes, API contract list. |
| Strict blocks | User-visible route/page has no business-domain match; page has no state/API evidence; popup changes behavior without documented trigger; API client lacks backend contract or mock boundary; visual regression risk lacks verification note. |
| Technical bridges | `RouteOnly`, `PureView`, `BridgeComponent`, `NavigationAdapter`, `MockAdapter`, `FeatureFlagGuard` with recorded reason. |
| Precision evidence | Route, page, component, popup/dialog/modal/sheet, store/action/model/reducer, api_client/request/service, navigation_guard, backend/mock boundary, and visual evidence may all match L4 coverage. Android/iOS native shell, Pods, android/build, ios/build, MainActivity, AppDelegate, node_modules, generated/vendor paths must be classified and explained instead of treated as business entries by default. |

### Data Pipeline And ETL

Use for Spark, Flink, batch, streaming, or data-computation repositories whose behavior is mainly expressed through jobs, ETL classes, functions, connectors, SQL, and sinks.

| Area | Standard expectation |
| --- | --- |
| Example fixture type | Finance ETL and streaming computation project. |
| Workflow semantics | ETL, SQL, data contract, job, and key calculation changes require L4 update before completion; implementation evidence must include input/output and rerun semantics. |
| Document semantics | L4 docs include pipeline trigger, input/output, SQL/data lineage, calculation rule, exception policy, idempotency/replay, partition/window/checkpoint, and downstream report/table contract. |
| Business-domain semantics | Metric definition, settlement/finance period, source table/topic, target table/report, aggregation grain, correction/replay policy, visible business owner. |
| Typical entries | `spark-job`, `spark-online-etl`, `flink-main`, `flink-process-function`, `mcq-connector`, `scheduler-trigger`, `sql-task`. |
| Evidence chain | `Entry -> Job/Etl/Main -> Function/Service/Selector/Cal -> Connector/Repository/Sink -> Output table/topic/report`. |
| Coding semantics | SQL and connector changes require explicit data contract review; rerunnable tasks must document idempotency; checkpoint/window/partition behavior must be stated when relevant. |
| Sync semantics | Changes to SQL, input/output schema, metric formula, schedule, partition, replay/idempotency, sink, or failure notification sync to business-domain docs. |
| Audit semantics | Gate checks data pipeline coverage, data lineage, idempotency, and output contract rather than controller/service coverage only. |
| Required artifacts | Pipeline entry inventory, input/output contract table, SQL/data lineage evidence, idempotency/retry/replay notes, partition/window/checkpoint notes, failure and compensation matrix. |
| Strict blocks | Job or stream main has no L4 match; SQL/output table lacks owner or contract; input or output is undocumented; idempotency/replay semantics missing for rerunnable task; checkpoint/window/partition behavior omitted when relevant. |
| Technical bridges | `SparkJobMain`, `FlinkPipelineMain`, `FunctionOnly`, `Connector`, `Sink`, `Client`, `Template`, `Invoker` with downstream evidence. |
| Precision evidence | spark_job, spark_online_etl, flink_main, flink_process_function, mcq_connector, sink, publisher, downstream handler, SQL lineage, repository, calculator, trigger, input, output, partition/window/checkpoint, replay/idempotency, and downstream consumer evidence must participate in reverse coverage. |

### Library Or Shared Component

Use for repositories that provide shared utilities, SDKs, clients, or framework adapters rather than direct user/business entries.

| Area | Standard expectation |
| --- | --- |
| Typical entries | `public-api`, `client-method`, `adapter`, `extension-point`, `configuration-hook`, `test-fixture`. |
| Evidence chain | `Public API -> Contract -> Consumer scenario -> Compatibility rule -> Test evidence`. |
| Workflow semantics | Public contract change requires compatibility decision before implementation completes. |
| Document semantics | API/contract, versioning, consumer scenario, deprecation, and migration notes are first-class docs. |
| Business-domain semantics | Consumer-facing vocabulary and compatibility expectations replace direct business flow ownership. |
| Coding semantics | Breaking changes require migration path; adapters and extension points need explicit contract and tests. |
| Sync semantics | Public API, compatibility, deprecation, and migration facts sync to shared component docs. |
| Audit semantics | Gate focuses on public surface and consumer compatibility rather than business entry inventory. |
| Required artifacts | Public API inventory, consumer scenario mapping, compatibility notes, versioning and deprecation notes, test coverage summary. |
| Strict blocks | Public API lacks contract; breaking change lacks migration path; consumer scenario unknown; compatibility risk lacks test evidence. |
| Technical bridges | `Adapter`, `Factory`, `Template`, `Invoker`, `ExtensionPoint` with consumer evidence. |

## Runtime Selection Rules

Bootstrap may infer an initial profile hint from code shape, but must keep it editable in `.specify/entry-coverage-profile.yaml`.

| Code evidence | Initial profile hint |
| --- | --- |
| Java service with controllers, RPC providers, MQ, schedules, services, and mappers | `backend-business-service` |
| Backend project with admin actions, workers, data console, SPI, and config lifecycle code | `admin-mixed-workflow` |
| `package.json`, React/RN/Vue pages, stores, API clients, and route definitions | `frontend-application` |
| Spark/Flink modules, `*Job`, `*Etl`, `*Main`, `*Function`, SQL, connectors, sinks | `data-pipeline-etl` |
| Exported SDK/client/shared modules without deployable entry | `library-shared-component` |
| Multiple strong signals | `mixed`, with explicit entry types listed per module |

Runtime bootstrap must:

1. Treat detected language as language evidence only, never as the execution model. Java, TypeScript, Python, or mixed language hints must not decide entry semantics by themselves.
2. Generate project-local entry types from detected code evidence and the selected profile hint.
3. Keep unknown entry categories as unresolved questions rather than silently dropping them.
4. Allow multiple profiles in one repository when modules have different execution shapes.
5. Store repository-specific patterns only in `.specify/entry-coverage-profile.yaml`.
6. Never require legacy Speckit documents to decide the runtime profile.

Profile selection uses strong execution-shape signals:

| Rule | Required behavior |
| --- | --- |
| Frontend selection | Requires frontend framework dependency, frontend source shape such as `src/pages`, `src/views`, `src/screens`, `src/components`, `src/navigation`, `src/router`, `src/store`, or `src/api`, or server-rendered webapp shape such as `src/main/webapp/WEB-INF`, JSP/FTL/VM pages, and project-owned webapp JS. A plain `package.json` or unrelated static assets are not sufficient. |
| React Native selection | Android/iOS native shell files do not make a React Native project backend-style when frontend/RN source roots exist. The generated entry profile must still include route/page/component/store/API/popup/navigation entries. |
| Backend selection | Requires Java/service-oriented source evidence plus deployable or business-facing entries such as HTTP, RPC, MQ, schedule, or similar service operations. |
| Admin mixed selection | Requires admin-specific workflow signals such as OAS event, data-console, SPI, approval/audit controller, config schedule processor, or month-copy processor code. Generic backend workers, schedules, import/export helpers, or controller presence alone are not enough. |
| Data pipeline selection | Requires Spark/Flink/ETL/job/function/connector source evidence, not generic Java service evidence. |
| Multiple profile selection | When multiple strong signals exist, all matching profiles may be selected; entry types must be generated from selected profiles, not from the primary language. |

## Shared Gate Semantics

All project types share these gate semantics:

1. A strict gate is about executable or user-visible behavior coverage, not only backend class coverage.
2. Each entry type must have an evidence chain appropriate to its project type.
3. Missing evidence must be explicit: `accepted technical bridge`, `not business-facing`, `generated code`, `deprecated`, or `requires owner confirmation`.
4. A project profile may relax a recommended layer only with a recorded reason.
5. Strict outputs must be regenerated locally from the target repository and current business-domain documents.
6. Entry coverage audit must use Markdown table parsing and code-anchor matching before falling back to text contains.
7. Technical bridge, framework bridge, generated/vendor, native shell, abstract/base, annotation/marker, and not-applicable rows must remain visible with a reason, but they do not block strict mode unless explicitly marked as business behavior.
8. Current requirement scope must distinguish `current_requirement`, `historical_repository_residue`, `repository_wide`, and `unmatched`.

## Standard Development Fixture Coverage

When improving this standard package, maintain semantic fixture coverage across at least these fixture categories:

| Fixture category | Must preserve semantics for |
| --- | --- |
| Backend business service | Workflow order, document governance, RPC/process/schedule/MQ entry coverage, business-chain evidence, service reverse coverage, coding and sync redlines. |
| Admin mixed workflow | Workflow order, controller/worker/schedule/MCQ/OAS/data-console/SPI/RPC coverage, admin UI, configuration lifecycle, approval/audit/import/export/month-copy gates. |
| Frontend application | Workflow order, L4 Arch/API/Spec/Popups shape, page/component/store/API/popup mapping, visual and dependency self-check, route/user-interaction sync. |
| Data pipeline and ETL | Workflow order, Spark/Flink/job/function/connector coverage, SQL/data lineage, metric contract, idempotency, replay, partition/window/checkpoint, output contract gates. |

Fixture use is a standard-package development activity. It is not part of target-repository bootstrap runtime.
