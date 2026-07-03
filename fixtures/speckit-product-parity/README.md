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
| `rail-routing-business-domain-sync/` | Rail routing: legacy vs new-rail AGENTS.md split, specs run lifecycle, shared business-domain governance, sync source modes, duplicate sync guard |
