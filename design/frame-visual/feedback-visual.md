# 操作处反馈与布局方案视觉合同

日期：2026-10-04，revision-14。此文描述可运行的备份视觉样稿，不定义正式反馈SDK、业务结果协议或内核接线。[反馈扩展目标](feedback-extension-boundary.md)与[跨层交接](feedback-cross-layer-review.md)继续作为工程输入；一个插件身份平台、平级登记和按需扩展原则保持。

## 1. 范围与入口

打开`feedback-review.html`的八个状态；只有`structure-preview.html?feedbackReview=1`加载中性内容。`feedbackSample`支持normal、saving、save-failed、unknown、config-fallback、hidden-source、provider-missing、long，未知样本回到normal。

默认结构与集成入口保持原行为，不装新样稿。新的方案操作在布局组件内进行；现有菜单/选择界面保留，不机械新增五类浮层。旧notify/confirm的集中工程迁移仍待完成。基础回退、来源隐藏与配置异常在这里是视觉状态，不是插件提供者替换或磁盘恢复的运行验证。

## 2. 样稿实际函数

`src/fixtures/feedback-review-state.js`：

```js
applyFeedbackReview(state, params) // boolean；显式装入样稿
validateSchemeName(state, value, excludedId) // { name, error }
openSchemeEditor(state, kind) // boolean；save | rename | delete
submitScheme(state) // token | null；许可和校验后进入pending
settleScheme(state, token, outcome = "success") // boolean；success | error | unknown
reconcileScheme(state) // boolean；只核对原任务，不重新提交
closeSchemeEditor(state) // boolean；关闭本地编辑/停止模拟等待
finishFeedbackEdit(state, confirm) // boolean；允许/阻止结束布局编辑
runFeedbackAction(state, action, value) // boolean；样稿动作路由
feedbackTitle(state) // { label, status, attention }
```

`createFeedbackReviewView({state, dispatch})`返回`title()/schemes()/details()`的框架拥有节点，复用`h/visualButton/graphic`。这些函数不是对插件开放的宿主服务或额外平台。

## 3. 状态及事务

`schemeBook={current,entries}`为内容配置目录，条目含id/name/builtin/content。内容快照只含enabled/widths/iconOrder/hiddenIcons及实际存在的presentation/contentHosting；方案切换不修改工作区尺寸和区域开合。

`layout-edit-state`将schemeBook加入原配置快照；确认保留、取消恢复。`feedbackReview`是阅读、编辑器和模拟任务的非配置记忆，不整体回滚。关闭局部编辑明确放弃该局部名称输入；其他页面普通输入仍沿用原记忆。

待完成操作包含单调token和epoch；本地停止或布局取消后，旧完成不得写入。未知结局可在取消后保留，核对不得复活已撤回方案；新布局编辑也不能接受上轮候选。确认遇到pending/unknown会留在本轮编辑并原位说明。

normal的提交在900ms后模拟完成；saving目录状态特意停留在pending供检查。只有明确失败允许原处再次提交。unknown不提供原动作重试；核对只更新这一任务的结局。所有操作都只在内存，刷新不持久化。这里“停止等待”终止的是本地模拟，不代表真实在途业务能取消或尚未提交。

## 4. 校验与反馈矩阵

| 情况 | 可见结果 | 行为 |
| --- | --- | --- |
| 非布局编辑 | 方案控件禁用，入口说明原因 | 状态函数也拒绝修改 |
| 内置方案重命名/删除 | 动作禁用 | 状态再次拒绝 |
| 空名称/超过40字符/控制字符/斜杠/重名 | 输入下方原位原因、aria-invalid | 不创建任务、不改目录 |
| 正常名称 | Unicode NFC、去首尾空白；重名大小写不敏感 | 等待本轮布局确认 |
| 处理中 | 原位静态进度及标题短状态 | 重复提交拒绝、确认被阻止 |
| 明确失败 | 原方案与名称保留 | 修正后可再次提交 |
| 结局未知 | 结果待核对 | 不自动重发、不宣称业务无变化 |
| 已查看/关闭详情 | 重要问题入口仍在 | 不等于已解决 |
| 来源隐藏 | 标题状态可达 | 不自动开侧栏；主动回到来源才展开 |
| 呈现提供者缺失 | 基础文字详情及关闭入口 | 记录保留；真实替换仍由工程验证 |
| 配置异常 | 基础布局与原配置保留说明 | 样稿不覆盖真实配置 |

## 5. 视觉与键盘

谱页仍为主视觉；操作处状态按名称/动作/原因排列。复用批准tokens；无白色装饰边框、默认无动画、无可见滚动条。深色输入只在键盘焦点显示蓝色轮廓。标题复用既有状态位置；980px以下短图形入口保留完整可访问名称，重要问题不会被标题容量规则隐藏。

Enter提交名称，中文输入组合期间不提交。Esc先关主动详情或局部方案编辑，再沿用原布局退出链。程序焦点只调整所属侧栏的阅读位置，目标避开现有粘性标题；异步完成不抢其他正在编辑的字段。详情在窗口内限宽限高，完整名称换行，内容仍可滚动但不显示滚动条。

普通操作保持谱页X/Y/宽/高；resize保持宽和Y并按窗口水平居中。左右侧栏与工作台无分区交集；上下开合沿用共同压缩左右高度的规则。

## 6. 实际验收与限制

- `tests/feedback-review.test.js`验证许可、名称、外层事务、重复提交、陈旧结果、未知结局、查看语义及空节点。
- DOM替身只验证结构，不计算像素，也不算读屏器验收。
- 浏览器通过真实URL、点击、输入与键盘，检查四窗口八状态、详情、方案流程、原96场景、两个默认入口与resize。来源和记录见[本轮验收](evidence/revision-14/review.md)。
- 正式反馈报告/受限只读投影/来源隔离/合法恢复/记录容量/提供者装配/真实IPC与持久化均未在本轮实现。
- 全框架读屏与键盘复核、真实Windows100/125/150/200%缩放仍待后续，浏览器DPR不是系统缩放实测。

## 7. 交接时的错误与正确做法

错误：取消布局就把未知记录清掉；超时后再次提交；关闭详情就标成已解决；直接将业务错误码绑定这份样稿视图。

正确：配置撤回与任务结局分别处理；原任务先核对；只有真实状态所有者确认问题解决；正式呈现读取工程发布的受限投影，动作仍走原有获准端口。视觉的停止模拟等待不能转换成真实业务取消承诺。
