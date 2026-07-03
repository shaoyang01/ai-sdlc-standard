# Data Pipeline ETL — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Project Type Profile

- Project type: `data-pipeline-etl`
- Template: `templates/business-domain-l4/data-pipeline-etl.md`

## Required Semantic Surface

The data-pipeline-etl profile must cover:

- **Trigger/Input/Output**: pipeline trigger, input contract, output contract
- **SQL Lineage**: SQL transform lineage
- **Partition/Window/Checkpoint**: time window and checkpointing
- **Replay/Idempotency**: replay strategy and idempotency guarantees
- **Downstream Consumer**: downstream consumer contract
- **Entry Types**: spark_job, flink_main, flink_process_function, connector, sink, publisher, sql

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
