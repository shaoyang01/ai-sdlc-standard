# C02-WP6 执行记录：Loop Run Store v2 Cutover Preflight

> 记录性质：规划 §6 C02-WP6 范围项「cutover preflight 程序有执行记录」的持久化证据。
> 程序：`scripts/preflight-loop-run-store-v2-cutover.ts`（只读；显式传入持久化根目录；
> 无 HOME/仓库根默认扫描；输出固定 schema 的 JSON + Markdown 与 digest）
> 执行日期：2026-08-25
> 产品仓 HEAD：`3c81363`（WP5 最终基线 `9936a1d` 树，含 Round-4 修正与治理登记 `6809abc` 前状态）
> 命令：`npx tsx scripts/preflight-loop-run-store-v2-cutover.ts <v7-root> <v6-root>`
> 夹具构造：`v7/journal.db`（user_version=7，含 loop_runs 表）与
> `v6/legacy.db`（user_version=6，含 loop_runs 表）——分别代表受支持格式与
> 「历史格式永不迁移」负例。

## 结论

| 断言 | 结果 |
| --- | --- |
| 受支持 v7 journal 判定为 `OK_V7` | ✅ |
| user_version=6 历史 journal 判定为 `FAIL_HISTORICAL_FORMAT`（永不迁移） | ✅ |
| 发现失败时进程以非零退出、`failureCount=1` 如实上报 | ✅ |
| 无 v5 journal → 不触发 `STOP_AND_RE_RULE` 治理停止 | ✅ |
| 输出含固定 schema 标识与整体 digest | ✅ |

## 原始输出（JSON）

```json
{
  "schema": "loop-run-store-v2-cutover-preflight:v1",
  "scannedRoots": [
    "/tmp/wp6-fixture/v7",
    "/tmp/wp6-fixture/v6"
  ],
  "candidateCount": 2,
  "failureCount": 1,
  "requiresGovernanceStop": false,
  "candidates": [
    {
      "path": "/tmp/wp6-fixture/v7/journal.db",
      "sizeBytes": 12288,
      "declaredFormatVersion": 7,
      "loopTablesFound": [
        "loop_runs"
      ],
      "verdict": "OK_V7",
      "detail": "supported v7 journal format"
    },
    {
      "path": "/tmp/wp6-fixture/v6/legacy.db",
      "sizeBytes": 12288,
      "declaredFormatVersion": 6,
      "loopTablesFound": [
        "loop_runs"
      ],
      "verdict": "FAIL_HISTORICAL_FORMAT",
      "detail": "historical format 6 is unsupported and never migrated"
    }
  ],
  "digest": "991f48cc5bb0569c8307e5244f2a90284bc354ccc599cb80fbb20eba82262f0d"
}
```

## 原始输出（Markdown 摘要）

```markdown
# LOOP Run Store v2 Cutover Preflight

- scanned roots: /tmp/wp6-fixture/v7, /tmp/wp6-fixture/v6
- candidates: 2
- failures: 1
- governance stop (v5 journal): no
```

## 边界声明

本次执行针对构造夹具验证程序本身的判定行为；生产环境中不存在真实历史 journal
（WP3.5-B 阶段的 preflight 已确认），因此本记录不构成对任何真实数据的扫描结论。
后续任何一次怀疑存在 v1～v6 历史 journal 时，必须重新执行本程序并以其
`STOP_AND_RE_RULE` 为唯一下一步。
