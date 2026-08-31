# spruce_logistics_gateway 只读代码审查报告

- **仓库**：`/Users/eric_shaoooo/meicai/projects/spruce_logistics_gateway`
- **分支**：`feature/dev_20260831_loop_test`（HEAD=cc06c605，基于 master，工作区净，审查未做任何改动）
- **规模**：Java 21 / Spring Boot 3.3.2 / WebFlux，两模块（utils + webflux），221 个 Java 文件；核心面 = 7 个 WebFilter 链 + 13 controller + 12 service + 43 个调度任务（37 个为同一模式拷贝）+ MyBatis/Dubbo/Redis(sentinel)
- **审查方式**：三路只读探查 + P0 级结论逐条人工复核（报告内标注复核状态）

## 总体印象

链路设计清晰（CORS→登录→路由检查→签名→限流→access 六级 @Order 串联）、错误响应统一不泄堆栈、Dubbo RETRIES=0 超时走 DB 配置、全仓无 `.block()` 无手动 new Thread，基础不差。**短板集中在三处：安全层可被实际利用的漏洞、失败语义（任务失败无上限重试/无告警）、测试真空（43 个 job 零覆盖，唯一测试类还是连 stage 环境的集成脚本）。**

---

## P0 — 正确性/安全风险（4 条，均已人工复核 ✅）

| # | 位置 | 问题 | 改法 |
|---|------|------|------|
| P0-1 | `business-gateway-webflux/src/main/resources/application.properties:152` | MySQL 明文账密（`meicai_rw` / 真实密码）硬编码提交进仓库 | 迁配置中心/环境变量注入；**该密码应视为已泄露，建议轮换** |
| P0-2 | `filter/GatewayLoginFilter.java:68`、`GatewayAccessFilter.java:74`、`GatewaySignatureFilter.java:109`、`GatewayRateLimitFilter.java:64`、`GatewayRouteCheckFilter.java:77`、`GatewayCorsFilter.java:74` | 静态资源放行用 `getURI().toString().endsWith(".js"/".css"…)`，URI 含 query string——构造 `/api/xxx?x=.js` 可同时绕过登录/签名/限流/access 校验且路由转发不受影响 | 改用 `request.getPath().value()` 并仅放行真实静态资源前缀 |
| P0-3 | `filter/GatewaySignatureFilter.java:389-395` | 客户端可通过 `SALT` header 自带盐值**覆盖服务端盐列表**，盐与算法均公开 → 任何人可对任意 body 伪造合法签名 | 删除 inputSalt 覆盖逻辑，仅用服务端配置盐 |
| P0-4 | `service/impl/GatewayConfigServiceImpl.java:68(save)/140(remove)/251(updateConfig)` | 对 `gateway_configs` 与 `gateway_request` 两表多步写/删**无 @Transactional**，第二步失败留脏数据；同文件 `uploadConfig:342` 却有事务（标准不一致） | 三个方法补 @Transactional（另需确认事务管理器与多数据源配置匹配） |

## P1 — 明确收益（安全加固 + 正确性）

**安全：**
1. `config/webclient/GatewayWebClientConfig.java:64` — WebClient `InsecureTrustManagerFactory` 信任所有证书，出网 HTTPS 可被中间人；
2. `business-gateway-utils/…/utils/GatewayHttpClientUtils.java:100-106` — `TrustStrategy` 恒 true，同上；
3. `application.properties:264-266` + `GatewayCorsFilter.java:126-132` — `allowOrigin=*` 与 `allowCredentials=true` 同开且无 Origin 校验，改白名单动态回显；
4. `business-gateway-utils/…/utils/GatewaySecurityUtil.java:39-53` — **100 个签名盐硬编码进源码**，迁 ACM（项目已有 `GatewayAcmConfigHelper` 通道）；
5. `GatewaySignatureFilter.java:204` — 全量请求 body（含 gzip 解压明文）INFO 级落日志，脱敏/降 debug 限长；
6. `GatewaySignatureFilter.java:376` — 仅 POST/PUT 比对签名，GET/DELETE 只解析不比对；
7. `application.properties:261` + `GatewayLoginFilter.java:81` — BACKDOOR 运行时开关打开后 `api_adapt,server_adapt,pressure,mcq` 全免鉴权，范围过大。

**正确性/可靠性：**
8. `GatewayConfigCacheServiceImpl.java:161` — `tempConfigExclusionMap.get(configId)` 可能 null 直接解引用 NPE（对照 :143 request 分支有 containsKey 判断），补判空；
9. `GatewayConfigCacheServiceImpl.java:56,171` — 缓存 map 被 cron 整体替换但字段非 volatile，转发线程可能长期读旧引用，加 volatile；
10. `GatewayDictServiceImpl.java:116` — dictList 可为空仍调 batchInsert，`GatewayDictMapper.xml:274` 空 foreach 生成非法 SQL 报错；
11. `manager/impl/GatewayPeriodicTaskManagerImpl.java:190-197` — 任务失败仅 reset 为 Init，**无重试上限/无退避/无告警**，坏数据无限循环；加 retry_count 超限置终态 + 告警；
12. `GatewayPeriodicTaskManagerImpl.java:185-200` — cleanTaskLogs do-while 无总上限，清理条件失效即死循环占死调度线程；
13. `schedule/AbstractGatewayPeriodicTaskProcess.java:46-55` — executor 懒初始化无同步（竞态泄漏线程池），队列 `LinkedBlockingQueue` 无界；
14. `business-gateway-utils/…/utils/GatewayMD5Util.java:32-33,60-61` — 异常分支 `System.exit(-1)` 会杀掉整个网关进程，改抛异常。

**性能：**
15. `utils/GatewayDubboInvokeUtils.java:260-261` — 每次 Dubbo 调用把 ReferenceConfig/GenericService 整个 JSON 打 INFO 日志，高频路径损耗，删/降 debug。

## P2 — 顺手项（摘要）

- `GatewayLocalCacheServiceImpl.java:84-108 vs 155-179` 约 50 行完全重复；map 先清空后落库，batchInsert 失败仅打日志 → 异常计数永久丢失；
- `GatewayInvokeServiceImpl.java:147-400` `invokeTest` 为硬编码 stage URL/token 的死代码，且 :253 `doOnSuccess` 内遗留 `throw new NullPointerException()` 调试代码——**未发现 controller 暴露面，整段删除**（已复核）；
- `schedule/GatewayFailedWorkerPeriodTask.java:106-111` catch 后不上抛，外层 resetTask 拿到 null 把失败当成功记录；
- `AbstractGatewayPeriodicTaskProcess.java:99` `latch.await()` 无超时，单任务卡死阻塞整轮；:58 批量锁被注释，多实例重复拉取（有 CAS 兜底，浪费但不重复执行）；
- 37 个 `GatewayMcqToDubboTask_0…35` 与基类逐字节相同（已 diff 验证）——修一个 bug 要改 37 处，改抽象基类/配置驱动；
- `application.properties:177` `spring. codec.max-in-memory-size` 键名含空格，配置实际不生效；
- redis 池 `maxWaitMillis=30000`，token 校验场景故障时请求堆积，建议 1-3s；
- `GatewayDubboSyncInvoker.java:36` logger 用了 `GatewayDubboAsyncInvoker.class`（复制粘贴笔误）；
- `GatewayConfigServiceImpl.java:515-630` constructConfig/constructExclusion 两段 ~55 行同构可抽公共方法；
- `DefaultCleanPeriodicTaskLogTask.java:30-33` 吞 Throwable 恒返回 0，调度中心无法感知失败。

## 测试覆盖（单列，因为最痛）

`src/test` **仅 1 个文件** `manager/GatewayManagerTest.java`（JUnit4 @SpringBootTest），连 stage 真实环境（Redis/MQ/HTTP），甚至读 `/Users/eric/Desktop` 本地文件——CI 不可运行。**43 个 job、7 个 filter、全部 service 零可运行测试**。修复轮建议随每个 P0/P1 修复补最小单测（离线可跑），而非事后补覆盖率。

## 建议修复分组（供圈选）

- **A 组（安全止血）**：P0-1/2/3 + P1 安全 4 条（信任证书×2、CORS、盐入库）——外部可利用面一次收掉；
- **B 组（正确性）**：P0-4 事务 + P1 #8/9/10（NPE/volatile/空 foreach）+ 任务失败语义 #11/12/13 + System.exit #14；
- **C 组（结构减负）**：37 份拷贝收敛、死代码删除、重复代码合并、日志治理；
- **D 组（测试地基）**：随 A/B 修复逐条补离线单测 + 1 个 filter 链集成测试样板。

> 修复轮须在 `feature/dev_20260831_loop_test` 上按 7 门流程立项后进行；本报告仅为只读结论，仓库未做任何改动。
