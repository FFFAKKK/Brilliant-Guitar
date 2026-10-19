# 旧命令栏仍显示：预览资源新鲜度排查

2026-10-08。用户提供截图仍有顶部四区域开关、验证文字、演示文字和模拟窗口按钮。
上一轮作者源已修，但交付给用户的页面没有呈现修复结果；不能继续以604项代码测试或HTTP 200回答“已经改好”。

## 已观察的证据

- 用户截图封存为`evidence/preview-resource-freshness-20261008/user-before.png`；里面的旧控件确实仍可见。
- 修改服务前，实际5193提供的HTML、入口、工作区运行时、visual-workbench、共享命令栏和两份CSS均与当前盘上文件一致。
  运行壳已有共享命令栏和静态下侧栏标签，没有生成旧顶部控件。证据为`served-before.json`。
- 原HTML地址只加了`?rev=...`，动态入口和所有相对依赖仍保留既有URL。原Python静态服务无Cache-Control；
  旧服务输出还出现了HTML及部分模块的304，而不是整份依赖图重新取当前字节。
- 没有读取用户当前嵌入窗口的缓存或DOM。缓存/文档复用与截图相符，但不能将该窗口的具体缓存机制当作已确认事实。
  可以确认的是：此前交付没有版本覆盖整个资源图，也没有检查实际呈现，属于必须修复的缺口。

## 改动

| Before | After | Why |
| --- | --- | --- |
| 只改变顶层HTML的rev，依赖仍使用原地址 | 整个页面位于由内容计算的版本路径，所有相对模块与样式继承同一版本 | 强制新版依赖拥有不同的资源身份 |
| 原开发服务允许条件缓存和304 | 开发响应no-store，忽略条件缓存头并返回实际文件 | 更新验证不能继续依赖旧缓存字节 |
| 简单服务目录取决于启动cwd | 服务根固定到脚本所在备份包 | 从其他工作目录启动也不会悄悄服务另一份UI |
| 只验证状态200就发送预览 | 九个关键资源与当前盘上作者源逐字比较 | 服务可达与提供正确版本分开验证 |

新增`scripts/serve-preview.py`，更新既有`package.json`的serve命令。原`runtime-preview.html`继续使用，
只把浏览器页名改成“Brilliant Guitar · 工作区预览”。不新建HTML，不改模块导入关系、公共插件合同或Rust。

默认命令是`python -u scripts/serve-preview.py --port 5193`。旧页面请求自动跳到`/__preview/<revision>/...`，
HTML查询参数保留；源依赖改变后，下次打开页面会切换版本。旧依赖地址返回410，旧HTML地址自动跳到当前版本。
服务元数据仅打印到终端；界面没有新增开发说明。

## 验证与范围

- 两个真实HTTP专项通过：嵌套JS、CSS依赖路径；源变化导致整个页面版本变化；旧页面更新；旧依赖拒绝混用；
  未来If-Modified-Since/旧ETag不导致304；默认根与启动cwd无关；当前真实命令栏文件与盘上逐字一致。
- 最新`npm test`为606/606，包含此前命令栏、侧栏操作、布局/内容事务、谱面几何与动画生命周期回归。
- Python AST及新JS测试语法通过。没有安装新依赖。
- 已通过自有exec会话停止原5193服务，启动新服务。当前九个关键资源全部200/no-store、同一revision、与作者源一致，
  包括动态谱面VexFlow资产。证据为`served-current.json`，不只是再次请求HTML得到200。
- 本轮没有浏览器截图或原生EXE验收。此前浏览器工具安全拒绝仍遵守；没有使用其他浏览器或CDP绕过。
  因而不宣布用户当前窗口已经刷新，只交付核对过资源版本的原页面地址。

最新预览URL记录在`served-current.json`。该版本对应此次封存；后续源码变化时打开原HTML会得到新的内容版本。

## Bug Analysis：源码更新未传播到用户看到的预览

### 1. Root Cause Category

- C / Change Propagation Failure：修改作者源和生成件，没有为当前HTTP预览的完整资源树提供新版本身份。
- D / Test Coverage Gap：DOM替身与构建检查均通过，却没有检查交付路径与用户截图所示结果。
- E / Implicit Assumption：默认把“换HTML查询参数”和“HTTP 200”当作新版资源已经应用。
- 缓存是最符合当前证据的解释；具体嵌入窗口状态未读取，不将推断包装成确定的现场诊断。

### 2. Why Fixes Failed

1. 第一轮局部代码修复正确，但旧页面截图继续存在；代码正确不代表用户打开的文档使用了新依赖。
2. 第二轮只发送新的HTML查询参数，资源地址不随之变化；缓存与文档复用风险仍在。
3. HTTP 200被当作展示成功；没有内容/依赖身份和实际渲染证据，造成了错误汇报。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | 开发预览页面与资源树共用内容版本路径 | DONE |
| P0 | Runtime | no-store，条件请求返回真实字节，旧依赖不混用 | DONE |
| P0 | Test Coverage | 真实HTTP测试嵌套依赖、源变化、cwd和缓存条件 | DONE |
| P0 | Code Review | 核对当前服务字节；未读取渲染时不宣称已显示 | DONE |
| P1 | Documentation | 新鲜度合同与本次截图/日志写入前端规格 | DONE |

### 4. Systematic Expansion

相同开发服务覆盖现有结构审阅、动画审阅和经典文件的HTTP入口；不为每页重复制作版本逻辑。
正式EXE继续沿现有原链打包，不使用开发服务，也不增加SDK耦合。直接file页面与原生EXE仍有各自验收边界。

### 5. Knowledge Capture

- [x] 更新`.trellis/spec/frontend/frame-style-validation-contract.md`的开发预览合同。
- [x] 保存用户截图、修改前HTML/package、前后服务资源检查和606项回归结果。
- [x] 更新任务规划/实施及README，区分网络资源正确与用户窗口真实渲染。
- [ ] 整体视觉任务继续in_progress，未提交或归档并发工作区；仓库没有Trellis CLI的`src/templates/markdown/spec`，不新建无关模板。

回滚只需恢复此次封存的package/HTML和旧开发服务方式；保留上一轮命令栏作者修复。不覆盖同期工程文件，不删除design目录。
