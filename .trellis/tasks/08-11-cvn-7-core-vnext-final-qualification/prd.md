# CVN-7 Core VNext Final Qualification PRD

## 1. 任务定位

- 任务：`CVN-7 Core VNext Final Qualification`。
- 父任务：`07-29-core-vnext-product-ready-extensible-kernel-completion`。
- 规划基线：`38afdc3fd508dc67f7aa446fd323837a5d550b70`。
- 分支：`codex/cvn-7-core-vnext-final-qualification`。
- 工作树：`.worktrees/cvn-7-core-vnext-final-qualification`。
- 状态：`planning`。
- `task.py start`：未执行。
- 生产实现授权：`false`。
- 性质：对已经验收归档的 Core VNext 机制做最终兼容、确定性、可靠性、资源、性能和规模资格认证；本任务不增加产品行为。

## 2. 前置状态

CVN-7 只从全部已接受并归档的 Core VNext 子门构建证据：

| Gate | 已接受源/关键源 | 归档状态 |
|---|---|---|
| CVN-0 | `c7ffd49` | accepted/archived |
| CVN-1 | `1016d05`（最终脊柱源） | accepted/archived |
| CVN-2 | `e203136` | archive `42110c4` |
| CVN-3 | `d9500f5` | accepted/archived |
| CVN-4 | `b0272e2` | archive `13039d0` |
| CVN-5 | `f329ec1` | acceptance `b2ad0bc`，archive `198c71a` |
| CVN-6 | `8da50f9` | acceptance `160674d`，archive `a0c1d6a` |
| Extensibility Reservation | `7c4e852` | archive `a4d8cee` |
| GD-0 | `451627e` | archive `4580164` |

任何前置任务再次出现已确认的行为缺陷时，CVN-7 记录失败归属并返回独立窄修任务；CVN-7 本身不吸收生产修复。

## 3. 合同所有权

### 3.1 Primary owners

CVN-7 精确拥有以下九个 qualification 合同：

- `CVN-FC-130`
- `CVN-FC-131`
- `CVN-FC-132`
- `CVN-FC-133`
- `CVN-FC-134`
- `CVN-FC-140`
- `CVN-FC-141`
- `CVN-FC-142`
- `CVN-FC-143`

`CVN-FC-135..139` 在当前权威矩阵中未分配，CVN-7 不创建隐含合同，也不把该空号段解释为新功能。

### 3.2 Consumer contracts

CVN-7 消费并验证矩阵中全部 44 个实际存在的 `CVN-FC` 行：

`001/002/010/011/020/021/030/031/040/041/050..053/060..063/070/080..082/090..093/100..102/110..112/120..122/130..134/140..143`。

消费资格只增加跨阶段证据，不获得重写命令、ABI、failure、limit、fixture 或预算的权限。

## 4. 需求

### CVN7-R001 — Qualification-only 边界

- 默认生产源码差异为零：`src/**` 相对规划基线保持完全一致。
- 资格任务可增加测试 fixture、qualification runner、证据、Trellis 文档和精确 npm script。
- 新增 npm script 只调用现有本地 Node/TypeScript 工具链；`dependencies`、`devDependencies`、锁文件内容保持一致。
- 任一生产缺陷由其 primary owner 的独立 repair task 修复、复审和归档；CVN-7 在新统一基线上重新开始受影响证据。

### CVN7-R002 — 固定完成面

资格证据必须同时固定：

- Core 总命令目录恰好 `28`：V1 六个 + VNext 二十二个；
- application root runtime exports 恰好 `51`；
- Module SDK runtime/type exports 恰好 `8/34`；
- `CompiledDomainCommandContributionV1` 恰好九字段；
- Core-only factory、Registry、bus、gateway、replay 保持现有结果；
- integrated Registry、bus、gateway、replay 保持同一 private assembly identity；
- state/history/replay/dirty/event 仍由唯一 CVN-1 owner 管理；
- persisted schema 仍为 `brilliant-score-1`，没有新增格式或字段。

### CVN7-R003 — 44 行合同可追踪性

- 创建一份机器可核对的 44 行 trace manifest。
- 每个实际 `CVN-FC` 行至少映射一个决定性 test case ID、测试文件和 primary owner。
- 映射使用精确 test title 或稳定 case ID，不接受通配符、目录级“全覆盖”或仅写文件名。
- trace checker 验证合同 ID 集合与父矩阵完全相等、无重复、无缺失、无多余 ID，并验证对应 case 在指定测试源中恰好存在。
- full suite 与 qualification suite 都成功后，trace manifest 才形成接受证据。

### CVN7-R004 — 完整功能矩阵

资格矩阵必须覆盖：

1. Core-only V1 characterization 与原六命令结果；
2. document factory、Measure、Part、Staff、Voice、Event 的完整 lifecycle；
3. range delete、range transpose 和 atomic batch；
4. Core-only、module-only 与 mixed Core/module batch；
5. submit、no-op、reject、undo、redo、replay、checkpoint、dirty 和 event；
6. exact codec、unknown extension lossless preservation、availability 与 detached migration；
7. two-module validator/classifier order、callback isolation 与 same-assembly identity；
8. public exports、forbidden dependency、failure privacy 和 resource caps；
9. caller alias、getter、Proxy、sparse array、cycle、invalid prototype、extra field、Promise-like 与 callback throw；
10. accepted CVN-5/CVN-6 failure priority和完整 rejection-state equality。

### CVN7-R005 — Representative fixture

固定 generator：

- `generatorVersion: 1`；
- `seed: "cvn7-representative-v1"`；
- ID 由类型前缀和零填充索引纯生成，不使用时钟、随机数、对象 identity 或枚举偶然顺序；
- 200 个 4/4 Measure，无 pickup；
- 8 个 Part，每 Part 1 Staff；
- 每个 Part/Measure 恰好 2 Voice；
- 每 Voice `start=0/1`，恰好 8 个 `1/8` Event；偶数索引是含一 Note 的 Notes Event，奇数索引是 Rest；
- Event 恰好 `25,600`，Note 恰好 `12,800`；
- score-owned schema-1 block 恰好一个；每个 Part 各有一个 part-owned schema-1 block；
- 恰好两个 synthetic official contributions；输入 registration entries 固定为 score module 后 part module，用于证明输入顺序不形成运行时权威；编译后的 catalog 与 callback 执行采用 accepted CVN-2 lexical canonical order，即 part module 后 score module；
- 两个 contribution 均有 validator、classifier、command 和 owned effect；
- cross-module batch 各含一个 effective module command；
- long-history case 恰好保留 `2,000` 个 committed entries，undo/redo depth 无空洞。

Generator 构建后必须对 Measure/Part/Staff/Voice/Event/Note/ExtensionBlock 数量、所有 ID 唯一性、coverage、semantic validation、encode/decode round-trip 和两次生成 deep equality 做硬断言。

### CVN7-R006 — Stress fixture

- `generatorVersion: 1`；
- `seed: "cvn7-stress-v1"`；
- 400 Measure、16 Part、每 Part 1 Staff、每 Part/Measure 2 Voice、每 Voice 8 个交替 Notes/Rest Event；
- Event 恰好 `102,400`，Note 恰好 `51,200`；
- 从同一个 initial document 提交并保留恰好 `10,000` 个 deterministic semantic envelopes；
- workload 以固定 Note 地址顺序循环并在两个有效 WrittenPitch 间交替，确保每个 submit 都是 changed；
- 从同一 initial document replay 同一 envelopes；
- final encoded document、documentVersion、support、availability 和每条 command status sequence deep equal；
- peak RSS `<= 2.0 GiB`；
- 无 process crash、stack overflow、unhandled rejection、state divergence 或 whole-document-per-history-entry 证据；
- latency 只记录趋势，不作为首个 VNext release 的绝对阻断值。

### CVN7-R007 — 固定性能 operation

Representative fixture 上的八项 operation 固定为：

1. **ordinary changed submit**：第一 Note 从初始 C4 改为 D4；
2. **undo ordinary entry**：计时前完成上述一次 submit，计时 `undo()`；
3. **redo ordinary entry**：计时前完成 submit+undo，计时 `redo()`；
4. **immutable cached read**：计时前调用一次 `read()` 形成 snapshot cache，计时第二次 `read()`；
5. **document snapshot creation**：fresh bus 上计时第一次 `read()`；
6. **100-child changed batch**：child 0 为 score-module command，child 99 为 part-module command，child 1..98 为交替 metadata updates；100 个 child 均产生 effective change；
7. **100-command replay**：按 canonical Note order 对前 100 个 Note 各提交一次 C4→D4 的单目标 semantic command，在 fresh integrated runtime 上 replay。
8. **factory/decode/semantic/compatibility construction**：从 detached plain input 开始，依次执行 `createScoreDocument`、strict result check 和使用预编译 authentic catalog/inventory 的 integrated bus construction；catalog compilation 和 fixture generation 位于计时区间外。

第 8 项是父合同表中的 construction 项；因此总共记录八个 budget row，不把 cached read 与 snapshot creation 合并。

### CVN7-R008 — 采样方法

- 每个 build、每个 operation 使用独立 fresh fixture/state。
- baseline 与 candidate 各先运行 5 次未记录 warm-up。
- baseline 与 candidate 各运行 20 次 measured samples。
- 按 1-based pair number，奇数 pair 为 baseline→candidate、偶数 pair 为 candidate→baseline；证据使用 zero-based `pairIndex 0..19`，因此 even index 为 baseline→candidate、odd index 为 candidate→baseline。
- 每个 sample 使用 fresh worker process；worker 只加载一个指定 build root。
- latency worker 使用 `performance.now()`，计时区间仅包含 CVN7-R007 指定 operation。
- 任一 measured duration 非有限数或 `<=0`，整项报告为 invalid evidence。
- median 是排序后第 10/11 项算术平均；P95 是 nearest-rank 第 19 项。
- 报告 20 个 dense pair records；每条保存 pair index、真实 invocation order、baseline/candidate duration。Validator 从 pair records 重建两侧样本、median 和 P95；不接受丢失执行顺序的两组独立 arrays。
- memory run 与 latency run 分离；Node `process.resourceUsage().maxRSS` 在全部支持平台均按 KiB 解释，证据保存原始 KiB 值并固定乘 `1024` 得到归一化 bytes；heap 保存 setup 前、operation 前、operation 后、result encode 后的 `heapUsed`，以四个观测点最大值记为 `observedPeakHeapUsedBytes`。

### CVN7-R009 — Reference environment 与预算

绝对预算只在以下 exact environment 生效：

```text
Node: v24.15.0
Platform: win32 x64
OS kernel visible to process: NT 10.0.26200.0
CPU: 13th Gen Intel(R) Core(TM) i9-13900HX
Logical CPUs: 32
Physical memory reported by Node: 39.7 GiB
Build: clean production build, no debugger/instrumentation
```

| Operation | Representative P95 |
|---|---:|
| ordinary changed submit | `<=100 ms` |
| undo ordinary entry | `<=100 ms` |
| redo ordinary entry | `<=100 ms` |
| immutable cached read | `<=50 ms` |
| document snapshot creation | `<=50 ms` |
| 100-child changed batch | `<=300 ms` |
| replay 100 changed commands | `<=2,000 ms` |
| factory/decode/semantic/compatibility construction | `<=1,000 ms` |

Representative benchmark process peak RSS 必须 `<=1.0 GiB`。环境字段任一不匹配时，报告 `environment-match: false` 并保留功能、资源和 portable A/B 证据；该次运行不产生 absolute-budget pass 结论。

Operational comparison 固定为 `process.version === "v24.15.0"`、`process.platform === "win32"`、`process.arch === "x64"`、`os.type() === "Windows_NT"`、`os.release() === "10.0.26200"`、全部 CPU model trim 后等于表中字符串、logical CPU 为 32、`Math.round((os.totalmem()/2**30)*10)/10 === 39.7`。Reference worker 的 `process.execArgv` 精确为 `["--expose-gc"]` 且 `NODE_OPTIONS` 为空；表中 `NT 10.0.26200.0` 是上述 type/release 的固定报告标签。

### CVN7-R010 — Portable A/B gate

- accepted baseline 固定为规划起点 `38afdc3fd508dc67f7aa446fd323837a5d550b70`。
- candidate 是未来 qualification evidence commit；生产源码必须与 baseline 相同，或明确指向经过独立 repair/accept/archive 后重新批准的新 baseline。
- baseline 和 candidate 各在独立 clean worktree/build root 构建。
- Node executable、package lock hash、环境和 harness commit 相同。
- 对 CVN7-R007 每项，candidate/baseline median ratio 与 P95 ratio 均 `<=1.20`。
- ratio 使用未四舍五入的数值计算；报告展示至少三位小数。
- functional、determinism 和 resource-cap gate 在所有环境始终阻断；绝对时间只在 exact reference environment 阻断。

### CVN7-R011 — Reproducible build

- baseline 与 candidate 分别执行两次 clean build。
- 对排序后的 `dist/src/**/*.js` 与声明输出（如存在）按相对路径+文件 bytes 计算 SHA-256 manifest。
- 同一 commit 两次 manifest 必须完全相等。
- candidate 的 `src/**` 与 baseline 相等时，两者 production build manifest 必须完全相等。
- `dist/test/**`、日志、计时结果和工作树绝对路径不进入 production build hash。

### CVN7-R012 — Evidence schema

未来证据目录固定为任务内 `evidence/`，至少产生：

- `environment.json`
- `build-manifest-baseline.json`
- `build-manifest-candidate.json`
- `contract-trace.json`
- `functional-matrix.json`
- `representative-fixture.json`
- `portable-ab.json`
- `reference-windows.json`
- `stress.json`
- `qualification-summary.md`
- `independent-technical-review.md`

每份 JSON 具有 `schemaVersion: 1`、任务 ID、baseline/candidate/harness commit、UTC timestamp、normalized relative artifact paths 和 deterministic result fields。tracked evidence 不保存绝对工作树路径、raw stack、环境变量或源码内容。

只有实际构造 representative/stress fixture 的 functional、benchmark、memory 与 stress JSON 携带 `{ generatorVersion: 1, fixtureKind, seed }`；environment、build manifest、contract trace 和 summary 不伪造 fixture seed。Official evidence 由 clean frozen candidate/harness 上的一次 `--mode all` 生成：中间结果位于 worktree 外的临时目录，完整 validator 通过后一次原子发布到 `evidence/`，随后单独提交 measurement commit，且不再启动 worker。固定 process-liveness timeout 只把整次证据标记为 `EVIDENCE_INVALID`，不构成 latency/stress 性能预算。

### CVN7-R013 — 失败分类与路由

| 失败所属合同 | 唯一修复 owner |
|---|---|
| `001/002/041` | Core VNext parent contract repair |
| `010` | CVN-0 bounded repair |
| `011/040` | CVN-1 bounded repair |
| `020/021/030/031/050..053` | CVN-3 bounded repair |
| `060..063/070` | CVN-4 bounded repair |
| `080..102` | CVN-5 bounded repair |
| `110/111` | CVN-2 bounded repair |
| `112/120..122` | CVN-6 bounded repair |
| `130..134/140..143` 的 harness/evidence defect | CVN-7 qualification repair |

`140..143` 是 CVN-7 拥有的 consumer qualification rows，不成为第二个生产行为 owner：如果 consumer case 暴露行为缺陷，必须先归类到上表唯一的 underlying FC row，再交给该 row owner；只有 trace、matrix assembly、runner 或 evidence defect 留在 CVN-7。跨 owner finding 按最早决定性失败拆分，不在一个生产修复提交中混合。任何生产 repair 都使旧 candidate 性能和功能 evidence 失效；CVN-7 更新 baseline、重建两侧 build 并重跑全部阻断门。

### CVN7-R014 — Product-quality authority closure

- CVN-7 实施阶段创建 `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-010-product-quality.md`，结束已记录的 missing-spec gap。
- 该文档只把已经批准的 Core qualification fixture、方法、预算、环境匹配规则、evidence schema 与 failure routing 同步到产品质量体系。
- UI、open/save/playback/export、安装、crash recovery 和产品发布预算继续由 post-Core `product-release-qualification-v1` 拥有；SPEC-010 对这些项写明 future owner，不捏造未测数字。
- 若独立规划复审批准另一权威路径，必须在 parent `documentation-sync-matrix.md` 中记录唯一替代路径并删除旧占位；两条并行 authority 被排除。

### CVN7-R015 — Core VNext closure

CVN-7 最终接受后必须：

- 同步 active Core specs 为固定 28-command accepted baseline；
- 父任务 `CVN-AC001..017` 全部有可审计结果；
- 父任务和 CVN-7 各有独立接受与归档记录；
- post-Core 路线只解锁“在用户再次明确批准后创建 Official Guitar Domain V1 规划 child”，归档不自动创建 child，也不自动启动实现；
- Core VNext 停止吸收 Guitar Domain、Persistence、Layout、Renderer、Playback、Export、Workbench、Application Assembly 和 public Extension Host 工作。

### CVN7-R016 — 用户收益

完成后，内核获得一份可复现的商业级完成证明：大型谱面、长历史、跨模块批事务、回放、迁移、兼容降级和异常输入在固定边界内保持确定性；性能结论具有明确机器、样本和对照基线。后续官方 Guitar 插件和产品宿主可以依赖一个冻结、可测量、可回归的微内核，而不是继续猜测 Core 是否“已经完成”。

## 5. Scope exclusions

CVN-7 排除：

- 新 Core command、selector、effect、capability、failure code、runtime export 或 SDK field；
- 修改 `src/**` 生产行为；
- Guitar Domain schema/command/technique；
- Persistence、Layout、Renderer、Playback、Export；
- Desktop Shell、Workbench、Editor Session、Product `Application Assembly`；
- public visual/functional plugin platform；
- dynamic discover/install/unload/replace/hot reload；
- 新 persisted format、物理 `.bgp`、autosave、crash recovery；
- UI、文件打开/保存、播放、渲染、导出和安装的产品级性能预算；
- 通过放宽预算、减少 fixture、降低样本数或更换环境字段来消除失败。

## 6. Acceptance criteria

- [x] `CVN7-AC001`：历史规划门已在独立规划复审 P0/P1/P2=`0/0/0` 后关闭；当前实施期任务为 `in_progress`，`task_start_run=true`、`production_implementation_authorized=true`，`qualification_measurement_run=false`，正式测量仍受冻结 harness commit 门禁约束。
- [ ] `CVN7-AC002`：规划基线包含 CVN-0 through CVN-6、Extensibility Reservation 和 GD-0 的 accepted/archive ancestry；CVN-5 archive `198c71a` 存在。
- [ ] `CVN7-AC003`：primary owner 精确为九个已存在的 `130..134/140..143` 行；`135..139` 明确未分配。
- [ ] `CVN7-AC004`：未来实现默认 `src/**` 零差异；发现生产缺陷时使用 owner-specific repair task。
- [ ] `CVN7-AC005`：44 行 trace manifest 对父矩阵 exact set 相等，case ID 无重复且全部可执行。
- [ ] `CVN7-AC006`：root `51`、SDK `8/34`、ABI `9`、Core commands `28` 与 `brilliant-score-1` 精确。
- [ ] `CVN7-AC007`：Core-only、结构、range/batch、module、migration、availability、hostile/resource/privacy 矩阵全部通过。
- [ ] `CVN7-AC008`：representative fixture 精确 `25,600 Event/12,800 Note/2 contribution/2,000 history`。
- [ ] `CVN7-AC009`：八项 representative P95 在 exact reference environment 达标，peak RSS `<=1.0 GiB`。
- [ ] `CVN7-AC010`：portable A/B 每项 median 与 P95 ratio 均 `<=1.20`。
- [ ] `CVN7-AC011`：stress fixture 精确 `102,400 Event/51,200 Note/10,000 envelopes`，确定性 equality 与 peak RSS `<=2.0 GiB`。
- [ ] `CVN7-AC012`：baseline/candidate clean build 可复现，production build hash 符合 R011。
- [ ] `CVN7-AC013`：`SPEC-010-product-quality.md` 或唯一经批准替代 authority 已落地，Core 与产品预算边界无重叠。
- [ ] `CVN7-AC014`：typecheck、build、qualification suite、full suite、Trellis、JSON/JSONL、diff、allowlist 和 protected-path gates 全绿。
- [ ] `CVN7-AC015`：独立技术复审 P0/P1/P2=`0/0/0`，用户单独批准接受与归档。
- [ ] `CVN7-AC016`：CVN-7 接受归档后才把 post-Core 第一个动作切换为创建 Official Guitar Domain V1 规划 child。
