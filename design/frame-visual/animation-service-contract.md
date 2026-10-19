# 受限动画合同 ui-motion/1

范围：备份正式apiVersion4.0的局部挂载组件。共同身份由现有平台绑定，动画是同一组件的可选贡献。公共源为shared/ui-animation/contract.js与contract.d.ts，浏览器公开入口src/contracts/animation.js；review-only motion-review/2继续独立，不视为正式版本。

## 声明与执行

```js
// Within one registered mount component; metadata belongs to definePlugin.
{
  permissions: { commands: [], animations: ["content-transition"] },
  animations: { contractVersion: 1, definitions: {
    "content-transition": { defaultVariant: "authored", variants: {
      authored: { type: "tween", duration: .16, fadeDuration: .16,
        exitDuration: .08, ease: [.23, 1, .32, 1] },
    } },
  } },
  mount(element, ctx) {
    const ink = element.appendChild(document.createElement("span"));
    const port = ctx.motion.bind({ ink: { node: ink, intents: ["content-transition"] } });
    ctx.onDispose(() => port.dispose());
    // Business state has already been accepted by its owner.
    port.play({ intent: "content-transition", target: "ink", to: { opacity: 1 } });
  },
}
```

ctx.motion只开放bind(targets)，不提供provider、policy、forComponent、平台或业务状态。bind返回冻结hold/place/play/cancel/dispose。作者不能在bind或play指定owner、root、definitions或任意timing；宿主从注册definition取身份/定义，根为实际cell。target名字为小写字母开头的字母/数字/冒号/连字符（最多64字符），node必须是所属cell内独占子节点，不能是cell根、嵌套其他组件、外壳或谱面。最多32目标/组件，全服务128项活动播放。

hold({intent,target})中断旧播放并保持当前呈现坐标（shape返回完整矩形）；place({intent,target,to})即时放置；play({intent,target,to,from?,velocity?,immediate?})返回`{finished: Promise<{status}>}`。shape不能提供velocity。status为completed/interrupted/cancelled/engine-failed，仅描述呈现，不提交业务。cancel即时到当前接受终态；dispose停止且恢复原内联transform/opacity，shape许可额外恢复clipPath。已移入其他实例的节点不再写入。

## 类型、预算与空值

- 可选animations省略/null为无定义；合法贡献内definitions省略/null为空；已提供动作或variant为null是非法条目。贡献版本1必需，未知字段/访问器/旧review版本拒绝。permissions.animations省略/null为空，提供定义需对应权限。
- 支持content-transition、selection-transition、drag-settle、shape-transition；每动作1–8个变体，defaultVariant必须存在，变体名小写字母起始且最多40字符。
- tween秒数0.04–0.30，4项Bezier值0–1且有限；content另需fadeDuration/exitDuration。spring仅选择/释放，stiffness80–800、damping10–80；instant只有type。禁止循环、任意CSS或回调。
- 原三动作的to/from仅x/y（CSS px）、opacity（0–1），继续拒绝width/height。最大绝对位移分别24/256/512px；原三动作只有content允许opacity。速度x/y为px/s，最大1600；immediate可选布尔。合法0与false保留，非法提供值拒绝，即使动效关闭也先校验。
- shape的to/from必须完整有限`{x,y,width,height,opacity?}`，几何各项非负，`x+width<=512`、`y+height<=512`，opacity如提供必须0–1。仅tween/instant，不接受spring、velocity（包括提供null/undefined）、任意CSS/轨道/timing。完整请求/当前采样在中断旧任务前校验；完整bind批次在capture及占用节点前校验。
- 缺定义或缺提供者直接到合法静态终态。已提供非法/不兼容定义必须登记拒绝，不能吞掉当作缺失。

## 策略、失败与生命周期

宿主选择full/slow/reduced/none与profile。profile不匹配时使用作者默认；slow为2.5倍调试速度；系统减少优先；reduced内容取消两端装饰位移，仅100ms显隐，其余即时；none/keyboard immediate即时。

shape在减少/关闭、键盘、尺寸输入、程序更新、隐藏和窗口resize时即时到有意义矩形，不能清零x/y。shape驱动按intent读取真实translation、inset裁剪和opacity；裁剪的top/left必须0，right/bottom为0–512px，圆角如提供必须2px，不接受百分比或任意路径；transform仅纯二维平移。普通动作不读取尺寸、不写入或捕获clipPath。

shape提供者在固定512×512局部平面上以同一次Motion调用合成`translate3d`、`inset(0px right bottom 0px round 2px)`和opacity，三者共用时长/ease。Motion展开的原生属性轨道须共用startTime/timing/ease；不动画化width/height/top/left、不scale内容或圆角。

同目标新请求先校验，再中断旧任务并从真实中间位置继续。隐藏停止到已接受结果，隐藏期间静态，恢复不重放历史；实例移动保留同一绑定；最终释放/挂载失败走scope。公共时间预算为tween最大轨道时长，spring0.8秒，slow乘2.5，额外50ms截止；超时记录engine-failed并静态落地。

宿主createAnimationService({driver,provider,onIssue})可replaceProvider，切换前取消旧任务。DOM driver不依赖引擎；固定Motion提供者按定义执行，局部数值更新持有活动记录门禁，停止全部控制器。提供者部分创建失败清理已创建轨道。同步完成也停止返回control。旧完成/失败/帧更新不写回、不产生新诊断；当前失败使用绑定source/owner，经宿主原notices路径报告。

组件上下文重取（例如局部快捷键）复用同一cell的动画端口，不再次登记根。原生DOM轨道直接cancel；隐藏后不再调用会提交computed style的引擎stop。服务先采样当前呈现，再负责取消后的静态写入；隐藏/释放时浏览器实际轨道也必须归零。

## 验证及迁移

独立tests/animation-service.test.js覆盖空值/版本/预算/权限/作者参数/隔离/替换/反向/迟到/失败/隐藏/释放。源/生成一致性由scripts/build-animation-contract.mjs --check检验。最终同平台接线、实际布局与正式预览证据见research/layout-formal-engineering-result-20261007.md；未实际装配项不可仅凭独立模块宣称完成。旧3.0 React与review-only版本不隐式接收此贡献。

`startup:build/check` 已纳入该生成检查，`desktop:build/check` 沿同一链处理。真实引擎隐藏取消回归见tools/animation-service-browser.cjs；正式ESM与经典/桌面静态入口分别由layout-formal-browser.cjs和layout-formal-startup-browser.cjs验收。

## 2026-10-07 正式shape增量

版本仍是`ui-motion/1`/contractVersion1：严格增加新intent，不扩大旧三动作的字段语义。旧捕获器对未知shape明确拒绝；不能把未支持的shape静默当成有效贡献。TypeScript通过区分intent的request与definition类型约束完整矩形、禁止velocity/spring。

shape封存阶段布局在同一次声明里只提供shape权限与`LAYOUT_PREVIEW_SHAPE`，continuous/focused/quiet分别280/260/140ms，曲线从同一作者对象捕获。页面使用`view.attachMotion(({targets}) => ctx.motion.bind(targets), {shapeTransition: true, onIssue})`；不转交私有descriptor的root/animations/身份。该阶段五个实际目标为shape:top/left/right/voice/stage，与旧四ink互斥；当前完整选择/开关见下节。

新增`tests/shape-animation-service.test.js`、当前布局集成测试及正式workbench挂载测试覆盖完整矩形、原子拒绝、空定义/无provider、策略/作者参数、同步完成/启动抛错、capture回滚、当前故障/超时、迟到、两实例与32/128预算。新`tools/layout-formal-shape-browser.cjs`消费实际正式服务与提供者，验证ESM、经典file、桌面静态资产入口、同进度轨道、动态容量及业务接受之后的逐帧谱面零漂移。构建写入生成件完成后才能加载浏览器。

新结果与证据为`research/layout-preview-formal-shape-result-20261007.md`和`evidence/layout-preview-formal-shape-20261007/`。旧opacity工具/报告是历史证据，不覆盖或用于验收当前shape；原生WebView及父视觉美术联合验收继续独立。

## 2026-10-07 正式可见反馈增量

2026-10-08排序/成员增量：框架以 `frame.builtin.content-order` 私有呈现声明，在左内容列表和右侧页签各自根下绑定无样式承载层的 `drag-settle` 与 `content-transition`，同一目标复用原service/provider/预算，不增加DOM层。它不属于布局插件的私有动画贡献，不扩大布局权限。配置先接受，指针才做存留项局部FLIP及新项160/180ms淡入；跨区只在来源补位和目的地入场，移除项即时隐藏。连续添加保留未移动项当前透明度；静止恢复并清除transform/opacity，当前失败静态，迟到/移除/释放隔离。组件实例与事务仍归原所有者，详见 `.trellis/spec/frontend/frame-content-order-contract.md`、`research/layout-content-reorder-motion-20261008.md` 和 `research/layout-content-membership-motion-20261008.md`。

2026-10-08追加：布局作者沿用下述同一content-transition声明，为原编辑工具及三行内容控件新增5个局部目标，完整页面15目标。私有 `editTransition:true` 仅选择作者呈现，不增加SDK字段或公共权限；同一 `ctx.motion.bind` 校验、预算与生命周期保持。两组标题工具在固定列先退后入，内容行只改变透明度；命令先接受、键盘即时、反向hold、隐藏/尺寸改变静态落地，见 `research/layout-edit-motion-20261008.md`。下文10目标为此前阶段，不覆盖这一增量。

当前frame.layout同次定义/权限为shape-transition、selection-transition、content-transition，分别消费LAYOUT_PREVIEW_SHAPE、原selection recipe和独立LAYOUT_TOGGLE_EMPHASIS。page只转交targets，显式启用shapeTransition、selectionTransition、toggleTransition；共10个独占子目标（5+1+4）。选择窗口250/260ms或quiet即时；开关蓝面/亮图标同层opacity，连续160/120ms、聚焦180/120ms、静稳100/80ms。provider不会为无变化x/y创建transform轨道，不动画化尺寸、文字或命中区。

框架自己的可信内部呈现声明复用同一service与frame.builtin owner。region-presentation在shell下绑定4个内容节点；每个顶部/rail/voice持久button作为control-presentation根只绑定1个装饰子目标，使页面数量与区域32目标预算分离。不是新增PluginPlatform目录/插件身份/注册器/命令。布局cell仍不能绑定外壳或谱面。

宿主componentPort.setProfile(name|null)只选择已捕获作者变体，null恢复全局；未匹配用defaultVariant。现有任务保留原参数，全局系统减少/none优先。ctx.motion仍只有bind，局部port没有profile/provider/policy/timing。框架进入/退出用enter/exit作者变体180/120ms、位移至多12px，按钮使用独立recipe。

框架输入由createFramePointerPresentation的原生Event.eventPhase getter界定同步dispatch，要求isTrusted和detail>0。根内capture接收，body菜单只经框架私有run；键盘、脚本、异步或payload标识无权冒充指针。先接受grid和尺寸，再动画内容；关闭立即inert/aria-hidden、禁用grip、原焦点恢复。退出保留同一节点，固定在已接受stage外并静态裁最多12px边缘，无安全几何直接hidden；不复制内容、不遮工作台。

每侧token隔离旧finished，反向hold采样接续。arrangement/currentPage/区域尺寸变化、程序/窗口/root隐藏立即结束框架轨道，恢复不重放。框架quiet内容即时、按钮100/80ms局部淡出入；reduced/none全即时。布局减少内容仍执行公共opacity100ms策略。合法宿主rightWidth等语义保留，接受后不额外改变设置页承载或动画化整页。故障沿原结构化notices（本身没有DOM），当前静态落地；旧失败无写回/新诊断。

回归为tests/frame-region-presentation.test.js、layout-formal-integration.test.js与animation-service.test.js；真实入口及双完整runtime由tools/layout-visible-formal-browser.cjs验收。先生成再浏览器，使用独立FRAME_VISIBLE_EVIDENCE_DIR批次保留失败记录；结束后tools/layout-visible-formal-verify.cjs运行全量、类型和生成check。每次接受后逐帧分别记录谱面与排布设置承载/标题/外框/控件四分量。新结果与证据为research/layout-visible-formal-animation-result-20261007.md和evidence/layout-visible-formal-animation-20261007/，shape历史封存不覆盖。

接受后零漂移不证明点击前/接受后设置容量不变。当前宿主排布合法尺寸导致的设置重排（UX-01）和编辑/取消范围表达（UX-02）保留在research/user-experience-audit-20261007.md，整体体验结论为Block；本轮仅消费稳定作者源，不扩展公共尺寸或内容事务合同。最终检查的passed只表示本轮工程检查通过，并单列该体验结论。
