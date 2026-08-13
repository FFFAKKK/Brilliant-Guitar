# CVN-7 Core VNext Final Qualification Implementation Plan

## 1. Current gate

```text
PLANNING ONLY
qualification base: 38afdc3fd508dc67f7aa446fd323837a5d550b70
CVN-0 through CVN-6: accepted and archived
task.py start: false
production implementation authorization: false
independent planning review: passed 2026-08-13, P0/P1/P2=0/0/0 after two bounded planning repairs
```

本文件描述未来操作者顺序。规划提交不执行以下 implementation stages，不产生 benchmark 结论，也不创建 post-Core child。

## 2. Commit discipline

未来 implementation 使用独立、可回滚提交：

1. qualification contracts and trace manifest；
2. deterministic fixtures and synthetic modules；
3. functional qualification tests；
4. worker/runner/evidence validator；
5. benchmark and stress evidence；
6. product-quality and active-spec synchronization；
7. review repair（仅有 finding 时）；
8. acceptance、archive 和 session record 分离。

任何 `src/**` 修复位于单独 owner repair task，不进入上述提交序列。

## 3. Stage 0 — Activate and freeze qualification base

### Entry

- independent planning review P0/P1/P2=`0/0/0`；
- 用户单独批准 CVN-7 qualification implementation；
- 当前工作树 clean；
- `38afdc3` 仍是 CVN-5 archive closure ancestor；
- CVN-0 through CVN-6 archived task JSON 全部为 `completed`。

### Actions

1. 将 planning acceptance 记录到 CVN-7 task 和父任务；
2. 执行 `task.py start 08-11-cvn-7-core-vnext-final-qualification`；
3. 记录 activation commit；
4. 创建 detached baseline worktree：

```powershell
git worktree add --detach `
  E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-accepted-baseline `
  38afdc3fd508dc67f7aa446fd323837a5d550b70
```

5. 验证 baseline 和 candidate `package-lock.json` SHA-256 相等；
6. 两侧删除各自 `dist/` 后执行 clean build；
7. 保存 baseline/candidate commit、source tree hash 与 package-lock hash。

### Exit

- task `in_progress`，授权元数据完整；
- baseline worktree detached/clean；
- candidate clean；
- 两侧现有 typecheck/build/full suite pass；
- `src/**` 相对 `38afdc3` 差异为空。

### Rollback

仅移除 detached baseline worktree 和 activation metadata commit；不移动归档前置任务。

## 4. Stage 1 — Contract trace and qualification data contracts

### Files

- `test/core-kernel/qualification/cvn-7-qualification-contracts.ts`
- `test/core-kernel/qualification/cvn-7-contract-trace.ts`
- `test/core-kernel/cvn-7-contract-trace.test.ts`

### Actions

1. 从 parent matrix 读取实际 44 个 heading；
2. 固定 primary owner、consumer owner、test file、exact case ID；
3. 断言实际 ID set exact，`135..139` 不出现；
4. 断言每个 case ID 在指定 test source 中恰好出现一次；
5. 定义 evidence header、fixture、benchmark、stress 和 summary 数据类型；
6. 所有 qualification 类型保持 test-only，不从 application root 或 Module SDK 导出。

### Tests

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/cvn-7-contract-trace.test.js
```

### Exit

- 44/44 FC rows；
- 0 duplicate、0 missing、0 extra；
- exact case IDs；
- root/SDK export diff zero。

## 5. Stage 2 — Deterministic fixtures and modules

### Files

- `test/core-kernel/fixtures/cvn-7-qualification-score.ts`
- `test/core-kernel/fixtures/cvn-7-qualification-modules.ts`
- `test/core-kernel/cvn-7-fixture-counts.test.ts`

### Actions

1. 实现 representative generator；
2. 实现 stress generator；
3. 实现 two-module catalog/inventory；
4. 对全部 count formula 做 hard assertion；
5. 验证 ID uniqueness、measure coverage、staff refs、voice sequence、semantic validity；
6. 验证 encode/decode round-trip；
7. 验证相同 version/seed 两次生成 deep equal；
8. 验证 unknown block 保真且不进入 callback view；
9. 验证 score/part module identity、callback order、effect order和 owner exact。
10. module fixture 运行时 factory 接收由 worker 选定 build root 的 SDK API；production imports 仅为 type-only。

### Focused cases

- representative counts；
- stress counts；
- deterministic generation；
- generator version/seed mismatch rejection；
- catalog `2` contributions exact；
- inventory parity；
- callback trace part-before-score，与 accepted CVN-2 compiled catalog lexical order 完全一致；输入 registration entries 仍保持 score-before-part 以证明 normalization；
- one score block + N part blocks + one unknown block。

### Exit

Representative 精确 `200/8/3,200/25,600/12,800`；stress 精确 `400/16/12,800/102,400/51,200`；所有 semantic/round-trip gates pass。

## 6. Stage 3 — Functional cross-stage qualification

### Files

- `test/core-kernel/cvn-7-public-baseline.test.ts`
- `test/core-kernel/cvn-7-end-to-end.test.ts`
- `test/core-kernel/cvn-7-representative-history.test.ts`
- `test/core-kernel/cvn-7-qualification-boundary.test.ts`

### Public baseline cases

- Core commands `28` exact ID/version/target/payload allowlist；
- root runtime exports `51` exact；
- SDK runtime/type `8/34` exact；
- contribution ABI nine fields exact；
- Core-only factory/Registry/bus/gateway/replay characterization；
- `brilliant-score-1` exact；
- zero Guitar/product dependency；
- zero production runtime error class delta。

### End-to-end sequence

1. generate representative plain input；
2. `createScoreDocument`；
3. compile authentic two-module catalog；
4. create explicit known-requirement inventory；
5. create integrated Registry/bus/gateway/replay with one assembly；
6. submit mixed 100-child batch；
7. assert one version/history/committed event；
8. read frozen snapshot and availability；
9. undo exact restore；
10. redo exact reapply；
11. replay exact final document/status/event facts；
12. run detached extension migration on one owned block；
13. assert unrelated Core data and blocks deep equal；
14. assert active bus/history/event unchanged by migration。

### Representative history

- submit exactly 2,000 changed entries；
- assert version=2,000, undoDepth=2,000, redoDepth=0；
- mark persisted at fixed version, add one changed entry, assert dirty；
- undo/redo fixed slices and compare exact documents/events；
- keep the final qualification fixture variant with exactly 2,000 retained committed entries。

### Exit

- focused qualification suite pass；
- existing full suite pass；
- no existing test edited；
- `src/**` zero diff。

## 7. Stage 4 — Reproducible builds

### Files

- `test/core-kernel/qualification/cvn-7-evidence-validator.ts`
- task `evidence/build-manifest-*.json`（measurement commit later）

### Actions

For baseline and candidate separately：

1. clean `dist/`；
2. `npm.cmd run typecheck`；
3. `npm.cmd run build`；
4. hash sorted `dist/src/**`；
5. move manifest to temporary evidence；
6. clean and build a second time；
7. recompute manifest；
8. require exact equality；
9. candidate `src/**` equals baseline时，require cross-build exact equality。

Manifest entry exact fields：`relativePath`、`sizeBytes`、`sha256`。Manifest summary：`fileCount`、`treeSha256`。排序使用 ordinal relative path。

### Exit

Baseline repeatability、candidate repeatability 和 expected cross-build equality 都通过。

## 8. Stage 5 — Worker, runner, scripts and evidence validation

### Files

- `test/core-kernel/qualification/cvn-7-worker.ts`
- `test/core-kernel/qualification/cvn-7-runner.ts`
- `test/core-kernel/qualification/cvn-7-evidence-validator.ts`
- `package.json`

### Package scripts

只新增：

```json
{
  "test:cvn7": "npm run build && node --test \"dist/test/core-kernel/cvn-7-*.test.js\"",
  "qualify:cvn7": "node --expose-gc dist/test/core-kernel/qualification/cvn-7-runner.js"
}
```

`package-lock.json` 和 devDependencies 保持 exact。

### Runner CLI

```text
--mode functional|portable|reference|stress|all
--baseline-root <absolute-existing-worktree>
--candidate-root <absolute-existing-worktree>
--evidence-dir <task-local-directory>
--qualification-base <40-hex>
--candidate-commit <40-hex>
--harness-commit <40-hex>
```

`functional|portable|reference|stress` 仅用于 harness 开发期 dry diagnostics，输出只能进入 runner 创建的 worktree-external temporary directory，不能产生 tracked final evidence。Official blocking run 固定为一次 `--mode all`。

Args 缺失、extra、重复、路径不存在、commit 不匹配、worktree dirty 或 build manifest mismatch 都在创建 temporary directory 或启动 worker 前失败。Official preflight 不忽略任何既有 dirty path；运行结束后原子发布的精确 `evidence/**` 集合由 measurement commit 收纳，且之后不再启动 worker。

Worker 用 `createRequire` 加载 request 已登记的 baseline/candidate `dist/src/core-kernel/index.js` 和 `module-sdk/index.js`。Boundary test 扫描 qualification output，拒绝任何静态 candidate Core/SDK runtime import，保证 A/B 真正运行各自 build。

### Hostile evidence tests

- malformed/extra JSON；
- duplicate operation/sample；
- missing sample；
- NaN/Infinity/zero/negative duration；
- wrong P95/median/ratio；
- environment false yet absolute pass true；
- count mismatch；
- failed worker yet qualified true；
- path traversal in relative artifact path；
- raw absolute path/stack/env field in tracked evidence。

### Exit

Runner dry fixture pass；evidence validator mutation suite pass；package lock diff empty；source diff empty。

## 9. Stage 6 — Representative functional and memory gate

### Execution protocol

Stage 6 is the named functional/memory sub-gate inside the single Stage 9 `--mode all` invocation. Before freezing the harness commit, run `npm.cmd run test:cvn7` and `npm.cmd test`; these tests create no tracked evidence. A development-only `--mode functional` run may write only to its externally allocated temporary directory and is discarded after diagnostics. It is never cited as qualification evidence.

### Exit

- functional matrix pass；
- representative exact counts pass；
- 2,000 history pass；
- rejection equality、callback order/caps、migration/unknown preservation pass；
- representative memory evidence structurally valid。

## 10. Stage 7 — Portable A/B qualification

### Preconditions

- Stage 1..6 pass；
- baseline and candidate clean builds ready；
- no debugger/instrumentation；
- runner/harness commit fixed；
- OS power/thermal state recorded as observation，不进入合同判定。

### Execution protocol

Stage 7 is the portable sub-gate of the same Stage 9 official `--mode all` invocation. It consumes the same frozen candidate/harness commits and publishes nothing independently. Development-only `--mode portable` output is temporary diagnostic data and cannot be merged into the official artifact set.

### Exit

八项 operation 各有 baseline/candidate `5+20` runs；每项 median ratio 与 P95 ratio `<=1.20`；raw samples 和重算结果一致。

### Failure

在同一次 `--mode all` 中继续收集剩余 determinism/resource evidence；完整集合最终标记 `NOT_QUALIFIED_PORTABLE_PERFORMANCE` 后才允许原子发布，再定位 owner 并创建独立 repair task。样本删除或重采直到“出现较好结果”的做法被排除；只在确认环境干扰并记录 invalid reason 后整组重跑。

## 11. Stage 8 — Reference Windows qualification

### Environment gate

Runner exact 比较：

- `process.version === "v24.15.0"`；
- `process.platform === "win32"`；
- `process.arch === "x64"`；
- `os.type() === "Windows_NT"` 且 `os.release() === "10.0.26200"`；报告标签固定为 `NT 10.0.26200.0`；
- 全部 CPU model canonical trim 后等于 `13th Gen Intel(R) Core(TM) i9-13900HX`；
- logical CPU `32`；
- `Math.round((os.totalmem()/2**30)*10)/10 === 39.7`，同时保存原始 bytes；
- reference worker `process.execArgv` 精确为 `["--expose-gc"]`，`NODE_OPTIONS` 为空；
- clean build hashes valid。

### Execution protocol

Stage 8 is the reference sub-gate of the same Stage 9 official `--mode all` invocation. Development-only `--mode reference` output is temporary diagnostic data and cannot be promoted or merged.

### Exit

- environment exact match；
- 八项 candidate P95 达到 R009；
- representative peak RSS `<=1.0 GiB`；
- functional/determinism/resource gates仍通过；
- sub-gate result 为 `REFERENCE_GATE_PASSED_PENDING_STRESS` 且 `qualified: false`；此时严禁写出 `QUALIFIED`。

环境不匹配时当前 sub-gate 记录 reference mismatch，继续同一次 `--mode all` 的 stress 子门；完整集合最终为 `REFERENCE_ENVIRONMENT_PENDING` 且 `qualified: false`。后续 exact reference 证据必须从相同 frozen inputs 的 clean 状态重新执行完整 `--mode all`，不得把一次 reference-only diagnostic 拼入旧集合。

## 12. Stage 9 — Stress qualification

### Command

```powershell
npm.cmd run qualify:cvn7 -- --mode all `
  --baseline-root E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-accepted-baseline `
  --candidate-root E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-core-vnext-final-qualification `
  --evidence-dir .trellis\tasks\08-11-cvn-7-core-vnext-final-qualification\evidence `
  --qualification-base 38afdc3fd508dc67f7aa446fd323837a5d550b70 `
  --candidate-commit <CANDIDATE_COMMIT> `
  --harness-commit <HARNESS_COMMIT>
```

这是唯一 official worker invocation。Preflight 在任何 temporary output 前要求两个 worktree clean；中间 functional/portable/reference/stress artifacts 全部位于 `%TEMP%/cvn7-qualification/<HARNESS_COMMIT>/<RUN_ID>/`。只有四个子门都完成并产生结构有效的结果、完整 validator 通过后，coordinator 才一次原子发布 task-local `evidence/`；合法的 `NOT_QUALIFIED_*` 或 `REFERENCE_ENVIRONMENT_PENDING` 仍可作为完整结果发布，worker/shape/timeout 导致的 `EVIDENCE_INVALID` 不发布 partial set。

### Blocking assertions

- exact `102,400 Event/51,200 Note`；
- exactly 10,000 generated envelopes；
- live 10,000 statuses all committed；
- replay 10,000 status sequence exact；
- final encoded document/version/support/availability exact；
- peak RSS `<=2.0 GiB`；
- no crash、stack overflow、unhandled rejection、state divergence；
- history entries prove effect-based storage；no whole-document snapshot field or linear whole-document copy per entry；
- latency field present and marked trend-only。

### Exit

`stress.json` passes evidence validator；overall result 为 `BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW` 且 `qualified: false`。随后立即把完整 published artifact set 提交为一个 path-limited measurement commit；该 commit 不改变 evidence header 中冻结的 candidate/harness input commits，并且本轮不再运行 worker。

## 13. Stage 10 — Product quality and active authority sync

### Files

- `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-010-product-quality.md`
- Core VNext parent PRD/design/implement/matrix/roadmap/task；
- active Core specs；
- CVN-7 evidence summary；
- post-Core roadmap status projection。

### SPEC-010 sections

1. scope and owner；
2. Core qualification vs product qualification boundary；
3. representative/stress fixture；
4. environment and sampling；
5. absolute and portable budgets；
6. build reproducibility；
7. evidence schema；
8. failure routing；
9. later product budgets owner；
10. release blocking checklist。

### Rules

- 只同步已经通过的数字和 evidence hash；
- open/save/playback/render/export/install 等产品数字继续写 `owned by product-release-qualification-v1`；
- active specs 记录 28-command accepted baseline；
- post-Core 只切换为“CVN-7 acceptance/archive 后可创建 Guitar Domain planning child”；
- 该 projection 同时保留“用户明确批准创建第一个 Guitar Domain planning child”，归档本身不自动授权；
- task 仍 `in_progress`，直到独立技术复审和用户接受。

## 14. Stage 11 — Final gates and independent review

### Structural gates

```powershell
python .\.trellis\scripts\task.py validate 08-11-cvn-7-core-vnext-final-qualification
python .\.trellis\scripts\task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python .\.trellis\scripts\task.py validate 06-29-commercial-guitar-tablature-product
python .\.trellis\scripts\task.py validate 08-11-post-core-official-plugin-product-roadmap

npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:cvn7
npm.cmd test

git diff --check
```

Additional gates：

- strict JSON/JSONL duplicate-key parse；
- implement/check path uniqueness and existence；
- parent child reference exactly one；
- current task status/authorization exact；
- source diff zero for qualification branch；
- existing test diff zero；
- package-lock/tsconfig diff zero；
- package.json only two approved scripts；
- 44 FC trace exact；
- all evidence validator pass；
- production build manifests reproducible；
- post-Core production authorization still false。

### Independent reviewer package

- qualification base/candidate/harness commits；
- full diff and allowlist report；
- all evidence files；
- 每项 operation 的 20 条 ordered pair records，以及 validator 从 pairs 重算的 baseline/candidate samples、median、P95 和 ratios；
- environment and build manifests；
- 44-row trace；
- full test transcript；
- owner-routing table；
- SPEC-010 and active-spec sync diff；
- clean status and staged-state proof。

### Exit

Independent technical review P0/P1/P2=`0/0/0`。任何 finding 只走 bounded repair + targeted rereview。只有该 verdict 被逐字记录到 `independent-technical-review.md` 后，deterministic summary finalizer 才可在不启动 worker的前提下重新验证所有 committed evidence/review hashes，并把 final result 写为 `QUALIFIED`；此前所有 summary 必须保持 `BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW` 和 `qualified: false`。Finalizer 变化执行 JSON/JSONL、evidence validator、diff check 和 clean commit verification，不改变任何 measured sample。

## 15. Stage 12 — Acceptance, archive and handoff

仅在用户明确接受后：

1. 记录 CVN-7 accepted evidence commit 和 independent review；
2. 父 `CVN-AC001..017` 全部关闭；
3. 提交 accepted active-spec/product-quality sync；
4. `task.py archive 08-11-cvn-7-core-vnext-final-qualification`；
5. 记录 session journal；
6. 父 Core VNext task 进入独立 final acceptance/archive；
7. Core VNext 父归档完成后，post-Core parent 保持 `planning`；
8. 用户批准后，仅创建 `official-guitar-domain-v1` planning child；
9. 不自动执行该 child 的 `task.py start`；
10. 不推送远端，除非用户另行要求。

## 16. Planning-candidate validation

本轮 docs-only 规划提交执行：

```powershell
git merge-base --is-ancestor 198c71a HEAD
git merge-base --is-ancestor 38afdc3 HEAD

python .\.trellis\scripts\task.py validate 08-11-cvn-7-core-vnext-final-qualification
python .\.trellis\scripts\task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python .\.trellis\scripts\task.py validate 06-29-commercial-guitar-tablature-product
python .\.trellis\scripts\task.py validate 08-11-post-core-official-plugin-product-roadmap

git diff --check
npm.cmd run typecheck
npm.cmd run build
npm.cmd test

git diff --name-only 38afdc3 -- src test package.json package-lock.json tsconfig.json
```

规划接受条件：生产/test/build configuration 零差异、现有 full suite 保持 `432/432`、task `planning`、production authorization false、self-audit P0/P1/P2=`0/0/0`、review status `READY FOR INDEPENDENT PLANNING REVIEW`。
