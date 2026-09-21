# 遗留保全与组件投影范围收口

日期：2026-09-21，Asia/Shanghai。
本阶段承接 `430a920` 的遗留审计：保全四处原始内容，并处理 C6 组件级投影范围。
不处理 C7 StaffProjection 架构方案，不改协调旧索引，不启动组合集成。

## 本轮成果

1. 四个工作树的 85 个遗留文件已保存原始字节，另有四份 tracked binary diff。
2. 从备份读取内容，在独立恢复演练目录重建，85/85 SHA-256 和字节比较通过。
3. C6 已形成独立平台修复提交 `ec85c6b84ddb332985ecb44bcaf9ce5018288d8a`。
4. 修复提交上的平台回归 71/71、相邻回归 30/30 通过；
   根目录 TypeScript 5.9.3 和 Workbench TypeScript 7.0.2 的生产/测试检查各两项均通过。
5. 原四处遗留文件、HEAD 和暂存状态没有变化。旧交付/修复引用和 main 没有移动。

## 可恢复备份

位置：`E:/desktop/brilliant_ideas/brilliant_guitar/.repo-archive/2026-09-21-legacy-preservation`。

- `snapshot/<worktree-id>/...`：85 个原始文件，不做换行转换，包含 43 modified 和 42 untracked。
- `patches/`：四份 tracked diff，不能单独替代 untracked 文件备份。
- `restore-rehearsal/<worktree-id>/...`：从 snapshot 而非原工作树读取并写出的恢复副本。
- `manifest.json`：来源目录、分支、HEAD、状态、文件长度、SHA-256、备份及演练路径。
- `verified.json`：与本分支 `2026-09-21-legacy-preservation.json` 相同的回执。

原始文件总字节数为 1,006,766；此数不含演练副本、patch 和元数据。
Manifest SHA-256：
`5c32572a894e3c6e460705e2f22387537f5b9d1fe9c5b8da12028c9d38c1f84a`。

备份在 Git 忽略目录，不把旧业务文件重新提交进产品。
脚本 `2026-09-21-preserve-legacy.mjs` 固定使用 `430a920` 的审计清单，
创建前后核对文件集合、HEAD、暂存区及每个原始哈希。
`--create` 采用新建目录和 exclusive file create，已验证再次执行会拒绝覆盖；
`--verify` 只读检查备份、演练副本和当前原工作树。
恢复演练没有写回任一原工作树，没有清理、删除或 stash。

这是**同机的遗留文件内容备份**，不是完整仓库、完整 Git 历史、所有 ignored 产物或异机灾备。
恢复到项目时还需要对应的已记录基线 HEAD；本轮只验证独立目录的字节恢复，
不宣称已进行完整 Git clone、依赖重建、编译或灾难恢复演练。
备份成功也不自动授权删除原工作树。

## C6 修复边界

代码分支：`codex/plugin-component-projection-scope-20260921`。
代码工作树：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/plugin-bindings-identity-fix-20260921`。
复用已有目录，没有新增工作树；目录名不是当前分支名。
父提交仍是 `0da94996def194ebe0b9fe159b3642398887115c`；
原 `codex/plugin-bindings-identity-fix-20260921` 引用继续保留在该提交。

只改两个文件：

- `apps/workbench/src/ui/plugin-manager.ts`：`resolveViews` 将已捕获的插件投影与
  已捕获的 `view.definition.permissions.projections` 取交集，再通过现有 `snapshot.scoped` 发放 reader。
- `apps/workbench/test/ui-view-contribution.test.ts`：保留原用例，新增六项组件范围回归。

现有 `UiComponentPermissions` 已有 projections 字段，安装阶段已校验它不能超出插件声明；
本次补齐渲染阶段对同一声明的执行，不引入新的权限层或公共协议。
没有复制 ce04 的旧 Manifest API 2、激活规则、宿主整文件或 StaffProjection 方案。

覆盖：单独第一/第二投影、空权限、同插件兄弟组件各自的 reader、
安装后作者对象变更不扩大或撤销已捕获范围、旧/新 snapshot 各自保持绑定，
以及 SDK -> 平台 -> UI host 的完整装配。
SDK 用例还验证命令仍按插件范围读取、扩展贡献仍使用其自身插件范围、
未激活扩展不进入渲染、运行中停用只影响下一次启动。

这只是宿主发放给 view 的读取句柄范围，不是同进程插件之间的强安全沙箱，
不阻止代码通过自行共享闭包或其他已获授权句柄协作。
命令、扩展贡献的既有范围不变，不借此扩展第三方隔离机制或修改业务端口。

## 验证与集成

完整命令、逐文件测试清单、工具版本和源码哈希见
`2026-09-21-component-scope-evidence.json`。

初始回归：只新增前五个用例、生产源码仍为父提交时，1 passed / 5 failed，
均为期望拒绝却未拒绝的断言；第六个兄弟组件用例是在修复时补充。
最终结果均在确切代码提交 `ec85c6b` 上重跑：

| 检查 | 结果 |
| --- | --- |
| 九个文件的平台回归 | 71 passed / 0 failed / 0 skipped |
| 八个文件的相邻回归 | 30 passed / 0 failed / 0 skipped |
| 根目录 TypeScript 5.9.3，生产与测试 | 两项 exit 0 |
| Workbench TypeScript 7.0.2，生产与测试 | 两项 exit 0 |
| staged diff / commit whitespace | 通过 |
| 四处备份、演练、原始状态复核 | 85/85，四处 staged 均为 0 |
| 九个既有引用 | 未变化 |

每次定向测试执行前都检查命名文件实际存在，没有依靠 Node 忽略不存在参数的行为。
没有重新安装依赖、重建 Native addon、运行 Workbench 全量、Rust/Clippy、Desktop 或浏览器 E2E。
没有修改 UI 外观，因此也没有启动视觉设计任务或向其索取进度。

**集成只评估 `ec85c6b` 的两文件增量，禁止整支合并。**
父链仍携带混合平台交付及旧 Score 基础，不包含 Score 后续加固，也不能替代 Agent 验证链。
将来须在已按既定队列组合的源码上适配该增量，保留最新 plugin capture/session 行为，
再执行组合验证。G5 新 addon 来源和全量验收仍未关闭。

## 阶段停止点

本轮新增代码和证据分别提交，两个工作树各自收口。
仍有原来的 85 条未提交记录，只是已经有可恢复的内容备份，不称为“旧工作区已干净”。
C6 的缺口在独立候选分支修复，尚未进入 main。
C7 的四个架构候选文件继续待用户决定，未指定实现任务、未新增 Projection Composer。
下一小阶段建议先更新统一协调索引，纳入本轮固定提交和待集成顺序；
业务组合集成、main 晋升、旧内容处置和工作树清理都不自动开始。
