# Speckit Product Parity Fixtures

Development-time synthetic fixtures for the New-Rail Enhanced Speckit Pipeline product parity validator.

## Purpose

These fixtures are **standard-package development-time regression tests**. They use minimal synthetic labels (e.g., `OrderController.java`, `RoutePage.tsx`) to verify that key product semantics remain intact across PRs.

## NOT Target Project Runtime Input

- These fixtures do **not** contain real business code, real business documents, or real business paths.
- The validator (`scripts/validate-product-parity-fixtures.rb`) does **not** access real target repositories.
- Fixtures must **not** be copied into target projects or treated as runtime input.

## Fixture Structure

Each fixture directory contains:

- `fixture.yaml` — metadata, required standard files, required terms, forbidden terms
- `expected.md` — synthetic expected semantic description

## Fixture Categories

| Directory | Coverage |
| --- | --- |
| `backend-business-service/` | Project-type L4 template: entry→service→manager/mapper chain, transaction, rollback, idempotency, compensation |
| `admin-mixed-workflow/` | Project-type L4 template: controller/worker/schedule/data-console/SPI/RPC, config lifecycle, approval/audit |
| `frontend-application/` | Project-type L4 template + frontend process products: route/page/component/store/API, implementation/debug/observability |
| `data-pipeline-etl/` | Project-type L4 template: spark/flink entry, SQL lineage, replay/idempotency, connector/sink |
| `library-shared-component/` | Project-type L4 template: public API, consumer scenario, compatibility, deprecation |
| `route-artifact/` | Route artifact semantics: route type, business domain targets, entry coverage, create-if-missing |
| `entry-coverage-analyze/` | Entry coverage precision + Analyze Gate: TSV parsing, classification, technical bridge, reverse coverage |
| `bootstrap-scan-control/` | Bootstrap performance: --scan-root, --scan-timeout, structured inventory, timeout/partial semantics |
| `delta-change-supplement/` | Delta change routing: Requirement Supplement, Specification Missing, Decision Scope, aggregate vs delta |
| `project-type-contract-matrix/` | Plan contract matrix: companion artifact status table, project-type contract granularity, skip records, Plan Gate BLOCKED |
| `business-domain-naming-shape/` | Business-domain naming and shape: canonical naming gate, project shape gate, create-if-missing with project naming/shape, whole-document rewrite guard |
| `business-domain-compatible-update/` | Compatible update: preserve existing shape/facts, safe insertion point, update proposal, reconcile proposal, conflict types, revision traceability |
| `business-domain-compatible-update/` | Compatible update: preserve existing shape/facts, safe insertion point, update proposal, reconcile proposal, conflict types, revision traceability |

> 2026-08-22（C02-WP3.5，Decision-044/045）：`rail-routing-business-domain-sync/`、`specs-run-lifecycle/`、`library-driven-sync-runtime/`、`legacy-new-rail-product-parity-expanded/` 四个类别验证的是已退役的双轨/specs/sync-mode 语义，已随单轨重基线归档到 `docs/reports/archive/c02-wp3-5-single-rail-retired/product-parity-fixtures/`（residue audit allowlist 点名目录）。
