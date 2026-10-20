# 备份 UI 与正式插件平台收敛合同

日期：2026-10-07。此合同覆盖本轮已实施接线，覆盖旧文档中“备份入口拒绝所有 apiVersion”和“仍使用旧备份平台”的描述。

## 1. Scope / Trigger

`runtime-preview.js`、`createBackupUiRuntime`、启动管理经典产物及备份桌面统一使用
`apps/workbench/src/plugins/plugin-platform.ts` 的 `PluginPlatform`。UI 宿主只安装执行资源，
不维护第二套身份、激活集合、设置或运行状态。旧 `plugin-installer.js` 平台仅供历史夹具与
未提供正式接线的通用布局测试；真实备份入口必须显式提供正式接线。

同日真实文档续做已将备份桌面核心谱面接到既有原子作品读取、新建/打开/重读；普通预览仍为显式 fixture。
接线、未保存保护和验收边界见 [真实文档只读合同](readonly-score-document-contract.md)。本合同不开放真实音符编辑、安装目录、市场、热插拔或通用 React→DOM 转换。

2026-10-20：公共 manifest、不可变包快照与安装顺序目录由 `plugins/` 唯一持有。
纯业务包可在不装配 UI host 的平台启动；旧 UI import、内部模块注册及默认 React 宿主调用保留。

## 2. Signatures

```ts
definePlugin({
  id, name, version, apiVersion: "4.0", tier?, activation?, settings?,
  hostFeatures?, hostServices?, projections?, interactions?, instruments?,
  playbackOutputs?, applicationCapabilities?, workflows?, kernelModules?,
  ui?: { contractVersion: 1, components: [], commands: [], menuItems: [], shortcuts: [] }
});
new PluginPlatform({ hostFeatures, projections, createContributionHost? });
new PluginPlatform({}); // headless: no concrete UI host/projection registry is created
new PluginPlatform({ uiHost: null, hostFeatures? }); // explicit headless feature directory
new PluginPlatform({ uiHost, hostFeatures? }); // trusted precomposed contribution host
adaptPluginPackage(packageValue); // frozen PluginModule: manifest, ui|null, four business contribution arrays
pluginPackageManifest(packageValue); // data-only discovery, no UI adaptation
reactUiHost.prepare(internalModule); // opaque current-host prepared token, no published resources
reactUiHost.publish(prepared); // one synchronous consumption; install(module) remains available
createMountContributionHost(context, installMount); // installMount returns one rollback/dispose callback
platform.register(packageOrInternalModule);
platform.settings().restore({ [id]: { schemaVersion, value } });
platform.restoreActivation(selectedUserIds);
platform.start(); // returns frozen PluginSessionPlanV1
platform.list(); // manifest + status + active + nextLaunchActive + restartRequired + optional error
platform.facets("ui"); // frozen active placement descriptors, no mount/run
platform.uiContributions(id); // frozen metadata, including inactive registered packages
platform.dispose(); // permanent whole-session termination
```

```js
createBackupUiRuntime({ root, startupPlan?, startupStore?, startupEntries?, plugins?, legacyPluginMetadata? });
createWorkspaceRuntime({ root, plugins, requiredViewSlots, pluginWiring: {
  create: createBackupFormalPlatform,
  prepare: prepareBackupPlugin,
  configure: (platform, prepared) => configureBackupFormalPlatform(platform, { plugins: prepared, plan })
} });
mountBackupPluginStartupPreview({ root, workspaceRoot, store, storageMode, startupEntries?, sessionMode: "preview" | "process" });
```

组件声明保留 `id/title/role/uiKind/slots/permissions/mount` 和已支持的有限呈现元数据；
`mount(element, ctx, {variant})` 同步返回实例或空。实例可有 `dispose/setVariant/setVisible/handleKeyDown`。
组件 ctx 仅有 `execute/notify/onDispose/confirm?` 与本插件的只读 `settings?`；同期动画接入可提供受权限限制的 `motion?`，
动画数据/权限沿用 [正式局部动画合同](layout-formal-animation-contract.md)，只开放 `motion.bind(targets)`，不重新创建平台或动画实现。
2026-10-11：本备份应用还向声明 interaction 的包注入可选只读 `notationInteractions`，
仅转发本包捕获的贡献 ID/kind；无 register/clear 或跨包查找权限。正式核心通过它绑定五线谱规则，
不改 API4.0/facet1/IPC，也不新建目录，详见[记谱策略合同](notation-interaction-package-contract.md)。
`ui.commands[].run(payload, {settings?})` 保留原参数、同步/Promise 结果以及动态 enabled/checked。
menu item 的 `id` 必填；快捷键继续使用现有 `Mod/Alt/Shift` 语法与 global/component/score 范围。

## 3. Contracts

- 省略 apiVersion 的旧 SDK 调用仍生成 3.0；它拒绝新 ui 字段。4.0 精确匹配，UI facet 单独为 v1。
  4.0 包禁止旧 React views/commands/componentExtensions，挂载命令放在 ui.commands。
  4.0 可以没有 ui；ui 或可选数组的缺失/undefined/null 归一为空，没有界面不生成占位组件。
  实际条目及必填字段不能为 null；非法/未来 API 版本不是空贡献。可选元数据空值归一化后仍保留合法 false/0。
- 纯数据 manifest 的 `contributes.ui` 为 `{contractVersion:1,components:[id],commands:[id],menus:[id],shortcuts:[id]}`。
  ID 必须属于插件命名空间；执行函数只在模块 ui 中捕获。未知字段、getter、稀疏数组、非法位置和重复 ID 拒绝。
  模块与 manifest 的 UI ID 数组必须逐项一致。
- 旧命令适配使用 `run: payload => oldCommand.run(payload)`，保留单参数调用约定；
  新挂载命令的第二参数是本插件只读设置宿主，不能把它额外传给旧钩子。
- 原 3.0 UIHost 作为默认宿主；4.0 备份使用注入挂载宿主。共享业务验证器仍处理交互贡献，
  共享正式平台处理业务目录/内核计划/权限。内部构建业务校验片段不会把 render 改成 mount。
  `components/resolveCommands/resolveViews` 保留旧宿主接口；新挂载贡献通过 uiContributions/facets 和 UI 包内部 router 消费。
- 未提供旧 `hostFeatures/projections/createContributionHost` 参数或显式 `uiHost:null` 时，
  平台不装配 UI。3.0/4.0 纯乐器、输出、应用能力、工作流和 Kernel 包仍通过原权限、
  描述校验、激活和固定会话；它们不经 UI 模块转换。UI/投影/交互贡献缺少宿主时局部失败，
  不发布业务目录或 grant。headless 读取 UI 门面明确抛出 `Plugin UI host is not configured`。
- 旧参数调用仍经 UI 兼容组合器创建原默认/自定义宿主，空贡献包仍传给该宿主，
  保持原 React 拒绝4.0、mount工厂接收无UI包的行为。`uiHost` 与 `createContributionHost`
  不能同时提供；直接注入4.0宿主时由可信组合根同时提供它支持的 `hostFeatures`。
- `plugins/plugin-manifest.ts` 是单一 manifest 实现；`ui/plugin-manifest.ts` 单向转发旧名。
  `PluginModule.ui` 与包共享同一捕获 manifest，不能有不同身份、版本或贡献声明。
  业务描述由公共捕获器复制/冻结，UI切片不再持有它们；旧 `adaptUiPluginPackage` 及
  `InternalUiPluginModule` 仍保留完整旧合同。`UiPluginCatalog` 保留对象身份和旧方法，
  与公共目录复用同一个安装顺序算法，不在平台中新增第二份目录。
- 默认 UI `install` 复用 `prepare→publish`；mount 先校验交互，再获取挂载资源。
  prepare 不发布组件、交互或 owner；token 只可在原宿主的同一目录版本消费一次，
  其他发布、dispose、重复消费或跨宿主 token 在任何发布前拒绝。已知业务失败零挂载资源，
  挂载之后的发布异常仍沿用原释放路径。
- 本轮可信内置身份采用明确开发版本 0.1.0，名称沿用应用目录；必需项 always、可选项 user。
  旧 namespace 声明只能由应用提供匹配 id/name/version/activation 后适配；第三方不自动补身份。
- 启动计划仍使用既有 `brilliant.ui.backup-startup` envelope，不迁移、不双写。
  先校验计划→注册包/settings→恢复正式 registry→固定 start→首次 mount。
  frame.score-info 的参数通过同一 schema/parse 校验，并由命令/组件读取本插件 settings。
- 新可配置编译包通过[固定装配合同](plugin-startup-assembly-contract.md)的startupEntries与目录成对接入。计划模式不接受无目录plugins，低层activation恢复也拒绝plan未声明的包；无计划的独立plugins组合入口保留。此为F-13接受边界收紧，不改变API/envelope/IPC或自动迁移旧固定集合配置。
- prepare 每次只接收一个插件：`plugins.map(plugin => prepare(plugin))`。
  不能直接 `plugins.map(prepare)`，因为数组 index 会覆盖 prepare 的可选元数据参数。
- 布局、core、信息和状态页共平台；唯一 router、快捷键、菜单、ComponentHost 和 stage viewport 保持。
  组件移动/隐藏不重建实例，四栏开关/尺寸始终可用；enabled 不等于强制面板摆放。
- 整体 dispose 逆序释放 UI 资源、清目录/订阅；结束的实例不能 register/start/activate/restore。
  晚到的正式 settings/activation 读取不能恢复已结束会话或触发保存。已发出的磁盘写入不假定可取消。
- 平台/设置/诊断及当前文档/谱面/工作区通知只观察接受状态。分发捕获订阅集合，隔离同步抛错，
  并观察误返回的 Promise 拒绝；不等待观察者，不改变原操作结果。诊断钩子失败不阻断剩余插件安装，
  原诊断先保存，不递归归责给某个无关插件。
- mount/实例dispose/setVariant/setVisible/资源清理回调是同步边界。非法 thenable 先观察拒绝再局部报错；
  原资源scope继续逆序清理，dispose仍幂等。异步业务只在明确支持的run/读取端口内执行。
- settings parse同步返回持久化JSON数据或根null；正式registry复制、递归冻结通过的普通数据，
  不保留作者输入/输出的可变引用，不冻结作者对象。拒绝undefined/函数/访问器/循环/稀疏数组/非有限数/实例对象。
  false/0/空字符串/空集合及嵌套null仍有效，reset保留自己的默认值。API/envelope/schemaVersion不变；
  非JSON或依赖修改read引用的写法不再接受。旧3.0及4.0普通数据兼容需回归。
- 桌面自动选择 process 模式：返回配置仅隐藏工作区，保存后返回复用原会话；下次进程才使用新计划。
  file 预览的 preview 模式先完整结束旧会话，再创建独立会话。两者都没有单插件热插拔。
- 已有 process 会话且没有未处理草稿时，返回工作区不再次读取计划；next-plan 读取失败不能阻断当前会话。
  管理视图的 canResume 是可信应用只读判定，初次启动仍必须通过原 canStart；不能用它绕过首次存储/计划校验。
- `src/vendor/plugin-platform.js` 从正式 TS 源生成，经典 IIFE 再消费它；禁止复制或手改生成算法。
- 2026-10-08：公开SDK与宿主独立打包时使用同一运行时`Symbol.for("brilliant-guitar.ui-plugin-package")`识别包；原私有Symbol存在跨bundle误拒绝。识别仍进入原manifest/UI/权限捕获，不作为授权或序列化协议。旧bundle需要按当前源重建；同源字段、API3.0/4.0/facet1不变。验证及作者分发范围见[作者开发合同](plugin-author-development-contract.md)。

## 4. Validation & Error Matrix

| 输入/条件 | 行为 |
| --- | --- |
| 3.0 带 ui，4.1 或非法 API 值 | 作者入口/manifest 捕获拒绝 |
| 4.0 带 React 根贡献 | 拒绝，不丢弃或改名 |
| 4.0 无 UI | 正式身份/固定会话合法，无 UI 占位 |
| 4.0 包交给默认 React 宿主 | 平台 failed 并记录诊断 |
| 3.0/4.0 纯业务包交给 headless 平台 | 原业务目录、权限和固定会话可用，不创建 UI host |
| headless 缺少 UI 宿主、要求的 feature 或 host-service grant | 仅该包 failed，无业务/grant残留，其他包继续启动 |
| 公共包 UI 切片 manifest 与顶层不一致，或声明了缺失的 UI 切片 | 注册前拒绝，不留下平台记录 |
| prepare 后有其他发布/释放，或 token 属于其他宿主/已消费 | publish 拒绝，不改变当前目录 |
| 3.0/混合/未定义新版本包交给备份 | 在文档读取/订阅前拒绝，要求明确 4.0 挂载包 |
| 旧声明缺少明确身份 | 在文档资源获取前拒绝 |
| 插件宿主能力/服务权限不满足 | mount 安装前 failed |
| 菜单/快捷键/组件命令权限非法 | 安装预检失败；已获取资源统一 rollback |
| 后续业务安装失败 | 回滚该包 UI 贡献，其他平台包仍可 active；应用可进一步拒绝不完整启动集 |
| disabled 命令/未获权限/已释放组件 | 同一 router/ctx 返回原失败对象，无额外执行 |
| process 返回/保存/再次进入 | 原插件集合、组件和参数保留；新进程才采用保存计划 |
| process 已运行，next-plan 同步/异步读取失败 | 保存/新启动保留错误，返回旧会话不派发额外读取 |
| dispose 后 async restore 返回 | 明确 disposed rejection，无恢复或新增存储写入 |
| 观察者/diagnostic hook 抛错或误返回拒绝的Promise | 接受状态及原操作结果保持，其他观察者/插件继续，无未处理拒绝 |
| mount/生命周期/清理误返回Promise | 同步边界局部报错并观察拒绝；不接受异步实例或跳过其他资源释放 |
| 通过read/外部作者引用修改已接受设置 | 注册表拥有独立不可变JSON值；不会绕过parse/通知或污染reset |

## 5. Good / Base / Bad Cases

- Good：布局/core/信息同一平台，信息参数 2 在首次 mount 前由 Settings Registry 恢复，按钮、菜单和快捷键复用原命令。
- Base：无 UI 的 4.0 包只贡献业务能力，仍有完整身份/版本/固定会话记录。
- Bad：继续在真实入口启动旧备份平台；把 React render 改名 mount；运行中返回配置后重新装配桌面会话。
  纯业务消费者应选择 headless，而不是为它伪造一个空 React 宿主。

## 6. Tests Required

- `apps/workbench/test/plugin-mount.test.ts`：API 精确匹配、纯数据捕获、作者对象隔离、设置恢复顺序、权限、业务失败回滚、永久 dispose 和晚到持久化结果。
- `apps/workbench/test/plugin-platform-headless.test.ts`：3.0/4.0四类业务、Kernel计划、设置/
  next-launch、无UI宿主与权限失败的局部隔离、描述快照、旧入口/目录对象身份、共享manifest
  以及直接注入。`ui-plugin-manager.test.ts`验证prepare零发布、token归属/版本/一次消费；
  mount交互冲突须在获取资源前失败。
- `design/frame-visual/tests/formal-plugin-convergence.test.js`：真实正式类、布局/core/info身份、payload/结果/异步/禁用、局部快捷键权限、安装 rollback、持久 cell、无 UI/未启用状态及进程冻结。
- 原全部正式/备份回归、TypeScript、startup/desktop 字节一致性及原生增量构建。
- `apps/workbench/test/plugin-foundation.test.ts`与备份`infrastructure-foundation.test.js`：通知抛错/异步拒绝、
  同步生命周期违规、设置所有权；严格拒绝子进程验证不能被当前测试运行器的异常钩子掩盖。
- `infrastructure-author-trials.test.js`：当前4.0三类公开样例、组合/隐藏移动/参数结果及100次受控循环。
  这是知情作者执行性自测，不替代独立作者验收、堆容量或原生WebView。
- 真实浏览器/WebView字体、窗口内保存后重启仍分别验收；DOM 替身与编译不能冒充视觉通过。

## 7. Wrong vs Correct

```js
// Wrong: array index becomes prepare's metadata argument.
const prepared = plugins.map(prepareBackupPlugin);
// Correct: pass only the documented input.
const prepared = plugins.map(plugin => prepareBackupPlugin(plugin));

// Wrong: desktop reassembles plugins while the process is still running.
runtime.dispose(); runtime = createBackupUiRuntime({ startupPlan: newlySavedPlan });
// Correct: process mode shows the original runtime; the next process assembles the new plan.
workspaceRoot.hidden = false;

// Wrong: require a concrete UI host merely to publish an application capability.
const business = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
// Correct: the same package/session authority can run without UI composition.
const headless = new PluginPlatform({});
headless.register(capabilityPackage);
headless.start();
```
