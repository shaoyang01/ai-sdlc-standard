# {{L4_NAME_EN}}({{L4_NAME_CN}})

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: {{DOC_DATE}}
> - **Author**: {{AUTHOR}}
> - **Status**: Confirmed
> - **Project Type Profile**: backend-business-service
> - **Summary**: Backend business-service L4 skeleton for {{L4_NAME_CN}}.

## Business Scope

| Level | Value |
| --- | --- |
| L1 | {{L1_ID}}{{L1_NAME_EN}}({{L1_NAME_CN}}) |
| L2 | {{L2_ID}}{{L2_NAME_EN}}({{L2_NAME_CN}}) |
| L4 | {{L4_ID}}{{L4_NAME_EN}}({{L4_NAME_CN}}) |
| Owner | {{OWNER}} |

## Entry Chain

| Layer | Entry / Component | Evidence | Status |
| --- | --- | --- | --- |
| API / RPC / MQ / Schedule | {{EVIDENCE_LIST}} | confirmed-domain-map | pending-verification |
| Service | <service-method> | <source-evidence> | pending |
| Manager / Repository | <manager-or-repository> | <source-evidence> | pending |
| Mapper / External Client | <mapper-or-client> | <source-evidence> | pending |

## Transaction Boundary

| Operation | Transaction Owner | Data Written | Consistency Rule |
| --- | --- | --- | --- |
| <operation> | <service-or-manager> | <table-or-topic> | <commit-or-compensation-rule> |

## Idempotency

| Trigger | Idempotency Key | Duplicate Behavior | Evidence |
| --- | --- | --- | --- |
| <entry> | <key> | <skip-or-update-rule> | <source-evidence> |

## Rollback And Compensation

| Scenario | Rollback Path | Compensation Path | Owner |
| --- | --- | --- | --- |
| <scenario> | <rollback-rule> | <compensation-rule> | {{OWNER}} |

## Stable Business Facts

| Fact | Status | Source |
| --- | --- | --- |
| Domain boundary confirmed | Confirmed | user-confirmed domain map |

## Test Evidence

| Verification | Required Coverage | Evidence |
| --- | --- | --- |
| Unit / service test | normal, duplicate, invalid, empty, rollback | <pending> |
| Integration test | entry -> service -> persistence / external call | <pending> |
| Regression | existing behavior remains unchanged | <pending> |

## Sync Notes

Future `sdlc-speckit-sync` may add verified stable facts here after implementation, verification, and entry coverage checks.

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1.0 | {{DOC_DATE}} | {{AUTHOR}} | Initial backend-business-service L4 skeleton. |
