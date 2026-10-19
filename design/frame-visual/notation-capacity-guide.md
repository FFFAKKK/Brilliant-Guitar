# 谱面绘制容量验收入口

日期：2026-10-08。这是独立工程验收工具，不进入默认产品页面或桌面资源，也不创建另一个插件平台、视口服务或记谱实现。

## 最低目标与门槛

用户选择先按Windows、4核CPU、8GB内存规划。实际参考设备尚未指定；CPU型号/物理核、GPU、磁盘、OS和WebView版本、电源模式、系统缩放需在实机试验前登记。浏览器hardwareConcurrency是逻辑处理器数量，deviceMemory是粗粒度值，均不能证明最低设备。

[策略v0.1](notation-capacity-policy-v0.1.json)在首个绘制资格样本前冻结以下工程目标，不根据结果删慢值或临时放宽。它们不是经过实机验证的商业保证；后续修改需新策略版本和重新采样。

| 指标 | 工程目标 |
| --- | --- |
| 引擎和字体初始化 | ≤5000ms；每次实际记录，可能命中原加载器缓存，不称冷启动 |
| 空谱绘制至完整SVG采用p95 | ≤100ms |
| 16小节／64事件p95 | ≤200ms |
| 128小节／512事件p95 | ≤1000ms |
| 512小节／2048事件p95 | ≤4000ms |
| 观测到的主线程long task | 每项≤100ms；含初始化、预热和最后DOM清理 |

仍需另定并实测完整文件打开、原生IPC、冷启动、缩放/指针响应、长期资源和设备资格。512是压力文件，不放宽产品新建128小节限制。

## 构建与实际运行

仓库根执行：

```text
npm --prefix design/frame-visual run notation:capacity-build
npm --prefix design/frame-visual run notation:capacity-check
```

生成[经典文件入口](notation-capacity-preview.html)。它沿用原本地经典资源解析方式，内嵌上一切片原codec/Native往返通过的四份投影及哈希，调用原renderStaff、共享记谱模块和原VexFlow/字体加载器。无需增加服务器、依赖或产品注册项。只构建文件不表示浏览器已经运行。

在获准的实际浏览器/WebView中打开该文件，保持前台，点击运行图标。每规模预热3次、采样25次；可停止，切到后台或离开页面会取消。末尾下载图标保存本次原始JSON。运行前后执行capacity-check并保存同版文件/策略哈希；若源或产物变化，将结果标为stale，用新候选重跑。

本会话工具已拒绝file://访问，未改HTTP、换浏览器表面、原始命令或其他通道绕过；本轮没有实际浏览器绘制样本。准备工具可用于后续获准的实际验收，不能代替当前pending项。

## 结果解释

- renderMs调用原renderStaff，包含原normalize、分页、VexFlow绘制及页面组合；不是纯VexFlow或纯分页耗时。
- validateAndAdoptMs包含同版几何/事件检查、完整SVG采用、页面根/挂载后的Bravura字体核对及节点计数。验收检查本身的成本计入该段，不能称产品UI挂载的净耗时。
- renderToAdoptMs为上述实际连续跨度。paintOpportunityMs记录采用后两次requestAnimationFrame回调；它只表示绘制机会，不保证合成器已呈现，不是帧率或实际用户输入响应测试。
- 每次正式样本保留分段原值、节点数、long task，报告保留初始化、预热期间及最后清理观测到的长任务。全部25样本参与nearest-rank统计。
- 字体/事件/根节点错误为failed，取消为cancelled；保留已完成的原始样本。没有Long Tasks API时assessment=incomplete，即使绘制很快也不能写成已完整达标。同步JS不能被停止按钮立即抢占；取消后的结果不得采用。
- 全部绘制样本完成仍仅status=baseline-only。assessment可为within-engineering-limits/exceeded/incomplete；qualificationG6和minimumDeviceQualification始终pending。完整G6另需参考设备、原生及长期资源证据。

本工具覆盖已支持的单谱表、单声部、四分音符/休止和零事件空谱。事件ID、字体和完整页校验不能代替复杂记谱或视觉标准回归。普通插件生命周期、宿主滚动/缩放/四栏及真实输入仍由原验收路径负责。
