# 布局公开合同 v1

范围：备份 UI 挂载插件。公开入口 `src/contracts/workspace-layout.js`；处理器、事务、几何和平台仍由宿主唯一持有。正式包身份/兼容使用现有 `definePlugin` 的 apiVersion4.0，不另造布局身份。

## 读端口

```js
const ports = captureLayoutReadPorts({ layout, contents, actions, view });
createWorkspaceLayoutPlugin(ports.layout, ports.contents, ports.actions, { view: ports.view });
```

每个端口仅有同步 `snapshot()` 与 `subscribe(listener) -> unsubscribe`；返回宿主的冻结只读投影，不能获得 store、router、mount 或其他实例。订阅不立即交付首值；消费方先 snapshot，再订阅。unsubscribe 可重复，停止后排队的回调不交付；页面 scope 负责释放全部订阅。缺失必需 layout 或提供非法端口抛 TypeError。contents/actions/view 省略或null为空，对应可选入口不生成。

通知包装必须将回调返回值交回源所有者；原所有者隔离同步异常并观察误返回的Promise拒绝，不等待观察者、不改变已接受操作或阻断后续订阅者。包装层不另建通知系统；unsubscribe后不再调用回调。2026-10-09的四端口实际源回归见`tests/infrastructure-foundation.test.js`的`async-layout-port`。

| 端口 | 冻结快照字段与单位 |
| --- | --- |
| layout（必需） | leftOpen/rightOpen/topOpen/voiceOpen 布尔；leftWidth/rightWidth/topHeight/voiceHeight 为 CSS px；arrangement 为 balanced/compact；currentPage 为稳定组件 ID；adjusting 布尔；limits/valueLimits 为当前宿主容量的像素范围。 |
| contents（可选） | panels[]：id/componentId/title、slots[]、slot或null、enabled/available布尔、order/previousOrder/nextOrder非负顺序或null、reason文本；changes[]：key/text。无业务对象、组件实例或函数。 |
| actions（可选） | actions[]：id、exists/enabled布尔、checked布尔或null、keys字符串数组、reason码或null。只投影 layout 已获准的命令。缺命令为 command.missing；状态函数异常为 command.state-error。 |
| view（可选） | zoom为百分比，25–400，精度0.1；布局退出/取消不回滚阅读缩放。 |

可用性由宿主投影提供；没有 actions 只省略动作提示，执行仍受ctx权限与宿主约束。contents不可用项显示原因，不能通过available:false修改该项。

## 写命令

只通过所属组件 `ctx.execute(id, payload)`；同一 UI router 处理参数与返回结果。命令 ID 由公开 WORKSPACE_COMMANDS/SIDEBAR_COMMANDS 导出，旧 host 路径仅 re-export 同一对象。布局实际消费：

| 符号 | payload | 权限与行为 |
| --- | --- | --- |
| region | {region: left/right/top/voice} | 切换区域；即时工作区状态，不进入组件事务或文档历史。 |
| resize | {side: left/right/top/voice, value: number} | CSS px，有限数；宿主按当前容量钳制。 |
| arrange | {mode: balanced/compact/default} | 即时排布；default恢复默认。 |
| begin | 无payload | 开始组件布置事务；重复进入不覆盖基线。 |
| finish | {confirm: boolean} | true提交组件布置，false取消组件布置；区域开关/尺寸/阅读缩放保留。 |
| zoom / fit | {value: number} / 无payload | 阅读百分比/适应工作区，由宿主单一viewport处理。 |
| enabled | {id: component ID, enabled: boolean} | 仅编辑事务且可配置面板。 |
| move | {id, slot: left/right, index?: integer} | 仅编辑事务；检查允许位置/容量，持久cell复用。 |
| reorder | {id, index: integer} | 仅编辑事务；顺序由宿主提交。 |

成功为 `{ok:true, changed?:boolean}`；拒绝为 `{ok:false,code:string}`。组件无权限为permission.denied，释放后为component.disposed；未知命令command.missing；错误载荷workspace.invalid-payload/sidebar.invalid-payload；非编辑或容量等业务拒绝沿用宿主workspace/sidebar原因码。页面可以预判按钮禁用，但最终裁决永远由ctx与命令处理器完成。

### 当前作者界面的排布预览

2026-10-08作者视觉补充：编辑工具使用固定位置、先退后入的局部opacity呈现，内容调整控件随编辑状态改变视觉强调。原命令与确认取消范围不变；动画结束不产生业务修改。辅助状态不占可见排布，本次修改详情位于核心设置之后。实际页面仍仅消费原 `ctx.motion.bind` 和已声明的content-transition，不新增公开读写端口；详见 `research/layout-edit-motion-20261008.md`。

均衡/紧凑按钮先选择本组件的局部预览，缩略图和选择标记变化，真实数值/滑条继续跟随layout快照。勾形“应用排布”才调用上表的即时`arrange`命令；接口、payload及成对尺寸预设不变。恢复默认仍即时执行。普通几何/窗口容量改变或页面隐藏丢弃未应用预览，拒绝应用保留预览和真实状态；不增加第二个工作区状态或动画完成提交。

入口文字统一“编辑内容”，确认/取消仅管理内容配置；辅助名称和提示明确内容编辑范围。具体作者视觉与回归见`research/user-experience-fixes-20261007.md`。

## 生命周期与验证

2026-10-08：原内容排序/移动/启用命令接受后，框架承载层可投影左栏列表/右栏页签的局部排序、邻项补位与新项淡入。布局插件不获得这些节点，也不扩展动画权限；自身声明仍为shape/selection/content。排序、跨区、确认取消的公开接口不变。跨区业务即时接受，只在来源和目的地各自内部呈现，不穿越谱面；移除立即隐藏，不留副本。静止时没有外层transform/opacity，组件不重挂载。当前实现与验证边界见 `research/layout-content-reorder-motion-20261008.md` 及 `research/layout-content-membership-motion-20261008.md`。

页面先创建局部view，注册dispose，再创建可选内容与订阅；挂载中途失败由ComponentHost统一scope释放。隐藏只停止呈现并保留输入；移动复用实例；最终释放清理订阅、私有呈现与目标绑定。无可选动画仍可操作全部合法业务。

验证：`tests/workspace-layout-contract.test.js`、既有`workspace-runtime.test.js`、`layout-component-visual.test.js`；正式平台/真实入口和浏览器证据另见工程结果，不用DOM替身代替几何验收。
