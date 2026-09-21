# B2 Agent 与公共基础集成收口

日期：2026-09-21，Asia/Shanghai。
本批由总协调直接执行，沿用独立候选，不启动其他任务或子代理。
用户批准继续后只实施 B2；本批完成即停，不自动推进 Score 加固或平台接线。

## 候选与交付

- Worktree：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-candidate-20260921`。
- 分支：`codex/integration-candidate-20260921`。
- 起点：B1 收口 `49a2234ff79f031d360021db160e2a357213f50e`。
- 本批验证源码：`20c19924bcfa115d4fabeaba4927ec43e4615473`。
- 来源：Agent 原交付 `fe54697`，追加修复 `8af8229` 和文档 `cb918d0`。

按顺序执行 `git cherry-pick -x`，八个提交均无冲突；没有手工改动业务源码。

| 原提交 | 候选提交 | 内容 |
| --- | --- | --- |
| `42039d9` | `0a57b37` | 一份固定 host-service grants 基础 |
| `a09915a` | `d38765b` | 一份 Score typed port 及 Desktop 接线基础 |
| `e961868` | `9fb2fe9` | Agent typed prepare 边界回归和文档 |
| `b8fd69d` | `eb31b01` | workflow/action 统一执行边界 |
| `35f51c5` | `84958df` | Agent 插件装配职责文档 |
| `fe54697` | `af0b5a8` | scoped host bindings 与 Agent 会话装配 |
| `8af8229` | `d8099a2` | dispose 快照复位与 typed fixture 修复 |
| `cb918d0` | `20c1992` | 原验证回执、证据及两行文档换行修正 |

原 Agent 回执仍是其来源工作树的历史快照。本批测试和环境证据另记于
[B2 证据](2026-09-21-B2-agent-evidence.json)，不重写历史回执。

## 防覆盖结果

- B2 的 53 个文件与 B1/协调文档变更无交集；全部内容与来源 `cb918d0` 一致。
- 八对 stable patch-id 逐一相同，来源 trailer 完整，未做冲突覆盖或接口改造。
- `925badc` 与 `42039d9`、`20bf15d` 与 `a09915a` 的重复关系再次验证；
  仅采用 Agent 链各一份，没有重复重放原补丁。
- B1 的 13 个文件、原协调证据、依赖锁文件和工具链文件未变化。
- 原 action/run-core/workflow/prepared-mutation 回归、typed-port 边界文档完整保留；
  ownership 文档与修复后版本一致。dispose 的 `beginRun() === null` 保护未被替换。
- 四条原交付工作树和 Agent 修复工作树均保持干净；11 个受保护引用未移动。
- 集成前后遗留保全核验均通过：85 个原文件、备份和恢复副本一致，四处原 index 为空。

没有合入 main、fetch、push、清理旧目录或复制旧工作区未提交文件。

## 本批实际验证

所有下列功能检查在源码 `20c1992` 上新执行，没有借用原 Agent 报告的通过结果。

| 检查 | 结果 |
| --- | --- |
| Agent 主回归，27 文件 | 185 passed，0 failed，0 skipped |
| 邻接回归，8 文件 | 56 passed，0 failed，0 skipped |
| 宿主、gateway、初始 Score、插件贡献边界，7 文件 | 35 passed，0 failed，0 skipped |
| Desktop Rust 测试，locked/offline | 65 passed，0 failed，0 ignored |
| Workbench `npm run typecheck`，含隔离 host build | exit 0 |
| Workbench TS 7.0.2 测试类型检查 | exit 0 |
| 根目录 TS 5.9.3 生产和测试类型检查 | 两项 exit 0 |
| `git diff --check` | exit 0 |

三份 Node 测试清单互不重复，共 42 个文件、276 项测试。
其中 Agent 原有两份清单覆盖全部 27 个直接导入 `src/agent/` 的测试文件。
每次启动前都检查命名测试文件存在。测试文件、命令、退出码和日志哈希见证据 JSON。

候选开始时没有根目录/Workbench 的 node_modules，使用各自锁文件执行独立的
`npm ci --offline --ignore-scripts --no-audit --no-fund`，分别安装 3、66 个包。
使用已配置 npm 下载缓存，没有复制其他工作树的依赖、junction 或 Native addon。
Node 为 v24.15.0，npm 为 11.12.1；两份锁文件哈希与原验证记录一致。
禁用安装脚本仅满足本批测试范围，不是完整产品构建或开发环境验收。

Desktop 直接使用 Cargo/Rust 1.97.1 和候选内全新的
`.cargo-target/integration-B2-desktop`，没有依赖其他任务的 target。
该测试编译并使用 B1 Kernel 代码，涵盖 typed change-set prepare 和现有保存/恢复回归，
但不代表 Tauri 窗口、打包、真实断电或 Native addon 资格通过。

Desktop build 曾让两个 tracked schema 在 status 中显示修改。核验发现其原始字节
均与 HEAD blob `24c90014ed68021de21e9f8dd5da66e448fe87d5` 一致。
生成文件快照保存在本批 ignored 日志目录；没有回退或修改 schema 内容。
普通 `git update-index --refresh` 未消除状态提示，随后仅对这两条已校验路径执行
`git add` 更新索引记录，并确认 staged diff 仍为空，工作树恢复干净。
这些生成文件没有产生提交增量。

## 限制与停止点

Score 当前仍为 B2 携带的基础版本，**未包含**
`3d71f63 -> 8ece0f3 -> 717cdc0`；本批不能引用最新 Score 的 97/97 或 572/572 结果。
平台 bootstrap、固定会话 contribution、resolver 唯一身份修复及组件级投影范围
也未整合，不把当前旧 host adapter 当作最终平台实现。

本批未运行 Workbench 全量、产品 Node addon 重建/资格、浏览器 E2E、Desktop 打包、
MSRV、多平台 CI、真实断电或正式性能资格；G5 和全四线组合验收仍未完成。
B1 workspace/Clippy/soak 结果仍为 B1 历史证据，本批未重新运行，
但其对应 Kernel 文件及锁文件已再次证明未变。既有全仓 fmt 问题也未修改。

源码重放与本批报告分开提交。报告提交只含两份新报告和协作索引更新，
测试指向 `20c1992`，不声称后续文档提交重新执行了功能测试。
下一批 B3 只追加 Score 三次加固，逐 hunk 保留本批 typed fixture 与 Agent 回归；
平台混合提交不得整文件覆盖它们。本批在这里停止，不发布公共开工基线。
