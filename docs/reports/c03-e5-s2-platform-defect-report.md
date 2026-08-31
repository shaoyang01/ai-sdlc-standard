# WorkBuddy 平台缺陷上报稿 —— fs 文件中介链（G-STORE-1/2 + kimi 启动段受害）合并案

- **波次**：E5-S2（挂起项②，平台缺陷上报，2026-08-31 起草）
- **起草依据**：`docs/reports/c03-e5-task-set-and-acceptance-audit.md` §3 G-STORE-1/2（行 45-46）+ §5-⑥ 执行注记（行 170-178，E5-S1 真实复跑取证）
- **性质**：**上报稿本体**。对外发送动作须 Current User 单独授权；本稿未获授权不发送。
- **事实核验**：本稿全部事实与台账 §3、§5-⑥ 逐条一致（台账为实施事实唯一权威）。

---

## 一、一句话摘要

WorkBuddy 运行环境在**文件系统写入路径上存在两个相关的平台级缺陷**，共同导致产品代码在无沙箱/无 fs-broker 干扰时本应通过的**并发文件写测试稳定失败**（G-STORE-1/2），并使**原生 Mach-O 的 kimi CLI 在启动段因文件写被拒而在发出任何请求前即失败**（E5-S1 签名 A）。两者同根：**fs 文件中介（shim/broker/沙箱）不豁免文件类型或进程形态，并在并发/启动段写入时吞掉底层 errno**。

## 二、缺陷描述（分案）

### 案 1：并发 link 的 EEXIST 竞态被 broker 包装为 `CODEBUDDY_BROKER_DENY`，errno 丢失

- **现象**：`loop-artifact-store`（`loop-artifact-store.test.ts`，node@24 下稳定复现）与 `loop-delivery-checkpoint-store` 的并发 put / 双 worker CAS 段失败。stash 对照证实 W3 改动前基线同挂，为**既有并发缺陷**，非本波回归；node@22 时代未暴露。
- **根因**：WorkBuddy 会话向所有 node 进程注入 `NODE_OPTIONS=--require node-language-shim`（fs 走中央 broker）。并发 `link` 的 `EEXIST` 竞态被 broker 包装为 `CODEBUDDY_BROKER_DENY`（**errno 丢失**，msg 内含 `EEXIST`、code 非 `EEXIST`）→ 产品 store `:362` 按设计 fail-closed。
- **实证**：
  1. 并发 link 探针 3/3 轮 loser 均得 `CODEBUDDY_BROKER_DENY`（msg 含 EEXIST、code 非 EEXIST）。
  2. `env -u NODE_OPTIONS` 下：`loop-artifact-store` **266 passed / 0 failed**（多轮稳定）；`loop-delivery-checkpoint-store` **268 passed / 0 failed**（多轮稳定）。
  3. store 数据不变式（单 blob / temp 清理 / idempotent）全程正确。
- **产品仓判定**：**非本仓缺陷**，本仓零代码改动。回归须以 `env -u NODE_OPTIONS` 运行。

### 案 2：kimi（原生 Mach-O，不豁免）启动段文件写被拒，发出请求前即失败

- **现象**：E5-S1 零成本档将开放项拆分为双签名；签名 A = canary 瞬时快速失败（exit 1 / 0.7–1.2s / **未发请求** / 输入规模无关）。真实复跑取证（串行 10 次 canary）沙箱内 **10/10 FAIL**，全部 `EXECUTOR_EXCEPTION` / exit 1 / ~861–1200ms。
- **根因**：WorkBuddy 沙箱/fs-broker 对 kimi **启动段文件写**的中介。原生 Mach-O **不豁免** seatbelt/broker 的路径级文件中介：workspace 注册（`~/.kimi-code/workspaces.json` tmp+unlink）被拒 + `query-store` link 镜像 EEXIST 竞态 → kimi 在发请求前 exit 1。
- **实证**（对照）：
  1. **判别变量**：canary cwd = 每次新建的 fixture 目录（每次触发 kimi workspace 注册写）；直探 cwd = 已信任目录（无注册写）。同沙箱直探 **30/30 PASS**（exit 0 / 8–33s）。
  2. **直接物证**：① 沙箱拦截日志点名 `~/.kimi-code/workspaces.json` 与 `workspaces.json.tmp.*` 的 unlink 被拒（file-write-unlink）、`~/.ssh` metadata 读取被拒；② kimi 自身日志记录 `EEXIST: file already exists, link '.../query-store/cluster.meta.json.tmp-98284' -> '.../cluster.meta.json'` 连续失败 95/96 次——**与案 1 同族签名**。
  3. **无沙箱对照**：同一 canary 启动段通过（零快速失败），kimi 真实执行至 137s 被 binding 120s 墙钟终止 → `EXECUTOR_TIMEOUT`——反证沙箱中介是启动段快速失败的环境条件。
- **表现梯度**：家里机 08-30 的 2/5 间歇性 vs 本机 10/10 确定性，属同根因族的表现梯度（取决于沙箱策略与竞态窗口）。家里机日志可作最终确证，不阻塞本判定。

## 三、同根归纳

两案共同指向一个平台层机制：**fs 文件中介在特定写路径上既吞 errno（并发 link EEXIST → `CODEBUDDY_BROKER_DENY`）又对原生进程启动段写做路径级拦截（workspaces.json unlink 被拒）**。无论目标是 JS 进程（shim 注入）还是原生 Mach-O（seatbelt/broker 路径中介），均不豁免。表现为并发稳定性与真实 CLI 启动可用性两类缺陷，建议作为同一平台能力缺陷统一评估。

## 四、最小复现步骤

### 案 1（并发 link errno 丢失）

1. 在 WorkBuddy 会话内、默认沙箱/注入环境下运行产品测试：`env`（不带 `-u NODE_OPTIONS`）跑 `loop-artifact-store` 并发 put 用例。
2. 观察失败：loser 得到 `CODEBUDDY_BROKER_DENY`（code 非 `EEXIST`、msg 含 EEXIST）。
3. 对照：`env -u NODE_OPTIONS` 重跑同一用例 → 通过。

### 案 2（kimi 启动段写被拒）

1. 在 WorkBuddy 会话默认沙箱内，用 canary 框架（cwd = 每次新建的 fixture 目录）串行调用 `kimi -p`。
2. 观察：快速失败 exit 1 / ~861ms，未发请求；kimi 日志出现 `EEXIST link cluster.meta.json.tmp -> cluster.meta.json` 连败。
3. 对照：同沙箱 cwd = 已信任目录直探 → 通过；无沙箱对照同 canary → 启动段通过（直至被 binding 墙钟终止）。

## 五、期望平台修复方向（供参考，非本仓承诺）

- **errno 保真**：broker 对底层 `EEXIST` 等 errno 的包装不再吞 code（至少保留原 errno 于错误对象，供 fail-closed 判定与诊断）。
- **原生进程豁免或白名单**：对原生 Mach-O / 非 JS 进程的启动段必要写（workspace 注册、metadata 读）提供白名单/豁免路径，避免在发出请求前即被路径级中介拦截。
- **沙箱一致性**：若能对并发写采用与真实文件系统一致的原子/覆盖语义，则 JS 并发测试与真实 CLI 启动段均不再误报。

## 六、边界声明

- 本稿仅整理证据，**未发送**；发送须 Current User 单独授权。
- 产品仓零代码改动；本波（E5-S2）零产品代码改动。
- 修复归属 = 平台（运行环境）能力，非产品代码缺陷。
