# 基础边界持续回归

日期：2026-10-08。适用范围为已授权的备份UI、正式4.0平台和只读文档。此检查不改变支持范围，也不授予整体开发或发布资格。

当前受控开发的范围及停止收尾条件见[开发准入说明](development-readiness-v0.1.md)。此命令提供回归证据，不要求每个局部迭代都完成全部发布门槛；只按改动影响补布局、业务或原生检查。

## 使用入口

```text
npm --prefix design/frame-visual run foundation:check
```

默认创建新的 `design/frame-visual/evidence/foundation-boundary-check-<UTC时间>/`，输出逐项日志、前后指纹和report.json，不覆盖历史证据。
显式 `--output` 可以选择新的目录；相对路径统一从仓库根目录解析，其父目录必须已存在且在仓库内。生成件过期时直接失败，不在检查中自动重建来掩盖问题。

该工具调用原测试和原生成器；没有第二套平台、router、设置注册表或业务断言。阶段顺序为生成一致性、生产/test类型、正式边界、备份边界。失败后停止，后续阶段记notRun；修复并明确重建受影响资产后，在新的证据目录复测。

## 持续检查的真实边界

| 边界及历史问题 | 原权威所有者 | 实际检查与依据 |
| --- | --- | --- |
| 独立SDK与独立宿主bundle / F-11 | 正式plugin-sdk及manifest/UI捕获 | 作者包从唯一正式源编译，仅导出definePlugin；独立包进入现有正式宿主。合法包启动，未来API及越命名空间贡献拒绝 |
| 设置输入/read与注册表 / F-03 | 正式PluginSettingsRegistry | 原plugin-foundation检查输入/读取/默认值隔离、非法JSON/async parser，以及3.0/4.0普通数据兼容 |
| 已接受状态与观察通知 / F-01 | 原通知helper及状态所有者 | 原正式/备份foundation测试检查抛错和Promise拒绝；严格拒绝子进程证明其他观察者和业务状态保持 |
| 安装、隐藏、释放及晚到结果 / F-02 | 原ComponentHost、资源scope和文档会话 | 原mount、author-trials、real-document测试验证失败回滚、同实例隐藏/移动、受控100次循环及异步逆序/释放 |
| 真实格式文件与Native宿主/备份投影 | 原ScoreSessionService、codec、文档projection和共享分页 | document-capacity验证确定文件往返、16/128/512规模音乐/身份完整、未来/截断/UTF-8拒绝及旧作品保持；工具结果仍仅为文件/宿主/分页基线 |
| 绘制容量工具与资格边界 | 原renderStaff/VexFlow/字体加载、真实文件投影及共享统计 | notation-capacity检查工具失败/取消/清理、超限/缺观测、原消费源图与跨cwd；受控测试不作为实际浏览器样本，最低设备与G6保持pending |
| Node测试DOM事件参数 / F-15 | 原DOM替身与真实popover/备份runtime | dom-event-lifecycle验证capture布尔/对象交叉删除、20次弹窗关闭归零、双runtime监听独立释放；合法活跃峰值警告保留，不提高阈值或当作长期资源资格 |
| 作者验收与持续检查判定 / F-16 | 共用verification-process、原作者试验及限定快照 | author-submission-verifier覆盖提前退出0、报告不可覆盖、元数据/宿主变化失效、完整TAP和超时；作者验收自动先查startup资产，仍不授予独立作者资格或安全沙箱保证 |
| 组件、菜单、快捷键与命令 | 原UI router和正式贡献捕获 | 原formal-plugin-convergence断言参数/结果、权限/禁用和唯一执行路径，不复制命令实现 |
| 共享谱式规则与正式交互目录 | shared/notation/interaction及原正式平台 | notation-interaction-registry/notation-interaction-boundary验证真实SDK捕获、本包作用域、冲突/缺失及释放；原score-note-input验证实际UI消费，无第二套registry |
| 多计划适配器与存储队列 / F-04局部 | 原desktop-plugin-plan-store | 原plugin-startup-desktop回归验证旧修订拒绝、失败后恢复和其他namespace保持。该测试不代验跨进程租约 |
| 管理目录、编译包与固定启动计划 / F-13 | 原backup-plugin-assembly及正式activation适配 | configurable-plugin-assembly使用独立SDK包串联真实管理控件、生成桌面服务、原平台和完整重建；无目录包早拒绝，低层恢复不默认启用缺失项。原生磁盘/进程另验 |
| 可复用管理API与应用自动入口 / F-14 | 原管理模块及薄bootstrap entry | 完整壳DOM存在时import管理API无存储/挂载副作用；经典生成器消费独立entry，原Tauri/浏览器选择及退出清理继续按原回归检查 |
| TS源、浏览器SDK、经典入口与桌面资产 | 五个既有生成组及独立绘制容量生成组 | notation/motion/startup/desktop/author-kit/notation-capacity的check及前后指纹；不手改生成件，合计10步骤 |
| npm、直接Node与桌面hook调用目录 / F-12 | 原startup/motion生成器 | 打包固定absWorkingDir；原startup从仓库根及独立临时cwd都验证同一资产，避免相同代码因源标签变化被判过期 |

精确测试选择只有 [foundation-boundary-check.mjs](scripts/foundation-boundary-check.mjs) 中的一个清单。新增或改变公开边界时，在原所有者的测试中加入行为回归；涉及新测试文件时同步补入该清单。

## 工具自身的通过规则

- 子进程退出0且无signal/超时/启动错误；测试日志必须有唯一完整TAP汇总、非零tests、pass等于tests，fail/cancelled/skipped/todo均为0。空跑或跳过不批准。
- 该判定与新证据目录由verification-process唯一实现，author:verify复用；作者提交还追踪package.json和自身静态依赖，防止两个验收入口再次分叉。
- 前后指纹覆盖正式workbench源/host/test、shared、备份源/工具/测试/参考包、公开作者指南、声明的锁/配置、实际加载资产与桌面/作者生成目录，以及现有agent/kernel生成依赖；新增、删除、变化或结束快照失败均使本轮stale。
- 该指纹是限定范围，不覆盖所有node_modules、全仓或Rust原生依赖。瞬时变化又恢复原字节无法由两个快照证明；正式候选验收仍应使用稳定工作区或隔离checkout。
- 路径按仓库根解析；显式输出只能使用仓库内的新目录；不覆盖以前的报告。默认参考试验清除外部BRILLIANT_AUTHOR_TRIAL_DIRECTORY覆盖，独立提交另用author:verify。
- report.status仅代表这组回归。overallFoundationQualification、independentAuthorQualification、capacityQualification、nativeQualification始终pending，不把自动化绿灯升级为其他资格。

## 修改前与交付前

修改公开能力前写明：输入/输出、状态和资源所有者、允许调用者、同步/异步边界、失败/取消/释放行为、兼容版本及真实消费者。新增插件不得靠私有DOM/对象或宿主特判完成接线。

修复先在原测试中复现最早失效边界，再改该权威所有者。整合前运行上述命令，并按改动影响补相关包全量、磁盘/进程及同版原生验收。当前正式全量和备份全量仍保留原入口，不被此定向清单替代。

## 仍需要独立验收

未读私有实现的作者实际执行A/B/C；新可配置包的原生保存重开（目录/恢复/完整重建已有受控回归）；真实Windows配置租约/长路径/F-10启动错误；原生Ctrl+滚轮、系统缩放和IME；真实WebView绘制/最低设备/长期资源容量，都需要对应证据。
此命令不启动原生应用、不读写用户配置/作品、不申请安装/市场/热插拔，也不开放音符写入。

依据：[作者开发合同](../../.trellis/spec/frontend/plugin-author-development-contract.md)、[基础验收标准](infrastructure-acceptance-v0.1.md)、[作者试验指南](author-validation-guide-v4.md)。
