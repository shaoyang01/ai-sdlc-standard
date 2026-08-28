# C03-E E2-P 执行记录：Provider Reachability Preflight

> 记录性质：规划 v0.4.0 §6 E2-P / Decision-069 授权范围内「三 Agent direct CLI
> 最小可达性探针」的持久化证据。证据类型 `PROVIDER_REACHABILITY_ONLY`。
> 程序：`scripts/e2p-provider-reachability.sh`（隔离临时 fixture；每 provider 一次
> 最小无业务语义模型请求；原始 stdout/stderr 仅留临时目录并于退出时删除，报告只
> 输出字节数/digest/匹配数/成本元数据）。
> 执行日期：2026-08-28（UTC 06:36:16Z）
> 产品仓基线 HEAD：`75b2719`（Decision-069 授权落库后）
> 命令：`bash scripts/e2p-provider-reachability.sh`
> 统一探针 prompt：`Reply with exactly: E2P-PING-OK and nothing else.`
> 夹具：`mktemp -d /tmp/e2p-preflight.XXXXXX`（本次 `/tmp/e2p-preflight.VTBBZw`，
> 执行后已删除；四仓 `git status` 零改动）。

## 结论

| Provider | resolved executable | version | exit | 耗时 | stdout | stderr | 固定 token 截取 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kimi | `~/.kimi-code/bin/kimi` | 0.38.0 | 0 | 23s | 17 B | 171 B | ✓ 1 | **PASS** |
| Codex | `…/@openai/codex/bin/codex.js` | codex-cli 0.150.1 | 0 | 25s | 633 B（JSONL） | 39 B | ✓ 1（`-o` 最终消息） | **PASS** |
| Hermes | `~/.local/bin/hermes` | 0.20.5（2026.8.19） | 0 | 13s | 12 B | 0 B | ✓ 1 | **PASS** |

**Provider Feasibility Gate = PASS**：三家 CLI 均在有界时间内 exit 0、stdin 接空下
无交互挂起、当前凭据可用（无 login/鉴权失败）、输出可被确定性截取出固定 token、
digest 可记录。stdout 摘要 sha256（前 16 位）：Kimi `938767f97054eb4a`、
Codex `bf3a3afe90da67d0`、Hermes `c1021637bc782d82`。

## 非交互调用形态（argv profile）

| Provider | one-shot 命令 | 结构化输出 | 隔离/沙箱 |
| --- | --- | --- | --- |
| Kimi | `kimi -p "<prompt>"` | `--output-format stream-json`（本次用 text 以确定性截取） | fixture cwd |
| Codex | `codex exec "<prompt>"` | `--json`（JSONL） | `-s read-only --skip-git-repo-check -o <final>` |
| Hermes | `hermes -z "<prompt>"`（仅最终文本） | `--usage-file` 出成本/token JSON | `--usage-file`，fixture cwd |

## 成本/用量元数据（Hermes usage report）

```json
{
  "estimated_cost_usd": 0.00215278,
  "input_tokens": 15313,
  "output_tokens": 32,
  "reasoning_tokens": 24,
  "total_tokens": 15345,
  "api_calls": 1,
  "model": "deepseek-v4-flash",
  "provider": "deepseek",
  "completed": true,
  "failed": false
}
```

Hermes 当前默认推理后端为 `deepseek-v4-flash`（provider=deepseek）；三家合计为一次
普通对话量级的最小成本。Kimi/Codex 无等价 usage 文件，同为一次最小请求。

## 边界声明

1. 本记录只证明 provider **reachability**（可执行、非交互、凭据可用、I/O 可确定
   截取），**不**证明 production adapter、canonical envelope、生产 Gateway、节点
   输出合同、attempt promotion、Re-Gate、journal recovery、workspace 写入或 role
   firewall——这些归 E1～E4 实现与 E5 验收（INV-E13：fake runner / direct CLI
   preflight / real adapter canary / full autonomous run 四类证据不得互相替代）。
2. CLI 版本、登录态与默认模型会随时间漂移，使本事实 stale；E5 仍须通过 production
   gateway/adapter 重新证明。
3. 三 provider 全 PASS 仅打开 E1～E4 **授权判断**门，不自动授权 E1～E4/E5/下一 C05。
