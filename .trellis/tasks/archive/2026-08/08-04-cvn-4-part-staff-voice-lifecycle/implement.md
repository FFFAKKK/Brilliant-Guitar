# CVN-4 Implementation and Verification Plan

## 1. 执行状态

本文件是 CVN-4 的有序实施计划，不是执行授权。当前任务状态保持 planning：正式子任务、分支与 PRD/design/implementation package 已创建，但 task.py start 未运行，production_implementation_authorized 为 false。只有用户审阅本规划包并明确授权后，才能执行 Stage 0、修改 source/test 或更新验收复选框。

## 2. 激活前条件与记录

执行授权到达后，首先记录：

- CVN-3 accepted source/test d9500f5a8ac285071586ba8eda380370eafd022f；
- CVN-3 acceptance 3691d93e934c4fe44d3d34e313acd257deae154c；
- CVN-3 archive 7b727af0a55e22f878e1d7a744f0426deef37cf2；
- 当前 clean activation HEAD、branch、worktree；
- 49 runtime exports、10 Core catalog commands、10 Registry descriptors 的 pre-feature snapshot；
- CVN-1 expected trace SHA-256 和 CVN-3 expected surface JSON hash；
- typecheck/build/CVN-3 focused/full-suite 的实际结果。

若 activation 前工作树非干净、CVN-3 evidence 不可解析、基线计数不同、protected fixture 已漂移或依赖状态退化，停止并修复基线，不开始功能实现。

## 3. 拥有与保护的文件面

### 3.1 预期 production edit surface

- src/core-kernel/commands/catalog.ts
- src/core-kernel/commands/contracts.ts
- src/core-kernel/commands/core-command-adapters.ts
- src/core-kernel/commands/target-resolver.ts
- src/core-kernel/commands/effects.ts
- src/core-kernel/commands/execution-assembly.ts
- src/core-kernel/commands/hierarchy-command-adapters.ts（new private file）
- src/core-kernel/registry/builtins.ts
- src/core-kernel/reports/strict-codec.ts
- src/core-kernel/reports/adapters.ts（仅 exhaustive mapping 需要时）
- src/core-kernel/index.ts（仅 type export arrangement，runtime values 不变）

### 3.2 预期 test/fixture surface

新增：

- test/core-kernel/fixtures/cvn-4-score.ts
- test/core-kernel/fixtures/cvn-4-command-helpers.ts
- test/core-kernel/fixtures/cvn-4-surface.ts
- test/core-kernel/fixtures/cvn-4-surface.expected.json
- test/core-kernel/cvn-4-part-lifecycle.test.ts
- test/core-kernel/cvn-4-staff-lifecycle.test.ts
- test/core-kernel/cvn-4-voice-lifecycle.test.ts
- test/core-kernel/cvn-4-strict-input.test.ts
- test/core-kernel/cvn-4-transaction-integration.test.ts
- test/core-kernel/cvn-4-public-surface.test.ts

最小修改：cvn-3-surface.ts 的 projection、command-internals.test.ts、registry-contracts.test.ts、kernel-failure-adapters.test.ts、public API/report/Issue/gateway/forbidden-dependency closed allowlists。characterization 只通过 additive projection 保护，不改写 expected behavior。

### 3.3 保护面

保持不动：score-document.ts、address.ts、decode-score-document.ts、factory、command-bus、runtime、replay、events/read/migration、package/build 配置、Guitar/product 层；以及 cvn-1-characterization.expected.json 与 cvn-3-surface.expected.json 的字节内容。

## 4. 分阶段交付

### Stage 0 — 激活与基线证据

在授权后运行 task.py start，验证 branch/worktree/HEAD 干净，执行 typecheck、build、CVN-3 focused suite 和 full suite，计算 immutable fixture hashes，记录 pre-feature 49/10/10 surface。提交只记录 activation evidence；不混入功能代码。

**停止点：** 任一 acceptance baseline、hash、Trellis manifest 或 protected path 不一致。

### Stage 1 — 冻结先前 public surface

让 CVN-3 surface collector 投影其 accepted 49/10/10 subset，保持 expected JSON byte-identical；创建 CVN-4 collector 的 pre-feature 49/10/10 snapshot；再次运行 CVN-1 characterization。此提交只含 characterization/fixture preparation。

**Commit boundary:** test(core): freeze CVN-3 surface before CVN-4

### Stage 2 — 私有 hierarchy seams

扩展 target resolver 的 private owner facts；实现 owner-aware Part/Staff/Voice anchors 和 previous helpers；向 CoreEffect 追加十五个 narrow variants；实现 candidate preflight/inverse/atomic failure round trips。此时不对外公开 command。用 command-internals tests 锁定 Part extension index restoration、move-after-removal、reference scan inputs 与 no snapshot rule。

**Commit boundary:** refactor(core): add hierarchy ownership and effect seams

### Stage 3 — Part lifecycle

追加 Part contracts/catalog entries 11–15、bounded decoders、adapters、Registry descriptors 和 exact title keys；实现 Part insert coverage canonicalization、remove aggregate/extensions、move、name/instrument replacement；添加 Part fixture/suite 与 interim exhaustive list。验证 no-op、semantic/profile split、extension order、affected address 与 failed-state equality。

**Commit boundary:** feat(core): add Part lifecycle commands

### Stage 4 — Staff lifecycle

追加 entries 16–19；实现 Staff owner anchors、insert/remove/move/definition effects；对 Voice default 与 explicit Event staff reference 做独立 preflight；将 command.reference-conflict 接入 public failure/report/Issue maps，并冻结 privacy behavior。验证 no implicit Voice、cross-Part anchor、explicit reassignment followed by removal 和 last Staff semantic path。

**Commit boundary:** feat(core): add Staff lifecycle commands

### Stage 5 — Voice structural lifecycle

追加 entries 20–22；实现 Part + Measure content selection、Voice owner-local anchors、Voice aggregate removal/inverse；验证 cross-Measure/cross-Part wrong-owner、unrelated content preservation、global ID/reference/sequence rejection 与 last Voice semantic path。

**Commit boundary:** feat(core): add Voice structural commands

### Stage 6 — Voice properties and Event assignment

追加 entries 23–25；实现 defaultStaff、sequenceStart、Event assignment decoders/effects；验证 canonical Fraction、bounds、effective no-op、inherit-default field removal、owner Staff validation 和 profile-unsupported committed result；完成 15 descriptor registry。

**Commit boundary:** feat(core): add Voice and Event staff properties

### Stage 7 — 全事务和 gateway matrix

对每个命令通过 direct CommandBus 与 capability-authorized gateway 执行，证明 exact encoded document before/after、undo/redo/replay、checkpoint/dirty/redo clearing、one event or zero event、affected facts、subscriber isolation、caller mutation isolation 和 extension preservation。gateway denial 必须在 mutation 前返回。

### Stage 8 — hostile input 与封闭失败

为每个 payload family 运行 getter/Proxy/accessor/symbol/sparse/cyclic/root/nested/extra-field cases，测量 64/65 depth 和 1,048,576/1,048,577 own-property boundaries。检查 reference-conflict decoder/Issue privacy、failure ordering、没有 private effect/index leak。

### Stage 9 — public surface 与回归闭合

把 CVN-4 expected surface 更新为 49/25/25，同时确认 CVN-3 expected JSON 仍字节相同。运行 CVN-1 characterization、CVN-3 factory/Measure/transaction tests、public API/Registry/report/gateway/forbidden dependency、typecheck、build 和 full suite。对 activation baseline 审查 protected-path diff。

**Commit boundary:** test(core): close CVN-4 transaction and surface matrix

### Stage 10 — review candidate 文档

把每个 R/AC 链接到 test/file/command evidence，记录 actual commit hashes、test counts、hashes、performance observations 和 remaining exclusions；同步必要 Core specs 为 review-candidate 文本；更新 parent status 为 candidate 但不自验收。运行 Trellis、JSON/JSONL、Markdown/path 与 diff checks。

**Commit boundary:** docs(core): record CVN-4 review candidate

### Stage 11 — 独立最终复审与归档

独立 reviewer 从 accepted CVN-3 base 审查 full diff、十五个 envelope、effect inverses、Part extensions、Staff reference scans、Voice content ownership、wrong-owner anchors、failure privacy、surface counts、immutable fixtures 和 all gates。任何 P0/P1/P2 必须窄修并独立复验。仅在 0/0/0、accepted source/test commit 记录后，更新 task completed、归档并推进 CVN-5 dependency。

Stage 11 已于 2026-08-09 完成。初审发现一个 P2：`core.voice.remove`
的 affected facts 将 owner Part 放在 Event/Note 子树之后。窄修后顺序恢复为
`Voice → owner Part → Events/Notes`，并以 exact submit/undo/redo 回归锁定。
复审在 source/test commit `788594e670a1608ee2beabddcd217a9d340a5d30`
上得到 P0/P1/P2 = `0/0/0`；focused Voice `4/4`、full `312/312`、
typecheck、build、Trellis validation、diff check 与 protected hashes 均通过。

## 5. 验证命令

执行阶段使用 Windows 可靠的 npm.cmd。planned CVN-4 test files 仅在相应阶段创建后运行：

~~~powershell
npm.cmd run typecheck
npm.cmd run build
node --test "dist/test/core-kernel/cvn-4-part-lifecycle.test.js"
node --test "dist/test/core-kernel/cvn-4-staff-lifecycle.test.js"
node --test "dist/test/core-kernel/cvn-4-voice-lifecycle.test.js"
node --test "dist/test/core-kernel/cvn-4-strict-input.test.js"
node --test "dist/test/core-kernel/cvn-4-transaction-integration.test.js"
node --test "dist/test/core-kernel/cvn-4-public-surface.test.js"
node --test "dist/test/core-kernel/cvn-3-document-factory.test.js"
node --test "dist/test/core-kernel/cvn-3-measure-insert-remove.test.js"
node --test "dist/test/core-kernel/cvn-3-measure-move-definition.test.js"
node --test "dist/test/core-kernel/cvn-3-transaction-integration.test.js"
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
node --test "dist/test/core-kernel/registry-contracts.test.js"
node --test "dist/test/core-kernel/kernel-failure-adapters.test.js"
node --test "dist/test/core-kernel/public-api-boundary.test.js"
node --test "dist/test/core-kernel/forbidden-dependency-boundary.test.js"
npm.cmd test
python ./.trellis/scripts/task.py validate 08-04-cvn-4-part-staff-voice-lifecycle
git diff --check
~~~

发现已有 test filename 与计划不一致时，先以 Get-ChildItem test/core-kernel -Filter *.test.ts 证实真实名称，再更新该命令记录；不得静默跳过验证组。

## 6. 必需结构检查

- catalog order 精确为 accepted 10 + listed 15；Registry count 25；runtime export allowlist 49；
- all 15 descriptors 的 source/api/capability/target/title key 精确；
- all 15 VNext boundary，legacy six path 无漂移；
- no schema/domain/address/factory/runtime/replay/event/read/migration/Guitar/module-runtime diff；
- no public whole-document effect、generic setter、generic patch、index target、cascade/reassign flag、runtime registration；
- new reference-conflict is exhaustive/privacy-safe；
- expected fixture hashes and byte comparison pass；
- all rejects prove state equality and all effects avoid clone injection/snapshot leak。

## 7. 验收证据分组

| AC group | Primary evidence |
|---|---|
| AC001–006 | activation record、catalog/registry/surface/strict-input suites |
| AC007–013 | cvn-4-part-lifecycle + command-internals |
| AC014–020 | cvn-4-staff-lifecycle + failure adapters |
| AC021–028 | cvn-4-voice-lifecycle + strict input |
| AC029–032 | transaction integration + gateway/public API tests |
| AC033–034 | report/Issue matrix + byte hashes |
| AC035 | typecheck/build/focused/full/Trellis/diff/independent review package |

## 8. 失败处理与回滚

每个 feature commit 独立可回滚。若 Stage 3 至 6 发现设计偏差，只回滚拥有该命令 family 的最小 commit；若 effect seam 有共同错误，回滚到 Stage 1，并保持 CVN-3 frozen tests。不得 reset、clean、重写已验收 fixtures 或跨入 CVN-2/5/6 解决问题。

## 9. 进入实施前复核

在用户明确授权之前必须保持：task status 为 planning、task_start_run 为 false、production_implementation_authorized 为 false，且 source/test 未改。授权文本到达后，先复读 PRD/design/implement 与 relevant Core specs，运行 trellis-before-dev，再从 Stage 0 继续。
