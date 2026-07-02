# {{L4_NAME_EN}}({{L4_NAME_CN}})

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: {{DOC_DATE}}
> - **Author**: {{AUTHOR}}
> - **Status**: Confirmed
> - **Project Type Profile**: data-pipeline-etl
> - **Summary**: Data pipeline / ETL L4 skeleton for {{L4_NAME_CN}}.

## Business Scope

| Level | Value |
| --- | --- |
| L1 | {{L1_ID}}{{L1_NAME_EN}}({{L1_NAME_CN}}) |
| L2 | {{L2_ID}}{{L2_NAME_EN}}({{L2_NAME_CN}}) |
| L4 | {{L4_ID}}{{L4_NAME_EN}}({{L4_NAME_CN}}) |
| Owner | {{OWNER}} |

## Trigger And Runtime

| Trigger | Runtime / Job | Schedule / Parameter | Evidence |
| --- | --- | --- | --- |
| {{EVIDENCE_LIST}} | <spark-flink-job-or-scheduler> | <date-window-or-parameter> | confirmed-domain-map |

## Input Contract

| Source | Filter / Window | Required Fields | Empty / Missing Behavior |
| --- | --- | --- | --- |
| <table-topic-file> | <partition-or-window> | <fields> | <empty-rule> |

## Output Contract

| Target | Write Mode | Partition / Key | Downstream Consumer |
| --- | --- | --- | --- |
| <table-topic-report> | overwrite / append / upsert | <partition-or-key> | <consumer> |

## SQL Lineage

| Step | SQL / Connector | Input | Output |
| --- | --- | --- | --- |
| <step> | <sql-or-connector> | <input> | <output> |

## Partition / Window / Checkpoint

| Concern | Rule | Failure Behavior |
| --- | --- | --- |
| partition | <partition-rule> | <failure-rule> |
| window | <window-rule> | <failure-rule> |
| checkpoint | <checkpoint-rule> | <failure-rule> |

## Replay And Idempotency

| Scenario | Replay Rule | Idempotency Key | Expected Result |
| --- | --- | --- | --- |
| <scenario> | <rerun-or-replay-rule> | <key> | <result> |

## Downstream Consumer Contract

| Consumer | Payload / Table Contract | Compatibility Rule | Evidence |
| --- | --- | --- | --- |
| <consumer> | <contract> | <compatibility-rule> | <source-evidence> |

## Stable Business Facts

| Fact | Status | Source |
| --- | --- | --- |
| Domain boundary confirmed | Confirmed | user-confirmed domain map |

## Test Evidence

| Verification | Required Coverage | Evidence |
| --- | --- | --- |
| normal / empty / missing / exception | data simulation and output comparison | <pending> |
| replay / rerun | idempotent partition or key behavior | <pending> |
| downstream | consumer payload compatibility | <pending> |

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | {{DOC_DATE}} | {{AUTHOR}} | Initial data-pipeline-etl L4 skeleton. |
